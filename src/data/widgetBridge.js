// widgetBridge.js
// Syncs app data → Android SharedPreferences so the home screen widgets
// can read it without launching the full React Native app.
//
// Call syncWidgetData() whenever the app comes to the foreground or
// any of the underlying data changes (prayer logged, chapter read, etc.).
// On non-Android platforms this is a no-op.

import { Platform, NativeModules } from "react-native";
import {
  getActivePrayers,
  getPrayerSettings,
  getDailySeconds,
  isDue,
  msUntilDue,
} from "./prayerStore";
import { getLastPosition } from "./lastPositionStore";
import {
  getMemoryList,
  referenceLabel,
  successCount,
  getMemorySettings,
  getDailyReviewCount,
  STATUS,
} from "./memoryStore";
import { BOOKS, nextChapter } from "./books";
import { getChapterVerses } from "./verses";
import { getHistoryPage } from "./historyStore";
import {
  getRangeSetting,
  getGoalDate,
  computeGoalPace,
  resolveBounds,
} from "./statsSettingsStore";
import { getAllBooksProgress, todayDateString } from "./progressStore";
import { subscribeStorage } from "./storageBackend";

// The SharedPreferences file name — must match what the Kotlin widgets read.
const PREFS_NAME = "bible_widget_data";

// ---------------------------------------------------------------------------
// Native bridge — writes a flat string/int map to SharedPreferences.
// We use a tiny custom native module (WidgetBridgeModule) rather than
// AsyncStorage because widgets can only read SharedPreferences, not the
// AsyncStorage SQLite/files that React Native uses.
// ---------------------------------------------------------------------------
const WidgetBridge = NativeModules.WidgetBridge ?? null;

// Serialised copy of the last payload handed to the native bridge, used to
// suppress no-op updates (see writeToSharedPrefs).
let _lastPayload = null;

/**
 * Write key→value pairs to SharedPreferences and trigger a widget update.
 * No-op on iOS or if the native module isn't available.
 *
 * Identical payloads are dropped without touching the bridge. This matters
 * more than it looks: the Android framework rate-limits app widget updates,
 * and once that limit is hit it defers or discards them — so a burst of
 * redundant refreshes doesn't just waste work, it actively stops the widget
 * from redrawing. Most syncs produce no visible change (scrolling rewrites the
 * reading position several times a second, and the periodic tick usually finds
 * nothing new), so without this guard the genuine updates get crowded out.
 *
 * Pass `force` to push regardless. Handing a payload to the bridge is not a
 * guarantee the widget redrew — the framework may still have dropped that
 * update — so treating "sent" as "displayed" would strand the widget on stale
 * content until the next data change. A periodic forced push repairs that.
 *
 * @param {Record<string, string|number|boolean>} data
 * @param {{ force?: boolean }} [options]
 */
async function writeToSharedPrefs(data, { force = false } = {}) {
  if (Platform.OS !== "android" || !WidgetBridge) return;

  const payload = JSON.stringify(data);
  if (!force && payload === _lastPayload) return;

  try {
    await WidgetBridge.syncWidgetData(data);
    _lastPayload = payload;
  } catch (e) {
    // Widget sync is best-effort — never crash the app. Leave _lastPayload
    // alone so the next attempt retries rather than assuming this one landed.
    console.warn("[widgetBridge] syncWidgetData failed:", e?.message);
  }
}

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

/** Count how many unique chapters across all books were read today. */
async function countChaptersReadToday(bookIds) {
  const today = todayDateString();
  const allProgress = await getAllBooksProgress(bookIds);
  let count = 0;
  for (const chapters of Object.values(allProgress)) {
    for (const rec of Object.values(chapters)) {
      if (rec && Array.isArray(rec.dates) && rec.dates.includes(today)) {
        count += 1;
      }
    }
  }
  return count;
}

/**
 * Format a stored timestamp as a local "YYYY-MM-DD" date.
 *
 * Deliberately local (not UTC) and in the same zero-padded shape as
 * progressStore.todayDateString(), because the Kotlin side compares these as
 * plain strings and subtracts them from *its* local today to say how long ago
 * something happened.
 *
 * @returns {string} the date, or "" when there's no usable timestamp.
 */
function localDateString(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Resolve a bookId to its display name. */
function bookName(bookId) {
  return BOOKS.find((b) => b.id === bookId)?.name ?? bookId;
}

/**
 * Work out what the user should read next.
 *
 * Reading history is the authority here rather than the saved reader position:
 * the position is wherever they last *navigated*, which includes chapters they
 * only skimmed or opened by accident, whereas history records chapters they
 * explicitly marked read (most recent first). So the target is the chapter
 * following the last one they finished.
 *
 * Falls back to the saved position when there's nothing suitable — no history
 * yet, or they've finished Revelation and there is no next chapter.
 *
 * @returns {Promise<{bookId: string, chapterNumber: number} | null>}
 */
async function resolveContinueReading() {
  try {
    const { entries } = await getHistoryPage(1);
    const lastRead = entries?.[0];
    if (lastRead) {
      const next = nextChapter(lastRead.bookId, lastRead.chapterNumber);
      if (next) return next;
    }
  } catch {
    // History is a nicety here — fall through to the saved position.
  }

  const position = await getLastPosition();
  if (position?.bookId && position?.chapterNumber) {
    return { bookId: position.bookId, chapterNumber: position.chapterNumber };
  }
  return null;
}

/**
 * Build a plain-text snippet of the first verses of a chapter,
 * numbered inline (e.g. "¹In the beginning God created...  ²Now the earth...").
 * Stops adding verses once the total length exceeds maxChars.
 */
function buildVerseSnippet(bookId, chapterNumber, maxChars = 400) {
  if (!bookId || !chapterNumber) return "";
  try {
    const verses = getChapterVerses(bookId, chapterNumber);
    if (!verses || verses.length === 0) return "";
    const SUPERSCRIPTS = "⁰¹²³⁴⁵⁶⁷⁸⁹";
    function toSuperscript(n) {
      return String(n).split("").map((d) => SUPERSCRIPTS[parseInt(d)] ?? d).join("");
    }
    let result = "";
    for (const v of verses) {
      const piece = toSuperscript(v.verse) + v.text + " ";
      if (result.length + piece.length > maxChars) break;
      result += piece;
    }
    return result.trimEnd();
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Main sync entry point
// ---------------------------------------------------------------------------

/**
 * Gather data from all stores and push to SharedPreferences.
 * Safe to call frequently — exits early on non-Android.
 */
export async function syncWidgetData({ force = false } = {}) {
  if (Platform.OS !== "android" || !WidgetBridge) return;

  try {
    const bookIds = BOOKS.map((b) => b.id);

    const [
      prayers,
      prayerSettings,
      doneSecs,
      continueAt,
      memoryList,
      memorySettings,
      versesReviewedToday,
      rangeSetting,
      goalDate,
      chaptersToday,
    ] = await Promise.all([
      getActivePrayers(),
      getPrayerSettings(),
      getDailySeconds(),
      resolveContinueReading(),
      getMemoryList(),
      getMemorySettings(),
      getDailyReviewCount(),
      getRangeSetting(),
      getGoalDate(),
      countChaptersReadToday(bookIds),
    ]);

    // ── Prayer widget ──────────────────────────────────────────────────────
    // Mirror the Prayer tab: it splits the (already ordered) active list into
    // "Ready to pray" and "Resting", so surface the top of "Ready to pray".
    // When nothing is off cooldown, fall back to whichever frees up soonest and
    // flag it as resting so the widget can say so instead of implying it's due.
    const now = Date.now();
    const topPrayer = prayers.find((p) => isDue(p, now)) ?? prayers[0] ?? null;
    const topPrayerDue = topPrayer ? isDue(topPrayer, now) : false;
    const topPrayerWaitMins = topPrayer && !topPrayerDue
      ? Math.ceil(msUntilDue(topPrayer, now) / 60000)
      : 0;

    // ── Bible widget ───────────────────────────────────────────────────────
    const pos = continueAt ?? {};
    const totalChapters = BOOKS.reduce((s, b) => s + b.chapterCount, 0); // 1,189
    const bounds = resolveBounds(rangeSetting);
    const today = todayDateString();

    // Count chapters read in the active date range for goal pace
    const allProgress = await getAllBooksProgress(bookIds);
    let readInRange = 0;
    for (const chapters of Object.values(allProgress)) {
      for (const rec of Object.values(chapters)) {
        if (!rec || !Array.isArray(rec.dates)) continue;
        const counted = rec.dates.filter((d) => {
          if (bounds.from && d < bounds.from) return false;
          if (bounds.to && d > bounds.to) return false;
          return true;
        });
        if (counted.length > 0) readInRange += 1;
      }
    }

    const pace = computeGoalPace({
      setting: rangeSetting,
      goalDate,
      readChapterCount: readInRange,
      totalChapters,
    });

    // ── Memory widget ──────────────────────────────────────────────────────
    // The widget surfaces the REVIEW queue, so only memorised sets qualify.
    // `memoryList` is ordered "Not Memorised" first, then memorised ranked
    // weakest-first, so skipping the not-memorised group and taking the first
    // remaining entry gives the verse most in need of review. Sets still being
    // learned are deliberately ignored — they belong in the Memory tab, not on
    // a "review this next" widget — and when nothing is memorised yet the
    // widget falls back to its empty state.
    const topMemory =
      memoryList.find((e) => e && e.status === STATUS.MEMORISED) ?? null;
    const memoryRef = topMemory ? referenceLabel(topMemory) : "";
    const memoryText =
      topMemory && topMemory.verses && topMemory.verses.length > 0
        ? topMemory.verses[0].text ?? ""
        : "";
    // Mirrors the Memory tab's row meta: when it was last practised (falling
    // back to the last success for entries saved before practice was tracked)
    // and how many times it has been recalled. Sent as a plain local date
    // rather than a pre-rendered "3d ago" string so the widget can keep the
    // phrasing honest as days pass between syncs.
    const memoryLastReviewed = topMemory
      ? localDateString(topMemory.lastPractisedAt || topMemory.lastSuccessAt)
      : "";
    const memoryReviewCount = topMemory ? successCount(topMemory) : 0;

    // ── Write all data in one call ─────────────────────────────────────────
    await writeToSharedPrefs({
      // The local date this snapshot was taken. Daily counters below ("read
      // today", "prayed today") are only meaningful on this date — the widgets
      // compare it against the current date and zero them out once it rolls
      // over, so a widget left untouched overnight doesn't show yesterday's
      // numbers as if they were today's.
      widget_sync_date: today,

      // Prayer
      widget_prayer_name: topPrayer?.name ?? "",
      widget_prayer_id: topPrayer?.id ?? "",
      widget_prayer_goal_seconds: prayerSettings.dailyGoalSeconds ?? 600,
      widget_prayer_done_seconds: doneSecs ?? 0,
      widget_prayer_is_due: topPrayerDue,
      widget_prayer_wait_mins: topPrayerWaitMins,

      // Bible
      widget_bible_book_id: pos.bookId ?? "",
      widget_bible_book_name: pos.bookId ? bookName(pos.bookId) : "",
      widget_bible_chapter: pos.chapterNumber ?? 0,
      widget_bible_chapters_today: chaptersToday,
      widget_bible_chapters_per_day: pace.applicable ? (pace.perDay ?? 0) : 0,
      widget_bible_has_goal: pace.applicable && !!goalDate,
      widget_bible_verse_snippet: buildVerseSnippet(pos.bookId, pos.chapterNumber),

      // Memory
      widget_memory_id: topMemory?.id ?? "",
      widget_memory_reference: memoryRef,
      widget_memory_text: memoryText,
      widget_memory_last_reviewed: memoryLastReviewed,
      widget_memory_review_count: memoryReviewCount,
      widget_memory_goal_verses: memorySettings.dailyGoalVerses ?? 0,
      widget_memory_done_verses: versesReviewedToday ?? 0,
    }, { force });
  } catch (e) {
    console.warn("[widgetBridge] sync error:", e?.message);
  }
}

// ---------------------------------------------------------------------------
// Automatic syncing
// ---------------------------------------------------------------------------

// Storage keys whose contents feed a widget. Everything else the app persists
// (theme, reader prefs, open tabs, scroll offsets, sermon playback, ...) has no
// bearing on what the widgets display, so writes to those are ignored rather
// than triggering a needless re-read of every store.
const WIDGET_RELEVANT_KEY_PREFIXES = Object.freeze([
  "progress:",    // chapters read  → Bible widget
  "history:",     // last chapter finished → Bible widget "continue reading"
  "prayer:",      // points, logs, settings → Prayer widget
  "memory:",      // memory verses  → Memory widget
  "stats:",       // date range + goal date → Bible widget goal pace
  "lastPosition", // fallback reading position → Bible widget
]);

function affectsWidgets(key) {
  return (
    typeof key === "string" &&
    WIDGET_RELEVANT_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
}

/**
 * Keep the widgets in step with app data for as long as the app is running.
 *
 * Two things can change what a widget should show:
 *
 * 1. **Writes.** Every store persists through the shared storage backend, so
 *    observing that one choke point catches all relevant changes — praying a
 *    point, marking a chapter read, adding a memory verse, moving the reading
 *    goal — without each store needing to know widgets exist.
 *
 * 2. **The passage of time.** Both "top of the list" selections are computed
 *    against the current instant and reorder on their own with no write at
 *    all: memory sets are sorted by a spaced-repetition score that decays as
 *    days pass, and a prayer point becomes due the moment its cooldown
 *    elapses. A write-only trigger would leave the widget advertising an item
 *    that is no longer the highest priority, so we also re-sync periodically.
 *
 * Writes are coalesced on a short timer: a single user action often produces
 * several writes (e.g. recording a prayer session updates the point, the daily
 * log and the log index), and each sync re-reads every store to build the
 * snapshot. Debouncing collapses that burst into one pass while still landing
 * well inside the time it takes to leave the app and look at the home screen.
 *
 * @param {{ debounceMs?: number, intervalMs?: number }} [options]
 * @returns {() => void} Stop syncing.
 */
export function startWidgetAutoSync({
  debounceMs = 800,
  intervalMs = 60 * 1000,
} = {}) {
  if (Platform.OS !== "android" || !WidgetBridge) return () => {};

  let timer = null;

  const unsubscribe = subscribeStorage((key) => {
    if (!affectsWidgets(key)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      syncWidgetData();
    }, debounceMs);
  });

  // Catches purely time-driven reordering (see note above). A minute is fine
  // resolution for cooldowns measured in hours and decay measured in days,
  // and mirrors the 30s re-render the Prayer tab already does for the same
  // reason.
  //
  // Forced, so it doubles as a repair pass: a write-triggered sync that the
  // framework dropped leaves the widget stale with a payload we've already
  // recorded as sent, and only an unconditional push can recover from that.
  const ticker = setInterval(() => syncWidgetData({ force: true }), intervalMs);

  return () => {
    if (timer) clearTimeout(timer);
    clearInterval(ticker);
    unsubscribe();
  };
}
