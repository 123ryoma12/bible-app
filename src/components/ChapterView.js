import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { FONT_FAMILIES } from "../theme/fonts";

// Renders the USFM-style "blocks" for a single chapter (paragraphs, headings,
// poetry lines, etc.) with inline superscript verse numbers.
export default function ChapterView({ chapter }) {
  const { colors, fontScale } = useTheme();

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
        <Block key={i} block={block} seen={seen} colors={colors} fontScale={fontScale} />
      ))}
    </View>
  );
}

// Applies the user's reading font scale to a base font size / line height pair.
function scaled(base, fontScale, lineHeight) {
  const out = { fontSize: base * fontScale };
  if (lineHeight != null) out.lineHeight = lineHeight * fontScale;
  return out;
}

function Block({ block, seen, colors, fontScale }) {
  const style = block.style || "p";

  // Blank line / paragraph break.
  if (style === "b") {
    return <View style={styles.blank} />;
  }

  // Section headings (s1, s2, ...).
  if (style.startsWith("s")) {
    if (!block.text) return null;
    return (
      <Text style={[styles.heading, { color: colors.headingText }, scaled(19, fontScale)]}>
        {block.text}
      </Text>
    );
  }

  // Chapter label (e.g. "Psalm 23") - subtle, we already show chapter # in header.
  if (style === "cl") {
    if (!block.text) return null;
    return (
      <Text style={[styles.chapterLabel, { color: colors.accent }, scaled(13, fontScale)]}>
        {block.text}
      </Text>
    );
  }

  // Descriptive title (e.g. "A psalm of David.").
  if (style === "d") {
    if (!block.text) return null;
    return (
      <Text style={[styles.descriptive, { color: colors.secondaryText }, scaled(14, fontScale)]}>
        {block.text}
      </Text>
    );
  }

  // Poetry lines (q1, q2, q3...) get progressive indentation.
  if (style.startsWith("q")) {
    const level = parseInt(style.replace("q", ""), 10) || 1;
    return (
      <Text
        style={[
          styles.poetry,
          { color: colors.text, paddingLeft: 12 * level },
          scaled(17, fontScale, 29),
        ]}
      >
        <Verses verses={block.verses} seen={seen} colors={colors} fontScale={fontScale} />
      </Text>
    );
  }

  // Default: normal paragraph of verses.
  if (block.verses && block.verses.length > 0) {
    return (
      <Text style={[styles.paragraph, { color: colors.text }, scaled(17, fontScale, 29)]}>
        <Verses verses={block.verses} seen={seen} colors={colors} fontScale={fontScale} />
      </Text>
    );
  }

  // Fallback for any other block with plain text (e.g. references).
  if (block.text) {
    return (
      <Text style={[styles.paragraph, { color: colors.text }, scaled(17, fontScale, 29)]}>
        {block.text}
      </Text>
    );
  }

  return null;
}

function Verses({ verses, seen, colors, fontScale }) {
  return verses.map((v, i) => {
    const isNewVerse = v.verse !== seen.last;
    if (isNewVerse) seen.last = v.verse;
    return (
      <Text key={i}>
        {isNewVerse && (
          <Text style={[styles.verseNum, { color: colors.mutedText }, scaled(11, fontScale)]}>
            {v.verse}{" "}
          </Text>
        )}
        {v.text}
      </Text>
    );
  });
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 28,
  },
  missing: {
    fontSize: 16,
    fontFamily: FONT_FAMILIES.serifItalic,
    marginTop: 20,
  },
  heading: {
    fontSize: 19,
    fontFamily: FONT_FAMILIES.serifBold,
    marginTop: 28,
    marginBottom: 14,
  },
  chapterLabel: {
    fontSize: 13,
    fontFamily: FONT_FAMILIES.serifSemiBold,
    marginTop: 8,
  },
  descriptive: {
    fontSize: 14,
    fontFamily: FONT_FAMILIES.serifItalic,
    marginBottom: 10,
  },
  paragraph: {
    fontSize: 17,
    lineHeight: 29,
    marginBottom: 20,
    fontFamily: FONT_FAMILIES.serifRegular,
  },
  poetry: {
    fontSize: 17,
    lineHeight: 29,
    marginBottom: 8,
    fontFamily: FONT_FAMILIES.serifRegular,
  },
  verseNum: {
    fontSize: 11,
    fontFamily: FONT_FAMILIES.serifSemiBold,
  },
  blank: {
    height: 16,
  },
});
