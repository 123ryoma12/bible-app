// Prayer point detail + countdown timer.
//
// Three states in one screen, driven by the global prayer session:
//   1. Picking   — the point's name and notes, plus the duration choices.
//   2. Counting  — a large calm countdown with pause / reset / cancel.
//   3. Finished  — the Amen button, the only thing that logs time.
//
// Resting points work exactly the same — they just carry a note saying when
// they were next due. The cooldown orders the list; it never blocks prayer.

import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import ChoiceModal from "../../components/ChoiceModal";
import { useTheme } from "../../theme/ThemeContext";
import { uiFont } from "../../theme/fonts";
import {
  usePrayerSession,
  formatCountdown,
  RUNNING,
  PAUSED,
  FINISHED,
} from "../../data/prayerSession";
import {
  SESSION_MINUTES,
  availabilityLabel,
  frequencyLabel,
  isDue,
  lastPrayedLabel,
  repetitionLabel,
} from "../../data/prayerStore";

export default function PrayerTimer({ onConfirm, onEdit }) {
  const { colors } = useTheme();
  // Chosen length, held locally until the user actually presses Start — the
  // session context only learns about it once the countdown begins.
  const [selected, setSelected] = useState(null);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const {
    point,
    status,
    durationMinutes,
    remainingMs,
    start,
    pause,
    resume,
    reset,
    clearDuration,
    cancel,
  } = usePrayerSession();

  if (!point) return null;

  const due = isDue(point);
  const counting = status === RUNNING || status === PAUSED;
  const finished = status === FINISHED;
  // Anything past the duration picker: a timer is running, paused, or sitting
  // finished and waiting to be confirmed. All three have something to lose.
  const sessionUnderway = counting || finished;

  // Leaving mid-session throws the time away, so make the user mean it.
  // Leaving from the detail view has nothing to lose.
  function handleClose() {
    if (!sessionUnderway) cancel();
    else setConfirmingClose(true);
  }

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      {/* The affordance has to match the consequence. Browsing the point is
          ordinary navigation, so it gets a back chevron on the left. Once a
          timer is under way, leaving ENDS it — so that becomes a dismissing X
          on the right, matching the sermon sheet. */}
      <View style={styles.headerRow}>
        {sessionUnderway ? (
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

        {counting || finished ? (
          <View style={styles.timerBlock}>
            <Text
              style={[
                styles.countdown,
                { color: finished ? colors.accent : colors.text },
              ]}
            >
              {formatCountdown(remainingMs)}
            </Text>
            <Text style={[styles.countdownMeta, { color: colors.secondaryText }]}>
              {finished
                ? `${durationMinutes} minute${durationMinutes === 1 ? "" : "s"} of prayer`
                : status === PAUSED
                  ? "Paused"
                  : `${durationMinutes} minute${durationMinutes === 1 ? "" : "s"}`}
            </Text>

            {finished ? (
              <TouchableOpacity
                style={[styles.amen, { backgroundColor: colors.accent, borderColor: colors.accentBorder }]}
                onPress={onConfirm}
                accessibilityRole="button"
                accessibilityLabel="Confirm prayer complete"
              >
                <Text style={[styles.amenText, { color: colors.accentContrast }]}>Amen</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.controls}>
                <ControlButton
                  icon="refresh"
                  label="Reset"
                  onPress={reset}
                  colors={colors}
                />
                <ControlButton
                  icon={status === RUNNING ? "pause" : "play"}
                  label={status === RUNNING ? "Pause" : "Resume"}
                  onPress={status === RUNNING ? pause : resume}
                  colors={colors}
                  primary
                />
                <ControlButton
                  icon="close"
                  label="Cancel"
                  onPress={clearDuration}
                  colors={colors}
                />
              </View>
            )}

            {!finished && (
              <Text style={[styles.hint, { color: colors.mutedText }]}>
                Time only counts once the countdown finishes.
              </Text>
            )}
          </View>
        ) : (
          <View style={styles.pickBlock}>
            {/* Resting is a nudge, not a lock: it says this one isn't due yet
                and sinks it down the list, but you can always pray for
                something the moment it's on your heart. */}
            {!due && (
              <View style={[styles.restingNote, { borderColor: colors.border }]}>
                <Ionicons name="time-outline" size={16} color={colors.mutedText} />
                <Text style={[styles.restingNoteText, { color: colors.secondaryText }]}>
                  {availabilityLabel(point)}
                </Text>
              </View>
            )}

            <Text style={[styles.pickLabel, { color: colors.secondaryText }]}>
              How long will you pray?
            </Text>
            <View style={styles.durations}>
              {SESSION_MINUTES.map((minutes) => {
                const chosen = minutes === selected;
                return (
                  <TouchableOpacity
                    key={minutes}
                    style={[
                      styles.duration,
                      {
                        borderColor: chosen ? colors.accentBorder : colors.border,
                        backgroundColor: chosen ? colors.accent : "transparent",
                      },
                    ]}
                    onPress={() => setSelected(minutes)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: chosen }}
                    accessibilityLabel={`${minutes} minutes`}
                  >
                    <Text
                      style={[
                        styles.durationValue,
                        { color: chosen ? colors.accentContrast : colors.accent },
                      ]}
                    >
                      {minutes}
                    </Text>
                    <Text
                      style={[
                        styles.durationUnit,
                        { color: chosen ? colors.accentContrast : colors.secondaryText },
                      ]}
                    >
                      min
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Picking a length only arms the timer — nothing counts down until
                the user deliberately starts it. */}
            <TouchableOpacity
              style={[
                styles.start,
                selected
                  ? { backgroundColor: colors.accent, borderColor: colors.accentBorder }
                  : { backgroundColor: colors.disabledBg, borderColor: colors.border },
              ]}
              onPress={() => selected && start(selected)}
              disabled={!selected}
              accessibilityRole="button"
              accessibilityLabel={
                selected ? `Start ${selected} minute prayer` : "Choose a length first"
              }
            >
              <Text
                style={[
                  styles.startText,
                  { color: selected ? colors.accentContrast : colors.disabledText },
                ]}
              >
                {selected ? `Start ${selected} min` : "Choose a length"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.stats, { borderTopColor: colors.border }]}>
          <Stat label="Times prayed" value={String(point.prayedCount || 0)} colors={colors} />
          <Stat label="Total minutes" value={String(point.totalMinutes || 0)} colors={colors} />
        </View>
        <Text style={[styles.lastPrayed, { color: colors.mutedText }]}>
          {lastPrayedLabel(point)}
        </Text>
      </ScrollView>

      <ChoiceModal
        visible={confirmingClose}
        onDismiss={() => setConfirmingClose(false)}
        title={finished ? "Leave without finishing?" : "End this prayer session?"}
        message={
          finished
            ? `You've prayed the full ${durationMinutes} minute${
                durationMinutes === 1 ? "" : "s"
              }, but it won't be counted until you tap Amen.`
            : "The countdown will stop and this time won't be counted. You'll need to start again."
        }
        actions={[
          { label: finished ? "Discard" : "End session", style: "destructive", onPress: cancel },
          { label: finished ? "Go back" : "Keep praying", style: "cancel" },
        ]}
      />
    </SafeAreaView>
  );
}

function ControlButton({ icon, label, onPress, colors, primary }) {
  return (
    <TouchableOpacity
      style={styles.control}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View
        style={[
          styles.controlCircle,
          {
            borderColor: primary ? colors.accentBorder : colors.border,
            backgroundColor: primary ? colors.accent : "transparent",
          },
        ]}
      >
        <Ionicons
          name={icon}
          size={primary ? 26 : 20}
          color={primary ? colors.accentContrast : colors.secondaryText}
        />
      </View>
      <Text style={[styles.controlLabel, { color: colors.secondaryText }]}>{label}</Text>
    </TouchableOpacity>
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

const hit = { top: 10, bottom: 10, left: 10, right: 10 };

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
  // Pushes a lone close button over to the right edge.
  headerSpacer: { flex: 1 },
  body: { paddingHorizontal: 24, paddingBottom: 40 },
  name: { fontSize: 26, fontFamily: uiFont(700), marginTop: 8 },
  meta: { fontSize: 13, fontFamily: uiFont(400), marginTop: 6 },
  notes: { borderRadius: 12, padding: 16, marginTop: 18 },
  notesText: { fontSize: 15, fontFamily: uiFont(400), lineHeight: 22 },

  pickBlock: { marginTop: 32 },
  pickLabel: {
    fontSize: 13,
    fontFamily: uiFont(700),
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 14,
  },
  durations: { flexDirection: "row", gap: 12 },
  duration: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  durationValue: { fontSize: 22, fontFamily: uiFont(700) },
  durationUnit: { fontSize: 11, fontFamily: uiFont(500), marginTop: 2 },
  start: {
    marginTop: 24,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  startText: { fontSize: 16, fontFamily: uiFont(700), letterSpacing: 0.3 },

  timerBlock: { alignItems: "center", marginTop: 36 },
  countdown: {
    fontSize: 72,
    fontFamily: uiFont(700),
    fontVariant: ["tabular-nums"],
    letterSpacing: 1,
  },
  countdownMeta: { fontSize: 14, fontFamily: uiFont(500), marginTop: 4 },
  controls: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 32,
    marginTop: 36,
  },
  control: { alignItems: "center" },
  controlCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  controlLabel: { fontSize: 12, fontFamily: uiFont(500), marginTop: 8 },
  amen: {
    marginTop: 36,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 64,
  },
  amenText: { fontSize: 18, fontFamily: uiFont(700), letterSpacing: 0.5 },
  hint: { fontSize: 12, fontFamily: uiFont(400), marginTop: 22, textAlign: "center" },

  restingNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 20,
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
