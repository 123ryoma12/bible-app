// Tracks the most recently opened book/chapter so the app can resume exactly
// where the user left off on launch. Uses the same swappable backend as
// progressStore.js, so pointing storageBackend.js at Firebase later migrates
// this too, for free (e.g. so "last read" can sync across a user's devices).

import { backend } from "./storageBackend";

const LAST_POSITION_KEY = "lastPosition";

export async function getLastPosition() {
  return backend.getItem(LAST_POSITION_KEY);
}

export async function setLastPosition(bookId, chapterNumber) {
  const position = {
    bookId,
    chapterNumber,
    updatedAt: new Date().toISOString(),
  };
  await backend.setItem(LAST_POSITION_KEY, position);
  return position;
}
