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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TIMING CONSTANTS (Nov 4, 2025): Comprehensive timing fix
// Prevents tutor from interrupting students mid-sentence
// Total delay target: 7-8 seconds from student stops → tutor responds
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const TIMING_CONFIG = {
  // Server-side delays before AI processing
  SERVER_DELAY_COMPLETE_THOUGHT: 1200,    // 1.2s for complete sentences (was 0ms)
  SERVER_DELAY_INCOMPLETE_THOUGHT: 2500,  // 2.5s for incomplete thoughts (e.g., "um", "I think")
  
  // Post-interruption buffer (when student interrupts tutor)
  POST_INTERRUPT_BUFFER: 2500,            // 2.5s extra wait after interruption
  
  // Combined with Deepgram settings:
  // - Deepgram endpointing: 3500ms (silence detection)
  // - Deepgram utterance_end_ms: 3500ms (finalization)
  // Total timing for complete thought: 3500ms (Deepgram) + 1200ms (server) = 4700ms
  // Total timing for incomplete thought: 3500ms (Deepgram) + 2500ms (server) = 6000ms
  // After interruption: Add +2500ms buffer = 6000-8500ms total
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
  language: string; // LANGUAGE: Tutoring language code (e.g., 'en', 'es', 'fr')
  detectedLanguage: string; // LANGUAGE: Auto-detected spoken language from Deepgram
  speechSpeed: number; // User's speech speed preference from settings
  systemInstruction: string;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  transcript: TranscriptEntry[];
  uploadedDocuments: string[];
  deepgramConnection: DeepgramConnection | null;
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
async function finalizeSession(
  state: SessionState,
  reason: 'normal' | 'disconnect' | 'error' | 'violation' | 'inactivity_timeout',
  errorMessage?: string
) {
  // Idempotent: skip if already finalized
  if (state.isSessionEnded) {
    console.log(`[Custom Voice] ℹ️ Session already finalized, skipping (reason: ${reason})`);
    return;
  }

  // Mark as ended FIRST to prevent race conditions
  state.isSessionEnded = true;
  
  // CRITICAL: Clear inactivity timer to prevent duplicate finalization
  if (state.inactivityTimerId) {
    clearInterval(state.inactivityTimerId);
    state.inactivityTimerId = null;
    console.log(`[Finalize] 🧹 Cleared inactivity timer (reason: ${reason})`);
  }

  if (!state.sessionId) {
    console.warn('[Custom Voice] ⚠️ No sessionId, skipping finalization');
    return;
  }

  try {
    // Calculate session duration
    const durationSeconds = Math.floor((Date.now() - state.sessionStartTime) / 1000);
    const durationMinutes = Math.max(1, Math.ceil(durationSeconds / 60));

    // Update database with complete session data
    const updateData: any = {
      transcript: state.transcript,
      endedAt: new Date(),
      status: 'ended',
      minutesUsed: durationMinutes,
      totalMessages: state.transcript.length,
    };

    if (errorMessage) {
      updateData.errorMessage = errorMessage;
    }

    await db.update(realtimeSessions)
      .set(updateData)
      .where(eq(realtimeSessions.id, state.sessionId));

    console.log(`[Custom Voice] 💾 Session finalized (${reason}) - ${durationMinutes} minutes, ${state.transcript.length} messages`);

    // Deduct minutes from user balance
    if (state.userId && durationMinutes > 0) {
      const { deductMinutes } = await import('../services/voice-minutes');
      await deductMinutes(state.userId, durationMinutes);
      console.log(`[Custom Voice] ✅ Deducted ${durationMinutes} minutes from user ${state.userId}`);
    }
  } catch (error) {
    console.error(`[Custom Voice] ❌ Error finalizing session (${reason}):`, error);
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

    // Step 2: Session validation (no Express middleware reuse)
    const sessionSecret = process.env.SESSION_SECRET || 'development-session-secret-only';
    const validationResult = await validateWsSession(request, sessionSecret);
    
    if (!validationResult.valid) {
      console.error(`[WebSocket] ❌ Session validation failed:`, validationResult.error);
      rejectWsUpgrade(socket, validationResult.statusCode || 401, validationResult.error || 'Unauthorized');
      return;
    }

    const userId = validationResult.userId!;
    const sessionId = validationResult.sessionId!;
    console.log('[WebSocket] ✅ Session validated for user:', userId);

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
        
        console.log('[WebSocket] ✅ Connection tracked for user:', userId);
        
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
    
    console.log("[Custom Voice] 🔌 New authenticated connection for user:", authenticatedUserId);
    
    // FIX #2C: Turn-taking timeout for natural conversation flow
    let responseTimer: NodeJS.Timeout | null = null;
    
    // FIX (Dec 10, 2025): Track reconnection attempts to prevent infinite loops
    let reconnectAttempts = 0;
    
    const state: SessionState = {
      sessionId: "",
      userId: authenticatedUserId, // Use session-authenticated userId
      studentName: "",
      ageGroup: "default",
      language: "en", // LANGUAGE: Default to English, will be set from session
      detectedLanguage: "", // LANGUAGE: Auto-detected spoken language from Deepgram
      speechSpeed: 0.95, // Default speech speed, will be overridden by user preference
      systemInstruction: "",
      conversationHistory: [],
      transcript: [],
      uploadedDocuments: [],
      deepgramConnection: null,
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
    };

    // FIX #3: Auto-persist every 10 seconds
    const persistInterval = setInterval(async () => {
      if (state.sessionId && state.transcript.length > 0) {
        await persistTranscript(state.sessionId, state.transcript);
        state.lastPersisted = Date.now();
      }
    }, 10000);

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
            if (audioBuffer) {
              ws.send(JSON.stringify({
                type: 'audio',
                audio: audioBuffer.toString('base64'),
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
            if (audioBuffer) {
              ws.send(JSON.stringify({
                type: 'audio',
                audio: audioBuffer.toString('base64'),
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
          
          try {
            // Send session end notification to frontend
            ws.send(JSON.stringify({
              type: 'session_ended',
              reason: 'inactivity_timeout',
              message: 'Session ended due to inactivity'
            }));
            
            // Finalize session in database
            await finalizeSession(state, 'normal');
            
            // Close WebSocket
            ws.close(1000, 'Session ended due to inactivity');
            
            console.log('[Inactivity] ✅ Session ended successfully');
            
          } catch (error) {
            console.error('[Inactivity] ❌ Error ending session:', error);
            ws.close(1011, 'Error ending session');
          }
          
        }, 5000); // 5 second delay
        
        // Clear the interval to prevent multiple triggers
        if (state.inactivityTimerId) {
          clearInterval(state.inactivityTimerId);
          state.inactivityTimerId = null;
        }
      }
      
    }, 30000); // Check every 30 seconds

    console.log('[Inactivity] ✅ Checker started (checks every 30 seconds)');

    // FIX #1: Process queued transcripts sequentially
    async function processTranscriptQueue() {
      if (state.isProcessing || state.transcriptQueue.length === 0 || state.isSessionEnded) {
        return;
      }

      state.isProcessing = true;
      const transcript = state.transcriptQueue.shift()!;

      try {
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
            
            // Increment violation count
            state.violationCount++;
            const warningLevel = shouldWarnUser(state.violationCount - 1);
            
            // Get appropriate response based on warning level (should never be 'none' here)
            if (warningLevel === 'none') {
              console.error("[Custom Voice] ❌ Unexpected warning level 'none'");
              state.isProcessing = false; // CRITICAL FIX: Release processing lock
              return; // Skip if somehow 'none' is returned
            }
            
            const moderationResponse = getModerationResponse(warningLevel);
          
          // Log violation to database with FULL context (user message + AI warning response)
          await db.insert(contentViolations).values({
            userId: state.userId,
            sessionId: state.sessionId,
            violationType: moderation.violationType!,
            severity: moderation.severity,
            userMessage: transcript,
            aiResponse: moderationResponse, // Store the warning message for admin review
            confidence: moderation.confidence?.toString(),
            reviewStatus: 'pending',
            actionTaken: warningLevel === 'final' ? 'suspension' : 'warning',
          });
          
          // If final warning, suspend user and end session
          if (warningLevel === 'final') {
            console.log("[Custom Voice] 🚫 Suspending user due to repeated violations");
            
            // Create suspension record (24 hour suspension)
            const suspendedUntil = new Date();
            suspendedUntil.setHours(suspendedUntil.getHours() + 24);
            
            await db.insert(userSuspensions).values({
              userId: state.userId,
              reason: `Repeated inappropriate content violations (${moderation.violationType})`,
              violationIds: [], // Could track specific violation IDs
              suspendedUntil: suspendedUntil,
              isPermanent: false,
              isActive: true,
            });
            
            // Send moderation response
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
        console.log(`[Custom Voice] ⏱️ Delay done (+${Date.now() - pipelineStart}ms), calling Claude...`);
        
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
        
        // Use streaming with sentence-by-sentence TTS for minimal latency
        await new Promise<void>((resolve, reject) => {
          const callbacks: StreamingCallbacks = {
            onSentence: async (sentence: string) => {
              sentenceCount++;
              const sentenceStart = Date.now();
              
              if (sentenceCount === 1) {
                firstSentenceMs = sentenceStart - claudeStart;
                console.log(`[Custom Voice] ⏱️ First sentence in ${firstSentenceMs}ms`);
                
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
              console.log(`[Custom Voice] ⏱️ Streaming complete: ${claudeMs}ms total, ${sentenceCount} sentences`);
              console.log(`[Custom Voice] 🤖 Tutor: "${fullText}"`);
              
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
            responseLanguage
          ).catch(reject); // Ensure errors are properly propagated
        });

        console.log("[Custom Voice] 🔊 Streaming response sent, waiting for user...");

        // FIX #3: Persist after each turn (before pause to avoid blocking)
        await persistTranscript(state.sessionId, state.transcript);

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // PACING FIX: Release isProcessing BEFORE pause to allow interruptions
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        state.isProcessing = false;
        
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
      
      // Shared transcript handler - same logic as original connection
      const handleTranscript = async (transcript: string, isFinal: boolean, detectedLanguage?: string) => {
        const spokenLang = detectedLanguage || state.language;
        console.log(`[Deepgram] ${isFinal ? '✅ FINAL' : '⏳ interim'}: "${transcript}" (reconnected, lang=${spokenLang})`);
        
        if (!state.userId) return;
        
        // BARGE-IN
        const timeSinceLastAudio = Date.now() - state.lastAudioSentAt;
        if (state.isTutorSpeaking && timeSinceLastAudio < 30000 && transcript.trim().length >= 2) {
          state.wasInterrupted = true;
          state.lastInterruptionTime = Date.now();
          ws.send(JSON.stringify({ type: "interrupt", message: "Student is speaking" }));
          state.isTutorSpeaking = false;
        }
        
        if (state.isTutorSpeaking && timeSinceLastAudio >= 30000) {
          state.isTutorSpeaking = false;
        }
        
        if (!isFinal) return;
        if (!transcript || transcript.trim().length < 3) return;
        
        state.lastActivityTime = Date.now();
        state.inactivityWarningSent = false;
        
        if (state.isProcessing) return;
        if (state.lastTranscript === transcript) return;
        
        state.lastTranscript = transcript;
        if (spokenLang) state.detectedLanguage = spokenLang;
        
        console.log(`[Custom Voice] ✅ Processing FINAL transcript (reconnected): "${transcript}"`);
        
        if (responseTimer) {
          clearTimeout(responseTimer);
          responseTimer = null;
        }
        
        const isIncomplete = isLikelyIncompleteThought(transcript);
        const delay = isIncomplete ? 2500 : 1200;
        
        responseTimer = setTimeout(() => {
          state.transcriptQueue.push(transcript);
          if (!state.isProcessing) {
            processTranscriptQueue();
          }
          responseTimer = null;
        }, delay);
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
                
                const message = susp.isPermanent
                  ? `Your account has been permanently suspended due to violations of our terms of service. Reason: ${susp.reason}. Please contact support.`
                  : `Your account is temporarily suspended until ${susp.suspendedUntil ? new Date(susp.suspendedUntil).toLocaleString() : 'further notice'}. Reason: ${susp.reason}`;
                
                ws.send(JSON.stringify({
                  type: "error",
                  error: message
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
            
            // SECURITY: Session state already has authenticated userId from upgrade
            state.sessionId = message.sessionId;
            // state.userId is already set to authenticatedUserId during state initialization
            state.studentName = message.studentName || "Student";
            state.ageGroup = message.ageGroup || "College/Adult";
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
                state.speechSpeed = 0.95; // Default
                console.log(`[Custom Voice] ⚙️ Using default speech speed: 0.95`);
              }
            } catch (error) {
              console.error("[Custom Voice] ⚠️ Error fetching user settings, using default speech speed:", error);
              state.speechSpeed = 0.95;
            }
            
            // Get full tutor personality based on age group
            const personality = getTutorPersonality(state.ageGroup);
            console.log(`[Custom Voice] 🎭 Using personality: ${personality.name} for ${state.ageGroup}`);
            
            // Load document chunks and format as content strings
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
                let documentIds = messageDocuments;
                
                // If no specific documents requested, get all user documents using authenticated userId
                if (documentIds.length === 0) {
                  console.log(`[Custom Voice] 📄 No specific documents provided, loading all user documents from database...`);
                  const allUserDocs = await storage.getUserDocuments(authenticatedUserId);
                  const readyDocs = allUserDocs.filter(doc => doc.processingStatus === 'ready');
                  documentIds = readyDocs.map(doc => doc.id);
                  console.log(`[Custom Voice] 📚 Found ${readyDocs.length} ready documents for user`);
                }
                
                if (documentIds.length > 0) {
                  console.log(`[Custom Voice] 📄 Loading ${documentIds.length} documents from database...`);
                  const { chunks, documents } = await storage.getDocumentContext(authenticatedUserId, documentIds);
                  console.log(`[Custom Voice] ✅ Loaded ${chunks.length} chunks from ${documents.length} documents`);
                  
                  // Format chunks as content strings grouped by document
                  const documentContents: string[] = [];
                  for (const doc of documents) {
                    const docChunks = chunks
                      .filter(c => c.documentId === doc.id)
                      .sort((a, b) => a.chunkIndex - b.chunkIndex); // Ensure correct chunk order
                    if (docChunks.length > 0) {
                      const content = `📄 ${doc.title || doc.originalName}\n${docChunks.map(c => c.content).join('\n\n')}`;
                      documentContents.push(content);
                    }
                  }
                  
                  state.uploadedDocuments = documentContents;
                  console.log(`[Custom Voice] 📚 Document context prepared: ${documentContents.length} documents, total length: ${documentContents.join('').length} chars`);
                } else {
                  state.uploadedDocuments = [];
                  console.log(`[Custom Voice] ℹ️ No documents available for this user`);
                }
              }
            } catch (error) {
              console.error('[Custom Voice] ❌ Error loading documents:', error);
              state.uploadedDocuments = [];
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
            
            // Build system instruction with personality and document context
            if (state.uploadedDocuments.length > 0) {
              // Extract document titles for the enhanced prompt
              const docTitles = state.uploadedDocuments.map((doc, i) => {
                const titleMatch = doc.match(/^\[Document: ([^\]]+)\]/);
                return titleMatch ? titleMatch[1] : `Document ${i + 1}`;
              });
              
              // Create enhanced system instruction that includes document awareness
              state.systemInstruction = `${personality.systemPrompt}${VOICE_CONVERSATION_CONSTRAINTS}

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
              state.systemInstruction = personality.systemPrompt + VOICE_CONVERSATION_CONSTRAINTS;
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

            // Start Deepgram connection with cleanup on close
            const { getDeepgramLanguageCode } = await import("../services/deepgram-service");
            const deepgramLanguage = getDeepgramLanguageCode(state.language);
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
                // BARGE-IN: Check for interruption on ANY transcript (interim or final)
                // Only trigger if tutor is currently speaking to avoid false positives
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                const timeSinceLastAudio = Date.now() - state.lastAudioSentAt;

                // Only barge-in if tutor is actively speaking AND transcript has content
                if (state.isTutorSpeaking && timeSinceLastAudio < 30000 && transcript.trim().length >= 2) {
                  console.log(`[Custom Voice] 🛑 BARGE-IN on ${isFinal ? 'final' : 'interim'} transcript: "${transcript}" (audio sent ${timeSinceLastAudio}ms ago)`);

                  // Mark interruption for post-interrupt buffer
                  state.wasInterrupted = true;
                  state.lastInterruptionTime = Date.now();

                  // Send interrupt signal to frontend to stop audio playback immediately
                  ws.send(JSON.stringify({
                    type: "interrupt",
                    message: "Student is speaking",
                  }));

                  // Mark tutor as not speaking
                  state.isTutorSpeaking = false;

                  console.log("[Custom Voice] ✅ Barge-in processed, ready to listen to student");
                }

                // Reset stale tutor speaking state (>30s ago)
                if (state.isTutorSpeaking && timeSinceLastAudio >= 30000) {
                  console.log("[Custom Voice] ⏸️ Resetting stale tutor speaking state...");
                  state.isTutorSpeaking = false;
                }
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

                // Only process for AI response on FINAL transcripts
                if (!isFinal) {
                  console.log("[Custom Voice] ⏭️ Skipping interim for AI processing (barge-in already checked)");
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
                
                if (state.isProcessing) {
                  console.log("[Custom Voice] ⏭️ Already processing previous request");
                  return;
                }
                
                // Additional check: Avoid duplicate transcripts
                // Deepgram may send is_final=true multiple times, we want unique ones
                if (state.lastTranscript === transcript) {
                  console.log("[Custom Voice] ⏭️ Duplicate transcript, skipping");
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
                
                console.log(`[Custom Voice] ✅ Processing FINAL transcript: "${transcript}" (lang: ${state.detectedLanguage || state.language})`);
                
                // FIX #2C: Add turn-taking timeout
                // Clear any existing timer
                if (responseTimer) {
                  clearTimeout(responseTimer);
                  responseTimer = null;
                }
                
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                // TIMING FIX (Nov 3, 2025): Server-side response delay INCREASED
                // Give students time to add "oh wait, one more thing..." 
                // Previous delays still caused interruptions - increasing significantly
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                const isIncomplete = isLikelyIncompleteThought(transcript);
                const delay = isIncomplete ? 2500 : 1200; // INCREASED: 2.5s for incomplete, 1.2s for complete
                
                if (isIncomplete) {
                  console.log(`[Custom Voice] ⏸️ Incomplete thought detected: "${transcript}" - waiting ${delay}ms`);
                } else {
                  console.log(`[Custom Voice] ⏰ Complete thought - waiting ${delay}ms before responding`);
                }
                
                responseTimer = setTimeout(() => {
                  console.log(`[Custom Voice] ⏰ Processing after ${delay}ms pause`);
                  state.transcriptQueue.push(transcript);
                  
                  // Start processing if not already processing
                  if (!state.isProcessing) {
                    processTranscriptQueue();
                  }
                  responseTimer = null;
                }, delay); // Wait 1200ms for complete, 2500ms for incomplete thoughts
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

            // Generate and send greeting audio
            try {
              const greetingAudio = await generateSpeech(greeting, state.ageGroup, state.speechSpeed);
              
              // Send greeting transcript
              ws.send(JSON.stringify({
                type: "transcript",
                text: greeting,
                speaker: "tutor"
              }));
              
              // Send greeting audio
              ws.send(JSON.stringify({
                type: "audio",
                data: greetingAudio.toString("base64")
              }));
              
              console.log(`[Custom Voice] 🔊 Sent greeting audio (${greetingAudio.length} bytes)`);
            } catch (error) {
              console.error("[Custom Voice] ❌ Failed to generate greeting audio:", error);
            }

            ws.send(JSON.stringify({ type: "ready" }));
            console.log("[Custom Voice] ✅ Session ready");
            break;

          case "audio":
            // Forward audio to Deepgram with comprehensive logging
            console.log('[Custom Voice] 📥 Audio message received from frontend:', {
              hasData: !!message.data,
              dataLength: message.data?.length || 0,
              hasDeepgramConnection: !!state.deepgramConnection,
              isReconnecting: state.isReconnecting
            });
            
            // RECONNECT FIX: Drop audio during reconnection to prevent sending to dead socket
            if (state.isReconnecting) {
              console.warn('[Custom Voice] ⏸️ Audio dropped - reconnection in progress');
              break;
            }
            
            if (state.deepgramConnection && message.data) {
              try {
                const audioBuffer = Buffer.from(message.data, "base64");
                
                // Check audio content (first 10 samples as Int16)
                const int16View = new Int16Array(audioBuffer.buffer, audioBuffer.byteOffset, Math.min(10, audioBuffer.length / 2));
                const hasNonZero = int16View.some(sample => sample !== 0);
                const maxAmplitude = Math.max(...Array.from(int16View).map(Math.abs));
                
                console.log('[Custom Voice] 🎤 Audio buffer analysis:', {
                  totalBytes: audioBuffer.length,
                  totalSamples: audioBuffer.length / 2,
                  firstTenSamples: Array.from(int16View),
                  hasNonZeroSamples: hasNonZero,
                  maxAmplitude: maxAmplitude,
                  isSilent: !hasNonZero || maxAmplitude < 10  // Lower threshold for quiet mics
                });
                
                if (!hasNonZero) {
                  console.warn('[Custom Voice] ⚠️ Audio buffer is COMPLETELY SILENT (all zeros)!');
                }
                
                // Deepgram LiveClient handles connection state internally - just send
                state.deepgramConnection.send(audioBuffer);
                console.log('[Custom Voice] ✅ Audio forwarded to Deepgram successfully');
              } catch (error) {
                console.error('[Custom Voice] ❌ Error sending audio to Deepgram:', {
                  error: error instanceof Error ? error.message : String(error),
                  stack: error instanceof Error ? error.stack : undefined
                });
              }
            } else {
              console.error('[Custom Voice] ❌ Cannot forward audio:', {
                hasConnection: !!state.deepgramConnection,
                hasData: !!message.data,
                reason: !state.deepgramConnection ? 'No Deepgram connection' : 'No audio data'
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
                
                // Record violation
                if (moderation.violationType && state.sessionId) {
                  await db.insert(contentViolations).values({
                    userId: state.userId,
                    sessionId: state.sessionId,
                    violationType: moderation.violationType,
                    severity: moderation.severity,
                    userMessage: message.message
                  });
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
                  textResponseLanguage
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
          
          case "end":
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            console.log("[Session End] 🛑 RECEIVED SESSION END REQUEST");
            console.log("[Session End] Session ID:", state.sessionId);
            console.log("[Session End] User ID:", state.userId);
            console.log("[Session End] Transcript length:", state.transcript.length);
            console.log("[Session End] Session already ended?", state.isSessionEnded);
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

            // Close Deepgram connection first
            if (state.deepgramConnection) {
              console.log("[Session End] 🎤 Closing Deepgram connection...");
              state.deepgramConnection.close();
              state.deepgramConnection = null;
              console.log("[Session End] ✅ Deepgram closed");
            }

            // Clear persistence interval
            console.log("[Session End] 🧹 Clearing persistence interval...");
            clearInterval(persistInterval);
            console.log("[Session End] ✅ Persistence interval cleared");

            // Finalize session (saves to DB, deducts minutes)
            console.log("[Session End] 💾 Calling finalizeSession...");
            try {
              await finalizeSession(state, 'normal');
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

    ws.on("close", async () => {
      console.log("[Custom Voice] 🔌 Connection closed");
      
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
      
      // Close Deepgram first
      if (state.deepgramConnection) {
        state.deepgramConnection.close();
        state.deepgramConnection = null;
      }
      
      // Clear persistence interval (inactivity timer cleared in finalizeSession)
      clearInterval(persistInterval);
      
      // Finalize session (saves to DB, deducts minutes)
      await finalizeSession(state, 'disconnect');
    });

    ws.on("error", async (error) => {
      console.error("[Custom Voice] ❌ WebSocket error:", error);
      
      // Skip if session was already ended (prevents double-deduction)
      if (state.isSessionEnded) {
        console.log("[Custom Voice] ℹ️ Session already finalized, skipping error handler");
        return;
      }
      
      // Close Deepgram first
      if (state.deepgramConnection) {
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