// Fan-out sermon fetching across all enabled sources.
//
// This module is the single entry point that SermonSheet uses. It reads the
// user's source preferences, fires off each enabled source in parallel, merges
// the results, and returns them in the same shape that SermonSheet already
// expects (chapterSermons, bookSermons, bookTotal, bookTotalPages).
//
// Gospel in Life provides chapter-level filtering natively. Cornerstone does
// not — their API only filters by book — so chapter sermons from Cornerstone
// are derived client-side by checking whether the sermon's passage field
// contains the chapter number.
//
// The "load more" concept only applies to Gospel in Life (which paginates).
// Cornerstone returns all results for a book at once. The combined total and
// page counts are therefore always Gospel in Life's numbers, and Cornerstone
// results are simply included in the first batch.

import {
  fetchSermonsForChapter as gilFetchForChapter,
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
export {
  GOSPEL_IN_LIFE_SOURCE_ID,
  CORNERSTONE_SOURCE_ID,
} from "./sermonSourcesStore";

export {
  SOURCE_NAME as GIL_SOURCE_NAME,
  SOURCE_URL as GIL_SOURCE_URL,
} from "./sermonApi";

export {
  SOURCE_NAME as CS_SOURCE_NAME,
  SOURCE_URL as CS_SOURCE_URL,
  CONGREGATIONS,
} from "./cornerstoneApi";

// ── Chapter-level filter for Cornerstone ─────────────────────────────────────

/**
 * Extract all chapter numbers explicitly referenced in a passage string.
 *
 * Passage strings from Cornerstone look like:
 *   "Luke 5:12–5:26"       → chapters [5]
 *   "Luke 5:1-11"          → chapters [5]
 *   "Romans 3:21–31"       → chapters [3]
 *   "Luke 1:1-4"           → chapters [1]
 *   "Leviticus 12:1-12:8"  → chapters [12]
 *   "John 3:16-4:2"        → chapters [3, 4]  (cross-chapter)
 *   "Isaiah 36:1-37:7"     → chapters [36, 37]
 *
 * Strategy: find every occurrence of a digit sequence that is immediately
 * followed by a colon — these are chapter:verse references. The number before
 * the colon is the chapter. We also handle bare chapter references like
 * "Luke 15" (no verse) by looking for a number at the end of the string or
 * before a dash/em-dash that isn't followed by a colon.
 */
function extractChapterNumbers(passage) {
  if (!passage) return new Set();
  const chapters = new Set();

  // Primary: chapter:verse pattern — number immediately before a colon.
  // e.g. "5:12", "12:1", "37:7"
  const chapterVerseRe = /(\d+):/g;
  let m;
  while ((m = chapterVerseRe.exec(passage)) !== null) {
    chapters.add(Number(m[1]));
  }

  // Secondary: bare chapter references with no verse (e.g. "Luke 15" or
  // "Luke 15–16"). These appear as a number preceded by a space and followed
  // by end-of-string, a dash, en-dash, em-dash, or another space — but NOT
  // followed by a colon (already handled above).
  const bareChapterRe = /(?<=\s)(\d+)(?=[–—\-\s]|$)(?!:)/g;
  try {
    while ((m = bareChapterRe.exec(passage)) !== null) {
      chapters.add(Number(m[1]));
    }
  } catch {
    // Lookbehind not supported on older JS engines — skip, primary covers most cases.
  }

  return chapters;
}

/**
 * Returns true if a Cornerstone sermon's passage explicitly covers the given
 * chapter number. Uses chapter:verse parsing rather than a loose regex so that
 * e.g. chapter 1 doesn't accidentally match "Leviticus 12:1-12:8".
 */
function cornerstoneSermonMatchesChapter(sermon, chapterNumber) {
  if (!sermon.passage || !chapterNumber) return false;
  const chapters = extractChapterNumbers(sermon.passage);
  return chapters.has(Number(chapterNumber));
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
export async function fetchSermonsForChapter(bookName, chapterNumber, { signal } = {}) {
  const { enabledSources, cornerstoneCongregations } = await getEnabledPrefs();

  const gilEnabled = enabledSources.includes("gospel-in-life");
  const csEnabled = enabledSources.includes("cornerstone");

  // Run enabled sources in parallel.
  const [gilResult, csResult] = await Promise.all([
    gilEnabled
      ? gilFetchForChapter(bookName, chapterNumber, { signal })
      : Promise.resolve({ chapterSermons: [], bookSermons: [], bookTotal: 0, bookTotalPages: 0 }),

    csEnabled
      ? fetchSermonsForBookAllCongregations(bookName, cornerstoneCongregations, { signal })
      : Promise.resolve({ sermons: [], total: 0 }),
  ]);

  // Derive chapter-level results from Cornerstone's book results client-side.
  const csChapterSermons = csResult.sermons.filter((s) =>
    cornerstoneSermonMatchesChapter(s, chapterNumber)
  );

  // Merge: GiL chapter first (most specific), then CS chapter.
  // For the book list: GiL page 1 first, then all CS results appended.
  // Deduplicate by ID in case somehow the same sermon appears twice.
  const chapterSermons = dedupeById([
    ...gilResult.chapterSermons,
    ...csChapterSermons,
  ]);

  const bookSermons = dedupeById([
    ...gilResult.bookSermons,
    ...csResult.sermons,
  ]);

  // Total is GiL's total (which paginates) plus all CS results (delivered at once).
  const bookTotal = gilResult.bookTotal + csResult.total;

  // Page count is purely GiL's — CS always delivers everything upfront.
  const bookTotalPages = gilResult.bookTotalPages;

  return { chapterSermons, bookSermons, bookTotal, bookTotalPages };
}

/**
 * Load the next page of Gospel in Life results for infinite scroll.
 *
 * Cornerstone's results were already fully delivered in the first fetch, so
 * only GiL needs to be paged. The caller (SermonSheet) appends to its existing
 * list, which already contains the CS results, so there's no duplication risk.
 */
export async function fetchMoreBookSermons(bookName, page, { signal } = {}) {
  return gilFetchMore(bookName, page, { signal });
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
