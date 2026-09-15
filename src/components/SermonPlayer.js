// Mini audio player for a selected sermon.
//
// Hosted in App.js rather than the reader, because ReaderScreen is remounted on
// every chapter change and tab switch — anchoring playback there would cut the
// audio off the moment you turned the page.
//
// Playback is meant to outlive the screen: the audio session is configured for
// background use and the sermon is published to the OS as now-playing media, so
// it keeps going when the phone is locked and can be driven from there.
//
// The MP3 is not published through the REST API, so it has to be resolved from
// the sermon page when a sermon is chosen (see `fetchAudioUrl`). If that ever
// fails — their markup changing is the likely cause — the player degrades to
// offering the sermon in a browser rather than presenting a dead end.

import React, { useEffect, useState, useCallback, useRef } from "react";
import SermonPlayerScreen from "../screens/SermonPlayerScreen";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Linking,
  Platform,
  PermissionsAndroid,
  Animated,
  Modal,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from "expo-audio";
import { uiFont } from "../theme/fonts";
import { useTheme } from "../theme/ThemeContext";
import {
  isAbortError,
  ErrorKind,
  AUDIO_EXTRACTION_SUPPORTED,
} from "../data/sermonApi";
import { fetchAudioUrl } from "../data/combinedSermonApi";
import { getDownloadedUri } from "../data/sermonDownloads";
import {
  saveSermonPlayback,
  saveSermonPosition,
  clearSermonPlayback,
} from "../data/sermonPlaybackStore";

const SKIP_SECONDS = 15;
const SPEEDS = [1, 1.25, 1.5, 2];

// Show the scrub bar and the two seek buttons alongside play/pause on the
// lock screen and in the notification shade.
const LOCK_SCREEN_OPTIONS = {
  showSeekForward: true,
  showSeekBackward: true,
  isLiveStream: false,
};

// Android 13+ gates the media notification behind the notification permission,
// and the lock screen controls are that notification. Without it playback still
// works, but there is nothing to tap. Asked for once, the first time a sermon
// actually starts, so it never greets someone who only reads.
const NEEDS_NOTIFICATION_PERMISSION =
  Platform.OS === "android" && Number(Platform.Version) >= 33;

let notificationPermissionAsked = false;

async function ensureNotificationPermission() {
  if (!NEEDS_NOTIFICATION_PERMISSION || notificationPermissionAsked) return;
  notificationPermissionAsked = true;
  try {
    await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
    );
  } catch {
    /* denied or unavailable — playback continues without the controls */
  }
}

/** What the OS shows on the lock screen for the sermon being played. */
function lockScreenMetadata(sermon) {
  return {
    title: sermon.title,
    artist: sermon.speaker || "Sermon",
    albumTitle: sermon.passage || sermon.title,
  };
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export default function SermonPlayer({
  sermon,
  onClose,
  onExpand,
  visible = true,
  // How far to slide down when hiding. Defaults to the bar's own height, but
  // callers that stack something below it (the tab bar) pass the full distance
  // needed to clear the screen.
  hideDistance,
  // Pre-resolved audio URL from a previous session — skips the page scrape.
  initialAudioUrl = null,
  // Position in seconds to seek to after load (for session restore).
  seekTo = 0,
}) {
  const { colors } = useTheme();

  const [audioUrl, setAudioUrl] = useState(null);
  const [resolving, setResolving] = useState(false);
  // null | 'offline' | 'unsupported' | 'unavailable'
  const [failure, setFailure] = useState(null);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [barWidth, setBarWidth] = useState(0);
  const [expanded, setExpanded] = useState(false);
  // Measured full height of the bar so it can slide exactly off-screen when the
  // reader hides its chrome. Only the view is hidden — playback continues.
  const [playerHeight, setPlayerHeight] = useState(0);

  const abortRef = useRef(null);

  // 0 = fully shown, 1 = fully hidden. Driven by `visible`, which the reader
  // flips as you scroll, so the player tucks away with the rest of the chrome.
  const chromeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(chromeAnim, {
      toValue: visible ? 0 : 1,
      // Match BottomTabBar: reveal quickly, hide a touch slower.
      duration: visible ? 120 : 160,
      useNativeDriver: true, // sliding + fading only, keeps layout stable
    }).start();
  }, [visible, chromeAnim]);

  // Created once with no source; each sermon is swapped in via replace().
  const player = useAudioPlayer(null, { updateInterval: 500 });
  const status = useAudioPlayerStatus(player);

  // Audio session: a sermon is long-form listening, so it has to survive the
  // screen locking or the app being backgrounded.
  //
  // - playsInSilentMode: play through the iOS silent switch — a muted sermon
  //   would look like a bug.
  // - shouldPlayInBackground: keep the session alive off-screen.
  // - doNotMix: required for setActiveForLockScreen; without exclusive focus
  //   the OS won't attach the lock screen controls to this player.
  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
    }).catch(() => {});
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
        // A downloaded copy short-circuits everything: no page scrape, no
        // network, and it plays on a train. This is the whole point of the
        // download, so it is checked before anything else is attempted.
        const localUri = await getDownloadedUri(sermon.id);
        if (controller.signal.aborted) return;
        if (localUri) {
          setAudioUrl(localUri);
          return;
        }

        // A pre-resolved URL from the previous session skips the page scrape —
        // both sermon sources use permanent CDN links that never expire.
        if (initialAudioUrl) {
          setAudioUrl(initialAudioUrl);
          return;
        }

        const url = await fetchAudioUrl(sermon, { signal: controller.signal });
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

  // Keep the current sermon reachable from the playback effect without adding
  // it as a dependency — a re-render must never restart the audio.
  const sermonRef = useRef(sermon);
  useEffect(() => {
    sermonRef.current = sermon;
  }, [sermon]);

  // Load and start once the URL is known.
  useEffect(() => {
    if (!audioUrl) return undefined;

    let cancelled = false;

    (async () => {
      // Asked before the media service starts, so the notification carrying the
      // lock screen controls can be posted from the outset.
      await ensureNotificationPermission();
      if (cancelled) return;

      try {
        player.replace(audioUrl);
      } catch {
        setFailure("unavailable");
        return;
      }

      // Hand the OS the now-playing info. On Android this is also what keeps
      // playback alive: without it the system stops background audio after a
      // few minutes.
      const current = sermonRef.current;
      if (current) {
        try {
          player.setActiveForLockScreen(
            true,
            lockScreenMetadata(current),
            LOCK_SCREEN_OPTIONS
          );
        } catch {
          /* no lock screen controls on this platform — playback is unaffected */
        }

        // Persist the full state now that we have a resolved URL, so a
        // force-quit immediately after opening still saves something useful.
        saveSermonPlayback(current, audioUrl, 0).catch(() => {});
      }

      try {
        player.play();
      } catch {
        setFailure("unavailable");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [audioUrl, player]);

  // Seek to the restored position once the player is loaded and ready.
  // Only fires on the initial mount when seekTo > 0 (session restore).
  const hasSeenRef = useRef(false);
  useEffect(() => {
    if (hasSeenRef.current) return;
    if (!status?.isLoaded || !seekTo || seekTo <= 0) return;
    hasSeenRef.current = true;
    try {
      player.seekTo(seekTo);
    } catch {
      /* seek failed — playback continues from the start */
    }
  }, [status?.isLoaded, seekTo, player]);

  // Save position to AsyncStorage every ~5 s while playing.
  useEffect(() => {
    if (!audioUrl || !sermon) return undefined;
    const interval = setInterval(() => {
      const pos = status?.currentTime ?? 0;
      if (pos > 0) saveSermonPosition(pos).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [audioUrl, sermon, status?.currentTime]);

  // Drop the now-playing info when the player goes away, so no stale sermon is
  // left sitting on the lock screen.
  useEffect(
    () => () => {
      try {
        player.clearLockScreenControls();
      } catch {
        /* player may already be released */
      }
    },
    [player]
  );

  // Reset the rate for each new sermon so a previous 2x doesn't carry over.
  useEffect(() => {
    setSpeedIndex(0);
  }, [sermon?.id]);

  const handleClose = useCallback(() => {
    abortRef.current?.abort();
    try {
      player.pause();
      // Closing the bar is a deliberate "I'm done", so tear the notification
      // down with it rather than leaving a paused sermon on the lock screen.
      player.clearLockScreenControls();
    } catch {
      /* player may already be released */
    }
    // Explicit close = user is done. Clear persisted state so reopening the
    // app doesn't restore a sermon the user intentionally dismissed.
    clearSermonPlayback().catch(() => {});
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

  // Called from SermonPlayerScreen with a 0–1 ratio.
  const seekByRatio = useCallback(
    (ratio) => {
      const duration = status?.duration ?? 0;
      if (!duration) return;
      player.seekTo(Math.min(Math.max(ratio, 0), 1) * duration);
    },
    [player, status?.duration]
  );

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
  // Fall back to the bar's own height until the caller has measured the stack.
  const slideDistance = hideDistance > 0 ? hideDistance : playerHeight;

  return (
    <Animated.View
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        if (h > 0 && Math.abs(h - playerHeight) > 0.5) setPlayerHeight(h);
      }}
      pointerEvents={visible ? "auto" : "none"}
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          // Slide clear off the bottom of the screen (never resize the layout,
          // so the reader behind it doesn't jump) and fade out.
          transform: [
            {
              translateY:
                slideDistance > 0
                  ? chromeAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, slideDistance],
                    })
                  : 0,
            },
          ],
          opacity: chromeAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 0],
          }),
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
        <TouchableOpacity
          style={styles.info}
          onPress={() => { onExpand?.(); setExpanded(true); }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Open full player"
        >
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
        </TouchableOpacity>

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

      {/* Full-screen expanded player */}
      <Modal
        visible={expanded}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setExpanded(false)}
        statusBarTranslucent
      >
        <SermonPlayerScreen
          sermon={sermon}
          status={status}
          speedIndex={speedIndex}
          speeds={SPEEDS}
          onCycleSpeed={cycleSpeed}
          onTogglePlay={togglePlay}
          onSkip={skip}
          onSeekRatio={seekByRatio}
          onBack={() => setExpanded(false)}
          onClose={() => { setExpanded(false); handleClose(); }}
          busy={busy}
          failure={failure}
          playbackError={playbackError}
        />
      </Modal>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    // A fixed inset, not a safe-area one: BottomTabBar sits below this bar and
    // already clears the gesture pill / home indicator.
    paddingBottom: 6,
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
