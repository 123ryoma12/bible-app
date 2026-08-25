import React, { useState, useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator, StyleSheet, BackHandler, Platform } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { BOOKS } from "./src/data/books";
import BookListScreen from "./src/screens/BookListScreen";
import ChapterListScreen from "./src/screens/ChapterListScreen";
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

  // Whenever we leave the reader, switch tabs, or move to another chapter,
  // force the chrome back on so it can never get "stuck" hidden.
  useEffect(() => {
    setChromeVisible(true);
  }, [activeTab, screen, bookIndex, chapterNumber]);
  const [isRestoring, setIsRestoring] = useState(true);

  // On launch, resume wherever the user last left off.
  useEffect(() => {
    let cancelled = false;
    getLastPosition()
      .then((position) => {
        if (cancelled || !position) return;
        const idx = BOOKS.findIndex((b) => b.id === position.bookId);
        if (idx === -1) return;
        setBookIndex(idx);
        setChapterNumber(position.chapterNumber);
        setInitialScrollY(position.scrollY || 0);
        setScreen("reader");
      })
      .finally(() => {
        if (!cancelled) setIsRestoring(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const book = BOOKS[bookIndex];

  function openBook(selectedBook) {
    const idx = BOOKS.findIndex((b) => b.id === selectedBook.id);
    setBookIndex(idx);
    setScreen("chapters");
  }

  function openChapter(num) {
    setChapterNumber(num);
    setInitialScrollY(0);
    setScreen("reader");
    setLastPosition(book.id, num);
  }

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
  }

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
        if (screen === "reader") {
          setScreen("chapters");
          return true;
        }
        if (screen === "chapters" || screen === "history") {
          setScreen("books");
          return true;
        }
        // At books root - allow default (exit app).
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
        {activeTab === "bible" && screen === "books" && (
          <BookListScreen onSelectBook={openBook} onOpenHistory={openHistory} />
        )}
        {activeTab === "bible" && screen === "history" && (
          <HistoryScreen onSelectEntry={openChapterDirect} onBack={() => setScreen("books")} />
        )}
        {activeTab === "bible" && screen === "chapters" && (
          <ChapterListScreen
            book={book}
            onSelectChapter={openChapter}
            onBack={() => setScreen("books")}
          />
        )}
        {activeTab === "bible" && screen === "reader" && (
          <ReaderScreen
            book={book}
            chapterNumber={chapterNumber}
            initialScrollY={initialScrollY}
            onScrollPositionChange={setLastScroll}
            onPrev={goPrev}
            onNext={goNext}
            onBack={() => setScreen("chapters")}
            onOpenBooks={() => setScreen("books")}
            onChromeChange={setChromeVisible}
            hasPrev={hasPrev}
            hasNext={hasNext}
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
