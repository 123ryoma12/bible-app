// Prayer-point storage (the "Prayer" tab).
//
// A "prayer point" is something you want to bring before God repeatedly. Each
// point has a FREQUENCY (how long it rests after being prayed for) and a
// REPETITION (how many times it should be prayed before it retires into the
// archive, or "ongoing" to never retire).
//
// Storage shape (per-entry + an ordering index, cursor/Firebase friendly):
//   prayer:index          -> ["<id>", ...]   display order (see ordering rules)
//   prayer:point:<id>     -> {
//     id, name, description,
//     frequency,               // one of FREQUENCY keys (cooldown length)
//     repetition,              // "ongoing" | positive integer (target count)
//     prayedCount,             // completed sessions so far
//     totalSeconds,            // lifetime confirmed seconds for this point
//     createdAt,               // ISO string
//     lastPrayedAt,            // ISO string | null
//     archivedAt,              // ISO string | null (set = retired)
//   }
//   prayer:logIndex       -> ["YYYY-MM-DD", ...] every day with activity
//   prayer:log:<date>     -> { date, minutes, sessions: [{ pointId, minutes, at }] }
//   prayer:settings       -> { dailyGoalSeconds }
//
// This maps cleanly onto Firestore later (users/{uid}/prayer/{id}); because
// this module is the only place that knows the key format and record shape,
// swapping engines via storageBackend.js never touches call sites.

import { backend } from "./storageBackend";

const INDEX_KEY = "prayer:index";
const POINT_PREFIX = "prayer:point:";
const LOG_INDEX_KEY = "prayer:logIndex";
const LOG_PREFIX = "prayer:log:";
const SETTINGS_KEY = "prayer:settings";

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

// --- Frequency (cooldown) --------------------------------------------------
//
// After a prayer point is prayed for it "rests" for its cooldown and is not
// tappable during that window. Once the cooldown elapses it becomes due again
// and rejoins the actionable list. This is a hard gate, not a soft weighting,
// so what the user picks here is literally what they get.

export const FREQUENCIES = Object.freeze([
  { key: "daily", label: "Daily", hours: 24, short: "Daily" },
  { key: "3days", label: "Every 3 days", hours: 72, short: "3 days" },
  { key: "weekly", label: "Weekly", hours: 24 * 7, short: "Weekly" },
  { key: "fortnightly", label: "Fortnightly", hours: 24 * 14, short: "Fortnightly" },
  { key: "monthly", label: "Monthly", hours: 24 * 30, short: "Monthly" },
]);

export const DEFAULT_FREQUENCY = "daily";

const FREQUENCY_BY_KEY = Object.freeze(
  FREQUENCIES.reduce((acc, f) => {
    acc[f.key] = f;
    return acc;
  }, {})
);

/** Resolve a frequency key to its descriptor, falling back to the default. */
export function resolveFrequency(key) {
  return FREQUENCY_BY_KEY[key] || FREQUENCY_BY_KEY[DEFAULT_FREQUENCY];
}

/** Cooldown length in milliseconds for a prayer point. */
export function cooldownMs(point) {
  return resolveFrequency(point?.frequency).hours * MS_PER_HOUR;
}

/** Human label for a point's frequency, e.g. "Every 3 days". */
export function frequencyLabel(point) {
  return resolveFrequency(point?.frequency).label;
}

/** Compact frequency label for list rows, e.g. "3 days". */
export function frequencyShortLabel(point) {
  return resolveFrequency(point?.frequency).short;
}

// --- Session durations -----------------------------------------------------

/** Selectable prayer session lengths, in minutes. */
export const SESSION_MINUTES = Object.freeze([1, 3, 5, 10]);

// --- Settings --------------------------------------------------------------

export const DEFAULT_SETTINGS = Object.freeze({
  // Stored in seconds; the UI lets the user set it in minutes.
  dailyGoalSeconds: 10 * 60,
});

let settingsCache = { ...DEFAULT_SETTINGS };
let settingsLoaded = false;

function normaliseSettings(raw) {
  // Accept either the new dailyGoalSeconds field or the legacy dailyGoalMinutes
  // field (so existing stored data migrates automatically on first read).
  const seconds = Number(raw?.dailyGoalSeconds);
  const legacyMinutes = Number(raw?.dailyGoalMinutes);
  let goal;
  if (Number.isFinite(seconds) && seconds > 0) {
    goal = Math.min(36000, Math.round(seconds)); // cap at 10 hours
  } else if (Number.isFinite(legacyMinutes) && legacyMinutes > 0) {
    goal = Math.min(36000, Math.round(legacyMinutes * 60)); // migrate minutes → seconds
  } else {
    goal = DEFAULT_SETTINGS.dailyGoalSeconds;
  }
  return { dailyGoalSeconds: goal };
}

/** Warm the settings cache. Safe to call repeatedly / fire-and-forget. */
export async function loadPrayerSettings() {
  const raw = await backend.getItem(SETTINGS_KEY);
  settingsCache = normaliseSettings(raw);
  settingsLoaded = true;
  return settingsCache;
}

/** Synchronous read of the cached settings (defaults until loaded). */
export function getActiveSettings() {
  return settingsCache;
}

export async function getPrayerSettings() {
  if (!settingsLoaded) return loadPrayerSettings();
  return settingsCache;
}

export async function setPrayerSettings(partial) {
  const next = normaliseSettings({ ...settingsCache, ...partial });
  settingsCache = next;
  settingsLoaded = true;
  await backend.setItem(SETTINGS_KEY, next);
  return next;
}

// --- Internals -------------------------------------------------------------

function pointKey(id) {
  return `${POINT_PREFIX}${id}`;
}

function logKey(date) {
  return `${LOG_PREFIX}${date}`;
}

// Stable-ish unique id. Deterministic enough for local use; on Firebase this
// would be the auto-generated doc id instead.
function newId() {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function getIndex() {
  const index = await backend.getItem(INDEX_KEY);
  return Array.isArray(index) ? index : [];
}

async function getPoint(id) {
  return backend.getItem(pointKey(id));
}

async function loadAllPoints() {
  const index = await getIndex();
  const byId = {};
  for (const id of index) {
    const point = await getPoint(id);
    if (point) byId[id] = point;
  }
  return byId;
}

// --- Ordering --------------------------------------------------------------
//
// Every active point is always shown; the list is split into "due" (cooldown
// elapsed, tappable) and "resting" (still cooling down, dimmed). Within both
// groups we sort by the moment the point became — or will become — available,
// oldest first. That gives the tiebreak the user asked for: if a Daily point
// and a Weekly point are both due, whichever came off cooldown FIRST sits
// higher, regardless of frequency.

/**
 * Epoch ms at which a point becomes (or became) available to pray for.
 * Never-prayed points use their creation time, so brand new entries are
 * immediately due and the oldest unprayed one floats to the top.
 */
export function availableAt(point) {
  if (!point) return 0;
  const last = point.lastPrayedAt ? Date.parse(point.lastPrayedAt) : NaN;
  if (Number.isNaN(last)) {
    const created = Date.parse(point.createdAt);
    return Number.isNaN(created) ? 0 : created;
  }
  return last + cooldownMs(point);
}

/** True when the point's cooldown has elapsed and it can be prayed for. */
export function isDue(point, now = Date.now()) {
  return availableAt(point) <= now;
}

/** Milliseconds until a resting point becomes available (0 once due). */
export function msUntilDue(point, now = Date.now()) {
  return Math.max(0, availableAt(point) - now);
}

function comparePoints(a, b) {
  const aAt = availableAt(a);
  const bAt = availableAt(b);
  if (aAt !== bAt) return aAt - bAt; // available longest ago -> top
  return (a.createdAt || "").localeCompare(b.createdAt || "");
}

function compareArchived(a, b) {
  // Most recently archived first.
  return (b.archivedAt || "").localeCompare(a.archivedAt || "");
}

// Rebuilds the ordering index from the current points. Called after any change
// that can affect ordering. Cheap for the counts expected here; on Firebase the
// equivalent is just the ordered query.
async function reindex(pointsById) {
  const points = Object.values(pointsById).filter(Boolean);
  points.sort(comparePoints);
  const index = points.map((p) => p.id);
  await backend.setItem(INDEX_KEY, index);
  return index;
}

// --- Public API: points ----------------------------------------------------

/** True when a point has retired into the archive. */
export function isArchived(point) {
  return Boolean(point?.archivedAt);
}

/** Remaining prayers before a point auto-archives, or null when ongoing. */
export function prayersRemaining(point) {
  if (!point || point.repetition === "ongoing") return null;
  const target = Number(point.repetition);
  if (!Number.isFinite(target)) return null;
  return Math.max(0, target - (point.prayedCount || 0));
}

/** Short label for a point's repetition, e.g. "Ongoing" or "3 prayers left". */
export function repetitionLabel(point) {
  const left = prayersRemaining(point);
  if (left == null) return "Ongoing";
  return `${left} prayer${left === 1 ? "" : "s"} left`;
}

/** All active (non-archived) prayer points in display order. */
export async function getActivePrayers() {
  const byId = await loadAllPoints();
  return Object.values(byId).filter((p) => p && !isArchived(p)).sort(comparePoints);
}

/** All archived prayer points, most recently archived first. */
export async function getArchivedPrayers() {
  const byId = await loadAllPoints();
  return Object.values(byId).filter((p) => p && isArchived(p)).sort(compareArchived);
}

/** Look up a single prayer point by id. */
export async function getPrayer(id) {
  return getPoint(id);
}

function normaliseRepetition(repetition) {
  if (repetition === "ongoing") return "ongoing";
  const n = Number(repetition);
  // No maximum cap — a user can commit to praying something 500 times.
  return Number.isFinite(n) && n >= 1 ? Math.round(n) : "ongoing";
}

/**
 * Create a prayer point.
 * @returns the created point.
 */
export async function addPrayer({ name, description, frequency, repetition }) {
  const trimmed = String(name || "").trim();
  if (!trimmed) throw new Error("A prayer point needs a name.");

  const point = {
    id: newId(),
    name: trimmed,
    description: String(description || "").trim(),
    frequency: resolveFrequency(frequency).key,
    repetition: normaliseRepetition(repetition),
    prayedCount: 0,
    totalSeconds: 0,
    createdAt: new Date().toISOString(),
    lastPrayedAt: null,
    archivedAt: null,
  };

  const byId = await loadAllPoints();
  byId[point.id] = point;
  await backend.setItem(pointKey(point.id), point);
  await reindex(byId);
  return point;
}

/**
 * Edit a prayer point's user-editable fields (name, description, frequency,
 * repetition). Ignores unknown keys so stats can never be rewritten from the UI.
 * Returns the updated point.
 */
export async function updatePrayer(id, patch = {}) {
  const point = await getPoint(id);
  if (!point) return null;

  const updated = { ...point };
  if (patch.name != null) {
    const trimmed = String(patch.name).trim();
    if (trimmed) updated.name = trimmed;
  }
  if (patch.description != null) updated.description = String(patch.description).trim();
  if (patch.frequency != null) updated.frequency = resolveFrequency(patch.frequency).key;
  if (patch.repetition != null) updated.repetition = normaliseRepetition(patch.repetition);

  const byId = await loadAllPoints();
  byId[id] = updated;
  await backend.setItem(pointKey(id), updated);
  await reindex(byId);
  return updated;
}

/**
 * Delete a prayer point and every trace of it: the point record itself, plus
 * all of its sessions in the daily logs (so the affected days' totals — and
 * therefore the chart — are recalculated without it).
 *
 * This is deliberately a full purge rather than a soft delete. If you'd rather
 * keep historical minutes intact (you did pray them, after all), drop the log
 * rewrite below and the point alone will be removed.
 */
export async function removePrayer(id) {
  const byId = await loadAllPoints();
  if (byId[id]) delete byId[id];
  await backend.removeItem(pointKey(id));
  await reindex(byId);

  // Strip this point's sessions out of every day it appears in.
  const logIndex = await getLogIndex();
  const remainingDays = [];
  for (const key of logIndex) {
    // eslint-disable-next-line no-await-in-loop
    const log = await getDailyLog(key);
    const sessions = log.sessions.filter((s) => s.pointId !== id);
    if (sessions.length === log.sessions.length) {
      remainingDays.push(key);
      continue; // untouched day
    }

    if (sessions.length === 0) {
      // eslint-disable-next-line no-await-in-loop
      await backend.removeItem(logKey(key));
      continue; // day drops out of the index entirely
    }

    const seconds = sessions.reduce((sum, s) => sum + (s.seconds ?? (s.minutes || 0) * 60), 0);
    // eslint-disable-next-line no-await-in-loop
    await backend.setItem(logKey(key), { date: key, seconds, sessions });
    remainingDays.push(key);
  }

  if (remainingDays.length !== logIndex.length) {
    await backend.setItem(LOG_INDEX_KEY, remainingDays);
  }
}

/** Manually retire a prayer point (e.g. an answered prayer). */
export async function archivePrayer(id) {
  const point = await getPoint(id);
  if (!point || isArchived(point)) return point;

  const updated = { ...point, archivedAt: new Date().toISOString() };
  const byId = await loadAllPoints();
  byId[id] = updated;
  await backend.setItem(pointKey(id), updated);
  await reindex(byId);
  return updated;
}

/** Bring an archived prayer point back into the active list. */
export async function unarchivePrayer(id) {
  const point = await getPoint(id);
  if (!point || !isArchived(point)) return point;

  const updated = { ...point, archivedAt: null };
  // Re-opening a completed target would instantly re-archive it on the next
  // session, so a revived point becomes ongoing until the user edits it.
  if (prayersRemaining(updated) === 0) updated.repetition = "ongoing";

  const byId = await loadAllPoints();
  byId[id] = updated;
  await backend.setItem(pointKey(id), updated);
  await reindex(byId);
  return updated;
}

// --- Public API: sessions & daily log --------------------------------------

/** Local calendar date key (YYYY-MM-DD) for a timestamp. */
export function dateKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

async function getLogIndex() {
  const index = await backend.getItem(LOG_INDEX_KEY);
  return Array.isArray(index) ? index : [];
}

/** The stored log for one day, or an empty shell when nothing was prayed. */
export async function getDailyLog(key = dateKey()) {
  const log = await backend.getItem(logKey(key));
  return log && typeof log === "object"
    ? {
        date: key,
        seconds: log.seconds ?? (log.minutes || 0) * 60,
        sessions: log.sessions || [],
      }
    : { date: key, seconds: 0, sessions: [] };
}

/** Total confirmed minutes prayed on a given day. */
/** Returns the total seconds prayed today. */
export async function getDailySeconds(key = dateKey()) {
  const log = await getDailyLog(key);
  // Fall back to minutes * 60 for any pre-migration logs that still have
  // only a `minutes` field.
  return log.seconds ?? (log.minutes || 0) * 60;
}

/**
 * Daily totals for the last `days` calendar days, oldest first. Always returns
 * exactly `days` entries (zero-filled) so a chart can render a stable axis.
 */
export async function getDailyHistory(days = 14) {
  const span = Math.max(1, Math.round(days));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const out = [];
  for (let i = span - 1; i >= 0; i -= 1) {
    const date = new Date(today.getTime() - i * MS_PER_DAY);
    const key = dateKey(date);
    // eslint-disable-next-line no-await-in-loop
    const log = await getDailyLog(key);
    out.push({
    date: key,
    // Fall back to minutes * 60 for pre-migration logs.
    seconds: log.seconds ?? (log.minutes || 0) * 60,
    sessions: log.sessions.length,
  });
  }
  return out;
}

/**
 * Record one COMPLETED prayer session. Only called after the user confirms at
 * the end of a countdown — an abandoned timer logs nothing, so partial time
 * never counts and the point's schedule is untouched.
 *
 * Increments the point's prayed count, stamps lastPrayedAt (starting its
 * cooldown), adds the minutes to today's total, and auto-archives the point
 * when it reaches its repetition target.
 *
 * @returns { point, archived, dayMinutes }
 */
export async function recordPrayerSession(id, seconds) {
  const point = await getPoint(id);
  if (!point) return null;

  const secs = Math.max(0, Math.round(Number(seconds) || 0));
  const at = new Date();
  const iso = at.toISOString();

  const updated = {
    ...point,
    prayedCount: (point.prayedCount || 0) + 1,
    // Migrate legacy totalMinutes → totalSeconds on first write.
    totalSeconds: (point.totalSeconds ?? (point.totalMinutes || 0) * 60) + secs,
    lastPrayedAt: iso,
  };

  // Retire the point once it has been prayed for as many times as requested.
  const archived = prayersRemaining(updated) === 0;
  if (archived) updated.archivedAt = iso;

  const byId = await loadAllPoints();
  byId[id] = updated;
  await backend.setItem(pointKey(id), updated);
  await reindex(byId);

  // Append to the day's log.
  const key = dateKey(at);
  const log = await getDailyLog(key);
  const nextLog = {
    date: key,
    seconds: log.seconds + secs,
    sessions: [...log.sessions, { pointId: id, seconds: secs, at: iso }],
  };
  await backend.setItem(logKey(key), nextLog);

  const logIndex = await getLogIndex();
  if (!logIndex.includes(key)) {
    await backend.setItem(LOG_INDEX_KEY, [...logIndex, key].sort());
  }

  return { point: updated, archived, daySeconds: nextLog.seconds };
}

// --- Formatting helpers ----------------------------------------------------

/** "Available in 3 days" / "Available in 2 hours" / "Available in 8 minutes". */
export function availabilityLabel(point, now = Date.now()) {
  const remaining = msUntilDue(point, now);
  if (remaining <= 0) return "Ready to pray";

  const minutes = Math.ceil(remaining / (60 * 1000));
  if (minutes < 60) return `Available in ${minutes} min`;

  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `Available in ${hours} hour${hours === 1 ? "" : "s"}`;

  const days = Math.ceil(hours / 24);
  return `Available in ${days} day${days === 1 ? "" : "s"}`;
}

/** "Never prayed" / "Last prayed 3 days ago" for list + archive rows. */
export function lastPrayedLabel(point, now = Date.now()) {
  const last = point?.lastPrayedAt ? Date.parse(point.lastPrayedAt) : NaN;
  if (Number.isNaN(last)) return "Never prayed";

  const elapsed = Math.max(0, now - last);
  const days = Math.floor(elapsed / MS_PER_DAY);
  if (days >= 1) return `Last prayed ${days} day${days === 1 ? "" : "s"} ago`;

  const hours = Math.floor(elapsed / MS_PER_HOUR);
  if (hours >= 1) return `Last prayed ${hours} hour${hours === 1 ? "" : "s"} ago`;

  return "Last prayed just now";
}

/** How overdue a due point is, used as its subtitle in the ready list. */
export function waitingLabel(point, now = Date.now()) {
  if (!point?.lastPrayedAt) return "Never prayed";

  const overdueMs = Math.max(0, now - availableAt(point));
  const days = Math.floor(overdueMs / MS_PER_DAY);
  if (days >= 1) return `Ready ${days} day${days === 1 ? "" : "s"} ago`;

  const hours = Math.floor(overdueMs / MS_PER_HOUR);
  if (hours >= 1) return `Ready ${hours} hour${hours === 1 ? "" : "s"} ago`;

  return "Ready to pray";
}

/** Absolute date label, e.g. "3 Mar 2026", for archive rows. */
/**
 * Format a number of seconds into a compact human string.
 *   0        → "0s"
 *   45       → "45s"
 *   90       → "1m 30s"
 *   3600     → "1h 0m"
 *   3661     → "1h 1m"
 *
 * Hours are shown only when the value reaches 60 minutes. Seconds are
 * hidden once hours appear (we don't need that precision at that scale).
 */
export function formatPrayerTime(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s === 0) return "0s";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0 && sec === 0) return `${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function formatDate(iso) {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
