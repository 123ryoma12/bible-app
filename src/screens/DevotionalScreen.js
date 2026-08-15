import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeContext";

// Placeholder screen - Devotional (e.g. daily reading plans/reflections) is
// TBD and not implemented yet. Swap this out for the real feature when it's
// designed.
export default function DevotionalScreen() {
  const { colors } = useTheme();

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <Text style={[styles.title, { color: colors.text }]}>Devotional</Text>
      <View style={styles.body}>
        <Text style={[styles.heading, { color: colors.text }]}>Coming soon</Text>
        <Text style={[styles.subtext, { color: colors.secondaryText }]}>
          Daily devotionals and reading plans will live here.
        </Text>
      </View>
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
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    marginTop: -40,
  },
  heading: { fontSize: 20, fontWeight: "700", marginBottom: 6 },
  subtext: { fontSize: 15, textAlign: "center", lineHeight: 22 },
});
