import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  useTheme,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  FONT_SCALE_STEP,
} from "../theme/ThemeContext";
import { uiFont, readingFont, READING_FONT_OPTIONS } from "../theme/fonts";
import { exportBackup, importBackup } from "../data/backupStore";
import {
  PREF_FIELDS,
  PRESET_ORDER,
  PRESET_LABELS,
  PRESET_DESCRIPTIONS,
  getMemoryPrefs,
  setMemoryPrefs,
  applyPreset,
  resetMemoryPrefs,
  presetForPrefs,
} from "../data/memoryPrefsStore";
import { resortMemory } from "../data/memoryStore";
import { BIBLE_VERSIONS } from "../data/bibleVersions";
import {
  getReadingVersion,
  setReadingVersion,
} from "../data/bibleVersionStore";

const APPEARANCE_OPTIONS = [
  { key: "light", label: "Light Mode" },
  { key: "dark", label: "Dark Mode" },
];

// Base size the preview line uses; scaled by the selected fontScale so the user
// can see the effect of their choice immediately.
const PREVIEW_BASE_SIZE = 17;

// A section heading. Every section except the first is preceded by a full-width
// divider line with consistent spacing above/below, so groups are separated
// identically regardless of what element (row, card, etc.) came before. The
// divider is its OWN element (not a border on the text) so it can't collide
// with a preceding view's margins.
function SectionHeader({ title, colors, first = false }) {
  return (
    <>
      {!first && (
        <View style={[styles.sectionDivider, { borderTopColor: colors.border }]} />
      )}
      <Text style={[styles.sectionLabel, { color: colors.text }]}>{title}</Text>
    </>
  );
}

export default function SettingsScreen() {
  const {
    mode,
    setMode,
    colors,
    fontScale,
    setFontScale,
    readingFontKey,
    setReadingFontKey,
  } = useTheme();
  // "idle" | "backing-up" | "restoring" - drives the row spinners and disables
  // both actions while one is running.
  const [busy, setBusy] = useState("idle");
  const [showFontOptions, setShowFontOptions] = useState(false);
  const [showVersionOptions, setShowVersionOptions] = useState(false);

  // --- Reading version ---
  // Which translation the reader shows. Only NIV is available today; ESV/KJV
  // appear as disabled "coming soon" rows. Changing this does NOT affect stats.
  const [readingVersion, setReadingVersionState] = useState(null);

  // --- Memory prioritisation ---
  // Local mirror of the persisted prefs so the UI updates instantly; every edit
  // is written through to storage and the Memory list is re-sorted.
  const [prefs, setPrefs] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMemoryPrefs().then((p) => {
      if (!cancelled) setPrefs(p);
    });
    getReadingVersion().then((v) => {
      if (!cancelled) setReadingVersionState(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSelectVersion(id) {
    const next = await setReadingVersion(id);
    setReadingVersionState(next);
  }

  // The preset the current prefs correspond to ("custom" if hand-tuned).
  const activePreset = prefs ? presetForPrefs(prefs) : "balanced";
  const activeFont =
    READING_FONT_OPTIONS.find((option) => option.key === readingFontKey) || READING_FONT_OPTIONS[0];
  const activeVersion = BIBLE_VERSIONS.find((version) => version.id === readingVersion);

  // Persist + re-sort after any prefs change, refreshing the local mirror.
  async function commitPrefs(next) {
    setPrefs(next); // optimistic
    await resortMemory();
  }

  function handleFontSizeStep(direction) {
    setFontScale(fontScale + direction * FONT_SCALE_STEP);
  }

  async function handlePreset(presetKey) {
    const next = await applyPreset(presetKey);
    await commitPrefs(next);
  }

  // Nudge a single advanced field by +/- one step, clamped to its bounds. The
  // field metadata handles the display<->stored unit conversion (percentages).
  async function handleStep(field, direction) {
    if (!prefs) return;
    const current = field.fromStored
      ? field.fromStored(prefs[field.key])
      : prefs[field.key];
    const raw = current + direction * field.step;
    const clamped = Math.min(field.max, Math.max(field.min, raw));
    if (clamped === current) return; // already at the bound
    const storedValue = field.toStored ? field.toStored(clamped) : clamped;
    const next = await setMemoryPrefs({ [field.key]: storedValue });
    await commitPrefs(next);
  }

  function handleResetPrefs() {
    Alert.alert(
      "Reset prioritisation?",
      "Restore the default Memory prioritisation settings. Your verses and stats are not affected.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            const next = await resetMemoryPrefs();
            await commitPrefs(next);
          },
        },
      ]
    );
  }

  // Write a backup file and hand it to the OS share sheet.
  async function handleBackup() {
    if (busy !== "idle") return;
    setBusy("backing-up");
    try {
      const res = await exportBackup();
      // shareAsync resolves once the sheet is dismissed; a light confirmation
      // is enough since the user has already seen the system UI.
      Alert.alert(
        "Backup ready",
        `Saved ${res.keyCount} item${res.keyCount === 1 ? "" : "s"} of data. ` +
          "Keep the file somewhere safe to restore it later.",
        [{ text: "OK" }]
      );
    } catch (e) {
      Alert.alert("Backup failed", e.message || "Something went wrong.", [{ text: "OK" }]);
    } finally {
      setBusy("idle");
    }
  }

  // Restore is destructive (replace all), so confirm first, then pick + apply.
  function handleRestore() {
    if (busy !== "idle") return;
    Alert.alert(
      "Restore from backup?",
      "This replaces ALL current data on this device - reading progress, history, " +
        "memory verses and settings - with the contents of the backup file. This " +
        "can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Choose file", style: "destructive", onPress: runRestore },
      ]
    );
  }

  async function runRestore() {
    setBusy("restoring");
    try {
      const res = await importBackup();
      if (res.canceled) return; // user backed out of the picker
      Alert.alert(
        "Restore complete",
        `Restored ${res.keyCount} item${res.keyCount === 1 ? "" : "s"}. ` +
          "Please close and reopen the app to see all restored data and settings.",
        [{ text: "OK" }]
      );
    } catch (e) {
      Alert.alert("Restore failed", e.message || "Something went wrong.", [{ text: "OK" }]);
    } finally {
      setBusy("idle");
    }
  }

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <Text style={[styles.title, { color: colors.text }]}>Settings</Text>

        {/* Appearance */}
        <SectionHeader title="Appearance" colors={colors} first />
        <View style={[styles.appearanceToggle, { borderColor: colors.border }]}>
          {APPEARANCE_OPTIONS.map((opt) => {
            const isActive = mode === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.appearanceOption,
                  { backgroundColor: isActive ? colors.accent : "transparent" },
                ]}
                onPress={() => setMode(opt.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={opt.label}
              >
                <Text style={[styles.appearanceOptionText, { color: isActive ? colors.accentContrast : colors.text }]}>
                  {opt.key === "light" ? "Light" : "Dark"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Reading / font size */}
        <SectionHeader title="Reading" colors={colors} />
        <Text style={[styles.settingName, { color: colors.text }]}>Font Size</Text>

        <View style={styles.fontSizeStepper}>
          <TouchableOpacity
            style={[
              styles.fontSizeButton,
              { borderColor: colors.border, opacity: fontScale <= FONT_SCALE_MIN ? 0.4 : 1 },
            ]}
            onPress={() => handleFontSizeStep(-1)}
            disabled={fontScale <= FONT_SCALE_MIN}
            accessibilityRole="button"
            accessibilityLabel="Decrease reading font size"
          >
            <Text style={[styles.fontSizeButtonText, { color: colors.text }]}>−</Text>
          </TouchableOpacity>

          <View style={styles.fontSizeValue}>
            <Text style={[styles.fontSizePoints, { color: colors.text }]}>
              {Math.round(PREVIEW_BASE_SIZE * fontScale)} pt
            </Text>
            <Text style={[styles.fontSizePercent, { color: colors.mutedText }]}>
              {Math.round(fontScale * 100)}%
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.fontSizeButton,
              { borderColor: colors.border, opacity: fontScale >= FONT_SCALE_MAX ? 0.4 : 1 },
            ]}
            onPress={() => handleFontSizeStep(1)}
            disabled={fontScale >= FONT_SCALE_MAX}
            accessibilityRole="button"
            accessibilityLabel="Increase reading font size"
          >
            <Text style={[styles.fontSizeButtonText, { color: colors.text }]}>+</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.fontHelp, { color: colors.mutedText }]}>Adjusts in 5% steps.</Text>

        <TouchableOpacity
          style={[styles.row, { borderBottomColor: colors.border, marginTop: 12 }]}
          onPress={() => setShowFontOptions((value) => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showFontOptions }}
          accessibilityLabel={`Reading font, ${activeFont.label}`}
        >
          <View style={styles.actionRowText}>
            <Text style={[styles.rowText, { color: colors.text }]}>Reading Font</Text>
            <Text style={[styles.actionSubtext, { color: colors.mutedText }]}>
              {activeFont.label} · {activeFont.description}
            </Text>
          </View>
          <Text style={[styles.chevron, { color: colors.mutedText }]}>{showFontOptions ? "⌃" : "›"}</Text>
        </TouchableOpacity>

        {showFontOptions && READING_FONT_OPTIONS.map((option) => {
          const isActive = readingFontKey === option.key;
          return (
            <TouchableOpacity
              key={option.key}
              style={[styles.row, { borderBottomColor: colors.border }]}
              onPress={() => {
                setReadingFontKey(option.key);
                setShowFontOptions(false);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${option.label}. ${option.description}`}
            >
              <View style={styles.actionRowText}>
                <Text
                  style={[
                    styles.fontOptionName,
                    { color: colors.text, fontFamily: readingFont(option.key, "regular") },
                  ]}
                >
                  {option.label}
                </Text>
                <Text style={[styles.actionSubtext, { color: colors.mutedText }]}>
                  {option.description}
                </Text>
              </View>
              <View
                style={[
                  styles.radioOuter,
                  { borderColor: isActive ? colors.accent : colors.border },
                ]}
              >
                {isActive && <View style={[styles.radioInner, { backgroundColor: colors.accent }]} />}
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Live preview so the choice is obvious before opening a chapter. */}
        <View style={[styles.previewCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.previewLabel, { color: colors.mutedText }]}>Preview</Text>
          <Text
            style={{
              color: colors.surfaceText,
              fontFamily: readingFont(readingFontKey, "regular"),
              fontSize: PREVIEW_BASE_SIZE * fontScale,
              lineHeight: PREVIEW_BASE_SIZE * fontScale * 1.55,
            }}
          >
            <Text
              style={{
                color: colors.accent,
                fontFamily: readingFont(readingFontKey, "semiBold"),
                fontSize: 11 * fontScale,
              }}
            >
              {"1 "}
            </Text>
            In the beginning God created the heavens and the earth.
          </Text>
        </View>

        {/* Bible version: which translation the reader shows. Only available
            versions are selectable; others are shown as disabled "coming soon".
            This choice does not affect reading stats. */}
        <TouchableOpacity
          style={[styles.row, { borderBottomColor: colors.border, marginTop: 12 }]}
          onPress={() => setShowVersionOptions((value) => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showVersionOptions }}
          accessibilityLabel={`Bible version, ${activeVersion?.name || "loading"}`}
        >
          <View style={styles.actionRowText}>
            <Text style={[styles.rowText, { color: colors.text }]}>Bible Version</Text>
            <Text style={[styles.actionSubtext, { color: colors.mutedText }]}>
              {activeVersion ? `${activeVersion.abbr} · ${activeVersion.name}` : "Loading…"}
            </Text>
          </View>
          <Text style={[styles.chevron, { color: colors.mutedText }]}>{showVersionOptions ? "⌃" : "›"}</Text>
        </TouchableOpacity>
        {showVersionOptions && BIBLE_VERSIONS.map((v) => {
          const isActive = readingVersion === v.id;
          const disabled = !v.available;
          return (
            <TouchableOpacity
              key={v.id}
              style={[styles.row, { borderBottomColor: colors.border }]}
              onPress={async () => {
                await handleSelectVersion(v.id);
                setShowVersionOptions(false);
              }}
              disabled={disabled || readingVersion == null}
              accessibilityRole="radio"
              accessibilityState={{ selected: isActive, disabled }}
              accessibilityLabel={`${v.name}${disabled ? ", coming soon" : ""}`}
            >
              <View style={styles.actionRowText}>
                <Text
                  style={[
                    styles.rowText,
                    { color: disabled ? colors.mutedText : colors.text },
                  ]}
                >
                  {v.abbr} — {v.name}
                </Text>
                {disabled && (
                  <Text style={[styles.actionSubtext, { color: colors.mutedText }]}>
                    Coming soon (TBD)
                  </Text>
                )}
              </View>
              {disabled ? (
                <Text style={[styles.tbdBadge, { color: colors.mutedText }]}>TBD</Text>
              ) : (
                <View
                  style={[
                    styles.radioOuter,
                    { borderColor: isActive ? colors.accent : colors.border },
                  ]}
                >
                  {isActive && (
                    <View
                      style={[styles.radioInner, { backgroundColor: colors.accent }]}
                    />
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {/* Memory prioritisation: controls how the Memory tab ranks verses for
            practice. Presets up front; an expandable Advanced block exposes the
            individual knobs. Every change persists and re-sorts the list. */}
        <SectionHeader title="Memory Prioritisation" colors={colors} />
        <Text style={[styles.dataNote, { color: colors.mutedText, paddingTop: 0 }]}>
          Choose how the Memory tab decides which verses to practise first.
        </Text>

        {/* Presets as full-width rows: each shows its name AND a one-line
            description so the choice is self-explanatory. A radio marks the
            active one. When the prefs are hand-tuned, a read-only "Custom" row
            appears at the end so the state is never ambiguous. */}
        {PRESET_ORDER.map((key) => {
          const isActive = activePreset === key;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.row, { borderBottomColor: colors.border }]}
              onPress={() => handlePreset(key)}
              disabled={!prefs}
              accessibilityRole="radio"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${PRESET_LABELS[key]}. ${PRESET_DESCRIPTIONS[key]}`}
            >
              <View style={styles.actionRowText}>
                <Text style={[styles.rowText, { color: colors.text }]}>
                  {PRESET_LABELS[key]}
                </Text>
                <Text style={[styles.actionSubtext, { color: colors.mutedText }]}>
                  {PRESET_DESCRIPTIONS[key]}
                </Text>
              </View>
              <View
                style={[
                  styles.radioOuter,
                  { borderColor: isActive ? colors.accent : colors.border },
                ]}
              >
                {isActive && (
                  <View style={[styles.radioInner, { backgroundColor: colors.accent }]} />
                )}
              </View>
            </TouchableOpacity>
          );
        })}

        {activePreset === "custom" && (
          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <View style={styles.actionRowText}>
              <Text style={[styles.rowText, { color: colors.text }]}>
                {PRESET_LABELS.custom}
              </Text>
              <Text style={[styles.actionSubtext, { color: colors.mutedText }]}>
                {PRESET_DESCRIPTIONS.custom}
              </Text>
            </View>
            <View style={[styles.radioOuter, { borderColor: colors.accent }]}>
              <View style={[styles.radioInner, { backgroundColor: colors.accent }]} />
            </View>
          </View>
        )}

        {/* Advanced: expandable so the raw knobs don't overwhelm by default. */}
        <TouchableOpacity
          style={[styles.row, { borderBottomColor: colors.border, marginTop: 8 }]}
          onPress={() => setShowAdvanced((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showAdvanced }}
        >
          <Text style={[styles.rowText, { color: colors.text }]}>Advanced</Text>
          <Text style={[styles.chevron, { color: colors.mutedText }]}>
            {showAdvanced ? "\u2304" : "\u203A"}
          </Text>
        </TouchableOpacity>

        {showAdvanced &&
          prefs &&
          PREF_FIELDS.map((field) => {
            const display = field.fromStored
              ? field.fromStored(prefs[field.key])
              : prefs[field.key];
            const atMin = display <= field.min;
            const atMax = display >= field.max;
            return (
              <View
                key={field.key}
                style={[styles.prefRow, { borderBottomColor: colors.border }]}
              >
                <View style={styles.prefText}>
                  <Text style={[styles.rowText, { color: colors.text }]}>
                    {field.label}
                  </Text>
                  <Text style={[styles.actionSubtext, { color: colors.mutedText }]}>
                    {field.help}
                  </Text>
                </View>
                <View style={styles.stepper}>
                  <TouchableOpacity
                    style={[
                      styles.stepBtn,
                      { borderColor: colors.border, opacity: atMin ? 0.35 : 1 },
                    ]}
                    onPress={() => handleStep(field, -1)}
                    disabled={atMin}
                    accessibilityRole="button"
                    accessibilityLabel={`Decrease ${field.label}`}
                  >
                    <Text style={[styles.stepBtnText, { color: colors.text }]}>
                      {"\u2212"}
                    </Text>
                  </TouchableOpacity>
                  <Text
                    style={[styles.stepValue, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {field.format(display)}
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.stepBtn,
                      { borderColor: colors.border, opacity: atMax ? 0.35 : 1 },
                    ]}
                    onPress={() => handleStep(field, 1)}
                    disabled={atMax}
                    accessibilityRole="button"
                    accessibilityLabel={`Increase ${field.label}`}
                  >
                    <Text style={[styles.stepBtnText, { color: colors.text }]}>
                      {"+"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

        {showAdvanced && (
          <TouchableOpacity
            style={[styles.row, { borderBottomColor: colors.border }]}
            onPress={handleResetPrefs}
            accessibilityRole="button"
            accessibilityLabel="Reset prioritisation to defaults"
          >
            <Text style={[styles.rowText, { color: colors.danger || "#c0392b" }]}>
              Reset to Defaults
            </Text>
            <Text style={[styles.chevron, { color: colors.mutedText }]}>{"\u21BA"}</Text>
          </TouchableOpacity>
        )}

        {/* Data: local backup & restore. All app data lives on this device;
            these let the user save a JSON backup file and restore it later or
            on another device. */}
        <SectionHeader title="Data" colors={colors} />

        <TouchableOpacity
          style={[styles.row, { borderBottomColor: colors.border }]}
          onPress={handleBackup}
          disabled={busy !== "idle"}
          accessibilityRole="button"
          accessibilityLabel="Back up data"
        >
          <View style={styles.actionRowText}>
            <Text style={[styles.rowText, { color: colors.text }]}>Back Up Data</Text>
            <Text style={[styles.actionSubtext, { color: colors.mutedText }]}>
              Save all your data to a file you can keep or share
            </Text>
          </View>
          {busy === "backing-up" ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Text style={[styles.chevron, { color: colors.mutedText }]}>›</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.row, { borderBottomColor: colors.border }]}
          onPress={handleRestore}
          disabled={busy !== "idle"}
          accessibilityRole="button"
          accessibilityLabel="Restore data from backup"
        >
          <View style={styles.actionRowText}>
            <Text style={[styles.rowText, { color: colors.text }]}>Restore Data</Text>
            <Text style={[styles.actionSubtext, { color: colors.mutedText }]}>
              Replace all current data with a backup file
            </Text>
          </View>
          {busy === "restoring" ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Text style={[styles.chevron, { color: colors.mutedText }]}>›</Text>
          )}
        </TouchableOpacity>

        <Text style={[styles.dataNote, { color: colors.mutedText }]}>
          Your data is stored only on this device. Back it up regularly so you don't
          lose your progress if you change or reset your phone.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  title: {
    fontSize: 28,
    fontFamily: uiFont(700),
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  // Full-width divider between sections. Its own element (with symmetric top
  // margin) so spacing is identical no matter what precedes it - a row, a card,
  // etc. - and it never collides with a preceding view's margin.
  // Use a borderTop hairline (the reliable pattern used by every row separator
  // in this app) rather than a height+backgroundColor line, which can round
  // down to 0 physical pixels and vanish on some screen densities. Full-bleed:
  // edge-to-edge with no side margins for a stronger section break.
  sectionDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 24,
  },
  sectionLabel: {
    fontSize: 15,
    fontFamily: uiFont(700),
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  appearanceToggle: {
    flexDirection: "row",
    marginHorizontal: 20,
    borderWidth: 1,
    borderRadius: 12,
    padding: 3,
  },
  appearanceOption: {
    flex: 1,
    minHeight: 42,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  appearanceOptionText: {
    fontSize: 14,
    fontFamily: uiFont(600),
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { fontSize: 17, fontFamily: uiFont(400) },
  actionRowText: { flex: 1, paddingRight: 12 },
  actionSubtext: { fontSize: 13, fontFamily: uiFont(400), marginTop: 2 },
  chevron: { fontSize: 22, fontFamily: uiFont(400) },
  dataNote: {
    fontSize: 12,
    fontFamily: uiFont(400),
    lineHeight: 17,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioInner: { width: 12, height: 12, borderRadius: 6 },
  settingName: {
    fontSize: 17,
    fontFamily: uiFont(400),
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 4,
  },
  fontHelp: {
    fontSize: 13,
    fontFamily: uiFont(400),
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  fontOptionName: { fontSize: 19 },
  fontSizeStepper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    paddingHorizontal: 20,
    paddingTop: 6,
  },
  fontSizeButton: {
    width: 48,
    height: 48,
    borderWidth: 1.5,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  fontSizeButtonText: { fontSize: 28, fontFamily: uiFont(500), lineHeight: 32 },
  fontSizeValue: {
    minWidth: 88,
    alignItems: "center",
  },
  fontSizePoints: { fontSize: 18, fontFamily: uiFont(600) },
  fontSizePercent: { fontSize: 13, fontFamily: uiFont(400), marginTop: 1 },
  previewCard: {
    marginHorizontal: 20,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
  },
  previewLabel: {
    fontSize: 11,
    fontFamily: uiFont(700),
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  prefRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tbdBadge: {
    fontSize: 12,
    fontFamily: uiFont(700),
    letterSpacing: 0.5,
  },
  prefText: { flex: 1, paddingRight: 12 },
  stepper: { flexDirection: "row", alignItems: "center" },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnText: { fontSize: 20, fontFamily: uiFont(600), lineHeight: 22 },
  stepValue: {
    minWidth: 74,
    textAlign: "center",
    fontSize: 14,
    fontFamily: uiFont(600),
    paddingHorizontal: 6,
  },
});
