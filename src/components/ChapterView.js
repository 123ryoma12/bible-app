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
//
// IMPORTANT: for the flowing reading text (paragraphs / poetry) we deliberately
// do NOT pass a lineHeight. React Native maps an explicit lineHeight to BOTH
// minimumLineHeight and maximumLineHeight on the underlying paragraph style
// (see RCTTextAttributes.mm), which *clamps* the line box - it will not grow to
// fit tall glyphs. It also gets multiplied again by the OS accessibility font
// multiplier. At the "large" app scale (1.15), that combined clamp landed just
// below the descent of the final wrapped line, clipping its tail (e.g. hiding
// "is just" in Romans 3:8). The clip only showed after visiting Settings and
// returning, because that remount forced a fresh clamped re-measure. Omitting
// lineHeight lets the platform use the natural line box, which always fully
// contains descenders; paragraph spacing is handled by marginBottom instead.
// A lineHeight is still honoured for fixed-size chrome (headings, titles).
function scaled(base, fontScale, lineHeight) {
  const out = { fontSize: base * fontScale };
  if (lineHeight != null) out.lineHeight = Math.ceil(lineHeight * fontScale);
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
        textBreakStrategy="simple"
        style={[
          styles.poetry,
          { color: colors.text, paddingLeft: 12 * level },
          scaled(17, fontScale),
        ]}
      >
        <Verses verses={block.verses} seen={seen} colors={colors} fontScale={fontScale} />
      </Text>
    );
  }

  // Default: normal paragraph of verses.
  if (block.verses && block.verses.length > 0) {
    return (
      <Text
        textBreakStrategy="simple"
        style={[styles.paragraph, { color: colors.text }, scaled(17, fontScale)]}
      >
        <Verses verses={block.verses} seen={seen} colors={colors} fontScale={fontScale} />
      </Text>
    );
  }

  // Fallback for any other block with plain text (e.g. references).
  if (block.text) {
    return (
      <Text
        textBreakStrategy="simple"
        style={[styles.paragraph, { color: colors.text }, scaled(17, fontScale)]}
      >
        {block.text}
      </Text>
    );
  }

  return null;
}

function Verses({ verses, seen, colors, fontScale }) {
  // We emit each verse's pieces as sibling inline nodes inside the parent
  // paragraph/poetry <Text> (via fragments) rather than wrapping each verse in
  // its own nested <Text>, so the whole paragraph flows as one text run with a
  // single, consistent line box on every wrapped line.
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
    // No lineHeight: an explicit value clamps the line box (min == max) and
    // clips descenders of the final wrapped line at some scales (see scaled()).
    // We rely on the platform's natural line height and use margin for spacing.
    marginBottom: 22,
    fontFamily: FONT_FAMILIES.serifRegular,
    // Keep Android's built-in font padding ENABLED (the default) - that padding
    // is the reserved space descenders live in, so disabling it is what actually
    // clips tails like "is just" in Romans 3:8. Critically, the inline verseNum
    // child below must use the SAME setting; a parent/child mismatch made Android
    // re-measure the block height inconsistently on remount (returning from
    // Settings) and report it a sub-pixel short, clipping the final line.
    includeFontPadding: true,
    // Extra hard safety margin so a descender can never be clipped even if the
    // measured text height ever comes back a hair short. Visually negligible.
    paddingBottom: 2,
  },
  poetry: {
    fontSize: 17,
    marginBottom: 10,
    fontFamily: FONT_FAMILIES.serifRegular,
    includeFontPadding: true,
    paddingBottom: 2,
  },
  verseNum: {
    // Rendered as Unicode superscript glyphs (see toSuperscript), which are
    // already small and raised, so we size this near the body text and need no
    // verticalAlign/lineHeight tricks. Semibold keeps the small glyph legible.
    // Must match the parent paragraph's includeFontPadding (see above) so the
    // block's measured height stays stable across re-layouts.
    fontSize: 15,
    fontFamily: FONT_FAMILIES.serifSemiBold,
    includeFontPadding: true,
  },
  blank: {
    height: 16,
  },
});
