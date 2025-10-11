// Voice mapping for OpenAI Realtime API based on language and age group
// OpenAI Realtime supports these voices: alloy, echo, fable, onyx, nova, shimmer

import type { SupportedLanguage, AgeGroup } from './multiLanguageVoices';

export interface RealtimeVoiceConfig {
  openaiVoice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  description: string;
}

/**
 * Maps language and age group to appropriate OpenAI Realtime voice
 * 
 * Voice characteristics:
 * - alloy: Neutral, balanced (good for general use)
 * - echo: Clear, professional (good for older students)
 * - fable: Warm, friendly (good for younger students)  
 * - nova: Energetic, upbeat (good for engagement)
 * - shimmer: Soft, gentle (good for calm learning)
 * - onyx: Deep, authoritative (good for advanced topics)
 */
export const realtimeVoiceMapping: Record<SupportedLanguage, Record<AgeGroup, RealtimeVoiceConfig>> = {
  en: {
    'K-2': {
      openaiVoice: 'nova',
      description: 'Energetic, friendly voice for early learners'
    },
    '3-5': {
      openaiVoice: 'fable',
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
      openaiVoice: 'nova',
      description: 'Voz enérgica para niños pequeños'
    },
    '3-5': {
      openaiVoice: 'fable',
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
      openaiVoice: 'nova',
      description: 'छोटे बच्चों के लिए ऊर्जावान आवाज़'
    },
    '3-5': {
      openaiVoice: 'fable',
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
      openaiVoice: 'nova',
      description: '适合幼儿的活力声音'
    },
    '3-5': {
      openaiVoice: 'fable',
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
