/**
 * Echo Guard Service
 * 
 * Prevents the tutor from "responding to itself" by:
 * 1. Echo Tail Guard: Ignores VAD events for a configurable period after TTS ends
 * 2. Echo Similarity Filter: Compares transcripts against recent tutor utterances
 * 
 * Feature flag: ECHO_GUARD_ENABLED (default: false)
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Configuration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface EchoGuardConfig {
  enabled: boolean;
  echoTailGuardMs: number;      // Time after TTS ends to ignore VAD (default 700ms)
  echoSimilarityThreshold: number; // Similarity threshold (default 0.85)
  echoWindowMs: number;         // Time window for echo detection (default 2500ms)
  maxTutorUtterances: number;   // Number of tutor utterances to track (default 3)
  debugMode: boolean;           // Enable detailed logging
}

const DEFAULT_CONFIG: EchoGuardConfig = {
  enabled: false,
  echoTailGuardMs: 700,
  echoSimilarityThreshold: 0.85,
  echoWindowMs: 2500,
  maxTutorUtterances: 3,
  debugMode: false,
};

export function getEchoGuardConfig(): EchoGuardConfig {
  const enabled = process.env.ECHO_GUARD_ENABLED === 'true';
  const echoTailGuardMs = parseInt(process.env.ECHO_TAIL_GUARD_MS || '700', 10);
  const echoSimilarityThreshold = parseFloat(process.env.ECHO_SIMILARITY_THRESHOLD || '0.85');
  const echoWindowMs = parseInt(process.env.ECHO_WINDOW_MS || '2500', 10);
  const debugMode = process.env.ECHO_GUARD_DEBUG === 'true';

  return {
    ...DEFAULT_CONFIG,
    enabled,
    echoTailGuardMs,
    echoSimilarityThreshold,
    echoWindowMs,
    debugMode,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tutor Utterance Buffer
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface TutorUtterance {
  text: string;
  normalizedText: string;
  ttsPlaybackEndMs: number;
}

export interface EchoGuardState {
  lastTutorUtterances: TutorUtterance[];
  tutorPlaybackActive: boolean;
  lastPlaybackEndMs: number;
  echoTailGuardActive: boolean;
  echoTailGuardEndMs: number;
}

export function createEchoGuardState(): EchoGuardState {
  return {
    lastTutorUtterances: [],
    tutorPlaybackActive: false,
    lastPlaybackEndMs: 0,
    echoTailGuardActive: false,
    echoTailGuardEndMs: 0,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Text Normalization & Similarity
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Normalize text for comparison: lowercase, strip punctuation, collapse whitespace
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')  // Replace punctuation with spaces
    .replace(/\s+/g, ' ')       // Collapse multiple spaces
    .trim();
}

/**
 * Tokenize text into words for Jaccard similarity
 */
function tokenize(text: string): Set<string> {
  return new Set(text.split(' ').filter(word => word.length > 0));
}

/**
 * Calculate Jaccard similarity between two texts
 * Returns a value between 0 (no overlap) and 1 (identical)
 */
export function jaccardSimilarity(text1: string, text2: string): number {
  const tokens1 = tokenize(text1);
  const tokens2 = tokenize(text2);
  
  if (tokens1.size === 0 && tokens2.size === 0) {
    return 1; // Both empty = identical
  }
  
  if (tokens1.size === 0 || tokens2.size === 0) {
    return 0; // One empty = no similarity
  }
  
  // Calculate intersection
  const intersection = new Set(Array.from(tokens1).filter(x => tokens2.has(x)));
  
  // Calculate union
  const union = new Set([...Array.from(tokens1), ...Array.from(tokens2)]);
  
  return intersection.size / union.size;
}

/**
 * Calculate normalized Levenshtein ratio (alternative to Jaccard)
 * Returns a value between 0 (completely different) and 1 (identical)
 */
export function levenshteinRatio(str1: string, str2: string): number {
  if (str1 === str2) return 1;
  if (str1.length === 0 || str2.length === 0) {
    return str1.length === str2.length ? 1 : 0;
  }
  
  // Create distance matrix
  const matrix: number[][] = [];
  for (let i = 0; i <= str1.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= str2.length; j++) {
    matrix[0][j] = j;
  }
  
  // Fill in the matrix
  for (let i = 1; i <= str1.length; i++) {
    for (let j = 1; j <= str2.length; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,     // deletion
        matrix[i][j - 1] + 1,     // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  
  const distance = matrix[str1.length][str2.length];
  const maxLength = Math.max(str1.length, str2.length);
  return 1 - (distance / maxLength);
}

/**
 * Combined similarity score (uses both Jaccard and Levenshtein for robustness)
 */
export function calculateSimilarity(text1: string, text2: string): number {
  const jaccard = jaccardSimilarity(text1, text2);
  const levenshtein = levenshteinRatio(text1, text2);
  
  // Use the higher of the two scores for more lenient matching
  return Math.max(jaccard, levenshtein);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Echo Guard Operations
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Record a tutor utterance for echo comparison
 */
export function recordTutorUtterance(
  state: EchoGuardState,
  text: string,
  config: EchoGuardConfig = getEchoGuardConfig()
): void {
  // Only record when echo guard is enabled (saves memory when disabled)
  if (!config.enabled) return;
  
  const normalizedText = normalizeText(text);
  
  // Only record non-empty utterances
  if (!normalizedText) return;
  
  const utterance: TutorUtterance = {
    text,
    normalizedText,
    ttsPlaybackEndMs: 0, // Will be set when playback ends
  };
  
  // Add to front of array
  state.lastTutorUtterances.unshift(utterance);
  
  // Trim to max size
  if (state.lastTutorUtterances.length > config.maxTutorUtterances) {
    state.lastTutorUtterances.pop();
  }
  
  if (config.debugMode) {
    console.log(`[EchoGuard] 📝 Recorded tutor utterance: "${text.substring(0, 50)}..." (${state.lastTutorUtterances.length} in buffer)`);
  }
}

/**
 * Mark playback start
 */
export function markPlaybackStart(
  state: EchoGuardState,
  config: EchoGuardConfig = getEchoGuardConfig()
): void {
  state.tutorPlaybackActive = true;
  
  if (config.debugMode) {
    console.log('[EchoGuard] 🔊 Playback started - tutorPlaybackActive=true');
  }
}

/**
 * Mark playback end and start echo tail guard
 */
export function markPlaybackEnd(
  state: EchoGuardState,
  config: EchoGuardConfig = getEchoGuardConfig()
): void {
  const now = Date.now();
  
  state.tutorPlaybackActive = false;
  state.lastPlaybackEndMs = now;
  
  // Update timestamp on most recent utterance
  if (state.lastTutorUtterances.length > 0) {
    state.lastTutorUtterances[0].ttsPlaybackEndMs = now;
  }
  
  // Start echo tail guard
  if (config.enabled) {
    state.echoTailGuardActive = true;
    state.echoTailGuardEndMs = now + config.echoTailGuardMs;
    
    console.log(`[EchoGuard] 🛡️ echo_tail_guard_start: ${config.echoTailGuardMs}ms window (ends at ${state.echoTailGuardEndMs})`);
  }
  
  if (config.debugMode) {
    console.log('[EchoGuard] 🔇 Playback ended - tutorPlaybackActive=false');
  }
}

/**
 * Check if echo tail guard is currently active
 */
export function isEchoTailGuardActive(
  state: EchoGuardState,
  config: EchoGuardConfig = getEchoGuardConfig()
): boolean {
  if (!config.enabled || !state.echoTailGuardActive) {
    return false;
  }
  
  const now = Date.now();
  
  if (now >= state.echoTailGuardEndMs) {
    // Guard expired
    if (state.echoTailGuardActive) {
      state.echoTailGuardActive = false;
      console.log('[EchoGuard] 🛡️ echo_tail_guard_end: guard expired');
    }
    return false;
  }
  
  return true;
}

/**
 * Check if a transcript should be filtered as an echo
 * Returns true if the transcript is an echo and should be discarded
 */
export interface EchoCheckResult {
  isEcho: boolean;
  similarity: number;
  matchedUtterance: string | null;
  deltaMs: number;
  reason: string;
}

export function checkForEcho(
  state: EchoGuardState,
  transcript: string,
  config: EchoGuardConfig = getEchoGuardConfig()
): EchoCheckResult {
  const now = Date.now();
  const normalizedTranscript = normalizeText(transcript);
  
  // Skip if echo guard is disabled
  if (!config.enabled) {
    return {
      isEcho: false,
      similarity: 0,
      matchedUtterance: null,
      deltaMs: 0,
      reason: 'echo_guard_disabled',
    };
  }
  
  // Skip if transcript is too short (likely noise)
  if (normalizedTranscript.length < 3) {
    return {
      isEcho: false,
      similarity: 0,
      matchedUtterance: null,
      deltaMs: 0,
      reason: 'transcript_too_short',
    };
  }
  
  // Check against recent tutor utterances
  for (let i = 0; i < Math.min(2, state.lastTutorUtterances.length); i++) {
    const utterance = state.lastTutorUtterances[i];
    
    // CRITICAL FIX: Check utterances that are CURRENTLY playing (ttsPlaybackEndMs === 0)
    // OR have recently finished (ttsPlaybackEndMs > 0 and within window)
    // Echoes often arrive DURING playback, before markPlaybackEnd is called
    let deltaMs = 0;
    let isInWindow = false;
    
    if (utterance.ttsPlaybackEndMs === 0) {
      // Utterance is still playing - treat as in-window if tutor is speaking
      if (state.tutorPlaybackActive) {
        isInWindow = true;
        deltaMs = 0; // Currently playing
      } else {
        // Playback ended but markPlaybackEnd wasn't called yet (edge case)
        // Use lastPlaybackEndMs as fallback
        if (state.lastPlaybackEndMs > 0) {
          deltaMs = now - state.lastPlaybackEndMs;
          isInWindow = deltaMs <= config.echoWindowMs;
        } else {
          continue; // Skip if no timing info available
        }
      }
    } else {
      // Playback has ended - check if within echo window
      deltaMs = now - utterance.ttsPlaybackEndMs;
      isInWindow = deltaMs <= config.echoWindowMs;
    }
    
    // Skip if outside echo window
    if (!isInWindow) continue;
    
    const similarity = calculateSimilarity(normalizedTranscript, utterance.normalizedText);
    
    if (config.debugMode) {
      console.log(`[EchoGuard] 🔍 Comparing transcript: "${normalizedTranscript.substring(0, 30)}..." vs utterance[${i}]: "${utterance.normalizedText.substring(0, 30)}..." | similarity=${similarity.toFixed(3)}, deltaMs=${deltaMs}`);
    }
    
    if (similarity >= config.echoSimilarityThreshold) {
      console.log(`[EchoGuard] 🚫 echo_filtered: similarity=${similarity.toFixed(3)}, deltaMs=${deltaMs}, transcriptPreview="${transcript.substring(0, 50)}..."`);
      
      return {
        isEcho: true,
        similarity,
        matchedUtterance: utterance.text.substring(0, 100),
        deltaMs,
        reason: 'similarity_match',
      };
    }
  }
  
  return {
    isEcho: false,
    similarity: 0,
    matchedUtterance: null,
    deltaMs: 0,
    reason: 'no_match',
  };
}

/**
 * Check if barge-in should be allowed (VAD event filtering)
 * Returns false if the event should be ignored (during echo tail guard)
 */
export function shouldAllowBargeIn(
  state: EchoGuardState,
  config: EchoGuardConfig = getEchoGuardConfig()
): { allowed: boolean; reason: string } {
  // If echo guard disabled, always allow
  if (!config.enabled) {
    return { allowed: true, reason: 'echo_guard_disabled' };
  }
  
  // If tutor is actively playing, allow barge-in (handled separately)
  if (state.tutorPlaybackActive) {
    return { allowed: true, reason: 'tutor_playing_barge_in_allowed' };
  }
  
  // Check echo tail guard
  if (isEchoTailGuardActive(state, config)) {
    const remainingMs = state.echoTailGuardEndMs - Date.now();
    if (config.debugMode) {
      console.log(`[EchoGuard] 🛡️ Blocking barge-in during echo tail guard (${remainingMs}ms remaining)`);
    }
    return { allowed: false, reason: `echo_tail_guard_active_${remainingMs}ms_remaining` };
  }
  
  return { allowed: true, reason: 'no_guard_active' };
}

/**
 * Reset echo guard state (e.g., on session start/end)
 */
export function resetEchoGuardState(state: EchoGuardState): void {
  state.lastTutorUtterances = [];
  state.tutorPlaybackActive = false;
  state.lastPlaybackEndMs = 0;
  state.echoTailGuardActive = false;
  state.echoTailGuardEndMs = 0;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Logging
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function logEchoGuardStateTransition(
  event: string,
  state: EchoGuardState,
  details?: Record<string, unknown>
): void {
  const config = getEchoGuardConfig();
  if (!config.debugMode) return;
  
  console.log(`[EchoGuard] 📊 State: ${event}`, {
    tutorPlaybackActive: state.tutorPlaybackActive,
    echoTailGuardActive: state.echoTailGuardActive,
    echoTailGuardEndMs: state.echoTailGuardEndMs,
    utterancesInBuffer: state.lastTutorUtterances.length,
    lastPlaybackEndMs: state.lastPlaybackEndMs,
    ...details,
  });
}
