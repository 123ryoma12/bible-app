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

// ---------------------------------------------------------------------------
// Synchronous theme cache — populated by preloadTheme() at app startup so
// ThemeProvider can initialise with the correct values and never flash.
// ---------------------------------------------------------------------------
let _cachedMode = null;
let _cachedFontScale = null;
let _cachedReadingFontKey = null;

export async function preloadTheme() {
  const [mode, scale, font] = await Promise.all([
    backend.getItem(THEME_KEY),
    backend.getItem(FONT_SCALE_KEY),
    backend.getItem(READING_FONT_KEY),
  ]);
  if (mode === "light" || mode === "dark") _cachedMode = mode;
  const parsed = parseFloat(scale);
  if (!Number.isNaN(parsed) && isValidScale(parsed)) _cachedFontScale = parsed;
  _cachedReadingFontKey = isReadingFontKey(font) ? font : DEFAULT_READING_FONT;
  if (font != null && !isReadingFontKey(font)) {
    await backend.setItem(READING_FONT_KEY, DEFAULT_READING_FONT);
  }
}

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(() => _cachedMode ?? "dark");
  const [fontScale, setFontScaleState] = useState(() => _cachedFontScale ?? DEFAULT_FONT_SCALE);
  const [readingFontKey, setReadingFontKeyState] = useState(() => _cachedReadingFontKey ?? DEFAULT_READING_FONT);

  // No async loading needed here — preloadTheme() was called at startup.
  // If for some reason the cache is empty (first ever launch) the defaults
  // above are sensible and no flash occurs.

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
