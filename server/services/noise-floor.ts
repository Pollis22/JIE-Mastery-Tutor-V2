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
// Transcript Validation (Ghost Turn Prevention + Noise Robustness)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface TranscriptValidationResult {
  isValid: boolean;
  reason: string;
  wordCount: number;
  isNonLexical: boolean;
  confidence?: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NOISY ROOM MODE Configuration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function isNoisyRoomModeEnabled(): boolean {
  return process.env.NOISY_ROOM_MODE === '1' || process.env.NOISY_ROOM_MODE === 'true';
}

interface ValidationThresholds {
  minWordCount: number;
  minConfidence: number;
  confidenceBypassWordCount: number;  // >= this many words bypass confidence check
  bargeInMinWords: number;
  bargeInMinConfidence: number;
  bargeInConfidenceBypassWords: number;  // OR logic: >= words OR >= confidence
  bargeInHighConfidenceThreshold: number;
}

function getValidationThresholds(): ValidationThresholds {
  const noisyMode = isNoisyRoomModeEnabled();
  
  if (noisyMode) {
    return {
      minWordCount: 4,               // Up from 1
      minConfidence: 0.65,           // Up from 0.55
      confidenceBypassWordCount: 8,  // More words = trust
      bargeInMinWords: 5,            // Up from 3
      bargeInMinConfidence: 0.75,    // Up from 0.65
      bargeInConfidenceBypassWords: 5,
      bargeInHighConfidenceThreshold: 0.85,  // Very high = allow fewer words
    };
  }
  
  return {
    minWordCount: 1,
    minConfidence: 0.55,
    confidenceBypassWordCount: 6,
    bargeInMinWords: 3,
    bargeInMinConfidence: 0.65,
    bargeInConfidenceBypassWords: 3,
    bargeInHighConfidenceThreshold: 0.75,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Filler and Noise Patterns
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const NON_LEXICAL_PATTERNS = [
  /^(um+|uh+|hmm+|hm+|ah+|oh+|er+|erm+)$/i,
  /^\[.*\]$/,                    // [noise], [silence], etc.
  /^[\s.,!?]*$/,                 // Punctuation/whitespace only
];

// Filler words that alone don't constitute meaningful speech
const FILLER_ONLY_WORDS = new Set([
  'uh', 'um', 'hmm', 'mm', 'mhm', 'uh-huh', 'uhuh',
  'yeah', 'yep', 'nope', 'okay', 'ok', 'ah', 'oh',
  'huh', 'eh', 'er', 'erm', 'like', 'so', 'well',
]);

// Noise-like patterns (mostly non-alphanumeric or fragments)
// IMPORTANT: Use Unicode-aware patterns to support CJK and other non-Latin scripts
const NOISE_PATTERNS = [
  /^[.!?,;:\-]+$/,               // Only punctuation
  /^(.)\1{3,}$/,                 // Repeated single char (aaaa, hhhh)
];

/**
 * Check if text contains any letter characters (Unicode-aware)
 * This allows CJK, Arabic, Cyrillic, etc.
 * Uses charCodeAt to check Unicode ranges instead of regex 'u' flag
 */
function hasLetterCharacters(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // Latin letters (A-Z, a-z)
    if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) return true;
    // Extended Latin (À-ÿ)
    if (code >= 192 && code <= 255) return true;
    // CJK Unified Ideographs (Chinese, Japanese Kanji, Korean Hanja)
    if (code >= 0x4E00 && code <= 0x9FFF) return true;
    // Hiragana
    if (code >= 0x3040 && code <= 0x309F) return true;
    // Katakana
    if (code >= 0x30A0 && code <= 0x30FF) return true;
    // Hangul (Korean)
    if (code >= 0xAC00 && code <= 0xD7AF) return true;
    // Arabic
    if (code >= 0x0600 && code <= 0x06FF) return true;
    // Cyrillic
    if (code >= 0x0400 && code <= 0x04FF) return true;
    // Hebrew
    if (code >= 0x0590 && code <= 0x05FF) return true;
    // Greek
    if (code >= 0x0370 && code <= 0x03FF) return true;
    // Thai
    if (code >= 0x0E00 && code <= 0x0E7F) return true;
    // Vietnamese extensions (Latin Extended Additional)
    if (code >= 0x1E00 && code <= 0x1EFF) return true;
  }
  return false;
}

/**
 * Normalize transcript for validation
 */
function normalizeTranscript(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ')           // Collapse whitespace
    .replace(/([.!?,;:])\1+/g, '$1') // Collapse repeated punctuation
    .toLowerCase();
}

/**
 * Check if transcript is filler-only
 */
function isFillerOnly(words: string[]): boolean {
  if (words.length === 0) return true;
  if (words.length > 3) return false;  // Multi-word unlikely to be all filler
  
  const nonFillerWords = words.filter(w => !FILLER_ONLY_WORDS.has(w.toLowerCase()));
  return nonFillerWords.length === 0;
}

/**
 * Check if transcript matches noise-like patterns
 * Unicode-aware: Allows CJK, Arabic, Cyrillic, etc.
 */
function isNoiseLike(text: string): boolean {
  const normalized = normalizeTranscript(text);
  
  // If text has letter characters (including CJK, Arabic, etc.), it's not noise
  if (hasLetterCharacters(normalized)) {
    return false;
  }
  
  // Check regex patterns for pure noise (punctuation, repeated chars)
  return NOISE_PATTERNS.some(pattern => pattern.test(normalized));
}

/**
 * Validate a transcript to prevent ghost turns
 * 
 * Enhanced with:
 * - Confidence-based gating
 * - Filler-only rejection
 * - Noise pattern detection
 * - NOISY_ROOM_MODE support
 */
export function validateTranscript(
  transcript: string,
  minWordCount: number = 1,
  confidence: number = 1.0  // Default high if not provided
): TranscriptValidationResult {
  const thresholds = getValidationThresholds();
  const normalized = normalizeTranscript(transcript);
  
  // Check empty
  if (!normalized) {
    logTranscriptRejection('empty', 0, confidence, 0);
    return {
      isValid: false,
      reason: 'empty',
      wordCount: 0,
      isNonLexical: false,
      confidence,
    };
  }
  
  // Check non-lexical patterns
  for (const pattern of NON_LEXICAL_PATTERNS) {
    if (pattern.test(normalized)) {
      logTranscriptRejection('non_lexical', normalized.length, confidence, 0);
      return {
        isValid: false,
        reason: 'non_lexical',
        wordCount: 0,
        isNonLexical: true,
        confidence,
      };
    }
  }
  
  // Check noise-like patterns
  if (isNoiseLike(normalized)) {
    logTranscriptRejection('noise_pattern', normalized.length, confidence, 0);
    return {
      isValid: false,
      reason: 'noise_pattern',
      wordCount: 0,
      isNonLexical: true,
      confidence,
    };
  }
  
  // Count words (simple split on whitespace)
  const words = normalized.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  
  // Check filler-only
  if (isFillerOnly(words)) {
    logTranscriptRejection('filler_only', normalized.length, confidence, wordCount);
    return {
      isValid: false,
      reason: 'filler_only',
      wordCount,
      isNonLexical: true,
      confidence,
    };
  }
  
  // Determine effective minimum word count
  const effectiveMinWords = Math.max(minWordCount, thresholds.minWordCount);
  
  // Check minimum word count
  if (wordCount < effectiveMinWords) {
    logTranscriptRejection(`too_short_${wordCount}_words`, normalized.length, confidence, wordCount);
    return {
      isValid: false,
      reason: `too_short_${wordCount}_words`,
      wordCount,
      isNonLexical: false,
      confidence,
    };
  }
  
  // Confidence gating: reject low-confidence unless many words
  if (confidence < thresholds.minConfidence && wordCount < thresholds.confidenceBypassWordCount) {
    logTranscriptRejection('low_confidence', normalized.length, confidence, wordCount);
    return {
      isValid: false,
      reason: `low_confidence_${confidence.toFixed(2)}`,
      wordCount,
      isNonLexical: false,
      confidence,
    };
  }
  
  return {
    isValid: true,
    reason: 'valid',
    wordCount,
    isNonLexical: false,
    confidence,
  };
}

/**
 * Validate transcript specifically for barge-in (stricter requirements)
 * 
 * Requirements:
 * - >= 3 words (or 5 in noisy mode) AND confidence >= 0.65 (or 0.75 in noisy mode)
 * - OR very high confidence (>= 0.75/0.85) with fewer words
 */
export function validateTranscriptForBargeIn(
  transcript: string,
  confidence: number = 1.0
): TranscriptValidationResult {
  const thresholds = getValidationThresholds();
  const normalized = normalizeTranscript(transcript);
  
  // Basic checks first
  if (!normalized) {
    logTranscriptRejection('barge_in_empty', 0, confidence, 0);
    return {
      isValid: false,
      reason: 'empty',
      wordCount: 0,
      isNonLexical: false,
      confidence,
    };
  }
  
  // Check noise-like patterns
  if (isNoiseLike(normalized)) {
    logTranscriptRejection('barge_in_noise', normalized.length, confidence, 0);
    return {
      isValid: false,
      reason: 'noise_pattern',
      wordCount: 0,
      isNonLexical: true,
      confidence,
    };
  }
  
  const words = normalized.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  
  // Check filler-only
  if (isFillerOnly(words)) {
    logTranscriptRejection('barge_in_filler', normalized.length, confidence, wordCount);
    return {
      isValid: false,
      reason: 'filler_only',
      wordCount,
      isNonLexical: true,
      confidence,
    };
  }
  
  // Barge-in requires BOTH word count AND confidence (OR logic for very high confidence)
  const hasEnoughWords = wordCount >= thresholds.bargeInMinWords;
  const hasHighConfidence = confidence >= thresholds.bargeInMinConfidence;
  const hasVeryHighConfidence = confidence >= thresholds.bargeInHighConfidenceThreshold;
  
  // Pass if: (enough words AND enough confidence) OR very high confidence
  if ((hasEnoughWords && hasHighConfidence) || hasVeryHighConfidence) {
    return {
      isValid: true,
      reason: 'valid',
      wordCount,
      isNonLexical: false,
      confidence,
    };
  }
  
  // Rejection reason
  let reason: string;
  if (!hasEnoughWords && !hasHighConfidence) {
    reason = `too_short_${wordCount}_words_low_conf_${confidence.toFixed(2)}`;
  } else if (!hasEnoughWords) {
    reason = `too_short_${wordCount}_words`;
  } else {
    reason = `low_confidence_${confidence.toFixed(2)}`;
  }
  
  logTranscriptRejection(`barge_in_${reason}`, normalized.length, confidence, wordCount);
  
  return {
    isValid: false,
    reason,
    wordCount,
    isNonLexical: false,
    confidence,
  };
}

/**
 * Instrumentation: Log transcript rejection with redacted content
 */
function logTranscriptRejection(
  reason: string,
  textLength: number,
  confidence: number,
  wordCount: number
): void {
  // Production-safe: don't log actual content
  console.log('[transcript_rejected]', JSON.stringify({
    reason,
    textLength,
    confidence: confidence.toFixed(2),
    wordCount,
    noisyRoomMode: isNoisyRoomModeEnabled(),
    timestamp: Date.now(),
  }));
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
