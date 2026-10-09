// Persists the active sermon player state across app restarts.
//
// Saves: the sermon object, the already-resolved audio URL, and the playback
// position in seconds. The resolved URL is stored directly because both sermon
// sources (Gospel in Life / Cornerstone) use permanent CDN links that never
// expire — no re-scrape needed on restore.
//
// Position is saved frequently (every ~5 s) while playing so restoring after
// a force-quit lands within a few seconds of where the user left off.
//
// Cleared when the user explicitly closes the player (X button), so only a
// genuine mid-session kill restores playback — not a deliberate stop.

import { backend } from "./storageBackend";

const KEY = "sermonPlayback";

/**
 * Save the full playback state.
 * @param {object} sermon    - The sermon object as stored in App.js activeSermon.
 * @param {string} audioUrl  - The already-resolved MP3 URL.
 * @param {number} positionSecs - Current playback position in seconds.
 */
export async function saveSermonPlayback(sermon, audioUrl, positionSecs) {
  await backend.setItem(KEY, {
    sermon,
    audioUrl,
    positionSecs: Math.max(0, positionSecs ?? 0),
    savedAt: new Date().toISOString(),
  });
}

/**
 * Save only the position, leaving sermon + audioUrl unchanged.
 * Called on the frequent 5 s tick — avoids rewriting the full object each time.
 */
export async function saveSermonPosition(positionSecs) {
  const current = await backend.getItem(KEY);
  if (!current) return;
  await backend.setItem(KEY, {
    ...current,
    positionSecs: Math.max(0, positionSecs ?? 0),
    savedAt: new Date().toISOString(),
  });
}

/**
 * Returns the saved playback state, or null if nothing was saved.
 * @returns {{ sermon, audioUrl, positionSecs, savedAt } | null}
 */
export async function getSermonPlayback() {
  return backend.getItem(KEY);
}

/**
 * Clear the saved state. Called when the user explicitly closes the player.
 */
export async function clearSermonPlayback() {
  await backend.removeItem(KEY);
}
