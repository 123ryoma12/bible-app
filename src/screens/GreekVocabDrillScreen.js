// Greek vocabulary flashcard drill screen.
//
// Props:
//   words     – word[] to drill (pre-filtered by pack selection + hideKnown)
//   onDone    – () => void — called when all words are correctly answered
//   onExit    – () => void — called when user taps ✕

import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { uiFont } from "../theme/fonts";
import { recordResult, incrementTodayCardCount } from "../data/vocabStore";

const ANIM_MS = 180;

export default function GreekVocabDrillScreen({ words, onDone, onExit }) {
  const { colors } = useTheme();

  // Build initial queue of word ids (shuffled)
  const initialQueue = useMemo(() => {
    const ids = words.map((w) => w.id);
    // Fisher-Yates shuffle
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids;
  }, [words]);

  const wordById = useMemo(
    () => Object.fromEntries(words.map((w) => [w.id, w])),
    [words]
  );

  const [queue, setQueue] = useState(initialQueue);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [correct, setCorrect] = useState(0); // total correct this session

  // Fade animation for reveal
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const totalCards = initialQueue.length;
  const currentId = queue[index];
  const currentWord = currentId ? wordById[currentId] : null;
  const remaining = queue.length - index;

  const reveal = useCallback(() => {
    setRevealed(true);
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: ANIM_MS,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const handleResult = useCallback(async (gotIt) => {
    if (!currentId) return;
    await Promise.all([
      recordResult(currentId, gotIt),
      ...(gotIt ? [incrementTodayCardCount()] : []),
    ]);

    if (!gotIt) {
      // Re-insert randomly in the remaining queue
      setQueue((prev) => {
        const next = [...prev];
        const remaining = next.length - (index + 1);
        const insertAt = index + 1 + Math.floor(Math.random() * (remaining + 1));
        next.splice(insertAt, 0, currentId);
        return next;
      });
    } else {
      setCorrect((c) => c + 1);
    }

    setRevealed(false);
    fadeAnim.setValue(0);

    // Move to next — check if done
    const nextIndex = index + 1;
    if (nextIndex >= queue.length && gotIt) {
      onDone?.();
      return;
    }
    setIndex(nextIndex);
  }, [currentId, index, queue.length, fadeAnim, onDone]);

  // Session complete
  if (!currentWord) {
    onDone?.();
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onExit}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={[styles.exitBtn, { color: colors.mutedText }]}>✕</Text>
        </TouchableOpacity>
        <Text style={[styles.progress, { color: colors.mutedText }]}>
          {correct} / {totalCards}
        </Text>
      </View>

      {/* Progress bar */}
      <View style={[styles.progressBarBg, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.progressBarFill,
            {
              backgroundColor: colors.accent,
              width: `${Math.round((correct / totalCards) * 100)}%`,
            },
          ]}
        />
      </View>

      {/* Card */}
      <View style={styles.cardArea}>
        {/* Greek word */}
        <Text style={[styles.greekWord, { color: colors.text }]}>
          {currentWord.lemma || currentWord.greek}
        </Text>
        <Text style={[styles.translit, { color: colors.mutedText }]}>
          {currentWord.translit}
        </Text>

        <View style={[styles.divider, { borderColor: colors.border }]} />

        {/* Answer area — fixed height so the Greek word never shifts position */}
        <View style={styles.answerArea}>
          {revealed ? (
            <Animated.View style={[styles.answerContent, { opacity: fadeAnim }]}>
              <Text style={[styles.gloss, { color: colors.accent }]}>
                {currentWord.gloss ?? currentWord.english}
              </Text>
              {currentWord.lemmaGloss && currentWord.lemmaGloss !== currentWord.gloss ? (
                <Text style={[styles.lemmaGloss, { color: colors.mutedText }]}>
                  {currentWord.lemma}{"  ·  "}{currentWord.lemmaGloss}
                </Text>
              ) : null}
              {currentWord.count ? (
                <Text style={[styles.occurrences, { color: colors.mutedText }]}>
                  appears {currentWord.count.toLocaleString()}× in the NT
                </Text>
              ) : null}
            </Animated.View>
          ) : (
            <TouchableOpacity
              style={[styles.revealBtn, { borderColor: colors.border }]}
              onPress={reveal}
              activeOpacity={0.7}
            >
              <Text style={[styles.revealBtnText, { color: colors.mutedText }]}>
                Tap to reveal
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Action buttons — always rendered to prevent layout shift, hidden until revealed */}
      <View style={[styles.actions, { opacity: revealed ? 1 : 0 }]} pointerEvents={revealed ? "auto" : "none"}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnWrong, { borderColor: colors.border }]}
          onPress={() => handleResult(false)}
          activeOpacity={0.7}
        >
          <Text style={[styles.actionBtnLabel, { color: colors.text }]}>
            ✗{"  "}Didn't know it
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnRight, { backgroundColor: colors.accent }]}
          onPress={() => handleResult(true)}
          activeOpacity={0.7}
        >
          <Text style={[styles.actionBtnLabel, { color: "#fff" }]}>
            ✓{"  "}Got it
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  exitBtn: {
    fontSize: 20,
    fontFamily: uiFont(400),
  },
  progress: {
    fontSize: 14,
    fontFamily: uiFont(500),
  },
  progressBarBg: {
    height: 3,
    marginHorizontal: 20,
    borderRadius: 2,
    marginBottom: 8,
  },
  progressBarFill: {
    height: 3,
    borderRadius: 2,
  },
  cardArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  greekWord: {
    fontSize: 48,
    fontFamily: "Lora_400Regular",
    textAlign: "center",
    marginBottom: 8,
  },
  translit: {
    fontSize: 16,
    fontFamily: uiFont(400),
    textAlign: "center",
    marginBottom: 32,
  },
  divider: {
    width: "60%",
    borderTopWidth: StyleSheet.hairlineWidth,
    marginBottom: 32,
  },
  gloss: {
    fontSize: 28,
    fontFamily: uiFont(600),
    textAlign: "center",
    marginBottom: 8,
  },
  lemmaGloss: {
    fontSize: 14,
    fontFamily: uiFont(400),
    textAlign: "center",
    marginBottom: 8,
  },
  occurrences: {
    fontSize: 12,
    fontFamily: uiFont(400),
    textAlign: "center",
    marginTop: 4,
  },
  answerArea: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  revealBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  revealBtnText: {
    fontSize: 15,
    fontFamily: uiFont(500),
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 16,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnWrong: {
    borderWidth: 1,
  },
  actionBtnRight: {},
  actionBtnLabel: {
    fontSize: 15,
    fontFamily: uiFont(600),
  },
});
