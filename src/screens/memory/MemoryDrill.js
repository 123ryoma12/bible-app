import React, { useMemo, useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Pressable,
  Keyboard,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { readingFont, uiFont } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeContext";
import {
  buildDrill,
  isTypable,
  checkLetter,
  nextTypableIndex,
  failedVerseIndices,
  attemptSucceeded,
  resolveOutcome,
} from "../../data/memoryDrill";
import {
  STATUS,
  MAX_STAGE,
  referenceLabel,
  markMemorised,
  recordAttempt,
  saveStage,
} from "../../data/memoryStore";

// The learning stage saved on a set (falls back to 1 for older entries / any
// out-of-range value). Memorised sets ignore stage entirely.
function readStage(entry) {
  const s = Number(entry && entry.stage);
  if (!s || s < 1) return 1;
  return Math.min(MAX_STAGE, s);
}

// Interactive typing drill that walks through an ORDERED list of memory sets.
// The user types the initial letter of each word; correct letters reveal the
// word, wrong letters paint it red (but still advance). Each verse must be 100%
// correct to pass.
//
// Auto-advance rules (per spec):
//   - Not-memorised set: passing stage 1 -> stage 2, stage 2 -> stage 3 (same
//     set). Passing stage 3 memorises it AND auto-advances to the next set.
//     Failing keeps you on the current stage.
//   - Memorised set: passing auto-advances to the next set; failing stays on
//     the current set to retry.
//   - Advancing past the last set exits back to the Memory list.
//
// The learning STAGE (1 -> 2 -> 3) is tracked only in local state here, never
// persisted: leaving mid-way restarts at stage 1 next time. Only the final
// "memorised" promotion (after clearing stage 3) is saved.
//
// Props:
//   list        ordered array of memory-set records to walk through
//   startIndex  index into `list` to begin at
//   onExit()    called to return to the list (after refreshing it)
export default function MemoryDrill({ list, startIndex = 0, onExit }) {
  const { colors, readingFontKey } = useTheme();
  const inputRef = useRef(null);
  // Scroll container + the Y offset of the first verse being attempted, used to
  // scroll to it once when a run (re)starts. No while-typing auto-scroll.
  const scrollRef = useRef(null);
  const firstAttemptYRef = useRef(0);
  // Live keyboard height (0 when hidden). Drives bottom padding on the scroll
  // content so the last lines can be scrolled clear of the keyboard by the user.
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Position within the ordered list. The active `entry` is derived from it.
  const [position, setPosition] = useState(startIndex);
  const entry = list[position];

  const startedMemorised = entry.status === STATUS.MEMORISED;
  // Learning stage for not-yet-memorised sets. Resumes from the set's saved
  // stage (so leaving mid-way no longer restarts at stage 1); re-synced to the
  // new set's saved stage whenever we move sets (see the position effect below).
  const [stage, setStage] = useState(() => readStage(entry));
  // Whether we're currently drilling in "memorised" (no-words) mode. Becomes
  // true either because the set was already memorised, or because the user just
  // cleared stage 3 this session.
  const [memorised, setMemorised] = useState(startedMemorised);

  // `runOrder` is the set of verse indices to attempt this run. Starts as all
  // verses; after a partial fail it becomes just the failed ones (retry).
  const [runOrder, setRunOrder] = useState(null); // null until first build
  const [seed, setSeed] = useState(() => Date.now());
  const drill = useMemo(
    () => buildDrill(entry.verses, { stage, memorised, seed, order: runOrder || undefined }),
    [entry.verses, stage, memorised, seed, runOrder]
  );

  // Position within the current run.
  const [orderPos, setOrderPos] = useState(0); // index into drill.order
  const [wordPos, setWordPos] = useState(() => nextTypableIndex(drill.verses[drill.order[0]].tokens, 0));
  // Mirror of wordPos that updates synchronously. When the user types fast,
  // several characters can arrive in a single onChangeText (or in back-to-back
  // events before React re-renders); relying on the `wordPos` state alone would
  // re-check the same word and silently drop keystrokes. The ref lets us walk
  // forward within one event / across rapid events without waiting for a render.
  const wordPosRef = useRef(wordPos);
  // The hidden input is UNCONTROLLED (no value="" reset). Forcing the native
  // value back to "" after every keystroke fights the native text buffer and
  // drops characters under fast typing (RN docs warn about this). Instead we
  // let the field accumulate and remember how many characters we've already
  // consumed, processing only the newly-appended tail on each change event.
  const consumedRef = useRef(0);
  // The length (in code points) of the full text the native buffer last
  // reported via onChangeText. handleType keeps this current on every event;
  // clearInputBuffer uses it to mark everything typed so far as consumed when
  // we advance to a new verse, WITHOUT relying on a synchronous native clear().
  const bufferLenRef = useRef(0);
  // Per-word correctness for the CURRENT verse: index -> true|false|undefined.
  // `wordState` drives rendering (WordSlot colours). `wordStateRef` is a
  // synchronous mirror used for the PASS/FAIL decision: setWordState is async,
  // so a wrong letter typed in one onChangeText event may not be reflected in
  // the `wordState` closure captured by a later event that completes the verse.
  // Reading correctness from the ref guarantees finishVerse sees every letter
  // (including earlier wrong ones) regardless of React's render timing.
  const [wordState, setWordState] = useState({});
  const wordStateRef = useRef({});
  // Per-word correctness for verses ALREADY completed this run, keyed by
  // verseIndex -> { wordIndex: true|false }. Lets finished verses render their
  // TRUE colours (wrong words stay red) instead of being blanket-marked correct.
  const [doneWordStates, setDoneWordStates] = useState({});
  // Verse indices that PASSED on a previous attempt of this stage and are now
  // being carried through a failed-verse retry: still rendered (greyed) for
  // context, but not re-typed — the cursor auto-skips them. Empty on a fresh
  // full-stage run.
  const [carriedPassed, setCarriedPassed] = useState(() => new Set());
  // Accumulated pass/fail per verseIndex for this run.
  const [results, setResults] = useState({});
  // Screen phase. There is no longer a "done" screen — a failed attempt now
  // auto-retries the failed verses in place — but `phase` is kept as a small
  // guard so a late keystroke can't be processed during a state transition.
  const [phase, setPhase] = useState("typing");

  const currentVerseIndex = drill.order[orderPos];
  const currentVerse = drill.verses[currentVerseIndex];

  // Keep the hidden input focused so key presses are captured.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current && inputRef.current.focus(), 50);
    return () => clearTimeout(t);
  }, [orderPos, phase]);

  // Track the on-screen keyboard height so we can pad the scroll content and
  // scroll the active word above the keyboard. Uses the "Will"/"Did" events
  // appropriate to each platform (iOS emits Will*, Android only Did*).
  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = (e) => setKeyboardHeight(e?.endCoordinates?.height ?? 0);
    const onHide = () => setKeyboardHeight(0);
    const s = Keyboard.addListener(showEvt, onShow);
    const h = Keyboard.addListener(hideEvt, onHide);
    return () => {
      s.remove();
      h.remove();
    };
  }, []);

  // Scroll to the FIRST verse being attempted whenever a run (re)starts — a
  // fresh full run scrolls to the top; a failed-verse retry scrolls to the
  // first failed verse. We do NOT auto-scroll while typing; the user scrolls
  // themselves. Keyed on `seed` (changes on every (re)start) so it fires once
  // per run start, after the layout has settled.
  useEffect(() => {
    if (phase !== "typing") return;
    const raf = requestAnimationFrame(() => {
      if (!scrollRef.current) return;
      // firstAttemptY is captured by the first attempted verse's onLayout.
      const y = firstAttemptYRef.current;
      scrollRef.current.scrollTo({ y: Math.max(0, y - 20), animated: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [seed, phase]);

  function resetForVerse(verse) {
    const first = nextTypableIndex(verse.tokens, 0);
    wordPosRef.current = first;
    setWordPos(first);
    wordStateRef.current = {};
    setWordState({});
    clearInputBuffer();
  }

  // Re-focus the hidden input to bring the keyboard back (e.g. after the user
  // taps the verse text, which would otherwise dismiss it).
  function focusInput() {
    inputRef.current && inputRef.current.focus();
  }

  // Handle typed input against the current verse, one word per character.
  //
  // The input is uncontrolled, so `fullText` is the ENTIRE accumulated field
  // contents. We only process the tail we haven't seen yet (`consumedRef`),
  // which lets fast typing accumulate freely in the native buffer without the
  // value="" reset that was dropping keystrokes. Each new character maps to the
  // next typable word; we advance via the synchronous `wordPosRef` and keep a
  // local correctness accumulator so finishVerse sees every letter immediately.
  function handleType(fullText) {
    if (phase !== "typing" || !currentVerse) return;
    const all = Array.from(fullText || "");
    bufferLenRef.current = all.length;
    // Guard against consumedRef drifting past the current buffer length. If the
    // native field was cleared/shrunk (e.g. autofill, backspace-to-empty), the
    // reported text can be shorter than what we've consumed; clamp so slice()
    // starts at a valid position instead of returning garbage.
    if (consumedRef.current > all.length) consumedRef.current = all.length;
    const fresh = all.slice(consumedRef.current);
    consumedRef.current = all.length;
    if (fresh.length === 0) return;

    const tokens = currentVerse.tokens;
    let pos = wordPosRef.current;
    const updates = {};
    let finished = false;

    for (const ch of fresh) {
      const token = tokens[pos];
      if (!token) break; // verse already fully consumed

      const { correct } = checkLetter(token, ch);
      updates[pos] = correct;
      // Record correctness synchronously so finishVerse never misses a wrong
      // letter typed in an earlier event (setWordState is async).
      wordStateRef.current[pos] = correct;

      const next = nextTypableIndex(tokens, pos + 1);
      if (next < tokens.length) {
        pos = next;
      } else {
        finished = true;
        break;
      }
    }

    wordPosRef.current = pos;
    setWordPos(pos);
    setWordState((prev) => ({ ...prev, ...updates }));

    if (finished) {
      // Use the synchronous ref (a copy) — the single source of truth for the
      // pass/fail decision — rather than the possibly-stale wordState closure.
      finishVerse({ ...wordStateRef.current });
    }
  }

  // Reset our consumed-count when moving to a new verse.
  //
  // IMPORTANT: we do NOT call inputRef.current.clear() here. `.clear()` is a
  // native imperative command that does not empty the buffer synchronously
  // (notably on Android). If we zeroed `consumedRef` and the buffer hadn't yet
  // cleared, the very next onChangeText would arrive with the PREVIOUS verse's
  // full text still present, and — with consumedRef at 0 — handleType would
  // treat that entire accumulated string as "fresh" and replay it across every
  // word of the new verse in a single keystroke. Instead we leave the native
  // buffer alone and advance consumedRef to whatever it currently holds, so
  // only genuinely new characters are processed. The buffer growing over a run
  // is harmless (a few hundred chars at most).
  function clearInputBuffer() {
    // Mark everything the native buffer has reported so far as already consumed,
    // so the next keystroke's onChangeText only yields the genuinely new tail.
    consumedRef.current = bufferLenRef.current;
  }

  // A verse is complete: it passes only if every typable word was correct.
  function finishVerse(finalWordState) {
    const passed = currentVerse.tokens.every((tok, i) => {
      if (!isTypable(tok)) return true;
      return finalWordState[i] === true;
    });

    const nextResults = { ...results, [currentVerseIndex]: passed };
    setResults(nextResults);
    // Snapshot this verse's per-word correctness so it renders its true colours
    // once it becomes a "done" (earlier) verse in the paragraph.
    setDoneWordStates((prev) => ({ ...prev, [currentVerseIndex]: { ...finalWordState } }));

    const nextPos = orderPos + 1;
    if (nextPos < drill.order.length) {
      setOrderPos(nextPos);
      resetForVerse(drill.verses[drill.order[nextPos]]);
    } else {
      completeRun(nextResults);
    }
  }

  // Starts a fresh full-verse run of the current set at the current stage.
  function startFreshRun() {
    setRunOrder(entry.verses.map((_, i) => i));
    setSeed(Date.now());
    setResults({});
    setDoneWordStates({});
    setCarriedPassed(new Set());
    setOrderPos(0);
    setPhase("typing");
  }

  // Move to the next set in the ordered list, or exit if we're at the end.
  // Per-set state (stage/memorised/run) is reset by the `position` effect.
  function goToNext() {
    if (position + 1 < list.length) {
      setPosition(position + 1);
    } else {
      onExit();
    }
  }

  // All verses in this run attempted: apply the auto-advance rules (see
  // resolveOutcome for the decision logic).
  async function completeRun(nextResults) {
    const resultsArray = entry.verses.map((_, i) =>
      i in nextResults ? nextResults[i] : null
    );
    const finishedDrill = { order: drill.order, results: resultsArray };
    const success = attemptSucceeded(finishedDrill);
    const stageAtRun = stage;

    const action = resolveOutcome({ success, memorised, stage: stageAtRun });

    // Persist any stat/status changes the action calls for.
    let updatedEntry = entry;
    if (action.memorise) await markMemorised(entry.id);
    if (action.recordAttempt) {
      updatedEntry = await recordAttempt(entry.id, { success });
    }

    switch (action.type) {
      case "advanceStage":
        // Passed a non-final stage: bump stage, continue same set immediately.
        // Persist the reached stage so leaving now resumes here next session.
        setStage(action.nextStage);
        saveStage(entry.id, action.nextStage);
        startFreshRun();
        return;
      case "next":
        // Finished this set: auto-advance to the next (or exit at the end).
        goToNext();
        return;
      case "stay":
      default:
        // Failed: automatically re-attempt just the failed verses (passed ones
        // stay greyed and are auto-skipped). No intermediate screen or buttons.
        // If every verse failed, retryFailed degrades to a full-stage restart.
        // The top-left back button remains the only escape from a fail loop.
        retryFailed(resultsArray);
        return;
    }
  }

  // Retry only the verses that failed a run. The verses that PASSED stay on
  // screen (greyed, via carriedPassed) with their revealed text, and the cursor
  // auto-skips them so the user only re-types the failed ones. If every verse
  // failed (or none are known), this degrades to a full-stage restart.
  //
  // `resultsArray` is the pass/fail array from the just-finished run so this can
  // be driven automatically from completeRun without waiting on state.
  function retryFailed(resultsArray) {
    const failed = failedVerseIndices(resultsArray);
    const allIndices = entry.verses.map((_, i) => i);
    const attempt = failed.length ? failed : allIndices;
    // Passed verses to carry through greyed = everything not being re-attempted.
    const passed = new Set(allIndices.filter((i) => !attempt.includes(i)));

    setRunOrder(attempt);
    setSeed(Date.now());
    setResults({});
    setCarriedPassed(passed);
    // Keep doneWordStates for carried verses so they render their true colours;
    // drop any entries for verses we're about to re-attempt.
    setDoneWordStates((prev) => {
      const next = {};
      passed.forEach((i) => {
        if (prev[i]) next[i] = prev[i];
      });
      return next;
    });
    setOrderPos(0);
    setPhase("typing");
    // wordPos resets via the rebuilt drill in an effect below.
  }

  // Restart the entire current stage from scratch (all verses to type again).
  function retryAll() {
    setRunOrder(entry.verses.map((_, i) => i));
    setSeed(Date.now());
    setResults({});
    setDoneWordStates({});
    setCarriedPassed(new Set());
    setOrderPos(0);
    setPhase("typing");
  }

  // Header refresh button. Restarts the CURRENT context: if we're partway
  // through a failed-verse retry (some verses carried/greyed), restart just that
  // failed-verse attempt again (re-type the same failed verses, passed ones stay
  // greyed). Otherwise restart the whole current stage.
  function refreshCurrent() {
    if (carriedPassed.size > 0) {
      // Rebuild the same failed-verse attempt: the verses NOT carried are the
      // ones being re-attempted. Re-seed to re-randomise stage-2 visibility.
      const attempt = entry.verses.map((_, i) => i).filter((i) => !carriedPassed.has(i));
      setRunOrder(attempt.length ? attempt : entry.verses.map((_, i) => i));
      setSeed(Date.now());
      setResults({});
      // Reset only the re-attempted verses' word states; keep carried greyed.
      setDoneWordStates((prev) => {
        const next = {};
        carriedPassed.forEach((i) => {
          if (prev[i]) next[i] = prev[i];
        });
        return next;
      });
      setOrderPos(0);
      setPhase("typing");
    } else {
      retryAll();
    }
  }

  // When the drill is rebuilt (retry), reset the word cursor to its first word.
  useEffect(() => {
    if (phase === "typing") {
      const v = drill.verses[drill.order[0]];
      if (v) resetForVerse(v);
      setOrderPos(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, runOrder]);

  // Moving to a new set in the list: reset all per-set state. Stage resumes from
  // the new set's saved stage, memorised mode follows the new set's saved
  // status, and a fresh run of all verses begins. Skipped on the very first
  // mount (handled by initial state).
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    setStage(readStage(list[position]));
    setMemorised(list[position].status === STATUS.MEMORISED);
    startFreshRun();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position]);

  const stageLabel = memorised
    ? "Memorised"
    : `Stage ${stage} of ${MAX_STAGE}`;

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => onExit()} hitSlop={hit}>
          <Text style={[styles.back, { color: colors.accent }]} numberOfLines={1}>
            {"‹ Memory"}
          </Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
            {referenceLabel(entry)}
          </Text>
          <Text style={[styles.subtitle, { color: colors.secondaryText }]} numberOfLines={1}>
            {stageLabel}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.resetBtn}
          onPress={refreshCurrent}
          hitSlop={hit}
          accessibilityRole="button"
          accessibilityLabel={
            carriedPassed.size > 0
              ? "Restart this failed-verse attempt"
              : "Restart this stage"
          }
        >
          <Ionicons name="refresh" size={22} color={colors.accent} />
        </TouchableOpacity>
      </View>

      {phase === "typing" ? (
        <>
          <ScrollView
            ref={scrollRef}
            style={styles.versesScroll}
            contentContainerStyle={[
              styles.versesWrap,
              // Pad the bottom by the keyboard height so the final lines can be
              // scrolled clear of the keyboard (by the user).
              { paddingBottom: 20 + keyboardHeight },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            {/* Tapping anywhere on the verses brings the keyboard back (tapping
                the text would otherwise blur the hidden input). Verses flow as
                one continuous paragraph (like the chapter reader) with inline
                superscript verse numbers, rather than one block per verse. */}
            <Pressable onPress={focusInput}>
              <View style={styles.verseLineWrap}>
                {/* Render EVERY verse in natural order so a failed-verse retry
                    still shows the passed verses (greyed) for context. The
                    cursor only stops on the verses in the attempt set
                    (drill.order); passed/carried verses are auto-skipped. */}
                {drill.verses.map((verse, vIdx) => {
                  const isCurrent = vIdx === currentVerseIndex;
                  // The first verse being attempted this run (drill.order[0]);
                  // we capture its position to scroll to it on run (re)start.
                  const isFirstAttempt = vIdx === drill.order[0];
                  const firstTypable = nextTypableIndex(verse.tokens, 0);
                  // Passed on a prior attempt and carried through greyed.
                  const isCarried = carriedPassed.has(vIdx);
                  // Completed earlier in THIS run (already-typed, shows true
                  // colours). carried verses also have a doneWordStates entry.
                  const doneState = doneWordStates[vIdx];
                  return (
                    <React.Fragment key={vIdx}>
                      <View style={styles.verseNumWrap}>
                        <Text
                          style={[
                            styles.verseNumInline,
                            {
                              color: colors.mutedText,
                              fontFamily: readingFont(readingFontKey, "semiBold"),
                            },
                          ]}
                        >
                          {verse.reference.verse}
                          <Text> </Text>
                        </Text>
                      </View>
                      {verse.tokens.map((tok, ti) => {
                        const isActiveWord = isCurrent && ti === wordPos;
                        // Capture the Y of the first attempted verse's first
                        // word so we can scroll to it when the run (re)starts.
                        const measureThis = isFirstAttempt && ti === firstTypable;
                        return (
                          <WordSlot
                            key={`${vIdx}-${ti}`}
                            token={tok}
                            shown={verse.visibility[ti]}
                            state={
                              isCurrent
                                ? wordState[ti]
                                : doneState
                                ? doneState[ti]
                                : undefined
                            }
                            isActive={isActiveWord}
                            dimmed={isCarried}
                            colors={colors}
                            readingFontKey={readingFontKey}
                            onMeasure={
                              measureThis
                                ? (y) => {
                                    firstAttemptYRef.current = y;
                                  }
                                : undefined
                            }
                          />
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </View>
            </Pressable>
          </ScrollView>

          <Text
            style={[styles.hint, { color: colors.mutedText }]}
            onPress={focusInput}
            suppressHighlighting
          >
            Type the first letter of each word.
          </Text>

          {/* Hidden capture input. It is UNCONTROLLED (defaultValue, not value)
              so the native buffer can accumulate fast keystrokes without a
              per-keystroke value="" reset fighting it and dropping characters.
              handleType receives the full accumulated text and processes only
              the newly-typed tail; the buffer is cleared on each verse change.
              spellCheck/textContentType off so nothing injects/replaces text. */}
          <TextInput
            ref={inputRef}
            defaultValue=""
            onChangeText={handleType}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
            caretHidden
            blurOnSubmit={false}
            style={styles.hiddenInput}
          />
        </>
      ) : null}
    </SafeAreaView>
  );
}

// A single word. To keep the line from reflowing when a word is revealed, the
// real word text is ALWAYS laid out (identical glyph metrics). When the word is
// hidden we cover its glyphs with an opaque overlay (filled with the screen
// background colour) topped by an underline - so the letters are genuinely not
// visible (independent of text-colour quirks) yet occupy the exact same space.
// Revealing just removes the overlay -> zero shift.
//   hidden + untyped -> real text covered by background overlay + underline
//   correct          -> normal text colour (active = accent)
//   wrong            -> red
function WordSlot({
  token,
  shown,
  state,
  isActive,
  dimmed,
  colors,
  readingFontKey,
  onMeasure,
}) {
  // Report this word's position/size within the scroll content (only wired for
  // the active word) so the parent can keep it visible above the keyboard.
  const handleLayout = onMeasure
    ? (e) => {
        const { y, height } = e.nativeEvent.layout;
        onMeasure(y, height);
      }
    : undefined;

  if (!isTypable(token)) {
    // Punctuation-only token: always render as-is, non-interactive.
    return (
      <View style={styles.wordWrap}>
        <Text
          style={[
            styles.verseLine,
            {
              color: dimmed ? colors.mutedText : colors.secondaryText,
              fontFamily: readingFont(readingFontKey),
            },
          ]}
        >
          {token.text}
          <Text> </Text>
        </Text>
      </View>
    );
  }

  const typed = state === true || state === false;
  // Carried (passed, greyed) verses always show their full text — never covered
  // or underlined — so the reader sees them as settled context, not blanks.
  const isBlank = !dimmed && !shown && !typed; // covered placeholder
  const showUnderline = !dimmed && (isBlank || isActive);

  let color;
  if (dimmed) color = colors.mutedText; // carried-through passed verse (greyed)
  else if (state === true) color = isActive ? colors.accent : colors.text; // correct
  else if (state === false) color = colors.danger; // wrong
  else if (shown) color = colors.secondaryText; // hint shown, not yet typed
  else color = colors.text; // blank: real colour, but hidden by the overlay

  return (
    <View style={styles.wordWrap} onLayout={handleLayout}>
      <Text style={[styles.verseLine, { color, fontFamily: readingFont(readingFontKey) }]}>
        {token.text}
        <Text> </Text>
      </Text>
      {isBlank && (
        // Opaque cover over just the word's glyphs (not the trailing space).
        <View
          pointerEvents="none"
          style={[styles.wordCover, { backgroundColor: colors.background }]}
        />
      )}
      {showUnderline && (
        <View
          pointerEvents="none"
          style={[
            styles.wordUnderline,
            { backgroundColor: isActive ? colors.accent : colors.mutedText },
          ]}
        />
      )}
    </View>
  );
}

const hit = { top: 10, bottom: 10, left: 10, right: 10 };

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 84 },
  resetBtn: { width: 84, alignItems: "flex-end" },
  headerCenter: { flex: 1, alignItems: "center", paddingHorizontal: 4 },
  back: { fontSize: 16, fontFamily: uiFont() },
  title: { fontSize: 17, fontFamily: uiFont(700) },
  subtitle: { fontSize: 12, marginTop: 2, fontFamily: uiFont() },
  // The verses ScrollView fills the space between the header and the hint/input.
  // We track the keyboard height (Keyboard API) and pad the content bottom by
  // it, plus auto-scroll the active word into view, rather than using
  // KeyboardAvoidingView (which fought the tiny absolute hidden input and could
  // leave it unfocusable → keyboard not opening on long verses).
  versesScroll: { flex: 1 },
  versesWrap: { padding: 20, flexGrow: 1 },
  verseLine: { fontSize: 20, lineHeight: 32 },
  // Words are laid out as wrapping inline-block "chips" so a hidden word can be
  // covered by an absolutely-positioned overlay without disturbing the line.
  verseLineWrap: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end" },
  wordWrap: { position: "relative" },
  // Inline superscript verse number at the start of each verse (matches the
  // subtle muted number used in the chapter reader).
  verseNumWrap: { alignSelf: "flex-start" },
  verseNumInline: { fontSize: 12, lineHeight: 20 },
  // Opaque cover over a hidden word's glyphs. Spans the FULL chip height so
  // letter descenders (g, y, p, q, j) are hidden too. Leaves a small right gap
  // for the word's trailing space.
  wordCover: {
    position: "absolute",
    left: 0,
    right: 5,
    top: 0,
    bottom: 0,
  },
  // The blank/active underline. Rendered AFTER the cover so it sits on top of
  // it; pinned just below the visual baseline (well above the line-box bottom).
  wordUnderline: {
    position: "absolute",
    left: 0,
    right: 5,
    bottom: 7,
    height: 2,
    borderRadius: 1,
  },
  hint: { textAlign: "center", fontSize: 13, paddingBottom: 8, fontFamily: uiFont() },
  hiddenInput: {
    position: "absolute",
    height: 1,
    width: 1,
    opacity: 0,
    bottom: 0,
  },
});
