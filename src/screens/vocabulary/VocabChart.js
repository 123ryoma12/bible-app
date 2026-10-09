// Daily cards-drilled bar chart for the Vocabulary screen.
// Mirrors MemoryChart exactly — same dependency-free plain Views scaled by flex.
// Bars scale against whichever is larger — the daily goal or the best day in
// the window — so the goal line is always visible and a record day is never clipped.

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { uiFont } from "../../theme/fonts";

const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

export default function VocabChart({ history, goalCards }) {
  const { colors } = useTheme();

  if (!history || history.length === 0) return null;

  const total = history.reduce((sum, day) => sum + day.cards, 0);
  const best = history.reduce((max, day) => Math.max(max, day.cards), 0);
  const scale = Math.max(best, goalCards || 0, 1);
  const goalRatio = goalCards > 0 ? Math.min(1, goalCards / scale) : null;
  const daysMet = goalCards > 0
    ? history.filter((day) => day.cards >= goalCards).length
    : 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.secondaryText }]}>
          Last {history.length} days
        </Text>
        <Text style={[styles.summary, { color: colors.mutedText }]}>
          {total} card{total === 1 ? "" : "s"}
          {goalCards > 0 ? ` · ${daysMet} day${daysMet === 1 ? "" : "s"} on goal` : ""}
        </Text>
      </View>

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
            const ratio = day.cards / scale;
            const met = goalCards > 0 && day.cards >= goalCards;
            return (
              <View key={day.date} style={styles.barSlot}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: day.cards > 0 ? `${Math.max(3, ratio * 100)}%` : 2,
                      backgroundColor: day.cards === 0
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
