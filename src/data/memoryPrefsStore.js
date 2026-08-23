// User-configurable prioritisation settings for the Memory tab.
//
// The Memory list ranks memorised verses WEAKEST-first so the verse most in
// need of practice sits at the top. That ranking used to be driven by four
// hard-coded constants in memoryStore.js. This module lifts those constants
// into a user-editable, persisted config so the prioritisation is no longer
// hidden.
//
// Storage shape:
//   memory:prefs -> { countWeight, countScale, decayHalfLifeDays, freshnessFloor }
//
// The whole-keyspace backup in backupStore.js captures this key automatically,
// so no changes are needed there. On a future Firebase migration this maps to a
// single user-settings document.
//
// Because the scoring functions in memoryStore.js are synchronous (and used
// inside Array.sort comparators), this module keeps an in-memory CACHE of the
// active prefs. Call loadMemoryPrefs() once at app startup to prime it; reads
// via getActivePrefs() are then synchronous and always defined.

import { backend } from "./storageBackend";

const PREFS_KEY = "memory:prefs";

// Defaults MUST equal the original hard-coded constants so behaviour is
// identical until the user changes something.
export const DEFAULT_PREFS = Object.freeze({
  countWeight: 0.35, // how much success COUNT matters vs success RATE (0..1)
  countScale: 30, // reps for diminishing returns on success count (>=1)
  decayHalfLifeDays: 60, // days for a verse's freshness to halve (>=1)
  freshnessFloor: 0.01, // staleness for a never-succeeded verse (0..1)
});

// Named presets. `balanced` is the tuned default. The others shift emphasis in
// plain terms:
//   reviewWeak      - shorter memory (verses resurface for review sooner) and
//                     accuracy weighted more than raw repetitions.
//   reinforceRecent - longer memory (recently-practised verses stay "known"
//                     longer) and repetitions weighted more heavily.
export const PRESETS = Object.freeze({
  balanced: { ...DEFAULT_PREFS },
  reviewWeak: {
    countWeight: 0.2,
    countScale: 20,
    decayHalfLifeDays: 21,
    freshnessFloor: 0.01,
  },
  reinforceRecent: {
    countWeight: 0.5,
    countScale: 40,
    decayHalfLifeDays: 120,
    freshnessFloor: 0.05,
  },
});

export const PRESET_ORDER = ["balanced", "reviewWeak", "reinforceRecent"];

export const PRESET_LABELS = Object.freeze({
  balanced: "Balanced",
  reviewWeak: "Surface weak verses",
  reinforceRecent: "Reinforce recent wins",
  custom: "Custom",
});

// One-line explanations shown under each preset so the choice is self-evident.
export const PRESET_DESCRIPTIONS = Object.freeze({
  balanced:
    "Even mix of accuracy, practice count, and time since last review. Recommended.",
  reviewWeak:
    "Brings struggling and long-untouched verses to the top sooner. Weights accuracy over repetition.",
  reinforceRecent:
    "Keeps recently-practised verses lower for longer and rewards repetition.",
  custom: "Your own hand-tuned settings (adjusted in Advanced below).",
});

// Metadata that drives the "Advanced" UI: friendly labels, help text, bounds
// and a step for the +/- steppers. `format` renders the stored value for
// display; `toStored`/`fromStored` convert between the display unit and the
// stored unit where they differ (percentages are stored as 0..1 fractions).
export const PREF_FIELDS = [
  {
    key: "decayHalfLifeDays",
    label: "Memory fades after",
    help: "How long a well-practised verse stays low in the queue before drifting back up for a refresher. Shorter = review more often.",
    min: 3,
    max: 365,
    step: 1,
    format: (v) => `${v} day${v === 1 ? "" : "s"}`,
  },
  {
    key: "countWeight",
    label: "Weight on repetitions",
    help: "How much the NUMBER of successful reviews matters versus your accuracy. Higher = repetition counts more; lower = accuracy counts more.",
    min: 0,
    max: 100,
    step: 5,
    format: (v) => `${Math.round(v)}%`,
    // stored as a 0..1 fraction, shown/edited as a 0..100 percentage
    toStored: (displayValue) => clamp(displayValue / 100, 0, 1),
    fromStored: (stored) => Math.round(stored * 100),
  },
  {
    key: "countScale",
    label: "Reps until \u201Cwell known\u201D",
    help: "How many successful reviews before extra reps stop mattering much (diminishing returns).",
    min: 5,
    max: 100,
    step: 5,
    format: (v) => `${v} reps`,
  },
  {
    key: "freshnessFloor",
    label: "Never-reviewed staleness",
    help: "How stale a memorised verse you\u2019ve never reviewed is treated as. Higher keeps such verses pinned nearer the top.",
    min: 1,
    max: 50,
    step: 1,
    format: (v) => `${Math.round(v)}%`,
    toStored: (displayValue) => clamp(displayValue / 100, 0, 1),
    fromStored: (stored) => Math.round(stored * 100),
  },
];

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

// Coerce/repair an arbitrary object into a full, valid prefs object, filling
// any missing/invalid fields from DEFAULT_PREFS. Keeps stored data robust
// across app versions and hand-edited backups.
export function normalisePrefs(obj) {
  const src = obj && typeof obj === "object" ? obj : {};
  const out = {};
  for (const [key, def] of Object.entries(DEFAULT_PREFS)) {
    const v = Number(src[key]);
    out[key] = Number.isFinite(v) ? v : def;
  }
  // Hard bounds so a bad value can never break the scorer (e.g. divide-by-zero
  // on countScale or a negative half-life).
  out.countWeight = clamp(out.countWeight, 0, 1);
  out.countScale = Math.max(1, out.countScale);
  out.decayHalfLifeDays = Math.max(1, out.decayHalfLifeDays);
  out.freshnessFloor = clamp(out.freshnessFloor, 0, 1);
  return out;
}

// Returns the preset key whose values match `prefs`, or "custom" if none do.
export function presetForPrefs(prefs) {
  const p = normalisePrefs(prefs);
  for (const key of PRESET_ORDER) {
    const preset = normalisePrefs(PRESETS[key]);
    const same = Object.keys(DEFAULT_PREFS).every((k) => preset[k] === p[k]);
    if (same) return key;
  }
  return "custom";
}

// --- In-memory cache (keeps getActivePrefs synchronous) --------------------

let cache = { ...DEFAULT_PREFS };
let loaded = false;

/** Prime the cache from storage. Call once at app startup. Safe to call again. */
export async function loadMemoryPrefs() {
  const stored = await backend.getItem(PREFS_KEY);
  cache = normalisePrefs(stored);
  loaded = true;
  return { ...cache };
}

/**
 * Synchronous access to the active prefs, used by the scoring functions inside
 * sort comparators. Always returns a complete, valid object (defaults until
 * loadMemoryPrefs() has run).
 */
export function getActivePrefs() {
  return cache;
}

/** Async getter that guarantees the cache has been loaded from storage. */
export async function getMemoryPrefs() {
  if (!loaded) await loadMemoryPrefs();
  return { ...cache };
}

/**
 * Persist a full or partial prefs update. Missing keys keep their current
 * value. Updates the cache synchronously first so the next sort reflects the
 * change immediately, then writes through to storage. Returns the new prefs.
 */
export async function setMemoryPrefs(partial) {
  const next = normalisePrefs({ ...cache, ...(partial || {}) });
  cache = next;
  loaded = true;
  await backend.setItem(PREFS_KEY, next);
  return { ...next };
}

/** Apply a named preset by key. Throws on an unknown preset. */
export async function applyPreset(presetKey) {
  const preset = PRESETS[presetKey];
  if (!preset) throw new Error(`Unknown memory preset: ${presetKey}`);
  return setMemoryPrefs(preset);
}

/** Restore the tuned defaults. */
export async function resetMemoryPrefs() {
  return setMemoryPrefs(DEFAULT_PREFS);
}
