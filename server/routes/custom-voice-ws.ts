import { WebSocketServer, WebSocket } from "ws";
import { Server } from 'http';
import { startDeepgramStream, DeepgramConnection } from "../services/deepgram-service";
import { generateTutorResponse } from "../services/ai-service";
import { generateSpeech } from "../services/tts-service";
import { db } from "../db";
import { realtimeSessions, contentViolations, userSuspensions } from "@shared/schema";
import { eq, and, or, gte } from "drizzle-orm";
import { getTutorPersonality } from "../config/tutor-personalities";
import { moderateContent, shouldWarnUser, getModerationResponse } from "../services/content-moderation";
import { storage } from "../storage";

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
  const wss = new WebSocketServer({
    server,
    path: '/api/custom-voice-ws'
  });

  console.log('[Custom Voice] WebSocket server initialized on /api/custom-voice-ws');

  wss.on("connection", (ws: WebSocket) => {
    console.log("[Custom Voice] 🔌 New connection");
    
    // FIX #2C: Turn-taking timeout for natural conversation flow
    let responseTimer: NodeJS.Timeout | null = null;
    
    const state: SessionState = {
      sessionId: "",
      userId: "",
      studentName: "",
      ageGroup: "default",
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
      violationCount: 0, // Initialize violation counter
      isSessionEnded: false, // Initialize session termination flag
      isTutorSpeaking: false, // PACING FIX: Initialize tutor speaking state
      lastAudioSentAt: 0, // PACING FIX: Initialize audio timestamp
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
        const moderation = await moderateContent(transcript);
        
        if (!moderation.isAppropriate) {
          console.log(`[Custom Voice] ⚠️  Content violation detected: ${moderation.violationType}`);
          
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
            const audioBuffer = await generateSpeech(aiResponse, state.ageGroup);
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
            const audioBuffer = await generateSpeech(aiResponse, state.ageGroup);
            ws.send(JSON.stringify({
              type: "audio",
              data: audioBuffer.toString("base64"),
              mimeType: "audio/pcm;rate=16000"
            }));
            
            // Persist
            await persistTranscript(state.sessionId, state.transcript);
            return; // Don't continue to normal AI processing
          }
        }
        
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // ✅ Content passed moderation - Continue normal processing
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        // Generate AI response
        const aiResponse = await generateTutorResponse(
          state.conversationHistory,
          transcript,
          state.uploadedDocuments,
          state.systemInstruction
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
        const audioBuffer = await generateSpeech(aiResponse, state.ageGroup);

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // PACING FIX: Mark tutor as speaking and track timestamp
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        state.isTutorSpeaking = true;
        const turnTimestamp = Date.now();
        state.lastAudioSentAt = turnTimestamp;

        // Send audio to frontend
        ws.send(JSON.stringify({
          type: "audio",
          data: audioBuffer.toString("base64"),
          mimeType: "audio/pcm;rate=16000"
        }));

        console.log("[Custom Voice] 🔊 Audio sent, waiting for user response...");

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
            
            // FIX #2: Verify session ownership
            if (!message.sessionId || !message.userId) {
              console.error(`[Custom Voice] ❌ Missing data:`, {
                sessionId: message.sessionId,
                userId: message.userId
              });
              ws.send(JSON.stringify({ 
                type: "error", 
                error: "Missing sessionId or userId" 
              }));
              ws.close();
              return;
            }

            // FIX #2: Validate session exists and belongs to user
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

              // Convert userId to string for comparison (DB stores as varchar)
              const userIdStr = String(message.userId);
              if (session[0].userId !== userIdStr) {
                console.error(`[Custom Voice] ❌ Session ${message.sessionId} does not belong to user`, {
                  sessionUserId: session[0].userId,
                  requestUserId: userIdStr,
                  typeOf: {
                    sessionUserId: typeof session[0].userId,
                    requestUserId: typeof userIdStr
                  }
                });
                ws.send(JSON.stringify({ 
                  type: "error", 
                  error: "Unauthorized session access" 
                }));
                ws.close();
                return;
              }

              console.log(`[Custom Voice] ✅ Session validated for user ${userIdStr}`);
              
              // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              // 🛡️ CHECK FOR ACTIVE SUSPENSIONS
              // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              
              const suspension = await db.select()
                .from(userSuspensions)
                .where(and(
                  eq(userSuspensions.userId, userIdStr),
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
            
            state.sessionId = message.sessionId;
            state.userId = message.userId;
            state.studentName = message.studentName || "Student";
            state.ageGroup = message.ageGroup || "College/Adult";
            
            // Get full tutor personality based on age group
            const personality = getTutorPersonality(state.ageGroup);
            console.log(`[Custom Voice] 🎭 Using personality: ${personality.name} for ${state.ageGroup}`);
            
            // Use full personality system prompt with document context
            state.systemInstruction = personality.systemPrompt;
            
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
                
                // If no specific documents requested, get all user documents
                if (documentIds.length === 0) {
                  console.log(`[Custom Voice] 📄 No specific documents provided, loading all user documents from database...`);
                  const allUserDocs = await storage.getUserDocuments(message.userId);
                  const readyDocs = allUserDocs.filter(doc => doc.processingStatus === 'ready');
                  documentIds = readyDocs.map(doc => doc.id);
                  console.log(`[Custom Voice] 📚 Found ${readyDocs.length} ready documents for user`);
                }
                
                if (documentIds.length > 0) {
                  console.log(`[Custom Voice] 📄 Loading ${documentIds.length} documents from database...`);
                  const { chunks, documents } = await storage.getDocumentContext(message.userId, documentIds);
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
            
            // Send personalized greeting
            const greetings = personality.interactions.greetings;
            const greeting = greetings[Math.floor(Math.random() * greetings.length)]
              .replace('{studentName}', state.studentName);
            
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
                // PACING FIX: Detect if student is interrupting tutor
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                const timeSinceLastAudio = Date.now() - state.lastAudioSentAt;
                
                if (state.isTutorSpeaking && timeSinceLastAudio < 3000) {
                  console.log("[Custom Voice] 🛑 Student interrupted - stopping tutor");
                  
                  // Send interrupt signal to frontend to stop audio playback
                  ws.send(JSON.stringify({
                    type: "interrupt",
                    message: "Student is speaking",
                  }));
                  
                  state.isTutorSpeaking = false;
                }
                
                // Don't process if tutor is still speaking (unless interrupted)
                if (state.isTutorSpeaking) {
                  console.log("[Custom Voice] ⏸️ Waiting for tutor to finish...");
                  return;
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
                
                // Wait 500ms to see if student continues speaking (increased from 300ms)
                responseTimer = setTimeout(() => {
                  console.log("[Custom Voice] ⏰ Processing after pause");
                  state.transcriptQueue.push(transcript);
                  
                  // Start processing if not already processing
                  if (!state.isProcessing) {
                    processTranscriptQueue();
                  }
                  responseTimer = null;
                }, 500); // Wait 500ms before responding (increased for better turn-taking)
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
              const greetingAudio = await generateSpeech(greeting, state.ageGroup);
              
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
            // Forward audio to Deepgram
            if (state.deepgramConnection && message.data) {
              const audioBuffer = Buffer.from(message.data, "base64");
              state.deepgramConnection.send(audioBuffer);
            }
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
