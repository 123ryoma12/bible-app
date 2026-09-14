import React, { useState, useRef, useCallback, useMemo, memo } from "react";
import {
  View,
  Text,
  ScrollView,
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
// ChapterGrid — memoized so it only re-renders when its own props change.
// ---------------------------------------------------------------------------
const ChapterGrid = memo(function ChapterGrid({
  book, cellSize, colors, currentBookId, currentChapter, onSelectChapter,
}) {
  const chapters = BOOK_CHAPTERS[book.id];
  return (
    <View style={styles.chapterGrid}>
      {chapters.map((ch, idx) => {
        const isActive = book.id === currentBookId && ch === currentChapter;
        const isLastInRow = (idx + 1) % NUM_COLS === 0;
        return (
          <TouchableOpacity
            key={ch}
            style={[
              styles.chapterCell,
              {
                width: cellSize,
                height: cellSize,
                backgroundColor: isActive ? colors.accent : colors.surface,
                marginBottom: CELL_GAP,
                marginRight: isLastInRow ? 0 : CELL_GAP,
              },
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
// BookRow — memoized so toggling one book only re-renders that row + its
// previously-expanded sibling, not all 66 rows.
// ---------------------------------------------------------------------------
const BookRow = memo(function BookRow({
  book, isExpanded, cellSize, colors, currentBookId, currentChapter,
  onToggle, onSelectChapter,
}) {
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
          colors={colors}
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
  const listLaidOut = useRef(false);
  // Hide list only if we need to scroll to a position on first open, to avoid
  // a flash of the list at the top before the scroll jump fires.
  const [scrollReady, setScrollReady] = useState(!currentBookId);
  // Use measured layout width rather than window width — on Android,
  // SafeAreaView insets reduce the actual available width.
  const [containerWidth, setContainerWidth] = useState(0);

  const currentBookLocation = useMemo(() => {
    if (!currentBookId) return null;
    for (let s = 0; s < SECTIONS.length; s++) {
      const idx = SECTIONS[s].data.findIndex((b) => b.id === currentBookId);
      if (idx !== -1) return { sectionIndex: s, itemIndex: idx };
    }
    return null;
  }, [currentBookId]);

  const cellSize = containerWidth > 0
    ? Math.floor((containerWidth - GRID_H_PAD * 2 - CELL_GAP * (NUM_COLS - 1)) / NUM_COLS)
    : 0;

  // Compute scroll offset once from known fixed heights — no layout measurement needed.
  const computeScrollOffset = useCallback(() => {
    if (!currentBookLocation) return null;
    let offset = 0;
    for (let s = 0; s < SECTIONS.length; s++) {
      offset += SECTION_HEADER_HEIGHT;
      const items = SECTIONS[s].data;
      for (let i = 0; i < items.length; i++) {
        if (s === currentBookLocation.sectionIndex && i === currentBookLocation.itemIndex) {
          return offset;
        }
        offset += BOOK_ROW_HEIGHT;
        const book = items[i];
        if (expandedBookId === book.id) {
          const numRows = Math.ceil(book.chapterCount / NUM_COLS);
          offset += 8 + numRows * (cellSize + CELL_GAP) + 4;
        }
      }
    }
    return null;
  }, [currentBookLocation, expandedBookId, cellSize]);

  const scrollToCurrentBook = useCallback(() => {
    const offset = computeScrollOffset();
    if (offset == null) return;
    listRef.current?.scrollTo({ y: Math.max(0, offset - 16), animated: false });
  }, [computeScrollOffset]);

  const toggleBook = useCallback((book) => {
    setExpandedBookId((prev) => (prev === book.id ? null : book.id));
  }, []);

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

      <ScrollView
        ref={listRef}
        contentContainerStyle={{ paddingBottom: 32 }}
        style={{ opacity: scrollReady ? 1 : 0 }}
        onLayout={(e) => {
          const { width } = e.nativeEvent.layout;
          if (width > 0) setContainerWidth(width);
          if (!listLaidOut.current) {
            listLaidOut.current = true;
            scrollToCurrentBook();
            setScrollReady(true);
          }
        }}
      >
        {SECTIONS.map((section) => (
          <View key={section.title}>
            <Text
              style={[
                styles.sectionHeader,
                { color: colors.accent, backgroundColor: colors.background },
              ]}
            >
              {section.title}
            </Text>
            {section.data.map((book) => (
              <BookRow
                key={book.id}
                book={book}
                isExpanded={expandedBookId === book.id}
                cellSize={cellSize}
                colors={colors}
                currentBookId={currentBookId}
                currentChapter={currentChapter}
                onToggle={toggleBook}
                onSelectChapter={onSelectChapter}
              />
            ))}
          </View>
        ))}
      </ScrollView>
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
    // Rotate the › to point down when expanded
  },

  chapterGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: GRID_H_PAD,
    paddingTop: 8,
    paddingBottom: 4,
  },
  chapterCell: {
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  chapterCellText: {
    fontSize: 16,
    fontFamily: uiFont(600),
  },
});
