import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { backend } from "../data/storageBackend";
import { lightColors, darkColors } from "./palette";

const THEME_KEY = "themeMode";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState("light"); // "light" | "dark"

  useEffect(() => {
    let cancelled = false;
    backend.getItem(THEME_KEY).then((saved) => {
      if (!cancelled && (saved === "light" || saved === "dark")) {
        setModeState(saved);
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

  const colors = mode === "dark" ? darkColors : lightColors;
  const value = useMemo(() => ({ mode, colors, setMode }), [mode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
