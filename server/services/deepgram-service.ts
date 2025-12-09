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
  keepAliveInterval?: NodeJS.Timeout; // Track the keepAlive interval for cleanup
}

/**
 * Map our app language codes to Deepgram-supported language codes.
 * Uses exact format that Deepgram expects for Nova-2 model.
 * For unsupported languages, falls back to English STT.
 */
const DEEPGRAM_LANGUAGE_MAP: Record<string, string> = {
  en: 'en-US',     // English (US)
  es: 'es',        // Spanish
  fr: 'fr',        // French
  de: 'de',        // German
  it: 'it',        // Italian
  pt: 'pt-BR',     // Portuguese (Brazil)
  nl: 'nl',        // Dutch
  ja: 'ja',        // Japanese
  ko: 'ko',        // Korean
  zh: 'zh-CN',     // Chinese (Mandarin)
  ru: 'ru',        // Russian
  pl: 'pl',        // Polish
  tr: 'tr',        // Turkish
  hi: 'hi',        // Hindi
  id: 'id',        // Indonesian
  sv: 'sv',        // Swedish
  da: 'da',        // Danish
  no: 'no',        // Norwegian
  fi: 'fi',        // Finnish
  uk: 'uk',        // Ukrainian
  cs: 'cs',        // Czech
  el: 'el',        // Greek
  hu: 'hu',        // Hungarian
  ro: 'ro',        // Romanian
  // Languages NOT in this map (sw, ar, th, vi, yo, ha) will fall back to English
};

export function getDeepgramLanguageCode(lang: string): string {
  const mapped = DEEPGRAM_LANGUAGE_MAP[lang];
  if (!mapped) {
    console.log(`[Deepgram] ⚠️ Language '${lang}' not supported by Deepgram, using en-US for STT`);
    return 'en-US';
  }
  console.log(`[Deepgram] Using language: ${mapped} (from ${lang})`);
  return mapped;
}

export async function startDeepgramStream(
  onTranscript: (text: string, isFinal: boolean, detectedLanguage?: string) => void,
  onError: (error: Error) => void,
  onClose?: () => void,
  language: string = "en-US"
): Promise<DeepgramConnection> {
  
  // Use 'multi' for seamless language switching, fall back to specific language if needed
  const useMultiLanguage = true; // Enable auto-detection for all sessions
  const effectiveLanguage = useMultiLanguage ? 'multi' : language;
  
  console.log("[Deepgram] 🎤 Starting stream with language:", effectiveLanguage, "(selected:", language, ")");
  
  try {
    const deepgramClient = getDeepgramClient();
    const connection = deepgramClient.listen.live({
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // MODEL & LANGUAGE SETTINGS - MULTI-LANGUAGE AUTO-DETECTION
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    model: "nova-2",            // Best accuracy model with multi-language support
    language: effectiveLanguage, // 'multi' enables seamless language switching
    smart_format: true,         // Auto-format numbers, dates, etc.
    interim_results: true,      // Get real-time partial transcripts
    punctuate: true,            // Add punctuation for better readability
    profanity_filter: false,    // Don't filter any words
    diarize: false,             // Single speaker optimization

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // AUDIO QUALITY & SENSITIVITY SETTINGS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    encoding: "linear16",
    sample_rate: 16000,
    channels: 1,                // Mono audio
    multichannel: false,        // Single channel optimization

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // VAD & TIMING SETTINGS (OPTIMIZED FOR QUIET SPEECH)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    endpointing: 2000,          // 2s of silence before speech end (faster response)
    utterance_end_ms: 2000,     // 2s total wait before finalizing
    vad_events: true,           // Enable voice activity detection events
    vad_threshold: 0.15,        // VERY LOW threshold for quiet speech detection (was 0.3)

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ACCURACY ENHANCEMENTS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    filler_words: true,         // Include "um", "uh" for natural speech
    numerals: true,             // Convert spoken numbers to digits
    });

    console.log("[Deepgram] 📡 Connection object created");

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // KEEP-ALIVE MECHANISM (Dec 9, 2025 FIX)
    // Deepgram disconnects after ~10-12 seconds of inactivity
    // Send keepAlive every 5 seconds to prevent timeout
    // NOTE: keepAlive only works AFTER first audio frame is sent
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    let keepAliveInterval: NodeJS.Timeout | null = null;
    let firstAudioSent = false;
    let connectionReady = false;

    connection.on(LiveTranscriptionEvents.Open, () => {
      console.log("[Deepgram] ✅ Connection opened");
      connectionReady = true;
    });

    connection.on(LiveTranscriptionEvents.Transcript, (data) => {
      // Extract detected language from various possible locations in response
      const detectedLanguage = (data as any).detected_language || 
                               (data as any).channel?.detected_language ||
                               (data as any).channel?.alternatives?.[0]?.languages?.[0] ||
                               language; // Fall back to selected language
      
      console.log('[Deepgram] 📥 RAW TRANSCRIPT EVENT:', JSON.stringify({
        has_channel: !!data.channel,
        has_alternatives: !!data.channel?.alternatives,
        alternatives_length: data.channel?.alternatives?.length || 0,
        is_final: data.is_final,
        type: data.type,
        detected_language: detectedLanguage,
        full_data_keys: Object.keys(data)
      }, null, 2));
      
      const transcript = data.channel?.alternatives?.[0]?.transcript;
      const isFinal = data.is_final;
      
      console.log('[Deepgram] 📝 Parsed transcript data:', {
        text: transcript,
        textLength: transcript?.length || 0,
        isFinal: isFinal,
        hasText: !!transcript,
        isEmpty: !transcript || transcript.trim().length === 0,
        detectedLanguage: detectedLanguage
      });
      
      if (transcript && transcript.length > 0) {
        console.log(`[Deepgram] ✅ VALID TRANSCRIPT: ${isFinal ? '📝 FINAL' : '⏳ interim'}: "${transcript}" [lang: ${detectedLanguage}]`);
        onTranscript(transcript, isFinal, detectedLanguage);
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
      
      // Clear keepAlive interval on close
      if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
        console.log("[Deepgram] 💓 KeepAlive interval cleared");
      }
      
      if (onClose) {
        onClose();
      }
    });

    // Wait for connection to open
    await new Promise((resolve) => {
      connection.on(LiveTranscriptionEvents.Open, resolve);
    });

    // Helper function to start keepAlive interval
    const startKeepAliveInterval = () => {
      if (keepAliveInterval) return; // Already running
      
      keepAliveInterval = setInterval(() => {
        try {
          if (connectionReady && (connection as any).keepAlive) {
            (connection as any).keepAlive();
            console.log("[Deepgram] 💓 KeepAlive sent");
          }
        } catch (err) {
          console.warn("[Deepgram] ⚠️ KeepAlive failed:", err);
        }
      }, 5000); // Every 5 seconds
      
      console.log("[Deepgram] 💓 KeepAlive interval started (every 5s)");
    };

    const deepgramConnection: DeepgramConnection = {
      send: (audioData: Buffer) => {
        if (connection) {
          connection.send(audioData);
          
          // Start keepAlive after first audio is sent (per Deepgram docs)
          if (!firstAudioSent && connectionReady) {
            firstAudioSent = true;
            console.log("[Deepgram] 🎤 First audio sent - starting keepAlive");
            startKeepAliveInterval();
          }
        }
      },
      close: () => {
        // Clear keepAlive interval first
        if (keepAliveInterval) {
          clearInterval(keepAliveInterval);
          keepAliveInterval = null;
          console.log("[Deepgram] 💓 KeepAlive interval cleared on close()");
        }
        connectionReady = false;
        if (connection) {
          connection.finish();
        }
      },
      keepAliveInterval: keepAliveInterval || undefined,
    };
    
    return deepgramConnection;
    
  } catch (error) {
    console.error("[Deepgram] ❌ Error creating connection:", error);
    throw error;
  }
}
