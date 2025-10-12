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
  { code: "english", name: "English", flag: "🇺🇸" },
  { code: "spanish", name: "Spanish", flag: "🇪🇸" },
  { code: "chinese", name: "Chinese", flag: "🇨🇳" },
  { code: "hindi", name: "Hindi", flag: "🇮🇳" }
];

export default function LanguageSelector({ type = "interface", variant = "settings" }: LanguageSelectorProps) {
  const { user, refetch } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const languages = type === "voice" ? voiceLanguages : interfaceLanguages;
  const [selectedLanguage, setSelectedLanguage] = useState(
    type === "voice" ? user?.preferredLanguage || "english" : localStorage.getItem("interfaceLanguage") || "en"
  );

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
        refetch();
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