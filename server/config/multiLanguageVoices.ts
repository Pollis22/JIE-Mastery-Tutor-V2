// Multi-language voice configuration for Azure Neural TTS
// Supports English, Spanish, Hindi, and Chinese with age-appropriate voices

export type SupportedLanguage = 'en' | 'es' | 'hi' | 'zh';
export type AgeGroup = 'K-2' | '3-5' | '6-8' | '9-12' | 'College/Adult';

export interface VoiceConfig {
  voiceName: string;
  language: string;
  locale: string;
  displayName: string;
  description: string;
}

// Age-appropriate voices for each language
export const multiLanguageVoices: Record<SupportedLanguage, Record<AgeGroup, VoiceConfig>> = {
  // English voices (US)
  en: {
    'K-2': {
      voiceName: 'en-US-JennyNeural',
      language: 'English',
      locale: 'en-US',
      displayName: 'Jenny (Young Learners)',
      description: 'Warm, friendly voice perfect for early learners'
    },
    '3-5': {
      voiceName: 'en-US-AriaNeural',
      language: 'English',
      locale: 'en-US',
      displayName: 'Aria (Elementary)',
      description: 'Clear, engaging voice for elementary students'
    },
    '6-8': {
      voiceName: 'en-US-SaraNeural',
      language: 'English',
      locale: 'en-US',
      displayName: 'Sara (Middle School)',
      description: 'Confident, educational voice for middle schoolers'
    },
    '9-12': {
      voiceName: 'en-US-MichelleNeural',
      language: 'English',
      locale: 'en-US',
      displayName: 'Michelle (High School)',
      description: 'Professional, mature voice for high school students'
    },
    'College/Adult': {
      voiceName: 'en-US-EmmaNeural',
      language: 'English',
      locale: 'en-US',
      displayName: 'Emma (College/Adult)',
      description: 'Sophisticated, academic voice for advanced learners'
    }
  },

  // Spanish voices (Mexico/Latin America)
  es: {
    'K-2': {
      voiceName: 'es-MX-DaliaNeural',
      language: 'Spanish',
      locale: 'es-MX',
      displayName: 'Dalia (Niños Pequeños)',
      description: 'Voz cálida y amigable para primeros años'
    },
    '3-5': {
      voiceName: 'es-MX-NuriaNeural',
      language: 'Spanish',
      locale: 'es-MX',
      displayName: 'Nuria (Primaria)',
      description: 'Voz clara y atractiva para estudiantes de primaria'
    },
    '6-8': {
      voiceName: 'es-MX-RenataNeural',
      language: 'Spanish',
      locale: 'es-MX',
      displayName: 'Renata (Secundaria)',
      description: 'Voz educativa para estudiantes de secundaria'
    },
    '9-12': {
      voiceName: 'es-MX-BeatrizNeural',
      language: 'Spanish',
      locale: 'es-MX',
      displayName: 'Beatriz (Preparatoria)',
      description: 'Voz profesional para preparatoria'
    },
    'College/Adult': {
      voiceName: 'es-MX-LarissaNeural',
      language: 'Spanish',
      locale: 'es-MX',
      displayName: 'Larissa (Universidad/Adultos)',
      description: 'Voz sofisticada para aprendizaje avanzado'
    }
  },

  // Hindi voices (India)
  hi: {
    'K-2': {
      voiceName: 'hi-IN-SwaraNeural',
      language: 'Hindi',
      locale: 'hi-IN',
      displayName: 'Swara (छोटे बच्चे)',
      description: 'गर्मजोशी भरी आवाज़ शुरुआती सीखने वालों के लिए'
    },
    '3-5': {
      voiceName: 'hi-IN-SwaraNeural',
      language: 'Hindi',
      locale: 'hi-IN',
      displayName: 'Swara (प्राथमिक)',
      description: 'स्पष्ट आवाज़ प्राथमिक छात्रों के लिए'
    },
    '6-8': {
      voiceName: 'hi-IN-SwaraNeural',
      language: 'Hindi',
      locale: 'hi-IN',
      displayName: 'Swara (माध्यमिक)',
      description: 'शैक्षिक आवाज़ मिडिल स्कूल के लिए'
    },
    '9-12': {
      voiceName: 'hi-IN-SwaraNeural',
      language: 'Hindi',
      locale: 'hi-IN',
      displayName: 'Swara (हाई स्कूल)',
      description: 'व्यावसायिक आवाज़ हाई स्कूल के लिए'
    },
    'College/Adult': {
      voiceName: 'hi-IN-SwaraNeural',
      language: 'Hindi',
      locale: 'hi-IN',
      displayName: 'Swara (कॉलेज/वयस्क)',
      description: 'परिष्कृत आवाज़ उन्नत शिक्षा के लिए'
    }
  },

  // Chinese voices (Mandarin, Simplified)
  zh: {
    'K-2': {
      voiceName: 'zh-CN-XiaoxiaoNeural',
      language: 'Chinese',
      locale: 'zh-CN',
      displayName: 'Xiaoxiao (幼儿)',
      description: '温暖友好的声音，适合幼儿学习'
    },
    '3-5': {
      voiceName: 'zh-CN-XiaohanNeural',
      language: 'Chinese',
      locale: 'zh-CN',
      displayName: 'Xiaohan (小学)',
      description: '清晰的声音，适合小学生'
    },
    '6-8': {
      voiceName: 'zh-CN-XiaoyiNeural',
      language: 'Chinese',
      locale: 'zh-CN',
      displayName: 'Xiaoyi (初中)',
      description: '教育性声音，适合初中生'
    },
    '9-12': {
      voiceName: 'zh-CN-XiaoshuangNeural',
      language: 'Chinese',
      locale: 'zh-CN',
      displayName: 'Xiaoshuang (高中)',
      description: '专业声音，适合高中生'
    },
    'College/Adult': {
      voiceName: 'zh-CN-XiaochenNeural',
      language: 'Chinese',
      locale: 'zh-CN',
      displayName: 'Xiaochen (大学/成人)',
      description: '成熟声音，适合高等教育'
    }
  }
};

// Helper function to get voice config
export function getVoiceConfig(language: SupportedLanguage, ageGroup: AgeGroup): VoiceConfig {
  return multiLanguageVoices[language][ageGroup];
}

// Helper to get locale from language code
export function getLocaleFromLanguage(language: SupportedLanguage): string {
  const localeMap: Record<SupportedLanguage, string> = {
    en: 'en-US',
    es: 'es-MX',
    hi: 'hi-IN',
    zh: 'zh-CN'
  };
  return localeMap[language];
}

// Validate language and age group
export function isValidLanguage(lang: string): lang is SupportedLanguage {
  return ['en', 'es', 'hi', 'zh'].includes(lang);
}

export function isValidAgeGroup(age: string): age is AgeGroup {
  return ['K-2', '3-5', '6-8', '9-12', 'College/Adult'].includes(age);
}
