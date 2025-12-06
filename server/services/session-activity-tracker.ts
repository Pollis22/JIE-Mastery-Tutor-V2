/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 * 
 * This source code is confidential and proprietary.
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */


/**
 * Session Activity Tracker
 * Tracks user activity in voice sessions and auto-ends sessions after inactivity timeout
 */

interface ActivityTracker {
  sessionId: string;
  userId: string;
  lastActivity: number;
  warningTimeoutId?: NodeJS.Timeout;
  finalTimeoutId?: NodeJS.Timeout;
  warningCallback?: () => void;
  endCallback?: () => Promise<void>;
}

// Map of userId -> activity tracker
const sessionActivity = new Map<string, ActivityTracker>();

const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes in milliseconds - auto-end session to prevent accidental minute consumption
const WARNING_TIME = 4 * 60 * 1000; // 4 minutes - send warning before auto-end

/**
 * Start tracking activity for a session
 */
export function startActivityTracking(
  userId: string,
  sessionId: string,
  warningCallback?: () => void,
  endCallback?: () => Promise<void>
): void {
  console.log(`⏱️ [ActivityTracker] Starting tracking for session ${sessionId}`);
  
  const tracker: ActivityTracker = {
    userId,
    sessionId,
    lastActivity: Date.now(),
    warningCallback,
    endCallback,
  };
  
  sessionActivity.set(userId, tracker);
  scheduleTimeouts(userId);
}

/**
 * Update activity timestamp (call this on any user interaction)
 */
export function updateActivity(userId: string): void {
  const tracker = sessionActivity.get(userId);
  if (!tracker) return;
  
  console.log(`🔄 [ActivityTracker] Activity detected for user ${userId}`);
  
  tracker.lastActivity = Date.now();
  
  // Clear existing timeouts
  if (tracker.warningTimeoutId) {
    clearTimeout(tracker.warningTimeoutId);
  }
  if (tracker.finalTimeoutId) {
    clearTimeout(tracker.finalTimeoutId);
  }
  
  // Reschedule timeouts
  scheduleTimeouts(userId);
}

/**
 * Schedule warning and final timeouts
 */
function scheduleTimeouts(userId: string): void {
  const tracker = sessionActivity.get(userId);
  if (!tracker) return;
  
  // Warning timeout (at 4 minutes)
  tracker.warningTimeoutId = setTimeout(() => {
    console.log(`⚠️ [ActivityTracker] Sending inactivity warning for user ${userId}`);
    if (tracker.warningCallback) {
      tracker.warningCallback();
    }
  }, WARNING_TIME);
  
  // Final timeout (at 5 minutes)
  tracker.finalTimeoutId = setTimeout(async () => {
    console.log(`⏰ [ActivityTracker] Session timeout for user ${userId} - no activity for 5 minutes`);
    if (tracker.endCallback) {
      await tracker.endCallback();
    }
    // Clean up
    stopActivityTracking(userId);
  }, INACTIVITY_TIMEOUT);
}

/**
 * Stop tracking activity for a user (call when session ends)
 */
export function stopActivityTracking(userId: string): void {
  const tracker = sessionActivity.get(userId);
  if (!tracker) return;
  
  console.log(`🛑 [ActivityTracker] Stopping tracking for user ${userId}`);
  
  // Clear all timeouts
  if (tracker.warningTimeoutId) {
    clearTimeout(tracker.warningTimeoutId);
  }
  if (tracker.finalTimeoutId) {
    clearTimeout(tracker.finalTimeoutId);
  }
  
  sessionActivity.delete(userId);
}

/**
 * Get current activity info for a user
 */
export function getActivityInfo(userId: string): { 
  sessionId: string; 
  lastActivity: number;
  inactivitySeconds: number;
} | null {
  const tracker = sessionActivity.get(userId);
  if (!tracker) return null;
  
  const inactivitySeconds = Math.floor((Date.now() - tracker.lastActivity) / 1000);
  
  return {
    sessionId: tracker.sessionId,
    lastActivity: tracker.lastActivity,
    inactivitySeconds,
  };
}

/**
 * Check if user has an active session being tracked
 */
export function isTracking(userId: string): boolean {
  return sessionActivity.has(userId);
}
