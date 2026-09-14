import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { uiFont, readingFont } from "../theme/fonts";
import bookInfoData from "../../data/book-info.json";

// Map app book names to book-info.json keys where they differ
const BOOK_NAME_MAP = {
  "Psalm": "Psalms",
  "Song of Songs": "Song of Solomon",
};

function getBookInfo(bookName) {
  const key = BOOK_NAME_MAP[bookName] ?? bookName;
  return bookInfoData[key] ?? null;
}

// ---------------------------------------------------------------------------
// Outline item — renders one entry with indentation by level
// ---------------------------------------------------------------------------
function OutlineItem({ item, colors, readingFontKey }) {
  const indentPerLevel = 16;
  const indent = (item.level - 1) * indentPerLevel;
  const isTopLevel = item.level === 1;

  return (
    <View style={[styles.outlineItem, { paddingLeft: indent }]}>
      <Text
        style={[
          isTopLevel ? styles.outlineTopMarker : styles.outlineSubMarker,
          { color: colors.accent, fontFamily: uiFont(isTopLevel ? 600 : 400) },
        ]}
      >
        {item.marker}.
      </Text>
      <View style={styles.outlineItemBody}>
        <Text
          style={[
            isTopLevel ? styles.outlineTopText : styles.outlineSubText,
            {
              color: isTopLevel ? colors.text : colors.secondaryText,
              fontFamily: readingFont(readingFontKey, isTopLevel ? "semiBold" : "regular"),
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
    </View>
  );
}

// ---------------------------------------------------------------------------
// Section card — collapsible section with heading + content
// ---------------------------------------------------------------------------
function SectionCard({ section, colors, readingFontKey }) {
  const [expanded, setExpanded] = useState(section.heading === "Title" || section.heading === "Title and Author");
  const toggle = useCallback(() => setExpanded((v) => !v), []);

  const isOutline = section.heading === "Outline";

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <TouchableOpacity
        style={styles.cardHeader}
        onPress={toggle}
        activeOpacity={0.7}
        hitSlop={{ top: 4, bottom: 4 }}
      >
        <Text style={[styles.cardHeading, { color: colors.accent, fontFamily: uiFont(600) }]}>
          {section.heading}
        </Text>
        <MaterialCommunityIcons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={20}
          color={colors.mutedText}
        />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.cardBody}>
          {isOutline ? (
            // Structured outline list
            section.content.map((item, i) => (
              <OutlineItem
                key={i}
                item={item}
                colors={colors}
                readingFontKey={readingFontKey}
              />
            ))
          ) : (
            // Plain prose text
            <Text
              style={[
                styles.cardText,
                {
                  color: colors.text,
                  fontFamily: readingFont(readingFontKey, "regular"),
                },
              ]}
            >
              {section.content}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// TOC modal — slides up as an overlay listing all section headings
// ---------------------------------------------------------------------------
function TocModal({ sections, visible, onClose, onSelect, colors }) {
  if (!visible) return null;
  return (
    <TouchableOpacity
      style={styles.tocBackdrop}
      activeOpacity={1}
      onPress={onClose}
    >
      <TouchableOpacity activeOpacity={1} style={[styles.tocSheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <Text style={[styles.tocTitle, { color: colors.text, fontFamily: uiFont(700) }]}>
          Sections
        </Text>
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
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// BookIntroScreen
// ---------------------------------------------------------------------------
export default function BookIntroScreen({
  book,
  onClose,          // back to reader
  onOpenChapter,    // open chapter 1
  bottomChromeHeight = 0,
}) {
  const { colors, readingFontKey } = useTheme();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  const sectionRefs = useRef([]);
  const [tocVisible, setTocVisible] = useState(false);

  const info = getBookInfo(book.name);

  const handleTocSelect = useCallback((index) => {
    setTocVisible(false);
    // Scroll to section — we measure each card's y offset
    if (sectionRefs.current[index]) {
      sectionRefs.current[index].measureLayout(
        scrollRef.current,
        (_x, y) => scrollRef.current?.scrollTo({ y, animated: true }),
        () => {}
      );
    }
  }, []);

  if (!info) {
    // Fallback: no intro data, go straight to chapter 1
    return null;
  }

  const decorativeTitle = info.title
    // Normalize small-caps artifacts like "J ESUS C HRIST" → "Jesus Christ"
    .replace(/([A-Z])\s([A-Z]{2,})/g, (_, a, b) => a + b.toLowerCase())
    .trim();

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["left", "right"]}
    >
      {/* Top bar */}
      <View
        style={[
          styles.topBar,
          {
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
            paddingTop: insets.top,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.topBarBtn}
          onPress={onClose}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={[styles.topBarBack, { color: colors.accent, fontFamily: uiFont(500) }]}>
            ‹ Back
          </Text>
        </TouchableOpacity>

        <Text
          style={[styles.topBarTitle, { color: colors.text, fontFamily: uiFont(600) }]}
          numberOfLines={1}
        >
          {book.name}
        </Text>

        {/* TOC button */}
        <TouchableOpacity
          style={styles.topBarBtn}
          onPress={() => setTocVisible(true)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Table of contents"
        >
          <MaterialCommunityIcons name="format-list-bulleted" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: bottomChromeHeight + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Decorative book title */}
        <View style={styles.hero}>
          <Text style={[styles.heroTitle, { color: colors.text, fontFamily: readingFont(readingFontKey, "bold") }]}>
            {decorativeTitle}
          </Text>
          <View style={[styles.heroRule, { backgroundColor: colors.accent }]} />
        </View>

        {/* Section cards */}
        {info.sections.map((section, i) => (
          <View
            key={i}
            ref={(r) => { sectionRefs.current[i] = r; }}
          >
            <SectionCard
              section={section}
              colors={colors}
              readingFontKey={readingFontKey}
            />
          </View>
        ))}

        {/* CTA: read chapter 1 */}
        <TouchableOpacity
          style={[styles.readBtn, { backgroundColor: colors.accent, borderColor: colors.accentBorder }]}
          onPress={onOpenChapter}
          activeOpacity={0.85}
        >
          <Text style={[styles.readBtnText, { color: colors.accentContrast, fontFamily: uiFont(700) }]}>
            Read {book.name} 1
          </Text>
          <MaterialCommunityIcons name="arrow-right" size={18} color={colors.accentContrast} style={{ marginLeft: 8 }} />
        </TouchableOpacity>
      </ScrollView>

      {/* TOC overlay */}
      <TocModal
        sections={info.sections}
        visible={tocVisible}
        onClose={() => setTocVisible(false)}
        onSelect={handleTocSelect}
        colors={colors}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },

  // Top bar
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topBarBtn: {
    minWidth: 56,
    alignItems: "center",
  },
  topBarBack: {
    fontSize: 16,
    alignSelf: "flex-start",
  },
  topBarTitle: {
    fontSize: 17,
    flex: 1,
    textAlign: "center",
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },

  // Hero
  hero: {
    alignItems: "center",
    paddingVertical: 28,
  },
  heroTitle: {
    fontSize: 26,
    textAlign: "center",
    lineHeight: 34,
  },
  heroRule: {
    width: 48,
    height: 2.5,
    borderRadius: 2,
    marginTop: 16,
  },

  // Section card
  card: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  cardHeading: {
    fontSize: 14,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    flex: 1,
  },
  cardBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 2,
  },
  cardText: {
    fontSize: 15,
    lineHeight: 24,
  },

  // Outline
  outlineItem: {
    flexDirection: "row",
    marginBottom: 6,
  },
  outlineTopMarker: {
    fontSize: 13,
    width: 28,
    paddingTop: 1,
  },
  outlineSubMarker: {
    fontSize: 13,
    width: 22,
    paddingTop: 1,
  },
  outlineItemBody: {
    flex: 1,
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
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 15,
    borderRadius: 10,
    borderWidth: 1,
  },
  readBtnText: {
    fontSize: 16,
  },

  // TOC
  tocBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  tocSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
    maxHeight: "75%",
  },
  tocTitle: {
    fontSize: 16,
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
