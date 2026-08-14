import React from "react";
import { View, Text, StyleSheet, SafeAreaView } from "react-native";
import { useTheme } from "../theme/ThemeContext";

// Placeholder screen - Memory (e.g. verse memorization) is TBD and not
// implemented yet. Swap this out for the real feature when it's designed.
export default function MemoryScreen() {
  const { colors } = useTheme();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>Memory</Text>
      <View style={styles.body}>
        <Text style={[styles.heading, { color: colors.text }]}>Coming soon</Text>
        <Text style={[styles.subtext, { color: colors.secondaryText }]}>
          Verse memorization tools will live here.
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
