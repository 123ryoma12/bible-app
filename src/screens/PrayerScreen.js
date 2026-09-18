import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  SectionList,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { AppSettingsButton } from "../components/AppSettingsModal";
import ChoiceModal from "../components/ChoiceModal";
import { useTheme } from "../theme/ThemeContext";
import { uiFont } from "../theme/fonts";
import { useScreenBackHandler } from "../navigation/BackHandlerRegistry";
import { usePrayerSession } from "../data/prayerSession";
import {
  getActivePrayers,
  getArchivedPrayers,
  getDailySeconds,
  getDailyHistory,
  getPrayerSettings,
  setPrayerSettings,
  recordPrayerSession,
  formatPrayerTime,
  removePrayer,
  archivePrayer,
  unarchivePrayer,
  isDue,
  availabilityLabel,
  waitingLabel,
  lastPrayedLabel,
  repetitionLabel,
  frequencyLabel,
  frequencyShortLabel,
  formatDate,
} from "../data/prayerStore";
import PrayerAdd from "./prayer/PrayerAdd";
import PrayerTimer from "./prayer/PrayerTimer";
import PrayerChart from "./prayer/PrayerChart";

const HISTORY_DAYS = 14;

// Prayer tab: a single ordered list of prayer points split into "Ready to pray"
// (cooldown elapsed, tappable) and "Resting" (still cooling down). Praying for
// something runs a countdown; only a countdown seen through to 0:00 and
// confirmed logs minutes toward the daily goal. Points with a finite repetition
// retire to the Archived tab once their count is met. Persistence lives in
// prayerStore.js; the running timer lives in prayerSession.js so it survives
// switching tabs.
export default function PrayerScreen() {
  const { colors } = useTheme();
  const session = usePrayerSession();

  const [tab, setTab] = useState("active"); // "active" | "archived"
  const [view, setView] = useState("list"); // "list" | "add"
  const [editing, setEditing] = useState(null);

  const [active, setActive] = useState([]);
  const [archived, setArchived] = useState([]);
  const [todaySeconds, setTodaySeconds] = useState(0);
  const [history, setHistory] = useState([]);
  const [goalSeconds, setGoalSeconds] = useState(0);
  const [loading, setLoading] = useState(true);

  const [showGoal, setShowGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState("");
  // Row action sheet: { mode: "active" | "archived" | "confirmDelete", point }.
  const [sheet, setSheet] = useState(null);
  // Name of a point that just auto-archived on completing its final prayer.
  const [archivedNotice, setArchivedNotice] = useState(null);

  const refresh = useCallback(async () => {
    const [activeList, archivedList, secs, days, settings] = await Promise.all([
      getActivePrayers(),
      getArchivedPrayers(),
      getDailySeconds(),
      getDailyHistory(HISTORY_DAYS),
      getPrayerSettings(),
    ]);
    setActive(activeList);
    setArchived(archivedList);
    setTodaySeconds(secs);
    setHistory(days);
    setGoalSeconds(settings.dailyGoalSeconds);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Cooldowns expire on a clock, not on user input, so a point can become due
  // while the list is just sitting there. Re-render every 30s to move it across
  // without the user needing to leave and come back.
  const [, setClockTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setClockTick((n) => n + 1), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  // Split the already-ordered list into due and resting. The store sorts by
  // "became available at" ascending, so whichever came off cooldown first sits
  // top of Ready, and the soonest to free up sits top of Resting.
  const sections = useMemo(() => {
    const now = Date.now();
    const ready = [];
    const resting = [];
    active.forEach((point) => {
      if (isDue(point, now)) ready.push(point);
      else resting.push(point);
    });

    const out = [];
    if (ready.length) out.push({ key: "ready", title: "Ready to pray", data: ready });
    if (resting.length) out.push({ key: "resting", title: "Resting", data: resting });
    return out;
  }, [active]);

  // Android back inside the Prayer tab: unwind our own sub-views before the
  // app-level handler switches tabs.
  useScreenBackHandler(() => {
    if (view === "add") {
      setView("list");
      setEditing(null);
      return true;
    }
    if (session.isActive) {
      session.cancel();
      return true;
    }
    if (tab === "archived") {
      setTab("active");
      return true;
    }
    return false;
  }, [view, tab, session]);

  async function handleConfirmSession() {
    const point = session.point;
    const ms = session.readElapsed();
    session.cancel();
    if (point && ms > 0) {
      const seconds = Math.max(1, Math.round(ms / 1000));
      const result = await recordPrayerSession(point.id, seconds);
      // Reaching the repetition target retires the point, which would otherwise
      // just silently vanish from the list.
      if (result?.archived) setArchivedNotice(result.point.name);
    }
    refresh();
  }

  // Long-pressing a row opens an action sheet; picking Delete swaps it for a
  // confirmation. Both are driven by `sheet`, so only one is ever on screen.
  const sheetActions = !sheet
    ? []
    : sheet.mode === "confirmDelete"
      ? [
          {
            label: "Delete",
            style: "destructive",
            onPress: async () => {
              await removePrayer(sheet.point.id);
              refresh();
            },
          },
          { label: "Cancel", style: "cancel" },
        ]
      : sheet.mode === "archived"
        ? [
            {
              label: "Restore",
              onPress: async () => {
                await unarchivePrayer(sheet.point.id);
                refresh();
              },
            },
            {
              label: "Delete",
              style: "destructive",
              onPress: () => setSheet({ mode: "confirmDelete", point: sheet.point }),
            },
            { label: "Cancel", style: "cancel" },
          ]
        : [
            {
              label: "Edit",
              onPress: () => { setEditing(sheet.point); setView("add"); },
            },
            {
              label: "Archive",
              onPress: async () => {
                await archivePrayer(sheet.point.id);
                refresh();
              },
            },
            {
              label: "Delete",
              style: "destructive",
              onPress: () => setSheet({ mode: "confirmDelete", point: sheet.point }),
            },
            { label: "Cancel", style: "cancel" },
          ];

  async function saveGoal() {
    // User enters minutes; we store seconds.
    const parsedMinutes = Number.parseInt(goalDraft, 10);
    if (Number.isFinite(parsedMinutes) && parsedMinutes > 0) {
      await setPrayerSettings({ dailyGoalSeconds: parsedMinutes * 60 });
    }
    setShowGoal(false);
    refresh();
  }

  // --- Sub-views ------------------------------------------------------------

  if (view === "add") {
    return (
      <PrayerAdd
        entry={editing}
        onCancel={() => { setView("list"); setEditing(null); }}
        onDone={() => { setView("list"); setEditing(null); refresh(); }}
      />
    );
  }

  // A live session owns the whole tab — the mini bar only exists on other tabs.
  if (session.isActive) {
    return (
      <PrayerTimer
        onConfirm={handleConfirmSession}
        onEdit={(point) => { session.cancel(); setEditing(point); setView("add"); }}
      />
    );
  }

  // --- List -----------------------------------------------------------------

  const goalPct = goalSeconds > 0 ? Math.min(1, todaySeconds / goalSeconds) : 0;

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.text }]}>Prayer</Text>
        <View style={styles.headerActions}>
          <AppSettingsButton />
          <TouchableOpacity
            onPress={() => { setGoalDraft(String(Math.round(goalSeconds / 60))); setShowGoal(true); }}
            hitSlop={hit}
            accessibilityLabel="Daily prayer goal"
          >
            {/* Same flag affordance the Bible tab uses for its reading goal,
                tinted once a goal is actually set. */}
            <MaterialCommunityIcons
              name="flag-outline"
              size={22}
              color={goalSeconds > 0 ? colors.accent : colors.mutedText}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setEditing(null); setView("add"); }}
            hitSlop={hit}
            accessibilityLabel="Add prayer point"
          >
            <Ionicons name="add-circle-outline" size={26} color={colors.accent} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Daily goal progress — driven purely by confirmed session minutes. */}
      <View style={styles.goalBlock}>
        <View style={styles.goalRow}>
          <Text style={[styles.goalValue, { color: colors.text }]}>
            {formatPrayerTime(todaySeconds)}
            <Text style={[styles.goalTarget, { color: colors.secondaryText }]}>
              {` / ${Math.round(goalSeconds / 60)} min today`}
            </Text>
          </Text>
          {goalSeconds > 0 && todaySeconds >= goalSeconds && (
            <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
          )}
        </View>
        <View style={[styles.goalTrack, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.goalFill,
              { width: `${goalPct * 100}%`, backgroundColor: colors.accent },
            ]}
          />
        </View>
      </View>

      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        {[
          { key: "active", label: "Active", count: active.length },
          { key: "archived", label: "Archived", count: archived.length },
        ].map((t) => {
          const selected = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[
                styles.tab,
                selected && { borderBottomColor: colors.accent, borderBottomWidth: 2 },
              ]}
              onPress={() => setTab(t.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <Text
                style={[
                  styles.tabText,
                  {
                    color: selected ? colors.accent : colors.secondaryText,
                    fontFamily: selected ? uiFont(700) : uiFont(500),
                  },
                ]}
              >
                {t.label}
                {t.count > 0 ? ` (${t.count})` : ""}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {tab === "active" ? (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={
            active.length > 0 ? (
              <PrayerChart history={history} goalSeconds={goalSeconds} />
            ) : null
          }
          renderSectionHeader={({ section }) => (
            <SectionHeader title={section.title} count={section.data.length} colors={colors} />
          )}
          renderItem={({ item, section }) => (
            <PrayerRow
              point={item}
              ready={section.key === "ready"}
              colors={colors}
              onPress={() => session.openSession(item)}
              onLongPress={() => setSheet({ mode: "active", point: item })}
            />
          )}
          ListEmptyComponent={
            loading ? null : (
              <EmptyState
                heading="No prayer points yet"
                sub="Add the people and things you want to bring before God, and they'll appear here when they're ready to pray for."
                colors={colors}
              />
            )
          }
        />
      ) : (
        <FlatList
          data={archived}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ArchivedRow
              point={item}
              colors={colors}
              onLongPress={() => setSheet({ mode: "archived", point: item })}
            />
          )}
          ListEmptyComponent={
            loading ? null : (
              <EmptyState
                heading="Nothing archived yet"
                sub="Prayer points move here once you've prayed for them as many times as you planned."
                colors={colors}
              />
            )
          }
        />
      )}

      {/* Daily goal modal */}
      <Modal
        visible={showGoal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGoal(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowGoal(false)}
        >
          <TouchableOpacity
            style={[styles.modalCard, { backgroundColor: colors.surface }]}
            activeOpacity={1}
            onPress={() => {}}
          >
            <Text style={[styles.modalTitle, { color: colors.surfaceText }]}>Daily prayer goal</Text>
            <Text style={[styles.modalNote, { color: colors.secondaryText }]}>
              How many minutes you'd like to pray each day. Only completed prayer
              sessions count toward it.
            </Text>
            <View style={styles.modalInputRow}>
              <TextInput
                value={goalDraft}
                onChangeText={(text) => setGoalDraft(text.replace(/[^0-9]/g, ""))}
                keyboardType="number-pad"
                style={[
                  styles.modalInput,
                  { color: colors.text, backgroundColor: colors.background },
                ]}
                accessibilityLabel="Daily goal in minutes"
              />
              <Text style={[styles.modalSuffix, { color: colors.secondaryText }]}>minutes</Text>
            </View>
            <TouchableOpacity
              style={[styles.modalSave, { borderTopColor: colors.border }]}
              onPress={saveGoal}
            >
              <Text style={[styles.modalSaveText, { color: colors.accent }]}>Save</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <ChoiceModal
        visible={sheet != null}
        onDismiss={() => setSheet(null)}
        title={sheet?.mode === "confirmDelete" ? "Delete prayer point" : sheet?.point?.name || ""}
        message={
          sheet?.mode === "confirmDelete"
            ? `Permanently delete "${sheet.point.name}"? This also removes every minute logged against it from your daily totals. This cannot be undone.`
            : undefined
        }
        actions={sheetActions}
      />

      <ChoiceModal
        visible={archivedNotice != null}
        onDismiss={() => setArchivedNotice(null)}
        title="Prayer complete"
        message={`"${archivedNotice}" has been prayed for every time you planned, so it has moved to your archive.`}
        actions={[{ label: "OK", style: "cancel" }]}
      />
    </SafeAreaView>
  );
}

function SectionHeader({ title, count, colors }) {
  return (
    <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
      <Text style={[styles.sectionHeaderText, { color: colors.secondaryText }]}>
        {title} ({count})
      </Text>
    </View>
  );
}

// Only the name is shown in the list — notes live on the detail screen so the
// list stays scannable. Resting rows open that detail screen too (to read notes
// or edit); it's only the timer that's gated until the cooldown elapses. They're
// dimmed so the difference is still obvious at a glance.
function PrayerRow({ point, ready, colors, onPress, onLongPress }) {
  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.border }]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={
        ready ? `Pray for ${point.name}` : `${point.name}, ${availabilityLabel(point)}`
      }
    >
      <View style={[styles.rowText, !ready && styles.rowResting]}>
        <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
          {point.name}
        </Text>
        <Text style={[styles.rowMeta, { color: colors.secondaryText }]} numberOfLines={1}>
          {ready ? waitingLabel(point) : availabilityLabel(point)}
        </Text>
        {/* Schedule on its own line: the line above changes as time passes,
            this one describes how the point is set up. */}
        <Text style={[styles.rowSub, { color: colors.mutedText }]} numberOfLines={1}>
          {frequencyShortLabel(point)} · {repetitionLabel(point)}
        </Text>
      </View>
      {/* A clock on resting rows signals "you can look, but not start yet". */}
      {!ready && (
        <Ionicons
          name="time-outline"
          size={16}
          color={colors.mutedText}
          style={styles.rowClock}
        />
      )}
      <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
    </TouchableOpacity>
  );
}

function ArchivedRow({ point, colors, onLongPress }) {
  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.border }]}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={`${point.name}, archived`}
    >
      <View style={styles.rowText}>
        <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
          {point.name}
        </Text>
        <Text style={[styles.rowMeta, { color: colors.secondaryText }]} numberOfLines={1}>
          {point.prayedCount} prayer{point.prayedCount === 1 ? "" : "s"} · {formatPrayerTime(point.totalSeconds ?? (point.totalMinutes || 0) * 60)} · {frequencyLabel(point)}
        </Text>
        <Text style={[styles.rowSub, { color: colors.mutedText }]} numberOfLines={1}>
          {lastPrayedLabel(point)} · archived {formatDate(point.archivedAt)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function EmptyState({ heading, sub, colors }) {
  return (
    <View style={styles.empty}>
      <Text style={[styles.emptyHeading, { color: colors.text }]}>{heading}</Text>
      <Text style={[styles.emptySub, { color: colors.secondaryText }]}>{sub}</Text>
    </View>
  );
}

const hit = { top: 10, bottom: 10, left: 10, right: 10 };

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
  },
  title: { fontSize: 28, fontFamily: uiFont(700) },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 22 },

  goalBlock: { paddingHorizontal: 20, paddingBottom: 10 },
  goalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  goalValue: { fontSize: 15, fontFamily: uiFont(600) },
  goalTarget: { fontSize: 14, fontFamily: uiFont(400) },
  goalTrack: { height: 3, borderRadius: 2, overflow: "hidden" },
  goalFill: { height: 3, borderRadius: 2 },

  tabs: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabText: { fontSize: 14 },

  sectionHeader: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 6 },
  sectionHeaderText: {
    fontSize: 13,
    fontFamily: uiFont(700),
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, paddingRight: 12 },
  // Dim only the text, so the chevron stays legible as a "still tappable" cue.
  rowResting: { opacity: 0.55 },
  rowClock: { marginRight: 6 },
  rowName: { fontSize: 15, fontFamily: uiFont(600) },
  rowMeta: { fontSize: 12, fontFamily: uiFont(400), marginTop: 3 },
  rowSub: { fontSize: 11, fontFamily: uiFont(400), marginTop: 2 },

  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingTop: 80,
  },
  emptyHeading: { fontSize: 20, fontFamily: uiFont(700), marginBottom: 6, textAlign: "center" },
  emptySub: { fontSize: 15, textAlign: "center", lineHeight: 22, fontFamily: uiFont() },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: { width: "100%", maxWidth: 420, borderRadius: 16, overflow: "hidden" },
  modalTitle: {
    fontSize: 15,
    fontFamily: uiFont(700),
    textAlign: "center",
    paddingTop: 18,
    paddingHorizontal: 20,
  },
  modalNote: {
    fontSize: 13,
    fontFamily: uiFont(400),
    lineHeight: 18,
    paddingHorizontal: 20,
    paddingTop: 8,
    textAlign: "center",
  },
  modalInputRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 18,
  },
  modalInput: {
    width: 90,
    borderRadius: 10,
    paddingVertical: 10,
    textAlign: "center",
    fontSize: 18,
    fontFamily: uiFont(600),
  },
  modalSuffix: { fontSize: 15, fontFamily: uiFont(400) },
  modalSave: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 14, alignItems: "center" },
  modalSaveText: { fontSize: 15, fontFamily: uiFont(700) },
});
