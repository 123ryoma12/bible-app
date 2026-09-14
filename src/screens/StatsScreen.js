import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
} from "react-native";
import { uiFont } from "../theme/fonts";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { BOOKS } from "../data/books";
import { ALL_CHAPTERS } from "../data/chapterIndex";
import { getAllBooksProgress, subscribeProgress } from "../data/progressStore";
import {
  RANGE_MODES,
  getRangeSetting,
  setRangeSetting,
  resolveBounds,
  makeDateInRange,
  formatDisplayDate,
  getGoalDate,
  setGoalDate,
  computeGoalPace,
} from "../data/statsSettingsStore";
import { useTheme } from "../theme/ThemeContext";

const SCREEN_PADDING = 20;
const TOTAL_CHAPTERS = ALL_CHAPTERS.length; // 1,189
const BOX_GAP = 3; // gap between cells (applied as marginRight + marginBottom)

function computeBoxMetrics(containerWidth) {
  // containerWidth is the actual measured ScrollView width.
  // The grid has paddingHorizontal: SCREEN_PADDING on each side, so the
  // available width for boxes is containerWidth - 2 * SCREEN_PADDING.
  const available = containerWidth - 2 * SCREEN_PADDING;
  const numCols = Math.floor((available + BOX_GAP) / (36 + BOX_GAP));
  // Exact box size: n boxes + (n-1) gaps = available
  const boxSize = (available - BOX_GAP * (numCols - 1)) / numCols;
  return { boxSize, numCols };
}

// Returns a CSS hex colour for a chapter cell given its read count and the
// overall maximum count seen. Unread → muted surface; 1 read → yellow/amber;
// higher counts shift through orange toward red.
// isDark lets us pick slightly different base tints for legibility.
// Fixed 10-step scale: 1 read = step 1 (yellow), 10+ reads = step 10 (deep red).
// Pre-computed so every step is a distinct, visually separable colour.
const HEAT_STEPS = 10;
const HEAT_COLORS_LIGHT = Array.from({ length: HEAT_STEPS }, (_, i) => {
  const t = i / (HEAT_STEPS - 1); // 0..1
  const hue = Math.round(54 - 54 * t); // 54° yellow → 0° red
  const lit = Math.round(62 - 20 * t); // 62% → 42%
  return `hsl(${hue}, 82%, ${lit}%)`;
});
const HEAT_COLORS_DARK = Array.from({ length: HEAT_STEPS }, (_, i) => {
  const t = i / (HEAT_STEPS - 1);
  const hue = Math.round(54 - 54 * t);
  const lit = Math.round(55 - 18 * t); // 55% → 37%
  return `hsl(${hue}, 75%, ${lit}%)`;
});

function heatColor(count, _maxCount, isDark) {
  if (count <= 0) return null; // unread — caller uses surface/border style
  const step = Math.min(count, HEAT_STEPS) - 1; // clamp to 0-indexed 0..9
  return isDark ? HEAT_COLORS_DARK[step] : HEAT_COLORS_LIGHT[step];
}

// Turns the range setting into a natural inline phrase for the summary line,
// e.g. "this year", "all time", "since Jan 5, 2026", "from Jan 1 to Feb 2".
function rangePhrase(setting) {
  if (!setting) return "this year";
  switch (setting.mode) {
    case RANGE_MODES.ALL:
      return "all time";
    case RANGE_MODES.SINCE:
      return setting.since ? `since ${formatDisplayDate(setting.since)}` : "since a date";
    case RANGE_MODES.BETWEEN:
      return setting.start && setting.end
        ? `from ${formatDisplayDate(setting.start)} to ${formatDisplayDate(setting.end)}`
        : "in range";
    case RANGE_MODES.YEAR:
    default:
      return "this year";
  }
}

export default function StatsScreen({ onOpenChapter, initialChapter, currentChapter, onBack, onOpenHistory }) {
  const { colors, mode } = useTheme();
  const isDark = mode === "dark";
  const [progressByBook, setProgressByBook] = useState(null); // null = loading
  const [rangeSetting, setRangeSettingState] = useState(null); // null = loading
  const [rangeModalOpen, setRangeModalOpen] = useState(false);
  const [goalDate, setGoalDateState] = useState(null);
  const [goalLoaded, setGoalLoaded] = useState(false);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  // Start at 0 — we don't render boxes until the ScrollView has measured its
  // own width via onLayout, so we never use the wrong window width (which on
  // native may differ from the actual available width due to safe-area insets).
  const [gridWidth, setGridWidth] = useState(0);
  const { boxSize, numCols } = computeBoxMetrics(gridWidth);

  // Ref to the heat-map ScrollView for imperative scrolling.
  const scrollViewRef = useRef(null);
  // Per-chapter y-offsets, populated as cells lay out.
  const chapterOffsets = useRef({});

  // When we have an initialChapter target, hide the grid until that cell has
  // laid out and the scroll has been applied — prevents a flicker of the grid
  // being visible at the top before jumping to the right position.
  const [gridReady, setGridReady] = useState(!initialChapter);

  // Load progress once on mount (hits storage first time, then cache is warm).
  // Also subscribe so any chapter being marked read in the reader instantly
  // updates the heat-map without a full reload.
  useEffect(() => {
    getAllBooksProgress(BOOKS.map((b) => b.id)).then(setProgressByBook);
    getRangeSetting().then(setRangeSettingState);
    getGoalDate().then((d) => {
      setGoalDateState(d);
      setGoalLoaded(true);
    });
    const unsub = subscribeProgress(setProgressByBook);
    return unsub;
  }, []);

  const applyGoalDate = useCallback((next) => {
    setGoalDateState(next);
    setGoalDate(next);
  }, []);

  const applyRangeSetting = useCallback((next) => {
    setRangeSettingState(next);
    setRangeSetting(next);
  }, []);

  const countsByKey = useMemo(() => {
    const map = {};
    if (!progressByBook || !rangeSetting) return map;
    const inRange = makeDateInRange(resolveBounds(rangeSetting));
    for (const book of BOOKS) {
      const chapters = progressByBook[book.id] || {};
      for (const [chNum, rec] of Object.entries(chapters)) {
        const dates = (rec && rec.dates) || [];
        const count = dates.reduce((n, d) => (inRange(d) ? n + 1 : n), 0);
        if (count > 0) map[`${book.id}:${chNum}`] = count;
      }
    }
    return map;
  }, [progressByBook, rangeSetting]);

  const maxCount = useMemo(() => Math.max(1, ...Object.values(countsByKey)), [countsByKey]);


  const readChapterCount = useMemo(
    () => Object.values(countsByKey).filter((c) => c > 0).length,
    [countsByKey]
  );

  const totalReads = useMemo(
    () => Object.values(countsByKey).reduce((sum, c) => sum + c, 0),
    [countsByKey]
  );

  const percent = Math.round((readChapterCount / TOTAL_CHAPTERS) * 100);

  const goalPace = useMemo(() => {
    if (!rangeSetting) return null;
    return computeGoalPace({
      setting: rangeSetting,
      goalDate,
      readChapterCount,
      totalChapters: TOTAL_CHAPTERS,
    });
  }, [rangeSetting, goalDate, readChapterCount]);

  if (progressByBook === null || rangeSetting === null || !goalLoaded) {
    return (
      <SafeAreaView
        style={[styles.safe, { backgroundColor: colors.background }]}
        edges={["top", "left", "right"]}
      >
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      {/* Nav bar: back (left) · Bible (center) · History (right) */}
      <View style={styles.navBar}>
        {onBack ? (
          <TouchableOpacity
            onPress={onBack}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.navSide}
          >
            <Text style={[styles.navBack, { color: colors.accent }]}>‹ Back</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.navSide} />
        )}
        <Text style={[styles.navTitle, { color: colors.text }]}>Bible</Text>
        <TouchableOpacity
          onPress={onOpenHistory}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={[styles.navSide, styles.navSideRight]}
        >
          <Text style={[styles.navHistory, { color: colors.accent }]}>History</Text>
        </TouchableOpacity>
      </View>

      {/* Compact stats row: progress bar + percent + range + goal icons */}
      <View style={styles.statsRow}>
        <View style={[styles.progressTrack, { backgroundColor: colors.surface }]}>
          <View
            style={[
              styles.progressFill,
              { backgroundColor: colors.accent, width: `${Math.max(percent, percent > 0 ? 2 : 0)}%` },
            ]}
          />
        </View>
        <Text style={[styles.statsPercent, { color: colors.accent }]}>{percent}%</Text>
        <TouchableOpacity
          onPress={() => setRangeModalOpen(true)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.statsIcon}
        >
          <MaterialCommunityIcons name="calendar-range" size={20} color={colors.mutedText} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setGoalModalOpen(true)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.statsIcon}
        >
          <MaterialCommunityIcons
            name="flag-outline"
            size={20}
            color={goalDate ? colors.accent : colors.mutedText}
          />
        </TouchableOpacity>
      </View>

      {/* Heat-map grid */}
      <View style={{ flex: 1 }}>
        <ScrollView
          ref={scrollViewRef}
          style={{ flex: 1, opacity: gridReady ? 1 : 0 }}
          contentContainerStyle={styles.heatGrid}
          onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}
        >
        {gridWidth > 0 && ALL_CHAPTERS.map((item, idx) => {
            const count = countsByKey[`${item.bookId}:${item.chapterNumber}`] || 0;
            const bg = heatColor(count, maxCount, isDark);
            const isCurrent =
              currentChapter &&
              currentChapter.bookId === item.bookId &&
              currentChapter.chapterNumber === item.chapterNumber;
            const isLastInRow = (idx + 1) % numCols === 0;

            return (
              <TouchableOpacity
                key={`${item.bookId}-${item.chapterNumber}`}
                onPress={() => onOpenChapter(item.bookId, item.chapterNumber)}
                onLayout={(e) => {
                  const key = `${item.bookId}:${item.chapterNumber}`;
                  const { y } = e.nativeEvent.layout;
                  chapterOffsets.current[key] = y;
                  // If this is the target cell, scroll to it then reveal the grid.
                  if (
                    !gridReady &&
                    initialChapter &&
                    initialChapter.bookId === item.bookId &&
                    initialChapter.chapterNumber === item.chapterNumber
                  ) {
                    scrollViewRef.current?.scrollTo({ y, animated: false });
                    setGridReady(true);
                  }
                }}
                activeOpacity={0.65}
                style={[
                  styles.heatBox,
                  { width: boxSize, height: boxSize, marginRight: isLastInRow ? 0 : BOX_GAP },
                  bg
                    ? { backgroundColor: bg }
                    : { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
                  isCurrent && { borderWidth: 2, borderColor: colors.accent },
                ]}
              >
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                  style={[
                    item.isFirstOfBook ? styles.heatLabelBook : styles.heatLabel,
                    {
                      color: bg
                        ? "#1a1206"
                        : item.isFirstOfBook
                          ? colors.text
                          : colors.mutedText,
                    },
                  ]}
                >
                  {item.isFirstOfBook ? item.bookId : item.chapterNumber}
                </Text>
              </TouchableOpacity>
            );
          })
        }
        </ScrollView>
      </View>

      <DateRangeModal
        visible={rangeModalOpen}
        setting={rangeSetting}
        onClose={() => setRangeModalOpen(false)}
        onApply={(next) => {
          applyRangeSetting(next);
          setRangeModalOpen(false);
        }}
      />

      <GoalModal
        visible={goalModalOpen}
        goalDate={goalDate}
        onClose={() => setGoalModalOpen(false)}
        onApply={(next) => {
          applyGoalDate(next);
          setGoalModalOpen(false);
        }}
      />

    </SafeAreaView>
  );
}

function GoalModal({ visible, goalDate, onClose, onApply }) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState(goalDate);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (visible) {
      setDraft(goalDate);
      setPicking(false);
    }
  }, [visible, goalDate]);

  const minimumDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(12, 0, 0, 0);
    return d;
  }, [visible]);

  const onPickerChange = (event, selectedDate) => {
    if (Platform.OS !== "ios") setPicking(false);
    if (event?.type === "dismissed" || !selectedDate) return;
    setDraft(toDateString(selectedDate));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>Reading Goal</Text>
          <Text style={[styles.goalModalHint, { color: colors.mutedText }]}>
            Pick the date you want to have read the whole Bible ({TOTAL_CHAPTERS.toLocaleString()}{" "}
            chapters) by. Stats will show how many chapters you should have reached by today.
          </Text>

          <View style={styles.fieldRow}>
            <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>Finish by</Text>
            <TouchableOpacity
              style={[
                styles.fieldBtn,
                { borderColor: colors.border, backgroundColor: colors.background },
              ]}
              onPress={() => setPicking(true)}
            >
              <Text style={[styles.fieldValue, { color: draft ? colors.text : colors.mutedText }]}>
                {draft ? formatDisplayDate(draft) : "Select date"}
              </Text>
            </TouchableOpacity>
            {picking && (
              <DateTimePicker
                mode="date"
                value={parseDate(draft, minimumDate)}
                onChange={onPickerChange}
                minimumDate={minimumDate}
                display={Platform.OS === "ios" ? "inline" : "default"}
              />
            )}
          </View>

          <View style={styles.modalActions}>
            {goalDate ? (
              <TouchableOpacity
                onPress={() => onApply(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={[styles.modalActionBtn, { marginRight: "auto" }]}
              >
                <Text style={[styles.modalCancel, { color: colors.accent }]}>Clear goal</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.modalActionBtn}
            >
              <Text style={[styles.modalCancel, { color: colors.mutedText }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => draft && onApply(draft)}
              disabled={!draft}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={[styles.modalActionBtn, styles.modalApplyBtn]}
            >
              <Text
                style={[styles.modalApply, { color: draft ? colors.accent : colors.mutedText }]}
              >
                Save
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Parses a "YYYY-MM-DD" string into a local Date (noon, to avoid TZ edge
// cases), or returns a fallback Date when the string is missing/invalid.
function parseDate(dateStr, fallback = new Date()) {
  if (!dateStr) return fallback;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return fallback;
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function toDateString(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const MODE_OPTIONS = [
  { key: RANGE_MODES.YEAR, label: "This year (since Jan 1)" },
  { key: RANGE_MODES.SINCE, label: "Since a date" },
  { key: RANGE_MODES.BETWEEN, label: "Between two dates" },
  { key: RANGE_MODES.ALL, label: "All time" },
];

// The picker is date-only (mode="date"), so time is never shown or stored -
// every selection is immediately reduced to a "YYYY-MM-DD" string. We only
// need a stable "no future dates" ceiling, so cap at the end of today.
function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function DateRangeModal({ visible, setting, onClose, onApply }) {
  const { colors } = useTheme();
  // Local draft so edits only persist when the user taps Apply.
  const [draft, setDraft] = useState(setting);
  const maximumDate = useMemo(() => endOfToday(), [visible]);
  // Which native picker is open (Android shows it as a transient dialog):
  // null | "since" | "start" | "end".
  const [picking, setPicking] = useState(null);

  // Re-sync the draft whenever the modal is (re)opened with a setting.
  useEffect(() => {
    if (visible) {
      setDraft(setting);
      setPicking(null);
    }
  }, [visible, setting]);

  if (!draft) return null;

  const setMode = (mode) => setDraft((d) => ({ ...d, mode }));

  const onPickerChange = (field) => (event, selectedDate) => {
    // On Android the dialog closes itself; reflect that. On iOS the inline
    // picker stays until the user taps Done.
    if (Platform.OS !== "ios") setPicking(null);
    if (event?.type === "dismissed" || !selectedDate) return;
    setDraft((d) => ({ ...d, [field]: toDateString(selectedDate) }));
  };

  const DateField = ({ label, field, value }) => (
    <View style={styles.fieldRow}>
      <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>{label}</Text>
      <TouchableOpacity
        style={[styles.fieldBtn, { borderColor: colors.border, backgroundColor: colors.background }]}
        onPress={() => setPicking(field)}
      >
        <Text style={[styles.fieldValue, { color: value ? colors.text : colors.mutedText }]}>
          {value ? formatDisplayDate(value) : "Select date"}
        </Text>
      </TouchableOpacity>
      {picking === field && (
        <DateTimePicker
          mode="date"
          value={parseDate(value)}
          onChange={onPickerChange(field)}
          maximumDate={maximumDate}
          display={Platform.OS === "ios" ? "inline" : "default"}
        />
      )}
    </View>
  );

  const canApply =
    draft.mode === RANGE_MODES.YEAR ||
    draft.mode === RANGE_MODES.ALL ||
    (draft.mode === RANGE_MODES.SINCE && !!draft.since) ||
    (draft.mode === RANGE_MODES.BETWEEN &&
      !!draft.start &&
      !!draft.end &&
      draft.start <= draft.end);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>Date Range</Text>

          {MODE_OPTIONS.map((opt) => {
            const active = draft.mode === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={styles.modeRow}
                onPress={() => setMode(opt.key)}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.radioOuter,
                    { borderColor: active ? colors.accent : colors.border },
                  ]}
                >
                  {active && <View style={[styles.radioInner, { backgroundColor: colors.accent }]} />}
                </View>
                <Text style={[styles.modeLabel, { color: colors.text }]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}

          {draft.mode === RANGE_MODES.SINCE && (
            <DateField label="From" field="since" value={draft.since} />
          )}
          {draft.mode === RANGE_MODES.BETWEEN && (
            <>
              <DateField label="Start" field="start" value={draft.start} />
              <DateField label="End" field="end" value={draft.end} />
              {draft.start && draft.end && draft.start > draft.end && (
                <Text style={[styles.errorText, { color: colors.accent }]}>
                  Start date must be on or before end date.
                </Text>
              )}
            </>
          )}

          <View style={styles.modalActions}>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.modalActionBtn}
            >
              <Text style={[styles.modalCancel, { color: colors.mutedText }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => canApply && onApply(draft)}
              disabled={!canApply}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={[styles.modalActionBtn, styles.modalApplyBtn]}
            >
              <Text
                style={[
                  styles.modalApply,
                  { color: canApply ? colors.accent : colors.mutedText },
                ]}
              >
                Apply
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
  },
  navSide: {
    minWidth: 70,
  },
  navSideRight: {
    alignItems: "flex-end",
  },
  navBack: {
    fontSize: 16,
    fontFamily: uiFont(500),
  },
  navTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontFamily: uiFont(700),
  },
  navHistory: {
    fontSize: 16,
    fontFamily: uiFont(500),
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  statsPercent: {
    fontSize: 13,
    fontFamily: uiFont(600),
    minWidth: 36,
    textAlign: "right",
  },
  statsIcon: {
    padding: 2,
  },
  goalModalHint: {
    fontSize: 13,
    fontFamily: uiFont(400),
    lineHeight: 19,
    marginBottom: 12,
  },
  heatGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: BOX_GAP,
    paddingBottom: 24,
  },
  heatBox: {
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: BOX_GAP,
  },
  heatLabel: {
    fontSize: 9,
    fontFamily: uiFont(700),
    textAlign: "center",
    letterSpacing: 0,
  },
  heatLabelBook: {
    fontSize: 10,
    fontFamily: uiFont(700),
    textAlign: "center",
    letterSpacing: 0.3,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  modalCard: {
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontFamily: uiFont(700), marginBottom: 12 },
  modeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  modeLabel: { fontSize: 15, fontFamily: uiFont(400), marginLeft: 12 },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioInner: { width: 10, height: 10, borderRadius: 5 },
  fieldRow: { marginTop: 8 },
  fieldLabel: {
    fontSize: 11,
    fontFamily: uiFont(700),
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  fieldBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  fieldValue: { fontSize: 15, fontFamily: uiFont(400) },
  errorText: { fontSize: 12, fontFamily: uiFont(400), marginTop: 8 },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginTop: 20,
  },
  modalActionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  modalApplyBtn: { marginLeft: 8 },
  modalCancel: { fontSize: 15, fontFamily: uiFont(400) },
  modalApply: { fontSize: 15, fontFamily: uiFont(700) },
});
