// Mini audio player for a selected sermon.
//
// Hosted in App.js rather than the reader, because ReaderScreen is remounted on
// every chapter change and tab switch — anchoring playback there would cut the
// audio off the moment you turned the page.
//
// The MP3 is not published through the REST API, so it has to be resolved from
// the sermon page when a sermon is chosen (see `fetchAudioUrl`). If that ever
// fails — their markup changing is the likely cause — the player degrades to
// offering the sermon in a browser rather than presenting a dead end.

import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from "expo-audio";
import { uiFont } from "../theme/fonts";
import { useTheme } from "../theme/ThemeContext";
import {
  fetchAudioUrl,
  isAbortError,
  ErrorKind,
  AUDIO_EXTRACTION_SUPPORTED,
} from "../data/sermonApi";

const SKIP_SECONDS = 15;
const SPEEDS = [1, 1.25, 1.5, 2];

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export default function SermonPlayer({ sermon, onClose }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [audioUrl, setAudioUrl] = useState(null);
  const [resolving, setResolving] = useState(false);
  // null | 'offline' | 'unsupported' | 'unavailable'
  const [failure, setFailure] = useState(null);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [barWidth, setBarWidth] = useState(0);

  const abortRef = useRef(null);

  // Created once with no source; each sermon is swapped in via replace().
  const player = useAudioPlayer(null, { updateInterval: 500 });
  const status = useAudioPlayerStatus(player);

  // Play through the iOS silent switch — a muted sermon would look like a bug.
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  // Resolve the MP3 whenever a new sermon is chosen.
  useEffect(() => {
    if (!sermon) return undefined;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setAudioUrl(null);
    setFailure(null);

    // On web the sermon page can't be read (no CORS headers), so the fetch
    // would fail every time. Skip it and offer the browser straight away
    // rather than spinning and then reporting a misleading error.
    if (!AUDIO_EXTRACTION_SUPPORTED) {
      setResolving(false);
      setFailure("unsupported");
      return undefined;
    }

    setResolving(true);

    (async () => {
      try {
        const url = await fetchAudioUrl(sermon.link, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (!url) {
          // Reachable, but no audio in the page. Offer the browser instead.
          setFailure("unavailable");
          return;
        }
        setAudioUrl(url);
      } catch (err) {
        if (isAbortError(err) || controller.signal.aborted) return;
        setFailure(err?.kind === ErrorKind.OFFLINE ? "offline" : "unavailable");
      } finally {
        if (!controller.signal.aborted) setResolving(false);
      }
    })();

    return () => controller.abort();
  }, [sermon]);

  // Load and start once the URL is known.
  useEffect(() => {
    if (!audioUrl) return;
    try {
      player.replace(audioUrl);
      player.play();
    } catch {
      setFailure("unavailable");
    }
  }, [audioUrl, player]);

  // Reset the rate for each new sermon so a previous 2x doesn't carry over.
  useEffect(() => {
    setSpeedIndex(0);
  }, [sermon?.id]);

  const handleClose = useCallback(() => {
    abortRef.current?.abort();
    try {
      player.pause();
    } catch {
      /* player may already be released */
    }
    onClose?.();
  }, [player, onClose]);

  const togglePlay = useCallback(() => {
    if (status?.playing) player.pause();
    else player.play();
  }, [player, status?.playing]);

  const skip = useCallback(
    (delta) => {
      const duration = status?.duration ?? 0;
      const next = Math.min(
        Math.max((status?.currentTime ?? 0) + delta, 0),
        duration || Number.MAX_SAFE_INTEGER
      );
      player.seekTo(next);
    },
    [player, status?.currentTime, status?.duration]
  );

  const cycleSpeed = useCallback(() => {
    const next = (speedIndex + 1) % SPEEDS.length;
    setSpeedIndex(next);
    try {
      player.setPlaybackRate(SPEEDS[next]);
    } catch {
      /* unsupported rate on this platform — leave playback as-is */
    }
  }, [player, speedIndex]);

  // Tap anywhere on the progress bar to seek there. Avoids pulling in a slider
  // dependency for what is a single interaction.
  const seekToPosition = useCallback(
    (event) => {
      const duration = status?.duration ?? 0;
      if (!duration || !barWidth) return;
      const ratio = Math.min(Math.max(event.nativeEvent.locationX / barWidth, 0), 1);
      player.seekTo(ratio * duration);
    },
    [player, status?.duration, barWidth]
  );

  if (!sermon) return null;

  const duration = status?.duration ?? 0;
  const currentTime = status?.currentTime ?? 0;
  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;
  const busy = resolving || (!!audioUrl && !status?.isLoaded) || !!status?.isBuffering;
  const playbackError = !!status?.error;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingBottom: insets.bottom > 0 ? 6 : 10,
        },
      ]}
    >
      {/* Progress bar doubles as the scrubber. */}
      <TouchableOpacity
        activeOpacity={1}
        onPress={seekToPosition}
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
        style={styles.progressHit}
        accessibilityRole="adjustable"
        accessibilityLabel="Playback position"
        accessibilityValue={{
          text: `${formatTime(currentTime)} of ${formatTime(duration)}`,
        }}
      >
        <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.progressFill,
              { backgroundColor: colors.accent, width: `${progress * 100}%` },
            ]}
          />
        </View>
      </TouchableOpacity>

      <View style={styles.row}>
        <View style={styles.info}>
          <Text
            style={[styles.title, { color: colors.surfaceText }]}
            numberOfLines={1}
          >
            {sermon.title}
          </Text>
          <Text style={[styles.meta, { color: colors.mutedText }]} numberOfLines={1}>
            {failure === "offline"
              ? "Internet required to play"
              : failure === "unsupported"
                ? "Listen on the Gospel in Life site"
                : failure === "unavailable"
                  ? "Audio unavailable"
                  : playbackError
                    ? "Playback problem"
                    : [
                        sermon.passage,
                        sermon.speaker,
                        duration > 0 &&
                          `${formatTime(currentTime)} / ${formatTime(duration)}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
          </Text>
        </View>

        {failure || playbackError ? (
          // Dead end avoided: hand the sermon over to the browser.
          <TouchableOpacity
            style={[styles.openBtn, { borderColor: colors.accent }]}
            onPress={() => Linking.openURL(sermon.link)}
            accessibilityRole="button"
            accessibilityLabel="Open this sermon in your browser"
          >
            <Text style={[styles.openBtnText, { color: colors.accent }]}>Open</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              onPress={cycleSpeed}
              style={styles.control}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel={`Playback speed ${SPEEDS[speedIndex]}x`}
            >
              <Text style={[styles.speedText, { color: colors.surfaceText }]}>
                {SPEEDS[speedIndex]}x
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => skip(-SKIP_SECONDS)}
              style={styles.control}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel={`Skip back ${SKIP_SECONDS} seconds`}
            >
              <MaterialCommunityIcons
                name="rewind-15"
                size={24}
                color={colors.surfaceText}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={togglePlay}
              style={styles.control}
              disabled={busy}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel={status?.playing ? "Pause" : "Play"}
            >
              {busy ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <MaterialCommunityIcons
                  name={status?.playing ? "pause-circle" : "play-circle"}
                  size={34}
                  color={colors.accent}
                />
              )}
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity
          onPress={handleClose}
          style={styles.control}
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          accessibilityRole="button"
          accessibilityLabel="Close player"
        >
          <MaterialCommunityIcons name="close" size={20} color={colors.mutedText} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  progressHit: {
    paddingVertical: 6,
  },
  progressTrack: {
    height: 3,
    width: "100%",
    overflow: "hidden",
  },
  progressFill: {
    height: 3,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingBottom: 4,
    gap: 4,
  },
  info: {
    flex: 1,
    marginRight: 6,
  },
  title: {
    fontSize: 14,
    fontFamily: uiFont(600),
  },
  meta: {
    fontSize: 11,
    fontFamily: uiFont(400),
    marginTop: 1,
  },
  control: {
    paddingHorizontal: 5,
    justifyContent: "center",
    alignItems: "center",
  },
  speedText: {
    fontSize: 12,
    fontFamily: uiFont(600),
  },
  openBtn: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  openBtnText: {
    fontSize: 12,
    fontFamily: uiFont(600),
  },
});
