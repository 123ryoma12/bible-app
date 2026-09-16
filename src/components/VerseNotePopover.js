// Contextual popover anchored near a tapped verse's ⓘ icon.
// Positions above or below depending on where the verse sits on screen.
// Tapping outside or scrolling the reader dismisses it.

import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Animated,
  useWindowDimensions,
} from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { uiFont } from "../theme/fonts";
import NoteText from "./NoteText";

const FONT_STYLES = StyleSheet.create({
  verseRef:       { fontFamily: uiFont(600) },
  verseQuote:     { fontFamily: uiFont(400), fontStyle: "italic" },
  noteText:       { fontFamily: uiFont(400) },
  noteTextBold:   { fontFamily: uiFont(600) },
  noteTextItalic: { fontFamily: uiFont(400), fontStyle: "italic" },
});

const POPOVER_MAX_HEIGHT_FRAC = 0.42;
const MARGIN_H = 20;
const PADDING = 16;
const GAP = 14;               // gap between anchor point and card edge
const ABOVE_THRESHOLD = 0.55; // show above if tap is in lower 45% of screen
const ANIM_MS = 180;

export default function VerseNotePopover({ visible, notes, anchorY, onDismiss }) {
  const { colors, mode } = useTheme();
  const { height: screenH } = useWindowDimensions();

  const anim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);

  // Mount/unmount with animation
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

  if (!mounted) return null;

  const showAbove = anchorY != null && anchorY > screenH * ABOVE_THRESHOLD;
  const maxH = screenH * POPOVER_MAX_HEIGHT_FRAC;
  const cardTop = showAbove ? null : (anchorY ?? screenH * 0.3) + GAP;
  const cardBottom = showAbove ? (screenH - (anchorY ?? screenH * 0.5) + GAP) : null;

  return (
    // pointerEvents="box-none" passes touches through to the reader behind
    // so scrolling works freely. Dismiss is via scroll-away or tap-outside
    // (both handled in ReaderScreen via toggleChrome / handleScroll).
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
          {notes.map((note, i) => (
            <View
              key={i}
              style={[
                i > 0 && styles.divider,
                i > 0 && { borderColor: colors.border },
              ]}
            >
              <Text style={[styles.verseRef, FONT_STYLES.verseRef, { color: colors.accent }]}>
                {note.verse_ref}
              </Text>
              {note.verse_quote ? (
                <Text style={[styles.verseQuote, FONT_STYLES.verseQuote, { color: colors.secondaryText }]}>
                  {note.verse_quote}
                </Text>
              ) : null}
              <NoteText
                text={note.note}
                style={[styles.noteText, FONT_STYLES.noteText, { color: colors.text }]}
                boldStyle={FONT_STYLES.noteTextBold}
                italicStyle={FONT_STYLES.noteTextItalic}
              />
            </View>
          ))}
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
  verseRef: {
    fontSize: 12,
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  verseQuote: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 6,
  },
  noteText: {
    fontSize: 14,
    lineHeight: 22,
  },
  divider: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
