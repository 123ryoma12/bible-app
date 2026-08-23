// Registry of Bible translations the app knows about.
//
// NIV, ESV and KJV all ship with bundled text (assets/bible/<id>/) and are
// `available: true`, so all three are selectable in the Settings picker and the
// Memory version selector.
//
// To add another translation later: drop its files under assets/bible/<id>/,
// import them in bibleData.js (add the map to BIBLE_DATA_BY_VERSION), and add an
// entry here with `available: true`. If data isn't ready yet, add the entry with
// `available: false` and the UI will present it as a disabled "coming soon" row.
//
// `id` doubles as the on-disk folder name (assets/bible/<id>/) and the value
// persisted in stores, so keep it stable and lowercase.

export const BIBLE_VERSIONS = [
  {
    id: "niv",
    abbr: "NIV",
    name: "New International Version",
    available: true,
  },
  {
    id: "esv",
    abbr: "ESV",
    name: "English Standard Version",
    available: true, // bundled from api.esv.org
  },
  {
    id: "kjv",
    abbr: "KJV",
    name: "King James Version",
    available: true, // bundled from API.Bible (public domain)
  },
];

// The version used everywhere until the user chooses otherwise. Must be an
// `available` version.
export const DEFAULT_VERSION = "niv";

const BY_ID = Object.fromEntries(BIBLE_VERSIONS.map((v) => [v.id, v]));

/** Look up a version descriptor by id (or undefined). */
export function getVersion(id) {
  return BY_ID[id];
}

/** True if the id is a known, bundled (selectable) version. */
export function isVersionAvailable(id) {
  const v = BY_ID[id];
  return !!(v && v.available);
}

/**
 * Coerce an arbitrary id to a usable one: returns it if it's an available
 * version, otherwise falls back to DEFAULT_VERSION. Keeps callers safe against
 * stale/removed ids in persisted prefs or old memory entries.
 */
export function resolveVersion(id) {
  return isVersionAvailable(id) ? id : DEFAULT_VERSION;
}

/** Short label for display, e.g. "NIV". Falls back to the upper-cased id. */
export function versionAbbr(id) {
  const v = BY_ID[id];
  return v ? v.abbr : String(id || "").toUpperCase();
}
