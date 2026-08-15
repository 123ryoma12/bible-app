import React from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeContext";

const NUM_COLUMNS = 5;
const GRID_H_PADDING = 12;
const CELL_MARGIN = 6;

export default function ChapterListScreen({ book, onSelectChapter, onBack }) {
  const { colors } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const chapters = Array.from({ length: book.chapterCount }, (_, i) => i + 1);

  // Fixed pixel size (not flex:1) so every tile is identical even when the
  // last row has fewer than NUM_COLUMNS items - flex:1 would otherwise
  // stretch those remaining tiles to fill the row.
  const cellSize =
    (windowWidth - GRID_H_PADDING * 2 - CELL_MARGIN * 2 * NUM_COLUMNS) / NUM_COLUMNS;

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={[styles.back, { color: colors.accent }]}>{"‹ Books"}</Text>
        </TouchableOpacity>
        <Text
          style={[styles.title, { color: colors.text }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {book.name}
        </Text>
        <View style={{ width: 70 }} />
      </View>
      <FlatList
        data={chapters}
        key={NUM_COLUMNS}
        numColumns={NUM_COLUMNS}
        keyExtractor={(n) => String(n)}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.cell,
              { width: cellSize, height: cellSize, backgroundColor: colors.surface },
            ]}
            onPress={() => onSelectChapter(item)}
          >
            <Text style={[styles.cellText, { color: colors.surfaceText }]}>{item}</Text>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

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
  back: { fontSize: 16, width: 70 },
  title: { flex: 1, fontSize: 20, fontWeight: "700", textAlign: "center" },
  grid: { paddingHorizontal: GRID_H_PADDING, paddingBottom: 24 },
  cell: {
    margin: CELL_MARGIN,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cellText: { fontSize: 17, fontWeight: "600" },
});
