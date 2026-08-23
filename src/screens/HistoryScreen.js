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
import { uiFont } from "../theme/fonts";
import { formatDisplayDate } from "../data/statsSettingsStore";

// Formats a Date as the app-wide "1 Jan 2026" display style.
function formatCalendarDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return formatDisplayDate(`${y}-${m}-${day}`);
}

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
  return formatCalendarDate(new Date(isoString));
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
      // De-dupe by entry id when appending. The history index can reorder
      // between page loads (re-reading a chapter moves it to the front), and
      // getHistoryPage falls back to start=0 if a cursor has since moved - both
      // can re-surface an id already shown on a previous page. Without this,
      // FlatList would see two children with the same key (e.g. "GEN-1").
      setEntries((prev) => {
        const seen = new Set(prev.map((e) => `${e.bookId}-${e.chapterNumber}`));
        const additions = page.filter(
          (e) => !seen.has(`${e.bookId}-${e.chapterNumber}`)
        );
        return additions.length ? [...prev, ...additions] : prev;
      });
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
        <TouchableOpacity
          style={styles.backBtn}
          onPress={onBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={[styles.back, { color: colors.accent }]} numberOfLines={1}>
            {"‹ Books"}
          </Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>History</Text>
        <View style={styles.headerSpacer} />
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
              <Text
                style={[styles.rowText, { color: colors.text }]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
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
  backBtn: { width: 70 },
  headerSpacer: { width: 70 },
  back: { fontSize: 16, fontFamily: uiFont(400) },
  title: { flex: 1, fontSize: 20, fontFamily: uiFont(700), textAlign: "center" },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    marginTop: -40,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: uiFont(400),
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
  rowText: { flex: 1, fontSize: 17, marginRight: 12, fontFamily: uiFont(400) },
  rowMeta: { fontSize: 13, flexShrink: 0, fontFamily: uiFont(400) },
  footer: { paddingVertical: 20 },
});
