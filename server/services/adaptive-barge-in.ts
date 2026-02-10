/**
 * Adaptive Barge-In Configuration
 * 
 * Improves barge-in reliability for quiet, nervous, slow, and accented speakers
 * by using adaptive thresholds based on rolling mic baseline (noise floor).
 * 
 * Feature flags:
 * - BARGE_IN_ADAPTIVE_ENABLED (default: false)
 * - READING_MODE_PATIENCE_ENABLED (default: false)
 * - ADAPTIVE_PATIENCE_ENABLED (default: false)
 * - SESSION_GOODBYE_HARD_STOP_ENABLED (default: true)
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type GradeBandType = 'K2' | 'G3-5' | 'G6-8' | 'G9-12' | 'ADV';
export type ActivityMode = 'default' | 'reading';

export interface BargeInConfig {
  adaptiveRatio: number;      // Multiplier over baseline for adaptive trigger
  minSpeechMs: number;        // Minimum sustained speech to confirm barge-in
  rmsThresholdAbs: number;    // Absolute RMS threshold (fallback)
  peakThresholdAbs: number;   // Absolute peak threshold (fallback)
}

export interface CommonBargeInConfig {
  baselineWindowMs: number;   // Window for computing noise floor baseline
  duckGain: number;           // Volume multiplier during duck (0.25 = -12dB)
  confirmMs: number;          // Time to confirm barge-in before restoring
}

export interface AdaptivePatienceConfig {
  enabled: boolean;
  minSilenceCapMs: number;    // Hard cap for min end-of-turn silence
  maxSilenceCapMs: number;    // Hard cap for max turn silence
  graceCapMs: number;         // Hard cap for post-EOT grace
}

export interface ReadingModeConfig {
  enabled: boolean;
  minSilenceBonusMs: number;  // Added to min silence
  maxSilenceBonusMs: number;  // Added to max silence
  minSilenceCapMs: number;    // Hard cap in reading mode
  maxSilenceCapMs: number;    // Hard cap in reading mode
  stallPrompt: string;        // Stall escape prompt for reading mode
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Configuration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const COMMON_CONFIG: CommonBargeInConfig = {
  baselineWindowMs: 1500,
  duckGain: 0.25,             // ~-12dB
  confirmMs: 320,
};

const GRADE_BAND_CONFIG: Record<GradeBandType, BargeInConfig> = {
  'K2': {
    adaptiveRatio: 2.2,       // More sensitive for young learners
    minSpeechMs: 140,
    rmsThresholdAbs: 0.08,    // Keep existing thresholds as fallback
    peakThresholdAbs: 0.15,
  },
  'G3-5': {
    adaptiveRatio: 2.4,
    minSpeechMs: 160,
    rmsThresholdAbs: 0.08,
    peakThresholdAbs: 0.15,
  },
  'G6-8': {
    adaptiveRatio: 2.6,
    minSpeechMs: 170,
    rmsThresholdAbs: 0.08,
    peakThresholdAbs: 0.15,
  },
  'G9-12': {
    adaptiveRatio: 2.8,
    minSpeechMs: 180,
    rmsThresholdAbs: 0.08,
    peakThresholdAbs: 0.15,
  },
  'ADV': {
    adaptiveRatio: 3.0,       // Less sensitive for adult learners
    minSpeechMs: 190,
    rmsThresholdAbs: 0.08,
    peakThresholdAbs: 0.15,
  },
};

// Default config for unknown grade bands
const DEFAULT_BARGE_IN_CONFIG: BargeInConfig = {
  adaptiveRatio: 2.5,
  minSpeechMs: 170,
  rmsThresholdAbs: 0.08,
  peakThresholdAbs: 0.15,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Feature Flags
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function isAdaptiveBargeInEnabled(): boolean {
  return process.env.BARGE_IN_ADAPTIVE_ENABLED === 'true';
}

export function isReadingModeEnabled(): boolean {
  return process.env.READING_MODE_PATIENCE_ENABLED === 'true';
}

export function isAdaptivePatienceEnabled(): boolean {
  return process.env.ADAPTIVE_PATIENCE_ENABLED === 'true';
}

export function isGoodbyeHardStopEnabled(): boolean {
  return process.env.SESSION_GOODBYE_HARD_STOP_ENABLED !== 'false'; // Default true
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Config Getters
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function getCommonBargeInConfig(): CommonBargeInConfig {
  return { ...COMMON_CONFIG };
}

export function getBargeInConfig(gradeBand: string | null): BargeInConfig {
  if (!gradeBand) return DEFAULT_BARGE_IN_CONFIG;
  
  const normalizedBand = normalizeGradeBand(gradeBand);
  return GRADE_BAND_CONFIG[normalizedBand] || DEFAULT_BARGE_IN_CONFIG;
}

export function getReadingModeConfig(): ReadingModeConfig {
  return {
    enabled: isReadingModeEnabled(),
    minSilenceBonusMs: 250,
    maxSilenceBonusMs: 800,
    minSilenceCapMs: 1200,
    maxSilenceCapMs: 6000,
    stallPrompt: "Want a moment to finish, or would you like help sounding it out?",
  };
}

export function getAdaptivePatienceConfig(): AdaptivePatienceConfig {
  return {
    enabled: isAdaptivePatienceEnabled(),
    minSilenceCapMs: 1000,
    maxSilenceCapMs: 5000,
    graceCapMs: 400,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Grade Band Normalization
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function normalizeGradeBand(gradeBand: string): GradeBandType {
  const normalized = gradeBand.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  if (normalized.includes('k2') || normalized.includes('k-2') || normalized === 'k' || normalized === '12') {
    return 'K2';
  }
  if (normalized.includes('35') || normalized.includes('g35')) {
    return 'G3-5';
  }
  if (normalized.includes('68') || normalized.includes('g68') || normalized.includes('middle')) {
    return 'G6-8';
  }
  if (normalized.includes('912') || normalized.includes('g912') || normalized.includes('high')) {
    return 'G9-12';
  }
  if (normalized.includes('adv') || normalized.includes('college') || normalized.includes('adult')) {
    return 'ADV';
  }
  
  // Default fallback based on existing age group patterns
  if (normalized.includes('grades') && normalized.includes('12')) return 'K2';
  if (normalized.includes('grades') && normalized.includes('35')) return 'G3-5';
  if (normalized.includes('grades') && normalized.includes('68')) return 'G6-8';
  if (normalized.includes('grades') && normalized.includes('912')) return 'G9-12';
  
  return 'G6-8'; // Middle-ground default
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Rolling Baseline Calculator
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface BaselineState {
  samples: number[];
  timestamps: number[];
  windowMs: number;
}

export function createBaselineState(windowMs: number = COMMON_CONFIG.baselineWindowMs): BaselineState {
  return {
    samples: [],
    timestamps: [],
    windowMs,
  };
}

export function updateBaseline(state: BaselineState, rms: number): void {
  const now = Date.now();
  
  // Add new sample
  state.samples.push(rms);
  state.timestamps.push(now);
  
  // Remove old samples outside window
  const cutoff = now - state.windowMs;
  while (state.timestamps.length > 0 && state.timestamps[0] < cutoff) {
    state.samples.shift();
    state.timestamps.shift();
  }
  
  // Keep max 100 samples to prevent memory issues
  if (state.samples.length > 100) {
    state.samples = state.samples.slice(-100);
    state.timestamps = state.timestamps.slice(-100);
  }
}

export function getBaselineMedian(state: BaselineState): number {
  if (state.samples.length === 0) return 0.01; // Default low baseline
  
  // Calculate median (p50) for noise resistance
  const sorted = [...state.samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Adaptive Patience State
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface AdaptivePatienceState {
  patienceScore: number;  // 0.0 - 1.0
  hesitationCount: number;
  continuationCount: number;
  interruptAttempts: number;
}

export function createAdaptivePatienceState(): AdaptivePatienceState {
  return {
    patienceScore: 0.3,   // Start with slight patience
    hesitationCount: 0,
    continuationCount: 0,
    interruptAttempts: 0,
  };
}

// Hesitation markers
const HESITATION_PATTERNS = [
  /\b(um|uh|uhh|umm)\b/i,
  /\b(wait|hold on|let me think)\b/i,
  /\b(i think|maybe|hmm|hm)\b/i,
];

// Continuation endings (without terminal punctuation)
const CONTINUATION_PATTERNS = [
  /\b(and|so|because|then|but)\s*$/i,
  /\b(like|that|which|when|if)\s*$/i,
];

export function calculateSignalScore(transcript: string): number {
  let signals = 0;
  let total = 3; // Number of signal types checked
  
  // Check hesitation markers
  for (const pattern of HESITATION_PATTERNS) {
    if (pattern.test(transcript)) {
      signals += 1;
      break;
    }
  }
  
  // Check continuation endings
  for (const pattern of CONTINUATION_PATTERNS) {
    if (pattern.test(transcript)) {
      signals += 1;
      break;
    }
  }
  
  // Check for lack of terminal punctuation (incomplete thought)
  if (!/[.!?]$/.test(transcript.trim())) {
    signals += 0.5;
  }
  
  return Math.min(signals / total, 1.0);
}

export function updateAdaptivePatience(
  state: AdaptivePatienceState,
  transcript: string,
  wasInterruptAttempt: boolean = false
): void {
  const signalScore = calculateSignalScore(transcript);
  
  // Track interrupt attempts
  if (wasInterruptAttempt) {
    state.interruptAttempts++;
  }
  
  // Update patience score with exponential moving average
  // patienceScore = 0.7 * old + 0.3 * new
  state.patienceScore = Math.max(0, Math.min(1, 
    0.7 * state.patienceScore + 0.3 * signalScore
  ));
}

export function getAdjustedPatienceParams(
  state: AdaptivePatienceState,
  config: AdaptivePatienceConfig,
  activityMode: ActivityMode = 'default'
): { minSilenceMs: number; maxSilenceMs: number; graceMs: number } {
  if (!config.enabled) {
    return { minSilenceMs: 0, maxSilenceMs: 0, graceMs: 0 };
  }
  
  // Base adjustments from patience score
  let minSilenceBonus = Math.round(state.patienceScore * 250);
  let maxSilenceBonus = Math.round(state.patienceScore * 900);
  let graceBonus = Math.round(state.patienceScore * 120);
  
  // Apply reading mode overlay if active
  if (activityMode === 'reading' && isReadingModeEnabled()) {
    const readingConfig = getReadingModeConfig();
    minSilenceBonus += readingConfig.minSilenceBonusMs;
    maxSilenceBonus += readingConfig.maxSilenceBonusMs;
  }
  
  // Apply caps
  const readingConfig = getReadingModeConfig();
  const caps = activityMode === 'reading' && isReadingModeEnabled()
    ? { min: readingConfig.minSilenceCapMs, max: readingConfig.maxSilenceCapMs }
    : { min: config.minSilenceCapMs, max: config.maxSilenceCapMs };
  
  return {
    minSilenceMs: Math.min(minSilenceBonus, caps.min),
    maxSilenceMs: Math.min(maxSilenceBonus, caps.max),
    graceMs: Math.min(graceBonus, config.graceCapMs),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Barge-In Evaluation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface BargeInEvalResult {
  triggered: boolean;
  adaptiveTriggered: boolean;
  absoluteTriggered: boolean;
  reason: string;
  rms: number;
  peak: number;
  baseline: number;
  adaptiveThreshold: number;
}

export function evaluateBargeIn(
  rms: number,
  peak: number,
  baselineState: BaselineState,
  gradeBand: string | null,
  tutorPlaying: boolean
): BargeInEvalResult {
  const config = getBargeInConfig(gradeBand);
  const baseline = getBaselineMedian(baselineState);
  const adaptiveEnabled = isAdaptiveBargeInEnabled();
  
  let adaptiveTriggered = false;
  let absoluteTriggered = false;
  let adaptiveThreshold: number;

  if (adaptiveEnabled) {
    adaptiveThreshold = baseline * config.adaptiveRatio;
    adaptiveTriggered = rms >= adaptiveThreshold;
    absoluteTriggered = rms >= config.rmsThresholdAbs || peak >= config.peakThresholdAbs;
  } else {
    // FIX 2B: When adaptive=false, use explicit fixed threshold
    const fixedRmsThreshold = Math.max(0.03, baseline * 3.0);
    adaptiveThreshold = fixedRmsThreshold;
    absoluteTriggered = rms >= fixedRmsThreshold;
    console.log(`[BargeIn] fixedThresholdComputed noiseFloor=${baseline.toFixed(4)} threshold=${fixedRmsThreshold.toFixed(4)} rms=${rms.toFixed(4)} peak=${peak.toFixed(4)} triggered=${absoluteTriggered}`);
  }
  
  const triggered = tutorPlaying && (adaptiveTriggered || absoluteTriggered);
  
  let reason = 'none';
  if (triggered) {
    if (adaptiveTriggered && absoluteTriggered) {
      reason = 'adaptive_and_absolute';
    } else if (adaptiveTriggered) {
      reason = 'adaptive';
    } else {
      reason = adaptiveEnabled ? 'absolute' : 'fixed_threshold';
    }
  } else if (!tutorPlaying) {
    reason = 'tutor_not_playing';
  }
  
  return {
    triggered,
    adaptiveTriggered,
    absoluteTriggered,
    reason,
    rms,
    peak,
    baseline,
    adaptiveThreshold,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Logging
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function logBargeInEval(
  sessionId: string,
  gradeBand: string,
  activityMode: ActivityMode,
  result: BargeInEvalResult,
  duckApplied: boolean,
  confirmedInterrupt: boolean,
  stoppedPlayback: boolean
): void {
  console.log('[barge_in_eval]', JSON.stringify({
    sessionId: sessionId.substring(0, 8),
    gradeBand,
    tutorPlaying: true,
    activityMode,
    rms: result.rms.toFixed(4),
    peak: result.peak.toFixed(4),
    baseline: result.baseline.toFixed(4),
    adaptiveRatio: result.adaptiveThreshold / result.baseline,
    adaptiveTriggered: result.adaptiveTriggered,
    absoluteTriggered: result.absoluteTriggered,
    duckApplied,
    confirmedInterrupt,
    stoppedPlayback,
    reason: result.reason,
  }));
}

export function logAdaptivePatience(
  sessionId: string,
  gradeBand: string,
  activityMode: ActivityMode,
  state: AdaptivePatienceState,
  signalScore: number,
  applied: { minSilenceMs: number; maxSilenceMs: number; graceMs: number }
): void {
  console.log('[adaptive_patience]', JSON.stringify({
    sessionId: sessionId.substring(0, 8),
    gradeBand,
    activityMode,
    patienceScore: state.patienceScore.toFixed(3),
    signalScore: signalScore.toFixed(3),
    appliedMinSilenceMs: applied.minSilenceMs,
    appliedMaxSilenceMs: applied.maxSilenceMs,
    appliedGraceMs: applied.graceMs,
  }));
}
