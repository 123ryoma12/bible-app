// Chrome-style tab strip rendered above the reader footer.
// Each tab shows: abbreviated book id (3 chars) + chapter number.
// Rightmost slot is a "+" button to open a new tab (hidden when at MAX_TABS).
// Each tab has an "×" close button (hidden when only 1 tab is open).
//
// Props:
//   tabs          – Array<{ id, bookId, chapterNumber }>
//   activeTabId   – string  (id of the currently selected tab)
//   onSelectTab   – (id: string) => void
//   onCloseTab    – (id: string) => void
//   onAddTab      – () => void
//   maxTabs       – number (default 5)

import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { uiFont } from "../theme/fonts";
import { MAX_TABS } from "../data/readerTabsStore";

export default function ReaderTabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onAddTab,
}) {
  const { colors } = useTheme();
  const canClose = tabs.length > 1;
  const canAdd = tabs.length < MAX_TABS;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.surface, borderTopColor: colors.border },
      ]}
    >
      {/* Scrollable tab list so many tabs don't overflow */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabList}
        style={{ flex: 1 }}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[
                styles.tab,
                {
                  backgroundColor: isActive ? colors.background : colors.surface,
                  borderColor: isActive ? colors.accent : colors.border,
                  borderBottomColor: isActive ? colors.background : colors.border,
                },
              ]}
              onPress={() => onSelectTab(tab.id)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.tabLabel,
                  { color: isActive ? colors.accent : colors.secondaryText },
                ]}
                numberOfLines={1}
              >
                {tab.bookId} {tab.chapterNumber}
              </Text>

              {canClose && (
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={() => onCloseTab(tab.id)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text
                    style={[
                      styles.closeText,
                      { color: isActive ? colors.accent : colors.secondaryText },
                    ]}
                  >
                    ×
                  </Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* "+" button – always visible but disabled (dimmed) at max tabs */}
      <TouchableOpacity
        style={[
          styles.addBtn,
          { borderLeftColor: colors.border },
          !canAdd && styles.addBtnDisabled,
        ]}
        onPress={canAdd ? onAddTab : undefined}
        activeOpacity={canAdd ? 0.7 : 1}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Text
          style={[
            styles.addText,
            { color: canAdd ? colors.accent : colors.disabledText },
          ]}
        >
          +
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const TAB_HEIGHT = 34;

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "stretch",
    height: TAB_HEIGHT,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tabList: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingHorizontal: 4,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    marginHorizontal: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    minWidth: 64,
    maxWidth: 110,
  },
  tabLabel: {
    fontSize: 12,
    fontFamily: uiFont(600),
    letterSpacing: 0.3,
    flexShrink: 1,
  },
  closeBtn: {
    marginLeft: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: {
    fontSize: 16,
    fontFamily: uiFont(400),
    lineHeight: 18,
  },
  addBtn: {
    width: 40,
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  addBtnDisabled: {
    opacity: 0.4,
  },
  addText: {
    fontSize: 20,
    fontFamily: uiFont(400),
    lineHeight: 22,
  },
});
