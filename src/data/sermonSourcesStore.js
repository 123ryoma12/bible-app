// Persisted user preferences for sermon sources.
//
// Two independent axes of preference are stored:
//
//   enabledSources    Set<string>  — which top-level sources are on.
//                                   Default: all (["gospel-in-life", "cornerstone"]).
//
//   cornerstoneCongregations  Set<string>  — which congregations to include
//                                           when the Cornerstone source is on.
//                                           Default: all congregation IDs.
//
// Preferences survive app restarts via the shared storage backend. The module
// follows the same observable pattern as sermonDownloads: a single snapshot
// object is published to all subscribers, and React components read it via
// useSyncExternalStore.

import { useEffect, useSyncExternalStore } from "react";
import { backend } from "./storageBackend";
import {
  CORNERSTONE_SOURCE_ID,
  CONGREGATIONS,
} from "./cornerstoneApi";

export const GOSPEL_IN_LIFE_SOURCE_ID = "gospel-in-life";

export const ALL_SOURCE_IDS = [GOSPEL_IN_LIFE_SOURCE_ID, CORNERSTONE_SOURCE_ID];

const ALL_CONGREGATION_IDS = CONGREGATIONS.map((c) => c.id);

const PREFS_KEY = "sermons:source-prefs";

// ── Default preferences ───────────────────────────────────────────────────────

const DEFAULT_PREFS = {
  enabledSources: ALL_SOURCE_IDS,
  cornerstoneCongregations: ALL_CONGREGATION_IDS,
};

// ── Observable state ──────────────────────────────────────────────────────────

let snapshot = {
  ready: false,
  ...DEFAULT_PREFS,
};

const listeners = new Set();

function publish(changes) {
  snapshot = { ...snapshot, ...changes };
  for (const listener of listeners) listener();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

// ── Persistence ───────────────────────────────────────────────────────────────

let loadPromise = null;

async function ensureLoaded() {
  if (snapshot.ready) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const stored = await backend.getItem(PREFS_KEY);
      if (stored) {
        // Validate stored values — unknown source IDs or congregation IDs are
        // dropped so adding new sources in future versions doesn't break.
        const enabledSources = Array.isArray(stored.enabledSources)
          ? stored.enabledSources.filter((id) => ALL_SOURCE_IDS.includes(id))
          : DEFAULT_PREFS.enabledSources;

        const cornerstoneCongregations = Array.isArray(
          stored.cornerstoneCongregations
        )
          ? stored.cornerstoneCongregations.filter((id) =>
              ALL_CONGREGATION_IDS.includes(id)
            )
          : DEFAULT_PREFS.cornerstoneCongregations;

        // If all stored sources were unknown (e.g., an old version), fall back
        // to defaults so the app doesn't launch with nothing enabled.
        publish({
          ready: true,
          enabledSources: enabledSources.length
            ? enabledSources
            : DEFAULT_PREFS.enabledSources,
          cornerstoneCongregations: cornerstoneCongregations.length
            ? cornerstoneCongregations
            : DEFAULT_PREFS.cornerstoneCongregations,
        });
      } else {
        publish({ ready: true });
      }
    } catch {
      // Storage failure — use defaults and stay functional.
      publish({ ready: true });
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}

async function persist() {
  try {
    await backend.setItem(PREFS_KEY, {
      enabledSources: snapshot.enabledSources,
      cornerstoneCongregations: snapshot.cornerstoneCongregations,
    });
  } catch {
    // Best-effort — preference loss is not fatal.
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Toggle a top-level source on or off.
 * At least one source must remain enabled — if this toggle would disable the
 * last one, it is a no-op.
 */
export async function toggleSource(sourceId) {
  await ensureLoaded();
  const current = snapshot.enabledSources;
  const isOn = current.includes(sourceId);

  // Don't allow disabling the last source.
  if (isOn && current.length === 1) return;

  const next = isOn
    ? current.filter((id) => id !== sourceId)
    : [...current, sourceId];

  publish({ enabledSources: next });
  await persist();
}

/**
 * Toggle a Cornerstone congregation on or off.
 * At least one congregation must remain enabled when Cornerstone is on.
 */
export async function toggleCongregation(congregationId) {
  await ensureLoaded();
  const current = snapshot.cornerstoneCongregations;
  const isOn = current.includes(congregationId);

  if (isOn && current.length === 1) return;

  const next = isOn
    ? current.filter((id) => id !== congregationId)
    : [...current, congregationId];

  publish({ cornerstoneCongregations: next });
  await persist();
}

/**
 * React hook — subscribe to source preferences. Triggers a load on first call.
 * Returns the full snapshot including `ready`, `enabledSources`, and
 * `cornerstoneCongregations`.
 */
export function useSermonSources() {
  useEffect(() => {
    ensureLoaded();
  }, []);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * One-shot read of the current enabled source/congregation IDs, waiting for
 * the store to be ready. Used by the fetch logic (which runs outside React).
 */
export async function getEnabledPrefs() {
  await ensureLoaded();
  return {
    enabledSources: snapshot.enabledSources,
    cornerstoneCongregations: snapshot.cornerstoneCongregations,
  };
}
