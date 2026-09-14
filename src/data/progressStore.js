// Reading-progress tracking (per-chapter list of read dates).
//
// Storage is one record per BOOK (not per chapter) - a map of chapter number
// -> { dates: ["YYYY-MM-DD", ...] }. Each time a chapter is read we append
// today's date; the same date can appear more than once if a chapter is read
// multiple times in a day. Read count is simply dates.length, and the last
// read is the last (max) date. Keeping the individual dates (rather than just a
// counter) is what lets the Stats screen filter reads by an arbitrary date
// range cheaply - still one read per book document.
//
// Keeping everything for a book in one record means per-book aggregate stats
// stay a single read instead of one-per-chapter, and it maps cleanly onto a
// future Firestore document shape:
//   users/{uid}/progress/{bookId} = { chapters: { "<ch>": { dates: [...] } } }
//
// This module is the only place that knows the storage key format and record
// shape. It talks to whatever backend is configured in storageBackend.js, so
// migrating storage engines later never requires touching call sites.

import { backend } from "./storageBackend";

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------
// Keyed by bookId → { [chapterNumber: string]: { dates: string[] } }.
// Populated on first access per book and kept in sync after every write so
// callers never need to re-read storage just because something changed.
const _cache = {}; // { [bookId]: chapters }
let _allLoaded = false; // true after getAllBooksProgress has warmed every book

// Listeners notified whenever any book's data changes.
// Each listener receives the full updated cache snapshot.
const _listeners = new Set();

export function subscribeProgress(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

function _notify(changedBookId = null) {
  // Shallow-copy so listeners always get a stable new reference.
  // changedBookId is set when a single book's data changed — listeners can
  // use it to skip re-processing every other book.
  const snapshot = { ..._cache };
  _listeners.forEach((fn) => fn(snapshot, changedBookId));
}

function bookKey(bookId) {
  return `progress:${bookId}`;
}

function emptyChapterRecord() {
  return { dates: [] };
}

// Local calendar date as "YYYY-MM-DD" (not UTC), so a read is attributed to
// the user's day.
export function todayDateString(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Returns { [chapterNumber: string]: { dates: string[] } } for a book.
// Results are cached in memory — storage is only hit once per book.
export async function getBookProgress(bookId) {
  if (!Object.prototype.hasOwnProperty.call(_cache, bookId)) {
    const doc = await backend.getItem(bookKey(bookId));
    _cache[bookId] = (doc && doc.chapters) || {};
  }
  return _cache[bookId];
}

export async function getProgress(bookId, chapterNumber) {
  const chapters = await getBookProgress(bookId);
  return chapters[String(chapterNumber)] || emptyChapterRecord();
}

// How many times a chapter has been read = number of recorded dates.
export function readCountFromDates(rec) {
  return rec && Array.isArray(rec.dates) ? rec.dates.length : 0;
}

// Appends today's date to a chapter's list of read dates (duplicates allowed).
// Updates the cache and notifies listeners — no full reload needed anywhere.
export async function incrementReadCount(bookId, chapterNumber) {
  const key = String(chapterNumber);
  const chapters = await getBookProgress(bookId); // guaranteed cached after this
  const current = chapters[key] || emptyChapterRecord();
  const updated = { dates: [...current.dates, todayDateString()] };
  const nextChapters = { ...chapters, [key]: updated };
  await backend.setItem(bookKey(bookId), { chapters: nextChapters });
  // Update cache in-place and tell listeners with the changed book ID so
  // subscribers can skip re-processing every other book.
  _cache[bookId] = nextChapters;
  _notify(bookId);
  return updated;
}

// Total reads across every chapter in a book's progress map = total number of
// recorded dates.
export function getBookTotalReadCount(chapters) {
  return Object.values(chapters).reduce((sum, c) => sum + readCountFromDates(c), 0);
}

// Fetches progress for many books at once, keyed by bookId. Used by the Stats
// screen to show totals for every book in one pass.
// On first call it warms the full cache; subsequent calls are instant.
export async function getAllBooksProgress(bookIds) {
  if (_allLoaded) return { ..._cache };
  const entries = await Promise.all(
    bookIds.map(async (id) => [id, await getBookProgress(id)])
  );
  _allLoaded = true;
  return Object.fromEntries(entries);
}

/** Call once at app startup to warm the full progress cache before any screen mounts. */
export async function preloadAllProgress(bookIds) {
  await getAllBooksProgress(bookIds);
}

/** Synchronous read — only valid after preloadAllProgress() resolves. */
export function getProgressCacheSync() {
  return { ..._cache };
}
