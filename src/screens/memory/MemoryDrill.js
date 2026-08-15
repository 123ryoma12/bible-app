import React, { useMemo, useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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
} from "../../data/memoryStore";

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
  // In-session learning stage for not-yet-memorised sets. Resets to 1 whenever
  // we move to a new set (see the position effect below).
  const [stage, setStage] = useState(1);
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
        setStage(action.nextStage);
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

  // Moving to a new set in the list: reset all per-set state. Stage restarts at
  // 1, memorised mode follows the new set's saved status, and a fresh run of all
  // verses begins. Skipped on the very first mount (handled by initial state).
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    setStage(1);
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
        <TouchableOpacity onPress={() => onExit()} hitSlop={hit}>
          <Text style={[styles.back, { color: colors.accent }]}>{"‹ Memory"}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
            {referenceLabel(entry)}
          </Text>
          <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
            {stageLabel}
          </Text>
        </View>
        <View style={{ width: 80 }} />
      </View>

      {phase === "typing" ? (
        <>
          <ScrollView contentContainerStyle={styles.versesWrap}>
            {drill.order.map((vIdx, i) => {
              const verse = drill.verses[vIdx];
              const isCurrent = i === orderPos;
              const done = i < orderPos;
              return (
                <View key={vIdx} style={styles.verseBlock}>
                  <Text style={[styles.verseNum, { color: colors.accent }]}>
                    {verse.reference.chapter}:{verse.reference.verse}
                  </Text>
                  <Text style={styles.verseLine}>
                    {verse.tokens.map((tok, ti) => (
                      <WordSlot
                        key={ti}
                        token={tok}
                        shown={verse.visibility[ti]}
                        state={isCurrent ? wordState[ti] : done ? true : undefined}
                        isActive={isCurrent && ti === wordPos}
                        colors={colors}
                      />
                    ))}
                  </Text>
                </View>
              );
            })}
          </ScrollView>

          <Text style={[styles.hint, { color: colors.mutedText }]}>
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

// A single word rendered inline. Visibility (hint) and correctness colour it.
function WordSlot({ token, shown, state, isActive, colors }) {
  if (!isTypable(token)) {
    // Punctuation-only token: always render as-is, non-interactive.
    return <Text style={{ color: colors.secondaryText }}>{token.text} </Text>;
  }

  let color = colors.disabledText; // hidden + untyped -> faint
  if (state === true) color = colors.text; // correct -> normal
  else if (state === false) color = "#d64545"; // wrong -> red
  else if (shown) color = colors.secondaryText; // hint shown, not yet typed

  const display = shown || state === true ? token.text : maskWord(token.text);

  return (
    <Text
      style={[
        { color },
        isActive && { textDecorationLine: "underline", color: colors.accent },
      ]}
    >
      {display}{" "}
    </Text>
  );
}

// Replaces letters with underscores but keeps punctuation, so word shape shows.
function maskWord(word) {
  return word.replace(/[A-Za-z]/g, "_");
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
      <Text style={[styles.doneTitle, { color: "#d64545" }]}>Not quite</Text>

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
  back: { fontSize: 16, width: 80 },
  title: { fontSize: 17, fontWeight: "700" },
  subtitle: { fontSize: 12, marginTop: 2 },
  versesWrap: { padding: 20 },
  verseBlock: { marginBottom: 18 },
  verseNum: { fontSize: 13, fontWeight: "700", marginBottom: 4 },
  verseLine: { fontSize: 20, lineHeight: 32 },
  hint: { textAlign: "center", fontSize: 13, paddingBottom: 8 },
  hiddenInput: {
    position: "absolute",
    height: 1,
    width: 1,
    opacity: 0,
    bottom: 0,
  },
  doneWrap: { padding: 24, alignItems: "center" },
  doneTitle: { fontSize: 26, fontWeight: "800", marginTop: 12, marginBottom: 12 },
  doneBody: { fontSize: 16, lineHeight: 24, textAlign: "center" },
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
  btnText: { fontSize: 16, fontWeight: "700" },
});
