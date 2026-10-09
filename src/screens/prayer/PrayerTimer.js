// Prayer point detail + count-up timer.
//
// Two states in one screen, driven by the global prayer session:
//   1. Ready     — the point's name and notes, plus a single "Begin" button.
//   2. Praying   — a large calm count-up with pause / resume and an always-
//                  available Amen button so the user can finish whenever they feel done.
//
// Resting points work exactly the same — they just carry a note saying when
// they were next due. The cooldown orders the list; it never blocks prayer.

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import ChoiceModal from "../../components/ChoiceModal";
import { useTheme } from "../../theme/ThemeContext";
import { uiFont } from "../../theme/fonts";
import {
  usePrayerSession,
  formatCountup,
  RUNNING,
  PAUSED,
  IDLE,
} from "../../data/prayerSession";
import {
  availabilityLabel,
  formatPrayerTime,
  frequencyLabel,
  isDue,
  lastPrayedLabel,
  repetitionLabel,
} from "../../data/prayerStore";
import { useState } from "react";

export default function PrayerTimer({ onConfirm, onEdit }) {
  const { colors } = useTheme();
  const [confirmingClose, setConfirmingClose] = useState(false);
  const {
    point,
    status,
    elapsedMs,
    start,
    pause,
    resume,
    cancel,
  } = usePrayerSession();

  if (!point) return null;

  const due = isDue(point);
  const praying = status === RUNNING || status === PAUSED;

  // Leaving while praying discards time, so make the user mean it.
  function handleClose() {
    if (!praying) cancel();
    else setConfirmingClose(true);
  }

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      {/* Back chevron while on the detail view; dismissing X once timer is running. */}
      <View style={styles.headerRow}>
        {praying ? (
          <>
            <View style={styles.headerSpacer} />
            <TouchableOpacity
              onPress={handleClose}
              hitSlop={hit}
              accessibilityRole="button"
              accessibilityLabel="End this prayer session"
            >
              <Ionicons name="close" size={24} color={colors.mutedText} />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              onPress={handleClose}
              hitSlop={hit}
              accessibilityRole="button"
              accessibilityLabel="Back to prayer list"
            >
              <Ionicons name="chevron-back" size={26} color={colors.accent} />
            </TouchableOpacity>
            {onEdit && (
              <TouchableOpacity
                onPress={() => onEdit(point)}
                hitSlop={hit}
                accessibilityRole="button"
                accessibilityLabel="Edit prayer point"
              >
                <Ionicons name="create-outline" size={22} color={colors.mutedText} />
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.name, { color: colors.text }]}>{point.name}</Text>
        <Text style={[styles.meta, { color: colors.secondaryText }]}>
          {frequencyLabel(point)} · {repetitionLabel(point)}
        </Text>

        {!!point.description && (
          <View style={[styles.notes, { backgroundColor: colors.surface }]}>
            <Text style={[styles.notesText, { color: colors.surfaceText }]}>
              {point.description}
            </Text>
          </View>
        )}

        {praying ? (
          <View style={styles.timerBlock}>
            {/* Count-up display */}
            <Text style={[styles.elapsed, { color: colors.text }]}>
              {formatCountup(elapsedMs)}
            </Text>
            <Text style={[styles.elapsedMeta, { color: colors.secondaryText }]}>
              {status === PAUSED ? "Paused" : "Praying…"}
            </Text>

            {/* Amen — always available, the moment the user feels done */}
            <TouchableOpacity
              style={[styles.amen, { backgroundColor: colors.accent, borderColor: colors.accentBorder }]}
              onPress={onConfirm}
              accessibilityRole="button"
              accessibilityLabel="Finish prayer and log time"
            >
              <Text style={[styles.amenText, { color: colors.accentContrast }]}>Amen</Text>
            </TouchableOpacity>

            {/* Pause / Resume */}
            <TouchableOpacity
              style={styles.pauseRow}
              onPress={status === RUNNING ? pause : resume}
              hitSlop={hit}
              accessibilityRole="button"
              accessibilityLabel={status === RUNNING ? "Pause timer" : "Resume timer"}
            >
              <Ionicons
                name={status === RUNNING ? "pause-circle-outline" : "play-circle-outline"}
                size={28}
                color={colors.mutedText}
              />
              <Text style={[styles.pauseLabel, { color: colors.mutedText }]}>
                {status === RUNNING ? "Pause" : "Resume"}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.readyBlock}>
            {/* Resting is a nudge, not a lock */}
            {!due && (
              <View style={[styles.restingNote, { borderColor: colors.border }]}>
                <Ionicons name="time-outline" size={16} color={colors.mutedText} />
                <Text style={[styles.restingNoteText, { color: colors.secondaryText }]}>
                  {availabilityLabel(point)}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.begin, { backgroundColor: colors.accent, borderColor: colors.accentBorder }]}
              onPress={start}
              accessibilityRole="button"
              accessibilityLabel="Begin praying"
            >
              <Text style={[styles.beginText, { color: colors.accentContrast }]}>Begin</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.stats, { borderTopColor: colors.border }]}>
          <Stat label="Times prayed" value={String(point.prayedCount || 0)} colors={colors} />
          <Stat label="Total time" value={formatPrayerTime(point.totalSeconds ?? (point.totalMinutes || 0) * 60)} colors={colors} />
        </View>
        <Text style={[styles.lastPrayed, { color: colors.mutedText }]}>
          {lastPrayedLabel(point)}
        </Text>
      </ScrollView>

      <ChoiceModal
        visible={confirmingClose}
        onDismiss={() => setConfirmingClose(false)}
        title="End this prayer session?"
        message="The timer will stop and this time won't be counted. You can tap Amen to save your time instead."
        actions={[
          { label: "End session", style: "destructive", onPress: cancel },
          { label: "Keep praying", style: "cancel" },
        ]}
      />
    </SafeAreaView>
  );
}

function Stat({ label, value, colors }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.secondaryText }]}>{label}</Text>
    </View>
  );
}

const hit = { top: 12, bottom: 12, left: 12, right: 12 };

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    minHeight: 40,
  },
  headerSpacer: { flex: 1 },
  body: { paddingHorizontal: 24, paddingBottom: 40 },
  name: { fontSize: 26, fontFamily: uiFont(700), marginTop: 8 },
  meta: { fontSize: 13, fontFamily: uiFont(400), marginTop: 6 },
  notes: { borderRadius: 12, padding: 16, marginTop: 18 },
  notesText: { fontSize: 15, fontFamily: uiFont(400), lineHeight: 22 },

  // Ready state
  readyBlock: { marginTop: 40, alignItems: "center" },
  begin: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 64,
    alignItems: "center",
  },
  beginText: { fontSize: 18, fontFamily: uiFont(700), letterSpacing: 0.5 },

  // Praying state
  timerBlock: { alignItems: "center", marginTop: 36 },
  elapsed: {
    fontSize: 72,
    fontFamily: uiFont(700),
    fontVariant: ["tabular-nums"],
    letterSpacing: 1,
  },
  elapsedMeta: { fontSize: 14, fontFamily: uiFont(500), marginTop: 4 },
  amen: {
    marginTop: 36,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 64,
  },
  amenText: { fontSize: 18, fontFamily: uiFont(700), letterSpacing: 0.5 },
  pauseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 24,
  },
  pauseLabel: { fontSize: 14, fontFamily: uiFont(500) },

  restingNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 24,
  },
  restingNoteText: { flex: 1, fontSize: 13, fontFamily: uiFont(400) },

  stats: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 40,
    paddingTop: 20,
  },
  stat: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 22, fontFamily: uiFont(700) },
  statLabel: { fontSize: 12, fontFamily: uiFont(400), marginTop: 2 },
  lastPrayed: { fontSize: 12, fontFamily: uiFont(400), textAlign: "center", marginTop: 14 },
});
