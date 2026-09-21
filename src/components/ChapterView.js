import React, { useMemo, memo, useState, useCallback, useRef } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { readingFont, uiFont } from "../theme/fonts";
import InterlinearVerseRow from "./InterlinearVerseRow";

// MaterialCommunityIcons glyph rendered as inline <Text> — the only way to
// place an icon inside a React Native <Text> tree (no View allowed).
// "information-outline": circled i outline, clean and unobtrusive.
// The MaterialCommunityIcons font is loaded explicitly in App.js via useFonts()
// so that fontFamily: "MaterialCommunityIcons" resolves correctly on all platforms.
const INFO_ICON_GLYPH = String.fromCodePoint(0xf02fd);

export const BODY_SIZE = 18;
export const BODY_LINE_HEIGHT = 30;
const VERSE_NUMBER_SIZE = 10;
const VERSE_CONTINUATION_INDENT = 20;

/**
 * A stable, reading-first chapter layout. Each source paragraph or poetry line
 * owns one native Text layout, preserving continuous Bible paragraph flow.
 */
export default function ChapterView({ chapter, noteVerses, onNotePress, interlinearChapter, onWordPress, onToggleVerseInterlinear }) {
  const { colors, fontScale, readingFontKey } = useTheme();
  const typography = useMemo(
    () => createTypography(fontScale, readingFontKey),
    [fontScale, readingFontKey]
  );
  const blocks = useMemo(() => prepareBlocks(chapter?.blocks), [chapter]);

  // Track which verse rows are expanded for interlinear — keyed by verse number.
  const [expandedVerses, setExpandedVerses] = useState({});
  const handleToggleVerse = useCallback((verseNum) => {
    setExpandedVerses((prev) => {
      const next = !prev[verseNum];
      onToggleVerseInterlinear?.(verseNum, next);
      return { ...prev, [verseNum]: next };
    });
  }, [onToggleVerseInterlinear]);

  // Reset expanded state when chapter changes.
  const chapterKey = chapter?.chapter;
  useMemo(() => { setExpandedVerses({}); }, [chapterKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // For each block, pre-compute which verse numbers should show the ⓘ icon.
  // A verse spans multiple blocks (each poetry line is its own block), so we
  // find the LAST block that contains each verse and assign the icon only there.
  // This is all done at the ChapterView level so ChapterBlock/FlowingVerses
  // receive a simple, stable Set of verse numbers — no mutable shared state
  // needed during render.
  const noteIconsPerBlock = useMemo(() => {
    if (!noteVerses || noteVerses.size === 0) return null;
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
    const perBlock = blocks.map((_, blockIndex) => {
      const verseSet = new Set();
      lastBlockForVerse.forEach((lastIdx, verseNum) => {
        if (lastIdx === blockIndex) verseSet.add(verseNum);
      });
      return verseSet;
    });
    return perBlock;
  }, [blocks, noteVerses]);

  // For interlinear:
  // - chevronVersesPerBlock: chevron shown on FIRST block of each verse
  // - expandedVersesPerBlock: expanded word row shown after LAST block of each verse
  const { chevronVersesPerBlock, expandedVersesPerBlock } = useMemo(() => {
    if (!interlinearChapter || interlinearChapter.size === 0)
      return { chevronVersesPerBlock: null, expandedVersesPerBlock: null };

    const firstBlockForVerse = new Map();
    const lastBlockForVerse = new Map();

    blocks.forEach((entry, blockIndex) => {
      entry.verses.forEach((verse) => {
        if (verse.number == null || verse.isEditorialNote) return;
        const verseNum = parseInt(verse.number, 10);
        if (!interlinearChapter.has(verseNum)) return;
        if (!firstBlockForVerse.has(verseNum)) firstBlockForVerse.set(verseNum, blockIndex);
        lastBlockForVerse.set(verseNum, blockIndex);
      });
    });

    const chevronPerBlock = blocks.map((_, blockIndex) => {
      const s = new Set();
      firstBlockForVerse.forEach((idx, verseNum) => { if (idx === blockIndex) s.add(verseNum); });
      return s;
    });

    const expandedPerBlock = blocks.map((_, blockIndex) => {
      const s = new Set();
      lastBlockForVerse.forEach((idx, verseNum) => { if (idx === blockIndex) s.add(verseNum); });
      return s;
    });

    return { chevronVersesPerBlock: chevronPerBlock, expandedVersesPerBlock: expandedPerBlock };
  }, [blocks, interlinearChapter]);


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
          interlinearChapter={interlinearChapter}
          blockChevronVerses={chevronVersesPerBlock ? chevronVersesPerBlock[index] : null}
          blockExpandedVerses={expandedVersesPerBlock ? expandedVersesPerBlock[index] : null}
          expandedVerses={expandedVerses}
          onToggleVerse={handleToggleVerse}
          onWordPress={onWordPress}
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
  interlinearChapter,
  blockChevronVerses,
  blockExpandedVerses,
  expandedVerses,
  onToggleVerse,
  onWordPress,
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

  // Verse-continuation indent only applies to poetry blocks (q1, q2, etc.) where
  // a verse spans multiple lines and indenting signals the continuation clearly.
  // For prose (style=p and similar) a mid-verse paragraph break should render
  // flush-left, not indented — the paragraph margin already provides separation.
  const shouldIndentContinuation = continuesPreviousVerse && kind === "poetry";

  // Memoize the inset style object so React.memo's shallow compare stays stable.
  const insetStyle = useMemo(
    () => (shouldIndentContinuation ? { paddingLeft: VERSE_CONTINUATION_INDENT * fontScale } : null),
    [shouldIndentContinuation, fontScale]
  );

  // Compute total left padding so the interlinear row can negate it exactly.
  const blockLeftPadding = useMemo(() => {
    let left = 0;
    const container = appearance.container;
    const containerArr = Array.isArray(container) ? container : [container];
    containerArr.forEach((s) => { if (s && typeof s.paddingLeft === "number") left += s.paddingLeft; });
    if (shouldIndentContinuation) left += VERSE_CONTINUATION_INDENT * fontScale;
    return left;
  }, [appearance.container, shouldIndentContinuation, fontScale]);

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
          interlinearChapter={interlinearChapter}
          blockChevronVerses={blockChevronVerses}
          blockExpandedVerses={blockExpandedVerses}
          blockLeftPadding={blockLeftPadding}
          expandedVerses={expandedVerses}
          onToggleVerse={onToggleVerse}
          onWordPress={onWordPress}
        />
      ) : null}
    </View>
  );
});

const FlowingVerses = memo(function FlowingVerses({
  verses,
  beginsWithContinuation,
  appearance,
  colors,
  typography,
  fontScale,
  blockNoteVerses,
  onNotePress,
  interlinearChapter,
  blockChevronVerses,
  blockExpandedVerses,
  blockLeftPadding,
  expandedVerses,
  onToggleVerse,
  onWordPress,
}) {
  const interlinearActive = !!(interlinearChapter && interlinearChapter.size > 0);

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

  // Stable color style objects
  const textColorStyle = useMemo(() => ({ color: colors.text }), [colors.text]);
  const mutedColorStyle = useMemo(() => ({ color: colors.mutedText }), [colors.mutedText]);
  const accentColorStyle = useMemo(() => ({ color: colors.accent }), [colors.accent]);
  const noteIconSizeStyle = useMemo(() => ({ fontSize: 13 * fontScale }), [fontScale]);
  const noteIconHitSlop = useMemo(() => ({ top: 12, bottom: 12, left: 10, right: 10 }), []);

  // ── Interlinear mode: each verse on its own line with chevron ──────────────
  if (interlinearActive) {
    return (
      <View>
        {segments.map((segment, index) => {
          const verseNum = segment.number != null ? parseInt(segment.number, 10) : null;
          // Chevron only on first block; expanded row only on last block
          const showChevron = verseNum != null &&
            interlinearChapter.has(verseNum) &&
            (!blockChevronVerses || blockChevronVerses.has(verseNum));
          const showExpanded = verseNum != null &&
            interlinearChapter.has(verseNum) &&
            (!blockExpandedVerses || blockExpandedVerses.has(verseNum));
          const expanded = showExpanded && !!expandedVerses?.[verseNum];

          return (
            <View key={`${segment.number ?? "text"}-${index}`}>
              {/* Verse row: text on left, chevron on right */}
              <View style={styles.interlinearVerseRow}>
                <Text
                  style={[
                    styles.flowingText,
                    typography[appearance.textType],
                    appearance.text,
                    textColorStyle,
                    styles.interlinearVerseText,
                  ]}
                >
                  {segment.showNumber ? (
                    <Text style={[styles.verseNumber, typography.verseNumber, mutedColorStyle]}>
                      {segment.number}{"\u00A0\u00A0"}
                    </Text>
                  ) : null}
                  {segment.editorialNote ? (
                    <Text style={typography.editorialText}>{segment.text}</Text>
                  ) : segment.text}
                </Text>

                {/* Chevron — only on first block of verse */}
                {showChevron ? (
                  <TouchableOpacity
                    onPress={() => onToggleVerse?.(verseNum)}
                    style={styles.interlinearChevronBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 12, right: 4 }}
                    accessibilityRole="button"
                    accessibilityLabel={expandedVerses?.[verseNum] ? "Collapse Greek" : "Expand Greek"}
                  >
                    <Text style={[
                      styles.interlinearChevron,
                      { color: expandedVerses?.[verseNum] ? colors.accent : colors.mutedText },
                      expandedVerses?.[verseNum] && styles.interlinearChevronOpen,
                    ]}>
                      {"›"}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Expanded interlinear word row — breaks out of block padding */}
              {expanded ? (
                <View style={[styles.interlinearRowBreakout, blockLeftPadding ? { marginLeft: -blockLeftPadding } : null]}>
                  <InterlinearVerseRow
                    words={interlinearChapter.get(verseNum)}
                    onWordPress={onWordPress}
                    colors={colors}
                    fontScale={fontScale}
                  />
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    );
  }

  // ── Normal mode: flowing paragraph text ───────────────────────────────────
  // onTextLayout correction: RN fires onTextLayout with the real line array after
  // the first render. If the last line's bottom edge (y + height) exceeds the
  // container's measured height, Android is clipping it. We correct by setting a
  // minHeight that adds exactly one extra line height — enough to un-clip the last
  // line. This is a second render pass but only triggers on affected blocks.
  const [extraHeight, setExtraHeight] = useState(0);
  const lh = BODY_LINE_HEIGHT * fontScale;

  const handleTextLayout = useCallback((e) => {
    const lines = e.nativeEvent.lines;
    if (!lines || lines.length === 0) return;
    const lastLine = lines[lines.length - 1];
    const lastLineBottom = lastLine.y + lastLine.height;
    // If the last line's bottom exceeds N full line-heights, it's being clipped.
    const expectedBottom = Math.round(lines.length * lh);
    if (lastLineBottom > expectedBottom + 1) {
      setExtraHeight(lh);
    } else {
      setExtraHeight(0);
    }
  }, [lh]);

  const lastSegmentHasNoteIcon = (() => {
    if (!blockNoteVerses) return false;
    const last = segments[segments.length - 1];
    if (!last) return false;
    const verseNum = last.number != null ? parseInt(last.number, 10) : null;
    return verseNum != null && blockNoteVerses.has(verseNum);
  })();

  return (
    <Text
      style={[
        styles.flowingText,
        typography[appearance.textType],
        appearance.text,
        textColorStyle,
        extraHeight > 0 ? { minHeight: Math.ceil(segments.length * lh) + extraHeight } : null,
      ]}
      textBreakStrategy="simple"
      android_hyphenationFrequency="none"
      allowFontScaling={false}
      lineBreakStrategyIOS="none"
      selectable={false}
      onTextLayout={handleTextLayout}
    >
      {segments.map((segment, index) => {
        const verseNum = segment.number != null ? parseInt(segment.number, 10) : null;
        const showNoteIcon = blockNoteVerses && verseNum != null && blockNoteVerses.has(verseNum);
        const isLast = index === segments.length - 1;

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
            {isLast && !showNoteIcon ? "\u200B" : null}
            {showNoteIcon ? (
              <Text
                style={[styles.noteIcon, noteIconSizeStyle, accentColorStyle]}
                onPress={(e) => onNotePress?.(verseNum, e.nativeEvent.pageY)}
                hitSlop={noteIconHitSlop}
              >
                {"\u00A0" + INFO_ICON_GLYPH + "\u00A0"}
              </Text>
            ) : null}
          </Text>
        );
      })}
      {!lastSegmentHasNoteIcon ? "\u200B" : null}
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

  // ── Interlinear mode styles ──────────────────────────────────────────────
  // Each verse gets its own row: text fills remaining space, chevron sits fixed right.
  interlinearRowBreakout: {
    // marginLeft is set inline to negate the exact block left padding
    paddingLeft: 0,
  },
  interlinearVerseRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  interlinearVerseText: {
    flex: 1,
    marginRight: 8,
  },
  interlinearChevronBtn: {
    paddingTop: 2,
    paddingLeft: 4,
    justifyContent: "flex-start",
    alignItems: "center",
    minWidth: 20,
  },
  interlinearChevron: {
    fontSize: 20,
    fontFamily: "Inter_400Regular",
    lineHeight: 24,
  },
  interlinearChevronOpen: {
    transform: [{ rotate: "90deg" }],
  },
});
