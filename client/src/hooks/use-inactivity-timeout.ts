import { useEffect, useRef, useState, useCallback } from "react";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;   // 30 minutes of no activity
const WARNING_DURATION_MS = 2 * 60 * 1000; // 2-minute countdown before auto-logout

/**
 * Tracks user inactivity (mouse, keyboard, touch, scroll).
 * After IDLE_TIMEOUT_MS of silence, shows a warning.
 * If user doesn't respond within WARNING_DURATION_MS, triggers logout.
 * 
 * Active voice sessions are excluded — the voice WebSocket heartbeat
 * will keep the server session alive via rolling cookies, and we don't
 * want a modal popping up mid-tutoring.
 */
export function useInactivityTimeout(isAuthenticated: boolean) {
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(Math.floor(WARNING_DURATION_MS / 1000));
  
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const warningStartRef = useRef<number | null>(null);

  const clearAllTimers = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  const resetIdleTimer = useCallback(() => {
    // If warning is already showing, user activity dismisses it
    if (showWarning) {
      setShowWarning(false);
      warningStartRef.current = null;
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    }

    // Clear existing idle timer
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }

    // Don't start timer if not authenticated
    if (!isAuthenticated) return;

    // Check if a voice session is active — skip idle timeout during tutoring
    const voiceActive = document.querySelector('[data-voice-active="true"]');
    if (voiceActive) return;

    // Start new idle timer
    idleTimerRef.current = setTimeout(() => {
      // Double-check voice isn't active when timer fires
      const voiceStillActive = document.querySelector('[data-voice-active="true"]');
      if (voiceStillActive) {
        resetIdleTimer();
        return;
      }
      
      setShowWarning(true);
      setSecondsLeft(Math.floor(WARNING_DURATION_MS / 1000));
      warningStartRef.current = Date.now();

      // Start countdown
      countdownRef.current = setInterval(() => {
        if (!warningStartRef.current) return;
        const elapsed = Date.now() - warningStartRef.current;
        const remaining = Math.max(0, Math.ceil((WARNING_DURATION_MS - elapsed) / 1000));
        setSecondsLeft(remaining);

        if (remaining <= 0) {
          clearInterval(countdownRef.current!);
          countdownRef.current = null;
        }
      }, 1000);
    }, IDLE_TIMEOUT_MS);
  }, [isAuthenticated, showWarning, clearAllTimers]);

  // Has the countdown expired?
  const isExpired = showWarning && secondsLeft <= 0;

  // Dismiss warning (user clicked "I'm still here")
  const dismissWarning = useCallback(() => {
    setShowWarning(false);
    warningStartRef.current = null;
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    resetIdleTimer();
  }, [resetIdleTimer]);

  useEffect(() => {
    if (!isAuthenticated) {
      clearAllTimers();
      setShowWarning(false);
      return;
    }

    const events: (keyof WindowEventMap)[] = [
      "mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"
    ];

    // Throttle to avoid excessive timer resets
    let lastReset = 0;
    const throttledReset = () => {
      const now = Date.now();
      if (now - lastReset > 5000) { // Only reset every 5 seconds max
        lastReset = now;
        resetIdleTimer();
      }
    };

    events.forEach((event) => window.addEventListener(event, throttledReset, { passive: true }));

    // Initial timer start
    resetIdleTimer();

    return () => {
      events.forEach((event) => window.removeEventListener(event, throttledReset));
      clearAllTimers();
    };
  }, [isAuthenticated, resetIdleTimer, clearAllTimers]);

  return { showWarning, secondsLeft, isExpired, dismissWarning };
}
