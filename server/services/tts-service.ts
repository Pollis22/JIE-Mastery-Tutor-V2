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
const VOICE_SETTINGS_MAP: Record<string, { stability: number; similarity_boost: number }> = {
  '21m00Tcm4TlvDq8ikWAM': { stability: 0.5, similarity_boost: 0.75 },   // Rachel - warm and consistent
  'EXAVITQu4vr4xnSDxMaL': { stability: 0.5, similarity_boost: 0.75 },   // Sarah - enthusiastic
  'ErXwobaYiN019PkySvjV': { stability: 0.195, similarity_boost: 0.75 }, // Antoni - natural expressiveness
  'VR6AewLTigWG4xSOukaG': { stability: 0.15, similarity_boost: 0.75 },  // Arnold - dynamic and engaging
  'pqHfZKP75CvOlQylNhV4': { stability: 0.5, similarity_boost: 0.75 },   // Bill - professional and consistent
};

export async function generateSpeech(
  text: string,
  ageGroup: string = 'default'
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
    
    console.log(`[ElevenLabs] 🎤 Generating speech | Age Group: "${ageGroup}" | Voice: ${voiceName} | Voice ID: ${voiceId} | Stability: ${voiceSettings.stability} | Text: "${text.substring(0, 50)}..."`);
    
    const audioStream = await elevenlabsClient.textToSpeech.convert(voiceId, {
      text: text,
      model_id: "eleven_turbo_v2_5",
      output_format: "pcm_16000",
      voice_settings: {
        stability: voiceSettings.stability,
        similarity_boost: voiceSettings.similarity_boost,
        style: 0.0,
        use_speaker_boost: true,
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // CRITICAL: Slow down speech for better comprehension
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        speed: 0.85,              // Was 1.0 → Now 0.85 (15% slower)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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
