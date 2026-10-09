// Global prayer-session state (the count-up timer).
//
// The timer lives ABOVE the screen tree so a session keeps running while the
// user moves between the Bible, Memory, and Prayer tabs — exactly like the
// sermon player. The Prayer tab renders the full timer UI; every other tab
// shows the compact PrayerMiniBar. Both read from this one context.
//
// Deliberate rules baked in here:
//   * The user taps "Begin" to start — no duration is chosen upfront.
//   * The timer counts UP from 0:00.
//   * "Amen" is available at any time once the timer is running or paused.
//   * Wall-clock based, not tick-counted, so backgrounding the app or a janky
//     JS thread can never make the elapsed time drift.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";

const PrayerSessionContext = createContext(null);

/** No session running. */
export const IDLE = "idle";
/** Counting up. */
export const RUNNING = "running";
/** Counting up, but held. */
export const PAUSED = "paused";

export function PrayerSessionProvider({ children }) {
  // The prayer point being prayed for, or null when idle.
  const [point, setPoint] = useState(null);
  const [status, setStatus] = useState(IDLE);
  // Displayed elapsed ms — only updated when the displayed second changes.
  const [elapsedMs, setElapsedMs] = useState(0);

  // Wall-clock timestamp when the current running segment started.
  // null when paused or idle.
  const startRef = useRef(null);
  // Ms banked from all completed segments (paused time excluded).
  const bankedRef = useRef(0);
  // The last whole-second value we pushed to state, to avoid needless renders.
  const lastSecRef = useRef(-1);
  const intervalRef = useRef(null);

  const clearTicker = useCallback(() => {
    if (intervalRef.current != null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Read the true elapsed ms right now (does not mutate anything).
  const readElapsed = useCallback(() => {
    const running = startRef.current != null ? Date.now() - startRef.current : 0;
    return bankedRef.current + running;
  }, []);

  // Push elapsed to state only when the displayed second ticks over.
  const sync = useCallback(() => {
    const ms = readElapsed();
    const sec = Math.floor(ms / 1000);
    if (sec !== lastSecRef.current) {
      lastSecRef.current = sec;
      setElapsedMs(ms);
    }
  }, [readElapsed]);

  // Drive the count-up only while actually running.
  useEffect(() => {
    if (status !== RUNNING) {
      clearTicker();
      return undefined;
    }
    // Kick immediately so the display doesn't lag on resume.
    sync();
    intervalRef.current = setInterval(sync, 250);
    return clearTicker;
  }, [status, sync, clearTicker]);

  // Returning from the background can skip many ticks; resync immediately.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") sync();
    });
    return () => subscription.remove();
  }, [sync]);

  useEffect(() => clearTicker, [clearTicker]);

  /** Open the timer for a prayer point without starting the count-up yet. */
  const openSession = useCallback((nextPoint) => {
    clearTicker();
    startRef.current = null;
    bankedRef.current = 0;
    lastSecRef.current = -1;
    setPoint(nextPoint);
    setElapsedMs(0);
    setStatus(IDLE);
  }, [clearTicker]);

  /** Begin counting up. */
  const start = useCallback(() => {
    bankedRef.current = 0;
    lastSecRef.current = -1;
    startRef.current = Date.now();
    setElapsedMs(0);
    setStatus(RUNNING);
  }, []);

  /** Hold the count-up, banking elapsed time so far. */
  const pause = useCallback(() => {
    setStatus((current) => {
      if (current !== RUNNING) return current;
      // Bank the segment that just ended before clearing the start reference.
      if (startRef.current != null) {
        bankedRef.current += Date.now() - startRef.current;
        startRef.current = null;
      }
      setElapsedMs(bankedRef.current);
      return PAUSED;
    });
  }, []);

  /** Resume counting up from wherever it was paused. */
  const resume = useCallback(() => {
    setStatus((current) => {
      if (current !== PAUSED) return current;
      startRef.current = Date.now();
      return RUNNING;
    });
  }, []);

  /** Abandon the session entirely. Nothing is logged — by design. */
  const cancel = useCallback(() => {
    clearTicker();
    startRef.current = null;
    bankedRef.current = 0;
    lastSecRef.current = -1;
    setPoint(null);
    setElapsedMs(0);
    setStatus(IDLE);
  }, [clearTicker]);

  const value = useMemo(
    () => ({
      point,
      status,
      elapsedMs,
      // Live read of elapsed ms — use this when logging (e.g. on Amen tap)
      // so you always get the true value, not a stale render snapshot.
      readElapsed,
      // A session occupies the Prayer tab (and shows the mini bar elsewhere)
      // from the moment a point is opened until it is cancelled or confirmed.
      isActive: point != null,
      // Amen is available the moment the timer has been started.
      canConfirm: status === RUNNING || status === PAUSED,
      openSession,
      start,
      pause,
      resume,
      cancel,
    }),
    [
      point,
      status,
      elapsedMs,
      readElapsed,
      openSession,
      start,
      pause,
      resume,
      cancel,
    ]
  );

  return (
    <PrayerSessionContext.Provider value={value}>
      {children}
    </PrayerSessionContext.Provider>
  );
}

export function usePrayerSession() {
  const ctx = useContext(PrayerSessionContext);
  if (!ctx) {
    throw new Error("usePrayerSession must be used inside a PrayerSessionProvider");
  }
  return ctx;
}

/** Format milliseconds as m:ss for the elapsed-time display. */
export function formatCountup(ms) {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Elapsed milliseconds converted to whole seconds (minimum 1). */
export function elapsedSeconds(ms) {
  return Math.max(1, Math.round(ms / 1000));
}
