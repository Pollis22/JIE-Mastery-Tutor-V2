// Gemini Live API Service
// DON'T DELETE THIS COMMENT - Using blueprint:javascript_gemini integration
import { GoogleGenAI, LiveConnectConfig, Modality } from "@google/genai";
import crypto from 'crypto';

class GeminiLiveService {
  private client: GoogleGenAI | null = null;
  private enabled: boolean = false;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    
    if (!apiKey) {
      console.log('[GeminiLive] GEMINI_API_KEY not found - service disabled');
      this.enabled = false;
      return;
    }

    this.client = new GoogleGenAI({ apiKey });
    this.enabled = true;
    console.log('[GeminiLive] ✅ Service initialized successfully');
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Generate ephemeral session token for client-side connection
   * Gemini doesn't need ephemeral tokens like OpenAI - we'll use API key server-side
   */
  async generateSessionToken(userId: string): Promise<string> {
    if (!this.enabled) {
      throw new Error('Gemini Live service not configured');
    }

    // Create secure session identifier
    const payload = {
      userId,
      timestamp: Date.now(),
      service: 'gemini_live',
      sessionId: crypto.randomUUID(),
    };

    const token = crypto
      .createHmac('sha256', process.env.SESSION_SECRET!)
      .update(JSON.stringify(payload))
      .digest('hex');

    return `${Buffer.from(JSON.stringify(payload)).toString('base64')}.${token}`;
  }

  /**
   * Get voice configuration for Gemini Live
   * Maps our age groups to Gemini's voice personas
   */
  getVoiceForAgeGroup(ageGroup?: string, language?: string): string {
    // Gemini Live has 30 HD voices - mapping to age-appropriate ones
    const voiceMap: Record<string, string> = {
      'k-2': 'Puck',        // Playful, friendly
      '3-5': 'Charon',      // Adventurous, curious
      '6-8': 'Kore',        // Knowledgeable, balanced
      '9-12': 'Fenrir',     // Professional, academic
      'college': 'Aoede',   // Collaborative, efficient
    };

    return voiceMap[ageGroup?.toLowerCase() || 'k-2'] || 'Puck';
  }

  /**
   * Create Gemini Live session configuration
   * Note: Model is specified when calling ai.live.connect(), not in config
   */
  createLiveConfig(params: {
    voice?: string;
    systemInstruction: string;
    ageGroup?: string;
    language?: string;
  }): LiveConnectConfig {
    const voice = params.voice || this.getVoiceForAgeGroup(params.ageGroup, params.language);

    return {
      responseModalities: [Modality.AUDIO],
      systemInstruction: params.systemInstruction,
    } as LiveConnectConfig;
  }

  /**
   * Get model name for Gemini Live
   */
  getModelName(): string {
    return 'gemini-2.0-flash-live';
  }

  /**
   * Get the Gemini client for server-side operations
   */
  getClient(): GoogleGenAI {
    if (!this.client) {
      throw new Error('Gemini client not initialized');
    }
    return this.client;
  }

  /**
   * Cost estimation helper
   */
  estimateCost(audioMinutes: number): { input: number; output: number; total: number } {
    // Gemini Live pricing (as of 2025):
    // Audio input: $3.00 per 1M tokens (25 tokens/sec = 1500 tokens/min = 90k tokens/hour)
    // Audio output: $12.00 per 1M tokens
    
    const tokensPerMinute = 1500;
    const inputTokens = audioMinutes * tokensPerMinute;
    const outputTokens = audioMinutes * tokensPerMinute;

    const inputCost = (inputTokens / 1_000_000) * 3.00;
    const outputCost = (outputTokens / 1_000_000) * 12.00;

    return {
      input: inputCost,
      output: outputCost,
      total: inputCost + outputCost,
    };
  }
}

// Export singleton instance
export const geminiLiveService = new GeminiLiveService();
export default geminiLiveService;
