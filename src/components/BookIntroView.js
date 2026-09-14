import React, { useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { uiFont, readingFont } from "../theme/fonts";
import bookInfoData from "../../data/book-info.json";

// Map app book names to book-info.json keys where they differ
const BOOK_NAME_MAP = {
  "Psalm": "Psalms",
  "Song of Songs": "Song of Solomon",
};

export function getBookInfo(bookName) {
  const key = BOOK_NAME_MAP[bookName] ?? bookName;
  return bookInfoData[key] ?? null;
}

// ---------------------------------------------------------------------------
// Outline item — flat indented list
// ---------------------------------------------------------------------------
function OutlineItem({ item, colors, readingFontKey }) {
  const indent = (item.level - 1) * 16;
  const isTopLevel = item.level === 1;
  return (
    <View style={[styles.outlineItem, { paddingLeft: indent }]}>
      <Text
        style={[
          styles.outlineMarker,
          {
            color: colors.accent,
            fontFamily: uiFont(isTopLevel ? 600 : 400),
            width: isTopLevel ? 28 : 22,
          },
        ]}
      >
        {item.marker}.
      </Text>
      <Text
        style={[
          isTopLevel ? styles.outlineTopText : styles.outlineSubText,
          {
            color: isTopLevel ? colors.text : colors.secondaryText,
            fontFamily: readingFont(readingFontKey, isTopLevel ? "semiBold" : "regular"),
            flex: 1,
          },
        ]}
      >
        {item.text}
        {item.reference ? (
          <Text style={[styles.outlineRef, { color: colors.mutedText }]}>
            {"  "}({item.reference})
          </Text>
        ) : null}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Section — heading label + content, no box, no collapse
// ---------------------------------------------------------------------------
function Section({ section, colors, readingFontKey, sectionRef }) {
  const isOutline = section.heading === "Outline";
  return (
    <View ref={sectionRef} style={styles.section}>
      <Text style={[styles.sectionHeading, { color: colors.accent, fontFamily: uiFont(600) }]}>
        {section.heading}
      </Text>
      {isOutline ? (
        <View style={styles.outlineList}>
          {section.content.map((item, i) => (
            <OutlineItem key={i} item={item} colors={colors} readingFontKey={readingFontKey} />
          ))}
        </View>
      ) : (
        <Text
          style={[
            styles.sectionText,
            { color: colors.text, fontFamily: readingFont(readingFontKey, "regular") },
          ]}
        >
          {section.content}
        </Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// TOC sheet — modal-style overlay listing all section headings
// ---------------------------------------------------------------------------
export function TocSheet({ sections, onSelect, onClose, colors }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      transparent
      visible
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.tocBackdrop}>
        {/* Tapping above the sheet dismisses it */}
        <TouchableOpacity style={styles.tocBackdropTap} activeOpacity={1} onPress={onClose} />

        <View style={[styles.tocSheet, { backgroundColor: colors.background, borderColor: colors.border, paddingBottom: insets.bottom }]}>
          {/* Grabber */}
          <View style={styles.tocGrabber}>
            <View style={[styles.tocGrabberBar, { backgroundColor: colors.border }]} />
          </View>

          <Text style={[styles.tocTitle, { color: colors.text, fontFamily: uiFont(700) }]}>
            Sections
          </Text>

          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 8 }}
          >
            {sections.map((s, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.tocRow, { borderBottomColor: colors.border }]}
                onPress={() => onSelect(i)}
                activeOpacity={0.7}
              >
                <Text style={[styles.tocRowText, { color: colors.accent, fontFamily: uiFont(500) }]}>
                  {s.heading}
                </Text>
                <MaterialCommunityIcons name="chevron-right" size={18} color={colors.mutedText} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// BookIntroView — renders inline inside ReaderScreen's ScrollView
// ---------------------------------------------------------------------------
export default function BookIntroView({
  book,
  onOpenChapter,
  onSectionRefs,
}) {
  const { colors, readingFontKey } = useTheme();
  const info = getBookInfo(book.name);
  const sectionRefs = useRef([]);

  const handleSectionRef = useCallback((ref, i) => {
    sectionRefs.current[i] = ref;
    onSectionRefs?.(sectionRefs.current);
  }, [onSectionRefs]);

  if (!info) return null;

  return (
    <View style={styles.container}>
      {/* Title hero */}
      <View style={styles.hero}>
        <Text
          style={[
            styles.heroTitle,
            { color: colors.text, fontFamily: readingFont(readingFontKey, "bold") },
          ]}
        >
          {book.name}
        </Text>
        <View style={[styles.heroRule, { backgroundColor: colors.accent }]} />
      </View>

      {/* Sections — flat, no boxes */}
      {info.sections.map((section, i) => (
        <Section
          key={i}
          section={section}
          colors={colors}
          readingFontKey={readingFontKey}
          sectionRef={(ref) => handleSectionRef(ref, i)}
        />
      ))}

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },

  // Hero
  hero: {
    alignItems: "center",
    paddingVertical: 28,
  },
  heroTitle: {
    fontSize: 28,
    textAlign: "center",
  },
  heroRule: {
    width: 40,
    height: 2,
    borderRadius: 1,
    marginTop: 14,
  },

  // Section
  section: {
    marginBottom: 28,
  },
  sectionHeading: {
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  sectionText: {
    fontSize: 15,
    lineHeight: 25,
  },

  // Outline
  outlineList: {
    marginTop: 2,
  },
  outlineItem: {
    flexDirection: "row",
    marginBottom: 5,
  },
  outlineMarker: {
    fontSize: 13,
    paddingTop: 1,
  },
  outlineTopText: {
    fontSize: 13,
    lineHeight: 20,
    letterSpacing: 0.1,
  },
  outlineSubText: {
    fontSize: 13,
    lineHeight: 20,
  },
  outlineRef: {
    fontSize: 12,
  },

  // Read CTA
  readBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    marginBottom: 16,
    paddingVertical: 15,
    borderRadius: 10,
  },
  readBtnText: {
    fontSize: 16,
  },

  // TOC modal
  tocBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  tocBackdropTap: {
    flex: 1,
  },
  tocSheet: {
    maxHeight: "75%",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    paddingHorizontal: 16,
  },
  tocGrabber: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 2,
  },
  tocGrabberBar: {
    width: 38,
    height: 4,
    borderRadius: 2,
  },
  tocTitle: {
    fontSize: 16,
    marginTop: 4,
    marginBottom: 12,
  },
  tocRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tocRowText: {
    fontSize: 15,
  },
});
