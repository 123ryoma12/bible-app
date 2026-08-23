// Persists the user's chosen READING version (the translation shown in the
// reader). Stored under a single key; defaults to DEFAULT_VERSION.
//
// This only affects what text is displayed while reading. It does NOT affect
// reading stats/history: those are keyed by book+chapter and are version-
// agnostic, so completing a chapter in any translation counts the same.
//
// Memory verses are independent - each memory entry snapshots its own version
// at add time (see memoryStore), so changing the reading version never alters
// existing memory sets.
//
// Uses an in-memory cache primed at startup (loadReadingVersion) so callers can
// read synchronously; async setters write through and update the cache.

import { backend } from "./storageBackend";
import { DEFAULT_VERSION, resolveVersion } from "./bibleVersions";

const KEY = "reading:version";

let cache = DEFAULT_VERSION;
let loaded = false;

/** Prime the cache from storage. Call once at app startup. */
export async function loadReadingVersion() {
  const stored = await backend.getItem(KEY);
  cache = resolveVersion(stored);
  loaded = true;
  return cache;
}

/** Synchronous access to the active reading version id (always valid). */
export function getActiveReadingVersion() {
  return cache;
}

/** Async getter that guarantees the cache is loaded. */
export async function getReadingVersion() {
  if (!loaded) await loadReadingVersion();
  return cache;
}

/**
 * Persist the reading version. Ignored (coerced) if the id isn't an available
 * version. Updates the cache synchronously first. Returns the effective id.
 */
export async function setReadingVersion(id) {
  const next = resolveVersion(id);
  cache = next;
  loaded = true;
  await backend.setItem(KEY, next);
  return next;
}
