// Top chrome bar for the reader. Mirrors the footer's show/hide animation but
// slides down from the top. Contains two controls:
//
//   ···  – Appearance menu: font typeface picker + font-size stepper
//   NIV  – Version pill: cycles through / picks the reading translation
//
// Both open lightweight inline dropdowns (no full-screen modal) to stay
// uncluttered. The bar is driven by the same `chromeVisible` flag as the
// footer so they always move together.

import React, { useState, useCallback } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
  Modal,
  Pressable,
} from "react-native";
import { uiFont, readingFont, READING_FONT_OPTIONS } from "../theme/fonts";
import { BIBLE_VERSIONS } from "../data/bibleVersions";
import {
  useTheme,
  FONT_SCALE_MIN,
  FONT_SCALE_MAX,
  FONT_SCALE_STEP,
} from "../theme/ThemeContext";
import { setReadingVersion } from "../data/bibleVersionStore";

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: Appearance dropdown (font typeface + size)
// ─────────────────────────────────────────────────────────────────────────────

function AppearanceMenu({ visible, onClose, colors, dropdownTop }) {
  const { fontScale, setFontScale, readingFontKey, setReadingFontKey } = useTheme();

  if (!visible) return null;

  return (
    <Modal
      transparent
      animationType="none"
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.menuOverlay} onPress={onClose} />
      <View
        style={[
          styles.menuCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            top: dropdownTop,
            left: 12,
            right: 12,
          },
        ]}
      >
        {/* Font size row */}
        <View style={styles.menuSection}>
          <Text style={[styles.menuLabel, { color: colors.mutedText }]}>Font size</Text>
          <View style={styles.sizeRow}>
            <TouchableOpacity
              style={[
                styles.sizeBtn,
                { borderColor: colors.border, backgroundColor: colors.background },
                fontScale <= FONT_SCALE_MIN && styles.sizeBtnDisabled,
              ]}
              onPress={() => setFontScale(fontScale - FONT_SCALE_STEP)}
              disabled={fontScale <= FONT_SCALE_MIN}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.sizeBtnText, { color: colors.text, fontSize: 14 }]}>A</Text>
            </TouchableOpacity>

            <Text style={[styles.sizeValue, { color: colors.mutedText }]}>
              {Math.round(fontScale * 100)}%
            </Text>

            <TouchableOpacity
              style={[
                styles.sizeBtn,
                { borderColor: colors.border, backgroundColor: colors.background },
                fontScale >= FONT_SCALE_MAX && styles.sizeBtnDisabled,
              ]}
              onPress={() => setFontScale(fontScale + FONT_SCALE_STEP)}
              disabled={fontScale >= FONT_SCALE_MAX}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.sizeBtnText, { color: colors.text, fontSize: 20 }]}>A</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />

        {/* Font typeface list */}
        <View style={styles.menuSection}>
          <Text style={[styles.menuLabel, { color: colors.mutedText }]}>Typeface</Text>
          {READING_FONT_OPTIONS.map((opt) => {
            const isActive = readingFontKey === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.fontRow,
                  isActive && { backgroundColor: colors.accent + "18" },
                ]}
                onPress={() => {
                  setReadingFontKey(opt.key);
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.fontRowName,
                    {
                      color: isActive ? colors.accent : colors.text,
                      fontFamily: readingFont(opt.key, "regular"),
                    },
                  ]}
                >
                  {opt.label}
                </Text>
                {isActive && (
                  <View style={[styles.fontRowDot, { backgroundColor: colors.accent }]} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: Version picker dropdown
// ─────────────────────────────────────────────────────────────────────────────

function VersionMenu({ visible, onClose, onSelect, activeVersion, colors, dropdownTop }) {
  if (!visible) return null;

  const available = BIBLE_VERSIONS.filter((v) => v.available);

  return (
    <Modal
      transparent
      animationType="none"
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.menuOverlay} onPress={onClose} />
      <View
        style={[
          styles.menuCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            top: dropdownTop,
            right: 12,
            // Don't stretch full width — hug the right side under the button.
            left: undefined,
            minWidth: 220,
          },
        ]}
      >
        <View style={styles.menuSection}>
          <Text style={[styles.menuLabel, { color: colors.mutedText }]}>Translation</Text>
          {available.map((v) => {
            const isActive = activeVersion === v.id;
            return (
              <TouchableOpacity
                key={v.id}
                style={[
                  styles.fontRow,
                  isActive && { backgroundColor: colors.accent + "18" },
                ]}
                onPress={() => onSelect(v.id)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.versionAbbr,
                      { color: isActive ? colors.accent : colors.text },
                    ]}
                  >
                    {v.abbr}
                  </Text>
                  <Text style={[styles.versionName, { color: colors.mutedText }]}>
                    {v.name}
                  </Text>
                </View>
                {isActive && (
                  <View style={[styles.fontRowDot, { backgroundColor: colors.accent }]} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export default function ReaderTopBar({ barAnim, barHeight, onHeightChange, activeVersion, onVersionChange }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // dropdownTop: position menus just below the bar. barHeight is measured after
  // first layout; fall back to 56 so it doesn't sit at y=0 on first render.
  const dropdownTop = (barHeight || 56) + 4;

  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);

  const handleSelectVersion = useCallback(
    async (id) => {
      setVersionOpen(false);
      await setReadingVersion(id);
      onVersionChange?.(id);
    },
    [onVersionChange]
  );

  return (
    <>
      <Animated.View
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 0) onHeightChange?.(h);
        }}
        style={[
          styles.bar,
          {
            backgroundColor: colors.background,
            paddingTop: insets.top,
            opacity: barAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
            transform: [
              {
                translateY: barAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -(barHeight || 60)],
                }),
              },
            ],
          },
        ]}
      >
        {/* Spacer pushes both controls to the right */}
        <View style={{ flex: 1 }} />

        {/* ··· Appearance button */}
        <TouchableOpacity
          style={styles.dotsBtn}
          onPress={() => {
            setVersionOpen(false);
            setAppearanceOpen((o) => !o);
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Reading appearance"
        >
          <Text style={[styles.dotsBtnText, { color: colors.text }]}>{"···"}</Text>
        </TouchableOpacity>

        {/* Version pill */}
        <TouchableOpacity
          style={[styles.versionPill, { borderColor: colors.accent, backgroundColor: colors.surface }]}
          onPress={() => {
            setAppearanceOpen(false);
            setVersionOpen((o) => !o);
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel={`Bible version: ${activeVersion?.toUpperCase()}, tap to change`}
        >
          <Text style={[styles.versionPillText, { color: colors.accent }]}>
            {activeVersion?.toUpperCase() ?? "NIV"}
          </Text>
        </TouchableOpacity>
      </Animated.View>

      <AppearanceMenu
        visible={appearanceOpen}
        onClose={() => setAppearanceOpen(false)}
        colors={colors}
        dropdownTop={dropdownTop}
      />

      <VersionMenu
        visible={versionOpen}
        onClose={() => setVersionOpen(false)}
        onSelect={handleSelectVersion}
        activeVersion={activeVersion}
        colors={colors}
        dropdownTop={dropdownTop}
      />
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingBottom: 8,
    zIndex: 10,
  },

  // ··· button
  dotsBtn: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  dotsBtnText: {
    fontSize: 22,
    fontFamily: uiFont(700),
    letterSpacing: 2,
    lineHeight: 26,
  },

  // Version pill
  versionPill: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  versionPillText: {
    fontSize: 13,
    fontFamily: uiFont(700),
    letterSpacing: 0.6,
  },

  // Dropdown card
  menuOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  menuCard: {
    position: "absolute",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  menuSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 0,
  },
  menuLabel: {
    fontSize: 11,
    fontFamily: uiFont(600),
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 10,
  },

  // Font size row
  sizeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sizeBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sizeBtnDisabled: {
    opacity: 0.35,
  },
  sizeBtnText: {
    fontFamily: uiFont(600),
    lineHeight: 24,
  },
  sizeValue: {
    flex: 1,
    textAlign: "center",
    fontSize: 13,
    fontFamily: uiFont(500),
  },

  // Font typeface rows
  fontRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginHorizontal: -10,
  },
  fontRowName: {
    flex: 1,
    fontSize: 17,
  },
  fontRowDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginLeft: 8,
  },

  // Version rows
  versionAbbr: {
    fontSize: 15,
    fontFamily: uiFont(700),
  },
  versionName: {
    fontSize: 12,
    fontFamily: uiFont(400),
    marginTop: 1,
  },
});
