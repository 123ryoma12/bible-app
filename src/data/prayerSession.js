// Global prayer-session state (the countdown timer).
//
// The timer lives ABOVE the screen tree so a session keeps running while the
// user moves between the Bible, Memory, and Prayer tabs — exactly like the
// sermon player. The Prayer tab renders the full timer UI; every other tab
// shows the compact PrayerMiniBar. Both read from this one context, so there
// is never a second, drifting copy of the countdown.
//
// Deliberate rules baked in here:
//   * Ending a session early logs NOTHING and leaves the point untouched.
//     The user has to see the countdown through to 0:00 to get credit.
//   * Reaching 0:00 does not auto-complete: the session parks in a "finished"
//     state until the user confirms with the Amen button.
//   * Wall-clock based, not tick-counted, so backgrounding the app or a janky
//     JS thread can never make the countdown drift.

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
/** Counting down. */
export const RUNNING = "running";
/** Counting down, but held. */
export const PAUSED = "paused";
/** Hit 0:00 and waiting for the user to confirm with Amen. */
export const FINISHED = "finished";

export function PrayerSessionProvider({ children }) {
  // The prayer point being prayed for, or null when idle.
  const [point, setPoint] = useState(null);
  const [status, setStatus] = useState(IDLE);
  const [durationMinutes, setDurationMinutes] = useState(null);
  const [remainingMs, setRemainingMs] = useState(0);

  // Wall-clock deadline while running; remaining ms is derived from it so the
  // countdown stays accurate across backgrounding and dropped frames.
  const deadlineRef = useRef(null);
  const intervalRef = useRef(null);

  const clearTicker = useCallback(() => {
    if (intervalRef.current != null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Recompute from the deadline and stop at zero.
  const sync = useCallback(() => {
    if (deadlineRef.current == null) return;
    const left = Math.max(0, deadlineRef.current - Date.now());
    setRemainingMs(left);
    if (left <= 0) {
      deadlineRef.current = null;
      clearTicker();
      setStatus(FINISHED);
    }
  }, [clearTicker]);

  // Drive the countdown only while actually running.
  useEffect(() => {
    if (status !== RUNNING) {
      clearTicker();
      return undefined;
    }
    sync();
    intervalRef.current = setInterval(sync, 250);
    return clearTicker;
  }, [status, sync, clearTicker]);

  // Returning from the background can skip many ticks; resync immediately so
  // the displayed time is correct the instant the app is visible again.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") sync();
    });
    return () => subscription.remove();
  }, [sync]);

  useEffect(() => clearTicker, [clearTicker]);

  /** Open the timer for a prayer point without starting the countdown yet. */
  const openSession = useCallback((nextPoint) => {
    clearTicker();
    deadlineRef.current = null;
    setPoint(nextPoint);
    setDurationMinutes(null);
    setRemainingMs(0);
    setStatus(IDLE);
  }, [clearTicker]);

  /** Begin counting down for the chosen number of minutes. */
  const start = useCallback((minutes) => {
    const ms = Math.max(1, Math.round(Number(minutes) || 0)) * 60 * 1000;
    deadlineRef.current = Date.now() + ms;
    setDurationMinutes(Math.round(Number(minutes)));
    setRemainingMs(ms);
    setStatus(RUNNING);
  }, []);

  /** Hold the countdown, banking whatever time is left. */
  const pause = useCallback(() => {
    setStatus((current) => {
      if (current !== RUNNING) return current;
      const left = Math.max(0, (deadlineRef.current ?? Date.now()) - Date.now());
      deadlineRef.current = null;
      setRemainingMs(left);
      return PAUSED;
    });
  }, []);

  /** Resume from wherever the countdown was paused. */
  const resume = useCallback(() => {
    setStatus((current) => {
      if (current !== PAUSED) return current;
      deadlineRef.current = Date.now() + remainingMs;
      return RUNNING;
    });
  }, [remainingMs]);

  /** Restart the countdown from the top of the chosen duration. */
  const reset = useCallback(() => {
    if (!durationMinutes) return;
    const ms = durationMinutes * 60 * 1000;
    deadlineRef.current = null;
    setRemainingMs(ms);
    setStatus(PAUSED);
  }, [durationMinutes]);

  /** Drop back to the duration picker, discarding the countdown. */
  const clearDuration = useCallback(() => {
    clearTicker();
    deadlineRef.current = null;
    setDurationMinutes(null);
    setRemainingMs(0);
    setStatus(IDLE);
  }, [clearTicker]);

  /** Abandon the session entirely. Nothing is logged — by design. */
  const cancel = useCallback(() => {
    clearTicker();
    deadlineRef.current = null;
    setPoint(null);
    setDurationMinutes(null);
    setRemainingMs(0);
    setStatus(IDLE);
  }, [clearTicker]);

  const value = useMemo(
    () => ({
      point,
      status,
      durationMinutes,
      remainingMs,
      // A session occupies the Prayer tab (and shows the mini bar elsewhere)
      // from the moment a point is opened until it is cancelled or confirmed.
      isActive: point != null,
      // Only a countdown that ran all the way down can be confirmed.
      canConfirm: status === FINISHED,
      openSession,
      start,
      pause,
      resume,
      reset,
      clearDuration,
      cancel,
    }),
    [
      point,
      status,
      durationMinutes,
      remainingMs,
      openSession,
      start,
      pause,
      resume,
      reset,
      clearDuration,
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

/** Format milliseconds as m:ss for the countdown display. */
export function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
