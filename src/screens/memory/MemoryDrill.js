import React, { useMemo, useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { uiFont, FONT_FAMILIES } from "../../theme/fonts";
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
  successRate,
  successCount,
  failureCount,
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
  const { colors } = useTheme();
  const inputRef = useRef(null);

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
  // Per-word correctness for the CURRENT verse: index -> true|false|undefined.
  const [wordState, setWordState] = useState({});
  // Accumulated pass/fail per verseIndex for this run.
  const [results, setResults] = useState({});
  // Screen phase: "typing" | "done".
  const [phase, setPhase] = useState("typing");
  const [finalOutcome, setFinalOutcome] = useState(null); // {success, updatedEntry}

  const currentVerseIndex = drill.order[orderPos];
  const currentVerse = drill.verses[currentVerseIndex];

  // Keep the hidden input focused so key presses are captured.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current && inputRef.current.focus(), 50);
    return () => clearTimeout(t);
  }, [orderPos, phase]);

  function resetForVerse(verse) {
    setWordPos(nextTypableIndex(verse.tokens, 0));
    setWordState({});
  }

  // Re-focus the hidden input to bring the keyboard back (e.g. after the user
  // taps the verse text, which would otherwise dismiss it).
  function focusInput() {
    inputRef.current && inputRef.current.focus();
  }

  // Handle one typed character against the current word, then advance.
  function handleType(char) {
    if (phase !== "typing" || !currentVerse) return;
    const token = currentVerse.tokens[wordPos];
    if (!token) return;

    const { correct } = checkLetter(token, char);
    setWordState((prev) => ({ ...prev, [wordPos]: correct }));

    const next = nextTypableIndex(currentVerse.tokens, wordPos + 1);
    if (next < currentVerse.tokens.length) {
      setWordPos(next);
    } else {
      finishVerse({ ...wordState, [wordPos]: correct });
    }
  }

  // A verse is complete: it passes only if every typable word was correct.
  function finishVerse(finalWordState) {
    const passed = currentVerse.tokens.every((tok, i) => {
      if (!isTypable(tok)) return true;
      return finalWordState[i] === true;
    });

    const nextResults = { ...results, [currentVerseIndex]: passed };
    setResults(nextResults);

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
    setOrderPos(0);
    setPhase("typing");
    setFinalOutcome(null);
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
        // Failed: stay on the current set/stage and show retry options.
        setFinalOutcome({ success: false, updatedEntry, resultsArray, stageAtRun });
        setPhase("done");
        return;
    }
  }

  // Retry only the verses that failed this run (same-session behaviour).
  function retryFailed() {
    const failed = failedVerseIndices(finalOutcome.resultsArray);
    const order = failed.length ? failed : entry.verses.map((_, i) => i);
    setRunOrder(order);
    setSeed(Date.now());
    setResults({});
    setOrderPos(0);
    setPhase("typing");
    setFinalOutcome(null);
    // wordPos resets via the rebuilt drill in an effect below.
  }

  function retryAll() {
    setRunOrder(entry.verses.map((_, i) => i));
    setSeed(Date.now());
    setResults({});
    setOrderPos(0);
    setPhase("typing");
    setFinalOutcome(null);
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
        {phase === "typing" ? (
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={retryAll}
            hitSlop={hit}
            accessibilityRole="button"
            accessibilityLabel="Restart this attempt"
          >
            <Ionicons name="refresh" size={22} color={colors.accent} />
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      {phase === "typing" ? (
        <>
          <ScrollView
            contentContainerStyle={styles.versesWrap}
            keyboardShouldPersistTaps="handled"
          >
            {/* Tapping anywhere on the verses brings the keyboard back (tapping
                the text would otherwise blur the hidden input). Verses flow as
                one continuous paragraph (like the chapter reader) with inline
                superscript verse numbers, rather than one block per verse. */}
            <Pressable onPress={focusInput}>
              <View style={styles.verseLineWrap}>
                {drill.order.map((vIdx, i) => {
                  const verse = drill.verses[vIdx];
                  const isCurrent = i === orderPos;
                  const done = i < orderPos;
                  return (
                    <React.Fragment key={vIdx}>
                      <View style={styles.verseNumWrap}>
                        <Text style={[styles.verseNumInline, { color: colors.mutedText }]}>
                          {verse.reference.verse}
                          <Text> </Text>
                        </Text>
                      </View>
                      {verse.tokens.map((tok, ti) => (
                        <WordSlot
                          key={`${vIdx}-${ti}`}
                          token={tok}
                          shown={verse.visibility[ti]}
                          state={isCurrent ? wordState[ti] : done ? true : undefined}
                          isActive={isCurrent && ti === wordPos}
                          colors={colors}
                        />
                      ))}
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

          {/* Hidden capture input: we read the last char and reset to "". */}
          <TextInput
            ref={inputRef}
            value=""
            onChangeText={(t) => {
              const ch = t.slice(-1);
              if (ch) handleType(ch);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            caretHidden
            blurOnSubmit={false}
            style={styles.hiddenInput}
          />
        </>
      ) : (
        <DoneView
          outcome={finalOutcome}
          entry={entry}
          memorised={memorised}
          stage={stage}
          colors={colors}
          onRetryFailed={retryFailed}
          onRetryAll={retryAll}
          onSkip={goToNext}
          onExit={onExit}
        />
      )}
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
function WordSlot({ token, shown, state, isActive, colors }) {
  if (!isTypable(token)) {
    // Punctuation-only token: always render as-is, non-interactive.
    return (
      <View style={styles.wordWrap}>
        <Text style={[styles.verseLine, { color: colors.secondaryText }]}>
          {token.text}
          <Text> </Text>
        </Text>
      </View>
    );
  }

  const typed = state === true || state === false;
  const isBlank = !shown && !typed; // covered placeholder
  const showUnderline = isBlank || isActive;

  let color;
  if (state === true) color = isActive ? colors.accent : colors.text; // correct
  else if (state === false) color = colors.danger; // wrong
  else if (shown) color = colors.secondaryText; // hint shown, not yet typed
  else color = colors.text; // blank: real colour, but hidden by the overlay

  return (
    <View style={styles.wordWrap}>
      <Text style={[styles.verseLine, { color }]}>
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

// Shown only after a FAILED attempt (successes auto-advance without a screen).
// Lets the user retry (staying on the current set/stage per the spec), skip
// ahead to the next set, or leave.
function DoneView({
  outcome,
  entry,
  memorised,
  stage,
  colors,
  onRetryFailed,
  onRetryAll,
  onSkip,
  onExit,
}) {
  const { updatedEntry, resultsArray, stageAtRun } = outcome;
  const failedCount = resultsArray.filter((r) => r === false).length;
  const stats = updatedEntry || entry;
  const rate = successRate(stats);
  const wins = successCount(stats);
  const losses = failureCount(stats);

  return (
    <ScrollView contentContainerStyle={styles.doneWrap}>
      <Text style={[styles.doneTitle, { color: colors.danger }]}>Not quite</Text>

      <Text style={[styles.doneBody, { color: colors.text }]}>
        You missed {failedCount} verse{failedCount === 1 ? "" : "s"}.
        {memorised
          ? `\n${wins} passed · ${losses} failed · ${Math.round(rate * 100)}% success rate`
          : `\nYou're still on stage ${stageAtRun ?? stage} — retry to keep going.`}
      </Text>

      <View style={{ height: 24 }} />

      {failedCount > 0 && (
        <PrimaryButton
          label={`Retry failed verse${failedCount === 1 ? "" : "s"}`}
          colors={colors}
          onPress={onRetryFailed}
        />
      )}

      <TouchableOpacity
        style={[styles.btnOutline, { borderColor: colors.border }]}
        onPress={onRetryAll}
      >
        <Text style={[styles.btnText, { color: colors.text }]}>
          {memorised ? "Try again" : "Restart this stage"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.btnOutline, { borderColor: colors.border }]}
        onPress={onSkip}
      >
        <Text style={[styles.btnText, { color: colors.text }]}>Skip to next verse</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.btnOutline, { borderColor: colors.border }]}
        onPress={() => onExit()}
      >
        <Text style={[styles.btnText, { color: colors.text }]}>Back to Memory</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function PrimaryButton({ label, colors, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.btn, { backgroundColor: colors.accent, borderColor: colors.accentBorder }]}
      onPress={onPress}
    >
      <Text style={[styles.btnText, { color: colors.accentContrast }]}>{label}</Text>
    </TouchableOpacity>
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
  headerSpacer: { width: 84 },
  resetBtn: { width: 84, alignItems: "flex-end" },
  headerCenter: { flex: 1, alignItems: "center", paddingHorizontal: 4 },
  back: { fontSize: 16, fontFamily: uiFont() },
  title: { fontSize: 17, fontFamily: uiFont(700) },
  subtitle: { fontSize: 12, marginTop: 2, fontFamily: uiFont() },
  versesWrap: { padding: 20 },
  verseLine: { fontSize: 20, lineHeight: 32, fontFamily: FONT_FAMILIES.serifRegular },
  // Words are laid out as wrapping inline-block "chips" so a hidden word can be
  // covered by an absolutely-positioned overlay without disturbing the line.
  verseLineWrap: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end" },
  wordWrap: { position: "relative" },
  // Inline superscript verse number at the start of each verse (matches the
  // subtle muted number used in the chapter reader).
  verseNumWrap: { alignSelf: "flex-start" },
  verseNumInline: {
    fontSize: 12,
    lineHeight: 20,
    fontFamily: FONT_FAMILIES.serifSemiBold,
  },
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
  doneWrap: { padding: 24, alignItems: "center" },
  doneTitle: { fontSize: 26, fontFamily: uiFont(700), marginTop: 12, marginBottom: 12 },
  doneBody: { fontSize: 16, lineHeight: 24, textAlign: "center", fontFamily: uiFont() },
  btn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: "center",
    alignSelf: "stretch",
    marginBottom: 12,
  },
  btnOutline: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: "center",
    alignSelf: "stretch",
    marginBottom: 12,
  },
  btnText: { fontSize: 16, fontFamily: uiFont(700) },
});
