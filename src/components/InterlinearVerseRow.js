// InterlinearVerseRow — horizontal scrollable Greek word row rendered inline
// below a verse when expanded. Chevron logic lives in FlowingVerses; this
// component is purely the word display strip.
//
// Props:
//   words       – word[] from interlinearData
//   onWordPress – (word, pageY) => void
//   colors      – from useTheme()
//   fontScale   – from useTheme()

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { uiFont } from "../theme/fonts";

const WORD_GAP = 10;
const ROW_PADDING_H = 16;

// Individual tappable word cell — no card background, just stacked text
const WordCell = React.memo(function WordCell({ word, colors, fontScale, onPress }) {
  const greekSize = Math.round(15 * fontScale);
  const subSize   = Math.round(11 * fontScale);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      style={styles.wordCell}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
    >
      <Text style={[styles.greekText, { color: colors.text, fontSize: greekSize, fontFamily: "Lora_400Regular" }]}>
        {word.greek}
      </Text>
      <Text style={[styles.translitText, { color: colors.mutedText, fontSize: subSize }]}>
        {word.translit}
      </Text>
      <Text style={[styles.glossText, { color: colors.accent, fontSize: subSize }]}>
        {word.gloss}
      </Text>
    </TouchableOpacity>
  );
});

export default function InterlinearVerseRow({ words, onWordPress, colors, fontScale }) {
  if (!words || words.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={[styles.separator, { borderColor: colors.border }]} />
      <View style={styles.wordRow}>
        {words.map((word, i) => (
          <WordCell
            key={i}
            word={word}
            colors={colors}
            fontScale={fontScale}
            onPress={(e) => onWordPress?.(word, e.nativeEvent.pageY)}
          />
        ))}
      </View>
      <View style={[styles.separator, { borderColor: colors.border }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  separator: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginVertical: 8,
  },
  wordRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: ROW_PADDING_H,
    gap: WORD_GAP,
    rowGap: 12,
    alignItems: "flex-start",
    justifyContent: "flex-start",
  },
  wordCell: {
    alignItems: "flex-start",
    minWidth: 44,
  },
  greekText: {
    textAlign: "left",
    marginBottom: 2,
  },
  translitText: {
    fontFamily: uiFont(400),
    textAlign: "left",
    marginBottom: 1,
  },
  glossText: {
    fontFamily: uiFont(600),
    textAlign: "left",
  },
});
