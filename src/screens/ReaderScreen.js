import React, { useRef, useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  PanResponder,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { uiFont, FONT_FAMILIES } from "../theme/fonts";
import ChapterView from "../components/ChapterView";
import { getChapter } from "../data/bibleData";
import { incrementReadCount } from "../data/progressStore";
import { addToHistory } from "../data/historyStore";
import { useTheme } from "../theme/ThemeContext";

const SWIPE_THRESHOLD = 50;
// How far you must scroll down before the chrome hides (avoids twitchy hiding).
const HIDE_SCROLL_DELTA = 12;
// Upward fling speed (px per ms) that force-reveals the chrome.
const FAST_UP_VELOCITY = 1.2;
// Distance from the bottom that counts as "reached the end".
const END_THRESHOLD = 48;

export default function ReaderScreen({
  book,
  chapterNumber,
  onPrev,
  onNext,
  onBack,
  onOpenBooks,
  onChromeChange,
  hasPrev,
  hasNext,
}) {
  const { colors } = useTheme();
  const chapter = getChapter(book.id, chapterNumber);
  const scrollRef = useRef(null);

  // Local mirror of chrome visibility so the Reader's own footer can animate
  // in sync with the app-level tab bar.
  const [chromeVisible, setChromeVisible] = useState(true);
  const footerAnim = useRef(new Animated.Value(0)).current; // 0 shown, 1 hidden
  const lastOffset = useRef(0);
  // Measured footer height so the scroll content can reserve space for it -
  // this keeps the "Mark as Read" button clear of the footer at the end of
  // the chapter (the footer sits waiting below it, never overlapping).
  const [footerHeight, setFooterHeight] = useState(0);

  const setChrome = useCallback(
    (next) => {
      setChromeVisible((prev) => (prev === next ? prev : next));
      onChromeChange?.(next);
    },
    [onChromeChange]
  );

  // Reset to visible whenever the chapter changes.
  useEffect(() => {
    lastOffset.current = 0;
    setChrome(true);
  }, [book.id, chapterNumber, setChrome]);

  useEffect(() => {
    Animated.timing(footerAnim, {
      toValue: chromeVisible ? 0 : 1,
      // Reveal quickly so the chrome feels responsive; hide a touch slower.
      duration: chromeVisible ? 120 : 160,
      useNativeDriver: true,
    }).start();
  }, [chromeVisible, footerAnim]);

  const handleScroll = useCallback(
    (e) => {
      const { contentOffset, contentSize, layoutMeasurement, velocity } = e.nativeEvent;
      const y = contentOffset.y;
      const prevY = lastOffset.current;
      const dy = y - prevY;
      lastOffset.current = y;

      // Always show at the very top.
      if (y <= 0) {
        setChrome(true);
        return;
      }

      // Always show once the end of the chapter is reached.
      const distanceToEnd = contentSize.height - (y + layoutMeasurement.height);
      if (distanceToEnd <= END_THRESHOLD) {
        setChrome(true);
        return;
      }

      // Fast upward fling reveals chrome immediately.
      const vy = velocity ? velocity.y : 0;
      if (vy < -FAST_UP_VELOCITY || dy < -HIDE_SCROLL_DELTA * 2) {
        setChrome(true);
        return;
      }

      // Scrolling down past the threshold hides chrome.
      if (dy > HIDE_SCROLL_DELTA) {
        setChrome(false);
      }
    },
    [setChrome]
  );

  const toggleChrome = useCallback(() => {
    setChrome(!chromeVisible);
  }, [chromeVisible, setChrome]);

  const handleMarkRead = useCallback(async () => {
    await incrementReadCount(book.id, chapterNumber);
    addToHistory(book.id, chapterNumber);
    // Advance to the next chapter after marking read, when there is one.
    if (hasNext) onNext();
  }, [book.id, chapterNumber, hasNext, onNext]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderRelease: (_, g) => {
        if (g.dx <= -SWIPE_THRESHOLD && hasNext) onNext();
        else if (g.dx >= SWIPE_THRESHOLD && hasPrev) onPrev();
      },
    })
  ).current;

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.scrollContent,
          // Reserve room so the last content (Mark as Read) clears the footer.
          { paddingBottom: 24 + footerHeight },
        ]}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        {...panResponder.panHandlers}
        key={`${book.id}-${chapterNumber}`}
      >
        {/* Tapping the reading area toggles the chrome (immersive reading). */}
        <TouchableOpacity activeOpacity={1} onPress={toggleChrome}>
          {/* Non-interactive page heading (the tappable version lives in the
              footer pill). Purely decorative, so it is not a button. */}
          <View style={styles.chapterHeading}>
            <Text style={[styles.chapterHeadingBook, { color: colors.text }]}>
              {book.name}
            </Text>
            <Text style={[styles.chapterHeadingNumber, { color: colors.accent }]}>
              Chapter {chapterNumber}
            </Text>
            <View style={[styles.chapterHeadingRule, { backgroundColor: colors.border }]} />
          </View>

          <ChapterView chapter={chapter} />
        </TouchableOpacity>

        {/* End-of-chapter action. */}
        <TouchableOpacity
          style={[
            styles.markReadBtn,
            { backgroundColor: colors.accent, borderColor: colors.accentBorder },
          ]}
          onPress={handleMarkRead}
          activeOpacity={0.85}
        >
          <Text style={[styles.markReadText, { color: colors.accentContrast }]}>
            Mark as Read
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Persistent chapter navigator: ‹  [ Book Chapter ]  ›. The center pill
          is a button that returns to book selection; the arrows move between
          chapters and disable at the very first / last chapter of the Bible.
          It hides while scrolling down for an immersive read. */}
      <Animated.View
        pointerEvents={chromeVisible ? "auto" : "none"}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 0 && Math.abs(h - footerHeight) > 0.5) setFooterHeight(h);
        }}
        style={[
          styles.footer,
          {
            borderTopColor: colors.border,
            backgroundColor: colors.background,
            opacity: footerAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
            transform: [
              {
                translateY: footerAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, footerHeight || 80],
                }),
              },
            ],
          },
        ]}
      >
        <TouchableOpacity
          style={styles.footerArrow}
          onPress={onPrev}
          disabled={!hasPrev}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text
            style={[
              styles.footerArrowText,
              { color: hasPrev ? colors.accent : colors.disabledText },
            ]}
          >
            {"‹"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.footerPill, { borderColor: colors.accent, backgroundColor: colors.surface }]}
          onPress={onOpenBooks}
          hitSlop={{ top: 10, bottom: 10 }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${book.name} ${chapterNumber}, tap to choose another book or chapter`}
        >
          <Text
            style={[styles.footerPillText, { color: colors.text }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {book.name} {chapterNumber}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.footerArrow}
          onPress={onNext}
          disabled={!hasNext}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text
            style={[
              styles.footerArrowText,
              { color: hasNext ? colors.accent : colors.disabledText },
            ]}
          >
            {"›"}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scrollContent: {
    paddingBottom: 24,
  },
  chapterHeading: {
    alignItems: "center",
    paddingTop: 28,
    paddingBottom: 8,
    paddingHorizontal: 24,
  },
  chapterHeadingBook: {
    fontSize: 26,
    fontFamily: FONT_FAMILIES.serifBold,
    textAlign: "center",
  },
  chapterHeadingNumber: {
    fontSize: 15,
    fontFamily: FONT_FAMILIES.serifMedium,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 4,
  },
  chapterHeadingRule: {
    width: 40,
    height: 2,
    borderRadius: 1,
    marginTop: 14,
  },
  markReadBtn: {
    marginTop: 24,
    marginHorizontal: 24,
    paddingVertical: 15,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  markReadText: { fontSize: 16, fontFamily: uiFont(700) },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  footerArrow: {
    width: 52,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  footerArrowText: { fontSize: 28, fontFamily: uiFont(400), lineHeight: 30 },
  footerPill: {
    flex: 1,
    marginHorizontal: 8,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  footerPillText: { fontSize: 16, fontFamily: FONT_FAMILIES.serifSemiBold },
});
