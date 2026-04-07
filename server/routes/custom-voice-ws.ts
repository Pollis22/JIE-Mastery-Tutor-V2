import { WebSocketServer, WebSocket } from "ws";
import { Server } from 'http';
import { IncomingMessage } from 'http';
import { Socket } from 'net';
import { startDeepgramStream, DeepgramConnection } from "../services/deepgram-service";
import { generateTutorResponse, generateTutorResponseStreaming, StreamingCallbacks } from "../services/ai-service";
import { generateSpeech, prewarmTTS } from "../services/tts-service";
import { db } from "../db";
import { realtimeSessions, contentViolations, userSuspensions, documentChunks } from "@shared/schema";
import { eq, and, or, gte } from "drizzle-orm";
import { getTutorPersonality } from "../config/tutor-personalities";
import { getSpecializationPromptBlock, getPracticeModePromptBlock } from '../config/subject-specializations';
import { moderateContent, shouldWarnUser, getModerationResponse } from "../services/content-moderation";
import { storage } from "../storage";
import { validateWsSession, rejectWsUpgrade } from '../middleware/ws-session-validator';
import { wsRateLimiter, getClientIp } from '../middleware/ws-rate-limiter';
import { EmailService } from '../services/email-service';
import { users, students } from "@shared/schema";
import { trialService } from '../services/trial-service';
import { detectSafetyIssues, getStrikeMessage, shouldTerminateSession, SafetyDetectionResult } from '../services/safety-detection-service';
import { sendAdminSafetyAlert, logSafetyIncident, SafetyAlertData, handleSafetyIncident, SafetyIncidentNotification, SafetyIncidentType } from '../services/safety-alert-service';
import { safetyIncidents } from '@shared/schema';
import { getRecentSessionSummaries } from '../services/memory-service';
import { getEndpointingProfile, ENDPOINTING_PROFILES, getKeytermsForUrl, sanitizeKeyterms, getSessionKeyterms, type BandName } from '../config/assemblyai-endpointing-profiles';
import {
  type GradeBand,
  type TurnPolicyState,
  type ActivityMode as TurnActivityMode,
  createTurnPolicyState,
  evaluateTurn,
  checkStallEscape,
  resetTurnPolicyState,
  logTurnPolicyEvaluation,
  getK2ResponseConstraints,
  isK2PolicyEnabled,
  getTurnPolicyConfig,
  updateAdaptivePatience,
  getAdjustedPatienceParams,
  setActivityMode,
  logAdaptivePatience,
  calculateSignalScore,
  isAdaptivePatienceEnabled as isTurnAdaptivePatienceEnabled,
} from "../services/turn-policy";
import {
  type EchoGuardState,
  createEchoGuardState,
  getEchoGuardConfig,
  recordTutorUtterance,
  markPlaybackStart,
  markPlaybackEnd,
  checkForEcho,
  shouldAllowBargeIn,
  logEchoGuardStateTransition,
} from "../services/echo-guard";
import {
  getCoherenceGateConfig,
  checkCoherence,
  extractConversationContext,
  logCoherenceGateReject,
  getCoherenceClarifyMessage,
} from "../services/coherence-gate";
import {
  DOCS_FALLBACK_TO_ALL_IF_NONE_ACTIVE,
  logRagRetrieval,
  logRagError,
  logRagRetrievalDocsSelected,
} from "../services/session-docs-service";
import {
  type ActivityMode,
  isAdaptiveBargeInEnabled,
  isReadingModeEnabled,
  isAdaptivePatienceEnabled,
  isGoodbyeHardStopEnabled,
  normalizeGradeBand,
  logBargeInEval,
  evaluateBargeIn,
  createBaselineState,
  updateBaseline,
  type BaselineState,
  type BargeInEvalResult,
} from "../services/adaptive-barge-in";
import {
  type NoiseFloorState,
  type SpeechDetectionResult,
  type TranscriptValidationResult,
  createNoiseFloorState,
  detectSpeech,
  calculateRMS,
  calculatePeak,
  getNoiseFloor,
  getSpeechThreshold,
  resetSpeechDetection,
  isInGracePeriod,
  validateTranscript,
  validateTranscriptForBargeIn,
  isNoiseFloorEnabled,
  logNoiseFloorGating,
  logBargeInDecision,
  logGhostTurnPrevention,
} from "../services/noise-floor";

// ============================================
// FEATURE FLAG: STT PROVIDER SELECTION
// Set STT_PROVIDER=deepgram to use Deepgram Nova-2
// Set STT_PROVIDER=assemblyai (or leave unset) to use AssemblyAI Universal-Streaming (DEFAULT)
// ============================================
const USE_ASSEMBLYAI = process.env.STT_PROVIDER !== 'deepgram';
console.log('[STT] Provider config:', process.env.STT_PROVIDER);
console.log('[STT] USE_ASSEMBLYAI flag:', USE_ASSEMBLYAI);
console.log(`[STT] Provider: ${USE_ASSEMBLYAI ? 'AssemblyAI Universal-Streaming' : 'Deepgram Nova-2'}`);

// ============================================
// ASSEMBLYAI UNIVERSAL-STREAMING (RFC APPROVED)
// Semantic turn detection for natural conversation flow
// ============================================

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ASSEMBLYAI v3 PHASE 1 CONFIGURATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// A) Streaming endpoint routing (edge/us/eu/default)
// Edge provides lowest latency by routing to nearest server
type AssemblyAIStreamingRoute = 'edge' | 'us' | 'eu' | 'default';
const ASSEMBLYAI_STREAMING_ROUTE: AssemblyAIStreamingRoute = 
  (process.env.ASSEMBLYAI_STREAMING_ROUTE as AssemblyAIStreamingRoute) || 'edge';

const ASSEMBLYAI_ROUTE_MAP: Record<AssemblyAIStreamingRoute, string> = {
  'edge': 'wss://streaming.edge.assemblyai.com',
  'us': 'wss://streaming.us.assemblyai.com',
  'eu': 'wss://streaming.eu.assemblyai.com',
  'default': 'wss://streaming.assemblyai.com',
};

function getAssemblyAIBaseUrl(): string {
  const baseUrl = ASSEMBLYAI_ROUTE_MAP[ASSEMBLYAI_STREAMING_ROUTE] || ASSEMBLYAI_ROUTE_MAP['default'];
  console.log(`[AssemblyAI v3] 🌍 Route: ${ASSEMBLYAI_STREAMING_ROUTE} → ${baseUrl}`);
  return baseUrl;
}

// C) Turn commit mode: first_eot (low latency) vs formatted (legacy)
type TurnCommitMode = 'first_eot' | 'formatted';
const ASSEMBLYAI_TURN_COMMIT_MODE: TurnCommitMode = 
  (process.env.ASSEMBLYAI_TURN_COMMIT_MODE as TurnCommitMode) || 'first_eot';

// E) Optional inactivity timeout (5-3600 seconds)
function getInactivityTimeoutSec(): number | null {
  const val = process.env.ASSEMBLYAI_INACTIVITY_TIMEOUT_SEC;
  if (!val) return null;
  const parsed = parseInt(val, 10);
  if (isNaN(parsed) || parsed < 5 || parsed > 3600) {
    console.warn(`[AssemblyAI v3] ⚠️ Invalid ASSEMBLYAI_INACTIVITY_TIMEOUT_SEC: ${val} (must be 5-3600), omitting`);
    return null;
  }
  return parsed;
}

// E) Profile mode: profile (per-band) vs global (hardcoded values)
type ProfileMode = 'profile' | 'global';
const ASSEMBLYAI_PROFILE_MODE: ProfileMode = 
  (process.env.ASSEMBLYAI_PROFILE_MODE as ProfileMode) || 'profile';

console.log('[AssemblyAI v3] Config:', {
  route: ASSEMBLYAI_STREAMING_ROUTE,
  turnCommitMode: ASSEMBLYAI_TURN_COMMIT_MODE,
  inactivityTimeout: getInactivityTimeoutSec(),
  profileMode: ASSEMBLYAI_PROFILE_MODE,
});

interface AssemblyAIMessage {
  message_type?: string;
  session_id?: string;
  transcript?: string;
  turn_order?: number;
  end_of_turn?: boolean;
  end_of_turn_confidence?: number;
  turn_is_formatted?: boolean;
  error?: string;
}

interface AssemblyAIState {
  ws: WebSocket | null;
  lastTranscript: string;
  lastTranscriptTime: number;
  sessionId: string;
  isOpen: boolean;
  audioBuffer: Buffer[];
  lastError: string | null;
  closeCode: number | null;
  closeReason: string | null;
  pendingFragment?: string; // LEXICAL_GRACE: Pending transcript fragment awaiting merge
  pendingFragmentTime?: number; // LEXICAL_GRACE: When the pending fragment was created
  pendingFragmentTimeout?: NodeJS.Timeout; // LEXICAL_GRACE: Timeout ID to cancel on merge
  // C) Turn commit tracking to prevent double Claude triggers
  committedTurnOrders: Set<number>;
  // C) Fallback guard: one-shot commit flag for when turn_order is missing
  currentTurnCommitted: boolean;
  // F) Latency instrumentation
  firstEotTimestamp?: number;
}

const ASSEMBLYAI_CONFIG = {
  MERGE_WINDOW_MS: 1000,
  CONJUNCTION_ENDINGS: [
    'and', 'or', 'but', 'about', 'because', 'like', 'that',
    'which', 'so', 'if', 'when', 'the', 'a', 'an', 'to', 'for'
  ],
  MIN_TOKENS_FOR_STANDALONE: 6,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LLM WATCHDOG: Failsafe for missed LLM invocations (Step 1)
// Feature flag: LLM_WATCHDOG_ENABLED (default: true)
// Triggers if no LLM request starts within WATCHDOG_DELAY_MS after end_of_turn
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const LLM_WATCHDOG_CONFIG = {
  ENABLED: process.env.LLM_WATCHDOG_ENABLED !== 'false', // Default ON for reliability
  DELAY_MS: parseInt(process.env.LLM_WATCHDOG_DELAY_MS || '3000', 10), // 3 seconds
  MIN_TOKENS: 2, // Only trigger for transcripts with >= 2 tokens (per spec)
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TURN FALLBACK: Controlled fallback if no response produced within timeout
// Feature flag: TURN_FALLBACK_ENABLED (default: true)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const TURN_FALLBACK_CONFIG = {
  ENABLED: process.env.TURN_FALLBACK_ENABLED !== 'false', // Default ON
  TIMEOUT_MS: parseInt(process.env.TURN_FALLBACK_TIMEOUT_MS || '15000', 10), // 15 seconds
  MESSAGE: "I didn't quite catch that. Can you repeat your last sentence?",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONTINUATION GUARD: Two-phase commit for user turns (Global, all bands)
// Prevents premature turn commits that split thoughts into multiple turns
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const CONTINUATION_GUARD_CONFIG = {
  ENABLED: process.env.CONTINUATION_GUARD_ENABLED !== 'false',
  GRACE_MS: parseInt(process.env.CONTINUATION_GRACE_MS || '1000', 10),
  HEDGE_GRACE_MS: parseInt(process.env.CONTINUATION_HEDGE_GRACE_MS || '2500', 10),
  MIN_TURN_CHARS: parseInt(process.env.CONTINUATION_MIN_TURN_CHARS || '2', 10),
};

const HEDGE_PHRASES = [
  "i don't know", "i really don't know", "i dont know",
  "um", "uh", "wait", "hold on", "let me think", "one second",
  "hmm", "hm", "er", "erm", "well", "so", "like",
  "i'm not sure", "im not sure", "i am not sure",
  "let me see", "give me a second", "uno", "este",
  // Skip-turn phrases (inspired by ElevenLabs Skip Turn tool)
  "give me a moment", "one moment", "let me think about that",
  "hang on", "just a second", "just a moment", "let me figure this out",
  "i'm thinking", "im thinking", "i need a second", "i need a moment",
  "bear with me", "let me remember", "what was it",
  "that's a good question", "thats a good question",
  "okay let me think", "ok let me think",
];

function isHedgePhrase(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return HEDGE_PHRASES.some(phrase => lower.endsWith(phrase) || lower === phrase);
}

// FIX 3: Conversational tail grace extension for short polite lead-ins
const POLITE_LEADIN_PATTERNS = [
  /\b(excuse me|if you don't mind|if you dont mind)\s*$/i,
  /\b(can i|could you|may i|i have a question)\s*$/i,
  /\b(i wanted to|i want to|i'd like to|id like to)\s*$/i,
  /\b(let's talk about|lets talk about|how about|what about)\s*$/i,
  /\b(actually|okay|ok|so yeah|you know)\s*$/i,
];

function isPoliteLeadIn(text: string): boolean {
  const trimmed = text.trim();
  const wordCount = trimmed.split(/\s+/).filter(w => w.length > 0).length;
  if (wordCount >= 10) return false;
  return POLITE_LEADIN_PATTERNS.some(p => p.test(trimmed));
}

function getTailGraceExtension(text: string, ageGroup: string | null): number {
  if (!isPoliteLeadIn(text)) return 0;
  const isAdult = ageGroup?.toLowerCase().includes('college') || ageGroup?.toLowerCase().includes('adult');
  return isAdult ? 800 : 1500;
}

const QUICK_ANSWER_PATTERNS = [
  /^\d+(\.\d+)?$/,
  /^(yes|no|yeah|yep|nah|nope|true|false|si|sí|oui|non)$/i,
  /^(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)$/i,
];

// P1: Removed articles ('the', 'a', 'an') that caused random sluggishness
const CONTINUATION_CONJUNCTIONS = [
  'but', 'and', 'so', 'because', 'if', 'or', 'then', 'when',
  'while', 'since', 'although', 'though', 'unless', 'until',
  'after', 'before', 'that', 'which', 'where', 'who', 'whom',
  'like', 'about', 'with', 'for', 'to',
];

function isQuickAnswer(text: string): boolean {
  const trimmed = text.trim();
  return QUICK_ANSWER_PATTERNS.some(p => p.test(trimmed));
}

function endsWithConjunctionOrPreposition(text: string): boolean {
  // P1: Strip trailing punctuation before checking last token
  const stripped = text.trim().replace(/[.,!?;:]+$/, '').trim();
  const lastWord = stripped.split(/\s+/).pop()?.toLowerCase() || '';
  return CONTINUATION_CONJUNCTIONS.includes(lastWord);
}

function isShortDeclarative(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(w => w.length > 0);
  return words.length < 8 && !isQuickAnswer(text);
}

// LANGUAGE PRACTICE: Helper to detect language-learning sessions
// In these sessions, non-lexical sounds ("ah", "oh", "er") and single letters
// are valid practice utterances and should NOT be filtered out.
function isLanguagePracticeSession(subject?: string): boolean {
  if (!subject) return false;
  const languageSubjects = [
    'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Russian',
    'Chinese', 'Japanese', 'Korean', 'Arabic', 'Hindi', 'English as a Second Language',
    'ESL', 'Language Arts', 'Foreign Language', 'World Languages'
  ];
  return languageSubjects.some(lang => subject.toLowerCase().includes(lang.toLowerCase()));
}

// P0: Centralized transcript drop decision — replaces ALL raw char-length gates
// Allows legitimate short lexical answers like "no", "ok", "I", "2", "5", "a", "y"
function shouldDropTranscript(text: string, state: { isSessionEnded: boolean; sessionFinalizing: boolean; subject?: string }): { drop: boolean; reason: string } {
  if (!text || !text.trim()) {
    return { drop: true, reason: 'empty' };
  }
  if (state.isSessionEnded || state.sessionFinalizing) {
    return { drop: true, reason: 'session_ended' };
  }
  const trimmed = text.trim();
  
  // LANGUAGE PRACTICE: In language-learning sessions, sounds like "ah", "oh", "er"
  // are valid pronunciation practice and should not be filtered as non-lexical.
  const isLanguageSession = isLanguagePracticeSession(state.subject);
  
  const NON_LEXICAL_DROP = [
    /^(um+|uh+|hmm+|hm+|ah+|oh+|er+|erm+)$/i,
    /^\[.*\]$/,
    /^[\s.,!?]*$/,
  ];
  for (const pattern of NON_LEXICAL_DROP) {
    if (pattern.test(trimmed)) {
      // Bypass non-lexical filter for language practice sessions
      if (isLanguageSession && /^(ah+|oh+|er+|erm+)$/i.test(trimmed)) {
        console.log(`[LanguagePractice] ✅ Allowing non-lexical "${trimmed}" in language session (subject: ${state.subject})`);
        return { drop: false, reason: 'valid_language_practice' };
      }
      return { drop: true, reason: 'non_lexical' };
    }
  }
  return { drop: false, reason: 'valid' };
}

// P1: Thinking-aloud detection for older bands — adds continuation patience
const OLDER_BANDS = new Set(['G6-8', 'G9-12', 'ADV']);
const THINKING_ALOUD_EXTRA_GRACE_MS = 1200;

function isThinkingAloud(pendingText: string): boolean {
  const trimmed = pendingText.trim();
  const words = trimmed.split(/\s+/).filter(w => w.length > 0);
  if (words.length >= 5) return true;
  if (trimmed.length >= 20) return true;
  if (endsWithContinuationCue(trimmed)) return true;
  return false;
}

// P1: Real continuation cues only (no articles: 'the', 'a', 'an')
const REAL_CONTINUATION_CUES = [
  'but', 'and', 'so', 'because', 'if', 'or', 'then', 'when',
  'while', 'since', 'although', 'though', 'unless', 'until',
  'after', 'before', 'that', 'which', 'where', 'who', 'whom',
  'like', 'about', 'with', 'for', 'to',
];

function endsWithContinuationCue(text: string): boolean {
  const stripped = text.replace(/[.,!?;:]+$/, '').trim();
  const lastWord = stripped.split(/\s+/).pop()?.toLowerCase() || '';
  return REAL_CONTINUATION_CUES.includes(lastWord);
}

// Recovery phrases that should NOT end a session (Step 2)
// These are common phrases users say when waiting for a response
const RECOVERY_PHRASES = [
  "i'm finished", "im finished", "i am finished",
  "i'm done", "im done", "i am done",
  "hello", "hello?", "hi", "hey",
  "are you there", "are you there?", "you there?",
  "can you hear me", "can you hear me?",
  "tutor", "tutor?", "hey tutor",
];

function isRecoveryPhrase(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  // Must be a short message to qualify as recovery phrase
  if (normalized.length > 30) return false;
  return RECOVERY_PHRASES.some(phrase => normalized === phrase || normalized === phrase.replace('?', ''));
}

function shouldMergeWithPrevious(
  lastTranscript: string,
  lastTranscriptTime: number,
  currentTime: number
): boolean {
  if (!lastTranscript || currentTime - lastTranscriptTime > ASSEMBLYAI_CONFIG.MERGE_WINDOW_MS) {
    return false;
  }

  const lastWord = lastTranscript.trim().split(/\s+/).pop()?.toLowerCase() || '';
  const endsWithConjunction = ASSEMBLYAI_CONFIG.CONJUNCTION_ENDINGS.includes(lastWord);
  const tokenCount = lastTranscript.trim().split(/\s+/).length;
  const tooShort = tokenCount < ASSEMBLYAI_CONFIG.MIN_TOKENS_FOR_STANDALONE;

  return endsWithConjunction || tooShort;
}

const STT_ARTIFACT_HARDENING = `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎙️ SPEECH-TO-TEXT ACCURACY GUIDELINES (CRITICAL FOR VOICE):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Speech-to-text (STT) for young learners, ESL students, and language-learning sessions can be INACCURATE. You MUST follow these rules:

1. If the transcript contains odd English words during a non-English drill (e.g., "tardis" during Spanish practice), assume it is a MIS-TRANSCRIPTION of the target word (e.g., "tardes"). Do NOT go off-topic or respond literally to garbled text.

2. If the transcript is phonetically close to the target word or expected answer, treat it as a near-correct attempt. For example:
   - "blindness" during Spanish → likely "buenas"
   - "tardis" during Spanish → likely "tardes"  
   - "mikasa" during Spanish → likely "mi casa"
   - "bone jure" during French → likely "bonjour"

3. Use confirmation questions and gentle repetition instead of declaring the student wrong:
   - "It sounds like you said [target word]! Great attempt! Let's practice saying it together."
   - "I think you're trying to say [target word] - that's really close! Listen again..."

4. NEVER respond to obviously garbled STT as if the student said something unrelated. Always interpret charitably in the context of the current lesson.

5. If you genuinely cannot determine what the student meant, ask them to repeat rather than guessing wildly:
   - "Could you say that one more time? I want to make sure I hear you right."
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

// ============================================
// AssemblyAI Universal Streaming v3 API
// Endpoint: wss://streaming.assemblyai.com/v3/ws
// Authentication: Temporary token via URL param OR API key in header
// Audio: Raw binary PCM16 (NOT base64)
// Turn detection params go in URL query string
// Message types: Begin, Turn, Termination
// ============================================

// Cached token for reuse (tokens last up to 1 hour)
let assemblyAIToken: string | null = null;
let assemblyAITokenExpiry: number = 0;

async function getAssemblyAIStreamingToken(): Promise<string> {
  // Return cached token if still valid (with 5 min buffer)
  if (assemblyAIToken && Date.now() < assemblyAITokenExpiry - 300000) {
    console.log('[AssemblyAI v3] 🔑 Using cached token');
    return assemblyAIToken;
  }
  
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing ASSEMBLYAI_API_KEY');
  }
  
  console.log('[AssemblyAI v3] 🔑 Fetching new streaming token...');
  
  // v3 token endpoint
  const response = await fetch('https://streaming.assemblyai.com/v3/token?expires_in_seconds=3600', {
    method: 'GET',
    headers: {
      'Authorization': apiKey,
    },
  });
  
  if (!response.ok) {
    const text = await response.text();
    console.error('[AssemblyAI v3] ❌ Token fetch failed:', response.status, text);
    throw new Error(`Token fetch failed: ${response.status} ${text}`);
  }
  
  const data = await response.json() as { token: string; expires_in_seconds: number };
  console.log('[AssemblyAI v3] ✅ Token obtained, expires in', data.expires_in_seconds, 'seconds');
  
  assemblyAIToken = data.token;
  assemblyAITokenExpiry = Date.now() + (data.expires_in_seconds * 1000);
  
  return data.token;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STT ARCHITECTURE FIX: Ring buffer, epoch fencing, ForceEndpoint, replay
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const PCM_RING_CAPACITY_FRAMES = 47; // ~3s at ~64ms/frame (2048-byte PCM16 @ 16kHz mono)
const STT_REPLAY_FRAME_INTERVAL_MS = 20;
const STT_REPLAY_FRAME_COUNT = 16; // ~1s replay window (was 12/~800ms)
// Speech watchdog removed — fresh STT per listening window eliminates stale connections.
// Only the 30s fallback deadman remains as a safety net.
const STT_FALLBACK_DEADMAN_MS = 30000;

class PcmRingBuffer {
  private readonly frames: Buffer[] = [];
  private readonly capacityFrames: number;

  constructor(capacityFrames: number = PCM_RING_CAPACITY_FRAMES) {
    this.capacityFrames = capacityFrames;
  }

  push(frame: Buffer): void {
    this.frames.push(Buffer.from(frame));
    if (this.frames.length > this.capacityFrames) {
      this.frames.splice(0, this.frames.length - this.capacityFrames);
    }
  }

  tail(frameCount: number): Buffer[] {
    if (frameCount <= 0) return [];
    return this.frames.slice(-frameCount).map((f) => Buffer.from(f));
  }

  clear(): void {
    this.frames.length = 0;
  }

  get size(): number {
    return this.frames.length;
  }
}

function sttSleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function sendAssemblyAIControl(
  sessionState: SessionState,
  controlType: 'ForceEndpoint' | 'Terminate',
  expectedEpoch: number = sessionState.sttEpoch,
): boolean {
  if (expectedEpoch !== sessionState.sttEpoch) return false;
  const ws = sessionState.assemblyAIWs;
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  try {
    ws.send(JSON.stringify({ type: controlType }));
    console.log(`[AssemblyAI] Sent ${controlType} session=${sessionState.sessionId?.substring(0, 8)} epoch=${expectedEpoch}`);
    return true;
  } catch {
    return false;
  }
}

function sendAssemblyAIForceEndpoint(sessionState: SessionState, expectedEpoch?: number): boolean {
  return sendAssemblyAIControl(sessionState, 'ForceEndpoint', expectedEpoch);
}

function sendAssemblyAITerminate(sessionState: SessionState, expectedEpoch?: number): boolean {
  return sendAssemblyAIControl(sessionState, 'Terminate', expectedEpoch);
}

/**
 * Cleanly close the current STT connection when entering TUTOR_SPEAKING.
 * The connection will be re-opened fresh when entering LISTENING.
 * This eliminates the stale-connection problem entirely.
 */
function teardownSttConnection(sessionState: SessionState, reason: string): void {
  const epoch = sessionState.sttEpoch;
  console.log(`[STT] teardown reason=${reason} epoch=${epoch} session=${sessionState.sessionId?.substring(0, 8)}`);

  // Flush and terminate gracefully
  sendAssemblyAIForceEndpoint(sessionState, epoch);
  sendAssemblyAITerminate(sessionState, epoch);

  // Close the WebSocket
  const ws = sessionState.assemblyAIWs;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    try { ws.close(4001, `teardown:${reason}`); } catch {}
  }

  // Clear state — connection will be re-created on LISTENING entry
  sessionState.assemblyAIWs = null;
  sessionState.sttConnected = false;
  sessionState.sttBeginReceived = false;
  sessionState.reconnectInFlight = false;
  sessionState.sttLastUserSpeechSentAtMs = 0;
}

async function replayRecentAudioAfterBegin(
  sessionState: SessionState,
  expectedEpoch: number,
): Promise<void> {
  if (expectedEpoch !== sessionState.sttEpoch) return;
  if (!sessionState.sttBeginReceived) return;
  const ws = sessionState.assemblyAIWs;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  const replayFrames = sessionState.sttAudioRingBuffer.tail(STT_REPLAY_FRAME_COUNT);
  if (replayFrames.length === 0) return;

  console.log(`[STT] replaying ${replayFrames.length} frames after Begin epoch=${expectedEpoch}`);
  for (const frame of replayFrames) {
    if (expectedEpoch !== sessionState.sttEpoch) return;
    const currentWs = sessionState.assemblyAIWs;
    if (!currentWs || currentWs.readyState !== WebSocket.OPEN) return;
    try {
      currentWs.send(frame);
      await sttSleep(STT_REPLAY_FRAME_INTERVAL_MS);
    } catch {
      return;
    }
  }
}

function createAssemblyAIConnection(
  language: string,
  onTranscript: (text: string, endOfTurn: boolean, confidence: number) => void,
  onError: (error: string) => void,
  onSessionStart?: (sessionId: string) => void,
  onClose?: () => void,
  ageGroup?: string,
  onPartialUpdate?: (text: string, prevText: string) => void,
  onOpen?: () => void,
  onMessage?: () => void,
  keytermsJson?: string | null
): { ws: WebSocket; state: AssemblyAIState } {
  console.log('████████████████████████████████████████████████████████████████');
  console.log('[AssemblyAI v3] ENTER createAssemblyAIConnection');
  console.log('[AssemblyAI v3] Language:', language);
  console.log('[AssemblyAI v3] API Key exists:', !!process.env.ASSEMBLYAI_API_KEY);
  console.log('[AssemblyAI v3] API Key length:', process.env.ASSEMBLYAI_API_KEY?.length);
  console.log('████████████████████████████████████████████████████████████████');
  
  const state: AssemblyAIState = {
    ws: null,
    lastTranscript: '',
    lastTranscriptTime: 0,
    sessionId: '',
    isOpen: false,
    audioBuffer: [],
    lastError: null,
    closeCode: null,
    closeReason: null,
    // C) Track committed turn_order values to prevent double Claude triggers
    committedTurnOrders: new Set<number>(),
    // C) Fallback guard: one-shot commit flag for when turn_order is missing
    currentTurnCommitted: false,
    // F) Latency instrumentation
    firstEotTimestamp: undefined,
  };

  // Fail fast if no API key
  if (!process.env.ASSEMBLYAI_API_KEY) {
    const err = new Error('Missing ASSEMBLYAI_API_KEY environment variable');
    console.error('[AssemblyAI v3] ❌', err.message);
    state.lastError = err.message;
    onError(err.message);
    const dummyWs = new WebSocket('wss://localhost:1');
    dummyWs.close();
    return { ws: dummyWs, state };
  }

  // Select speech model based on language
  // B) SAFETY FIX: Use correct model name "universal-streaming-multilingual" (not "multi")
  const NON_ENGLISH_LANGUAGES = [
    'es', 'spanish', 'espanol',
    'fr', 'french', 'français',
    'de', 'german', 'deutsch',
    'it', 'italian', 'italiano',
    'pt', 'portuguese', 'português',
    'zh', 'chinese', 'mandarin', '中文',
    'ja', 'japanese', '日本語',
    'ko', 'korean', '한국어',
    'ar', 'arabic', 'العربية',
    'hi', 'hindi', 'हिन्दी',
    'ru', 'russian', 'русский',
    'vi', 'vietnamese', 'tiếng việt',
    'th', 'thai', 'ไทย',
    'tr', 'turkish', 'türkçe',
    'pl', 'polish', 'polski',
    'nl', 'dutch', 'nederlands',
    'sv', 'swedish', 'svenska',
    'da', 'danish', 'dansk',
    'no', 'norwegian', 'norsk',
    'fi', 'finnish', 'suomi',
    'el', 'greek', 'ελληνικά',
    'he', 'hebrew', 'עברית',
    'id', 'indonesian', 'bahasa',
    'ms', 'malay', 'melayu',
    'tl', 'tagalog', 'filipino',
  ];

  const isNonEnglish = language && NON_ENGLISH_LANGUAGES.some(
    lang => language.toLowerCase().startsWith(lang) || language.toLowerCase() === lang
  );
  // speech_model omitted — let AssemblyAI use default streaming model.
  // u3-rt-pro stalled mid-turn, 'universal' returned 1011.
  console.log(`[AssemblyAI v3] 🌍 Language detection: input="${language}" isNonEnglish=${isNonEnglish} model=default (no override)`);
  
  // Get token and connect asynchronously
  // A) Use routed base URL for lowest latency
  const baseUrl = getAssemblyAIBaseUrl();
  let ws: WebSocket;
  
  try {
    // First try with header-based auth (simpler, works for server-side)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // AssemblyAI v3 end-of-turn configuration with per-band profiles
    // Profile mode: 'profile' uses age-band specific params, 'global' uses hardcoded
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    // Get endpointing profile based on ageGroup
    // Profile mode: use per-band values (defaults to MIDDLE if ageGroup missing)
    // Global mode: use hardcoded conservative values
    let endpointingParams: {
      end_of_turn_confidence_threshold: string;
      min_end_of_turn_silence_when_confident: string;
      max_turn_silence: string;
    };
    let selectedBand: BandName | 'GLOBAL' = 'GLOBAL';
    
    if (ASSEMBLYAI_PROFILE_MODE === 'profile') {
      // Profile mode: always use getEndpointingProfile which defaults to MIDDLE
      const { band, profile } = getEndpointingProfile(undefined, ageGroup);
      selectedBand = band;
      endpointingParams = {
        end_of_turn_confidence_threshold: profile.end_of_turn_confidence_threshold.toString(),
        min_end_of_turn_silence_when_confident: profile.min_end_of_turn_silence_when_confident.toString(),
        max_turn_silence: profile.max_turn_silence.toString(),
      };
    } else {
      // Global mode: use hardcoded conservative values (rollback)
      endpointingParams = {
        end_of_turn_confidence_threshold: '0.75',
        min_end_of_turn_silence_when_confident: '1200',
        max_turn_silence: '6000',
      };
    }
    
    // D) Log endpointing profile selection
    console.log(`[AssemblyAI v3] EndpointingProfile: band=${selectedBand} ageGroup=${ageGroup || 'undefined'} params=${JSON.stringify(endpointingParams)}`);
    
    const urlParams = new URLSearchParams({
      sample_rate: '16000',
      encoding: 'pcm_s16le',
      format_turns: 'true',
      ...endpointingParams,
    });
    
    // E) Add optional inactivity timeout if configured
    const inactivityTimeout = getInactivityTimeoutSec();
    if (inactivityTimeout !== null) {
      urlParams.set('inactivity_timeout', inactivityTimeout.toString());
      console.log(`[AssemblyAI v3] ⏱️ Inactivity timeout: ${inactivityTimeout}s`);
    }
    
    // I) Add keyterms_prompt for improved transcription accuracy
    // keyterms_prompt is a raw JSON string array — URLSearchParams handles encoding
    if (keytermsJson) {
      urlParams.set('keyterms_prompt', keytermsJson);
      console.log(`[AssemblyAI v3] 📚 Keyterms prompt set (${keytermsJson.length} chars raw JSON)`);
    }
    
    // A) Use routed base URL
    const wsUrl = `${baseUrl}/v3/ws?${urlParams.toString()}`;
    console.log('[AssemblyAI v3] 🌐 Connecting to:', wsUrl);
    console.log('[AssemblyAI v3] Speech model: default (no override)');
    console.log('[AssemblyAI v3] Turn commit mode:', ASSEMBLYAI_TURN_COMMIT_MODE);
    console.log('[AssemblyAI CONNECT URL]', wsUrl);
    
    ws = new WebSocket(wsUrl, {
      headers: {
        'Authorization': process.env.ASSEMBLYAI_API_KEY!,
      },
      handshakeTimeout: 10000,
    });
    
    console.log('[AssemblyAI v3] ✅ WebSocket created - initial readyState:', ws.readyState);
  } catch (err: any) {
    console.error('[AssemblyAI v3] ❌ WebSocket constructor threw:', err.message);
    state.lastError = err.message;
    onError(err.message);
    const dummyWs = new WebSocket('wss://localhost:1');
    dummyWs.close();
    return { ws: dummyWs, state };
  }
  
  state.ws = ws;
  
  // 5-second handshake timeout
  const handshakeTimeout = setTimeout(() => {
    if (!state.isOpen) {
      console.error('[AssemblyAI v3] ❌ Handshake timeout (5s) - readyState:', ws.readyState);
      state.lastError = 'AssemblyAI WS handshake timeout';
      onError('AssemblyAI WS handshake timeout');
      ws.terminate();
    }
  }, 5000);
  
  // Handle unexpected HTTP responses (401, 403, etc)
  (ws as any).on('unexpected-response', (req: any, res: any) => {
    clearTimeout(handshakeTimeout);
    let body = '';
    res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    res.on('end', () => {
      console.error('[AssemblyAI v3] ❌ HTTP handshake failed:', res.statusCode, body);
      state.lastError = `HTTP ${res.statusCode}: ${body}`;
      onError(`AssemblyAI connection rejected: HTTP ${res.statusCode}`);
    });
  });

  ws.on('open', () => {
    clearTimeout(handshakeTimeout);
    console.log('[AssemblyAI v3] ✅ WebSocket OPEN - connection established!');
    state.isOpen = true;
    
    // Flush any buffered audio
    if (state.audioBuffer.length > 0) {
      console.log('[AssemblyAI v3] 📦 Flushing', state.audioBuffer.length, 'buffered audio chunks');
      for (const chunk of state.audioBuffer) {
        ws.send(chunk);
      }
      state.audioBuffer = [];
    }
    
    if (onOpen) onOpen();
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CRITICAL: AssemblyAI v3 transcript handling
  // v3 Turn messages are IMMUTABLE REFINEMENTS, not deltas!
  // Each Turn contains the COMPLETE utterance so far - REPLACE, don't append
  // Only fire Claude when end_of_turn=true with the final confirmed transcript
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  // Track the confirmed transcript for the current turn (reset on end_of_turn)
  let confirmedTranscript = '';
  
  ws.on('message', (data) => {
    const msgStr = data.toString();
    console.log('[AssemblyAI v3] 📩 Message received:', msgStr.substring(0, 300));
    if (onMessage) onMessage();
    try {
      const msg = JSON.parse(msgStr);

      // v3 error handling
      if (msg.error) {
        console.error('[AssemblyAI v3] ❌ Error from server:', msg.error);
        state.lastError = msg.error;
        onError(msg.error);
        return;
      }

      // v3 message types: Begin, Turn, Termination
      const messageType = msg.message_type || msg.type;
      
      // v3 session start (type: "Begin")
      if (messageType === 'Begin') {
        console.log('[AssemblyAI v3] 🎬 Session started:', msg.id);
        state.sessionId = msg.id || '';
        if (onSessionStart) onSessionStart(state.sessionId);
        return;
      }

      // v3 transcript handling (type: "Turn")
      // CRITICAL: v3 Turn messages contain the COMPLETE transcript, not deltas
      // Each message REPLACES the previous, it does NOT append
      if (messageType === 'Turn' || msg.transcript !== undefined) {
        const text = (msg.transcript || '').trim();
        const endOfTurn = msg.end_of_turn === true;
        const turnIsFormatted = msg.turn_is_formatted === true;
        const confidence = msg.end_of_turn_confidence || 0;
        const turnOrder = msg.turn_order as number | undefined;

        console.log('[AssemblyAI v3] 📝 Turn:', {
          msgType: messageType,
          text: text.substring(0, 60) + (text.length > 60 ? '...' : ''),
          endOfTurn,
          turnIsFormatted,
          confidence: typeof confidence === 'number' ? confidence.toFixed(2) : confidence,
          turnOrder,
          hypothesisLen: text.length,
          confirmedLen: confirmedTranscript.length,
          commitMode: ASSEMBLYAI_TURN_COMMIT_MODE,
        });

        // C1) Partial handling - REPLACE hypothesis only (never append)
        // Partials NEVER trigger Claude
        if (text) {
          const prevTranscript = confirmedTranscript;
          confirmedTranscript = text;
          if (onPartialUpdate) {
            onPartialUpdate(text, prevTranscript);
          }
        }

        // C2/C3) Final handling with commit mode awareness
        if (endOfTurn && confirmedTranscript) {
          // F) Latency instrumentation: Record first EOT timestamp
          if (!state.firstEotTimestamp) {
            state.firstEotTimestamp = Date.now();
            state.currentTurnCommitted = false; // Reset fallback guard on new turn
            console.log(`[AssemblyAI v3] ⏱️ First EOT timestamp: ${state.firstEotTimestamp}`);
          }
          
          // C2) Prevent double triggers - dual check:
          // 1. Check if turn_order was already committed (primary guard)
          // 2. Fallback: Check one-shot flag when turn_order is missing
          if (turnOrder !== undefined) {
            if (state.committedTurnOrders.has(turnOrder)) {
              console.log(`[AssemblyAI v3] ⚠️ Turn ${turnOrder} already committed - skipping to prevent double trigger`);
              return;
            }
          } else {
            // Fallback guard when turn_order is missing
            if (state.currentTurnCommitted) {
              console.log(`[AssemblyAI v3] ⚠️ Turn already committed (no turn_order) - skipping to prevent double trigger`);
              return;
            }
          }
          
          // C3) Commit mode logic
          if (ASSEMBLYAI_TURN_COMMIT_MODE === 'first_eot') {
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // LOW-CONFIDENCE EOT DEFERRAL: When confidence is below threshold,
            // wait briefly before committing. This prevents premature first-sentence
            // commits (e.g., "okay so what are you packaging" at conf=0.38 while
            // student is still saying "how much does it weigh...").
            // If no new EOT arrives during the deferral, we commit what we have.
            // If a new EOT arrives, the deferral is cancelled and we get the fuller text.
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            const LOW_CONF_THRESHOLD = parseFloat(process.env.EOT_LOW_CONF_THRESHOLD || '0.55');
            const LOW_CONF_DEFER_MS = parseInt(process.env.EOT_LOW_CONF_DEFER_MS || '900', 10);
            
            if (confidence > 0 && confidence < LOW_CONF_THRESHOLD && !state.eotDeferTimerId) {
              console.log(`[AssemblyAI v3] ⏳ Low-confidence EOT (${confidence.toFixed(2)} < ${LOW_CONF_THRESHOLD}) - deferring ${LOW_CONF_DEFER_MS}ms to accumulate more speech`);
              // Store deferred state for comparison when next EOT arrives
              state.eotDeferredWordCount = confirmedTranscript.trim().split(/\s+/).filter((w: string) => w.length > 0).length;
              state.eotDeferredConfidence = confidence;
              // Store current transcript in state so deferred timer has latest
              state.lastAccumulatedTranscript = confirmedTranscript;
              state.lastAccumulatedTranscriptSetAt = Date.now();
              state.lastAccumulatedConfidence = confidence;
              state.eotDeferTimerId = setTimeout(() => {
                state.eotDeferTimerId = undefined;
                state.eotDeferredWordCount = undefined;
                state.eotDeferredConfidence = undefined;
                // Read LATEST transcript from state — not the stale closure capture
                const latestTranscript = state.lastAccumulatedTranscript.trim();
                const latestConf = state.lastAccumulatedConfidence || confidence;
                // DEFERRED EOT CONFIDENCE FLOOR: Don't commit genuinely low-confidence turns.
                // The deferred timer was meant to wait for more speech; if nothing better
                // arrived, only commit if confidence is at least 0.40 OR transcript is long
                // enough (5+ words) to be clearly real speech regardless of confidence.
                // EXCEPTION: Single high-word-confidence words (like "jupiter" at 0.96 word conf
                // but 0.37 turn conf) should pass — turn confidence is unreliable for short answers.
                const deferredWordCount = latestTranscript.split(/\s+/).filter(w => w.length > 0).length;
                const NON_LEXICAL_PATTERN = /^(um+|uh+|hmm+|hm+|er+|erm+|mhm+)$/i;
                const isNonLexical = NON_LEXICAL_PATTERN.test(latestTranscript.trim().toLowerCase());
                // CONFIDENCE FLOOR: Always accept real words. The 900ms deferral already
                // filters noise — if a coherent word survives 900ms with end_of_turn:true,
                // it's real speech. Only reject pure filler (um/uh/hmm).
                // Previous versions dropped "Beetlejuice" (1 word, 0.23 conf), "I said beetlejuice"
                // (3 words, 0.23 conf), "jupiter" (1 word, 0.37 conf) — all legitimate answers.
                const meetsConfidenceFloor = !isNonLexical;
                if (latestTranscript && !state.currentTurnCommitted && meetsConfidenceFloor) {
                  console.log(`[AssemblyAI v3] ✅ Deferred EOT firing now with: "${latestTranscript.substring(0, 60)}" (conf=${latestConf.toFixed(2)} words=${deferredWordCount})`);
                  if (turnOrder !== undefined) {
                    state.committedTurnOrders.add(turnOrder);
                  }
                  state.currentTurnCommitted = true;
                  confirmedTranscript = '';
                  state.firstEotTimestamp = undefined;
                  state.currentTurnCommitted = false;
                  onTranscript(latestTranscript, true, latestConf);
                } else if (latestTranscript && !state.currentTurnCommitted && !meetsConfidenceFloor) {
                  console.log(`[AssemblyAI v3] 🚫 Deferred EOT DROPPED: conf=${latestConf.toFixed(2)} < 0.40 and words=${deferredWordCount} < 5 — likely noise/fragment: "${latestTranscript.substring(0, 60)}"`);
                  // NOTE: Noise coaching tracking happens in the main WS handler (onTranscript callback),
                  // NOT here — `state` in this scope is AssemblyAIState, not SessionState.
                }
              }, LOW_CONF_DEFER_MS);
              return; // Don't commit yet — wait for deferral or a higher-confidence EOT
            }
            
            // If a deferred EOT is pending and a new EOT arrives, check if it's genuinely new speech
            // vs just the formatted version of the same turn (which has same confidence + same words)
            if (state.eotDeferTimerId) {
              const currentWordCount = confirmedTranscript.trim().split(/\s+/).filter((w: string) => w.length > 0).length;
              const prevWordCount = state.eotDeferredWordCount || 0;
              const prevConf = state.eotDeferredConfidence || 0;
              const hasNewWords = currentWordCount > prevWordCount + 1; // At least 2 new words = genuinely new speech
              const hasHigherConf = confidence >= LOW_CONF_THRESHOLD && confidence > prevConf + 0.1; // Jumped above threshold significantly
              
              if (hasNewWords || hasHigherConf) {
                // Genuinely new/better EOT — cancel deferral and commit now
                clearTimeout(state.eotDeferTimerId);
                state.eotDeferTimerId = undefined;
                state.eotDeferredWordCount = undefined;
                state.eotDeferredConfidence = undefined;
                console.log(`[AssemblyAI v3] ✅ Cancelled deferred EOT - genuinely new speech (words: ${prevWordCount}→${currentWordCount}, conf: ${prevConf.toFixed(2)}→${confidence.toFixed(2)})`);
              } else {
                // Same turn reformatted or trivially updated — let the deferral ride
                console.log(`[AssemblyAI v3] ⏳ Ignoring formatted/duplicate EOT during deferral (words: ${prevWordCount}→${currentWordCount}, conf: ${prevConf.toFixed(2)}→${confidence.toFixed(2)}) - deferral continues`);
                return; // Don't commit — let the 900ms deferral complete
              }
            }
            
            // first_eot: Trigger Claude on FIRST end_of_turn=true, ignore formatted version
            console.log('[AssemblyAI v3] ✅ first_eot mode - committing on first EOT:', confirmedTranscript);
            // Store confidence so downstream min-word gate can use it
            state.lastAccumulatedConfidence = confidence;
            state.lastAccumulatedTranscript = confirmedTranscript;
            state.lastAccumulatedTranscriptSetAt = Date.now();
            // Mark this turn as committed to prevent double trigger from formatted version
            if (turnOrder !== undefined) {
              state.committedTurnOrders.add(turnOrder);
            }
            state.currentTurnCommitted = true; // Set fallback guard
          } else {
            // formatted: Legacy behavior - wait for turn_is_formatted=true
            if (!turnIsFormatted) {
              console.log('[AssemblyAI v3] ⏳ formatted mode - waiting for formatted version:', confirmedTranscript);
              return;
            }
            // F) Log formatting wait time
            const formattingWait = Date.now() - (state.firstEotTimestamp || Date.now());
            console.log(`[AssemblyAI v3] ⏱️ Formatting wait time: ${formattingWait}ms`);
            console.log('[AssemblyAI v3] ✅ formatted mode - committing on formatted:', confirmedTranscript);
            if (turnOrder !== undefined) {
              state.committedTurnOrders.add(turnOrder);
            }
            state.currentTurnCommitted = true; // Set fallback guard
          }
          
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          // LEXICAL_GRACE: Word fragmentation hardening (Step 4)
          // Feature flag: LEXICAL_GRACE_ENABLED (default: false)
          // Adds a short grace window when the last token looks like a fragment
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          const lexicalGraceEnabled = process.env.LEXICAL_GRACE_ENABLED === 'true';
          const lexicalGraceMs = parseInt(process.env.LEXICAL_GRACE_MS || '300', 10);
          
          if (lexicalGraceEnabled) {
            const words = confirmedTranscript.trim().split(/\s+/).filter(w => w.length > 0);
            const lastToken = words[words.length - 1] || '';
            const hasVowel = /[aeiou]/i.test(lastToken);
            const hasTrailingPunctuation = /[.!?;]$/.test(confirmedTranscript.trim());
            const isLikelyFragment = (lastToken.length <= 3 && !hasVowel) || 
                                     (lastToken.length <= 2 && !hasTrailingPunctuation);
            
            if (isLikelyFragment && words.length <= 2) {
              console.log(`[LexicalGrace] ⏳ Possible fragment detected: "${lastToken}" - waiting ${lexicalGraceMs}ms for continuation`);
              
              // Store current transcript in state for potential merge
              state.pendingFragment = confirmedTranscript;
              state.pendingFragmentTime = Date.now();
              
              // Log telemetry
              console.log(JSON.stringify({
                event: 'lexical_grace_applied',
                session_id: state.sessionId || 'unknown',
                grace_ms: lexicalGraceMs,
                trailing_token: lastToken,
                final_text_len: confirmedTranscript.length,
                timestamp: new Date().toISOString(),
              }));
              
              // Wait for potential continuation - store timeout ID for cancellation
              state.pendingFragmentTimeout = setTimeout(() => {
                // Check if we're still waiting on this fragment (not merged)
                if (state.pendingFragment && state.pendingFragmentTime) {
                  const elapsed = Date.now() - state.pendingFragmentTime;
                  if (elapsed >= lexicalGraceMs - 50) { // Allow 50ms tolerance
                    console.log(`[LexicalGrace] ✅ Grace period ended - proceeding with: "${state.pendingFragment}"`);
                    onTranscript(state.pendingFragment, true, confidence);
                    state.pendingFragment = undefined;
                    state.pendingFragmentTime = undefined;
                    state.pendingFragmentTimeout = undefined;
                  }
                }
              }, lexicalGraceMs);
              
              // Reset for next turn (but keep pendingFragment for merge)
              confirmedTranscript = '';
              return;
            }
          }
          
          // Check if we have a pending fragment to merge with
          if (state.pendingFragment && state.pendingFragmentTime) {
            const elapsed = Date.now() - state.pendingFragmentTime;
            if (elapsed < 500) { // Within merge window
              console.log(`[LexicalGrace] 🔗 Merging fragment: "${state.pendingFragment}" + "${confirmedTranscript}"`);
              confirmedTranscript = state.pendingFragment + ' ' + confirmedTranscript;
              
              // Cancel the pending grace timeout to prevent double-fire
              if (state.pendingFragmentTimeout) {
                clearTimeout(state.pendingFragmentTimeout);
                console.log(`[LexicalGrace] ⏹️ Cancelled grace timeout after merge`);
              }
            }
            state.pendingFragment = undefined;
            state.pendingFragmentTime = undefined;
            state.pendingFragmentTimeout = undefined;
          }
          
          // F) Latency instrumentation: Log EOT → Claude latency
          const claudeTriggerTimestamp = Date.now();
          if (state.firstEotTimestamp) {
            const eotToClaudeLatency = claudeTriggerTimestamp - state.firstEotTimestamp;
            console.log(`[AssemblyAI] ⏱️ EOT → Claude latency: ${eotToClaudeLatency}ms`);
          }
          
          // Fire callback with the confirmed transcript
          onTranscript(confirmedTranscript, true, confidence);
          
          // Reset for next turn
          confirmedTranscript = '';
          state.firstEotTimestamp = undefined; // Reset for next turn
          state.currentTurnCommitted = false; // Reset fallback guard for next turn
          
          // Log for diagnostics
          console.log(`[TurnDiagnostics] User turn FINAL: ${text.substring(0, 30)}... confidence: ${confidence.toFixed(2)}`);
        }
        return;
      }

      // v3 termination message
      if (messageType === 'Termination') {
        console.log('[AssemblyAI v3] 🛑 Session terminated - audio:', msg.audio_duration_seconds, 's');
        return;
      }

      // Log unknown message types for debugging
      console.log('[AssemblyAI v3] ℹ️ Unknown message type:', messageType, msgStr.substring(0, 100));
    } catch (e) {
      console.error('[AssemblyAI v3] ⚠️ Parse error:', e);
    }
  });

  ws.on('error', (error: Error & { code?: string }) => {
    console.log('[AssemblyAI v3] ❌ WebSocket ERROR:', error.message);
    console.log('[AssemblyAI v3] Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    state.lastError = error.message;
    onError(error.message);
  });

  ws.on('close', (code: number, reasonBuf: Buffer) => {
    clearTimeout(handshakeTimeout);
    const reasonStr = reasonBuf?.toString?.('utf8') ?? String(reasonBuf ?? '');
    console.log('[AssemblyAI v3] 🔌 WebSocket CLOSED - code:', code, 'reason:', reasonStr);
    console.log('[AssemblyAI CLOSE]', { code, reason: reasonStr });
    state.isOpen = false;
    state.closeCode = code;
    state.closeReason = reasonStr;
    state.lastTranscript = '';
    state.lastTranscriptTime = 0;
    if (onClose) onClose();
  });

  console.log('[AssemblyAI v3] Connection setup complete, waiting for OPEN event...');
  return { ws, state };
}

let didLogFirstAssemblyAIAudio = false;
const MAX_AUDIO_BUFFER_SIZE = 50; // Max chunks to buffer while connecting

const STT_SEND_FAILURE_WATCHDOG_THRESHOLD = 50;
const STT_SEND_FAILURE_LOG_RATE_LIMIT_MS = 1000;
const STT_SEND_FAILURE_LOG_MAX_PER_FRAME = 10;

function sendAudioToAssemblyAI(ws: WebSocket | null, audioBuffer: Buffer, state?: AssemblyAIState, sessionState?: SessionState, isSpeechFrame: boolean = false): boolean {
  // Always keep the ring buffer warm (PcmRingBuffer handles overflow internally).
  // During tutor playback, only retain frames classified as speech for barge-in replay.
  if (sessionState) {
    if (sessionState.phase !== 'TUTOR_SPEAKING' || isSpeechFrame) {
      sessionState.sttAudioRingBuffer.push(audioBuffer);
    }
  }

  // Phase 1 guard: do NOT forward audio during tutor playback
  if (sessionState && (sessionState.phase === 'TUTOR_SPEAKING' || sessionState.tutorAudioPlaying)) {
    return false;
  }

  // Epoch + connection readiness checks
  if (sessionState && (!sessionState.sttBeginReceived || sessionState.reconnectInFlight)) {
    return false;
  }

  if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
    if (sessionState) trackSendFailure(sessionState);
    return false;
  }
  
  if (ws.readyState === WebSocket.CONNECTING) {
    if (state && state.audioBuffer.length < MAX_AUDIO_BUFFER_SIZE) {
      state.audioBuffer.push(audioBuffer);
      if (state.audioBuffer.length === 1) {
        console.log('[AssemblyAI] 📦 Buffering audio while connecting...');
      }
      return true;
    }
    return false;
  }
  
  if (ws.readyState !== WebSocket.OPEN) {
    if (sessionState) trackSendFailure(sessionState);
    return false;
  }
  
  // P0.4: Reset failure tracking on successful send
  if (sessionState && sessionState.sttConsecutiveSendFailures > 0) {
    const dropped = sessionState.sttConsecutiveSendFailures;
    const durationMs = Date.now() - sessionState.sttSendFailureStartedAt;
    const totalDropped = sessionState.sttSendFailureTotalDropped;
    console.log(`[STT] recovered after ${dropped} consecutive send failures (${totalDropped} total dropped frames over ${durationMs}ms)`);
    sessionState.sttConsecutiveSendFailures = 0;
    sessionState.sttSendFailureTotalDropped = 0;
    sessionState.sttSendFailureStartedAt = 0;
  }
  
  // Update liveness timestamp only on actual successful send (after readyState=OPEN confirmed)
  if (sessionState) {
    const now = Date.now();
    sessionState.sttLastAudioForwardAtMs = now;
    markProgress(sessionState);
    if (isSpeechFrame) {
      sessionState.sttLastUserSpeechSentAtMs = now;
    }
  }

  if (!didLogFirstAssemblyAIAudio) {
    console.log('[AssemblyAI] 🎵 First audio chunk bytes:', audioBuffer.length);
    didLogFirstAssemblyAIAudio = true;
  }
  ws.send(audioBuffer);
  return true;
}

function trackSendFailure(sessionState: SessionState): void {
  sessionState.sttConsecutiveSendFailures++;
  sessionState.sttSendFailureTotalDropped++;
  
  if (sessionState.sttConsecutiveSendFailures === 1) {
    sessionState.sttSendFailureStartedAt = Date.now();
  }
  
  // P0.4: Rate-limited logging
  const now = Date.now();
  if (sessionState.sttConsecutiveSendFailures <= STT_SEND_FAILURE_LOG_MAX_PER_FRAME) {
    if (now - sessionState.sttSendFailureLoggedAt >= STT_SEND_FAILURE_LOG_RATE_LIMIT_MS) {
      console.warn(`[STT] send_failure #${sessionState.sttConsecutiveSendFailures} sessionId=${sessionState.sessionId}`);
      sessionState.sttSendFailureLoggedAt = now;
    }
  }
  
  // P0.4: Watchdog - if too many consecutive failures, force connection dead
  if (sessionState.sttConsecutiveSendFailures >= STT_SEND_FAILURE_WATCHDOG_THRESHOLD) {
    console.error(`[STT] send_failure_watchdog triggered after ${sessionState.sttConsecutiveSendFailures} consecutive failures - forcing connection dead`);
    if (sessionState.assemblyAIWs) {
      try { sessionState.assemblyAIWs.close(); } catch (_e) {}
      sessionState.assemblyAIWs = null;
    }
    sessionState.sttConnected = false;
    sessionState.sttDisconnectedSinceMs = Date.now();
    sessionState.sttConsecutiveSendFailures = 0; // Reset to prevent re-triggering
  }
}

function resetFirstAudioLog() {
  didLogFirstAssemblyAIAudio = false;
}

function closeAssemblyAI(ws: WebSocket | null) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    console.log('[AssemblyAI] 🛑 Closing connection...');
    ws.send(JSON.stringify({ terminate_session: true }));
    ws.close();
  }
  resetFirstAudioLog();
}

function resetAssemblyAIMergeGuard(state: AssemblyAIState) {
  state.lastTranscript = '';
  state.lastTranscriptTime = 0;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TIMING CONSTANTS (Dec 10, 2025): Tutor waits for complete thoughts
// Prevents tutor from interrupting students during thinking pauses
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const TIMING_CONFIG = {
  // Server-side delays before AI processing
  SERVER_DELAY_COMPLETE_THOUGHT: 1200,    // 1.2s for complete sentences
  SERVER_DELAY_INCOMPLETE_THOUGHT: 2500,  // 2.5s for incomplete thoughts
  
  // Post-interruption buffer (when student interrupts tutor)
  POST_INTERRUPT_BUFFER: 2500,            // 2.5s extra wait after interruption
  
  // Combined with Deepgram settings (Dec 11, 2025: OPTIMIZED FOR EDUCATIONAL TUTORING):
  // - Deepgram endpointing: 2500ms (speech silence detection, was 2000ms)
  // - Deepgram utterance_end_ms: 3000ms (utterance finalization, was 2500ms)
  // - Server UTTERANCE_COMPLETE_DELAY_MS: 2500ms (accumulation wait after Deepgram final)
  // - Client SILENCE_DEBOUNCE_MS: 2500ms (was 1200ms)
  // Total: ~5.5-6+ seconds from student pause → tutor responds
  // This allows students 3+ second thinking pauses without interruption
};

interface TranscriptEntry {
  speaker: 'tutor' | 'student';
  text: string;
  timestamp: string;
  messageId: string;
}

type VoicePhase = 'LISTENING' | 'SPEECH_DETECTED' | 'TURN_COMMITTED' | 'AWAITING_RESPONSE' | 'TUTOR_SPEAKING' | 'FINALIZING';

interface GradeBandTimingConfig {
  bargeInDebounceMs: number;
  bargeInDecayMs: number;
  bargeInCooldownMs: number;
  shortBurstMinMs: number;
  postAudioBufferMs: number;
  minMsAfterAudioStartForBargeIn: number;
  continuationGraceMs: number;
  continuationHedgeGraceMs: number;
  bargeInPlaybackThreshold: number;
  consecutiveFramesRequired: number;
  bargeInConfirmDurationMs: number;
}

const GRADE_BAND_TIMING: Record<string, GradeBandTimingConfig> = {
  // ── BARGE-IN PHILOSOPHY ──────────────────────────────────────────────────
  // Sharp impulse noise (desk tap, toy drop, chair scrape) creates a brief
  // high-RMS transient that dies within 50-150ms. Real speech — even a short
  // word from a young child — sustains 250ms+. The bargeInConfirmDurationMs
  // is the primary gate: it must exceed typical impulse duration at every band.
  // consecutiveFramesRequired adds a second check: multiple consecutive audio
  // frames above threshold, not just a single spike.
  // ─────────────────────────────────────────────────────────────────────────
  // K2: Very patient — kids are extremely fidgety. High threshold, many frames,
  // long confirm. A child's voice is weaker and more variable so debounce stays high.
  'K2':   { bargeInDebounceMs: 600, bargeInDecayMs: 300, bargeInCooldownMs: 850, shortBurstMinMs: 300, postAudioBufferMs: 2000, minMsAfterAudioStartForBargeIn: 800, continuationGraceMs: 1400, continuationHedgeGraceMs: 3000, bargeInPlaybackThreshold: 0.18, consecutiveFramesRequired: 5, bargeInConfirmDurationMs: 600 },
  // G3-5: Slightly less patient but still strong impulse protection.
  'G3-5': { bargeInDebounceMs: 500, bargeInDecayMs: 260, bargeInCooldownMs: 750, shortBurstMinMs: 260, postAudioBufferMs: 1800, minMsAfterAudioStartForBargeIn: 600, continuationGraceMs: 1200, continuationHedgeGraceMs: 2800, bargeInPlaybackThreshold: 0.16, consecutiveFramesRequired: 4, bargeInConfirmDurationMs: 500 },
  // G6-8: Middle school — still active but more intentional when speaking.
  'G6-8': { bargeInDebounceMs: 400, bargeInDecayMs: 200, bargeInCooldownMs: 650, shortBurstMinMs: 220, postAudioBufferMs: 1500, minMsAfterAudioStartForBargeIn: 500, continuationGraceMs: 1000, continuationHedgeGraceMs: 2500, bargeInPlaybackThreshold: 0.14, consecutiveFramesRequired: 3, bargeInConfirmDurationMs: 400 },
  // G9-12 and ADV: Aligned to G6-8. Validated in testing — G6-8 naturally handles
  // impulse noise via silence_decay (taps expire in ~250ms, well under the 400ms confirm)
  // while Silero client VAD remains the fast path for genuine voice interruption.
  'G9-12': { bargeInDebounceMs: 400, bargeInDecayMs: 200, bargeInCooldownMs: 650, shortBurstMinMs: 220, postAudioBufferMs: 1500, minMsAfterAudioStartForBargeIn: 500, continuationGraceMs: 1000, continuationHedgeGraceMs: 2500, bargeInPlaybackThreshold: 0.14, consecutiveFramesRequired: 3, bargeInConfirmDurationMs: 400 },
  'ADV':   { bargeInDebounceMs: 400, bargeInDecayMs: 200, bargeInCooldownMs: 650, shortBurstMinMs: 220, postAudioBufferMs: 1500, minMsAfterAudioStartForBargeIn: 500, continuationGraceMs: 1000, continuationHedgeGraceMs: 2500, bargeInPlaybackThreshold: 0.14, consecutiveFramesRequired: 3, bargeInConfirmDurationMs: 400 },
};
const DEFAULT_GRADE_BAND_TIMING: GradeBandTimingConfig = GRADE_BAND_TIMING['G6-8'];

function getGradeBandTiming(ageGroup: string): GradeBandTimingConfig {
  const band = normalizeGradeBand(ageGroup);
  return GRADE_BAND_TIMING[band] || DEFAULT_GRADE_BAND_TIMING;
}

function setPhase(state: SessionState, next: VoicePhase, reason: string, ws?: WebSocket): void {
  const prev = state.phase;
  if (prev === next) return;
  // P1.5: Hard guard — TURN_COMMITTED must never be set during TUTOR_SPEAKING or AWAITING_RESPONSE
  if (next === 'TURN_COMMITTED' && (prev === 'TUTOR_SPEAKING' || prev === 'AWAITING_RESPONSE')) {
    console.error(`[Phase] BLOCKED invalid transition ${prev} -> ${next} reason="${reason}" session=${state.sessionId?.substring(0, 8) || 'unknown'} — must queue instead`);
    return;
  }
  state.phase = next;
  state.phaseSinceMs = Date.now();
  console.log(`[Phase] ${prev} -> ${next} reason="${reason}" session=${state.sessionId?.substring(0, 8) || 'unknown'} genId=${state.playbackGenId}`);
  // B1: Cancel barge-in candidate on phase transitions where barge-in is structurally impossible
  if (next === 'TURN_COMMITTED' || next === 'AWAITING_RESPONSE' || next === 'LISTENING') {
    cancelBargeInCandidate(state, `phase_transition_to_${next}`, ws);
  }
  if (next === 'TUTOR_SPEAKING') {
    state.tutorAudioPlaying = false;
  }
  if (next === 'LISTENING') {
    state.tutorAudioPlaying = false;
    state.llmInFlight = false;
  }
  if (next === 'FINALIZING') {
    state.sttReconnectEnabled = false;
    state.sessionFinalizing = true;
    cancelBargeInCandidate(state, 'phase_transition_to_FINALIZING', ws);
  }
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'phase_update', phase: next, prev, reason, timestamp: Date.now() }));
  }
}

const IDLE_BARGE_IN_CANDIDATE = { isActive: false, startedAt: 0, peakRms: 0, lastAboveAt: 0, genId: null as number | null, risingEdgeConfirmed: false, consecutiveAboveCount: 0, stage: 'idle' as 'idle' | 'ducked' | 'confirming', duckStartMs: 0, sttSnapshotAt: 0 };

function cancelBargeInCandidate(state: SessionState, reason: string, ws?: WebSocket): void {
  if (state.bargeInDebounceTimerId) {
    clearTimeout(state.bargeInDebounceTimerId);
    state.bargeInDebounceTimerId = null;
  }
  const wasActive = state.bargeInCandidate.isActive;
  const wasDucked = state.bargeInCandidate.stage === 'ducked' || state.bargeInCandidate.stage === 'confirming';
  state.bargeInCandidate = { ...IDLE_BARGE_IN_CANDIDATE };
  if (wasDucked && ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'unduck', message: 'Barge-in cancelled' }));
    console.log(`[BargeIn] unduck reason=${reason}`);
  }
  if (wasActive) {
    console.log(`[BargeIn] cancel_candidate reason=${reason} phase=${state.phase} activeGenId=${state.playbackGenId}`);
  }
}

interface SessionState {
  sessionId: string;
  userId: string;
  studentName: string;
  ageGroup: string;
  subject: string; // SESSION: Tutoring subject (Math, English, Science, etc.)
  practiceMode: boolean; // SESSION: Whether practice drill mode is active
  language: string; // LANGUAGE: Tutoring language code (e.g., 'en', 'es', 'fr')
  detectedLanguage: string; // LANGUAGE: Auto-detected spoken language from Deepgram
  speechSpeed: number; // User's speech speed preference from settings
  systemInstruction: string;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  transcript: TranscriptEntry[];
  uploadedDocuments: string[];
  deepgramConnection: DeepgramConnection | null;
  assemblyAIWs: WebSocket | null; // AssemblyAI WebSocket connection
  assemblyAIState: AssemblyAIState | null; // AssemblyAI merge guard state
  isProcessing: boolean;
  processingSinceMs: number | null; // PIPELINE: When isProcessing was set to true
  transcriptQueue: string[]; // FIX #1: Queue for incoming transcripts
  sessionStartTime: number;
  lastPersisted: number;
  lastTranscript: string; // FIX #1A: Track last transcript to avoid duplicates
  violationCount: number; // Track content violations in this session
  isSessionEnded: boolean; // Flag to prevent further processing after termination
  isTutorSpeaking: boolean; // PACING FIX: Track if tutor is currently speaking
  lastAudioSentAt: number; // PACING FIX: Track when audio was last sent for interruption detection
  wasInterrupted: boolean; // TIMING FIX: Track if tutor was just interrupted (needs extra delay)
  lastInterruptionTime: number; // TIMING FIX: Track when last interruption occurred
  tutorAudioEnabled: boolean; // MODE: Whether tutor audio should play
  studentMicEnabled: boolean; // MODE: Whether student microphone is active
  lastActivityTime: number; // INACTIVITY: Track last user speech activity
  inactivityWarningSent: boolean; // INACTIVITY: Track if 4-minute warning has been sent
  inactivityTimerId: NodeJS.Timeout | null; // INACTIVITY: Timer for checking inactivity
  isReconnecting: boolean; // RECONNECT: Track if Deepgram reconnection is in progress (blocks audio)
  currentTurnId: string | null; // THINKING INDICATOR: Track current turn for thinking state
  hasEmittedResponding: boolean; // THINKING INDICATOR: Prevent multiple tutor_responding events per turn
  turnPolicyState: TurnPolicyState; // K2 TURN POLICY: State for hesitation detection
  turnPolicyK2Override: boolean | null; // K2 TURN POLICY: Session-level override
  stallEscapeTimerId: NodeJS.Timeout | null; // K2 TURN POLICY: Timer for stall escape
  lastAudioReceivedAt: number; // K2 TURN POLICY: Track when audio was last received
  guardedTranscript: string; // K2 TURN POLICY: Transcript being guarded during hesitation
  stallTimerStartedAt: number; // K2 TURN POLICY: When the current stall timer was started
  echoGuardState: EchoGuardState; // ECHO GUARD: State for echo/self-response prevention
  noiseFloorState: NoiseFloorState; // NOISE FLOOR: Per-session noise baseline
  bargeInDucking: boolean; // BARGE-IN: Whether audio is currently ducked pending confirmation
  bargeInDuckStartTime: number; // BARGE-IN: When ducking started for timeout
  lastConfirmedSpeechTime: number; // BARGE-IN: When last confirmed speech was detected
  lastMeasuredRms: number; // NOISE FLOOR: Last measured RMS for logging
  lastSpeechNotificationSent: boolean; // MIC STATUS: Track if speech_detected was sent (avoid spam)
  postUtteranceGraceUntil: number; // GHOST TURN: Grace period for transcript merging
  safetyStrikeCount: number; // SAFETY: Track strikes for session termination
  safetyFlags: Array<{
    type: string;
    timestamp: string;
    messageIndex?: number;
    triggerText?: string;
    tutorResponse?: string;
    severity: 'info' | 'warning' | 'alert' | 'critical';
  }>; // SAFETY: Track safety incidents in session
  terminatedForSafety: boolean; // SAFETY: Whether session was ended due to safety violations
  useFallbackLLM: boolean; // FALLBACK: Session switched to OpenAI after Claude failures
  parentEmail?: string; // SAFETY: Parent email for alerts
  hasGreeted: boolean; // GREETING: Prevent duplicate greetings on reconnect
  hasAcknowledgedDocs: boolean; // DOCS: One-time doc acknowledgment flag per session
  uploadedDocCount: number; // DOCS: Total uploaded documents (Active + Inactive)
  studentId?: string; // SAFETY: Student ID for incident tracking
  pendingFragment?: string; // LEXICAL_GRACE: Pending transcript fragment awaiting merge
  pendingFragmentTime?: number; // LEXICAL_GRACE: When the pending fragment was created
  lastHeartbeatAt?: Date; // TELEMETRY: Last client heartbeat for close reason tracking
  clientEndIntent?: string; // TELEMETRY: Client-provided end intent (user_end, page_unload, etc.)
  // RECONNECT GRACE WINDOW: Fields for handling abnormal WS closes
  isPendingReconnect: boolean; // RECONNECT: Session is waiting for client to reconnect
  graceTimerId?: NodeJS.Timeout; // RECONNECT: Timer for grace window expiry
  reconnectCount: number; // RECONNECT: Number of successful reconnects in this session
  lastWsCloseCode?: number; // RECONNECT: Last WS close code for telemetry
  resumeToken?: string; // RECONNECT: Signed token for secure session reattach
  lastClientVisibility?: 'visible' | 'hidden'; // RECONNECT: Last visibility state from client
  lastPongAt?: Date; // HEARTBEAT: Last pong received from client
  missedPongCount: number; // HEARTBEAT: Consecutive missed pongs
  // LLM WATCHDOG: Failsafe for missed LLM invocations after end_of_turn
  llmWatchdogTimerId?: NodeJS.Timeout; // WATCHDOG: Timer for forcing LLM invocation
  llmWatchdogTranscript?: string; // WATCHDOG: Transcript to use if watchdog fires
  lastEndOfTurnTime?: number; // WATCHDOG: When end_of_turn was received
  lastLlmRequestTime?: number; // WATCHDOG: When LLM request was last started
  // TURN FALLBACK: Sends recovery message if no response produced
  turnFallbackTimerId?: NodeJS.Timeout;
  turnResponseProduced: boolean;
  // CONTINUATION GUARD: Two-phase commit state
  continuationPendingText: string;
  continuationTimerId?: NodeJS.Timeout;
  continuationCandidateEotAt?: number;
  continuationSegmentCount: number;
  // LOW-CONFIDENCE EOT DEFERRAL: Timer for deferred commit
  eotDeferTimerId?: NodeJS.Timeout;
  eotDeferredWordCount?: number;
  eotDeferredConfidence?: number;
  // VOICE PHASE STATE MACHINE: Server-authoritative phase tracking
  phase: VoicePhase;
  phaseSinceMs: number;
  lastUserSpeechAtMs: number;
  lastTurnCommittedAtMs: number;
  tutorAudioPlaying: boolean;
  llmInFlight: boolean;
  sessionFinalizing: boolean;
  sttReconnectEnabled: boolean;
  // ELITE BARGE-IN: Hard interrupt state
  playbackGenId: number;
  llmAbortController: AbortController | null;
  ttsAbortController: AbortController | null;
  lastBargeInAt: number;
  currentPlaybackMode: 'idle' | 'tutor_speaking' | 'listening';
  isTutorThinking: boolean; // BARGE-IN: Track if LLM generation is in-flight
  // FIX 1A: STT activity tracking to prevent premature turn firing
  lastSttActivityAt: number;
  lastAccumulatedTranscript: string;
  lastAccumulatedTranscriptSetAt: number; // When transcript last changed — for stability check
  lastAccumulatedConfidence: number; // Track latest EOT confidence for state-based commit
  audioFrameCount: number; // LOG REDUCTION: Count audio frames for sampled logging
  bargeInCandidate: {
    isActive: boolean;
    startedAt: number;
    peakRms: number;
    lastAboveAt: number;
    genId: number | null;
    risingEdgeConfirmed: boolean;
    consecutiveAboveCount: number;
    stage: 'idle' | 'ducked' | 'confirming';
    duckStartMs: number;
    sttSnapshotAt: number;
  };
  bargeInDebounceTimerId: NodeJS.Timeout | null;
  tutorAudioStartMs: number;
  // STT HEALTH: Connection health tracking + auto-reconnect
  sttConnected: boolean;
  sttLastMessageAtMs: number;
  sttLastAudioForwardAtMs: number;
  sttReconnectAttempts: number;
  sttReconnectTimerId: NodeJS.Timeout | null;
  sttDeadmanTimerId: NodeJS.Timeout | null;
  sttConnectionId: number;
  sttAudioRingBuffer: PcmRingBuffer;
  sttDisconnectedSinceMs: number | null;
  // P0.3: Session-sticky keyterms disable after 3005 config error
  sttKeytermsDisabledForSession: boolean;
  sttKeytermsJson: string | null; // Cached keyterms JSON for reconnects
  // P0.4: Send-failure watchdog
  sttConsecutiveSendFailures: number;
  sttSendFailureLoggedAt: number;
  sttSendFailureTotalDropped: number;
  sttSendFailureStartedAt: number;
  // STT AUDIO GATING: Prevent forwarding echo/noise during tutor playback
  sttBeginReceived: boolean;
  sttLastUserSpeechSentAtMs: number;
  // STT EPOCH FENCING: Prevent stale callback race conditions
  sttEpoch: number;
  reconnectInFlight: boolean;
  // SPEECH WATCHDOG: Detect VAD speech with no STT transcripts
  speechWatchdogTimerId: NodeJS.Timeout | null;
  speechWatchdogSegments: number; // VAD speech segments since last transcript
  // NO-PROGRESS WATCHDOG: Detect stalled sessions and auto-recover
  lastProgressAt: number;
  watchdogTimerId: NodeJS.Timeout | null;
  watchdogRecoveries: number;
  lastWatchdogRecoveryAt: number;
  watchdogDisabled: boolean;
  // STT LIFECYCLE: Reconnect function stored on state for cross-scope access
  sttReconnectFn: (() => void) | null;
  // TRIAL MINUTE ENFORCEMENT: Periodic check to end session when trial minutes exhausted
  trialMinuteCheckTimerId: NodeJS.Timeout | null;
  trialMinuteWarned: boolean; // Whether 2-minute warning has been sent
  // NOISE COACHING: Track dropped turns to detect persistently noisy sessions
  droppedTurnTimestamps: number[]; // Rolling timestamps of noise-dropped turns
  lastNoiseCoachingAtMs: number;  // Last time tutor gave noise coaching message
}

// Helper to send typed WebSocket events
function sendWsEvent(ws: WebSocket, type: string, payload: Record<string, unknown>) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, ...payload }));
    console.log(`[WS Event] ${type}`, payload.turnId || '');
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NOISE COACHING: Detect persistently noisy sessions and have
// the tutor proactively suggest a quieter environment or text mode.
// Triggers when N turns are dropped in a rolling window.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const NOISE_COACHING_WINDOW_MS = 60_000;   // 60-second rolling window
const NOISE_COACHING_DROP_THRESHOLD = 4;   // 4 dropped turns triggers coaching
const NOISE_COACHING_COOLDOWN_MS = 180_000; // 3 minutes between coaching messages

async function trackDroppedTurnForNoiseCoaching(
  ws: WebSocket,
  state: SessionState
): Promise<void> {
  if (state.isSessionEnded || state.sessionFinalizing) return;

  // Defensive guard: ensure droppedTurnTimestamps exists (prevents crash if called with wrong state type)
  if (!Array.isArray(state.droppedTurnTimestamps)) {
    console.warn(`[NoiseCoaching] ⚠️ droppedTurnTimestamps missing or invalid — skipping (state keys: ${Object.keys(state).slice(0, 5).join(', ')}...)`);
    return;
  }

  const now = Date.now();

  // Add this drop to the rolling window
  state.droppedTurnTimestamps.push(now);

  // Prune drops outside the window
  state.droppedTurnTimestamps = state.droppedTurnTimestamps.filter(
    ts => now - ts < NOISE_COACHING_WINDOW_MS
  );

  const recentDrops = state.droppedTurnTimestamps.length;
  const timeSinceLastCoaching = now - state.lastNoiseCoachingAtMs;

  console.log(`[NoiseCoaching] Drops in ${NOISE_COACHING_WINDOW_MS / 1000}s window: ${recentDrops}/${NOISE_COACHING_DROP_THRESHOLD}, cooldown: ${Math.max(0, NOISE_COACHING_COOLDOWN_MS - timeSinceLastCoaching)}ms remaining`);

  if (recentDrops < NOISE_COACHING_DROP_THRESHOLD) return;
  if (timeSinceLastCoaching < NOISE_COACHING_COOLDOWN_MS) return;

  // Check that the session isn't already processing a turn
  if (state.isProcessing || state.phase === 'TUTOR_SPEAKING' || state.phase === 'AWAITING_RESPONSE') {
    console.log(`[NoiseCoaching] Skipping — session busy (phase=${state.phase}, isProcessing=${state.isProcessing})`);
    return;
  }

  state.lastNoiseCoachingAtMs = now;
  state.droppedTurnTimestamps = []; // Reset after coaching fires
  console.log(`[NoiseCoaching] 📢 Threshold reached — injecting noise coaching message`);

  const coachingText = `I'm picking up some background noise that's making it harder for me to hear you clearly. If you can, moving to a quieter spot would help a lot. You can also switch to text mode by clicking the keyboard icon — that way background noise won't affect us at all.`;

  // Add to transcript
  state.transcript.push({
    speaker: 'tutor',
    text: coachingText,
    timestamp: new Date().toISOString(),
    messageId: crypto.randomUUID(),
  });

  // Send transcript message to client
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'transcript',
      speaker: 'tutor',
      text: coachingText,
    }));
  }

  // Generate and send TTS audio
  try {
    const audioBuffer = await generateSpeech(coachingText, state.ageGroup, state.speechSpeed);
    if (audioBuffer && audioBuffer.length > 0 && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'audio',
        data: audioBuffer.toString('base64'),
        mimeType: 'audio/pcm;rate=16000',
      }));
      console.log(`[NoiseCoaching] ✅ Coaching audio sent`);
    }
  } catch (err) {
    console.error('[NoiseCoaching] ❌ Failed to generate coaching audio:', err);
  }
}

// NO-PROGRESS WATCHDOG: Update progress timestamp on any meaningful activity
const WATCHDOG_STALL_THRESHOLD_MS = 15_000;
const WATCHDOG_CHECK_INTERVAL_MS = 3_000;
const WATCHDOG_MAX_RECOVERIES_PER_WINDOW = 2;
const WATCHDOG_RECOVERY_WINDOW_MS = 60_000;

function markProgress(state: SessionState): void {
  state.lastProgressAt = Date.now();
}

// FIX 1A: STT Activity tracking - credit speech activity from transcript growth
const STT_ACTIVITY_DELTA_THRESHOLD = 4;
const STT_ACTIVITY_RECENCY_MS = 800;

function creditSttActivity(state: SessionState, currentText: string, prevText: string): void {
  const content = currentText.trim();
  const prevContent = (prevText || '').trim();
  const deltaLen = content.length - prevContent.length;
  const prevWordCount = prevContent.split(/\s+/).filter(w => w.length > 0).length;
  const currentWordCount = content.split(/\s+/).filter(w => w.length > 0).length;
  const newWordBoundary = currentWordCount > prevWordCount;

  if (deltaLen >= STT_ACTIVITY_DELTA_THRESHOLD || newWordBoundary) {
    const now = Date.now();
    state.lastSttActivityAt = now;
    state.lastAccumulatedTranscript = content;
    state.lastAccumulatedTranscriptSetAt = now;
    state.lastAudioReceivedAt = now;
    state.lastActivityTime = now;

    // Only cancel continuation timer if this is genuinely NEW speech (not a formatted duplicate)
    // When using first_eot commit mode, AssemblyAI sends a formatted version ~150ms after the 
    // unformatted EOT. The formatted version has different capitalization/punctuation which 
    // triggers deltaLen >= 4, but it's not new speech - it's the same turn reformatted.
    // Cancelling the timer here caused Claude to never be called.
    if (state.continuationTimerId && !state.continuationPendingText) {
      // No pending text means no active continuation guard - safe to cancel
      clearTimeout(state.continuationTimerId);
      state.continuationTimerId = undefined;
      console.log(`[SpeechActivity] cancelled_continuation_timer (STT still active, no pending)`);
    } else if (state.continuationTimerId && state.continuationPendingText) {
      // Continuation guard is active with pending text - DON'T cancel the timer
      // This is likely a formatted duplicate or minor STT update
      console.log(`[SpeechActivity] preserved_continuation_timer (formatted_dup?) pendingLen=${state.continuationPendingText.length} deltaLen=${deltaLen}`);
    }

    console.log(`[SpeechActivity] credited_from_stt deltaLen=${deltaLen} words=${currentWordCount} preview="${content.substring(0, 40)}"`);
  }
}

// ELITE BARGE-IN: Hard interrupt constants
const BARGE_IN_COOLDOWN_MS = 650;

function hardInterruptTutor(
  ws: WebSocket,
  state: SessionState,
  reason: string
): boolean {
  const now = Date.now();
  const timing = getGradeBandTiming(state.ageGroup);

  // P2: Allow pre-roll barge-in when phase=TUTOR_SPEAKING but audio hasn't started yet
  // This enables interrupting the tutor immediately as TTS/LLM response begins
  if (state.phase !== 'TUTOR_SPEAKING') {
    console.log(JSON.stringify({
      event: 'barge_in_suppressed',
      session_id: state.sessionId,
      reason,
      phase: state.phase,
      tutorAudioPlaying: state.tutorAudioPlaying,
      detail: state.phase === 'AWAITING_RESPONSE' ? 'tutor_thinking_no_audio' :
              state.phase === 'TURN_COMMITTED' ? 'turn_committed_no_audio' :
              'phase_not_tutor_speaking',
    }));
    return false;
  }
  const isPreRoll = !state.tutorAudioPlaying;
  if (isPreRoll) {
    console.log(JSON.stringify({
      event: 'barge_in_pre_roll',
      session_id: state.sessionId,
      reason,
      phase: state.phase,
      detail: 'pre_roll_interrupt_before_audio_started',
    }));
  }

  if (now - state.lastBargeInAt < timing.bargeInCooldownMs) {
    console.log(JSON.stringify({
      event: 'barge_in_cooldown',
      session_id: state.sessionId,
      reason,
      ms_since_last: now - state.lastBargeInAt,
      cooldown_ms: timing.bargeInCooldownMs,
      phase: state.phase,
    }));
    return false;
  }

  cancelBargeInCandidate(state, `barge_in_${reason}`, ws);
  state.isTutorSpeaking = false;
  state.isTutorThinking = false;
  state.tutorAudioPlaying = false;
  state.tutorAudioStartMs = 0;
  state.bargeInDucking = false;
  state.currentPlaybackMode = 'listening';
  state.lastBargeInAt = now;
  state.wasInterrupted = true;
  state.lastInterruptionTime = now;
  // Reset STT deadman baseline so it gets a full window from barge-in
  state.sttLastMessageAtMs = now;
  // Flush any in-flight partial from AssemblyAI before switching to LISTENING
  sendAssemblyAIForceEndpoint(state);
  setPhase(state, 'LISTENING', `barge_in_${reason}`, ws);

  let llmAborted = false;
  let ttsAborted = false;

  if (state.llmAbortController) {
    try {
      state.llmAbortController.abort();
      llmAborted = true;
    } catch (e) {
      console.error('[BargeIn] llm_abort_err:', e);
    }
    state.llmAbortController = null;
  }

  if (state.ttsAbortController) {
    try {
      state.ttsAbortController.abort();
      ttsAborted = true;
    } catch (e) {
      console.error('[BargeIn] tts_abort_err:', e);
    }
    state.ttsAbortController = null;
  }

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'tutor_barge_in',
      genId: state.playbackGenId,
      reason,
    }));
    ws.send(JSON.stringify({
      type: 'interrupt',
      message: 'Student is speaking',
      stopPlayback: true,
      reason: 'barge_in',
    }));
  }

  // Even when LLM/TTS are already done generating, the barge-in is still valid:
  // Audio may be queued and playing client-side. The tutor_barge_in + interrupt
  // messages we already sent (above) tell the client to stop playback.
  // Previously this reverted to TUTOR_SPEAKING which caused a phase conflict
  // (client stops, but server thinks tutor is still speaking).
  console.log(JSON.stringify({
    event: 'barge_in_triggered',
    session_id: state.sessionId,
    reason,
    target_gen_id: state.playbackGenId,
    llm_aborted: llmAborted,
    tts_aborted: ttsAborted,
    client_side_stop: !llmAborted && !ttsAborted,
    timestamp: now,
  }));

  // NOTE: proactive STT reconnect after barge-in REMOVED — it was destroying the connection
  // faster than reconnect could rebuild, causing permanent "Cannot forward audio" failures.
  // The original stale-STT issue was caused by u3-rt-pro model, which has been removed.

  return true;
}

// FIX #3: Incremental persistence helper
async function persistTranscript(sessionId: string, transcript: TranscriptEntry[]) {
  if (!sessionId || transcript.length === 0) return;
  
  try {
    // Type-safe persistence: transcript column expects JSONB array of {speaker, text, timestamp}
    await db.update(realtimeSessions)
      .set({
        transcript: transcript,
      })
      .where(eq(realtimeSessions.id, sessionId));
    console.log(`[Custom Voice] 💾 Persisted ${transcript.length} transcript entries`);
  } catch (error) {
    console.error("[Custom Voice] ❌ Error persisting transcript:", error);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SAFETY GUARDRAILS: Detect and handle safety concerns
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
interface SafetyCheckResult {
  shouldBlock: boolean;
  shouldTerminate: boolean;
  tutorResponse: string | null;
  strikeCount: number;
}

async function processSafetyCheck(
  text: string,
  state: SessionState,
  ws: WebSocket
): Promise<SafetyCheckResult> {
  const detection = detectSafetyIssues(text, state.ageGroup);
  
  if (!detection.detected) {
    return {
      shouldBlock: false,
      shouldTerminate: false,
      tutorResponse: null,
      strikeCount: state.safetyStrikeCount
    };
  }
  
  console.log(`[Safety] 🛡️ Detected: ${detection.flagType} (severity: ${detection.severity})`);
  
  // Add safety flag to session state
  const safetyFlag = {
    type: detection.flagType!,
    timestamp: new Date().toISOString(),
    messageIndex: state.transcript.length,
    triggerText: text.substring(0, 100), // Limit stored text
    tutorResponse: detection.tutorResponse || undefined,
    severity: detection.severity
  };
  state.safetyFlags.push(safetyFlag);
  
  // Increment strike count if needed
  let newStrikeCount = state.safetyStrikeCount;
  if (detection.incrementStrike) {
    newStrikeCount = state.safetyStrikeCount + 1;
    state.safetyStrikeCount = newStrikeCount;
    console.log(`[Safety] ⚠️ Strike ${newStrikeCount}/3`);
  }
  
  // Log safety incident to database
  if (state.sessionId) {
    try {
      const alertData: SafetyAlertData = {
        flagType: detection.flagType!,
        severity: detection.severity,
        sessionId: state.sessionId,
        studentId: state.studentId,
        studentName: state.studentName,
        gradeLevel: state.ageGroup,
        parentEmail: state.parentEmail,
        userId: state.userId,
        triggerText: text.substring(0, 200),
        tutorResponse: detection.tutorResponse || 'Redirect to learning',
        actionTaken: detection.action
      };
      
      // Log incident
      await logSafetyIncident(alertData);
      
      // Send admin alert for critical incidents
      if (detection.adminAlert) {
        await sendAdminSafetyAlert(alertData);
      }
      
      // Update session safety data in database
      await db.update(realtimeSessions)
        .set({
          safetyFlags: state.safetyFlags,
          strikeCount: newStrikeCount,
        })
        .where(eq(realtimeSessions.id, state.sessionId));
        
    } catch (error) {
      console.error('[Safety] ❌ Error logging safety incident:', error);
    }
  }
  
  // Check for session termination
  const shouldTerminate = shouldTerminateSession(newStrikeCount) || 
    detection.action === 'end_session_warning';
    
  if (shouldTerminate) {
    state.terminatedForSafety = true;
    console.log('[Safety] 🛑 Session will be terminated for safety');
    
    // Update database
    if (state.sessionId) {
      try {
        await db.update(realtimeSessions)
          .set({ terminatedForSafety: true })
          .where(eq(realtimeSessions.id, state.sessionId));
      } catch (error) {
        console.error('[Safety] ❌ Error updating termination status:', error);
      }
    }
  }
  
  return {
    shouldBlock: detection.action !== 'none',
    shouldTerminate,
    tutorResponse: shouldTerminate 
      ? getStrikeMessage(newStrikeCount)
      : detection.tutorResponse,
    strikeCount: newStrikeCount
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GOODBYE DETECTION: Gracefully end session when user says goodbye
// Works for both voice and text modes
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const GOODBYE_PHRASES = [
  // English goodbye variants
  'goodbye', 'good bye', 'bye', 'bye bye', 'see you', 'see ya',
  'talk later', 'gotta go', 'got to go', 'have to go', 'need to go',
  "i'm done", 'im done', 'i am done', 'we are done', "we're done",
  'end session', 'stop tutoring', 'end the session', 'stop the session',
  'that\'s all', 'thats all', "that's it", 'thats it',
  'thanks bye', 'thank you bye', 'thanks goodbye', 'thank you goodbye',
  'later', 'see you later', 'talk to you later', 'catch you later',
  'good night', 'goodnight', 'night night', 'nighty night',
  'i have to leave', 'i need to leave', 'leaving now',
  // Multilingual goodbye phrases (platform supports 25 languages)
  'adios', 'adiós', 'au revoir', 'ciao', 'hasta luego', 'hasta la vista',
  'sayonara', 'sayōnara', 'auf wiedersehen', 'tschüss', 'tchüss',
  'arrivederci', 'tot ziens', 'dag', 'farvel', 'ha det', 'hej då',
  'näkemiin', 'do widzenia', 'tchau', 'até logo',
  'zài jiàn', '再见', 'annyeong', '안녕', 'สวัสดี', 'ลาก่อน'
];

function detectGoodbye(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  // Check if the message is primarily a goodbye (short message with goodbye intent)
  // This prevents false positives from sentences that just mention "bye" in passing
  if (normalized.length > 50) return false; // Long messages are not pure goodbyes
  return GOODBYE_PHRASES.some(phrase => normalized.includes(phrase));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TIMING FIX (Nov 3, 2025): Incomplete thought detection
// Detect when students are likely still formulating their response
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function isLikelyIncompleteThought(transcript: string): boolean {
  const text = transcript.trim().toLowerCase();
  const wordCount = text.split(/\s+/).length;
  
  // Very short responses are often incomplete ("yeah", "um", "I", "it")
  if (wordCount <= 2) {
    return true;
  }
  
  // Common incomplete sentence starters
  const incompleteStarters = [
    /^(yeah|uh|um|so|well|and|but|it|the|i)\s*$/i,
    /^(i think|i mean|it says|it basically|well i|so i)\s*$/i,
    /^(the|a|this|that)\s+\w+\s*$/i, // "the problem", "a question"
  ];
  
  for (const pattern of incompleteStarters) {
    if (pattern.test(text)) {
      return true;
    }
  }
  
  // Trailing conjunctions suggest more coming
  if (/\b(and|but|or|so|because|since|unless)\s*$/i.test(text)) {
    return true;
  }
  
  return false;
}

// Centralized session finalization helper (prevents double-processing and ensures consistency)
// Close reason types for telemetry (updated enum per spec)
type CloseReason = 'user_end' | 'minutes_exhausted' | 'inactivity_timeout' | 'websocket_disconnect' | 'disconnect_timeout' | 'client_unload' | 'server_shutdown' | 'server_error';
type CloseDetails = {
  wsCloseCode?: number;
  wsCloseReason?: string;
  triggeredBy?: 'client' | 'server';
  lastHeartbeatAt?: string;
  minutesAtClose?: number;
  clientIntent?: string;
  reconnectCount?: number;
  lastClientVisibility?: 'visible' | 'hidden';
};

async function finalizeSession(
  state: SessionState,
  reason: 'normal' | 'disconnect' | 'error' | 'violation' | 'inactivity_timeout' | 'safety',
  errorMessage?: string,
  closeDetails?: CloseDetails
): Promise<{ success: boolean; minuteDeductionFailed?: boolean; dbWriteFailed?: boolean }> {
  // Idempotent: skip if already finalized
  if (state.isSessionEnded) {
    console.log(`[Custom Voice] ℹ️ Session already finalized, skipping (reason: ${reason})`);
    return { success: true };
  }

  state.isSessionEnded = true;
  cancelBargeInCandidate(state, `finalize_${reason}`);
  state.bargeInDucking = false;
  setPhase(state, 'FINALIZING', `finalize_${reason}`);
  state.sttReconnectEnabled = false;
  
  let minuteDeductionFailed = false;
  let dbWriteFailed = false;
  
  if (state.inactivityTimerId) {
    clearInterval(state.inactivityTimerId);
    state.inactivityTimerId = null;
  }
  if (state.watchdogTimerId) {
    clearInterval(state.watchdogTimerId);
    state.watchdogTimerId = null;
  }
  state.watchdogDisabled = true;
  
  // CONTINUATION GUARD: Clear pending continuation timer
  if (state.continuationTimerId) {
    clearTimeout(state.continuationTimerId);
    state.continuationTimerId = undefined;
    state.continuationPendingText = '';
    console.log(`[Finalize] 🧹 Cleared continuation guard timer (reason: ${reason})`);
  }
  
  // LOW-CONFIDENCE EOT DEFERRAL: Clear pending deferral timer
  if (state.eotDeferTimerId) {
    clearTimeout(state.eotDeferTimerId);
    state.eotDeferTimerId = undefined;
    console.log(`[Finalize] 🧹 Cleared EOT deferral timer (reason: ${reason})`);
  }

  // K2 TURN POLICY: Clear stall escape timer
  if (state.stallEscapeTimerId) {
    clearTimeout(state.stallEscapeTimerId);
    state.stallEscapeTimerId = null;
    console.log(`[Finalize] 🧹 Cleared stall escape timer (reason: ${reason})`);
  }

  if (state.sttDeadmanTimerId) {
    clearInterval(state.sttDeadmanTimerId);
    state.sttDeadmanTimerId = null;
  }
  if (state.sttReconnectTimerId) {
    clearTimeout(state.sttReconnectTimerId);
    state.sttReconnectTimerId = null;
  }
  if (state.speechWatchdogTimerId) {
    clearTimeout(state.speechWatchdogTimerId);
    state.speechWatchdogTimerId = null;
  }
  // TRIAL MINUTE ENFORCEMENT: Clear trial minute check timer
  if (state.trialMinuteCheckTimerId) {
    clearInterval(state.trialMinuteCheckTimerId);
    state.trialMinuteCheckTimerId = null;
    console.log(`[Finalize] 🧹 Cleared trial minute check timer (reason: ${reason})`);
  }
  if (state.assemblyAIWs) {
    try { state.assemblyAIWs.close(); } catch (_e) {}
    state.assemblyAIWs = null;
    console.log(`[Finalize] 🧹 Closed STT connection (reason: ${reason})`);
  }
  if (state.deepgramConnection) {
    try { (state.deepgramConnection as any).finish?.(); } catch (_e) {}
    state.deepgramConnection = null;
    console.log(`[Finalize] 🧹 Closed Deepgram connection (reason: ${reason})`);
  }

  if (!state.sessionId) {
    console.warn('[Custom Voice] ⚠️ No sessionId, skipping finalization');
    return { success: true };
  }
  
  // Check if this is a trial session (skip database operations for trial users)
  const isTrialSession = state.sessionId.startsWith('trial_session_');
  
  if (isTrialSession) {
    const durationSeconds = Math.floor((Date.now() - state.sessionStartTime) / 1000);
    console.log(`[Custom Voice] 🎫 Trial session finalized (${reason}) - ${durationSeconds}s, ${state.transcript.length} messages`);
    console.log(`[Custom Voice] 🎫 Trial session closed - reason: ${reason}`);
    // Trial sessions don't update realtimeSessions or deduct minutes
    return { success: true };
  }

  // Calculate session duration (used by multiple sections)
  const durationSeconds = Math.floor((Date.now() - state.sessionStartTime) / 1000);
  const durationMinutes = Math.max(1, Math.ceil(durationSeconds / 60));

  // Map internal reason to close reason enum (updated per spec)
  const closeReasonMap: Record<string, CloseReason> = {
    'normal': 'user_end',
    'disconnect': 'websocket_disconnect',
    'disconnect_timeout': 'disconnect_timeout',
    'error': 'server_error',
    'violation': 'server_error', // Safety violations map to server_error
    'inactivity_timeout': 'inactivity_timeout',
    'safety': 'server_error',
    'client_unload': 'client_unload',
    'minutes_exhausted': 'minutes_exhausted',
    'server_shutdown': 'server_shutdown',
  };
  const mappedCloseReason = closeReasonMap[reason] || 'server_error';
  
  // Merge close details with computed fields (include reconnect tracking)
  const finalCloseDetails: CloseDetails = {
    ...closeDetails,
    minutesAtClose: durationMinutes,
    lastHeartbeatAt: state.lastHeartbeatAt?.toISOString() || new Date().toISOString(),
    reconnectCount: state.reconnectCount || 0,
    lastClientVisibility: state.lastClientVisibility,
  };
  
  // Authoritative finalization log line (ONE structured line per spec)
  console.log(`[Finalize] sessionId=${state.sessionId} reason=${mappedCloseReason} wsCode=${closeDetails?.wsCloseCode || 'n/a'} reconnects=${state.reconnectCount || 0} lastHeartbeat=${finalCloseDetails.lastHeartbeatAt} minutesUsed=${durationMinutes}`);

  // SAFETY HARDENING: Wrap DB write in separate try/catch - never block cleanup
  try {
    const updateData: any = {
      transcript: state.transcript,
      endedAt: new Date(),
      status: 'ended',
      minutesUsed: durationMinutes,
      totalMessages: state.transcript.length,
      closeReason: mappedCloseReason,
      closeDetails: finalCloseDetails,
      // Reconnect tracking columns
      reconnectCount: state.reconnectCount || 0,
      lastHeartbeatAt: state.lastHeartbeatAt || new Date(),
    };

    if (errorMessage) {
      updateData.errorMessage = errorMessage;
    }

    await db.update(realtimeSessions)
      .set(updateData)
      .where(eq(realtimeSessions.id, state.sessionId));

    console.log(`[Custom Voice] 💾 Session finalized (${reason}) - ${durationMinutes} minutes, ${state.transcript.length} messages`);
  } catch (dbError) {
    dbWriteFailed = true;
    console.warn(`[Custom Voice] ⚠️ DB write failed during finalization (reason: ${reason}):`, dbError);
    console.warn(`[Custom Voice] 🔄 RECONCILIATION NEEDED: sessionId=${state.sessionId}, userId=${state.userId}, minutes=${durationMinutes}`);
    // Continue with cleanup - don't block shutdown
  }

  // SAFETY HARDENING: Wrap minute deduction in separate try/catch - never block cleanup
  if (state.userId && durationMinutes > 0 && !state.userId.startsWith('trial_')) {
    try {
      const { deductMinutes } = await import('../services/voice-minutes');
      await deductMinutes(state.userId, durationMinutes);
      console.log(`[Custom Voice] ✅ Deducted ${durationMinutes} minutes from user ${state.userId}`);
    } catch (deductError) {
      minuteDeductionFailed = true;
      console.warn(`[Custom Voice] ⚠️ Minute deduction failed (reason: ${reason}):`, deductError);
      console.warn(`[Custom Voice] 🔄 RECONCILIATION NEEDED: userId=${state.userId}, minutes=${durationMinutes}, sessionId=${state.sessionId}`);
      // Continue with cleanup - don't block shutdown
    }
  }

  // ============================================
  // PARENT SESSION SUMMARY EMAIL (already wrapped in try/catch)
  // Send email after session with constraints:
  // - Session > 30 seconds
  // - Transcript has >= 3 messages
  // ============================================
  if (durationSeconds >= 30 && state.transcript.length >= 3 && state.userId) {
    try {
      // Get parent info and email preferences from database
      const parentResult = await db.select({
        email: users.email,
        transcriptEmail: users.transcriptEmail,
        additionalEmails: users.additionalEmails,
        parentName: users.parentName,
        emailSummaryFrequency: users.emailSummaryFrequency,
      })
      .from(users)
      .where(eq(users.id, state.userId))
      .limit(1);
      
      const parent = parentResult[0];
      
      if (parent?.email) {
        const emailFrequency = parent.emailSummaryFrequency || 'daily';
        
        // Build full recipient list: primary (transcript_email or login) + additional emails
        const primaryEmail = (parent.transcriptEmail || parent.email).toLowerCase();
        const allRecipients = new Set<string>([primaryEmail]);
        if (parent.additionalEmails && Array.isArray(parent.additionalEmails)) {
          for (const extra of parent.additionalEmails) {
            if (extra && extra.trim()) allRecipients.add(extra.trim().toLowerCase());
          }
        }
        
        if (emailFrequency === 'off') {
          console.log(`[Custom Voice] ℹ️ Email summaries disabled for ${parent.email}`);
        } else if (emailFrequency === 'per_session') {
          const emailService = new EmailService();
          const sessionSubject = state.subject || 'General';
          
          const sanitizedTranscript = state.transcript
            .filter(t => t.text && t.text.trim().length > 0)
            .map(t => ({
              role: t.speaker === 'student' ? 'user' : 'assistant',
              text: t.text.trim(),
              timestamp: t.timestamp
            }));
          
          // Calculate session metrics for enhanced email + observation update
          const { calculateSessionMetrics, calculateEmailMetrics, updateLearningObservations, renderObservationFlags } = await import('../services/learning-observation-service');
          
          const sessionMetricsRaw = calculateSessionMetrics(sanitizedTranscript, reason);
          const emailMetrics = calculateEmailMetrics(sanitizedTranscript, state.ageGroup || 'K-12');
          
          // Update learning observations (isolated try/catch)
          let observationFlagsHtml = '';
          try {
            if (state.userId && state.studentName) {
              const metrics = {
                ...sessionMetricsRaw,
                userId: state.userId,
                studentName: state.studentName || 'Your child',
                subject: sessionSubject,
                gradeLevel: state.ageGroup || 'K-12',
                durationMinutes,
                transcript: sanitizedTranscript
              };
              await updateLearningObservations(metrics);
              console.log(`[Custom Voice] ✅ Learning observations updated for ${state.studentName}`);
              
              // Fetch current flags for email rendering
              const { pool } = await import('../db');
              const obsResult = await pool.query(
                `SELECT active_flags, total_sessions FROM learning_observations WHERE user_id = $1 AND student_name = $2`,
                [state.userId, state.studentName]
              );
              if (obsResult.rows[0]) {
                const flags = obsResult.rows[0].active_flags || [];
                const totalSessions = obsResult.rows[0].total_sessions || 0;
                if (flags.length > 0) {
                  observationFlagsHtml = renderObservationFlags(flags, state.studentName || 'Your child', totalSessions);
                }
              }
            }
          } catch (obsError) {
            console.warn('[Custom Voice] ⚠️ Learning observation update failed (non-blocking):', obsError);
          }
          
          console.log(`[Custom Voice] Email destinations: user_id=${state.userId}, to=[${Array.from(allRecipients).join(', ')}]`);
          
          for (const recipientEmail of allRecipients) {
            await emailService.sendEnhancedSessionSummary({
              parentEmail: recipientEmail,
              parentName: parent.parentName || '',
              studentName: state.studentName || 'Your child',
              subject: sessionSubject,
              gradeLevel: state.ageGroup || 'K-12',
              duration: durationMinutes,
              messageCount: sanitizedTranscript.length,
              transcript: sanitizedTranscript,
              sessionDate: new Date(),
              performanceMetrics: emailMetrics,
              observationFlagsHtml
            });
          }
          
          console.log(`[Custom Voice] ✉️ Enhanced summary email sent to ${allRecipients.size} recipient(s)`);
        } else {
          console.log(`[Custom Voice] ℹ️ Email will be sent via ${emailFrequency} digest to ${allRecipients.size} recipient(s)`);
        }
      }
    } catch (emailError) {
      // Don't fail the session if email fails
      console.error('[Custom Voice] ⚠️ Failed to send parent email:', emailError);
    }
  } else {
    console.log(`[Custom Voice] ℹ️ Skipping parent email (duration: ${durationSeconds}s, messages: ${state.transcript.length})`);
  }

  // ============================================
  // CONTINUITY MEMORY: Enqueue summary job (fire-and-forget)
  // Only for sessions with meaningful content
  // ============================================
  if (durationSeconds >= 30 && state.transcript.length >= 3 && state.userId && !isTrialSession) {
    try {
      const { enqueueSessionSummaryJob, runOpportunisticJob } = await import('../services/memory-service');
      
      await enqueueSessionSummaryJob({
        userId: state.userId,
        studentId: state.studentId || null,
        sessionId: state.sessionId,
      });
      
      // Fire-and-forget opportunistic job processing (non-blocking)
      runOpportunisticJob().catch(() => {});
      
    } catch (memoryError) {
      console.warn('[Custom Voice] ⚠️ Failed to enqueue memory job (non-blocking):', memoryError);
    }
  }

  // Return status for caller awareness (session_ended will always be sent)
  return { 
    success: !dbWriteFailed && !minuteDeductionFailed,
    minuteDeductionFailed,
    dbWriteFailed
  };
}

// ============================================
// RECONNECT GRACE WINDOW: Store for pending reconnect sessions
// Allows sessions to survive abnormal WS closes (1006/1001) for a grace period
// ============================================
interface PendingReconnectSession {
  state: SessionState;
  graceTimerId: NodeJS.Timeout;
  wsCloseCode: number;
  graceStartedAt: number;
  persistInterval: NodeJS.Timeout;
}

// Map of sessionId -> pending reconnect data
const pendingReconnectSessions = new Map<string, PendingReconnectSession>();

// Grace window durations (per spec)
const GRACE_WINDOW_1006 = 60000; // 60 seconds for abnormal close (network drop)
const GRACE_WINDOW_1001 = 30000; // 30 seconds for going away

// Check if WS close code qualifies for grace window
function isAbnormalClose(code: number): boolean {
  return code === 1006 || code === 1001;
}

// Get grace window duration based on close code
function getGraceWindowDuration(code: number): number {
  if (code === 1006) return GRACE_WINDOW_1006;
  if (code === 1001) return GRACE_WINDOW_1001;
  return 0; // No grace window for other codes
}

// Create pending reconnect session
function createPendingReconnect(
  sessionId: string,
  state: SessionState,
  wsCloseCode: number,
  persistInterval: NodeJS.Timeout
): void {
  const graceMs = getGraceWindowDuration(wsCloseCode);
  
  console.log(`[Reconnect Grace] 🕐 Starting grace window for session ${sessionId} (code: ${wsCloseCode}, grace: ${graceMs/1000}s)`);
  
  // Start grace timer - finalize with disconnect_timeout when it expires
  const graceTimerId = setTimeout(async () => {
    const pending = pendingReconnectSessions.get(sessionId);
    if (pending) {
      console.log(`[Reconnect Grace] ⏰ Grace window expired for session ${sessionId} - finalizing with disconnect_timeout`);
      
      pendingReconnectSessions.delete(sessionId);
      clearInterval(pending.persistInterval);
      
      // Finalize with disconnect_timeout reason
      await finalizeSession(pending.state, 'disconnect_timeout' as any, undefined, {
        wsCloseCode: pending.wsCloseCode,
        triggeredBy: 'server',
      });
    }
  }, graceMs);
  
  // Mark state as pending reconnect
  state.isPendingReconnect = true;
  state.lastWsCloseCode = wsCloseCode;
  
  pendingReconnectSessions.set(sessionId, {
    state,
    graceTimerId,
    wsCloseCode,
    graceStartedAt: Date.now(),
    persistInterval,
  });
}

// Attempt to restore session for reconnecting client
function tryRestoreSession(sessionId: string): SessionState | null {
  const pending = pendingReconnectSessions.get(sessionId);
  if (!pending) {
    return null;
  }
  
  const graceElapsed = Date.now() - pending.graceStartedAt;
  console.log(`[Reconnect Grace] ✅ Restoring session ${sessionId} (reconnected after ${Math.round(graceElapsed/1000)}s)`);
  
  // Cancel grace timer
  clearTimeout(pending.graceTimerId);
  
  // Mark state as no longer pending reconnect
  pending.state.isPendingReconnect = false;
  pending.state.reconnectCount = (pending.state.reconnectCount || 0) + 1;
  
  // Remove from pending map
  pendingReconnectSessions.delete(sessionId);
  
  return pending.state;
}

// Cancel pending reconnect (for explicit user end or cleanup)
function cancelPendingReconnect(sessionId: string): void {
  const pending = pendingReconnectSessions.get(sessionId);
  if (pending) {
    clearTimeout(pending.graceTimerId);
    clearInterval(pending.persistInterval);
    pendingReconnectSessions.delete(sessionId);
    console.log(`[Reconnect Grace] 🧹 Cancelled pending reconnect for session ${sessionId}`);
  }
}

export function setupCustomVoiceWebSocket(server: Server) {
  // Use noServer mode for manual upgrade with session authentication
  const wss = new WebSocketServer({ noServer: true });

  console.log('[Custom Voice] WebSocket server initialized on /api/custom-voice-ws (noServer mode)');

  // Handle WebSocket upgrade with production-grade authentication
  server.on('upgrade', async (request: IncomingMessage, socket: Socket, head: Buffer) => {
    // Only handle /api/custom-voice-ws path (allow query strings)
    const url = request.url || '';
    if (!url.startsWith('/api/custom-voice-ws')) {
      // Not our path - destroy socket to prevent leaks
      socket.destroy();
      return;
    }

    console.log('[WebSocket] 🔐 Validating upgrade request...');

    // Step 1: IP-based rate limiting (prevent DoS attacks)
    const clientIp = getClientIp(request);
    const rateLimitCheck = wsRateLimiter.canUpgrade(clientIp);
    
    if (!rateLimitCheck.allowed) {
      console.error(`[WebSocket] ❌ Rate limit exceeded for ${clientIp}:`, rateLimitCheck.reason);
      rejectWsUpgrade(socket, 429, rateLimitCheck.reason || 'Too many requests', request);
      return;
    }

    // Step 2: Check for trial token in query string first
    const urlObj = new URL(url, `http://${request.headers.host || 'localhost'}`);
    const trialToken = urlObj.searchParams.get('trialToken');
    
    let userId: string;
    let sessionId: string;
    let isTrialSession = false;
    let trialId: string | undefined;
    
    if (trialToken) {
      // Trial user - validate trial token
      console.log('[WebSocket] 🎫 Checking trial token...');
      const trialPayload = trialService.validateSessionToken(trialToken);
      
      if (!trialPayload) {
        console.error('[WebSocket] ❌ Invalid trial token');
        rejectWsUpgrade(socket, 401, 'Invalid trial token', request);
        return;
      }
      
      // Verify trial is still active
      const trial = await trialService.getTrialById(trialPayload.trialId);
      if (!trial || trial.status !== 'active') {
        console.error('[WebSocket] ❌ Trial expired or not found');
        rejectWsUpgrade(socket, 403, 'Trial expired', request);
        return;
      }
      
      // Check remaining time
      const consumedSeconds = trial.consumedSeconds ?? 0;
      const secondsRemaining = 300 - consumedSeconds;
      if (secondsRemaining <= 0) {
        console.error('[WebSocket] ❌ Trial time exhausted');
        rejectWsUpgrade(socket, 403, 'Trial time exhausted', request);
        return;
      }
      
      userId = `trial_${trialPayload.trialId}`;
      sessionId = `trial_session_${trialPayload.trialId}`;
      isTrialSession = true;
      trialId = trialPayload.trialId;
      console.log('[WebSocket] ✅ Trial token validated, remaining seconds:', secondsRemaining);
    } else {
      // Regular user - session validation (no Express middleware reuse)
      const sessionSecret = process.env.SESSION_SECRET || 'development-session-secret-only';
      const validationResult = await validateWsSession(request, sessionSecret);
      
      if (!validationResult.valid) {
        console.error(`[WebSocket] ❌ Session validation failed:`, validationResult.error);
        rejectWsUpgrade(socket, validationResult.statusCode || 401, validationResult.error || 'Unauthorized', request);
        return;
      }

      userId = validationResult.userId!;
      sessionId = validationResult.sessionId!;
      console.log('[WebSocket] ✅ Session validated for user:', userId);
    }

    // Step 3: Upgrade to WebSocket
    try {
      wss.handleUpgrade(request, socket, head, (ws) => {
        // Track connection for rate limiter (enforces concurrent connection limit)
        const trackResult = wsRateLimiter.trackConnection(clientIp);
        
        if (!trackResult.allowed) {
          console.error(`[WebSocket] ❌ Concurrent limit exceeded for ${clientIp}`);
          ws.close(1008, trackResult.reason || 'Too many concurrent connections');
          return;
        }
        
        // Attach authenticated userId to WebSocket
        (ws as any).authenticatedUserId = userId;
        (ws as any).sessionId = sessionId;
        (ws as any).clientIp = clientIp;
        (ws as any).isTrialSession = isTrialSession;
        (ws as any).trialId = trialId;
        
        console.log('[WebSocket] ✅ Connection tracked for user:', userId, isTrialSession ? '(TRIAL)' : '');
        
        // Release connection when socket closes
        ws.on('close', () => {
          wsRateLimiter.releaseConnection(clientIp);
          console.log(`[WebSocket] ✅ Connection released for ${clientIp}`);
        });
        
        wss.emit('connection', ws, request);
      });
    } catch (upgradeError) {
      console.error('[WebSocket] ❌ Upgrade error:', upgradeError);
      rejectWsUpgrade(socket, 500, 'Internal server error', request);
    }
  });

  wss.on("connection", (ws: WebSocket) => {
    // Get authenticated userId that was attached during upgrade
    const authenticatedUserId = (ws as any).authenticatedUserId as string;
    const user = (ws as any).user;
    const isTrialSession = (ws as any).isTrialSession as boolean;
    const trialId = (ws as any).trialId as string | undefined;
    
    console.log("[Custom Voice] 🔌 New authenticated connection for user:", authenticatedUserId);
    if (isTrialSession) {
      console.log("[Custom Voice] 🎫 Trial WS connected, trialId:", trialId);
    }
    
    // FIX #2C: Turn-taking timeout for natural conversation flow
    let responseTimer: NodeJS.Timeout | null = null;
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // FIX (Dec 10, 2025): Server-side transcript accumulation
    // Don't process each transcript separately - accumulate and wait for gap
    // This prevents cutting off students mid-sentence when they pause to think
    // 2.5 seconds catches natural thinking pauses without feeling sluggish
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    let pendingTranscript = '';
    let transcriptAccumulationTimer: NodeJS.Timeout | null = null;
    const UTTERANCE_COMPLETE_DELAY_MS = 2500; // Wait 2.5s after last transcript before AI call
    
    // FIX (Dec 10, 2025): Track reconnection attempts to prevent infinite loops
    let reconnectAttempts = 0;
    
    const state: SessionState = {
      sessionId: "",
      userId: authenticatedUserId, // Use session-authenticated userId
      studentName: "",
      ageGroup: "default",
      subject: "General", // SESSION: Default subject, will be set from session
      language: "en", // LANGUAGE: Default to English, will be set from session
      detectedLanguage: "", // LANGUAGE: Auto-detected spoken language from Deepgram
      speechSpeed: 1.0, // Default speech speed (normal), will be overridden by user preference
      systemInstruction: "",
      conversationHistory: [],
      transcript: [],
      uploadedDocuments: [],
      deepgramConnection: null,
      assemblyAIWs: null, // AssemblyAI: Initialize to null
      assemblyAIState: null, // AssemblyAI: Merge guard state
      isProcessing: false,
      processingSinceMs: null,
      transcriptQueue: [], // FIX #1: Initialize queue
      sessionStartTime: Date.now(),
      lastPersisted: Date.now(),
      lastTranscript: "", // FIX #1A: Initialize duplicate tracker
      tutorAudioEnabled: true, // MODE: Default to audio enabled
      studentMicEnabled: true, // MODE: Default to mic enabled
      violationCount: 0, // Initialize violation counter
      isSessionEnded: false, // Initialize session termination flag
      isTutorSpeaking: false, // PACING FIX: Initialize tutor speaking state
      lastAudioSentAt: 0, // PACING FIX: Initialize audio timestamp
      wasInterrupted: false, // TIMING FIX: Initialize interruption flag
      lastInterruptionTime: 0, // TIMING FIX: Initialize interruption timestamp
      lastActivityTime: Date.now(), // INACTIVITY: Initialize to now
      inactivityWarningSent: false, // INACTIVITY: No warning sent yet
      inactivityTimerId: null, // INACTIVITY: Timer not started yet
      isReconnecting: false, // RECONNECT: Not reconnecting initially
      currentTurnId: null, // THINKING INDICATOR: No turn in progress
      hasEmittedResponding: false, // THINKING INDICATOR: No responding event yet
      turnPolicyState: createTurnPolicyState(), // K2 TURN POLICY: Initialize state
      turnPolicyK2Override: null, // K2 TURN POLICY: No session override initially
      stallEscapeTimerId: null, // K2 TURN POLICY: No stall escape timer initially
      lastAudioReceivedAt: Date.now(), // K2 TURN POLICY: Initialize to now
      guardedTranscript: '', // K2 TURN POLICY: No guarded transcript initially
      stallTimerStartedAt: 0, // K2 TURN POLICY: No stall timer initially
      echoGuardState: createEchoGuardState(), // ECHO GUARD: Initialize echo guard state
      noiseFloorState: createNoiseFloorState(), // NOISE FLOOR: Initialize per-session baseline
      bargeInDucking: false, // BARGE-IN: Not ducking initially
      bargeInDuckStartTime: 0, // BARGE-IN: No duck in progress
      lastConfirmedSpeechTime: 0, // BARGE-IN: No confirmed speech yet
      lastMeasuredRms: 0, // NOISE FLOOR: No RMS measured yet
      lastSpeechNotificationSent: false, // MIC STATUS: No speech notification sent yet
      postUtteranceGraceUntil: 0, // GHOST TURN: No grace period active
      safetyStrikeCount: 0, // SAFETY: Initialize strike count
      safetyFlags: [], // SAFETY: Initialize safety flags array
      terminatedForSafety: false, // SAFETY: Not terminated initially
      useFallbackLLM: false, // FALLBACK: Start with Claude, switch to OpenAI on failure
      parentEmail: undefined, // SAFETY: Will be set from user data
      studentId: undefined, // SAFETY: Will be set from session data
      // RECONNECT GRACE WINDOW: Initialize reconnect tracking
      isPendingReconnect: false,
      graceTimerId: undefined,
      reconnectCount: 0,
      lastWsCloseCode: undefined,
      resumeToken: undefined,
      lastClientVisibility: undefined,
      lastPongAt: new Date(),
      missedPongCount: 0,
      turnResponseProduced: false,
      continuationPendingText: '',
      continuationSegmentCount: 0,
      eotDeferTimerId: undefined,
      eotDeferredWordCount: undefined,
      eotDeferredConfidence: undefined,
      hasGreeted: false, // GREETING: Not greeted yet
      hasAcknowledgedDocs: false, // DOCS: Not acknowledged yet
      uploadedDocCount: 0, // DOCS: Set from init message
      phase: 'LISTENING' as VoicePhase,
      phaseSinceMs: Date.now(),
      lastUserSpeechAtMs: 0,
      lastTurnCommittedAtMs: 0,
      tutorAudioPlaying: false,
      llmInFlight: false,
      sessionFinalizing: false,
      sttReconnectEnabled: true,
      playbackGenId: 1,
      llmAbortController: null,
      ttsAbortController: null,
      lastBargeInAt: 0,
      currentPlaybackMode: 'idle',
      isTutorThinking: false,
      lastSttActivityAt: 0,
      lastAccumulatedTranscript: '',
      lastAccumulatedTranscriptSetAt: 0,
      lastAccumulatedConfidence: 0,
      audioFrameCount: 0,
      bargeInCandidate: {
        isActive: false,
        startedAt: 0,
        peakRms: 0,
        lastAboveAt: 0,
        genId: null,
        stage: 'idle' as const,
        duckStartMs: 0,
        sttSnapshotAt: 0,
        risingEdgeConfirmed: false,
        consecutiveAboveCount: 0,
      },
      bargeInDebounceTimerId: null,
      tutorAudioStartMs: 0,
      sttConnected: false,
      sttLastMessageAtMs: 0,
      sttLastAudioForwardAtMs: 0,
      sttReconnectAttempts: 0,
      sttReconnectTimerId: null,
      sttDeadmanTimerId: null,
      sttConnectionId: 0,
      sttAudioRingBuffer: new PcmRingBuffer(),
      sttDisconnectedSinceMs: null,
      sttKeytermsDisabledForSession: false,
      sttKeytermsJson: null,
      sttConsecutiveSendFailures: 0,
      sttSendFailureLoggedAt: 0,
      sttSendFailureTotalDropped: 0,
      sttSendFailureStartedAt: 0,
      speechWatchdogTimerId: null,
      sttBeginReceived: false,
      sttLastUserSpeechSentAtMs: 0,
      sttEpoch: 0,
      reconnectInFlight: false,
      speechWatchdogSegments: 0,
      lastProgressAt: Date.now(),
      watchdogTimerId: null,
      watchdogRecoveries: 0,
      lastWatchdogRecoveryAt: 0,
      watchdogDisabled: false,
      sttReconnectFn: null,
      trialMinuteCheckTimerId: null,
      trialMinuteWarned: false,
      droppedTurnTimestamps: [],
      lastNoiseCoachingAtMs: 0,
    };

    // FIX #3: Auto-persist every 10 seconds
    const persistInterval = setInterval(async () => {
      if (state.sessionId && state.transcript.length > 0) {
        await persistTranscript(state.sessionId, state.transcript);
        state.lastPersisted = Date.now();
      }
    }, 10000);

    // ============================================
    // HEARTBEAT PING/PONG SYSTEM (per spec)
    // Server sends ping every 20s, considers connection unhealthy after 3 missed pongs (90s)
    // ============================================
    const HEARTBEAT_INTERVAL = 20000; // 20 seconds
    const MAX_MISSED_PONGS = 3;
    
    const heartbeatInterval = setInterval(() => {
      // Skip if session already ended or pending reconnect
      if (state.isSessionEnded || state.isPendingReconnect) {
        return;
      }
      
      // Check for missed pongs
      const timeSinceLastPong = Date.now() - (state.lastPongAt?.getTime() || state.sessionStartTime);
      const expectedPongs = Math.floor(timeSinceLastPong / HEARTBEAT_INTERVAL);
      
      if (expectedPongs >= MAX_MISSED_PONGS) {
        state.missedPongCount = expectedPongs;
        console.log(`[Heartbeat] ⚠️ ${expectedPongs} missed pongs (${Math.round(timeSinceLastPong/1000)}s) - closing WS with code 1006 to enter grace window`);
        
        // ENFORCEMENT: Proactively close the WS to trigger grace window
        // Use code 1006 (abnormal close) to enter the grace window flow
        // The 'close' event handler will then call createPendingReconnect
        try {
          ws.close(1006, 'Heartbeat timeout - no pong received');
        } catch (e) {
          // WS might already be closing, ignore
        }
        clearInterval(heartbeatInterval);
        return; // Stop further pings
      }
      
      // Send ping to client
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ 
          type: 'ping', 
          timestamp: Date.now(),
          sessionId: state.sessionId 
        }));
      }
    }, HEARTBEAT_INTERVAL);

    // ============================================
    // NO-PROGRESS WATCHDOG: Detect stalled sessions and auto-recover STT
    // Runs every 3s, triggers after 15s of no progress, max 2 recoveries per 60s
    // ============================================
    state.watchdogTimerId = setInterval(() => {
      if (state.isSessionEnded || state.sessionFinalizing || state.watchdogDisabled || state.isPendingReconnect) {
        return;
      }
      
      const now = Date.now();
      const sinceProgress = now - state.lastProgressAt;
      
      if (sinceProgress < WATCHDOG_STALL_THRESHOLD_MS) {
        return;
      }
      
      const recoveriesInWindow = (now - state.lastWatchdogRecoveryAt < WATCHDOG_RECOVERY_WINDOW_MS)
        ? state.watchdogRecoveries
        : 0;
      
      console.log(`[WATCHDOG_STALL_DETECTED] sessionId=${state.sessionId} userId=${state.userId} studentId=${state.studentId || 'n/a'} sttProvider=assemblyai reconnectCount=${state.reconnectCount} secondsSinceProgress=${Math.round(sinceProgress / 1000)} recoveries=${recoveriesInWindow}/${WATCHDOG_MAX_RECOVERIES_PER_WINDOW}`);
      
      if (recoveriesInWindow >= WATCHDOG_MAX_RECOVERIES_PER_WINDOW) {
        console.error(`[WATCHDOG] ❌ Max recoveries (${WATCHDOG_MAX_RECOVERIES_PER_WINDOW}) exhausted within ${WATCHDOG_RECOVERY_WINDOW_MS / 1000}s - ending session`);
        state.watchdogDisabled = true;
        sendWsEvent(ws, 'voice_status', { status: 'audio_reconnect_failed' });
        ws.send(JSON.stringify({
          type: 'session_ended',
          reason: 'audio_reconnect_failed',
          message: 'Voice connection could not be restored. Please start a new session.',
        }));
        finalizeSession(state, 'audio_reconnect_failed' as any).catch((err) => {
          console.error('[WATCHDOG] finalizeSession error:', err);
        });
        return;
      }
      
      sendWsEvent(ws, 'voice_status', { status: 'reconnecting_audio' });
      
      if (state.assemblyAIWs) {
        try { state.assemblyAIWs.close(); } catch (_e) {}
        state.assemblyAIWs = null;
      }
      state.sttConnected = false;
      
      if (now - state.lastWatchdogRecoveryAt >= WATCHDOG_RECOVERY_WINDOW_MS) {
        state.watchdogRecoveries = 1;
      } else {
        state.watchdogRecoveries++;
      }
      state.lastWatchdogRecoveryAt = now;
      markProgress(state);
      
      console.log(`[WATCHDOG] 🔄 Triggering STT reconnect (recovery ${state.watchdogRecoveries}/${WATCHDOG_MAX_RECOVERIES_PER_WINDOW})`);
    }, WATCHDOG_CHECK_INTERVAL_MS);

    // INACTIVITY: Check for user inactivity every 30 seconds
    state.inactivityTimerId = setInterval(async () => {
      const inactiveTime = Date.now() - state.lastActivityTime;
      const inactiveMinutes = Math.floor(inactiveTime / 60000);
      const inactiveSeconds = Math.floor((inactiveTime % 60000) / 1000);
      
      console.log(`[Inactivity] ⏱️ Check: ${inactiveMinutes}m ${inactiveSeconds}s since last activity`);
      
      // WARNING AT 4 MINUTES
      if (inactiveMinutes >= 4 && !state.inactivityWarningSent) {
        console.log('[Inactivity] ⏰ 4 minutes inactive - sending warning');
        
        const warningMessage = "Hey, are you still there? I haven't heard from you in a while. If you're done learning for now, just say 'goodbye' or I'll automatically end our session in one minute.";
        
        // Add to transcript
        const warningEntry: TranscriptEntry = {
          speaker: "tutor",
          text: warningMessage,
          timestamp: new Date().toISOString(),
          messageId: crypto.randomUUID(),
        };
        state.transcript.push(warningEntry);
        
        // Send warning to frontend
        ws.send(JSON.stringify({
          type: 'transcript',
          speaker: 'tutor',
          text: warningMessage,
        }));
        
        // Generate speech for warning if audio is enabled
        if (state.tutorAudioEnabled) {
          try {
            const audioBuffer = await generateSpeech(warningMessage, state.ageGroup, state.speechSpeed);
            if (audioBuffer && audioBuffer.length > 0) {
              ws.send(JSON.stringify({
                type: 'audio',
                data: audioBuffer.toString('base64'), // Use 'data' to match client expectations
                mimeType: 'audio/pcm;rate=16000',
              }));
              console.log('[Inactivity] 🔊 Warning audio sent');
            }
          } catch (audioError) {
            console.error('[Inactivity] ❌ Error generating warning audio:', audioError);
          }
        }
        
        state.inactivityWarningSent = true;
      }
      
      // AUTO-END AT 5 MINUTES
      if (inactiveMinutes >= 5) {
        console.log('[Inactivity] ⏰ 5 minutes inactive - auto-ending session');
        
        const endMessage = "I haven't heard from you in 5 minutes, so I'm going to end our session now. Feel free to come back anytime you want to learn more!";
        
        // Add to transcript
        const endEntry: TranscriptEntry = {
          speaker: "tutor",
          text: endMessage,
          timestamp: new Date().toISOString(),
          messageId: crypto.randomUUID(),
        };
        state.transcript.push(endEntry);
        
        // Send final message to frontend
        ws.send(JSON.stringify({
          type: 'transcript',
          speaker: 'tutor',
          text: endMessage,
        }));
        
        // Generate speech for end message if audio is enabled
        if (state.tutorAudioEnabled) {
          try {
            const audioBuffer = await generateSpeech(endMessage, state.ageGroup, state.speechSpeed);
            if (audioBuffer && audioBuffer.length > 0) {
              ws.send(JSON.stringify({
                type: 'audio',
                data: audioBuffer.toString('base64'), // Use 'data' to match client expectations
                mimeType: 'audio/pcm;rate=16000',
              }));
              console.log('[Inactivity] 🔊 End message audio sent');
            }
          } catch (audioError) {
            console.error('[Inactivity] ❌ Error generating end audio:', audioError);
          }
        }
        
        // Wait 5 seconds for message to play, then end session
        setTimeout(async () => {
          console.log('[Inactivity] 🛑 Auto-ending session due to inactivity');
          
          // Clear persistence interval to stop database writes
          clearInterval(persistInterval);
          console.log('[Inactivity] ✅ Persistence interval cleared');
          
          try {
            // Send session end notification to frontend
            ws.send(JSON.stringify({
              type: 'session_ended',
              reason: 'inactivity_timeout',
              message: 'Session ended due to inactivity'
            }));
            
            // Finalize session in database
            await finalizeSession(state, 'inactivity_timeout');
            
            // Close WebSocket
            ws.close(1000, 'Session ended due to inactivity');
            
            console.log('[Inactivity] ✅ Session ended successfully');
            
          } catch (error) {
            console.error('[Inactivity] ❌ Error ending session:', error);
            ws.close(1011, 'Error ending session');
          }
          
        }, 5000); // 5 second delay
        
        if (state.inactivityTimerId) {
          clearInterval(state.inactivityTimerId);
          state.inactivityTimerId = null;
        }
        if (state.watchdogTimerId) {
          clearInterval(state.watchdogTimerId);
          state.watchdogTimerId = null;
        }
        state.watchdogDisabled = true;
      }
      
    }, 30000); // Check every 30 seconds

    console.log('[Inactivity] ✅ Checker started (checks every 30 seconds)');

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // TRIAL MINUTE ENFORCEMENT: Check remaining minutes every 60s
    // Warns at 2 minutes remaining, disconnects at 0
    // Only runs for trial users (trialActive = true)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (!isTrialSession) {
      // For authenticated users, start a periodic check if they're a trial user
      // We check on first tick and then every 60 seconds
      const startTrialMinuteCheck = async () => {
        try {
          const user = await storage.getUser(authenticatedUserId);
          if (!user || !user.trialActive) {
            console.log('[TrialMinuteCheck] ℹ️ User is not a trial user, skipping enforcement');
            return;
          }

          console.log('[TrialMinuteCheck] 🎫 Trial user detected — starting minute enforcement timer');

          state.trialMinuteCheckTimerId = setInterval(async () => {
            if (state.isSessionEnded || state.sessionFinalizing) return;

            try {
              const currentUser = await storage.getUser(authenticatedUserId);
              if (!currentUser || !currentUser.trialActive) return;

              const trialLimit = currentUser.trialMinutesLimit || 30;
              const trialUsed = currentUser.trialMinutesUsed || 0;
              
              // Also account for current session time not yet deducted
              const currentSessionMinutes = Math.ceil((Date.now() - state.sessionStartTime) / 60000);
              const effectiveUsed = trialUsed + currentSessionMinutes;
              const effectiveRemaining = Math.max(0, trialLimit - effectiveUsed);

              console.log(`[TrialMinuteCheck] ⏱️ Trial: ${effectiveUsed}/${trialLimit} min used (DB: ${trialUsed}, session: ${currentSessionMinutes}), ${effectiveRemaining} remaining`);

              // WARNING at 2 minutes remaining
              if (effectiveRemaining <= 2 && effectiveRemaining > 0 && !state.trialMinuteWarned) {
                state.trialMinuteWarned = true;
                console.log('[TrialMinuteCheck] ⚠️ Trial running low — sending 2-minute warning');

                const warningText = `Just a heads up — you have about ${effectiveRemaining} minute${effectiveRemaining === 1 ? '' : 's'} left in your free trial. After that, you can subscribe to keep learning!`;

                state.transcript.push({
                  speaker: "tutor",
                  text: warningText,
                  timestamp: new Date().toISOString(),
                  messageId: crypto.randomUUID(),
                });

                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({
                    type: 'transcript',
                    speaker: 'tutor',
                    text: warningText,
                  }));

                  // Generate speech for warning
                  if (state.tutorAudioEnabled) {
                    try {
                      const audioBuffer = await generateSpeech(warningText, state.ageGroup, state.speechSpeed);
                      if (audioBuffer && audioBuffer.length > 0) {
                        ws.send(JSON.stringify({
                          type: 'audio',
                          data: audioBuffer.toString('base64'),
                          mimeType: 'audio/pcm;rate=16000',
                        }));
                      }
                    } catch (audioErr) {
                      console.error('[TrialMinuteCheck] ❌ Warning audio error:', audioErr);
                    }
                  }
                }
              }

              // END SESSION at 0 minutes remaining
              if (effectiveRemaining <= 0) {
                console.log('[TrialMinuteCheck] 🛑 Trial minutes exhausted — ending session');

                // Clear this interval immediately
                if (state.trialMinuteCheckTimerId) {
                  clearInterval(state.trialMinuteCheckTimerId);
                  state.trialMinuteCheckTimerId = null;
                }

                const endText = "Your free trial time is up! I hope you enjoyed learning with me. Subscribe to a plan to continue our sessions — I'd love to keep helping you learn!";

                state.transcript.push({
                  speaker: "tutor",
                  text: endText,
                  timestamp: new Date().toISOString(),
                  messageId: crypto.randomUUID(),
                });

                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({
                    type: 'transcript',
                    speaker: 'tutor',
                    text: endText,
                  }));

                  // Generate speech for end message
                  if (state.tutorAudioEnabled) {
                    try {
                      const audioBuffer = await generateSpeech(endText, state.ageGroup, state.speechSpeed);
                      if (audioBuffer && audioBuffer.length > 0) {
                        ws.send(JSON.stringify({
                          type: 'audio',
                          data: audioBuffer.toString('base64'),
                          mimeType: 'audio/pcm;rate=16000',
                        }));
                      }
                    } catch (audioErr) {
                      console.error('[TrialMinuteCheck] ❌ End audio error:', audioErr);
                    }
                  }

                  // Wait for audio to play, then end session
                  setTimeout(async () => {
                    try {
                      ws.send(JSON.stringify({
                        type: 'session_ended',
                        reason: 'minutes_exhausted',
                        message: 'Your free trial has ended. Subscribe to continue learning!',
                        isTrial: true
                      }));

                      await finalizeSession(state, 'minutes_exhausted');
                      ws.close(1000, 'Trial minutes exhausted');
                      console.log('[TrialMinuteCheck] ✅ Trial session ended successfully');
                    } catch (endErr) {
                      console.error('[TrialMinuteCheck] ❌ Error ending trial session:', endErr);
                      ws.close(1011, 'Error ending trial session');
                    }
                  }, 5000);
                }
              }
            } catch (checkErr) {
              console.error('[TrialMinuteCheck] ❌ Error checking trial minutes:', checkErr);
            }
          }, 60000); // Check every 60 seconds
        } catch (err) {
          console.error('[TrialMinuteCheck] ❌ Error initializing trial check:', err);
        }
      };

      // Fire async — don't block WS setup
      startTrialMinuteCheck();
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SAFETY TIMEOUT (Dec 10, 2025): Reset stuck isProcessing flag
    // Prevents tutor from going silent forever if something fails
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const MAX_PROCESSING_TIME_MS = 30000; // 30 seconds max before force-reset

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PIPELINE WATCHDOG: Periodic check for stuck processing state
    // Fires every 10s, resets if processing stuck > 30s, then drains queue
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const pipelineWatchdogId = setInterval(() => {
      if (state.isSessionEnded) {
        clearInterval(pipelineWatchdogId);
        return;
      }
      if (state.isProcessing && state.processingSinceMs) {
        const elapsed = Date.now() - state.processingSinceMs;
        if (elapsed > MAX_PROCESSING_TIME_MS) {
          console.error(`[Pipeline] ⚠️ WATCHDOG: isProcessing stuck for ${Math.round(elapsed/1000)}s, forcing reset session=${state.sessionId || 'unknown'}`);
          state.isProcessing = false;
          state.processingSinceMs = null;
          state.isTutorSpeaking = false;
          state.isTutorThinking = false;
          try {
            if (state.llmAbortController && !state.llmAbortController.signal.aborted) {
              state.llmAbortController.abort();
              console.log('[Pipeline] WATCHDOG: aborted stuck LLM controller');
            }
            if (state.ttsAbortController && !state.ttsAbortController.signal.aborted) {
              state.ttsAbortController.abort();
              console.log('[Pipeline] WATCHDOG: aborted stuck TTS controller');
            }
          } catch (e) {
            console.error('[Pipeline] WATCHDOG: error aborting controllers:', e);
          }
          if (state.transcriptQueue.length > 0 && !state.isSessionEnded) {
            console.log(`[Pipeline] WATCHDOG: draining queue, queueLen=${state.transcriptQueue.length}`);
            setImmediate(() => processTranscriptQueue());
          }
        }
      } else if (!state.isProcessing && state.transcriptQueue.length > 0 && !state.isSessionEnded) {
        console.log(`[Pipeline] WATCHDOG: orphaned queue items found, queueLen=${state.transcriptQueue.length}, forcing drain`);
        setImmediate(() => processTranscriptQueue());
      }
    }, 10000);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PIPELINE: commitUserTurn() - Single entry point for all turn commits
    // Guarantees: NO silent drops. Every turn is either processed or queued.
    // Emits immediate client feedback (tutor_thinking or queued_user_turn).
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    function commitUserTurn(text: string, source: 'eot' | 'manual' | 'continuation_guard' | 'turn_policy' | 'watchdog' = 'eot') {
      // P0: Use shouldDropTranscript — allows "no", "ok", "I", "2" etc.
      const dropCheck = shouldDropTranscript(text, state);
      if (dropCheck.drop) {
        console.log(`[TurnCommit] rejected source=${source} reason=${dropCheck.reason} text="${(text || '').substring(0, 40)}" len=${(text || '').trim().length}`);
        return;
      }

      console.log(`[TurnCommit] text="${text.substring(0, 60)}" source=${source} isProcessing=${state.isProcessing} queueLen=${state.transcriptQueue.length} phase=${state.phase}`);

      state.lastTurnCommittedAtMs = Date.now();
      cancelBargeInCandidate(state, `turn_committed_${source}`, ws);

      // P1.5: Phase discipline — queue only if tutor is speaking or thinking
      // Do NOT transition to TURN_COMMITTED during TUTOR_SPEAKING / AWAITING_RESPONSE
      if (state.phase === 'TUTOR_SPEAKING' || state.phase === 'AWAITING_RESPONSE') {
        // QUEUE COALESCING: Merge with last queued item instead of pushing separately
        // This prevents fragments like "on" + "okay" + "right at this point" from
        // becoming 3 separate Claude calls
        if (state.transcriptQueue.length > 0) {
          const lastIdx = state.transcriptQueue.length - 1;
          state.transcriptQueue[lastIdx] = (state.transcriptQueue[lastIdx] + ' ' + text).trim();
          console.log(`[Pipeline] queued_turn_MERGED reason=phase_${state.phase} source=${source} queueLen=${state.transcriptQueue.length} mergedPreview="${state.transcriptQueue[lastIdx].substring(0, 60)}"`);
        } else {
          state.transcriptQueue.push(text);
          console.log(`[Pipeline] queued_turn_phase_guard reason=phase_${state.phase} source=${source} queueLen=${state.transcriptQueue.length}`);
        }
        sendWsEvent(ws, 'queued_user_turn', {
          sessionId: state.sessionId,
          queueLen: state.transcriptQueue.length,
          reason: `phase_guard_${state.phase}`,
          timestamp: Date.now(),
        });
        return;
      }

      setPhase(state, 'TURN_COMMITTED', `commit_${source}`, ws);
      // SPEECH WATCHDOG: Turn committed — cancel watchdog, speech was successfully transcribed
      if (state.speechWatchdogTimerId) {
        clearTimeout(state.speechWatchdogTimerId);
        state.speechWatchdogTimerId = null;
      }
      state.speechWatchdogSegments = 0;

      if (state.isProcessing) {
        // QUEUE COALESCING: Merge with last queued item if processing
        if (state.transcriptQueue.length > 0) {
          const lastIdx = state.transcriptQueue.length - 1;
          state.transcriptQueue[lastIdx] = (state.transcriptQueue[lastIdx] + ' ' + text).trim();
          console.log(`[Pipeline] queued_turn_MERGED reason=processing_in_progress source=${source} queueLen=${state.transcriptQueue.length} mergedPreview="${state.transcriptQueue[lastIdx].substring(0, 60)}"`);
        } else {
          state.transcriptQueue.push(text);
          console.log(`[Pipeline] queued_turn reason=processing_in_progress source=${source} queueLen=${state.transcriptQueue.length}`);
        }
        sendWsEvent(ws, 'queued_user_turn', {
          sessionId: state.sessionId,
          queueLen: state.transcriptQueue.length,
          reason: 'processing_in_progress',
          timestamp: Date.now(),
        });
      } else {
        state.transcriptQueue.push(text);
        processTranscriptQueue();
      }
    }

    // FIX #1: Process queued transcripts sequentially
    async function processTranscriptQueue() {
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // SAFETY CHECK: Force reset if isProcessing has been stuck too long
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (state.isProcessing && state.processingSinceMs) {
        const elapsed = Date.now() - state.processingSinceMs;
        if (elapsed > MAX_PROCESSING_TIME_MS) {
          console.error(`[Pipeline] ⚠️ SAFETY RESET: isProcessing stuck for ${Math.round(elapsed/1000)}s, forcing reset`);
          state.isProcessing = false;
          state.processingSinceMs = null;
          state.isTutorSpeaking = false; // Also reset speaking state
        }
      }
      
      if (state.isProcessing || state.transcriptQueue.length === 0 || state.isSessionEnded) {
        if (state.isProcessing && state.transcriptQueue.length > 0) {
          console.log(`[Pipeline] 📋 Queue has ${state.transcriptQueue.length} items waiting (isProcessing=true)`);
        }
        return;
      }

      state.isProcessing = true;
      state.processingSinceMs = Date.now();
      console.log(`[Pipeline] processing_turn_now session=${state.sessionId || 'unknown'} queueLen=${state.transcriptQueue.length} textPreview="${state.transcriptQueue[0]?.substring(0, 50) || ''}" `);
      
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // LLM WATCHDOG: Cancel watchdog since we're now processing (Step 3)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (state.llmWatchdogTimerId) {
        clearTimeout(state.llmWatchdogTimerId);
        console.log(`[VOICE] watchdog_cancelled session=${state.sessionId || 'unknown'} reason=llm_started`);
        state.llmWatchdogTimerId = undefined;
        state.llmWatchdogTranscript = undefined;
      }
      state.lastLlmRequestTime = Date.now();
      
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // TURN FALLBACK: Start timer to send recovery message if no response
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      state.turnResponseProduced = false;
      if (TURN_FALLBACK_CONFIG.ENABLED) {
        // Clear any existing fallback timer
        if (state.turnFallbackTimerId) {
          clearTimeout(state.turnFallbackTimerId);
        }
        
        state.turnFallbackTimerId = setTimeout(async () => {
          // Only fire if no response was produced and session is still active
          if (!state.turnResponseProduced && !state.isSessionEnded && state.isProcessing) {
            console.log(`[VOICE] turn_fallback_fired session=${state.sessionId || 'unknown'} no_response_for=${TURN_FALLBACK_CONFIG.TIMEOUT_MS}ms`);
            
            try {
              // Send fallback message to client
              ws.send(JSON.stringify({
                type: "transcript",
                speaker: "tutor",
                text: TURN_FALLBACK_CONFIG.MESSAGE,
              }));
              
              // Generate TTS for fallback message
              if (state.tutorAudioEnabled) {
                const audioBuffer = await generateSpeech(TURN_FALLBACK_CONFIG.MESSAGE, state.ageGroup, state.speechSpeed);
                ws.send(JSON.stringify({
                  type: "audio",
                  data: audioBuffer.toString("base64"),
                  mimeType: "audio/pcm;rate=16000"
                }));
              }
              
              // Mark response as produced and reset processing state
              state.turnResponseProduced = true;
              state.isProcessing = false;
              state.processingSinceMs = null;
              state.isTutorSpeaking = false;
              
              // Process next item in queue if any
              if (state.transcriptQueue.length > 0 && !state.isSessionEnded) {
                setImmediate(() => processTranscriptQueue());
              }
            } catch (fallbackError) {
              console.error('[VOICE] turn_fallback_error:', fallbackError);
              state.isProcessing = false;
              state.processingSinceMs = null;
            }
          }
          state.turnFallbackTimerId = undefined;
        }, TURN_FALLBACK_CONFIG.TIMEOUT_MS);
      }
      
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // QUEUE COALESCING: Merge all queued items into a single turn
      // When the student speaks while the tutor is talking/thinking,
      // multiple fragments get queued (e.g., "on", "okay", "right at
      // this point"). Sending them individually causes Claude to say
      // "your response got cut off" for each fragment. Instead, join
      // them into one coherent turn before sending to Claude.
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const queueLen = state.transcriptQueue.length;
      let transcript: string;
      if (queueLen > 1) {
        // Coalesce all queued items into one turn
        const allItems = state.transcriptQueue.splice(0, queueLen);
        transcript = allItems.join(' ').trim();
        console.log(`[Pipeline] 2. COALESCED ${queueLen} queued items into single turn, preview=\"${transcript.substring(0, 80)}\"`);
      } else {
        transcript = state.transcriptQueue.shift()!;
        console.log(`[Pipeline] 2. Starting to process transcript, queue size: 1`);
      }

      try {
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // ECHO GUARD: Filter out transcripts that are echoes of tutor speech
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const echoGuardConfig = getEchoGuardConfig();
        if (echoGuardConfig.enabled) {
          const echoCheck = checkForEcho(state.echoGuardState, transcript, echoGuardConfig);
          if (echoCheck.isEcho) {
            console.log(`[EchoGuard] 🚫 Discarding echo transcript: "${transcript.substring(0, 50)}..." (similarity=${echoCheck.similarity.toFixed(3)}, deltaMs=${echoCheck.deltaMs})`);
            state.isProcessing = false;
            state.processingSinceMs = null;
            // Process next item in queue if any
            if (state.transcriptQueue.length > 0 && !state.isSessionEnded) {
              setImmediate(() => processTranscriptQueue());
            }
            return;
          }
        }
        
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // VOICE_AMBIENT_SUPPRESS: Fast ambient speech rejection
        // Feature flag: VOICE_AMBIENT_SUPPRESS (default: false)
        // Rejects transcripts that are too short/low-signal before semantic analysis
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const ambientSuppressEnabled = process.env.VOICE_AMBIENT_SUPPRESS === 'true';
        if (ambientSuppressEnabled) {
          const words = transcript.trim().split(/\s+/).filter(w => w.length > 0);
          const wordCount = words.length;
          
          // Reject too short and low-signal transcripts (< 3 words)
          // Raised from 2→3: keyboard/mechanical noise typically produces short garbled fragments
          if (wordCount < 3) {
            console.log(JSON.stringify({
              event: 'ambient_rejected',
              session_id: state.sessionId || 'unknown',
              transcript_len: transcript.length,
              word_count: wordCount,
              reason: 'too_short',
              rejected_text: transcript.substring(0, 50),
              timestamp: new Date().toISOString(),
            }));
            console.log(`[AmbientSuppress] 🚫 Rejected short transcript: "${transcript}" (${wordCount} words)`);
            
            // Notify client of ambient rejection
            ws.send(JSON.stringify({
              type: 'ambient_rejected',
              reason: 'too_short',
              wordCount,
            }));
            
            state.isProcessing = false;
            state.processingSinceMs = null;
            if (state.transcriptQueue.length > 0 && !state.isSessionEnded) {
              setImmediate(() => processTranscriptQueue());
            }
            return;
          }
          
          // Reject fragments that look like partial words (single consonant cluster, < 3 chars, no vowel)
          const lastWord = words[words.length - 1].toLowerCase();
          const hasVowel = /[aeiou]/i.test(lastWord);
          if (lastWord.length <= 2 && !hasVowel && wordCount === 1) {
            console.log(JSON.stringify({
              event: 'ambient_rejected',
              session_id: state.sessionId || 'unknown',
              transcript_len: transcript.length,
              word_count: wordCount,
              reason: 'fragment',
              rejected_text: transcript.substring(0, 50),
              timestamp: new Date().toISOString(),
            }));
            console.log(`[AmbientSuppress] 🚫 Rejected fragment: "${transcript}" (no vowel, ${lastWord.length} chars)`);
            
            ws.send(JSON.stringify({
              type: 'ambient_rejected',
              reason: 'fragment',
              wordCount,
            }));
            
            state.isProcessing = false;
            state.processingSinceMs = null;
            if (state.transcriptQueue.length > 0 && !state.isSessionEnded) {
              setImmediate(() => processTranscriptQueue());
            }
            return;
          }
        }
        
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // COHERENCE GATE: Filter out background speech (TV, family conversations)
        // Feature flag: COHERENCE_GATE_ENABLED (default: false)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const coherenceConfig = getCoherenceGateConfig();
        const completedStudentTurns = state.conversationHistory.filter(m => m.role === "user").length;
        if (coherenceConfig.enabled && completedStudentTurns < 3) {
          console.log(`[CoherenceGate] ⏭️ Skipped — insufficient conversation context (turn ${completedStudentTurns} < 3)`);
        }
        if (coherenceConfig.enabled && completedStudentTurns >= 3) {
          const conversationContext = extractConversationContext(
            state.conversationHistory,
            state.subject,
            coherenceConfig
          );
          
          const coherenceResult = checkCoherence(transcript, conversationContext, coherenceConfig);
          
          if (!coherenceResult.isCoherent) {
            // Log the rejection for telemetry
            logCoherenceGateReject(state.sessionId || 'unknown', coherenceResult, coherenceConfig.threshold);
            console.log(`[CoherenceGate] 🚫 Rejected off-topic transcript: "${transcript.substring(0, 50)}..." (similarity=${coherenceResult.similarityScore.toFixed(3)}, reason=${coherenceResult.rejectedReason})`);
            
            // Send clarification message via TTS
            const clarifyMessage = getCoherenceClarifyMessage();
            
            // Add to transcript log
            const clarifyEntry: TranscriptEntry = {
              speaker: "tutor",
              text: clarifyMessage,
              timestamp: new Date().toISOString(),
              messageId: crypto.randomUUID(),
            };
            state.transcript.push(clarifyEntry);
            
            // Send to frontend
            ws.send(JSON.stringify({
              type: "transcript",
              speaker: "tutor",
              text: clarifyMessage,
            }));
            
            // Generate and send TTS audio (if audio is enabled)
            if (state.tutorAudioEnabled) {
              try {
                const clarifyAudio = await generateSpeech(clarifyMessage, state.ageGroup, state.speechSpeed);
                if (clarifyAudio && clarifyAudio.length > 0) {
                  ws.send(JSON.stringify({
                    type: "audio",
                    data: clarifyAudio.toString("base64"),
                    mimeType: "audio/pcm;rate=16000"
                  }));
                }
              } catch (audioError) {
                console.error('[CoherenceGate] ❌ Error generating clarify audio:', audioError);
              }
            }
            
            state.isProcessing = false;
            state.processingSinceMs = null;
            // Process next item in queue if any
            if (state.transcriptQueue.length > 0 && !state.isSessionEnded) {
              setImmediate(() => processTranscriptQueue());
            }
            return;
          }
        }
        
        // Add to transcript log
        const transcriptEntry: TranscriptEntry = {
          speaker: "student",
          text: transcript,
          timestamp: new Date().toISOString(),
          messageId: crypto.randomUUID(),
        };
        state.transcript.push(transcriptEntry);

        // Send transcript to frontend
        ws.send(JSON.stringify({
          type: "transcript",
          speaker: "student",
          text: transcript,
        }));

        console.log(`[Custom Voice] 👤 ${state.studentName}: "${transcript}"`);
        
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // ADAPTIVE PATIENCE: Update patience score based on transcript signals
        // Feature flag: ADAPTIVE_PATIENCE_ENABLED (checked inside function)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        if (state.turnPolicyState && isTurnAdaptivePatienceEnabled()) {
          const signalScore = calculateSignalScore(transcript);
          updateAdaptivePatience(state.turnPolicyState, transcript, false);
          const adjustments = getAdjustedPatienceParams(state.turnPolicyState);
          logAdaptivePatience(
            state.sessionId || 'unknown',
            state.ageGroup as GradeBand,
            state.turnPolicyState,
            signalScore,
            adjustments
          );
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 👋 GOODBYE DETECTION - End session on user goodbye
        // Feature flag: SESSION_GOODBYE_HARD_STOP_ENABLED (default: true)
        // Hard stop: Immediately stops playback, mic, and pending jobs
        // Step 2: Do NOT treat recovery phrases as end-session intents
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // Track if this is a goodbye so we can prevent additional processing
        let isGoodbyeInProgress = false;
        
        // Step 2: Check if this is a recovery phrase during a stall
        // Stall = user hasn't received LLM response in > 5 seconds
        const timeSinceLastLlmRequest = state.lastLlmRequestTime 
          ? Date.now() - state.lastLlmRequestTime 
          : Infinity;
        const isStalled = timeSinceLastLlmRequest > 5000 && state.lastEndOfTurnTime && 
          (Date.now() - state.lastEndOfTurnTime > 5000);
        
        // Skip goodbye detection for recovery phrases during a stall
        const isRecovery = isRecoveryPhrase(transcript);
        if (isRecovery && isStalled) {
          console.log(`[VOICE] 🔄 Recovery phrase detected during stall: "${transcript}" - treating as normal input`);
        }
        
        if (detectGoodbye(transcript) && !(isRecovery && isStalled)) {
          const hardStopEnabled = isGoodbyeHardStopEnabled();
          console.log(`[Goodbye] 👋 User said goodbye (voice), hard_stop=${hardStopEnabled}`);
          isGoodbyeInProgress = true;
          
          // HARD STOP: Immediately notify client to stop playback and mic
          if (hardStopEnabled) {
            ws.send(JSON.stringify({
              type: "interrupt",
              reason: "goodbye_hard_stop",
              stopMic: true,
              stopPlayback: true,
            }));
            console.log('[Goodbye] 🛑 Hard stop - sent interrupt to stop playback and mic');
            
            // NOTE: We do NOT set isSessionEnded here to avoid interfering with finalizeSession
            // Instead, we use isGoodbyeInProgress to skip further processing
          }
          
          const goodbyeMessage = "Goodbye! Great learning with you today. Come back anytime you want to continue learning!";
          
          // Add tutor goodbye to transcript
          const tutorGoodbye: TranscriptEntry = {
            speaker: "tutor",
            text: goodbyeMessage,
            timestamp: new Date().toISOString(),
            messageId: crypto.randomUUID(),
          };
          state.transcript.push(tutorGoodbye);
          
          // Send goodbye transcript
          ws.send(JSON.stringify({
            type: "transcript",
            speaker: "tutor",
            text: goodbyeMessage
          }));
          
          // Generate and send goodbye audio (unless hard stop with audio disabled)
          if (state.tutorAudioEnabled && !hardStopEnabled) {
            try {
              const goodbyeAudio = await generateSpeech(goodbyeMessage, state.ageGroup, state.speechSpeed);
              if (goodbyeAudio && goodbyeAudio.length > 0) {
                ws.send(JSON.stringify({
                  type: "audio",
                  data: goodbyeAudio.toString("base64"),
                  mimeType: "audio/pcm;rate=16000"
                }));
                console.log('[Goodbye] 🔊 Sent goodbye audio');
              }
            } catch (audioError) {
              console.error('[Goodbye] ❌ Error generating goodbye audio:', audioError);
            }
          }
          
          // End session - faster for hard stop, delayed for soft stop
          const delayMs = hardStopEnabled ? 500 : 4000;
          setTimeout(async () => {
            console.log('[Goodbye] 🛑 Ending session');
            clearInterval(persistInterval);
            
            if (state.inactivityTimerId) {
              clearInterval(state.inactivityTimerId);
              state.inactivityTimerId = null;
            }
            if (state.watchdogTimerId) {
              clearInterval(state.watchdogTimerId);
              state.watchdogTimerId = null;
            }
            state.watchdogDisabled = true;
            
            try {
              ws.send(JSON.stringify({
                type: 'session_ended',
                reason: 'user_goodbye',
                message: 'Session ended - user said goodbye',
                hardStop: hardStopEnabled,
              }));
              
              // Call finalizeSession FIRST, then mark as ended
              await finalizeSession(state, 'normal');
              state.isSessionEnded = true; // Set AFTER finalization completes
              ws.close(1000, 'Session ended - user said goodbye');
              console.log('[Goodbye] ✅ Session ended successfully');
            } catch (error) {
              console.error('[Goodbye] ❌ Error ending session:', error);
              state.isSessionEnded = true; // Mark ended even on error
              ws.close(1011, 'Error ending session');
            }
          }, delayMs);
          
          state.isProcessing = false;
          // NOTE: isSessionEnded is set inside setTimeout after finalizeSession completes
          // Use isGoodbyeInProgress flag to prevent further processing
          return; // Exit early, don't process further
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 🛡️ CONTENT MODERATION - Check for inappropriate content
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        console.log("[Custom Voice] 🔍 Moderating content...");
        
        // Pass educational context to moderation
        const moderation = await moderateContent(transcript, {
          sessionType: 'tutoring',
          subject: 'general', // Subject from session init message
          gradeLevel: state.ageGroup,
          hasDocuments: state.uploadedDocuments && state.uploadedDocuments.length > 0
        });
        
        console.log("[Custom Voice] Moderation result:", {
          isAppropriate: moderation.isAppropriate,
          confidence: moderation.confidence,
          reason: moderation.reason
        });
        
        if (!moderation.isAppropriate) {
          console.log(`[Custom Voice] ⚠️  Content flagged: ${moderation.violationType} (confidence: ${moderation.confidence})`);
          
          // Only take action on HIGH confidence violations (>0.85)
          // This prevents false positives from ending sessions
          if (moderation.confidence && moderation.confidence > 0.85) {
            console.log("[Custom Voice] ❌ High confidence violation - taking action");
            
            // CRITICAL SAFETY: Check for immediate termination (self-harm, violent threats, harm to others)
            const isImmediateTermination = moderation.requiresImmediateTermination === true;
            
            // For immediate termination incidents, skip warning system entirely
            let warningLevel: 'first' | 'second' | 'final' | 'none';
            if (isImmediateTermination) {
              console.log(`[Custom Voice] 🚨 CRITICAL SAFETY: ${moderation.violationType} requires immediate termination`);
              warningLevel = 'final'; // Force immediate termination
            } else {
              // Count severe profanity instances in the message for escalation
              // A message with multiple F-bombs + hostility should escalate faster
              const severePatterns = [
                /\bf[u*\-_]ck(?:ing|ed|er|s)?\b/gi,
                /\bsh[i*\-_]t(?:ty|s)?\b/gi,
                /\bb[i*\-_]tch(?:es|ing)?\b/gi,
                /\bass(?:hole|es)\b/gi,
              ];
              let severeMatchCount = 0;
              for (const pattern of severePatterns) {
                const matches = transcript.match(pattern);
                if (matches) severeMatchCount += matches.length;
              }
              
              // Check for hostility directed at the tutor (e.g., "fuck off", "you suck", "your voice is whack")
              const tutorHostility = /\b(?:fuck\s*(?:off|you)|screw\s*you|you\s+suck|hate\s+you|shut\s+(?:the\s+)?(?:fuck\s+)?up)\b/i.test(transcript);
              
              // Escalation: multi-profanity (3+) or profanity + tutor hostility = +1 extra strike
              let extraStrikes = 0;
              if (severeMatchCount >= 3 || (severeMatchCount >= 2 && tutorHostility)) {
                extraStrikes = 1;
                console.log(`[Custom Voice] ⚠️ Escalated violation: ${severeMatchCount} severe terms${tutorHostility ? ' + tutor hostility' : ''} → +1 extra strike`);
              }
              
              // Increment violation count for non-critical violations
              state.violationCount += (1 + extraStrikes);
              warningLevel = shouldWarnUser(state.violationCount - 1);
            }
            
            // Get appropriate response based on warning level (should never be 'none' here)
            if (warningLevel === 'none') {
              console.error("[Custom Voice] ❌ Unexpected warning level 'none'");
              state.isProcessing = false; // CRITICAL FIX: Release processing lock
              return; // Skip if somehow 'none' is returned
            }
            
            // For critical safety incidents, use a specific termination message
            const moderationResponse = isImmediateTermination
              ? "I need to end our session now. If you're feeling upset or having difficult thoughts, please talk to a trusted adult or call 988 for support. Take care."
              : getModerationResponse(warningLevel);
          
          // Log violation to database with FULL context (user message + AI warning response)
          // CRITICAL: Wrap in try/catch to prevent DB errors from killing the turn
          // Note: Notification flags are set to false here and tracked accurately in safetyIncidents table
          try {
            await db.insert(contentViolations).values({
              userId: state.userId,
              sessionId: state.sessionId,
              violationType: moderation.violationType!,
              severity: isImmediateTermination ? 'critical' : moderation.severity,
              userMessage: transcript,
              aiResponse: moderationResponse,
              confidence: moderation.confidence?.toString(),
              reviewStatus: 'pending',
              actionTaken: isImmediateTermination ? 'session_terminated' : (warningLevel === 'final' ? 'suspension' : 'warning'),
              notifiedParent: false, // Actual notification tracking is in safetyIncidents
              notifiedSupport: false, // Actual notification tracking is in safetyIncidents
            });
          } catch (dbError) {
            console.error('[Custom Voice] ⚠️ Failed to log content violation (non-fatal):', dbError);
            // Continue processing - don't let DB errors kill the turn
          }
          
          // If final warning, suspend user and end session
          if (warningLevel === 'final') {
            console.log("[Custom Voice] 🚫 Suspending user due to repeated violations");
            
            // Create suspension record (1 hour suspension)
            const suspendedUntil = new Date();
            suspendedUntil.setHours(suspendedUntil.getHours() + 1);
            
            try {
              await db.insert(userSuspensions).values({
                userId: state.userId,
                reason: `Repeated inappropriate content violations (${moderation.violationType})`,
                violationIds: [],
                suspendedUntil: suspendedUntil,
                isPermanent: false,
                isActive: true,
              });
            } catch (suspendError) {
              console.error('[Custom Voice] ⚠️ Failed to create suspension record (non-fatal):', suspendError);
            }
            
            // SAFETY NOTIFICATION: Send JIE Support + Parent notification (non-fatal)
            try {
              const safetyNotification: SafetyIncidentNotification = {
                incidentType: (moderation.violationType || 'other') as SafetyIncidentType,
                severity: moderation.severity,
                sessionId: state.sessionId,
                userId: state.userId,
                studentName: state.studentName,
                parentEmail: state.parentEmail,
                triggerText: transcript.substring(0, 500),
                matchedTerms: moderation.matchedTerms,
                actionTaken: isImmediateTermination 
                  ? `Critical safety incident - Immediate session termination (${moderation.violationType})`
                  : 'Session terminated - User suspended for 1 hour',
                timestamp: new Date()
              };
              handleSafetyIncident(safetyNotification).catch(err => {
                console.error('[Custom Voice] ⚠️ Safety notification failed (non-fatal):', err);
              });
            } catch (notifyError) {
              console.error('[Custom Voice] ⚠️ Safety notification setup failed (non-fatal):', notifyError);
            }
            
            // Send moderation response
            // TURN FALLBACK: Cancel since we're sending a response
            state.turnResponseProduced = true;
            if (state.turnFallbackTimerId) {
              clearTimeout(state.turnFallbackTimerId);
              state.turnFallbackTimerId = undefined;
            }
            const aiResponse = moderationResponse;
            
            // Add to conversation history
            state.conversationHistory.push(
              { role: "user", content: transcript },
              { role: "assistant", content: aiResponse }
            );
            
            // Add to transcript
            const aiTranscriptEntry: TranscriptEntry = {
              speaker: "tutor",
              text: aiResponse,
              timestamp: new Date().toISOString(),
              messageId: crypto.randomUUID(),
            };
            state.transcript.push(aiTranscriptEntry);
            
            // Send response
            ws.send(JSON.stringify({
              type: "transcript",
              speaker: "tutor",
              text: aiResponse,
            }));
            
            // Generate and send speech
            const audioBuffer = await generateSpeech(aiResponse, state.ageGroup, state.speechSpeed);
            ws.send(JSON.stringify({
              type: "audio",
              data: audioBuffer.toString("base64"),
              mimeType: "audio/pcm;rate=16000"
            }));
            
            // Clear intervals before finalizing (inactivity timer cleared in finalizeSession)
            clearInterval(persistInterval);
            if (responseTimer) {
              clearTimeout(responseTimer);
              responseTimer = null;
            }
            
            // Finalize session with violation reason
            await finalizeSession(state, 'violation', `Content violation: ${moderation.violationType}`);
            
            // Send session end notification
            ws.send(JSON.stringify({
              type: "session_ended",
              reason: "content_violation"
            }));
            
            // Close WebSocket
            state.isProcessing = false; // CRITICAL FIX: Release processing lock
            setTimeout(() => ws.close(), 2000); // Give time for audio to play
            return;
          } else {
            // Send warning (1st or 2nd)
            console.log(`[Custom Voice] ⚠️  Sending ${warningLevel} warning to user`);
            const aiResponse = moderationResponse;
            
            // Add to conversation history
            state.conversationHistory.push(
              { role: "user", content: transcript },
              { role: "assistant", content: aiResponse }
            );
            
            // Add to transcript
            const aiTranscriptEntry: TranscriptEntry = {
              speaker: "tutor",
              text: aiResponse,
              timestamp: new Date().toISOString(),
              messageId: crypto.randomUUID(),
            };
            state.transcript.push(aiTranscriptEntry);
            
            // Send response
            ws.send(JSON.stringify({
              type: "transcript",
              speaker: "tutor",
              text: aiResponse,
            }));
            
            // Generate and send speech
            const audioBuffer = await generateSpeech(aiResponse, state.ageGroup, state.speechSpeed);
            ws.send(JSON.stringify({
              type: "audio",
              data: audioBuffer.toString("base64"),
              mimeType: "audio/pcm;rate=16000"
            }));
            
            // Persist
            await persistTranscript(state.sessionId, state.transcript);
            state.isProcessing = false; // CRITICAL FIX: Release processing lock after warning
            
            // Process next queued item if any
            if (state.transcriptQueue.length > 0 && !state.isSessionEnded) {
              setImmediate(() => processTranscriptQueue());
            }
            return; // Don't continue to normal AI processing
          }
          } else {
            // Low confidence flag - log but proceed with educational conversation
            console.warn("[Custom Voice] ⚠️ Low confidence flag - proceeding with educational context:", {
              message: transcript,
              confidence: moderation.confidence,
              reason: moderation.reason
            });
            // Continue to normal AI processing below
          }
        }
        
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // ✅ Content passed moderation - Continue normal processing
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        // ⏱️ LATENCY TIMING: Start pipeline timing
        const pipelineStart = Date.now();
        console.log(`[Custom Voice] ⏱️ PIPELINE START at ${new Date().toISOString()}`);
        
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // TIMING OPTIMIZATION (Dec 5, 2025): Reduced delays for faster response
        // Previous delays were too long (1200-2500ms), now reduced significantly
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        // Calculate appropriate delay based on context (REDUCED for faster response)
        let responseDelay = 300; // Reduced from 1200ms to 300ms for complete thoughts
        
        // Check if this was likely an incomplete thought
        if (isLikelyIncompleteThought(transcript)) {
          responseDelay = 800; // Reduced from 2500ms to 800ms for incomplete thoughts
          console.log(`[Custom Voice] ⏱️ Detected incomplete thought - using delay (${responseDelay}ms)`);
        } else {
          console.log(`[Custom Voice] ⏱️ Complete thought detected - using minimal delay (${responseDelay}ms)`);
        }
        
        // Add extra buffer if student just interrupted tutor (reduced)
        if (state.wasInterrupted) {
          const timeSinceInterrupt = Date.now() - state.lastInterruptionTime;
          if (timeSinceInterrupt < 10000) { // Within 10 seconds
            const extraBuffer = 500; // Reduced from 2500ms to 500ms
            console.log(`[Custom Voice] 🛑 Post-interruption buffer: +${extraBuffer}ms (interrupted ${timeSinceInterrupt}ms ago)`);
            responseDelay += extraBuffer;
          }
          state.wasInterrupted = false; // Clear flag after applying
        }
        
        console.log(`[Custom Voice] ⏳ Pre-response delay: ${responseDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, responseDelay));
        console.log(`[Pipeline] 3. Calling Claude API with: "${transcript.substring(0, 100)}${transcript.length > 100 ? '...' : ''}"`);
        
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // THINKING INDICATOR: Generate turnId and emit tutor_thinking
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const turnId = crypto.randomUUID();
        state.currentTurnId = turnId;
        state.hasEmittedResponding = false;
        
        sendWsEvent(ws, 'tutor_thinking', {
          sessionId: state.sessionId,
          turnId,
          timestamp: Date.now(),
        });
        state.llmInFlight = true;
        cancelBargeInCandidate(state, 'awaiting_response', ws);
        setPhase(state, 'AWAITING_RESPONSE', 'llm_request_start', ws);
        console.log(`[LLM] request_start session=${state.sessionId || 'unknown'} turnId=${turnId} messageCount=${state.conversationHistory.length} phase=${state.phase}`);
        
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        // Generate AI response (voice input) - STREAMING for lower latency
        // LANGUAGE AUTO-DETECT: Use detected language if available, fall back to selected
        const responseLanguage = state.detectedLanguage || state.language;
        console.log(`[Custom Voice] 🌍 Generating STREAMING response in: ${responseLanguage}`);
        
        // ⏱️ LATENCY TIMING: Track streaming response
        const claudeStart = Date.now();
        let firstSentenceMs = 0;
        let totalTtsMs = 0;
        let totalAudioBytes = 0;
        let sentenceCount = 0;
        
        state.playbackGenId++;
        cancelBargeInCandidate(state, 'new_tutor_response', ws);
        state.isTutorSpeaking = true;
        state.isTutorThinking = true;
        state.currentPlaybackMode = 'tutor_speaking';
        state.tutorAudioStartMs = 0;
        const turnTimestamp = Date.now();
        state.lastAudioSentAt = turnTimestamp;
        
        const llmAc = new AbortController();
        const ttsAc = new AbortController();
        state.llmAbortController = llmAc;
        state.ttsAbortController = ttsAc;
        const activeGenId = state.playbackGenId;
        
        console.log(JSON.stringify({ event: 'tutor_reply_started', session_id: state.sessionId, gen_id: activeGenId }));
        
        // ECHO GUARD: Mark playback starting
        const echoConfig = getEchoGuardConfig();
        markPlaybackStart(state.echoGuardState, echoConfig);
        logEchoGuardStateTransition('playback_start', state.echoGuardState);
        
        // Use streaming with sentence-by-sentence TTS for minimal latency
        await new Promise<void>((resolve, reject) => {
          const callbacks: StreamingCallbacks = {
            onSentence: async (sentenceRaw: string) => {
              sentenceCount++;
              const sentenceStart = Date.now();

              // ── VISUAL TAG PARSER ────────────────────────────────────────
              // Strip [VISUAL: tag_name] from sentence before TTS/transcript.
              // If found, send show_visual event to client.
              const visualMatch = sentenceRaw.match(/\[VISUAL:\s*([a-z0-9_]+)\]/i);
              let sentence = sentenceRaw;
              if (visualMatch) {
                const visualTag = visualMatch[1].toLowerCase();
                sentence = sentenceRaw.replace(visualMatch[0], '').trim();
                console.log(`[Visual] 📊 Triggering visual: ${visualTag} session=${state.sessionId?.substring(0,8)}`);
                ws.send(JSON.stringify({ type: 'show_visual', visualTag }));
              }
              // ── END VISUAL TAG PARSER ────────────────────────────────────

              if (sentenceCount === 1) {
                firstSentenceMs = sentenceStart - claudeStart;
                state.isTutorThinking = false;
                state.llmInFlight = false;
                setPhase(state, 'TUTOR_SPEAKING', 'first_sentence', ws);
                state.sttLastUserSpeechSentAtMs = 0;
                // FRESH STT PER LISTENING WINDOW: Close STT during tutor speech.
                // Eliminates stale connection problem — no need to keep pipe warm.
                teardownSttConnection(state, 'tutor_speaking_start');
                console.log(`[LLM] first_token_ms=${firstSentenceMs} session=${state.sessionId || 'unknown'}`);
                
                // TURN FALLBACK: Cancel fallback timer since we're producing a response
                state.turnResponseProduced = true;
                if (state.turnFallbackTimerId) {
                  clearTimeout(state.turnFallbackTimerId);
                  state.turnFallbackTimerId = undefined;
                }
                
                // THINKING INDICATOR: Emit tutor_responding on first sentence
                if (!state.hasEmittedResponding && state.currentTurnId) {
                  state.hasEmittedResponding = true;
                  sendWsEvent(ws, 'tutor_responding', {
                    sessionId: state.sessionId,
                    turnId: state.currentTurnId,
                    timestamp: Date.now(),
                  });
                }
                
                // Send full transcript placeholder for first sentence
                ws.send(JSON.stringify({
                  type: "transcript",
                  speaker: "tutor",
                  text: sentence,
                  isPartial: true,
                }));
              } else {
                // Update transcript with accumulated text
                ws.send(JSON.stringify({
                  type: "transcript_update",
                  speaker: "tutor",
                  text: sentence,
                }));
              }
              
              // Generate TTS for this sentence immediately
              if (state.tutorAudioEnabled) {
                const ttsStart = Date.now();
                try {
                  const audioBuffer = await generateSpeech(sentence, state.ageGroup, state.speechSpeed);
                  const ttsMs = Date.now() - ttsStart;
                  totalTtsMs += ttsMs;
                  totalAudioBytes += audioBuffer.length;

                  console.log(`[Custom Voice] 🔊 Sentence ${sentenceCount} TTS: ${ttsMs}ms, ${audioBuffer.length} bytes`);

                  if (state.ttsAbortController?.signal.aborted) {
                    console.log(JSON.stringify({ event: 'audio_dropped_stale_gen', session_id: state.sessionId, sentence: sentenceCount }));
                    return;
                  }
                  if (!state.tutorAudioPlaying) {
                    state.tutorAudioPlaying = true;
                    state.tutorAudioStartMs = Date.now();
                    // Only cancel idle barge-in candidates - if already ducked/confirming, user is actively speaking
                    if (!state.bargeInCandidate.isActive || state.bargeInCandidate.stage === 'idle') {
                      cancelBargeInCandidate(state, 'first_audio_chunk', ws);
                    } else {
                      console.log(`[BargeIn] preserved_active_candidate_on_audio_start stage=${state.bargeInCandidate.stage} rms=${state.bargeInCandidate.peakRms.toFixed(4)}`);
                    }
                    console.log(`[Phase] tutorAudioPlaying=true genId=${state.playbackGenId} session=${state.sessionId?.substring(0, 8) || 'unknown'}`);
                  }
                  ws.send(JSON.stringify({
                    type: "audio",
                    data: audioBuffer.toString("base64"),
                    mimeType: "audio/pcm;rate=16000",
                    isChunk: true,
                    chunkIndex: sentenceCount,
                    genId: state.playbackGenId,
                  }));
                  markProgress(state);
                } catch (ttsError) {
                  console.error(`[Custom Voice] ❌ TTS error for sentence ${sentenceCount}:`, ttsError);
                }
              }
            },
            
            onComplete: (fullText: string) => {
              const claudeMs = Date.now() - claudeStart;
              state.isTutorThinking = false;
              markProgress(state);
              console.log(`[Pipeline] 4. Claude response received (${claudeMs}ms), generating audio...`);
              
              // ── STRIP VISUAL TAGS from full text before saving to history/transcript ──
              const normalizedContent = (fullText ?? "").trim().replace(/\[VISUAL:\s*[a-z0-9_]+\]/gi, '').replace(/\s{2,}/g, ' ').trim();
              const wasAborted = llmAc.signal.aborted || ttsAc.signal.aborted;
              if (normalizedContent.length === 0 || wasAborted || sentenceCount === 0) {
                console.log(`[History] saved_assistant=false reason=${wasAborted ? 'aborted' : 'empty'} genId=${activeGenId} tokens=${sentenceCount} phase=${state.phase} len=${normalizedContent.length}`);
                if (state.currentTurnId) {
                  sendWsEvent(ws, 'tutor_interrupted', {
                    sessionId: state.sessionId,
                    turnId: state.currentTurnId,
                    genId: activeGenId,
                    reason: wasAborted ? 'aborted' : 'empty_response',
                    phase: state.phase,
                    timestamp: Date.now(),
                  });
                }
                resolve();
                return;
              }
              
              console.log(`[Custom Voice] 🤖 Tutor: "${normalizedContent}"`);
              
              // ECHO GUARD: Record tutor utterance for echo comparison
              recordTutorUtterance(state.echoGuardState, normalizedContent, echoConfig);
              
              console.log(`[History] saved_assistant=true len=${normalizedContent.length} genId=${activeGenId}`);
              state.conversationHistory.push(
                { role: "user", content: transcript },
                { role: "assistant", content: normalizedContent }
              );
              
              // Add AI response to transcript (internal state)
              const aiTranscriptEntry: TranscriptEntry = {
                speaker: "tutor",
                text: normalizedContent,
                timestamp: new Date().toISOString(),
                messageId: crypto.randomUUID(),
              };
              state.transcript.push(aiTranscriptEntry);
              
              // Send final complete transcript
              ws.send(JSON.stringify({
                type: "transcript",
                speaker: "tutor",
                text: normalizedContent,
                isComplete: true,
              }));
              
              // ⏱️ LATENCY TIMING: Total pipeline time
              const totalPipelineMs = Date.now() - pipelineStart;
              console.log(`[Custom Voice] ⏱️ PIPELINE COMPLETE (STREAMING): ${totalPipelineMs}ms total`);
              console.log(`[Custom Voice] ⏱️ Breakdown: delay=${responseDelay}ms, firstSentence=${firstSentenceMs}ms, totalTTS=${totalTtsMs}ms, audio=${totalAudioBytes} bytes`);
              
              resolve();
            },
            
            onError: (error: Error) => {
              console.error("[Custom Voice] ❌ Streaming error:", error);
              reject(error);
            }
          };
          
          const historyBefore = state.conversationHistory.length;
          state.conversationHistory = state.conversationHistory.filter(msg => {
            if (msg.role === 'assistant' && (!msg.content || msg.content.trim() === '')) {
              return false;
            }
            return true;
          });
          const removed = historyBefore - state.conversationHistory.length;
          if (removed > 0) {
            console.log(`[History] defensive_filter removed=${removed} empty assistant messages before Claude call`);
          }
          
          generateTutorResponseStreaming(
            state.conversationHistory,
            transcript,
            state.uploadedDocuments,
            callbacks,
            state.systemInstruction,
            "voice",
            responseLanguage,
            state.ageGroup,
            llmAc.signal,
            state.useFallbackLLM
          ).then(() => {
            // Check if fallback was triggered during this call
            if ((callbacks as any)._fallbackUsed && !state.useFallbackLLM) {
              state.useFallbackLLM = true;
              console.log(`[LLM Fallback] 🔄 Switching to OpenAI for rest of session ${state.sessionId}`);
            }
          }).catch(reject);
        });

        console.log("[Custom Voice] 🔊 Streaming response sent, waiting for user...");

        if (state.llmAbortController === llmAc) state.llmAbortController = null;
        if (state.ttsAbortController === ttsAc) state.ttsAbortController = null;

        // FIX #3: Persist after each turn (before pause to avoid blocking)
        await persistTranscript(state.sessionId, state.transcript);

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // PACING FIX: Release isProcessing BEFORE pause to allow interruptions
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        state.isProcessing = false;
        state.processingSinceMs = null;
        console.log(`[Pipeline] finalize reason=success_response_sent queueLen=${state.transcriptQueue.length}`);
        
        // Calculate approximate audio duration from total bytes (16kHz, 16-bit = 2 bytes/sample)
        const audioDuration = totalAudioBytes / (16000 * 2); // seconds
        const pauseMs = Math.max(2000, audioDuration * 1000 + 1500); // Audio duration + 1.5s buffer

        console.log(`[Custom Voice] ⏳ Pausing ${pauseMs}ms (audio: ${audioDuration.toFixed(1)}s + 1.5s buffer)...`);

        // Wait for audio to finish playing + give user time to think
        await new Promise(resolve => setTimeout(resolve, pauseMs));

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // PACING FIX: Only clear flag if this turn is still active (prevents race condition)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        if (state.lastAudioSentAt === turnTimestamp) {
          console.log("[Custom Voice] ✅ Pause complete, ready for user input");
          state.isTutorSpeaking = false;
          state.tutorAudioPlaying = false;
          if (state.phase !== 'FINALIZING') {
            setPhase(state, 'LISTENING', 'audio_playback_complete', ws);
            // FRESH STT PER LISTENING WINDOW: Open new connection for the next student turn.
            if (USE_ASSEMBLYAI && !state.reconnectInFlight && state.sttReconnectFn) {
              state.sttReconnectAttempts = 0;
              state.sttReconnectFn();
            }
          }
          // Reset STT deadman baseline — during tutor speech no transcripts arrive,
          // so sttLastMessageAtMs gets stale (20+ seconds). Without this reset the
          // deadman fires instantly when the tutor stops speaking.
          state.sttLastMessageAtMs = Date.now();
          
          // ECHO GUARD: Mark playback end and start echo tail guard
          markPlaybackEnd(state.echoGuardState, echoConfig);
          logEchoGuardStateTransition('playback_end', state.echoGuardState);
        } else {
          console.log("[Custom Voice] ℹ️ Turn superseded by newer turn, keeping isTutorSpeaking");
        }
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        // Process next queued item if any
        if (state.transcriptQueue.length > 0 && !state.isSessionEnded) {
          setImmediate(() => processTranscriptQueue());
        }

      } catch (error) {
        console.error("[Custom Voice] ❌ Error processing:", error);
        state.isTutorSpeaking = false;
        state.isTutorThinking = false;
        state.tutorAudioPlaying = false;
        state.llmInFlight = false;
        if (state.phase !== 'FINALIZING') {
          setPhase(state, 'LISTENING', 'processing_error', ws);
        }
        
        // ECHO GUARD: Also mark playback end on error
        markPlaybackEnd(state.echoGuardState, getEchoGuardConfig());
        
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        const isRetryable = errorMsg.startsWith('RETRYABLE:');
        const displayMessage = isRetryable ? errorMsg.replace('RETRYABLE:', '') : errorMsg;
        
        // THINKING INDICATOR: Emit tutor_error to clear thinking state
        if (state.currentTurnId) {
          sendWsEvent(ws, 'tutor_error', {
            sessionId: state.sessionId,
            turnId: state.currentTurnId,
            timestamp: Date.now(),
            message: displayMessage,
          });
          state.currentTurnId = null;
        }
        
        ws.send(JSON.stringify({ 
          type: "error", 
          error: displayMessage,
          retryable: isRetryable
        }));
        
        // AUTO-RETRY: Re-queue the failed transcript for retryable errors (overloaded, rate limit)
        if (isRetryable && transcript && !state.isSessionEnded) {
          const retryCount = (state as any)._retryCount || 0;
          const MAX_CLIENT_RETRIES = 2;
          if (retryCount < MAX_CLIENT_RETRIES) {
            (state as any)._retryCount = retryCount + 1;
            const retryDelay = 2000 * Math.pow(2, retryCount); // 2s, 4s
            console.log(`[Retry] 🔄 Auto-requeuing transcript (attempt ${retryCount + 1}/${MAX_CLIENT_RETRIES}) in ${retryDelay}ms: "${transcript.substring(0, 50)}..."`);
            ws.send(JSON.stringify({ 
              type: "status", 
              status: "retrying",
              message: `Retrying your message (attempt ${retryCount + 2})...`,
              retryIn: retryDelay
            }));
            setTimeout(() => {
              if (!state.isSessionEnded && ws.readyState === 1) {
                state.transcriptQueue.unshift(transcript);
                processTranscriptQueue();
              }
            }, retryDelay);
          } else {
            console.error(`[Retry] ❌ Max retries (${MAX_CLIENT_RETRIES}) exhausted for transcript`);
            (state as any)._retryCount = 0;
          }
        } else if (!isRetryable) {
          (state as any)._retryCount = 0; // Reset on non-retryable errors
        }
        
        // FIX #1: Process next item in queue even after error
        if (state.transcriptQueue.length > 0 && !state.isSessionEnded) {
          setImmediate(() => processTranscriptQueue());
        }
      } finally {
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // CRITICAL: ALWAYS release processing lock and drain queue
        // Ensures tutor never gets stuck silent due to unreleased locks
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const wasProcessing = state.isProcessing;
        state.isProcessing = false;
        state.processingSinceMs = null;
        if (wasProcessing) {
          console.log(`[Pipeline] finalize reason=finally_block queueLen=${state.transcriptQueue.length}`);
        }
        if (state.transcriptQueue.length > 0 && !state.isSessionEnded) {
          console.log(`[Pipeline] drainQueue from finally block, queueLen=${state.transcriptQueue.length}`);
          setImmediate(() => processTranscriptQueue());
        }
      }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // FIX (Dec 10, 2025): Reconnect Deepgram function for auto-recovery
    // Properly tears down previous connection before creating new one
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    async function reconnectDeepgram(): Promise<DeepgramConnection> {
      // CRITICAL: Tear down existing connection to prevent listener/interval leaks
      if (state.deepgramConnection) {
        console.log("[Custom Voice] 🧹 Tearing down old Deepgram connection before reconnect");
        try {
          state.deepgramConnection.close();
        } catch (e) {
          // Ignore close errors on old connection
        }
        state.deepgramConnection = null;
      }
      
      const { getDeepgramLanguageCode } = await import("../services/deepgram-service");
      const deepgramLanguage = getDeepgramLanguageCode(state.language);
      
      // Shared transcript handler - same logic as original connection with NOISE ROBUSTNESS
      const handleTranscript = async (transcript: string, isFinal: boolean, detectedLanguage?: string) => {
        const spokenLang = detectedLanguage || state.language;
        console.log(`[Deepgram] ${isFinal ? '✅ FINAL' : '⏳ interim'}: "${transcript}" (reconnected, lang=${spokenLang})`);
        
        if (!state.userId) return;
        
        const now = Date.now();
        const timeSinceLastAudio = now - state.lastAudioSentAt;
        const noiseFloor = getNoiseFloor(state.noiseFloorState);
        
        // GHOST TURN PREVENTION: Validate transcript
        const transcriptValidation = validateTranscript(transcript, 1);
        if (!transcriptValidation.isValid && isFinal) {
          logGhostTurnPrevention(state.sessionId || 'unknown', transcript, transcriptValidation);
          return;
        }
        
        // HARDENED BARGE-IN (reconnected handler) — phase-gated
        if (state.phase === 'TUTOR_SPEAKING' && state.tutorAudioPlaying && timeSinceLastAudio < 30000) {
          const bargeInValidation = validateTranscriptForBargeIn(transcript);
          
          if (!bargeInValidation.isValid) {
            if (!state.bargeInDucking) {
              state.bargeInDucking = true;
              state.bargeInDuckStartTime = now;
              ws.send(JSON.stringify({ type: "duck", message: "Potential speech detected" }));
              logBargeInDecision(state.sessionId || 'unknown', 'duck', state.lastMeasuredRms, noiseFloor, bargeInValidation.wordCount, transcript, 'too_short');
            }
          } else {
            if (state.phase !== 'TUTOR_SPEAKING' || !state.tutorAudioPlaying) {
              console.log(`[BargeIn] suppressed_late_lexical tutorAudioPlaying=${state.tutorAudioPlaying} phase=${state.phase} genId=${state.playbackGenId}`);
              state.bargeInDucking = false;
            } else {
              hardInterruptTutor(ws, state, 'lexical_validated');
              logBargeInDecision(state.sessionId || 'unknown', 'interrupt', state.lastMeasuredRms, noiseFloor, bargeInValidation.wordCount, transcript, 'lexical_validated');
            }
          }
        }
        
        if (state.isTutorSpeaking && timeSinceLastAudio >= 30000) {
          state.isTutorSpeaking = false;
          state.isTutorThinking = false;
          state.bargeInDucking = false;
          state.currentPlaybackMode = 'listening';
          if (state.phase === 'TUTOR_SPEAKING') {
            setPhase(state, 'LISTENING', 'stale_tutor_speaking_reset', ws);
          }
        }
        
        if (!isFinal) return;
        // P0: Use shouldDropTranscript instead of raw char-length gate (reconnected STT path)
        const reconnDropCheck = shouldDropTranscript(transcript, state);
        if (reconnDropCheck.drop) {
          console.log(`[GhostTurn] dropped reason=${reconnDropCheck.reason} text="${(transcript || '').substring(0, 30)}" len=${(transcript || '').trim().length} path=reconnected`);
          return;
        }
        
        state.lastActivityTime = Date.now();
        state.inactivityWarningSent = false;
        
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // FIX (Dec 10, 2025): DON'T drop transcripts when isProcessing!
        // Previous bug: transcripts were silently dropped causing "tutor not responding"
        // Now: ALWAYS accumulate transcripts, let the queue handle serialization
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        console.log(`[Pipeline] 1. Transcript received (reconnected): "${transcript}", isProcessing=${state.isProcessing}`);
        
        // Skip duplicates only (not based on isProcessing!)
        if (state.lastTranscript === transcript) {
          console.log("[Pipeline] ⏭️ Duplicate transcript, skipping");
          return;
        }
        
        state.lastTranscript = transcript;
        if (spokenLang) state.detectedLanguage = spokenLang;
        
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // FIX (Dec 10, 2025): Server-side transcript ACCUMULATION (reconnected handler)
        // ALWAYS accumulate - don't gate on isProcessing!
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        pendingTranscript = (pendingTranscript + ' ' + transcript).trim();
        console.log(`[Custom Voice] 📝 Accumulated transcript (reconnected): "${pendingTranscript}"`);
        
        if (transcriptAccumulationTimer) {
          clearTimeout(transcriptAccumulationTimer);
          transcriptAccumulationTimer = null;
        }
        
        if (responseTimer) {
          clearTimeout(responseTimer);
          responseTimer = null;
        }
        
        transcriptAccumulationTimer = setTimeout(() => {
          if (pendingTranscript && !state.isSessionEnded) {
            const completeUtterance = pendingTranscript;
            console.log(`[Custom Voice] ✅ Utterance complete (reconnected): "${completeUtterance}"`);
            pendingTranscript = '';
            state.lastEndOfTurnTime = Date.now();
            commitUserTurn(completeUtterance, 'eot');
          }
          transcriptAccumulationTimer = null;
        }, UTTERANCE_COMPLETE_DELAY_MS);
      };
      
      return await startDeepgramStream(
        handleTranscript,
        async (error: Error) => {
          console.error("[Custom Voice] ❌ Deepgram error (reconnected):", error);
          if (state.sessionId && state.transcript.length > 0) {
            await persistTranscript(state.sessionId, state.transcript);
          }
          try { ws.send(JSON.stringify({ type: "error", error: error.message })); } catch (e) {}
        },
        async () => {
          console.log("[Custom Voice] 🔌 Reconnected Deepgram connection closed");
          // onClose triggers reconnect logic via the main handler
        },
        deepgramLanguage
      );
    }

    ws.on("message", async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case "init":
            console.log("[Custom Voice] 🚀 Initializing session:", message.sessionId);
            
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // TRIAL SESSION PATH - Skip realtimeSessions and suspension checks
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            if (isTrialSession) {
              console.log("[Custom Voice] 🎫 Trial entitlement OK - skipping paid session checks");
              state.sessionId = `trial_session_${trialId}`;
              state.studentName = message.studentName || "Friend";
              state.ageGroup = message.ageGroup || "College/Adult";
              state.subject = message.subject || "General";
              state.practiceMode = message.practiceMode || false;
              state.language = message.language || "en";
              state.speechSpeed = 1.0;
              
              // PRE-WARM: Fire-and-forget TTS connection warm-up so greeting first sentence is fast
              prewarmTTS(state.ageGroup).catch(() => {});
              
              console.log(`[Custom Voice] 🎫 Trial session initialized:`, {
                sessionId: state.sessionId,
                userId: state.userId,
                studentName: state.studentName,
                ageGroup: state.ageGroup,
                subject: state.subject,
                language: state.language
              });
            } else {
              // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              // PAID USER PATH - Full validation required
              // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              
              // SECURITY: Check if account is disabled or deleted
              const userCheck = await storage.getUser(authenticatedUserId);
              if (userCheck?.isDisabled) {
                console.error(`[Custom Voice] ❌ Account is disabled: ${authenticatedUserId}`);
                ws.send(JSON.stringify({ 
                  type: "error", 
                  error: "Account is disabled. Please contact support." 
                }));
                ws.close();
                return;
              }
              if (userCheck?.deletedAt) {
                console.error(`[Custom Voice] ❌ Account is deleted: ${authenticatedUserId}`);
                ws.send(JSON.stringify({ 
                  type: "error", 
                  error: "Account has been deleted." 
                }));
                ws.close();
                return;
              }
              
              // SECURITY: Use authenticated userId from session, not client message
              if (!message.sessionId) {
                console.error(`[Custom Voice] ❌ Missing sessionId`);
                ws.send(JSON.stringify({ 
                  type: "error", 
                  error: "Missing sessionId" 
                }));
                ws.close();
                return;
              }

              // SECURITY: Verify client's userId matches authenticated userId (consistency check only)
              if (message.userId && message.userId !== authenticatedUserId) {
                console.warn(`[Custom Voice] ⚠️ Client userId mismatch (ignoring client value)`, {
                  clientUserId: message.userId,
                  authenticatedUserId: authenticatedUserId
                });
              }

              // SECURITY: Validate session exists and belongs to authenticated user
              try {
                const session = await db.select()
                  .from(realtimeSessions)
                  .where(eq(realtimeSessions.id, message.sessionId))
                  .limit(1);

                if (session.length === 0) {
                  console.error(`[Custom Voice] ❌ Session not found: ${message.sessionId}`);
                  ws.send(JSON.stringify({ 
                    type: "error", 
                    error: "Session not found. Please refresh and try again." 
                  }));
                  ws.close();
                  return;
                }

                // SECURITY: Verify session belongs to authenticated user
                if (session[0].userId !== authenticatedUserId) {
                  console.error(`[Custom Voice] ❌ Session ${message.sessionId} does not belong to authenticated user`, {
                    sessionUserId: session[0].userId,
                    authenticatedUserId: authenticatedUserId
                  });
                  ws.send(JSON.stringify({ 
                    type: "error", 
                    error: "Unauthorized session access" 
                  }));
                  ws.close();
                  return;
                }

                console.log(`[Custom Voice] ✅ Session validated for authenticated user ${authenticatedUserId}`);
                
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                // 🛡️ CHECK FOR ACTIVE SUSPENSIONS
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                
                // SECURITY: Check suspension using authenticated userId
                const suspension = await db.select()
                  .from(userSuspensions)
                  .where(and(
                    eq(userSuspensions.userId, authenticatedUserId),
                    eq(userSuspensions.isActive, true),
                    or(
                      eq(userSuspensions.isPermanent, true),
                      gte(userSuspensions.suspendedUntil, new Date())
                    )
                  ))
                  .limit(1);
                
                if (suspension.length > 0) {
                  const susp = suspension[0];
                  console.log("[Custom Voice] ⛔ User is suspended");
                  
                  const suspMessage = susp.isPermanent
                    ? `Your account has been permanently suspended due to violations of our terms of service. Reason: ${susp.reason}. Please contact support.`
                    : `Your account is temporarily suspended until ${susp.suspendedUntil ? new Date(susp.suspendedUntil).toLocaleString() : 'further notice'}. Reason: ${susp.reason}`;
                  
                  ws.send(JSON.stringify({
                    type: "error",
                    error: suspMessage
                  }));
                  
                  ws.close();
                  return;
                }
                
                console.log("[Custom Voice] ✅ No active suspensions found");
              } catch (error) {
                console.error("[Custom Voice] ❌ Session validation error:", error);
                ws.send(JSON.stringify({ 
                  type: "error", 
                  error: "Session validation failed" 
                }));
                ws.close();
                return;
              }
            }
            
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // COMMON PATH - Both trial and paid users continue here
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            
            // Set session state (trial users already have these set above)
            if (!isTrialSession) {
              // SECURITY: Session state already has authenticated userId from upgrade
              state.sessionId = message.sessionId;
              // state.userId is already set to authenticatedUserId during state initialization
              state.studentName = message.studentName || "Student";
              state.ageGroup = message.ageGroup || "College/Adult";
              state.subject = message.subject || "General"; // SESSION: Store tutoring subject
              state.practiceMode = message.practiceMode || false; // SESSION: Practice drill mode
              state.language = message.language || "en"; // LANGUAGE: Store selected language
              state.uploadedDocCount = typeof message.uploadedDocCount === 'number' ? message.uploadedDocCount : 0;
              
              // PRE-WARM: Fire-and-forget TTS connection warm-up so greeting first sentence is fast
              prewarmTTS(state.ageGroup).catch(() => {});
              
              // STUDENT ISOLATION: Set studentId from init message
              // Also fall back to the session record's studentId for safety
              if (message.studentId) {
                state.studentId = message.studentId;
              } else {
                // Fallback: read studentId from the validated session record
                try {
                  const sessionRecord = await db.select({ studentId: realtimeSessions.studentId })
                    .from(realtimeSessions)
                    .where(eq(realtimeSessions.id, message.sessionId))
                    .limit(1);
                  if (sessionRecord[0]?.studentId) {
                    state.studentId = sessionRecord[0].studentId;
                  }
                } catch (e) {
                  console.warn('[Custom Voice] ⚠️ Could not read studentId from session record:', e);
                }
              }
              console.log(`[CONTINUITY] studentId resolved: studentId=${state.studentId || 'none'} userId=${state.userId} source=${message.studentId ? 'init_message' : 'session_record'}`);
              
              // CRITICAL FIX (Nov 14, 2025): Log userId after initialization to verify authentication
              console.log(`[Custom Voice] 🔐 Session state initialized:`, {
                sessionId: state.sessionId,
                userId: state.userId,
                authenticatedUserId: authenticatedUserId,
                hasUserId: !!state.userId,
                userIdType: typeof state.userId,
                studentName: state.studentName,
                studentId: state.studentId || 'none',
                ageGroup: state.ageGroup,
                language: state.language
              });
              
              // Fetch user's speech speed preference from database using authenticated userId
              try {
                const user = await storage.getUser(authenticatedUserId);
                if (user && user.speechSpeed) {
                  state.speechSpeed = typeof user.speechSpeed === 'string' ? parseFloat(user.speechSpeed) : user.speechSpeed;
                  console.log(`[Custom Voice] ⚙️ User's speech speed preference: ${state.speechSpeed}`);
                } else {
                  state.speechSpeed = 1.0; // Default (normal speed)
                  console.log(`[Custom Voice] ⚙️ Using default speech speed: 1.0`);
                }
                
                // SAFETY: Populate parentEmail for safety incident notifications
                if (user && user.email) {
                  state.parentEmail = user.email;
                  console.log(`[Custom Voice] 🛡️ Parent email set for safety alerts: ${user.email.substring(0, 3)}***`);
                }
              } catch (error) {
                console.error("[Custom Voice] ⚠️ Error fetching user settings, using default speech speed:", error);
                state.speechSpeed = 1.0;
              }
            }
            
            // Get full tutor personality based on age group
            const personality = getTutorPersonality(state.ageGroup);
            console.log(`[Custom Voice] 🎭 Using personality: ${personality.name} for ${state.ageGroup}`);
            
            // Load document chunks and format as content strings (skip for trial users)
            if (!isTrialSession) {
              // Check if documents are provided (either as IDs or as content strings)
              const messageDocuments = message.documents || [];
              
              try {
                // Check if documents are already provided as content strings from frontend
                if (messageDocuments.length > 0 && typeof messageDocuments[0] === 'string' && messageDocuments[0].startsWith('[Document:')) {
                  // Frontend has already loaded and sent document content
                  console.log(`[Custom Voice] 📚 Received ${messageDocuments.length} pre-loaded documents from frontend`);
                  state.uploadedDocuments = messageDocuments;
                  const totalChars = messageDocuments.join('').length;
                  console.log(`[Custom Voice] 📄 Document context ready: ${messageDocuments.length} documents, total length: ${totalChars} chars`);
                } 
                // Otherwise, treat them as document IDs to load from database
                else {
                  let documentIds = messageDocuments as string[];
                  let fallbackUsed = false;
                  
                  // FALLBACK: If no docs selected and fallback enabled, use all user's ready docs
                  if (documentIds.length === 0 && DOCS_FALLBACK_TO_ALL_IF_NONE_ACTIVE) {
                    const userDocs = await storage.getUserDocuments(authenticatedUserId);
                    documentIds = userDocs
                      .filter(doc => doc.processingStatus === 'ready')
                      .map(doc => doc.id);
                    fallbackUsed = true;
                    console.log(`[Custom Voice] 📄 Fallback: no docs selected, using all ${documentIds.length} ready docs`);
                  }
                  
                  // Log preLLM docs selection for voice session
                  logRagRetrievalDocsSelected({
                    sessionId: state.sessionId,
                    userId: authenticatedUserId,
                    activeDocCount: documentIds.length,
                    docIds: documentIds,
                    reason: fallbackUsed ? 'fallback_all_docs' : 'active_docs_only',
                    fallbackUsed,
                  });
                  
                  if (documentIds.length === 0) {
                    console.log(`[Custom Voice] ℹ️ No documents available - proceeding without documents`);
                    state.uploadedDocuments = [];
                  } else if (documentIds.length > 0) {
                    console.log(`[Custom Voice] 📄 Loading ${documentIds.length} documents from database...`);
                    const { chunks, documents } = await storage.getDocumentContext(authenticatedUserId, documentIds);
                    console.log(`[Custom Voice] ✅ Loaded ${chunks.length} chunks from ${documents.length} documents`);
                    
                    // Format chunks as content strings grouped by document
                    // IMPORTANT: Use [Document: filename] format to match regex in ai-service.ts
                    const documentContents: string[] = [];
                    for (const doc of documents) {
                      const docChunks = chunks
                        .filter(c => c.documentId === doc.id)
                        .sort((a, b) => a.chunkIndex - b.chunkIndex); // Ensure correct chunk order
                      if (docChunks.length > 0) {
                        const filename = doc.originalName || doc.title || 'unknown';
                        const content = `[Document: ${filename}]\n${docChunks.map(c => c.content).join('\n\n')}`;
                        documentContents.push(content);
                      }
                    }
                    
                    state.uploadedDocuments = documentContents;
                    console.log(`[Custom Voice] 📚 Document context prepared: ${documentContents.length} documents, total length: ${documentContents.join('').length} chars`);
                  }
                }
              } catch (error) {
                console.error('[Custom Voice] ❌ Error loading documents:', error);
                logRagError({
                  sessionId: state.sessionId,
                  userId: authenticatedUserId,
                  error: error instanceof Error ? error.message : String(error),
                  stage: 'document_load',
                });
                state.uploadedDocuments = [];
              }
            } else {
              // Trial users don't have documents
              state.uploadedDocuments = [];
              console.log(`[Custom Voice] 🎫 Trial session - no documents to load`);
            }
            
            // VOICE CONVERSATION CONSTRAINTS (Dec 10, 2025 FIX)
            // Prevents verbose responses and multiple questions per turn
            const VOICE_CONVERSATION_CONSTRAINTS = `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎤 VOICE CONVERSATION RULES (CRITICAL - ENFORCE STRICTLY):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This is a VOICE conversation. Keep responses SHORT and NATURAL.

RESPONSE LENGTH:
✅ Maximum 2-3 short sentences per response
✅ Keep sentences under 15 words each
❌ NEVER give long paragraphs or explanations

QUESTIONS:
✅ Ask only ONE question per response
✅ Wait for the student to answer before asking another
❌ NEVER ask multiple questions like "What do you think? And also, can you..."
❌ NEVER list multiple options like "You could try A, or B, or C..."

FORMAT:
✅ Speak naturally like a real tutor in person
❌ NO bullet points, numbered lists, or formatting
❌ NO emojis (they can't be spoken)
❌ NO "Here's a hint..." followed by another question

FLOW:
✅ One thought → One question → Wait for answer
✅ If student answers, acknowledge briefly then ask ONE follow-up
❌ NEVER say "And here's another question..." or "Also try..."

❌ BAD EXAMPLE (too long, multiple questions):
"Yes! Great job! A is first! Now, what sound does the letter A make? Try saying it out loud for me! And here's a fun question - can you think of any words that start with the A sound? Like... what do you call a red fruit that grows on trees?"

✅ GOOD EXAMPLE (short, single question):
"Yes! A is first! Great job! Can you think of a word that starts with A?"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

            // VISUAL AID SYSTEM: Claude can optionally trigger on-screen visuals
            const VISUAL_SYSTEM_INSTRUCTION = `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 VISUAL AID SYSTEM (USE WHEN HELPFUL):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You can display an on-screen visual to the student by including a tag in your response.
The tag will be REMOVED before your response is spoken — the student only sees the diagram.

AVAILABLE VISUALS (use exact tag name):

MATH — EARLY (K-5):
  [VISUAL: math_counting_1_20]              — Counting numbers 1–20 with word names
  [VISUAL: math_simple_addition_table]      — Addition table 0–5
  [VISUAL: math_simple_subtraction_table]   — Subtraction table 0–5
  [VISUAL: math_multiplication_table]       — Times table 1–6
  [VISUAL: math_fractions]                  — Fraction bars (halves, quarters, eighths)
  [VISUAL: math_place_value]                — Place value chart
  [VISUAL: math_number_line]                — Number line (negative to positive)
  [VISUAL: math_shapes_basic]               — Basic 2D shapes

MATH — INTERMEDIATE / ADVANCED:
  [VISUAL: math_area_model]                 — Distributive property / expanding brackets
  [VISUAL: math_order_of_operations]        — PEMDAS order of operations
  [VISUAL: math_percent_diagram]            — Part / Percent / Whole relationships
  [VISUAL: math_algebra_balance]            — Balance scale for solving equations
  [VISUAL: math_coordinate_plane]           — X/Y coordinate plane with quadrants
  [VISUAL: math_geometry_shapes]            — Triangle, rectangle, circle, trapezoid formulas
  [VISUAL: math_advanced_formulas]          — Quadratic formula, trig ratios, exponent rules
  [VISUAL: math_trig_unit_circle]           — Unit circle Q1 with sin/cos values
  [VISUAL: math_statistics_chart]           — Mean, median, mode, range, standard deviation

MATH — FORMULA REFERENCE IMAGES:
  [VISUAL: math_order_of_operations_visual] — PEMDAS step-by-step with worked example
  [VISUAL: math_quadratic_formula]          — Quadratic formula with discriminant and worked example
  [VISUAL: math_area_formulas]              — Area formulas for rectangle, triangle, circle, trapezoid, parallelogram, square
  [VISUAL: math_volume_formulas]            — Volume formulas for cube, prism, cylinder, sphere, cone
  [VISUAL: math_trig_sohcahtoa]             — SOH-CAH-TOA right triangle reference
  [VISUAL: math_exponent_rules]             — Product, quotient, power, zero, negative exponent rules
  [VISUAL: math_log_rules]                  — Product, quotient, power rules for logarithms
  [VISUAL: math_distance_midpoint]          — Distance and midpoint formulas with coordinate graph
  [VISUAL: math_fraction_operations]        — Adding, subtracting, multiplying, dividing fractions
  [VISUAL: math_mean_median_mode]           — Mean, median, mode, and range with examples
  [VISUAL: math_inequality_symbols]         — Less than, greater than, ≤, ≥, ≠ with number lines
  [VISUAL: math_coordinate_plane_quadrants] — Four quadrants (I, II, III, IV) with sign rules
  [VISUAL: math_slope_intercept_form]       — y = mx + b with labeled graph showing slope and intercept
  [VISUAL: math_systems_of_equations]       — Solving systems graphically (intersection point)
  [VISUAL: math_polynomial_operations]      — FOIL method for multiplying polynomials

MATH — ADDITIONAL VISUALS:
  [VISUAL: math_3d_shapes]                  — 3D geometric shapes (cube, sphere, cylinder, cone, pyramid)
  [VISUAL: math_angles_types]               — Types of angles (acute, right, obtuse, straight, reflex)
  [VISUAL: math_circle_parts]               — Parts of a circle (radius, diameter, chord, tangent, arc, sector)
  [VISUAL: math_derivative_tangent]         — Derivatives and tangent lines visual
  [VISUAL: math_exponential_vs_linear]      — Comparing linear vs exponential growth curves
  [VISUAL: math_fractions_pizza]            — Learning fractions with pizza slices
  [VISUAL: math_integral_area]              — Integrals and area under the curve
  [VISUAL: math_matrix_operations]          — Matrix addition, multiplication, determinant
  [VISUAL: math_money_coins]                — US coins (penny, nickel, dime, quarter)
  [VISUAL: math_normal_distribution]        — Bell curve / empirical rule (68-95-99.7%)
  [VISUAL: math_pythagorean_theorem]        — Pythagorean theorem with visual proof
  [VISUAL: math_quadratic_graph]            — Parabola properties (vertex, roots, axis of symmetry)
  [VISUAL: math_slope_types]                — Four types of slopes (positive, negative, zero, undefined)
  [VISUAL: math_telling_time]               — Clock face for learning to tell time
  [VISUAL: math_vector_addition]            — Vector addition diagram

MATH — CALCULUS & COLLEGE:
  [VISUAL: math_calculus_derivatives]       — Derivative rules (power, product, chain, trig, ln)
  [VISUAL: math_calculus_integrals]         — Common integral formulas + C
  [VISUAL: math_limits]                     — Limit definition, L'Hôpital's, key limit rules
  [VISUAL: math_linear_algebra]             — Matrix multiply, determinant, eigenvalues, dot product
  [VISUAL: math_probability_stats]          — Probability rules, mean, std dev, z-score, combinations
  [VISUAL: math_logarithms]                 — Log rules: product, quotient, power, change of base

WRITING / ELA:
  [VISUAL: writing_paragraph_structure]     — Topic sentence, details, conclusion
  [VISUAL: writing_essay_outline]           — Intro, body paragraphs, conclusion
  [VISUAL: writing_story_elements]          — Characters, setting, conflict, plot, resolution
  [VISUAL: writing_figurative_language]     — Simile, metaphor, personification, hyperbole, alliteration

GRAMMAR / READING:
  [VISUAL: grammar_sentence_parts]          — Subject, predicate, object
  [VISUAL: grammar_parts_of_speech]         — All 8 parts of speech with examples
  [VISUAL: reading_main_idea]               — Main idea and supporting details map
  [VISUAL: reading_compare_contrast]        — Venn diagram for comparing two things
  [VISUAL: reading_cause_effect]            — Cause → Effect chains
  [VISUAL: reading_text_structure]          — Description, sequence, compare/contrast, problem/solution

ENGLISH — COLLEGE LEVEL:
  [VISUAL: english_thesis_development]      — Weak vs strong thesis, thesis formula
  [VISUAL: english_argument_structure]      — Claim, evidence, warrant, counterargument, rebuttal
  [VISUAL: english_research_paper_structure]— Abstract, intro, lit review, methods, results, discussion
  [VISUAL: english_citation_formats]        — APA 7th and MLA 9th citation formats
  [VISUAL: english_college_grammar]         — Comma splice, run-ons, dangling modifiers, active/passive
  [VISUAL: english_rhetorical_devices]      — Ethos, pathos, logos, anaphora, chiasmus, antithesis
  [VISUAL: english_literary_analysis]       — Theme, motif, symbol, tone, mood, POV, foil, irony
  [VISUAL: english_critical_reading]        — Annotating, fact vs opinion, evaluating evidence, fallacies
  [VISUAL: english_parts_of_speech_advanced]— Gerunds, infinitives, participles, appositives, conjunctions
  [VISUAL: english_logical_fallacies]       — Ad hominem, straw man, false dichotomy, slippery slope

LANGUAGE — ALPHABETS & SYSTEMS:
  [VISUAL: lang_alphabet_english]           — English alphabet (26 letters, vowels highlighted)
  [VISUAL: lang_alphabet_spanish]           — Spanish alphabet (27 letters, Ñ and accents)
  [VISUAL: lang_alphabet_french]            — French alphabet + accented characters
  [VISUAL: lang_alphabet_japanese]          — Japanese Hiragana (25 characters with romaji)
  [VISUAL: lang_alphabet_chinese]           — Chinese common characters (15 hanzi with pinyin)
  [VISUAL: lang_german_alphabet]            — German alphabet + Umlauts (Ä, Ö, Ü, ß)
  [VISUAL: lang_korean_hangul]              — Korean Hangul consonants and vowels
  [VISUAL: lang_arabic_alphabet]            — Arabic alphabet (28 letters, right-to-left)
  [VISUAL: lang_russian_cyrillic]           — Russian Cyrillic alphabet (33 letters)
  [VISUAL: lang_japanese_katakana]          — Japanese Katakana (foreign loan words)
  [VISUAL: lang_spanish_verb_conjugation]   — Spanish present tense: hablar, ser, estar, tener
  [VISUAL: lang_french_verb_conjugation]    — French present tense: parler, être, avoir, aller
  [VISUAL: lang_chinese_tones]              — Mandarin 4 tones with marks, descriptions, examples

SCIENCE:
  [VISUAL: science_cell_diagram]            — Plant vs Animal cell parts comparison
  [VISUAL: science_water_cycle]             — Evaporation, condensation, precipitation
  [VISUAL: science_food_chain]              — Producer → consumer → apex predator
  [VISUAL: science_scientific_method]       — 5-step scientific method
  [VISUAL: science_states_of_matter]        — Solid, liquid, gas properties
  [VISUAL: science_human_body_systems]      — 6 major body systems
  [VISUAL: science_solar_system]            — All 8 planets with key facts
  [VISUAL: periodic_table_simplified]       — Common chemical elements
  [VISUAL: science_atomic_structure]        — Proton, neutron, electron; atomic number vs mass number
  [VISUAL: science_chemical_bonding]        — Ionic, covalent, polar covalent, metallic, hydrogen bonds
  [VISUAL: science_dna_genetics]            — DNA base pairing, mitosis vs meiosis
  [VISUAL: science_punnett_square]          — Punnett square example (Tt × Tt), phenotype ratios
  [VISUAL: science_brain_regions]           — Brain regions (color-coded lobes and cerebellum)
  [VISUAL: science_ear_anatomy]             — Ear cross-section (outer, middle, inner ear)
  [VISUAL: science_eye_anatomy]             — Eye cross-section (cornea, lens, retina, optic nerve)
  [VISUAL: science_heart_diagram]           — Heart 4 chambers with blood flow arrows
  [VISUAL: science_human_muscles]           — Muscular system anterior and posterior views
  [VISUAL: science_human_skeleton]          — Full labeled human skeleton
  [VISUAL: science_animal_cell]             — Animal cell diagram
  [VISUAL: science_plant_cell]              — Plant cell diagram
  [VISUAL: science_cloud_types]             — Cloud types at different altitudes
  [VISUAL: science_layers_of_earth]         — Earth layers (crust, mantle, outer/inner core)
  [VISUAL: science_moon_phases]             — All 8 moon phases
  [VISUAL: science_photosynthesis]          — Photosynthesis process diagram
  [VISUAL: science_rock_cycle]              — Rock cycle (igneous, sedimentary, metamorphic)
  [VISUAL: science_tides_diagram]           — Lunar gravity and ocean tides
  [VISUAL: science_volcano_cross_section]   — Volcano cross-section
  [VISUAL: science_water_cycle_illustrated] — Water cycle landscape illustration
  [VISUAL: science_weather_map_symbols]     — Weather map symbols
  [VISUAL: science_electromagnetic_wave]    — Electromagnetic wave oscillation

PHYSICS:
  [VISUAL: physics_newtons_laws]            — Newton's 3 laws with formulas
  [VISUAL: physics_electromagnetic_spectrum]— Radio → Gamma ray spectrum with uses
  [VISUAL: physics_formulas]                — Motion, force, energy, waves, electricity, gravity
  [VISUAL: physics_thermodynamics]          — Laws of thermodynamics + temperature conversions
  [VISUAL: physics_forces_diagram]          — Free body diagram (normal, gravity, friction, applied)
  [VISUAL: physics_wave_types]              — Transverse vs longitudinal waves
  [VISUAL: physics_doppler_effect]          — Doppler effect with ambulance
  [VISUAL: physics_projectile_motion]       — Projectile motion parabola
  [VISUAL: physics_pendulum_energy]         — Energy transformation in a pendulum
  [VISUAL: physics_optics_lenses]           — Convex and concave lens ray diagrams
  [VISUAL: physics_circuit_symbols]         — Electrical circuit symbol reference
  [VISUAL: physics_electricity_flow]        — Simple circuit (battery, bulb, switch)

HISTORY / SOCIAL STUDIES:
  [VISUAL: history_timeline]                — Chronological event timeline
  [VISUAL: history_cause_effect_chain]      — Historical cause → impact chain
  [VISUAL: history_three_branches]          — Legislative, Executive, Judicial branches
  [VISUAL: history_map_compass]             — Cardinal directions and map skills
  [VISUAL: history_ancient_civilizations_map] — Ancient civilizations map
  [VISUAL: history_us_expansion_map]        — US expansion map
  [VISUAL: history_cold_war_map]            — Cold War map
  [VISUAL: history_world_wars_map]          — World Wars alliances map
  [VISUAL: history_civil_rights_timeline]   — Civil rights timeline
  [VISUAL: history_amendments_visual]       — Constitutional amendments visual
  [VISUAL: history_immigration_waves]       — Immigration waves
  [VISUAL: history_industrial_revolution]   — Industrial Revolution
  [VISUAL: history_colonialism_map]         — Colonialism map
  [VISUAL: history_greek_roman_comparison]  — Greek and Roman comparison

GEOGRAPHY — MAPS:
  [VISUAL: geography_continents]            — All 7 continents with key facts
  [VISUAL: geography_usa_map]               — US regions and all 50 states by region
  [VISUAL: geography_world_map]             — World regions and key countries per continent
  [VISUAL: geography_europe_map]            — European countries and capitals
  [VISUAL: geography_lat_long]              — Latitude/longitude, equator, prime meridian
  [VISUAL: geography_biomes_world]          — World biomes map
  [VISUAL: geography_rivers_major]          — Major world rivers
  [VISUAL: geography_tectonic_plates]       — Tectonic plates map
  [VISUAL: geography_ocean_currents]        — Ocean currents
  [VISUAL: geography_time_zones]            — World time zones
  [VISUAL: geography_us_regions]            — US regions
  [VISUAL: geography_landforms]             — Types of landforms
  [VISUAL: geography_population_density]    — Population density map
  [VISUAL: geography_country_capitals]      — Country capitals reference

CHEMISTRY:
  [VISUAL: chemistry_ph_scale]              — pH scale (acids and bases)
  [VISUAL: chemistry_types_of_bonds]        — Types of chemical bonds
  [VISUAL: chemistry_molecular_shapes]      — VSEPR molecular geometry
  [VISUAL: chemistry_organic_functional_groups] — Organic functional groups
  [VISUAL: chemistry_periodic_trends]       — Periodic table trends

ECONOMICS:
  [VISUAL: economics_supply_demand]         — Supply & demand with equilibrium
  [VISUAL: economics_gdp]                   — GDP formula (C+I+G+NX), nominal vs real, business cycle
  [VISUAL: economics_market_structures]     — Perfect competition → monopoly comparison
  [VISUAL: economics_fiscal_monetary]       — Fiscal vs monetary policy tools
  [VISUAL: economics_comparative_advantage] — Comparative advantage table and trade gains
  [VISUAL: economics_circular_flow]         — Circular flow of economy
  [VISUAL: economics_banking_system]        — Banking system diagram
  [VISUAL: economics_stock_market_basics]   — Stock market basics
  [VISUAL: economics_trade_balance]         — Trade balance
  [VISUAL: economics_business_cycle]        — Business cycle phases
  [VISUAL: economics_inflation_deflation]   — Inflation and deflation
  [VISUAL: economics_taxes_types]           — Types of taxes (progressive, regressive, proportional)

POLITICAL SCIENCE / GOVERNMENT:
  [VISUAL: polisci_constitution]            — 7 Articles of the U.S. Constitution
  [VISUAL: polisci_bill_of_rights]          — Amendments 1–10 with descriptions
  [VISUAL: polisci_world_governments]       — Democracy, monarchy, theocracy, authoritarian, etc.

SPACE / ASTRONOMY:
  [VISUAL: space_sun_diagram]               — Sun cross-section (core to corona)
  [VISUAL: space_mars_surface]              — Mars surface features
  [VISUAL: space_moon_surface]              — Moon surface with labeled features
  [VISUAL: space_earth_detailed]            — Earth with atmosphere layers
  [VISUAL: space_planet_sizes]              — All 8 planets to scale
  [VISUAL: space_solar_system_distances]    — Planets with AU distances
  [VISUAL: space_asteroid_belt]             — Solar system orbital view with asteroid belt
  [VISUAL: space_jupiter_saturn]            — Jupiter and Saturn comparison
  [VISUAL: space_galaxy_types]              — Galaxy types (spiral, elliptical, irregular)

LANGUAGE — ADDITIONAL:
  [VISUAL: lang_spanish_common_phrases]     — Common Spanish phrases
  [VISUAL: lang_japanese_common_phrases]    — Common Japanese phrases
  [VISUAL: lang_japanese_hiragana_chart]    — Hiragana chart
  [VISUAL: lang_chinese_radicals]           — Chinese radicals
  [VISUAL: lang_german_cases]               — German grammatical cases
  [VISUAL: lang_ipa_chart]                  — IPA phonetic chart

READING / WRITING — ADDITIONAL:
  [VISUAL: reading_story_mountain]          — Story mountain (narrative arc)
  [VISUAL: reading_genres_bookshelf]        — Reading genres bookshelf
  [VISUAL: writing_persuasive_structure]    — Persuasive writing structure
  [VISUAL: writing_types_comparison]        — Types of writing comparison

STUDY SKILLS:
  [VISUAL: study_skills_kwl]                — Know / Want to know / Learned chart
  [VISUAL: study_skills_concept_map]        — Main concept → subtopics → details
  [VISUAL: study_skills_cornell_notes]      — Cornell notes format (cue, notes, summary)
  [VISUAL: study_blooms_taxonomy]           — Bloom's 6 levels with action verbs
  [VISUAL: study_time_management]           — Pomodoro, time blocking, Eisenhower matrix
  [VISUAL: study_pomodoro_technique]        — Pomodoro technique timer visual
  [VISUAL: study_growth_mindset]            — Growth mindset diagram
  [VISUAL: study_note_taking_methods]       — Note-taking methods comparison
  [VISUAL: study_essay_writing_process]     — Essay writing process steps
  [VISUAL: study_test_taking_strategies]    — Test-taking strategies

RULES:
✅ Place the tag at the START of a sentence: "[VISUAL: math_calculus_derivatives] Here are the key derivative rules."
✅ Use when a diagram genuinely helps — especially for new concepts, comparisons, or processes
✅ Only use ONE visual per response
❌ Never mention the tag or the visual system to the student — just let it appear
❌ Never invent tag names — only use the exact tags listed above
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
            // STT_ARTIFACT_HARDENING is defined at module level (see top of file)
            
            // K2 TURN POLICY: Add response constraints for K-2 students
            const gradeBandForPolicy = state.ageGroup as GradeBand;
            const k2PolicyActive = gradeBandForPolicy === 'K-2' && isK2PolicyEnabled(state.turnPolicyK2Override);
            const K2_CONSTRAINTS = k2PolicyActive ? `\n\n${getK2ResponseConstraints()}` : '';
            
            if (k2PolicyActive) {
              console.log(`[TurnPolicy] 🎯 K2 policy ACTIVE for grade band: ${state.ageGroup}`);
            }
            
            // SPECIALIZATION: Inject test-prep or professional-cert coaching context
            const SPECIALIZATION_BLOCK = getSpecializationPromptBlock(state.subject);
            if (SPECIALIZATION_BLOCK) {
              console.log(`[Specialization] 🎯 ${state.subject} → injecting exam-specific coaching prompt (${SPECIALIZATION_BLOCK.length} chars)`);
            }
            
            // PRACTICE MODE: Inject structured drill session prompt when enabled
            const PRACTICE_MODE_BLOCK = state.practiceMode ? getPracticeModePromptBlock(state.subject) : '';
            if (PRACTICE_MODE_BLOCK) {
              console.log(`[PracticeMode] 🏋️ ${state.subject} → practice drill mode ACTIVE (${PRACTICE_MODE_BLOCK.length} chars)`);
            }
            
            // CONTINUITY MEMORY: Load recent session summaries for this student
            let continuityBlock = '';
            try {
              const { getRecentSessionSummaries, formatContinuityPromptSection } = await import('../services/memory-service');
              const summaries = await getRecentSessionSummaries({
                userId: state.userId,
                studentId: state.studentId || null,
                limit: 5
              });
              
              if (summaries.length > 0) {
                continuityBlock = formatContinuityPromptSection(summaries);
                console.log(`[MEMORY] 📚 Injected ${summaries.length} summaries into prompt (${continuityBlock.length} chars)`);
              } else {
                console.log(`[MEMORY] ℹ️ No previous session summaries found for user ${state.userId}`);
              }
            } catch (memoryError) {
              console.warn('[MEMORY] ⚠️ Failed to load continuity memory (non-blocking):', memoryError);
              // Continue without memory - non-blocking
            }
            
            // LSIS: Inject longitudinal student knowledge profile
            let lsisProfileBlock = '';
            try {
              const { getProfileForSystemPrompt } = await import('../services/lsis-service');
              if (state.studentId) {
                const profileSection = await getProfileForSystemPrompt(state.studentId);
                if (profileSection) {
                  lsisProfileBlock = profileSection;
                  console.log(`[LSIS] 🧠 Injected student knowledge profile (${lsisProfileBlock.length} chars)`);
                } else {
                  console.log(`[LSIS] ℹ️ No knowledge profile yet for student ${state.studentId}`);
                }
              }
            } catch (lsisError) {
              console.warn('[LSIS] ⚠️ Profile injection failed (non-blocking):', lsisError);
            }
            
            // Build system instruction with personality and document context
            // NO-GHOSTING FIX: Calculate actual content length before claiming doc access
            const ragChars = state.uploadedDocuments.reduce((sum, doc) => {
              // Extract content after [Document: filename] header
              const content = doc.replace(/^\[Document: [^\]]+\]\n/, '');
              return sum + content.length;
            }, 0);
            const hasActualDocContent = ragChars > 0;
            
            console.log(`[Custom Voice] 📄 Document content check: ragChars=${ragChars}, hasContent=${hasActualDocContent}, docCount=${state.uploadedDocuments.length}`);
            
            if (hasActualDocContent) {
              // Extract document titles for the enhanced prompt
              const docTitles = state.uploadedDocuments.map((doc, i) => {
                const titleMatch = doc.match(/^\[Document: ([^\]]+)\]/);
                return titleMatch ? titleMatch[1] : `Document ${i + 1}`;
              });
              
              // Create enhanced system instruction - NO-GHOSTING: Only claim access when content exists
              state.systemInstruction = `${personality.systemPrompt}${VOICE_CONVERSATION_CONSTRAINTS}${VISUAL_SYSTEM_INSTRUCTION}${K2_CONSTRAINTS}${SPECIALIZATION_BLOCK}${PRACTICE_MODE_BLOCK}${continuityBlock}${lsisProfileBlock}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📚 DOCUMENTS LOADED FOR THIS SESSION (${ragChars} chars):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Document content is available: ${docTitles.join(', ')}

DOCUMENT ACCESS INSTRUCTIONS:
✅ You have actual document content loaded - reference it directly
✅ Help with the specific homework/problems in their uploaded materials
✅ Quote or paraphrase specific text from the documents when relevant
✅ If asked about unique markers or specific text, read from the actual content

PROOF REQUIREMENT:
When the student asks if you can see their document or asks you to prove access:
- You MUST quote or paraphrase a specific line, sentence, or phrase from the document
- If there's a unique marker (like "ALGEBRA-BLUEBERRY-DELTA"), find and state it exactly
- NEVER make up or guess content - only reference what is actually in the loaded text

DOCUMENT ACKNOWLEDGMENT RULE:
- Documents were already acknowledged in your opening greeting. Do NOT list or re-announce document names again.
- When the student asks about their documents, reference the content directly — never recite a list of filenames.
- Focus on helping with the material, not on describing what files are loaded.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${STT_ARTIFACT_HARDENING}`;
              
              console.log(`[Custom Voice] 📚 System instruction enhanced with ${state.uploadedDocuments.length} documents (${ragChars} chars)`);
            } else if (state.uploadedDocuments && state.uploadedDocuments.length > 0) {
              // NO-GHOSTING: Files were uploaded but content extraction failed or is empty
              // Be HONEST about this - acknowledge upload but not content
              const uploadedFilenames = state.uploadedDocuments.map((doc, i) => {
                const titleMatch = doc.match(/^\[Document: ([^\]]+)\]/);
                return titleMatch ? titleMatch[1] : `file ${i + 1}`;
              });
              
              state.systemInstruction = `${personality.systemPrompt}${VOICE_CONVERSATION_CONSTRAINTS}${VISUAL_SYSTEM_INSTRUCTION}${K2_CONSTRAINTS}${SPECIALIZATION_BLOCK}${PRACTICE_MODE_BLOCK}${continuityBlock}${lsisProfileBlock}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ DOCUMENT UPLOAD ISSUE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Files were uploaded (${uploadedFilenames.join(', ')}) but content was NOT successfully extracted.

HONESTY INSTRUCTIONS:
❌ Do NOT claim you can see or read the document content
❌ Do NOT make up or guess what might be in the document
✅ Be honest: "I can see a file was uploaded, but I wasn't able to load its content"
✅ Suggest: "Could you try pasting the text directly, or re-uploading the file?"
✅ Continue tutoring normally without referencing document content
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${STT_ARTIFACT_HARDENING}`;
              
              console.log(`[Custom Voice] ⚠️ Files uploaded but no content extracted (ragChars=0, files=${uploadedFilenames.join(', ')}) - using honest acknowledgment`);
            } else {
              // No documents at all - use standard prompt
              state.systemInstruction = personality.systemPrompt + VOICE_CONVERSATION_CONSTRAINTS + VISUAL_SYSTEM_INSTRUCTION + K2_CONSTRAINTS + SPECIALIZATION_BLOCK + PRACTICE_MODE_BLOCK + continuityBlock + lsisProfileBlock + STT_ARTIFACT_HARDENING;
              console.log(`[Custom Voice] No documents uploaded - using standard prompt`);
            }
            
            // Family Academic Context injection (non-blocking)
            try {
              if (state.userId && state.studentId) {
                const { getFamilyAcademicContextForVoice } = await import('./family-academic');
                const familyContext = await getFamilyAcademicContextForVoice(state.userId, state.studentId);
                if (familyContext) {
                  state.systemInstruction += familyContext;
                  console.log(`[Family Academic] Injected voice context for child ${state.studentId} (${familyContext.length} chars)`);
                }
              }
            } catch (familyErr) {
              console.warn('[Family Academic] Voice context injection failed (non-blocking):', familyErr);
            }

            // Generate enhanced personalized greeting with LANGUAGE SUPPORT
            let greeting: string = '';
            
            // FIRST-TURN-ONLY GUARANTEE: Check if we should skip greeting entirely
            // 1) hasGreeted flag (in-memory) prevents duplicate greetings on reconnect within same session
            // 2) Check if tutor already has messages in transcript (backup for state rehydration)
            const tutorAlreadySpoke = state.transcript.some(t => t.speaker === 'tutor');
            const shouldSkipGreeting = state.hasGreeted || tutorAlreadySpoke;
            
            if (shouldSkipGreeting) {
              console.log(`[MEMORY_GREETING] sessionId=${state.sessionId}, SKIPPED (hasGreeted=${state.hasGreeted}, tutorAlreadySpoke=${tutorAlreadySpoke})`);
            }
            
            // Extract document titles from Active documents only (checkbox-checked)
            // NO-GHOSTING: Use hasActualDocContent calculated above
            // CAP: Show at most 3 filenames in greeting to avoid rambling
            const greetingDocTitles: string[] = [];
            if (!shouldSkipGreeting && hasActualDocContent && state.uploadedDocuments && state.uploadedDocuments.length > 0) {
              state.uploadedDocuments.forEach((doc) => {
                const titleMatch = doc.match(/^\[Document: ([^\]]+)\]/);
                if (titleMatch && greetingDocTitles.length < 3) {
                  greetingDocTitles.push(titleMatch[1]);
                }
              });
            }
            // Count of Active docs vs total uploaded (Active + Inactive)
            const activeDocCount = greetingDocTitles.length;
            const inactiveDocCount = Math.max(0, state.uploadedDocCount - (state.uploadedDocuments?.length || 0));
            
            // ============================================
            // CONTINUITY GREETING: Check for prior sessions
            // ============================================
            // Helper: Pick safe topic from summary (NEVER uses summary_text)
            const pickContinuationTopic = (summary: { subject?: string | null; topicsCovered?: string[] | null }): { topic: string; lastTopic: string; multiTopic: boolean; reason: 'subject' | 'topic' | 'fallback' } => {
              const FALLBACK = 'what we worked on last time';
              const sanitize = (raw: string) => raw
                .replace(/[\n\r"'`]/g, '')
                .replace(/\[[^\]]*\]/g, '')
                .replace(/\b(name|email|phone|address|password|ssn|credit|card)\b/gi, '')
                .trim()
                .substring(0, 60);

              // Try topicsCovered FIRST — these are the actual topics from the last session
              if (summary.topicsCovered && summary.topicsCovered.length > 0) {
                const validTopics = summary.topicsCovered
                  .map(t => sanitize(t))
                  .filter(t => t.length >= 3);

                if (validTopics.length === 1) {
                  return { topic: validTopics[0], lastTopic: validTopics[0], multiTopic: false, reason: 'topic' };
                }

                if (validTopics.length >= 2) {
                  // For 4+ topics, take only the last 3
                  const useTopics = validTopics.length > 3 ? validTopics.slice(-3) : validTopics;
                  const prefix = validTopics.length > 3 ? 'among other things, ' : '';
                  const last = useTopics[useTopics.length - 1];

                  let topicStr: string;
                  if (useTopics.length === 2) {
                    topicStr = `${prefix}${useTopics[0]}, and then ${useTopics[1]}`;
                  } else {
                    // 3 topics
                    topicStr = `${prefix}${useTopics[0]}, then ${useTopics[1]}, and ended with ${useTopics[2]}`;
                  }
                  return { topic: topicStr, lastTopic: last, multiTopic: true, reason: 'topic' };
                }
              }

              // Fall back to subject only if it's specific (not generic like "General")
              if (summary.subject && summary.subject.length > 0) {
                const subjectLower = summary.subject.toLowerCase();
                if (subjectLower !== 'general' && subjectLower !== 'unknown') {
                  const topic = sanitize(summary.subject);
                  if (topic.length >= 3) {
                    return { topic, lastTopic: topic, multiTopic: false, reason: 'subject' };
                  }
                }
              }

              return { topic: FALLBACK, lastTopic: FALLBACK, multiTopic: false, reason: 'fallback' };
            };
            
            let continuityTopic: string | null = null;
            let continuityLastTopic: string | null = null;
            let continuityMultiTopic = false;
            let hasPriorSessions = false;
            let topicReason: 'subject' | 'topic' | 'fallback' | 'none' = 'none';

            // FIRST-TURN-ONLY: Skip greeting lookup if already greeted (reconnect protection)
            if (!shouldSkipGreeting) {
              try {
                // STRICT STUDENT ISOLATION: Only get summaries for the exact student
                const priorSummaries = await getRecentSessionSummaries({
                  userId: state.userId,
                  studentId: state.studentId || null,
                  limit: 1
                });

                hasPriorSessions = priorSummaries.length > 0;

                if (hasPriorSessions) {
                  const result = pickContinuationTopic(priorSummaries[0]);
                  continuityTopic = result.topic;
                  continuityLastTopic = result.lastTopic;
                  continuityMultiTopic = result.multiTopic;
                  topicReason = result.reason;
                }
                
                console.log(`[MEMORY_GREETING] sessionId=${state.sessionId}, studentId=${state.studentId ? 'true' : 'false'}, priorExists=${hasPriorSessions}, chosenTopic="${continuityTopic || 'none'}", reason=${topicReason}`);
              } catch (error) {
                // On any error, use default greeting (no continuity)
                console.warn(`[MEMORY_GREETING] sessionId=${state.sessionId}, ERROR - using default greeting:`, error);
                hasPriorSessions = false;
                continuityTopic = null;
                topicReason = 'none';
              }
            }
            
            // LANGUAGE: Generate greetings in the selected language
            const getLocalizedGreeting = (lang: string, name: string, tutorName: string, ageGroup: string, docTitles: string[], priorExists: boolean, topic: string | null, lastTopic: string | null = null, multiTopic: boolean = false): string => {
              // Language-specific greeting templates
              const greetings: Record<string, { intro: string; docAck: (count: number, titles: string) => string; closing: Record<string, string> }> = {
                en: {
                  intro: `Hi ${name}! I'm ${tutorName}, your tutor.`,
                  docAck: (count, titles) => count === 1 ? ` I can see you've uploaded "${titles}" - excellent!` : ` I've loaded ${count} documents for our session.`,
                  closing: {
                    'K-2': docTitles.length > 0 ? " Let's look at it together! What do you want to learn about?" : " I'm so excited to learn with you today! What would you like to explore?",
                    '3-5': docTitles.length > 0 ? " I'm here to help you understand it! What part should we start with?" : " I'm here to help you learn something new! What subject interests you today?",
                    '6-8': docTitles.length > 0 ? " I'm ready to help you master this material! What would you like to work on?" : " I'm here to help you succeed! What subject would you like to focus on today?",
                    '9-12': docTitles.length > 0 ? " Let's dive into this material together. What concepts would you like to explore?" : " I'm here to help you excel! What topic would you like to work on today?",
                    'College/Adult': docTitles.length > 0 ? " I'm ready to help you analyze this material. What aspects would you like to focus on?" : " I'm here to support your learning goals. What subject can I help you with today?",
                  }
                },
                fr: {
                  intro: `Bonjour ${name}! Je suis ${tutorName}, ton tuteur.`,
                  docAck: (count, titles) => count === 1 ? ` Je vois que tu as téléchargé "${titles}" - excellent!` : ` J'ai chargé ${count} documents pour notre session. Super!`,
                  closing: {
                    'K-2': docTitles.length > 0 ? " Regardons ça ensemble! Qu'est-ce que tu veux apprendre?" : " Je suis tellement content d'apprendre avec toi! Qu'est-ce qui t'intéresse?",
                    '3-5': docTitles.length > 0 ? " Je suis là pour t'aider à comprendre! Par quoi veux-tu commencer?" : " Je suis là pour t'aider à apprendre! Quel sujet t'intéresse?",
                    '6-8': docTitles.length > 0 ? " Je suis prêt à t'aider à maîtriser ce contenu! Sur quoi veux-tu travailler?" : " Je suis là pour t'aider à réussir! Sur quel sujet veux-tu travailler?",
                    '9-12': docTitles.length > 0 ? " Explorons ce contenu ensemble. Quels concepts voudrais-tu approfondir?" : " Je suis là pour t'aider à exceller! Sur quel sujet voudrais-tu travailler?",
                    'College/Adult': docTitles.length > 0 ? " Je suis prêt à t'aider à analyser ce contenu. Quels aspects voudrais-tu approfondir?" : " Je suis là pour soutenir tes objectifs d'apprentissage. Comment puis-je t'aider?",
                  }
                },
                es: {
                  intro: `¡Hola ${name}! Soy ${tutorName}, tu tutor.`,
                  docAck: (count, titles) => count === 1 ? ` Veo que has subido "${titles}" - ¡excelente!` : ` He cargado ${count} documentos para nuestra sesión. ¡Genial!`,
                  closing: {
                    'K-2': docTitles.length > 0 ? " ¡Veámoslo juntos! ¿Qué quieres aprender?" : " ¡Estoy muy emocionado de aprender contigo! ¿Qué te gustaría explorar?",
                    '3-5': docTitles.length > 0 ? " ¡Estoy aquí para ayudarte a entender! ¿Por dónde empezamos?" : " ¡Estoy aquí para ayudarte a aprender! ¿Qué tema te interesa?",
                    '6-8': docTitles.length > 0 ? " ¡Estoy listo para ayudarte a dominar este material! ¿En qué quieres trabajar?" : " ¡Estoy aquí para ayudarte a tener éxito! ¿En qué tema quieres enfocarte?",
                    '9-12': docTitles.length > 0 ? " Exploremos este material juntos. ¿Qué conceptos te gustaría profundizar?" : " ¡Estoy aquí para ayudarte a sobresalir! ¿En qué tema quieres trabajar?",
                    'College/Adult': docTitles.length > 0 ? " Estoy listo para ayudarte a analizar este material. ¿Qué aspectos te gustaría explorar?" : " Estoy aquí para apoyar tus metas de aprendizaje. ¿Cómo puedo ayudarte?",
                  }
                },
                sw: {
                  intro: `Habari ${name}! Mimi ni ${tutorName}, mwalimu wako.`,
                  docAck: (count, titles) => count === 1 ? ` Naona umepakia "${titles}" - bora!` : ` Nimepakia nyaraka ${count} kwa kipindi chetu. Vizuri!`,
                  closing: {
                    'K-2': docTitles.length > 0 ? " Tuangalie pamoja! Unataka kujifunza nini?" : " Ninafuraha sana kujifunza nawe! Unataka kuchunguza nini?",
                    '3-5': docTitles.length > 0 ? " Niko hapa kukusaidia kuelewa! Tuanze wapi?" : " Niko hapa kukusaidia kujifunza! Somo gani linakuvutia?",
                    '6-8': docTitles.length > 0 ? " Niko tayari kukusaidia kuelewa maudhui haya! Unataka kufanyia kazi nini?" : " Niko hapa kukusaidia kufanikiwa! Unataka kuzingatia somo gani?",
                    '9-12': docTitles.length > 0 ? " Tuchunguze maudhui haya pamoja. Dhana gani ungependa kuelewa zaidi?" : " Niko hapa kukusaidia kufanya vizuri! Unataka kufanyia kazi mada gani?",
                    'College/Adult': docTitles.length > 0 ? " Niko tayari kukusaidia kuchambua maudhui haya. Ungependa kuzingatia vipengele gani?" : " Niko hapa kusaidia malengo yako ya kujifunza. Naweza kukusaidia vipi?",
                  }
                },
                yo: {
                  intro: `Bawo ni ${name}! Mo je ${tutorName}, olukọni rẹ.`,
                  docAck: (count, titles) => count === 1 ? ` Mo ri pe o ti fi "${titles}" soke - o dara!` : ` Mo ri pe o ti fi iwe ${count} soke: ${titles}. O dara pupo!`,
                  closing: {
                    'K-2': docTitles.length > 0 ? " Jẹ ki a wo papọ! Kini o fẹ lati kọ?" : " Mo dun pupọ lati kọ pẹlu rẹ! Kini o fẹ lati ṣawari?",
                    '3-5': docTitles.length > 0 ? " Mo wa nibi lati ran ọ lọwọ lati loye! Nibo ni a yoo bẹrẹ?" : " Mo wa nibi lati ran ọ lọwọ lati kọ! Koko-ọrọ wo ni o nifẹ si?",
                    '6-8': docTitles.length > 0 ? " Mo ti setan lati ran ọ lọwọ pẹlu ohun elo yii! Kini o fẹ lati ṣiṣẹ lori?" : " Mo wa nibi lati ran ọ lọwọ lati ṣaṣeyọri! Koko-ọrọ wo ni o fẹ dojukọ?",
                    '9-12': docTitles.length > 0 ? " Jẹ ki a ṣawari ohun elo yii papọ. Awọn ero wo ni o fẹ jinlẹ?" : " Mo wa nibi lati ran ọ lọwọ lati tayọ! Koko-ọrọ wo ni o fẹ lati ṣiṣẹ lori?",
                    'College/Adult': docTitles.length > 0 ? " Mo ti setan lati ran ọ lọwọ lati ṣe itupalẹ ohun elo yii. Awọn abala wo ni o fẹ ṣawari?" : " Mo wa nibi lati ṣe atilẹyin awọn ibi-afẹde ẹkọ rẹ. Bawo ni mo ṣe le ran ọ lọwọ?",
                  }
                },
                ha: {
                  intro: `Sannu ${name}! Ni ne ${tutorName}, malamin naka.`,
                  docAck: (count, titles) => count === 1 ? ` Na ga cewa ka loda "${titles}" - kyau!` : ` Na ga cewa ka loda takardun ${count}: ${titles}. Da kyau!`,
                  closing: {
                    'K-2': docTitles.length > 0 ? " Bari mu duba tare! Mene ne kake so ka koya?" : " Ina farin ciki sosai in koya tare da kai! Mene ne kake so ka bincika?",
                    '3-5': docTitles.length > 0 ? " Ina nan don in taimake ka ka fahimta! Ina za mu fara?" : " Ina nan don in taimake ka ka koya! Wane batu ya sha'awar ka?",
                    '6-8': docTitles.length > 0 ? " Na shirya in taimake ka da wannan aiki! Mene ne kake so ka yi aiki a kai?" : " Ina nan don in taimake ka ka yi nasara! Wane batu kake so ka mayar da hankali a kai?",
                    '9-12': docTitles.length > 0 ? " Bari mu bincika wannan aiki tare. Wane ra'ayoyi kake so ka fahimta sosai?" : " Ina nan don in taimake ka ka yi fice! Wane batu kake so ka yi aiki a kai?",
                    'College/Adult': docTitles.length > 0 ? " Na shirya in taimake ka ka nazari wannan aiki. Wane fannoni kake so ka bincika?" : " Ina nan don in goyi bayan burin ilimi naka. Ta yaya zan taimake ka?",
                  }
                },
                ar: {
                  intro: `مرحباً ${name}! أنا ${tutorName}، معلمك.`,
                  docAck: (count, titles) => count === 1 ? ` أرى أنك رفعت "${titles}" - ممتاز!` : ` أرى أنك رفعت ${count} مستندات: ${titles}. رائع!`,
                  closing: {
                    'K-2': docTitles.length > 0 ? " لنلقي نظرة معاً! ماذا تريد أن تتعلم؟" : " أنا متحمس جداً للتعلم معك! ماذا تريد أن تستكشف؟",
                    '3-5': docTitles.length > 0 ? " أنا هنا لمساعدتك على الفهم! من أين نبدأ؟" : " أنا هنا لمساعدتك على التعلم! أي موضوع يثير اهتمامك؟",
                    '6-8': docTitles.length > 0 ? " أنا مستعد لمساعدتك في إتقان هذا المحتوى! ما الذي تريد العمل عليه؟" : " أنا هنا لمساعدتك على النجاح! أي موضوع تريد التركيز عليه؟",
                    '9-12': docTitles.length > 0 ? " لنستكشف هذا المحتوى معاً. أي مفاهيم تريد التعمق فيها؟" : " أنا هنا لمساعدتك على التفوق! أي موضوع تريد العمل عليه؟",
                    'College/Adult': docTitles.length > 0 ? " أنا مستعد لمساعدتك في تحليل هذا المحتوى. أي جوانب تريد استكشافها؟" : " أنا هنا لدعم أهدافك التعليمية. كيف يمكنني مساعدتك؟",
                  }
                },
                de: {
                  intro: `Hallo ${name}! Ich bin ${tutorName}, dein Tutor.`,
                  docAck: (count, titles) => count === 1 ? ` Ich sehe, dass du "${titles}" hochgeladen hast - ausgezeichnet!` : ` Ich sehe, dass du ${count} Dokumente hochgeladen hast: ${titles}. Toll!`,
                  closing: {
                    'K-2': docTitles.length > 0 ? " Lass uns das zusammen ansehen! Was möchtest du lernen?" : " Ich freue mich so, mit dir zu lernen! Was möchtest du erkunden?",
                    '3-5': docTitles.length > 0 ? " Ich bin hier, um dir zu helfen es zu verstehen! Womit fangen wir an?" : " Ich bin hier, um dir beim Lernen zu helfen! Welches Thema interessiert dich?",
                    '6-8': docTitles.length > 0 ? " Ich bin bereit, dir bei diesem Material zu helfen! Woran möchtest du arbeiten?" : " Ich bin hier, um dir zum Erfolg zu helfen! Auf welches Thema möchtest du dich konzentrieren?",
                    '9-12': docTitles.length > 0 ? " Lass uns dieses Material zusammen erkunden. Welche Konzepte möchtest du vertiefen?" : " Ich bin hier, um dir zu helfen, dich auszuzeichnen! An welchem Thema möchtest du arbeiten?",
                    'College/Adult': docTitles.length > 0 ? " Ich bin bereit, dir bei der Analyse dieses Materials zu helfen. Welche Aspekte möchtest du erkunden?" : " Ich bin hier, um deine Lernziele zu unterstützen. Wie kann ich dir helfen?",
                  }
                },
                pt: {
                  intro: `Olá ${name}! Sou ${tutorName}, seu tutor.`,
                  docAck: (count, titles) => count === 1 ? ` Vejo que você enviou "${titles}" - excelente!` : ` Vejo que você enviou ${count} documentos: ${titles}. Ótimo!`,
                  closing: {
                    'K-2': docTitles.length > 0 ? " Vamos olhar juntos! O que você quer aprender?" : " Estou muito animado para aprender com você! O que você gostaria de explorar?",
                    '3-5': docTitles.length > 0 ? " Estou aqui para ajudá-lo a entender! Por onde começamos?" : " Estou aqui para ajudá-lo a aprender! Qual assunto te interessa?",
                    '6-8': docTitles.length > 0 ? " Estou pronto para ajudá-lo a dominar este material! Em que você quer trabalhar?" : " Estou aqui para ajudá-lo a ter sucesso! Em qual assunto você quer focar?",
                    '9-12': docTitles.length > 0 ? " Vamos explorar este material juntos. Quais conceitos você gostaria de aprofundar?" : " Estou aqui para ajudá-lo a se destacar! Em qual tema você quer trabalhar?",
                    'College/Adult': docTitles.length > 0 ? " Estou pronto para ajudá-lo a analisar este material. Quais aspectos você gostaria de explorar?" : " Estou aqui para apoiar seus objetivos de aprendizagem. Como posso ajudá-lo?",
                  }
                },
                zh: {
                  intro: `你好${name}！我是${tutorName}，你的导师。`,
                  docAck: (count, titles) => count === 1 ? `我看到你上传了"${titles}" - 太棒了！` : `我看到你上传了${count}个文档：${titles}。很好！`,
                  closing: {
                    'K-2': docTitles.length > 0 ? "我们一起看看吧！你想学什么？" : "我很高兴能和你一起学习！你想探索什么？",
                    '3-5': docTitles.length > 0 ? "我在这里帮助你理解！我们从哪里开始？" : "我在这里帮助你学习！你对哪个科目感兴趣？",
                    '6-8': docTitles.length > 0 ? "我准备好帮助你掌握这些内容了！你想做什么？" : "我在这里帮助你成功！你想专注于哪个科目？",
                    '9-12': docTitles.length > 0 ? "让我们一起探索这些内容。你想深入了解哪些概念？" : "我在这里帮助你出类拔萃！你想学习什么主题？",
                    'College/Adult': docTitles.length > 0 ? "我准备好帮助你分析这些内容了。你想探索哪些方面？" : "我在这里支持你的学习目标。我能怎么帮助你？",
                  }
                },
                ja: {
                  intro: `こんにちは${name}さん！私は${tutorName}、あなたのチューターです。`,
                  docAck: (count, titles) => count === 1 ? `「${titles}」をアップロードしたのが見えます - 素晴らしい！` : `${count}つのドキュメントをアップロードしたのが見えます：${titles}。いいですね！`,
                  closing: {
                    'K-2': docTitles.length > 0 ? "一緒に見てみましょう！何を学びたいですか？" : "一緒に学べてとても嬉しいです！何を探求したいですか？",
                    '3-5': docTitles.length > 0 ? "理解するのをお手伝いします！どこから始めましょうか？" : "学習のお手伝いをします！どの科目に興味がありますか？",
                    '6-8': docTitles.length > 0 ? "この教材をマスターするお手伝いをする準備ができています！何に取り組みたいですか？" : "成功するお手伝いをします！どの科目に集中したいですか？",
                    '9-12': docTitles.length > 0 ? "一緒にこの教材を探求しましょう。どの概念を深めたいですか？" : "優秀になるお手伝いをします！どのトピックに取り組みたいですか？",
                    'College/Adult': docTitles.length > 0 ? "この教材の分析をお手伝いする準備ができています。どの側面を探求したいですか？" : "あなたの学習目標をサポートします。どのようにお手伝いできますか？",
                  }
                },
                ko: {
                  intro: `안녕하세요 ${name}님! 저는 ${tutorName}, 당신의 튜터입니다.`,
                  docAck: (count, titles) => count === 1 ? `"${titles}"를 업로드하신 것을 보았습니다 - 훌륭합니다!` : `${count}개의 문서를 업로드하신 것을 보았습니다: ${titles}. 좋아요!`,
                  closing: {
                    'K-2': docTitles.length > 0 ? " 함께 살펴봐요! 무엇을 배우고 싶어요?" : " 함께 배우게 되어 너무 기뻐요! 무엇을 탐험하고 싶어요?",
                    '3-5': docTitles.length > 0 ? " 이해하는 것을 도와드릴게요! 어디서 시작할까요?" : " 배우는 것을 도와드릴게요! 어떤 과목에 관심 있어요?",
                    '6-8': docTitles.length > 0 ? " 이 자료를 마스터하는 것을 도와드릴 준비가 됐어요! 무엇을 공부하고 싶어요?" : " 성공할 수 있도록 도와드릴게요! 어떤 과목에 집중하고 싶어요?",
                    '9-12': docTitles.length > 0 ? " 함께 이 자료를 탐구해봐요. 어떤 개념을 깊이 이해하고 싶어요?" : " 뛰어나게 되도록 도와드릴게요! 어떤 주제를 공부하고 싶어요?",
                    'College/Adult': docTitles.length > 0 ? " 이 자료를 분석하는 것을 도와드릴 준비가 됐습니다. 어떤 측면을 탐구하고 싶으세요?" : " 학습 목표를 지원해드릴게요. 어떻게 도와드릴까요?",
                  }
                },
              };
              
              // Fallback to English if language not found
              const langGreeting = greetings[lang] || greetings['en'];
              const ageClosing = langGreeting.closing[ageGroup] || langGreeting.closing['College/Adult'];
              
              // GREETING PRIORITY ORDER:
              // (1) Active docs > (2) Continuity > (3) Generic
              
              // (1) ACTIVE DOCS GREETING: If active documents are selected, always acknowledge them first
              if (docTitles.length > 0) {
                if (docTitles.length <= 3) {
                  return langGreeting.intro + langGreeting.docAck(docTitles.length, docTitles.join(', ')) + ageClosing;
                } else {
                  // 4+ active docs: don't list filenames
                  const manyDocsAck: Record<string, string> = {
                    en: ` You have multiple Active documents selected for this session.`,
                    es: ` Tienes múltiples documentos activos seleccionados para esta sesión.`,
                    fr: ` Tu as plusieurs documents actifs sélectionnés pour cette session.`,
                    de: ` Du hast mehrere aktive Dokumente für diese Sitzung ausgewählt.`,
                    pt: ` Você tem vários documentos ativos selecionados para esta sessão.`,
                    zh: `你为本次课程选择了多个活跃文档。`,
                    ar: ` لديك عدة مستندات نشطة محددة لهذه الجلسة.`,
                    sw: ` Una nyaraka nyingi zinazotumika zilizochaguliwa kwa kipindi hiki.`,
                  };
                  return langGreeting.intro + (manyDocsAck[lang] || manyDocsAck['en']) + ageClosing;
                }
              }
              
              // (2) CONTINUITY GREETING: If prior sessions exist and no active docs, use welcome back greeting
              if (priorExists && topic) {
                if (multiTopic && lastTopic) {
                  // Multi-topic greeting: "Last time we covered X, then Y, and ended with Z. Want to pick up where we left off with Z, or start something new?"
                  const multiGreetings: Record<string, (n: string, t: string, tp: string, lt: string) => string> = {
                    en: (n, t, tp, lt) => `Welcome back, ${n}! I'm ${t}, your tutor. Last time we covered ${tp}. Want to pick up where we left off with ${lt}, or start something new?`,
                    es: (n, t, tp, lt) => `¡Bienvenido de nuevo, ${n}! Soy ${t}, tu tutor. La última vez cubrimos ${tp}. ¿Quieres continuar con ${lt} o empezar algo nuevo?`,
                    fr: (n, t, tp, lt) => `Content de te revoir, ${n}! Je suis ${t}, ton tuteur. La dernière fois, on a couvert ${tp}. Tu veux reprendre avec ${lt} ou commencer quelque chose de nouveau?`,
                    de: (n, t, tp, lt) => `Willkommen zurück, ${n}! Ich bin ${t}, dein Tutor. Letztes Mal haben wir ${tp} behandelt. Möchtest du mit ${lt} weitermachen oder etwas Neues anfangen?`,
                    pt: (n, t, tp, lt) => `Bem-vindo de volta, ${n}! Sou ${t}, seu tutor. Da última vez cobrimos ${tp}. Quer continuar com ${lt} ou começar algo novo?`,
                    zh: (n, t, tp, lt) => `欢迎回来，${n}！我是${t}，你的导师。上次我们学习了${tp}。想继续${lt}，还是开始新的话题？`,
                    ar: (n, t, tp, lt) => `أهلاً بعودتك، ${n}! أنا ${t}، معلمك. في المرة الماضية تناولنا ${tp}. هل تريد المتابعة مع ${lt} أم البدء بشيء جديد؟`,
                    sw: (n, t, tp, lt) => `Karibu tena, ${n}! Mimi ni ${t}, mwalimu wako. Mara ya mwisho tulisoma ${tp}. Unataka kuendelea na ${lt} au kuanza kitu kipya?`,
                  };
                  const multiFn = multiGreetings[lang] || multiGreetings['en'];
                  return multiFn(name, tutorName, topic, lastTopic);
                }
                // Single-topic greeting
                const continuityGreetings: Record<string, (name: string, tutorName: string, topic: string) => string> = {
                  en: (n, t, tp) => `Welcome back, ${n}! I'm ${t}, your tutor. Last time we were exploring ${tp}. Want to pick up where we left off, or start something new?`,
                  es: (n, t, tp) => `¡Bienvenido de nuevo, ${n}! Soy ${t}, tu tutor. La última vez estábamos explorando ${tp}. ¿Quieres continuar donde lo dejamos o empezar algo nuevo?`,
                  fr: (n, t, tp) => `Content de te revoir, ${n}! Je suis ${t}, ton tuteur. La dernière fois, on explorait ${tp}. Tu veux reprendre là où on s'est arrêtés ou commencer quelque chose de nouveau?`,
                  de: (n, t, tp) => `Willkommen zurück, ${n}! Ich bin ${t}, dein Tutor. Letztes Mal haben wir ${tp} erkundet. Möchtest du dort weitermachen oder etwas Neues anfangen?`,
                  pt: (n, t, tp) => `Bem-vindo de volta, ${n}! Sou ${t}, seu tutor. Da última vez estávamos explorando ${tp}. Quer continuar de onde paramos ou começar algo novo?`,
                  zh: (n, t, tp) => `欢迎回来，${n}！我是${t}，你的导师。上次我们在探索${tp}。想继续上次的内容，还是开始新的话题？`,
                  ar: (n, t, tp) => `أهلاً بعودتك، ${n}! أنا ${t}، معلمك. في المرة الماضية كنا نستكشف ${tp}. هل تريد المتابعة من حيث توقفنا أم البدء بشيء جديد؟`,
                  sw: (n, t, tp) => `Karibu tena, ${n}! Mimi ni ${t}, mwalimu wako. Mara ya mwisho tulikuwa tukichunguza ${tp}. Unataka kuendelea tulipoacha au kuanza kitu kipya?`,
                };
                const continuityFn = continuityGreetings[lang] || continuityGreetings['en'];
                return continuityFn(name, tutorName, topic);
              }
              
              // (3) GENERIC GREETING: No active docs and no continuity
              return langGreeting.intro + ageClosing;
            };
            
            // GREETING PRIORITY: (1) Active docs > (2) Continuity > (3) Generic
            // FIRST-TURN-ONLY: Only generate and add greeting if not already greeted
            if (!shouldSkipGreeting) {
              const greetingMode = greetingDocTitles.length > 0 ? 'ACTIVE_DOCS' : (hasPriorSessions && continuityTopic ? 'CONTINUITY' : 'GENERIC');
              console.log(`[GREETING_PRIORITY] mode=${greetingMode}, activeDocTitles=${greetingDocTitles.length}, hasPrior=${hasPriorSessions}, topic=${continuityTopic || 'none'}`);
              greeting = getLocalizedGreeting(state.language, state.studentName, personality.name, state.ageGroup, greetingDocTitles, hasPriorSessions, continuityTopic, continuityLastTopic, continuityMultiTopic);
              console.log(`[Custom Voice] 🌍 Generated greeting in language: ${state.language}`);
              
              console.log(`[Custom Voice] 👋 Greeting: "${greeting}"`);
              
              // Add greeting to conversation history
              state.conversationHistory.push({
                role: "assistant",
                content: greeting
              });
              
              // Add greeting to transcript
              const greetingEntry: TranscriptEntry = {
                speaker: "tutor",
                text: greeting,
                timestamp: new Date().toISOString(),
                messageId: crypto.randomUUID(),
              };
              state.transcript.push(greetingEntry);
              
              // FIRST-TURN-ONLY: Mark as greeted to prevent duplicate greetings on reconnect
              state.hasGreeted = true;
              // DOCS: Mark docs as acknowledged so tutor never re-lists them later
              if (greetingDocTitles.length > 0) {
                state.hasAcknowledgedDocs = true;
              }
            }

            // ============================================
            // STT PROVIDER INITIALIZATION (FEATURE FLAG)
            // ============================================
            const { getDeepgramLanguageCode } = await import("../services/deepgram-service");
            const deepgramLanguage = getDeepgramLanguageCode(state.language);
            
            // Shared transcript handler for both providers
            const handleCompleteUtterance = (transcript: string) => {
              // P0: Use shouldDropTranscript instead of raw char-length gate
              const dropCheck = shouldDropTranscript(transcript, state);
              if (dropCheck.drop) {
                console.log(`[GhostTurn] dropped reason=${dropCheck.reason} text="${(transcript || '').substring(0, 30)}" len=${(transcript || '').trim().length}`);
                return;
              }
              
              // Skip duplicates
              if (state.lastTranscript === transcript) {
                console.log("[STT] ⏭️ Duplicate transcript, skipping");
                return;
              }
              state.lastTranscript = transcript;
              
              // INACTIVITY: Reset activity timer
              state.lastActivityTime = Date.now();
              state.inactivityWarningSent = false;
              console.log('[Inactivity] 🎤 User activity detected, timer reset');
              
              // Accumulate and process
              pendingTranscript = (pendingTranscript + ' ' + transcript).trim();
              console.log(`[STT] 📝 Accumulated transcript: "${pendingTranscript}"`);
              
              if (transcriptAccumulationTimer) {
                clearTimeout(transcriptAccumulationTimer);
                transcriptAccumulationTimer = null;
              }
              
              if (responseTimer) {
                clearTimeout(responseTimer);
                responseTimer = null;
              }
              
              transcriptAccumulationTimer = setTimeout(() => {
                if (pendingTranscript && !state.isSessionEnded) {
                  const completeUtterance = pendingTranscript;
                  console.log(`[STT] ✅ Utterance complete: "${completeUtterance}"`);
                  pendingTranscript = '';
                  state.lastEndOfTurnTime = Date.now();
                  commitUserTurn(completeUtterance, 'eot');
                }
                transcriptAccumulationTimer = null;
              }, USE_ASSEMBLYAI ? 500 : UTTERANCE_COMPLETE_DELAY_MS); // AssemblyAI already handles timing
            };
            
            
            if (USE_ASSEMBLYAI) {
              // ============================================
              // ASSEMBLYAI UNIVERSAL-STREAMING
              // ============================================
              console.log('[VOICE] About to create STT connection. provider= AssemblyAI, lang=', state.language);
              console.log('[VOICE] Env has ASSEMBLYAI_API_KEY:', !!process.env.ASSEMBLYAI_API_KEY, 'len=', process.env.ASSEMBLYAI_API_KEY?.length);
              console.log('[VOICE] File+line marker: custom-voice-ws.ts BEFORE createAssemblyAIConnection');
              
              if (!process.env.ASSEMBLYAI_API_KEY) {
                console.error('[AssemblyAI] ❌ ASSEMBLYAI_API_KEY not found!');
                ws.send(JSON.stringify({ type: "error", error: "Voice service configuration error" }));
                ws.close();
                return;
              }
              
              console.log('[AssemblyAI] About to call createAssemblyAIConnection...');
              
              // K2 TURN POLICY: Helper to fire Claude with optional stall prompt
              // CRITICAL: Always preserve student transcript - stall prompt is appended, not replaced
              // fireClaudeWithPolicy: Routes directly to commitUserTurn, bypassing
              // handleCompleteUtterance's 500ms accumulation timer. By the time this fires,
              // AssemblyAI silence detection + continuation guard have already confirmed
              // the turn is complete — the extra 500ms was pure dead air.
              const fireClaudeWithPolicy = (transcript: string, stallPrompt?: string) => {
                if (state.isSessionEnded) {
                  console.log('[TurnPolicy] fireClaudeWithPolicy skipped - session already ended');
                  return;
                }

                // FRAGMENT GUARD: Single conjunction/filler words are likely mid-sentence
                // fragments caused by brief pauses. Don't commit — let continuation guard
                // or next EOT accumulate the full sentence.
                // LANGUAGE PRACTICE: Bypass for language sessions where "a", "i", etc. are valid.
                const isLanguageSession = isLanguagePracticeSession(state.subject);
                const FRAGMENT_WORDS = new Set(['and', 'but', 'so', 'because', 'like', 'or', 'well', 'the', 'a', 'to', 'i', 'it', 'if', 'then', 'also', 'just']);
                const fragmentCheck = transcript.trim().toLowerCase().replace(/[.,!?]/g, '');
                const fragmentWords = fragmentCheck.split(/\s+/).filter((w: string) => w.length > 0);
                if (!isLanguageSession && !stallPrompt && fragmentWords.length <= 2 && fragmentWords.every((w: string) => FRAGMENT_WORDS.has(w))) {
                  console.log(`[TurnPolicy] 🔇 Fragment guard: "${transcript.trim()}" (${fragmentWords.length} word${fragmentWords.length > 1 ? 's' : ''}) - deferring as likely mid-sentence`);
                  return;
                }
                if (isLanguageSession && fragmentWords.length <= 2 && fragmentWords.every((w: string) => FRAGMENT_WORDS.has(w))) {
                  console.log(`[LanguagePractice] ✅ Fragment guard bypassed for "${transcript.trim()}" in language session`);
                }
                // MINIMUM WORD GATE: Require at least 3 words before firing Claude.
                // Keyboard noise and brief mic bleed typically produce 1-2 word fragments.
                // Real utterances in tutoring sessions are almost always 3+ words.
                // Skip this gate for language practice (single words can be valid responses).
                // EXCEPTION: Valid short answers like "yes", "no", "gravity", "correct" etc.
                // should always pass — only drop filler noise and low-confidence fragments.
                if (!isLanguageSession && !stallPrompt && fragmentWords.length < 3) {
                  const lastConf = state.lastAccumulatedConfidence || 0;
                  
                  // Non-lexical filler sounds — always drop regardless of confidence
                  const isNonLexicalNoise = /^(um+|uh+|hmm+|hm+|er+|erm+|mhm+)$/i.test(fragmentCheck);
                  if (isNonLexicalNoise) {
                    console.log(`[TurnPolicy] 🔇 Min-word gate: "${transcript.trim()}" (non-lexical noise) — dropping`);
                    trackDroppedTurnForNoiseCoaching(ws, state);
                    return;
                  }
                  
                  // Common valid short answers — always pass through at any confidence
                  const VALID_SHORT_ANSWERS = new Set([
                    // Affirmations & negations
                    'yes', 'no', 'yeah', 'yep', 'yup', 'nah', 'nope',
                    'sure', 'ok', 'okay', 'correct', 'right', 'wrong',
                    'true', 'false', 'maybe', 'probably', 'definitely',
                    'absolutely', 'exactly', 'indeed', 'certainly',
                    // Frequency & quantity
                    'always', 'never', 'sometimes', 'both', 'neither',
                    'all', 'none', 'some', 'many', 'few', 'most',
                    'less', 'more', 'each', 'every', 'enough',
                    // Pronouns & determiners as answers
                    'nothing', 'everything', 'something', 'anything',
                    'everyone', 'nobody', 'somebody', 'anybody',
                    'here', 'there', 'this', 'that', 'those', 'these',
                    'me', 'him', 'her', 'them', 'us', 'it', 'mine',
                    // Question words (student repeating/confirming)
                    'what', 'who', 'why', 'how', 'when', 'where', 'which',
                    // Session control
                    'stop', 'wait', 'continue', 'repeat', 'again', 'next',
                    'help', 'skip', 'harder', 'easier', 'slower', 'faster',
                    'done', 'ready', 'start', 'finish', 'quit', 'back',
                    // Greetings & politeness
                    'hello', 'hi', 'hey', 'bye', 'goodbye', 'thanks',
                    'please', 'sorry', 'welcome',
                    // Reactions & feelings
                    'wow', 'cool', 'nice', 'great', 'awesome', 'perfect',
                    'good', 'bad', 'fine', 'amazing', 'interesting',
                    'confused', 'lost', 'stuck', 'unsure', 'understand',
                    // Academic responses
                    'agree', 'disagree', 'forgot', 'remember', 'know',
                    'think', 'guess', 'believe', 'depends', 'different',
                    'same', 'similar', 'opposite', 'equal', 'zero',
                    // Ordinals & comparisons
                    'first', 'second', 'third', 'last',
                    'bigger', 'smaller', 'higher', 'lower',
                    // Common single-word subject answers
                    'water', 'earth', 'sun', 'moon', 'gravity',
                    'energy', 'light', 'sound', 'heat', 'oxygen',
                    'north', 'south', 'east', 'west',
                    'addition', 'subtraction', 'multiplication', 'division',
                    // Numbers as words
                    'one', 'two', 'three', 'four', 'five',
                    'six', 'seven', 'eight', 'nine', 'ten',
                    'hundred', 'thousand', 'million', 'half', 'double',
                  ]);
                  const isValidShortAnswer = fragmentWords.length === 1 && VALID_SHORT_ANSWERS.has(fragmentWords[0]);
                  
                  if (isValidShortAnswer) {
                    console.log(`[TurnPolicy] ✅ Min-word gate BYPASSED: "${transcript.trim()}" — recognized short answer`);
                  } else if (lastConf >= 0.20 || (lastConf >= 0.20 && fragmentWords.length === 2)) {
                    // Any real word with any meaningful confidence passes (e.g. "gravity", "everything")
                    // AssemblyAI turn confidence for single words is typically 0.20-0.50
                    // Filler noise (um, uh, hmm) is already caught by the non-lexical filter above
                    console.log(`[TurnPolicy] ✅ Min-word gate BYPASSED: "${transcript.trim()}" (${fragmentWords.length} word${fragmentWords.length > 1 ? 's' : ''}, conf=${lastConf.toFixed(2)}) — high-confidence short answer`);
                  } else {
                    console.log(`[TurnPolicy] 🔇 Min-word gate: "${transcript.trim()}" (${fragmentWords.length} word${fragmentWords.length > 1 ? 's' : ''} < 3, conf=${lastConf.toFixed(2)}) — dropping as likely noise fragment`);
                    trackDroppedTurnForNoiseCoaching(ws, state);
                    return;
                  }
                }

                let finalText: string;
                if (stallPrompt && transcript.trim()) {
                  // Stall escape - send student's transcript PLUS gentle follow-up
                  const trimmedTranscript = transcript.trim();
                  const endsWithPunctuation = /[.!?]$/.test(trimmedTranscript);
                  const separator = endsWithPunctuation ? ' ' : '. ';
                  finalText = `${trimmedTranscript}${separator}(after pause) ${stallPrompt}`;
                  console.log('[TurnPolicy] 🆘 Stall escape triggered - preserving transcript with gentle prompt');
                  console.log(`[TurnPolicy] Original: "${transcript}", Combined: "${finalText}"`);
                } else if (stallPrompt) {
                  finalText = stallPrompt;
                  console.log('[TurnPolicy] 🆘 Stall escape with no transcript - using prompt only');
                } else {
                  finalText = transcript;
                }

                // Inline the essential bookkeeping from handleCompleteUtterance
                // (commitUserTurn already has its own shouldDropTranscript check)
                state.lastActivityTime = Date.now();
                state.inactivityWarningSent = false;
                state.lastEndOfTurnTime = Date.now();

                // Clear any pending accumulation timer (in case handleCompleteUtterance
                // was also triggered separately by a late partial)
                if (transcriptAccumulationTimer) {
                  clearTimeout(transcriptAccumulationTimer);
                  transcriptAccumulationTimer = null;
                }
                pendingTranscript = '';

                console.log(`[TurnPolicy] ⚡ Direct commit (bypassing 500ms timer): "${finalText.substring(0, 60)}"`);
                commitUserTurn(finalText, 'turn_policy');

                // Reset turn policy state after firing
                resetTurnPolicyState(state.turnPolicyState);
                // Clear any pending stall timer
                if (state.stallEscapeTimerId) {
                  clearTimeout(state.stallEscapeTimerId);
                  state.stallEscapeTimerId = null;
                }
              };
              
              // FIX 1B: STT recency-gated Claude firing
              // If STT activity occurred within 800ms, defer the Claude call
              // CRITICAL: Do NOT pass transcript through closure — read from state at fire time
              // to avoid stale-closure bug where early text ("i do") is committed instead of
              // the full accumulated transcript ("i do see a pattern but if i pause...")
              // TRANSCRIPT STABILITY CHECK: Don't fire if transcript changed within last 300ms —
              // this catches "show me the us by" committing before "itself" arrives.
              const TRANSCRIPT_STABILITY_MS = 300;
              let sttDeferTimerId: NodeJS.Timeout | undefined;
              const gatedFireClaude = (stallPrompt?: string) => {
                const sttAge = Date.now() - state.lastSttActivityAt;
                if (state.lastSttActivityAt > 0 && sttAge < STT_ACTIVITY_RECENCY_MS) {
                  const deferMs = STT_ACTIVITY_RECENCY_MS - sttAge + 100;
                  console.log(`[TurnPolicy] suppressed_due_to_recent_stt_activity ageMs=${sttAge} deferMs=${deferMs}`);
                  if (sttDeferTimerId) clearTimeout(sttDeferTimerId);
                  sttDeferTimerId = setTimeout(() => {
                    sttDeferTimerId = undefined;
                    const recheckAge = Date.now() - state.lastSttActivityAt;
                    if (recheckAge < STT_ACTIVITY_RECENCY_MS) {
                      console.log(`[TurnPolicy] still_active_after_defer recheckAgeMs=${recheckAge} - extending`);
                      gatedFireClaude(stallPrompt);
                    } else {
                      // Read LATEST transcript from state — not from closure
                      const freshTranscript = state.lastAccumulatedTranscript.trim();
                      if (!freshTranscript) {
                        console.log(`[TurnPolicy] gated_fire_skipped - no accumulated transcript`);
                        return;
                      }
                      // STABILITY CHECK: If transcript changed very recently, wait a bit more
                      const transcriptAge = Date.now() - state.lastAccumulatedTranscriptSetAt;
                      if (transcriptAge < TRANSCRIPT_STABILITY_MS) {
                        const stabilityWait = TRANSCRIPT_STABILITY_MS - transcriptAge + 50;
                        console.log(`[TurnPolicy] transcript_unstable - changed ${transcriptAge}ms ago, waiting ${stabilityWait}ms more`);
                        sttDeferTimerId = setTimeout(() => {
                          sttDeferTimerId = undefined;
                          const stableTranscript = state.lastAccumulatedTranscript.trim();
                          if (stableTranscript) {
                            console.log(`[TurnPolicy] gated_fire_using_fresh_transcript: "${stableTranscript.substring(0, 60)}"`);
                            fireClaudeWithPolicy(stableTranscript, stallPrompt);
                          }
                        }, stabilityWait);
                        return;
                      }
                      console.log(`[TurnPolicy] gated_fire_using_fresh_transcript: "${freshTranscript.substring(0, 60)}"`);
                      fireClaudeWithPolicy(freshTranscript, stallPrompt);
                    }
                  }, deferMs);
                  return;
                }
                // No defer needed — but still read from state for consistency
                const freshTranscript = state.lastAccumulatedTranscript.trim();
                if (!freshTranscript) {
                  console.log(`[TurnPolicy] gated_fire_skipped - no accumulated transcript`);
                  return;
                }
                // STABILITY CHECK: Even without STT recency gate, ensure transcript is stable
                const transcriptAge = Date.now() - state.lastAccumulatedTranscriptSetAt;
                if (state.lastAccumulatedTranscriptSetAt > 0 && transcriptAge < TRANSCRIPT_STABILITY_MS) {
                  const stabilityWait = TRANSCRIPT_STABILITY_MS - transcriptAge + 50;
                  console.log(`[TurnPolicy] transcript_unstable_direct - changed ${transcriptAge}ms ago, waiting ${stabilityWait}ms`);
                  sttDeferTimerId = setTimeout(() => {
                    sttDeferTimerId = undefined;
                    const stableTranscript = state.lastAccumulatedTranscript.trim();
                    if (stableTranscript) {
                      console.log(`[TurnPolicy] gated_fire_stable: "${stableTranscript.substring(0, 60)}"`);
                      fireClaudeWithPolicy(stableTranscript, stallPrompt);
                    }
                  }, stabilityWait);
                  return;
                }
                fireClaudeWithPolicy(freshTranscript, stallPrompt);
              };

              // K2 TURN POLICY: Start stall escape timer if hesitation detected
              const startStallEscapeTimer = (transcript: string, remainingMs?: number) => {
                const gradeBand = state.ageGroup as GradeBand;
                const config = getTurnPolicyConfig(gradeBand, state.turnPolicyK2Override);
                
                // Clear any existing timer
                if (state.stallEscapeTimerId) {
                  clearTimeout(state.stallEscapeTimerId);
                }
                
                // Store guarded transcript for use after potential reconnect
                state.guardedTranscript = transcript;
                
                // Use remaining time if specified (for reconnect scenarios), otherwise full duration
                const timerDuration = remainingMs !== undefined ? remainingMs : config.max_turn_silence_ms;
                
                // For reconnect scenarios, calculate what the original start time would have been
                // This ensures multi-reconnect scenarios maintain the correct elapsed time
                if (remainingMs !== undefined) {
                  // Reconnect: Calculate original start time from remaining time
                  // original_start = now - (max_duration - remaining)
                  state.stallTimerStartedAt = Date.now() - (config.max_turn_silence_ms - remainingMs);
                } else {
                  // Fresh timer: Use current time
                  state.stallTimerStartedAt = Date.now();
                }
                
                state.stallEscapeTimerId = setTimeout(() => {
                  const stallResult = checkStallEscape({
                    gradeBand,
                    sessionK2Override: state.turnPolicyK2Override,
                    policyState: state.turnPolicyState,
                    currentTimestamp: Date.now(),
                    hasAudioInput: false, // No audio received during timer
                  });
                  
                  if (stallResult) {
                    logTurnPolicyEvaluation(stallResult);
                    // Use state.guardedTranscript to ensure we have the correct transcript
                    // even if this timer fires after a reconnect
                    fireClaudeWithPolicy(state.guardedTranscript || transcript, stallResult.stall_prompt);
                  }
                  // Clear guarded transcript after firing
                  state.guardedTranscript = '';
                  state.stallTimerStartedAt = 0;
                }, timerDuration);
                
                console.log(`[TurnPolicy] ⏱️ Stall escape timer started: ${timerDuration}ms`);
              };
              
              // P0.1: Compute and cache URL-encoded keyterms (JSON string array) for this session
              const sessionKeyterms = getKeytermsForUrl({
                subject: state.subject,
                studentName: state.studentName,
              });
              state.sttKeytermsJson = sessionKeyterms;
              console.log(`[STT] Keyterms cached: ${sessionKeyterms ? 'yes' : 'none'} subject=${state.subject} disabled=${state.sttKeytermsDisabledForSession}`);

              const { ws: assemblyWs, state: assemblyState } = createAssemblyAIConnection(
                state.language,
                (text, endOfTurn, confidence) => {
                  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                  // NOISE ROBUSTNESS: Only process FinalTranscript with end_of_turn=true
                  // Partials are hypothesis-only - no actions taken
                  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                  console.log(`[AssemblyAI] 📝 Complete utterance (confidence: ${confidence.toFixed(2)}): "${text}"`);
                  
                  // Store confidence in SessionState so downstream min-word gate can read it
                  // (the confidence from createAssemblyAIConnection's internal AssemblyAIState
                  // is NOT the same object as this SessionState)
                  state.lastAccumulatedConfidence = confidence;
                  
                  // Update last audio received time for stall detection
                  state.lastAudioReceivedAt = Date.now();
                  
                  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                  // GHOST TURN PREVENTION: Validate transcript before processing
                  // Ignore empty, ultra-short, or non-lexical transcripts
                  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                  const transcriptValidation = validateTranscript(text, 1);
                  if (!transcriptValidation.isValid) {
                    logGhostTurnPrevention(state.sessionId || 'unknown', text, transcriptValidation);
                    console.log(`[GhostTurn] 🚫 Ignored transcript: "${text}" (${transcriptValidation.reason})`);
                    return; // Don't process ghost turns
                  }
                  
                  // Check if we're in post-utterance grace period for merging
                  const now = Date.now();
                  if (now < state.postUtteranceGraceUntil) {
                    console.log(`[GhostTurn] ⏳ In grace period - merging transcript`);
                    // Grace period allows merging - don't block, but log
                  }
                  
                  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                  // HARDENED BARGE-IN: Duck-then-interrupt with lexical validation
                  // 1. First duck audio volume (via 'duck' event)
                  // 2. Only fully interrupt if >= 3 words AND passes noise-floor
                  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                  const timeSinceLastAudio = now - state.lastAudioSentAt;
                  const noiseFloor = getNoiseFloor(state.noiseFloorState);
                  
                  // P2: Allow lexical barge-in during pre-roll (tutorAudioPlaying may be false)
                  if (state.phase === 'TUTOR_SPEAKING' && timeSinceLastAudio < 30000) {
                    const bargeInValidation = validateTranscriptForBargeIn(text);
                    
                    if (!bargeInValidation.isValid) {
                      if (!state.bargeInDucking) {
                        state.bargeInDucking = true;
                        state.bargeInDuckStartTime = now;
                        ws.send(JSON.stringify({ type: "duck", message: "Potential speech detected" }));
                        logBargeInDecision(
                          state.sessionId || 'unknown',
                          'duck',
                          state.lastMeasuredRms, noiseFloor,
                          bargeInValidation.wordCount,
                          text,
                          `too_short_${bargeInValidation.wordCount}_words`
                        );
                        console.log(`[BargeIn] 🔉 DUCK (not interrupt): "${text}" (${bargeInValidation.wordCount} words < 3)`);
                      }
                    } else {
                      if (state.phase !== 'TUTOR_SPEAKING') {
                        console.log(`[BargeIn] suppressed_late_lexical phase=${state.phase} genId=${state.playbackGenId}`);
                        state.bargeInDucking = false;
                      } else {
                        console.log(`[BargeIn] 🛑 INTERRUPT: "${text.substring(0, 30)}..." (${bargeInValidation.wordCount} words)`);
                        hardInterruptTutor(ws, state, 'lexical_validated');
                        logBargeInDecision(
                          state.sessionId || 'unknown',
                          'interrupt',
                          state.lastMeasuredRms, noiseFloor,
                          bargeInValidation.wordCount,
                          text,
                          'lexical_validated'
                        );
                      }
                    }
                  } else if (state.bargeInDucking && state.phase !== 'TUTOR_SPEAKING') {
                    state.bargeInDucking = false;
                    ws.send(JSON.stringify({ type: "unduck", message: "Tutor finished" }));
                  }
                  
                  if (state.isTutorSpeaking && timeSinceLastAudio >= 30000) {
                    state.isTutorSpeaking = false;
                    state.isTutorThinking = false;
                    state.bargeInDucking = false;
                  }
                  
                  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                  // CONTINUATION GUARD: Two-phase commit for user turns
                  // Treats end_of_turn as candidate, waits for grace window
                  // before committing to Claude (prevents split-thought double responses)
                  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                  if (CONTINUATION_GUARD_CONFIG.ENABLED) {
                    if (state.continuationTimerId) {
                      clearTimeout(state.continuationTimerId);
                      state.continuationTimerId = undefined;
                      const mergedText = (state.continuationPendingText + ' ' + text).trim();
                      state.continuationPendingText = mergedText;
                      state.continuationSegmentCount++;
                      console.log(JSON.stringify({
                        event: 'continuation_guard_reset',
                        session_id: state.sessionId || 'unknown',
                        merged_text_preview: mergedText.substring(0, 60),
                        segment_count: state.continuationSegmentCount,
                        timestamp: new Date().toISOString(),
                      }));
                    } else {
                      state.continuationPendingText = text;
                      state.continuationCandidateEotAt = Date.now();
                      state.continuationSegmentCount = 1;
                      console.log(JSON.stringify({
                        event: 'candidate_eot_received',
                        session_id: state.sessionId || 'unknown',
                        text_preview: text.substring(0, 60),
                        confidence: confidence.toFixed(2),
                        timestamp: new Date().toISOString(),
                      }));
                    }
                    
                    const contBandTiming = getGradeBandTiming(state.ageGroup);
                    const tailGraceExt = getTailGraceExtension(state.continuationPendingText, state.ageGroup);
                    const pendingText = state.continuationPendingText;
                    const quickAnswer = isQuickAnswer(pendingText);
                    const shortDecl = isShortDeclarative(pendingText);
                    const conjEnding = endsWithConjunctionOrPreposition(pendingText);
                    const hedge = isHedgePhrase(pendingText);

                    let graceMs: number;
                    if (quickAnswer) {
                      graceMs = Math.min(contBandTiming.continuationGraceMs, 400);
                      console.log(`[ContinuationGuard] quick_answer detected, graceMs=${graceMs}`);
                    } else if (hedge) {
                      graceMs = contBandTiming.continuationHedgeGraceMs;
                    } else if (conjEnding) {
                      graceMs = contBandTiming.continuationHedgeGraceMs;
                      console.log(`[ContinuationGuard] conjunction_ending detected, graceMs=${graceMs}`);
                    } else if (shortDecl) {
                      graceMs = contBandTiming.continuationGraceMs + 200;
                      console.log(`[ContinuationGuard] short_declarative hold, graceMs=${graceMs}`);
                    } else {
                      graceMs = contBandTiming.continuationGraceMs;
                    }
                    if (tailGraceExt > 0) {
                      graceMs += tailGraceExt;
                      console.log(`[TailGrace] extended grace by ${tailGraceExt}ms for polite lead-in, totalGrace=${graceMs}ms`);
                    }
                    // P1: Thinking-aloud extension for older bands (G6-8, G9-12, ADV)
                    // Adds +800ms patience when student is forming a longer thought
                    // Does NOT apply to quickAnswer (already handled above with fast path)
                    const gradeBand = normalizeGradeBand(state.ageGroup);
                    if (!quickAnswer && OLDER_BANDS.has(gradeBand) && isThinkingAloud(pendingText)) {
                      const preExtend = graceMs;
                      graceMs += THINKING_ALOUD_EXTRA_GRACE_MS;
                      // Cap at hedge grace to prevent excessive wait (unless already hedge)
                      if (!hedge && graceMs > contBandTiming.continuationHedgeGraceMs) {
                        graceMs = contBandTiming.continuationHedgeGraceMs;
                      }
                      console.log(`[ContinuationGuard] thinking_aloud_extend band=${gradeBand} pre=${preExtend}ms post=${graceMs}ms`);
                    }
                    
                    state.continuationTimerId = setTimeout(() => {
                      state.continuationTimerId = undefined;
                      const finalText = state.continuationPendingText;
                      const segmentCount = state.continuationSegmentCount;
                      const candidateAt = state.continuationCandidateEotAt || Date.now();
                      
                      state.continuationPendingText = '';
                      state.continuationSegmentCount = 0;
                      state.continuationCandidateEotAt = undefined;
                      
                      // P0: Use shouldDropTranscript instead of raw char-length gate
                      const contDropCheck = shouldDropTranscript(finalText, state);
                      if (contDropCheck.drop) {
                        console.log(JSON.stringify({
                          event: 'turn_dropped',
                          session_id: state.sessionId || 'unknown',
                          reason: contDropCheck.reason,
                          chars: finalText.trim().length,
                          text: finalText.trim(),
                          timestamp: new Date().toISOString(),
                        }));
                        return;
                      }
                      
                      const hedgeDetected = isHedgePhrase(finalText);
                      const commitDurationMs = Date.now() - candidateAt;
                      
                      console.log(JSON.stringify({
                        event: 'turn_committed',
                        session_id: state.sessionId || 'unknown',
                        chars: finalText.trim().length,
                        duration_ms: commitDurationMs,
                        grace_ms: graceMs,
                        hedge_detected: hedgeDetected,
                        segment_count: segmentCount,
                        text_preview: finalText.substring(0, 60),
                        timestamp: new Date().toISOString(),
                      }));
                      
                      if (state.isSessionEnded) return;
                      
                      const gradeBandForPolicy = state.ageGroup as GradeBand;
                      const policyEval = evaluateTurn({
                        gradeBand: gradeBandForPolicy,
                        sessionK2Override: state.turnPolicyK2Override,
                        transcript: finalText,
                        eotConfidence: confidence,
                        endOfTurn: true,
                        policyState: state.turnPolicyState,
                        currentTimestamp: Date.now(),
                      });
                      
                      logTurnPolicyEvaluation(policyEval);
                      
                      if (policyEval.hesitation_guard_triggered) {
                        console.log(`[TurnPolicy] 🤔 Hesitation detected after continuation guard`);
                        startStallEscapeTimer(finalText);
                        return;
                      }
                      
                      if (policyEval.should_fire_claude) {
                        state.postUtteranceGraceUntil = Date.now() + 400;
                        // Ensure state has the latest text from continuation guard
                        if (finalText.trim().length > state.lastAccumulatedTranscript.trim().length) {
                          state.lastAccumulatedTranscript = finalText;
                          state.lastAccumulatedTranscriptSetAt = Date.now();
                        }
                        gatedFireClaude();
                      }
                    }, graceMs);
                    
                    ws.send(JSON.stringify({
                      type: "partial_transcript",
                      text: state.continuationPendingText,
                      isContinuationGuard: true,
                    }));
                    
                    return;
                  }

                  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                  // K2 TURN POLICY: Evaluate whether to fire Claude
                  // For K-2 students, detect hesitation and wait for complete thought
                  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                  const gradeBand = state.ageGroup as GradeBand;
                  const evaluation = evaluateTurn({
                    gradeBand,
                    sessionK2Override: state.turnPolicyK2Override,
                    transcript: text,
                    eotConfidence: confidence,
                    endOfTurn: endOfTurn,
                    policyState: state.turnPolicyState,
                    currentTimestamp: now,
                  });
                  
                  // Log turn policy evaluation
                  logTurnPolicyEvaluation(evaluation);
                  
                  if (evaluation.hesitation_guard_triggered) {
                    // Hesitation detected - start stall escape timer instead of firing immediately
                    console.log(`[TurnPolicy] 🤔 Hesitation detected - waiting for continuation or stall`);
                    startStallEscapeTimer(text);
                    return; // Don't process transcript yet
                  }
                  
                  if (evaluation.should_fire_claude) {
                    // Set post-utterance grace period (300-600ms) for merging late transcripts
                    state.postUtteranceGraceUntil = now + 400; // 400ms grace
                    // Ensure state has latest text before gated fire
                    if (text.trim().length > state.lastAccumulatedTranscript.trim().length) {
                      state.lastAccumulatedTranscript = text;
                      state.lastAccumulatedTranscriptSetAt = Date.now();
                    }
                    gatedFireClaude();
                  }
                },
                (error) => {
                  console.error('[AssemblyAI] ❌ Error:', error);
                  ws.send(JSON.stringify({ type: "error", error: "Voice recognition error: " + error }));
                },
                (sessionId) => {
                  console.log('[AssemblyAI] 🎬 Session started:', sessionId);
                  state.sttBeginReceived = true;
                  // Trigger paced replay of recent audio after Begin
                  const epoch = state.sttEpoch;
                  if (state.reconnectInFlight) {
                    void replayRecentAudioAfterBegin(state, epoch).then(() => {
                      if (epoch === state.sttEpoch) {
                        state.reconnectInFlight = false;
                        state.sttReconnectAttempts = 0;
                      }
                    });
                  }
                },
                undefined,
                state.ageGroup,
                (text, prevText) => creditSttActivity(state, text, prevText),
                () => {
                  state.sttEpoch++;
                  state.sttConnected = true;
                  state.sttLastMessageAtMs = Date.now();
                  state.sttReconnectAttempts = 0;
                  state.sttDisconnectedSinceMs = null;
                  markProgress(state);
                  state.sttConnectionId++;
                  console.log(`[STT] connected sessionId=${state.sessionId} connectionId=${state.sttConnectionId} epoch=${state.sttEpoch}`);
                  sendWsEvent(ws, 'stt_status', { status: 'connected' });
                  // Replay moved to replayRecentAudioAfterBegin() — runs after Begin, not onOpen
                },
                () => {
                  state.sttLastMessageAtMs = Date.now();
                  state.sttConsecutiveSendFailures = 0;
                  markProgress(state);
                  // SPEECH WATCHDOG: Transcript arrived — reset timer and segment count
                  if (state.speechWatchdogTimerId) {
                    clearTimeout(state.speechWatchdogTimerId);
                    state.speechWatchdogTimerId = null;
                  }
                  state.speechWatchdogSegments = 0;
                },
                state.sttKeytermsDisabledForSession ? null : state.sttKeytermsJson
              );

              console.log('[AssemblyAI] createAssemblyAIConnection returned successfully');
              state.assemblyAIWs = assemblyWs;
              state.assemblyAIState = assemblyState;
              console.log('[AssemblyAI] AssemblyAI WS assigned to state');
              
              const STT_DEADMAN_INTERVAL_MS = 2000;
              // Deadman constants: STT_FALLBACK_DEADMAN_MS (30s safety net)
              // Speech watchdog removed — fresh STT per listening window eliminates stale connections
              const STT_MAX_RECONNECT_ATTEMPTS = 5;
              const STT_RECONNECT_BACKOFF = [250, 500, 1000, 2000, 4000];
              
              const sttReconnect = () => {
                if (state.isSessionEnded || !state.sttReconnectEnabled || state.phase === 'FINALIZING') {
                  console.log(`[STT] reconnect_blocked reason=${state.isSessionEnded ? 'session_ended' : !state.sttReconnectEnabled ? 'reconnect_disabled' : 'finalizing'} phase=${state.phase}`);
                  return;
                }
                if (state.sttReconnectTimerId) return;
                if (state.reconnectInFlight) return;
                
                state.sttReconnectAttempts++;
                const attempt = state.sttReconnectAttempts;
                
                if (attempt > STT_MAX_RECONNECT_ATTEMPTS) {
                  console.error(`[STT] reconnect_exhausted attempts=${attempt} sessionId=${state.sessionId}`);
                  state.isReconnecting = false;
                  state.reconnectInFlight = false;
                  sendWsEvent(ws, 'stt_status', { status: 'failed', attempts: attempt });
                  ws.send(JSON.stringify({ type: "error", error: "Speech service connection lost. Please restart the session." }));
                  return;
                }

                // Send ForceEndpoint + Terminate before closing old connection
                const closingEpoch = state.sttEpoch;
                sendAssemblyAIForceEndpoint(state, closingEpoch);
                sendAssemblyAITerminate(state, closingEpoch);
                state.reconnectInFlight = true;
                
                const backoffMs = STT_RECONNECT_BACKOFF[Math.min(attempt - 1, STT_RECONNECT_BACKOFF.length - 1)];
                console.log(`[STT] reconnecting attempt=${attempt}/${STT_MAX_RECONNECT_ATTEMPTS} backoffMs=${backoffMs} sessionId=${state.sessionId}`);
                sendWsEvent(ws, 'stt_status', { status: 'reconnecting', attempt, maxAttempts: STT_MAX_RECONNECT_ATTEMPTS });
                state.isReconnecting = true;
                
                state.sttReconnectTimerId = setTimeout(() => {
                  state.sttReconnectTimerId = null;
                  if (state.isSessionEnded) return;
                  
                  try {
                    if (state.stallEscapeTimerId) {
                      clearTimeout(state.stallEscapeTimerId);
                      state.stallEscapeTimerId = null;
                      console.log('[STT] reconnect cleared lingering stall timer');
                    }
                    
                    const wasGuardActive = state.turnPolicyState.hesitationGuardActive;
                    const wasAwaitingEot = state.turnPolicyState.awaitingSecondEot;
                    const savedLastEotTimestamp = state.turnPolicyState.lastEotTimestamp;
                    const savedGuardedTranscript = state.guardedTranscript;
                    // PATIENCE FIX: Preserve pendingTranscript across STT reconnects
                    // so partial speech before deadman is not lost
                    const savedPendingTranscript = pendingTranscript;
                    pendingTranscript = '';
                    const savedStallTimerStartedAt = state.stallTimerStartedAt;
                    const savedLastAudioReceivedAt = state.lastAudioReceivedAt;
                    const config = getTurnPolicyConfig(state.ageGroup as GradeBand, state.turnPolicyK2Override);
                    
                    state.turnPolicyState = createTurnPolicyState();
                    
                    if (wasGuardActive || wasAwaitingEot) {
                      state.turnPolicyState.hesitationGuardActive = wasGuardActive;
                      state.turnPolicyState.awaitingSecondEot = wasAwaitingEot;
                      state.turnPolicyState.lastEotTimestamp = savedLastEotTimestamp;
                      state.guardedTranscript = savedGuardedTranscript;
                      state.lastAudioReceivedAt = savedLastAudioReceivedAt;
                      
                      if (savedStallTimerStartedAt > 0) {
                        const elapsedMs = Date.now() - savedStallTimerStartedAt;
                        const remainingMs = Math.max(0, config.max_turn_silence_ms - elapsedMs);
                        const transcriptToUse = savedGuardedTranscript || '';
                        
                        if (remainingMs > 0) {
                          startStallEscapeTimer(transcriptToUse, remainingMs);
                          console.log(`[STT] reconnect preserved guard + re-armed timer (${remainingMs}ms remaining)`);
                        } else {
                          console.log('[STT] reconnect guard time expired - firing stall escape');
                          const stallResult = checkStallEscape({
                            gradeBand: state.ageGroup as GradeBand,
                            sessionK2Override: state.turnPolicyK2Override,
                            policyState: state.turnPolicyState,
                            currentTimestamp: Date.now(),
                            hasAudioInput: false,
                          });
                          if (stallResult && stallResult.stall_prompt) {
                            logTurnPolicyEvaluation(stallResult);
                            fireClaudeWithPolicy(transcriptToUse, stallResult.stall_prompt);
                          } else {
                            const fallbackPrompt = "Do you want more time to think, or would you like some help?";
                            fireClaudeWithPolicy(transcriptToUse, fallbackPrompt);
                          }
                          resetTurnPolicyState(state.turnPolicyState);
                          state.guardedTranscript = '';
                          state.stallTimerStartedAt = 0;
                        }
                      } else {
                        console.log('[STT] reconnect guard active but no timer - resetting');
                        resetTurnPolicyState(state.turnPolicyState);
                      }
                    } else {
                      state.lastAudioReceivedAt = Date.now();
                      console.log('[STT] reconnect fresh turn policy state');
                    }
                    
                    const { ws: newWs, state: newState } = createAssemblyAIConnection(
                      state.language,
                      (rawText, endOfTurn, confidence) => {
                        // PATIENCE FIX: Merge any transcript saved before deadman with post-reconnect text
                        // so speech that was in-flight when deadman fired is not silently dropped
                        const text = savedPendingTranscript
                          ? (savedPendingTranscript + ' ' + rawText).trim()
                          : rawText;
                        if (savedPendingTranscript) {
                          console.log(`[AssemblyAI-Reconnect] 🔗 Merged pre-reconnect transcript: "${savedPendingTranscript}" + "${rawText}" => "${text}"`);
                        }
                        console.log(`[AssemblyAI-Reconnect] 📝 Complete utterance (confidence: ${confidence.toFixed(2)}): "${text}"`);
                        state.lastAccumulatedConfidence = confidence;
                        state.lastAudioReceivedAt = Date.now();
                        
                        const transcriptValidation = validateTranscript(text, 1);
                        if (!transcriptValidation.isValid) {
                          logGhostTurnPrevention(state.sessionId || 'unknown', text, transcriptValidation);
                          return;
                        }
                        
                        const gradeBand = state.ageGroup as GradeBand;
                        const evaluation = evaluateTurn({
                          transcript: text,
                          endOfTurn: endOfTurn,
                          eotConfidence: confidence,
                          gradeBand: gradeBand,
                          sessionK2Override: state.turnPolicyK2Override,
                          policyState: state.turnPolicyState,
                          currentTimestamp: Date.now(),
                        });
                        logTurnPolicyEvaluation(evaluation);
                        
                        if (evaluation.hesitation_guard_triggered) {
                          console.log(`[TurnPolicy-Reconnect] Hesitation detected`);
                          startStallEscapeTimer(text);
                          return;
                        }
                        if (evaluation.should_fire_claude) {
                          // Ensure state has latest text before gated fire
                          if (text.trim().length > state.lastAccumulatedTranscript.trim().length) {
                            state.lastAccumulatedTranscript = text;
                            state.lastAccumulatedTranscriptSetAt = Date.now();
                          }
                          gatedFireClaude();
                        }
                      },
                      (error) => console.error('[STT] reconnect_error:', error),
                      (sessionId) => {
                        console.log('[STT] reconnected sttSessionId:', sessionId);
                        state.sttBeginReceived = true;
                        // Trigger paced replay after Begin
                        const epoch = state.sttEpoch;
                        void replayRecentAudioAfterBegin(state, epoch).then(() => {
                          if (epoch === state.sttEpoch) {
                            state.reconnectInFlight = false;
                            state.sttReconnectAttempts = 0;
                          }
                        });
                      },
                      undefined,
                      state.ageGroup,
                      (text, prevText) => creditSttActivity(state, text, prevText),
                      () => {
                        state.sttEpoch++;
                        state.sttConnected = true;
                        state.sttLastMessageAtMs = Date.now();
                        state.sttReconnectAttempts = 0;
                        state.sttDisconnectedSinceMs = null;
                        markProgress(state);
                        state.sttConnectionId++;
                        console.log(`[STT] reconnected sessionId=${state.sessionId} connectionId=${state.sttConnectionId} epoch=${state.sttEpoch}`);
                        if (state.watchdogRecoveries > 0) {
                          console.log(`[WATCHDOG_RECOVERY_SUCCESS] sessionId=${state.sessionId} recovery=${state.watchdogRecoveries}`);
                          sendWsEvent(ws, 'voice_status', { status: 'audio_restored' });
                        }
                        sendWsEvent(ws, 'stt_status', { status: 'connected' });
                        // Replay moved to replayRecentAudioAfterBegin() — runs after Begin, not onOpen
                        state.isReconnecting = false;
                      },
                      () => {
                        state.sttLastMessageAtMs = Date.now();
                        state.sttConsecutiveSendFailures = 0;
                        markProgress(state);
                        // SPEECH WATCHDOG: Transcript arrived — reset timer and segment count
                        if (state.speechWatchdogTimerId) {
                          clearTimeout(state.speechWatchdogTimerId);
                          state.speechWatchdogTimerId = null;
                        }
                        state.speechWatchdogSegments = 0;
                      },
                      // P0.5: Reconnect preserves keyterms when valid, omits when disabled
                      state.sttKeytermsDisabledForSession ? null : state.sttKeytermsJson
                    );
                    
                    if (state.assemblyAIWs && state.assemblyAIWs.readyState === WebSocket.OPEN) {
                      try { state.assemblyAIWs.close(); } catch (_e) {}
                    }
                    state.assemblyAIWs = newWs;
                    state.assemblyAIState = newState;
                    console.log('[STT] reconnect new connection created');
                  } catch (e) {
                    console.error('[STT] reconnect_failed:', e);
                    state.isReconnecting = false;
                    sttReconnect();
                  }
                }, backoffMs);
              };
              
              // Store reconnect function on state so it's accessible from processTranscriptQueue
              // (which is defined earlier in the file and can't access this const directly)
              state.sttReconnectFn = sttReconnect;
              
              const handleSttDisconnect = (code?: number, reason?: string) => {
                state.sttConnected = false;
                state.sttBeginReceived = false;
                state.sttDisconnectedSinceMs = Date.now();
                // P0.4: Clear ws reference on disconnect to prevent stale sends
                state.assemblyAIWs = null;
                // Clear reconnectInFlight if Begin was never received for this connection
                if (state.reconnectInFlight) {
                  state.reconnectInFlight = false;
                }
                console.log(`[STT] disconnected code=${code} reason=${reason || 'none'} epoch=${state.sttEpoch} sessionId=${state.sessionId}`);
                sendWsEvent(ws, 'stt_status', { status: 'disconnected', code, reason });
                
                // P0.3: Handle 3005 as fatal config error (keyterms validation failure)
                if (code === 3005) {
                  if (!state.sttKeytermsDisabledForSession && state.sttKeytermsJson) {
                    console.error(`[STT] fatal_config_error code=3005 reason=${reason || 'unknown'} - disabling keyterms for session and reconnecting`);
                    state.sttKeytermsDisabledForSession = true;
                    // Immediate reconnect without keyterms (skip backoff)
                    if (!state.isSessionEnded && state.sessionId && state.sttReconnectEnabled && state.phase !== 'FINALIZING') {
                      state.sttReconnectAttempts = 0; // Reset attempts for clean fallback
                      sttReconnect();
                    }
                    return;
                  }
                  // 3005 without keyterms = different issue, fall through to normal reconnect
                  console.error(`[STT] fatal_config_error code=3005 without keyterms - unexpected, using normal reconnect`);
                }
                
                if (state.sessionId && state.transcript.length > 0) {
                  persistTranscript(state.sessionId, state.transcript).catch(() => {});
                }
                
                if (!state.isSessionEnded && state.sessionId && state.sttReconnectEnabled && state.phase !== 'FINALIZING' && state.phase !== 'TUTOR_SPEAKING') {
                  sttReconnect();
                } else {
                  console.log(`[STT] reconnect_skipped reason=${state.isSessionEnded ? 'session_ended' : !state.sttReconnectEnabled ? 'reconnect_disabled' : state.phase === 'TUTOR_SPEAKING' ? 'tutor_speaking_teardown' : 'finalizing'} phase=${state.phase}`);
                }
              };
              
              assemblyWs.on('close', (code: number, reason: Buffer) => {
                handleSttDisconnect(code, reason?.toString());
              });
              
              assemblyWs.on('error', (error: Error) => {
                console.error(`[STT] ws_error: ${error.message} sessionId=${state.sessionId}`);
                handleSttDisconnect(undefined, error.message);
              });
              
              state.sttDeadmanTimerId = setInterval(() => {
                const now = Date.now();

                if (state.isSessionEnded || !state.sttConnected || state.phase === 'FINALIZING' || !state.sttReconnectEnabled || state.sessionFinalizing) return;
                
                if (state.phase === 'TUTOR_SPEAKING' || state.tutorAudioPlaying) return;

                if (state.reconnectInFlight) return;
                
                const msSinceLastBargeIn = now - state.lastBargeInAt;
                if (state.lastBargeInAt > 0 && msSinceLastBargeIn < 5000) return;
                
                // Suppress when student has spoken but not finished
                if (pendingTranscript.trim().length > 0) return;
                
                const noMessageMs = now - state.sttLastMessageAtMs;
                const audioRecentMs = state.sttLastAudioForwardAtMs > 0 ? now - state.sttLastAudioForwardAtMs : Infinity;

                // FALLBACK DEADMAN ONLY: 30s with no messages and recent audio forwarding.
                // The speech_watchdog was removed — fresh STT per listening window eliminates
                // the stale-connection problem it was compensating for.
                const fallbackDeadman = noMessageMs >= STT_FALLBACK_DEADMAN_MS && audioRecentMs < 3000;

                if (!fallbackDeadman) return;

                console.log(`[STT] stt_deadman_fallback noMessageMs=${noMessageMs} audioRecentMs=${audioRecentMs.toFixed(0)} sessionId=${state.sessionId}`);
                state.sttConnected = false;
                if (state.assemblyAIWs) {
                  try { state.assemblyAIWs.close(); } catch (_e) {}
                }
                handleSttDisconnect(undefined, 'stt_deadman_fallback');
              }, STT_DEADMAN_INTERVAL_MS);
              
            } else {
              // ============================================
              // DEEPGRAM NOVA-2 (ORIGINAL)
              // ============================================
              console.log('[STT] 🚀 Using Deepgram Nova-2');
              state.deepgramConnection = await startDeepgramStream(
              async (transcript: string, isFinal: boolean, detectedLanguage?: string) => {
                // Log EVERYTHING for debugging - including detected language
                const spokenLang = detectedLanguage || state.language;
                console.log(`[Deepgram] ${isFinal ? '✅ FINAL' : '⏳ interim'}: "${transcript}" (isFinal=${isFinal}, detectedLang=${spokenLang})`);
                
                // CRITICAL FIX (Nov 14, 2025): Check userId FIRST to debug 401 auth issues
                if (!state.userId) {
                  console.error(`[Deepgram] ❌ CRITICAL: userId missing in transcript handler!`, {
                    sessionId: state.sessionId,
                    hasSessionId: !!state.sessionId,
                    transcript: transcript.substring(0, 50),
                    isFinal: isFinal
                  });
                  console.error(`[Deepgram] ❌ This means /api/user returned 401 and session initialization failed`);
                  // Don't process transcripts if user is not authenticated
                  return;
                }
                
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                // NOISE ROBUSTNESS: For Deepgram, only act on final transcripts
                // Interim transcripts are hypothesis-only
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                const now = Date.now();
                const timeSinceLastAudio = now - state.lastAudioSentAt;
                const noiseFloor = getNoiseFloor(state.noiseFloorState);
                
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                // GHOST TURN PREVENTION: Validate transcript
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                const transcriptValidation = validateTranscript(transcript, 1);
                if (!transcriptValidation.isValid && isFinal) {
                  logGhostTurnPrevention(state.sessionId || 'unknown', transcript, transcriptValidation);
                  console.log(`[GhostTurn] 🚫 Ignored transcript: "${transcript}" (${transcriptValidation.reason})`);
                  return;
                }
                
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                // HARDENED BARGE-IN: Duck-then-interrupt with lexical validation
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                if (state.phase === 'TUTOR_SPEAKING' && state.tutorAudioPlaying && timeSinceLastAudio < 30000) {
                  const bargeInValidation = validateTranscriptForBargeIn(transcript);
                  
                  if (!bargeInValidation.isValid) {
                    if (!state.bargeInDucking) {
                      state.bargeInDucking = true;
                      state.bargeInDuckStartTime = now;
                      ws.send(JSON.stringify({ type: "duck", message: "Potential speech detected" }));
                      logBargeInDecision(
                        state.sessionId || 'unknown',
                        'duck',
                        state.lastMeasuredRms, noiseFloor,
                        bargeInValidation.wordCount,
                        transcript,
                        `too_short_${bargeInValidation.wordCount}_words`
                      );
                      console.log(`[BargeIn] 🔉 DUCK (not interrupt): "${transcript}" (${bargeInValidation.wordCount} words < 3)`);
                    }
                  } else {
                    if (state.phase !== 'TUTOR_SPEAKING' || !state.tutorAudioPlaying) {
                      console.log(`[BargeIn] suppressed_late_lexical tutorAudioPlaying=${state.tutorAudioPlaying} phase=${state.phase} genId=${state.playbackGenId}`);
                      state.bargeInDucking = false;
                    } else {
                      console.log(`[BargeIn] 🛑 INTERRUPT: "${transcript.substring(0, 30)}..." (${bargeInValidation.wordCount} words)`);
                      hardInterruptTutor(ws, state, 'lexical_validated');
                      logBargeInDecision(
                        state.sessionId || 'unknown',
                        'interrupt',
                        state.lastMeasuredRms, noiseFloor,
                        bargeInValidation.wordCount,
                        transcript,
                        'lexical_validated'
                      );
                    }
                  }
                } else if (state.bargeInDucking && state.phase !== 'TUTOR_SPEAKING') {
                  state.bargeInDucking = false;
                  ws.send(JSON.stringify({ type: "unduck", message: "Tutor finished" }));
                }

                if (state.isTutorSpeaking && timeSinceLastAudio >= 30000) {
                  console.log("[Custom Voice] ⏸️ Resetting stale tutor speaking state...");
                  state.isTutorSpeaking = false;
                  state.isTutorThinking = false;
                  state.currentPlaybackMode = 'listening';
                  state.bargeInDucking = false;
                }

                // Only process for AI response on FINAL transcripts
                if (!isFinal) {
                  console.log("[Custom Voice] ⏭️ Skipping interim for AI processing (hypothesis only)");
                  return;
                }

                // P0: Use shouldDropTranscript instead of raw char-length gate (Deepgram path)
                const deepgramDropCheck = shouldDropTranscript(transcript, state);
                if (deepgramDropCheck.drop) {
                  console.log(`[GhostTurn] dropped reason=${deepgramDropCheck.reason} text="${(transcript || '').substring(0, 30)}" len=${(transcript || '').trim().length}`);
                  return;
                }

                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                // INACTIVITY: Reset activity timer - User is speaking!
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                state.lastActivityTime = Date.now();
                state.inactivityWarningSent = false; // Reset warning flag
                console.log('[Inactivity] 🎤 User activity detected, timer reset');
                
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                // FIX (Dec 10, 2025): DON'T drop transcripts when isProcessing!
                // Previous bug: transcripts were silently dropped causing "tutor not responding"
                // Now: ALWAYS accumulate transcripts, let the queue handle serialization
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                console.log(`[Pipeline] 1. Transcript received: "${transcript}", isProcessing=${state.isProcessing}`);
                
                // Skip duplicates only (not based on isProcessing!)
                if (state.lastTranscript === transcript) {
                  console.log("[Pipeline] ⏭️ Duplicate transcript, skipping");
                  return;
                }
                
                state.lastTranscript = transcript;
                
                // LANGUAGE AUTO-DETECT: Update detected language for AI response
                if (spokenLang && spokenLang !== state.language) {
                  console.log(`[Custom Voice] 🌍 Language switch detected: ${state.language} → ${spokenLang}`);
                  state.detectedLanguage = spokenLang;
                } else if (spokenLang) {
                  state.detectedLanguage = spokenLang;
                }
                
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                // FIX (Dec 10, 2025): Server-side transcript ACCUMULATION
                // Don't process each transcript separately - accumulate them!
                // This fixes students being cut off when they pause mid-sentence
                // Example: "To get my answer," [pause] "apple" → "To get my answer, apple"
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                
                // Accumulate this transcript with previous pending text
                pendingTranscript = (pendingTranscript + ' ' + transcript).trim();
                console.log(`[Custom Voice] 📝 Accumulated transcript: "${pendingTranscript}"`);
                
                // Clear any existing accumulation timer (we got new speech!)
                if (transcriptAccumulationTimer) {
                  clearTimeout(transcriptAccumulationTimer);
                  transcriptAccumulationTimer = null;
                  console.log(`[Custom Voice] ⏰ Reset accumulation timer (more speech incoming)`);
                }
                
                // Also clear the old response timer if it exists
                if (responseTimer) {
                  clearTimeout(responseTimer);
                  responseTimer = null;
                }
                
                // Wait 1.5 seconds after the LAST transcript before sending to AI
                // This gives students time to complete their thought
                transcriptAccumulationTimer = setTimeout(() => {
                  if (pendingTranscript && !state.isSessionEnded) {
                    const completeUtterance = pendingTranscript;
                    console.log(`[Custom Voice] ✅ Utterance complete after ${UTTERANCE_COMPLETE_DELAY_MS}ms silence: "${completeUtterance}"`);
                    
                    // Clear pending transcript
                    pendingTranscript = '';
                    
                    state.lastEndOfTurnTime = Date.now();
                    commitUserTurn(completeUtterance, 'eot');
                  }
                  transcriptAccumulationTimer = null;
                }, UTTERANCE_COMPLETE_DELAY_MS);
              },
              async (error: Error) => {
                console.error("[Custom Voice] ❌ Deepgram error:", error);
                
                // FIX #3: Persist on Deepgram error
                if (state.sessionId && state.transcript.length > 0) {
                  await persistTranscript(state.sessionId, state.transcript);
                }
                
                ws.send(JSON.stringify({ type: "error", error: error.message }));
              },
              async () => {
                console.log("[Custom Voice] 🔌 Deepgram connection closed");
                
                // FIX #3: Critical - Persist on Deepgram close
                if (state.sessionId && state.transcript.length > 0) {
                  await persistTranscript(state.sessionId, state.transcript);
                }
                
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                // FIX (Dec 10, 2025): Auto-reconnect when connection closes unexpectedly
                // This handles both health check timeout AND keepAlive failures
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                if (!state.isSessionEnded && state.sessionId) {
                  console.warn("[Custom Voice] ⚠️ Unexpected Deepgram close while session active - attempting reconnect");
                  
                  // RECONNECT FIX: Block audio ingestion during reconnection
                  state.isReconnecting = true;
                  
                  // Increment reconnect counter to prevent infinite loops
                  reconnectAttempts++;
                  
                  if (reconnectAttempts > 3) {
                    console.error("[Custom Voice] ❌ Max reconnect attempts (3) reached, giving up");
                    state.isReconnecting = false; // Stop blocking audio (though connection is dead)
                    try {
                      ws.send(JSON.stringify({ 
                        type: "error", 
                        error: "Voice connection lost. Please restart the tutoring session." 
                      }));
                    } catch (sendError) {
                      console.error("[Custom Voice] ❌ Failed to notify client:", sendError);
                    }
                    return;
                  }
                  
                  console.log(`[Custom Voice] 🔄 Reconnect attempt ${reconnectAttempts}/3...`);
                  
                  // Notify client we're reconnecting (not an error, just informational)
                  try {
                    ws.send(JSON.stringify({ 
                      type: "status", 
                      message: "Reconnecting voice connection..." 
                    }));
                  } catch (sendError) {
                    // Ignore
                  }
                  
                  // Attempt to reconnect with exponential backoff
                  const backoffDelay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 8000);
                  console.log(`[Custom Voice] 🔄 Reconnecting in ${backoffDelay}ms (attempt ${reconnectAttempts}/3)...`);
                  
                  setTimeout(async () => {
                    try {
                      console.log("[Custom Voice] 🔄 Creating new Deepgram connection...");
                      const newConnection = await reconnectDeepgram();
                      
                      // Atomic assignment - only update if reconnect succeeded
                      state.deepgramConnection = newConnection;
                      state.isReconnecting = false; // Resume audio ingestion
                      console.log("[Custom Voice] ✅ Deepgram reconnected successfully");
                      reconnectAttempts = 0; // Reset counter on success
                      
                      // Notify client we're back online
                      try {
                        ws.send(JSON.stringify({ 
                          type: "status", 
                          message: "Voice connection restored" 
                        }));
                      } catch (sendError) {
                        // Ignore
                      }
                    } catch (reconnectError) {
                      console.error("[Custom Voice] ❌ Reconnect attempt failed:", reconnectError);
                      
                      // If we haven't exhausted attempts, the next onClose will trigger another retry
                      // Otherwise notify user to restart
                      if (reconnectAttempts >= 3) {
                        state.isReconnecting = false; // Stop blocking audio after all attempts fail
                        try {
                          ws.send(JSON.stringify({ 
                            type: "error", 
                            error: "Voice connection failed after multiple attempts. Please restart the session." 
                          }));
                        } catch (sendError) {
                          // Ignore
                        }
                      } else {
                        // Will retry on next attempt - increment handled above
                        try {
                          ws.send(JSON.stringify({ 
                            type: "status", 
                            message: `Reconnection failed, retrying... (${reconnectAttempts}/3)` 
                          }));
                        } catch (sendError) {
                          // Ignore
                        }
                      }
                    }
                  }, backoffDelay); // Exponential backoff
                }
              },
              deepgramLanguage // LANGUAGE: Pass selected language for speech recognition
            );
            } // End of Deepgram else block

            // CRITICAL: Send "ready" BEFORE greeting so client can initialize Silero VAD
            // Otherwise, Silero VAD starts AFTER greeting audio begins playing and cannot detect
            // speech during the first ~1-2 seconds of greeting playback (barge-in fails).
            ws.send(JSON.stringify({ type: "ready" }));
            console.log("[Custom Voice] ✅ Session ready - sent before greeting");
            
            // Send session_config for adaptive voice UX features
            const gradeBand = normalizeGradeBand(state.ageGroup || 'G6-8');
            const initialActivityMode: ActivityMode = 'default';
            ws.send(JSON.stringify({ 
              type: "session_config",
              adaptiveBargeInEnabled: isAdaptiveBargeInEnabled(),
              readingModeEnabled: isReadingModeEnabled(),
              adaptivePatienceEnabled: isAdaptivePatienceEnabled(),
              goodbyeHardStopEnabled: isGoodbyeHardStopEnabled(),
              gradeBand,
              activityMode: initialActivityMode
            }));
            console.log(`[Custom Voice] ⚙️ Session config sent: adaptiveBargeIn=${isAdaptiveBargeInEnabled()}, gradeBand=${gradeBand}`);
            
            // CRITICAL: 500ms delay for client to initialize microphone + Silero VAD
            // Without this delay, greeting audio arrives before Silero VAD is ready,
            // and barge-in detection during the greeting completely fails.
            // Client flow: receive "ready" → startMicrophone() → MicVAD.new() → vad.start()
            // This entire chain needs ~300-400ms, so 500ms ensures full initialization.
            await new Promise(resolve => setTimeout(resolve, 500));
            console.log("[Custom Voice] ⏳ Silero VAD initialization delay complete");

            // Generate and send greeting audio - SENTENCE-CHUNKED for faster first-audio
            // Instead of waiting for the entire greeting to synthesize, split into sentences
            // and send each chunk as it completes. First sentence (~5-10 words) synthesizes
            // in ~300-400ms vs 2-3s for the full greeting.
            // PIPELINE: Greeting participates in isProcessing to prevent concurrent turn processing
            if (greeting && greeting.length > 0) {
              state.isProcessing = true;
              state.processingSinceMs = Date.now();
              state.isTutorSpeaking = true;
              console.log(`[Pipeline] greeting_processing_start isProcessing=true`);
              
              // Split greeting into sentences at sentence boundaries
              // Handles: periods, exclamation marks, question marks (including after quotes)
              // Preserves punctuation with the sentence it belongs to
              const greetingSentences = greeting
                .match(/[^.!?]+[.!?]+["']?\s*/g)
                ?.map(s => s.trim())
                .filter(s => s.length > 0) || [greeting];
              
              console.log(`[Greeting Chunking] 📝 Split greeting into ${greetingSentences.length} sentence(s)`);
              
              // Send full transcript text immediately (client shows text while audio streams)
              ws.send(JSON.stringify({
                type: "transcript",
                text: greeting,
                speaker: "tutor"
              }));
              
              // BARGE-IN: Set phase to TUTOR_SPEAKING so hardInterruptTutor can fire during greeting.
              // Without this the phase stays LISTENING and barge-in is completely blocked.
              setPhase(state, 'TUTOR_SPEAKING', 'greeting_start', ws);
              state.sttLastUserSpeechSentAtMs = 0;
              // FRESH STT PER LISTENING WINDOW: Close STT during greeting playback.
              teardownSttConnection(state, 'greeting_start');
              state.tutorAudioPlaying = true;
              state.tutorAudioStartMs = Date.now();
              
              // BARGE-IN: Create an AbortController so the greeting loop can be cancelled mid-stream.
              const greetingAc = new AbortController();
              state.ttsAbortController = greetingAc;
              
              const greetingTtsStart = Date.now();
              let totalGreetingAudioBytes = 0;
              let chunkIndex = 0;
              let greetingInterrupted = false;
              
              try {
                for (const sentence of greetingSentences) {
                  // Check barge-in abort between sentences
                  if (greetingAc.signal.aborted) {
                    greetingInterrupted = true;
                    console.log(`[Greeting Chunking] ⚡ Greeting interrupted by barge-in after ${chunkIndex} sentences`);
                    break;
                  }
                  
                  chunkIndex++;
                  const chunkStart = Date.now();

                  const audioBuffer = await generateSpeech(sentence, state.ageGroup, state.speechSpeed);
                  const chunkMs = Date.now() - chunkStart;
                  totalGreetingAudioBytes += audioBuffer.length;

                  // Check again after TTS (barge-in may have fired while generating)
                  if (greetingAc.signal.aborted) {
                    greetingInterrupted = true;
                    console.log(`[Greeting Chunking] ⚡ Greeting interrupted mid-chunk ${chunkIndex} by barge-in`);
                    break;
                  }

                  console.log(`[Greeting Chunking] 🔊 Chunk ${chunkIndex}/${greetingSentences.length}: ${chunkMs}ms, ${audioBuffer.length} bytes | "${sentence.substring(0, 50)}..."`);

                  ws.send(JSON.stringify({
                    type: "audio",
                    data: audioBuffer.toString("base64"),
                    audioFormat: "pcm_s16le",
                    sampleRate: 16000,
                    channels: 1
                  }));
                }
                
                if (!greetingInterrupted) {
                  const totalGreetingMs = Date.now() - greetingTtsStart;
                  console.log(`[Greeting Chunking] ✅ All ${chunkIndex} chunks sent in ${totalGreetingMs}ms total (${totalGreetingAudioBytes} bytes)`);
                }
              } catch (error) {
                console.error("[Custom Voice] ❌ Failed to generate greeting audio:", error);
              } finally {
                // Only reset phase if barge-in hasn't already changed it
                if (!greetingInterrupted) {
                  setPhase(state, 'LISTENING', 'greeting_complete', ws);
                  state.tutorAudioPlaying = false;
                  state.sttLastMessageAtMs = Date.now();
                  // FRESH STT PER LISTENING WINDOW: Open new connection after greeting.
                  if (USE_ASSEMBLYAI && !state.reconnectInFlight && state.sttReconnectFn) {
                    state.sttReconnectAttempts = 0;
                    state.sttReconnectFn();
                  }
                }
                if (state.ttsAbortController === greetingAc) {
                  state.ttsAbortController = null;
                }
                state.isProcessing = false;
                state.processingSinceMs = null;
                state.isTutorSpeaking = false;
                console.log(`[Pipeline] greeting_processing_end isProcessing=false interrupted=${greetingInterrupted} queueLen=${state.transcriptQueue.length}`);
                if (state.transcriptQueue.length > 0 && !state.isSessionEnded) {
                  console.log(`[Pipeline] drainQueue after greeting, queueLen=${state.transcriptQueue.length}`);
                  setImmediate(() => processTranscriptQueue());
                }
              }
            } else {
              console.log(`[Custom Voice] 🔄 Reconnect detected - skipping greeting audio`);
            }

            // NOTE: "ready" and "session_config" messages already sent BEFORE greeting (line ~6227)
            // to ensure Silero VAD is initialized before greeting audio playback begins.
            
            // Initialize turn policy state with activity mode for reading patience overlay
            if (isReadingModeEnabled()) {
              const initialActivityMode: ActivityMode = 'default';
              setActivityMode(state.turnPolicyState, initialActivityMode);
              console.log(`[Custom Voice] 📖 Reading mode patience enabled, initial mode: ${initialActivityMode}`);
            }
            
            // NOTE: "session_config" already sent BEFORE greeting (line ~6234)
            break;

          case "audio":
            if (state.phase === 'FINALIZING' || state.sessionFinalizing || state.isSessionEnded) {
              console.log(`[LATE_AUDIO_IGNORED] sessionId=${state.sessionId} phase=${state.phase} ended=${state.isSessionEnded}`);
              break;
            }
            
            const hasConnection = USE_ASSEMBLYAI ? !!state.assemblyAIWs : !!state.deepgramConnection;
            // Reduced logging: only log every 100th audio frame to prevent Railway rate limits
            // (was logging every frame, causing 96+ message drops during high-churn windows)
            state.audioFrameCount = (state.audioFrameCount || 0) + 1;
            if (state.audioFrameCount <= 2 || state.audioFrameCount % 100 === 0) {
              console.log('[Custom Voice] 📥 Audio message received:', {
                hasData: !!message.data,
                dataLength: message.data?.length || 0,
                provider: USE_ASSEMBLYAI ? 'AssemblyAI' : 'Deepgram',
                hasConnection,
                isReconnecting: state.isReconnecting,
                frameCount: state.audioFrameCount,
              });
            }
            
            if (state.isReconnecting) {
              // PATIENCE FIX: Buffer audio during reconnect instead of dropping it.
              // PcmRingBuffer handles overflow internally.
              if (message.data) {
                const buf = Buffer.from(message.data, 'base64');
                state.sttAudioRingBuffer.push(buf);
                state.sttLastAudioForwardAtMs = Date.now(); // prevent false deadman
                markProgress(state);
              }
              break;
            }
            
            if (hasConnection && message.data) {
              try {
                const audioBuffer = Buffer.from(message.data, "base64");
                
                // Check audio content (first 10 samples as Int16)
                const int16View = new Int16Array(audioBuffer.buffer, audioBuffer.byteOffset, Math.min(10, audioBuffer.length / 2));
                const hasNonZero = int16View.some(sample => sample !== 0);
                const maxAmplitude = Math.max(...Array.from(int16View).map(Math.abs));
                
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                // NOISE FLOOR: Update per-session rolling baseline
                // Measures RMS during non-speech periods for speech detection
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                const rms = calculateRMS(audioBuffer);
                const speechDetection = detectSpeech(state.noiseFloorState, audioBuffer);
                
                // Persist RMS for transcript-level barge-in logging
                state.lastMeasuredRms = rms;
                
                // Update lastConfirmedSpeechTime when speech is confirmed
                if (speechDetection.isSpeech) {
                  state.lastConfirmedSpeechTime = Date.now();
                }
                
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                // TWO-STAGE BARGE-IN STATE MACHINE (phase-gated)
                // Stage 1: Duck audio on RMS detection (never hard stop on RMS alone)
                // Stage 2: Hard stop ONLY after sustained speech + transcript/VAD confirmation
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                const bandTiming = getGradeBandTiming(state.ageGroup);
                const noiseFloor = getNoiseFloor(state.noiseFloorState);
                const echoGuardThresh = Math.max(0.06, noiseFloor * 6.0);
                const fixedRmsThreshold = state.tutorAudioPlaying
                  ? Math.max(echoGuardThresh, bandTiming.bargeInPlaybackThreshold)
                  : Math.max(0.03, noiseFloor * 3.0);
                const risingThreshold = fixedRmsThreshold * 1.5;
                const isAboveThreshold = rms >= fixedRmsThreshold && (speechDetection.isSpeech || speechDetection.isPotentialSpeech);
                // P2: Allow pre-roll barge-in (phase=TUTOR_SPEAKING, tutorAudioPlaying=false)
                const bargeInEligible = state.phase === 'TUTOR_SPEAKING' && !state.sessionFinalizing;
                const STT_ACTIVITY_WINDOW_MS = 800;

                if (bargeInEligible && isAboveThreshold) {
                  const now = Date.now();
                  if (!state.bargeInCandidate.isActive) {
                    const isRising = rms >= risingThreshold;
                    state.bargeInCandidate = {
                      isActive: true,
                      startedAt: now,
                      peakRms: rms,
                      lastAboveAt: now,
                      genId: state.playbackGenId,
                      risingEdgeConfirmed: isRising,
                      consecutiveAboveCount: 1,
                      stage: 'idle',
                      duckStartMs: 0,
                      sttSnapshotAt: 0,
                    };
                    console.log(`[BargeIn] debounce_started gen=${state.playbackGenId} rms=${rms.toFixed(4)} thresh=${fixedRmsThreshold.toFixed(4)} rising=${isRising} phase=${state.phase}`);
                  } else {
                    state.bargeInCandidate.lastAboveAt = now;
                    state.bargeInCandidate.consecutiveAboveCount++;
                    if (rms > state.bargeInCandidate.peakRms) {
                      state.bargeInCandidate.peakRms = rms;
                    }
                    if (!state.bargeInCandidate.risingEdgeConfirmed && rms >= risingThreshold) {
                      state.bargeInCandidate.risingEdgeConfirmed = true;
                    }
                    const candidateDuration = now - state.bargeInCandidate.startedAt;
                    const hasEnoughFrames = state.bargeInCandidate.consecutiveAboveCount >= bandTiming.consecutiveFramesRequired;

                    if (state.bargeInCandidate.stage === 'idle' && candidateDuration >= bandTiming.bargeInDebounceMs && hasEnoughFrames && state.bargeInCandidate.risingEdgeConfirmed) {
                      state.bargeInCandidate.stage = 'ducked';
                      state.bargeInCandidate.duckStartMs = now;
                      state.bargeInCandidate.sttSnapshotAt = state.lastSttActivityAt;
                      state.bargeInDucking = true;
                      state.bargeInDuckStartTime = now;
                      if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'duck', message: 'Potential speech detected' }));
                      }
                      console.log(JSON.stringify({
                        event: 'barge_in_duck_start',
                        session_id: state.sessionId,
                        gen_id: state.bargeInCandidate.genId,
                        rms: rms.toFixed(4),
                        threshold: fixedRmsThreshold.toFixed(4),
                        frames: state.bargeInCandidate.consecutiveAboveCount,
                        debounce_ms: candidateDuration,
                        confirm_duration_ms: bandTiming.bargeInConfirmDurationMs,
                      }));
                    }

                    if (state.bargeInCandidate.stage === 'ducked' || state.bargeInCandidate.stage === 'confirming') {
                      const duckDuration = now - state.bargeInCandidate.duckStartMs;

                      // P2: Allow pre-roll barge-in - only suppress if phase changed away from TUTOR_SPEAKING
                      if (state.phase !== 'TUTOR_SPEAKING') {
                        console.log(`[BargeIn] suppressed_not_playing phase=${state.phase} tutorAudioPlaying=${state.tutorAudioPlaying}`);
                        cancelBargeInCandidate(state, 'not_playing_at_fire', ws);
                      } else if (state.bargeInCandidate.genId !== state.playbackGenId) {
                        console.log(`[BargeIn] suppressed_stale_gen candidateGen=${state.bargeInCandidate.genId} activeGen=${state.playbackGenId}`);
                        cancelBargeInCandidate(state, 'stale_gen', ws);
                      } else if (state.tutorAudioStartMs > 0 && (now - state.tutorAudioStartMs) < bandTiming.minMsAfterAudioStartForBargeIn) {
                        console.log(`[BargeIn] suppressed_too_soon_after_audio msSinceAudioStart=${now - state.tutorAudioStartMs} minMs=${bandTiming.minMsAfterAudioStartForBargeIn}`);
                        cancelBargeInCandidate(state, 'too_soon_after_audio', ws);
                      } else if (duckDuration >= bandTiming.bargeInConfirmDurationMs) {
                        if (state.bargeInCandidate.stage !== 'confirming') {
                          state.bargeInCandidate.stage = 'confirming';
                        }
                        const sttAdvanced = state.lastSttActivityAt > state.bargeInCandidate.duckStartMs &&
                          (now - state.lastSttActivityAt) < STT_ACTIVITY_WINDOW_MS;
                        const vadConfirmed = speechDetection.isSpeech;
                        // For fast bands (ADV, G9-12), high sustained RMS alone confirms barge-in
                        // STT is too slow and Silero VAD is broken, so requiring them blocks all interruptions
                        const isFastBand = bandTiming.bargeInConfirmDurationMs <= 150;
                        const rmsConfirmed = isFastBand && state.bargeInCandidate.peakRms >= 0.25 && rms >= fixedRmsThreshold;

                        if (sttAdvanced || vadConfirmed || rmsConfirmed) {
                          const confirmReason = sttAdvanced ? 'transcript_advanced' : vadConfirmed ? 'vad_confirmed' : 'rms_sustained';
                          console.log(JSON.stringify({
                            event: 'barge_in_hard_stop_confirmed',
                            session_id: state.sessionId,
                            gen_id: state.bargeInCandidate.genId,
                            duck_duration_ms: duckDuration,
                            confirm_reason: confirmReason,
                            peak_rms: state.bargeInCandidate.peakRms.toFixed(4),
                            current_rms: rms.toFixed(4),
                            frames: state.bargeInCandidate.consecutiveAboveCount,
                          }));
                          state.bargeInDucking = false;
                          hardInterruptTutor(ws, state, 'two_stage_confirmed');
                        } else {
                          const confirmAge = now - (state.bargeInCandidate.duckStartMs + bandTiming.bargeInConfirmDurationMs);
                          if (confirmAge > STT_ACTIVITY_WINDOW_MS) {
                            console.log(JSON.stringify({
                              event: 'barge_in_suppressed_not_confirmed',
                              session_id: state.sessionId,
                              gen_id: state.bargeInCandidate.genId,
                              duck_duration_ms: duckDuration,
                              stt_advanced: sttAdvanced,
                              vad_confirmed: vadConfirmed,
                              peak_rms: state.bargeInCandidate.peakRms.toFixed(4),
                            }));
                            cancelBargeInCandidate(state, 'not_confirmed_after_duration', ws);
                          }
                        }
                      } else {
                        if (Math.random() < 0.1) {
                          console.log(`[BargeIn] confirm_window_active duckMs=${duckDuration}/${bandTiming.bargeInConfirmDurationMs} rms=${rms.toFixed(4)} sttActive=${(now - state.lastSttActivityAt) < STT_ACTIVITY_WINDOW_MS}`);
                        }
                      }
                    }
                  }
                } else if (state.bargeInCandidate.isActive) {
                  if (!bargeInEligible) {
                    cancelBargeInCandidate(state, `phase_change_${state.phase}`, ws);
                  } else {
                    const now = Date.now();
                    const silenceSinceAbove = now - state.bargeInCandidate.lastAboveAt;
                    if (silenceSinceAbove > bandTiming.bargeInDecayMs) {
                      console.log(`[BargeIn] candidate_expired silenceMs=${silenceSinceAbove} peakRms=${state.bargeInCandidate.peakRms.toFixed(4)} decayMs=${bandTiming.bargeInDecayMs}`);
                      cancelBargeInCandidate(state, 'silence_decay', ws);
                    }
                  }
                }
                
                // Log noise floor gating when speech is ignored (potential but not confirmed)
                if (!speechDetection.isSpeech && speechDetection.isPotentialSpeech) {
                  logNoiseFloorGating(state.sessionId || 'unknown', speechDetection, true);
                  // MIC STATUS EVENT: Notify client that background noise is being filtered
                  ws.send(JSON.stringify({ type: "noise_ignored" }));
                }
                
                // MIC STATUS EVENT: Notify client when confirmed speech is detected
                if (speechDetection.isSpeech && !state.lastSpeechNotificationSent) {
                  ws.send(JSON.stringify({ type: "speech_detected" }));
                  state.lastSpeechNotificationSent = true;
                  state.lastUserSpeechAtMs = Date.now();
                  if (state.phase === 'LISTENING') {
                    setPhase(state, 'SPEECH_DETECTED', 'vad_speech_onset', ws);
                  }
                  // SPEECH WATCHDOG: Removed — was racing with reconnect logic and killing connections.
                  // The underlying stale-STT issue was caused by u3-rt-pro model, now removed.
                } else if (!speechDetection.isSpeech && state.lastSpeechNotificationSent) {
                  state.lastSpeechNotificationSent = false;
                  ws.send(JSON.stringify({ type: "speech_ended" }));
                  cancelBargeInCandidate(state, 'speech_ended', ws);
                  // DO NOT send ForceEndpoint here — our energy-based VAD fires on micro-pauses
                  // in natural speech (breathing, hesitation between words). Forcing AssemblyAI
                  // to commit at each pause splits utterances mid-sentence ("I said" without "math").
                  // Let AssemblyAI's own turn detection (semantic + acoustic) own turn boundaries.
                  if (state.phase === 'SPEECH_DETECTED') {
                    setPhase(state, 'LISTENING', 'vad_speech_ended', ws);
                  }
                  // SPEECH WATCHDOG: Removed (see speech onset comment above)
                }
                
                // Only log detailed audio analysis occasionally (every ~50th chunk to reduce noise)
                if (Math.random() < 0.02) {
                  console.log('[Custom Voice] 🎤 Audio buffer analysis:', {
                    totalBytes: audioBuffer.length,
                    rms: rms.toFixed(4),
                    noiseFloor: speechDetection.noiseFloor.toFixed(4),
                    threshold: speechDetection.threshold.toFixed(4),
                    isSpeech: speechDetection.isSpeech,
                    maxAmplitude: maxAmplitude,
                    isSilent: !hasNonZero || maxAmplitude < 10
                  });
                }
                
                if (!hasNonZero) {
                  console.warn('[Custom Voice] ⚠️ Audio buffer is COMPLETELY SILENT (all zeros)! Dropping chunk to prevent STT deadman trigger.');
                  // Drop silent-zero chunks entirely — sending them to AssemblyAI causes
                  // the deadman timer to fire (no STT messages returned) which triggers
                  // unnecessary reconnect cycles at session start when mic is still initializing.
                  return;
                }
                
                // Send to appropriate STT provider
                if (USE_ASSEMBLYAI) {
                  // Guards (TUTOR_SPEAKING, sttBeginReceived, epoch, reconnectInFlight)
                  // are now inside sendAudioToAssemblyAI. Ring buffer is always kept warm.
                  const isSpeechFrame = Boolean(speechDetection?.isSpeech);
                  const sent = sendAudioToAssemblyAI(state.assemblyAIWs, audioBuffer, state.assemblyAIState || undefined, state, isSpeechFrame);
                  if (sent && (state.audioFrameCount <= 2 || state.audioFrameCount % 100 === 0)) {
                    console.log('[Custom Voice] ✅ Audio forwarded to AssemblyAI');
                  }
                  // P0.4: Send failures are tracked inside sendAudioToAssemblyAI with rate-limited logging
                } else {
                  state.deepgramConnection!.send(audioBuffer);
                  if (state.audioFrameCount <= 2 || state.audioFrameCount % 100 === 0) {
                    console.log('[Custom Voice] ✅ Audio forwarded to Deepgram');
                  }
                }
              } catch (error) {
                console.error('[Custom Voice] ❌ Error sending audio:', {
                  provider: USE_ASSEMBLYAI ? 'AssemblyAI' : 'Deepgram',
                  error: error instanceof Error ? error.message : String(error),
                  stack: error instanceof Error ? error.stack : undefined
                });
              }
            } else {
              console.error('[Custom Voice] ❌ Cannot forward audio:', {
                provider: USE_ASSEMBLYAI ? 'AssemblyAI' : 'Deepgram',
                hasConnection,
                hasData: !!message.data
              });
            }
            break;

          case "text_message":
            // Handle text message from chat input
            console.log(`[Custom Voice] 📝 Text message from ${state.studentName}: ${message.message}`);
            
            // WATCHDOG: Text input is valid progress — prevent watchdog from killing text-mode sessions
            markProgress(state);
            
            // INACTIVITY: Reset activity timer - User is typing!
            state.lastActivityTime = Date.now();
            state.inactivityWarningSent = false; // Reset warning flag
            console.log('[Inactivity] ⌨️ User text activity detected, timer reset');
            
            // Add to transcript
            const studentTextEntry: TranscriptEntry = {
              speaker: "student",
              text: message.message,
              timestamp: new Date().toISOString(),
              messageId: crypto.randomUUID(),
            };
            state.transcript.push(studentTextEntry);
            
            // Send transcript update to client
            ws.send(JSON.stringify({
              type: "transcript",
              speaker: "student",
              text: message.message
            }));
            
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // 👋 GOODBYE DETECTION (Text Mode) - Gracefully end session
            // Step 2: Do NOT treat recovery phrases as end-session intents
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            const textTimeSinceLastLlm = state.lastLlmRequestTime 
              ? Date.now() - state.lastLlmRequestTime 
              : Infinity;
            const textIsStalled = textTimeSinceLastLlm > 5000 && state.lastEndOfTurnTime && 
              (Date.now() - state.lastEndOfTurnTime > 5000);
            const textIsRecovery = isRecoveryPhrase(message.message);
            
            if (textIsRecovery && textIsStalled) {
              console.log(`[VOICE] 🔄 Recovery phrase detected during stall (text): "${message.message}" - treating as normal input`);
            }
            
            if (detectGoodbye(message.message) && !(textIsRecovery && textIsStalled)) {
              console.log('[Goodbye] 👋 User said goodbye (text), ending session gracefully');
              
              const goodbyeMessage = "Goodbye! Great learning with you today. Come back anytime you want to continue learning!";
              
              // Add tutor goodbye to transcript
              const tutorGoodbyeText: TranscriptEntry = {
                speaker: "tutor",
                text: goodbyeMessage,
                timestamp: new Date().toISOString(),
                messageId: crypto.randomUUID(),
              };
              state.transcript.push(tutorGoodbyeText);
              
              // Send goodbye transcript
              ws.send(JSON.stringify({
                type: "transcript",
                speaker: "tutor",
                text: goodbyeMessage
              }));
              
              // Generate and send goodbye audio
              if (state.tutorAudioEnabled) {
                try {
                  const goodbyeAudio = await generateSpeech(goodbyeMessage, state.ageGroup, state.speechSpeed);
                  if (goodbyeAudio && goodbyeAudio.length > 0) {
                    ws.send(JSON.stringify({
                      type: "audio",
                      data: goodbyeAudio.toString("base64"),
                      mimeType: "audio/pcm;rate=16000"
                    }));
                    console.log('[Goodbye] 🔊 Sent goodbye audio (text mode)');
                  }
                } catch (audioError) {
                  console.error('[Goodbye] ❌ Error generating goodbye audio (text):', audioError);
                }
              }
              
              // End session after audio plays
              setTimeout(async () => {
                console.log('[Goodbye] 🛑 Ending session (text mode)');
                clearInterval(persistInterval);
                
                if (state.inactivityTimerId) {
                  clearInterval(state.inactivityTimerId);
                  state.inactivityTimerId = null;
                }
                if (state.watchdogTimerId) {
                  clearInterval(state.watchdogTimerId);
                  state.watchdogTimerId = null;
                }
                state.watchdogDisabled = true;
                
                try {
                  ws.send(JSON.stringify({
                    type: 'session_ended',
                    reason: 'user_goodbye',
                    message: 'Session ended - user said goodbye'
                  }));
                  
                  await finalizeSession(state, 'normal');
                  ws.close(1000, 'Session ended - user said goodbye');
                  console.log('[Goodbye] ✅ Session ended successfully (text mode)');
                } catch (error) {
                  console.error('[Goodbye] ❌ Error ending session (text):', error);
                  ws.close(1011, 'Error ending session');
                }
              }, 4000); // 4 second delay for audio to play
              
              state.isSessionEnded = true;
              break; // Exit the switch, don't process further
            }
            
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // 🛡️ SAFETY CHECK (Text Mode) - Process safety concerns
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            const safetyResult = await processSafetyCheck(message.message, state, ws);
            
            if (safetyResult.shouldBlock && safetyResult.tutorResponse) {
              console.log(`[Safety] 🛡️ Blocking input, responding with safety message`);
              
              // Add tutor response to transcript
              const safetyEntry: TranscriptEntry = {
                speaker: "tutor",
                text: safetyResult.tutorResponse,
                timestamp: new Date().toISOString(),
                messageId: crypto.randomUUID(),
              };
              state.transcript.push(safetyEntry);
              
              // Send transcript update
              ws.send(JSON.stringify({
                type: "transcript",
                speaker: "tutor",
                text: safetyResult.tutorResponse
              }));
              
              // Generate and send audio
              if (state.tutorAudioEnabled) {
                try {
                  const safetyAudio = await generateSpeech(safetyResult.tutorResponse, state.ageGroup, state.speechSpeed);
                  if (safetyAudio && safetyAudio.length > 0) {
                    ws.send(JSON.stringify({
                      type: "audio",
                      data: safetyAudio.toString("base64"),
                      mimeType: "audio/pcm;rate=16000"
                    }));
                  }
                } catch (audioError) {
                  console.error('[Safety] ❌ Error generating safety response audio:', audioError);
                }
              }
              
              // If session should terminate, end it
              if (safetyResult.shouldTerminate) {
                console.log('[Safety] 🛑 Terminating session for safety (text mode)');
                
                setTimeout(async () => {
                  clearInterval(persistInterval);
                  
                  if (state.inactivityTimerId) {
                    clearInterval(state.inactivityTimerId);
                    state.inactivityTimerId = null;
                  }
                  if (state.watchdogTimerId) {
                    clearInterval(state.watchdogTimerId);
                    state.watchdogTimerId = null;
                  }
                  state.watchdogDisabled = true;
                  
                  try {
                    ws.send(JSON.stringify({
                      type: 'session_ended',
                      reason: 'safety_termination',
                      message: 'Session ended due to conduct policy'
                    }));
                    
                    await finalizeSession(state, 'safety');
                    ws.close(1000, 'Session ended - safety policy');
                    console.log('[Safety] ✅ Session terminated successfully (text mode)');
                  } catch (error) {
                    console.error('[Safety] ❌ Error terminating session:', error);
                    ws.close(1011, 'Error ending session');
                  }
                }, 4000);
                
                state.isSessionEnded = true;
              }
              
              break; // Don't process further
            }
            
            // Check content moderation
            try {
              const moderation = await moderateContent(message.message);
              
              if (!moderation.isAppropriate) {
                console.warn('[Custom Voice] ⚠️ Inappropriate text content detected');
                
                // Send warning response
                const warningText = getModerationResponse('first');
                const warningEntry: TranscriptEntry = {
                  speaker: "tutor",
                  text: warningText,
                  timestamp: new Date().toISOString(),
                  messageId: crypto.randomUUID(),
                };
                state.transcript.push(warningEntry);
                
                ws.send(JSON.stringify({
                  type: "transcript",
                  speaker: "tutor",
                  text: warningText
                }));
                
                // Generate and send warning audio
                const warningAudio = await generateSpeech(warningText, state.ageGroup, state.speechSpeed);
                ws.send(JSON.stringify({
                  type: "audio",
                  data: warningAudio.toString("base64")
                }));
                
                // Record violation (non-fatal - wrap in try/catch)
                if (moderation.violationType && state.sessionId) {
                  try {
                    await db.insert(contentViolations).values({
                      userId: state.userId,
                      sessionId: state.sessionId,
                      violationType: moderation.violationType,
                      severity: moderation.severity,
                      userMessage: message.message
                    });
                  } catch (dbError) {
                    console.error('[Custom Voice] ⚠️ Failed to log text violation (non-fatal):', dbError);
                  }
                }
                
                break; // Don't process further
              }
              
              // Content approved - generate AI response (text input) with STREAMING
              // LANGUAGE: For text input, use detected language if speaking detected it,
              // otherwise use selected language
              const textResponseLanguage = state.detectedLanguage || state.language;
              
              state.playbackGenId++;
              cancelBargeInCandidate(state, 'new_tutor_response_text', ws);
              state.isTutorSpeaking = true;
              state.isTutorThinking = true;
              state.currentPlaybackMode = 'tutor_speaking';
              state.tutorAudioStartMs = 0;
              state.lastAudioSentAt = Date.now();
              
              const textLlmAc = new AbortController();
              const textTtsAc = new AbortController();
              state.llmAbortController = textLlmAc;
              state.ttsAbortController = textTtsAc;
              
              console.log(JSON.stringify({ event: 'tutor_reply_started', session_id: state.sessionId, gen_id: state.playbackGenId, input: 'text' }));
              
              // WATCHDOG: Text mode LLM response is valid progress
              markProgress(state);
              
              // Track streaming metrics
              let textSentenceCount = 0;
              let textTotalAudioBytes = 0;
              const textStreamStart = Date.now();
              
              // Use streaming with sentence-by-sentence TTS for text input too
              await new Promise<void>((textResolve, textReject) => {
                const textCallbacks: StreamingCallbacks = {
                  onSentence: async (sentence: string) => {
                    textSentenceCount++;
                    
                    // WATCHDOG: Each sentence in text mode is progress
                    markProgress(state);
                    
                    // ── VISUAL TAG PARSER (text mode) ────────────────────────
                    const textVisualMatch = sentence.match(/\[VISUAL:\s*([a-z0-9_]+)\]/i);
                    if (textVisualMatch) {
                      const visualTag = textVisualMatch[1].toLowerCase();
                      sentence = sentence.replace(textVisualMatch[0], '').trim();
                      console.log(`[Visual] 📊 Triggering visual (text mode): ${visualTag} session=${state.sessionId?.substring(0,8)}`);
                      ws.send(JSON.stringify({ type: 'show_visual', visualTag }));
                    }
                    // ── END VISUAL TAG PARSER ────────────────────────────────
                    
                    console.log(`[Custom Voice] 📤 Text sentence ${textSentenceCount}: "${sentence.substring(0, 50)}..."`);
                    
                    if (textSentenceCount === 1) {
                      // Send first sentence with partial flag
                      ws.send(JSON.stringify({
                        type: "transcript",
                        speaker: "tutor",
                        text: sentence,
                        isPartial: true,
                      }));
                    } else {
                      // Update transcript with accumulated text
                      ws.send(JSON.stringify({
                        type: "transcript_update",
                        speaker: "tutor",
                        text: sentence,
                      }));
                    }
                    
                    // Generate TTS for this sentence immediately
                    if (state.tutorAudioEnabled) {
                      try {
                        const audioBuffer = await generateSpeech(sentence, state.ageGroup, state.speechSpeed);
                        textTotalAudioBytes += audioBuffer.length;
                        
                        console.log(`[Custom Voice] 🔊 Text sentence ${textSentenceCount} TTS: ${audioBuffer.length} bytes`);
                        
                        if (state.ttsAbortController?.signal.aborted) {
                          console.log(JSON.stringify({ event: 'audio_dropped_stale_gen', session_id: state.sessionId, sentence: textSentenceCount }));
                          return;
                        }
                        if (!state.tutorAudioPlaying) {
                          state.tutorAudioPlaying = true;
                          state.tutorAudioStartMs = Date.now();
                          if (!state.bargeInCandidate.isActive || state.bargeInCandidate.stage === 'idle') {
                            cancelBargeInCandidate(state, 'first_audio_chunk_text', ws);
                          } else {
                            console.log(`[BargeIn] preserved_active_candidate_on_audio_start stage=${state.bargeInCandidate.stage} rms=${state.bargeInCandidate.peakRms.toFixed(4)} path=text`);
                          }
                          console.log(`[Phase] tutorAudioPlaying=true genId=${state.playbackGenId} session=${state.sessionId?.substring(0, 8) || 'unknown'} input=text`);
                        }
                        ws.send(JSON.stringify({
                          type: "audio",
                          data: audioBuffer.toString("base64"),
                          mimeType: "audio/pcm;rate=16000",
                          isChunk: true,
                          chunkIndex: textSentenceCount,
                          genId: state.playbackGenId,
                        }));
                      } catch (ttsError) {
                        console.error(`[Custom Voice] ❌ Text TTS error for sentence ${textSentenceCount}:`, ttsError);
                      }
                    }
                  },
                  
                  onComplete: (fullText: string) => {
                    const textStreamMs = Date.now() - textStreamStart;
                    state.isTutorThinking = false;
                    
                    // WATCHDOG: Text mode response complete is progress
                    markProgress(state);
                    
                    console.log(`[Custom Voice] ⏱️ Text streaming complete: ${textStreamMs}ms, ${textSentenceCount} sentences`);
                    
                    // ── STRIP VISUAL TAGS from full text before saving to history/transcript ──
                    const normalizedTextContent = (fullText ?? "").trim().replace(/\[VISUAL:\s*[a-z0-9_]+\]/gi, '').replace(/\s{2,}/g, ' ').trim();
                    const textWasAborted = textLlmAc.signal.aborted || textTtsAc.signal.aborted;
                    if (normalizedTextContent.length === 0 || textWasAborted || textSentenceCount === 0) {
                      console.warn(`[LLM] Aborted/empty assistant response (text mode) — not saving to history reason=${textWasAborted ? 'aborted' : 'empty'} sentences=${textSentenceCount}`);
                      textResolve();
                      return;
                    }
                    
                    console.log(`[Custom Voice] 🤖 Tutor (text): "${normalizedTextContent}"`);
                    
                    state.conversationHistory.push(
                      { role: "user", content: message.message },
                      { role: "assistant", content: normalizedTextContent }
                    );
                    
                    // Add AI response to transcript (internal state)
                    const tutorTextEntry: TranscriptEntry = {
                      speaker: "tutor",
                      text: normalizedTextContent,
                      timestamp: new Date().toISOString(),
                      messageId: crypto.randomUUID(),
                    };
                    state.transcript.push(tutorTextEntry);
                    
                    // Send final complete transcript
                    ws.send(JSON.stringify({
                      type: "transcript",
                      speaker: "tutor",
                      text: normalizedTextContent,
                      isComplete: true,
                    }));
                    
                    textResolve();
                  },
                  
                  onError: (error: Error) => {
                    console.error("[Custom Voice] ❌ Text streaming error:", error);
                    textReject(error);
                  }
                };
                
                const textHistBefore = state.conversationHistory.length;
                state.conversationHistory = state.conversationHistory.filter(msg => {
                  if (msg.role === 'assistant' && (!msg.content || msg.content.trim() === '')) {
                    return false;
                  }
                  return true;
                });
                const textRemoved = textHistBefore - state.conversationHistory.length;
                if (textRemoved > 0) {
                  console.log(`[History] defensive_filter removed=${textRemoved} empty assistant messages before text Claude call`);
                }

                generateTutorResponseStreaming(
                  state.conversationHistory,
                  message.message,
                  state.uploadedDocuments,
                  textCallbacks,
                  state.systemInstruction,
                  "text",
                  textResponseLanguage,
                  state.ageGroup,
                  textLlmAc.signal,
                  state.useFallbackLLM
                ).then(() => {
                  // Check if fallback was triggered during this call
                  if ((textCallbacks as any)._fallbackUsed && !state.useFallbackLLM) {
                    state.useFallbackLLM = true;
                    console.log(`[LLM Fallback] 🔄 Switching to OpenAI for rest of session ${state.sessionId}`);
                  }
                }).catch(textReject);
              });
              
              console.log(`[Custom Voice] 🔊 Sent streamed tutor voice response (${textSentenceCount} chunks)`);
              
              // Reset tutor speaking state after streaming completes
              state.isTutorSpeaking = false;
              
            } catch (error) {
              console.error('[Custom Voice] Error processing text message:', error);
            }
            break;

          case "document_uploaded":
            // Handle document uploaded during session
            console.log(`[Custom Voice] 📄 Document uploaded during session: ${message.filename}`);
            
            try {
              // Fetch document with chunks from database
              const document = await storage.getDocument(message.documentId, state.userId);
              
              if (document) {
                // Fetch chunks separately
                const chunks = await db
                  .select()
                  .from(documentChunks)
                  .where(eq(documentChunks.documentId, message.documentId))
                  .orderBy(documentChunks.chunkIndex);
                
                if (chunks && chunks.length > 0) {
                  // Format document content
                  const documentContent = `[Document: ${message.filename}]\n${chunks.map((chunk: { content: string }) => chunk.content).join('\n')}`;
                  
                  // Add to session's uploaded documents
                  state.uploadedDocuments.push(documentContent);
                  
                  console.log(`[Custom Voice] ✅ Added document to session context (${chunks.length} chunks)`);
                  
                  // CRITICAL: Rebuild system instruction to include the new document
                  // This ensures the AI knows about the document on subsequent turns
                  const personality = getTutorPersonality(state.ageGroup);
                  const docTitles = state.uploadedDocuments.map((doc, i) => {
                    const titleMatch = doc.match(/^\[Document: ([^\]]+)\]/);
                    return titleMatch ? titleMatch[1] : `Document ${i + 1}`;
                  });
                  
                  // NO-GHOSTING FIX: Calculate actual content for mid-session upload
                  const midSessionRagChars = state.uploadedDocuments.reduce((sum, doc) => {
                    const content = doc.replace(/^\[Document: [^\]]+\]\n/, '');
                    return sum + content.length;
                  }, 0);
                  const hasMidSessionContent = midSessionRagChars > 0;
                  
                  console.log(`[Custom Voice] 📄 Mid-session doc check: ragChars=${midSessionRagChars}, hasContent=${hasMidSessionContent}`);
                  
                  // Update system instruction with document awareness - only if content exists
                  if (hasMidSessionContent) {
                    state.systemInstruction = `${personality.systemPrompt}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📚 DOCUMENTS LOADED FOR THIS SESSION (${midSessionRagChars} chars):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Document content is available: ${docTitles.join(', ')}

DOCUMENT ACCESS INSTRUCTIONS:
✅ You have actual document content loaded - reference it directly
✅ Help with the specific homework/problems in their uploaded materials
✅ Quote or paraphrase specific text from the documents when relevant
✅ If asked about unique markers or specific text, read from the actual content

PROOF REQUIREMENT:
When the student asks if you can see their document or asks you to prove access:
- You MUST quote or paraphrase a specific line, sentence, or phrase from the document
- NEVER make up or guess content - only reference what is actually in the loaded text

DOCUMENT ACKNOWLEDGMENT RULE:
- Do NOT list or re-announce document names. Reference the content directly.
- Focus on helping with the material, not on describing what files are loaded.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${STT_ARTIFACT_HARDENING}`;
                  } else {
                    console.log(`[Custom Voice] ⚠️ Mid-session upload has no content - not claiming access`);
                  }
                  
                  console.log(`[Custom Voice] 📚 System instruction updated with ${state.uploadedDocuments.length} documents`);
                  
                  // Send acknowledgment via voice — content-focused, no filename listing
                  const ackMessage = `I've loaded your new document. What would you like to work on from it?`;
                  
                  // Add to transcript
                  const ackEntry: TranscriptEntry = {
                    speaker: "tutor",
                    text: ackMessage,
                    timestamp: new Date().toISOString(),
                    messageId: crypto.randomUUID(),
                  };
                  state.transcript.push(ackEntry);
                  
                  // Send transcript update
                  ws.send(JSON.stringify({
                    type: "transcript",
                    speaker: "tutor",
                    text: ackMessage
                  }));
                  
                  // Generate and send voice acknowledgment
                  const ackAudio = await generateSpeech(ackMessage, state.ageGroup, state.speechSpeed);
                  ws.send(JSON.stringify({
                    type: "audio",
                    data: ackAudio.toString("base64")
                  }));
                  
                  console.log(`[Custom Voice] 🔊 Sent document acknowledgment`);
                } else {
                  console.error(`[Custom Voice] Document has no chunks: ${message.documentId}`);
                }
              } else {
                console.error(`[Custom Voice] Document not found: ${message.documentId}`);
              }
            } catch (error) {
              console.error('[Custom Voice] Error adding document to session:', error);
            }
            break;

          case "speech_detected":
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // BARGE-IN: Handle client-side VAD speech detection
            // Client already validated this is real user speech (not echo)
            // so we trust this signal and update server state
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            const timeSinceAudioForVAD = Date.now() - state.lastAudioSentAt;
            const isClientBargeIn = message.bargeIn === true;

            // Only process if tutor was speaking recently
            if (state.isTutorSpeaking && timeSinceAudioForVAD < 30000) {
              console.log(`[Custom Voice] 🛑 BARGE-IN via client VAD (audio sent ${timeSinceAudioForVAD}ms ago, clientBargeIn=${isClientBargeIn})`);

              if (isClientBargeIn && (state.phase === 'TUTOR_SPEAKING' || state.phase === 'AWAITING_RESPONSE')) {
                // Client already stopped audio locally — now abort LLM/TTS on server
                hardInterruptTutor(ws, state, 'client_vad_barge_in');
                console.log("[Custom Voice] ✅ Client barge-in: LLM/TTS aborted via hardInterruptTutor");
              } else {
                // Legacy path: just sync state
                state.wasInterrupted = true;
                state.lastInterruptionTime = Date.now();
                state.isTutorSpeaking = false;

                ws.send(JSON.stringify({
                  type: "interrupt",
                  message: "Student speaking (VAD)",
                }));

                console.log("[Custom Voice] ✅ VAD barge-in processed (state sync only)");
              }
            } else if (timeSinceAudioForVAD < 30000) {
              // Audio was sent recently but isTutorSpeaking is false
              // This means client already stopped playback, just sync state
              console.log(`[Custom Voice] ℹ️ speech_detected received (tutor not speaking, syncing state)`);
              state.isTutorSpeaking = false;
            }
            break;

          case "update_mode":
            // Handle communication mode updates (voice, hybrid, text-only)
            console.log("[Custom Voice] 🔄 Updating mode:", {
              tutorAudio: message.tutorAudio,
              studentMic: message.studentMic
            });
            
            // Update state
            state.tutorAudioEnabled = message.tutorAudio ?? true;
            state.studentMicEnabled = message.studentMic ?? true;
            
            // Send acknowledgment
            ws.send(JSON.stringify({
              type: "mode_updated",
              tutorAudio: state.tutorAudioEnabled,
              studentMic: state.studentMicEnabled
            }));
            
            console.log("[Custom Voice] ✅ Mode updated:", {
              tutorAudio: state.tutorAudioEnabled ? 'enabled' : 'muted',
              studentMic: state.studentMicEnabled ? 'enabled' : 'muted'
            });
            break;
          
          case "activity_mode_update":
            // Handle activity mode changes for reading patience overlay
            if (isReadingModeEnabled() && message.activityMode) {
              const newMode = message.activityMode as ActivityMode;
              setActivityMode(state.turnPolicyState, newMode);
              console.log(`[Custom Voice] 📖 Activity mode updated to: ${newMode}`);
              
              // Acknowledge the update
              ws.send(JSON.stringify({
                type: "activity_mode_updated",
                activityMode: newMode,
              }));
            }
            break;
          
          case "barge_in_event":
            // Server-side logging for client barge-in events
            if (isAdaptiveBargeInEnabled() && message.evaluation) {
              const eval_ = message.evaluation;
              // Build BargeInEvalResult object from client event data
              const bargeInResult: BargeInEvalResult = {
                triggered: eval_.outcome === 'confirmed' || eval_.outcome === 'ducked',
                adaptiveTriggered: eval_.outcome === 'confirmed' || eval_.outcome === 'ducked',
                absoluteTriggered: false,
                reason: eval_.outcome || 'unknown',
                rms: eval_.inputEnergy || 0,
                peak: eval_.inputEnergy || 0,
                baseline: eval_.baselineRms || 0,
                adaptiveThreshold: eval_.threshold || 0,
              };
              logBargeInEval(
                state.sessionId,
                normalizeGradeBand(state.ageGroup || 'G6-8'),
                'tutoring' as ActivityMode, // Default activity mode
                bargeInResult,
                eval_.duckGain !== undefined, // duckApplied
                eval_.outcome === 'confirmed', // confirmedInterrupt
                eval_.outcome === 'confirmed' || eval_.outcome === 'ducked' // stoppedPlayback
              );
            }
            break;
          
          case "pong":
            state.lastPongAt = new Date();
            state.missedPongCount = 0;
            state.lastHeartbeatAt = new Date();
            markProgress(state);
            break;
          
          case "client_visibility":
            // Client reports visibility state (hidden/visible) for reconnect handling
            const visibility = message.visibility as 'visible' | 'hidden';
            state.lastClientVisibility = visibility;
            console.log(`[Custom Voice] 👁️ Client visibility changed: ${visibility}`);
            // Update heartbeat tracking on visibility change
            state.lastHeartbeatAt = new Date();
            break;
          
          case "client_end_intent":
            // Client announces end intent before WS closes (used for telemetry)
            const intent = message.intent || 'user_end';
            state.clientEndIntent = intent;
            console.log(`[Custom Voice] 📝 Client end intent received: ${intent}`);
            break;

          case "end":
            console.log(`[VOICE_END] received end_session user_id=${state.userId} session_id=${state.sessionId}`);

            if (state.isSessionEnded) {
              console.log("[VOICE_END] session already ended — skipping duplicate end");
              break;
            }

            state.clientEndIntent = 'user_clicked_end';

            // Stop STT
            if (state.sttDeadmanTimerId) { clearInterval(state.sttDeadmanTimerId); state.sttDeadmanTimerId = null; }
            if (state.sttReconnectTimerId) { clearTimeout(state.sttReconnectTimerId); state.sttReconnectTimerId = null; }
            
            let sttClosed = false;
            if (USE_ASSEMBLYAI && state.assemblyAIWs) {
              closeAssemblyAI(state.assemblyAIWs);
              if (state.assemblyAIState) resetAssemblyAIMergeGuard(state.assemblyAIState);
              state.assemblyAIWs = null;
              state.assemblyAIState = null;
              sttClosed = true;
            } else if (state.deepgramConnection) {
              state.deepgramConnection.close();
              state.deepgramConnection = null;
              sttClosed = true;
            }

            // Stop LLM + TTS
            if (state.llmAbortController) {
              state.llmAbortController.abort();
              state.llmAbortController = null;
            }
            if (state.ttsAbortController) {
              state.ttsAbortController.abort();
              state.ttsAbortController = null;
            }

            // Clear intervals
            clearInterval(persistInterval);
            clearInterval(heartbeatInterval);

            // Finalize
            try {
              const endCloseDetails: CloseDetails = {
                triggeredBy: 'client',
                clientIntent: 'user_clicked_end',
              };
              await finalizeSession(state, 'normal', undefined, endCloseDetails);
            } catch (error) {
              console.error("[VOICE_END] finalizeSession error:", error);
            }

            // ACK
            ws.send(JSON.stringify({ 
              type: "session_ended",
              sessionId: state.sessionId,
              transcriptLength: state.transcript.length,
              success: true
            }));
            
            console.log(`[VOICE_END] sttClosed=${sttClosed} ttsCanceled=true audioForwardingStopped=true session_ended_sent=true`);
            
            ws.close(1000, 'Session ended normally');
            console.log(`[VOICE_END] wsClosed=true session_id=${state.sessionId}`);
            break;

          default:
            console.warn("[Custom Voice] ⚠️ Unknown message type:", message.type);
        }
      } catch (error) {
        console.error("[Custom Voice] ❌ Error handling message:", error);
        ws.send(JSON.stringify({ 
          type: "error", 
          error: error instanceof Error ? error.message : "Unknown error"
        }));
      }
    });

    ws.on("close", async (code: number, reason: Buffer) => {
      const reasonStr = reason?.toString() || 'none';
      console.log(`[Custom Voice] 🔌 Connection closed - code: ${code}, reason: "${reasonStr}"`);
      
      // Skip if session was already ended (prevents double-deduction)
      if (state.isSessionEnded) {
        console.log("[Custom Voice] ℹ️ Session already finalized, skipping close handler");
        return;
      }
      
      // Clear response timer
      if (responseTimer) {
        clearTimeout(responseTimer);
        responseTimer = null;
      }
      
      cancelBargeInCandidate(state, 'ws_close', ws);
      if (state.sttDeadmanTimerId) { clearInterval(state.sttDeadmanTimerId); state.sttDeadmanTimerId = null; }
      if (state.sttReconnectTimerId) { clearTimeout(state.sttReconnectTimerId); state.sttReconnectTimerId = null; }
      
      // Close STT connection (pause audio pipeline, but don't destroy session state yet)
      if (USE_ASSEMBLYAI && state.assemblyAIWs) {
        closeAssemblyAI(state.assemblyAIWs);
        if (state.assemblyAIState) resetAssemblyAIMergeGuard(state.assemblyAIState);
        state.assemblyAIWs = null;
        state.assemblyAIState = null;
      } else if (state.deepgramConnection) {
        state.deepgramConnection.close();
        state.deepgramConnection = null;
      }
      
      // ============================================
      // RECONNECT GRACE WINDOW LOGIC
      // For abnormal closes (1006/1001) without explicit user end intent,
      // enter grace window instead of immediate finalization
      // ============================================
      const hasExplicitUserEnd = state.clientEndIntent === 'user_end' || state.clientEndIntent === 'user_clicked_end';
      const isNormalClose = code === 1000;
      const qualifiesForGrace = isAbnormalClose(code) && !hasExplicitUserEnd && state.sessionId;
      
      if (qualifiesForGrace) {
        clearInterval(heartbeatInterval);
        if (state.watchdogTimerId) {
          clearInterval(state.watchdogTimerId);
          state.watchdogTimerId = null;
        }
        state.watchdogDisabled = true;
        console.log(`[Custom Voice] 🕐 Abnormal close (code: ${code}) - entering grace window for session ${state.sessionId}`);
        createPendingReconnect(state.sessionId, state, code, persistInterval);
        return; // Exit without finalizing
      }
      
      // Normal close or explicit user end - finalize immediately
      clearInterval(persistInterval);
      clearInterval(heartbeatInterval);
      if (state.watchdogTimerId) {
        clearInterval(state.watchdogTimerId);
        state.watchdogTimerId = null;
      }
      state.watchdogDisabled = true;
      
      // Determine close reason based on WS code and client intent
      let closeReason: 'normal' | 'disconnect' = 'disconnect';
      if (isNormalClose || hasExplicitUserEnd) {
        closeReason = 'normal';
      }
      
      // Pass close details for telemetry
      const closeDetails: CloseDetails = {
        wsCloseCode: code,
        wsCloseReason: reasonStr,
        triggeredBy: state.clientEndIntent ? 'client' : 'server',
        clientIntent: state.clientEndIntent,
      };
      
      // Cancel any pending reconnect for this session (in case of race condition)
      if (state.sessionId) {
        cancelPendingReconnect(state.sessionId);
      }
      
      // Finalize session with close details (saves to DB, deducts minutes)
      await finalizeSession(state, closeReason, undefined, closeDetails);
    });

    ws.on("error", async (error) => {
      console.error("[Custom Voice] ❌ WebSocket error:", error);
      
      // Skip if session was already ended (prevents double-deduction)
      if (state.isSessionEnded) {
        console.log("[Custom Voice] ℹ️ Session already finalized, skipping error handler");
        return;
      }
      
      // Close STT connection first
      if (USE_ASSEMBLYAI && state.assemblyAIWs) {
        closeAssemblyAI(state.assemblyAIWs);
        if (state.assemblyAIState) resetAssemblyAIMergeGuard(state.assemblyAIState);
        state.assemblyAIWs = null;
        state.assemblyAIState = null;
      } else if (state.deepgramConnection) {
        state.deepgramConnection.close();
        state.deepgramConnection = null;
      }
      
      // Clear intervals before finalizing (inactivity timer cleared in finalizeSession)
      clearInterval(persistInterval);
      if (responseTimer) {
        clearTimeout(responseTimer);
        responseTimer = null;
      }
      
      // Finalize session with error message (saves to DB, deducts minutes)
      await finalizeSession(state, 'error', error instanceof Error ? error.message : 'Unknown error');
    });
  });

  return wss;
}