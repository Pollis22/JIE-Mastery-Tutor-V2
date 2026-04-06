/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 * 
 * This source code is confidential and proprietary.
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */


import { ElevenLabsClient } from "elevenlabs";

// Lazy initialization for ElevenLabs client
let elevenlabs: ElevenLabsClient | null = null;

function getElevenLabsClient(): ElevenLabsClient {
  if (!elevenlabs) {
    if (!process.env.ELEVENLABS_API_KEY) {
      console.error("[TTS Service] ❌ ELEVENLABS_API_KEY not found in environment variables");
      throw new Error("Missing ELEVENLABS_API_KEY environment variable");
    }
    console.log("[TTS Service] ✅ ElevenLabs API key found");
    elevenlabs = new ElevenLabsClient({
      apiKey: process.env.ELEVENLABS_API_KEY,
    });
  }
  return elevenlabs;
}

// Voice mapping for different age groups and tutor personalities
const VOICE_MAP: Record<string, string> = {
  // Lowercase formats
  'k-2': '21m00Tcm4TlvDq8ikWAM',      // Rachel - friendly, warm (Buddy Bear)
  '3-5': 'EXAVITQu4vr4xnSDxMaL',      // Sarah - enthusiastic (Max Explorer)
  '6-8': 'ErXwobaYiN019PkySvjV',      // Antoni - clear, professional (Dr. Nova)
  '9-12': 'VR6AewLTigWG4xSOukaG',     // Arnold - authoritative (Professor Ace)
  'college': 'pqHfZKP75CvOlQylNhV4',  // Bill - mature, professional (Dr. Morgan)
  
  // Capitalized formats
  'K-2': '21m00Tcm4TlvDq8ikWAM',
  'College/Adult': 'pqHfZKP75CvOlQylNhV4',
  'college/adult': 'pqHfZKP75CvOlQylNhV4',
  
  'default': '21m00Tcm4TlvDq8ikWAM'   // Rachel (fallback)
};

// Voice-specific settings optimized for each tutor personality
// Lower stability = more natural human-like variation
// Higher similarity_boost = stays more true to voice characteristics
const VOICE_SETTINGS_MAP: Record<string, { stability: number; similarity_boost: number }> = {
  '21m00Tcm4TlvDq8ikWAM': { stability: 0.35, similarity_boost: 0.85 },   // Rachel - warm with more natural variation
  'EXAVITQu4vr4xnSDxMaL': { stability: 0.35, similarity_boost: 0.85 },   // Sarah - enthusiastic with natural feel
  'ErXwobaYiN019PkySvjV': { stability: 0.25, similarity_boost: 0.85 },   // Antoni - naturally expressive
  'VR6AewLTigWG4xSOukaG': { stability: 0.25, similarity_boost: 0.85 },   // Arnold - dynamic with human-like emotion
  'pqHfZKP75CvOlQylNhV4': { stability: 0.35, similarity_boost: 0.85 },   // Bill - professional yet natural
};

export async function generateSpeech(
  text: string,
  ageGroup: string = 'default',
  userSpeechSpeed?: number | string
): Promise<Buffer> {
  
  try {
    const elevenlabsClient = getElevenLabsClient();
    const voiceId = VOICE_MAP[ageGroup] || VOICE_MAP['default'];
    
    // Enhanced logging to track voice selection
    const voiceName = ageGroup === 'k-2' || ageGroup === 'K-2' ? 'Rachel' :
                      ageGroup === '3-5' ? 'Sarah' :
                      ageGroup === '6-8' ? 'Antoni' :
                      ageGroup === '9-12' ? 'Arnold' :
                      (ageGroup === 'college' || ageGroup === 'College/Adult' || ageGroup === 'college/adult') ? 'Bill' : 'Rachel (default)';
    
    // Get voice-specific settings to preserve natural voice characteristics
    const voiceSettings = VOICE_SETTINGS_MAP[voiceId] || { stability: 0.5, similarity_boost: 0.75 };
    
    // Parse user's speech speed preference (from settings slider: 0.7-1.2)
    // DEFAULT CHANGED TO 1.0 (Dec 20, 2025) - normal speed for clarity
    // NOTE: ElevenLabs API only accepts speed range 0.7-1.2
    let speed = 1.0;  // Normal speed - clear and easy to understand
    if (userSpeechSpeed !== undefined && userSpeechSpeed !== null) {
      speed = typeof userSpeechSpeed === 'string' ? parseFloat(userSpeechSpeed) : userSpeechSpeed;
      
      // Guard against NaN and invalid values - revert to default if parsing failed
      if (!Number.isFinite(speed)) {
        console.warn(`[ElevenLabs] ⚠️ Invalid speechSpeed value: "${userSpeechSpeed}" (parsed as ${speed}), using default 1.0`);
        speed = 1.0;
      } else {
        const originalSpeed = speed;
        // Clamp to ElevenLabs valid range (0.7-1.2)
        speed = Math.max(0.7, Math.min(1.2, speed));
        if (speed !== originalSpeed) {
          console.log(`[ElevenLabs] ⚙️ Speed clamped from ${originalSpeed} to ${speed} (ElevenLabs valid range: 0.7-1.2)`);
        }
      }
    }
    
    console.log(`[ElevenLabs] 🎤 Generating speech | Age Group: "${ageGroup}" | Voice: ${voiceName} | Voice ID: ${voiceId} | Stability: ${voiceSettings.stability} | Speed: ${speed} | Text: "${text.substring(0, 50)}..."`);
    
    // ⏱️ LATENCY TIMING: Track ElevenLabs API call
    const apiStart = Date.now();
    console.log(`[ElevenLabs] ⏱️ Calling ElevenLabs API... (text length: ${text.length} chars)`);
    
    const audioStream = await elevenlabsClient.textToSpeech.convert(voiceId, {
      text: text,
      model_id: "eleven_flash_v2_5",
      output_format: "pcm_16000",
      voice_settings: {
        stability: voiceSettings.stability,
        similarity_boost: voiceSettings.similarity_boost,
        style: 0.0,
        use_speaker_boost: true,
        speed: speed,  // Use user's preference from settings, or default to 0.95
      },
    });

    const firstChunkTime = Date.now();
    let firstChunkLogged = false;
    const chunks: Buffer[] = [];
    for await (const chunk of audioStream) {
      if (!firstChunkLogged) {
        console.log(`[ElevenLabs] ⏱️ First chunk received in ${Date.now() - apiStart}ms`);
        firstChunkLogged = true;
      }
      chunks.push(chunk);
    }

    const audioBuffer = Buffer.concat(chunks);
    const totalMs = Date.now() - apiStart;
    console.log(`[ElevenLabs] ⏱️ Total TTS time: ${totalMs}ms | Generated ${audioBuffer.length} bytes of audio`);
    
    return audioBuffer;
    
  } catch (error) {
    console.error("[ElevenLabs] ❌ Error:", error);
    throw error;
  }
}

/**
 * Streaming variant of generateSpeech(). Yields each audio chunk as it arrives
 * from ElevenLabs instead of buffering the entire response. Saves 200-500ms
 * of latency per sentence for the voice pipeline.
 *
 * Same voice selection, speed parsing, and voice settings logic as generateSpeech().
 * Use generateSpeech() for short one-off messages (warnings, goodbyes, coaching).
 * Use generateSpeechStream() for tutoring responses piped through the WS voice pipeline.
 */
export async function* generateSpeechStream(
  text: string,
  ageGroup: string = 'default',
  userSpeechSpeed?: number | string
): AsyncGenerator<Buffer> {

  const elevenlabsClient = getElevenLabsClient();
  const voiceId = VOICE_MAP[ageGroup] || VOICE_MAP['default'];

  const voiceName = ageGroup === 'k-2' || ageGroup === 'K-2' ? 'Rachel' :
                    ageGroup === '3-5' ? 'Sarah' :
                    ageGroup === '6-8' ? 'Antoni' :
                    ageGroup === '9-12' ? 'Arnold' :
                    (ageGroup === 'college' || ageGroup === 'College/Adult' || ageGroup === 'college/adult') ? 'Bill' : 'Rachel (default)';

  const voiceSettings = VOICE_SETTINGS_MAP[voiceId] || { stability: 0.5, similarity_boost: 0.75 };

  let speed = 1.0;
  if (userSpeechSpeed !== undefined && userSpeechSpeed !== null) {
    speed = typeof userSpeechSpeed === 'string' ? parseFloat(userSpeechSpeed) : userSpeechSpeed;
    if (!Number.isFinite(speed)) {
      console.warn(`[ElevenLabs Stream] ⚠️ Invalid speechSpeed value: "${userSpeechSpeed}" (parsed as ${speed}), using default 1.0`);
      speed = 1.0;
    } else {
      const originalSpeed = speed;
      speed = Math.max(0.7, Math.min(1.2, speed));
      if (speed !== originalSpeed) {
        console.log(`[ElevenLabs Stream] ⚙️ Speed clamped from ${originalSpeed} to ${speed} (ElevenLabs valid range: 0.7-1.2)`);
      }
    }
  }

  console.log(`[ElevenLabs Stream] 🎤 Streaming speech | Age Group: "${ageGroup}" | Voice: ${voiceName} | Voice ID: ${voiceId} | Stability: ${voiceSettings.stability} | Speed: ${speed} | Text: "${text.substring(0, 50)}..."`);

  const apiStart = Date.now();

  const audioStream = await elevenlabsClient.textToSpeech.convert(voiceId, {
    text: text,
    model_id: "eleven_flash_v2_5",
    output_format: "pcm_16000",
    voice_settings: {
      stability: voiceSettings.stability,
      similarity_boost: voiceSettings.similarity_boost,
      style: 0.0,
      use_speaker_boost: true,
      speed: speed,
    },
  });

  let firstChunkLogged = false;
  let totalChunks = 0;
  let totalBytes = 0;

  for await (const chunk of audioStream) {
    if (!firstChunkLogged) {
      console.log(`[ElevenLabs Stream] ⏱️ First chunk in ${Date.now() - apiStart}ms`);
      firstChunkLogged = true;
    }
    totalChunks++;
    totalBytes += chunk.length;
    yield chunk;
  }

  console.log(`[ElevenLabs Stream] ⏱️ Done | ${totalChunks} chunks | ${totalBytes} bytes | ${Date.now() - apiStart}ms total`);
}

/**
 * Pre-warm the ElevenLabs connection for a given ageGroup.
 * Called at session start BEFORE the greeting fires so the first real TTS
 * request hits a warm HTTP/2 connection (~200ms) instead of a cold one (~1400ms).
 * The result is discarded — this is purely a connection warm-up.
 */
export async function prewarmTTS(ageGroup: string): Promise<void> {
  const start = Date.now();
  try {
    const client = getElevenLabsClient();
    const voiceId = VOICE_MAP[ageGroup] || VOICE_MAP['default'];
    // Minimal text — just enough to open the connection and get a response
    const warmStream = await client.textToSpeech.convert(voiceId, {
      text: 'Hi.',
      model_id: 'eleven_flash_v2_5',
      output_format: 'pcm_16000',
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: false, speed: 1.0 },
    });
    // Drain the stream (required to complete the request)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _chunk of warmStream) { /* discard */ }
    console.log(`[TTS Prewarm] ✅ ElevenLabs connection warmed in ${Date.now() - start}ms (ageGroup=${ageGroup})`);
  } catch (err) {
    // Non-fatal — greeting will still work, just slower on first sentence
    console.warn(`[TTS Prewarm] ⚠️ Prewarm failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
  }
}