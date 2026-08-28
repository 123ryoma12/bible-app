// Lazy Bible text loader.
//
// Previously all 66 book JSON files (×3 translations = ~30 MB) were statically
// imported at the top of this module, which caused them to be parsed and held
// in memory from app startup — long before any chapter was ever opened.
//
// Now each book is loaded on first access via require() and cached in a plain
// object. Metro still bundles all the JSON files (they are present in the
// assets/bible/ tree) so they are available offline, but the JS engine only
// parses and allocates each book when it is actually needed.
//
// To add a new translation later: drop its files under assets/bible/<id>/,
// add its version key to LOADERS below, and register it in bibleVersions.js —
// no call sites change.

import { resolveVersion } from "./bibleVersions";

// Known book IDs in canonical order (used to validate keys at runtime).
const BOOK_IDS = [
  "GEN","EXO","LEV","NUM","DEU","JOS","JDG","RUT",
  "1SA","2SA","1KI","2KI","1CH","2CH","EZR","NEH",
  "EST","JOB","PSA","PRO","ECC","SNG","ISA","JER",
  "LAM","EZK","DAN","HOS","JOL","AMO","OBA","JON",
  "MIC","NAM","HAB","ZEP","HAG","ZEC","MAL","MAT",
  "MRK","LUK","JHN","ACT","ROM","1CO","2CO","GAL",
  "EPH","PHP","COL","1TH","2TH","1TI","2TI","TIT",
  "PHM","HEB","JAS","1PE","2PE","1JN","2JN","3JN",
  "JUD","REV",
];

// require() map per version. Metro resolves these at bundle time because the
// directory path is a static string literal in each branch — only the file
// name varies, which Metro handles fine for inline require() calls.
const LOADERS = {
  niv: (id) => require(`../../assets/bible/niv/${id}.json`),
  kjv: (id) => require(`../../assets/bible/kjv/${id}.json`),
  esv: (id) => require(`../../assets/bible/esv/${id}.json`),
};

// Per-version in-memory cache: { version -> { bookId -> bookData } }
const _cache = {};

/**
 * Returns the book data for bookId+version, loading it on first access.
 * Returns null for unknown version/bookId combinations.
 */
function loadBook(bookId, version) {
  if (!LOADERS[version] || !BOOK_IDS.includes(bookId)) return null;
  if (!_cache[version]) _cache[version] = {};
  if (!_cache[version][bookId]) {
    _cache[version][bookId] = LOADERS[version](bookId);
  }
  return _cache[version][bookId];
}

/**
 * Returns a { bookId -> book } proxy for a version. Property accesses trigger
 * lazy loading of individual books. Falls back to NIV for unknown versions.
 * The proxy is created fresh per call but the underlying cache is shared, so
 * books are only ever loaded once per session.
 */
export function getBookMap(version = "niv") {
  const resolved = resolveVersion(version) in LOADERS ? resolveVersion(version) : "niv";
  return new Proxy({}, {
    get(_, bookId) {
      return loadBook(bookId, resolved);
    },
    has(_, bookId) {
      return BOOK_IDS.includes(bookId);
    },
  });
}

/**
 * A chapter record for a book in a given version. `version` is optional and
 * falls back to NIV. Shape is identical across versions so callers/renderers
 * don't change.
 */
export function getChapter(bookId, chapterNumber, version = "niv") {
  const resolved = resolveVersion(version) in LOADERS ? resolveVersion(version) : "niv";
  const book = loadBook(bookId, resolved);
  if (!book) return null;
  return book.chapters.find((c) => Number(c.chapter) === Number(chapterNumber)) || null;
}

// Back-compat exports. BIBLE_DATA and BIBLE_DATA_BY_VERSION are kept so any
// future direct accesses don't break, but they also go through lazy loading.
export const BIBLE_DATA_BY_VERSION = new Proxy({}, {
  get(_, version) {
    if (!(version in LOADERS)) return undefined;
    return getBookMap(version);
  },
});

export const BIBLE_DATA = getBookMap("niv");
