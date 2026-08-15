import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BOOKS } from "../data/books";
import { getHistoryPage, PAGE_SIZE } from "../data/historyStore";
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
  const [entries, setEntries] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Refs so the paged loader always sees the latest cursor/flags without
  // being re-created (which would re-fire onEndReached).
  const cursorRef = useRef(null);
  const hasMoreRef = useRef(true);
  const loadingRef = useRef(false);

  const loadMore = useCallback(async () => {
    // Guard against overlapping loads (onEndReached can fire repeatedly) and
    // against loading past the end.
    if (loadingRef.current || !hasMoreRef.current) return;
    loadingRef.current = true;
    setLoadingMore(true);

    try {
      const { entries: page, nextCursor, hasMore } = await getHistoryPage(
        PAGE_SIZE,
        cursorRef.current
      );
      cursorRef.current = nextCursor;
      hasMoreRef.current = hasMore;
      setEntries((prev) => [...prev, ...page]);
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { entries: page, nextCursor, hasMore } = await getHistoryPage();
      if (cancelled) return;
      cursorRef.current = nextCursor;
      hasMoreRef.current = hasMore;
      setEntries(page);
      setInitialLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={[styles.back, { color: colors.accent }]}>{"‹ Books"}</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>History</Text>
        <View style={{ width: 60 }} />
      </View>

      {!initialLoading && entries.length === 0 && (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
            Chapters you mark "Read" will show up here, most recent first.
          </Text>
        </View>
      )}

      <FlatList
        data={entries}
        keyExtractor={(item) => `${item.bookId}-${item.chapterNumber}`}
        contentContainerStyle={{ paddingBottom: 24 }}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={renderFooter}
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
  footer: { paddingVertical: 20 },
});
