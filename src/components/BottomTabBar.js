import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from "react-native";
import { useTheme } from "../theme/ThemeContext";

const TABS = [
  { key: "bible", label: "Bible" },
  { key: "stats", label: "Stats" },
  { key: "memory", label: "Memory" },
  { key: "devotional", label: "Devotional" },
  { key: "settings", label: "Settings" },
];

export default function BottomTabBar({ active, onChange }) {
  const { colors } = useTheme();

  return (
    <SafeAreaView style={{ backgroundColor: colors.background }}>
      <View
        style={[styles.bar, { backgroundColor: colors.background, borderTopColor: colors.border }]}
      >
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tab}
              onPress={() => onChange(tab.key)}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <View
                style={[
                  styles.indicator,
                  { backgroundColor: isActive ? colors.accent : "transparent" },
                ]}
              />
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
                style={[
                  styles.label,
                  {
                    color: isActive ? colors.accent : colors.secondaryText,
                    fontWeight: isActive ? "700" : "500",
                  },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    paddingBottom: 8,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  indicator: {
    width: 16,
    height: 3,
    borderRadius: 2,
    marginBottom: 5,
  },
  label: { fontSize: 12 },
});
