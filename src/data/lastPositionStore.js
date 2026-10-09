// Tracks the most recently opened book/chapter so the app can resume exactly
// where the user left off on launch. Uses the same swappable backend as
// progressStore.js, so pointing storageBackend.js at Firebase later migrates
// this too, for free (e.g. so "last read" can sync across a user's devices).

import { backend } from "./storageBackend";

const LAST_POSITION_KEY = "lastPosition";

export async function getLastPosition() {
  return backend.getItem(LAST_POSITION_KEY);
}

export async function setLastPosition(bookId, chapterNumber, scrollY = 0) {
  const position = {
    bookId,
    chapterNumber,
    // Vertical scroll offset (in px) within the chapter, so we can resume at the
    // exact place the user left off - not just the top of the chapter. Defaults
    // to 0 because navigating to a book/chapter always starts at the top.
    scrollY: Math.max(0, Math.round(scrollY) || 0),
    updatedAt: new Date().toISOString(),
  };
  await backend.setItem(LAST_POSITION_KEY, position);
  return position;
}

// Persist only the scroll offset for the position already on record, leaving
// bookId/chapterNumber untouched. Called frequently while the user scrolls, so
// it merges into the existing record rather than requiring the caller to know
// the current book/chapter. No-op if nothing has been recorded yet.
export async function setLastScroll(scrollY) {
  const current = await backend.getItem(LAST_POSITION_KEY);
  if (!current) return null;
  const position = {
    ...current,
    scrollY: Math.max(0, Math.round(scrollY) || 0),
    updatedAt: new Date().toISOString(),
  };
  await backend.setItem(LAST_POSITION_KEY, position);
  return position;
}
