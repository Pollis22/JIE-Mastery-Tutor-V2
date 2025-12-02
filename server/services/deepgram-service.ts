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
    punctuate: true,            // Add punctuation for better readability

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // TIMING & ACCURACY SETTINGS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    endpointing: 2500,          // 2.5s of silence before speech end (reduced from 3.5s for faster response)
    utterance_end_ms: 2500,     // 2.5s total wait before finalizing
    vad_events: true,
    vad_threshold: 0.3,         // LOWER threshold for better sensitivity (was 0.5)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    encoding: "linear16",
    sample_rate: 16000,
    channels: 1,                // Mono audio
    });

    console.log("[Deepgram] 📡 Connection object created");

    connection.on(LiveTranscriptionEvents.Open, () => {
      console.log("[Deepgram] ✅ Connection opened");
    });

    connection.on(LiveTranscriptionEvents.Transcript, (data) => {
      console.log('[Deepgram] 📥 RAW TRANSCRIPT EVENT:', JSON.stringify({
        has_channel: !!data.channel,
        has_alternatives: !!data.channel?.alternatives,
        alternatives_length: data.channel?.alternatives?.length || 0,
        is_final: data.is_final,
        type: data.type,
        full_data_keys: Object.keys(data)
      }, null, 2));
      
      const transcript = data.channel?.alternatives?.[0]?.transcript;
      const isFinal = data.is_final;
      
      console.log('[Deepgram] 📝 Parsed transcript data:', {
        text: transcript,
        textLength: transcript?.length || 0,
        isFinal: isFinal,
        hasText: !!transcript,
        isEmpty: !transcript || transcript.trim().length === 0
      });
      
      if (transcript && transcript.length > 0) {
        console.log(`[Deepgram] ✅ VALID TRANSCRIPT: ${isFinal ? '📝 FINAL' : '⏳ interim'}: "${transcript}"`);
        onTranscript(transcript, isFinal);
      } else {
        console.log('[Deepgram] ⚠️ Empty or null transcript, skipping');
      }
    });

    connection.on(LiveTranscriptionEvents.Error, (error) => {
      console.error("[Deepgram] ❌ ERROR EVENT:", {
        message: error?.message || String(error),
        code: (error as any)?.code,
        type: (error as any)?.type,
        stack: error?.stack
      });
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
