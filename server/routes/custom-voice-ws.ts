import { WebSocketServer, WebSocket } from "ws";
import { Server } from 'http';
import { IncomingMessage } from 'http';
import { Socket } from 'net';
import { startDeepgramStream, DeepgramConnection } from "../services/deepgram-service";
import { generateTutorResponse, generateTutorResponseStreaming, StreamingCallbacks } from "../services/ai-service";
import { generateSpeech } from "../services/tts-service";
import { db } from "../db";
import { realtimeSessions, contentViolations, userSuspensions, documentChunks } from "@shared/schema";
import { eq, and, or, gte } from "drizzle-orm";
import { getTutorPersonality } from "../config/tutor-personalities";
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

function createAssemblyAIConnection(
  language: string,
  onTranscript: (text: string, endOfTurn: boolean, confidence: number) => void,
  onError: (error: string) => void,
  onSessionStart?: (sessionId: string) => void,
  onClose?: () => void
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
  const speechModel = language === 'es' || language === 'spanish' || language === 'espanol'
    ? 'universal-streaming-multi'
    : 'universal-streaming-english';
  
  // Get token and connect asynchronously
  // For now, create a placeholder WebSocket that we'll replace
  const dummyUrl = 'wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&encoding=pcm_s16le';
  let ws: WebSocket;
  
  try {
    // First try with header-based auth (simpler, works for server-side)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // AssemblyAI v3 end-of-turn configuration for BALANCED profile
    // These settings allow students time to think (1-3+ second pauses)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // NOISE ROBUSTNESS: Conservative AssemblyAI parameters
    // Tuned for noisy environments (background noise, siblings, TV)
    // Higher confidence threshold + longer silence = fewer false triggers
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const urlParams = new URLSearchParams({
      sample_rate: '16000',
      encoding: 'pcm_s16le',
      speech_model: speechModel,
      format_turns: 'true',
      // End-of-turn detection: CONSERVATIVE for noisy environments
      end_of_turn_confidence_threshold: '0.72',  // Up from 0.65 - require higher confidence
      min_end_of_turn_silence_when_confident: '1200',  // Up from 1000ms - more silence required
      max_turn_silence: '5500',  // Up from 5000ms - allow more thinking time
    });
    
    const wsUrl = `wss://streaming.assemblyai.com/v3/ws?${urlParams.toString()}`;
    console.log('[AssemblyAI v3] 🌐 Connecting to:', wsUrl);
    console.log('[AssemblyAI v3] Speech model:', speechModel);
    
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

        console.log('[AssemblyAI v3] 📝 Turn:', {
          msgType: messageType,
          text: text.substring(0, 60) + (text.length > 60 ? '...' : ''),
          endOfTurn,
          turnIsFormatted,
          confidence: typeof confidence === 'number' ? confidence.toFixed(2) : confidence,
          turnOrder: msg.turn_order,
          hypothesisLen: text.length,
          confirmedLen: confirmedTranscript.length,
        });

        // REPLACE, don't append - v3 gives us the complete transcript each time
        if (text) {
          confirmedTranscript = text;
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // CRITICAL FIX (Dec 23, 2025): Wait for FORMATTED transcript
        // With format_turns=true, AssemblyAI sends TWO end_of_turn messages:
        //   1. Unformatted: "spanish" (end_of_turn=true, turn_is_formatted=false)
        //   2. Formatted: "Spanish." (end_of_turn=true, turn_is_formatted=true)
        // Previously BOTH were sent to Claude, causing "spanish Spanish."
        // FIX: Only fire callback when turn_is_formatted=true
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        if (endOfTurn && confirmedTranscript) {
          // If format_turns is enabled, wait for the formatted version
          if (!turnIsFormatted) {
            console.log('[AssemblyAI v3] ⏳ End of turn (unformatted) - waiting for formatted version:', confirmedTranscript);
            // Don't reset confirmedTranscript - the formatted version will replace it
            return;
          }
          
          console.log('[AssemblyAI v3] ✅ End of turn (formatted) - sending to Claude:', confirmedTranscript);
          
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
          
          // Fire callback with the confirmed, formatted transcript
          onTranscript(confirmedTranscript, true, confidence);
          
          // Reset for next turn
          confirmedTranscript = '';
          
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

  ws.on('close', (code, reason) => {
    clearTimeout(handshakeTimeout);
    const reasonStr = reason?.toString() || '';
    console.log('[AssemblyAI v3] 🔌 WebSocket CLOSED - code:', code, 'reason:', reasonStr);
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

function sendAudioToAssemblyAI(ws: WebSocket | null, audioBuffer: Buffer, state?: AssemblyAIState): boolean {
  if (!ws) {
    console.warn('[AssemblyAI] ⚠️ sendAudio: No WebSocket connection');
    return false;
  }
  
  // If still connecting, buffer the audio
  if (ws.readyState === WebSocket.CONNECTING) {
    if (state && state.audioBuffer.length < MAX_AUDIO_BUFFER_SIZE) {
      state.audioBuffer.push(audioBuffer);
      if (state.audioBuffer.length === 1) {
        console.log('[AssemblyAI] 📦 Buffering audio while connecting...');
      }
      return true; // Consider it sent (buffered)
    }
    return false;
  }
  
  if (ws.readyState !== WebSocket.OPEN) {
    // Log EVERY 10th failure to see the actual error without spam
    if (!didLogFirstAssemblyAIAudio) {
      console.warn('████████████████████████████████████████████████████████████████');
      console.warn('[AssemblyAI] ❌ WS NOT OPEN! readyState:', ws.readyState, 
        '(0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)');
      if (state) {
        console.warn('[AssemblyAI] lastError:', state.lastError);
        console.warn('[AssemblyAI] closeCode:', state.closeCode, 'closeReason:', state.closeReason);
        console.warn('[AssemblyAI] isOpen flag:', state.isOpen);
      }
      console.warn('████████████████████████████████████████████████████████████████');
      didLogFirstAssemblyAIAudio = true; // Prevent spam
    }
    return false;
  }
  
  if (!didLogFirstAssemblyAIAudio) {
    console.log('[AssemblyAI] 🎵 First audio chunk bytes:', audioBuffer.length);
    didLogFirstAssemblyAIAudio = true;
  }
  ws.send(audioBuffer);
  return true;
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

interface SessionState {
  sessionId: string;
  userId: string;
  studentName: string;
  ageGroup: string;
  subject: string; // SESSION: Tutoring subject (Math, English, Science, etc.)
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
  parentEmail?: string; // SAFETY: Parent email for alerts
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
}

// Helper to send typed WebSocket events
function sendWsEvent(ws: WebSocket, type: string, payload: Record<string, unknown>) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, ...payload }));
    console.log(`[WS Event] ${type}`, payload.turnId || '');
  }
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

  // Mark as ended FIRST to prevent race conditions
  state.isSessionEnded = true;
  
  // Track failures for reconciliation
  let minuteDeductionFailed = false;
  let dbWriteFailed = false;
  
  // CRITICAL: Clear inactivity timer to prevent duplicate finalization
  if (state.inactivityTimerId) {
    clearInterval(state.inactivityTimerId);
    state.inactivityTimerId = null;
    console.log(`[Finalize] 🧹 Cleared inactivity timer (reason: ${reason})`);
  }
  
  // K2 TURN POLICY: Clear stall escape timer
  if (state.stallEscapeTimerId) {
    clearTimeout(state.stallEscapeTimerId);
    state.stallEscapeTimerId = null;
    console.log(`[Finalize] 🧹 Cleared stall escape timer (reason: ${reason})`);
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
        parentName: users.parentName,
        emailSummaryFrequency: users.emailSummaryFrequency,
      })
      .from(users)
      .where(eq(users.id, state.userId))
      .limit(1);
      
      const parent = parentResult[0];
      
      if (parent?.email) {
        // Resolve transcript email destination (transcript_email ?? login email)
        const destinationEmail = parent.transcriptEmail || parent.email;
        const emailSource = parent.transcriptEmail ? 'transcript_email' : 'fallback_email';
        
        // Check user's email preference before sending
        const emailFrequency = parent.emailSummaryFrequency || 'daily';
        
        if (emailFrequency === 'off') {
          console.log(`[Custom Voice] ℹ️ Email summaries disabled for ${parent.email}`);
        } else if (emailFrequency === 'per_session') {
          // Send immediately only for 'per_session' preference
          const emailService = new EmailService();
          
          // Use subject from session state
          const sessionSubject = state.subject || 'General';
          
          // Filter and sanitize transcript: remove empty texts and map roles
          const sanitizedTranscript = state.transcript
            .filter(t => t.text && t.text.trim().length > 0)
            .map(t => ({
              role: t.speaker === 'student' ? 'user' : 'assistant',
              text: t.text.trim()
            }));
          
          console.log(`[Custom Voice] Email destination: user_id=${state.userId}, to=${destinationEmail}, reason=${emailSource}`);
          
          await emailService.sendSessionSummary({
            parentEmail: destinationEmail,
            parentName: parent.parentName || '',
            studentName: state.studentName || 'Your child',
            subject: sessionSubject,
            gradeLevel: state.ageGroup || 'K-12',
            duration: durationMinutes,
            messageCount: sanitizedTranscript.length,
            transcript: sanitizedTranscript,
            sessionDate: new Date()
          });
          
          console.log(`[Custom Voice] ✉️ Parent summary email sent to ${destinationEmail}`);
        } else {
          // 'daily' or 'weekly' - let cron job handle it
          console.log(`[Custom Voice] ℹ️ Email will be sent via ${emailFrequency} digest for ${destinationEmail} (${emailSource})`);
        }
      }
    } catch (emailError) {
      // Don't fail the session if email fails
      console.error('[Custom Voice] ⚠️ Failed to send parent email:', emailError);
    }
  } else {
    console.log(`[Custom Voice] ℹ️ Skipping parent email (duration: ${durationSeconds}s, messages: ${state.transcript.length})`);
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
      rejectWsUpgrade(socket, 429, rateLimitCheck.reason || 'Too many requests');
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
        rejectWsUpgrade(socket, 401, 'Invalid trial token');
        return;
      }
      
      // Verify trial is still active
      const trial = await trialService.getTrialById(trialPayload.trialId);
      if (!trial || trial.status !== 'active') {
        console.error('[WebSocket] ❌ Trial expired or not found');
        rejectWsUpgrade(socket, 403, 'Trial expired');
        return;
      }
      
      // Check remaining time
      const consumedSeconds = trial.consumedSeconds ?? 0;
      const secondsRemaining = 300 - consumedSeconds;
      if (secondsRemaining <= 0) {
        console.error('[WebSocket] ❌ Trial time exhausted');
        rejectWsUpgrade(socket, 403, 'Trial time exhausted');
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
        rejectWsUpgrade(socket, validationResult.statusCode || 401, validationResult.error || 'Unauthorized');
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
      rejectWsUpgrade(socket, 500, 'Internal server error');
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
        
        // Clear the inactivity interval to prevent multiple triggers
        if (state.inactivityTimerId) {
          clearInterval(state.inactivityTimerId);
          state.inactivityTimerId = null;
          console.log('[Inactivity] ✅ Inactivity timer cleared');
        }
      }
      
    }, 30000); // Check every 30 seconds

    console.log('[Inactivity] ✅ Checker started (checks every 30 seconds)');

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SAFETY TIMEOUT (Dec 10, 2025): Reset stuck isProcessing flag
    // Prevents tutor from going silent forever if something fails
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    let processingStartTime: number | null = null;
    const MAX_PROCESSING_TIME_MS = 30000; // 30 seconds max before force-reset

    // FIX #1: Process queued transcripts sequentially
    async function processTranscriptQueue() {
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // SAFETY CHECK: Force reset if isProcessing has been stuck too long
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (state.isProcessing && processingStartTime) {
        const elapsed = Date.now() - processingStartTime;
        if (elapsed > MAX_PROCESSING_TIME_MS) {
          console.error(`[Pipeline] ⚠️ SAFETY RESET: isProcessing stuck for ${Math.round(elapsed/1000)}s, forcing reset`);
          state.isProcessing = false;
          processingStartTime = null;
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
      processingStartTime = Date.now();
      
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
              processingStartTime = null;
              state.isTutorSpeaking = false;
              
              // Process next item in queue if any
              if (state.transcriptQueue.length > 0 && !state.isSessionEnded) {
                setImmediate(() => processTranscriptQueue());
              }
            } catch (fallbackError) {
              console.error('[VOICE] turn_fallback_error:', fallbackError);
              state.isProcessing = false;
              processingStartTime = null;
            }
          }
          state.turnFallbackTimerId = undefined;
        }, TURN_FALLBACK_CONFIG.TIMEOUT_MS);
      }
      
      console.log(`[Pipeline] 2. Starting to process transcript, queue size: ${state.transcriptQueue.length + 1}`);
      const transcript = state.transcriptQueue.shift()!;

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
            processingStartTime = null;
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
          
          // Reject too short and low-signal transcripts (< 2 words)
          if (wordCount < 2) {
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
            processingStartTime = null;
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
            processingStartTime = null;
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
        if (coherenceConfig.enabled) {
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
            processingStartTime = null;
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
              // Increment violation count for non-critical violations
              state.violationCount++;
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
            
            // Create suspension record (24 hour suspension)
            const suspendedUntil = new Date();
            suspendedUntil.setHours(suspendedUntil.getHours() + 24);
            
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
                  : 'Session terminated - User suspended for 24 hours',
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
        
        // Track turn for interruption detection
        state.isTutorSpeaking = true;
        const turnTimestamp = Date.now();
        state.lastAudioSentAt = turnTimestamp;
        
        // ECHO GUARD: Mark playback starting
        const echoConfig = getEchoGuardConfig();
        markPlaybackStart(state.echoGuardState, echoConfig);
        logEchoGuardStateTransition('playback_start', state.echoGuardState);
        
        // Use streaming with sentence-by-sentence TTS for minimal latency
        await new Promise<void>((resolve, reject) => {
          const callbacks: StreamingCallbacks = {
            onSentence: async (sentence: string) => {
              sentenceCount++;
              const sentenceStart = Date.now();
              
              if (sentenceCount === 1) {
                firstSentenceMs = sentenceStart - claudeStart;
                console.log(`[Custom Voice] ⏱️ First sentence in ${firstSentenceMs}ms`);
                
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
                  
                  // Send audio chunk immediately
                  ws.send(JSON.stringify({
                    type: "audio",
                    data: audioBuffer.toString("base64"),
                    mimeType: "audio/pcm;rate=16000",
                    isChunk: true,
                    chunkIndex: sentenceCount,
                  }));
                } catch (ttsError) {
                  console.error(`[Custom Voice] ❌ TTS error for sentence ${sentenceCount}:`, ttsError);
                }
              }
            },
            
            onComplete: (fullText: string) => {
              const claudeMs = Date.now() - claudeStart;
              console.log(`[Pipeline] 4. Claude response received (${claudeMs}ms), generating audio...`);
              console.log(`[Custom Voice] 🤖 Tutor: "${fullText}"`);
              
              // ECHO GUARD: Record tutor utterance for echo comparison
              recordTutorUtterance(state.echoGuardState, fullText, echoConfig);
              
              // Add to conversation history
              state.conversationHistory.push(
                { role: "user", content: transcript },
                { role: "assistant", content: fullText }
              );
              
              // Add AI response to transcript (internal state)
              const aiTranscriptEntry: TranscriptEntry = {
                speaker: "tutor",
                text: fullText,
                timestamp: new Date().toISOString(),
                messageId: crypto.randomUUID(),
              };
              state.transcript.push(aiTranscriptEntry);
              
              // Send final complete transcript
              ws.send(JSON.stringify({
                type: "transcript",
                speaker: "tutor",
                text: fullText,
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
          
          generateTutorResponseStreaming(
            state.conversationHistory,
            transcript,
            state.uploadedDocuments,
            callbacks,
            state.systemInstruction,
            "voice",
            responseLanguage,
            state.ageGroup  // Step 5: College response-depth tweak
          ).catch(reject); // Ensure errors are properly propagated
        });

        console.log("[Custom Voice] 🔊 Streaming response sent, waiting for user...");

        // FIX #3: Persist after each turn (before pause to avoid blocking)
        await persistTranscript(state.sessionId, state.transcript);

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // PACING FIX: Release isProcessing BEFORE pause to allow interruptions
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        state.isProcessing = false;
        processingStartTime = null; // Clear safety timer
        console.log(`[Pipeline] 5. Audio sent to client, isProcessing=false`);
        
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
        state.isTutorSpeaking = false; // Reset on error
        
        // ECHO GUARD: Also mark playback end on error
        markPlaybackEnd(state.echoGuardState, getEchoGuardConfig());
        
        // THINKING INDICATOR: Emit tutor_error to clear thinking state
        if (state.currentTurnId) {
          sendWsEvent(ws, 'tutor_error', {
            sessionId: state.sessionId,
            turnId: state.currentTurnId,
            timestamp: Date.now(),
            message: error instanceof Error ? error.message : "Unknown error",
          });
          state.currentTurnId = null;
        }
        
        ws.send(JSON.stringify({ 
          type: "error", 
          error: error instanceof Error ? error.message : "Unknown error"
        }));
        
        // FIX #1: Process next item in queue even after error
        if (state.transcriptQueue.length > 0 && !state.isSessionEnded) {
          setImmediate(() => processTranscriptQueue());
        }
      } finally {
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // CRITICAL FIX (Dec 10, 2025): ALWAYS release processing lock
        // Ensures tutor never gets stuck silent due to unreleased locks
        // This is idempotent - safe to call even if already false
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        state.isProcessing = false;
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
        
        // HARDENED BARGE-IN (reconnected handler)
        if (state.isTutorSpeaking && timeSinceLastAudio < 30000) {
          const bargeInValidation = validateTranscriptForBargeIn(transcript);
          
          if (!bargeInValidation.isValid) {
            if (!state.bargeInDucking) {
              state.bargeInDucking = true;
              state.bargeInDuckStartTime = now;
              ws.send(JSON.stringify({ type: "duck", message: "Potential speech detected" }));
              logBargeInDecision(state.sessionId || 'unknown', 'duck', state.lastMeasuredRms, noiseFloor, bargeInValidation.wordCount, transcript, 'too_short');
            }
          } else {
            state.wasInterrupted = true;
            state.lastInterruptionTime = now;
            state.bargeInDucking = false;
            ws.send(JSON.stringify({ type: "interrupt", message: "Student is speaking" }));
            state.isTutorSpeaking = false;
            logBargeInDecision(state.sessionId || 'unknown', 'interrupt', state.lastMeasuredRms, noiseFloor, bargeInValidation.wordCount, transcript, 'lexical_validated');
          }
        }
        
        if (state.isTutorSpeaking && timeSinceLastAudio >= 30000) {
          state.isTutorSpeaking = false;
          state.bargeInDucking = false;
        }
        
        if (!isFinal) return;
        if (!transcript || transcript.trim().length < 3) return;
        
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
            // Always push to queue - queue handles serialization
            state.transcriptQueue.push(completeUtterance);
            
            // LLM WATCHDOG: Start timer (reconnected handler)
            state.lastEndOfTurnTime = Date.now();
            if (LLM_WATCHDOG_CONFIG.ENABLED && !state.isProcessing) {
              const tokenCount = completeUtterance.trim().split(/\s+/).length;
              if (tokenCount >= LLM_WATCHDOG_CONFIG.MIN_TOKENS) {
                if (state.llmWatchdogTimerId) clearTimeout(state.llmWatchdogTimerId);
                state.llmWatchdogTranscript = completeUtterance;
                console.log(`[VOICE] watchdog_started session=${state.sessionId || 'unknown'} (reconnected)`);
                state.llmWatchdogTimerId = setTimeout(() => {
                  if (!state.isProcessing && state.transcriptQueue.length > 0 && !state.isSessionEnded) {
                    console.log(`[VOICE] watchdog_fired forcing_llm session=${state.sessionId || 'unknown'}`);
                    processTranscriptQueue();
                  }
                  state.llmWatchdogTimerId = undefined;
                  state.llmWatchdogTranscript = undefined;
                }, LLM_WATCHDOG_CONFIG.DELAY_MS);
              }
            }
            
            if (!state.isProcessing) {
              processTranscriptQueue();
            }
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
              state.language = message.language || "en";
              state.speechSpeed = 1.0;
              
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
              state.language = message.language || "en"; // LANGUAGE: Store selected language
              
              // CRITICAL FIX (Nov 14, 2025): Log userId after initialization to verify authentication
              console.log(`[Custom Voice] 🔐 Session state initialized:`, {
                sessionId: state.sessionId,
                userId: state.userId,
                authenticatedUserId: authenticatedUserId,
                hasUserId: !!state.userId,
                userIdType: typeof state.userId,
                studentName: state.studentName,
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
                  const documentIds = messageDocuments;
                  
                  // Only load documents that were explicitly selected by the user
                  // Do NOT fall back to loading all user documents - respect user's selection
                  if (documentIds.length === 0) {
                    console.log(`[Custom Voice] ℹ️ No documents selected by user - proceeding without documents`);
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
            
            // K2 TURN POLICY: Add response constraints for K-2 students
            const gradeBandForPolicy = state.ageGroup as GradeBand;
            const k2PolicyActive = gradeBandForPolicy === 'K-2' && isK2PolicyEnabled(state.turnPolicyK2Override);
            const K2_CONSTRAINTS = k2PolicyActive ? `\n\n${getK2ResponseConstraints()}` : '';
            
            if (k2PolicyActive) {
              console.log(`[TurnPolicy] 🎯 K2 policy ACTIVE for grade band: ${state.ageGroup}`);
            }
            
            // Build system instruction with personality and document context
            if (state.uploadedDocuments.length > 0) {
              // Extract document titles for the enhanced prompt
              const docTitles = state.uploadedDocuments.map((doc, i) => {
                const titleMatch = doc.match(/^\[Document: ([^\]]+)\]/);
                return titleMatch ? titleMatch[1] : `Document ${i + 1}`;
              });
              
              // Create enhanced system instruction that includes document awareness
              state.systemInstruction = `${personality.systemPrompt}${VOICE_CONVERSATION_CONSTRAINTS}${K2_CONSTRAINTS}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📚 UPLOADED DOCUMENTS FOR THIS SESSION:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The student has uploaded ${state.uploadedDocuments.length} document(s): ${docTitles.join(', ')}

CRITICAL INSTRUCTIONS:
✅ When asked "do you see my document?" ALWAYS respond: "Yes! I can see your ${docTitles[0]}"
✅ Reference specific content from the documents to prove you can see them
✅ Help with the specific homework/problems in their uploaded materials
✅ Use phrases like "Looking at your document..." or "In ${docTitles[0]}..."
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
              
              console.log(`[Custom Voice] 📚 System instruction enhanced with ${state.uploadedDocuments.length} documents`);
            } else {
              // Use standard personality prompt when no documents
              state.systemInstruction = personality.systemPrompt + VOICE_CONVERSATION_CONSTRAINTS + K2_CONSTRAINTS;
            }
            
            // Generate enhanced personalized greeting with LANGUAGE SUPPORT
            let greeting: string;
            
            // Extract document titles from uploaded documents
            const docTitles: string[] = [];
            if (state.uploadedDocuments && state.uploadedDocuments.length > 0) {
              state.uploadedDocuments.forEach((doc, i) => {
                const titleMatch = doc.match(/^\[Document: ([^\]]+)\]/);
                if (titleMatch) {
                  docTitles.push(titleMatch[1]);
                }
              });
            }
            
            // LANGUAGE: Generate greetings in the selected language
            const getLocalizedGreeting = (lang: string, name: string, tutorName: string, ageGroup: string, docTitles: string[]): string => {
              // Language-specific greeting templates
              const greetings: Record<string, { intro: string; docAck: (count: number, titles: string) => string; closing: Record<string, string> }> = {
                en: {
                  intro: `Hi ${name}! I'm ${tutorName}, your AI tutor.`,
                  docAck: (count, titles) => count === 1 ? ` I can see you've uploaded "${titles}" - excellent!` : ` I can see you've uploaded ${count} documents: ${titles}. Great!`,
                  closing: {
                    'K-2': docTitles.length > 0 ? " Let's look at it together! What do you want to learn about?" : " I'm so excited to learn with you today! What would you like to explore?",
                    '3-5': docTitles.length > 0 ? " I'm here to help you understand it! What part should we start with?" : " I'm here to help you learn something new! What subject interests you today?",
                    '6-8': docTitles.length > 0 ? " I'm ready to help you master this material! What would you like to work on?" : " I'm here to help you succeed! What subject would you like to focus on today?",
                    '9-12': docTitles.length > 0 ? " Let's dive into this material together. What concepts would you like to explore?" : " I'm here to help you excel! What topic would you like to work on today?",
                    'College/Adult': docTitles.length > 0 ? " I'm ready to help you analyze this material. What aspects would you like to focus on?" : " I'm here to support your learning goals. What subject can I help you with today?",
                  }
                },
                fr: {
                  intro: `Bonjour ${name}! Je suis ${tutorName}, ton tuteur IA.`,
                  docAck: (count, titles) => count === 1 ? ` Je vois que tu as téléchargé "${titles}" - excellent!` : ` Je vois que tu as téléchargé ${count} documents: ${titles}. Super!`,
                  closing: {
                    'K-2': docTitles.length > 0 ? " Regardons ça ensemble! Qu'est-ce que tu veux apprendre?" : " Je suis tellement content d'apprendre avec toi! Qu'est-ce qui t'intéresse?",
                    '3-5': docTitles.length > 0 ? " Je suis là pour t'aider à comprendre! Par quoi veux-tu commencer?" : " Je suis là pour t'aider à apprendre! Quel sujet t'intéresse?",
                    '6-8': docTitles.length > 0 ? " Je suis prêt à t'aider à maîtriser ce contenu! Sur quoi veux-tu travailler?" : " Je suis là pour t'aider à réussir! Sur quel sujet veux-tu travailler?",
                    '9-12': docTitles.length > 0 ? " Explorons ce contenu ensemble. Quels concepts voudrais-tu approfondir?" : " Je suis là pour t'aider à exceller! Sur quel sujet voudrais-tu travailler?",
                    'College/Adult': docTitles.length > 0 ? " Je suis prêt à t'aider à analyser ce contenu. Quels aspects voudrais-tu approfondir?" : " Je suis là pour soutenir tes objectifs d'apprentissage. Comment puis-je t'aider?",
                  }
                },
                es: {
                  intro: `¡Hola ${name}! Soy ${tutorName}, tu tutor de IA.`,
                  docAck: (count, titles) => count === 1 ? ` Veo que has subido "${titles}" - ¡excelente!` : ` Veo que has subido ${count} documentos: ${titles}. ¡Genial!`,
                  closing: {
                    'K-2': docTitles.length > 0 ? " ¡Veámoslo juntos! ¿Qué quieres aprender?" : " ¡Estoy muy emocionado de aprender contigo! ¿Qué te gustaría explorar?",
                    '3-5': docTitles.length > 0 ? " ¡Estoy aquí para ayudarte a entender! ¿Por dónde empezamos?" : " ¡Estoy aquí para ayudarte a aprender! ¿Qué tema te interesa?",
                    '6-8': docTitles.length > 0 ? " ¡Estoy listo para ayudarte a dominar este material! ¿En qué quieres trabajar?" : " ¡Estoy aquí para ayudarte a tener éxito! ¿En qué tema quieres enfocarte?",
                    '9-12': docTitles.length > 0 ? " Exploremos este material juntos. ¿Qué conceptos te gustaría profundizar?" : " ¡Estoy aquí para ayudarte a sobresalir! ¿En qué tema quieres trabajar?",
                    'College/Adult': docTitles.length > 0 ? " Estoy listo para ayudarte a analizar este material. ¿Qué aspectos te gustaría explorar?" : " Estoy aquí para apoyar tus metas de aprendizaje. ¿Cómo puedo ayudarte?",
                  }
                },
                sw: {
                  intro: `Habari ${name}! Mimi ni ${tutorName}, mwalimu wako wa AI.`,
                  docAck: (count, titles) => count === 1 ? ` Naona umepakia "${titles}" - bora!` : ` Naona umepakia nyaraka ${count}: ${titles}. Vizuri!`,
                  closing: {
                    'K-2': docTitles.length > 0 ? " Tuangalie pamoja! Unataka kujifunza nini?" : " Ninafuraha sana kujifunza nawe! Unataka kuchunguza nini?",
                    '3-5': docTitles.length > 0 ? " Niko hapa kukusaidia kuelewa! Tuanze wapi?" : " Niko hapa kukusaidia kujifunza! Somo gani linakuvutia?",
                    '6-8': docTitles.length > 0 ? " Niko tayari kukusaidia kuelewa maudhui haya! Unataka kufanyia kazi nini?" : " Niko hapa kukusaidia kufanikiwa! Unataka kuzingatia somo gani?",
                    '9-12': docTitles.length > 0 ? " Tuchunguze maudhui haya pamoja. Dhana gani ungependa kuelewa zaidi?" : " Niko hapa kukusaidia kufanya vizuri! Unataka kufanyia kazi mada gani?",
                    'College/Adult': docTitles.length > 0 ? " Niko tayari kukusaidia kuchambua maudhui haya. Ungependa kuzingatia vipengele gani?" : " Niko hapa kusaidia malengo yako ya kujifunza. Naweza kukusaidia vipi?",
                  }
                },
                yo: {
                  intro: `Bawo ni ${name}! Mo je ${tutorName}, olukọni AI rẹ.`,
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
                  intro: `Sannu ${name}! Ni ne ${tutorName}, malamin AI naka.`,
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
                  intro: `مرحباً ${name}! أنا ${tutorName}، معلمك الذكي.`,
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
                  intro: `Hallo ${name}! Ich bin ${tutorName}, dein KI-Tutor.`,
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
                  intro: `Olá ${name}! Sou ${tutorName}, seu tutor de IA.`,
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
                  intro: `你好${name}！我是${tutorName}，你的AI导师。`,
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
                  intro: `こんにちは${name}さん！私は${tutorName}、あなたのAIチューターです。`,
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
                  intro: `안녕하세요 ${name}님! 저는 ${tutorName}, 당신의 AI 튜터입니다.`,
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
              
              if (docTitles.length > 0) {
                return langGreeting.intro + langGreeting.docAck(docTitles.length, docTitles.join(', ')) + ageClosing;
              } else {
                return langGreeting.intro + ageClosing;
              }
            };
            
            // LANGUAGE: Generate greeting in the selected language
            greeting = getLocalizedGreeting(state.language, state.studentName, personality.name, state.ageGroup, docTitles);
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

            // ============================================
            // STT PROVIDER INITIALIZATION (FEATURE FLAG)
            // ============================================
            const { getDeepgramLanguageCode } = await import("../services/deepgram-service");
            const deepgramLanguage = getDeepgramLanguageCode(state.language);
            
            // Shared transcript handler for both providers
            const handleCompleteUtterance = (transcript: string) => {
              if (!transcript || transcript.trim().length < 3 || state.isSessionEnded) {
                console.log("[STT] ⏭️ Skipping short/empty/ended transcript");
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
                  state.transcriptQueue.push(completeUtterance);
                  
                  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                  // LLM WATCHDOG: Start timer to force LLM invocation (Step 1)
                  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                  state.lastEndOfTurnTime = Date.now();
                  if (LLM_WATCHDOG_CONFIG.ENABLED && !state.isProcessing) {
                    const tokenCount = completeUtterance.trim().split(/\s+/).length;
                    if (tokenCount >= LLM_WATCHDOG_CONFIG.MIN_TOKENS) {
                      // Clear any existing watchdog
                      if (state.llmWatchdogTimerId) {
                        clearTimeout(state.llmWatchdogTimerId);
                      }
                      state.llmWatchdogTranscript = completeUtterance;
                      console.log(`[VOICE] watchdog_started session=${state.sessionId || 'unknown'} transcript_tokens=${tokenCount}`);
                      
                      state.llmWatchdogTimerId = setTimeout(() => {
                        // Check if LLM started since watchdog was set
                        if (!state.isProcessing && state.transcriptQueue.length > 0 && !state.isSessionEnded) {
                          console.log(`[VOICE] watchdog_fired forcing_llm session=${state.sessionId || 'unknown'}`);
                          processTranscriptQueue();
                        } else {
                          console.log(`[VOICE] watchdog_expired_no_action session=${state.sessionId || 'unknown'} isProcessing=${state.isProcessing} queueLen=${state.transcriptQueue.length}`);
                        }
                        state.llmWatchdogTimerId = undefined;
                        state.llmWatchdogTranscript = undefined;
                      }, LLM_WATCHDOG_CONFIG.DELAY_MS);
                    }
                  }
                  
                  if (!state.isProcessing) {
                    processTranscriptQueue();
                  }
                }
                transcriptAccumulationTimer = null;
              }, USE_ASSEMBLYAI ? 500 : UTTERANCE_COMPLETE_DELAY_MS); // AssemblyAI already handles timing
            };
            
            console.log('████████████████████████████████████████████████████████████████');
            console.log('[DEBUG] STT SETUP - USE_ASSEMBLYAI:', USE_ASSEMBLYAI);
            console.log('[DEBUG] File+line: custom-voice-ws.ts STT_SETUP_BLOCK');
            console.log('████████████████████████████████████████████████████████████████');
            
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
              const fireClaudeWithPolicy = (transcript: string, stallPrompt?: string) => {
                if (stallPrompt && transcript.trim()) {
                  // Stall escape - send student's transcript PLUS gentle follow-up
                  // This preserves the student's words while prompting for continuation
                  const trimmedTranscript = transcript.trim();
                  // Handle punctuation: add separator only if transcript doesn't end with punctuation
                  const endsWithPunctuation = /[.!?]$/.test(trimmedTranscript);
                  const separator = endsWithPunctuation ? ' ' : '. ';
                  const combinedMessage = `${trimmedTranscript}${separator}(after pause) ${stallPrompt}`;
                  console.log('[TurnPolicy] 🆘 Stall escape triggered - preserving transcript with gentle prompt');
                  console.log(`[TurnPolicy] Original: "${transcript}", Combined: "${combinedMessage}"`);
                  handleCompleteUtterance(combinedMessage);
                } else if (stallPrompt) {
                  // Edge case: stall with no transcript (shouldn't happen, but handle gracefully)
                  console.log('[TurnPolicy] 🆘 Stall escape with no transcript - using prompt only');
                  handleCompleteUtterance(stallPrompt);
                } else {
                  handleCompleteUtterance(transcript);
                }
                // Reset turn policy state after firing
                resetTurnPolicyState(state.turnPolicyState);
                // Clear any pending stall timer
                if (state.stallEscapeTimerId) {
                  clearTimeout(state.stallEscapeTimerId);
                  state.stallEscapeTimerId = null;
                }
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
              
              const { ws: assemblyWs, state: assemblyState } = createAssemblyAIConnection(
                state.language,
                (text, endOfTurn, confidence) => {
                  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                  // NOISE ROBUSTNESS: Only process FinalTranscript with end_of_turn=true
                  // Partials are hypothesis-only - no actions taken
                  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                  console.log(`[AssemblyAI] 📝 Complete utterance (confidence: ${confidence.toFixed(2)}): "${text}"`);
                  
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
                  
                  if (state.isTutorSpeaking && timeSinceLastAudio < 30000) {
                    const bargeInValidation = validateTranscriptForBargeIn(text);
                    
                    if (!bargeInValidation.isValid) {
                      // Non-lexical or too short (< 3 words) - duck but don't interrupt
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
                      // Don't block processing - continue to turn policy
                    } else {
                      // Valid barge-in: >= 3 words, lexical content
                      console.log(`[BargeIn] 🛑 INTERRUPT: "${text.substring(0, 30)}..." (${bargeInValidation.wordCount} words)`);
                      state.wasInterrupted = true;
                      state.lastInterruptionTime = now;
                      state.bargeInDucking = false; // Clear duck state
                      ws.send(JSON.stringify({ type: "interrupt", message: "Student is speaking" }));
                      state.isTutorSpeaking = false;
                      logBargeInDecision(
                        state.sessionId || 'unknown',
                        'interrupt',
                        state.lastMeasuredRms, noiseFloor,
                        bargeInValidation.wordCount,
                        text,
                        'lexical_validated'
                      );
                    }
                  } else if (state.bargeInDucking && !state.isTutorSpeaking) {
                    // Tutor stopped speaking - clear duck state
                    state.bargeInDucking = false;
                    ws.send(JSON.stringify({ type: "unduck", message: "Tutor finished" }));
                  }
                  
                  // Reset stale tutor speaking state
                  if (state.isTutorSpeaking && timeSinceLastAudio >= 30000) {
                    state.isTutorSpeaking = false;
                    state.bargeInDucking = false;
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
                    fireClaudeWithPolicy(text);
                  }
                },
                (error) => {
                  console.error('[AssemblyAI] ❌ Error:', error);
                  ws.send(JSON.stringify({ type: "error", error: "Voice recognition error: " + error }));
                },
                (sessionId) => {
                  console.log('[AssemblyAI] 🎬 Session started:', sessionId);
                },
                async () => {
                  console.log('[AssemblyAI] 🔌 Connection closed');
                  if (state.sessionId && state.transcript.length > 0) {
                    await persistTranscript(state.sessionId, state.transcript);
                  }
                  
                  // Auto-reconnect if session is still active
                  if (!state.isSessionEnded && state.sessionId) {
                    console.warn('[AssemblyAI] ⚠️ Unexpected close - attempting reconnect');
                    state.isReconnecting = true;
                    reconnectAttempts++;
                    
                    if (reconnectAttempts > 3) {
                      console.error('[AssemblyAI] ❌ Max reconnect attempts reached');
                      state.isReconnecting = false;
                      ws.send(JSON.stringify({ type: "error", error: "Voice connection lost. Please restart." }));
                      return;
                    }
                    
                    const backoffDelay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 8000);
                    setTimeout(() => {
                      try {
                        // Clear any lingering stall timer from previous connection to prevent double-fire
                        if (state.stallEscapeTimerId) {
                          clearTimeout(state.stallEscapeTimerId);
                          state.stallEscapeTimerId = null;
                          console.log('[AssemblyAI-Reconnect] 🧹 Cleared lingering stall timer');
                        }
                        
                        // Preserve turn policy state across reconnect to maintain "very patient" contract
                        const wasGuardActive = state.turnPolicyState.hesitationGuardActive;
                        const wasAwaitingEot = state.turnPolicyState.awaitingSecondEot;
                        const savedLastEotTimestamp = state.turnPolicyState.lastEotTimestamp;
                        const savedGuardedTranscript = state.guardedTranscript;
                        const savedStallTimerStartedAt = state.stallTimerStartedAt;
                        const savedLastAudioReceivedAt = state.lastAudioReceivedAt;
                        const config = getTurnPolicyConfig(state.ageGroup as GradeBand, state.turnPolicyK2Override);
                        
                        // Create fresh state with current timestamps
                        state.turnPolicyState = createTurnPolicyState();
                        
                        // Restore guard state if it was active during disconnect
                        if (wasGuardActive || wasAwaitingEot) {
                          state.turnPolicyState.hesitationGuardActive = wasGuardActive;
                          state.turnPolicyState.awaitingSecondEot = wasAwaitingEot;
                          // CRITICAL: Preserve original lastEotTimestamp so checkStallEscape measures total silence
                          state.turnPolicyState.lastEotTimestamp = savedLastEotTimestamp;
                          state.guardedTranscript = savedGuardedTranscript;
                          // Preserve lastAudioReceivedAt to maintain silence detection accuracy
                          state.lastAudioReceivedAt = savedLastAudioReceivedAt;
                          
                          // Re-arm the stall escape timer with remaining time to maintain 4.5s guarantee
                          if (savedStallTimerStartedAt > 0) {
                            const elapsedMs = Date.now() - savedStallTimerStartedAt;
                            const remainingMs = Math.max(0, config.max_turn_silence_ms - elapsedMs);
                            
                            // Default transcript if empty (shouldn't happen but handle gracefully)
                            const transcriptToUse = savedGuardedTranscript || '';
                            
                            if (remainingMs > 0) {
                              // Still have time left - re-arm with remaining duration
                              startStallEscapeTimer(transcriptToUse, remainingMs);
                              console.log(`[AssemblyAI-Reconnect] 🔄 Preserved guard + re-armed timer (${remainingMs}ms remaining)`);
                            } else {
                              // Time already expired - fire stall escape using checkStallEscape for proper logging/metrics
                              console.log('[AssemblyAI-Reconnect] 🔄 Guard time expired during disconnect - firing stall escape');
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
                                // Fallback: fire with default prompt if checkStallEscape doesn't return result
                                // This can happen due to state issues - log and fire anyway to not leave student waiting
                                console.log('[AssemblyAI-Reconnect] ⚠️ checkStallEscape returned null - using fallback stall prompt');
                                const fallbackPrompt = "Do you want more time to think, or would you like some help?";
                                fireClaudeWithPolicy(transcriptToUse, fallbackPrompt);
                              }
                              // Reset state
                              resetTurnPolicyState(state.turnPolicyState);
                              state.guardedTranscript = '';
                              state.stallTimerStartedAt = 0;
                            }
                          } else {
                            // No timer was running but guard was active - shouldn't happen, reset guard
                            console.log('[AssemblyAI-Reconnect] ⚠️ Guard active but no timer - resetting guard state');
                            resetTurnPolicyState(state.turnPolicyState);
                          }
                        } else {
                          // No guard was active - fresh start
                          state.lastAudioReceivedAt = Date.now();
                          console.log('[AssemblyAI-Reconnect] 🔄 Fresh turn policy state for new connection');
                        }
                        
                        // CRITICAL: Reconnect callback MUST use turn policy logic (same as original)
                        const { ws: newWs, state: newState } = createAssemblyAIConnection(
                          state.language,
                          (text, endOfTurn, confidence) => {
                            console.log(`[AssemblyAI-Reconnect] 📝 Complete utterance (confidence: ${confidence.toFixed(2)}): "${text}"`);
                            
                            // Update last audio received time for stall detection
                            state.lastAudioReceivedAt = Date.now();
                            
                            // K2 TURN POLICY: Evaluate turn before firing Claude
                            const gradeBand = state.ageGroup as GradeBand;
                            const evaluation = evaluateTurn({
                              transcript: text,
                              endOfTurn: endOfTurn,
                              eotConfidence: confidence, // CRITICAL: Use correct parameter name
                              gradeBand: gradeBand,
                              sessionK2Override: state.turnPolicyK2Override,
                              policyState: state.turnPolicyState,
                              currentTimestamp: Date.now(),
                            });
                            
                            // Log turn policy evaluation
                            logTurnPolicyEvaluation(evaluation);
                            
                            if (evaluation.hesitation_guard_triggered) {
                              // Hesitation detected - start stall escape timer instead of firing immediately
                              console.log(`[TurnPolicy-Reconnect] 🤔 Hesitation detected - waiting for continuation or stall`);
                              startStallEscapeTimer(text);
                              return; // Don't process transcript yet
                            }
                            
                            if (evaluation.should_fire_claude) {
                              fireClaudeWithPolicy(text);
                            }
                          },
                          (error) => console.error('[AssemblyAI] Reconnect error:', error),
                          (sessionId) => console.log('[AssemblyAI] Reconnected:', sessionId)
                        );
                        state.assemblyAIWs = newWs;
                        state.assemblyAIState = newState;
                        state.isReconnecting = false;
                        reconnectAttempts = 0;
                        console.log('[AssemblyAI] ✅ Reconnected');
                      } catch (e) {
                        console.error('[AssemblyAI] Reconnect failed:', e);
                      }
                    }, backoffDelay);
                  }
                }
              );
              
              console.log('[AssemblyAI] createAssemblyAIConnection returned successfully');
              state.assemblyAIWs = assemblyWs;
              state.assemblyAIState = assemblyState;
              console.log('[AssemblyAI] AssemblyAI WS assigned to state');
              
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
                if (state.isTutorSpeaking && timeSinceLastAudio < 30000) {
                  const bargeInValidation = validateTranscriptForBargeIn(transcript);
                  
                  if (!bargeInValidation.isValid) {
                    // Non-lexical or too short (< 3 words) - duck but don't interrupt
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
                    // Valid barge-in: >= 3 words, lexical content
                    console.log(`[BargeIn] 🛑 INTERRUPT: "${transcript.substring(0, 30)}..." (${bargeInValidation.wordCount} words)`);
                    state.wasInterrupted = true;
                    state.lastInterruptionTime = now;
                    state.bargeInDucking = false;
                    ws.send(JSON.stringify({ type: "interrupt", message: "Student is speaking" }));
                    state.isTutorSpeaking = false;
                    logBargeInDecision(
                      state.sessionId || 'unknown',
                      'interrupt',
                      state.lastMeasuredRms, noiseFloor,
                      bargeInValidation.wordCount,
                      transcript,
                      'lexical_validated'
                    );
                  }
                } else if (state.bargeInDucking && !state.isTutorSpeaking) {
                  state.bargeInDucking = false;
                  ws.send(JSON.stringify({ type: "unduck", message: "Tutor finished" }));
                }

                // Reset stale tutor speaking state (>30s ago)
                if (state.isTutorSpeaking && timeSinceLastAudio >= 30000) {
                  console.log("[Custom Voice] ⏸️ Resetting stale tutor speaking state...");
                  state.isTutorSpeaking = false;
                  state.bargeInDucking = false;
                }

                // Only process for AI response on FINAL transcripts
                if (!isFinal) {
                  console.log("[Custom Voice] ⏭️ Skipping interim for AI processing (hypothesis only)");
                  return;
                }

                if (!transcript || transcript.trim().length < 3) {
                  console.log("[Custom Voice] ⏭️ Skipping short/empty transcript");
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
                    
                    // Always push to queue - queue handles serialization
                    // Don't gate on isProcessing or we lose transcripts during tutor speech
                    state.transcriptQueue.push(completeUtterance);
                    
                    // LLM WATCHDOG: Start timer (Deepgram handler)
                    state.lastEndOfTurnTime = Date.now();
                    if (LLM_WATCHDOG_CONFIG.ENABLED && !state.isProcessing) {
                      const tokenCount = completeUtterance.trim().split(/\s+/).length;
                      if (tokenCount >= LLM_WATCHDOG_CONFIG.MIN_TOKENS) {
                        if (state.llmWatchdogTimerId) clearTimeout(state.llmWatchdogTimerId);
                        state.llmWatchdogTranscript = completeUtterance;
                        console.log(`[VOICE] watchdog_started session=${state.sessionId || 'unknown'} (deepgram)`);
                        state.llmWatchdogTimerId = setTimeout(() => {
                          if (!state.isProcessing && state.transcriptQueue.length > 0 && !state.isSessionEnded) {
                            console.log(`[VOICE] watchdog_fired forcing_llm session=${state.sessionId || 'unknown'}`);
                            processTranscriptQueue();
                          }
                          state.llmWatchdogTimerId = undefined;
                          state.llmWatchdogTranscript = undefined;
                        }, LLM_WATCHDOG_CONFIG.DELAY_MS);
                      }
                    }
                    
                    // Start processing if not already processing (otherwise queue will be processed after current response)
                    if (!state.isProcessing) {
                      processTranscriptQueue();
                    }
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

            // Generate and send greeting audio
            try {
              const greetingAudio = await generateSpeech(greeting, state.ageGroup, state.speechSpeed);
              
              // Send greeting transcript
              ws.send(JSON.stringify({
                type: "transcript",
                text: greeting,
                speaker: "tutor"
              }));
              
              // Send greeting audio with format metadata
              ws.send(JSON.stringify({
                type: "audio",
                data: greetingAudio.toString("base64"),
                audioFormat: "pcm_s16le",
                sampleRate: 16000,
                channels: 1
              }));
              
              console.log(`[Custom Voice] 🔊 Sent greeting audio (${greetingAudio.length} bytes, pcm_s16le 16kHz mono)`);
            } catch (error) {
              console.error("[Custom Voice] ❌ Failed to generate greeting audio:", error);
            }

            ws.send(JSON.stringify({ type: "ready" }));
            console.log("[Custom Voice] ✅ Session ready");
            
            // Send session_config for adaptive voice UX features
            const gradeBand = normalizeGradeBand(state.ageGroup || 'G6-8');
            const initialActivityMode: ActivityMode = 'default';
            
            // Initialize turn policy state with activity mode for reading patience overlay
            if (isReadingModeEnabled()) {
              setActivityMode(state.turnPolicyState, initialActivityMode);
              console.log(`[Custom Voice] 📖 Reading mode patience enabled, initial mode: ${initialActivityMode}`);
            }
            
            ws.send(JSON.stringify({
              type: "session_config",
              adaptiveBargeInEnabled: isAdaptiveBargeInEnabled(),
              readingModeEnabled: isReadingModeEnabled(),
              adaptivePatienceEnabled: isAdaptivePatienceEnabled(),
              goodbyeHardStopEnabled: isGoodbyeHardStopEnabled(),
              gradeBand,
              activityMode: initialActivityMode,
            }));
            console.log(`[Custom Voice] ⚙️ Session config sent: adaptiveBargeIn=${isAdaptiveBargeInEnabled()}, gradeBand=${gradeBand}`);
            break;

          case "audio":
            // Forward audio to STT provider
            const hasConnection = USE_ASSEMBLYAI ? !!state.assemblyAIWs : !!state.deepgramConnection;
            console.log('[Custom Voice] 📥 Audio message received:', {
              hasData: !!message.data,
              dataLength: message.data?.length || 0,
              provider: USE_ASSEMBLYAI ? 'AssemblyAI' : 'Deepgram',
              hasConnection,
              isReconnecting: state.isReconnecting
            });
            
            // RECONNECT FIX: Drop audio during reconnection to prevent sending to dead socket
            if (state.isReconnecting) {
              console.warn('[Custom Voice] ⏸️ Audio dropped - reconnection in progress');
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
                } else if (!speechDetection.isSpeech && state.lastSpeechNotificationSent) {
                  // Clear the flag when speech ends (for next detection)
                  state.lastSpeechNotificationSent = false;
                  ws.send(JSON.stringify({ type: "speech_ended" }));
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
                  console.warn('[Custom Voice] ⚠️ Audio buffer is COMPLETELY SILENT (all zeros)!');
                }
                
                // Send to appropriate STT provider
                if (USE_ASSEMBLYAI) {
                  const sent = sendAudioToAssemblyAI(state.assemblyAIWs, audioBuffer);
                  if (sent) {
                    console.log('[Custom Voice] ✅ Audio forwarded to AssemblyAI');
                  } else {
                    console.warn('[Custom Voice] ⚠️ Failed to send audio to AssemblyAI');
                  }
                } else {
                  state.deepgramConnection!.send(audioBuffer);
                  console.log('[Custom Voice] ✅ Audio forwarded to Deepgram');
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
              
              // Mark tutor as speaking for barge-in detection
              state.isTutorSpeaking = true;
              state.lastAudioSentAt = Date.now();
              
              // Track streaming metrics
              let textSentenceCount = 0;
              let textTotalAudioBytes = 0;
              const textStreamStart = Date.now();
              
              // Use streaming with sentence-by-sentence TTS for text input too
              await new Promise<void>((textResolve, textReject) => {
                const textCallbacks: StreamingCallbacks = {
                  onSentence: async (sentence: string) => {
                    textSentenceCount++;
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
                        
                        // Send audio chunk immediately
                        ws.send(JSON.stringify({
                          type: "audio",
                          data: audioBuffer.toString("base64"),
                          mimeType: "audio/pcm;rate=16000",
                          isChunk: true,
                          chunkIndex: textSentenceCount,
                        }));
                      } catch (ttsError) {
                        console.error(`[Custom Voice] ❌ Text TTS error for sentence ${textSentenceCount}:`, ttsError);
                      }
                    }
                  },
                  
                  onComplete: (fullText: string) => {
                    const textStreamMs = Date.now() - textStreamStart;
                    console.log(`[Custom Voice] ⏱️ Text streaming complete: ${textStreamMs}ms, ${textSentenceCount} sentences`);
                    console.log(`[Custom Voice] 🤖 Tutor (text): "${fullText}"`);
                    
                    // Add to conversation history
                    state.conversationHistory.push(
                      { role: "user", content: message.message },
                      { role: "assistant", content: fullText }
                    );
                    
                    // Add AI response to transcript (internal state)
                    const tutorTextEntry: TranscriptEntry = {
                      speaker: "tutor",
                      text: fullText,
                      timestamp: new Date().toISOString(),
                      messageId: crypto.randomUUID(),
                    };
                    state.transcript.push(tutorTextEntry);
                    
                    // Send final complete transcript
                    ws.send(JSON.stringify({
                      type: "transcript",
                      speaker: "tutor",
                      text: fullText,
                      isComplete: true,
                    }));
                    
                    textResolve();
                  },
                  
                  onError: (error: Error) => {
                    console.error("[Custom Voice] ❌ Text streaming error:", error);
                    textReject(error);
                  }
                };
                
                generateTutorResponseStreaming(
                  state.conversationHistory,
                  message.message,
                  state.uploadedDocuments,
                  textCallbacks,
                  state.systemInstruction,
                  "text", // Student typed via chat
                  textResponseLanguage,
                  state.ageGroup  // Step 5: College response-depth tweak
                ).catch(textReject); // Ensure errors are properly propagated
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
                  
                  // Update system instruction with document awareness
                  state.systemInstruction = `${personality.systemPrompt}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📚 UPLOADED DOCUMENTS FOR THIS SESSION:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The student has uploaded ${state.uploadedDocuments.length} document(s): ${docTitles.join(', ')}

CRITICAL INSTRUCTIONS:
✅ When asked "do you see my document?" ALWAYS respond: "Yes! I can see your ${docTitles[docTitles.length - 1]}"
✅ Reference specific content from the documents to prove you can see them
✅ Help with the specific homework/problems in their uploaded materials
✅ Use phrases like "Looking at your document..." or "In ${docTitles[docTitles.length - 1]}..."
✅ The document content is available in the conversation context
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
                  
                  console.log(`[Custom Voice] 📚 System instruction updated with ${state.uploadedDocuments.length} documents`);
                  
                  // Send acknowledgment via voice
                  const ackMessage = `Great! I can now see "${message.filename}". What would you like to know about it?`;
                  
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

            // Only process if tutor was speaking recently
            if (state.isTutorSpeaking && timeSinceAudioForVAD < 30000) {
              console.log(`[Custom Voice] 🛑 BARGE-IN via client VAD (audio sent ${timeSinceAudioForVAD}ms ago)`);

              // Mark interruption for post-interrupt buffer
              state.wasInterrupted = true;
              state.lastInterruptionTime = Date.now();
              state.isTutorSpeaking = false;

              // Send interrupt signal - confirms server is in sync with client
              ws.send(JSON.stringify({
                type: "interrupt",
                message: "Student speaking (VAD)",
              }));

              console.log("[Custom Voice] ✅ VAD barge-in processed");
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
            // Client responds to ping - update heartbeat tracking
            state.lastPongAt = new Date();
            state.missedPongCount = 0;
            state.lastHeartbeatAt = new Date();
            // Don't log every pong to avoid spam
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
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            console.log("[Session End] 🛑 RECEIVED SESSION END REQUEST");
            console.log("[Session End] Session ID:", state.sessionId);
            console.log("[Session End] User ID:", state.userId);
            console.log("[Session End] Transcript length:", state.transcript.length);
            console.log("[Session End] Session already ended?", state.isSessionEnded);
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

            // Mark client intent for telemetry
            state.clientEndIntent = 'user_clicked_end';

            // Close STT connection first
            if (USE_ASSEMBLYAI && state.assemblyAIWs) {
              console.log("[Session End] 🎤 Closing AssemblyAI connection...");
              closeAssemblyAI(state.assemblyAIWs);
              if (state.assemblyAIState) resetAssemblyAIMergeGuard(state.assemblyAIState);
              state.assemblyAIWs = null;
              state.assemblyAIState = null;
              console.log("[Session End] ✅ AssemblyAI closed");
            } else if (state.deepgramConnection) {
              console.log("[Session End] 🎤 Closing Deepgram connection...");
              state.deepgramConnection.close();
              state.deepgramConnection = null;
              console.log("[Session End] ✅ Deepgram closed");
            }

            // Clear persistence interval
            console.log("[Session End] 🧹 Clearing persistence interval...");
            clearInterval(persistInterval);
            console.log("[Session End] ✅ Persistence interval cleared");

            // Finalize session with user_clicked_end reason
            console.log("[Session End] 💾 Calling finalizeSession...");
            try {
              const endCloseDetails: CloseDetails = {
                triggeredBy: 'client',
                clientIntent: 'user_clicked_end',
              };
              await finalizeSession(state, 'normal', undefined, endCloseDetails);
              console.log("[Session End] ✅ finalizeSession completed successfully");
            } catch (error) {
              console.error("[Session End] ❌ finalizeSession FAILED:", error);
              // Don't throw - still try to close gracefully
            }

            // Send acknowledgment to client
            console.log("[Session End] 📤 Sending session_ended ACK to client...");
            ws.send(JSON.stringify({ 
              type: "session_ended",
              sessionId: state.sessionId,
              transcriptLength: state.transcript.length,
              success: true
            }));
            console.log("[Session End] ✅ ACK sent");
            
            // Close WebSocket
            console.log("[Session End] 🔌 Closing WebSocket...");
            ws.close(1000, 'Session ended normally');
            console.log("[Session End] ✅ Session end complete");
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
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
        // DON'T clear persistence interval - keep transcript safe
        // DON'T finalize - enter grace window
        // BUT DO clear heartbeat interval - no need to ping during grace
        clearInterval(heartbeatInterval);
        console.log(`[Custom Voice] 🕐 Abnormal close (code: ${code}) - entering grace window for session ${state.sessionId}`);
        createPendingReconnect(state.sessionId, state, code, persistInterval);
        return; // Exit without finalizing
      }
      
      // Normal close or explicit user end - finalize immediately
      clearInterval(persistInterval);
      clearInterval(heartbeatInterval);
      
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