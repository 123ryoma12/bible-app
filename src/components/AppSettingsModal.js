import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeContext";
import { uiFont } from "../theme/fonts";
import { exportBackup, importBackup } from "../data/backupStore";
import { BUILD_DATE, BUILD_COMMIT, APP_VERSION } from "../data/buildInfo";
import { appAlert } from "../utils/appAlert";

// ---------------------------------------------------------------------------
// Trigger button — drop this wherever you want the icon to appear
// ---------------------------------------------------------------------------
export function AppSettingsButton({ color }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="App settings"
      >
        <Ionicons
          name="archive-outline"
          size={22}
          color={color ?? colors.mutedText}
        />
      </TouchableOpacity>
      <AppSettingsModal visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Modal — backup/restore + version info
// ---------------------------------------------------------------------------
export default function AppSettingsModal({ visible, onClose }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState("idle");

  async function handleBackup() {
    if (busy !== "idle") return;
    setBusy("backing-up");
    try {
      const res = await exportBackup();
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
      if (res.canceled) return;
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
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropTap} activeOpacity={1} onPress={onClose} />

        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.background, borderColor: colors.border, paddingBottom: insets.bottom + 8 },
          ]}
        >
          {/* Grabber */}
          <View style={styles.grabber}>
            <View style={[styles.grabberBar, { backgroundColor: colors.border }]} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text, fontFamily: uiFont(700) }]}>
              Settings
            </Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Close settings"
            >
              <Ionicons name="close" size={24} color={colors.mutedText} />
            </TouchableOpacity>
          </View>

          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            {/* Data section */}
            <Text style={[styles.sectionLabel, { color: colors.text }]}>Data</Text>

            <TouchableOpacity
              style={[styles.row, { borderBottomColor: colors.border }]}
              onPress={handleBackup}
              disabled={busy !== "idle"}
              accessibilityRole="button"
              accessibilityLabel="Back up data"
            >
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>Back Up Data</Text>
                <Text style={[styles.rowSub, { color: colors.mutedText }]}>
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
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>Restore Data</Text>
                <Text style={[styles.rowSub, { color: colors.mutedText }]}>
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

            {/* About section */}
            <View style={[styles.sectionDivider, { borderTopColor: colors.border }]} />
            <Text style={[styles.sectionLabel, { color: colors.text }]}>About</Text>
            <View style={styles.buildInfo}>
              <Text style={[styles.buildInfoRow, { color: colors.mutedText }]}>
                Version {APP_VERSION}
              </Text>
              <Text style={[styles.buildInfoRow, { color: colors.mutedText }]}>
                Built {BUILD_DATE} · {BUILD_COMMIT}
              </Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  backdropTap: {
    flex: 1,
  },
  sheet: {
    maxHeight: "75%",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    paddingHorizontal: 20,
  },
  grabber: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 4,
  },
  grabberBar: {
    width: 38,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 8,
  },
  title: {
    fontSize: 18,
  },
  sectionLabel: {
    fontSize: 13,
    fontFamily: uiFont(700),
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 16,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: {
    flex: 1,
    paddingRight: 12,
  },
  rowTitle: {
    fontSize: 16,
    fontFamily: uiFont(400),
  },
  rowSub: {
    fontSize: 13,
    fontFamily: uiFont(400),
    marginTop: 2,
  },
  chevron: {
    fontSize: 22,
    fontFamily: uiFont(400),
  },
  dataNote: {
    fontSize: 12,
    fontFamily: uiFont(400),
    lineHeight: 17,
    paddingTop: 10,
  },
  buildInfo: {
    paddingVertical: 12,
    gap: 4,
  },
  buildInfoRow: {
    fontSize: 13,
    fontFamily: uiFont(400),
    lineHeight: 18,
  },
});
