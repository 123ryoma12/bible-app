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
const GOAL_KEY = "stats:goalDate"; // a single "YYYY-MM-DD" target to finish the whole Bible, or null

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

// ---------------------------------------------------------------------------
// Reading goal: a single target date by which the user wants to have read the
// whole Bible. Stored as a "YYYY-MM-DD" string (or null when no goal is set).
// ---------------------------------------------------------------------------

export async function getGoalDate() {
  const saved = await backend.getItem(GOAL_KEY);
  return typeof saved === "string" && saved ? saved : null;
}

export async function setGoalDate(dateStr) {
  await backend.setItem(GOAL_KEY, dateStr || null);
  return dateStr || null;
}

// Number of whole days between two "YYYY-MM-DD" strings (b - a). Parses at noon
// local time to avoid DST/timezone off-by-one issues.
function daysBetween(a, b) {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const da = new Date(ay, am - 1, ad, 12, 0, 0, 0);
  const db = new Date(by, bm - 1, bd, 12, 0, 0, 0);
  return Math.round((db - da) / 86400000);
}

// A range "tracks a goal" only when it ends at today (i.e. it has a concrete
// start and its end is today's date). That's YEAR and SINCE. BETWEEN and ALL
// don't include a "today" anchor, so a "should've read by now" pace is
// meaningless for them.
function goalStartDate(setting, now = new Date()) {
  switch (setting.mode) {
    case RANGE_MODES.YEAR:
      return startOfYearDateString(now);
    case RANGE_MODES.SINCE:
      return setting.since || null;
    default:
      return null; // BETWEEN / ALL -> no today-anchored start
  }
}

// Computes goal pace for the Stats screen.
//
// Returns one of:
//   { applicable: false, hasGoal, reason }  - nothing to show / show a note
//   { applicable: true, goalDate, read, remaining, daysLeft, perDay,
//     percentOfTimeElapsed, reached, overdue } - full pace info
//
// `remaining` = chapters left to finish the whole Bible (totalChapters - read).
// `daysLeft`  = days from today through the goal date, inclusive of today.
// `perDay`    = how many chapters you'd need to read each day from today to
//               finish by the goal date: ceil(remaining / daysLeft).
//   - `reached` (whole Bible done): perDay = 0.
//   - `overdue` (goal date already passed, not done): perDay = remaining (all due now).
export function computeGoalPace({
  setting,
  goalDate,
  readChapterCount,
  totalChapters,
  now = new Date(),
}) {
  if (!goalDate) {
    return { applicable: false, hasGoal: false, reason: "no-goal" };
  }

  const start = goalStartDate(setting, now);
  if (!start) {
    // BETWEEN / ALL: goal exists but this range can't express pace-to-today.
    return { applicable: false, hasGoal: true, reason: "range-not-tracking", goalDate };
  }

  const today = todayDateString(now);
  const totalDays = daysBetween(start, goalDate);
  const remaining = Math.max(totalChapters - readChapterCount, 0);
  const reached = readChapterCount >= totalChapters;

  // "Days left" is inclusive of today, since you can still read today. On the
  // goal date itself that's 1 day; the day after the goal it's 0 (overdue).
  const daysLeft = daysBetween(today, goalDate) + 1;

  // Goal date already passed (or is today with nothing left): everything is
  // "due" now. Guard against dividing by zero / negative days.
  if (daysLeft <= 0 || reached) {
    return {
      applicable: true,
      goalDate,
      read: readChapterCount,
      remaining,
      daysLeft: Math.max(daysLeft, 0),
      // No future days to spread the work across: whatever's left is due now.
      perDay: reached ? 0 : remaining,
      reached,
      overdue: !reached && daysLeft <= 0,
    };
  }

  const perDay = Math.ceil(remaining / daysLeft);

  return {
    applicable: true,
    goalDate,
    read: readChapterCount,
    remaining,
    daysLeft,
    perDay,
    percentOfTimeElapsed:
      totalDays > 0
        ? Math.round(
            (Math.min(Math.max(daysBetween(start, today), 0), totalDays) / totalDays) * 100
          )
        : 100,
    reached: false,
    overdue: false,
  };
}
