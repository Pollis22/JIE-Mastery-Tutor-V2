import { WebSocketServer, WebSocket } from "ws";
import { Server } from 'http';
import { startDeepgramStream, DeepgramConnection } from "../services/deepgram-service";
import { generateTutorResponse } from "../services/ai-service";
import { generateSpeech } from "../services/tts-service";
import { db } from "../db";
import { realtimeSessions } from "@shared/schema";
import { eq } from "drizzle-orm";

interface TranscriptEntry {
  speaker: string;
  text: string;
  timestamp: string;
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
}

// FIX #3: Incremental persistence helper
async function persistTranscript(sessionId: string, transcript: TranscriptEntry[]) {
  if (!sessionId || transcript.length === 0) return;
  
  try {
    await db.update(realtimeSessions)
      .set({
        transcript: transcript as any,
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
                  error: "Invalid session" 
                }));
                ws.close();
                return;
              }

              if (session[0].userId !== message.userId) {
                console.error(`[Custom Voice] ❌ Session ${message.sessionId} does not belong to user ${message.userId}`);
                ws.send(JSON.stringify({ 
                  type: "error", 
                  error: "Unauthorized session access" 
                }));
                ws.close();
                return;
              }

              console.log(`[Custom Voice] ✅ Session validated for user ${message.userId}`);
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
            state.ageGroup = message.ageGroup || "default";
            state.systemInstruction = message.systemInstruction || "";
            state.uploadedDocuments = message.documents || [];

            // Start Deepgram connection
            state.deepgramConnection = await startDeepgramStream(
              async (transcript: string, isFinal: boolean) => {
                // FIX #1: Queue transcripts instead of dropping them
                if (isFinal && transcript.length > 0) {
                  console.log(`[Custom Voice] 📥 Queuing transcript: "${transcript}"`);
                  state.transcriptQueue.push(transcript);
                  
                  // Start processing if not already processing
                  if (!state.isProcessing) {
                    processTranscriptQueue();
                  }
                }
              },
              (error: Error) => {
                console.error("[Custom Voice] ❌ Deepgram error:", error);
                ws.send(JSON.stringify({ type: "error", error: error.message }));
              }
            );

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

            // FIX #3: Final persist
            if (state.transcript.length > 0 && state.sessionId) {
              try {
                await db.update(realtimeSessions)
                  .set({
                    transcript: state.transcript as any,
                    endedAt: new Date(),
                  })
                  .where(eq(realtimeSessions.id, state.sessionId));
                console.log("[Custom Voice] 💾 Final transcript saved to database");
              } catch (error) {
                console.error("[Custom Voice] ❌ Error saving transcript:", error);
              }
            }

            // Close Deepgram connection
            if (state.deepgramConnection) {
              state.deepgramConnection.close();
            }

            // Clear persistence interval
            clearInterval(persistInterval);

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
      
      // FIX #3: Persist on disconnect
      if (state.sessionId && state.transcript.length > 0) {
        await persistTranscript(state.sessionId, state.transcript);
      }
      
      if (state.deepgramConnection) {
        state.deepgramConnection.close();
      }
      
      clearInterval(persistInterval);
    });

    ws.on("error", async (error) => {
      console.error("[Custom Voice] ❌ WebSocket error:", error);
      
      // FIX #3: Persist on error
      if (state.sessionId && state.transcript.length > 0) {
        await persistTranscript(state.sessionId, state.transcript);
      }
    });
  });

  return wss;
}
