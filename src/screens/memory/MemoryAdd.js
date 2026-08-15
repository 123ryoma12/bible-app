import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SectionList,
  FlatList,
  Modal,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BOOKS } from "../../data/books";
import {
  getVersesInRange,
  formatReference,
  getChapterCount,
  getVerseCount,
} from "../../data/verses";
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

  // Cascading selection. Each is null until chosen; a later field cannot be set
  // until the ones it depends on are, and choosing an earlier field resets the
  // later ones so an invalid combination can never exist.
  const [cs, setCs] = useState(null); // from chapter
  const [vs, setVs] = useState(null); // from verse
  const [ce, setCe] = useState(null); // to chapter
  const [ve, setVe] = useState(null); // to verse
  const [saving, setSaving] = useState(false);

  // Which picker modal is open: null | "cs" | "vs" | "ce" | "ve".
  const [openPicker, setOpenPicker] = useState(null);

  const chapterCount = book ? getChapterCount(book.id) : 0;

  // ---- Options for each field, derived so only valid numbers are ever shown.
  const fromChapterOptions = range(1, chapterCount);
  const fromVerseOptions = cs ? range(1, getVerseCount(book.id, cs)) : [];
  // "To chapter" can only be >= the from chapter.
  const toChapterOptions = cs ? range(cs, chapterCount) : [];
  // "To verse": within the chosen end chapter, but if the end chapter equals the
  // start chapter it must not precede the start verse.
  const toVerseMax = ce ? getVerseCount(book.id, ce) : 0;
  const toVerseMin = ce && cs && ce === cs && vs ? vs : 1;
  const toVerseOptions = ce ? range(toVerseMin, toVerseMax) : [];

  const rangeComplete = book && cs != null && vs != null && ce != null && ve != null;
  const rangeValid =
    rangeComplete && getVersesInRange(book.id, cs, vs, ce, ve).length > 0;

  const previewLabel = rangeValid ? formatReference(book.id, cs, vs, ce, ve) : null;

  // ---- Cascade setters: setting an earlier field invalidates the later ones.
  function chooseFromChapter(n) {
    setCs(n);
    setVs(null);
    setCe(null);
    setVe(null);
    setOpenPicker(null);
  }
  function chooseFromVerse(n) {
    setVs(n);
    // Default the "To" to the same single verse so one-verse adds are instant,
    // while still letting the user widen the range.
    setCe(cs);
    setVe(n);
    setOpenPicker(null);
  }
  function chooseToChapter(n) {
    setCe(n);
    // If the end chapter moved, re-clamp the end verse.
    const min = n === cs ? vs : 1;
    const max = getVerseCount(book.id, n);
    setVe((prev) => {
      if (prev == null) return max; // sensible default: end of chapter
      return Math.min(Math.max(prev, min), max);
    });
    setOpenPicker(null);
  }
  function chooseToVerse(n) {
    setVe(n);
    setOpenPicker(null);
  }

  function pickBook(b) {
    setBook(b);
    setCs(null);
    setVs(null);
    setCe(null);
    setVe(null);
  }

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
      <SafeAreaView
        style={[styles.safe, { backgroundColor: colors.background }]}
        edges={["top", "left", "right"]}
      >
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
              onPress={() => pickBook(item)}
            >
              <Text
                style={[styles.rowText, { color: colors.text }]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {item.name}
              </Text>
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
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => pickBook(null)} hitSlop={hit}>
          <Text style={[styles.back, { color: colors.accent }]} numberOfLines={1}>
            {"‹ Books"}
          </Text>
        </TouchableOpacity>
        <Text
          style={[styles.title, { color: colors.text }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {book.name}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.form}>
        <Text style={[styles.help, { color: colors.secondaryText }]}>
          Choose where the passage starts, then where it ends. Only valid chapters
          and verses for {book.name} are offered.
        </Text>

        <Text style={[styles.fieldLabel, { color: colors.text }]}>From</Text>
        <View style={styles.rangeRow}>
          <SelectField
            label="Chapter"
            value={cs}
            enabled
            onPress={() => setOpenPicker("cs")}
            colors={colors}
          />
          <SelectField
            label="Verse"
            value={vs}
            enabled={cs != null}
            hint={cs == null ? "Pick chapter" : undefined}
            onPress={() => setOpenPicker("vs")}
            colors={colors}
          />
        </View>

        <Text style={[styles.fieldLabel, { color: colors.text }]}>To</Text>
        <View style={styles.rangeRow}>
          <SelectField
            label="Chapter"
            value={ce}
            enabled={vs != null}
            hint={vs == null ? "Pick start verse" : undefined}
            onPress={() => setOpenPicker("ce")}
            colors={colors}
          />
          <SelectField
            label="Verse"
            value={ve}
            enabled={ce != null}
            hint={ce == null ? "Pick chapter" : undefined}
            onPress={() => setOpenPicker("ve")}
            colors={colors}
          />
        </View>

        <Text style={[styles.preview, { color: colors.mutedText }]}>
          {previewLabel ? `Adding: ${previewLabel}` : "Select a start and end verse"}
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

      {/* Cascading number pickers - each only offers valid values. */}
      <NumberPickerModal
        visible={openPicker === "cs"}
        title="From chapter"
        options={fromChapterOptions}
        selected={cs}
        onSelect={chooseFromChapter}
        onClose={() => setOpenPicker(null)}
        colors={colors}
      />
      <NumberPickerModal
        visible={openPicker === "vs"}
        title={`Chapter ${cs} · from verse`}
        options={fromVerseOptions}
        selected={vs}
        onSelect={chooseFromVerse}
        onClose={() => setOpenPicker(null)}
        colors={colors}
      />
      <NumberPickerModal
        visible={openPicker === "ce"}
        title="To chapter"
        options={toChapterOptions}
        selected={ce}
        onSelect={chooseToChapter}
        onClose={() => setOpenPicker(null)}
        colors={colors}
      />
      <NumberPickerModal
        visible={openPicker === "ve"}
        title={`Chapter ${ce} · to verse`}
        options={toVerseOptions}
        selected={ve}
        onSelect={chooseToVerse}
        onClose={() => setOpenPicker(null)}
        colors={colors}
      />
    </SafeAreaView>
  );
}

// Inclusive integer range [lo..hi]; empty when hi < lo or inputs invalid.
function range(lo, hi) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) return [];
  const out = [];
  for (let i = lo; i <= hi; i++) out.push(i);
  return out;
}

// A tappable field that shows the chosen number (or a placeholder/hint) and
// visually communicates when it's disabled because a prerequisite isn't set.
function SelectField({ label, value, enabled, hint, onPress, colors }) {
  return (
    <View style={styles.selectField}>
      <Text style={[styles.numLabel, { color: colors.secondaryText }]}>{label}</Text>
      <TouchableOpacity
        onPress={enabled ? onPress : undefined}
        disabled={!enabled}
        activeOpacity={0.7}
        style={[
          styles.selectBox,
          {
            borderColor: value != null ? colors.accent : colors.border,
            backgroundColor: enabled ? colors.surface : colors.disabledBg,
          },
        ]}
      >
        <Text
          style={[
            styles.selectValue,
            {
              color: !enabled
                ? colors.disabledText
                : value != null
                ? colors.text
                : colors.mutedText,
            },
          ]}
          numberOfLines={1}
        >
          {value != null ? String(value) : enabled ? "Select" : hint || "—"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// Modal grid of valid numbers. Large chapters/verses (e.g. Psalm 119) scroll.
function NumberPickerModal({ visible, title, options, selected, onSelect, onClose, colors }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.sheet, { backgroundColor: colors.background }]}
        >
          <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.sheetTitle, { color: colors.text }]} numberOfLines={1}>
              {title}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={hit}>
              <Text style={[styles.sheetClose, { color: colors.accent }]}>Close</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={options}
            keyExtractor={(n) => String(n)}
            numColumns={5}
            key="grid-5"
            contentContainerStyle={styles.pickerGrid}
            renderItem={({ item }) => {
              const isSelected = item === selected;
              return (
                <TouchableOpacity
                  style={[
                    styles.pickerCell,
                    {
                      backgroundColor: isSelected ? colors.accent : colors.surface,
                      borderColor: isSelected ? colors.accentBorder : colors.border,
                    },
                  ]}
                  onPress={() => onSelect(item)}
                >
                  <Text
                    style={[
                      styles.pickerCellText,
                      { color: isSelected ? colors.accentContrast : colors.text },
                    ]}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
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
  backBtn: { width: 84 },
  headerSpacer: { width: 84 },
  back: { fontSize: 16 },
  title: { flex: 1, fontSize: 20, fontWeight: "700", textAlign: "center" },
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
  rowText: { flex: 1, fontSize: 17, marginRight: 12 },
  rowMeta: { fontSize: 13, flexShrink: 0 },
  form: { paddingHorizontal: 20, paddingTop: 16 },
  help: { fontSize: 14, lineHeight: 20, marginBottom: 20 },
  fieldLabel: { fontSize: 15, fontWeight: "700", marginBottom: 8, marginTop: 8 },
  rangeRow: { flexDirection: "row", gap: 12 },
  numLabel: { fontSize: 12, marginBottom: 4 },
  selectField: { flex: 1 },
  selectBox: {
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 46,
    justifyContent: "center",
  },
  selectValue: { fontSize: 18, fontWeight: "600" },
  preview: { fontSize: 14, marginTop: 20, marginBottom: 12 },
  saveBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  saveText: { fontSize: 16, fontWeight: "700" },

  // ---- Number picker modal
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "70%",
    paddingBottom: 12,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetTitle: { flex: 1, fontSize: 17, fontWeight: "700", marginRight: 12 },
  sheetClose: { fontSize: 16, fontWeight: "600" },
  pickerGrid: { padding: 12 },
  pickerCell: {
    flex: 1,
    margin: 5,
    maxWidth: "18%",
    aspectRatio: 1,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerCellText: { fontSize: 16, fontWeight: "600" },
});
