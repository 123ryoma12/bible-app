// Persists the Stats screen's "Date Range" setting and resolves it into
// concrete bounds used to filter reads. Uses the same swappable backend as the
// other stores, so it migrates to Firebase for free later.
//
// Setting shape (all dates are local "YYYY-MM-DD" strings):
//   { mode: "year" | "since" | "between" | "all", since?, start?, end? }
//
// - "year"    -> from Jan 1 of the current year through today (the default)
// - "since"   -> from `since` through today
// - "between" -> from `start` through `end`, inclusive
// - "all"     -> no bounds (everything)

import { backend } from "./storageBackend";
import { todayDateString } from "./progressStore";

const SETTINGS_KEY = "stats:dateRange";

export const RANGE_MODES = {
  YEAR: "year",
  SINCE: "since",
  BETWEEN: "between",
  ALL: "all",
};

export function startOfYearDateString(d = new Date()) {
  return `${d.getFullYear()}-01-01`;
}

// The default setting: since the start of the current year.
export function defaultRangeSetting() {
  return { mode: RANGE_MODES.YEAR, since: null, start: null, end: null };
}

export async function getRangeSetting() {
  const saved = await backend.getItem(SETTINGS_KEY);
  if (!saved || !saved.mode) return defaultRangeSetting();
  // Merge onto defaults so missing fields are always present.
  return { ...defaultRangeSetting(), ...saved };
}

export async function setRangeSetting(setting) {
  await backend.setItem(SETTINGS_KEY, setting);
  return setting;
}

// Resolves a setting into inclusive { from, to } bounds as "YYYY-MM-DD" (either
// may be null meaning "unbounded on that side").
export function resolveBounds(setting, now = new Date()) {
  const today = todayDateString(now);
  switch (setting.mode) {
    case RANGE_MODES.SINCE:
      return { from: setting.since || null, to: today };
    case RANGE_MODES.BETWEEN:
      return { from: setting.start || null, to: setting.end || null };
    case RANGE_MODES.ALL:
      return { from: null, to: null };
    case RANGE_MODES.YEAR:
    default:
      return { from: startOfYearDateString(now), to: today };
  }
}

// Predicate: is a "YYYY-MM-DD" date within [from, to] inclusive? Because the
// strings are zero-padded ISO dates, lexicographic comparison == chronological.
export function makeDateInRange(bounds) {
  const { from, to } = bounds;
  return (dateStr) => {
    if (from && dateStr < from) return false;
    if (to && dateStr > to) return false;
    return true;
  };
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Formats a "YYYY-MM-DD" string as "1 Jan 2026". Returns "" for missing/invalid.
export function formatDisplayDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return "";
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// Human-readable label for the current setting, for the control row.
export function describeRange(setting) {
  switch (setting.mode) {
    case RANGE_MODES.SINCE:
      return setting.since ? `Since ${formatDisplayDate(setting.since)}` : "Since …";
    case RANGE_MODES.BETWEEN:
      return setting.start && setting.end
        ? `${formatDisplayDate(setting.start)} → ${formatDisplayDate(setting.end)}`
        : "Between …";
    case RANGE_MODES.ALL:
      return "All time";
    case RANGE_MODES.YEAR:
    default:
      return "This year";
  }
}
