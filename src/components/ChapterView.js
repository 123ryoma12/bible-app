import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { FONT_FAMILIES } from "../theme/fonts";

const BODY_SIZE = 17;
const VERSE_NUMBER_SIZE = 11;
const VERSE_NUMBER_DIGIT_WIDTH = 7;
const VERSE_NUMBER_TRAILING_SPACE = 4;

/**
 * Source blocks are rendered as source blocks: one native text layout per
 * paragraph, poetry line, or list item. This preserves the editorial structure
 * of the Bible text while allowing React Native to measure and wrap each block
 * naturally. No layout state, height constraints, or manual re-measure passes
 * are used.
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
      {blocks.map(({ block, verses, continuesPreviousVerse }, index) => (
        <ChapterBlock
          key={`${index}-${block?.style || "p"}`}
          block={block}
          verses={verses}
          continuesPreviousVerse={continuesPreviousVerse}
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
  colors,
  fontScale,
  typography,
}) {
  const style = block?.style || "p";
  const kind = getBlockKind(style);
  const label = typeof block?.text === "string" ? block.text.trim() : "";

  // Blank USFM blocks add intentional breathing room. A block with scripture
  // always renders its scripture, regardless of its presentation style.
  if (style === "b" && verses.length === 0 && !label) {
    return <View style={styles.spacer} />;
  }

  // Chapter labels are metadata; the ReaderScreen already owns the title.
  if (style === "cl") return null;

  const appearance = getAppearance(style, kind);
  const showLabel = label && (kind === "heading" || verses.length === 0);

  if (!showLabel && verses.length === 0) return null;

  return (
    <View
      style={[
        styles.block,
        appearance.container,
        continuesPreviousVerse
          ? { paddingLeft: getVerseNumberGutter(verses[0]?.number, fontScale) }
          : null,
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

function FlowingVerses({
  verses,
  beginsWithContinuation,
  appearance,
  colors,
  typography,
}) {
  return (
    <Text style={[styles.flowingText, typography[appearance.textType], appearance.text, { color: colors.text }]}>
      {verses.map((verse, index) => {
        const previousNumber =
          index > 0
            ? verses[index - 1].number
            : beginsWithContinuation
              ? verse.number
              : null;
        const showNumber = verse.number !== null && verse.number !== previousNumber;

        return (
          <React.Fragment key={`${verse.number ?? "text"}-${index}`}>
            {index > 0 ? " " : null}
            {showNumber ? (
              <Text style={[styles.verseNumber, typography.verseNumber, { color: colors.mutedText }]}>
                {verse.number}{" "}
              </Text>
            ) : null}
            {verse.text}
          </React.Fragment>
        );
      })}
    </Text>
  );
}

// Keep the source blocks intact while carrying the last verse number forward.
// Poetry frequently splits one verse across consecutive source blocks; later
// lines use the same gutter as the verse label instead of repeating it.
function prepareBlocks(source) {
  let previousVerseNumber = null;

  return (Array.isArray(source) ? source : []).map((block) => {
    const verses = getVerses(block?.verses);
    const firstVerseNumber = verses[0]?.number ?? null;
    const lastVerseNumber = verses[verses.length - 1]?.number ?? null;
    const continuesPreviousVerse =
      firstVerseNumber !== null && firstVerseNumber === previousVerseNumber;

    if (lastVerseNumber !== null) previousVerseNumber = lastVerseNumber;

    return { block, verses, continuesPreviousVerse };
  });
}

function getVerseNumberGutter(verseNumber, fontScale) {
  const digitCount = String(verseNumber ?? "").length;
  return (digitCount * VERSE_NUMBER_DIGIT_WIDTH + VERSE_NUMBER_TRAILING_SPACE) * fontScale;
}

function getVerses(source) {
  if (!Array.isArray(source)) return [];

  return source
    .filter((verse) => verse && typeof verse.text === "string" && verse.text.trim())
    .map((verse) => ({
      number: verse.verse == null ? null : String(verse.verse),
      text: verse.text.trim(),
    }));
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
    },
    descriptive: {
      fontFamily: FONT_FAMILIES.serifItalic,
      fontSize: 15 * fontScale,
    },
    heading: {
      fontFamily: FONT_FAMILIES.sansSemiBold,
      fontSize: 12 * fontScale,
      letterSpacing: 1.1,
    },
    verseNumber: {
      fontFamily: FONT_FAMILIES.sansSemiBold,
      fontSize: VERSE_NUMBER_SIZE * fontScale,
    },
  });
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 28,
  },
  missing: {
    fontFamily: FONT_FAMILIES.serifItalic,
    marginTop: 20,
  },
  block: {
    width: "100%",
  },
  paragraph: {
    marginBottom: 22,
  },
  poetry: {
    marginBottom: 12,
  },
  list: {
    marginBottom: 12,
  },
  centered: {
    marginBottom: 18,
  },
  indented: {
    marginBottom: 14,
    paddingLeft: 14,
  },
  heading: {
    marginTop: 28,
    marginBottom: 12,
  },
  descriptive: {
    marginBottom: 16,
  },
  spacer: {
    height: 14,
  },
  flowingText: {
    // Natural platform line height prevents clipped final lines at all scales.
  },
  verseNumber: {
    letterSpacing: 0.2,
  },
  centeredText: {
    textAlign: "center",
  },
  plainLabel: {
    marginBottom: 8,
  },
  headingLabel: {
    marginBottom: 10,
  },
  descriptiveLabel: {
    textAlign: "center",
    marginBottom: 8,
  },
});
