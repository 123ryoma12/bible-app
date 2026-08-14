// Keeps a most-recent-first list of chapters marked "Read", stored so it can
// be read a page at a time. This matters once we migrate to Firebase: reading
// only one page (PAGE_SIZE docs) per scroll keeps read quota proportional to
// what the user actually looks at, instead of pulling the whole history.
//
// Storage shape (per-entry, cursor friendly):
//   history:index          -> ["<bookId>-<chapterNumber>", ...]  most-recent-first
//   history:entry:<id>     -> { bookId, chapterNumber, readAt }
//
// On Firebase this maps to a `history` subcollection ordered by readAt desc;
// getHistoryPage() maps to `.orderBy("readAt","desc").limit(n).startAfter(cursor)`
// and each entry read becomes a single doc read.

import { backend } from "./storageBackend";

const INDEX_KEY = "history:index";
const ENTRY_PREFIX = "history:entry:";
const LEGACY_KEY = "history"; // old single-array storage, migrated on first use

export const PAGE_SIZE = 50;

function entryId(bookId, chapterNumber) {
  return `${bookId}-${chapterNumber}`;
}

function entryKey(id) {
  return `${ENTRY_PREFIX}${id}`;
}

// Converts the old single `history` array (if present) into the per-entry
// shape, then removes it. Idempotent and safe to call before any read/write.
async function migrateLegacyIfNeeded() {
  const legacy = await backend.getItem(LEGACY_KEY);
  if (!legacy || !Array.isArray(legacy)) return;

  const index = [];
  for (const entry of legacy) {
    if (!entry || entry.bookId == null || entry.chapterNumber == null) continue;
    const id = entryId(entry.bookId, entry.chapterNumber);
    // Legacy array was already most-recent-first and de-duped; keep first win.
    if (index.includes(id)) continue;
    index.push(id);
    await backend.setItem(entryKey(id), {
      bookId: entry.bookId,
      chapterNumber: entry.chapterNumber,
      readAt: entry.readAt || new Date().toISOString(),
    });
  }
  await backend.setItem(INDEX_KEY, index);
  await backend.removeItem(LEGACY_KEY);
}

async function getIndex() {
  await migrateLegacyIfNeeded();
  const index = await backend.getItem(INDEX_KEY);
  return Array.isArray(index) ? index : [];
}

/**
 * Read a single page of history, most-recent-first.
 *
 * @param {number} limit  Max entries to return (default PAGE_SIZE).
 * @param {string|null} cursor  The `nextCursor` from the previous page, or
 *   null/undefined for the first page.
 * @returns {Promise<{entries: Array, nextCursor: string|null, hasMore: boolean}>}
 *   `entries` are full records; `nextCursor` is the id to pass in for the next
 *   page; `hasMore` indicates whether further pages exist.
 */
export async function getHistoryPage(limit = PAGE_SIZE, cursor = null) {
  const index = await getIndex();

  let start = 0;
  if (cursor != null) {
    const pos = index.indexOf(cursor);
    // If the cursor is gone (e.g. that chapter was re-read and moved), fall
    // back to the start rather than throwing; callers can de-dupe.
    start = pos === -1 ? 0 : pos + 1;
  }

  const pageIds = index.slice(start, start + limit);
  const entries = [];
  for (const id of pageIds) {
    const entry = await backend.getItem(entryKey(id));
    if (entry) entries.push(entry);
  }

  const nextIndex = start + pageIds.length;
  return {
    entries,
    nextCursor: pageIds.length ? pageIds[pageIds.length - 1] : cursor ?? null,
    hasMore: nextIndex < index.length,
  };
}

/**
 * Convenience wrapper returning just the first page's entries. Kept so any
 * caller that only needs "recent history" doesn't have to deal with cursors.
 */
export async function getHistory() {
  const { entries } = await getHistoryPage();
  return entries;
}

/**
 * Record that a chapter was read. Re-reading a chapter moves it to the top
 * instead of creating a duplicate. History is unbounded.
 */
export async function addToHistory(bookId, chapterNumber) {
  const index = await getIndex();
  const id = entryId(bookId, chapterNumber);

  // Move to front: drop any existing occurrence, then prepend.
  const filtered = index.filter((existing) => existing !== id);
  const updated = [id, ...filtered];

  await backend.setItem(entryKey(id), {
    bookId,
    chapterNumber,
    readAt: new Date().toISOString(),
  });
  await backend.setItem(INDEX_KEY, updated);
  return updated;
}
