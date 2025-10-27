import { WebSocketServer, WebSocket } from "ws";
import { Server } from 'http';
import { startDeepgramStream, DeepgramConnection } from "../services/deepgram-service";
import { generateTutorResponse } from "../services/ai-service";
import { generateSpeech } from "../services/tts-service";
import { db } from "../db";
import { realtimeSessions } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getTutorPersonality } from "../config/tutor-personalities";

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
      if (state.isProcessing || state.transcriptQueue.length === 0) {
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

        // Send audio to frontend
        ws.send(JSON.stringify({
          type: "audio",
          data: audioBuffer.toString("base64"),
          mimeType: "audio/pcm;rate=16000"
        }));

        // FIX #3: Persist after each turn
        await persistTranscript(state.sessionId, state.transcript);

      } catch (error) {
        console.error("[Custom Voice] ❌ Error processing:", error);
        ws.send(JSON.stringify({ 
          type: "error", 
          error: error instanceof Error ? error.message : "Unknown error"
        }));
      } finally {
        state.isProcessing = false;
        
        // FIX #1: Process next item in queue if any
        if (state.transcriptQueue.length > 0) {
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
            state.uploadedDocuments = message.documents || [];
            
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
            
            // Calculate session duration in minutes
            const durationSeconds = Math.floor((Date.now() - state.sessionStartTime) / 1000);
            const durationMinutes = Math.max(1, Math.ceil(durationSeconds / 60));

            // Close Deepgram connection first
            if (state.deepgramConnection) {
              state.deepgramConnection.close();
              state.deepgramConnection = null;
            }

            // Clear persistence interval
            clearInterval(persistInterval);

            // FIX #3: Final persist with endedAt timestamp
            if (state.transcript.length > 0 && state.sessionId) {
              try {
                await db.update(realtimeSessions)
                  .set({
                    transcript: state.transcript,
                    endedAt: new Date(),
                  })
                  .where(eq(realtimeSessions.id, state.sessionId));
                console.log("[Custom Voice] 💾 Final transcript saved to database");
              } catch (error) {
                console.error("[Custom Voice] ❌ Error saving transcript:", error);
              }
            }

            ws.send(JSON.stringify({ 
              type: "ended",
              duration: durationMinutes,
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
      
      // FIX #3: Final persist on unexpected disconnect
      if (state.sessionId && state.transcript.length > 0) {
        await persistTranscript(state.sessionId, state.transcript);
      }
    });

    ws.on("error", async (error) => {
      console.error("[Custom Voice] ❌ WebSocket error:", error);
      
      // Close Deepgram first
      if (state.deepgramConnection) {
        state.deepgramConnection.close();
        state.deepgramConnection = null;
      }
      
      // FIX #3: Final persist on error
      if (state.sessionId && state.transcript.length > 0) {
        await persistTranscript(state.sessionId, state.transcript);
      }
    });
  });

  return wss;
}
