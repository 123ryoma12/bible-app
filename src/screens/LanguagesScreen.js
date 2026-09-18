// Languages screen — biblical language vocabulary study.
// Tab bar mirrors the Memory screen pattern: underline tabs at the top.
// Greek (NT) is active; Hebrew (OT) is coming soon and shown greyed out.

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Switch,
} from "react-native";
import Slider from "@react-native-community/slider";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { AppSettingsButton } from "../components/AppSettingsModal";
import { useTheme } from "../theme/ThemeContext";
import { uiFont } from "../theme/fonts";
import {
  getVocabSettings,
  setVocabSettings,
  getTodayCardCount,
  getDailyCardHistory,
  getVocabPrefs,
  setVocabPrefs,
} from "../data/vocabStore";
import GreekVocabScreen from "./GreekVocabScreen";
import VocabChart from "./vocabulary/VocabChart";

export default function LanguagesScreen({ onChromeVisible }) {
  const { colors } = useTheme();

  // Daily goal
  const [goalCards, setGoalCards] = useState(0);
  const [todayCards, setTodayCards] = useState(0);
  const [showGoal, setShowGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState("");

  const [history, setHistory] = useState([]);
  const [isDrilling, setIsDrilling] = useState(false);
  const refreshGreekPrefsRef = React.useRef(null);

  const refreshGoal = useCallback(async () => {
    const [settings, today, hist] = await Promise.all([
      getVocabSettings(),
      getTodayCardCount(),
      getDailyCardHistory(14),
    ]);
    setGoalCards(settings.dailyGoalCards);
    setTodayCards(today);
    setHistory(hist);
  }, []);

  useEffect(() => { refreshGoal(); }, [refreshGoal]);

  async function saveGoal() {
    const parsed = parseInt(goalDraft, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      await setVocabSettings({ dailyGoalCards: parsed });
    } else if (goalDraft === "0" || goalDraft === "") {
      await setVocabSettings({ dailyGoalCards: 0 });
    }
    setShowGoal(false);
    refreshGoal();
  }

  const goalPct = goalCards > 0 ? Math.min(1, todayCards / goalCards) : 0;
  const goalMet = goalCards > 0 && todayCards >= goalCards;

  // Filter prefs
  const [showFilter, setShowFilter] = useState(false);
  const [filterPrefs, setFilterPrefs] = useState({ hideKnown: false, hideKnownThreshold: 90 });

  useEffect(() => {
    getVocabPrefs().then((p) => setFilterPrefs(p));
  }, []);

  async function handleToggleHideKnown(val) {
    const updated = await setVocabPrefs({ hideKnown: val });
    setFilterPrefs(updated);
    refreshGreekPrefsRef.current?.();
  }

  async function handleThresholdChange(val) {
    const rounded = Math.round(val);
    const updated = await setVocabPrefs({ hideKnownThreshold: rounded });
    setFilterPrefs(updated);
    refreshGreekPrefsRef.current?.();
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      {/* Header + goal bar + chart — all hidden while drilling */}
      {!isDrilling && (
        <>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: colors.text }]}>Vocabulary</Text>
            <View style={styles.headerActions}>
              <AppSettingsButton />
              <TouchableOpacity
                onPress={() => setShowFilter(true)}
                hitSlop={hit}
                accessibilityLabel="Filter vocabulary"
              >
                <Ionicons
                  name="options-outline"
                  size={22}
                  color={filterPrefs.hideKnown ? colors.accent : colors.mutedText}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setGoalDraft(goalCards > 0 ? String(goalCards) : ""); setShowGoal(true); }}
                hitSlop={hit}
                accessibilityLabel="Daily card goal"
              >
                <MaterialCommunityIcons
                  name="flag-outline"
                  size={22}
                  color={goalCards > 0 ? colors.accent : colors.mutedText}
                />
              </TouchableOpacity>
            </View>
          </View>

          {goalCards > 0 ? (
            <View style={styles.goalBlock}>
              <View style={styles.goalRow}>
                <Text style={[styles.goalValue, { color: colors.text }]}>
                  {todayCards}
                  <Text style={[styles.goalTarget, { color: colors.secondaryText }]}>
                    {` / ${goalCards} card${goalCards === 1 ? "" : "s"} today`}
                  </Text>
                </Text>
                {goalMet && (
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
          ) : null}

          <VocabChart history={history} goalCards={goalCards} />
        </>
      )}

      {/* Filter modal */}
      <Modal
        visible={showFilter}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFilter(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowFilter(false)}
        >
          <TouchableOpacity
            style={[styles.modalCard, { backgroundColor: colors.surface }]}
            activeOpacity={1}
            onPress={() => {}}
          >
            <Text style={[styles.modalTitle, { color: colors.surfaceText }]}>
              Filter
            </Text>

            {/* Hide known toggle */}
            <View style={[styles.filterRow, { borderBottomColor: colors.border }]}>
              <View style={styles.filterRowText}>
                <Text style={[styles.filterRowLabel, { color: colors.text }]}>
                  Hide words I know well
                </Text>
                <Text style={[styles.filterRowSub, { color: colors.mutedText }]}>
                  Skips words at or above the threshold
                </Text>
              </View>
              <Switch
                value={filterPrefs.hideKnown}
                onValueChange={handleToggleHideKnown}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor="#fff"
              />
            </View>

            {/* Threshold slider — only shown when hideKnown is on */}
            {filterPrefs.hideKnown ? (
              <View style={[styles.filterRow, { borderBottomColor: colors.border, flexDirection: "column", alignItems: "stretch" }]}>
                <View style={styles.filterThresholdHeader}>
                  <Text style={[styles.filterRowLabel, { color: colors.text }]}>
                    Threshold
                  </Text>
                  <Text style={[styles.filterThresholdValue, { color: colors.accent }]}>
                    {filterPrefs.hideKnownThreshold ?? 90}%
                  </Text>
                </View>
                <Text style={[styles.filterRowSub, { color: colors.mutedText, marginBottom: 8 }]}>
                  Hide words with correct rate at or above this value
                </Text>
                <Slider
                  minimumValue={1}
                  maximumValue={100}
                  step={1}
                  value={filterPrefs.hideKnownThreshold ?? 90}
                  onValueChange={handleThresholdChange}
                  minimumTrackTintColor={colors.accent}
                  maximumTrackTintColor={colors.border}
                  thumbTintColor={colors.accent}
                />
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.modalSave, { borderTopColor: colors.border }]}
              onPress={() => { setShowFilter(false); refreshGreekPrefsRef.current?.(); }}
            >
              <Text style={[styles.modalSaveText, { color: colors.accent }]}>Done</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Goal modal */}
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
              Daily card goal
            </Text>
            <Text style={[styles.modalNote, { color: colors.secondaryText }]}>
              How many vocabulary cards you'd like to drill each day.
            </Text>
            <View style={styles.modalInputRow}>
              <TextInput
                value={goalDraft}
                onChangeText={(t) => setGoalDraft(t.replace(/[^0-9]/g, ""))}
                keyboardType="number-pad"
                style={[
                  styles.modalInput,
                  { color: colors.text, backgroundColor: colors.background },
                ]}
                accessibilityLabel="Daily goal in cards"
                placeholder="0"
                placeholderTextColor={colors.mutedText}
              />
              <Text style={[styles.modalSuffix, { color: colors.secondaryText }]}>
                cards
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

      {/* Greek vocabulary screen */}
      <GreekVocabScreen
        onDrillStart={() => { setIsDrilling(true); onChromeVisible?.(false); }}
        onDrillEnd={() => { setIsDrilling(false); onChromeVisible?.(true); refreshGoal(); }}
        onRefreshPrefs={(fn) => { refreshGreekPrefsRef.current = fn; }}
      />
    </SafeAreaView>
  );
}

const hit = { top: 10, bottom: 10, left: 10, right: 10 };

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
  },
  title: { fontSize: 28, fontFamily: uiFont(700) },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 16 },

  // Goal progress
  goalBlock: { paddingHorizontal: 20, paddingBottom: 10 },
  goalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  goalValue: { fontSize: 15, fontFamily: uiFont(600) },
  goalTarget: { fontSize: 14, fontFamily: uiFont(400) },
  goalTrack: { height: 3, borderRadius: 2, overflow: "hidden" },
  goalFill: { height: 3, borderRadius: 2 },

  // Filter modal rows
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterRowText: { flex: 1, paddingRight: 12 },
  filterRowLabel: { fontSize: 15, fontFamily: uiFont(500), marginBottom: 2 },
  filterRowSub: { fontSize: 12, fontFamily: uiFont(400) },
  filterThresholdHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  filterThresholdValue: { fontSize: 15, fontFamily: uiFont(700) },

  // Goal modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCard: {
    width: 300,
    borderRadius: 14,
    overflow: "hidden",
  },
  modalTitle: {
    fontSize: 17,
    fontFamily: uiFont(600),
    textAlign: "center",
    paddingTop: 20,
    paddingBottom: 4,
    paddingHorizontal: 20,
  },
  modalNote: {
    fontSize: 13,
    fontFamily: uiFont(400),
    textAlign: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    lineHeight: 18,
  },
  modalInputRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  modalInput: {
    width: 80,
    height: 44,
    borderRadius: 8,
    textAlign: "center",
    fontSize: 20,
    fontFamily: uiFont(600),
    paddingHorizontal: 8,
  },
  modalSuffix: { fontSize: 15, fontFamily: uiFont(400) },
  modalSave: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalSaveText: { fontSize: 17, fontFamily: uiFont(600) },
});
