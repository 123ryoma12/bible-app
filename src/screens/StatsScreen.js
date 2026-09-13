import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  TextInput,
} from "react-native";
import { uiFont } from "../theme/fonts";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { BOOKS } from "../data/books";
import { ALL_CHAPTERS } from "../data/chapterIndex";
import { getAllBooksProgress } from "../data/progressStore";
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
const BOX_SIZE = 36; // width & height of every heat-map cell
const BOX_GAP = 3;  // gap between cells

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

export default function StatsScreen({ onOpenChapter, isActive = true }) {
  const { colors, mode } = useTheme();
  const isDark = mode === "dark";
  const [progressByBook, setProgressByBook] = useState(null); // null = loading
  // { bookId, chapterNumber, bookName, count } | null
  const [selected, setSelected] = useState(null);
  const [rangeSetting, setRangeSettingState] = useState(null); // null = loading
  const [rangeModalOpen, setRangeModalOpen] = useState(false);
  const [goalDate, setGoalDateState] = useState(null);
  const [goalLoaded, setGoalLoaded] = useState(false);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [filterMax, setFilterMax] = useState(Infinity);
  const [filterModalOpen, setFilterModalOpen] = useState(false);

  const reload = useCallback(() => {
    getAllBooksProgress(BOOKS.map((b) => b.id)).then(setProgressByBook);
  }, []);

  useEffect(() => {
    reload();
    getRangeSetting().then(setRangeSettingState);
    getGoalDate().then((d) => {
      setGoalDateState(d);
      setGoalLoaded(true);
    });
  }, [reload]);

  const applyGoalDate = useCallback((next) => {
    setGoalDateState(next);
    setGoalDate(next);
  }, []);

  useEffect(() => {
    if (isActive) reload();
  }, [isActive, reload]);

  const applyRangeSetting = useCallback((next) => {
    setRangeSettingState(next);
    setRangeSetting(next);
    setSelected(null);
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

  const visibleChapters = useMemo(() => {
    if (filterMax === Infinity) return ALL_CHAPTERS;
    const out = [];
    const seenBook = new Set();
    for (const ch of ALL_CHAPTERS) {
      const count = countsByKey[`${ch.bookId}:${ch.chapterNumber}`] || 0;
      if (count < filterMax) {
        const isFirstOfBook = !seenBook.has(ch.bookId);
        seenBook.add(ch.bookId);
        out.push(isFirstOfBook ? { ...ch, isFirstOfBook: true } : { ...ch, isFirstOfBook: false });
      }
    }
    return out;
  }, [filterMax, countsByKey]);

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
      <Text style={[styles.title, { color: colors.text }]}>Stats</Text>

      <View style={styles.summary}>
        <View style={styles.summaryHeaderRow}>
          <Text style={[styles.summaryHeadline, { color: colors.text }]}>
            {readChapterCount.toLocaleString()} / {TOTAL_CHAPTERS.toLocaleString()} chapters
          </Text>
          <Text style={[styles.summaryPercent, { color: colors.accent }]}>{percent}%</Text>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: colors.surface }]}>
          <View
            style={[
              styles.progressFill,
              { backgroundColor: colors.accent, width: `${Math.max(percent, percent > 0 ? 2 : 0)}%` },
            ]}
          />
        </View>
        <View style={styles.summarySubtextRow}>
          <Text style={[styles.summarySubtext, { color: colors.mutedText }]}>
            {readChapterCount === 0
              ? `No chapters read ${rangePhrase(rangeSetting)} yet`
              : `${totalReads.toLocaleString()} read${totalReads === 1 ? "" : "s"} ${rangePhrase(rangeSetting)}`}
          </Text>
          <TouchableOpacity
            onPress={() => setRangeModalOpen(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.modifyRangeBtn, { color: colors.accent }]}>Modify range</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.goalPaceRow}>
          <Text style={[styles.goalPaceText, { color: colors.mutedText }]}>
            {goalPace && goalPace.applicable ? (
              goalPace.reached ? (
                <Text style={{ color: colors.accent, fontFamily: uiFont(700) }}>
                  Goal reached — whole Bible done! 🎉
                </Text>
              ) : goalPace.overdue ? (
                <>
                  Goal date passed —{" "}
                  <Text style={{ color: colors.text, fontFamily: uiFont(700) }}>
                    {goalPace.remaining.toLocaleString()}
                  </Text>{" "}
                  chapter{goalPace.remaining === 1 ? "" : "s"} still to go
                </>
              ) : (
                <>
                  Read{" "}
                  <Text style={{ color: colors.accent, fontFamily: uiFont(700) }}>
                    {goalPace.perDay.toLocaleString()}
                  </Text>{" "}
                  chapter{goalPace.perDay === 1 ? "" : "s"}/day to finish by{" "}
                  {formatDisplayDate(goalPace.goalDate)}
                  {" · "}
                  {goalPace.remaining.toLocaleString()} left over {goalPace.daysLeft.toLocaleString()} day
                  {goalPace.daysLeft === 1 ? "" : "s"}
                </>
              )
            ) : goalPace && goalPace.hasGoal ? (
              <>
                Goal set for {formatDisplayDate(goalPace.goalDate)} — choose "This year" or
                "Since a date" to see your pace
              </>
            ) : (
              "No reading goal set"
            )}
          </Text>
          <TouchableOpacity
            onPress={() => setGoalModalOpen(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.modifyRangeBtn, { color: colors.accent }]}>
              {goalDate ? "Modify goal" : "Set goal"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {selected ? (
        <View
          style={[
            styles.tooltip,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.tooltipText, { color: colors.surfaceText }]}>
            {selected.bookName} {selected.chapterNumber}
            {" · "}
            {selected.count > 0
              ? `${selected.count} read${selected.count === 1 ? "" : "s"}`
              : "not read yet"}
          </Text>
          <View style={styles.tooltipActions}>
            <TouchableOpacity
              onPress={() => onOpenChapter(selected.bookId, selected.chapterNumber)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.tooltipOpen, { color: colors.accent }]}>Open ›</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setSelected(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ marginLeft: 16 }}
            >
              <Text style={[styles.tooltipClose, { color: colors.mutedText }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* Read-count filter pills */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          onPress={() => setFilterMax(Infinity)}
          style={[
            styles.filterPill,
            { borderColor: colors.border },
            filterMax === Infinity && { backgroundColor: colors.accent, borderColor: colors.accent },
          ]}
        >
          <Text
            style={[
              styles.filterPillText,
              { color: filterMax === Infinity ? colors.accentContrast : colors.text },
            ]}
          >
            All
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setFilterMax(1)}
          style={[
            styles.filterPill,
            { borderColor: colors.border },
            filterMax === 1 && { backgroundColor: colors.accent, borderColor: colors.accent },
          ]}
        >
          <Text
            style={[
              styles.filterPillText,
              { color: filterMax === 1 ? colors.accentContrast : colors.text },
            ]}
          >
            Unread
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setFilterModalOpen(true)}
          style={[
            styles.filterPill,
            { borderColor: colors.border },
            filterMax !== Infinity && filterMax !== 1 && {
              backgroundColor: colors.accent,
              borderColor: colors.accent,
            },
          ]}
        >
          <Text
            style={[
              styles.filterPillText,
              {
                color:
                  filterMax !== Infinity && filterMax !== 1
                    ? colors.accentContrast
                    : colors.text,
              },
            ]}
          >
            {filterMax !== Infinity && filterMax !== 1 ? `< ${filterMax} reads` : "< N reads"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Heat-map grid — chapters flow freely as equal-size boxes.
          Books are grouped in tinted wrappers (alternating) so book
          boundaries are visible without breaking the wrap flow. */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.heatGrid}
      >
        {visibleChapters.length === 0 ? (
          <Text style={[styles.emptyFilter, { color: colors.mutedText }]}>
            No chapters match this filter.
          </Text>
        ) : (
          visibleChapters.map((item) => {
            const count = countsByKey[`${item.bookId}:${item.chapterNumber}`] || 0;
            const bg = heatColor(count, maxCount, isDark);
            const isSelected =
              selected &&
              selected.bookId === item.bookId &&
              selected.chapterNumber === item.chapterNumber;

            return (
              <TouchableOpacity
                key={`${item.bookId}-${item.chapterNumber}`}
                onPress={() =>
                  setSelected({ bookId: item.bookId, chapterNumber: item.chapterNumber, bookName: item.bookName, count })
                }
                activeOpacity={0.65}
                style={[
                  styles.heatBox,
                  bg
                    ? { backgroundColor: bg }
                    : { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
                  isSelected && { borderWidth: 2, borderColor: colors.text },
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
        )}
      </ScrollView>

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

      <FilterModal
        visible={filterModalOpen}
        currentMax={filterMax !== Infinity && filterMax !== 1 ? filterMax : null}
        onClose={() => setFilterModalOpen(false)}
        onApply={(n) => {
          setFilterMax(n);
          setFilterModalOpen(false);
        }}
        onClear={() => {
          setFilterMax(Infinity);
          setFilterModalOpen(false);
        }}
      />
    </SafeAreaView>
  );
}

// Lets the user pick (or clear) a single "finish the whole Bible by" date. The
// goal date is required to be in the future (a past date makes the whole target
// "due now"), so the picker's minimum is tomorrow.
function FilterModal({ visible, currentMax, onClose, onApply, onClear }) {
  const { colors } = useTheme();
  const [draftText, setDraftText] = useState("");

  // Re-sync draft whenever the modal opens.
  useEffect(() => {
    if (visible) {
      setDraftText(currentMax != null ? String(currentMax) : "");
    }
  }, [visible, currentMax]);

  const draftN = draftText === "" ? null : parseInt(draftText, 10);
  // Valid when it's a whole number >= 2 (< 1 is meaningless; Unread covers that).
  const canApply = draftN != null && Number.isFinite(draftN) && draftN >= 2;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={[styles.modalCard, { backgroundColor: colors.surface }]} onPress={() => {}}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>Filter by Reads</Text>
          <Text style={[styles.filterModalHint, { color: colors.mutedText }]}>
            Show only chapters read fewer than N times. Enter a number (2 or more).
          </Text>

          <View style={styles.fieldRow}>
            <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>Fewer than</Text>
            <View
              style={[
                styles.fieldBtn,
                styles.filterModalInputRow,
                { borderColor: colors.border, backgroundColor: colors.background },
              ]}
            >
              <TextInput
                value={draftText}
                onChangeText={(t) => setDraftText(t.replace(/[^0-9]/g, ""))}
                keyboardType="number-pad"
                placeholder="e.g. 3"
                placeholderTextColor={colors.mutedText}
                autoFocus
                style={[styles.filterModalInput, { color: colors.text }]}
              />
              <Text style={[styles.filterModalUnit, { color: colors.mutedText }]}>reads</Text>
            </View>
          </View>

          <View style={styles.modalActions}>
            {currentMax != null && (
              <TouchableOpacity
                onPress={onClear}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={[styles.modalActionBtn, { marginRight: "auto" }]}
              >
                <Text style={[styles.modalCancel, { color: colors.accent }]}>Clear</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.modalActionBtn}
            >
              <Text style={[styles.modalCancel, { color: colors.mutedText }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => canApply && onApply(draftN)}
              disabled={!canApply}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={[styles.modalActionBtn, styles.modalApplyBtn]}
            >
              <Text style={[styles.modalApply, { color: canApply ? colors.accent : colors.mutedText }]}>
                Apply
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
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
  title: {
    fontSize: 28,
    fontFamily: uiFont(700),
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  summary: { paddingHorizontal: 20, marginBottom: 14 },
  summaryHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 8,
  },
  summaryHeadline: { fontSize: 16, fontFamily: uiFont(600) },
  summaryPercent: { fontSize: 16, fontFamily: uiFont(700) },
  progressTrack: {
    width: "100%",
    height: 10,
    borderRadius: 5,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 5,
  },
  summarySubtextRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  summarySubtext: { fontSize: 13, fontFamily: uiFont(400), flexShrink: 1 },
  modifyRangeBtn: { fontSize: 13, fontFamily: uiFont(700), marginLeft: 12 },
  goalPaceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  goalPaceText: { fontSize: 13, fontFamily: uiFont(400), flexShrink: 1, lineHeight: 18 },
  goalModalHint: {
    fontSize: 13,
    fontFamily: uiFont(400),
    lineHeight: 19,
    marginBottom: 12,
  },
  tooltip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 20,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tooltipText: { fontSize: 13, fontFamily: uiFont(600), flexShrink: 1 },
  tooltipActions: { flexDirection: "row", alignItems: "center" },
  tooltipOpen: { fontSize: 13, fontFamily: uiFont(700) },
  tooltipClose: { fontSize: 13, fontFamily: uiFont(400) },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SCREEN_PADDING,
    paddingBottom: 10,
    gap: 8,
  },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  filterPillText: {
    fontSize: 12,
    fontFamily: uiFont(600),
  },
  filterModalHint: {
    fontSize: 13,
    fontFamily: uiFont(400),
    lineHeight: 19,
    marginBottom: 12,
  },
  filterModalInputRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  filterModalInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: uiFont(400),
    padding: 0,
  },
  filterModalUnit: {
    fontSize: 15,
    fontFamily: uiFont(400),
    marginLeft: 6,
  },
  emptyFilter: {
    textAlign: "center",
    marginTop: 24,
    fontSize: 13,
    fontFamily: uiFont(),
  },
  heatGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: SCREEN_PADDING - BOX_GAP / 2,
    paddingTop: BOX_GAP,
    paddingBottom: 24,
    gap: BOX_GAP,
  },
  heatBox: {
    width: BOX_SIZE,
    height: BOX_SIZE,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
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
