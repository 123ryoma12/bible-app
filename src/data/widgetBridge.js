// widgetBridge.js
// Syncs app data → Android SharedPreferences so the home screen widgets
// can read it without launching the full React Native app.
//
// Call syncWidgetData() whenever the app comes to the foreground or
// any of the underlying data changes (prayer logged, chapter read, etc.).
// On non-Android platforms this is a no-op.

import { Platform, NativeModules } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { getActivePrayers, getPrayerSettings, getDailySeconds } from "./prayerStore";
import { getLastPosition } from "./lastPositionStore";
import { getMemoryList, referenceLabel } from "./memoryStore";
import { BOOKS } from "./books";
import {
  getRangeSetting,
  getGoalDate,
  computeGoalPace,
  resolveBounds,
} from "./statsSettingsStore";
import { getAllBooksProgress, todayDateString } from "./progressStore";

// The SharedPreferences file name — must match what the Kotlin widgets read.
const PREFS_NAME = "bible_widget_data";

// ---------------------------------------------------------------------------
// Native bridge — writes a flat string/int map to SharedPreferences.
// We use a tiny custom native module (WidgetBridgeModule) rather than
// AsyncStorage because widgets can only read SharedPreferences, not the
// AsyncStorage SQLite/files that React Native uses.
// ---------------------------------------------------------------------------
const WidgetBridge = NativeModules.WidgetBridge ?? null;

/**
 * Write key→value pairs to SharedPreferences and trigger a widget update.
 * No-op on iOS or if the native module isn't available.
 *
 * @param {Record<string, string|number|boolean>} data
 */
async function writeToSharedPrefs(data) {
  if (Platform.OS !== "android" || !WidgetBridge) return;
  try {
    await WidgetBridge.syncWidgetData(data);
  } catch (e) {
    // Widget sync is best-effort — never crash the app.
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

/** Resolve a bookId to its display name. */
function bookName(bookId) {
  return BOOKS.find((b) => b.id === bookId)?.name ?? bookId;
}

// ---------------------------------------------------------------------------
// Main sync entry point
// ---------------------------------------------------------------------------

/**
 * Gather data from all stores and push to SharedPreferences.
 * Safe to call frequently — exits early on non-Android.
 */
export async function syncWidgetData() {
  if (Platform.OS !== "android" || !WidgetBridge) return;

  try {
    const bookIds = BOOKS.map((b) => b.id);

    const [
      prayers,
      prayerSettings,
      doneSecs,
      lastPosition,
      memoryList,
      rangeSetting,
      goalDate,
      chaptersToday,
    ] = await Promise.all([
      getActivePrayers(),
      getPrayerSettings(),
      getDailySeconds(),
      getLastPosition(),
      getMemoryList(),
      getRangeSetting(),
      getGoalDate(),
      countChaptersReadToday(bookIds),
    ]);

    // ── Prayer widget ──────────────────────────────────────────────────────
    const topPrayer = prayers[0] ?? null;

    // ── Bible widget ───────────────────────────────────────────────────────
    const pos = lastPosition ?? {};
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
    const topMemory = memoryList[0] ?? null;
    const memoryRef = topMemory ? referenceLabel(topMemory) : "";
    const memoryText =
      topMemory && topMemory.verses && topMemory.verses.length > 0
        ? topMemory.verses[0].text ?? ""
        : "";

    // ── Write all data in one call ─────────────────────────────────────────
    await writeToSharedPrefs({
      // Prayer
      widget_prayer_name: topPrayer?.name ?? "",
      widget_prayer_id: topPrayer?.id ?? "",
      widget_prayer_goal_seconds: prayerSettings.dailyGoalSeconds ?? 600,
      widget_prayer_done_seconds: doneSecs ?? 0,

      // Bible
      widget_bible_book_id: pos.bookId ?? "",
      widget_bible_book_name: pos.bookId ? bookName(pos.bookId) : "",
      widget_bible_chapter: pos.chapterNumber ?? 0,
      widget_bible_chapters_today: chaptersToday,
      widget_bible_chapters_per_day: pace.applicable ? (pace.perDay ?? 0) : 0,
      widget_bible_has_goal: pace.applicable && !!goalDate,

      // Memory
      widget_memory_reference: memoryRef,
      widget_memory_text: memoryText,
    });
  } catch (e) {
    console.warn("[widgetBridge] sync error:", e?.message);
  }
}
