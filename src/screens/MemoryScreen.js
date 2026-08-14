import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
} from "react-native";
import { useTheme } from "../theme/ThemeContext";
import {
  STATUS,
  getMemoryList,
  removeMemory,
  referenceLabel,
  successRate,
  successCount,
  failureCount,
} from "../data/memoryStore";
import MemoryAdd from "./memory/MemoryAdd";
import MemoryDrill from "./memory/MemoryDrill";

// Memory tab: verse-memorisation sets split into two sections - "Not Memorised"
// (still learning) and "Memorised" (a practice queue ordered weakest-first, so
// the verse most in need of review sits at the top - see memorisedScore in
// memoryStore.js). From here you can add a new set, start a drill on one, or
// delete one. All persistence lives in memoryStore.js (localStorage now,
// Firebase-ready later).
export default function MemoryScreen() {
  const { colors } = useTheme();
  const [view, setView] = useState("list"); // "list" | "add" | "drill"
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  // The ordered list the drill walks through, plus where to start. Snapshotted
  // when a drill begins so auto-advance follows a stable order even as stats/
  // ordering change underneath.
  const [drillList, setDrillList] = useState([]);
  const [drillStartIndex, setDrillStartIndex] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    const list = await getMemoryList();
    setEntries(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // `entries` is already fully ordered by the store (not-memorised group first,
  // then memorised ranked weakest-first). Split that flat, ordered list into the
  // two display sections without re-sorting, so the drill's flat index stays in
  // lock-step with what's on screen. We also stash each row's index in the flat
  // list (`flatIndex`) so tapping a row starts the drill at the right place.
  const sections = useMemo(() => {
    const notMemorised = [];
    const memorised = [];
    entries.forEach((entry, flatIndex) => {
      const row = { entry, flatIndex };
      if (entry.status === STATUS.MEMORISED) memorised.push(row);
      else notMemorised.push(row);
    });

    const out = [];
    if (notMemorised.length)
      out.push({ key: "not_memorised", title: "Not Memorised", data: notMemorised });
    if (memorised.length)
      out.push({ key: "memorised", title: "Memorised", data: memorised });
    return out;
  }, [entries]);

  function confirmDelete(entry) {
    Alert.alert(
      "Delete memory verse",
      `Remove "${referenceLabel(entry)}"? This also clears its stats.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await removeMemory(entry.id);
            refresh();
          },
        },
      ]
    );
  }

  if (view === "add") {
    return (
      <MemoryAdd
        onCancel={() => setView("list")}
        onDone={() => {
          setView("list");
          refresh();
        }}
      />
    );
  }

  if (view === "drill" && drillList.length > 0) {
    return (
      <MemoryDrill
        list={drillList}
        startIndex={drillStartIndex}
        onExit={() => {
          setDrillList([]);
          setView("list");
          refresh();
        }}
      />
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.text }]}>Memory</Text>
        <TouchableOpacity onPress={() => setView("add")} hitSlop={hit}>
          <Text style={[styles.addLink, { color: colors.accent }]}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {loading ? null : entries.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyHeading, { color: colors.text }]}>
            No memory verses yet
          </Text>
          <Text style={[styles.emptySub, { color: colors.secondaryText }]}>
            Tap “+ Add” to choose a verse or a range of consecutive verses to
            start memorising.
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(row) => row.entry.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <SectionHeader title={section.title} colors={colors} />
          )}
          renderItem={({ item }) => (
            <MemoryRow
              entry={item.entry}
              colors={colors}
              onPress={() => {
                // Snapshot the current order and start where the user tapped
                // (using the flat index so the drill can auto-advance through
                // the rest of the list regardless of section boundaries).
                setDrillList(entries);
                setDrillStartIndex(item.flatIndex);
                setView("drill");
              }}
              onLongPress={() => confirmDelete(item.entry)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function SectionHeader({ title, colors }) {
  return (
    <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
      <Text style={[styles.sectionHeaderText, { color: colors.secondaryText }]}>
        {title}
      </Text>
    </View>
  );
}

function MemoryRow({ entry, colors, onPress, onLongPress }) {
  const memorised = entry.status === STATUS.MEMORISED;
  const rate = successRate(entry);
  const wins = successCount(entry);
  const losses = failureCount(entry);

  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.border }]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowRef, { color: colors.text }]}>
          {referenceLabel(entry)}
        </Text>
        <Text style={[styles.rowMeta, { color: colors.secondaryText }]}>
          {entry.verses.length} verse{entry.verses.length === 1 ? "" : "s"}
          {memorised
            ? entry.attempts
              ? ` · ${wins}✓ / ${losses}✗ · ${Math.round(rate * 100)}%`
              : " · no attempts yet"
            : " · Not memorised"}
        </Text>
      </View>
      <StatusBadge memorised={memorised} colors={colors} />
    </TouchableOpacity>
  );
}

function StatusBadge({ memorised, colors }) {
  const label = memorised ? "Memorised" : "Learning";
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: memorised ? colors.accent : colors.surface,
          borderColor: memorised ? colors.accentBorder : colors.border,
        },
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          { color: memorised ? colors.accentContrast : colors.surfaceText },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const hit = { top: 10, bottom: 10, left: 10, right: 10 };

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: { fontSize: 28, fontWeight: "700" },
  addLink: { fontSize: 16, fontWeight: "600" },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    marginTop: -40,
  },
  emptyHeading: { fontSize: 20, fontWeight: "700", marginBottom: 6 },
  emptySub: { fontSize: 15, textAlign: "center", lineHeight: 22 },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 6,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowRef: { fontSize: 17, fontWeight: "600" },
  rowMeta: { fontSize: 13, marginTop: 3 },
  badge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 12,
  },
  badgeText: { fontSize: 12, fontWeight: "700" },
});
