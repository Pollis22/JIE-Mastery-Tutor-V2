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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TTS TEXT SANITIZER — Convert symbols/math to spoken English
// ElevenLabs garbles mathematical notation, superscripts,
// and special characters. This converts them to natural speech.
// Apr 9, 2026: Added after "3²" was read as "32" in Pythagorean session
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function sanitizeForTTS(text: string): string {
  let result = text;

  // ── Superscript numbers (must come before general number patterns) ──
  // "3²" → "3 squared", "x³" → "x cubed", "n⁴" → "n to the 4th"
  result = result.replace(/([a-zA-Z0-9])²/g, '$1 squared');
  result = result.replace(/([a-zA-Z0-9])³/g, '$1 cubed');
  result = result.replace(/([a-zA-Z0-9])⁴/g, '$1 to the 4th');
  result = result.replace(/([a-zA-Z0-9])⁵/g, '$1 to the 5th');
  result = result.replace(/([a-zA-Z0-9])⁶/g, '$1 to the 6th');
  result = result.replace(/([a-zA-Z0-9])⁷/g, '$1 to the 7th');
  result = result.replace(/([a-zA-Z0-9])⁸/g, '$1 to the 8th');
  result = result.replace(/([a-zA-Z0-9])⁹/g, '$1 to the 9th');
  result = result.replace(/([a-zA-Z0-9])ⁿ/g, '$1 to the nth');
  // Standalone superscripts without preceding character
  result = result.replace(/²/g, ' squared');
  result = result.replace(/³/g, ' cubed');

  // ── Subscript numbers ──
  result = result.replace(/₀/g, ' sub 0');
  result = result.replace(/₁/g, ' sub 1');
  result = result.replace(/₂/g, ' sub 2');
  result = result.replace(/₃/g, ' sub 3');
  result = result.replace(/₄/g, ' sub 4');

  // ── Unicode fraction characters ──
  result = result.replace(/½/g, 'one half');
  result = result.replace(/⅓/g, 'one third');
  result = result.replace(/⅔/g, 'two thirds');
  result = result.replace(/¼/g, 'one quarter');
  result = result.replace(/¾/g, 'three quarters');
  result = result.replace(/⅕/g, 'one fifth');
  result = result.replace(/⅛/g, 'one eighth');

  // ── Slash fractions: "1/4" → "1 over 4", but not in dates or URLs ──
  result = result.replace(/\b(\d+)\s*\/\s*(\d+)\b/g, '$1 over $2');

  // ── Math operators (with spacing for natural speech) ──
  result = result.replace(/\s*×\s*/g, ' times ');
  result = result.replace(/\s*÷\s*/g, ' divided by ');
  result = result.replace(/\s*±\s*/g, ' plus or minus ');
  result = result.replace(/\s*≈\s*/g, ' approximately equals ');
  result = result.replace(/\s*≠\s*/g, ' is not equal to ');
  result = result.replace(/\s*≥\s*/g, ' is greater than or equal to ');
  result = result.replace(/\s*≤\s*/g, ' is less than or equal to ');
  // + and = only when between math terms (letters/numbers)
  result = result.replace(/([a-zA-Z0-9])\s*\+\s*([a-zA-Z0-9])/g, '$1 plus $2');
  result = result.replace(/([a-zA-Z0-9])\s*=\s*([a-zA-Z0-9])/g, '$1 equals $2');
  result = result.replace(/\s=\s/g, ' equals ');

  // ── Comparison operators ──
  result = result.replace(/\s*>\s*/g, ' is greater than ');
  result = result.replace(/\s*<\s*/g, ' is less than ');

  // ── Special math symbols ──
  result = result.replace(/√(\d+)/g, 'the square root of $1');
  result = result.replace(/√([a-zA-Z])/g, 'the square root of $1');
  result = result.replace(/√/g, 'square root');
  result = result.replace(/π/g, 'pi');
  result = result.replace(/∞/g, 'infinity');
  result = result.replace(/Δ/g, 'delta');
  result = result.replace(/θ/g, 'theta');
  result = result.replace(/α/g, 'alpha');
  result = result.replace(/β/g, 'beta');
  result = result.replace(/γ/g, 'gamma');
  result = result.replace(/σ/g, 'sigma');
  result = result.replace(/μ/g, 'mu');
  result = result.replace(/λ/g, 'lambda');
  result = result.replace(/Σ/g, 'sigma');
  result = result.replace(/∫/g, 'the integral of');

  // ── Units and symbols ──
  result = result.replace(/(\d+)\s*°\s*([CF])\b/g, '$1 degrees $2');
  result = result.replace(/(\d+)\s*°/g, '$1 degrees');
  result = result.replace(/(\d+)\s*%/g, '$1 percent');
  result = result.replace(/\$(\d[\d,.]*)/g, '$1 dollars');
  result = result.replace(/(\d[\d,.]*)\s*km\/h/gi, '$1 kilometers per hour');
  result = result.replace(/(\d[\d,.]*)\s*mph/gi, '$1 miles per hour');
  result = result.replace(/(\d[\d,.]*)\s*m\/s/gi, '$1 meters per second');
  result = result.replace(/(\d[\d,.]*)\s*cm\b/gi, '$1 centimeters');
  result = result.replace(/(\d[\d,.]*)\s*mm\b/gi, '$1 millimeters');
  result = result.replace(/(\d[\d,.]*)\s*kg\b/gi, '$1 kilograms');
  result = result.replace(/(\d[\d,.]*)\s*lbs?\b/gi, '$1 pounds');
  result = result.replace(/(\d[\d,.]*)\s*oz\b/gi, '$1 ounces');
  result = result.replace(/(\d[\d,.]*)\s*ml\b/gi, '$1 milliliters');

  // ── Negative/minus sign (em dash, en dash, minus) ──
  result = result.replace(/[−–—]\s*(\d)/g, 'negative $1');

  // ── Ampersand ──
  result = result.replace(/\s*&\s*/g, ' and ');

  // ── Arrows ──
  result = result.replace(/→/g, ' leads to ');
  result = result.replace(/←/g, ' comes from ');
  result = result.replace(/↔/g, ' goes both ways ');
  result = result.replace(/->/g, ' leads to ');

  // ── Exponent notation: 10^6 → "10 to the 6th" ──
  result = result.replace(/(\d+)\s*\^\s*(\d+)/g, (_, base, exp) => {
    if (exp === '2') return `${base} squared`;
    if (exp === '3') return `${base} cubed`;
    return `${base} to the ${exp}th`;
  });
  result = result.replace(/([a-zA-Z])\s*\^\s*(\d+)/g, (_, base, exp) => {
    if (exp === '2') return `${base} squared`;
    if (exp === '3') return `${base} cubed`;
    return `${base} to the ${exp}th`;
  });

  // ── Clean up extra spaces ──
  result = result.replace(/\s{2,}/g, ' ').trim();

  return result;
}

export async function generateSpeech(
  text: string,
  ageGroup: string = 'default',
  userSpeechSpeed?: number | string
): Promise<Buffer> {
  
  try {
    // Sanitize text for TTS — convert math symbols, superscripts, etc. to spoken English
    const originalText = text;
    text = sanitizeForTTS(text);
    if (text !== originalText) {
      console.log(`[TTS Sanitizer] 🧹 "${originalText.substring(0, 60)}" → "${text.substring(0, 60)}"`);
    }
    
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

  // Sanitize text for TTS — convert math symbols, superscripts, etc. to spoken English
  const originalText = text;
  text = sanitizeForTTS(text);
  if (text !== originalText) {
    console.log(`[TTS Sanitizer Stream] 🧹 "${originalText.substring(0, 60)}" → "${text.substring(0, 60)}"`);
  }

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