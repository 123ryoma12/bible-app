// Daily verses-revised bar chart.
//
// The Memory counterpart to PrayerChart, and deliberately built the same way:
// dependency-free plain Views scaled by flex, so both tabs read as one app.
// Bars scale against whichever is larger — the daily goal or the best day in
// the window — so the goal line is always visible and a record day is never
// clipped.

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { uiFont } from "../../theme/fonts";

const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

export default function MemoryChart({ history, goalVerses }) {
  const { colors } = useTheme();

  if (!history || history.length === 0) return null;

  const total = history.reduce((sum, day) => sum + day.verses, 0);
  const best = history.reduce((max, day) => Math.max(max, day.verses), 0);
  // Keep the goal on-scale so the dashed target line always has somewhere to
  // sit, and never divide by zero on a week with nothing revised.
  const scale = Math.max(best, goalVerses || 0, 1);
  const goalRatio = goalVerses > 0 ? Math.min(1, goalVerses / scale) : null;
  const daysMet = goalVerses > 0
    ? history.filter((day) => day.verses >= goalVerses).length
    : 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.secondaryText }]}>
          Last {history.length} days
        </Text>
        <Text style={[styles.summary, { color: colors.mutedText }]}>
          {total} verse{total === 1 ? "" : "s"}
          {goalVerses > 0 ? ` · ${daysMet} day${daysMet === 1 ? "" : "s"} on goal` : ""}
        </Text>
      </View>

      {/* The bars and the goal line MUST share one coordinate space, or the
          line drifts off the value it represents. Hence the fixed-height plot
          area with the day labels as a separate row underneath, rather than
          labels nested inside each bar's column. */}
      <View style={styles.plot}>
        {goalRatio != null && (
          <View
            pointerEvents="none"
            style={[
              styles.goalLine,
              { bottom: `${goalRatio * 100}%`, borderTopColor: colors.accentBorder },
            ]}
          />
        )}

        <View style={styles.bars}>
          {history.map((day) => {
            const ratio = day.verses / scale;
            const met = goalVerses > 0 && day.verses >= goalVerses;
            return (
              <View key={day.date} style={styles.barSlot}>
                <View
                  style={[
                    styles.bar,
                    {
                      // A hairline stub keeps empty days visible as a baseline.
                      height: day.verses > 0 ? `${Math.max(3, ratio * 100)}%` : 2,
                      backgroundColor: day.verses === 0
                        ? colors.border
                        : met
                          ? colors.accent
                          : colors.accentBorder,
                    },
                  ]}
                />
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.labels}>
        {history.map((day) => (
          <Text
            key={day.date}
            style={[styles.barLabel, { color: colors.mutedText }]}
          >
            {DAY_INITIALS[new Date(`${day.date}T00:00:00`).getDay()]}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
  headerRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  title: {
    fontSize: 13,
    fontFamily: uiFont(700),
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summary: { fontSize: 12, fontFamily: uiFont(400) },
  // Bars fill this box exactly, so a bar's height percentage and the goal
  // line's bottom percentage both resolve against the same 78pt.
  plot: { height: 78, justifyContent: "flex-end" },
  goalLine: {
    position: "absolute",
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderStyle: "dashed",
    opacity: 0.5,
  },
  bars: { flexDirection: "row", alignItems: "flex-end", height: "100%", gap: 4 },
  barSlot: { flex: 1, height: "100%", justifyContent: "flex-end" },
  bar: { width: "100%", borderRadius: 3, minHeight: 2 },
  labels: { flexDirection: "row", gap: 4, marginTop: 4 },
  barLabel: { flex: 1, fontSize: 10, fontFamily: uiFont(400), textAlign: "center" },
});
