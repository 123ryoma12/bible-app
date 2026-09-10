import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeContext";
import { uiFont } from "../theme/fonts";
import { exportBackup, importBackup } from "../data/backupStore";
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
import { resortMemory } from "../data/memoryStore";

const APPEARANCE_OPTIONS = [
  { key: "light", label: "Light Mode" },
  { key: "dark", label: "Dark Mode" },
];

// A section heading. Every section except the first is preceded by a full-width
// divider line with consistent spacing above/below, so groups are separated
// identically regardless of what element (row, card, etc.) came before. The
// divider is its OWN element (not a border on the text) so it can't collide
// with a preceding view's margins.
// A small centered popup used for choices that would otherwise expand a long
// list inline (reading font, Bible version). Keeps the main Settings list
// short - options only appear once the user asks to change them.
function PickerModal({ visible, title, onClose, colors, children, dismissLabel = "Cancel" }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable
          style={[styles.modalCard, { backgroundColor: colors.surface }]}
          onPress={() => {}}
        >
          <Text style={[styles.modalTitle, { color: colors.surfaceText }]}>{title}</Text>
          <ScrollView style={styles.modalOptions} bounces={false}>
            {children}
          </ScrollView>
          <TouchableOpacity
            style={[styles.modalCancel, { borderTopColor: colors.border }]}
            onPress={onClose}
            accessibilityRole="button"
          >
            <Text style={[styles.modalCancelText, { color: colors.accent }]}>{dismissLabel}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SectionHeader({ title, colors, first = false }) {
  return (
    <>
      {!first && (
        <View style={[styles.sectionDivider, { borderTopColor: colors.border }]} />
      )}
      <Text style={[styles.sectionLabel, { color: colors.text }]}>{title}</Text>
    </>
  );
}

export default function SettingsScreen() {
  const { mode, setMode, colors } = useTheme();
  // "idle" | "backing-up" | "restoring" - drives the row spinners and disables
  // both actions while one is running.
  const [busy, setBusy] = useState("idle");
  const [showPriorityOptions, setShowPriorityOptions] = useState(false);

  // --- Memory prioritisation ---
  // Local mirror of the persisted prefs so the UI updates instantly; every edit
  // is written through to storage and the Memory list is re-sorted.
  const [prefs, setPrefs] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMemoryPrefs().then((p) => {
      if (!cancelled) setPrefs(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The preset the current prefs correspond to ("custom" if hand-tuned).
  const activePreset = prefs ? presetForPrefs(prefs) : "balanced";

  // Persist + re-sort after any prefs change, refreshing the local mirror.
  async function commitPrefs(next) {
    setPrefs(next); // optimistic
    await resortMemory();
  }

  async function handlePreset(presetKey) {
    const next = await applyPreset(presetKey);
    await commitPrefs(next);
  }

  // Nudge a single advanced field by +/- one step, clamped to its bounds. The
  // field metadata handles the display<->stored unit conversion (percentages).
  async function handleStep(field, direction) {
    if (!prefs) return;
    const current = field.fromStored
      ? field.fromStored(prefs[field.key])
      : prefs[field.key];
    const raw = current + direction * field.step;
    const clamped = Math.min(field.max, Math.max(field.min, raw));
    if (clamped === current) return; // already at the bound
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

  // Write a backup file and hand it to the OS share sheet.
  async function handleBackup() {
    if (busy !== "idle") return;
    setBusy("backing-up");
    try {
      const res = await exportBackup();
      // shareAsync resolves once the sheet is dismissed; a light confirmation
      // is enough since the user has already seen the system UI.
      Alert.alert(
        "Backup ready",
        `Saved ${res.keyCount} item${res.keyCount === 1 ? "" : "s"} of data. ` +
          "Keep the file somewhere safe to restore it later.",
        [{ text: "OK" }]
      );
    } catch (e) {
      Alert.alert("Backup failed", e.message || "Something went wrong.", [{ text: "OK" }]);
    } finally {
      setBusy("idle");
    }
  }

  // Restore is destructive (replace all), so confirm first, then pick + apply.
  function handleRestore() {
    if (busy !== "idle") return;
    Alert.alert(
      "Restore from backup?",
      "This replaces ALL current data on this device - reading progress, history, " +
        "memory verses and settings - with the contents of the backup file. This " +
        "can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Choose file", style: "destructive", onPress: runRestore },
      ]
    );
  }

  async function runRestore() {
    setBusy("restoring");
    try {
      const res = await importBackup();
      if (res.canceled) return; // user backed out of the picker
      Alert.alert(
        "Restore complete",
        `Restored ${res.keyCount} item${res.keyCount === 1 ? "" : "s"}. ` +
          "Please close and reopen the app to see all restored data and settings.",
        [{ text: "OK" }]
      );
    } catch (e) {
      Alert.alert("Restore failed", e.message || "Something went wrong.", [{ text: "OK" }]);
    } finally {
      setBusy("idle");
    }
  }

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <Text style={[styles.title, { color: colors.text }]}>Settings</Text>

        {/* Appearance */}
        <SectionHeader title="Appearance" colors={colors} first />
        <View style={[styles.appearanceToggle, { borderColor: colors.border }]}>
          {APPEARANCE_OPTIONS.map((opt) => {
            const isActive = mode === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.appearanceOption,
                  { backgroundColor: isActive ? colors.accent : "transparent" },
                ]}
                onPress={() => setMode(opt.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={opt.label}
              >
                <Text style={[styles.appearanceOptionText, { color: isActive ? colors.accentContrast : colors.text }]}>
                  {opt.key === "light" ? "Light" : "Dark"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <SectionHeader title="Memory Prioritisation" colors={colors} />
        <TouchableOpacity
          style={[styles.row, { borderBottomColor: colors.border }]}
          onPress={() => setShowPriorityOptions(true)}
          disabled={!prefs}
          accessibilityRole="button"
          accessibilityLabel={`Memory prioritisation, ${PRESET_LABELS[activePreset]}. Opens prioritisation picker.`}
        >
          <View style={styles.actionRowText}>
            <Text style={[styles.rowText, { color: colors.text }]}>Memory Prioritisation</Text>
            <Text style={[styles.actionSubtext, { color: colors.mutedText }]}>
              {PRESET_LABELS[activePreset]} · {PRESET_DESCRIPTIONS[activePreset]}
            </Text>
          </View>
          <Text style={[styles.chevron, { color: colors.mutedText }]}>›</Text>
        </TouchableOpacity>

        <PickerModal
          visible={showPriorityOptions}
          title="Memory Prioritisation"
          dismissLabel="Close"
          colors={colors}
          onClose={() => {
            setShowPriorityOptions(false);
            setShowAdvanced(false);
          }}
        >
          <Text style={[styles.modalNote, { color: colors.mutedText }]}>
            Choose how the Memory tab decides which verses to practise first.
          </Text>
          {PRESET_ORDER.map((key) => {
            const isActive = activePreset === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.row, { borderBottomColor: colors.border }]}
                onPress={() => handlePreset(key)}
                disabled={!prefs}
                accessibilityRole="radio"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={`${PRESET_LABELS[key]}. ${PRESET_DESCRIPTIONS[key]}`}
              >
                <View style={styles.actionRowText}>
                  <Text style={[styles.rowText, { color: colors.text }]}>
                    {PRESET_LABELS[key]}
                  </Text>
                  <Text style={[styles.actionSubtext, { color: colors.mutedText }]}>
                    {PRESET_DESCRIPTIONS[key]}
                  </Text>
                </View>
                <View
                  style={[
                    styles.radioOuter,
                    { borderColor: isActive ? colors.accent : colors.border },
                  ]}
                >
                  {isActive && <View style={[styles.radioInner, { backgroundColor: colors.accent }]} />}
                </View>
              </TouchableOpacity>
            );
          })}

          {activePreset === "custom" && (
            <View style={[styles.row, { borderBottomColor: colors.border }]}>
              <View style={styles.actionRowText}>
                <Text style={[styles.rowText, { color: colors.text }]}>{PRESET_LABELS.custom}</Text>
                <Text style={[styles.actionSubtext, { color: colors.mutedText }]}>
                  {PRESET_DESCRIPTIONS.custom}
                </Text>
              </View>
              <View style={[styles.radioOuter, { borderColor: colors.accent }]}>
                <View style={[styles.radioInner, { backgroundColor: colors.accent }]} />
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[styles.row, { borderBottomColor: colors.border, marginTop: 8 }]}
            onPress={() => setShowAdvanced((value) => !value)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showAdvanced }}
          >
            <Text style={[styles.rowText, { color: colors.text }]}>Advanced tuning</Text>
            <Text style={[styles.chevron, { color: colors.mutedText }]}>{showAdvanced ? "⌃" : "›"}</Text>
          </TouchableOpacity>

          {showAdvanced && prefs && PREF_FIELDS.map((field) => {
            const display = field.fromStored
              ? field.fromStored(prefs[field.key])
              : prefs[field.key];
            const atMin = display <= field.min;
            const atMax = display >= field.max;
            return (
              <View key={field.key} style={[styles.prefRow, { borderBottomColor: colors.border }]}>
                <View style={styles.prefText}>
                  <Text style={[styles.rowText, { color: colors.text }]}>{field.label}</Text>
                  <Text style={[styles.actionSubtext, { color: colors.mutedText }]}>{field.help}</Text>
                </View>
                <View style={styles.stepper}>
                  <TouchableOpacity
                    style={[styles.stepBtn, { borderColor: colors.border, opacity: atMin ? 0.35 : 1 }]}
                    onPress={() => handleStep(field, -1)}
                    disabled={atMin}
                    accessibilityRole="button"
                    accessibilityLabel={`Decrease ${field.label}`}
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
                    accessibilityRole="button"
                    accessibilityLabel={`Increase ${field.label}`}
                  >
                    <Text style={[styles.stepBtnText, { color: colors.text }]}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          {showAdvanced && (
            <TouchableOpacity
              style={[styles.row, { borderBottomColor: colors.border }]}
              onPress={handleResetPrefs}
              accessibilityRole="button"
              accessibilityLabel="Reset prioritisation to defaults"
            >
              <Text style={[styles.rowText, { color: colors.danger || "#c0392b" }]}>Reset to Defaults</Text>
              <Text style={[styles.chevron, { color: colors.mutedText }]}>↺</Text>
            </TouchableOpacity>
          )}
        </PickerModal>

        {/* Data: local backup & restore. All app data lives on this device;
            these let the user save a JSON backup file and restore it later or
            on another device. */}
        <SectionHeader title="Data" colors={colors} />

        <TouchableOpacity
          style={[styles.row, { borderBottomColor: colors.border }]}
          onPress={handleBackup}
          disabled={busy !== "idle"}
          accessibilityRole="button"
          accessibilityLabel="Back up data"
        >
          <View style={styles.actionRowText}>
            <Text style={[styles.rowText, { color: colors.text }]}>Back Up Data</Text>
            <Text style={[styles.actionSubtext, { color: colors.mutedText }]}>
              Save all your data to a file you can keep or share
            </Text>
          </View>
          {busy === "backing-up" ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Text style={[styles.chevron, { color: colors.mutedText }]}>›</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.row, { borderBottomColor: colors.border }]}
          onPress={handleRestore}
          disabled={busy !== "idle"}
          accessibilityRole="button"
          accessibilityLabel="Restore data from backup"
        >
          <View style={styles.actionRowText}>
            <Text style={[styles.rowText, { color: colors.text }]}>Restore Data</Text>
            <Text style={[styles.actionSubtext, { color: colors.mutedText }]}>
              Replace all current data with a backup file
            </Text>
          </View>
          {busy === "restoring" ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Text style={[styles.chevron, { color: colors.mutedText }]}>›</Text>
          )}
        </TouchableOpacity>

        <Text style={[styles.dataNote, { color: colors.mutedText }]}>
          Your data is stored only on this device. Back it up regularly so you don't
          lose your progress if you change or reset your phone.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  title: {
    fontSize: 28,
    fontFamily: uiFont(700),
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  // Full-width divider between sections. Its own element (with symmetric top
  // margin) so spacing is identical no matter what precedes it - a row, a card,
  // etc. - and it never collides with a preceding view's margin.
  // Use a borderTop hairline (the reliable pattern used by every row separator
  // in this app) rather than a height+backgroundColor line, which can round
  // down to 0 physical pixels and vanish on some screen densities. Full-bleed:
  // edge-to-edge with no side margins for a stronger section break.
  sectionDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 24,
  },
  sectionLabel: {
    fontSize: 15,
    fontFamily: uiFont(700),
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
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
  modalOptions: {
    flexGrow: 0,
  },
  modalNote: {
    fontSize: 13,
    fontFamily: uiFont(400),
    lineHeight: 18,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  modalCancel: {
    borderTopWidth: 1,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalCancelText: {
    fontSize: 15,
    fontFamily: uiFont(600),
  },
  appearanceToggle: {
    flexDirection: "row",
    marginHorizontal: 20,
    borderWidth: 1,
    borderRadius: 12,
    padding: 3,
  },
  appearanceOption: {
    flex: 1,
    minHeight: 42,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  appearanceOptionText: {
    fontSize: 14,
    fontFamily: uiFont(600),
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { fontSize: 17, fontFamily: uiFont(400) },
  actionRowText: { flex: 1, paddingRight: 12 },
  actionSubtext: { fontSize: 13, fontFamily: uiFont(400), marginTop: 2 },
  chevron: { fontSize: 22, fontFamily: uiFont(400) },
  dataNote: {
    fontSize: 12,
    fontFamily: uiFont(400),
    lineHeight: 17,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
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
});
