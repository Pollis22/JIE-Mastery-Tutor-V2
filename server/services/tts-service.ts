/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 * 
 * This source code is confidential and proprietary.
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */


import { ElevenLabsClient } from "elevenlabs";
import { WebSocket } from "ws";

// Lazy initialization for ElevenLabs client
let elevenlabs: ElevenLabsClient | null = null;

// Abort controller for cancelling in-flight TTS requests
const activeTTSRequests = new Map<string, AbortController>();

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
const VOICE_SETTINGS_MAP: Record<string, { stability: number; similarity_boost: number }> = {
  '21m00Tcm4TlvDq8ikWAM': { stability: 0.5, similarity_boost: 0.75 },   // Rachel - warm and consistent
  'EXAVITQu4vr4xnSDxMaL': { stability: 0.5, similarity_boost: 0.75 },   // Sarah - enthusiastic
  'ErXwobaYiN019PkySvjV': { stability: 0.195, similarity_boost: 0.75 }, // Antoni - natural expressiveness
  'VR6AewLTigWG4xSOukaG': { stability: 0.15, similarity_boost: 0.75 },  // Arnold - dynamic and engaging
  'pqHfZKP75CvOlQylNhV4': { stability: 0.5, similarity_boost: 0.75 },   // Bill - professional and consistent
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
    // DEFAULT CHANGED TO 0.85 (Nov 4, 2025) - slower for better comprehension
    // NOTE: ElevenLabs API only accepts speed range 0.7-1.2
    let speed = 0.85;  // REDUCED from 0.95 to 0.85 for more natural, slower pace
    if (userSpeechSpeed !== undefined && userSpeechSpeed !== null) {
      speed = typeof userSpeechSpeed === 'string' ? parseFloat(userSpeechSpeed) : userSpeechSpeed;
      
      // Guard against NaN and invalid values - revert to default if parsing failed
      if (!Number.isFinite(speed)) {
        console.warn(`[ElevenLabs] ⚠️ Invalid speechSpeed value: "${userSpeechSpeed}" (parsed as ${speed}), using default 0.85`);
        speed = 0.85;
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
    
    const audioStream = await elevenlabsClient.textToSpeech.convert(voiceId, {
      text: text,
      model_id: "eleven_turbo_v2_5",
      output_format: "pcm_16000",
      voice_settings: {
        stability: voiceSettings.stability,
        similarity_boost: voiceSettings.similarity_boost,
        style: 0.0,
        use_speaker_boost: true,
        speed: speed,  // Use user's preference from settings, or default to 0.95
      },
    });

    const chunks: Buffer[] = [];
    for await (const chunk of audioStream) {
      chunks.push(chunk);
    }

    const audioBuffer = Buffer.concat(chunks);
    console.log(`[ElevenLabs] ✅ Generated ${audioBuffer.length} bytes of audio`);

    return audioBuffer;

  } catch (error) {
    console.error("[ElevenLabs] ❌ Error:", error);
    throw error;
  }
}

/**
 * Generate speech with streaming - sends audio chunks as they arrive
 * This significantly reduces time-to-first-audio for better responsiveness
 *
 * @param text - Text to convert to speech
 * @param ageGroup - Age group for voice selection
 * @param userSpeechSpeed - Speech speed preference (0.7-1.2)
 * @param sessionId - Session ID for tracking/cancellation
 * @param onChunk - Callback for each audio chunk (receives base64-encoded PCM data)
 * @param onComplete - Callback when streaming is complete (receives total bytes)
 * @param onError - Callback for errors
 * @returns Promise that resolves when streaming is complete
 */
export async function generateSpeechStreaming(
  text: string,
  ageGroup: string = 'default',
  userSpeechSpeed: number | string | undefined,
  sessionId: string,
  onChunk: (base64Audio: string, chunkIndex: number) => void,
  onComplete: (totalBytes: number, totalChunks: number) => void,
  onError: (error: Error) => void
): Promise<void> {

  // Create abort controller for this request
  const abortController = new AbortController();
  activeTTSRequests.set(sessionId, abortController);

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

    // Parse user's speech speed preference
    let speed = 0.85;
    if (userSpeechSpeed !== undefined && userSpeechSpeed !== null) {
      speed = typeof userSpeechSpeed === 'string' ? parseFloat(userSpeechSpeed) : userSpeechSpeed;

      if (!Number.isFinite(speed)) {
        console.warn(`[ElevenLabs Streaming] ⚠️ Invalid speechSpeed value: "${userSpeechSpeed}", using default 0.85`);
        speed = 0.85;
      } else {
        speed = Math.max(0.7, Math.min(1.2, speed));
      }
    }

    console.log(`[ElevenLabs Streaming] 🎤 Starting stream | Age Group: "${ageGroup}" | Voice: ${voiceName} | Speed: ${speed} | Text: "${text.substring(0, 50)}..."`);

    const audioStream = await elevenlabsClient.textToSpeech.convert(voiceId, {
      text: text,
      model_id: "eleven_turbo_v2_5",
      output_format: "pcm_16000",
      voice_settings: {
        stability: voiceSettings.stability,
        similarity_boost: voiceSettings.similarity_boost,
        style: 0.0,
        use_speaker_boost: true,
        speed: speed,
      },
    });

    let totalBytes = 0;
    let chunkIndex = 0;
    const startTime = Date.now();
    let firstChunkTime: number | null = null;

    for await (const chunk of audioStream) {
      // Check if request was cancelled
      if (abortController.signal.aborted) {
        console.log(`[ElevenLabs Streaming] 🛑 Stream cancelled for session ${sessionId}`);
        break;
      }

      // Track time to first chunk
      if (firstChunkTime === null) {
        firstChunkTime = Date.now() - startTime;
        console.log(`[ElevenLabs Streaming] ⚡ First chunk received in ${firstChunkTime}ms`);
      }

      totalBytes += chunk.length;

      // Send chunk immediately via callback
      const base64Chunk = chunk.toString('base64');
      onChunk(base64Chunk, chunkIndex);

      chunkIndex++;
    }

    // Cleanup
    activeTTSRequests.delete(sessionId);

    if (!abortController.signal.aborted) {
      const totalTime = Date.now() - startTime;
      console.log(`[ElevenLabs Streaming] ✅ Complete | ${totalBytes} bytes | ${chunkIndex} chunks | ${totalTime}ms total | First chunk: ${firstChunkTime}ms`);
      onComplete(totalBytes, chunkIndex);
    }

  } catch (error) {
    activeTTSRequests.delete(sessionId);
    console.error("[ElevenLabs Streaming] ❌ Error:", error);
    onError(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Cancel an in-flight TTS streaming request
 * Call this when the user interrupts (barge-in)
 */
export function cancelTTSStream(sessionId: string): boolean {
  const controller = activeTTSRequests.get(sessionId);
  if (controller) {
    console.log(`[ElevenLabs] 🛑 Cancelling TTS stream for session ${sessionId}`);
    controller.abort();
    activeTTSRequests.delete(sessionId);
    return true;
  }
  return false;
}
