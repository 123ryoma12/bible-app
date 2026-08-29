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

import React, { useRef, useCallback, useState } from "react";
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
  // scrollX / onScrollX are owned by App.js so the value survives the
  // ReaderScreen remounts that happen on every tab switch (key prop change).
  // scrollX       – the x offset to restore on mount (a plain number, not a ref)
  // onScrollX     – callback(x) to persist the latest offset back to App.js
  // scrollToActive – when true, scroll so the active tab is visible on mount
  //                  (set by App.js only when returning from Stats/Memory/Settings)
  // onScrollToActiveConsumed – called after scrollToActive has been handled
  scrollX = 0,
  onScrollX,
  scrollToActive = false,
  onScrollToActiveConsumed,
}) {
  const { colors } = useTheme();
  const canClose = tabs.length > 1;
  const canAdd = tabs.length < MAX_TABS;

  const scrollViewRef = useRef(null);
  // Whether the strip should scroll to make the active tab visible as soon as
  // the active tab's onLayout fires. Only true when explicitly requested by
  // App.js (returning from Stats/Memory/Settings).
  const pendingScrollToActiveRef = useRef(scrollToActive);
  // Whether we still need to restore a saved x offset. Set on mount when
  // scrollX > 0 (tab switches). Consumed on the ScrollView's first onLayout.
  const pendingRestoreXRef = useRef(scrollX > 0 ? scrollX : 0);

  // Hidden until the scroll position has been applied, so the user never sees
  // the strip flash from x=0 to wherever it should be.
  const needsPositioning = pendingScrollToActiveRef.current || pendingRestoreXRef.current > 0;
  const [stripReady, setStripReady] = useState(!needsPositioning);

  // Called from the active tab's onLayout. If a scroll-to-active is pending,
  // jump to make the active tab visible now that we know its position.
  const handleActiveTabLayout = useCallback((x, width) => {
    if (!pendingScrollToActiveRef.current) return;
    pendingScrollToActiveRef.current = false;
    const targetX = Math.max(0, x - 8);
    scrollViewRef.current?.scrollTo({ x: targetX, animated: false });
    onScrollToActiveConsumed?.();
    setStripReady(true);
  }, [onScrollToActiveConsumed]);

  // Called when the ScrollView itself lays out. If a saved x restore is
  // pending, apply it now — this reliably fires before the user sees anything.
  const handleScrollViewLayout = useCallback(() => {
    if (pendingRestoreXRef.current > 0) {
      scrollViewRef.current?.scrollTo({ x: pendingRestoreXRef.current, animated: false });
      pendingRestoreXRef.current = 0;
      setStripReady(true);
    }
  }, []);

  const handleScroll = useCallback((e) => {
    onScrollX?.(e.nativeEvent.contentOffset.x);
  }, [onScrollX]);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.surface, borderTopColor: colors.border, opacity: stripReady ? 1 : 0 },
      ]}
    >
      {/* Scrollable tab list so many tabs don't overflow */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabList}
        style={{ flex: 1 }}
        onLayout={handleScrollViewLayout}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <TouchableOpacity
              key={tab.id}
              onLayout={(e) => {
                if (isActive) {
                  handleActiveTabLayout(
                    e.nativeEvent.layout.x,
                    e.nativeEvent.layout.width
                  );
                }
              }}
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
