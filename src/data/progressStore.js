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
export async function getBookProgress(bookId) {
  const doc = await backend.getItem(bookKey(bookId));
  return (doc && doc.chapters) || {};
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
export async function incrementReadCount(bookId, chapterNumber) {
  const key = String(chapterNumber);
  const chapters = await getBookProgress(bookId);
  const current = chapters[key] || emptyChapterRecord();
  const updated = { dates: [...current.dates, todayDateString()] };
  await backend.setItem(bookKey(bookId), {
    chapters: { ...chapters, [key]: updated },
  });
  return updated;
}

// Total reads across every chapter in a book's progress map = total number of
// recorded dates.
export function getBookTotalReadCount(chapters) {
  return Object.values(chapters).reduce((sum, c) => sum + readCountFromDates(c), 0);
}

// Fetches progress for many books at once, keyed by bookId. Used by the Stats
// screen to show totals for every book in one pass.
export async function getAllBooksProgress(bookIds) {
  const entries = await Promise.all(
    bookIds.map(async (id) => [id, await getBookProgress(id)])
  );
  return Object.fromEntries(entries);
}
