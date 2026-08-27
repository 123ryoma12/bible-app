// Verse-memorisation storage (the "Memory" tab).
//
// Persists a user's memory sets. A "memory set" is one or more CONSECUTIVE
// verses from a SINGLE book (a range may cross chapters but never books). Each
// set is either still being learned ("not_memorised") or "memorised"; once
// memorised it accrues a success rate. See memory.txt for the spec.
//
// NOTE: the learning STAGE (1/2/3) is intentionally NOT persisted. It lives
// only in the drill component's in-session state, so quitting mid-way resets
// the user back to stage 1. This module only persists whether a set has been
// memorised yet (via markMemorised) and its memorised attempt stats.
//
// Storage shape (per-entry + an ordering index, cursor/Firebase friendly):
//   memory:index         -> ["<id>", ...]   display order (see ordering rules)
//   memory:entry:<id>    -> {
//     id, bookId,
//     chapterStart, verseStart, chapterEnd, verseEnd,
//     verses: [{ chapter, verse, text }, ...],  // snapshot at add time
//     status: "not_memorised" | "memorised",
//     attempts,                  // total memorised attempts (memorised only)
//     successes, failures,       // per-set win/loss counts (attempts = sum)
//     lastSuccessAt,             // ISO string | null (drives ordering)
//     lastPractisedAt,           // ISO string | null (most recent completed drill)
//     createdAt
//   }
//
// This maps cleanly onto Firestore later:
//   users/{uid}/memory/{id} = { ...entry }
// and getMemoryPage() becomes an ordered query
//   .orderBy("statusRank").orderBy("lastSuccessAt","asc").limit(n).startAfter(cursor)
// (statusRank: not_memorised before memorised). Because this module is the only
// place that knows the key format and record shape, migrating storage engines
// via storageBackend.js never touches call sites.

import { backend } from "./storageBackend";
import { getVersesInRange, formatReference } from "./verses";
import { getActivePrefs } from "./memoryPrefsStore";
import { resolveVersion, DEFAULT_VERSION } from "./bibleVersions";

const INDEX_KEY = "memory:index";
const ENTRY_PREFIX = "memory:entry:";

export const STATUS = {
  NOT_MEMORISED: "not_memorised",
  MEMORISED: "memorised",
};

export const MAX_STAGE = 3;

function entryKey(id) {
  return `${ENTRY_PREFIX}${id}`;
}

// Stable-ish unique id. Deterministic enough for local use; on Firebase this
// would be the auto-generated doc id instead.
function newId() {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function getIndex() {
  const index = await backend.getItem(INDEX_KEY);
  return Array.isArray(index) ? index : [];
}

async function getEntry(id) {
  return backend.getItem(entryKey(id));
}

// --- Memorised-section ranking ---------------------------------------------
//
// The memorised list is a PRACTICE QUEUE: the verse at the top is what you
// should drill next. So we rank WEAKEST verses first. The strength of a verse
// is a blend of two signals that pull in opposite directions:
//
//   * success RATE     - how reliably you get it perfect (successes/attempts).
//   * success COUNT    - how much proven, repeated recall you have. A verse you
//                        have nailed 40 times is genuinely stronger than one you
//                        nailed once, even at the same rate. We must NOT neglect
//                        high-count verses (they've earned their place near the
//                        bottom of the practice queue).
//
// Using rate alone is misleading for small samples (1/1 = 100% looks "perfect"
// but is barely tested). Using count alone ignores reliability. So we combine
// them with a tunable weight:
//
//   score = rate * (1 - COUNT_WEIGHT) + normCount * COUNT_WEIGHT
//
// where normCount squashes the raw success count into [0,1] with diminishing
// returns, so early successes matter a lot and later ones add less. Higher
// score = stronger = lower in the queue. Verses with NO attempts yet are the
// most in need of practice, so they sort to the very TOP (score = -1 sentinel).
//
// COUNT_WEIGHT is the single knob: 0 = pure rate, 1 = pure count. 0.35 keeps
// rate dominant while still rewarding well-drilled verses.
//
// TIME DECAY (spaced repetition): a verse you nailed 50 times a year ago should
// NOT stay buried forever - memory fades, so it deserves a refresher. We model
// this with a "freshness" multiplier that starts at 1.0 right after a success
// and decays EXPONENTIALLY over time (the classic forgetting curve: fast at
// first, then levelling off). The final ranking score is:
//
//   finalScore = strength * freshness(daysSinceLastSuccess)
//   freshness  = 0.5 ^ (days / DECAY_HALF_LIFE_DAYS)
//
// So freshness halves every DECAY_HALF_LIFE_DAYS: 1.0 today, 0.5 at one
// half-life, 0.25 at two, ... approaching but never reaching 0. Because a
// stale-but-strong verse's score shrinks over time, it eventually scores lower
// than a freshly-practised weaker verse and floats back UP the queue
// (weakest-first), resurfacing for review. Practise it again and its freshness
// resets to 1.0, sending it back down.

// The four tuning knobs below are now USER-CONFIGURABLE via memoryPrefsStore.js
// (Settings > Memory Prioritisation) rather than hard-coded. Their live values
// come from getActivePrefs(); the exported constants remain as backwards-
// compatible aliases for the tuned DEFAULTS so any importer/test still resolves.
//
//   countWeight       - how much the (normalised) success COUNT contributes vs
//                       the success RATE.
//   countScale        - successes needed to reach ~63% of the max count
//                       contribution (diminishing returns).
//   decayHalfLifeDays - days for a verse's freshness to HALVE (exponential
//                       decay half-life); strong verses resurface after this.
//   freshnessFloor    - freshness assigned to a memorised entry that has never
//                       succeeded (treated as maximally stale, stays near top).

/** Tuned default for the success-count weight. Live value: getActivePrefs(). */
export const COUNT_WEIGHT = 0.35;

/** Tuned default for the freshness half-life (days). Live: getActivePrefs(). */
export const DECAY_HALF_LIFE_DAYS = 60;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Squash a raw success count into [0,1) with diminishing returns. The first few
// successes move the needle a lot; beyond countScale each extra one adds little.
function normalisedSuccessCount(successes) {
  const { countScale } = getActivePrefs();
  const n = Math.max(0, successes || 0);
  return 1 - Math.exp(-n / countScale);
}

// Whole days elapsed since the entry's last successful attempt. Memorised
// entries that have never succeeded (lastSuccessAt = null) are treated as
// maximally stale so they stay near the top. `now` is injectable for testing.
function daysSinceLastSuccess(entry, now = Date.now()) {
  if (!entry || !entry.lastSuccessAt) return Infinity;
  const then = Date.parse(entry.lastSuccessAt);
  if (Number.isNaN(then)) return Infinity;
  return Math.max(0, (now - then) / MS_PER_DAY);
}

// Exponential freshness in (0, 1]: 1.0 right after a success, halving every
// decayHalfLifeDays and approaching (never reaching) 0. Entries that have
// never succeeded return the freshnessFloor so they stay maximally stale. Both
// values are user-configurable (memoryPrefsStore). Exported for testing/UI.
export function freshness(entry, now = Date.now()) {
  const { decayHalfLifeDays, freshnessFloor } = getActivePrefs();
  const days = daysSinceLastSuccess(entry, now);
  if (!Number.isFinite(days)) return freshnessFloor; // never succeeded -> stale
  return Math.pow(0.5, days / decayHalfLifeDays);
}

/**
 * Ranking score for a MEMORISED entry (higher = stronger + fresher = sinks
 * lower in the practice queue). It multiplies the raw strength (rate + count)
 * by a time-decay freshness factor so long-untouched verses resurface for
 * review. Entries with no attempts yet return -1 so they stay at the very top
 * (they need practice the most). `now` is injectable for deterministic tests.
 * Exported for testing and optional display in the UI.
 */
export function memorisedScore(entry, now = Date.now()) {
  const attempts = entry && entry.attempts ? entry.attempts : 0;
  if (!attempts) return -1; // never attempted -> top of the practice queue
  const { countWeight } = getActivePrefs();
  const rate = successRate(entry);
  const normCount = normalisedSuccessCount(successCount(entry));
  const strength = rate * (1 - countWeight) + normCount * countWeight;
  return strength * freshness(entry, now);
}

// Ordering: "Not Memorised" first, then memorised ranked WEAKEST-first so the
// verse most in need of practice sits at the TOP of the memorised section. A
// single `now` is threaded through so every entry's time-decay is measured
// against the same instant within one sort.
function compareEntries(a, b, now = Date.now()) {
  const aNot = a.status === STATUS.NOT_MEMORISED;
  const bNot = b.status === STATUS.NOT_MEMORISED;
  if (aNot !== bNot) return aNot ? -1 : 1; // not-memorised group first

  if (aNot) {
    // Within not-memorised keep newest-added first (feels natural for a to-do).
    return (b.createdAt || "").localeCompare(a.createdAt || "");
  }

  // Memorised group: weakest (lowest decayed score) first.
  const aScore = memorisedScore(a, now);
  const bScore = memorisedScore(b, now);
  if (aScore !== bScore) return aScore - bScore;

  // Tie-breakers: more proven recall sinks lower; then drill the one not
  // succeeded in longest; finally fall back to creation order for stability.
  const aWins = successCount(a);
  const bWins = successCount(b);
  if (aWins !== bWins) return aWins - bWins; // fewer successes -> higher up

  const aTime = a.lastSuccessAt || "";
  const bTime = b.lastSuccessAt || "";
  if (aTime !== bTime) return aTime.localeCompare(bTime); // oldest success first

  return (a.createdAt || "").localeCompare(b.createdAt || "");
}

// Rebuilds the ordering index from the current entries. Called after any change
// that can affect ordering (add/remove/status/success). Cheap for the small
// counts expected here; on Firebase the equivalent is just the ordered query.
async function reindex(entriesById) {
  const now = Date.now();
  const entries = Object.values(entriesById).filter(Boolean);
  entries.sort((a, b) => compareEntries(a, b, now));
  const index = entries.map((e) => e.id);
  await backend.setItem(INDEX_KEY, index);
  return index;
}

async function loadAllEntries() {
  const index = await getIndex();
  const byId = {};
  for (const id of index) {
    const entry = await getEntry(id);
    if (entry) byId[id] = entry;
  }
  return byId;
}

// --- Public API -----------------------------------------------------------

/** Number of perfect memorised attempts. */
export function successCount(entry) {
  return entry && typeof entry.successes === "number" ? entry.successes : 0;
}

/**
 * Number of failed memorised attempts. Prefers the stored `failures` count and
 * falls back to attempts-minus-successes for entries created before it existed.
 */
export function failureCount(entry) {
  if (!entry) return 0;
  if (typeof entry.failures === "number") return entry.failures;
  return Math.max(0, (entry.attempts || 0) - (entry.successes || 0));
}

/** Success rate in [0,1]; 0 when there are no attempts yet. */
export function successRate(entry) {
  if (!entry || !entry.attempts) return 0;
  return entry.successes / entry.attempts;
}

/** Convenience reference label, e.g. "John 3:16-18". */
export function referenceLabel(entry) {
  return formatReference(
    entry.bookId,
    entry.chapterStart,
    entry.verseStart,
    entry.chapterEnd,
    entry.verseEnd
  );
}

/**
 * Read a page of memory sets in display order.
 *
 * Ordering is recomputed LIVE on every read against the current time. This
 * matters for time-decay (spaced repetition): a strong verse's freshness fades
 * as days pass with no writes, so it must be able to resurface up the queue
 * without waiting for the next add/remove/attempt to trigger a reindex. The
 * persisted `memory:index` is kept in sync by reindex() as a Firebase-friendly
 * detail, but reads no longer depend on it being current.
 * @returns {Promise<{entries: Array, nextCursor: string|null, hasMore: boolean}>}
 */
export async function getMemoryPage(limit = 100, cursor = null) {
  const now = Date.now();
  const byId = await loadAllEntries();
  const ordered = Object.values(byId)
    .filter(Boolean)
    .sort((a, b) => compareEntries(a, b, now));
  const orderedIds = ordered.map((e) => e.id);

  let start = 0;
  if (cursor != null) {
    const pos = orderedIds.indexOf(cursor);
    start = pos === -1 ? 0 : pos + 1;
  }

  const entries = ordered.slice(start, start + limit);
  const pageIds = entries.map((e) => e.id);

  return {
    entries,
    nextCursor: pageIds.length ? pageIds[pageIds.length - 1] : cursor ?? null,
    hasMore: start + pageIds.length < orderedIds.length,
  };
}

/** All memory sets in display order (convenience over getMemoryPage). */
export async function getMemoryList() {
  const { entries } = await getMemoryPage();
  return entries;
}

/**
 * Create a memory set for a consecutive verse range within one book.
 * Throws if the range is empty/invalid (callers should validate in the UI too).
 * @returns the created entry.
 */
export async function addMemory({
  bookId,
  chapterStart,
  verseStart,
  chapterEnd,
  verseEnd,
  version,
}) {
  // Each memory set snapshots the text of a specific translation, chosen at add
  // time (independent of the reading version). Unbundled versions coerce to the
  // default so the snapshot always has text.
  const resolvedVersion = resolveVersion(version || DEFAULT_VERSION);
  const verses = getVersesInRange(
    bookId,
    chapterStart,
    verseStart,
    chapterEnd,
    verseEnd,
    resolvedVersion
  );
  if (verses.length === 0) {
    throw new Error("No verses found for that range (must be within one book).");
  }

  const entry = {
    id: newId(),
    bookId,
    chapterStart: Number(chapterStart),
    verseStart: Number(verseStart),
    chapterEnd: Number(chapterEnd),
    verseEnd: Number(verseEnd),
    version: resolvedVersion, // translation this set was memorised in
    verses,
    status: STATUS.NOT_MEMORISED,
    stage: 1,      // learning stage reached (1..MAX_STAGE); resumed next session
    attempts: 0,   // total memorised attempts (successes + failures)
    successes: 0,  // perfect (100%) memorised attempts
    failures: 0,   // memorised attempts with any mistake
    lastSuccessAt: null,
    lastPractisedAt: null,
    createdAt: new Date().toISOString(),
  };

  const byId = await loadAllEntries();
  byId[entry.id] = entry;
  await backend.setItem(entryKey(entry.id), entry);
  await reindex(byId);
  return entry;
}

/** Delete a memory set. */
export async function removeMemory(id) {
  const byId = await loadAllEntries();
  if (byId[id]) delete byId[id];
  await backend.removeItem(entryKey(id));
  await reindex(byId);
}

/**
 * Persist the learning stage reached for a not-yet-memorised set, so the drill
 * can resume from it next session instead of restarting at stage 1. Clamped to
 * [1, MAX_STAGE]. No-op for memorised sets (stage is irrelevant once memorised)
 * or when the stage hasn't changed. Returns the updated entry.
 */
export async function saveStage(id, stage) {
  const entry = await getEntry(id);
  if (!entry || entry.status !== STATUS.NOT_MEMORISED) return entry;

  const clamped = Math.min(MAX_STAGE, Math.max(1, Number(stage) || 1));
  if (entry.stage === clamped) return entry;

  const updated = { ...entry, stage: clamped };
  const byId = await loadAllEntries();
  byId[id] = updated;
  await backend.setItem(entryKey(id), updated);
  await reindex(byId);
  return updated;
}

/**
 * Promote a set to "memorised". Called when the user completes the final
 * learning stage (stage 3) in-session. No-op if the set is already memorised.
 * Returns the updated entry.
 */
export async function markMemorised(id) {
  const entry = await getEntry(id);
  if (!entry || entry.status !== STATUS.NOT_MEMORISED) return entry;

  const updated = {
    ...entry,
    status: STATUS.MEMORISED,
    lastPractisedAt: new Date().toISOString(),
  };

  const byId = await loadAllEntries();
  byId[id] = updated;
  await backend.setItem(entryKey(id), updated);
  await reindex(byId);
  return updated;
}

/**
 * Record one memorised attempt. Per spec, an attempt over any number of verses
 * counts as a SINGLE result: success only if every verse was perfect.
 * Success updates lastSuccessAt (which moves the set to the bottom of the list).
 * No-op unless the set is memorised. Returns the updated entry.
 */
export async function recordAttempt(id, { success }) {
  const entry = await getEntry(id);
  if (!entry || entry.status !== STATUS.MEMORISED) return entry;

  // Back-fill `failures` for entries created before it was tracked, so counts
  // stay consistent regardless of when the set was added.
  const priorFailures =
    typeof entry.failures === "number"
      ? entry.failures
      : Math.max(0, (entry.attempts || 0) - (entry.successes || 0));

  const attemptedAt = new Date().toISOString();
  const updated = {
    ...entry,
    attempts: entry.attempts + 1,
    successes: entry.successes + (success ? 1 : 0),
    failures: priorFailures + (success ? 0 : 1),
    lastSuccessAt: success ? attemptedAt : entry.lastSuccessAt,
    lastPractisedAt: attemptedAt,
  };

  const byId = await loadAllEntries();
  byId[id] = updated;
  await backend.setItem(entryKey(id), updated);
  await reindex(byId);
  return updated;
}

/**
 * Re-sort the whole memory list against the CURRENT prioritisation prefs and
 * persist the new order. Call this after changing prefs (memoryPrefsStore) so
 * the Memory tab reflects the new ranking immediately. Returns the new index.
 */
export async function resortMemory() {
  const byId = await loadAllEntries();
  return reindex(byId);
}
