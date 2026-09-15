// Fan-out sermon fetching across all enabled sources.
//
// This module is the single entry point that SermonSheet uses. It reads the
// user's source preferences, fires off each enabled source in parallel, merges
// the results, and returns them in the same shape that SermonSheet already
// expects (chapterSermons, bookSermons, bookTotal, bookTotalPages).
//
// Fetching is per *book*; the split between the "Book Chapter" and "All of
// Book" sections is a presentation decision made client-side, by reading each
// sermon's passage. That keeps a single cached book payload correct for every
// chapter in it, instead of the section contents depending on whichever chapter
// happened to be open when the fetch ran.
//
// Gospel in Life also offers a native chapter query. It is still used on the
// first load of a book (and for books large enough to paginate, where the
// cached page-one list cannot be assumed to contain every chapter sermon), but
// its results are merged into the same pool rather than being handed straight
// to the chapter section.
//
// The "load more" concept only applies to Gospel in Life (which paginates).
// Cornerstone returns all results for a book at once. The combined total and
// page counts are therefore always Gospel in Life's numbers, and Cornerstone
// results are simply included in the first batch.

import {
  fetchSermonsForChapter as gilFetchForChapter,
  fetchChapterSermons as gilFetchChapterOnly,
  fetchMoreBookSermons as gilFetchMore,
  isAbortError,
  ErrorKind,
  BOOK_PAGE_SIZE,
} from "./sermonApi";

import {
  fetchSermonsForBookAllCongregations,
} from "./cornerstoneApi";

import {
  getEnabledPrefs,
} from "./sermonSourcesStore";

export { isAbortError, ErrorKind, BOOK_PAGE_SIZE };

// Re-export source constants so SermonSheet can use them for attribution UI.
// CORNERSTONE_SOURCE_ID is only imported (not re-exported) by
// sermonSourcesStore, so it has to come from its defining module.
export { GOSPEL_IN_LIFE_SOURCE_ID } from "./sermonSourcesStore";
export { CORNERSTONE_SOURCE_ID } from "./cornerstoneApi";

// ── Session cache ─────────────────────────────────────────────────────────────
//
// Keyed by `${bookName}|${enabledSources}|${congregations}` so results are
// automatically invalidated when the user changes their source selection.
// The cache lives only in memory — it is cleared when the app is restarted,
// matching the "fresh on each session" expectation.
//
// "Load more" pages are appended into the cached entry so infinite scroll also
// benefits from the cache.

const sessionCache = new Map();

/**
 * Normalised key for the per-chapter slice of a cached book entry.
 *
 * The book intro screen opens the sheet with no chapter at all, which is a
 * distinct case from "chapter 1" and needs its own slot.
 */
function chapterSlot(chapterNumber) {
  const n = Number(chapterNumber);
  return Number.isFinite(n) && n > 0 ? String(n) : "none";
}

function cacheKey(bookName, enabledSources, cornerstoneCongregations) {
  const sources = [...enabledSources].sort().join(",");
  // Only include congregations in the key when Cornerstone is actually enabled —
  // otherwise the same "CS off" result would be keyed differently depending on
  // which congregations happen to be selected, causing spurious cache misses.
  const csOn = enabledSources.includes("cornerstone");
  const congs = csOn ? [...cornerstoneCongregations].sort().join(",") : "";
  return `${bookName}|${sources}|${congs}`;
}

export function clearSermonCache() {
  sessionCache.clear();
}

/** Append a new page of book sermons into the cached entry (for load-more). */
export function appendCachedBookSermons(bookName, enabledSources, cornerstoneCongregations, newSermons) {
  const key = cacheKey(bookName, enabledSources, cornerstoneCongregations);
  const entry = sessionCache.get(key);
  if (!entry) return;
  const seen = new Set(entry.bookSermons.map((s) => s.id));
  entry.bookSermons = [...entry.bookSermons, ...newSermons.filter((s) => !seen.has(s.id))];
  // Also into the pool, so a later chapter is placed using everything loaded so
  // far rather than just the first page.
  addToPool(entry, newSermons);
  entry.page = (entry.page ?? 1) + 1;
}

export {
  SOURCE_NAME as GIL_SOURCE_NAME,
  SOURCE_URL as GIL_SOURCE_URL,
} from "./sermonApi";

export {
  SOURCE_NAME as CS_SOURCE_NAME,
  SOURCE_URL as CS_SOURCE_URL,
  CONGREGATIONS,
} from "./cornerstoneApi";

// ── Chapter placement ────────────────────────────────────────────────────────
//
// Which section a sermon belongs in is decided here, from its passage, for
// every source alike. Both sources supply a passage: Gospel in Life builds one
// from its scripture taxonomy ("Judges 7", or "John 3 · Romans 8" when a sermon
// spans books), Cornerstone gives a verse reference ("Judges 7:1–25").

/**
 * Chapter numbers covered by a single scripture reference, with the book name
 * already stripped off.
 *
 * The parse walks the numbers in order and uses the separator between them,
 * because the same digits mean different things depending on what precedes:
 *
 *   " 7"            → [7]
 *   " 7:1-25"       → [7]            trailing 25 is a verse, not chapter 25
 *   " 12:1-12:8"    → [12]
 *   " 3:16-4:2"     → [3, 4]         cross-chapter range
 *   " 36:1-37:7"    → [36, 37]
 *   " 15–17"        → [15, 16, 17]   bare chapter range, filled in
 */
function chaptersInReference(reference) {
  const chapters = new Set();
  if (!reference) return chapters;

  // Each token is a chapter, optionally followed by ":verse".
  const tokenRe = /(\d+)(?::(\d+))?/g;
  let match;
  let previousChapter = null;
  let previousHadVerse = false;
  let cursor = 0;

  while ((match = tokenRe.exec(reference)) !== null) {
    const value = Number(match[1]);
    const hasVerse = match[2] !== undefined;
    const separator = reference.slice(cursor, match.index);
    const isRange = /[-–—]/.test(separator);
    cursor = tokenRe.lastIndex;

    // "7:1-25" — a bare number after a chapter:verse token continues the verse
    // range within the same chapter, so it is not a chapter of its own.
    if (isRange && !hasVerse && previousHadVerse) continue;

    chapters.add(value);

    // A range between two chapters covers everything in between as well.
    if (isRange && previousChapter !== null && value > previousChapter) {
      for (let c = previousChapter + 1; c < value; c++) chapters.add(c);
    }

    previousChapter = value;
    previousHadVerse = hasVerse;
  }

  return chapters;
}

/**
 * Does this sermon belong in the "<Book> <Chapter>" section?
 *
 * Matching is book-aware: a passage is split on the "·" separator used for
 * multi-book sermons, and only the references naming the book currently open
 * are consulted. Without that, "1 John 3" would register as chapter 1 (from the
 * book's own name) and "John 3 · Romans 8" would put a Romans sermon under
 * John 8.
 */
function sermonMatchesChapter(sermon, bookName, chapterNumber) {
  const chapter = Number(chapterNumber);
  if (!sermon?.passage || !Number.isFinite(chapter) || chapter <= 0) return false;

  const references = String(sermon.passage)
    .split("·")
    .map((ref) => ref.trim())
    .filter(Boolean);

  const book = String(bookName ?? "").trim().toLowerCase();
  let namedTheBook = false;

  for (const reference of references) {
    const lower = reference.toLowerCase();
    if (!book || !(lower === book || lower.startsWith(`${book} `))) continue;
    namedTheBook = true;
    if (chaptersInReference(reference.slice(book.length)).has(chapter)) return true;
  }

  // No reference named the book — either the source abbreviates it or omits it
  // because the whole feed is already book-scoped. Fall back to reading the
  // chapter out of the reference as a whole.
  if (namedTheBook) return false;
  return references.some((reference) => chaptersInReference(reference).has(chapter));
}

// ── Main fetch ────────────────────────────────────────────────────────────────

/**
 * Fetch sermons for the current chapter/book from all enabled sources.
 *
 * Returns:
 *   {
 *     chapterSermons: Sermon[],   // exact chapter, all sources combined
 *     bookSermons:    Sermon[],   // full book, all sources combined (page 1)
 *     bookTotal:      number,     // total across all sources (best estimate)
 *     bookTotalPages: number,     // pages remaining for GiL infinite scroll
 *   }
 */
export async function fetchSermonsForChapter(bookName, chapterNumber, { signal, enabledSources: forcedSources, cornerstoneCongregations: forcedCongs } = {}) {
  let { enabledSources, cornerstoneCongregations } = forcedSources
    ? { enabledSources: forcedSources, cornerstoneCongregations: forcedCongs ?? [] }
    : await getEnabledPrefs();

  // When Cornerstone is disabled, treat congregations as empty so the cache
  // key is stable regardless of which congregations happen to be selected.
  const csEnabled = enabledSources.includes("cornerstone");
  if (!csEnabled) cornerstoneCongregations = [];

  console.log("[combinedSermonApi] fetchSermonsForChapter", { bookName, chapterNumber, enabledSources, cornerstoneCongregations: cornerstoneCongregations.length });
  const key = cacheKey(bookName, enabledSources, cornerstoneCongregations);
  const slot = chapterSlot(chapterNumber);
  const cached = sessionCache.get(key);
  const gilEnabled = enabledSources.includes("gospel-in-life");
  console.log("[combinedSermonApi] cache", cached ? "HIT" : "MISS", key, "chapter", slot);

  if (cached) {
    // The whole book is already cached, so the chapter section is just a filter
    // over it — no matter which chapter was open when the fetch happened.
    //
    // The one case the cache cannot answer by itself is a book big enough to
    // paginate: only page one of the Gospel in Life list is held, so a chapter
    // sermon sitting on page three would be missed. There, the native chapter
    // query is run once per chapter and folded into the pool.
    const needsChapterQuery =
      gilEnabled &&
      chapterSlot(chapterNumber) !== "none" &&
      !cached.gilChaptersFetched.has(slot) &&
      (cached.page ?? 1) < cached.bookTotalPages;

    if (needsChapterQuery) {
      const { sermons } = await gilFetchChapterOnly(bookName, chapterNumber, { signal });
      if (signal?.aborted) throw abortError();
      addToPool(cached, sermons);
      cached.gilChaptersFetched.add(slot);
    }

    return {
      chapterSermons: chapterSermonsFrom(cached, bookName, chapterNumber),
      bookSermons: cached.bookSermons,
      bookTotal: cached.bookTotal,
      bookTotalPages: cached.bookTotalPages,
      page: cached.page ?? 1,
    };
  }

  // Run enabled sources in parallel.
  const [gilResult, csResult] = await Promise.all([
    gilEnabled
      ? gilFetchForChapter(bookName, chapterNumber, { signal })
      : Promise.resolve({ chapterSermons: [], bookSermons: [], bookTotal: 0, bookTotalPages: 0 }),

    csEnabled
      ? fetchSermonsForBookAllCongregations(bookName, cornerstoneCongregations, { signal })
      : Promise.resolve({ sermons: [], total: 0 }),
  ]);

  // The book list: GiL page 1 first, then all CS results appended.
  // Deduplicate by ID in case somehow the same sermon appears twice.
  const bookSermons = dedupeById([
    ...gilResult.bookSermons,
    ...csResult.sermons,
  ]);

  // Total is GiL's total (which paginates) plus all CS results (delivered at once).
  const bookTotal = gilResult.bookTotal + csResult.total;

  // Page count is purely GiL's — CS always delivers everything upfront.
  const bookTotalPages = gilResult.bookTotalPages;

  // One entry per book. `pool` holds every sermon seen for it — the book list,
  // Cornerstone's full set, and any chapter-query results — and is the single
  // thing the chapter section is derived from, so the split stays right for
  // whichever chapter is open. GiL chapter results lead the pool so they keep
  // their position at the top of the chapter section.
  const entry = {
    pool: new Map(),
    gilChaptersFetched: new Set(gilEnabled && slot !== "none" ? [slot] : []),
    bookSermons,
    bookTotal,
    bookTotalPages,
    page: 1,
  };
  addToPool(entry, gilResult.chapterSermons);
  addToPool(entry, bookSermons);
  sessionCache.set(key, entry);

  return {
    chapterSermons: chapterSermonsFrom(entry, bookName, chapterNumber),
    bookSermons,
    bookTotal,
    bookTotalPages,
    page: 1,
  };
}

/**
 * Load the next page of Gospel in Life results for infinite scroll.
 *
 * Cornerstone's results were already fully delivered in the first fetch, so
 * only GiL needs to be paged. The caller (SermonSheet) appends to its existing
 * list, which already contains the CS results, so there's no duplication risk.
 */
export async function fetchMoreBookSermons(bookName, page, { signal } = {}) {
  const { enabledSources, cornerstoneCongregations } = await getEnabledPrefs();
  const result = await gilFetchMore(bookName, page, { signal });
  // Append into cache so re-opens get the full accumulated list.
  appendCachedBookSermons(bookName, enabledSources, cornerstoneCongregations, result.sermons);
  return result;
}

// ── Audio URL dispatch ────────────────────────────────────────────────────────

/**
 * Resolve the audio URL for a sermon, dispatching to the correct source's
 * page-scraping logic based on the sermon's `source` field.
 *
 * Gospel in Life sermons have no `source` field (legacy), so they fall through
 * to the GiL scraper.
 */
export async function fetchAudioUrl(sermon, { signal } = {}) {
  if (!sermon?.link) return null;

  if (sermon.source === "cornerstone") {
    const { fetchAudioUrl: csFetchAudio } = await import("./cornerstoneApi");
    return csFetchAudio(sermon.link, { signal });
  }

  // Default: Gospel in Life
  const { fetchAudioUrl: gilFetchAudio } = await import("./sermonApi");
  return gilFetchAudio(sermon.link, { signal });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Merge sermons into a cache entry's pool, keeping first-seen order. */
function addToPool(entry, sermons) {
  for (const sermon of sermons ?? []) {
    const id = String(sermon.id);
    if (!entry.pool.has(id)) entry.pool.set(id, sermon);
  }
}

/** The chapter section for a cache entry: everything in the pool that matches. */
function chapterSermonsFrom(entry, bookName, chapterNumber) {
  if (chapterSlot(chapterNumber) === "none") return [];
  const matches = [];
  for (const sermon of entry.pool.values()) {
    if (sermonMatchesChapter(sermon, bookName, chapterNumber)) matches.push(sermon);
  }
  return matches;
}

/**
 * An abort-shaped error, recognised by `isAbortError` so callers discard it
 * silently. Built by hand rather than with DOMException, which is not
 * guaranteed to exist on every JS engine the app runs on.
 */
function abortError() {
  const err = new Error("Aborted");
  err.name = "AbortError";
  return err;
}

function dedupeById(sermons) {
  const seen = new Set();
  const out = [];
  for (const s of sermons) {
    const key = String(s.id);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(s);
    }
  }
  return out;
}
