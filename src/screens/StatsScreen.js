import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Platform,
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
  describeRange,
  formatDisplayDate,
  getGoalDate,
  setGoalDate,
  computeGoalPace,
} from "../data/statsSettingsStore";
import { useTheme } from "../theme/ThemeContext";

// Every row (i.e. every chapter's bar) is the same fixed height, so bars
// stay visually consistent throughout the whole chart - including
// 1-chapter books like Obadiah or Jude, whose single bar IS the whole book.
const ROW_HEIGHT = 16;
const BAR_HEIGHT = 11;
const SCREEN_PADDING = 20;
const LABEL_COL_WIDTH = 132; // generous enough for "1 Thessalonians" etc. without truncation
const MIN_LABEL_GAP = 14; // px - skip a book's label if too close to the previous shown one
const TOTAL_CHAPTERS = ALL_CHAPTERS.length; // 1,189

function getItemLayout(_, index) {
  return { length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index };
}

// Precomputed once: which books get a visible label (extremely short,
// back-to-back books could in theory still collide and are skipped - their
// zebra-striped band still marks the boundary even without text).
const LABELED_BOOK_IDS = (() => {
  const shown = new Set();
  let cumulative = 0;
  let lastShownY = -Infinity;
  for (const book of BOOKS) {
    if (cumulative - lastShownY >= MIN_LABEL_GAP) {
      shown.add(book.id);
      lastShownY = cumulative;
    }
    cumulative += book.chapterCount * ROW_HEIGHT;
  }
  return shown;
})();

export default function StatsScreen({ onOpenChapter, isActive = true }) {
  const { colors } = useTheme();
  const [progressByBook, setProgressByBook] = useState(null); // null = loading
  // { bookId, chapterNumber, bookName, count } | null - the bar whose info
  // popup is currently showing (revealed by tapping/clicking that bar).
  const [selected, setSelected] = useState(null);
  const [rangeSetting, setRangeSettingState] = useState(null); // null = loading
  const [rangeModalOpen, setRangeModalOpen] = useState(false);
  // goalDate is a "YYYY-MM-DD" string or null (no goal). We track load
  // completion separately because null is a valid loaded value.
  const [goalDate, setGoalDateState] = useState(null);
  const [goalLoaded, setGoalLoaded] = useState(false);
  const [goalModalOpen, setGoalModalOpen] = useState(false);

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

  // Persist and apply a new goal date (or null to clear it).
  const applyGoalDate = useCallback((next) => {
    setGoalDateState(next);
    setGoalDate(next);
  }, []);

  // Re-fetch progress whenever the Stats tab becomes active, so chapters read
  // elsewhere in the app show up without needing to restart.
  useEffect(() => {
    if (isActive) reload();
  }, [isActive, reload]);

  // Persist and apply a new date-range setting. Clear any open bar tooltip so
  // it can't keep showing a read count from the previous range.
  const applyRangeSetting = useCallback((next) => {
    setRangeSettingState(next);
    setRangeSetting(next);
    setSelected(null);
  }, []);

  // Count only the reads whose date falls inside the selected range. This is
  // what makes the range filter affect both the headline numbers and the bars.
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

  // Goal pace: how many chapters "should" have been read by today given the
  // goal date, vs how many actually have. Only meaningful for ranges that end
  // at today (This year / Since); returns applicable:false otherwise.
  const goalPace = useMemo(() => {
    if (!rangeSetting) return null;
    return computeGoalPace({
      setting: rangeSetting,
      goalDate,
      readChapterCount,
      totalChapters: TOTAL_CHAPTERS,
    });
  }, [rangeSetting, goalDate, readChapterCount]);

  const renderItem = useCallback(
    ({ item }) => {
      const count = countsByKey[`${item.bookId}:${item.chapterNumber}`] || 0;
      const barWidthPct = count > 0 ? Math.max(3, (count / maxCount) * 100) : 0;
      const bandColor = item.bookIndexParity === 0 ? colors.background : colors.surface;
      const showLabel = item.isFirstOfBook && LABELED_BOOK_IDS.has(item.bookId);
      const isSelected =
        selected &&
        selected.bookId === item.bookId &&
        selected.chapterNumber === item.chapterNumber;

      function handlePress() {
        // Pressing/clicking a bar only reveals the info popup - it never
        // navigates on its own. Navigation only happens via the popup's
        // explicit "Open" button.
        setSelected({
          bookId: item.bookId,
          chapterNumber: item.chapterNumber,
          bookName: item.bookName,
          count,
        });
      }

      return (
        <View
          style={[
            styles.row,
            { backgroundColor: bandColor },
            isSelected && { backgroundColor: colors.border },
          ]}
        >
          <View style={styles.labelCol}>
            {showLabel && (
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={[styles.bookLabel, { color: colors.text }]}
              >
                {item.bookName}
              </Text>
            )}
          </View>
          <TouchableOpacity style={styles.barArea} onPress={handlePress} activeOpacity={0.6}>
            {count > 0 && (
              <View
                style={[
                  styles.bar,
                  { width: `${barWidthPct}%`, backgroundColor: colors.accent },
                ]}
              />
            )}
          </TouchableOpacity>
        </View>
      );
    },
    [countsByKey, maxCount, colors, onOpenChapter, selected]
  );

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
        <Text style={[styles.summarySubtext, { color: colors.mutedText }]}>
          {readChapterCount === 0
            ? "No chapters read in this range yet"
            : `${totalReads.toLocaleString()} total read${totalReads === 1 ? "" : "s"} in this range`}
        </Text>

        {goalPace && goalPace.applicable ? (
          <View style={[styles.goalPaceRow, { borderColor: colors.border }]}>
            <Text style={[styles.goalPaceText, { color: colors.mutedText }]}>
              {goalPace.reached ? (
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
                  chapter{goalPace.perDay === 1 ? "" : "s"}/day to finish by then
                  {" · "}
                  {goalPace.remaining.toLocaleString()} left over {goalPace.daysLeft.toLocaleString()} day
                  {goalPace.daysLeft === 1 ? "" : "s"}
                </>
              )}
            </Text>
          </View>
        ) : null}

        {goalPace && !goalPace.applicable && goalPace.hasGoal ? (
          <Text style={[styles.goalNote, { color: colors.mutedText }]}>
            Goal set for {formatDisplayDate(goalPace.goalDate)}. Choose “This year” or
            “Since a date” to see your pace to today.
          </Text>
        ) : null}

        <TouchableOpacity
          style={[styles.rangeRow, { borderColor: colors.border, backgroundColor: colors.surface }]}
          onPress={() => setRangeModalOpen(true)}
          activeOpacity={0.7}
        >
          <View style={styles.rangeRowText}>
            <Text style={[styles.rangeLabel, { color: colors.mutedText }]}>Date Range</Text>
            <Text style={[styles.rangeValue, { color: colors.text }]} numberOfLines={1}>
              {describeRange(rangeSetting)}
            </Text>
          </View>
          <Text style={[styles.rangeChevron, { color: colors.accent }]}>Change ›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.rangeRow, { borderColor: colors.border, backgroundColor: colors.surface }]}
          onPress={() => setGoalModalOpen(true)}
          activeOpacity={0.7}
        >
          <View style={styles.rangeRowText}>
            <Text style={[styles.rangeLabel, { color: colors.mutedText }]}>Reading Goal</Text>
            <Text style={[styles.rangeValue, { color: colors.text }]} numberOfLines={1}>
              {goalDate ? `Finish by ${formatDisplayDate(goalDate)}` : "No goal set"}
            </Text>
          </View>
          <Text style={[styles.rangeChevron, { color: colors.accent }]}>
            {goalDate ? "Change ›" : "Set ›"}
          </Text>
        </TouchableOpacity>
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

      <FlatList
        data={ALL_CHAPTERS}
        keyExtractor={(item) => `${item.bookId}-${item.chapterNumber}`}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        initialNumToRender={120}
        maxToRenderPerBatch={200}
        windowSize={9}
        removeClippedSubviews
        style={{ flex: 1 }}
      />

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

// Lets the user pick (or clear) a single "finish the whole Bible by" date. The
// goal date is required to be in the future (a past date makes the whole target
// "due now"), so the picker's minimum is tomorrow.
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
  summarySubtext: { fontSize: 13, fontFamily: uiFont(400), marginTop: 8 },
  goalPaceRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  goalPaceText: { fontSize: 13, fontFamily: uiFont(400) },
  goalNote: {
    fontSize: 12,
    fontFamily: uiFont(400),
    marginTop: 8,
    lineHeight: 17,
  },
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
  row: {
    height: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: SCREEN_PADDING,
  },
  labelCol: {
    width: LABEL_COL_WIDTH,
  },
  bookLabel: {
    fontSize: 10,
    fontFamily: uiFont(700),
  },
  barArea: {
    flex: 1,
    marginRight: SCREEN_PADDING,
  },
  bar: {
    height: BAR_HEIGHT,
    borderRadius: 2,
  },
  rangeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rangeRowText: { flexShrink: 1, paddingRight: 12 },
  rangeLabel: {
    fontSize: 11,
    fontFamily: uiFont(700),
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  rangeValue: { fontSize: 14, fontFamily: uiFont(600) },
  rangeChevron: { fontSize: 13, fontFamily: uiFont(700) },
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
