import React, { useState, useRef, useCallback, useMemo, memo } from "react";
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BOOKS } from "../data/books";
import { useTheme } from "../theme/ThemeContext";
import { uiFont } from "../theme/fonts";

const SECTIONS = [
  { title: "Old Testament", data: BOOKS.filter((b) => b.testament === "OT") },
  { title: "New Testament", data: BOOKS.filter((b) => b.testament === "NT") },
];

const NUM_COLS = 5;
const GRID_H_PAD = 20;
const CELL_GAP = 8;

const BOOK_ROW_HEIGHT = 14 * 2 + 24;
const SECTION_HEADER_HEIGHT = 16 + 6 + 20;

// Precompute chapter number arrays once — chapterCount never changes at runtime.
const BOOK_CHAPTERS = Object.fromEntries(
  BOOKS.map((b) => [b.id, Array.from({ length: b.chapterCount }, (_, i) => i + 1)])
);

// ---------------------------------------------------------------------------
// ChapterGrid — fix #2: reads colors from context directly (not via prop) so
// memo's shallow-equality check on the other props actually works.
// fix #3: memoizes per-cell style objects so they aren't recreated on every render.
// ---------------------------------------------------------------------------
const ChapterGrid = memo(function ChapterGrid({
  book, cellSize, currentBookId, currentChapter, onSelectChapter,
}) {
  // Fix #2: own theme subscription — doesn't bust memo from parent re-renders.
  const { colors } = useTheme();
  const chapters = BOOK_CHAPTERS[book.id];

  // Fix #3: memoize the base (inactive) cell style so only active cells get a
  // new style object. cellSize and colors.surface are the only dynamic parts.
  const baseCellStyle = useMemo(() => ({
    width: cellSize,
    height: cellSize,
    backgroundColor: colors.surface,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  }), [cellSize, colors.surface]);

  const activeCellStyle = useMemo(() => ({
    ...baseCellStyle,
    backgroundColor: colors.accent,
  }), [baseCellStyle, colors.accent]);

  return (
    <View style={styles.chapterGrid}>
      {chapters.map((ch, idx) => {
        const isActive = book.id === currentBookId && ch === currentChapter;
        const isLastInRow = (idx + 1) % NUM_COLS === 0;
        return (
          <TouchableOpacity
            key={ch}
            style={[
              isActive ? activeCellStyle : baseCellStyle,
              isLastInRow ? styles.cellNoMarginRight : styles.cellMarginRight,
              styles.cellMarginBottom,
            ]}
            onPress={() => onSelectChapter(book, ch)}
            activeOpacity={0.6}
          >
            <Text
              style={[
                styles.chapterCellText,
                { color: isActive ? colors.accentContrast : colors.surfaceText },
              ]}
            >
              {ch}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
});

// ---------------------------------------------------------------------------
// BookRow — fix #2: reads colors from context directly so memo works correctly.
// ---------------------------------------------------------------------------
const BookRow = memo(function BookRow({
  book, isExpanded, cellSize, currentBookId, currentChapter,
  onToggle, onSelectChapter,
}) {
  // Fix #2: own theme subscription.
  const { colors } = useTheme();

  return (
    <View>
      <TouchableOpacity
        style={[
          styles.bookRow,
          {
            borderBottomColor: colors.border,
            backgroundColor: isExpanded ? colors.surface : colors.background,
          },
        ]}
        onPress={() => onToggle(book)}
        activeOpacity={0.7}
      >
        <Text
          style={[
            styles.bookName,
            {
              color: isExpanded ? colors.accent : colors.text,
              fontFamily: isExpanded ? uiFont(700) : uiFont(400),
            },
          ]}
          numberOfLines={1}
        >
          {book.name}
        </Text>
        <View style={styles.bookRowRight}>
          {!isExpanded && (
            <Text style={[styles.bookMeta, { color: colors.mutedText }]}>
              {book.chapterCount} ch
            </Text>
          )}
          <Text
            style={[
              styles.chevron,
              {
                color: isExpanded ? colors.accent : colors.mutedText,
                transform: [{ rotate: isExpanded ? "90deg" : "0deg" }],
              },
            ]}
          >
            {"›"}
          </Text>
        </View>
      </TouchableOpacity>

      {isExpanded && (
        <ChapterGrid
          book={book}
          cellSize={cellSize}
          currentBookId={currentBookId}
          currentChapter={currentChapter}
          onSelectChapter={onSelectChapter}
        />
      )}
    </View>
  );
});

// ---------------------------------------------------------------------------
// BookChapterPicker
// ---------------------------------------------------------------------------
export default function BookChapterPicker({ onSelectChapter, onClose, onOpenHistory, currentBookId, currentChapter }) {
  const { colors } = useTheme();
  const [expandedBookId, setExpandedBookId] = useState(currentBookId ?? null);
  const listRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const cellSize = containerWidth > 0
    ? Math.floor((containerWidth - GRID_H_PAD * 2 - CELL_GAP * (NUM_COLS - 1)) / NUM_COLS)
    : 0;

  // Fix #4: compute the initial scroll location once — only needs sectionIndex
  // and itemIndex for SectionList.scrollToLocation(), no height math required.
  const initialScrollLocation = useMemo(() => {
    if (!currentBookId) return null;
    for (let s = 0; s < SECTIONS.length; s++) {
      const idx = SECTIONS[s].data.findIndex((b) => b.id === currentBookId);
      if (idx !== -1) return { sectionIndex: s, itemIndex: idx, viewOffset: 16, animated: false };
    }
    return null;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — intentionally run once on mount

  const scrolledRef = useRef(false);

  const handleLayout = useCallback((e) => {
    const { width } = e.nativeEvent.layout;
    if (width > 0) setContainerWidth(width);
  }, []);

  // Fix #1: SectionList calls this when it's ready to scroll. We only do it
  // once — after that the user may have scrolled elsewhere deliberately.
  const handleScrollToIndexFailed = useCallback(() => {
    // SectionList can fail if items haven't laid out yet; retry after a tick.
    if (initialScrollLocation) {
      setTimeout(() => {
        listRef.current?.scrollToLocation({ ...initialScrollLocation, animated: false });
      }, 100);
    }
  }, [initialScrollLocation]);

  const scrollToInitial = useCallback(() => {
    if (!initialScrollLocation || scrolledRef.current) return;
    scrolledRef.current = true;
    listRef.current?.scrollToLocation({ ...initialScrollLocation, animated: false });
  }, [initialScrollLocation]);

  const toggleBook = useCallback((book) => {
    setExpandedBookId((prev) => (prev === book.id ? null : book.id));
  }, []);

  const renderSectionHeader = useCallback(({ section }) => (
    <Text
      style={[
        styles.sectionHeader,
        { color: colors.accent, backgroundColor: colors.background },
      ]}
    >
      {section.title}
    </Text>
  ), [colors.accent, colors.background]);

  const renderItem = useCallback(({ item: book }) => (
    <BookRow
      book={book}
      isExpanded={expandedBookId === book.id}
      cellSize={cellSize}
      currentBookId={currentBookId}
      currentChapter={currentChapter}
      onToggle={toggleBook}
      onSelectChapter={onSelectChapter}
    />
  ), [expandedBookId, cellSize, currentBookId, currentChapter, toggleBook, onSelectChapter]);

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        {onClose ? (
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={[styles.headerBtn, { color: colors.accent }]}>{"‹ Back"}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
        )}
        <Text style={[styles.headerTitle, { color: colors.text }]}>Bible</Text>
        <TouchableOpacity
          onPress={onOpenHistory}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={[styles.headerBtn, { color: colors.accent }]}>History</Text>
        </TouchableOpacity>
      </View>

      {/* Fix #1: SectionList virtualizes — only visible rows are mounted. */}
      <SectionList
        ref={listRef}
        sections={SECTIONS}
        keyExtractor={(book) => book.id}
        renderSectionHeader={renderSectionHeader}
        renderItem={renderItem}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: 32 }}
        onLayout={handleLayout}
        onScrollToIndexFailed={handleScrollToIndexFailed}
        onContentSizeChange={scrollToInitial}
        // Increase render window slightly to avoid blank flashes on fast scroll.
        windowSize={7}
        maxToRenderPerBatch={12}
        initialNumToRender={20}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { fontSize: 15, fontFamily: uiFont(600) },
  headerTitle: { fontSize: 28, fontFamily: uiFont(700) },
  headerSpacer: { width: 60 },

  sectionHeader: {
    fontSize: 13,
    fontFamily: uiFont(700),
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 6,
  },

  bookRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bookName: { flex: 1, fontSize: 17, marginRight: 8 },
  bookRowRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  bookMeta: { fontSize: 13, fontFamily: uiFont(400) },
  chevron: {
    fontSize: 20,
    fontFamily: uiFont(400),
  },

  chapterGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: GRID_H_PAD,
    paddingTop: 8,
    paddingBottom: 4,
  },
  cellMarginBottom: { marginBottom: CELL_GAP },
  cellMarginRight: { marginRight: CELL_GAP },
  cellNoMarginRight: { marginRight: 0 },
  chapterCellText: {
    fontSize: 16,
    fontFamily: uiFont(600),
  },
});
