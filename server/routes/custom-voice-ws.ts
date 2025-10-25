import { WebSocketServer, WebSocket } from "ws";
import { Server } from 'http';
import { startDeepgramStream, DeepgramConnection } from "../services/deepgram-service";
import { generateTutorResponse } from "../services/ai-service";
import { generateSpeech } from "../services/tts-service";
import { db } from "../db";
import { realtimeSessions } from "@shared/schema";
import { eq } from "drizzle-orm";

interface SessionState {
  sessionId: string;
  userId: string;
  studentName: string;
  ageGroup: string;
  systemInstruction: string;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  transcript: Array<{ speaker: string; text: string; timestamp: string }>;
  uploadedDocuments: string[];
  deepgramConnection: DeepgramConnection | null;
  isProcessing: boolean;
  sessionStartTime: number;
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
      sessionStartTime: Date.now(),
    };

    ws.on("message", async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case "init":
            console.log("[Custom Voice] 🚀 Initializing session:", message.sessionId);
            
            state.sessionId = message.sessionId;
            state.userId = message.userId;
            state.studentName = message.studentName || "Student";
            state.ageGroup = message.ageGroup || "default";
            state.systemInstruction = message.systemInstruction || "";
            state.uploadedDocuments = message.documents || [];

            // Start Deepgram connection
            state.deepgramConnection = await startDeepgramStream(
              async (transcript: string, isFinal: boolean) => {
                if (isFinal && transcript.length > 0 && !state.isProcessing) {
                  state.isProcessing = true;

                  try {
                    // Add to transcript log
                    const transcriptEntry = {
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
                    const aiTranscriptEntry = {
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

                  } catch (error) {
                    console.error("[Custom Voice] ❌ Error processing:", error);
                    ws.send(JSON.stringify({ 
                      type: "error", 
                      error: error instanceof Error ? error.message : "Unknown error"
                    }));
                  } finally {
                    state.isProcessing = false;
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

            // Save transcript to database
            if (state.transcript.length > 0 && state.sessionId) {
              try {
                await db.update(realtimeSessions)
                  .set({
                    transcript: state.transcript as any,
                    endedAt: new Date(),
                  })
                  .where(eq(realtimeSessions.id, state.sessionId));
                console.log("[Custom Voice] 💾 Transcript saved to database");
              } catch (error) {
                console.error("[Custom Voice] ❌ Error saving transcript:", error);
              }
            }

            // Close Deepgram connection
            if (state.deepgramConnection) {
              state.deepgramConnection.close();
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

    ws.on("close", () => {
      console.log("[Custom Voice] 🔌 Connection closed");
      if (state.deepgramConnection) {
        state.deepgramConnection.close();
      }
    });

    ws.on("error", (error) => {
      console.error("[Custom Voice] ❌ WebSocket error:", error);
    });
  });

  return wss;
}
