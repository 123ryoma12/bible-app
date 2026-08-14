import React, { useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, SafeAreaView } from "react-native";
import { BOOKS } from "../data/books";
import { getHistory } from "../data/historyStore";
import { useTheme } from "../theme/ThemeContext";

function formatRelativeTime(isoString) {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(isoString).toLocaleDateString();
}

export default function HistoryScreen({ onSelectEntry, onBack }) {
  const { colors } = useTheme();
  const [history, setHistory] = useState(null); // null = still loading

  useEffect(() => {
    let cancelled = false;
    getHistory().then((h) => {
      if (!cancelled) setHistory(h);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={[styles.back, { color: colors.accent }]}>{"‹ Books"}</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>History</Text>
        <View style={{ width: 60 }} />
      </View>

      {history !== null && history.length === 0 && (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
            Chapters you mark "Read" will show up here, most recent first.
          </Text>
        </View>
      )}

      <FlatList
        data={history || []}
        keyExtractor={(item, i) => `${item.bookId}-${item.chapterNumber}-${i}`}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item }) => {
          const book = BOOKS.find((b) => b.id === item.bookId);
          if (!book) return null;
          return (
            <TouchableOpacity
              style={[styles.row, { borderBottomColor: colors.border }]}
              onPress={() => onSelectEntry(item.bookId, item.chapterNumber)}
            >
              <Text style={[styles.rowText, { color: colors.text }]}>
                {book.name} {item.chapterNumber}
              </Text>
              <Text style={[styles.rowMeta, { color: colors.mutedText }]}>
                {formatRelativeTime(item.readAt)}
              </Text>
            </TouchableOpacity>
          );
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
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: { fontSize: 16, width: 70 },
  title: { fontSize: 20, fontWeight: "700" },
  empty: {
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  emptyText: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { fontSize: 17 },
  rowMeta: { fontSize: 13 },
});
