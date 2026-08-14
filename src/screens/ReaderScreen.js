import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  PanResponder,
} from "react-native";
import ChapterView from "../components/ChapterView";
import { getChapter } from "../data/bibleData";
import { getProgress, incrementReadCount } from "../data/progressStore";
import { addToHistory } from "../data/historyStore";
import { useTheme } from "../theme/ThemeContext";

const SWIPE_THRESHOLD = 50;

export default function ReaderScreen({
  book,
  chapterNumber,
  onPrev,
  onNext,
  onBack,
  hasPrev,
  hasNext,
}) {
  const { colors } = useTheme();
  const chapter = getChapter(book.id, chapterNumber);
  const scrollRef = useRef(null);
  const [readCount, setReadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getProgress(book.id, chapterNumber).then((progress) => {
      if (!cancelled) setReadCount(progress.readCount);
    });
    return () => {
      cancelled = true;
    };
  }, [book.id, chapterNumber]);

  const handleMarkRead = useCallback(async () => {
    const updated = await incrementReadCount(book.id, chapterNumber);
    addToHistory(book.id, chapterNumber);
    if (hasNext) {
      onNext();
    } else {
      // Last chapter of the last book - nothing further to advance to, just
      // reflect the new count on this screen.
      setReadCount(updated.readCount);
    }
  }, [book.id, chapterNumber, hasNext, onNext]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderRelease: (_, g) => {
        if (g.dx <= -SWIPE_THRESHOLD && hasNext) onNext();
        else if (g.dx >= SWIPE_THRESHOLD && hasPrev) onPrev();
      },
    })
  ).current;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={[styles.back, { color: colors.accent }]}>{"‹ Chapters"}</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>
          {book.name} {chapterNumber}
        </Text>
        <View style={{ width: 70 }} />
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        {...panResponder.panHandlers}
        key={`${book.id}-${chapterNumber}`}
      >
        <ChapterView chapter={chapter} />
      </ScrollView>

      <View style={[styles.navBar, { borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[
            styles.navBtn,
            { backgroundColor: colors.background },
            !hasPrev && { backgroundColor: colors.disabledBg },
          ]}
          onPress={onPrev}
          disabled={!hasPrev}
        >
          <Text
            style={[
              styles.navBtnText,
              { color: colors.accent },
              !hasPrev && { color: colors.disabledText },
            ]}
          >
            {"‹ Previous"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.readBtn,
            { backgroundColor: colors.accent, borderColor: colors.accentBorder },
          ]}
          onPress={handleMarkRead}
        >
          <Text style={[styles.readBtnText, { color: colors.accentContrast }]}>Read</Text>
          {readCount > 0 && (
            <Text style={[styles.readCount, { color: colors.accentContrast }]}>
              {readCount}×
            </Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.navBtn,
            { backgroundColor: colors.background },
            !hasNext && { backgroundColor: colors.disabledBg },
          ]}
          onPress={onNext}
          disabled={!hasNext}
        >
          <Text
            style={[
              styles.navBtnText,
              { color: colors.accent },
              !hasNext && { color: colors.disabledText },
            ]}
          >
            {"Next ›"}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: { fontSize: 16, width: 80 },
  title: { fontSize: 18, fontWeight: "700" },
  navBar: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  navBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
  },
  navBtnText: { fontSize: 16, fontWeight: "600" },
  readBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  readBtnText: { fontSize: 16, fontWeight: "700" },
  readCount: { fontSize: 11, fontWeight: "600", marginTop: 1 },
});
