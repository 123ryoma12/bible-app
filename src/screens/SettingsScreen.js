import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeContext";
import { uiFont } from "../theme/fonts";
import { exportBackup, importBackup } from "../data/backupStore";
import { BUILD_DATE, BUILD_COMMIT, APP_VERSION } from "../data/buildInfo";
import { appAlert } from "../utils/appAlert";

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
  const { colors } = useTheme();
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
      appAlert(
        "Backup ready",
        `Saved ${res.keyCount} item${res.keyCount === 1 ? "" : "s"} of data. ` +
          "Keep the file somewhere safe to restore it later.",
        [{ text: "OK" }]
      );
    } catch (e) {
      appAlert("Backup failed", e.message || "Something went wrong.", [{ text: "OK" }]);
    } finally {
      setBusy("idle");
    }
  }

  // Restore is destructive (replace all), so confirm first, then pick + apply.
  function handleRestore() {
    if (busy !== "idle") return;
    appAlert(
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
      appAlert(
        "Restore complete",
        `Restored ${res.keyCount} item${res.keyCount === 1 ? "" : "s"}. ` +
          "Please close and reopen the app to see all restored data and settings.",
        [{ text: "OK" }]
      );
    } catch (e) {
      appAlert("Restore failed", e.message || "Something went wrong.", [{ text: "OK" }]);
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

        {/* Data: local backup & restore. All app data lives on this device;
            these let the user save a JSON backup file and restore it later or
            on another device. */}
        <SectionHeader title="Data" colors={colors} first />

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
        <SectionHeader title="About" colors={colors} />
        <View style={styles.buildInfo}>
          <Text style={[styles.buildInfoRow, { color: colors.mutedText }]}>
            Version {APP_VERSION}
          </Text>
          <Text style={[styles.buildInfoRow, { color: colors.mutedText }]}>
            Built {BUILD_DATE} · {BUILD_COMMIT}
          </Text>
        </View>

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
  buildInfo: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 4,
  },
  buildInfoRow: {
    fontSize: 13,
    fontFamily: uiFont(400),
    lineHeight: 18,
  },
  dataNote: {
    fontSize: 12,
    fontFamily: uiFont(400),
    lineHeight: 17,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
});
