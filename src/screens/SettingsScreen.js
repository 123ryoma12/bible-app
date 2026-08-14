import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from "react-native";
import { useTheme } from "../theme/ThemeContext";

const OPTIONS = [
  { key: "light", label: "Light Mode" },
  { key: "dark", label: "Dark Mode" },
];

export default function SettingsScreen() {
  const { mode, setMode, colors } = useTheme();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
      <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>Appearance</Text>
      {OPTIONS.map((opt) => {
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  title: {
    fontSize: 28,
    fontWeight: "700",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    paddingTop: 12,
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
  rowText: { fontSize: 17 },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioInner: { width: 12, height: 12, borderRadius: 6 },
});
