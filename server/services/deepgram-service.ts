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
 * Get the Deepgram-compatible language code.
 * Deepgram Nova-2 supports 36 languages (as of May 2024).
 * For unsupported languages, we fall back to English STT
 * but Claude AI will still respond in the target language.
 */
export function getDeepgramLanguageCode(languageCode: string): string {
  // Deepgram Nova-2 supported languages (use simple codes, not regional)
  // Reference: https://deepgram.com/changelog/nova-2-now-supports-36-languages
  const supportedLanguages: { [key: string]: string } = {
    'en': 'en',      // English
    'es': 'es',      // Spanish  
    'fr': 'fr',      // French
    'de': 'de',      // German
    'it': 'it',      // Italian
    'pt': 'pt',      // Portuguese
    'zh': 'zh',      // Chinese (Mandarin)
    'ja': 'ja',      // Japanese
    'ko': 'ko',      // Korean
    'hi': 'hi',      // Hindi
    'ru': 'ru',      // Russian
    'nl': 'nl',      // Dutch
    'pl': 'pl',      // Polish
    'tr': 'tr',      // Turkish
    'vi': 'vi',      // Vietnamese
    'th': 'th',      // Thai
    'id': 'id',      // Indonesian
    'sv': 'sv',      // Swedish
    'da': 'da',      // Danish
    'no': 'no',      // Norwegian
    'fi': 'fi',      // Finnish
    'uk': 'uk',      // Ukrainian
    'cs': 'cs',      // Czech
    'el': 'el',      // Greek
    'hu': 'hu',      // Hungarian
    'ro': 'ro',      // Romanian
    'bg': 'bg',      // Bulgarian
    'sk': 'sk',      // Slovak
    'et': 'et',      // Estonian
    'lv': 'lv',      // Latvian
    'lt': 'lt',      // Lithuanian
    'ca': 'ca',      // Catalan
    'ms': 'ms',      // Malay
  };
  
  // Languages NOT supported by Deepgram Nova-2 - use multi-language detection
  // This allows students to speak in English while Claude responds in their language
  const unsupportedLanguages = ['ar', 'sw', 'yo', 'ha', 'am', 'af'];
  
  if (unsupportedLanguages.includes(languageCode)) {
    console.log(`[Deepgram] ⚠️ Language '${languageCode}' not supported by Nova-2, using multi-language detection`);
    return 'multi';  // Use multi-language detection for unsupported languages
  }
  
  const deepgramCode = supportedLanguages[languageCode];
  if (!deepgramCode) {
    console.log(`[Deepgram] ⚠️ Unknown language '${languageCode}', falling back to English`);
    return 'en';
  }
  
  return deepgramCode;
}

export async function startDeepgramStream(
  onTranscript: (text: string, isFinal: boolean) => void,
  onError: (error: Error) => void,
  onClose?: () => void,
  language: string = "en-US"
): Promise<DeepgramConnection> {
  
  console.log("[Deepgram] 🎤 Starting stream with language:", language);
  
  try {
    const deepgramClient = getDeepgramClient();
    const connection = deepgramClient.listen.live({
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // MODEL & LANGUAGE SETTINGS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    model: "nova-2",            // Best accuracy model
    language: language,
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
