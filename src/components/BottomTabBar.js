import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeContext";
import { uiFont } from "../theme/fonts";

// Each tab has a filled icon (active) and an outline icon (inactive) for a
// clear selected state alongside the accent color.
const TABS = [
  { key: "bible", label: "Bible", icon: "book", iconOutline: "book-outline" },
  { key: "stats", label: "Stats", icon: "stats-chart", iconOutline: "stats-chart-outline" },
  { key: "memory", label: "Memory", icon: "bulb", iconOutline: "bulb-outline" },
  { key: "devotional", label: "Devotional", icon: "heart", iconOutline: "heart-outline" },
  { key: "settings", label: "Settings", icon: "settings", iconOutline: "settings-outline" },
];

export default function BottomTabBar({ active, onChange, visible = true }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  // Measured full height of the bar so we can slide it exactly off-screen.
  const [barHeight, setBarHeight] = useState(0);
  // 0 = fully shown, 1 = fully hidden.
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 0 : 1,
      // Reveal quickly so the menu feels responsive; hide a touch slower.
      duration: visible ? 120 : 160,
      useNativeDriver: true, // sliding + fading only, keeps layout stable
    }).start();
  }, [visible, anim]);

  // Slide the whole bar down by its own height (never resize the layout, so the
  // screen above it doesn't jump when it hides/shows).
  const translateY =
    barHeight > 0
      ? anim.interpolate({ inputRange: [0, 1], outputRange: [0, barHeight] })
      : 0;
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <Animated.View
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        if (h > 0 && Math.abs(h - barHeight) > 0.5) setBarHeight(h);
      }}
      pointerEvents={visible ? "auto" : "none"}
      style={[
        styles.bar,
        {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          // Clear the Android gesture pill / iOS home indicator so the tabs
          // stay fully tappable, while keeping a sensible minimum on devices
          // with no bottom inset.
          paddingBottom: Math.max(insets.bottom, 8),
          paddingLeft: insets.left,
          paddingRight: insets.right,
          transform: [{ translateY }],
          opacity,
        },
      ]}
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
            <Ionicons
              name={isActive ? tab.icon : tab.iconOutline}
              size={22}
              color={isActive ? colors.accent : colors.secondaryText}
              style={styles.icon}
            />
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              style={[
                styles.label,
                {
                  color: isActive ? colors.accent : colors.secondaryText,
                  fontFamily: isActive ? uiFont(700) : uiFont(500),
                },
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </Animated.View>
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
  icon: {
    marginBottom: 3,
  },
  label: { fontSize: 12, fontFamily: uiFont(400) },
});
