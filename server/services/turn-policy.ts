/**
 * Turn Policy Module
 * 
 * Implements turn-taking policies for conversational AI tutoring:
 * 
 * 1. K-2 "Very Patient" Policy (TURN_POLICY_K2_ENABLED)
 *    - Prevents interrupting while young learners think aloud
 *    - Uses hesitation/continuation detection + stall escape
 * 
 * 2. Reading Mode Patience (READING_MODE_PATIENCE_ENABLED)
 *    - Extra patience when activity_mode="reading"
 *    - +250ms min silence, +800ms max silence
 *    - Stall prompt: "Want a moment to finish, or would you like help sounding it out?"
 * 
 * 3. Adaptive Patience (ADAPTIVE_PATIENCE_ENABLED)
 *    - Per-session patienceScore (0.0-1.0) updated on each transcript
 *    - Signals: hesitation markers, continuation endings, interrupt attempts
 *    - Bounded adjustments to silence thresholds
 * 
 * Feature Flags:
 * - TURN_POLICY_K2_ENABLED (default: false)
 * - READING_MODE_PATIENCE_ENABLED (default: false)
 * - ADAPTIVE_PATIENCE_ENABLED (default: false)
 */

export type GradeBand = 'K-2' | '3-5' | '6-8' | '9-12' | 'College/Adult' | null;
export type ActivityMode = 'default' | 'reading';

export interface TurnPolicyConfig {
  end_of_turn_confidence_threshold: number;
  min_end_of_turn_silence_when_confident_ms: number;
  max_turn_silence_ms: number;
  post_eot_grace_ms: number;
}

export interface TurnPolicyState {
  hesitationGuardActive: boolean;
  awaitingSecondEot: boolean;
  lastEotTimestamp: number;
  stallEscapeTriggered: boolean;
  turnStartTimestamp: number;
  finalTranscriptReceivedAt: number | null;
  // Adaptive Patience state
  patienceScore: number;  // 0.0 - 1.0
  hesitationCount: number;
  continuationCount: number;
  interruptAttempts: number;
  // Activity mode
  activityMode: ActivityMode;
}

// Reading Mode configuration
export interface ReadingModeConfig {
  minSilenceBonusMs: number;
  maxSilenceBonusMs: number;
  minSilenceCapMs: number;
  maxSilenceCapMs: number;
  stallPrompt: string;
}

// Adaptive Patience configuration
export interface AdaptivePatienceConfig {
  minSilenceCapMs: number;
  maxSilenceCapMs: number;
  graceCapMs: number;
}

const READING_MODE_CONFIG: ReadingModeConfig = {
  minSilenceBonusMs: 250,
  maxSilenceBonusMs: 800,
  minSilenceCapMs: 1200,
  maxSilenceCapMs: 6000,
  stallPrompt: "Want a moment to finish, or would you like help sounding it out?",
};

const ADAPTIVE_PATIENCE_CONFIG: AdaptivePatienceConfig = {
  minSilenceCapMs: 1000,
  maxSilenceCapMs: 5000,
  graceCapMs: 400,
};

export interface TurnPolicyEvaluation {
  grade_band: GradeBand;
  k2_policy_enabled: boolean;
  eot_confidence: number;
  silence_duration_ms: number;
  hesitation_guard_triggered: boolean;
  stall_escape_triggered: boolean;
  time_to_first_audio_ms: number | null;
  transcript_preview: string;
  should_fire_claude: boolean;
  stall_prompt?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UNIFIED CONVERSATIONAL PATIENCE
// 3–5 pacing is the global conversational baseline.
// All grade bands use identical patience settings for consistent turn-taking.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Global baseline (3–5 pacing values applied to all bands)
const UNIFIED_BASELINE: TurnPolicyConfig = {
  end_of_turn_confidence_threshold: 0.72,  // Confidence before considering turn complete
  min_end_of_turn_silence_when_confident_ms: 1200,  // Pause tolerance after confident EOT
  max_turn_silence_ms: 5500,  // Stall escape / max thinking time
  post_eot_grace_ms: 450,  // Hesitation grace / continuation window (max of old K2/default)
};

// OLD VALUES (preserved for reference):
// K2_PRESET: confidence=0.78, min_silence=1000ms, max_silence=5000ms, grace=450ms
// DEFAULT_PRESET: confidence=0.72, min_silence=1200ms, max_silence=5500ms, grace=400ms
// UNIFIED: Uses 3-5 base with max grace (450ms) to never reduce hesitation tolerance

// K-2 can have slightly higher confidence threshold for noise robustness with young learners
const K2_PRESET: TurnPolicyConfig = {
  ...UNIFIED_BASELINE,
  end_of_turn_confidence_threshold: 0.78,  // Slightly stricter for K-2 noise robustness
};

// All other bands use the unified baseline directly
const DEFAULT_PRESET: TurnPolicyConfig = UNIFIED_BASELINE;

export function isK2PolicyEnabled(sessionOverride?: boolean | null): boolean {
  if (sessionOverride !== undefined && sessionOverride !== null) {
    return sessionOverride;
  }
  return process.env.TURN_POLICY_K2_ENABLED === 'true';
}

export function getTurnPolicyConfig(gradeBand: GradeBand, sessionOverride?: boolean | null): TurnPolicyConfig {
  const k2Enabled = isK2PolicyEnabled(sessionOverride);
  
  if (gradeBand === 'K-2' && k2Enabled) {
    return K2_PRESET;
  }
  
  return DEFAULT_PRESET;
}

export function createTurnPolicyState(): TurnPolicyState {
  return {
    hesitationGuardActive: false,
    awaitingSecondEot: false,
    lastEotTimestamp: 0,
    stallEscapeTriggered: false,
    turnStartTimestamp: Date.now(),
    finalTranscriptReceivedAt: null,
    // Adaptive Patience
    patienceScore: 0.3,  // Start with slight patience
    hesitationCount: 0,
    continuationCount: 0,
    interruptAttempts: 0,
    // Activity mode
    activityMode: 'default',
  };
}

// Feature flag checks
export function isReadingModeEnabled(): boolean {
  return process.env.READING_MODE_PATIENCE_ENABLED === 'true';
}

export function isAdaptivePatienceEnabled(): boolean {
  return process.env.ADAPTIVE_PATIENCE_ENABLED === 'true';
}

export function getReadingModeConfig(): ReadingModeConfig {
  return { ...READING_MODE_CONFIG };
}

export function getAdaptivePatienceConfig(): AdaptivePatienceConfig {
  return { ...ADAPTIVE_PATIENCE_CONFIG };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Adaptive Patience Functions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const HESITATION_PATTERNS = [
  /\b(um|uh|uhh|umm)\b/i,
  /\b(wait|hold on|let me think)\b/i,
  /\b(i think|maybe|hmm|hm)\b/i,
];

const CONTINUATION_PATTERNS = [
  /\b(and|so|because|then|but)\s*$/i,
  /\b(like|that|which|when|if)\s*$/i,
];

export function calculateSignalScore(transcript: string): number {
  let signals = 0;
  const total = 3;
  
  for (const pattern of HESITATION_PATTERNS) {
    if (pattern.test(transcript)) {
      signals += 1;
      break;
    }
  }
  
  for (const pattern of CONTINUATION_PATTERNS) {
    if (pattern.test(transcript)) {
      signals += 1;
      break;
    }
  }
  
  if (!/[.!?]$/.test(transcript.trim())) {
    signals += 0.5;
  }
  
  return Math.min(signals / total, 1.0);
}

export function updateAdaptivePatience(
  state: TurnPolicyState,
  transcript: string,
  wasInterruptAttempt: boolean = false
): void {
  if (!isAdaptivePatienceEnabled()) return;
  
  const signalScore = calculateSignalScore(transcript);
  
  if (wasInterruptAttempt) {
    state.interruptAttempts++;
  }
  
  // Count hesitation markers
  for (const pattern of HESITATION_PATTERNS) {
    if (pattern.test(transcript)) {
      state.hesitationCount++;
      break;
    }
  }
  
  // Count continuation endings
  for (const pattern of CONTINUATION_PATTERNS) {
    if (pattern.test(transcript)) {
      state.continuationCount++;
      break;
    }
  }
  
  // Update patience score with exponential moving average
  state.patienceScore = Math.max(0, Math.min(1, 
    0.7 * state.patienceScore + 0.3 * signalScore
  ));
}

export interface PatienceAdjustments {
  minSilenceMs: number;
  maxSilenceMs: number;
  graceMs: number;
}

export function getAdjustedPatienceParams(state: TurnPolicyState): PatienceAdjustments {
  const adaptiveEnabled = isAdaptivePatienceEnabled();
  const readingEnabled = isReadingModeEnabled() && state.activityMode === 'reading';
  
  let minSilenceBonus = 0;
  let maxSilenceBonus = 0;
  let graceBonus = 0;
  
  // Adaptive patience adjustments
  if (adaptiveEnabled) {
    minSilenceBonus += Math.round(state.patienceScore * 250);
    maxSilenceBonus += Math.round(state.patienceScore * 900);
    graceBonus += Math.round(state.patienceScore * 120);
  }
  
  // Reading mode overlay
  if (readingEnabled) {
    minSilenceBonus += READING_MODE_CONFIG.minSilenceBonusMs;
    maxSilenceBonus += READING_MODE_CONFIG.maxSilenceBonusMs;
  }
  
  // Apply caps
  const caps = readingEnabled
    ? { min: READING_MODE_CONFIG.minSilenceCapMs, max: READING_MODE_CONFIG.maxSilenceCapMs }
    : { min: ADAPTIVE_PATIENCE_CONFIG.minSilenceCapMs, max: ADAPTIVE_PATIENCE_CONFIG.maxSilenceCapMs };
  
  return {
    minSilenceMs: Math.min(minSilenceBonus, caps.min),
    maxSilenceMs: Math.min(maxSilenceBonus, caps.max),
    graceMs: Math.min(graceBonus, ADAPTIVE_PATIENCE_CONFIG.graceCapMs),
  };
}

export function setActivityMode(state: TurnPolicyState, mode: ActivityMode): void {
  state.activityMode = mode;
}

export function logAdaptivePatience(
  sessionId: string,
  gradeBand: GradeBand,
  state: TurnPolicyState,
  signalScore: number,
  applied: PatienceAdjustments
): void {
  console.log('[adaptive_patience]', JSON.stringify({
    sessionId: sessionId.substring(0, 8),
    gradeBand,
    activityMode: state.activityMode,
    patienceScore: state.patienceScore.toFixed(3),
    signalScore: signalScore.toFixed(3),
    hesitationCount: state.hesitationCount,
    continuationCount: state.continuationCount,
    interruptAttempts: state.interruptAttempts,
    appliedMinSilenceMs: applied.minSilenceMs,
    appliedMaxSilenceMs: applied.maxSilenceMs,
    appliedGraceMs: applied.graceMs,
  }));
}

/**
 * Sentence-level hesitation/continuation detection
 * Returns true if the text suggests the student is still thinking
 */
export function endsWithHesitationOrContinuation(text: string): boolean {
  const sentences = text.split(/[.!?]/);
  const lastSentence = (sentences[sentences.length - 1] || '').trim().toLowerCase();

  const hesitationPattern = /\b(um|umm|uh|wait|hold on|let me think|i think|maybe|hmm)\b$/;
  const continuationPattern = /\b(and|so|because|then|but)\b$/;
  const endsWithTerminalPunctuation = /[.!?]$/.test(text.trim());

  return (
    !endsWithTerminalPunctuation &&
    (hesitationPattern.test(lastSentence) || continuationPattern.test(lastSentence))
  );
}

export interface EvaluateTurnParams {
  gradeBand: GradeBand;
  sessionK2Override?: boolean | null;
  transcript: string;
  eotConfidence: number;
  endOfTurn: boolean;
  policyState: TurnPolicyState;
  currentTimestamp: number;
}

/**
 * Evaluate whether to fire Claude or wait for more input
 * 
 * When K2 policy is active and hesitation is detected:
 * - Do NOT fire Claude immediately
 * - Wait for either:
 *   a) another end_of_turn=true, OR
 *   b) max_turn_silence_ms elapsed (stall escape)
 */
export function evaluateTurn(params: EvaluateTurnParams): TurnPolicyEvaluation {
  const {
    gradeBand,
    sessionK2Override,
    transcript,
    eotConfidence,
    endOfTurn,
    policyState,
    currentTimestamp,
  } = params;

  const k2Enabled = isK2PolicyEnabled(sessionK2Override);
  const config = getTurnPolicyConfig(gradeBand, sessionK2Override);
  const isK2Active = gradeBand === 'K-2' && k2Enabled;

  const evaluation: TurnPolicyEvaluation = {
    grade_band: gradeBand,
    k2_policy_enabled: k2Enabled,
    eot_confidence: eotConfidence,
    silence_duration_ms: 0,
    hesitation_guard_triggered: false,
    stall_escape_triggered: false,
    time_to_first_audio_ms: null,
    transcript_preview: transcript.slice(0, 60),
    should_fire_claude: false,
  };

  if (!endOfTurn) {
    return evaluation;
  }

  policyState.finalTranscriptReceivedAt = currentTimestamp;
  const silenceSinceLastEot = currentTimestamp - policyState.lastEotTimestamp;
  evaluation.silence_duration_ms = silenceSinceLastEot;

  if (!isK2Active) {
    evaluation.should_fire_claude = true;
    policyState.lastEotTimestamp = currentTimestamp;
    return evaluation;
  }

  if (eotConfidence < config.end_of_turn_confidence_threshold) {
    return evaluation;
  }

  const hasHesitation = endsWithHesitationOrContinuation(transcript);

  if (hasHesitation && !policyState.awaitingSecondEot) {
    policyState.hesitationGuardActive = true;
    policyState.awaitingSecondEot = true;
    policyState.lastEotTimestamp = currentTimestamp;
    evaluation.hesitation_guard_triggered = true;
    return evaluation;
  }

  if (policyState.awaitingSecondEot) {
    policyState.awaitingSecondEot = false;
    policyState.hesitationGuardActive = false;
    evaluation.should_fire_claude = true;
    policyState.lastEotTimestamp = currentTimestamp;
    return evaluation;
  }

  evaluation.should_fire_claude = true;
  policyState.lastEotTimestamp = currentTimestamp;
  return evaluation;
}

export interface StallCheckParams {
  gradeBand: GradeBand;
  sessionK2Override?: boolean | null;
  policyState: TurnPolicyState;
  currentTimestamp: number;
  hasAudioInput: boolean;
}

/**
 * Check if stall escape should be triggered
 * Fires when max_turn_silence_ms elapses with no new audio
 */
export function checkStallEscape(params: StallCheckParams): TurnPolicyEvaluation | null {
  const {
    gradeBand,
    sessionK2Override,
    policyState,
    currentTimestamp,
    hasAudioInput,
  } = params;

  const k2Enabled = isK2PolicyEnabled(sessionK2Override);
  const isK2Active = gradeBand === 'K-2' && k2Enabled;

  if (!isK2Active || !policyState.hesitationGuardActive || hasAudioInput) {
    return null;
  }

  const config = getTurnPolicyConfig(gradeBand, sessionK2Override);
  const silenceDuration = currentTimestamp - policyState.lastEotTimestamp;

  if (silenceDuration >= config.max_turn_silence_ms) {
    policyState.stallEscapeTriggered = true;
    policyState.hesitationGuardActive = false;
    policyState.awaitingSecondEot = false;

    return {
      grade_band: gradeBand,
      k2_policy_enabled: k2Enabled,
      eot_confidence: 0,
      silence_duration_ms: silenceDuration,
      hesitation_guard_triggered: false,
      stall_escape_triggered: true,
      time_to_first_audio_ms: null,
      transcript_preview: '',
      should_fire_claude: true,
      stall_prompt: "Do you want more time to think, or would you like some help?",
    };
  }

  return null;
}

export function resetTurnPolicyState(state: TurnPolicyState): void {
  state.hesitationGuardActive = false;
  state.awaitingSecondEot = false;
  state.stallEscapeTriggered = false;
  state.turnStartTimestamp = Date.now();
  state.finalTranscriptReceivedAt = null;
}

export function logTurnPolicyEvaluation(evaluation: TurnPolicyEvaluation): void {
  console.log('[TurnPolicy] turn_policy_evaluation', JSON.stringify({
    grade_band: evaluation.grade_band,
    k2_policy_enabled: evaluation.k2_policy_enabled,
    eot_confidence: evaluation.eot_confidence.toFixed(2),
    silence_duration_ms: evaluation.silence_duration_ms,
    hesitation_guard_triggered: evaluation.hesitation_guard_triggered,
    stall_escape_triggered: evaluation.stall_escape_triggered,
    time_to_first_audio_ms: evaluation.time_to_first_audio_ms,
    transcript_preview: evaluation.transcript_preview,
    should_fire_claude: evaluation.should_fire_claude,
  }));
}

export function getK2ResponseConstraints(): string {
  return `
IMPORTANT K-2 RESPONSE CONSTRAINTS:
- Use MAX 1-2 short sentences
- Use simple vocabulary appropriate for ages 5-8
- Always end with a question to encourage thinking
- Never give multi-step explanations in one response
- Maintain Socratic method - guide, don't tell
`.trim();
}
