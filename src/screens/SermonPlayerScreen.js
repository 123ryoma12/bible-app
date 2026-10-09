// Full-screen expanded sermon player.
//
// Opened when the user taps the mini-player's info area. All playback state
// lives in SermonPlayer (the mini bar) — this screen just exposes the same
// player + status objects via props so it never owns or duplicates audio state.

import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { useTheme } from "../theme/ThemeContext";
import { uiFont } from "../theme/fonts";

const SKIP_SECONDS = 15;

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function SermonPlayerScreen({
  sermon,
  status,
  speedIndex,
  speeds,
  onCycleSpeed,
  onTogglePlay,
  onSkip,
  onSeek,          // (seconds) => void
  onClose,         // closes the player entirely (X)
  onBack,          // goes back to previous screen
  busy,
  failure,
  playbackError,
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const duration = status?.duration ?? 0;
  const currentTime = status?.currentTime ?? 0;

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 24) },
      ]}
    >
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={onBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-down" size={28} color={colors.text} />
        </TouchableOpacity>

        <Text style={[styles.topBarLabel, { color: colors.mutedText }]} numberOfLines={1}>
          NOW PLAYING
        </Text>

        <TouchableOpacity
          onPress={onClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Close player"
        >
          <MaterialCommunityIcons name="close" size={22} color={colors.mutedText} />
        </TouchableOpacity>
      </View>

      {/* Artwork placeholder */}
      <View style={[styles.artwork, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <MaterialCommunityIcons name="microphone-variant" size={72} color={colors.mutedText} />
      </View>

      {/* Title + meta */}
      <View style={styles.titleArea}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
          {sermon?.title}
        </Text>
        <Text style={[styles.meta, { color: colors.mutedText }]} numberOfLines={1}>
          {sermon?.speaker}
          {sermon?.passage ? ` · ${sermon.passage}` : ""}
        </Text>
        <TouchableOpacity
          onPress={() => Linking.openURL(sermon.link)}
          disabled={!sermon?.link}
          style={[styles.openBtn, { borderColor: colors.accent }]}
          accessibilityRole="button"
          accessibilityLabel="Open sermon source"
        >
          <MaterialCommunityIcons name="open-in-new" size={16} color={colors.accent} />
          <Text style={[styles.openBtnText, { color: colors.accent }]}>Open source</Text>
        </TouchableOpacity>
      </View>

      {/* Progress bar */}
      <View style={styles.progressHit}>
        <Slider
          style={styles.progressSlider}
          minimumValue={0}
          maximumValue={duration > 0 ? duration : 1}
          value={Math.min(Math.max(currentTime, 0), duration > 0 ? duration : 1)}
          disabled={duration <= 0}
          onSlidingComplete={onSeek}
          minimumTrackTintColor={colors.accent}
          maximumTrackTintColor={colors.border}
          thumbTintColor={colors.accent}
          accessibilityLabel="Playback position"
        />
        <View style={styles.progressTimes}>
          <Text style={[styles.timeText, { color: colors.mutedText }]}>{formatTime(currentTime)}</Text>
          <Text style={[styles.timeText, { color: colors.mutedText }]}>{formatTime(duration)}</Text>
        </View>
      </View>

      {/* Controls */}
      {failure || playbackError ? (
        <View style={styles.failureRow}>
          <Text style={[styles.failureText, { color: colors.mutedText }]}>
            {failure === "offline"
              ? "Internet required to play"
              : "Audio unavailable"}
          </Text>
        </View>
      ) : (
        <View style={styles.controls}>
          {/* Speed */}
          <TouchableOpacity
            onPress={onCycleSpeed}
            style={styles.controlSide}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={`Playback speed ${speeds?.[speedIndex]}x`}
          >
            <Text style={[styles.speedText, { color: colors.text }]}>
              {speeds?.[speedIndex]}x
            </Text>
          </TouchableOpacity>

          {/* Skip back */}
          <TouchableOpacity
            onPress={() => onSkip?.(-SKIP_SECONDS)}
            style={styles.controlMid}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={`Skip back ${SKIP_SECONDS} seconds`}
          >
            <MaterialCommunityIcons name="rewind-15" size={36} color={colors.text} />
          </TouchableOpacity>

          {/* Play/Pause */}
          <TouchableOpacity
            onPress={onTogglePlay}
            style={styles.playBtn}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={status?.playing ? "Pause" : "Play"}
          >
            {busy ? (
              <ActivityIndicator color={colors.accent} size="large" />
            ) : (
              <MaterialCommunityIcons
                name={status?.playing ? "pause-circle" : "play-circle"}
                size={72}
                color={colors.accent}
              />
            )}
          </TouchableOpacity>

          {/* Skip forward */}
          <TouchableOpacity
            onPress={() => onSkip?.(SKIP_SECONDS)}
            style={styles.controlMid}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={`Skip forward ${SKIP_SECONDS} seconds`}
          >
            <MaterialCommunityIcons name="fast-forward-15" size={36} color={colors.text} />
          </TouchableOpacity>

          {/* Placeholder for symmetry */}
          <View style={styles.controlSide} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 28,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  topBarLabel: {
    fontSize: 11,
    fontFamily: uiFont(700),
    letterSpacing: 1.2,
  },
  artwork: {
    marginTop: 24,
    marginBottom: 32,
    alignSelf: "center",
    width: 220,
    height: 220,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  titleArea: {
    marginBottom: 28,
  },
  title: {
    fontSize: 22,
    fontFamily: uiFont(700),
    lineHeight: 28,
    marginBottom: 6,
  },
  meta: {
    fontSize: 14,
    fontFamily: uiFont(400),
  },
  progressHit: {
    marginBottom: 32,
  },
  progressSlider: {
    height: 32,
    marginHorizontal: -8,
  },
  progressTimes: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  timeText: {
    fontSize: 12,
    fontFamily: uiFont(400),
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  controlSide: {
    width: 48,
    alignItems: "center",
  },
  controlMid: {
    alignItems: "center",
    justifyContent: "center",
  },
  playBtn: {
    alignItems: "center",
    justifyContent: "center",
  },
  speedText: {
    fontSize: 16,
    fontFamily: uiFont(700),
  },
  failureRow: {
    alignItems: "center",
    gap: 16,
  },
  failureText: {
    fontSize: 15,
    fontFamily: uiFont(400),
    textAlign: "center",
  },
  openBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 12,
  },
  openBtnText: {
    fontSize: 13,
    fontFamily: uiFont(600),
  },
});
