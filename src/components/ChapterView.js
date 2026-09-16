import React, { useMemo, memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { readingFont, uiFont } from "../theme/fonts";

// MaterialCommunityIcons glyph rendered as inline <Text> — the only way to
// place an icon inside a React Native <Text> tree (no View allowed).
// "information-outline": circled i outline, clean and unobtrusive.
// The MaterialCommunityIcons font is loaded explicitly in App.js via useFonts()
// so that fontFamily: "MaterialCommunityIcons" resolves correctly on all platforms.
const INFO_ICON_GLYPH = String.fromCodePoint(0xf02fd);

const BODY_SIZE = 18;
const BODY_LINE_HEIGHT = 30;
const VERSE_NUMBER_SIZE = 10;
const VERSE_CONTINUATION_INDENT = 20;

/**
 * A stable, reading-first chapter layout. Each source paragraph or poetry line
 * owns one native Text layout, preserving continuous Bible paragraph flow.
 */
export default function ChapterView({ chapter, noteVerses, onNotePress }) {
  const { colors, fontScale, readingFontKey } = useTheme();
  const typography = useMemo(
    () => createTypography(fontScale, readingFontKey),
    [fontScale, readingFontKey]
  );
  const blocks = useMemo(() => prepareBlocks(chapter?.blocks), [chapter]);

  // For each block, pre-compute which verse numbers should show the ⓘ icon.
  // A verse spans multiple blocks (each poetry line is its own block), so we
  // find the LAST block that contains each verse and assign the icon only there.
  // This is all done at the ChapterView level so ChapterBlock/FlowingVerses
  // receive a simple, stable Set of verse numbers — no mutable shared state
  // needed during render.
  const noteIconsPerBlock = useMemo(() => {
    if (!noteVerses || noteVerses.size === 0) return null;
    // Find the last block index for each verse number that has a note.
    const lastBlockForVerse = new Map();
    blocks.forEach((entry, blockIndex) => {
      entry.verses.forEach((verse) => {
        if (verse.number == null || verse.isEditorialNote) return;
        const verseNum = parseInt(verse.number, 10);
        if (noteVerses.has(verseNum)) {
          lastBlockForVerse.set(verseNum, blockIndex);
        }
      });
    });
    // Build a per-block Set of verse numbers whose icon belongs in that block.
    const perBlock = blocks.map((_, blockIndex) => {
      const verseSet = new Set();
      lastBlockForVerse.forEach((lastIdx, verseNum) => {
        if (lastIdx === blockIndex) verseSet.add(verseNum);
      });
      return verseSet;
    });
    return perBlock;
  }, [blocks, noteVerses]);

  if (!chapter) {
    return (
      <View style={styles.content}>
        <Text style={[styles.missing, typography.descriptive, { color: colors.secondaryText }]}>
          This chapter isn't available yet.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.content}>
      {blocks.map((entry, index) => (
        <ChapterBlock
          key={`${index}-${entry.block?.style || "p"}`}
          {...entry}
          colors={colors}
          fontScale={fontScale}
          typography={typography}
          blockNoteVerses={noteIconsPerBlock ? noteIconsPerBlock[index] : null}
          onNotePress={onNotePress}
        />
      ))}
    </View>
  );
}

const ChapterBlock = memo(function ChapterBlock({
  block,
  verses,
  continuesPreviousVerse,
  hasOnlyEditorialNotes,
  colors,
  fontScale,
  typography,
  blockNoteVerses,
  onNotePress,
}) {
  const sourceStyle = block?.style || "p";
  const kind = getBlockKind(sourceStyle);
  const label = typeof block?.text === "string" ? block.text.trim() : "";

  if (sourceStyle === "b" && verses.length === 0 && !label) {
    return <View style={styles.spacer} />;
  }

  // The reader header already presents the chapter title.
  if (sourceStyle === "cl") return null;

  // Cached by style+kind — referentially stable across renders.
  const appearance = getAppearance(sourceStyle, kind);
  const showLabel = label && (kind === "heading" || verses.length === 0);

  // Memoize the inset style object so React.memo's shallow compare stays stable.
  const insetStyle = useMemo(
    () => (continuesPreviousVerse ? { paddingLeft: VERSE_CONTINUATION_INDENT * fontScale } : null),
    [continuesPreviousVerse, fontScale]
  );

  // Resolve label color once rather than creating a new inline object each render.
  const labelColor = useMemo(
    () => appearance.labelColor(colors),
    [appearance, colors]
  );

  if (!showLabel && verses.length === 0) return null;

  return (
    <View
      style={[
        styles.block,
        appearance.container,
        insetStyle,
        hasOnlyEditorialNotes ? styles.editorialBlock : null,
      ]}
    >
      {showLabel ? (
        <Text
          style={[
            appearance.label,
            typography[appearance.labelType],
            // labelColor is a primitive (string) — safe to inline.
            { color: labelColor },
          ]}
        >
          {appearance.uppercase ? label.toUpperCase() : label}
        </Text>
      ) : null}

      {verses.length ? (
        <FlowingVerses
          verses={verses}
          beginsWithContinuation={continuesPreviousVerse}
          appearance={appearance}
          colors={colors}
          typography={typography}
          fontScale={fontScale}
          blockNoteVerses={blockNoteVerses}
          onNotePress={onNotePress}
        />
      ) : null}
    </View>
  );
});

const FlowingVerses = memo(function FlowingVerses({ verses, beginsWithContinuation, appearance, colors, typography, fontScale, blockNoteVerses, onNotePress }) {
  const segments = useMemo(() => verses.map((verse, index) => {
    const previousNumber = index > 0 ? verses[index - 1].number : null;
    const repeatedOpeningVerse = index === 0 && beginsWithContinuation;

    return {
      number: verse.number,
      text: verse.text,
      editorialNote: verse.isEditorialNote,
      showNumber:
        !verse.isEditorialNote &&
        verse.number !== null &&
        verse.number !== previousNumber &&
        !repeatedOpeningVerse,
    };
  }), [verses, beginsWithContinuation]);

  // Stable color style objects — new inline objects each render would bust memo
  // on the inner Text nodes even though colors almost never change.
  const textColorStyle = useMemo(() => ({ color: colors.text }), [colors.text]);
  const mutedColorStyle = useMemo(() => ({ color: colors.mutedText }), [colors.mutedText]);
  const accentColorStyle = useMemo(() => ({ color: colors.accent }), [colors.accent]);
  const noteIconSizeStyle = useMemo(() => ({ fontSize: 13 * fontScale }), [fontScale]);

  return (
    <Text
      style={[
        styles.flowingText,
        typography[appearance.textType],
        appearance.text,
        textColorStyle,
      ]}
    >
      {segments.map((segment, index) => {
        const verseNum = segment.number != null ? parseInt(segment.number, 10) : null;
        // blockNoteVerses is pre-computed per block at the ChapterView level:
        // it contains only the verse numbers whose icon belongs in THIS block
        // (the last block that contains that verse). So a simple .has() check
        // is sufficient — no cross-block deduplication needed here.
        const showNoteIcon = blockNoteVerses && verseNum != null && blockNoteVerses.has(verseNum);

        return (
          <Text
            key={`${segment.number ?? "text"}-${index}`}
            style={segment.editorialNote ? typography.editorialText : null}
          >
            {index > 0 ? " " : null}
            {segment.showNumber ? (
              <Text style={[styles.verseNumber, typography.verseNumber, mutedColorStyle]}>
                {segment.number}{"\u00A0\u00A0"}
              </Text>
            ) : null}
            {segment.text}
            {showNoteIcon ? (
              <Text
                style={[styles.noteIcon, noteIconSizeStyle, accentColorStyle]}
                onPress={(e) => onNotePress?.(verseNum, e.nativeEvent.pageY)}
              >
                {"\u00A0" + INFO_ICON_GLYPH}
              </Text>
            ) : null}
          </Text>
        );
      })}
    </Text>
  );
});

function prepareBlocks(source) {
  let previousVerseNumber = null;

  return (Array.isArray(source) ? source : []).map((block) => {
    const verses = getVerses(block?.verses);
    const scriptureVerses = verses.filter((verse) => !verse.isEditorialNote);
    const firstVerseNumber = scriptureVerses[0]?.number ?? null;
    const lastVerseNumber = scriptureVerses[scriptureVerses.length - 1]?.number ?? null;
    const continuesPreviousVerse =
      firstVerseNumber !== null && firstVerseNumber === previousVerseNumber;

    if (lastVerseNumber !== null) previousVerseNumber = lastVerseNumber;

    return {
      block,
      verses,
      continuesPreviousVerse,
      hasOnlyEditorialNotes: verses.length > 0 && scriptureVerses.length === 0,
    };
  });
}

function getVerses(source) {
  if (!Array.isArray(source)) return [];

  return source
    .filter((verse) => verse && typeof verse.text === "string" && verse.text.trim())
    .map((verse) => {
      const text = verse.text.trim();
      return {
        number: verse.verse == null ? null : String(verse.verse),
        text,
        isEditorialNote: /^\[.*\]$/.test(text),
      };
    });
}

function getBlockKind(style) {
  if (/^s\d*$/.test(style) || style === "ms" || /^ms\d+$/.test(style)) return "heading";
  if (style === "d" || style === "sp" || style === "qa") return "descriptive";
  if (/^q/.test(style) || /^qm/.test(style) || style === "qr" || style === "qc") return "poetry";
  if (/^li\d*$/.test(style)) return "list";
  // Opening/salutation and centered-paragraph markers are source semantics,
  // but the reader intentionally keeps all biblical content left-aligned.
  if (style === "po" || style === "pr" || style === "pc" || style === "pmo") return "paragraph";
  if (/^pi\d*$/.test(style) || style === "pm" || style === "pmc" || style === "mi" || style === "nb") {
    return "indented";
  }
  return "paragraph";
}

// Module-level cache for appearance objects, keyed by "style|kind".
// getAppearance() is called on every ChapterBlock render; caching ensures the
// returned object is referentially stable, which is critical for React.memo on
// FlowingVerses (the `appearance` prop won't spuriously change between renders).
const _appearanceCache = new Map();

function getAppearance(style, kind) {
  const cacheKey = `${style}|${kind}`;
  if (_appearanceCache.has(cacheKey)) return _appearanceCache.get(cacheKey);

  const level = Number.parseInt(String(style).replace(/\D/g, ""), 10) || 1;
  const base = {
    container: styles.paragraph,
    label: styles.plainLabel,
    labelType: "body",
    labelColor: (colors) => colors.text,
    textType: "body",
    text: null,
    uppercase: false,
  };

  let result;
  switch (kind) {
    case "heading":
      result = {
        ...base,
        container: styles.heading,
        label: styles.headingLabel,
        labelType: "heading",
        labelColor: (colors) => colors.secondaryText,
        uppercase: true,
      };
      break;
    case "descriptive":
      result = {
        ...base,
        container: styles.descriptive,
        label: styles.plainLabel,
        labelType: "descriptive",
        textType: "descriptive",
      };
      break;
    case "poetry":
      result = { ...base, container: [styles.poetry, { paddingLeft: 12 * (level - 1) }] };
      break;
    case "list":
      result = { ...base, container: [styles.list, { paddingLeft: 12 * (level - 1) }] };
      break;
    case "centered":
      result = { ...base, container: styles.paragraph, textType: "descriptive" };
      break;
    case "indented":
      result = { ...base, container: styles.indented };
      break;
    default:
      result = base;
  }

  _appearanceCache.set(cacheKey, result);
  return result;
}

// Module-level cache for typography StyleSheet objects, keyed by "fontScale|fontKey".
// StyleSheet.create() registers styles with the native layer and should only be called
// once per unique style set — not on every render or component mount. Previously this
// was called inside useMemo which was blown on every chapter change due to ReaderScreen
// remounting. Now it runs at most once per unique (fontScale, fontKey) combination for
// the entire app session.
const _typographyCache = {};

function createTypography(fontScale, fontKey) {
  const cacheKey = `${fontScale}|${fontKey}`;
  if (_typographyCache[cacheKey]) return _typographyCache[cacheKey];
  _typographyCache[cacheKey] = StyleSheet.create({
    body: {
      fontFamily: readingFont(fontKey, "regular"),
      fontSize: BODY_SIZE * fontScale,
      lineHeight: BODY_LINE_HEIGHT * fontScale,
      includeFontPadding: true,
    },
    descriptive: {
      fontFamily: readingFont(fontKey, "italic"),
      fontSize: 15 * fontScale,
      lineHeight: 24 * fontScale,
      includeFontPadding: true,
    },
    heading: {
      fontFamily: uiFont(600),
      fontSize: 11 * fontScale,
      letterSpacing: 1.2,
    },
    verseNumber: {
      fontFamily: uiFont(600),
      fontSize: VERSE_NUMBER_SIZE * fontScale,
    },
    editorialText: { fontFamily: readingFont(fontKey, "italic") },
  });
  return _typographyCache[cacheKey];
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 32,
  },
  missing: { marginTop: 20 },
  block: {
    width: "100%",
  },
  paragraph: {
    marginBottom: 18,
  },
  poetry: {
    marginBottom: 7,
  },
  list: {
    marginBottom: 10,
  },
  centered: {
    marginBottom: 16,
  },
  indented: {
    marginBottom: 14,
    paddingLeft: 14,
  },
  heading: {
    marginTop: 26,
    marginBottom: 10,
  },
  descriptive: {
    marginBottom: 14,
  },
  editorialBlock: {
    marginTop: 4,
    marginBottom: 14,
  },
  spacer: {
    height: 12,
  },
  flowingText: {
    // Explicit leading creates a relaxed reading rhythm without layout tricks.
  },
  verseNumber: {
    letterSpacing: 0.1,
  },
  noteIcon: {
    fontFamily: "MaterialCommunityIcons",
  },
  centeredText: {
    textAlign: "center",
  },
  plainLabel: {
    marginBottom: 8,
  },
  headingLabel: {
    marginBottom: 8,
  },
  descriptiveLabel: {
    textAlign: "center",
    marginBottom: 8,
  },
});
