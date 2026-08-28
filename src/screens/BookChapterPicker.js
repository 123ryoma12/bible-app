import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BOOKS } from "../data/books";
import { useTheme } from "../theme/ThemeContext";
import { uiFont } from "../theme/fonts";

// Enable LayoutAnimation on Android
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SECTIONS = [
  { title: "Old Testament", data: BOOKS.filter((b) => b.testament === "OT") },
  { title: "New Testament", data: BOOKS.filter((b) => b.testament === "NT") },
];

const NUM_COLS = 5;
const GRID_H_PAD = 20;
const CELL_GAP = 8; // total horizontal gap between cells, split evenly

export default function BookChapterPicker({ onSelectChapter, onClose, onOpenHistory, currentBookId, currentChapter }) {
  const { colors } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  // ID of the currently expanded book, or null
  const [expandedBookId, setExpandedBookId] = useState(currentBookId ?? null);
  const listRef = useRef(null);

  // On mount, scroll so the current book is visible
  useEffect(() => {
    if (!currentBookId) return;
    // Find which section + item index the current book lives in
    let sectionIndex = -1;
    let itemIndex = -1;
    for (let s = 0; s < SECTIONS.length; s++) {
      const idx = SECTIONS[s].data.findIndex((b) => b.id === currentBookId);
      if (idx !== -1) {
        sectionIndex = s;
        itemIndex = idx;
        break;
      }
    }
    if (sectionIndex === -1) return;
    // Small delay lets the list finish its first layout before we scroll
    const timer = setTimeout(() => {
      listRef.current?.scrollToLocation({
        sectionIndex,
        itemIndex,
        viewOffset: 16,
        animated: false,
      });
    }, 120);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Available width minus outer padding minus gaps between cells
  // CELL_GAP is the space between cells; (NUM_COLS - 1) gaps exist between columns
  const cellSize =
    (windowWidth - GRID_H_PAD * 2 - CELL_GAP * (NUM_COLS - 1)) / NUM_COLS;

  const toggleBook = useCallback(
    (book) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setExpandedBookId((prev) => (prev === book.id ? null : book.id));
    },
    []
  );

  const renderChapterGrid = useCallback(
    (book) => {
      const chapters = Array.from({ length: book.chapterCount }, (_, i) => i + 1);
      // Group chapters into rows of NUM_COLS for FlatList
      return (
        <View style={styles.chapterGrid}>
          {chapters.map((ch) => {
            const isActive = book.id === currentBookId && ch === currentChapter;
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
                    marginRight: CELL_GAP,
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
    },
    [cellSize, colors, currentBookId, currentChapter, onSelectChapter]
  );

  const renderBook = useCallback(
    ({ item: book }) => {
      const isExpanded = expandedBookId === book.id;
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
            onPress={() => toggleBook(book)}
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

          {isExpanded && renderChapterGrid(book)}
        </View>
      );
    },
    [expandedBookId, colors, toggleBook, renderChapterGrid]
  );

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      {/* Header */}
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

      <SectionList
        ref={listRef}
        sections={SECTIONS}
        keyExtractor={(item) => item.id}
        renderSectionHeader={({ section }) => (
          <Text
            style={[
              styles.sectionHeader,
              { color: colors.accent, backgroundColor: colors.background },
            ]}
          >
            {section.title}
          </Text>
        )}
        renderItem={renderBook}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: 32 }}
        removeClippedSubviews={false}
        onScrollToIndexFailed={() => {
          // If the item isn't measured yet, retry after a short delay
          setTimeout(() => {
            let sectionIndex = -1;
            let itemIndex = -1;
            for (let s = 0; s < SECTIONS.length; s++) {
              const idx = SECTIONS[s].data.findIndex((b) => b.id === currentBookId);
              if (idx !== -1) { sectionIndex = s; itemIndex = idx; break; }
            }
            if (sectionIndex !== -1) {
              listRef.current?.scrollToLocation({ sectionIndex, itemIndex, viewOffset: 16, animated: false });
            }
          }, 200);
        }}
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
    // Rotate the › to point down when expanded
  },

  chapterGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingLeft: GRID_H_PAD,
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
