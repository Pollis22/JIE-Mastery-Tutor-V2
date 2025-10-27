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

// Voice mapping for different age groups
const VOICE_MAP: Record<string, string> = {
  'k-2': '21m00Tcm4TlvDq8ikWAM',      // Rachel - friendly, warm
  '3-5': 'EXAVITQu4vr4xnSDxMaL',      // Sarah - enthusiastic
  '6-8': 'ErXwobaYiN019PkySvjV',      // Antoni - clear, professional
  '9-12': 'VR6AewLTigWG4xSOukaG',     // Arnold - authoritative
  'college': 'pNInz6obpgDQGcFmaJgB',  // Adam - professional
  'default': '21m00Tcm4TlvDq8ikWAM'   // Rachel
};

export async function generateSpeech(
  text: string,
  ageGroup: string = 'default'
): Promise<Buffer> {
  
  try {
    const elevenlabsClient = getElevenLabsClient();
    const voiceId = VOICE_MAP[ageGroup] || VOICE_MAP['default'];
    console.log(`[ElevenLabs] 🎤 Generating speech (${ageGroup}): "${text.substring(0, 50)}..."`);
    
    const audioStream = await elevenlabsClient.textToSpeech.convert(voiceId, {
      text: text,
      model_id: "eleven_turbo_v2_5",
      output_format: "pcm_16000",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
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
