import { useEffect, useState } from "react";
import { Globe } from "lucide-react";

interface LanguageGreetingProps {
  language?: string;
  userName?: string;
  variant?: "full" | "compact";
}

// Greetings in all 12 supported languages
const greetings: Record<string, { welcome: string; greeting: string; selectPrompt: string }> = {
  en: {
    welcome: "Welcome",
    greeting: "Hello",
    selectPrompt: "Choose your language"
  },
  es: {
    welcome: "Bienvenido",
    greeting: "Hola",
    selectPrompt: "Elige tu idioma"
  },
  zh: {
    welcome: "欢迎",
    greeting: "你好",
    selectPrompt: "选择你的语言"
  },
  hi: {
    welcome: "स्वागत है",
    greeting: "नमस्ते",
    selectPrompt: "अपनी भाषा चुनें"
  },
  fr: {
    welcome: "Bienvenue",
    greeting: "Bonjour",
    selectPrompt: "Choisissez votre langue"
  },
  de: {
    welcome: "Willkommen",
    greeting: "Hallo",
    selectPrompt: "Wählen Sie Ihre Sprache"
  },
  pt: {
    welcome: "Bem-vindo",
    greeting: "Olá",
    selectPrompt: "Escolha seu idioma"
  },
  ja: {
    welcome: "ようこそ",
    greeting: "こんにちは",
    selectPrompt: "言語を選択"
  },
  sw: {
    welcome: "Karibu",
    greeting: "Habari",
    selectPrompt: "Chagua lugha yako"
  },
  af: {
    welcome: "Welkom",
    greeting: "Hallo",
    selectPrompt: "Kies jou taal"
  },
  ha: {
    welcome: "Barka da zuwa",
    greeting: "Sannu",
    selectPrompt: "Zaɓi harshenka"
  },
  am: {
    welcome: "እንኳን ደህና መጡ",
    greeting: "ሰላም",
    selectPrompt: "ቋንቋህን ምረጥ"
  }
};

export default function LanguageGreeting({ language, userName, variant = "full" }: LanguageGreetingProps) {
  const [detectedLang, setDetectedLang] = useState<string>('en');
  
  useEffect(() => {
    // Auto-detect browser language if not provided
    if (!language && typeof navigator !== 'undefined') {
      const browserLang = navigator.language.toLowerCase();
      
      if (browserLang.startsWith('es')) setDetectedLang('es');
      else if (browserLang.startsWith('hi')) setDetectedLang('hi');
      else if (browserLang.startsWith('zh')) setDetectedLang('zh');
      else if (browserLang.startsWith('fr')) setDetectedLang('fr');
      else if (browserLang.startsWith('de')) setDetectedLang('de');
      else if (browserLang.startsWith('pt')) setDetectedLang('pt');
      else if (browserLang.startsWith('ja')) setDetectedLang('ja');
      else if (browserLang.startsWith('sw')) setDetectedLang('sw');
      else if (browserLang.startsWith('af')) setDetectedLang('af');
      else if (browserLang.startsWith('ha')) setDetectedLang('ha');
      else if (browserLang.startsWith('am')) setDetectedLang('am');
      else setDetectedLang('en');
    }
  }, [language]);
  
  const currentLang = language || detectedLang;
  const greet = greetings[currentLang] || greetings['en'];
  
  if (variant === "compact") {
    return (
      <span className="flex items-center gap-2 text-sm" data-testid="greeting-compact">
        <Globe className="h-4 w-4" />
        <span>{greet.greeting}{userName ? `, ${userName}` : ''}!</span>
      </span>
    );
  }
  
  return (
    <div className="flex items-center gap-3" data-testid="greeting-full">
      <Globe className="h-6 w-6 text-blue-600" />
      <div>
        <h2 className="text-2xl font-bold">
          {greet.greeting}{userName ? `, ${userName}` : ''}! 👋
        </h2>
        <p className="text-gray-600 text-sm">
          {greet.welcome} to JIE Mastery
        </p>
      </div>
    </div>
  );
}

// Export helper function for other components to use
export function getGreeting(language: string = 'en'): string {
  const greet = greetings[language] || greetings['en'];
  return greet.greeting;
}

export function getWelcomeMessage(language: string = 'en'): string {
  const greet = greetings[language] || greetings['en'];
  return greet.welcome;
}

export function getLanguagePrompt(language: string = 'en'): string {
  const greet = greetings[language] || greetings['en'];
  return greet.selectPrompt;
}
