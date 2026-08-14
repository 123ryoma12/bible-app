import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../theme/ThemeContext";

// Renders the USFM-style "blocks" for a single chapter (paragraphs, headings,
// poetry lines, etc.) with inline superscript verse numbers.
export default function ChapterView({ chapter }) {
  const { colors } = useTheme();

  if (!chapter) {
    return (
      <View style={styles.wrap}>
        <Text style={[styles.missing, { color: colors.secondaryText }]}>
          This chapter isn't available yet.
        </Text>
      </View>
    );
  }

  // Tracks the last verse number actually printed, shared across every block
  // in the chapter (in reading order). Some source data splits a single verse
  // across multiple consecutive blocks (e.g. a salutation broken into two
  // lines) and repeats the verse number on each piece - we only want to show
  // the number once, the first time we encounter it.
  const seen = { last: null };

  return (
    <View style={styles.wrap}>
      {chapter.blocks.map((block, i) => (
        <Block key={i} block={block} seen={seen} colors={colors} />
      ))}
    </View>
  );
}

function Block({ block, seen, colors }) {
  const style = block.style || "p";

  // Blank line / paragraph break.
  if (style === "b") {
    return <View style={styles.blank} />;
  }

  // Section headings (s1, s2, ...).
  if (style.startsWith("s")) {
    if (!block.text) return null;
    return <Text style={[styles.heading, { color: colors.headingText }]}>{block.text}</Text>;
  }

  // Chapter label (e.g. "Psalm 23") - subtle, we already show chapter # in header.
  if (style === "cl") {
    if (!block.text) return null;
    return <Text style={[styles.chapterLabel, { color: colors.accent }]}>{block.text}</Text>;
  }

  // Descriptive title (e.g. "A psalm of David.").
  if (style === "d") {
    if (!block.text) return null;
    return (
      <Text style={[styles.descriptive, { color: colors.secondaryText }]}>{block.text}</Text>
    );
  }

  // Poetry lines (q1, q2, q3...) get progressive indentation.
  if (style.startsWith("q")) {
    const level = parseInt(style.replace("q", ""), 10) || 1;
    return (
      <Text style={[styles.poetry, { color: colors.text, paddingLeft: 12 * level }]}>
        <Verses verses={block.verses} seen={seen} colors={colors} />
      </Text>
    );
  }

  // Default: normal paragraph of verses.
  if (block.verses && block.verses.length > 0) {
    return (
      <Text style={[styles.paragraph, { color: colors.text }]}>
        <Verses verses={block.verses} seen={seen} colors={colors} />
      </Text>
    );
  }

  // Fallback for any other block with plain text (e.g. references).
  if (block.text) {
    return <Text style={[styles.paragraph, { color: colors.text }]}>{block.text}</Text>;
  }

  return null;
}

function Verses({ verses, seen, colors }) {
  return verses.map((v, i) => {
    const isNewVerse = v.verse !== seen.last;
    if (isNewVerse) seen.last = v.verse;
    return (
      <Text key={i}>
        {isNewVerse && (
          <Text style={[styles.verseNum, { color: colors.accent }]}>{v.verse} </Text>
        )}
        {v.text}
      </Text>
    );
  });
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    paddingBottom: 60,
  },
  missing: {
    fontSize: 16,
    fontStyle: "italic",
    marginTop: 20,
  },
  heading: {
    fontSize: 19,
    fontWeight: "700",
    marginTop: 18,
    marginBottom: 6,
  },
  chapterLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 8,
  },
  descriptive: {
    fontSize: 14,
    fontStyle: "italic",
    marginBottom: 6,
  },
  paragraph: {
    fontSize: 17,
    lineHeight: 27,
    marginBottom: 10,
  },
  poetry: {
    fontSize: 17,
    lineHeight: 27,
  },
  verseNum: {
    fontSize: 11,
    fontWeight: "700",
  },
  blank: {
    height: 10,
  },
});
