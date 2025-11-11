// Multi-language voice configuration for Azure Neural TTS
// Supports 22 languages with age-appropriate voices for global reach

export type SupportedLanguage = 'en' | 'es' | 'hi' | 'zh' | 'fr' | 'de' | 'pt' | 'ja' | 'sw' | 'af' | 'ha' | 'am' | 'ar' | 'ru' | 'it' | 'ko' | 'vi' | 'tr' | 'pl' | 'nl' | 'th' | 'id';
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
  },

  // French voices (France)
  fr: {
    'K-2': {
      voiceName: 'fr-FR-DeniseNeural',
      language: 'French',
      locale: 'fr-FR',
      displayName: 'Denise (Petits)',
      description: 'Voix chaleureuse pour jeunes apprenants'
    },
    '3-5': {
      voiceName: 'fr-FR-EloiseNeural',
      language: 'French',
      locale: 'fr-FR',
      displayName: 'Eloise (Élémentaire)',
      description: 'Voix claire pour élèves du primaire'
    },
    '6-8': {
      voiceName: 'fr-FR-CelesteNeural',
      language: 'French',
      locale: 'fr-FR',
      displayName: 'Celeste (Collège)',
      description: 'Voix éducative pour collégiens'
    },
    '9-12': {
      voiceName: 'fr-FR-JosephineNeural',
      language: 'French',
      locale: 'fr-FR',
      displayName: 'Josephine (Lycée)',
      description: 'Voix professionnelle pour lycéens'
    },
    'College/Adult': {
      voiceName: 'fr-FR-BrigitteNeural',
      language: 'French',
      locale: 'fr-FR',
      displayName: 'Brigitte (Université/Adultes)',
      description: 'Voix sophistiquée pour apprentissage avancé'
    }
  },

  // German voices (Germany)
  de: {
    'K-2': {
      voiceName: 'de-DE-KatjaNeural',
      language: 'German',
      locale: 'de-DE',
      displayName: 'Katja (Kleine Kinder)',
      description: 'Warme Stimme für junge Lernende'
    },
    '3-5': {
      voiceName: 'de-DE-GiselaNeural',
      language: 'German',
      locale: 'de-DE',
      displayName: 'Gisela (Grundschule)',
      description: 'Klare Stimme für Grundschüler'
    },
    '6-8': {
      voiceName: 'de-DE-TanjaNeural',
      language: 'German',
      locale: 'de-DE',
      displayName: 'Tanja (Mittelschule)',
      description: 'Bildungsstimme für Mittelschüler'
    },
    '9-12': {
      voiceName: 'de-DE-AmalaNeural',
      language: 'German',
      locale: 'de-DE',
      displayName: 'Amala (Gymnasium)',
      description: 'Professionelle Stimme für Gymnasiasten'
    },
    'College/Adult': {
      voiceName: 'de-DE-LouisaNeural',
      language: 'German',
      locale: 'de-DE',
      displayName: 'Louisa (Universität/Erwachsene)',
      description: 'Anspruchsvolle Stimme für Fortgeschrittene'
    }
  },

  // Portuguese voices (Brazil)
  pt: {
    'K-2': {
      voiceName: 'pt-BR-FranciscaNeural',
      language: 'Portuguese',
      locale: 'pt-BR',
      displayName: 'Francisca (Crianças Pequenas)',
      description: 'Voz calorosa para iniciantes'
    },
    '3-5': {
      voiceName: 'pt-BR-LeilaNeural',
      language: 'Portuguese',
      locale: 'pt-BR',
      displayName: 'Leila (Primário)',
      description: 'Voz clara para alunos do primário'
    },
    '6-8': {
      voiceName: 'pt-BR-ThalitaNeural',
      language: 'Portuguese',
      locale: 'pt-BR',
      displayName: 'Thalita (Fundamental)',
      description: 'Voz educativa para estudantes do fundamental'
    },
    '9-12': {
      voiceName: 'pt-BR-BrendaNeural',
      language: 'Portuguese',
      locale: 'pt-BR',
      displayName: 'Brenda (Ensino Médio)',
      description: 'Voz profissional para ensino médio'
    },
    'College/Adult': {
      voiceName: 'pt-BR-ManuelaNeural',
      language: 'Portuguese',
      locale: 'pt-BR',
      displayName: 'Manuela (Universidade/Adultos)',
      description: 'Voz sofisticada para aprendizado avançado'
    }
  },

  // Japanese voices (Japan)
  ja: {
    'K-2': {
      voiceName: 'ja-JP-AoiNeural',
      language: 'Japanese',
      locale: 'ja-JP',
      displayName: 'Aoi (幼児)',
      description: '若い学習者に最適な温かい声'
    },
    '3-5': {
      voiceName: 'ja-JP-MayuNeural',
      language: 'Japanese',
      locale: 'ja-JP',
      displayName: 'Mayu (小学生)',
      description: '小学生に適したクリアな声'
    },
    '6-8': {
      voiceName: 'ja-JP-ShioriNeural',
      language: 'Japanese',
      locale: 'ja-JP',
      displayName: 'Shiori (中学生)',
      description: '中学生向けの教育的な声'
    },
    '9-12': {
      voiceName: 'ja-JP-NanamiNeural',
      language: 'Japanese',
      locale: 'ja-JP',
      displayName: 'Nanami (高校生)',
      description: '高校生向けのプロフェッショナルな声'
    },
    'College/Adult': {
      voiceName: 'ja-JP-NanamiNeural',
      language: 'Japanese',
      locale: 'ja-JP',
      displayName: 'Nanami (大学/成人)',
      description: '上級学習者向けの洗練された声'
    }
  },

  // Swahili voices (Kenya/Tanzania) - Major African language
  sw: {
    'K-2': {
      voiceName: 'sw-KE-ZuriNeural',
      language: 'Swahili',
      locale: 'sw-KE',
      displayName: 'Zuri (Watoto Wadogo)',
      description: 'Sauti ya kupendeza kwa wanafunzi wachanga'
    },
    '3-5': {
      voiceName: 'sw-KE-ZuriNeural',
      language: 'Swahili',
      locale: 'sw-KE',
      displayName: 'Zuri (Shule ya Msingi)',
      description: 'Sauti wazi kwa wanafunzi wa msingi'
    },
    '6-8': {
      voiceName: 'sw-KE-RafikiNeural',
      language: 'Swahili',
      locale: 'sw-KE',
      displayName: 'Rafiki (Sekondari)',
      description: 'Sauti ya elimu kwa wanafunzi wa sekondari'
    },
    '9-12': {
      voiceName: 'sw-KE-RafikiNeural',
      language: 'Swahili',
      locale: 'sw-KE',
      displayName: 'Rafiki (Shule ya Upili)',
      description: 'Sauti ya kitaaluma kwa wanafunzi wa upili'
    },
    'College/Adult': {
      voiceName: 'sw-KE-RafikiNeural',
      language: 'Swahili',
      locale: 'sw-KE',
      displayName: 'Rafiki (Chuo/Wazima)',
      description: 'Sauti ya hali ya juu kwa elimu ya juu'
    }
  },

  // Afrikaans voices (South Africa)
  af: {
    'K-2': {
      voiceName: 'af-ZA-AdriNeural',
      language: 'Afrikaans',
      locale: 'af-ZA',
      displayName: 'Adri (Klein Kinders)',
      description: 'Warm stem vir jong leerders'
    },
    '3-5': {
      voiceName: 'af-ZA-AdriNeural',
      language: 'Afrikaans',
      locale: 'af-ZA',
      displayName: 'Adri (Laerskool)',
      description: 'Duidelike stem vir laerskoolkinders'
    },
    '6-8': {
      voiceName: 'af-ZA-WillemNeural',
      language: 'Afrikaans',
      locale: 'af-ZA',
      displayName: 'Willem (Hoërskool)',
      description: 'Opvoedkundige stem vir hoërskoolleerders'
    },
    '9-12': {
      voiceName: 'af-ZA-WillemNeural',
      language: 'Afrikaans',
      locale: 'af-ZA',
      displayName: 'Willem (Senior)',
      description: 'Professionele stem vir senior studente'
    },
    'College/Adult': {
      voiceName: 'af-ZA-WillemNeural',
      language: 'Afrikaans',
      locale: 'af-ZA',
      displayName: 'Willem (Universiteit/Volwassenes)',
      description: 'Gesofistikeerde stem vir gevorderde leer'
    }
  },

  // Hausa voices (Nigeria/West Africa) - Using Nigerian English as fallback
  ha: {
    'K-2': {
      voiceName: 'en-NG-EzinneNeural',
      language: 'Hausa',
      locale: 'en-NG', // Using en-NG locale to match voice availability
      displayName: 'Amina (Yara Kanana)',
      description: 'Murya mai daɗi don ƴan makaranta'
    },
    '3-5': {
      voiceName: 'en-NG-EzinneNeural',
      language: 'Hausa',
      locale: 'en-NG',
      displayName: 'Amina (Firamare)',
      description: 'Murya mai haske don ɗaliban firamare'
    },
    '6-8': {
      voiceName: 'en-NG-AbeoNeural',
      language: 'Hausa',
      locale: 'en-NG',
      displayName: 'Ibrahim (Sakandare)',
      description: 'Muryar ilimi don ɗaliban sakandare'
    },
    '9-12': {
      voiceName: 'en-NG-AbeoNeural',
      language: 'Hausa',
      locale: 'en-NG',
      displayName: 'Ibrahim (Babban Sakandare)',
      description: 'Murya mai ƙwarewa don manyan ɗalibai'
    },
    'College/Adult': {
      voiceName: 'en-NG-AbeoNeural',
      language: 'Hausa',
      locale: 'en-NG',
      displayName: 'Ibrahim (Jami\'a/Manya)',
      description: 'Murya mai girma don babban ilimi'
    }
  },

  // Amharic voices (Ethiopia)
  am: {
    'K-2': {
      voiceName: 'am-ET-AmehaNeural',
      language: 'Amharic',
      locale: 'am-ET',
      displayName: 'Selam (ትናንሽ ልጆች)',
      description: 'ለጀማሪ ተማሪዎች ሞቅ ያለ ድምጽ'
    },
    '3-5': {
      voiceName: 'am-ET-AmehaNeural',
      language: 'Amharic',
      locale: 'am-ET',
      displayName: 'Selam (መጀመሪያ ደረጃ)',
      description: 'ለመጀመሪያ ደረጃ ተማሪዎች ግልጽ ድምጽ'
    },
    '6-8': {
      voiceName: 'am-ET-MekdesNeural',
      language: 'Amharic',
      locale: 'am-ET',
      displayName: 'Mekdes (ሁለተኛ ደረጃ)',
      description: 'ለሁለተኛ ደረጃ ተማሪዎች የትምህርት ድምጽ'
    },
    '9-12': {
      voiceName: 'am-ET-MekdesNeural',
      language: 'Amharic',
      locale: 'am-ET',
      displayName: 'Mekdes (ከፍተኛ ደረጃ)',
      description: 'ለከፍተኛ ደረጃ ተማሪዎች ሙያዊ ድምጽ'
    },
    'College/Adult': {
      voiceName: 'am-ET-MekdesNeural',
      language: 'Amharic',
      locale: 'am-ET',
      displayName: 'Mekdes (ዩኒቨርሲቲ/ጎልማሳ)',
      description: 'ለከፍተኛ ትምህርት የተራቀቀ ድምጽ'
    }
  },

  // Arabic voices (Saudi Arabia/UAE)
  ar: {
    'K-2': {
      voiceName: 'ar-SA-ZariyahNeural',
      language: 'Arabic',
      locale: 'ar-SA',
      displayName: 'Zariyah (أطفال صغار)',
      description: 'صوت دافئ للمتعلمين الصغار'
    },
    '3-5': {
      voiceName: 'ar-SA-ZariyahNeural',
      language: 'Arabic',
      locale: 'ar-SA',
      displayName: 'Zariyah (المرحلة الابتدائية)',
      description: 'صوت واضح لطلاب المرحلة الابتدائية'
    },
    '6-8': {
      voiceName: 'ar-AE-FatimaNeural',
      language: 'Arabic',
      locale: 'ar-AE',
      displayName: 'Fatima (المرحلة المتوسطة)',
      description: 'صوت تعليمي لطلاب المرحلة المتوسطة'
    },
    '9-12': {
      voiceName: 'ar-AE-FatimaNeural',
      language: 'Arabic',
      locale: 'ar-AE',
      displayName: 'Fatima (المرحلة الثانوية)',
      description: 'صوت احترافي لطلاب المرحلة الثانوية'
    },
    'College/Adult': {
      voiceName: 'ar-SA-HamedNeural',
      language: 'Arabic',
      locale: 'ar-SA',
      displayName: 'Hamed (جامعة/بالغين)',
      description: 'صوت متطور للتعليم العالي'
    }
  },

  // Russian voices (Russia)
  ru: {
    'K-2': {
      voiceName: 'ru-RU-SvetlanaNeural',
      language: 'Russian',
      locale: 'ru-RU',
      displayName: 'Svetlana (Малыши)',
      description: 'Теплый голос для маленьких учеников'
    },
    '3-5': {
      voiceName: 'ru-RU-SvetlanaNeural',
      language: 'Russian',
      locale: 'ru-RU',
      displayName: 'Svetlana (Начальная школа)',
      description: 'Чёткий голос для младших школьников'
    },
    '6-8': {
      voiceName: 'ru-RU-DariyaNeural',
      language: 'Russian',
      locale: 'ru-RU',
      displayName: 'Dariya (Средняя школа)',
      description: 'Образовательный голос для средней школы'
    },
    '9-12': {
      voiceName: 'ru-RU-DariyaNeural',
      language: 'Russian',
      locale: 'ru-RU',
      displayName: 'Dariya (Старшая школа)',
      description: 'Профессиональный голос для старшеклассников'
    },
    'College/Adult': {
      voiceName: 'ru-RU-DmitryNeural',
      language: 'Russian',
      locale: 'ru-RU',
      displayName: 'Dmitry (Университет/Взрослые)',
      description: 'Утончённый голос для высшего образования'
    }
  },

  // Italian voices (Italy)
  it: {
    'K-2': {
      voiceName: 'it-IT-ElsaNeural',
      language: 'Italian',
      locale: 'it-IT',
      displayName: 'Elsa (Bambini Piccoli)',
      description: 'Voce calda per giovani studenti'
    },
    '3-5': {
      voiceName: 'it-IT-ElsaNeural',
      language: 'Italian',
      locale: 'it-IT',
      displayName: 'Elsa (Elementare)',
      description: 'Voce chiara per studenti elementari'
    },
    '6-8': {
      voiceName: 'it-IT-IsabellaNeural',
      language: 'Italian',
      locale: 'it-IT',
      displayName: 'Isabella (Media)',
      description: 'Voce educativa per studenti delle medie'
    },
    '9-12': {
      voiceName: 'it-IT-IsabellaNeural',
      language: 'Italian',
      locale: 'it-IT',
      displayName: 'Isabella (Superiore)',
      description: 'Voce professionale per studenti superiori'
    },
    'College/Adult': {
      voiceName: 'it-IT-DiegoNeural',
      language: 'Italian',
      locale: 'it-IT',
      displayName: 'Diego (Università/Adulti)',
      description: 'Voce sofisticata per istruzione avanzata'
    }
  },

  // Korean voices (South Korea)
  ko: {
    'K-2': {
      voiceName: 'ko-KR-SunHiNeural',
      language: 'Korean',
      locale: 'ko-KR',
      displayName: 'SunHi (유아)',
      description: '어린 학습자를 위한 따뜻한 목소리'
    },
    '3-5': {
      voiceName: 'ko-KR-SunHiNeural',
      language: 'Korean',
      locale: 'ko-KR',
      displayName: 'SunHi (초등학교)',
      description: '초등학생을 위한 명확한 목소리'
    },
    '6-8': {
      voiceName: 'ko-KR-JiMinNeural',
      language: 'Korean',
      locale: 'ko-KR',
      displayName: 'JiMin (중학교)',
      description: '중학생을 위한 교육적인 목소리'
    },
    '9-12': {
      voiceName: 'ko-KR-JiMinNeural',
      language: 'Korean',
      locale: 'ko-KR',
      displayName: 'JiMin (고등학교)',
      description: '고등학생을 위한 전문적인 목소리'
    },
    'College/Adult': {
      voiceName: 'ko-KR-InJoonNeural',
      language: 'Korean',
      locale: 'ko-KR',
      displayName: 'InJoon (대학/성인)',
      description: '고등 교육을 위한 세련된 목소리'
    }
  },

  // Vietnamese voices (Vietnam)
  vi: {
    'K-2': {
      voiceName: 'vi-VN-HoaiMyNeural',
      language: 'Vietnamese',
      locale: 'vi-VN',
      displayName: 'Hoai My (Trẻ nhỏ)',
      description: 'Giọng ấm áp cho học sinh nhỏ tuổi'
    },
    '3-5': {
      voiceName: 'vi-VN-HoaiMyNeural',
      language: 'Vietnamese',
      locale: 'vi-VN',
      displayName: 'Hoai My (Tiểu học)',
      description: 'Giọng rõ ràng cho học sinh tiểu học'
    },
    '6-8': {
      voiceName: 'vi-VN-HoaiMyNeural',
      language: 'Vietnamese',
      locale: 'vi-VN',
      displayName: 'Hoai My (Trung học cơ sở)',
      description: 'Giọng giáo dục cho học sinh THCS'
    },
    '9-12': {
      voiceName: 'vi-VN-NamMinhNeural',
      language: 'Vietnamese',
      locale: 'vi-VN',
      displayName: 'Nam Minh (Trung học phổ thông)',
      description: 'Giọng chuyên nghiệp cho học sinh THPT'
    },
    'College/Adult': {
      voiceName: 'vi-VN-NamMinhNeural',
      language: 'Vietnamese',
      locale: 'vi-VN',
      displayName: 'Nam Minh (Đại học/Người lớn)',
      description: 'Giọng tinh tế cho giáo dục nâng cao'
    }
  },

  // Turkish voices (Turkey)
  tr: {
    'K-2': {
      voiceName: 'tr-TR-EmelNeural',
      language: 'Turkish',
      locale: 'tr-TR',
      displayName: 'Emel (Küçük Çocuklar)',
      description: 'Genç öğrenciler için sıcak ses'
    },
    '3-5': {
      voiceName: 'tr-TR-EmelNeural',
      language: 'Turkish',
      locale: 'tr-TR',
      displayName: 'Emel (İlkokul)',
      description: 'İlkokul öğrencileri için net ses'
    },
    '6-8': {
      voiceName: 'tr-TR-EmelNeural',
      language: 'Turkish',
      locale: 'tr-TR',
      displayName: 'Emel (Ortaokul)',
      description: 'Ortaokul öğrencileri için eğitici ses'
    },
    '9-12': {
      voiceName: 'tr-TR-AhmetNeural',
      language: 'Turkish',
      locale: 'tr-TR',
      displayName: 'Ahmet (Lise)',
      description: 'Lise öğrencileri için profesyonel ses'
    },
    'College/Adult': {
      voiceName: 'tr-TR-AhmetNeural',
      language: 'Turkish',
      locale: 'tr-TR',
      displayName: 'Ahmet (Üniversite/Yetişkin)',
      description: 'İleri eğitim için sofistike ses'
    }
  },

  // Polish voices (Poland)
  pl: {
    'K-2': {
      voiceName: 'pl-PL-ZofiaNeural',
      language: 'Polish',
      locale: 'pl-PL',
      displayName: 'Zofia (Małe dzieci)',
      description: 'Ciepły głos dla małych uczniów'
    },
    '3-5': {
      voiceName: 'pl-PL-ZofiaNeural',
      language: 'Polish',
      locale: 'pl-PL',
      displayName: 'Zofia (Szkoła podstawowa)',
      description: 'Wyraźny głos dla uczniów podstawówki'
    },
    '6-8': {
      voiceName: 'pl-PL-ZofiaNeural',
      language: 'Polish',
      locale: 'pl-PL',
      displayName: 'Zofia (Gimnazjum)',
      description: 'Edukacyjny głos dla uczniów gimnazjum'
    },
    '9-12': {
      voiceName: 'pl-PL-MarekNeural',
      language: 'Polish',
      locale: 'pl-PL',
      displayName: 'Marek (Liceum)',
      description: 'Profesjonalny głos dla licealistów'
    },
    'College/Adult': {
      voiceName: 'pl-PL-MarekNeural',
      language: 'Polish',
      locale: 'pl-PL',
      displayName: 'Marek (Uniwersytet/Dorośli)',
      description: 'Wyrafinowany głos dla zaawansowanych'
    }
  },

  // Dutch voices (Netherlands)
  nl: {
    'K-2': {
      voiceName: 'nl-NL-FennaNeural',
      language: 'Dutch',
      locale: 'nl-NL',
      displayName: 'Fenna (Kleine kinderen)',
      description: 'Warme stem voor jonge leerlingen'
    },
    '3-5': {
      voiceName: 'nl-NL-FennaNeural',
      language: 'Dutch',
      locale: 'nl-NL',
      displayName: 'Fenna (Basisschool)',
      description: 'Duidelijke stem voor basisschoolleerlingen'
    },
    '6-8': {
      voiceName: 'nl-NL-ColetteNeural',
      language: 'Dutch',
      locale: 'nl-NL',
      displayName: 'Colette (Middelbare school)',
      description: 'Educatieve stem voor middelbare scholieren'
    },
    '9-12': {
      voiceName: 'nl-NL-ColetteNeural',
      language: 'Dutch',
      locale: 'nl-NL',
      displayName: 'Colette (Voortgezet onderwijs)',
      description: 'Professionele stem voor middelbare scholieren'
    },
    'College/Adult': {
      voiceName: 'nl-NL-MaartenNeural',
      language: 'Dutch',
      locale: 'nl-NL',
      displayName: 'Maarten (Universiteit/Volwassenen)',
      description: 'Verfijnde stem voor gevorderd onderwijs'
    }
  },

  // Thai voices (Thailand)
  th: {
    'K-2': {
      voiceName: 'th-TH-PremwadeeNeural',
      language: 'Thai',
      locale: 'th-TH',
      displayName: 'Premwadee (เด็กเล็ก)',
      description: 'เสียงอบอุ่นสำหรับผู้เรียนเล็ก'
    },
    '3-5': {
      voiceName: 'th-TH-PremwadeeNeural',
      language: 'Thai',
      locale: 'th-TH',
      displayName: 'Premwadee (ประถมศึกษา)',
      description: 'เสียงชัดเจนสำหรับนักเรียนประถม'
    },
    '6-8': {
      voiceName: 'th-TH-AcharaNeural',
      language: 'Thai',
      locale: 'th-TH',
      displayName: 'Achara (มัธยมต้น)',
      description: 'เสียงการศึกษาสำหรับนักเรียนมัธยมต้น'
    },
    '9-12': {
      voiceName: 'th-TH-AcharaNeural',
      language: 'Thai',
      locale: 'th-TH',
      displayName: 'Achara (มัธยมปลาย)',
      description: 'เสียงมืออาชีพสำหรับนักเรียนมัธยมปลาย'
    },
    'College/Adult': {
      voiceName: 'th-TH-NiwatNeural',
      language: 'Thai',
      locale: 'th-TH',
      displayName: 'Niwat (มหาวิทยาลัย/ผู้ใหญ่)',
      description: 'เสียงที่ซับซ้อนสำหรับการศึกษาขั้นสูง'
    }
  },

  // Indonesian voices (Indonesia)
  id: {
    'K-2': {
      voiceName: 'id-ID-GadisNeural',
      language: 'Indonesian',
      locale: 'id-ID',
      displayName: 'Gadis (Anak kecil)',
      description: 'Suara hangat untuk pelajar muda'
    },
    '3-5': {
      voiceName: 'id-ID-GadisNeural',
      language: 'Indonesian',
      locale: 'id-ID',
      displayName: 'Gadis (Sekolah Dasar)',
      description: 'Suara jelas untuk siswa SD'
    },
    '6-8': {
      voiceName: 'id-ID-GadisNeural',
      language: 'Indonesian',
      locale: 'id-ID',
      displayName: 'Gadis (SMP)',
      description: 'Suara edukatif untuk siswa SMP'
    },
    '9-12': {
      voiceName: 'id-ID-ArdiNeural',
      language: 'Indonesian',
      locale: 'id-ID',
      displayName: 'Ardi (SMA)',
      description: 'Suara profesional untuk siswa SMA'
    },
    'College/Adult': {
      voiceName: 'id-ID-ArdiNeural',
      language: 'Indonesian',
      locale: 'id-ID',
      displayName: 'Ardi (Universitas/Dewasa)',
      description: 'Suara canggih untuk pendidikan lanjut'
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
    zh: 'zh-CN',
    fr: 'fr-FR',
    de: 'de-DE',
    pt: 'pt-BR',
    ja: 'ja-JP',
    sw: 'sw-KE',
    af: 'af-ZA',
    ha: 'en-NG', // Nigerian English fallback for Hausa
    am: 'am-ET',
    ar: 'ar-SA',
    ru: 'ru-RU',
    it: 'it-IT',
    ko: 'ko-KR',
    vi: 'vi-VN',
    tr: 'tr-TR',
    pl: 'pl-PL',
    nl: 'nl-NL',
    th: 'th-TH',
    id: 'id-ID'
  };
  return localeMap[language];
}

// Get language name in English
export function getLanguageName(language: SupportedLanguage): string {
  const nameMap: Record<SupportedLanguage, string> = {
    en: 'English',
    es: 'Spanish',
    hi: 'Hindi',
    zh: 'Chinese',
    fr: 'French',
    de: 'German',
    pt: 'Portuguese',
    ja: 'Japanese',
    sw: 'Swahili',
    af: 'Afrikaans',
    ha: 'Hausa',
    am: 'Amharic',
    ar: 'Arabic',
    ru: 'Russian',
    it: 'Italian',
    ko: 'Korean',
    vi: 'Vietnamese',
    tr: 'Turkish',
    pl: 'Polish',
    nl: 'Dutch',
    th: 'Thai',
    id: 'Indonesian'
  };
  return nameMap[language];
}

// Auto-detect browser language and map to supported language
export function detectBrowserLanguage(): SupportedLanguage {
  if (typeof navigator === 'undefined') return 'en';
  
  const browserLang = navigator.language.toLowerCase();
  
  // Map browser language codes to supported languages
  if (browserLang.startsWith('es')) return 'es';
  if (browserLang.startsWith('hi')) return 'hi';
  if (browserLang.startsWith('zh')) return 'zh';
  if (browserLang.startsWith('fr')) return 'fr';
  if (browserLang.startsWith('de')) return 'de';
  if (browserLang.startsWith('pt')) return 'pt';
  if (browserLang.startsWith('ja')) return 'ja';
  if (browserLang.startsWith('sw')) return 'sw';
  if (browserLang.startsWith('af')) return 'af';
  if (browserLang.startsWith('ha')) return 'ha';
  if (browserLang.startsWith('am')) return 'am';
  if (browserLang.startsWith('ar')) return 'ar';
  if (browserLang.startsWith('ru')) return 'ru';
  if (browserLang.startsWith('it')) return 'it';
  if (browserLang.startsWith('ko')) return 'ko';
  if (browserLang.startsWith('vi')) return 'vi';
  if (browserLang.startsWith('tr')) return 'tr';
  if (browserLang.startsWith('pl')) return 'pl';
  if (browserLang.startsWith('nl')) return 'nl';
  if (browserLang.startsWith('th')) return 'th';
  if (browserLang.startsWith('id')) return 'id';
  
  // Default to English
  return 'en';
}

// Legacy language code migration (backward compatibility)
export function migrateLegacyLanguageCode(legacyCode: string | undefined | null): SupportedLanguage | undefined {
  // Return undefined for empty values to allow fallback logic
  if (!legacyCode) return undefined;
  
  const legacyMap: Record<string, SupportedLanguage> = {
    'english': 'en',
    'spanish': 'es',
    'hindi': 'hi',
    'chinese': 'zh',
    'french': 'fr',
    'german': 'de',
    'portuguese': 'pt',
    'japanese': 'ja',
    'swahili': 'sw',
    'afrikaans': 'af',
    'hausa': 'ha',
    'amharic': 'am',
    'arabic': 'ar',
    'russian': 'ru',
    'italian': 'it',
    'korean': 'ko',
    'vietnamese': 'vi',
    'turkish': 'tr',
    'polish': 'pl',
    'dutch': 'nl',
    'thai': 'th',
    'indonesian': 'id'
  };
  
  // If it's already an ISO code, return it
  if (isValidLanguage(legacyCode)) {
    return legacyCode as SupportedLanguage;
  }
  
  // Otherwise, try to migrate from legacy
  const migrated = legacyMap[legacyCode.toLowerCase()];
  return migrated; // Returns undefined for unknown codes
}

// Validate language and age group
export function isValidLanguage(lang: string): lang is SupportedLanguage {
  return ['en', 'es', 'hi', 'zh', 'fr', 'de', 'pt', 'ja', 'sw', 'af', 'ha', 'am', 'ar', 'ru', 'it', 'ko', 'vi', 'tr', 'pl', 'nl', 'th', 'id'].includes(lang);
}

export function isValidAgeGroup(age: string): age is AgeGroup {
  return ['K-2', '3-5', '6-8', '9-12', 'College/Adult'].includes(age);
}
