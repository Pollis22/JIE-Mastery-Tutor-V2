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
    // VAD & TIMING SETTINGS (Dec 10, 2025: Optimized for mid-sentence pauses)
    // Server-side accumulation handles the gap, Deepgram just needs to detect words
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    endpointing: 1200,          // 1.2s of silence detection (matches user request)
    utterance_end_ms: 2000,     // 2s total wait before finalizing (matches user request)
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
    // KEEP-ALIVE MECHANISM (Dec 11, 2025 FIX)
    // Deepgram disconnects after ~10-12 seconds of inactivity (NET0001)
    // Send keepAlive every 8 seconds AFTER first audio frame to prevent idle timeout
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const KEEPALIVE_INTERVAL_MS = 8000;
    let firstAudioSent = false;
    let connectionReady = false;
    let lastTranscriptTime: number = Date.now();
    let lastAudioSentTime: number = Date.now(); // DIAGNOSTIC: Track when audio was last sent
    let audioChunkCount: number = 0; // DIAGNOSTIC: Count audio chunks sent
    let connectionDead = false;
    let keepAliveTimer: NodeJS.Timeout | null = null;
    let keepAliveCount = 0;

    const clearKeepAlive = () => {
      if (keepAliveTimer) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
      }
    };

    connection.on(LiveTranscriptionEvents.Open, () => {
      console.log("[Deepgram] ✅ Connection opened");
      connectionReady = true;
    });

    connection.on(LiveTranscriptionEvents.Transcript, (data) => {
      // HEALTH CHECK: Update last transcript time (tracks connection liveness)
      lastTranscriptTime = Date.now();
      
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

    // DIAGNOSTIC FIX (Dec 10, 2025): Capture close event with full metadata
    connection.on(LiveTranscriptionEvents.Close, (event: any) => {
      clearKeepAlive();
      connectionDead = true;
      const sessionDurationSec = Math.round((Date.now() - lastTranscriptTime) / 1000);
      const closeCode = event?.code || event?.closeCode || 'unknown';
      const closeReason = event?.reason || event?.closeReason || 'unknown';
      
      console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      const timeSinceAudio = Math.round((Date.now() - lastAudioSentTime) / 1000);
      
      console.error("[Deepgram] 🔌 CONNECTION CLOSED - DIAGNOSTIC INFO:");
      console.error("[Deepgram] Close code:", closeCode);
      console.error("[Deepgram] Close reason:", closeReason);
      console.error("[Deepgram] Connection was ready:", connectionReady);
      console.error("[Deepgram] Connection was dead:", connectionDead);
      console.error("[Deepgram] First audio was sent:", firstAudioSent);
      console.error("[Deepgram] Total audio chunks sent:", audioChunkCount);
      console.error("[Deepgram] Time since last audio:", timeSinceAudio, "seconds");
      console.error("[Deepgram] Time since last transcript:", sessionDurationSec, "seconds");
      console.error("[Deepgram] Full close event:", JSON.stringify(event, null, 2));
      console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      
      if (onClose) {
        onClose();
      }
    });

    // Wait for connection to open
    await new Promise((resolve) => {
      connection.on(LiveTranscriptionEvents.Open, resolve);
    });

      const deepgramConnection: DeepgramConnection = {
        send: (audioData: Buffer) => {
          if (connection) {
            connection.send(audioData as any);
            
            // DIAGNOSTIC: Track audio send timing
            lastAudioSentTime = Date.now();
            audioChunkCount++;
            
            // Log every 100 chunks to avoid spam but still track activity
            if (audioChunkCount % 100 === 0) {
              console.log(`[Deepgram] 🎤 Audio chunk #${audioChunkCount} sent (${audioData.length} bytes)`);
            }
            
          // Mark first audio
          if (!firstAudioSent && connectionReady) {
            firstAudioSent = true;
            console.log("[Deepgram] 🎤 First audio sent");
          }

          // Start keepAlive loop after first audio to avoid NET0001 idle timeout
          if (firstAudioSent && !keepAliveTimer && typeof (connection as any).keepAlive === "function") {
            keepAliveTimer = setInterval(() => {
              try {
                (connection as any).keepAlive();
                keepAliveCount++;
                // Log every 5th keepAlive to reduce noise
                if (keepAliveCount % 5 === 0) {
                  const idleSeconds = Math.round((Date.now() - lastAudioSentTime) / 1000);
                  console.log(`[Deepgram] 💓 keepAlive #${keepAliveCount} (idle ${idleSeconds}s)`);
                }
              } catch (err) {
                console.error("[Deepgram] ❌ keepAlive error:", err);
              }
            }, KEEPALIVE_INTERVAL_MS);
          }
          }
        },
        close: () => {
          connectionReady = false;
          clearKeepAlive();
          if (connection) {
            connection.finish();
          }
        },
      };
      
      return deepgramConnection;
    
  } catch (error) {
    console.error("[Deepgram] ❌ Error creating connection:", error);
    throw error;
  }
}
