/**
 * K-2 Turn Policy Module
 * 
 * Implements a "Very Patient" turn-taking policy for young learners (K-2)
 * that prevents interrupting while they think aloud.
 * 
 * Feature Flag: TURN_POLICY_K2_ENABLED (default: false)
 * 
 * Target Metrics:
 * - ≥30% reduction in premature interruptions
 * - <500ms increase in median response time
 * - <5% stall_escape_triggered rate
 * 
 * Rollback Criteria (within 48 hours of enabled rollout):
 * - >20% increase in session abandonment rate
 * - >50% increase in median time_to_first_audio_ms
 * - >3 P0 bugs
 * → Disable by setting TURN_POLICY_K2_ENABLED=false
 */

export type GradeBand = 'K-2' | '3-5' | '6-8' | '9-12' | 'College/Adult' | null;

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
}

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

const K2_PRESET: TurnPolicyConfig = {
  end_of_turn_confidence_threshold: 0.75,
  min_end_of_turn_silence_when_confident_ms: 900,
  max_turn_silence_ms: 4500,
  post_eot_grace_ms: 350,
};

const DEFAULT_PRESET: TurnPolicyConfig = {
  end_of_turn_confidence_threshold: 0.65,
  min_end_of_turn_silence_when_confident_ms: 1000,
  max_turn_silence_ms: 5000,
  post_eot_grace_ms: 0,
};

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
  };
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
