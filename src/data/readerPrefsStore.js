// Persists miscellaneous reader UI preferences that should survive app restarts.
// Uses an in-memory cache primed at startup so callers can read synchronously.

import { backend } from "./storageBackend";

const KEY = "reader:prefs";

const DEFAULTS = {
  verseNotesActive: false,
  interlinearActive: false,
};

let cache = { ...DEFAULTS };
let loaded = false;

/** Prime the cache from storage. Call once at app startup. */
export async function loadReaderPrefs() {
  const stored = await backend.getItem(KEY);
  cache = { ...DEFAULTS, ...(stored ?? {}) };
  loaded = true;
  return cache;
}

/** Synchronous access — always returns a valid prefs object. */
export function getReaderPrefs() {
  return cache;
}

/** Persist a partial prefs update. Merges into existing prefs. */
export async function setReaderPref(key, value) {
  cache = { ...cache, [key]: value };
  loaded = true;
  await backend.setItem(KEY, cache);
}
