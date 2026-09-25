import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { AppSettingsButton } from "../components/AppSettingsModal";
import { useTheme } from "../theme/ThemeContext";
import { uiFont } from "../theme/fonts";
import { appAlert } from "../utils/appAlert";
import { useScreenBackHandler } from "../navigation/BackHandlerRegistry";
import {
  STATUS,
  getMemoryList,
  removeMemory,
  referenceLabel,
  successCount,
  resortMemory,
  getMemorySettings,
  setMemorySettings,
  getDailyReviewCount,
  getDailyReviewHistory,
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
import MemoryChart from "./memory/MemoryChart";

const HISTORY_DAYS = 14;

// Memory tab: verse-memorisation sets split across two tabs - "Memorised" (a
// practice queue ordered weakest-first, so the verse most in need of review
// sits at the top - see memorisedScore in memoryStore.js) and "Not Memorised"
// (still learning). From here you can add a new set, start a drill on one, or
// delete one. All persistence lives in memoryStore.js (localStorage now,
// Firebase-ready later).
// @param drillRequest - set by App when the Memory widget is tapped:
//   { token, id }. `token` is unique per tap so repeated taps on the same verse
//   still re-open the drill; `id` is the set the widget was advertising.
export default function MemoryScreen({ drillRequest = null }) {
  const { colors } = useTheme();
  const [view, setView] = useState("list"); // "list" | "add" | "drill"
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  // Which list is showing. Defaults to Memorised: that's the revision queue you
  // open day to day, and it's what the daily goal and the widget track.
  const [tab, setTab] = useState("memorised");

  // Prioritisation modal
  const [showPriority, setShowPriority] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [prefs, setPrefs] = useState(null);

  // Daily revision goal — mirrors the prayer tab, but counts verses not minutes.
  const [goalVerses, setGoalVerses] = useState(0);
  const [todayReviewed, setTodayReviewed] = useState(0);
  const [history, setHistory] = useState([]);
  const [showGoal, setShowGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState("");

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
    appAlert(
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
    const [list, settings, reviewed, days] = await Promise.all([
      getMemoryList(),
      getMemorySettings(),
      getDailyReviewCount(),
      getDailyReviewHistory(HISTORY_DAYS),
    ]);
    setEntries(list);
    setGoalVerses(settings.dailyGoalVerses);
    setTodayReviewed(reviewed);
    setHistory(days);
    setLoading(false);
  }, []);

  const goalPct = goalVerses > 0 ? Math.min(1, todayReviewed / goalVerses) : 0;

  async function saveGoal() {
    const parsed = Number.parseInt(goalDraft, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      await setMemorySettings({ dailyGoalVerses: parsed });
    }
    setShowGoal(false);
    refresh();
  }

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Widget tap: drop straight into the drill for the verse the widget showed.
  // The list is re-read rather than reusing `entries`, because on a cold launch
  // this screen may be mounting for the first time and have nothing loaded yet.
  // If that verse has since been deleted we fall back to whatever now tops the
  // review queue, and if nothing is memorised at all we simply stay on the list
  // rather than drilling a set the user is still learning.
  const drillToken = drillRequest?.token ?? null;
  const drillId = drillRequest?.id ?? null;
  useEffect(() => {
    if (drillToken == null) return;
    let cancelled = false;

    (async () => {
      const list = await getMemoryList();
      if (cancelled) return;
      setEntries(list);
      setLoading(false);

      const requested = drillId ? list.findIndex((e) => e.id === drillId) : -1;
      const startIndex = requested >= 0
        ? requested
        : list.findIndex((e) => e.status === STATUS.MEMORISED);
      if (startIndex < 0) return;

      setDrillList(list);
      setDrillStartIndex(startIndex);
      setView("drill");
    })();

    return () => { cancelled = true; };
  }, [drillToken, drillId]);

  // `entries` is already fully ordered by the store (not-memorised group first,
  // then memorised ranked weakest-first). Split that flat, ordered list into the
  // two tabs without re-sorting, so the drill's flat index stays in lock-step
  // with what's on screen. We also stash each row's index in the flat list
  // (`flatIndex`) so tapping a row starts the drill at the right place.
  const { memorised, notMemorised, memorisedVerseCount } = useMemo(() => {
    const memorisedRows = [];
    const notMemorisedRows = [];
    entries.forEach((entry, flatIndex) => {
      const row = { entry, flatIndex };
      if (entry.status === STATUS.MEMORISED) memorisedRows.push(row);
      else notMemorisedRows.push(row);
    });

    return {
      memorised: memorisedRows,
      notMemorised: notMemorisedRows,
      memorisedVerseCount: memorisedRows.reduce(
        (total, row) => total + (row.entry.verses?.length || 0),
        0
      ),
    };
  }, [entries]);

  const rows = tab === "memorised" ? memorised : notMemorised;

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
    appAlert(
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
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.text }]}>Memory</Text>
        <View style={styles.headerActions}>
          <AppSettingsButton />
          <TouchableOpacity
            onPress={() => setShowPriority(true)}
            hitSlop={hit}
            accessibilityLabel="Prioritisation settings"
          >
            <Ionicons name="options-outline" size={22} color={colors.mutedText} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setGoalDraft(String(goalVerses)); setShowGoal(true); }}
            hitSlop={hit}
            accessibilityLabel="Daily revision goal"
          >
            <MaterialCommunityIcons
              name="flag-outline"
              size={22}
              color={goalVerses > 0 ? colors.accent : colors.mutedText}
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setView("add")} hitSlop={hit} accessibilityLabel="Add verse">
            <Ionicons name="add-circle-outline" size={26} color={colors.accent} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Daily goal progress — counts distinct verses revised today. */}
      <View style={styles.goalBlock}>
        <View style={styles.goalRow}>
          <Text style={[styles.goalValue, { color: colors.text }]}>
            {todayReviewed}
            <Text style={[styles.goalTarget, { color: colors.secondaryText }]}>
              {` / ${goalVerses} verse${goalVerses === 1 ? "" : "s"} today`}
            </Text>
          </Text>
          {goalVerses > 0 && todayReviewed >= goalVerses && (
            <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
          )}
        </View>
        <View style={[styles.goalTrack, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.goalFill,
              { width: `${goalPct * 100}%`, backgroundColor: colors.accent },
            ]}
          />
        </View>
      </View>

      <Modal
        visible={showGoal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGoal(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowGoal(false)}
        >
          <TouchableOpacity
            style={[styles.modalCard, { backgroundColor: colors.surface }]}
            activeOpacity={1}
            onPress={() => {}}
          >
            <Text style={[styles.modalTitle, { color: colors.surfaceText }]}>
              Daily revision goal
            </Text>
            <Text style={[styles.modalNote, { color: colors.secondaryText }]}>
              How many verses you'd like to revise each day. Each verse counts
              once per day, however many times you drill it.
            </Text>
            <View style={styles.modalInputRow}>
              <TextInput
                value={goalDraft}
                onChangeText={(text) => setGoalDraft(text.replace(/[^0-9]/g, ""))}
                keyboardType="number-pad"
                style={[
                  styles.modalInput,
                  { color: colors.text, backgroundColor: colors.background },
                ]}
                accessibilityLabel="Daily goal in verses"
              />
              <Text style={[styles.modalSuffix, { color: colors.secondaryText }]}>
                verses
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.modalSave, { borderTopColor: colors.border }]}
              onPress={saveGoal}
            >
              <Text style={[styles.modalSaveText, { color: colors.accent }]}>Save</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={showPriority}
        transparent
        animationType="fade"
        onRequestClose={() => { setShowPriority(false); setShowAdvanced(false); }}
      >
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
            <ScrollView bounces={false}>
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
                >
                  <Text style={[styles.modalRowLabel, { color: colors.danger }]}>Reset to Defaults</Text>
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
      </Modal>

      {loading ? null : entries.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyHeading, { color: colors.text }]}>
            No memory verses yet
          </Text>
          <Text style={[styles.emptySub, { color: colors.secondaryText }]}>
            Tap the + button above to choose a verse or a range of consecutive verses to
            start memorising.
          </Text>
        </View>
      ) : (
        <MemoryList
          tab={tab}
          setTab={setTab}
          rows={rows}
          memorised={memorised}
          notMemorised={notMemorised}
          memorisedVerseCount={memorisedVerseCount}
          history={history}
          goalVerses={goalVerses}
          colors={colors}
          onDrill={(flatIndex) => {
            // Snapshot the current order and start where the user tapped. The
            // index is into the full flat list, not the visible tab, so the
            // drill still auto-advances through everything from that point.
            setDrillList(entries);
            setDrillStartIndex(flatIndex);
            setView("drill");
          }}
          onDelete={confirmDelete}
        />
      )}
    </SafeAreaView>
  );
}

/**
 * Tabbed verse list. "Memorised" is the revision queue; "Not Memorised" is
 * what's still being learned. Both are slices of the same store-ordered list,
 * so switching tabs never re-sorts anything.
 */
function MemoryList({
  tab,
  setTab,
  rows,
  memorised,
  notMemorised,
  memorisedVerseCount,
  history,
  goalVerses,
  colors,
  onDrill,
  onDelete,
}) {
  return (
    <>
      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        {[
          { key: "memorised", label: "Memorised", count: memorised.length },
          { key: "not_memorised", label: "Not Memorised", count: notMemorised.length },
        ].map((t) => {
          const selected = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[
                styles.tab,
                selected && { borderBottomColor: colors.accent, borderBottomWidth: 2 },
              ]}
              onPress={() => setTab(t.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <Text
                style={[
                  styles.tabText,
                  {
                    color: selected ? colors.accent : colors.secondaryText,
                    fontFamily: selected ? uiFont(700) : uiFont(500),
                  },
                ]}
              >
                {t.label} ({t.count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Chart and verse total scroll away with the list, as the prayer tab's
          chart does — the tabs above stay put so you can always switch. Using
          ListEmptyComponent rather than branching keeps the chart on screen
          when a tab has no rows. */}
      <FlatList
        data={rows}
        keyExtractor={(row) => row.entry.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListHeaderComponent={
          <>
            <MemoryChart history={history} goalVerses={goalVerses} />
            {/* The tab count is sets; a set can span several consecutive
                verses, so the verse total is worth showing separately. */}
            {tab === "memorised" && memorised.length > 0 && (
              <Text style={[styles.tabMeta, { color: colors.secondaryText }]}>
                {memorisedVerseCount} verse{memorisedVerseCount === 1 ? "" : "s"} memorised
              </Text>
            )}
          </>
        }
        ListEmptyComponent={
          <View style={styles.listEmpty}>
            <Text style={[styles.emptySub, { color: colors.secondaryText }]}>
              {tab === "memorised"
                ? "Nothing memorised yet. Work through the Not Memorised tab and verses will move here as you learn them."
                : "Nothing outstanding — every verse you've added is memorised."}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <MemoryRow
            entry={item.entry}
            colors={colors}
            onPress={() => onDrill(item.flatIndex)}
            onLongPress={() => onDelete(item.entry)}
            onDelete={() => onDelete(item.entry)}
          />
        )}
      />
    </>
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
  // The last SUCCESS, not the last practice: that is the date the practice
  // queue actually ranks on (failures are not recorded at all), so showing
  // anything else would contradict the row's position in the list.
  const date = entry.lastSuccessAt ? new Date(entry.lastSuccessAt) : null;
  if (!date || Number.isNaN(date.getTime())) return "never recalled";

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}


const hit = { top: 10, bottom: 10, left: 10, right: 10 };

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
  },
  headerSettingsLeft: {
    position: "absolute",
    left: 20,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    zIndex: 1,
  },
  title: { fontSize: 28, fontFamily: uiFont(700) },
  addLink: { fontSize: 16, fontFamily: uiFont(600) },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 22 },

  goalBlock: { paddingHorizontal: 20, paddingBottom: 10 },
  goalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  goalValue: { fontSize: 15, fontFamily: uiFont(600) },
  goalTarget: { fontSize: 14, fontFamily: uiFont(400) },
  goalTrack: { height: 3, borderRadius: 2, overflow: "hidden" },
  goalFill: { height: 3, borderRadius: 2 },

  modalInputRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 18,
  },
  modalInput: {
    width: 90,
    borderRadius: 10,
    paddingVertical: 10,
    textAlign: "center",
    fontSize: 18,
    fontFamily: uiFont(600),
  },
  modalSuffix: { fontSize: 15, fontFamily: uiFont(400) },
  modalSave: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalSaveText: { fontSize: 15, fontFamily: uiFont(700) },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    maxHeight: 560,
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
  modalCancel: { borderTopWidth: 1, paddingVertical: 14, alignItems: "center" },
  modalCancelText: { fontSize: 15, fontFamily: uiFont(600) },
  chevron: { fontSize: 22, fontFamily: uiFont(400) },
  radioOuter: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2,
    alignItems: "center", justifyContent: "center",
  },
  radioInner: { width: 12, height: 12, borderRadius: 6 },
  prefRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  prefText: { flex: 1, paddingRight: 12 },
  stepper: { flexDirection: "row", alignItems: "center" },
  stepBtn: {
    width: 34, height: 34, borderRadius: 8, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center",
  },
  stepBtnText: { fontSize: 20, fontFamily: uiFont(600), lineHeight: 22 },
  stepValue: {
    minWidth: 74, textAlign: "center", fontSize: 14,
    fontFamily: uiFont(600), paddingHorizontal: 6,
  },
  // Screen-level empty state: centred in the whole tab.
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    marginTop: -40,
  },
  // Empty state *inside* the list, sitting below the chart. Flows normally —
  // `empty`'s flex and negative margin would pull it up under the header.
  listEmpty: {
    alignItems: "center",
    paddingHorizontal: 32,
    paddingTop: 32,
  },
  emptyHeading: { fontSize: 20, fontFamily: uiFont(700), marginBottom: 6 },
  emptySub: { fontSize: 15, textAlign: "center", lineHeight: 22, fontFamily: uiFont() },
  tabs: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabText: { fontSize: 14 },
  tabMeta: {
    fontSize: 12,
    fontFamily: uiFont(),
    paddingHorizontal: 20,
    paddingTop: 10,
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
