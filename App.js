import React, { useState, useEffect, useRef } from "react";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator, StyleSheet, BackHandler, Platform } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { BOOKS } from "./src/data/books";
import BookChapterPicker from "./src/screens/BookChapterPicker";
import ReaderScreen from "./src/screens/ReaderScreen";
import HistoryScreen from "./src/screens/HistoryScreen";
import StatsScreen from "./src/screens/StatsScreen";
import MemoryScreen from "./src/screens/MemoryScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import BottomTabBar from "./src/components/BottomTabBar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "@expo-google-fonts/lora/useFonts";
import { Lora_400Regular } from "@expo-google-fonts/lora/400Regular";
import { Lora_500Medium } from "@expo-google-fonts/lora/500Medium";
import { Lora_600SemiBold } from "@expo-google-fonts/lora/600SemiBold";
import { Lora_700Bold } from "@expo-google-fonts/lora/700Bold";
import { Lora_400Regular_Italic } from "@expo-google-fonts/lora/400Regular_Italic";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { CrimsonText_400Regular } from "@expo-google-fonts/crimson-text/400Regular";
import { CrimsonText_400Regular_Italic } from "@expo-google-fonts/crimson-text/400Regular_Italic";
import { CrimsonText_600SemiBold } from "@expo-google-fonts/crimson-text/600SemiBold";
import { CrimsonText_700Bold } from "@expo-google-fonts/crimson-text/700Bold";
import { Merriweather_400Regular } from "@expo-google-fonts/merriweather/400Regular";
import { Merriweather_400Regular_Italic } from "@expo-google-fonts/merriweather/400Regular_Italic";
import { Merriweather_500Medium } from "@expo-google-fonts/merriweather/500Medium";
import { Merriweather_600SemiBold } from "@expo-google-fonts/merriweather/600SemiBold";
import { Merriweather_700Bold } from "@expo-google-fonts/merriweather/700Bold";
import { LibreBaskerville_400Regular } from "@expo-google-fonts/libre-baskerville/400Regular";
import { LibreBaskerville_400Regular_Italic } from "@expo-google-fonts/libre-baskerville/400Regular_Italic";
import { LibreBaskerville_500Medium } from "@expo-google-fonts/libre-baskerville/500Medium";
import { LibreBaskerville_600SemiBold } from "@expo-google-fonts/libre-baskerville/600SemiBold";
import { LibreBaskerville_700Bold } from "@expo-google-fonts/libre-baskerville/700Bold";
import { SourceSerif4_400Regular } from "@expo-google-fonts/source-serif-4/400Regular";
import { SourceSerif4_400Regular_Italic } from "@expo-google-fonts/source-serif-4/400Regular_Italic";
import { SourceSerif4_500Medium } from "@expo-google-fonts/source-serif-4/500Medium";
import { SourceSerif4_600SemiBold } from "@expo-google-fonts/source-serif-4/600SemiBold";
import { SourceSerif4_700Bold } from "@expo-google-fonts/source-serif-4/700Bold";
import { getLastPosition, setLastPosition, setLastScroll } from "./src/data/lastPositionStore";
import { loadMemoryPrefs } from "./src/data/memoryPrefsStore";
import { loadReadingVersion } from "./src/data/bibleVersionStore";
import {
  getReaderTabs,
  setReaderTabs,
  newTabId,
  MAX_TABS,
} from "./src/data/readerTabsStore";
import { ThemeProvider, useTheme } from "./src/theme/ThemeContext";
import {
  BackHandlerProvider,
  useBackHandlerRegistry,
} from "./src/navigation/BackHandlerRegistry";

// Keep the native splash visible until our custom fonts are ready, so text
// never flashes in the system default font first.
SplashScreen.preventAutoHideAsync();

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Lora_400Regular,
    Lora_500Medium,
    Lora_600SemiBold,
    Lora_700Bold,
    Lora_400Regular_Italic,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    CrimsonText_400Regular,
    CrimsonText_400Regular_Italic,
    CrimsonText_600SemiBold,
    CrimsonText_700Bold,
    Merriweather_400Regular,
    Merriweather_400Regular_Italic,
    Merriweather_500Medium,
    Merriweather_600SemiBold,
    Merriweather_700Bold,
    LibreBaskerville_400Regular,
    LibreBaskerville_400Regular_Italic,
    LibreBaskerville_500Medium,
    LibreBaskerville_600SemiBold,
    LibreBaskerville_700Bold,
    SourceSerif4_400Regular,
    SourceSerif4_400Regular_Italic,
    SourceSerif4_500Medium,
    SourceSerif4_600SemiBold,
    SourceSerif4_700Bold,
  });

  // Prime the Memory prioritisation prefs cache once at startup so the (sync)
  // ranking functions have the user's saved values before the Memory list first
  // sorts. Fire-and-forget: the scorer safely defaults until this resolves.
  useEffect(() => {
    loadMemoryPrefs().catch(() => {
      // Non-fatal: leaving the cache at defaults just means default ranking.
    });
    loadReadingVersion().catch(() => {
      // Non-fatal: the reader falls back to the default version (NIV).
    });
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // Hold rendering until fonts are ready (or failed) so the UI paints once in
  // the correct typeface. The native splash stays up during this window.
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <BackHandlerProvider>
          <AppContent />
        </BackHandlerProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function AppContent() {
  const { mode, colors } = useTheme();
  const backRegistry = useBackHandlerRegistry();

  // activeTab: "bible" | "stats" | "settings"
  const [activeTab, setActiveTab] = useState("bible");

  // Bible tab's own internal screen: "books" | "chapters" | "reader" | "history"
  const [screen, setScreen] = useState("books");
  const [bookIndex, setBookIndex] = useState(0);
  const [chapterNumber, setChapterNumber] = useState(1);
  // The scroll offset to restore into the Reader. Non-zero only for the chapter
  // resumed on launch; any in-app navigation to a chapter starts at the top and
  // resets this to 0.
  const [initialScrollY, setInitialScrollY] = useState(0);

  // Controls visibility of the bottom tab bar. The Reader hides it for an
  // immersive reading experience while scrolling down; everything else keeps
  // it visible.
  const [chromeVisible, setChromeVisible] = useState(true);

  // ── Reader tabs ────────────────────────────────────────────────────────────
  // Each tab: { id: string, bookId: string, chapterNumber: number }
  // The active tab drives bookIndex/chapterNumber in the reader. Opening a new
  // chapter from the book/chapter lists always updates the active tab.
  const [readerTabs, setReaderTabsState] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);

  // Per-tab scroll offsets: { [tabId]: number }. Populated as the user scrolls
  // within each tab so switching back to a tab restores the exact position.
  const tabScrollPositions = useRef({});

  /** Persist tabs and update local state in one call. */
  function applyTabs(tabs, tabId) {
    setReaderTabsState(tabs);
    setActiveTabId(tabId);
    setReaderTabs(tabs, tabs.findIndex((t) => t.id === tabId));
  }

  /** Sync bookIndex/chapterNumber from the active tab object, restoring its saved scroll offset. */
  function syncReaderFromTab(tab) {
    const idx = BOOKS.findIndex((b) => b.id === tab.bookId);
    if (idx === -1) return;
    setBookIndex(idx);
    setChapterNumber(tab.chapterNumber);
    setInitialScrollY(tabScrollPositions.current[tab.id] ?? 0);
  }

  // ── Whenever we leave the reader, switch tabs, or move to another chapter,
  //    force the chrome back on so it can never get "stuck" hidden.
  useEffect(() => {
    setChromeVisible(true);
  }, [activeTab, screen, bookIndex, chapterNumber]);

  const [isRestoring, setIsRestoring] = useState(true);

  // On launch, restore tabs and last position.
  useEffect(() => {
    let cancelled = false;

    Promise.all([getReaderTabs(), getLastPosition()])
      .then(([savedTabs, position]) => {
        if (cancelled) return;

        // ── Restore reader tabs ──────────────────────────────────────────────
        if (savedTabs && savedTabs.tabs && savedTabs.tabs.length > 0) {
          // Validate that all saved tab bookIds still exist in BOOKS.
          const validTabs = savedTabs.tabs.filter((t) =>
            BOOKS.some((b) => b.id === t.bookId)
          );
          if (validTabs.length > 0) {
            const savedIdx = Math.min(
              Math.max(savedTabs.activeIndex || 0, 0),
              validTabs.length - 1
            );
            const activeTab = validTabs[savedIdx];
            setReaderTabsState(validTabs);
            setActiveTabId(activeTab.id);
            const bookIdx = BOOKS.findIndex((b) => b.id === activeTab.bookId);
            if (bookIdx !== -1) {
              setBookIndex(bookIdx);
              setChapterNumber(activeTab.chapterNumber);
            }
            setInitialScrollY(position?.scrollY || 0);
            setScreen("reader");
            return;
          }
        }

        // ── Fall back: restore from lastPosition (pre-tabs users) ────────────
        if (position) {
          const idx = BOOKS.findIndex((b) => b.id === position.bookId);
          if (idx !== -1) {
            const tab = {
              id: newTabId(),
              bookId: position.bookId,
              chapterNumber: position.chapterNumber,
            };
            setReaderTabsState([tab]);
            setActiveTabId(tab.id);
            setBookIndex(idx);
            setChapterNumber(position.chapterNumber);
            setInitialScrollY(position.scrollY || 0);
            setScreen("reader");
            setReaderTabs([tab], 0);
          }
        }
      })
      .finally(() => {
        if (!cancelled) setIsRestoring(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const book = BOOKS[bookIndex];

  // ── Update the active tab's stored chapter whenever book/chapter changes ──
  // (covers prev/next navigation and direct opens)
  useEffect(() => {
    if (!activeTabId || readerTabs.length === 0) return;
    setReaderTabsState((prev) => {
      const updated = prev.map((t) =>
        t.id === activeTabId
          ? { ...t, bookId: book.id, chapterNumber }
          : t
      );
      const activeIdx = updated.findIndex((t) => t.id === activeTabId);
      setReaderTabs(updated, activeIdx);
      return updated;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.id, chapterNumber]);

  function openHistory() {
    setScreen("history");
  }

  // Jumps straight into the Reader for an arbitrary book/chapter, switching
  // to the Bible tab if needed. Used by both History entries and Stats
  // chapter cells.
  function openChapterDirect(entryBookId, entryChapterNumber) {
    const idx = BOOKS.findIndex((b) => b.id === entryBookId);
    if (idx === -1) return;
    setBookIndex(idx);
    setChapterNumber(entryChapterNumber);
    setInitialScrollY(0);
    setScreen("reader");
    setActiveTab("bible");
    setLastPosition(entryBookId, entryChapterNumber);

    // Update active tab or create first tab.
    if (readerTabs.length === 0) {
      const tab = { id: newTabId(), bookId: entryBookId, chapterNumber: entryChapterNumber };
      applyTabs([tab], tab.id);
    } else if (activeTabId) {
      const updated = readerTabs.map((t) =>
        t.id === activeTabId
          ? { ...t, bookId: entryBookId, chapterNumber: entryChapterNumber }
          : t
      );
      applyTabs(updated, activeTabId);
    }
  }

  // ── Tab bar handlers ───────────────────────────────────────────────────────

  function handleSelectTab(id) {
    const tab = readerTabs.find((t) => t.id === id);
    if (!tab || id === activeTabId) return;
    setActiveTabId(id);
    syncReaderFromTab(tab);
    setScreen("reader");
    const activeIdx = readerTabs.findIndex((t) => t.id === id);
    setReaderTabs(readerTabs, activeIdx);
  }

  /** Called by ReaderScreen on every debounced scroll. Keeps the per-tab map
   *  and the global lastPosition record in sync. */
  function handleScrollPositionChange(scrollY) {
    if (activeTabId) {
      tabScrollPositions.current[activeTabId] = scrollY;
    }
    setLastScroll(scrollY);
  }

  function handleCloseTab(id) {
    if (readerTabs.length <= 1) return; // guard: always keep at least 1 tab
    // Drop the stored scroll position for the closed tab.
    delete tabScrollPositions.current[id];
    const idx = readerTabs.findIndex((t) => t.id === id);
    const newTabs = readerTabs.filter((t) => t.id !== id);

    let newActiveId = activeTabId;
    if (id === activeTabId) {
      // Activate the tab to the left, or the new rightmost if closing the first.
      const newIdx = Math.min(idx, newTabs.length - 1);
      newActiveId = newTabs[newIdx].id;
      syncReaderFromTab(newTabs[newIdx]);
    }
    applyTabs(newTabs, newActiveId);
  }

  function handleAddTab() {
    if (readerTabs.length >= MAX_TABS) return;
    // New tab opens on the current book/chapter (a good default — the user can
    // then navigate away from it independently).
    const tab = { id: newTabId(), bookId: book.id, chapterNumber };
    // New tabs always start at the top.
    tabScrollPositions.current[tab.id] = 0;
    const newTabs = [...readerTabs, tab];
    applyTabs(newTabs, tab.id);
    setInitialScrollY(0);
    setScreen("reader");
  }

  // ── Prev / Next ────────────────────────────────────────────────────────────

  const hasPrev = bookIndex > 0 || chapterNumber > 1;
  const hasNext = bookIndex < BOOKS.length - 1 || chapterNumber < book.chapterCount;

  function goPrev() {
    setInitialScrollY(0);
    if (chapterNumber > 1) {
      const newChapter = chapterNumber - 1;
      setChapterNumber(newChapter);
      setLastPosition(book.id, newChapter);
    } else if (bookIndex > 0) {
      const prevBook = BOOKS[bookIndex - 1];
      setBookIndex(bookIndex - 1);
      setChapterNumber(prevBook.chapterCount);
      setLastPosition(prevBook.id, prevBook.chapterCount);
    }
  }

  function goNext() {
    setInitialScrollY(0);
    if (chapterNumber < book.chapterCount) {
      const newChapter = chapterNumber + 1;
      setChapterNumber(newChapter);
      setLastPosition(book.id, newChapter);
    } else if (bookIndex < BOOKS.length - 1) {
      const nextBook = BOOKS[bookIndex + 1];
      setBookIndex(bookIndex + 1);
      setChapterNumber(1);
      setLastPosition(nextBook.id, 1);
    }
  }

  // Android hardware/gesture back. Priority:
  //   1. Any screen that registered its own handler (e.g. Memory's add/drill
  //      sub-views) gets first refusal.
  //   2. Bible tab internal navigation: reader -> chapters, chapters/history
  //      -> books.
  //   3. Non-Bible tabs return to the Bible tab.
  //   4. At the Bible/books root, return false so Android exits the app.
  useEffect(() => {
    if (Platform.OS !== "android") return undefined;

    function onBackPress() {
      // 1. Let deeper screens handle their own internal back first.
      if (backRegistry.runBack()) return true;

      // 2. Bible tab internal screens.
      if (activeTab === "bible") {
        if (screen === "picker") {
          setScreen("reader");
          return true;
        }
        if (screen === "reader") {
          setScreen("books");
          return true;
        }
        if (screen === "history") {
          setScreen("books");
          return true;
        }
        if (screen === "books" && readerTabs.length > 0) {
          setScreen("reader");
          return true;
        }
        // At books root with no prior reader - allow default (exit app).
        return false;
      }

      // 3. Any other tab returns to the Bible tab.
      setActiveTab("bible");
      return true;
    }

    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => subscription.remove();
  }, [activeTab, screen, backRegistry]);

  if (isRestoring) {
    return (
      <SafeAreaView style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <StatusBar style={mode === "dark" ? "light" : "dark"} />
        <ActivityIndicator size="large" color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />

      <View style={{ flex: 1 }}>
        {activeTab === "bible" && (screen === "books" || screen === "picker") && (
          <BookChapterPicker
            currentBookId={screen === "picker" ? book.id : null}
            currentChapter={screen === "picker" ? chapterNumber : null}
            onOpenHistory={openHistory}
            onSelectChapter={(selectedBook, selectedChapter) => {
              const idx = BOOKS.findIndex((b) => b.id === selectedBook.id);
              if (idx === -1) return;
              setBookIndex(idx);
              setChapterNumber(selectedChapter);
              setInitialScrollY(0);
              setLastPosition(selectedBook.id, selectedChapter);
              if (readerTabs.length === 0) {
                const tab = { id: newTabId(), bookId: selectedBook.id, chapterNumber: selectedChapter };
                applyTabs([tab], tab.id);
              } else if (activeTabId) {
                const updated = readerTabs.map((t) =>
                  t.id === activeTabId
                    ? { ...t, bookId: selectedBook.id, chapterNumber: selectedChapter }
                    : t
                );
                applyTabs(updated, activeTabId);
              }
              setScreen("reader");
            }}
            onClose={readerTabs.length > 0 ? () => setScreen("reader") : null}
          />
        )}
        {activeTab === "bible" && screen === "history" && (
          <HistoryScreen onSelectEntry={openChapterDirect} onBack={() => setScreen("books")} />
        )}
        {activeTab === "bible" && screen === "reader" && (
          <ReaderScreen
            key={`${activeTabId}-${book.id}-${chapterNumber}`}
            book={book}
            chapterNumber={chapterNumber}
            initialScrollY={initialScrollY}
            onScrollPositionChange={handleScrollPositionChange}
            onPrev={goPrev}
            onNext={goNext}
            onBack={() => setScreen("chapters")}
            onOpenBooks={() => setScreen("picker")}
            onChromeChange={setChromeVisible}
            hasPrev={hasPrev}
            hasNext={hasNext}
            readerTabs={readerTabs}
            activeTabId={activeTabId}
            onSelectTab={handleSelectTab}
            onCloseTab={handleCloseTab}
            onAddTab={handleAddTab}
          />
        )}

        {activeTab === "stats" && (
          <StatsScreen onOpenChapter={openChapterDirect} isActive={activeTab === "stats"} />
        )}

        {activeTab === "memory" && <MemoryScreen />}

        {activeTab === "settings" && <SettingsScreen />}
      </View>

      <BottomTabBar active={activeTab} onChange={setActiveTab} visible={chromeVisible} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
});
