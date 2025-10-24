import { useRef, useState, useEffect, useCallback } from 'react';

interface AudioQueueItem {
  buffer: AudioBuffer;
  timestamp: number;
}

export function useGeminiVoice() {
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioQueueItem[]>([]);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [transcript, setTranscript] = useState<Array<{
    speaker: 'tutor' | 'student';
    text: string;
    timestamp: string;
  }>>([]);

  const playAudioChunk = useCallback(async (base64Audio: string) => {
    try {
      const audioContext = audioContextRef.current;
      if (!audioContext) {
        console.warn('[Gemini Audio] No audio context');
        return;
      }

      // Decode base64
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Convert PCM16 to Float32
      const int16Array = new Int16Array(bytes.buffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }

      // Create audio buffer
      const audioBuffer = audioContext.createBuffer(1, float32Array.length, 24000);
      audioBuffer.getChannelData(0).set(float32Array);

      // Play immediately
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      
      // Track when playback ends
      source.onended = () => {
        console.log('[Gemini Audio] 🔊 Chunk finished');
        currentSourceRef.current = null;
      };

      currentSourceRef.current = source;
      source.start();
      setIsPlaying(true);

      console.log('[Gemini Audio] 🔊 Playing chunk:', float32Array.length, 'samples');

    } catch (error) {
      console.error('[Gemini Audio] ❌ Play error:', error);
    }
  }, []);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message = JSON.parse(event.data);
      
      console.log('[Gemini] Message type:', message.setupComplete ? 'setupComplete' : message.serverContent ? 'serverContent' : 'unknown');

      // Setup complete
      if (message.setupComplete) {
        console.log('[Gemini] 🎉 Setup complete');
        
        // Send initial greeting request
        setTimeout(() => {
          sendTextMessage('Greet the student warmly and ask what they would like to learn today.');
        }, 500);
      }

      // Server content (AI response)
      if (message.serverContent) {
        const content = message.serverContent;
        
        // Turn complete
        if (content.turnComplete) {
          console.log('[Gemini] ✅ Turn complete');
          setIsPlaying(false);
        }

        // Model turn (AI output)
        if (content.modelTurn) {
          const parts = content.modelTurn.parts || [];
          
          for (const part of parts) {
            // Audio data
            if (part.inlineData?.mimeType === 'audio/pcm' && part.inlineData.data) {
              console.log('[Gemini Audio] 🎵 Received audio chunk');
              playAudioChunk(part.inlineData.data);
            }
            
            // Text transcript
            if (part.text) {
              console.log('[Gemini Transcript]', part.text);
              setTranscript(prev => [...prev, {
                speaker: 'tutor',
                text: part.text,
                timestamp: new Date().toISOString()
              }]);
            }
          }
        }
      }

    } catch (error) {
      console.error('[Gemini] Parse error:', error);
    }
  }, [playAudioChunk]);

  const startSession = useCallback(async (geminiApiKey: string, systemInstruction: string) => {
    try {
      console.log('[Gemini] Starting session...');
      
      // Initialize audio context
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      }
      
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      // Connect to Gemini Live API
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService/BidiGenerateContent?key=${geminiApiKey}`;
      
      console.log('[Gemini] Connecting to WebSocket...');
      const ws = new WebSocket(wsUrl);
      
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[Gemini] ✅ Connected');
        setIsConnected(true);

        // Send setup message
        const setupMessage = {
          setup: {
            model: 'models/gemini-2.0-flash-exp',
            generation_config: {
              temperature: 0.8,
              max_output_tokens: 1000,
              response_modalities: ['AUDIO']
            },
            system_instruction: {
              parts: [{ text: systemInstruction }]
            }
          }
        };

        console.log('[Gemini] Sending setup message...');
        ws.send(JSON.stringify(setupMessage));
      };

      ws.onmessage = handleMessage;

      ws.onerror = (error) => {
        console.error('[Gemini] ❌ WebSocket error:', error);
        setIsConnected(false);
      };

      ws.onclose = (event) => {
        console.log('[Gemini] 🔌 Disconnected:', event.code, event.reason);
        setIsConnected(false);
        setIsPlaying(false);
      };

    } catch (error) {
      console.error('[Gemini] Failed to start:', error);
      throw error;
    }
  }, [handleMessage]);

  const sendAudio = useCallback((audioData: ArrayBuffer) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('[Gemini] ⚠️ Cannot send audio: not connected');
      return;
    }

    try {
      // Convert to base64
      const bytes = new Uint8Array(audioData);
      const base64 = btoa(String.fromCharCode(...Array.from(bytes)));

      const message = {
        clientContent: {
          turns: [{
            role: 'user',
            parts: [{
              inlineData: {
                mimeType: 'audio/pcm',
                data: base64
              }
            }]
          }],
          turnComplete: true
        }
      };

      wsRef.current.send(JSON.stringify(message));
      console.log('[Gemini Audio] 📤 Sent', audioData.byteLength, 'bytes');
    } catch (error) {
      console.error('[Gemini] Error sending audio:', error);
    }
  }, []);

  const sendTextMessage = useCallback((text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('[Gemini] ⚠️ Cannot send text: not connected');
      return;
    }

    try {
      const message = {
        clientContent: {
          turns: [{
            role: 'user',
            parts: [{ text }]
          }],
          turnComplete: true
        }
      };

      wsRef.current.send(JSON.stringify(message));
      console.log('[Gemini] 📤 Sent text:', text.substring(0, 50) + '...');
      
      // Add to transcript
      setTranscript(prev => [...prev, {
        speaker: 'student',
        text: text,
        timestamp: new Date().toISOString()
      }]);
    } catch (error) {
      console.error('[Gemini] Error sending text:', error);
    }
  }, []);

  const endSession = useCallback(() => {
    console.log('[Gemini] 🛑 Ending session');
    
    // Stop current audio
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch (e) {
        // Ignore if already stopped
      }
      currentSourceRef.current = null;
    }
    
    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setIsConnected(false);
    setIsPlaying(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (currentSourceRef.current) {
        try {
          currentSourceRef.current.stop();
        } catch (e) {
          // Ignore
        }
      }
    };
  }, []);

  return {
    startSession,
    endSession,
    sendAudio,
    sendTextMessage,
    isConnected,
    isPlaying,
    transcript
  };
}
