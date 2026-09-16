// Top chrome bar for the reader. Mirrors the footer's show/hide animation but
// slides down from the top. Contains three controls:
//
//   🎧   – Listen: sermons for the book / chapter currently open
//   Aa   – Appearance menu: font typeface picker + font-size stepper
//   ↺    – History: recently read chapters (same list as the picker's History)
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
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { uiFont, readingFont, READING_FONT_OPTIONS } from "../theme/fonts";
import { BIBLE_VERSIONS } from "../data/bibleVersions";
import {
  useTheme,
  FONT_SCALE_MIN,
  FONT_SCALE_MAX,
  FONT_SCALE_STEP,
} from "../theme/ThemeContext";
import { setReadingVersion } from "../data/bibleVersionStore";
import { AppSettingsButton } from "./AppSettingsModal";

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: Appearance dropdown (font typeface + size)
// ─────────────────────────────────────────────────────────────────────────────

function AppearanceMenu({ visible, onClose, dropdownTop }) {
  const { colors, mode, setMode, fontScale, setFontScale, readingFontKey, setReadingFontKey } = useTheme();

  if (!visible) return null;

  return (
    <Modal
      transparent
      animationType="none"
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableOpacity style={styles.fullScreen} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}} style={[styles.menuCard, { backgroundColor: colors.surface, borderColor: colors.border, top: dropdownTop, left: 12, right: 12 }]}>

        {/* Theme toggle */}
        <View style={styles.menuSection}>
          <Text style={[styles.menuLabel, { color: colors.mutedText }]}>Theme</Text>
          <View style={[styles.themeToggle, { borderColor: colors.border }]}>
            {[{ key: "light", label: "Light" }, { key: "dark", label: "Dark" }].map((opt) => {
              const isActive = mode === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.themeOption,
                    { backgroundColor: isActive ? colors.accent : "transparent" },
                  ]}
                  onPress={() => setMode(opt.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={opt.label + " mode"}
                >
                  <Text style={[styles.themeOptionText, { color: isActive ? colors.accentContrast : colors.text }]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />

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
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: Version picker dropdown
// ─────────────────────────────────────────────────────────────────────────────

function VersionMenu({ visible, onClose, onSelect, activeVersion, dropdownTop }) {
  const { colors } = useTheme();
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
      <TouchableOpacity style={styles.fullScreen} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}} style={[styles.menuCard, { backgroundColor: colors.surface, borderColor: colors.border, top: dropdownTop, right: 12, left: undefined, minWidth: 220 }]}>
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
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export default function ReaderTopBar({
  barAnim,
  barHeight,
  onHeightChange,
  activeVersion,
  onVersionChange,
  onOpenSermons,
  onOpenHistory,
  notesOpen,
  onToggleNotes,
  // Inline verse note icons toggle
  verseNotesActive,
  onToggleVerseNotes,
  // Book intro tab: TOC button replaces the notes button
  tocOpen,
  onToggleToc,
}) {
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

  const handleOpenSermons = useCallback(() => {
    setAppearanceOpen(false);
    setVersionOpen(false);
    onOpenSermons?.();
  }, [onOpenSermons]);

  const handleOpenHistory = useCallback(() => {
    setAppearanceOpen(false);
    setVersionOpen(false);
    onOpenHistory?.();
  }, [onOpenHistory]);

  const handleToggleAppearance = useCallback(() => {
    setVersionOpen(false);
    setAppearanceOpen((o) => !o);
  }, []);

  const handleToggleVersion = useCallback(() => {
    setAppearanceOpen(false);
    setVersionOpen((o) => !o);
  }, []);

  const handleToggleNotesCb = useCallback(() => {
    setAppearanceOpen(false);
    setVersionOpen(false);
    onToggleNotes?.();
  }, [onToggleNotes]);

  const handleToggleVerseNotesCb = useCallback(() => {
    setAppearanceOpen(false);
    setVersionOpen(false);
    onToggleVerseNotes?.();
  }, [onToggleVerseNotes]);

  const handleCloseAppearance = useCallback(() => setAppearanceOpen(false), []);
  const handleCloseVersion = useCallback(() => setVersionOpen(false), []);

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
        {/* Spacer pushes the controls to the right */}
        <View style={{ flex: 1 }} />

        {/* TOC button — shown on book intro tabs instead of study notes. */}
        {onToggleToc ? (
          <TouchableOpacity
            style={styles.notesBtn}
            onPress={onToggleToc}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={tocOpen ? "Close table of contents" : "Open table of contents"}
            accessibilityState={{ expanded: tocOpen }}
          >
            <MaterialCommunityIcons
              name="format-list-bulleted"
              size={22}
              color={tocOpen ? colors.accent : colors.text}
            />
          </TouchableOpacity>
        ) : (
          <>
            {/* Inline verse note icons toggle */}
            {onToggleVerseNotes ? (
              <TouchableOpacity
                style={styles.notesBtn}
                onPress={handleToggleVerseNotesCb}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel={verseNotesActive ? "Hide verse note icons" : "Show verse note icons"}
                accessibilityState={{ checked: verseNotesActive }}
              >
                <MaterialCommunityIcons
                  name="information-outline"
                  size={22}
                  color={verseNotesActive ? colors.accent : colors.text}
                />
              </TouchableOpacity>
            ) : null}

            {/* Study notes toggle — opens/closes the full notes modal. */}
            {onToggleNotes ? (
              <TouchableOpacity
                style={styles.notesBtn}
                onPress={handleToggleNotesCb}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel={notesOpen ? "Close study notes" : "Open study notes"}
                accessibilityState={{ expanded: notesOpen }}
              >
                <MaterialCommunityIcons
                  name="book-open-page-variant"
                  size={22}
                  color={notesOpen ? colors.accent : colors.text}
                />
              </TouchableOpacity>
            ) : null}
          </>
        )}

        {/* Listen button */}
        <TouchableOpacity
          style={styles.listenBtn}
          onPress={handleOpenSermons}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Listen to sermons"
          accessibilityHint="Opens sermons for this book"
        >
          <MaterialCommunityIcons name="headphones" size={24} color={colors.text} />
        </TouchableOpacity>

        {/* App settings */}
        <View style={styles.settingsBtn}>
          <AppSettingsButton color={colors.text} />
        </View>

        {/* Aa Appearance button */}
        <TouchableOpacity
          style={styles.appearanceBtn}
          onPress={handleToggleAppearance}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Text size and font"
          accessibilityHint="Opens reading appearance options"
          accessibilityState={{ expanded: appearanceOpen }}
        >
          <MaterialCommunityIcons name="format-size" size={24} color={colors.text} />
        </TouchableOpacity>

        {/* History button */}
        {onOpenHistory && (
          <TouchableOpacity
            style={styles.historyBtn}
            onPress={handleOpenHistory}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Reading history"
            accessibilityHint="Opens the chapters you have recently read"
          >
            <MaterialCommunityIcons name="history" size={24} color={colors.text} />
          </TouchableOpacity>
        )}

        {/* Version pill */}
        <TouchableOpacity
          style={[styles.versionPill, { borderColor: colors.accent, backgroundColor: colors.surface }]}
          onPress={handleToggleVersion}
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
        onClose={handleCloseAppearance}
        dropdownTop={dropdownTop}
      />

      <VersionMenu
        visible={versionOpen}
        onClose={handleCloseVersion}
        onSelect={handleSelectVersion}
        activeVersion={activeVersion}
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

  // Settings button — pinned to the left edge of the bar
  settingsLeft: {
    position: "absolute",
    left: 14,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  settingsBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginRight: 6,
    justifyContent: "center",
    alignItems: "center",
  },

  // Study notes toggle button
  notesBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginRight: 6,
    justifyContent: "center",
    alignItems: "center",
  },

  // Listen (sermons) button
  listenBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginRight: 6,
    justifyContent: "center",
    alignItems: "center",
  },

  // Aa (appearance) button
  appearanceBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginRight: 6,
    justifyContent: "center",
    alignItems: "center",
  },

  // History button
  historyBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginRight: 8,
    justifyContent: "center",
    alignItems: "center",
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
  fullScreen: {
    flex: 1,
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

  // Theme toggle
  themeToggle: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 10,
    padding: 3,
  },
  themeOption: {
    flex: 1,
    height: 36,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  themeOptionText: {
    fontSize: 13,
    fontFamily: uiFont(600),
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
