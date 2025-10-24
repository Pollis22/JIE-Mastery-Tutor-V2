import crypto from 'crypto';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';

class VoiceService {
  private testMode: boolean;

  constructor() {
    // Check if ElevenLabs ConvAI should be used instead (case-insensitive check)
    const useConvAI = process.env.USE_CONVAI?.toLowerCase() === 'true';
    
    if (useConvAI) {
      this.testMode = true;
      console.log('Voice service DISABLED - ElevenLabs ConvAI is enabled (USE_CONVAI=true)');
      console.log('Skipping Azure TTS/ASR/VAD initialization to prevent conflicts');
      return;
    }
    
    // Check for Azure Speech credentials
    const hasAzure = !!process.env.AZURE_SPEECH_KEY?.trim() && !!process.env.AZURE_SPEECH_REGION?.trim();
    
    // Use test mode unless explicitly disabled and all services are available
    this.testMode = process.env.VOICE_TEST_MODE !== '0' || !hasAzure;
    
    console.log(`Voice service init: Azure=${hasAzure}, TestMode=${this.testMode}`);
    
    if (this.testMode) {
      console.log('Voice service running in TEST MODE - using browser TTS and simplified conversation logic');
    } else {
      console.log('Voice service running in PRODUCTION MODE - using Azure TTS');
    }
  }

  async generateLiveToken(userId: string): Promise<string> {
    // Return mock token for testing
    return `mock_token_${userId}_${Date.now()}`;
  }

  getRealtimeConfig() {
    // VoiceService is now a legacy service - Gemini Live API is the only voice provider
    // This method is kept for backward compatibility but always returns test mode config
    return {
      testMode: true,
      provider: 'gemini',
      message: 'Voice now uses Gemini Live API exclusively - see /api/session/gemini endpoint'
    };
  }

  async generateNarration(text: string, style: string = 'cheerful'): Promise<string> {
    if (this.testMode) {
      // Return mock audio URL for testing
      return `data:audio/wav;base64,mock_audio_${Date.now()}`;
    }

    // Validate environment variables are non-empty
    if (!process.env.AZURE_SPEECH_KEY?.trim() || !process.env.AZURE_SPEECH_REGION?.trim()) {
      throw new Error('Azure Speech services not configured - AZURE_SPEECH_KEY and AZURE_SPEECH_REGION must be set');
    }

    try {
      // Azure Neural TTS implementation
      const speechConfig = {
        subscriptionKey: process.env.AZURE_SPEECH_KEY,
        region: process.env.AZURE_SPEECH_REGION,
      };

      const ssml = this.buildSSML(text, style);
      
      // In a real implementation, this would call Azure Speech Services
      // For now, we'll return a placeholder URL
      const audioUrl = await this.synthesizeSpeech(ssml, speechConfig);
      
      return audioUrl;
    } catch (error) {
      console.error('Error generating narration:', error);
      throw new Error('Failed to generate speech narration');
    }
  }

  private buildSSML(text: string, style: string): string {
    const voiceMap = {
      cheerful: 'en-US-JennyNeural',
      empathetic: 'en-US-AriaNeural',
      professional: 'en-US-GuyNeural',
    };

    const voice = voiceMap[style as keyof typeof voiceMap] || voiceMap.cheerful;
    
    // Escape XML special characters in text content
    const escapedText = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

    // Build SSML with correct mstts namespace and tags
    if (style === 'professional') {
      return `
        <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
          <voice name="${voice}">
            <prosody rate="medium" pitch="medium">
              ${escapedText}
            </prosody>
          </voice>
        </speak>
      `.trim();
    } else {
      return `
        <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">
          <voice name="${voice}">
            <mstts:express-as style="${style}">
              <prosody rate="medium" pitch="medium">
                ${escapedText}
              </prosody>
            </mstts:express-as>
          </voice>
        </speak>
      `.trim();
    }
  }

  private async synthesizeSpeech(ssml: string, config: any): Promise<string> {
    try {
      // Configure Azure Speech SDK
      const speechConfig = sdk.SpeechConfig.fromSubscription(
        config.subscriptionKey,
        config.region
      );
      
      // Set output format
      speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;
      
      // Create synthesizer
      const synthesizer = new sdk.SpeechSynthesizer(speechConfig);
      
      return new Promise<string>((resolve, reject) => {
        synthesizer.speakSsmlAsync(
          ssml,
          (result) => {
            if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
              // Convert audio buffer to base64 data URL
              const audioBase64 = Buffer.from(result.audioData).toString('base64');
              const dataUrl = `data:audio/mp3;base64,${audioBase64}`;
              resolve(dataUrl);
            } else {
              reject(new Error(`Speech synthesis failed: ${result.errorDetails}`));
            }
            synthesizer.close();
          },
          (error) => {
            synthesizer.close();
            reject(error);
          }
        );
      });
    } catch (error) {
      console.error('Azure TTS error:', error);
      throw new Error('Failed to synthesize speech with Azure TTS');
    }
  }

  validateVoiceToken(token: string): { valid: boolean; userId?: string } {
    try {
      if (this.testMode && token.startsWith('mock_token_')) {
        const userId = token.split('_')[2];
        return { valid: true, userId };
      }

      const [payloadBase64, signature] = token.split('.');
      const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString());
      
      const expectedSignature = crypto
        .createHmac('sha256', process.env.SESSION_SECRET!)
        .update(JSON.stringify(payload))
        .digest('hex');

      if (signature !== expectedSignature) {
        return { valid: false };
      }

      // Check if token is not expired (24 hours)
      const isExpired = Date.now() - payload.timestamp > 24 * 60 * 60 * 1000;
      if (isExpired) {
        return { valid: false };
      }

      return { valid: true, userId: payload.userId };
    } catch (error) {
      return { valid: false };
    }
  }
}

export const voiceService = new VoiceService();
