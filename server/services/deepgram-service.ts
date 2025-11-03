/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 * 
 * This source code is confidential and proprietary.
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */


import { createClient, LiveTranscriptionEvents, type DeepgramClient } from "@deepgram/sdk";

// Lazy initialization - only create client when actually needed
let deepgram: DeepgramClient | null = null;

function getDeepgramClient(): DeepgramClient {
  if (!deepgram) {
    // Validate API key exists
    if (!process.env.DEEPGRAM_API_KEY) {
      console.error("[Deepgram] ❌ DEEPGRAM_API_KEY not found in environment variables");
      console.error("[Deepgram] ❌ Available env vars:", Object.keys(process.env).filter(k => k.includes('DEEPGRAM')));
      throw new Error("Missing DEEPGRAM_API_KEY environment variable");
    }

    // Log API key status (partial for security)
    console.log("[Deepgram] ✅ API key found:", 
      process.env.DEEPGRAM_API_KEY.substring(0, 15) + "..."
    );

    // Initialize Deepgram client with explicit API key
    deepgram = createClient(process.env.DEEPGRAM_API_KEY);
    console.log("[Deepgram] ✅ Client initialized");
  }
  return deepgram;
}

export interface DeepgramConnection {
  send: (audioData: Buffer) => void;
  close: () => void;
}

export async function startDeepgramStream(
  onTranscript: (text: string, isFinal: boolean) => void,
  onError: (error: Error) => void,
  onClose?: () => void
): Promise<DeepgramConnection> {
  
  console.log("[Deepgram] 🎤 Starting stream...");
  
  try {
    const deepgramClient = getDeepgramClient();
    const connection = deepgramClient.listen.live({
    model: "nova-2",
    language: "en-US",
    smart_format: true,
    interim_results: true,
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // TIMING FIX (Nov 3, 2025): Increased to reduce interruptions
    // Students need time to think, formulate thoughts, and complete sentences
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    endpointing: 1200,          // 1.2s of silence before considering speech ended (was 800ms)
    utterance_end_ms: 2500,     // 2.5s total wait before finalizing (was 1500ms)
    vad_events: true,
    vad_threshold: 0.5,         // Sensitivity to detect when user is speaking
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    encoding: "linear16",
    sample_rate: 16000,
    });

    console.log("[Deepgram] 📡 Connection object created");

    connection.on(LiveTranscriptionEvents.Open, () => {
      console.log("[Deepgram] ✅ Connection opened");
    });

    connection.on(LiveTranscriptionEvents.Transcript, (data) => {
      const transcript = data.channel?.alternatives?.[0]?.transcript;
      const isFinal = data.is_final;
      
      if (transcript && transcript.length > 0) {
        console.log(`[Deepgram] ${isFinal ? '📝 FINAL' : '⏳ interim'}: ${transcript}`);
        onTranscript(transcript, isFinal);
      }
    });

    connection.on(LiveTranscriptionEvents.Error, (error) => {
      console.error("[Deepgram] ❌ Error:", error);
      onError(error);
    });

    connection.on(LiveTranscriptionEvents.Close, () => {
      console.log("[Deepgram] 🔌 Connection closed");
      if (onClose) {
        onClose();
      }
    });

    // Wait for connection to open
    await new Promise((resolve) => {
      connection.on(LiveTranscriptionEvents.Open, resolve);
    });

    return {
      send: (audioData: Buffer) => {
        if (connection) {
          connection.send(audioData);
        }
      },
      close: () => {
        if (connection) {
          connection.finish();
        }
      },
    };
    
  } catch (error) {
    console.error("[Deepgram] ❌ Error creating connection:", error);
    throw error;
  }
}
