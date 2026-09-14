import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, memo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Platform,
} from "react-native";
import { uiFont } from "../theme/fonts";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { BOOKS } from "../data/books";
import { ALL_CHAPTERS } from "../data/chapterIndex";
import { getAllBooksProgress, subscribeProgress, getProgressCacheSync } from "../data/progressStore";
import {
  RANGE_MODES,
  getRangeSetting,
  setRangeSetting,
  resolveBounds,
  makeDateInRange,
  formatDisplayDate,
  setGoalDate,
  getRangeSettingSync,
  getGoalDateSync,
} from "../data/statsSettingsStore";
import { useTheme } from "../theme/ThemeContext";

const SCREEN_PADDING = 20;
const TOTAL_CHAPTERS = ALL_CHAPTERS.filter((c) => !c.isIntroCell).length; // 1,189
const BOX_GAP = 3; // gap between cells (applied as marginRight + marginBottom)

function computeBoxMetrics(containerWidth) {
  // containerWidth is the actual measured ScrollView width.
  // The grid has paddingHorizontal: SCREEN_PADDING on each side.
  const available = Math.floor(containerWidth - 2 * SCREEN_PADDING);
  const numCols = Math.floor((available + BOX_GAP) / (36 + BOX_GAP));
  // Floor boxSize so it's always a whole pixel — avoids sub-pixel rounding
  // that causes the last box in a row to wrap to the next line.
  const boxSize = Math.floor((available - BOX_GAP * (numCols - 1)) / numCols);
  return { boxSize, numCols };
}

// Read colour — shown for any chapter that has been read within the range.
const READ_COLOR_LIGHT = "hsl(37, 82%, 54%)";
const READ_COLOR_DARK  = "hsl(37, 75%, 48%)";

// Compute the y-offset of a chapter cell mathematically from its index,
// the number of columns, and the cell size. Used for FlatList getItemLayout
// and for scroll-to-chapter — no onLayout callbacks needed.
// FlatList with numColumns renders one ROW per item index, so:
//   rowIndex = Math.floor(itemIndex / numCols)
//   rowHeight = boxSize + BOX_GAP
function computeCellOffset(itemIndex, numCols, boxSize) {
  const rowIndex = Math.floor(itemIndex / numCols);
  return rowIndex * (boxSize + BOX_GAP) + BOX_GAP; // +BOX_GAP for paddingTop
}

// ---------------------------------------------------------------------------
// HeatCell — one chapter square. Memoized so only cells whose props actually
// changed re-render when progress updates, theme changes, or the current
// chapter moves.
// ---------------------------------------------------------------------------
const HeatCell = memo(function HeatCell({
  item, readSet, isDark, isCurrent, boxSize, isLastInRow,
  // Individual color values instead of the whole colors object — lets memo's
  // shallow-equality check work even when the colors object reference changes.
  colorSurface, colorAccent, colorBorder, colorText, colorMutedText,
  onPress,
}) {
  const isRead = !item.isIntroCell && readSet.has(`${item.bookId}:${item.chapterNumber}`);
  const bg = isRead ? (isDark ? READ_COLOR_DARK : READ_COLOR_LIGHT) : null;
  const handlePress = useCallback(() => {
    onPress(item.bookId, item.chapterNumber, item.isIntroCell);
  }, [onPress, item.bookId, item.chapterNumber, item.isIntroCell]);
  const introBg = item.isIntroCell
    ? isCurrent
      ? colorAccent
      : colorAccent + "28"  // 16% opacity tint
    : null;

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.65}
      style={[
        item.isIntroCell ? styles.heatBoxIntro : styles.heatBox,
        {
          width: boxSize,
          height: boxSize,
          marginRight: isLastInRow ? 0 : BOX_GAP,
          backgroundColor: introBg || bg || colorSurface,
          borderWidth: item.isIntroCell ? 1.5 : 2,
          borderColor: isCurrent
            ? colorAccent
            : item.isIntroCell
              ? colorAccent + "60"
              : bg
                ? "transparent"
                : colorBorder,
        },
      ]}
    >
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        style={[
          item.isIntroCell ? styles.heatLabelBook : styles.heatLabel,
          {
            color: isCurrent && item.isIntroCell
              ? "#fff"
              : bg
                ? "#1a1206"
                : item.isIntroCell
                  ? colorAccent
                  : colorMutedText,
          },
        ]}
      >
        {item.isIntroCell ? item.bookId : item.chapterNumber}
      </Text>
    </TouchableOpacity>
  );
}, (prev, next) => {
  // Custom comparator — only re-render if something this cell actually
  // displays has changed. Critically, we compare the *result* of the
  // readSet lookup rather than the Set reference itself, so marking one
  // chapter read only re-renders that single cell instead of all 1,189.
  const prevRead = prev.readSet.has(`${prev.item.bookId}:${prev.item.chapterNumber}`);
  const nextRead = next.readSet.has(`${next.item.bookId}:${next.item.chapterNumber}`);
  return (
    prevRead === nextRead &&
    prev.isCurrent === next.isCurrent &&
    prev.boxSize === next.boxSize &&
    prev.isLastInRow === next.isLastInRow &&
    prev.isDark === next.isDark &&
    prev.colorSurface === next.colorSurface &&
    prev.colorAccent === next.colorAccent &&
    prev.colorBorder === next.colorBorder &&
    prev.colorText === next.colorText &&
    prev.colorMutedText === next.colorMutedText &&
    prev.onPress === next.onPress
  );
});

// ---------------------------------------------------------------------------
// HeatRow — one row of numCols cells, rendered as a single FlatList item.
// Grouping cells into rows means FlatList manages ~100 items instead of 1,189,
// dramatically reducing item-level overhead while windowing still applies.
// ---------------------------------------------------------------------------
const HeatRow = memo(function HeatRow({
  row, readSet, isDark, numCols, boxSize,
  colorSurface, colorAccent, colorBorder, colorText, colorMutedText,
  onPress, currentChapter,
}) {
  return (
    <View style={styles.heatRowFlex}>
      {row.map((item, colIndex) => {
        const isCurrent =
          currentChapter &&
          currentChapter.bookId === item.bookId &&
          currentChapter.chapterNumber === item.chapterNumber;
        const isLastInRow = colIndex === row.length - 1;
        return (
          <HeatCell
            key={`${item.bookId}-${item.chapterNumber}`}
            item={item}
            readSet={readSet}
            isDark={isDark}
            isCurrent={isCurrent}
            boxSize={boxSize}
            isLastInRow={isLastInRow}
            colorSurface={colorSurface}
            colorAccent={colorAccent}
            colorBorder={colorBorder}
            colorText={colorText}
            colorMutedText={colorMutedText}
            onPress={onPress}
          />
        );
      })}
    </View>
  );
}, (prev, next) => {
  // Re-render only if the current-chapter highlight or read state changed for
  // any cell in this row, or if layout/theme props changed.
  if (
    prev.boxSize !== next.boxSize ||
    prev.numCols !== next.numCols ||
    prev.isDark !== next.isDark ||
    prev.colorSurface !== next.colorSurface ||
    prev.colorAccent !== next.colorAccent ||
    prev.colorBorder !== next.colorBorder ||
    prev.colorText !== next.colorText ||
    prev.colorMutedText !== next.colorMutedText ||
    prev.onPress !== next.onPress ||
    prev.row !== next.row
  ) return false;
  // Check if current-chapter highlight changed for any cell in this row.
  const prevCurrent = prev.currentChapter;
  const nextCurrent = next.currentChapter;
  const currentChanged = prevCurrent?.bookId !== nextCurrent?.bookId ||
    prevCurrent?.chapterNumber !== nextCurrent?.chapterNumber;
  if (currentChanged) {
    const rowItems = prev.row;
    const anyInRow = rowItems.some(
      (item) =>
        (prevCurrent && prevCurrent.bookId === item.bookId && prevCurrent.chapterNumber === item.chapterNumber) ||
        (nextCurrent && nextCurrent.bookId === item.bookId && nextCurrent.chapterNumber === item.chapterNumber)
    );
    if (anyInRow) return false;
  }
  // Check if read state changed for any cell in this row.
  for (const item of prev.row) {
    const key = `${item.bookId}:${item.chapterNumber}`;
    if (prev.readSet.has(key) !== next.readSet.has(key)) return false;
  }
  return true;
});


export default function StatsScreen({ onOpenChapter, initialChapter, currentChapter, onBack, onOpenHistory, onReady, gridVisible = true, containerWidth = 0 }) {
  const { colors, mode } = useTheme();
  const isDark = mode === "dark";

  // Initialise synchronously from the preloaded cache — if App.js fired
  // preloadAllProgress + preloadStatsSettings at startup these will already
  // have values and the spinner is never shown.
  const [progressByBook, setProgressByBook] = useState(() => {
    const c = getProgressCacheSync();
    return Object.keys(c).length > 0 ? c : null;
  });
  const [rangeSetting, setRangeSettingState] = useState(() => getRangeSettingSync());
  const [goalDate, setGoalDateState] = useState(() => getGoalDateSync());

  const [rangeModalOpen, setRangeModalOpen] = useState(false);
  const [goalModalOpen, setGoalModalOpen] = useState(false);

  // Initialise from containerWidth passed by App.js (via useWindowDimensions)
  // so the grid is ready to render immediately without waiting for onLayout.
  // onLayout still fires when the view is visible and will correct the value
  // if it ever differs (e.g. orientation change or safe-area adjustment).
  const [gridWidth, setGridWidth] = useState(containerWidth);
  const { boxSize, numCols } = computeBoxMetrics(gridWidth);

  // Ref to the heat-map FlatList for imperative scrolling.
  const flatListRef = useRef(null);
  // Track which initialChapter we've already scrolled to so we don't repeat it.
  const scrolledToChapter = useRef(null);

  // Subscribe to cache updates (chapter marked read in reader) and fall back
  // to async loads if the cache wasn't warm yet on first render.
  useEffect(() => {
    if (!progressByBook) {
      getAllBooksProgress(BOOKS.map((b) => b.id)).then(setProgressByBook);
    }
    if (!rangeSetting) {
      getRangeSetting().then(setRangeSettingState);
    }
    const unsub = subscribeProgress((snapshot, changedBookId) => {
      if (changedBookId) {
        // Single-book update: merge only the changed book into the existing
        // snapshot so the readSet memo only re-walks that one book's chapters.
        setProgressByBook((prev) => prev ? { ...prev, [changedBookId]: snapshot[changedBookId] } : snapshot);
      } else {
        // Full reload (e.g. backup restore) — replace everything.
        setProgressByBook(snapshot);
      }
    });
    return unsub;
  }, []);

  // When initialChapter changes, scroll to it and signal ready. Offsets are
  // computed mathematically from boxSize + numCols — no onLayout cache needed.
  // We wait until boxSize > 0 (gridWidth measured) before scrolling.
  useLayoutEffect(() => {
    if (!initialChapter) {
      onReady?.();
      return;
    }
    const key = `${initialChapter.bookId}:${initialChapter.chapterNumber}`;
    if (scrolledToChapter.current === key) {
      onReady?.();
      return;
    }
    scrolledToChapter.current = key;

    if (boxSize <= 0 || numCols <= 0) {
      return;
    }

    const itemIndex = ALL_CHAPTERS.findIndex(
      (c) => !c.isIntroCell && c.bookId === initialChapter.bookId && c.chapterNumber === initialChapter.chapterNumber
    );
    if (itemIndex === -1) { onReady?.(); return; }

    // itemIndex is a chapter index; convert to row index for FlatList.
    const rowIndex = Math.floor(itemIndex / numCols);
    const rowHeight = boxSize + BOX_GAP;
    const y = rowIndex * rowHeight + BOX_GAP;
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToOffset({ offset: Math.max(0, y - 16), animated: false });
      onReady?.();
    });
  }, [initialChapter, boxSize, numCols]);

  const applyGoalDate = useCallback((next) => {
    setGoalDateState(next);
    setGoalDate(next);
  }, []);

  const applyRangeSetting = useCallback((next) => {
    setRangeSettingState(next);
    setRangeSetting(next);
  }, []);

  // Refs used by the surgical readSet patch below — must be declared before
  // the useMemo that references them.
  const prevProgressRef = useRef(null);
  const readSetRef = useRef(null);

  // Set of "bookId:chapterNumber" keys for chapters read within the selected
  // range. On initial build or range change: full rebuild across all 66 books.
  // On a single-book progress update: only re-walk that one book's chapters
  // and patch the set in-place, then return a new Set reference so React sees
  // the change. This avoids iterating all 1,189 chapters on every read mark.
  const readSet = useMemo(() => {
    if (!progressByBook || !rangeSetting) return new Set();
    const inRange = makeDateInRange(resolveBounds(rangeSetting));
    const prev = prevProgressRef.current;

    // Detect a single-book swap: same object reference for all books except one.
    let changedBookId = null;
    if (prev && prev !== progressByBook) {
      for (const book of BOOKS) {
        if (prev[book.id] !== progressByBook[book.id]) {
          if (changedBookId) { changedBookId = null; break; } // more than one changed
          changedBookId = book.id;
        }
      }
    }

    prevProgressRef.current = progressByBook;

    if (changedBookId && prev) {
      // Surgical patch: copy the existing set, remove all keys for this book,
      // then re-add only the ones that are now in range.
      const next = new Set(readSetRef.current);
      const chapters = progressByBook[changedBookId] || {};
      // Remove all existing entries for this book.
      for (const key of next) {
        if (key.startsWith(`${changedBookId}:`)) next.delete(key);
      }
      // Re-add the ones now in range.
      for (const [chNum, rec] of Object.entries(chapters)) {
        const dates = (rec && rec.dates) || [];
        if (dates.some((d) => inRange(d))) next.add(`${changedBookId}:${chNum}`);
      }
      return next;
    }

    // Full rebuild — initial load or range setting changed.
    const set = new Set();
    for (const book of BOOKS) {
      const chapters = progressByBook[book.id] || {};
      for (const [chNum, rec] of Object.entries(chapters)) {
        const dates = (rec && rec.dates) || [];
        if (dates.some((d) => inRange(d))) set.add(`${book.id}:${chNum}`);
      }
    }
    return set;
  }, [progressByBook, rangeSetting]);

  // Keep readSetRef in sync so the surgical patch in the next render can copy it.
  useEffect(() => { readSetRef.current = readSet; }, [readSet]);

  const readChapterCount = readSet.size;

  const percent = Math.round((readChapterCount / TOTAL_CHAPTERS) * 100);

  // Chunk ALL_CHAPTERS into rows of numCols for FlatList. Stable reference
  // when numCols doesn't change so FlatList doesn't re-render every row.
  const chapterRows = useMemo(() => {
    if (numCols <= 0) return [];
    const rows = [];
    for (let i = 0; i < ALL_CHAPTERS.length; i += numCols) {
      rows.push(ALL_CHAPTERS.slice(i, i + numCols));
    }
    return rows;
  }, [numCols]);

  const rowHeight = boxSize + BOX_GAP;

  const getItemLayout = useCallback((_data, index) => ({
    length: rowHeight,
    offset: BOX_GAP + index * rowHeight,
    index,
  }), [rowHeight]);

  const renderRow = useCallback(({ item: row }) => (
    <HeatRow
      row={row}
      readSet={readSet}
      isDark={isDark}
      numCols={numCols}
      boxSize={boxSize}
      colorSurface={colors.surface}
      colorAccent={colors.accent}
      colorBorder={colors.border}
      colorText={colors.text}
      colorMutedText={colors.mutedText}
      onPress={onOpenChapter}
      currentChapter={currentChapter}
    />
  ), [readSet, isDark, numCols, boxSize, colors.surface, colors.accent, colors.border, colors.text, colors.mutedText, onOpenChapter, currentChapter]);


  // Only show the spinner on the very first cold launch before preloads have
  // had a chance to complete. On all subsequent visits the cache is warm and
  // this branch is never taken.
  if (progressByBook === null || rangeSetting === null) {
    return (
      <SafeAreaView
        style={[styles.safe, { backgroundColor: colors.background }]}
        edges={["top", "left", "right"]}
      >
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      {/* Nav bar: back (left) · Bible (center) · History (right) */}
      <View style={styles.navBar}>
        {onBack ? (
          <TouchableOpacity
            onPress={onBack}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.navSide}
          >
            <Text style={[styles.navBack, { color: colors.accent }]}>‹ Back</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.navSide} />
        )}
        <Text style={[styles.navTitle, { color: colors.text }]}>Bible</Text>
        <TouchableOpacity
          onPress={onOpenHistory}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={[styles.navSide, styles.navSideRight]}
        >
          <Text style={[styles.navHistory, { color: colors.accent }]}>History</Text>
        </TouchableOpacity>
      </View>

      {/* Compact stats row: progress bar + percent + range + goal icons */}
      <View style={styles.statsRow}>
        <View style={[styles.progressTrack, { backgroundColor: colors.surface }]}>
          <View
            style={[
              styles.progressFill,
              { backgroundColor: colors.accent, width: `${Math.max(percent, percent > 0 ? 2 : 0)}%` },
            ]}
          />
        </View>
        <Text style={[styles.statsPercent, { color: colors.accent }]}>{percent}%</Text>
        <TouchableOpacity
          onPress={() => setRangeModalOpen(true)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.statsIcon}
        >
          <MaterialCommunityIcons name="calendar-range" size={20} color={colors.mutedText} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setGoalModalOpen(true)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.statsIcon}
        >
          <MaterialCommunityIcons
            name="flag-outline"
            size={20}
            color={goalDate ? colors.accent : colors.mutedText}
          />
        </TouchableOpacity>
      </View>

      {/* Heat-map grid — windowed via FlatList so only ~10 rows are in the
          compositor at once instead of all 1,189 cells. The outer View captures
          onLayout to measure gridWidth; FlatList only mounts once gridWidth > 0
          so numCols is stable from the very first render. getItemLayout lets
          FlatList skip measurement entirely for instant scroll-to-offset. */}
      <View
        style={gridVisible ? styles.gridContainer : styles.gridContainerHidden}
        onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}
      >
        {gridWidth > 0 && chapterRows.length > 0 && (
          <FlatList
            ref={flatListRef}
            data={chapterRows}
            keyExtractor={(_row, index) => String(index)}
            renderItem={renderRow}
            getItemLayout={getItemLayout}
            contentContainerStyle={styles.heatGrid}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews={true}
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            windowSize={5}
          />
        )}
      </View>

      <DateRangeModal
        visible={rangeModalOpen}
        setting={rangeSetting}
        onClose={() => setRangeModalOpen(false)}
        onApply={(next) => {
          applyRangeSetting(next);
          setRangeModalOpen(false);
        }}
      />

      <GoalModal
        visible={goalModalOpen}
        goalDate={goalDate}
        readChapterCount={readChapterCount}
        onClose={() => setGoalModalOpen(false)}
        onApply={(next) => {
          applyGoalDate(next);
          setGoalModalOpen(false);
        }}
      />

    </SafeAreaView>
  );
}

function GoalModal({ visible, goalDate, readChapterCount, onClose, onApply }) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState(goalDate);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (visible) {
      setDraft(goalDate);
      setPicking(false);
    }
  }, [visible, goalDate]);

  const minimumDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(12, 0, 0, 0);
    return d;
  }, [visible]);

  const onPickerChange = (event, selectedDate) => {
    if (Platform.OS !== "ios") setPicking(false);
    if (event?.type === "dismissed" || !selectedDate) return;
    setDraft(toDateString(selectedDate));
  };

  // Compute pace from whichever date is currently shown in the picker (draft),
  // so the number updates live as the user scrubs through dates.
  const pace = useMemo(() => {
    const targetStr = draft;
    if (!targetStr) return null;
    const remaining = TOTAL_CHAPTERS - readChapterCount;
    if (remaining <= 0) return null; // already done
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = parseDate(targetStr);
    target.setHours(0, 0, 0, 0);
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysLeft = Math.round((target - today) / msPerDay);
    if (daysLeft <= 0) return null; // date is today or past
    return { perDay: Math.ceil(remaining / daysLeft), remaining, daysLeft };
  }, [draft, readChapterCount]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>Reading Goal</Text>

          <View style={styles.fieldRow}>
            <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>Finish by</Text>
            <TouchableOpacity
              style={[
                styles.fieldBtn,
                { borderColor: colors.border, backgroundColor: colors.background },
              ]}
              onPress={() => setPicking(true)}
            >
              <Text style={[styles.fieldValue, { color: draft ? colors.text : colors.mutedText }]}>
                {draft ? formatDisplayDate(draft) : "Select date"}
              </Text>
            </TouchableOpacity>
            {picking && (
              <DateTimePicker
                mode="date"
                value={parseDate(draft, minimumDate)}
                onChange={onPickerChange}
                minimumDate={minimumDate}
                display={Platform.OS === "ios" ? "inline" : "default"}
              />
            )}
          </View>

          {/* Live pace summary — updates as the user changes the date */}
          {pace ? (
            <View style={[styles.paceBox, { backgroundColor: colors.background }]}>
              <Text style={[styles.paceMain, { color: colors.accent }]}>
                {pace.perDay} chapter{pace.perDay !== 1 ? "s" : ""} per day
              </Text>
              <Text style={[styles.paceSub, { color: colors.mutedText }]}>
                {pace.remaining.toLocaleString()} chapters left · {pace.daysLeft} day{pace.daysLeft !== 1 ? "s" : ""} to go
              </Text>
            </View>
          ) : readChapterCount >= TOTAL_CHAPTERS ? (
            <View style={[styles.paceBox, { backgroundColor: colors.background }]}>
              <Text style={[styles.paceMain, { color: colors.accent }]}>🎉 You've read them all!</Text>
            </View>
          ) : draft ? (
            <View style={[styles.paceBox, { backgroundColor: colors.background }]}>
              <Text style={[styles.paceSub, { color: colors.mutedText }]}>Pick a future date to see your daily pace.</Text>
            </View>
          ) : null}

          <View style={styles.modalActions}>
            {goalDate ? (
              <TouchableOpacity
                onPress={() => onApply(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={[styles.modalActionBtn, { marginRight: "auto" }]}
              >
                <Text style={[styles.modalCancel, { color: colors.accent }]}>Clear goal</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.modalActionBtn}
            >
              <Text style={[styles.modalCancel, { color: colors.mutedText }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => draft && onApply(draft)}
              disabled={!draft}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={[styles.modalActionBtn, styles.modalApplyBtn]}
            >
              <Text
                style={[styles.modalApply, { color: draft ? colors.accent : colors.mutedText }]}
              >
                Save
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Parses a "YYYY-MM-DD" string into a local Date (noon, to avoid TZ edge
// cases), or returns a fallback Date when the string is missing/invalid.
function parseDate(dateStr, fallback = new Date()) {
  if (!dateStr) return fallback;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return fallback;
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function toDateString(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const MODE_OPTIONS = [
  { key: RANGE_MODES.YEAR, label: "This year (since Jan 1)" },
  { key: RANGE_MODES.SINCE, label: "Since a date" },
  { key: RANGE_MODES.BETWEEN, label: "Between two dates" },
  { key: RANGE_MODES.ALL, label: "All time" },
];

// The picker is date-only (mode="date"), so time is never shown or stored -
// every selection is immediately reduced to a "YYYY-MM-DD" string. We only
// need a stable "no future dates" ceiling, so cap at the end of today.
function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function DateRangeModal({ visible, setting, onClose, onApply }) {
  const { colors } = useTheme();
  // Local draft so edits only persist when the user taps Apply.
  const [draft, setDraft] = useState(setting);
  const maximumDate = useMemo(() => endOfToday(), [visible]);
  // Which native picker is open (Android shows it as a transient dialog):
  // null | "since" | "start" | "end".
  const [picking, setPicking] = useState(null);

  // Re-sync the draft whenever the modal is (re)opened with a setting.
  useEffect(() => {
    if (visible) {
      setDraft(setting);
      setPicking(null);
    }
  }, [visible, setting]);

  if (!draft) return null;

  const setMode = (mode) => setDraft((d) => ({ ...d, mode }));

  const onPickerChange = (field) => (event, selectedDate) => {
    // On Android the dialog closes itself; reflect that. On iOS the inline
    // picker stays until the user taps Done.
    if (Platform.OS !== "ios") setPicking(null);
    if (event?.type === "dismissed" || !selectedDate) return;
    setDraft((d) => ({ ...d, [field]: toDateString(selectedDate) }));
  };

  const DateField = ({ label, field, value }) => (
    <View style={styles.fieldRow}>
      <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>{label}</Text>
      <TouchableOpacity
        style={[styles.fieldBtn, { borderColor: colors.border, backgroundColor: colors.background }]}
        onPress={() => setPicking(field)}
      >
        <Text style={[styles.fieldValue, { color: value ? colors.text : colors.mutedText }]}>
          {value ? formatDisplayDate(value) : "Select date"}
        </Text>
      </TouchableOpacity>
      {picking === field && (
        <DateTimePicker
          mode="date"
          value={parseDate(value)}
          onChange={onPickerChange(field)}
          maximumDate={maximumDate}
          display={Platform.OS === "ios" ? "inline" : "default"}
        />
      )}
    </View>
  );

  const canApply =
    draft.mode === RANGE_MODES.YEAR ||
    draft.mode === RANGE_MODES.ALL ||
    (draft.mode === RANGE_MODES.SINCE && !!draft.since) ||
    (draft.mode === RANGE_MODES.BETWEEN &&
      !!draft.start &&
      !!draft.end &&
      draft.start <= draft.end);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>Date Range</Text>

          {MODE_OPTIONS.map((opt) => {
            const active = draft.mode === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={styles.modeRow}
                onPress={() => setMode(opt.key)}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.radioOuter,
                    { borderColor: active ? colors.accent : colors.border },
                  ]}
                >
                  {active && <View style={[styles.radioInner, { backgroundColor: colors.accent }]} />}
                </View>
                <Text style={[styles.modeLabel, { color: colors.text }]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}

          {draft.mode === RANGE_MODES.SINCE && (
            <DateField label="From" field="since" value={draft.since} />
          )}
          {draft.mode === RANGE_MODES.BETWEEN && (
            <>
              <DateField label="Start" field="start" value={draft.start} />
              <DateField label="End" field="end" value={draft.end} />
              {draft.start && draft.end && draft.start > draft.end && (
                <Text style={[styles.errorText, { color: colors.accent }]}>
                  Start date must be on or before end date.
                </Text>
              )}
            </>
          )}

          <View style={styles.modalActions}>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.modalActionBtn}
            >
              <Text style={[styles.modalCancel, { color: colors.mutedText }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => canApply && onApply(draft)}
              disabled={!canApply}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={[styles.modalActionBtn, styles.modalApplyBtn]}
            >
              <Text
                style={[
                  styles.modalApply,
                  { color: canApply ? colors.accent : colors.mutedText },
                ]}
              >
                Apply
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
  },
  navSide: {
    minWidth: 70,
  },
  navSideRight: {
    alignItems: "flex-end",
  },
  navBack: {
    fontSize: 16,
    fontFamily: uiFont(500),
  },
  navTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontFamily: uiFont(700),
  },
  navHistory: {
    fontSize: 16,
    fontFamily: uiFont(500),
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  statsPercent: {
    fontSize: 13,
    fontFamily: uiFont(600),
    minWidth: 36,
    textAlign: "right",
  },
  statsIcon: {
    padding: 2,
  },
  paceBox: {
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 12,
    marginBottom: 4,
  },
  paceMain: {
    fontSize: 17,
    fontFamily: uiFont(700),
    marginBottom: 2,
  },
  paceSub: {
    fontSize: 13,
    fontFamily: uiFont(400),
  },
  gridContainer: { flex: 1, opacity: 1 },
  gridContainerHidden: { flex: 1, opacity: 0 },
  heatGrid: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: BOX_GAP,
    paddingBottom: 24,
  },
  heatRowFlex: { flexDirection: "row" },
  heatBox: {
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: BOX_GAP,
  },
  heatBoxIntro: {
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: BOX_GAP,
  },
  heatLabel: {
    fontSize: 9,
    fontFamily: uiFont(700),
    textAlign: "center",
    letterSpacing: 0,
  },
  heatLabelBook: {
    fontSize: 10,
    fontFamily: uiFont(700),
    textAlign: "center",
    letterSpacing: 0.3,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  modalCard: {
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontFamily: uiFont(700), marginBottom: 12 },
  modeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  modeLabel: { fontSize: 15, fontFamily: uiFont(400), marginLeft: 12 },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioInner: { width: 10, height: 10, borderRadius: 5 },
  fieldRow: { marginTop: 8 },
  fieldLabel: {
    fontSize: 11,
    fontFamily: uiFont(700),
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  fieldBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  fieldValue: { fontSize: 15, fontFamily: uiFont(400) },
  errorText: { fontSize: 12, fontFamily: uiFont(400), marginTop: 8 },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginTop: 20,
  },
  modalActionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  modalApplyBtn: { marginLeft: 8 },
  modalCancel: { fontSize: 15, fontFamily: uiFont(400) },
  modalApply: { fontSize: 15, fontFamily: uiFont(700) },
});
