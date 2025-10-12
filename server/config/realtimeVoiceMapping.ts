// Voice mapping for OpenAI Realtime API based on language and age group
// OpenAI Realtime supports these voices: alloy, ash, ballad, coral, echo, sage, shimmer, verse, marin, cedar

import type { SupportedLanguage, AgeGroup } from './multiLanguageVoices';

export interface RealtimeVoiceConfig {
  openaiVoice: 'alloy' | 'ash' | 'ballad' | 'coral' | 'echo' | 'sage' | 'shimmer' | 'verse' | 'marin' | 'cedar';
  description: string;
}

/**
 * Maps language and age group to appropriate OpenAI Realtime voice
 * 
 * Voice characteristics:
 * - alloy: Neutral, balanced (good for general use)
 * - echo: Clear, professional (good for older students)
 * - shimmer: Soft, gentle (good for younger students and calm learning)
 * - ballad: Warm, friendly (good for elementary students)
 * - coral: Bright, engaging (good for interactive learning)
 * - sage: Wise, thoughtful (good for complex topics)
 * - ash: Smooth, conversational
 * - verse: Expressive, dynamic
 * - marin: Calm, steady
 * - cedar: Deep, authoritative
 */
export const realtimeVoiceMapping: Record<SupportedLanguage, Record<AgeGroup, RealtimeVoiceConfig>> = {
  en: {
    'K-2': {
      openaiVoice: 'shimmer',
      description: 'Soft, gentle voice for early learners'
    },
    '3-5': {
      openaiVoice: 'ballad',
      description: 'Warm, engaging voice for elementary students'
    },
    '6-8': {
      openaiVoice: 'alloy',
      description: 'Clear, balanced voice for middle school'
    },
    '9-12': {
      openaiVoice: 'echo',
      description: 'Professional, clear voice for high school'
    },
    'College/Adult': {
      openaiVoice: 'echo',
      description: 'Professional voice for advanced learners'
    }
  },
  es: {
    'K-2': {
      openaiVoice: 'shimmer',
      description: 'Voz suave para niños pequeños'
    },
    '3-5': {
      openaiVoice: 'ballad',
      description: 'Voz cálida para primaria'
    },
    '6-8': {
      openaiVoice: 'alloy',
      description: 'Voz clara para secundaria'
    },
    '9-12': {
      openaiVoice: 'echo',
      description: 'Voz profesional para preparatoria'
    },
    'College/Adult': {
      openaiVoice: 'echo',
      description: 'Voz profesional para adultos'
    }
  },
  hi: {
    'K-2': {
      openaiVoice: 'shimmer',
      description: 'छोटे बच्चों के लिए कोमल आवाज़'
    },
    '3-5': {
      openaiVoice: 'ballad',
      description: 'प्राथमिक छात्रों के लिए गर्म आवाज़'
    },
    '6-8': {
      openaiVoice: 'alloy',
      description: 'माध्यमिक के लिए स्पष्ट आवाज़'
    },
    '9-12': {
      openaiVoice: 'echo',
      description: 'हाई स्कूल के लिए पेशेवर आवाज़'
    },
    'College/Adult': {
      openaiVoice: 'echo',
      description: 'वयस्कों के लिए पेशेवर आवाज़'
    }
  },
  zh: {
    'K-2': {
      openaiVoice: 'shimmer',
      description: '适合幼儿的柔和声音'
    },
    '3-5': {
      openaiVoice: 'ballad',
      description: '适合小学生的温暖声音'
    },
    '6-8': {
      openaiVoice: 'alloy',
      description: '适合初中生的清晰声音'
    },
    '9-12': {
      openaiVoice: 'echo',
      description: '适合高中生的专业声音'
    },
    'College/Adult': {
      openaiVoice: 'echo',
      description: '适合成人的专业声音'
    }
  }
};

export function getRealtimeVoice(language: SupportedLanguage, ageGroup: AgeGroup): RealtimeVoiceConfig {
  return realtimeVoiceMapping[language][ageGroup];
}
