import React, { useRef, useCallback, useEffect, useState, useMemo, memo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  PanResponder,
  Animated,
  StatusBar,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { uiFont, readingFont } from "../theme/fonts";
import ChapterViewBase from "../components/ChapterView";
import ReaderTabBar from "../components/ReaderTabBar";
import ReaderTopBar from "../components/ReaderTopBar";
import SermonSheet from "../components/SermonSheet";
import BookIntroView, { TocSheet } from "../components/BookIntroView";
import { getChapter } from "../data/bibleData";
import { incrementReadCount } from "../data/progressStore";
import { addToHistory } from "../data/historyStore";
import { useTheme } from "../theme/ThemeContext";
import { getActiveReadingVersion } from "../data/bibleVersionStore";
import { getStudyNotes, getStudyNotesByVerse, getHeadingNote } from "../data/studyNotesData";
import { getReaderPrefs, setReaderPref } from "../data/readerPrefsStore";
import StudyNotesModal from "../components/StudyNotesModal";
import VerseNotePopover from "../components/VerseNotePopover";
// lastPositionStore is intentionally not imported here — the global
// lastPosition record is only needed at cold-launch time (handled in App.js).
// Per-tab scroll offsets are passed in via the initialScrollY prop so each
// tab independently restores to its own saved position.

// Memoized wrapper so scroll-driven ReaderScreen re-renders (chromeVisible state
// toggling ~16×/sec while scrolling) never cascade into ChapterView or its
// subtree. Only re-renders when the actual chapter data changes.
const ChapterView = memo(ChapterViewBase);


// Same glyph as the inline verse note icons in ChapterView.
const INFO_ICON_GLYPH = String.fromCodePoint(0xf02fd);

const SWIPE_THRESHOLD = 50;
// How far you must scroll down before the chrome hides (avoids twitchy hiding).
const HIDE_SCROLL_DELTA = 12;
// Upward fling speed (px per ms) that force-reveals the chrome.
const FAST_UP_VELOCITY = 1.2;
// Distance from the bottom that counts as "reached the end".
const END_THRESHOLD = 48;
// How many px the user must scroll before the verse note popover dismisses.
const POPOVER_SCROLL_DISMISS = 40;

export default function ReaderScreen({
  book,
  chapterNumber,
  initialScrollY = 0,
  onScrollPositionChange,
  onPrev,
  onNext,
  onBack,
  onOpenBooks,
  onOpenHistory,
  onChromeChange,
  hasPrev,
  hasNext,
  // Tab bar props – passed through from App
  readerTabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onAddTab,
  // Tab bar strip scroll position — persisted in App.js so it survives the
  // ReaderScreen remounts that happen on tab switches (key prop changes on tab id).
  tabBarScrollX = 0,
  onTabBarScrollX,
  // When true, ReaderTabBar should scroll to make the active tab visible
  // (used when returning from Stats/Memory/Settings). Consumed after use.
  tabBarScrollToActive = false,
  onTabBarScrollToActiveConsumed,
  // Sermon playback is owned by App.js so it outlives tab switches.
  onPlaySermon,
  activeSermonId,
  // Height of the app-level bottom chrome (sermon player + tab bar) that this
  // screen now draws behind. The reader's own footer stacks directly on top of
  // it, and the scroll content reserves both so the end of a chapter still
  // comes to rest clear of everything.
  bottomChromeHeight = 0,
  // Callback so App.js can shift the bottom chrome up when notes are open.
  onNotesOpenChange,
  // When true, this tab shows book intro instead of chapter content.
  isIntro = false,
  // Called when user taps "Read [Book] 1" on the intro view.
  onOpenChapterOne,
}) {
  const { colors, readingFontKey } = useTheme();
  const insets = useSafeAreaInsets();

  // Bump this to force a re-read of the (synchronously cached) active version
  // when the user picks a new translation from the top bar. Declared first so
  // the chapter useMemo below can reference it without a TDZ error.
  const [versionKey, setVersionKey] = useState(0);

  // Read in the user's selected translation. The active version is a synchronous
  // cached value (primed at startup, updated when changed in Settings); the
  // Reader re-reads it on each render, so switching versions then returning here
  // shows the new translation. Unbundled versions fall back to NIV in getChapter.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const version = getActiveReadingVersion();

  // Re-derive chapter whenever book, chapter number, or version changes.
  // versionKey triggers re-evaluation after a top-bar version switch.
  // getChapter() is now O(1) via a cached chapter index map (see bibleData.js).
  // chapterNumber is 0 for intro tabs — skip the lookup in that case.
  const chapter = useMemo(
    () => chapterNumber > 0 ? getChapter(book.id, chapterNumber, version) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [book.id, chapterNumber, version, versionKey]
  );
  const scrollRef = useRef(null);

  // Local mirror of chrome visibility so the Reader's own footer can animate
  // in sync with the app-level tab bar.
  const [chromeVisible, setChromeVisible] = useState(true);
  const footerAnim = useRef(new Animated.Value(0)).current; // 0 shown, 1 hidden
  const topBarAnim = useRef(new Animated.Value(0)).current;  // 0 shown, 1 hidden
  const lastOffset = useRef(0);
  // Measured footer height so the scroll content can reserve space for it -
  // this keeps the "Mark as Read" button clear of the footer at the end of
  // the chapter (the footer sits waiting below it, never overlapping).
  const [footerHeight, setFooterHeight] = useState(0);
  const [topBarHeight, setTopBarHeight] = useState(0);

  // Sermon sheet visibility. Closes when the chapter changes (see reset effect).
  // Playback deliberately does NOT live here — the player is hosted in App.js
  // so audio survives navigation.
  const [sermonsOpen, setSermonsOpen] = useState(false);

  // Study notes modal visibility + notes for the current chapter.
  const [notesOpen, setNotesOpen] = useState(false);
  const studyNotes = useMemo(
    () => getStudyNotes(book.name, chapterNumber),
    [book.name, chapterNumber]
  );
  const handleToggleNotes = useCallback(() => {
    setNotesOpen((o) => !o);
  }, []);

  // Heading note — shown as a ⓘ icon next to the chapter number in the heading.
  // Only present for Psalms and a handful of other books with title notes.
  const headingNote = useMemo(
    () => getHeadingNote(book.name, chapterNumber),
    [book.name, chapterNumber]
  );

  // Inline verse note icons — toggled by the ⓘ button in the top bar.
  // Initialised from the persisted store so the setting survives app restarts
  // and tab switches. Written back to the store on every toggle.
  const [verseNotesActive, setVerseNotesActive] = useState(
    () => getReaderPrefs().verseNotesActive
  );
  const verseNotesByVerse = useMemo(
    () => verseNotesActive ? getStudyNotesByVerse(book.name, chapterNumber) : null,
    [verseNotesActive, book.name, chapterNumber]
  );
  const handleToggleVerseNotes = useCallback(() => {
    setVerseNotesActive((o) => {
      const next = !o;
      setReaderPref("verseNotesActive", next);
      return next;
    });
  }, []);

  // Verse note popover state — handlers defined after setChrome below.
  const [popover, setPopover] = useState({ visible: false, notes: [], anchorY: 0 });
  const scrollYAtOpen = useRef(0);

  // TOC for book intro tabs
  const [tocOpen, setTocOpen] = useState(false);
  const introSectionRefs = useRef([]);
  const handleIntroSectionRefs = useCallback((refs) => {
    introSectionRefs.current = refs;
  }, []);
  const handleTocSelect = useCallback((index) => {
    setTocOpen(false);
    const ref = introSectionRefs.current[index];
    if (ref && scrollRef.current) {
      ref.measureLayout(
        scrollRef.current,
        (_x, y) => scrollRef.current?.scrollTo({ y, animated: false }),
        () => {}
      );
    }
  }, []);

  const handleSelectSermon = useCallback(
    (sermon) => {
      setSermonsOpen(false);
      onPlaySermon?.(sermon);
    },
    [onPlaySermon]
  );

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
  // Keep content invisible until we've jumped to the restored position so the
  // user never sees it flash from y=0 to wherever they left off.
  // Intro tabs always start at top so they're immediately ready.
  const [scrollReady, setScrollReady] = useState(isIntro);
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

  // Verse note popover handlers — defined here because they depend on setChrome.
  const handleNotePress = useCallback((verseNum, pageY) => {
    const notes = verseNotesByVerse?.get(verseNum) ?? [];
    if (notes.length === 0) return;
    scrollYAtOpen.current = lastOffset.current;
    setPopover({ visible: true, notes, anchorY: pageY });
    // Hide chrome for an immersive reading experience while the note is open.
    setChrome(false);
  }, [verseNotesByVerse, setChrome]);

  const handleDismissPopover = useCallback(() => {
    setPopover((p) => ({ ...p, visible: false }));
    setChrome(true);
  }, [setChrome]);

  // Reset transient UI state whenever the chapter changes. Previously these
  // were reset "for free" by the full ReaderScreen remount (key prop). Now that
  // the screen persists across chapter changes we reset them explicitly.
  useEffect(() => {
    lastOffset.current = 0;
    setChrome(true);
    setSermonsOpen(false);
    setNotesOpen(false);
    setPopover({ visible: false, notes: [], anchorY: 0 });
  }, [book.id, chapterNumber, setChrome]);

  // Decide what scroll offset to restore whenever the chapter changes.
  // `initialScrollY` is the single source of truth: App.js resolves it from
  // the per-tab scroll map (populated as the user scrolls) so each tab
  // independently restores its own position. Cold-launch restore is also
  // handled in App.js before the Reader ever mounts.
  //
  // Since ReaderScreen is no longer remounted on every chapter change (the key
  // prop only changes on tab switches), we must imperatively reset the scroll
  // position here. Without this the ScrollView would stay at its previous
  // chapter's offset when the content beneath it changes.
  useEffect(() => {
    restoreResolved.current = false;
    lastContentHeight.current = 0;
    setScrollReady(false);

    if (initialScrollY > 0) {
      // Non-zero restore target: hide content until we've jumped to it.
      pendingScrollY.current = initialScrollY;
    } else {
      // Jump to top immediately — no flash of wrong position.
      pendingScrollY.current = null;
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      lastOffset.current = 0;
      setScrollReady(true);
    }

    restoreResolved.current = true;
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
        // Reveal now that we're at the right position.
        setScrollReady(true);
      });
    },
    []
  );

  useEffect(() => {
    const duration = chromeVisible ? 120 : 160;
    Animated.parallel([
      Animated.timing(footerAnim, {
        toValue: chromeVisible ? 0 : 1,
        duration,
        useNativeDriver: true,
      }),
      Animated.timing(topBarAnim, {
        toValue: chromeVisible ? 0 : 1,
        duration,
        useNativeDriver: true,
      }),
    ]).start();
  }, [chromeVisible, footerAnim, topBarAnim]);

  const handleScroll = useCallback(
    (e) => {
      const { contentOffset, contentSize, layoutMeasurement, velocity } = e.nativeEvent;
      const y = contentOffset.y;
      const prevY = lastOffset.current;
      const dy = y - prevY;
      lastOffset.current = y;

      // Dismiss the verse note popover if the user scrolls away from where they tapped.
      if (Math.abs(y - scrollYAtOpen.current) > POPOVER_SCROLL_DISMISS) {
        setPopover((p) => {
          if (!p.visible) return p;
          setChrome(true);
          return { ...p, visible: false };
        });
      }

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
    // If the verse note popover is open, tap dismisses it instead of toggling chrome.
    setPopover((p) => {
      if (p.visible) {
        setChrome(true);
        return { ...p, visible: false };
      }
      setChrome(!chromeVisible);
      return p;
    });
  }, [chromeVisible, setChrome]);

  const handleMarkRead = useCallback(async () => {
    await incrementReadCount(book.id, chapterNumber);
    addToHistory(book.id, chapterNumber);
    // Advance to the next chapter after marking read, when there is one.
    if (hasNext) onNext();
  }, [book.id, chapterNumber, hasNext, onNext]);

  // PanResponder is created once (useRef) so its callbacks would close over
  // stale hasPrev/hasNext/onPrev/onNext values. Previously this was masked by
  // the full remount on every chapter change. Now that the screen persists we
  // use mutable refs so the handler always sees the latest values.
  const hasPrevRef = useRef(hasPrev);
  const hasNextRef = useRef(hasNext);
  const onPrevRef = useRef(onPrev);
  const onNextRef = useRef(onNext);
  useEffect(() => { hasPrevRef.current = hasPrev; }, [hasPrev]);
  useEffect(() => { hasNextRef.current = hasNext; }, [hasNext]);
  useEffect(() => { onPrevRef.current = onPrev; }, [onPrev]);
  useEffect(() => { onNextRef.current = onNext; }, [onNext]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderRelease: (_, g) => {
        if (g.dx <= -SWIPE_THRESHOLD && hasNextRef.current) onNextRef.current?.();
        else if (g.dx >= SWIPE_THRESHOLD && hasPrevRef.current) onPrevRef.current?.();
      },
    })
  ).current;

  // Memoized so scroll-driven re-renders (chromeVisible toggling) don't create
  // new style objects on every frame. Only recalculates when layout metrics change.
  const contentContainerStyle = useMemo(() => [
    styles.scrollContent,
    {
      // Reserve the full chrome stack — the reader's footer plus the
      // app's player / tab bar it sits on — so scrolling to the end of a
      // chapter leaves "Mark as Read" clear of all of it. The chrome
      // overlays the text on the way down, which is fine; this only has
      // to guarantee somewhere to land at the bottom.
      paddingBottom: footerHeight + bottomChromeHeight + 16,
      // Push content below the top bar (which itself includes insets.top).
      paddingTop: topBarHeight || insets.top,
    },
  ], [footerHeight, bottomChromeHeight, topBarHeight, insets.top]);

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["left", "right"]}
    >
      <StatusBar hidden={!chromeVisible} animated translucent />
      <ScrollView
        ref={scrollRef}
        style={scrollReady ? styles.scrollViewReady : styles.scrollViewHidden}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={contentContainerStyle}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onContentSizeChange={handleContentSizeChange}
        {...(isIntro ? {} : panResponder.panHandlers)}
      >
        {isIntro ? (
          <TouchableOpacity activeOpacity={1} onPress={toggleChrome}>
            <BookIntroView
              book={book}
              onOpenChapter={onOpenChapterOne}
              scrollRef={scrollRef}
              onSectionRefs={handleIntroSectionRefs}
            />
          </TouchableOpacity>
        ) : (
          /* Tapping the reading area toggles the chrome (immersive reading). */
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
              <View style={styles.chapterHeadingNumberRow}>
                <Text
                  style={[
                    styles.chapterHeadingNumber,
                    { color: colors.accent, fontFamily: readingFont(readingFontKey, "semiBold") },
                  ]}
                >
                  Chapter {chapterNumber}
                </Text>
                {headingNote && verseNotesActive ? (
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation?.();
                      scrollYAtOpen.current = lastOffset.current;
                      setPopover({
                        visible: true,
                        notes: [headingNote],
                        anchorY: e.nativeEvent.pageY,
                      });
                      setChrome(false);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    activeOpacity={0.6}
                  >
                    <Text style={[styles.headingNoteIcon, { color: colors.accent }]}>
                      {INFO_ICON_GLYPH}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={[styles.chapterHeadingRule, { backgroundColor: colors.border }]} />
            </View>

            <ChapterView
              chapter={chapter}
              noteVerses={verseNotesByVerse}
              onNotePress={handleNotePress}
            />
          </TouchableOpacity>
        )}

        {/* End-of-chapter action — only for real chapters, not intro. */}
        {!isIntro && (
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
        )}
      </ScrollView>

      {/* Reading appearance + version selector. Slides up out of view while
          scrolling down, reveals on scroll-up / at top / at bottom — same
          trigger as the footer so both chrome bars move together. */}
      <ReaderTopBar
        barAnim={topBarAnim}
        barHeight={topBarHeight}
        onHeightChange={setTopBarHeight}
        activeVersion={version}
        onVersionChange={() => setVersionKey((k) => k + 1)}
        onOpenSermons={() => setSermonsOpen(true)}
        onOpenHistory={onOpenHistory}
        notesOpen={notesOpen}
        onToggleNotes={isIntro ? undefined : handleToggleNotes}
        verseNotesActive={verseNotesActive}
        onToggleVerseNotes={isIntro ? undefined : handleToggleVerseNotes}
        tocOpen={tocOpen}
        onToggleToc={isIntro ? () => setTocOpen((o) => !o) : undefined}
      />

      {/* TOC sheet for intro tabs — Modal manages its own overlay */}
      {isIntro && tocOpen && (
        <TocSheet
          sections={require("../../data/book-info.json")[
            { "Psalm": "Psalms", "Song of Songs": "Song of Solomon" }[book.name] ?? book.name
          ]?.sections ?? []}
          onSelect={handleTocSelect}
          onClose={() => setTocOpen(false)}
          colors={colors}
        />
      )}

      {/* Sermons for the current book / chapter. Mounted only while open so
          that nothing is fetched until the Listen button is actually tapped. */}
      {sermonsOpen && (
        <SermonSheet
          visible={sermonsOpen}
          onClose={() => setSermonsOpen(false)}
          book={book}
          chapterNumber={isIntro ? null : chapterNumber}
          onSelectSermon={handleSelectSermon}
          activeSermonId={activeSermonId}
        />
      )}

      {/* Study notes modal — full-screen sheet for viewing all chapter notes. */}
      <StudyNotesModal
        visible={notesOpen}
        onClose={() => setNotesOpen(false)}
        book={book}
        chapterNumber={chapterNumber}
        notes={studyNotes}
      />

      {/* Verse note popover — contextual card anchored near a tapped ⓘ icon.
          Dismisses on tap-outside or when the user scrolls away. */}
      <VerseNotePopover
        visible={popover.visible}
        notes={popover.notes}
        anchorY={popover.anchorY}
        onDismiss={handleDismissPopover}
      />

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
            // No bottom inset here. This footer rests directly on the app's
            // bottom chrome, which already clears the gesture pill / home
            // indicator. Padding for it again left a band of dead background
            // under the chapter pill.
            bottom: bottomChromeHeight,
            opacity: footerAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
            transform: [
              {
                // Travel past the chrome below it as well, so the footer clears
                // the screen entirely rather than parking over the tab bar.
                translateY: footerAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, (footerHeight || 80) + bottomChromeHeight],
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
            scrollX={tabBarScrollX}
            onScrollX={onTabBarScrollX}
            scrollToActive={tabBarScrollToActive}
            onScrollToActiveConsumed={onTabBarScrollToActiveConsumed}
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
            accessibilityLabel={isIntro ? `${book.name} introduction` : `${book.name} ${chapterNumber}, tap to choose another book or chapter`}
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
              {isIntro ? book.name : `${book.name} ${chapterNumber}`}
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
  scrollContent: {},
  scrollViewReady: { flex: 1, opacity: 1 },
  scrollViewHidden: { flex: 1, opacity: 0 },
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
  chapterHeadingNumberRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 4,
  },
  chapterHeadingNumber: {
    fontSize: 15,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  headingNoteIcon: {
    fontFamily: "MaterialCommunityIcons",
    fontSize: 15,
    lineHeight: 18,
  },
  chapterHeadingRule: {
    width: 40,
    height: 2,
    borderRadius: 1,
    marginTop: 14,
  },
  markReadBtn: {
    marginTop: 12,
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
