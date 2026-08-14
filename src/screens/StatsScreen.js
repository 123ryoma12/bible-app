import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from "react-native";
import { BOOKS } from "../data/books";
import { ALL_CHAPTERS } from "../data/chapterIndex";
import { getAllBooksProgress } from "../data/progressStore";
import { useTheme } from "../theme/ThemeContext";

// Every row (i.e. every chapter's bar) is the same fixed height, so bars
// stay visually consistent throughout the whole chart - including
// 1-chapter books like Obadiah or Jude, whose single bar IS the whole book.
const ROW_HEIGHT = 16;
const BAR_HEIGHT = 11;
const SCREEN_PADDING = 20;
const LABEL_COL_WIDTH = 132; // generous enough for "1 Thessalonians" etc. without truncation
const MIN_LABEL_GAP = 14; // px - skip a book's label if too close to the previous shown one
const TOTAL_CHAPTERS = ALL_CHAPTERS.length; // 1,189

function getItemLayout(_, index) {
  return { length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index };
}

// Precomputed once: which books get a visible label (extremely short,
// back-to-back books could in theory still collide and are skipped - their
// zebra-striped band still marks the boundary even without text).
const LABELED_BOOK_IDS = (() => {
  const shown = new Set();
  let cumulative = 0;
  let lastShownY = -Infinity;
  for (const book of BOOKS) {
    if (cumulative - lastShownY >= MIN_LABEL_GAP) {
      shown.add(book.id);
      lastShownY = cumulative;
    }
    cumulative += book.chapterCount * ROW_HEIGHT;
  }
  return shown;
})();

export default function StatsScreen({ onOpenChapter }) {
  const { colors } = useTheme();
  const [progressByBook, setProgressByBook] = useState(null); // null = loading
  const [visibleBookName, setVisibleBookName] = useState(BOOKS[0].name);
  // { bookId, chapterNumber, bookName, count } | null - the bar whose info
  // popup is currently showing (revealed by tapping/clicking that bar).
  const [selected, setSelected] = useState(null);

  const reload = useCallback(() => {
    getAllBooksProgress(BOOKS.map((b) => b.id)).then(setProgressByBook);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const countsByKey = useMemo(() => {
    const map = {};
    if (!progressByBook) return map;
    for (const book of BOOKS) {
      const chapters = progressByBook[book.id] || {};
      for (const [chNum, rec] of Object.entries(chapters)) {
        map[`${book.id}:${chNum}`] = rec.readCount || 0;
      }
    }
    return map;
  }, [progressByBook]);

  const maxCount = useMemo(() => Math.max(1, ...Object.values(countsByKey)), [countsByKey]);

  const readChapterCount = useMemo(
    () => Object.values(countsByKey).filter((c) => c > 0).length,
    [countsByKey]
  );

  const totalReads = useMemo(
    () => Object.values(countsByKey).reduce((sum, c) => sum + c, 0),
    [countsByKey]
  );

  const percent = Math.round((readChapterCount / TOTAL_CHAPTERS) * 100);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 20 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      const top = viewableItems[0];
      if (top?.item?.bookName) setVisibleBookName(top.item.bookName);
    }
  }).current;

  const renderItem = useCallback(
    ({ item }) => {
      const count = countsByKey[`${item.bookId}:${item.chapterNumber}`] || 0;
      const barWidthPct = count > 0 ? Math.max(3, (count / maxCount) * 100) : 0;
      const bandColor = item.bookIndexParity === 0 ? colors.background : colors.surface;
      const showLabel = item.isFirstOfBook && LABELED_BOOK_IDS.has(item.bookId);
      const isSelected =
        selected &&
        selected.bookId === item.bookId &&
        selected.chapterNumber === item.chapterNumber;

      function handlePress() {
        // Pressing/clicking a bar only reveals the info popup - it never
        // navigates on its own. Navigation only happens via the popup's
        // explicit "Open" button.
        setSelected({
          bookId: item.bookId,
          chapterNumber: item.chapterNumber,
          bookName: item.bookName,
          count,
        });
      }

      return (
        <View
          style={[
            styles.row,
            { backgroundColor: bandColor },
            isSelected && { backgroundColor: colors.border },
          ]}
        >
          <View style={styles.labelCol}>
            {showLabel && (
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={[styles.bookLabel, { color: colors.text }]}
              >
                {item.bookName}
              </Text>
            )}
          </View>
          <TouchableOpacity style={styles.barArea} onPress={handlePress} activeOpacity={0.6}>
            {count > 0 && (
              <View
                style={[
                  styles.bar,
                  { width: `${barWidthPct}%`, backgroundColor: colors.accent },
                ]}
              />
            )}
          </TouchableOpacity>
        </View>
      );
    },
    [countsByKey, maxCount, colors, onOpenChapter, selected]
  );

  if (progressByBook === null) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>Stats</Text>

      <View style={styles.summary}>
        <View style={styles.summaryHeaderRow}>
          <Text style={[styles.summaryHeadline, { color: colors.text }]}>
            {readChapterCount.toLocaleString()} / {TOTAL_CHAPTERS.toLocaleString()} chapters
          </Text>
          <Text style={[styles.summaryPercent, { color: colors.accent }]}>{percent}%</Text>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: colors.surface }]}>
          <View
            style={[
              styles.progressFill,
              { backgroundColor: colors.accent, width: `${Math.max(percent, percent > 0 ? 2 : 0)}%` },
            ]}
          />
        </View>
        <Text style={[styles.summarySubtext, { color: colors.mutedText }]}>
          {totalReads.toLocaleString()} total reads · currently viewing {visibleBookName}
        </Text>
      </View>

      {selected ? (
        <View
          style={[
            styles.tooltip,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.tooltipText, { color: colors.surfaceText }]}>
            {selected.bookName} {selected.chapterNumber}
            {" · "}
            {selected.count > 0
              ? `${selected.count} read${selected.count === 1 ? "" : "s"}`
              : "not read yet"}
          </Text>
          <View style={styles.tooltipActions}>
            <TouchableOpacity
              onPress={() => onOpenChapter(selected.bookId, selected.chapterNumber)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.tooltipOpen, { color: colors.accent }]}>Open ›</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setSelected(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ marginLeft: 16 }}
            >
              <Text style={[styles.tooltipClose, { color: colors.mutedText }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={[styles.axisHeader, { marginLeft: SCREEN_PADDING + LABEL_COL_WIDTH }]}>
          <Text style={[styles.axisLabel, { color: colors.mutedText }]}>0</Text>
          <Text style={[styles.axisLabel, { color: colors.mutedText }]}>
            read count → {maxCount}
          </Text>
        </View>
      )}

      <FlatList
        data={ALL_CHAPTERS}
        keyExtractor={(item) => `${item.bookId}-${item.chapterNumber}`}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        initialNumToRender={120}
        maxToRenderPerBatch={200}
        windowSize={9}
        removeClippedSubviews
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        style={{ flex: 1 }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: {
    fontSize: 28,
    fontWeight: "700",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  summary: { paddingHorizontal: 20, marginBottom: 14 },
  summaryHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 8,
  },
  summaryHeadline: { fontSize: 16, fontWeight: "600" },
  summaryPercent: { fontSize: 16, fontWeight: "700" },
  progressTrack: {
    width: "100%",
    height: 10,
    borderRadius: 5,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 5,
  },
  summarySubtext: { fontSize: 13, marginTop: 8 },
  axisHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingRight: 20,
    marginBottom: 4,
  },
  axisLabel: { fontSize: 10 },
  tooltip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 20,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tooltipText: { fontSize: 13, fontWeight: "600", flexShrink: 1 },
  tooltipActions: { flexDirection: "row", alignItems: "center" },
  tooltipOpen: { fontSize: 13, fontWeight: "700" },
  tooltipClose: { fontSize: 13 },
  row: {
    height: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: SCREEN_PADDING,
  },
  labelCol: {
    width: LABEL_COL_WIDTH,
  },
  bookLabel: {
    fontSize: 10,
    fontWeight: "700",
  },
  barArea: {
    flex: 1,
    marginRight: SCREEN_PADDING,
  },
  bar: {
    height: BAR_HEIGHT,
    borderRadius: 2,
  },
});
