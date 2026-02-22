export const VOICE_TIMING = {
  // Silence detection - OPTIMIZED FOR EDUCATIONAL TUTORING (Dec 11, 2025)
  // Students need 2-3 seconds to formulate complex thoughts without interruption
  SILENCE_DEBOUNCE_MS: 2500,           // Was 1200, allows natural mid-sentence pauses
  POST_INTERRUPTION_BUFFER_MS: 2000,
  
  ACCUMULATION_DELAY_MS: 2500,
  PARTIAL_TRANSCRIPT_TIMEOUT_MS: 3000,
  
  KEEPALIVE_INTERVAL_MS: 5000,
  RECONNECT_DELAY_MS: 1000,
  RECONNECT_MAX_DELAY_MS: 10000,
  RECONNECT_MAX_ATTEMPTS: 5,
  
  AUDIO_CHUNK_MS: 100,
  AUDIO_QUEUE_MAX_CHUNKS: 50,
  
  MIC_RECOVERY_STAGE1_DELAY_MS: 500,
  MIC_RECOVERY_STAGE2_DELAY_MS: 1000,
  MIC_RECOVERY_STAGE3_DELAY_MS: 1500,
  MIC_RECOVERY_MAX_ATTEMPTS: 3,
  
  // Mic track watchdog - proactive health monitoring
  // Feature flag: VITE_MIC_WATCHDOG_ENABLED (default: false)
  MIC_WATCHDOG_INTERVAL_MS: 5000,  // Check track health every 5 seconds
  
  INACTIVITY_WARNING_MS: 240000,
  INACTIVITY_TIMEOUT_MS: 300000,
  
  // Deepgram settings - INCREASED FOR EDUCATIONAL CONTEXT (Dec 11, 2025)
  DEEPGRAM_UTTERANCE_END_MS: 2500,     // Was 2000, more time for natural pauses
  DEEPGRAM_ENDPOINTING_MS: 2000,       // Was 1200, less aggressive end-of-speech detection
} as const;

export const VOICE_THRESHOLDS = {
  SILENCE_RMS_THRESHOLD: 0.01,
  SPEECH_RMS_THRESHOLD: 0.02,
  
  MAX_TRANSCRIPT_MESSAGES: 200,
  TRANSCRIPT_TRIM_THRESHOLD: 250,
  
  MIC_GAIN_MULTIPLIER: 100,
} as const;

export type GradeBandType = 'K2' | 'G3-5' | 'G6-8' | 'G9-12' | 'ADV';

export const SILERO_BARGE_IN = {
  DUCK_GAIN: 0.056, // -25dB = 10^(-25/20) ≈ 0.056
  DUCK_FADE_MS: 0.02, // 20ms fade for duck/unduck transitions
  CONFIRM_THRESHOLDS: {
    'K2': 600,
    'G3-5': 500,
    'G6-8': 400,
    'G9-12': 150,
    'ADV': 150,
  } as Record<GradeBandType, number>,
  DEFAULT_CONFIRM_MS: 400,
  IMMUNITY_AFTER_TURN_COMMIT_MS: {
    'K2': 700,
    'G3-5': 600,
    'G6-8': 500,
    'G9-12': 300,
    'ADV': 300,
  } as Record<GradeBandType, number>,
  DEFAULT_IMMUNITY_MS: 500,
} as const;

export const ADAPTIVE_BARGE_IN = {
  COMMON: {
    BASELINE_WINDOW_MS: 1500,
    DUCK_GAIN: 0.25,
    CONFIRM_MS: 320,
  },
  GRADE_BANDS: {
    'K2': { adaptiveRatio: 2.2, minSpeechMs: 140, rmsThreshold: 0.08, peakThreshold: 0.15 },
    'G3-5': { adaptiveRatio: 2.4, minSpeechMs: 160, rmsThreshold: 0.08, peakThreshold: 0.15 },
    'G6-8': { adaptiveRatio: 2.6, minSpeechMs: 170, rmsThreshold: 0.08, peakThreshold: 0.15 },
    'G9-12': { adaptiveRatio: 2.8, minSpeechMs: 180, rmsThreshold: 0.08, peakThreshold: 0.15 },
    'ADV': { adaptiveRatio: 3.0, minSpeechMs: 190, rmsThreshold: 0.08, peakThreshold: 0.15 },
  } as Record<GradeBandType, { adaptiveRatio: number; minSpeechMs: number; rmsThreshold: number; peakThreshold: number }>,
  DEFAULT: { adaptiveRatio: 2.5, minSpeechMs: 170, rmsThreshold: 0.08, peakThreshold: 0.15 },
} as const;

export const VOICE_MESSAGES = {
  MIC_PERMISSION_DENIED: 'Microphone access denied. Please allow microphone access in your browser settings.',
  MIC_NOT_FOUND: 'No microphone found. Please connect a microphone and try again.',
  MIC_RECOVERY_FAILED: 'Could not recover microphone. Please check your audio device and refresh the page.',
  CONNECTION_LOST: 'Connection lost. Attempting to reconnect...',
  CONNECTION_RESTORED: 'Connection restored.',
  SESSION_TIMEOUT_WARNING: 'Session will end in 1 minute due to inactivity.',
  SESSION_TIMEOUT: 'Session ended due to inactivity.',
  BROWSER_NOT_SUPPORTED: 'Your browser does not support voice recording. Please use Chrome, Firefox, or Edge.',
} as const;

export const EXCLUDED_DEVICE_PATTERNS = [
  'stereo mix',
  'what u hear',
  'wave out',
  'loopback',
  'virtual',
  'cable',
] as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TURN-TAKING FEATURE FLAGS (Jan 2026)
// Fine-tune voice turn-taking reliability
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const TURN_TAKING_FLAGS = {
  // Ghost turn guardrails - blocks empty/junk turns from reaching LLM
  GHOST_GUARD_ENABLED: true,
  
  // Bypass cooldown for barge-in when tutor is speaking
  BARGE_IN_COOLDOWN_BYPASS_ENABLED: true,
  
  // Post-utterance grace period for turn coalescing
  POST_UTTERANCE_GRACE_ENABLED: true,
  POST_UTTERANCE_GRACE_MS: 450,
  
  // Minimum characters for a valid student turn
  MIN_TURN_CHARS: 3,
  
  // Minimum sustained speech for barge-in during tutor playback (ms)
  MIN_BARGEIN_SPEECH_MS: 250,
  
  // Maximum cooldown for barge-in path (ms) - much shorter than student turn cooldown
  BARGE_IN_MAX_COOLDOWN_MS: 50,
  
  // Duplicate transcript detection window (ms)
  DUPLICATE_WINDOW_MS: 2000,
} as const;

// Filler words to ignore when checking for content
export const FILLER_WORDS = ['um', 'uh', 'hmm', 'hm', 'ah', 'er', 'like', 'you know'] as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// OLDER_STUDENTS PROFILE (Feb 2026)
// Single shared profile for Grade 6-8, Grade 9-12, and College/Adult
// Fixes: choppy tutor audio (false interruptions), student cut off mid-thought
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export interface OlderStudentsProfile {
  minSpeechMs: number;              // Minimum continuous speech before "end" is valid
  ignoreSpeechEndUnderMs: number;   // Ignore speech_end if duration below this
  ignoreSpeechEndIfDurationZero: boolean;  // Hard block duration=0 speech ends
  coalesceWindowMs: number;         // Window to merge rapid speech events
  continuationGraceMs: number;      // Extra wait on continuation phrases (bounded)
  maxAdditionalWaitMs: number;      // Cap on extra waiting to avoid sluggishness
}

export const OLDER_STUDENTS_PROFILE: OlderStudentsProfile = {
  minSpeechMs: 400,                 // Minimum 400ms of continuous speech before "end" is valid
  ignoreSpeechEndUnderMs: 250,      // Ignore speech_end if duration < 250ms
  ignoreSpeechEndIfDurationZero: true,  // Hard block duration=0 events
  coalesceWindowMs: 3200,           // 3.2s window to merge speech segments (was 2200ms)
  continuationGraceMs: 1200,        // 1.2s extra wait on continuation cues
  maxAdditionalWaitMs: 1500,        // Cap extra wait at 1.5s total
};

// Continuation phrases that indicate student wants more time
export const CONTINUATION_PHRASES = [
  'hold on',
  'wait',
  "i wasn't finished",
  "i'm not finished",
  'let me think',
  'um',
  'uh',
  'so',
  'because',
  'and',
  'but',
  'also',
  'actually',
  'well',
  'hmm',
  'okay so',
  'like',
] as const;

// Allowed interruption reasons that can stop tutor audio
export const VALID_INTERRUPTION_REASONS = [
  'barge_in',
  'user_speech',
  'server_turn_detected',
] as const;

// Check if a grade band is OLDER_STUDENTS (Grade 6+ uses shared profile)
export function isOlderStudentsBand(gradeBand: string | null | undefined): boolean {
  if (!gradeBand) return false;
  const normalized = gradeBand.toUpperCase().replace(/[^A-Z0-9-]/g, '');
  return normalized === 'G6-8' || normalized === 'G9-12' || normalized === 'ADV' || 
         normalized === '6-8' || normalized === '9-12' || normalized === 'COLLEGE';
}
