import { useEffect, useRef, useState, useCallback } from 'react';

interface GeminiVoiceCallbacks {
  onTranscript?: (text: string, isUser: boolean) => void;
  onError?: (error: Error) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

export function useGeminiVoice(callbacks: GeminiVoiceCallbacks = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const currentSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // ========================================
  // AUDIO CONTEXT INITIALIZATION
  // ========================================
  
  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      console.log('[Gemini Audio] 🎵 AudioContext initialized:', {
        sampleRate: audioContextRef.current.sampleRate,
        state: audioContextRef.current.state
      });
    }

    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().then(() => {
        console.log('[Gemini Audio] ▶️ AudioContext resumed');
      }).catch(err => {
        console.error('[Gemini Audio] ❌ Failed to resume:', err);
      });
    }

    return audioContextRef.current;
  }, []);

  // ========================================
  // PLAY AUDIO CHUNK WITH PROPER SCHEDULING
  // ========================================
  
  const playAudioChunk = useCallback(async (base64Audio: string): Promise<void> => {
    try {
      const audioContext = audioContextRef.current;
      if (!audioContext) {
        console.error('[Gemini Audio] ❌ AudioContext not initialized');
        return;
      }

      // Decode base64 to binary
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Convert PCM16 to Float32 (Web Audio API format)
      const int16Array = new Int16Array(bytes.buffer);
      const float32Array = new Float32Array(int16Array.length);
      
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0; // Normalize to -1.0 to 1.0
      }

      // Create AudioBuffer
      const audioBuffer = audioContext.createBuffer(
        1, // mono
        float32Array.length,
        24000 // 24kHz sample rate
      );
      
      audioBuffer.getChannelData(0).set(float32Array);

      // Schedule playback with proper timing to avoid gaps
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);

      const currentTime = audioContext.currentTime;
      const startTime = Math.max(currentTime, nextStartTimeRef.current);
      
      source.start(startTime);
      nextStartTimeRef.current = startTime + audioBuffer.duration;

      // Track active sources for cleanup
      currentSourcesRef.current.push(source);

      console.log('[Gemini Audio] 🔊 Playing chunk:', {
        duration: audioBuffer.duration.toFixed(3) + 's',
        startTime: startTime.toFixed(3) + 's'
      });

      source.onended = () => {
        // Remove from active sources
        const index = currentSourcesRef.current.indexOf(source);
        if (index > -1) {
          currentSourcesRef.current.splice(index, 1);
        }
        console.log('[Gemini Audio] ✅ Chunk playback complete');
      };

    } catch (error) {
      console.error('[Gemini Audio] ❌ Playback error:', error);
      callbacks.onError?.(error as Error);
    }
  }, [callbacks]);

  // ========================================
  // HANDLE GEMINI MESSAGES
  // ========================================
  
  const handleGeminiMessage = useCallback((event: MessageEvent): void => {
    try {
      const message = JSON.parse(event.data);
      
      // Setup complete
      if (message.setupComplete) {
        console.log('[Gemini] 🎉 Setup complete, session ready');
        
        // Send initial greeting request immediately
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const greetingMessage = {
            clientContent: {
              turns: [{
                role: 'user',
                parts: [{ text: 'Greet the student warmly by name and ask what they would like to learn today.' }]
              }],
              turnComplete: true
            }
          };
          
          wsRef.current.send(JSON.stringify(greetingMessage));
          console.log('[Gemini] 👋 Requesting initial greeting from tutor');
          callbacks.onTranscript?.('(System: Requesting greeting)', true);
        }
      }

      // Server content (AI response)
      if (message.serverContent) {
        const content = message.serverContent;

        // Turn started
        if (content.turnComplete === false) {
          console.log('[Gemini] 🤖 AI turn started');
          setIsProcessing(true);
        }

        // Turn complete
        if (content.turnComplete === true) {
          console.log('[Gemini] ✅ AI turn complete');
          setIsProcessing(false);
        }

        // Model turn (AI output)
        if (content.modelTurn) {
          const parts = content.modelTurn.parts || [];

          for (const part of parts) {
            // Audio data
            if (part.inlineData?.mimeType === 'audio/pcm') {
              const audioData = part.inlineData.data;
              if (audioData) {
                console.log('[Gemini Audio] 🎵 Received audio chunk, size:', audioData.length);
                playAudioChunk(audioData);
              }
            }

            // Text transcript
            if (part.text) {
              console.log('[Gemini Transcript] 🤖 AI:', part.text);
              callbacks.onTranscript?.(part.text, false);
            }
          }
        }

        // User turn (transcript of user's speech)
        if (content.userTurn) {
          const parts = content.userTurn.parts || [];
          
          for (const part of parts) {
            if (part.text) {
              console.log('[Gemini Transcript] 👤 User:', part.text);
              callbacks.onTranscript?.(part.text, true);
            }
          }
        }
      }

    } catch (error) {
      console.error('[Gemini] ❌ Message parse error:', error);
      callbacks.onError?.(error as Error);
    }
  }, [callbacks, playAudioChunk]);

  // ========================================
  // START GEMINI SESSION
  // ========================================
  
  const startSession = useCallback(async (
    geminiApiKey: string,
    systemInstruction: string,
    dbSessionId: string
  ): Promise<void> => {
    try {
      console.log('[Gemini] 🚀 Starting session...');
      setSessionId(dbSessionId);

      // Initialize audio context (requires user gesture)
      const audioContext = initAudioContext();
      await audioContext.resume();

      // Reset audio scheduling
      nextStartTimeRef.current = 0;
      currentSourcesRef.current = [];

      // Connect to Gemini Live API
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${geminiApiKey}`;
      
      console.log('[Gemini] 🔌 Connecting to WebSocket...');
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.addEventListener('open', () => {
        console.log('[Gemini] ✅ WebSocket connected');
        setIsConnected(true);
        callbacks.onConnected?.();

        // Send setup message
        const setupMessage = {
          setup: {
            model: 'models/gemini-2.0-flash-live',
            generation_config: {
              temperature: 0.8,
              max_output_tokens: 1000,
              response_modalities: ['AUDIO']  // Request audio output
            },
            system_instruction: {
              parts: [{ text: systemInstruction }]
            }
          }
        };

        ws.send(JSON.stringify(setupMessage));
        console.log('[Gemini] 📤 Setup message sent');
      });

      ws.addEventListener('message', handleGeminiMessage);

      ws.addEventListener('error', (error) => {
        console.error('[Gemini] ❌ WebSocket error:', error);
        const err = new Error('Gemini WebSocket error');
        callbacks.onError?.(err);
      });

      ws.addEventListener('close', (event) => {
        console.log('[Gemini] 🔌 Disconnected:', {
          code: event.code,
          reason: event.reason
        });
        setIsConnected(false);
        callbacks.onDisconnected?.();
      });

    } catch (error) {
      console.error('[Gemini] ❌ Failed to start session:', error);
      throw error;
    }
  }, [initAudioContext, handleGeminiMessage, callbacks]);

  // ========================================
  // SEND AUDIO TO GEMINI
  // ========================================
  
  const sendAudio = useCallback((audioData: ArrayBuffer): void => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('[Gemini] ⚠️ WebSocket not ready, cannot send audio');
      return;
    }

    try {
      // Convert ArrayBuffer to base64
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
      console.log('[Gemini Audio] 📤 Sent user audio:', audioData.byteLength, 'bytes');

    } catch (error) {
      console.error('[Gemini Audio] ❌ Failed to send audio:', error);
      callbacks.onError?.(error as Error);
    }
  }, [callbacks]);

  // ========================================
  // SEND TEXT MESSAGE TO GEMINI
  // ========================================
  
  const sendTextMessage = useCallback((text: string): void => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('[Gemini] ⚠️ WebSocket not ready, cannot send text');
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
      console.log('[Gemini] 📤 Sent text message');
      callbacks.onTranscript?.(text, true);

    } catch (error) {
      console.error('[Gemini] ❌ Failed to send text:', error);
      callbacks.onError?.(error as Error);
    }
  }, [callbacks]);

  // ========================================
  // SEND DOCUMENT TO GEMINI (KILLER FEATURE!)
  // ========================================
  
  const sendDocument = useCallback(async (file: File): Promise<void> => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('[Gemini] ⚠️ WebSocket not ready, cannot send document');
      throw new Error('Not connected to Gemini');
    }

    try {
      console.log('[Gemini Document] 📄 Processing:', file.name, file.type);

      // Read file as base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = () => {
          const result = reader.result as string;
          const base64Data = result.split(',')[1]; // Remove data:... prefix
          resolve(base64Data);
        };
        
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Send to Gemini with context
      const message = {
        clientContent: {
          turns: [{
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: file.type,
                  data: base64
                }
              },
              {
                text: `I've uploaded a document: "${file.name}". Please review it and help me understand it. Be ready to answer questions about the content.`
              }
            ]
          }],
          turnComplete: true
        }
      };

      wsRef.current.send(JSON.stringify(message));
      console.log('[Gemini Document] ✅ Sent:', file.name);

    } catch (error) {
      console.error('[Gemini Document] ❌ Failed to send:', error);
      callbacks.onError?.(error as Error);
      throw error;
    }
  }, [callbacks]);

  // ========================================
  // END SESSION & CLEANUP
  // ========================================
  
  const endSession = useCallback(() => {
    console.log('[Gemini] 🛑 Ending session...');

    // Stop all active audio sources
    currentSourcesRef.current.forEach(source => {
      try {
        source.stop();
      } catch (e) {
        // Source may already be stopped
      }
    });
    currentSourcesRef.current = [];

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Reset state
    setIsConnected(false);
    setIsProcessing(false);
    setSessionId(null);
    nextStartTimeRef.current = 0;

    console.log('[Gemini] ✅ Session ended');
  }, []);

  // ========================================
  // CLEANUP ON UNMOUNT
  // ========================================
  
  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      currentSourcesRef.current.forEach(source => {
        try {
          source.stop();
        } catch (e) {
          // Ignore
        }
      });
    };
  }, []);

  return {
    startSession,
    endSession,
    sendAudio,
    sendTextMessage,
    sendDocument, // KILLER FEATURE: Upload docs during voice session!
    isConnected,
    isProcessing,
    sessionId
  };
}
