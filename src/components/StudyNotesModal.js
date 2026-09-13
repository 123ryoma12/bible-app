// StudyNotesModal — full-screen modal sheet showing all study notes for the
// current chapter. Follows the same pattern as SermonSheet.
//
// Notes are from the Reformation Study Bible (ESV, 2015), stored in
// data/study_notes.json and looked up by book + chapter.

import React, { useCallback, useRef } from "react";
import {
  View,
  Text,
  Modal,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { uiFont, readingFont } from "../theme/fonts";
import { useTheme } from "../theme/ThemeContext";
import NoteText from "./NoteText";

const NOTE_FONT_SIZE = 12.5;
const REF_FONT_SIZE = 11;

export default function StudyNotesModal({ visible, onClose, book, chapterNumber, notes }) {
  const { colors, readingFontKey } = useTheme();
  const insets = useSafeAreaInsets();

  // Persists the scroll offset across open/close cycles for the same chapter.
  // Lives as a ref (not state) so it never triggers a re-render.
  // Automatically reset when ReaderScreen remounts on chapter change (keyed).
  const scrollOffsetRef = useRef(0);
  const flatListRef = useRef(null);

  const renderNote = useCallback(
    ({ item, index }) => (
      <View
        style={[
          styles.noteCard,
          {
            borderLeftColor: colors.accent,
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
          {book?.name} {item.verse_ref}
        </Text>
        <NoteText
          text={item.note}
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
    [colors, readingFontKey, book]
  );

  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        {/* Tapping the dimmed area above the sheet dismisses it. */}
        <TouchableOpacity
          style={styles.backdropTap}
          activeOpacity={1}
          onPress={onClose}
        />

        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              paddingBottom: insets.bottom,
            },
          ]}
        >
          {/* Drag handle */}
          <View style={styles.grabber}>
            <View style={[styles.grabberBar, { backgroundColor: colors.border }]} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.headerTitle, { color: colors.text, fontFamily: uiFont(700) }]}>
                Study Notes
              </Text>
              <Text style={[styles.headerSub, { color: colors.mutedText, fontFamily: uiFont(400) }]}>
                {book?.name} {chapterNumber}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Close study notes"
            >
              <MaterialCommunityIcons name="close" size={24} color={colors.mutedText} />
            </TouchableOpacity>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Notes list */}
          {notes.length === 0 ? (
            <View style={styles.empty}>
              <MaterialCommunityIcons
                name="book-open-blank-variant"
                size={40}
                color={colors.mutedText}
              />
              <Text style={[styles.emptyTitle, { color: colors.text, fontFamily: uiFont(600) }]}>
                No study notes
              </Text>
              <Text style={[styles.emptyBody, { color: colors.mutedText, fontFamily: uiFont(400) }]}>
                There are no study notes for {book?.name} {chapterNumber}.
              </Text>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={notes}
              keyExtractor={(item, index) => `${item.verse_ref}-${index}`}
              renderItem={renderNote}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator
              // Save scroll offset on every scroll so we can restore it.
              onScroll={(e) => {
                scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
              }}
              scrollEventThrottle={16}
              // Restore scroll position when the modal reopens for the same chapter.
              onLayout={() => {
                if (scrollOffsetRef.current > 0 && flatListRef.current) {
                  flatListRef.current.scrollToOffset({
                    offset: scrollOffsetRef.current,
                    animated: false,
                  });
                }
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  backdropTap: {
    flex: 1,
  },
  sheet: {
    height: "85%",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  grabber: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 2,
  },
  grabberBar: {
    width: 38,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 19,
  },
  headerSub: {
    fontSize: 13,
    marginTop: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  listContent: {
    paddingBottom: 24,
    paddingTop: 8,
  },
  noteCard: {
    borderLeftWidth: 3,
    marginHorizontal: 16,
    marginTop: 14,
    paddingLeft: 12,
    paddingRight: 4,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  verseRef: {
    fontSize: REF_FONT_SIZE,
    letterSpacing: 0.5,
    marginBottom: 5,
    textTransform: "uppercase",
  },
  noteText: {
    fontSize: NOTE_FONT_SIZE,
    lineHeight: NOTE_FONT_SIZE * 1.7,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
  },
  emptyTitle: {
    fontSize: 16,
    marginTop: 14,
    textAlign: "center",
  },
  emptyBody: {
    fontSize: 13,
    marginTop: 6,
    textAlign: "center",
    lineHeight: 19,
  },
});
