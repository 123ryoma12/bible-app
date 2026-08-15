import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme, FONT_SCALES } from "../theme/ThemeContext";

const APPEARANCE_OPTIONS = [
  { key: "light", label: "Light Mode" },
  { key: "dark", label: "Dark Mode" },
];

// Base size the preview line uses; scaled by the selected fontScale so the user
// can see the effect of their choice immediately.
const PREVIEW_BASE_SIZE = 17;

export default function SettingsScreen() {
  const { mode, setMode, colors, fontScale, setFontScale } = useTheme();

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
              fontSize: PREVIEW_BASE_SIZE * fontScale,
              lineHeight: PREVIEW_BASE_SIZE * fontScale * 1.55,
            }}
          >
            <Text style={{ color: colors.accent, fontWeight: "700", fontSize: 11 * fontScale }}>
              {"1 "}
            </Text>
            In the beginning God created the heavens and the earth.
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
  settingName: {
    fontSize: 17,
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
  segmentText: { fontSize: 13, fontWeight: "600", textAlign: "center" },
  previewCard: {
    marginHorizontal: 20,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
  },
  previewLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
});
