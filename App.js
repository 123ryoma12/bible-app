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
import DevotionalScreen from "./src/screens/DevotionalScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import BottomTabBar from "./src/components/BottomTabBar";
import { getLastPosition, setLastPosition } from "./src/data/lastPositionStore";
import { ThemeProvider, useTheme } from "./src/theme/ThemeContext";
import {
  BackHandlerProvider,
  useBackHandlerRegistry,
} from "./src/navigation/BackHandlerRegistry";

export default function App() {
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
    setScreen("reader");
    setActiveTab("bible");
    setLastPosition(entryBookId, entryChapterNumber);
  }

  const hasPrev = bookIndex > 0 || chapterNumber > 1;
  const hasNext = bookIndex < BOOKS.length - 1 || chapterNumber < book.chapterCount;

  function goPrev() {
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
            onPrev={goPrev}
            onNext={goNext}
            onBack={() => setScreen("chapters")}
            hasPrev={hasPrev}
            hasNext={hasNext}
          />
        )}

        {activeTab === "stats" && <StatsScreen onOpenChapter={openChapterDirect} />}

        {activeTab === "memory" && <MemoryScreen />}

        {activeTab === "devotional" && <DevotionalScreen />}

        {activeTab === "settings" && <SettingsScreen />}
      </View>

      <BottomTabBar active={activeTab} onChange={setActiveTab} />
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
