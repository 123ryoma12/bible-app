// Fan-out sermon fetching across all enabled sources.
//
// This module is the single entry point that SermonSheet uses. It reads the
// user's source preferences, fires off each enabled source, merges the results,
// and returns them in the shape SermonSheet expects.
//
// ── Fetch strategy ───────────────────────────────────────────────────────────
//
// To show something fast while keeping the book list complete:
//
//   1. fetchSermonsForChapter fires two things in parallel:
//        • gilFetchChapter  — just this chapter (fast, used immediately)
//        • Cornerstone      — all of book (fast, single page scrape)
//      It resolves as soon as both are done and begins rendering the chapter
//      section. The book section shows a spinner.
//
//   2. In the background, gilFetchAllBook loops every GiL page sequentially
//      and delivers all sermons via the `onBookReady` callback. The book
//      section replaces its spinner with the full list.
//
// ── Persistence ──────────────────────────────────────────────────────────────
//
// The full book result (chapter + all GiL pages + Cornerstone) is persisted to
// AsyncStorage with a 24-hour TTL so reopening the same book — even after
// restarting the app — never re-fetches while the data is fresh.
//
// Cache keys are namespaced by book name, enabled sources, and Cornerstone
// congregation selection so a preference change always produces a fresh fetch.
//
// Gospel in Life paginates; Cornerstone returns everything for a book at once.
// The total sermon count is GiL + Cornerstone. There are no page numbers
// exposed to the UI — the book list is always complete.

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  fetchChapterSermons as gilFetchChapter,
  fetchAllBookSermons as gilFetchAllBook,
  fetchAudioUrl as gilFetchAudioUrl,
  isAbortError,
  ErrorKind,
  BOOK_PAGE_SIZE,
} from "./sermonApi";

import {
  fetchSermonsForBookAllCongregations,
  fetchAudioUrl as csFetchAudioUrl,
} from "./cornerstoneApi";

import {
  getEnabledPrefs,
} from "./sermonSourcesStore";

export { isAbortError, ErrorKind, BOOK_PAGE_SIZE };
export { GOSPEL_IN_LIFE_SOURCE_ID } from "./sermonSourcesStore";
export { CORNERSTONE_SOURCE_ID, CONGREGATIONS } from "./cornerstoneApi";

// ─────────────────────────────────────────────────────────────────────────────
// Persistent cache
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_KEY_PREFIX = "sermonCache:v1:";

function cacheKey(bookName, enabledSources, cornerstoneCongregations) {
  const sources = enabledSources.slice().sort().join(",");
  const congs = cornerstoneCongregations.slice().sort().join(",");
  return `${CACHE_KEY_PREFIX}${bookName}|${sources}|${congs}`;
}

async function readCache(key) {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry || typeof entry.fetchedAt !== "number") return null;
    if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
      // Expired — delete in background, don't block the caller.
      AsyncStorage.removeItem(key).catch(() => {});
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

async function writeCache(key, sermons, total) {
  try {
    const entry = {
      fetchedAt: Date.now(),
      total,
      sermons,
    };
    await AsyncStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Storage write failure is non-fatal — the data is still in memory.
  }
}

export async function clearSermonCache() {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const cacheKeys = allKeys.filter((k) => k.startsWith(CACHE_KEY_PREFIX));
    if (cacheKeys.length) await AsyncStorage.multiRemove(cacheKeys);
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Chapter matching (client-side filter over the full book pool)
// ─────────────────────────────────────────────────────────────────────────────

// "Romans 8" → [8], "Romans 8-10" → [8,9,10], "Romans 8:1-10:15" → [8,9,10]
function chaptersInSingleRef(ref) {
  if (!ref) return [];
  const parts = ref.split(/[-–]/);
  const nums = parts.map((p) => {
    const m = p.match(/\b(\d+)(?::\d+)?/);
    return m ? parseInt(m[1], 10) : null;
  }).filter(Boolean);
  if (nums.length === 0) return [];
  if (nums.length === 1) return [nums[0]];
  const [start, end] = [Math.min(...nums), Math.max(...nums)];
  const result = [];
  for (let i = start; i <= end; i++) result.push(i);
  return result;
}

// sermon.passage is a "·"-separated string like "Psalm 1 · Psalm 119".
// Split it into individual references and check each one.
function sermonMatchesChapter(sermon, bookName, chapterNumber) {
  if (!chapterNumber) return false;
  const ch = Number(chapterNumber);
  const passage = sermon.passage ?? "";
  if (!passage) return false;
  const bookLower = bookName.toLowerCase();
  const refs = passage.split(/\s*·\s*/);
  for (const ref of refs) {
    if (!ref.toLowerCase().startsWith(bookLower)) continue;
    const chapters = chaptersInSingleRef(ref.slice(bookName.length).trim());
    if (chapters.includes(ch)) return true;
  }
  return false;
}

function chapterSermonsFrom(allSermons, bookName, chapterNumber) {
  if (!chapterNumber) return [];
  return allSermons.filter((s) => sermonMatchesChapter(s, bookName, chapterNumber));
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function dedupeById(sermons) {
  const seen = new Set();
  return sermons.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

function abortError() {
  const e = new Error("Aborted");
  e.name = "AbortError";
  return e;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch sermons for a chapter with a two-phase strategy:
 *
 *   Phase 1 (fast — resolves the returned promise):
 *     • GiL chapter query for this exact chapter
 *     • Cornerstone full-book fetch (single page, runs in parallel)
 *   Returns immediately with chapterSermons + partial bookSermons.
 *   `bookReady` will be false and `bookSermons` will be whatever Cornerstone
 *   returned (possibly empty if GiL-only).
 *
 *   Phase 2 (background — triggered after the promise resolves):
 *     • GiL all-pages book fetch
 *   Calls `onBookReady({ bookSermons, bookTotal })` when done so the UI can
 *   update the book section without re-rendering the chapter section.
 *
 * If a valid 24-hour cached entry exists, both phases collapse into a single
 * synchronous cache read — `onBookReady` is called before this function returns
 * so the caller always gets the full list immediately.
 *
 * @param {string} bookName
 * @param {number|string|null} chapterNumber
 * @param {object} opts
 * @param {AbortSignal} [opts.signal]
 * @param {string[]} [opts.enabledSources]   override (used by SermonSheet to pass stable ref)
 * @param {string[]} [opts.cornerstoneCongregations]
 * @param {function} [opts.onBookReady]      called with { bookSermons, bookTotal } when full list is ready
 *
 * @returns {Promise<{
 *   chapterSermons: Array,
 *   bookSermons: Array,
 *   bookTotal: number,
 *   bookReady: boolean,
 * }>}
 */
export async function fetchSermonsForChapter(
  bookName,
  chapterNumber,
  {
    signal,
    enabledSources: forcedSources,
    cornerstoneCongregations: forcedCongs,
    onBookReady,
  } = {}
) {
  let { enabledSources, cornerstoneCongregations } = forcedSources
    ? { enabledSources: forcedSources, cornerstoneCongregations: forcedCongs ?? [] }
    : await getEnabledPrefs();

  const csEnabled = enabledSources.includes("cornerstone");
  if (!csEnabled) cornerstoneCongregations = [];

  const gilEnabled = enabledSources.includes("gospel-in-life");
  const key = cacheKey(bookName, enabledSources, cornerstoneCongregations);

  // ── Cache hit ──────────────────────────────────────────────────────────────
  const cached = await readCache(key);
  if (cached) {
    console.log("[combinedSermonApi] cache HIT", key);
    const chapterSermons = chapterSermonsFrom(cached.sermons, bookName, chapterNumber);
    const result = {
      chapterSermons,
      bookSermons: cached.sermons,
      bookTotal: cached.total,
      bookReady: true,
    };
    // Fire synchronously so SermonSheet can set bookReady=true in the same
    // render cycle.
    onBookReady?.({ bookSermons: cached.sermons, bookTotal: cached.total });
    return result;
  }

  console.log("[combinedSermonApi] cache MISS", key);

  // ── Phase 1: chapter + Cornerstone in parallel ─────────────────────────────
  const [gilChapterResult, csResult] = await Promise.all([
    gilEnabled
      ? gilFetchChapter(bookName, chapterNumber, { signal })
      : Promise.resolve({ sermons: [], bookTermIds: [] }),

    csEnabled
      ? fetchSermonsForBookAllCongregations(bookName, cornerstoneCongregations, { signal })
      : Promise.resolve({ sermons: [], total: 0 }),
  ]);

  if (signal?.aborted) throw abortError();

  // The chapter section is ready. Cornerstone results are already in hand, so
  // filter them into the chapter section immediately — don't wait for Phase 2.
  const csChapterSermons = chapterSermonsFrom(csResult.sermons, bookName, chapterNumber);
  const chapterSermons = dedupeById([...gilChapterResult.sermons, ...csChapterSermons]);
  const initialBookSermons = dedupeById([...csResult.sermons]);

  // ── Phase 2: GiL all-pages fetch in background ─────────────────────────────
  if (gilEnabled) {
    // Don't await — let this run after the caller renders the chapter section.
    gilFetchAllBook(bookName, {
      signal,
      bookTermIds: gilChapterResult.bookTermIds,
    }).then(({ sermons: gilSermons, total }) => {
      if (signal?.aborted) return;

      // Merge: GiL sermons first (newest first from API), then CS sermons not
      // already in the GiL list.
      const merged = dedupeById([...gilSermons, ...csResult.sermons]);
      const bookTotal = merged.length;

      // Persist to AsyncStorage so the next open is instant.
      writeCache(key, merged, bookTotal);

      // Re-derive chapter sermons from the full merged list so any GiL sermons
      // that Phase 1's chapter-term fetch missed (e.g. sermons tagged at the
      // book level only) are surfaced in the chapter section.
      const fullChapterSermons = chapterSermonsFrom(merged, bookName, chapterNumber);
      onBookReady?.({ bookSermons: merged, bookTotal, chapterSermons: fullChapterSermons });
    }).catch((err) => {
      if (isAbortError(err) || signal?.aborted) return;
      // Phase 2 failure is non-fatal — the chapter section is already shown.
      console.warn("[combinedSermonApi] background book fetch failed", err);
      // Still call onBookReady with what we have so the spinner resolves.
      onBookReady?.({ bookSermons: initialBookSermons, bookTotal: initialBookSermons.length });
    });
  } else {
    // GiL disabled — Cornerstone is the whole picture, already in hand.
    const bookTotal = csResult.total;
    writeCache(key, initialBookSermons, bookTotal);
    onBookReady?.({ bookSermons: initialBookSermons, bookTotal });
  }

  return {
    chapterSermons,
    bookSermons: initialBookSermons,
    bookTotal: initialBookSermons.length,
    bookReady: !gilEnabled, // if GiL disabled, we already have everything
  };
}

export async function fetchAudioUrl(sermon, { signal } = {}) {
  if (sermon.source === "cornerstone") {
    return csFetchAudioUrl(sermon.link, { signal });
  }
  return gilFetchAudioUrl(sermon.link, { signal });
}

