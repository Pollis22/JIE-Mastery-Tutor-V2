import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Languages } from "lucide-react";

interface LanguageSelectorProps {
  type?: "interface" | "voice";
  variant?: "nav" | "settings";
}

const interfaceLanguages = [
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "es", name: "Español", flag: "🇪🇸" },
  { code: "zh", name: "中文", flag: "🇨🇳" },
  { code: "hi", name: "हिंदी", flag: "🇮🇳" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "de", name: "Deutsch", flag: "🇩🇪" },
  { code: "pt", name: "Português", flag: "🇵🇹" },
  { code: "ja", name: "日本語", flag: "🇯🇵" }
];

const voiceLanguages = [
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "es", name: "Español", flag: "🇪🇸" },
  { code: "zh", name: "中文", flag: "🇨🇳" },
  { code: "hi", name: "हिंदी", flag: "🇮🇳" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "de", name: "Deutsch", flag: "🇩🇪" },
  { code: "pt", name: "Português", flag: "🇧🇷" },
  { code: "ja", name: "日本語", flag: "🇯🇵" },
  { code: "sw", name: "Kiswahili", flag: "🇰🇪" },
  { code: "af", name: "Afrikaans", flag: "🇿🇦" },
  { code: "ha", name: "Hausa", flag: "🇳🇬" },
  { code: "am", name: "አማርኛ", flag: "🇪🇹" }
];

export default function LanguageSelector({ type = "interface", variant = "settings" }: LanguageSelectorProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const languages = type === "voice" ? voiceLanguages : interfaceLanguages;
  
  // Migrate legacy language codes to ISO codes (backward compatibility)
  const migrateLegacyLanguageCode = (code: string | undefined | null): string | undefined => {
    // Return undefined for empty values so auto-detection can run
    if (!code) return undefined;
    
    const legacyMap: Record<string, string> = {
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
      'amharic': 'am'
    };
    
    // If already ISO code (2 chars), return as-is
    if (code.length === 2) return code;
    
    // Otherwise migrate from legacy word to ISO code
    return legacyMap[code.toLowerCase()] || undefined;
  };
  
  // Auto-detect browser language on first visit
  const detectLanguage = () => {
    if (typeof navigator !== 'undefined') {
      const browserLang = navigator.language.toLowerCase();
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
    }
    return 'en';
  };
  
  // Initialize with migrated code, fallback to auto-detection, then English
  const [selectedLanguage, setSelectedLanguage] = useState(() => {
    if (type === "voice") {
      return migrateLegacyLanguageCode(user?.preferredLanguage) || detectLanguage() || 'en';
    } else {
      return migrateLegacyLanguageCode(localStorage.getItem("interfaceLanguage")) || detectLanguage() || 'en';
    }
  });

  const updateLanguageMutation = useMutation({
    mutationFn: async (language: string) => {
      if (type === "voice") {
        const response = await apiRequest("PATCH", "/api/user/preferences", {
          preferredLanguage: language
        });
        if (!response.ok) throw new Error("Failed to update language preference");
        return response.json();
      } else {
        // For interface language, just update localStorage and UI
        localStorage.setItem("interfaceLanguage", language);
        // In a real implementation, you'd update UI text here
        return { success: true };
      }
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: `${type === "voice" ? "Voice" : "Interface"} language updated`,
      });
      if (type === "voice") {
        queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      } else {
        // In a real implementation, you'd trigger a UI language change here
        window.location.reload();
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update language",
        variant: "destructive",
      });
    }
  });

  // Update selected language when user data loads (fixes async hydration issue)
  useEffect(() => {
    if (type === "voice" && user?.preferredLanguage) {
      const migratedLang = migrateLegacyLanguageCode(user?.preferredLanguage) || detectLanguage() || 'en';
      setSelectedLanguage(migratedLang);
      
      // Auto-update to ISO code if user has legacy value
      if (user.preferredLanguage !== migratedLang && !updateLanguageMutation.isPending) {
        updateLanguageMutation.mutate(migratedLang);
      }
    }
  }, [user?.preferredLanguage, type, updateLanguageMutation]);

  const handleLanguageChange = (language: string) => {
    setSelectedLanguage(language);
    updateLanguageMutation.mutate(language);
  };

  if (variant === "nav") {
    return (
      <Select value={selectedLanguage} onValueChange={handleLanguageChange}>
        <SelectTrigger className="w-[140px]">
          <Languages className="h-4 w-4 mr-2" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {languages.map((lang) => (
            <SelectItem key={lang.code} value={lang.code}>
              <span className="flex items-center gap-2">
                <span>{lang.flag}</span>
                <span>{lang.name}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Select value={selectedLanguage} onValueChange={handleLanguageChange}>
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="Select language" />
      </SelectTrigger>
      <SelectContent>
        {languages.map((lang) => (
          <SelectItem key={lang.code} value={lang.code}>
            <span className="flex items-center gap-2">
              <span>{lang.flag}</span>
              <span>{lang.name}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}