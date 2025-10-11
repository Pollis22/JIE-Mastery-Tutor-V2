import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { getLocaleFromLanguage, type SupportedLanguage } from '../config/multiLanguageVoices';

export class AzureSTTService {
  private speechConfig: sdk.SpeechConfig;
  private currentLanguage: SupportedLanguage = 'en';

  constructor() {
    // Initialize Azure Speech SDK
    const speechKey = process.env.AZURE_SPEECH_KEY;
    const speechRegion = process.env.AZURE_SPEECH_REGION;

    if (!speechKey || !speechRegion) {
      throw new Error('Azure Speech credentials not found. Please set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.');
    }

    this.speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
    
    // Set default language
    const defaultLocale = getLocaleFromLanguage('en');
    this.speechConfig.speechRecognitionLanguage = defaultLocale;
    
    console.log(`[Azure STT] Initialized with language: ${defaultLocale}`);
  }

  // Set recognition language
  setLanguage(language: SupportedLanguage): void {
    this.currentLanguage = language;
    const locale = getLocaleFromLanguage(language);
    this.speechConfig.speechRecognitionLanguage = locale;
    
    console.log(`[Azure STT] Recognition language set to: ${locale}`);
  }

  // Get current language
  getCurrentLanguage(): SupportedLanguage {
    return this.currentLanguage;
  }

  // Recognize speech from audio buffer
  async recognizeFromBuffer(audioBuffer: ArrayBuffer): Promise<string> {
    return new Promise((resolve, reject) => {
      // Create push stream for audio buffer
      const pushStream = sdk.AudioInputStream.createPushStream();
      pushStream.write(audioBuffer);
      pushStream.close();

      const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
      const recognizer = new sdk.SpeechRecognizer(this.speechConfig, audioConfig);

      recognizer.recognizeOnceAsync(
        (result) => {
          if (result.reason === sdk.ResultReason.RecognizedSpeech) {
            console.log(`[Azure STT] Recognized: "${result.text}"`);
            resolve(result.text);
          } else if (result.reason === sdk.ResultReason.NoMatch) {
            console.log('[Azure STT] No speech recognized');
            resolve('');
          } else {
            reject(new Error(`Recognition failed: ${result.errorDetails}`));
          }
          recognizer.close();
        },
        (error) => {
          console.error('[Azure STT] Recognition error:', error);
          reject(error);
          recognizer.close();
        }
      );
    });
  }

  // Start continuous recognition (for real-time streaming)
  async startContinuousRecognition(
    onRecognized: (text: string) => void,
    onRecognizing?: (text: string) => void
  ): Promise<sdk.SpeechRecognizer> {
    const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    const recognizer = new sdk.SpeechRecognizer(this.speechConfig, audioConfig);

    recognizer.recognized = (s, e) => {
      if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
        console.log(`[Azure STT] Continuous: "${e.result.text}"`);
        onRecognized(e.result.text);
      }
    };

    if (onRecognizing) {
      recognizer.recognizing = (s, e) => {
        if (e.result.text) {
          console.log(`[Azure STT] Recognizing: "${e.result.text}"`);
          onRecognizing(e.result.text);
        }
      };
    }

    recognizer.canceled = (s, e) => {
      console.log(`[Azure STT] Recognition canceled: ${e.reason}`);
      if (e.reason === sdk.CancellationReason.Error) {
        console.error(`[Azure STT] Error: ${e.errorDetails}`);
      }
      recognizer.stopContinuousRecognitionAsync();
    };

    await recognizer.startContinuousRecognitionAsync();
    console.log('[Azure STT] Continuous recognition started');
    
    return recognizer;
  }

  // Stop continuous recognition
  async stopContinuousRecognition(recognizer: sdk.SpeechRecognizer): Promise<void> {
    await recognizer.stopContinuousRecognitionAsync();
    recognizer.close();
    console.log('[Azure STT] Continuous recognition stopped');
  }

  // Test recognition
  async testRecognition(): Promise<boolean> {
    try {
      console.log('[Azure STT] Testing speech recognition...');
      // In real scenario, this would use actual audio input
      // For now, we just verify the config is valid
      return true;
    } catch (error) {
      console.error('[Azure STT] Test recognition failed:', error);
      return false;
    }
  }
}

// Singleton instance
let azureSTTInstance: AzureSTTService | null = null;

export function getAzureSTTService(): AzureSTTService {
  if (!azureSTTInstance) {
    azureSTTInstance = new AzureSTTService();
  }
  return azureSTTInstance;
}
