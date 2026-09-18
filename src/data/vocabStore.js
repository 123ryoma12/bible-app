// Greek vocabulary store — persists per-word scores and user pack selections.
//
// Score shape per word id:
//   { correct: number, total: number, lastSeen: number (timestamp) }
//
// Prefs shape:
//   { selectedPacks: number[], hideKnown: boolean }
//   selectedPacks: array of pack numbers the user has added (e.g. [1, 2])
//   hideKnown: if true, words with score >= 90% are excluded from drills

import AsyncStorage from "@react-native-async-storage/async-storage";

const SCORES_KEY    = "vocab:scores";
const PREFS_KEY     = "vocab:prefs";
const SETTINGS_KEY  = "vocab:settings";
const TODAY_KEY     = "vocab:today";
const HISTORY_KEY   = "vocab:history"; // { "2026-09-18": 12, ... }

// ── Daily goal ─────────────────────────────────────────────────────────────────

export async function getVocabSettings() {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return { dailyGoalCards: parsed.dailyGoalCards ?? 0 };
  } catch {
    return { dailyGoalCards: 0 };
  }
}

export async function setVocabSettings(patch) {
  const current = await getVocabSettings();
  const next = { ...current, ...patch };
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

export async function getTodayCardCount() {
  try {
    const raw = await AsyncStorage.getItem(TODAY_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const today = new Date().toISOString().slice(0, 10);
    return parsed.date === today ? (parsed.count ?? 0) : 0;
  } catch {
    return 0;
  }
}

export async function incrementTodayCardCount() {
  const today = new Date().toISOString().slice(0, 10);
  try {
    // Update today's running count
    const raw = await AsyncStorage.getItem(TODAY_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const count = parsed.date === today ? (parsed.count ?? 0) + 1 : 1;
    await AsyncStorage.setItem(TODAY_KEY, JSON.stringify({ date: today, count }));

    // Also persist into the history map so the chart can read it
    const histRaw = await AsyncStorage.getItem(HISTORY_KEY);
    const hist = histRaw ? JSON.parse(histRaw) : {};
    hist[today] = count;
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(hist));

    return count;
  } catch {
    return 0;
  }
}

/** Return the last `days` days of card counts as [{ date, cards }] oldest-first. */
export async function getDailyCardHistory(days = 14) {
  try {
    const histRaw = await AsyncStorage.getItem(HISTORY_KEY);
    const hist = histRaw ? JSON.parse(histRaw) : {};
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const date = d.toISOString().slice(0, 10);
      result.push({ date, cards: hist[date] ?? 0 });
    }
    return result;
  } catch {
    return [];
  }
}

const DEFAULT_PREFS = {
  selectedPacks: [1],
  hideKnown: false,
  hideKnownThreshold: 90, // percentage — words >= this score are hidden when hideKnown is true
};

// ── Scores ────────────────────────────────────────────────────────────────────

let _scoresCache = null;

async function loadScores() {
  if (_scoresCache) return _scoresCache;
  try {
    const raw = await AsyncStorage.getItem(SCORES_KEY);
    _scoresCache = raw ? JSON.parse(raw) : {};
  } catch {
    _scoresCache = {};
  }
  return _scoresCache;
}

async function saveScores(scores) {
  _scoresCache = scores;
  try {
    await AsyncStorage.setItem(SCORES_KEY, JSON.stringify(scores));
  } catch {}
}

/** Get all scores: { [wordId]: { correct, total, lastSeen } } */
export async function getAllScores() {
  return loadScores();
}

/** Get score for a single word id. Returns { correct:0, total:0 } if unseen. */
export async function getWordScore(wordId) {
  const scores = await loadScores();
  return scores[wordId] ?? { correct: 0, total: 0, lastSeen: null };
}

/** Record a drill result for a word. */
export async function recordResult(wordId, correct) {
  const scores = await loadScores();
  const prev = scores[wordId] ?? { correct: 0, total: 0 };
  scores[wordId] = {
    correct: prev.correct + (correct ? 1 : 0),
    total: prev.total + 1,
    lastSeen: Date.now(),
  };
  await saveScores(scores);
}

/** Reset scores for all words (or a specific list of ids). */
export async function resetScores(wordIds = null) {
  const scores = await loadScores();
  if (wordIds) {
    for (const id of wordIds) delete scores[id];
  } else {
    _scoresCache = {};
    await saveScores({});
    return;
  }
  await saveScores(scores);
}

/** Percentage score 0–100 for a word. Returns null if never seen. */
export function wordScorePct(score) {
  if (!score || score.total === 0) return null;
  return Math.round((score.correct / score.total) * 100);
}

/** True if the word is "known well" (>= threshold %). */
export function isKnownWell(score, threshold = 90) {
  const pct = wordScorePct(score);
  return pct !== null && pct >= threshold;
}

// ── Prefs ─────────────────────────────────────────────────────────────────────

let _prefsCache = null;

export async function getVocabPrefs() {
  if (_prefsCache) return _prefsCache;
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    _prefsCache = raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : { ...DEFAULT_PREFS };
  } catch {
    _prefsCache = { ...DEFAULT_PREFS };
  }
  return _prefsCache;
}

export async function setVocabPrefs(partial) {
  const prefs = await getVocabPrefs();
  _prefsCache = { ...prefs, ...partial };
  try {
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(_prefsCache));
  } catch {}
  return _prefsCache;
}

/** Toggle a pack in/out of selectedPacks. Returns updated prefs. */
export async function togglePack(packNum) {
  const prefs = await getVocabPrefs();
  const selected = prefs.selectedPacks || [];
  const next = selected.includes(packNum)
    ? selected.filter((p) => p !== packNum)
    : [...selected, packNum].sort((a, b) => a - b);
  return setVocabPrefs({ selectedPacks: next });
}
