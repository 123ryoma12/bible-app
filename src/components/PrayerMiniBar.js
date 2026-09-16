// Compact prayer-session strip shown above the bottom tab bar.
//
// Mirrors the sermon mini player: it only appears when a prayer session is
// running AND the user has navigated away from the Prayer tab. Tapping it
// jumps back to the Prayer tab, where the full timer takes over. Completion is
// deliberately NOT possible from here — the user has to return to the timer
// screen to confirm, which keeps the Amen a considered action.

import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { uiFont } from "../theme/fonts";
import {
  usePrayerSession,
  formatCountup,
  RUNNING,
  PAUSED,
} from "../data/prayerSession";

export default function PrayerMiniBar({ onPress, visible = true, hideDistance = 0 }) {
  const { colors } = useTheme();
  const { point, status, elapsedMs, pause, resume, cancel } = usePrayerSession();

  // Slide away with the rest of the bottom chrome while the reader scrolls.
  const anim = useRef(new Animated.Value(0)).current;
  const [barHeight, setBarHeight] = useState(0);

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 0 : 1,
      duration: visible ? 120 : 160,
      useNativeDriver: true,
    }).start();
  }, [visible, anim]);

  const travel = barHeight + hideDistance;
  const translateY =
    travel > 0 ? anim.interpolate({ inputRange: [0, 1], outputRange: [0, travel] }) : 0;
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  if (!point) return null;

  const running = status === RUNNING;

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
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <TouchableOpacity
        style={styles.main}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Prayer session for ${point.name}. Return to timer.`}
      >
        <MaterialCommunityIcons
          name="hands-pray"
          size={20}
          color={colors.accent}
          style={styles.icon}
        />
        <View style={styles.text}>
          <Text numberOfLines={1} style={[styles.name, { color: colors.surfaceText }]}>
            {point.name}
          </Text>
          <Text style={[styles.status, { color: colors.secondaryText }]}>
            {status === PAUSED ? "Paused" : "Praying"}
          </Text>
        </View>
        <Text style={[styles.time, { color: colors.surfaceText }]}>
          {formatCountup(elapsedMs)}
        </Text>
      </TouchableOpacity>

      {/* Pause/resume is always available from the mini bar. */}
      <TouchableOpacity
        onPress={running ? pause : resume}
        hitSlop={hit}
        style={styles.action}
        accessibilityRole="button"
        accessibilityLabel={running ? "Pause prayer timer" : "Resume prayer timer"}
      >
        <Ionicons
          name={running ? "pause" : "play"}
          size={20}
          color={colors.surfaceText}
        />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={cancel}
        hitSlop={hit}
        style={styles.action}
        accessibilityRole="button"
        accessibilityLabel="End prayer session"
      >
        <Ionicons name="close" size={20} color={colors.mutedText} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const hit = { top: 10, bottom: 10, left: 10, right: 10 };

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingLeft: 16,
    paddingRight: 12,
    paddingVertical: 8,
  },
  main: { flex: 1, flexDirection: "row", alignItems: "center" },
  icon: { marginRight: 10 },
  text: { flex: 1, paddingRight: 10 },
  name: { fontSize: 14, fontFamily: uiFont(600) },
  status: { fontSize: 11, fontFamily: uiFont(400), marginTop: 1 },
  time: {
    fontSize: 16,
    fontFamily: uiFont(700),
    fontVariant: ["tabular-nums"],
    marginRight: 4,
  },
  action: { padding: 6, marginLeft: 2 },
});
