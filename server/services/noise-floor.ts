/**
 * Noise Floor Service
 * 
 * Provides per-session rolling noise-floor baseline measurement for robust
 * speech detection in noisy environments.
 * 
 * Features:
 * - Rolling RMS baseline during non-speech periods
 * - Speech detection threshold: noise_floor * 2.0 for >=300ms
 * - Integration with barge-in and turn-taking systems
 * - Debug instrumentation for noise-floor gating
 * 
 * Feature Flag: NOISE_FLOOR_ENABLED (default: true)
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Configuration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface NoiseFloorConfig {
  enabled: boolean;
  baselineWindowMs: number;     // Window for computing noise baseline (1500ms)
  speechThresholdRatio: number; // RMS must exceed baseline * ratio (2.0)
  minSpeechDurationMs: number;  // Sustained speech duration to confirm (300ms)
  maxBaselineSamples: number;   // Maximum samples to store (100)
  defaultNoiseFloor: number;    // Default when no samples yet (0.01)
  silenceRmsThreshold: number;  // RMS below this is considered silence (0.02)
}

const DEFAULT_CONFIG: NoiseFloorConfig = {
  enabled: true,
  baselineWindowMs: 1500,
  speechThresholdRatio: 2.0,
  minSpeechDurationMs: 300,
  maxBaselineSamples: 100,
  defaultNoiseFloor: 0.01,
  silenceRmsThreshold: 0.02,
};

export function isNoiseFloorEnabled(): boolean {
  return process.env.NOISE_FLOOR_ENABLED !== 'false'; // Default true
}

export function getNoiseFloorConfig(): NoiseFloorConfig {
  return {
    ...DEFAULT_CONFIG,
    enabled: isNoiseFloorEnabled(),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface NoiseFloorState {
  samples: number[];            // RMS samples from non-speech periods
  timestamps: number[];         // When each sample was collected
  speechStartTime: number | null; // When potential speech started
  speechRmsSamples: number[];   // RMS samples during speech detection
  isSpeechActive: boolean;      // Whether speech is currently detected
  lastSpeechEndTime: number;    // When last speech ended (for grace period)
  config: NoiseFloorConfig;
}

export interface SpeechDetectionResult {
  isSpeech: boolean;           // Whether this is confirmed speech
  isPotentialSpeech: boolean;  // Whether speech is being detected (not yet confirmed)
  rms: number;                 // Current RMS level
  noiseFloor: number;          // Current noise floor baseline
  threshold: number;           // Speech threshold (noiseFloor * ratio)
  durationMs: number;          // How long speech has been detected
  reason: 'below_threshold' | 'confirming' | 'confirmed_speech' | 'disabled';
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// State Management
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function createNoiseFloorState(): NoiseFloorState {
  return {
    samples: [],
    timestamps: [],
    speechStartTime: null,
    speechRmsSamples: [],
    isSpeechActive: false,
    lastSpeechEndTime: 0,
    config: getNoiseFloorConfig(),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Noise Floor Calculation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Calculate RMS (Root Mean Square) from PCM16 audio buffer
 */
export function calculateRMS(audioBuffer: Buffer): number {
  if (audioBuffer.length < 2) return 0;
  
  const samples = audioBuffer.length / 2;
  let sumSquares = 0;
  
  for (let i = 0; i < audioBuffer.length; i += 2) {
    const sample = audioBuffer.readInt16LE(i);
    const normalized = sample / 32768; // Normalize to -1.0 to 1.0
    sumSquares += normalized * normalized;
  }
  
  return Math.sqrt(sumSquares / samples);
}

/**
 * Calculate peak amplitude from PCM16 audio buffer
 */
export function calculatePeak(audioBuffer: Buffer): number {
  if (audioBuffer.length < 2) return 0;
  
  let maxAbs = 0;
  for (let i = 0; i < audioBuffer.length; i += 2) {
    const sample = Math.abs(audioBuffer.readInt16LE(i));
    if (sample > maxAbs) maxAbs = sample;
  }
  
  return maxAbs / 32768;
}

/**
 * Update noise floor baseline with a new sample during non-speech period
 */
export function updateNoiseFloorBaseline(state: NoiseFloorState, rms: number): void {
  const now = Date.now();
  const config = state.config;
  
  // Only update baseline during silence (low RMS)
  if (rms > config.silenceRmsThreshold) return;
  
  // Add new sample
  state.samples.push(rms);
  state.timestamps.push(now);
  
  // Remove old samples outside window
  const cutoff = now - config.baselineWindowMs;
  while (state.timestamps.length > 0 && state.timestamps[0] < cutoff) {
    state.samples.shift();
    state.timestamps.shift();
  }
  
  // Keep max samples to prevent memory issues
  if (state.samples.length > config.maxBaselineSamples) {
    state.samples = state.samples.slice(-config.maxBaselineSamples);
    state.timestamps = state.timestamps.slice(-config.maxBaselineSamples);
  }
}

/**
 * Get current noise floor as median of samples (p50 for noise resistance)
 */
export function getNoiseFloor(state: NoiseFloorState): number {
  if (state.samples.length === 0) {
    return state.config.defaultNoiseFloor;
  }
  
  const sorted = [...state.samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Get speech detection threshold (noise_floor * ratio)
 */
export function getSpeechThreshold(state: NoiseFloorState): number {
  return getNoiseFloor(state) * state.config.speechThresholdRatio;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Speech Detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Process an audio chunk and determine if it contains speech
 * 
 * Requirements for confirmed speech:
 * 1. RMS exceeds noise_floor * 2.0
 * 2. Sustained for >= 300ms
 */
export function detectSpeech(
  state: NoiseFloorState,
  audioBuffer: Buffer
): SpeechDetectionResult {
  const config = state.config;
  const now = Date.now();
  const rms = calculateRMS(audioBuffer);
  const noiseFloor = getNoiseFloor(state);
  const threshold = noiseFloor * config.speechThresholdRatio;
  
  // If noise floor is disabled, consider everything speech
  if (!config.enabled) {
    return {
      isSpeech: true,
      isPotentialSpeech: true,
      rms,
      noiseFloor,
      threshold,
      durationMs: 0,
      reason: 'disabled',
    };
  }
  
  // Check if RMS exceeds threshold
  if (rms >= threshold) {
    // Speech detected - start or continue tracking
    if (state.speechStartTime === null) {
      state.speechStartTime = now;
      state.speechRmsSamples = [rms];
    } else {
      state.speechRmsSamples.push(rms);
    }
    
    const durationMs = now - state.speechStartTime;
    
    // Check if speech is sustained for minimum duration
    if (durationMs >= config.minSpeechDurationMs) {
      state.isSpeechActive = true;
      return {
        isSpeech: true,
        isPotentialSpeech: true,
        rms,
        noiseFloor,
        threshold,
        durationMs,
        reason: 'confirmed_speech',
      };
    }
    
    return {
      isSpeech: false,
      isPotentialSpeech: true,
      rms,
      noiseFloor,
      threshold,
      durationMs,
      reason: 'confirming',
    };
  }
  
  // RMS below threshold - not speech
  // Reset speech tracking if no speech in progress
  if (state.speechStartTime !== null && !state.isSpeechActive) {
    // Brief spike that didn't sustain - reset
    state.speechStartTime = null;
    state.speechRmsSamples = [];
  }
  
  if (state.isSpeechActive) {
    // Speech just ended
    state.isSpeechActive = false;
    state.lastSpeechEndTime = now;
    state.speechStartTime = null;
    state.speechRmsSamples = [];
  }
  
  // Update baseline during silence
  updateNoiseFloorBaseline(state, rms);
  
  return {
    isSpeech: false,
    isPotentialSpeech: false,
    rms,
    noiseFloor,
    threshold,
    durationMs: 0,
    reason: 'below_threshold',
  };
}

/**
 * Reset speech detection state (call when turn ends)
 */
export function resetSpeechDetection(state: NoiseFloorState): void {
  state.speechStartTime = null;
  state.speechRmsSamples = [];
  state.isSpeechActive = false;
}

/**
 * Check if we're in a post-utterance grace period
 */
export function isInGracePeriod(state: NoiseFloorState, graceMs: number = 600): boolean {
  if (state.lastSpeechEndTime === 0) return false;
  return Date.now() - state.lastSpeechEndTime < graceMs;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Transcript Validation (Ghost Turn Prevention)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface TranscriptValidationResult {
  isValid: boolean;
  reason: string;
  wordCount: number;
  isNonLexical: boolean;
}

const NON_LEXICAL_PATTERNS = [
  /^(um+|uh+|hmm+|hm+|ah+|oh+|er+|erm+)$/i,
  /^\[.*\]$/,                    // [noise], [silence], etc.
  /^[\s.,!?]*$/,                 // Punctuation/whitespace only
];

/**
 * Validate a transcript to prevent ghost turns
 * 
 * Rejects:
 * - Empty transcripts
 * - Ultra-short transcripts (< 3 words for barge-in)
 * - Non-lexical content (um, uh, [noise])
 */
export function validateTranscript(
  transcript: string,
  minWordCount: number = 1
): TranscriptValidationResult {
  const trimmed = transcript.trim();
  
  // Check empty
  if (!trimmed) {
    return {
      isValid: false,
      reason: 'empty',
      wordCount: 0,
      isNonLexical: false,
    };
  }
  
  // Check non-lexical patterns
  for (const pattern of NON_LEXICAL_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        isValid: false,
        reason: 'non_lexical',
        wordCount: 0,
        isNonLexical: true,
      };
    }
  }
  
  // Count words (simple split on whitespace)
  const words = trimmed.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  
  // Check minimum word count
  if (wordCount < minWordCount) {
    return {
      isValid: false,
      reason: `too_short_${wordCount}_words`,
      wordCount,
      isNonLexical: false,
    };
  }
  
  return {
    isValid: true,
    reason: 'valid',
    wordCount,
    isNonLexical: false,
  };
}

/**
 * Validate transcript specifically for barge-in (stricter: >= 3 words)
 */
export function validateTranscriptForBargeIn(transcript: string): TranscriptValidationResult {
  return validateTranscript(transcript, 3);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Debug Logging
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function logNoiseFloorGating(
  sessionId: string,
  result: SpeechDetectionResult,
  ignored: boolean
): void {
  if (ignored) {
    console.log('[noise_floor_gated]', JSON.stringify({
      sessionId: sessionId.substring(0, 8),
      rms: result.rms.toFixed(4),
      noiseFloor: result.noiseFloor.toFixed(4),
      threshold: result.threshold.toFixed(4),
      durationMs: result.durationMs,
      reason: result.reason,
      action: 'ignored_below_threshold',
    }));
  }
}

export function logBargeInDecision(
  sessionId: string,
  decision: 'duck' | 'interrupt' | 'ignore',
  rms: number,
  noiseFloor: number,
  wordCount: number,
  transcript: string,
  reason: string
): void {
  console.log('[barge_in_decision]', JSON.stringify({
    sessionId: sessionId.substring(0, 8),
    decision,
    rms: rms.toFixed(4),
    noiseFloor: noiseFloor.toFixed(4),
    wordCount,
    transcriptPreview: transcript.substring(0, 40),
    reason,
  }));
}

export function logGhostTurnPrevention(
  sessionId: string,
  transcript: string,
  validationResult: TranscriptValidationResult
): void {
  console.log('[ghost_turn_prevented]', JSON.stringify({
    sessionId: sessionId.substring(0, 8),
    transcriptPreview: transcript.substring(0, 40),
    wordCount: validationResult.wordCount,
    isNonLexical: validationResult.isNonLexical,
    reason: validationResult.reason,
  }));
}
