import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme, FONT_SCALES } from "../theme/ThemeContext";
import { uiFont, FONT_FAMILIES } from "../theme/fonts";
import { exportBackup, importBackup } from "../data/backupStore";

const APPEARANCE_OPTIONS = [
  { key: "light", label: "Light Mode" },
  { key: "dark", label: "Dark Mode" },
];

// Base size the preview line uses; scaled by the selected fontScale so the user
// can see the effect of their choice immediately.
const PREVIEW_BASE_SIZE = 17;

export default function SettingsScreen() {
  const { mode, setMode, colors, fontScale, setFontScale } = useTheme();
  // "idle" | "backing-up" | "restoring" - drives the row spinners and disables
  // both actions while one is running.
  const [busy, setBusy] = useState("idle");

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
        <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>Appearance</Text>
        {APPEARANCE_OPTIONS.map((opt) => {
          const isActive = mode === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[styles.row, { borderBottomColor: colors.border }]}
              onPress={() => setMode(opt.key)}
            >
              <Text style={[styles.rowText, { color: colors.text }]}>{opt.label}</Text>
              <View
                style={[
                  styles.radioOuter,
                  { borderColor: isActive ? colors.accent : colors.border },
                ]}
              >
                {isActive && (
                  <View style={[styles.radioInner, { backgroundColor: colors.accent }]} />
                )}
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Reading / font size */}
        <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>Reading</Text>
        <Text style={[styles.settingName, { color: colors.text }]}>Font Size</Text>

        <View style={styles.segmentRow}>
          {FONT_SCALES.map((opt) => {
            const isActive = fontScale === opt.value;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.segment,
                  {
                    borderColor: isActive ? colors.accent : colors.border,
                    backgroundColor: isActive ? colors.accent : "transparent",
                  },
                ]}
                onPress={() => setFontScale(opt.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={`Font size ${opt.label}`}
              >
                <Text
                  style={[
                    styles.segmentText,
                    { color: isActive ? colors.accentContrast : colors.text },
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Live preview so the choice is obvious before opening a chapter. */}
        <View style={[styles.previewCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.previewLabel, { color: colors.mutedText }]}>Preview</Text>
          <Text
            style={{
              color: colors.surfaceText,
              fontFamily: FONT_FAMILIES.serifRegular,
              fontSize: PREVIEW_BASE_SIZE * fontScale,
              lineHeight: PREVIEW_BASE_SIZE * fontScale * 1.55,
            }}
          >
            <Text
              style={{
                color: colors.accent,
                fontFamily: FONT_FAMILIES.serifSemiBold,
                fontSize: 11 * fontScale,
              }}
            >
              {"1 "}
            </Text>
            In the beginning God created the heavens and the earth.
          </Text>
        </View>

        {/* Data: local backup & restore. All app data lives on this device;
            these let the user save a JSON backup file and restore it later or
            on another device. */}
        <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>Data</Text>

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
  sectionLabel: {
    fontSize: 13,
    fontFamily: uiFont(700),
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 6,
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
  settingName: {
    fontSize: 17,
    fontFamily: uiFont(400),
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 4,
  },
  segmentRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingTop: 6,
    gap: 8,
  },
  segment: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentText: { fontSize: 13, fontFamily: uiFont(600), textAlign: "center" },
  previewCard: {
    marginHorizontal: 20,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
  },
  previewLabel: {
    fontSize: 11,
    fontFamily: uiFont(700),
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
});
