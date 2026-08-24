import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { FONT_FAMILIES } from "../theme/fonts";

// Renders the USFM-style "blocks" for a single chapter (paragraphs, headings,
// poetry lines, etc.) with inline superscript verse numbers. `version` is the
// translation being shown.
export default function ChapterView({ chapter, version }) {
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

// Converts a verse number to Unicode superscript digits (e.g. 12 -> "¹²").
// React Native has no reliable `vertical-align: super` for nested inline
// <Text>, so we use dedicated superscript glyphs: they are genuinely raised
// and small by design, render consistently on iOS and Android, and sit neatly
// against the baseline of the surrounding body text without any lineHeight or
// verticalAlign hacks.
const SUPERSCRIPT_DIGITS = {
  0: "\u2070",
  1: "\u00B9",
  2: "\u00B2",
  3: "\u00B3",
  4: "\u2074",
  5: "\u2075",
  6: "\u2076",
  7: "\u2077",
  8: "\u2078",
  9: "\u2079",
};
function toSuperscript(num) {
  return String(num)
    .split("")
    .map((d) => SUPERSCRIPT_DIGITS[d] ?? d)
    .join("");
}

function Block({ block, seen, colors, fontScale }) {
  const style = block.style || "p";

  // Blank line / paragraph break.
  if (style === "b") {
    return <View style={styles.blank} />;
  }

  // Section headings (s1, s2, ...). These are editorial titles added by the
  // translation, not scripture, so we render them as a quiet, uppercase,
  // letter-spaced sans-serif label. Using the UI (sans) font + uppercasing keeps
  // them visually distinct from the italic-serif biblical superscriptions (the
  // "d" titles in the Psalms, which ARE scripture) while staying understated.
  if (style.startsWith("s")) {
    if (!block.text) return null;
    return (
      <Text style={[styles.heading, { color: colors.secondaryText }, scaled(12, fontScale)]}>
        {block.text.toUpperCase()}
      </Text>
    );
  }

  // Chapter label (e.g. "Psalm 23", present in NIV Psalms). The reader header
  // already shows the book name and chapter number, so this in-content label is
  // redundant and looks odd wedged above the superscription - skip rendering it.
  if (style === "cl") {
    return null;
  }

  // Descriptive title (e.g. "A psalm of David."). This is a biblical
  // superscription (part of scripture), so it uses the normal reading text
  // color - italic serif distinguishes it, no need to mute it.
  if (style === "d") {
    if (!block.text) return null;
    return (
      <Text style={[styles.descriptive, { color: colors.text }, scaled(14, fontScale)]}>
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
  // We deliberately emit each verse's pieces as sibling inline nodes inside the
  // parent paragraph/poetry <Text> (via fragments) rather than wrapping each
  // verse in its own nested <Text>. A nested <Text> without an explicit
  // lineHeight lets its (smaller) verse-number child drive the line-box metrics,
  // which on large font scales caused the final wrapped line of a long verse to
  // be vertically clipped (e.g. the tail "is just" in Romans 3:8). Keeping the
  // content flat means the single paragraph lineHeight governs every wrapped
  // line consistently.
  return verses.map((v, i) => {
    const isNewVerse = v.verse !== seen.last;
    if (isNewVerse) seen.last = v.verse;
    // A leading space separates the verse number from the previous verse's text
    // (e.g. so "...end.5" becomes "...end. 5"). Skip it for the first verse of
    // the block so the paragraph/poetry line doesn't start with an indent.
    const leadingSpace = isNewVerse && i > 0;
    return (
      <React.Fragment key={i}>
        {isNewVerse && (
          <Text style={[styles.verseNum, { color: colors.mutedText }, scaled(15, fontScale)]}>
            {leadingSpace ? " " : ""}
            {toSuperscript(v.verse)}
            {"\u2009"}
          </Text>
        )}
        {v.text}
      </React.Fragment>
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
    fontSize: 12,
    // Uppercase sans-serif label with wide tracking: quiet and clearly editorial
    // (not scripture), and distinct from the italic-serif biblical "d" titles.
    fontFamily: FONT_FAMILIES.sansSemiBold,
    letterSpacing: 1,
    marginTop: 24,
    marginBottom: 8,
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
    // Rendered as Unicode superscript glyphs (see toSuperscript), which are
    // already small and raised, so we size this near the body text and need no
    // verticalAlign/lineHeight tricks. Semibold keeps the small glyph legible.
    fontSize: 15,
    fontFamily: FONT_FAMILIES.serifSemiBold,
  },
  blank: {
    height: 16,
  },
});
