// Contextual popover showing full detail for a tapped original-language word.
// Mirrors VerseNotePopover: anchors near the tapped word's Y position,
// positions above or below depending on screen location, dismisses on
// scroll or tap-outside (handled by ReaderScreen).

import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Animated,
  useWindowDimensions,
  Platform,
  Linking,
} from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { uiFont } from "../theme/fonts";

const POPOVER_MAX_HEIGHT_FRAC = 0.45;
const MARGIN_H = 20;
const PADDING = 16;
const GAP = 14;
const ABOVE_THRESHOLD = 0.55;
const ANIM_MS = 180;

function SectionLabel({ label, colors }) {
  return (
    <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>
      {label}
    </Text>
  );
}

export default function InterlinearWordPopover({ visible, word, anchorY, onDismiss }) {
  const { colors, mode } = useTheme();
  const { height: screenH } = useWindowDimensions();

  const anim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      anim.setValue(0);
      Animated.timing(anim, { toValue: 1, duration: ANIM_MS, useNativeDriver: true }).start();
    } else {
      Animated.timing(anim, { toValue: 0, duration: ANIM_MS, useNativeDriver: true })
        .start(({ finished }) => { if (finished) setMounted(false); });
    }
  }, [visible]);

  if (!mounted || !word) return null;

  const isHebrew = !!word.hebrew;
  const hebrewStyle = isHebrew ? {
    fontFamily: Platform.select({ ios: "Times New Roman", default: "serif" }),
    writingDirection: "rtl",
    textAlign: "right",
  } : null;

  const showAbove = anchorY != null && anchorY > screenH * ABOVE_THRESHOLD;
  const maxH = screenH * POPOVER_MAX_HEIGHT_FRAC;
  const cardTop = showAbove ? null : (anchorY ?? screenH * 0.3) + GAP;
  const cardBottom = showAbove ? (screenH - (anchorY ?? screenH * 0.5) + GAP) : null;

  // Split morph string into individual parts for display
  const morphParts = word.morph ? word.morph.split(", ") : [];
  const posLabel = morphParts[0] || null;
  const morphDetails = morphParts.slice(1).join("  ·  ");

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            left: MARGIN_H,
            right: MARGIN_H,
            maxHeight: maxH,
            opacity: anim,
            transform: [{
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [showAbove ? 6 : -6, 0],
              }),
            }],
            ...(cardTop != null ? { top: cardTop } : {}),
            ...(cardBottom != null ? { bottom: cardBottom } : {}),
          },
        ]}
      >
        <ScrollView
          style={{ maxHeight: maxH - PADDING * 2 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
          indicatorStyle={mode === "dark" ? "white" : "black"}
          bounces={false}
        >
          {/* Original word + transliteration header */}
          {isHebrew ? <SectionLabel label={word.language === "arc" ? "ARAMAIC" : "HEBREW"} colors={colors} /> : null}
          <Text style={[styles.originalWord, { color: colors.text }, hebrewStyle]}>
            {word.hebrew || word.greek}
          </Text>
          <Text style={[styles.translit, { color: colors.mutedText }]}>
            {word.translit}
          </Text>

          <View style={[styles.divider, { borderColor: colors.border }]} />

          {/* Gloss */}
          <SectionLabel label="GLOSS" colors={colors} />
          <Text style={[styles.value, { color: colors.text }]}>
            {word.gloss}
          </Text>

          {/* Lexical form */}
          {word.lemma ? (
            <>
              <SectionLabel label="LEXICAL FORM" colors={colors} />
              {isHebrew ? (
                <>
                  <Text style={[styles.value, hebrewStyle, { color: colors.accent, fontSize: 20, lineHeight: 30 }]}>{word.lemma}</Text>
                  {word.lemmaGloss ? <Text style={[styles.value, { color: colors.mutedText }]}>{word.lemmaGloss}</Text> : null}
                </>
              ) : <Text style={[styles.value, { color: colors.text }]}>
                <Text style={{ color: colors.accent }}>{word.lemma}</Text>
                {word.lemmaGloss ? (
                  <Text style={{ color: colors.mutedText }}>{"  ·  " + word.lemmaGloss}</Text>
                ) : null}
              </Text>}
            </>
          ) : null}

          {/* Strong's */}
          {word.strongs ? (
            <>
              <SectionLabel label="STRONG'S" colors={colors} />
              <Text style={[styles.value, { color: colors.text }]}>
                {word.strongs}
              </Text>
            </>
          ) : null}

          {/* Parsing */}
          {morphParts.length > 0 ? (
            <>
              <SectionLabel label="PARSING" colors={colors} />
              {isHebrew ? (
                <Text style={[styles.value, { color: colors.text }]}>{word.morph}</Text>
              ) : posLabel ? (
                <Text style={[styles.value, { color: colors.text }]}>
                  {posLabel}
                  {morphDetails ? (
                    <Text style={{ color: colors.secondaryText }}>{"  ·  " + morphDetails}</Text>
                  ) : null}
                </Text>
              ) : null}
            </>
          ) : null}
          {word.textualNote ? (
            <>
              <SectionLabel label="TEXTUAL NOTE" colors={colors} />
              <Text style={[styles.value, { color: colors.mutedText }]}>{word.textualNote}</Text>
            </>
          ) : null}
          <Text
            style={[styles.source, { color: colors.mutedText }]}
            accessibilityRole="link"
            onPress={() => Linking.openURL("https://github.com/STEPBible/STEPBible-Data")}
          >
            STEP Bible · {isHebrew ? "TAHOT" : "TAGNT"} · CC BY 4.0
          </Text>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    borderRadius: 12,
    borderWidth: 1,
    padding: PADDING,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  scrollContent: {
    paddingBottom: 2,
  },
  originalWord: {
    fontSize: 24,
    fontFamily: "Lora_400Regular",
    marginBottom: 2,
  },
  translit: {
    fontSize: 13,
    fontFamily: uiFont(400),
    marginBottom: 2,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginVertical: 12,
  },
  sectionLabel: {
    fontSize: 10,
    fontFamily: uiFont(600),
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginTop: 10,
    marginBottom: 3,
  },
  value: {
    fontSize: 16,
    fontFamily: uiFont(400),
    lineHeight: 22,
  },
  source: {
    fontSize: 11,
    fontFamily: uiFont(400),
    marginTop: 16,
  },
});
