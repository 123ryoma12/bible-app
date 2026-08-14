// Keeps a capped, most-recent-first list of chapters marked "Read". Uses the
// same swappable backend as the other progress modules, so it migrates to
// Firebase for free later (e.g. as a per-user subcollection ordered by
// readAt, with the same MAX_HISTORY cap or an unbounded query there instead).

import { backend } from "./storageBackend";

const HISTORY_KEY = "history";
const MAX_HISTORY = 10;

export async function getHistory() {
  const history = await backend.getItem(HISTORY_KEY);
  return history || [];
}

export async function addToHistory(bookId, chapterNumber) {
  const history = (await backend.getItem(HISTORY_KEY)) || [];
  // Remove any existing entry for this chapter so re-reading it moves it to
  // the top instead of creating a duplicate.
  const filtered = history.filter(
    (entry) => !(entry.bookId === bookId && entry.chapterNumber === chapterNumber)
  );
  const entry = { bookId, chapterNumber, readAt: new Date().toISOString() };
  const updated = [entry, ...filtered].slice(0, MAX_HISTORY);
  await backend.setItem(HISTORY_KEY, updated);
  return updated;
}
