// Reading-progress tracking (read counts per chapter).
//
// Storage is one record per BOOK (not per chapter) - a map of chapter number
// -> { readCount, lastReadAt }. This keeps per-book aggregate stats (e.g.
// "how many times have I read Philippians in total") to a single read
// instead of one-per-chapter, and maps cleanly onto a future Firestore
// document shape: users/{uid}/progress/{bookId} = { chapters: { ... } }.
//
// This module is the only place that knows the storage key format and
// record shape. It talks to whatever backend is configured in
// storageBackend.js, so migrating storage engines later never requires
// touching call sites (the screens).

import { backend } from "./storageBackend";

function bookKey(bookId) {
  return `progress:${bookId}`;
}

function emptyChapterRecord() {
  return { readCount: 0, lastReadAt: null };
}

// Returns { [chapterNumber: string]: { readCount, lastReadAt } } for a book.
export async function getBookProgress(bookId) {
  const doc = await backend.getItem(bookKey(bookId));
  return (doc && doc.chapters) || {};
}

export async function getProgress(bookId, chapterNumber) {
  const chapters = await getBookProgress(bookId);
  return chapters[String(chapterNumber)] || emptyChapterRecord();
}

export async function incrementReadCount(bookId, chapterNumber) {
  const key = String(chapterNumber);
  const chapters = await getBookProgress(bookId);
  const current = chapters[key] || emptyChapterRecord();
  const updated = {
    readCount: current.readCount + 1,
    lastReadAt: new Date().toISOString(),
  };
  await backend.setItem(bookKey(bookId), {
    chapters: { ...chapters, [key]: updated },
  });
  return updated;
}

// Sum of readCount across every chapter in a book's progress map.
export function getBookTotalReadCount(chapters) {
  return Object.values(chapters).reduce((sum, c) => sum + (c?.readCount || 0), 0);
}

// Fetches progress for many books at once, keyed by bookId. Used by the
// Stats screen to show totals for every book in one pass.
export async function getAllBooksProgress(bookIds) {
  const entries = await Promise.all(
    bookIds.map(async (id) => [id, await getBookProgress(id)])
  );
  return Object.fromEntries(entries);
}
