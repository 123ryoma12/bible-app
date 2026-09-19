// Greek vocabulary screen — pack selection home + drill + stats.
// Shown when the user taps "Greek" from the Languages tab.
//
// Internal nav: "home" | "drill" | "packStats"

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { uiFont } from "../theme/fonts";
import { CHAPTERS } from "../data/duff_vocab.js";
import {
  getAllScores,
  getVocabPrefs,
  isKnownWell,
  setVocabPrefs,
  togglePack,
  wordScorePct,
} from "../data/vocabStore";
import GreekVocabDrillScreen from "./GreekVocabDrillScreen";

const ALL_PACKS = CHAPTERS.map((ch) => ({ pack: ch.chapter, words: ch.words }));
const ALL_WORDS_BY_ID = Object.fromEntries(
  ALL_PACKS.flatMap((p) => p.words.map((w) => [w.id, { ...w, pack: p.pack }]))
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function packSubtitle(pack) {
  return `${pack.words.length} word${pack.words.length === 1 ? "" : "s"}`;
}

// ── Pack Row ──────────────────────────────────────────────────────────────────

function PackRow({ pack, selected, scores, colors, onToggle, onProgress }) {
  // Overall win rate across all attempts in this pack
  const { totalCorrect, totalAttempts } = pack.words.reduce(
    (acc, w) => {
      const s = scores[w.id];
      if (s) {
        acc.totalCorrect += s.correct;
        acc.totalAttempts += s.total;
      }
      return acc;
    },
    { totalCorrect: 0, totalAttempts: 0 }
  );
  const pct = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;
  const hasAttempts = totalAttempts > 0;

  return (
    <TouchableOpacity
      style={[
        styles.packRow,
        {
          borderBottomColor: colors.border,
          backgroundColor: selected ? colors.surface : "transparent",
        },
      ]}
      onPress={onToggle}
      activeOpacity={0.7}
    >
      {/* Checkbox */}
      <View
        style={[
          styles.checkbox,
          {
            borderColor: selected ? colors.accent : colors.border,
            backgroundColor: selected ? colors.accent : "transparent",
          },
        ]}
      >
        {selected ? (
          <Text style={styles.checkmark}>✓</Text>
        ) : null}
      </View>

      {/* Info */}
      <View style={styles.packInfo}>
        <Text style={[styles.packNum, { color: colors.text }]}>
          Greek Duff Chapter {pack.pack}
        </Text>
        <Text style={[styles.packFreq, { color: colors.mutedText }]}>
          {packSubtitle(pack)}
        </Text>
        {hasAttempts ? (
          <Text style={[styles.packWinRate, { color: colors.mutedText }]}>
            {pct}% correct rate · {totalAttempts.toLocaleString()} card{totalAttempts === 1 ? "" : "s"}
          </Text>
        ) : null}
      </View>

      {/* Progress chevron — only shown if user has attempted this pack */}
      {hasAttempts ? (
        <TouchableOpacity
          onPress={onProgress}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.progressBtn}
        >
          <Text style={[styles.progressChevron, { color: colors.accent }]}>›</Text>
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );
}

// ── Per-Pack Stats Screen ─────────────────────────────────────────────────────

function PackStatsView({ pack, scores, colors, onBack }) {
  const packScores = pack.words.map((w) => ({
    word: w,
    pct: wordScorePct(scores[w.id]),
    score: scores[w.id],
  }));

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.navHeader, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={[styles.navBack, { color: colors.accent }]}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.text }]}>Greek Duff Chapter {pack.pack}</Text>
        <View style={{ width: 48 }} />
      </View>
      <ScrollView contentContainerStyle={styles.statsContent}>
        {packScores.map(({ word, pct }) => (
          <View key={word.id} style={[styles.statsRow, { borderBottomColor: colors.border }]}>
            <View style={styles.statsWordCol}>
              <Text style={[styles.statsGreek, { color: colors.text }]}>{word.greek ?? word.lemma}</Text>
              <Text style={[styles.statsGloss, { color: colors.mutedText }]}>{word.english ?? word.gloss}</Text>
            </View>
            <View style={styles.statsBarCol}>
              {pct !== null ? (
                <>
                  <View style={[styles.statsBarBg, { backgroundColor: colors.border }]}>
                    <View
                      style={[
                        styles.statsBarFill,
                        {
                          backgroundColor: pct >= 90 ? colors.accent : colors.secondaryText,
                          width: `${pct}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.statsPct, { color: colors.mutedText }]}>{pct}%</Text>
                </>
              ) : (
                <Text style={[styles.statsPct, { color: colors.mutedText }]}>—</Text>
              )}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function GreekVocabScreen({ onDrillStart, onDrillEnd, onRefreshPrefs }) {
  const { colors } = useTheme();
  const [view, setView] = useState("home"); // "home" | "drill" | "packStats"
  const [statsPack, setStatsPack] = useState(null);
  const [prefs, setPrefsState] = useState({ selectedPacks: [1], hideKnown: false, hideKnownThreshold: 90 });
  const [scores, setScores] = useState({});
  const [drillWords, setDrillWords] = useState([]);

  // Load prefs and scores on mount AND whenever we return to home view
  // (filter changes happen in LanguagesScreen so we need to re-read on focus)
  const refreshPrefsAndScores = useCallback(() => {
    Promise.all([getVocabPrefs(), getAllScores()]).then(([p, s]) => {
      setPrefsState(p);
      setScores(s);
    });
  }, []);

  // Expose refresh to parent so LanguagesScreen can trigger it after filter changes
  useEffect(() => {
    if (onRefreshPrefs) onRefreshPrefs(refreshPrefsAndScores);
  }, [onRefreshPrefs, refreshPrefsAndScores]);

  useEffect(() => {
    refreshPrefsAndScores();
  }, [refreshPrefsAndScores]);

  // Re-read prefs when returning to home from drill/stats
  useEffect(() => {
    if (view === "home") refreshPrefsAndScores();
  }, [view, refreshPrefsAndScores]);

  const refreshScores = useCallback(() => {
    getAllScores().then(setScores);
  }, []);

  const handleTogglePack = useCallback(async (packNum) => {
    const updated = await togglePack(packNum);
    setPrefsState(updated);
  }, []);


  // Build drill word list from selected packs, applying hideKnown filter
  const buildDrillWords = useCallback(() => {
    const selected = prefs.selectedPacks || [];
    let words = ALL_PACKS
      .filter((p) => selected.includes(p.pack))
      .flatMap((p) => p.words);

    if (prefs.hideKnown) {
      words = words.filter((w) => !isKnownWell(scores[w.id], prefs.hideKnownThreshold ?? 90));
    }

    return words;
  }, [prefs, scores]);

  const handleStartDrill = useCallback(() => {
    const words = buildDrillWords();
    if (words.length === 0) {
      Alert.alert("No words to drill", "All selected words are known well, or no packs are selected.");
      return;
    }
    setDrillWords(words);
    setView("drill");
    onDrillStart?.();
  }, [buildDrillWords, onDrillStart]);

  const handleDrillDone = useCallback(() => {
    refreshScores();
    setView("home");
    onDrillEnd?.();
  }, [refreshScores, onDrillEnd]);

  const handleDrillExit = useCallback(() => {
    refreshScores();
    setView("home");
    onDrillEnd?.();
  }, [refreshScores, onDrillEnd]);

  // These must be declared before any early returns to satisfy the Rules of Hooks
  const totalDrillWords = useMemo(() => buildDrillWords().length, [buildDrillWords]);
  const totalSelectedWords = useMemo(() => {
    const selected = prefs.selectedPacks || [];
    return ALL_PACKS
      .filter((p) => selected.includes(p.pack))
      .flatMap((p) => p.words).length;
  }, [prefs.selectedPacks]);
  const hiddenWords = totalSelectedWords - totalDrillWords;

  // ── Drill view ───────────────────────────────────────────────────────────────
  if (view === "drill") {
    return (
      <GreekVocabDrillScreen
        words={drillWords}
        onDone={handleDrillDone}
        onExit={handleDrillExit}
      />
    );
  }

  // ── Pack stats view ──────────────────────────────────────────────────────────
  if (view === "packStats" && statsPack) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <PackStatsView
          pack={statsPack}
          scores={scores}
          colors={colors}
          onBack={() => { setView("home"); setStatsPack(null); }}
        />
      </View>
    );
  }

  // ── Home view ────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.homeContent}>
        {/* Section header */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionHeader, { color: colors.mutedText }]}>
            GREEK DUFF CHAPTERS
          </Text>
          <View style={styles.selectBtns}>
            <TouchableOpacity
              onPress={async () => {
                const next = await setVocabPrefs({ selectedPacks: ALL_PACKS.map((p) => p.pack) });
                setPrefsState(next);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.selectBtn, { color: colors.accent }]}>All</Text>
            </TouchableOpacity>
            <Text style={[styles.selectDivider, { color: colors.mutedText }]}>/</Text>
            <TouchableOpacity
              onPress={async () => {
                const next = await setVocabPrefs({ selectedPacks: [] });
                setPrefsState(next);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.selectBtn, { color: colors.accent }]}>None</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Pack list */}
        {ALL_PACKS.map((pack) => (
          <PackRow
            key={pack.pack}
            pack={pack}
            selected={(prefs.selectedPacks || []).includes(pack.pack)}
            scores={scores}
            colors={colors}
            onToggle={() => handleTogglePack(pack.pack)}
            onProgress={() => { setStatsPack(pack); setView("packStats"); }}
          />
        ))}

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Start button — floating at bottom, no border to avoid gap */}
      <View style={[styles.startBtnContainer, { backgroundColor: colors.background }]}>
        <TouchableOpacity
          style={[
            styles.startBtn,
            { backgroundColor: totalDrillWords > 0 ? colors.accent : colors.border },
          ]}
          onPress={handleStartDrill}
          disabled={totalDrillWords === 0}
          activeOpacity={0.8}
        >
          <Text style={[styles.startBtnText, { color: totalDrillWords > 0 ? "#fff" : colors.mutedText }]}>
            {totalDrillWords > 0
              ? hiddenWords > 0
                ? `Start Drill  ·  ${totalDrillWords} words  (${hiddenWords} hidden)`
                : `Start Drill  ·  ${totalDrillWords} words`
              : totalSelectedWords > 0
                ? `All ${totalSelectedWords} words hidden by filter`
                : "Select a pack to start"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Nav header
  navHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navBack: { fontSize: 17, fontFamily: uiFont(400) },
  navTitle: { fontSize: 16, fontFamily: uiFont(600) },

  // Home
  homeContent: { paddingBottom: 16 },


  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 6,
  },
  selectBtns: { flexDirection: "row", alignItems: "center", gap: 4 },
  selectBtn: { fontSize: 13, fontFamily: uiFont(600) },
  selectDivider: { fontSize: 13, fontFamily: uiFont(400) },
  sectionHeader: {
    fontSize: 11,
    fontFamily: uiFont(600),
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },

  // Pack row
  packRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  checkmark: {
    color: "#fff",
    fontSize: 13,
    fontFamily: uiFont(700),
    lineHeight: 16,
  },
  packInfo: { flex: 1 },
  packNum: { fontSize: 15, fontFamily: uiFont(600), marginBottom: 2 },
  progressBtn: { paddingLeft: 8 },
  progressChevron: { fontSize: 22, fontFamily: uiFont(400), lineHeight: 26 },
  packFreq: { fontSize: 12, fontFamily: uiFont(400), marginBottom: 6 },
  packWinRate: { fontSize: 12, fontFamily: uiFont(400), marginTop: 2 },

  // Start button
  startBtnContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
  },
  startBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  startBtnText: {
    fontSize: 15,
    fontFamily: uiFont(600),
  },

  // Stats
  statsContent: { paddingBottom: 40 },
  statsSectionHeader: {
    fontSize: 11,
    fontFamily: uiFont(600),
    letterSpacing: 0.8,
    textTransform: "uppercase",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statsWordCol: { width: 120 },
  statsGreek: { fontSize: 16, fontFamily: "Lora_400Regular" },
  statsGloss: { fontSize: 12, fontFamily: uiFont(400) },
  statsBarCol: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  statsBarBg: { flex: 1, height: 4, borderRadius: 2 },
  statsBarFill: { height: 4, borderRadius: 2 },
  statsPct: { fontSize: 12, fontFamily: uiFont(500), width: 36, textAlign: "right" },
});
