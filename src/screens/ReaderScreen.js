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
import { uiFont, readingFont } from "../theme/fonts";
import ChapterView from "../components/ChapterView";
import ReaderTabBar from "../components/ReaderTabBar";
import { getChapter } from "../data/bibleData";
import { incrementReadCount } from "../data/progressStore";
import { addToHistory } from "../data/historyStore";
import { useTheme } from "../theme/ThemeContext";
import { getActiveReadingVersion } from "../data/bibleVersionStore";
import { getLastPosition } from "../data/lastPositionStore";

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
  initialScrollY = 0,
  onScrollPositionChange,
  onPrev,
  onNext,
  onBack,
  onOpenBooks,
  onChromeChange,
  hasPrev,
  hasNext,
  // Tab bar props – passed through from App
  readerTabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onAddTab,
}) {
  const { colors, readingFontKey } = useTheme();
  // Read in the user's selected translation. The active version is a synchronous
  // cached value (primed at startup, updated when changed in Settings); the
  // Reader re-reads it on each render, so switching versions then returning here
  // shows the new translation. Unbundled versions fall back to NIV in getChapter.
  const version = getActiveReadingVersion();
  const chapter = getChapter(book.id, chapterNumber, version);
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

  // Scroll-position restore/persist. `pendingScrollY` is the offset we still
  // want to jump to once the content has grown tall enough to reach it; it is
  // consumed (set to null) after a successful restore so user scrolling isn't
  // fought. `saveTimer` debounces persistence while scrolling.
  const pendingScrollY = useRef(initialScrollY > 0 ? initialScrollY : null);
  const saveTimer = useRef(null);
  // False until the async "what offset should we restore?" lookup for the
  // current chapter has resolved. We suppress saving until then so an early
  // mount-time onScroll at y=0 can't overwrite the stored offset before we've
  // had the chance to read and restore it.
  const restoreResolved = useRef(false);
  // Largest content height seen for the current chapter, used to tell whether
  // the ScrollView content is still growing across layout passes.
  const lastContentHeight = useRef(0);

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

  // Decide what scroll offset to restore whenever this chapter (re)mounts. Two
  // sources feed in:
  //   1. `initialScrollY` from the app (set on launch-resume) - applied
  //      synchronously so a cold start lands in the right place immediately.
  //   2. The persisted position for THIS exact book+chapter - read async so we
  //      also restore when the Reader remounts during the session (switching
  //      tabs, or going back to the chapter list and returning). The record's
  //      book/chapter is stamped on reader entry, so we only honour it when it
  //      still matches to avoid dropping a stale offset onto a new chapter.
  useEffect(() => {
    let cancelled = false;
    restoreResolved.current = false;
    lastContentHeight.current = 0;
    pendingScrollY.current = initialScrollY > 0 ? initialScrollY : null;
    getLastPosition()
      .then((pos) => {
        if (cancelled) return;
        if (pos && pos.bookId === book.id && pos.chapterNumber === chapterNumber) {
          // Don't override once the user has already scrolled this mount (the
          // save path updates lastOffset as they move).
          if (lastOffset.current <= 0) {
            pendingScrollY.current = pos.scrollY > 0 ? pos.scrollY : null;
          }
        }
      })
      .finally(() => {
        if (!cancelled) restoreResolved.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [book.id, chapterNumber, initialScrollY]);

  // Flush any pending debounced save when unmounting.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // Restore the saved scroll offset once the chapter content has laid out tall
  // enough to contain it. Fires on content-size changes; consumes the pending
  // target on the first successful jump so we never fight the user afterwards.
  const handleContentSizeChange = useCallback(
    (_w, contentHeight) => {
      const target = pendingScrollY.current;
      if (target == null || target <= 0) return;
      // Content grows across several layout passes; onContentSizeChange fires
      // for each. Wait until it's tall enough to actually reach the target so we
      // don't clamp short and land above where the user left off. If the content
      // has stopped growing but is still shorter than the target (e.g. the
      // chapter is shorter now after a version switch), consume the target
      // anyway - scrollTo clamps to the max - so restore never gets stuck.
      const grew = contentHeight > lastContentHeight.current;
      lastContentHeight.current = contentHeight;
      if (contentHeight < target && grew) return;
      pendingScrollY.current = null;
      // A tiny delay lets the ScrollView settle its layout before jumping.
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: target, animated: false });
        lastOffset.current = target;
      });
    },
    []
  );

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

      // Persist the reading position (debounced) so we can resume at this exact
      // spot next launch. While a restore is still owed (pendingScrollY set), we
      // skip saving so a spurious mount-time onScroll at y=0 can't clobber the
      // stored offset before we've jumped to it. The programmatic restore jump
      // clears pendingScrollY, after which real user scrolls persist normally.
      if (
        onScrollPositionChange &&
        restoreResolved.current &&
        pendingScrollY.current == null
      ) {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          onScrollPositionChange(Math.max(0, y));
        }, 300);
      }

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
    [setChrome, onScrollPositionChange]
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
        onContentSizeChange={handleContentSizeChange}
        {...panResponder.panHandlers}
        key={`${book.id}-${chapterNumber}`}
      >
        {/* Tapping the reading area toggles the chrome (immersive reading). */}
        <TouchableOpacity activeOpacity={1} onPress={toggleChrome}>
          {/* Non-interactive page heading (the tappable version lives in the
              footer pill). Purely decorative, so it is not a button. */}
          <View style={styles.chapterHeading}>
            <Text
              style={[
                styles.chapterHeadingBook,
                { color: colors.text, fontFamily: readingFont(readingFontKey, "bold") },
              ]}
            >
              {book.name}
            </Text>
            <Text
              style={[
                styles.chapterHeadingNumber,
                { color: colors.accent, fontFamily: readingFont(readingFontKey, "semiBold") },
              ]}
            >
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
        {/* Chrome-style tab strip – sits above the nav arrows */}
        {readerTabs && readerTabs.length > 0 && (
          <ReaderTabBar
            tabs={readerTabs}
            activeTabId={activeTabId}
            onSelectTab={onSelectTab}
            onCloseTab={onCloseTab}
            onAddTab={onAddTab}
          />
        )}

        {/* Nav row: ‹  [ Book Chapter ]  › */}
        <View style={styles.footerNav}>
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
              style={[
                styles.footerPillText,
                { color: colors.text, fontFamily: readingFont(readingFontKey, "semiBold") },
              ]}
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
        </View>
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
    letterSpacing: 0.1,
    textAlign: "center",
  },
  chapterHeadingNumber: {
    fontSize: 15,
    letterSpacing: 0.8,
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
    flexDirection: "column",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  footerPillText: { fontSize: 16 },
});
