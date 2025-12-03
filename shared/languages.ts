/**
 * Supported tutoring languages
 * Maps language codes to names, native names, and Deepgram language codes
 */

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English', deepgramCode: 'en-US', greeting: 'Hello' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', deepgramCode: 'es-ES', greeting: 'Hola' },
  { code: 'fr', name: 'French', nativeName: 'Français', deepgramCode: 'fr-FR', greeting: 'Bonjour' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', deepgramCode: 'de-DE', greeting: 'Hallo' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', deepgramCode: 'it-IT', greeting: 'Ciao' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', deepgramCode: 'pt-BR', greeting: 'Olá' },
  { code: 'zh', name: 'Chinese (Mandarin)', nativeName: '普通话', deepgramCode: 'zh-CN', greeting: '你好' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', deepgramCode: 'ja-JP', greeting: 'こんにちは' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', deepgramCode: 'ko-KR', greeting: '안녕하세요' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', deepgramCode: 'ar-AE', greeting: 'مرحبا' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', deepgramCode: 'hi-IN', greeting: 'नमस्ते' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', deepgramCode: 'ru-RU', greeting: 'Привет' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', deepgramCode: 'nl-NL', greeting: 'Hallo' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', deepgramCode: 'pl-PL', greeting: 'Cześć' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', deepgramCode: 'tr-TR', greeting: 'Merhaba' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', deepgramCode: 'vi-VN', greeting: 'Xin chào' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', deepgramCode: 'th-TH', greeting: 'สวัสดี' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', deepgramCode: 'id-ID', greeting: 'Halo' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska', deepgramCode: 'sv-SE', greeting: 'Hej' },
  { code: 'da', name: 'Danish', nativeName: 'Dansk', deepgramCode: 'da-DK', greeting: 'Hej' },
  { code: 'no', name: 'Norwegian', nativeName: 'Norsk', deepgramCode: 'no-NO', greeting: 'Hei' },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi', deepgramCode: 'fi-FI', greeting: 'Hei' },
  // African Languages - using multi-language detection for STT as Deepgram doesn't fully support these yet
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili', deepgramCode: 'multi', greeting: 'Habari' },
  { code: 'yo', name: 'Yoruba', nativeName: 'Yorùbá', deepgramCode: 'multi', greeting: 'Bawo ni' },
  { code: 'ha', name: 'Hausa', nativeName: 'Hausa', deepgramCode: 'multi', greeting: 'Sannu' },
] as const;

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number]['code'];

export function getLanguageByCode(code: string): typeof SUPPORTED_LANGUAGES[number] | undefined {
  return SUPPORTED_LANGUAGES.find(lang => lang.code === code);
}

export function getLanguageName(code: string): string {
  const lang = getLanguageByCode(code);
  return lang?.name || 'English';
}

export function getDeepgramLanguageCode(code: string): string {
  const lang = getLanguageByCode(code);
  return lang?.deepgramCode || 'en-US';
}

export function getGreeting(code: string): string {
  const lang = getLanguageByCode(code);
  return lang?.greeting || 'Hello';
}
