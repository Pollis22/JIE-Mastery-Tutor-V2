import { WebSocketServer, WebSocket } from "ws";
import { Server } from 'http';
import { IncomingMessage } from 'http';
import { Socket } from 'net';
import { startDeepgramStream, DeepgramConnection } from "../services/deepgram-service";
import { generateTutorResponse } from "../services/ai-service";
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
  reason: 'normal' | 'disconnect' | 'error' | 'violation',
  errorMessage?: string
) {
  // Idempotent: skip if already finalized
  if (state.isSessionEnded) {
    console.log(`[Custom Voice] ℹ️ Session already finalized, skipping (reason: ${reason})`);
    return;
  }

  // Mark as ended FIRST to prevent race conditions
  state.isSessionEnded = true;

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
    
    const state: SessionState = {
      sessionId: "",
      userId: authenticatedUserId, // Use session-authenticated userId
      studentName: "",
      ageGroup: "default",
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
    };

    // FIX #3: Auto-persist every 10 seconds
    const persistInterval = setInterval(async () => {
      if (state.sessionId && state.transcript.length > 0) {
        await persistTranscript(state.sessionId, state.transcript);
        state.lastPersisted = Date.now();
      }
    }, 10000);

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
            
            // Clear intervals before finalizing
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
        
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // TIMING FIX (Nov 4, 2025): Adaptive delays before AI processing
        // Prevents tutor from cutting off students mid-sentence
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        // Calculate appropriate delay based on context
        let responseDelay = TIMING_CONFIG.SERVER_DELAY_COMPLETE_THOUGHT;
        
        // Check if this was likely an incomplete thought
        if (isLikelyIncompleteThought(transcript)) {
          responseDelay = TIMING_CONFIG.SERVER_DELAY_INCOMPLETE_THOUGHT;
          console.log(`[Custom Voice] ⏱️ Detected incomplete thought - using longer delay (${responseDelay}ms)`);
        } else {
          console.log(`[Custom Voice] ⏱️ Complete thought detected - using standard delay (${responseDelay}ms)`);
        }
        
        // Add extra buffer if student just interrupted tutor
        if (state.wasInterrupted) {
          const timeSinceInterrupt = Date.now() - state.lastInterruptionTime;
          if (timeSinceInterrupt < 10000) { // Within 10 seconds
            const extraBuffer = TIMING_CONFIG.POST_INTERRUPT_BUFFER;
            console.log(`[Custom Voice] 🛑 Post-interruption buffer: +${extraBuffer}ms (interrupted ${timeSinceInterrupt}ms ago)`);
            responseDelay += extraBuffer;
          }
          state.wasInterrupted = false; // Clear flag after applying
        }
        
        console.log(`[Custom Voice] ⏳ Waiting ${responseDelay}ms before generating response...`);
        await new Promise(resolve => setTimeout(resolve, responseDelay));
        console.log(`[Custom Voice] ✅ Delay complete, generating AI response...`);
        
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        // Generate AI response (voice input)
        const aiResponse = await generateTutorResponse(
          state.conversationHistory,
          transcript,
          state.uploadedDocuments,
          state.systemInstruction,
          "voice" // Student spoke via microphone
        );

        console.log(`[Custom Voice] 🤖 Tutor: "${aiResponse}"`);

        // Add to conversation history
        state.conversationHistory.push(
          { role: "user", content: transcript },
          { role: "assistant", content: aiResponse }
        );

        // Add AI response to transcript
        const aiTranscriptEntry: TranscriptEntry = {
          speaker: "tutor",
          text: aiResponse,
          timestamp: new Date().toISOString(),
          messageId: crypto.randomUUID(),
        };
        state.transcript.push(aiTranscriptEntry);

        // Send AI transcript to frontend
        ws.send(JSON.stringify({
          type: "transcript",
          speaker: "tutor",
          text: aiResponse,
        }));

        // Generate speech with age-appropriate voice
        const audioBuffer = await generateSpeech(aiResponse, state.ageGroup, state.speechSpeed);

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // PACING FIX: Mark tutor as speaking and track timestamp
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        state.isTutorSpeaking = true;
        const turnTimestamp = Date.now();
        state.lastAudioSentAt = turnTimestamp;

        // Send audio to frontend (only if tutor audio is enabled)
        if (state.tutorAudioEnabled) {
          console.log("[Custom Voice] 🔊 Sending audio response");
          ws.send(JSON.stringify({
            type: "audio",
            data: audioBuffer.toString("base64"),
            mimeType: "audio/pcm;rate=16000"
          }));
        } else {
          console.log("[Custom Voice] 🔇 Skipping audio (tutor audio muted)");
        }

        console.log("[Custom Voice] 🔊 Response sent, waiting for user...");

        // FIX #3: Persist after each turn (before pause to avoid blocking)
        await persistTranscript(state.sessionId, state.transcript);

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // PACING FIX: Release isProcessing BEFORE pause to allow interruptions
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        state.isProcessing = false;
        
        // Calculate audio duration correctly (16kHz, 16-bit = 2 bytes/sample)
        const audioDuration = audioBuffer.length / (16000 * 2); // seconds
        const pauseMs = Math.max(2000, audioDuration * 1000 + 1500); // Audio duration + 1.5s buffer

        console.log(`[Custom Voice] ⏳ Pausing ${pauseMs}ms (audio: ${audioDuration.toFixed(1)}s + 1.5s buffer)...`);

        // Wait for audio to finish playing + give user time to think
        // Note: isTutorSpeaking remains true during this pause, but interrupts can still be detected
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
        state.isProcessing = false; // Ensure processing is released on error
        ws.send(JSON.stringify({ 
          type: "error", 
          error: error instanceof Error ? error.message : "Unknown error"
        }));
        
        // FIX #1: Process next item in queue even after error
        if (state.transcriptQueue.length > 0 && !state.isSessionEnded) {
          setImmediate(() => processTranscriptQueue());
        }
      }
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
            
            // CRITICAL FIX (Nov 14, 2025): Log userId after initialization to verify authentication
            console.log(`[Custom Voice] 🔐 Session state initialized:`, {
              sessionId: state.sessionId,
              userId: state.userId,
              authenticatedUserId: authenticatedUserId,
              hasUserId: !!state.userId,
              userIdType: typeof state.userId,
              studentName: state.studentName,
              ageGroup: state.ageGroup
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
            
            // Build system instruction with personality and document context
            if (state.uploadedDocuments.length > 0) {
              // Extract document titles for the enhanced prompt
              const docTitles = state.uploadedDocuments.map((doc, i) => {
                const titleMatch = doc.match(/^\[Document: ([^\]]+)\]/);
                return titleMatch ? titleMatch[1] : `Document ${i + 1}`;
              });
              
              // Create enhanced system instruction that includes document awareness
              state.systemInstruction = `${personality.systemPrompt}

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
              state.systemInstruction = personality.systemPrompt;
            }
            
            // Generate enhanced personalized greeting
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
            
            // Build personalized greeting based on personality and documents
            if (docTitles.length > 0) {
              // Greeting with document acknowledgment
              const intro = `Hi ${state.studentName}! I'm ${personality.name}, your AI tutor.`;
              
              let docAck: string;
              if (docTitles.length === 1) {
                docAck = ` I can see you've uploaded "${docTitles[0]}" - excellent!`;
              } else {
                docAck = ` I can see you've uploaded ${docTitles.length} documents: ${docTitles.join(', ')}. Great!`;
              }
              
              let closing: string;
              switch (state.ageGroup) {
                case 'K-2':
                  closing = " Let's look at it together! What do you want to learn about?";
                  break;
                case '3-5':
                  closing = " I'm here to help you understand it! What part should we start with?";
                  break;
                case '6-8':
                  closing = " I'm ready to help you master this material! What would you like to work on?";
                  break;
                case '9-12':
                  closing = " Let's dive into this material together. What concepts would you like to explore?";
                  break;
                case 'College/Adult':
                  closing = " I'm ready to help you analyze this material. What aspects would you like to focus on?";
                  break;
                default:
                  closing = " I'm here to help you understand it! What would you like to work on?";
              }
              
              greeting = intro + docAck + closing;
            } else {
              // Greeting without documents
              const intro = `Hi ${state.studentName}! I'm ${personality.name}, your AI tutor.`;
              
              let closing: string;
              switch (state.ageGroup) {
                case 'K-2':
                  closing = " I'm so excited to learn with you today! What would you like to explore?";
                  break;
                case '3-5':
                  closing = " I'm here to help you learn something new! What subject interests you today?";
                  break;
                case '6-8':
                  closing = " I'm here to help you succeed! What subject would you like to focus on today?";
                  break;
                case '9-12':
                  closing = " I'm here to help you excel! What topic would you like to work on today?";
                  break;
                case 'College/Adult':
                  closing = " I'm here to support your learning goals. What subject can I help you with today?";
                  break;
                default:
                  closing = " I'm excited to help you learn! What subject interests you?";
              }
              
              greeting = intro + closing;
            }
            
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
            state.deepgramConnection = await startDeepgramStream(
              async (transcript: string, isFinal: boolean) => {
                // Log EVERYTHING for debugging
                console.log(`[Deepgram] ${isFinal ? '✅ FINAL' : '⏳ interim'}: "${transcript}" (isFinal=${isFinal})`);
                
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
                
                // CRITICAL: Strict checks before processing
                if (!isFinal) {
                  console.log("[Custom Voice] ⏭️ Skipping interim (isFinal=false)");
                  return;
                }
                
                if (!transcript || transcript.trim().length < 3) {
                  console.log("[Custom Voice] ⏭️ Skipping short/empty transcript");
                  return;
                }
                
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                // INTERRUPTION HANDLING: Allow student to interrupt tutor
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                const timeSinceLastAudio = Date.now() - state.lastAudioSentAt;
                
                if (state.isTutorSpeaking && timeSinceLastAudio < 10000) {
                  console.log("[Custom Voice] 🛑 Student interrupted - stopping tutor and listening");
                  
                  // TIMING FIX (Nov 4, 2025): Mark interruption for post-interrupt buffer
                  state.wasInterrupted = true;
                  state.lastInterruptionTime = Date.now();
                  console.log(`[Custom Voice] 🛑 Interruption flag set - will add ${TIMING_CONFIG.POST_INTERRUPT_BUFFER}ms buffer to next response`);
                  
                  // Send interrupt signal to frontend to stop audio playback
                  ws.send(JSON.stringify({
                    type: "interrupt",
                    message: "Student is speaking",
                  }));
                  
                  // Mark tutor as not speaking so we can process the student's input
                  state.isTutorSpeaking = false;
                  
                  // Clear any processing queue to allow new input
                  // Don't return - allow the student's speech to be processed
                  console.log("[Custom Voice] ✅ Ready to listen to student");
                }
                
                // Don't block processing if tutor was interrupted
                // Only wait if tutor is legitimately still speaking (>10s ago)
                if (state.isTutorSpeaking && timeSinceLastAudio >= 10000) {
                  console.log("[Custom Voice] ⏸️ Tutor still speaking (old session)...");
                  state.isTutorSpeaking = false; // Reset stale state
                }
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                
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
                
                console.log(`[Custom Voice] ✅ Processing FINAL transcript: "${transcript}"`);
                
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
              }
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
              deepgramReadyState: state.deepgramConnection?.getReadyState?.() || 'N/A'
            });
            
            if (state.deepgramConnection && message.data) {
              try {
                const audioBuffer = Buffer.from(message.data, "base64");
                console.log('[Custom Voice] 🎤 Audio buffer created:', {
                  bufferSize: audioBuffer.length,
                  isBuffer: Buffer.isBuffer(audioBuffer)
                });
                
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
              
              // Content approved - generate AI response (text input)
              const aiResponse = await generateTutorResponse(
                state.conversationHistory,
                message.message,
                state.uploadedDocuments,
                state.systemInstruction,
                "text" // Student typed via chat
              );
              
              console.log(`[Custom Voice] 🤖 Tutor response: "${aiResponse}"`);
              
              // Add to conversation history
              state.conversationHistory.push(
                { role: "user", content: message.message },
                { role: "assistant", content: aiResponse }
              );
              
              // Add to transcript
              const tutorTextEntry: TranscriptEntry = {
                speaker: "tutor",
                text: aiResponse,
                timestamp: new Date().toISOString(),
                messageId: crypto.randomUUID(),
              };
              state.transcript.push(tutorTextEntry);
              
              // Send transcript update
              ws.send(JSON.stringify({
                type: "transcript",
                speaker: "tutor",
                text: aiResponse
              }));
              
              // Generate and send voice audio
              const responseAudio = await generateSpeech(aiResponse, state.ageGroup, state.speechSpeed);
              ws.send(JSON.stringify({
                type: "audio",
                data: responseAudio.toString("base64")
              }));
              
              console.log(`[Custom Voice] 🔊 Sent tutor voice response`);
              
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
            console.log("[Custom Voice] 🛑 Ending session:", state.sessionId);

            // Close Deepgram connection first
            if (state.deepgramConnection) {
              state.deepgramConnection.close();
              state.deepgramConnection = null;
            }

            // Clear persistence interval
            clearInterval(persistInterval);

            // Finalize session (saves to DB, deducts minutes)
            await finalizeSession(state, 'normal');

            ws.send(JSON.stringify({ 
              type: "ended",
              transcriptLength: state.transcript.length
            }));
            
            ws.close();
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
      
      // Clear interval
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
      
      // Clear intervals before finalizing
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
