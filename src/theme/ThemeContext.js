import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { backend } from "../data/storageBackend";
import { lightColors, darkColors } from "./palette";

const THEME_KEY = "themeMode";
const FONT_SCALE_KEY = "fontScale";

// Discrete font-size steps the reader can cycle through. Keeping this as a
// fixed ladder (rather than free-form) keeps layouts predictable and gives the
// Settings UI clear, labelled options.
export const FONT_SCALES = [
  { key: "small", label: "Small", value: 0.85 },
  { key: "medium", label: "Medium", value: 1.0 },
  { key: "large", label: "Large", value: 1.15 },
  { key: "xlarge", label: "Extra Large", value: 1.3 },
];

const DEFAULT_FONT_SCALE = 1.0;

function isValidScale(v) {
  return FONT_SCALES.some((s) => s.value === v);
}

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState("light"); // "light" | "dark"
  const [fontScale, setFontScaleState] = useState(DEFAULT_FONT_SCALE);

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
    return () => {
      cancelled = true;
    };
  }, []);

  function setMode(nextMode) {
    setModeState(nextMode);
    backend.setItem(THEME_KEY, nextMode);
  }

  function setFontScale(nextScale) {
    if (!isValidScale(nextScale)) return;
    setFontScaleState(nextScale);
    backend.setItem(FONT_SCALE_KEY, String(nextScale));
  }

  const colors = mode === "dark" ? darkColors : lightColors;
  const value = useMemo(
    () => ({ mode, colors, setMode, fontScale, setFontScale }),
    [mode, fontScale]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
