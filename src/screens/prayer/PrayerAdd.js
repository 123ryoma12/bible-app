// Add / edit a prayer point.
//
// Four fields only: the name, free-text notes, how often it comes back around
// (frequency), and how many times it should be prayed before it retires
// (repetition). Passing an `entry` switches the form into edit mode; stats and
// schedule history are never touched by an edit.

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import ChoiceModal from "../../components/ChoiceModal";
import { useTheme } from "../../theme/ThemeContext";
import { uiFont } from "../../theme/fonts";
import {
  FREQUENCIES,
  DEFAULT_FREQUENCY,
  addPrayer,
  updatePrayer,
  archivePrayer,
  removePrayer,
} from "../../data/prayerStore";

export default function PrayerAdd({ entry, onDone, onCancel }) {
  const { colors } = useTheme();
  const editing = Boolean(entry);

  const [name, setName] = useState(entry?.name ?? "");
  const [description, setDescription] = useState(entry?.description ?? "");
  const [frequency, setFrequency] = useState(entry?.frequency ?? DEFAULT_FREQUENCY);

  // Repetition is either "ongoing" or a finite count. Keep the typed count in
  // its own state so toggling back and forth doesn't lose what was entered.
  const [ongoing, setOngoing] = useState(
    entry ? entry.repetition === "ongoing" : true
  );
  const [count, setCount] = useState(
    entry && entry.repetition !== "ongoing" ? String(entry.repetition) : "5"
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  // Which destructive confirmation is showing: "archive" | "delete" | null.
  const [confirming, setConfirming] = useState(null);

  const parsedCount = Number.parseInt(count, 10);
  const countValid = Number.isFinite(parsedCount) && parsedCount >= 1;
  const canSave = name.trim().length > 0 && (ongoing || countValid) && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload = {
        name,
        description,
        frequency,
        repetition: ongoing ? "ongoing" : parsedCount,
      };
      if (editing) await updatePrayer(entry.id, payload);
      else await addPrayer(payload);
      onDone();
    } catch (err) {
      setError(err?.message || "Could not save. Please try again.");
      setSaving(false);
    }
  }

  // "archive" | "delete" | null — which confirmation is on screen.
  const deleteMessage = entry
    ? `Permanently delete "${entry.name}"? This removes it along with ${
        entry.prayedCount || 0
      } recorded prayer${entry.prayedCount === 1 ? "" : "s"} and ${
        entry.totalMinutes || 0
      } minute${
        (entry.totalMinutes || 0) === 1 ? "" : "s"
      } of logged time, which will also come off your daily totals. This cannot be undone.`
    : "";

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={onCancel} hitSlop={hit} accessibilityLabel="Cancel">
          <Text style={[styles.headerAction, { color: colors.secondaryText }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {editing ? "Edit prayer" : "New prayer"}
        </Text>
        <TouchableOpacity onPress={handleSave} hitSlop={hit} disabled={!canSave} accessibilityLabel="Save">
          <Text
            style={[
              styles.headerAction,
              { color: canSave ? colors.accent : colors.disabledText, fontFamily: uiFont(700) },
            ]}
          >
            Save
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Field label="Name" colors={colors}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="What are you praying for?"
            placeholderTextColor={colors.disabledText}
            style={[
              styles.input,
              { color: colors.text, backgroundColor: colors.surface },
            ]}
            autoFocus={!editing}
            returnKeyType="next"
          />
        </Field>

        <Field label="Notes" colors={colors} hint="Scripture, specifics, anything to pray through">
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Optional"
            placeholderTextColor={colors.disabledText}
            style={[
              styles.input,
              styles.textarea,
              { color: colors.text, backgroundColor: colors.surface },
            ]}
            multiline
            textAlignVertical="top"
          />
        </Field>

        <Field
          label="Frequency"
          colors={colors}
          hint="How long it rests before you can pray for it again"
        >
          <View style={styles.options}>
            {FREQUENCIES.map((option) => {
              const selected = option.key === frequency;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.option,
                    {
                      borderColor: selected ? colors.accentBorder : colors.border,
                      backgroundColor: selected ? colors.accent : "transparent",
                    },
                  ]}
                  onPress={() => setFrequency(option.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <Text
                    style={[
                      styles.optionText,
                      { color: selected ? colors.accentContrast : colors.text },
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Field>

        <Field
          label="Repetition"
          colors={colors}
          hint="How many times to pray before it moves to the archive"
        >
          <View style={styles.options}>
            <TouchableOpacity
              style={[
                styles.option,
                {
                  borderColor: ongoing ? colors.accentBorder : colors.border,
                  backgroundColor: ongoing ? colors.accent : "transparent",
                },
              ]}
              onPress={() => setOngoing(true)}
              accessibilityRole="radio"
              accessibilityState={{ selected: ongoing }}
            >
              <Text
                style={[
                  styles.optionText,
                  { color: ongoing ? colors.accentContrast : colors.text },
                ]}
              >
                Ongoing
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.option,
                {
                  borderColor: !ongoing ? colors.accentBorder : colors.border,
                  backgroundColor: !ongoing ? colors.accent : "transparent",
                },
              ]}
              onPress={() => setOngoing(false)}
              accessibilityRole="radio"
              accessibilityState={{ selected: !ongoing }}
            >
              <Text
                style={[
                  styles.optionText,
                  { color: !ongoing ? colors.accentContrast : colors.text },
                ]}
              >
                A set number
              </Text>
            </TouchableOpacity>
          </View>

          {!ongoing && (
            <View style={styles.countRow}>
              <TextInput
                value={count}
                onChangeText={(text) => setCount(text.replace(/[^0-9]/g, ""))}
                keyboardType="number-pad"
                style={[
                  styles.input,
                  styles.countInput,
                  { color: colors.text, backgroundColor: colors.surface },
                ]}
                accessibilityLabel="Number of times to pray"
              />
              <Text style={[styles.countSuffix, { color: colors.secondaryText }]}>
                time{parsedCount === 1 ? "" : "s"}
              </Text>
            </View>
          )}
        </Field>

        {/* Destructive actions live only in edit mode, separated from the
            fields above so neither can be hit while filling the form in. */}
        {editing && (
          <View style={[styles.dangerZone, { borderTopColor: colors.border }]}>
            {!entry.archivedAt && (
              <TouchableOpacity
                style={styles.dangerRow}
                onPress={() => setConfirming("archive")}
                accessibilityRole="button"
              >
                <Ionicons name="archive-outline" size={20} color={colors.secondaryText} />
                <View style={styles.dangerText}>
                  <Text style={[styles.dangerLabel, { color: colors.text }]}>Archive</Text>
                  <Text style={[styles.dangerSub, { color: colors.secondaryText }]}>
                    Retire this prayer but keep its history. You can restore it later.
                  </Text>
                </View>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.dangerRow}
              onPress={() => setConfirming("delete")}
              accessibilityRole="button"
            >
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
              <View style={styles.dangerText}>
                <Text style={[styles.dangerLabel, { color: colors.danger }]}>Delete</Text>
                <Text style={[styles.dangerSub, { color: colors.secondaryText }]}>
                  Permanently remove this prayer and every minute logged against
                  it. This cannot be undone.
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <ChoiceModal
        visible={confirming === "archive"}
        onDismiss={() => setConfirming(null)}
        title="Archive prayer point"
        message={`Move "${entry?.name}" to your archive? Its history is kept and you can restore it any time.`}
        actions={[
          {
            label: "Archive",
            onPress: async () => {
              await archivePrayer(entry.id);
              onDone();
            },
          },
          { label: "Cancel", style: "cancel" },
        ]}
      />

      <ChoiceModal
        visible={confirming === "delete"}
        onDismiss={() => setConfirming(null)}
        title="Delete prayer point"
        message={deleteMessage}
        actions={[
          {
            label: "Delete",
            style: "destructive",
            onPress: async () => {
              await removePrayer(entry.id);
              onDone();
            },
          },
          { label: "Cancel", style: "cancel" },
        ]}
      />

      <ChoiceModal
        visible={error != null}
        onDismiss={() => setError(null)}
        title="Could not save"
        message={error || ""}
        actions={[{ label: "OK", style: "cancel" }]}
      />
    </SafeAreaView>
  );
}

function Field({ label, hint, colors, children }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>{label}</Text>
      {!!hint && <Text style={[styles.fieldHint, { color: colors.mutedText }]}>{hint}</Text>}
      {children}
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
    paddingTop: 12,
    paddingBottom: 10,
  },
  headerTitle: { fontSize: 16, fontFamily: uiFont(700) },
  headerAction: { fontSize: 15, fontFamily: uiFont(500) },
  body: { paddingHorizontal: 20, paddingBottom: 60 },

  field: { marginTop: 22 },
  fieldLabel: {
    fontSize: 13,
    fontFamily: uiFont(700),
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  fieldHint: { fontSize: 12, fontFamily: uiFont(400), marginTop: 4 },
  input: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: uiFont(400),
    marginTop: 10,
  },
  textarea: { minHeight: 110, paddingTop: 12 },

  options: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  option: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  optionText: { fontSize: 14, fontFamily: uiFont(500) },

  countRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  countInput: { width: 90, textAlign: "center" },
  countSuffix: { fontSize: 15, fontFamily: uiFont(400), marginTop: 10 },

  dangerZone: { marginTop: 36, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  dangerRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 14 },
  dangerText: { flex: 1 },
  dangerLabel: { fontSize: 15, fontFamily: uiFont(600) },
  dangerSub: { fontSize: 12, fontFamily: uiFont(400), lineHeight: 17, marginTop: 3 },
});
