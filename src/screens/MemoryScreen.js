import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeContext";
import { uiFont } from "../theme/fonts";
import { useScreenBackHandler } from "../navigation/BackHandlerRegistry";
import {
  STATUS,
  getMemoryList,
  removeMemory,
  referenceLabel,
  successCount,
  resortMemory,
} from "../data/memoryStore";
import {
  PREF_FIELDS,
  PRESET_ORDER,
  PRESET_LABELS,
  PRESET_DESCRIPTIONS,
  getMemoryPrefs,
  setMemoryPrefs,
  applyPreset,
  resetMemoryPrefs,
  presetForPrefs,
} from "../data/memoryPrefsStore";
import { versionAbbr } from "../data/bibleVersions";
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

  // --- Prioritisation modal ---
  const [showPriority, setShowPriority] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [prefs, setPrefs] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getMemoryPrefs().then((p) => { if (!cancelled) setPrefs(p); });
    return () => { cancelled = true; };
  }, []);

  const activePreset = prefs ? presetForPrefs(prefs) : "balanced";

  async function commitPrefs(next) {
    setPrefs(next);
    await resortMemory();
  }

  async function handlePreset(key) {
    const next = await applyPreset(key);
    await commitPrefs(next);
  }

  async function handleStep(field, direction) {
    if (!prefs) return;
    const current = field.fromStored ? field.fromStored(prefs[field.key]) : prefs[field.key];
    const raw = current + direction * field.step;
    const clamped = Math.min(field.max, Math.max(field.min, raw));
    if (clamped === current) return;
    const storedValue = field.toStored ? field.toStored(clamped) : clamped;
    const next = await setMemoryPrefs({ [field.key]: storedValue });
    await commitPrefs(next);
  }

  function handleResetPrefs() {
    Alert.alert(
      "Reset prioritisation?",
      "Restore the default Memory prioritisation settings. Your verses and stats are not affected.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            const next = await resetMemoryPrefs();
            await commitPrefs(next);
          },
        },
      ]
    );
  }
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

    const memorisedVerseCount = memorised.reduce(
      (total, row) => total + (row.entry.verses?.length || 0),
      0
    );

    const out = [];
    if (notMemorised.length)
      out.push({ key: "not_memorised", title: "Not Memorised", data: notMemorised });
    if (memorised.length)
      out.push({ key: "memorised", title: "Memorised", data: memorised, verseCount: memorisedVerseCount });
    return out;
  }, [entries]);

  // Android back inside the Memory tab: if we're in a sub-view (add / drill),
  // return to the list first instead of letting the app-level handler switch
  // tabs or exit.
  useScreenBackHandler(() => {
    if (view === "add") {
      setView("list");
      return true;
    }
    if (view === "drill") {
      setDrillList([]);
      setView("list");
      refresh();
      return true;
    }
    return false;
  }, [view, refresh]);

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
    <View style={styles.root}>
      <SafeAreaView
        style={[styles.safe, { backgroundColor: colors.background }]}
        edges={["top", "left", "right"]}
      >
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.text }]}>Memory</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => setShowPriority(true)}
              hitSlop={hit}
              accessibilityLabel="Prioritisation settings"
              style={styles.cogBtn}
            >
              <Text style={[styles.cogBtnText, { color: colors.mutedText }]}>⚙</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setView("add")} hitSlop={hit}>
              <Text style={[styles.addLink, { color: colors.accent }]}>+ Add</Text>
            </TouchableOpacity>
          </View>
        </View>

        {loading ? null : entries.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyHeading, { color: colors.text }]}>
              No memory verses yet
            </Text>
            <Text style={[styles.emptySub, { color: colors.secondaryText }]}>
              Tap "+ Add" to choose a verse or a range of consecutive verses to
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
              <SectionHeader
                title={section.title}
                count={section.verseCount != null ? section.verseCount : section.data.length}
                label={section.verseCount != null ? "verse" : null}
                colors={colors}
              />
            )}
            renderItem={({ item }) => (
              <MemoryRow
                entry={item.entry}
                colors={colors}
                onPress={() => {
                  setDrillList(entries);
                  setDrillStartIndex(item.flatIndex);
                  setView("drill");
                }}
                onLongPress={() => confirmDelete(item.entry)}
                onDelete={() => confirmDelete(item.entry)}
              />
            )}
          />
        )}
      </SafeAreaView>

      {/* Prioritisation overlay — rendered outside SafeAreaView, covers full screen on web */}
      {showPriority && (
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => { setShowPriority(false); setShowAdvanced(false); }}
        >
          <TouchableOpacity
            style={[styles.modalCard, { backgroundColor: colors.surface }]}
            activeOpacity={1}
            onPress={() => {}}
          >
            <Text style={[styles.modalTitle, { color: colors.surfaceText }]}>
              Memory Prioritisation
            </Text>
            <ScrollView style={styles.modalOptions} bounces={false}>
              <Text style={[styles.modalNote, { color: colors.mutedText }]}>
                Choose how the Memory tab decides which verses to practise first.
              </Text>
              {PRESET_ORDER.map((key) => {
                const isActive = activePreset === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.modalRow, { borderBottomColor: colors.border }]}
                    onPress={() => handlePreset(key)}
                    disabled={!prefs}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isActive }}
                  >
                    <View style={styles.modalRowText}>
                      <Text style={[styles.modalRowLabel, { color: colors.text }]}>
                        {PRESET_LABELS[key]}
                      </Text>
                      <Text style={[styles.modalRowSub, { color: colors.mutedText }]}>
                        {PRESET_DESCRIPTIONS[key]}
                      </Text>
                    </View>
                    <View style={[styles.radioOuter, { borderColor: isActive ? colors.accent : colors.border }]}>
                      {isActive && <View style={[styles.radioInner, { backgroundColor: colors.accent }]} />}
                    </View>
                  </TouchableOpacity>
                );
              })}

              {activePreset === "custom" && (
                <View style={[styles.modalRow, { borderBottomColor: colors.border }]}>
                  <View style={styles.modalRowText}>
                    <Text style={[styles.modalRowLabel, { color: colors.text }]}>{PRESET_LABELS.custom}</Text>
                    <Text style={[styles.modalRowSub, { color: colors.mutedText }]}>{PRESET_DESCRIPTIONS.custom}</Text>
                  </View>
                  <View style={[styles.radioOuter, { borderColor: colors.accent }]}>
                    <View style={[styles.radioInner, { backgroundColor: colors.accent }]} />
                  </View>
                </View>
              )}

              <TouchableOpacity
                style={[styles.modalRow, { borderBottomColor: colors.border, marginTop: 8 }]}
                onPress={() => setShowAdvanced((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: showAdvanced }}
              >
                <Text style={[styles.modalRowLabel, { color: colors.text }]}>Advanced tuning</Text>
                <Text style={[styles.chevron, { color: colors.mutedText }]}>{showAdvanced ? "⌃" : "›"}</Text>
              </TouchableOpacity>

              {showAdvanced && prefs && PREF_FIELDS.map((field) => {
                const display = field.fromStored ? field.fromStored(prefs[field.key]) : prefs[field.key];
                const atMin = display <= field.min;
                const atMax = display >= field.max;
                return (
                  <View key={field.key} style={[styles.prefRow, { borderBottomColor: colors.border }]}>
                    <View style={styles.prefText}>
                      <Text style={[styles.modalRowLabel, { color: colors.text }]}>{field.label}</Text>
                      <Text style={[styles.modalRowSub, { color: colors.mutedText }]}>{field.help}</Text>
                    </View>
                    <View style={styles.stepper}>
                      <TouchableOpacity
                        style={[styles.stepBtn, { borderColor: colors.border, opacity: atMin ? 0.35 : 1 }]}
                        onPress={() => handleStep(field, -1)}
                        disabled={atMin}
                      >
                        <Text style={[styles.stepBtnText, { color: colors.text }]}>−</Text>
                      </TouchableOpacity>
                      <Text style={[styles.stepValue, { color: colors.text }]} numberOfLines={1}>
                        {field.format(display)}
                      </Text>
                      <TouchableOpacity
                        style={[styles.stepBtn, { borderColor: colors.border, opacity: atMax ? 0.35 : 1 }]}
                        onPress={() => handleStep(field, 1)}
                        disabled={atMax}
                      >
                        <Text style={[styles.stepBtnText, { color: colors.text }]}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}

              {showAdvanced && (
                <TouchableOpacity
                  style={[styles.modalRow, { borderBottomColor: colors.border }]}
                  onPress={handleResetPrefs}
                  accessibilityRole="button"
                >
                  <Text style={[styles.modalRowLabel, { color: colors.danger || "#c0392b" }]}>
                    Reset to Defaults
                  </Text>
                  <Text style={[styles.chevron, { color: colors.mutedText }]}>↺</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
            <TouchableOpacity
              style={[styles.modalCancel, { borderTopColor: colors.border }]}
              onPress={() => { setShowPriority(false); setShowAdvanced(false); }}
            >
              <Text style={[styles.modalCancelText, { color: colors.accent }]}>Close</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      )}
    </View>
  );
}

function MemoryRow({ entry, colors, onPress, onLongPress, onDelete }) {
  const memorised = entry.status === STATUS.MEMORISED;
  const wins = successCount(entry);
  const lastDone = formatLastDone(entry);

  const meta = memorised
    ? `${versionAbbr(entry.version)} · Review Count ${wins} · ${lastDone}`
    : versionAbbr(entry.version);

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
          {meta}
        </Text>
      </View>
      <TouchableOpacity
        onPress={onDelete}
        hitSlop={hit}
        style={styles.deleteBtn}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${referenceLabel(entry)}`}
      >
        <Ionicons name="trash-outline" size={20} color={colors.mutedText} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function formatLastDone(entry) {
  // Older entries only have lastSuccessAt; use it as a graceful fallback.
  const timestamp = entry.lastPractisedAt || entry.lastSuccessAt;
  const date = timestamp ? new Date(timestamp) : null;
  if (!date || Number.isNaN(date.getTime())) return "never practised";

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}


const hit = { top: 10, bottom: 10, left: 10, right: 10 };

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: { fontSize: 28, fontFamily: uiFont(700) },
  addLink: { fontSize: 16, fontFamily: uiFont(600) },
  cogBtn: { justifyContent: "center", alignItems: "center" },
  cogBtnText: { fontSize: 22, lineHeight: 26 },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  // Overlay (web-compatible — no Modal)
  modalBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    zIndex: 100,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "80%",
    borderRadius: 16,
    overflow: "hidden",
  },
  modalTitle: {
    fontSize: 15,
    fontFamily: uiFont(700),
    textAlign: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  modalOptions: { flexGrow: 0 },
  modalNote: {
    fontSize: 13,
    fontFamily: uiFont(400),
    lineHeight: 18,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  modalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalRowText: { flex: 1, paddingRight: 12 },
  modalRowLabel: { fontSize: 16, fontFamily: uiFont(500) },
  modalRowSub: { fontSize: 12, fontFamily: uiFont(400), marginTop: 2 },
  modalCancel: {
    borderTopWidth: 1,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalCancelText: { fontSize: 15, fontFamily: uiFont(600) },
  chevron: { fontSize: 22, fontFamily: uiFont(400) },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioInner: { width: 12, height: 12, borderRadius: 6 },
  prefRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  prefText: { flex: 1, paddingRight: 12 },
  stepper: { flexDirection: "row", alignItems: "center" },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnText: { fontSize: 20, fontFamily: uiFont(600), lineHeight: 22 },
  stepValue: {
    minWidth: 74,
    textAlign: "center",
    fontSize: 14,
    fontFamily: uiFont(600),
    paddingHorizontal: 6,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    marginTop: -40,
  },
  emptyHeading: { fontSize: 20, fontFamily: uiFont(700), marginBottom: 6 },
  emptySub: { fontSize: 15, textAlign: "center", lineHeight: 22, fontFamily: uiFont() },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 6,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontFamily: uiFont(700),
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowRef: { fontSize: 15, fontFamily: uiFont(600) },
  rowMeta: { fontSize: 12, marginTop: 2, fontFamily: uiFont() },
  deleteBtn: {
    marginLeft: 12,
    padding: 4,
  },
});
