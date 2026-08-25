import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { backend } from "../data/storageBackend";
import { lightColors, darkColors } from "./palette";
import { DEFAULT_READING_FONT, isReadingFontKey } from "./fonts";

const THEME_KEY = "themeMode";
const FONT_SCALE_KEY = "fontScale";
const READING_FONT_KEY = "readingFont";

// Reading size uses small, predictable increments rather than named presets.
// The bounds prevent both unusably tiny text and layouts that overflow at very
// large accessibility sizes.
export const FONT_SCALE_MIN = 0.75;
export const FONT_SCALE_MAX = 1.5;
export const FONT_SCALE_STEP = 0.05;

const DEFAULT_FONT_SCALE = 1.0;

function isValidScale(v) {
  return Number.isFinite(v) && v >= FONT_SCALE_MIN && v <= FONT_SCALE_MAX;
}

function normalizeScale(v) {
  const clamped = Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, v));
  return Math.round(clamped * 100) / 100;
}

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState("light"); // "light" | "dark"
  const [fontScale, setFontScaleState] = useState(DEFAULT_FONT_SCALE);
  const [readingFontKey, setReadingFontKeyState] = useState(DEFAULT_READING_FONT);

  useEffect(() => {
    let cancelled = false;
    backend.getItem(THEME_KEY).then((saved) => {
      if (!cancelled && (saved === "light" || saved === "dark")) {
        setModeState(saved);
      }
    });
    backend.getItem(FONT_SCALE_KEY).then((saved) => {
      const parsed = parseFloat(saved);
      if (!cancelled && !Number.isNaN(parsed) && isValidScale(parsed)) {
        setFontScaleState(parsed);
      }
    });
    backend.getItem(READING_FONT_KEY).then((saved) => {
      if (!cancelled && isReadingFontKey(saved)) {
        setReadingFontKeyState(saved);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function setMode(nextMode) {
    setModeState(nextMode);
    backend.setItem(THEME_KEY, nextMode);
  }

  function setFontScale(nextScale) {
    if (!Number.isFinite(nextScale)) return;
    const normalized = normalizeScale(nextScale);
    setFontScaleState(normalized);
    backend.setItem(FONT_SCALE_KEY, String(normalized));
  }

  function setReadingFontKey(nextKey) {
    if (!isReadingFontKey(nextKey)) return;
    setReadingFontKeyState(nextKey);
    backend.setItem(READING_FONT_KEY, nextKey);
  }

  const colors = mode === "dark" ? darkColors : lightColors;
  const value = useMemo(
    () => ({
      mode,
      colors,
      setMode,
      fontScale,
      setFontScale,
      readingFontKey,
      setReadingFontKey,
    }),
    [mode, fontScale, readingFontKey]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
