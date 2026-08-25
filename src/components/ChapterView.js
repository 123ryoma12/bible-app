import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { FONT_FAMILIES } from "../theme/fonts";

const BODY_SIZE = 18;
const BODY_LINE_HEIGHT = 30;
const VERSE_NUMBER_SIZE = 10;
const VERSE_CONTINUATION_INDENT = 20;

/**
 * A stable, reading-first chapter layout. Each source paragraph or poetry line
 * owns one native Text layout, preserving continuous Bible paragraph flow.
 */
export default function ChapterView({ chapter }) {
  const { colors, fontScale } = useTheme();
  const typography = useMemo(() => createTypography(fontScale), [fontScale]);
  const blocks = useMemo(() => prepareBlocks(chapter?.blocks), [chapter]);

  if (!chapter) {
    return (
      <View style={styles.content}>
        <Text style={[styles.missing, typography.body, { color: colors.secondaryText }]}>
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
        />
      ))}
    </View>
  );
}

function ChapterBlock({
  block,
  verses,
  continuesPreviousVerse,
  hasOnlyEditorialNotes,
  colors,
  fontScale,
  typography,
}) {
  const sourceStyle = block?.style || "p";
  const kind = getBlockKind(sourceStyle);
  const label = typeof block?.text === "string" ? block.text.trim() : "";

  if (sourceStyle === "b" && verses.length === 0 && !label) {
    return <View style={styles.spacer} />;
  }

  // The reader header already presents the chapter title.
  if (sourceStyle === "cl") return null;

  const appearance = getAppearance(sourceStyle, kind);
  const showLabel = label && (kind === "heading" || verses.length === 0);
  const continuationInset = continuesPreviousVerse
    ? VERSE_CONTINUATION_INDENT * fontScale
    : 0;

  if (!showLabel && verses.length === 0) return null;

  return (
    <View
      style={[
        styles.block,
        appearance.container,
        continuationInset ? { paddingLeft: continuationInset } : null,
        hasOnlyEditorialNotes ? styles.editorialBlock : null,
      ]}
    >
      {showLabel ? (
        <Text
          style={[
            appearance.label,
            typography[appearance.labelType],
            { color: appearance.labelColor(colors) },
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
        />
      ) : null}
    </View>
  );
}

function FlowingVerses({ verses, beginsWithContinuation, appearance, colors, typography }) {
  const segments = verses.map((verse, index) => {
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
  });

  return (
    <Text
      style={[
        styles.flowingText,
        typography[appearance.textType],
        appearance.text,
        { color: colors.text },
      ]}
    >
      {segments.map((segment, index) => (
        <Text key={`${segment.number ?? "text"}-${index}`} style={segment.editorialNote ? styles.editorialText : null}>
          {index > 0 ? " " : null}
          {segment.showNumber ? (
            <Text style={[styles.verseNumber, typography.verseNumber, { color: colors.mutedText }]}>
              {segment.number}{"\u00A0\u00A0"}
            </Text>
          ) : null}
          {segment.text}
        </Text>
      ))}
    </Text>
  );
}

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
  if (style === "po" || style === "pr" || style === "pc" || style === "pmo") return "centered";
  if (/^pi\d*$/.test(style) || style === "pm" || style === "pmc" || style === "mi" || style === "nb") {
    return "indented";
  }
  return "paragraph";
}

function getAppearance(style, kind) {
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

  switch (kind) {
    case "heading":
      return {
        ...base,
        container: styles.heading,
        label: styles.headingLabel,
        labelType: "heading",
        labelColor: (colors) => colors.secondaryText,
        uppercase: true,
      };
    case "descriptive":
      return {
        ...base,
        container: styles.descriptive,
        label: styles.descriptiveLabel,
        labelType: "descriptive",
        textType: "descriptive",
        text: styles.centeredText,
      };
    case "poetry":
      return { ...base, container: [styles.poetry, { paddingLeft: 12 * (level - 1) }] };
    case "list":
      return { ...base, container: [styles.list, { paddingLeft: 12 * (level - 1) }] };
    case "centered":
      return { ...base, container: styles.centered, textType: "descriptive", text: styles.centeredText };
    case "indented":
      return { ...base, container: styles.indented };
    default:
      return base;
  }
}

function createTypography(fontScale) {
  return StyleSheet.create({
    body: {
      fontFamily: FONT_FAMILIES.serifRegular,
      fontSize: BODY_SIZE * fontScale,
      lineHeight: BODY_LINE_HEIGHT * fontScale,
      includeFontPadding: true,
    },
    descriptive: {
      fontFamily: FONT_FAMILIES.serifItalic,
      fontSize: 15 * fontScale,
      lineHeight: 24 * fontScale,
      includeFontPadding: true,
    },
    heading: {
      fontFamily: FONT_FAMILIES.sansSemiBold,
      fontSize: 11 * fontScale,
      letterSpacing: 1.2,
    },
    verseNumber: {
      fontFamily: FONT_FAMILIES.sansSemiBold,
      fontSize: VERSE_NUMBER_SIZE * fontScale,
    },
  });
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 32,
  },
  missing: {
    fontFamily: FONT_FAMILIES.serifItalic,
    marginTop: 20,
  },
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
  editorialText: {
    fontFamily: FONT_FAMILIES.serifItalic,
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
