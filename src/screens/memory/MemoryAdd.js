import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  SectionList,
  Alert,
} from "react-native";
import { BOOKS } from "../../data/books";
import { getVersesInRange, formatReference } from "../../data/verses";
import { addMemory } from "../../data/memoryStore";
import { useTheme } from "../../theme/ThemeContext";

const SECTIONS = [
  { title: "Old Testament", data: BOOKS.filter((b) => b.testament === "OT") },
  { title: "New Testament", data: BOOKS.filter((b) => b.testament === "NT") },
];

// Two-step add flow: pick a book, then enter a consecutive verse range within
// that book (may cross chapters, never books). Validates against the bundled
// text before saving via memoryStore.addMemory.
export default function MemoryAdd({ onDone, onCancel }) {
  const { colors } = useTheme();
  const [book, setBook] = useState(null);
  const [chapterStart, setChapterStart] = useState("");
  const [verseStart, setVerseStart] = useState("");
  const [chapterEnd, setChapterEnd] = useState("");
  const [verseEnd, setVerseEnd] = useState("");
  const [saving, setSaving] = useState(false);

  function numOr(value, fallback) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
  }

  // End defaults to start when left blank, so a single verse is easy to add.
  const cs = numOr(chapterStart, NaN);
  const vs = numOr(verseStart, NaN);
  const ce = numOr(chapterEnd, cs);
  const ve = numOr(verseEnd, vs);

  const rangeValid =
    book &&
    Number.isFinite(cs) &&
    Number.isFinite(vs) &&
    getVersesInRange(book.id, cs, vs, ce, ve).length > 0;

  const previewLabel = rangeValid
    ? formatReference(book.id, cs, vs, ce, ve)
    : null;

  async function handleSave() {
    if (!rangeValid || saving) return;
    setSaving(true);
    try {
      await addMemory({
        bookId: book.id,
        chapterStart: cs,
        verseStart: vs,
        chapterEnd: ce,
        verseEnd: ve,
      });
      onDone();
    } catch (e) {
      Alert.alert("Couldn't add", e.message || "Invalid verse range.");
      setSaving(false);
    }
  }

  if (!book) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onCancel} hitSlop={hit}>
            <Text style={[styles.back, { color: colors.accent }]}>{"‹ Cancel"}</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>Pick a book</Text>
          <View style={{ width: 70 }} />
        </View>
        <SectionList
          sections={SECTIONS}
          keyExtractor={(item) => item.id}
          renderSectionHeader={({ section }) => (
            <Text
              style={[
                styles.sectionHeader,
                { color: colors.accent, backgroundColor: colors.background },
              ]}
            >
              {section.title}
            </Text>
          )}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.row, { borderBottomColor: colors.border }]}
              onPress={() => setBook(item)}
            >
              <Text style={[styles.rowText, { color: colors.text }]}>{item.name}</Text>
              <Text style={[styles.rowMeta, { color: colors.mutedText }]}>
                {item.chapterCount} ch
              </Text>
            </TouchableOpacity>
          )}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => setBook(null)} hitSlop={hit}>
          <Text style={[styles.back, { color: colors.accent }]}>{"‹ Books"}</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{book.name}</Text>
        <View style={{ width: 70 }} />
      </View>

      <View style={styles.form}>
        <Text style={[styles.help, { color: colors.secondaryText }]}>
          Enter a start and end verse. Leave the end blank for a single verse.
          The range must stay within {book.name}.
        </Text>

        <Text style={[styles.fieldLabel, { color: colors.text }]}>From</Text>
        <View style={styles.rangeRow}>
          <NumField
            label="Chapter"
            value={chapterStart}
            onChangeText={setChapterStart}
            colors={colors}
          />
          <NumField
            label="Verse"
            value={verseStart}
            onChangeText={setVerseStart}
            colors={colors}
          />
        </View>

        <Text style={[styles.fieldLabel, { color: colors.text }]}>To (optional)</Text>
        <View style={styles.rangeRow}>
          <NumField
            label="Chapter"
            value={chapterEnd}
            onChangeText={setChapterEnd}
            colors={colors}
          />
          <NumField
            label="Verse"
            value={verseEnd}
            onChangeText={setVerseEnd}
            colors={colors}
          />
        </View>

        <Text style={[styles.preview, { color: colors.mutedText }]}>
          {previewLabel ? `Adding: ${previewLabel}` : "Enter a valid verse range"}
        </Text>

        <TouchableOpacity
          disabled={!rangeValid || saving}
          onPress={handleSave}
          style={[
            styles.saveBtn,
            {
              backgroundColor: rangeValid ? colors.accent : colors.disabledBg,
              borderColor: rangeValid ? colors.accentBorder : colors.border,
            },
          ]}
        >
          <Text
            style={[
              styles.saveText,
              { color: rangeValid ? colors.accentContrast : colors.disabledText },
            ]}
          >
            {saving ? "Adding…" : "Add to Memory"}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function NumField({ label, value, onChangeText, colors }) {
  return (
    <View style={styles.numField}>
      <Text style={[styles.numLabel, { color: colors.secondaryText }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={(t) => onChangeText(t.replace(/[^0-9]/g, ""))}
        keyboardType="number-pad"
        placeholder="—"
        placeholderTextColor={colors.mutedText}
        style={[
          styles.numInput,
          { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
        ]}
        maxLength={3}
      />
    </View>
  );
}

const hit = { top: 10, bottom: 10, left: 10, right: 10 };

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: { fontSize: 16, width: 90 },
  title: { fontSize: 20, fontWeight: "700" },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 6,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { fontSize: 17 },
  rowMeta: { fontSize: 13 },
  form: { paddingHorizontal: 20, paddingTop: 16 },
  help: { fontSize: 14, lineHeight: 20, marginBottom: 20 },
  fieldLabel: { fontSize: 15, fontWeight: "700", marginBottom: 8, marginTop: 8 },
  rangeRow: { flexDirection: "row", gap: 12 },
  numField: { flex: 1 },
  numLabel: { fontSize: 12, marginBottom: 4 },
  numInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 18,
  },
  preview: { fontSize: 14, marginTop: 20, marginBottom: 12 },
  saveBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  saveText: { fontSize: 16, fontWeight: "700" },
});
