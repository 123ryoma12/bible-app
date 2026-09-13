// StudyNotesPanel — a pinned bottom panel showing all study notes for the
// current chapter. Toggled open/closed via the top bar. Closeable via the X
// button inside the panel or by tapping the top bar toggle again.
//
// Design:
//  • Fixed height (~40% of screen), sits above the reader footer chrome
//  • Scrollable list of notes, each with a verse-ref header + body text
//  • Small font — commentary feel, doesn't compete with Bible text
//  • Surface background + accent left border on each note card
//  • Animated slide-up entry

import React, { useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { uiFont, readingFont } from "../theme/fonts";
import NoteText from "./NoteText";

const PANEL_HEIGHT = 300;
const NOTE_FONT_SIZE = 12.5;
const REF_FONT_SIZE = 11;

export default function StudyNotesPanel({ notes, visible, onClose, bottomOffset = 0 }) {
  const { colors, readingFontKey } = useTheme();
  const slideAnim = useRef(new Animated.Value(PANEL_HEIGHT)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 0 : PANEL_HEIGHT,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [visible, slideAnim]);

  const renderNote = useCallback(
    ({ verse_ref, note }, index) => (
      <View
        key={`${verse_ref}-${index}`}
        style={[
          styles.noteCard,
          {
            borderLeftColor: colors.accent,
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Text
          style={[
            styles.verseRef,
            { color: colors.accent, fontFamily: uiFont(700) },
          ]}
        >
          {verse_ref}
        </Text>
        <NoteText
          text={note}
          style={[
            styles.noteText,
            {
              color: colors.text,
              fontFamily: readingFont(readingFontKey, "regular"),
            },
          ]}
          boldStyle={{
            fontFamily: readingFont(readingFontKey, "bold"),
          }}
        />
      </View>
    ),
    [colors, readingFontKey]
  );

  if (!visible && slideAnim.__getValue() >= PANEL_HEIGHT) return null;

  return (
    <Animated.View
      style={[
        styles.panel,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          bottom: bottomOffset,
          transform: [{ translateY: slideAnim }],
          // Shadow for separation from reader content
          ...Platform.select({
            ios: {
              shadowColor: "#000",
              shadowOffset: { width: 0, height: -3 },
              shadowOpacity: 0.08,
              shadowRadius: 8,
            },
            android: { elevation: 8 },
          }),
        },
      ]}
    >
      {/* Panel header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.secondaryText, fontFamily: uiFont(600) }]}>
          STUDY NOTES
        </Text>
        <TouchableOpacity
          onPress={onClose}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Close study notes"
        >
          <MaterialCommunityIcons name="close" size={18} color={colors.secondaryText} />
        </TouchableOpacity>
      </View>

      {/* Notes list */}
      {notes.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: colors.mutedText, fontFamily: uiFont(400) }]}>
            No study notes for this chapter.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
          keyboardShouldPersistTaps="handled"
        >
          {notes.map(renderNote)}
        </ScrollView>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: "absolute",
    left: 0,
    right: 0,
    height: PANEL_HEIGHT,
    borderTopWidth: StyleSheet.hairlineWidth,
    // Must be above the reader's footer (zIndex 10) but the panel itself sits
    // above the app chrome via bottomOffset — no need to fight the tab bar's z.
    zIndex: 15,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 11,
    letterSpacing: 1.2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 12,
  },
  noteCard: {
    borderLeftWidth: 3,
    marginHorizontal: 12,
    marginTop: 10,
    paddingLeft: 10,
    paddingRight: 6,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  verseRef: {
    fontSize: REF_FONT_SIZE,
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  noteText: {
    fontSize: NOTE_FONT_SIZE,
    lineHeight: NOTE_FONT_SIZE * 1.65,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 13,
  },
});
