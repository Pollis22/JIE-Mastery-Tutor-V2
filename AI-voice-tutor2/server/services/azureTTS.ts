/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 * 
 * This source code is confidential and proprietary.
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */


import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { generateSSML, splitForStreaming, type EnergyStyle } from '../utils/ssmlGenerator';
import { 
  getVoiceConfig, 
  getLocaleFromLanguage,
  type SupportedLanguage, 
  type AgeGroup 
} from '../config/multiLanguageVoices';

export class AzureTTSService {
  private speechConfig: sdk.SpeechConfig;
  private audioConfig: sdk.AudioConfig;
  private synthesizer: sdk.SpeechSynthesizer | null = null;
  private currentEnergyLevel: EnergyStyle = 'neutral';
  private currentLanguage: SupportedLanguage = 'en';
  private currentAgeGroup: AgeGroup = '3-5';

  constructor() {
    // Initialize Azure Speech SDK
    const speechKey = process.env.AZURE_SPEECH_KEY;
    const speechRegion = process.env.AZURE_SPEECH_REGION;

    if (!speechKey || !speechRegion) {
      throw new Error('Azure Speech credentials not found. Please set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.');
    }

    this.speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
    this.speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;
    
    // Set default voice using multi-language config
    const defaultVoice = getVoiceConfig('en', '3-5');
    this.speechConfig.speechSynthesisVoiceName = defaultVoice.voiceName;
    
    // Configure audio output for server environment (buffer mode for headless servers)
    this.audioConfig = sdk.AudioConfig.fromDefaultSpeakerOutput(); // Will be overridden in synthesis for buffer mode
    this.currentEnergyLevel = (process.env.ENERGY_LEVEL as EnergyStyle) || 'upbeat';
  }

  // Set language and age group for voice selection
  setVoice(language: SupportedLanguage, ageGroup: AgeGroup): void {
    this.currentLanguage = language;
    this.currentAgeGroup = ageGroup;
    
    const voiceConfig = getVoiceConfig(language, ageGroup);
    this.speechConfig.speechSynthesisVoiceName = voiceConfig.voiceName;
    
    console.log(`[Azure TTS] Voice set to: ${voiceConfig.displayName} (${voiceConfig.voiceName})`);
  }

  // Get current voice configuration
  getCurrentVoice() {
    return getVoiceConfig(this.currentLanguage, this.currentAgeGroup);
  }

  // Set energy level for current session
  setEnergyLevel(level: EnergyStyle): void {
    this.currentEnergyLevel = level;
    console.log(`[Azure TTS] Energy level set to: ${level}`);
  }

  // Synthesize speech with SSML styling
  async synthesizeSpeech(text: string, energyLevel?: EnergyStyle, language?: SupportedLanguage): Promise<ArrayBuffer> {
    const level = energyLevel || this.currentEnergyLevel;
    const lang = language || this.currentLanguage;
    const locale = getLocaleFromLanguage(lang);
    const voiceConfig = getVoiceConfig(lang, this.currentAgeGroup);
    
    const ssml = generateSSML(text, level, voiceConfig.voiceName, locale);
    
    console.log(`[Azure TTS] Synthesizing: ${voiceConfig.displayName} (${level})`);
    console.log(`[Azure TTS] Language: ${lang}, Locale: ${locale}`);

    return new Promise((resolve, reject) => {
      // Use no audio config for buffer-based synthesis on server
      this.synthesizer = new sdk.SpeechSynthesizer(this.speechConfig, undefined);
      
      this.synthesizer.speakSsmlAsync(
        ssml,
        (result) => {
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            console.log(`[Azure TTS] Synthesis completed. Audio length: ${result.audioData.byteLength} bytes`);
            resolve(result.audioData);
          } else {
            console.error(`[Azure TTS] Synthesis failed:`, result.errorDetails);
            reject(new Error(result.errorDetails));
          }
          this.synthesizer?.close();
          this.synthesizer = null;
        },
        (error) => {
          console.error(`[Azure TTS] Synthesis error:`, error);
          reject(error);
          this.synthesizer?.close();
          this.synthesizer = null;
        }
      );
    });
  }

  // Stream synthesis for faster response with barge-in support
  async streamSpeech(textChunks: string[], energyLevel?: EnergyStyle, abortSignal?: AbortSignal): Promise<AsyncGenerator<ArrayBuffer>> {
    const level = energyLevel || this.currentEnergyLevel;
    
    return (async function* (this: AzureTTSService) {
      for (const chunk of textChunks) {
        // Check for barge-in (user interrupted)
        if (abortSignal?.aborted) {
          console.log('[Azure TTS] Stream aborted (barge-in detected)');
          break;
        }
        
        try {
          const audioData = await this.synthesizeSpeech(chunk, level);
          yield audioData;
        } catch (error) {
          console.error(`[Azure TTS] Chunk synthesis failed:`, error);
          // Continue with next chunk
        }
      }
    }).call(this);
  }

  // Stop current synthesis (for barge-in)
  stopSynthesis(): void {
    if (this.synthesizer) {
      console.log('[Azure TTS] Stopping current synthesis for barge-in');
      this.synthesizer.close();
      this.synthesizer = null;
    }
  }

  // Test synthesis to verify configuration
  async testSynthesis(): Promise<boolean> {
    try {
      const testText = "Hello! This is a test of the Azure Text-to-Speech service.";
      await this.synthesizeSpeech(testText);
      return true;
    } catch (error) {
      console.error('[Azure TTS] Test synthesis failed:', error);
      return false;
    }
  }

  // Cleanup resources
  dispose(): void {
    if (this.synthesizer) {
      this.synthesizer.close();
      this.synthesizer = null;
    }
  }
}

// Singleton instance
let azureTTSInstance: AzureTTSService | null = null;

export function getAzureTTSService(): AzureTTSService {
  if (!azureTTSInstance) {
    azureTTSInstance = new AzureTTSService();
  }
  return azureTTSInstance;
}