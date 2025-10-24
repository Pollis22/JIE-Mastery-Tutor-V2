import { useCallback, useRef, useState } from 'react';
import { GoogleGenAI, LiveConnectConfig, LiveServerMessage, Session } from '@google/genai';

interface UseGeminiVoiceOptions {
  onTranscript?: (text: string, isUser: boolean) => void;
  onError?: (error: Error) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

export function useGeminiVoice(options: UseGeminiVoiceOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [transcript, setTranscript] = useState<Array<{
    speaker: 'tutor' | 'student';
    text: string;
    timestamp: string;
  }>>([]);

  const clientRef = useRef<GoogleGenAI | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Helper to convert base64 to ArrayBuffer
  const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  };

  // Play audio chunk (PCM16 format from Gemini)
  const playAudioChunk = useCallback(async (base64Data: string) => {
    try {
      if (!audioContextRef.current) {
        console.error('[Gemini Audio] No audio context available');
        return;
      }

      const audioContext = audioContextRef.current;
      const arrayBuffer = base64ToArrayBuffer(base64Data);

      // Convert PCM16 to Float32
      const int16Array = new Int16Array(arrayBuffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }

      // Create audio buffer (Gemini uses 24kHz)
      const audioBuffer = audioContext.createBuffer(1, float32Array.length, 24000);
      audioBuffer.getChannelData(0).set(float32Array);

      // Play immediately
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start();
      setIsPlaying(true);

      console.log('[Gemini Audio] 🎵 Playing chunk:', float32Array.length, 'samples');

    } catch (error) {
      console.error('[Gemini Audio] ❌ Play error:', error);
    }
  }, []);

  // Handle messages from Gemini
  const handleMessage = useCallback((message: LiveServerMessage) => {
    console.log('[Gemini] 📨 Message received:', Object.keys(message)[0]);

    // Setup complete
    if (message.setupComplete) {
      console.log('[Gemini] ✅ Setup complete!');
      setIsConnected(true);
      options.onConnected?.();
      return;
    }

    // Server content (AI response)
    if (message.serverContent) {
      const content = message.serverContent;

      // Turn complete
      if ('turnComplete' in content) {
        console.log('[Gemini] ✅ Turn complete');
        setIsPlaying(false);
      }

      // Model turn (AI output)
      if ('modelTurn' in content && content.modelTurn) {
        const parts = content.modelTurn.parts || [];

        for (const part of parts) {
          // Audio data
          if (part.inlineData?.mimeType === 'audio/pcm' && part.inlineData.data) {
            console.log('[Gemini Audio] 🎵 Received audio chunk');
            playAudioChunk(part.inlineData.data);
          }

          // Text transcript
          if (part.text && typeof part.text === 'string') {
            console.log('[Gemini Transcript] 🤖', part.text);
            setTranscript(prev => [...prev, {
              speaker: 'tutor',
              text: part.text as string,
              timestamp: new Date().toISOString()
            }]);
            options.onTranscript?.(part.text as string, false);
          }
        }
      }
    }
  }, [playAudioChunk, options]);

  // Start session using Google's SDK
  const startSession = useCallback(async (geminiApiKey: string, systemInstruction: string) => {
    try {
      console.log('[Gemini] 🚀 Starting session using @google/genai SDK...');
      console.log('[Gemini] 🔑 API Key:', geminiApiKey.substring(0, 10) + '...');

      // Initialize audio context
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      }

      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
        console.log('[Gemini] 🔊 Audio context resumed');
      }

      // Create GoogleGenAI client (Google's official SDK)
      console.log('[Gemini] 📦 Creating GoogleGenAI client...');
      const client = new GoogleGenAI({ apiKey: geminiApiKey });
      clientRef.current = client;

      // Configure the Live session
      const config: LiveConnectConfig = {
        systemInstruction: {
          parts: [{ text: systemInstruction }]
        },
        generationConfig: {
          responseModalities: ['audio'] as any,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } }
          }
        }
      };

      // Callbacks for the Live session
      const callbacks = {
        onopen: () => {
          console.log('[Gemini] ✅ WebSocket OPENED successfully!');
        },
        onmessage: handleMessage,
        onerror: (error: ErrorEvent) => {
          console.error('[Gemini] ❌ Error:', error);
          setIsConnected(false);
          options.onError?.(new Error(error.message || 'Connection error'));
        },
        onclose: (event: CloseEvent) => {
          console.log('[Gemini] 🔌 Connection closed:', {
            code: event.code,
            reason: event.reason || 'No reason provided'
          });
          setIsConnected(false);
          options.onDisconnected?.();
        }
      };

      // Connect to Gemini Live API (this handles WebSocket internally)
      console.log('[Gemini] 🌐 Connecting to Gemini Live API...');
      const session = await client.live.connect({
        model: 'models/gemini-2.0-flash-exp',
        config,
        callbacks
      });

      sessionRef.current = session;
      console.log('[Gemini] ✅ Session created successfully!');

    } catch (error: any) {
      console.error('[Gemini] ❌ Failed to start session:', error);
      setIsConnected(false);
      options.onError?.(error);
      throw error;
    }
  }, [handleMessage, options]);

  // Send audio to Gemini
  const sendAudio = useCallback((audioData: ArrayBuffer) => {
    if (!sessionRef.current || !isConnected) {
      console.warn('[Gemini] Cannot send audio: not connected');
      return;
    }

    try {
      // Convert ArrayBuffer to base64
      const bytes = new Uint8Array(audioData);
      const binaryString = Array.from(bytes)
        .map(byte => String.fromCharCode(byte))
        .join('');
      const base64 = btoa(binaryString);

      // Send to Gemini using SDK method
      sessionRef.current.sendRealtimeInput({
        media: {
          mimeType: 'audio/pcm',
          data: base64
        }
      });
    } catch (error) {
      console.error('[Gemini] ❌ Failed to send audio:', error);
    }
  }, [isConnected]);

  // Send text message to Gemini
  const sendTextMessage = useCallback((text: string) => {
    if (!sessionRef.current || !isConnected) {
      console.warn('[Gemini] Cannot send text: not connected');
      return;
    }

    try {
      console.log('[Gemini] 📤 Sending text:', text);
      sessionRef.current.sendClientContent({
        turns: [{ parts: [{ text }] }],
        turnComplete: true
      });
    } catch (error) {
      console.error('[Gemini] ❌ Failed to send text:', error);
    }
  }, [isConnected]);

  // End session
  const endSession = useCallback(() => {
    console.log('[Gemini] 🛑 Ending session');

    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch (error) {
        console.error('[Gemini] Error closing session:', error);
      }
      sessionRef.current = null;
    }

    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (error) {
        console.error('[Gemini] Error closing audio context:', error);
      }
      audioContextRef.current = null;
    }

    setIsConnected(false);
    setTranscript([]);
  }, []);

  return {
    isConnected,
    isPlaying,
    transcript,
    startSession,
    sendAudio,
    sendTextMessage,
    endSession
  };
}
