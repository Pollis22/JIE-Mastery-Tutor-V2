import { useCallback, useRef, useState } from 'react';

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

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const playNextInQueueRef = useRef<() => Promise<void>>();

  // Helper to convert base64 to ArrayBuffer
  const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  };

  // Play audio queue sequentially (no dependencies to avoid loops)
  const playNextInQueue = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) {
      return;
    }

    const audioContext = audioContextRef.current;
    if (!audioContext) {
      console.error('[Gemini Audio] ❌ No audio context!');
      return;
    }

    // CRITICAL: Ensure AudioContext is running
    if (audioContext.state === 'suspended') {
      console.log('[Gemini Audio] 🔊 Resuming suspended AudioContext...');
      try {
        await audioContext.resume();
      } catch (err) {
        console.error('[Gemini Audio] Failed to resume:', err);
        return;
      }
    }

    isPlayingRef.current = true;
    setIsPlaying(true);

    const audioBuffer = audioQueueRef.current.shift()!;

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    
    source.onended = () => {
      console.log('[Gemini Audio] ✅ Chunk finished');
      isPlayingRef.current = false;
      setIsPlaying(false);
      
      // Use setTimeout to avoid stack overflow
      setTimeout(() => {
        playNextInQueueRef.current?.();
      }, 0);
    };

    console.log('[Gemini Audio] 🔊 STARTING PLAYBACK - Duration:', audioBuffer.duration.toFixed(2), 's, State:', audioContext.state);
    source.start(0);
  }, []);

  // Store reference to playNextInQueue
  playNextInQueueRef.current = playNextInQueue;

  // Add audio chunk to queue (no dependencies to avoid loops)
  const queueAudioChunk = useCallback(async (base64Data: string) => {
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

      // AGGRESSIVE QUEUE MANAGEMENT: Cap queue at 3 chunks max to prevent buffering delay
      const MAX_QUEUE_SIZE = 3; // CRITICAL: Never buffer more than 3 chunks (0.6s max)
      
      if (audioQueueRef.current.length >= MAX_QUEUE_SIZE) {
        // Drop oldest chunk to prevent buffering delay
        const dropped = audioQueueRef.current.shift();
        console.log('⚠️ [Gemini Audio] Queue full, dropping old chunk to prevent lag');
      }
      
      // Add to queue
      audioQueueRef.current.push(audioBuffer);
      console.log('[Gemini Audio] 📦 Queued chunk:', float32Array.length, 'samples, queue length:', audioQueueRef.current.length);

      // Start playing immediately with minimal buffering
      const AUDIO_BUFFER_THRESHOLD = 2; // Start at 2 chunks
      if (!isPlayingRef.current && audioQueueRef.current.length >= AUDIO_BUFFER_THRESHOLD) {
        console.log('[Gemini Audio] 🚀 Starting playback with minimal buffer');
        setTimeout(() => playNextInQueueRef.current?.(), 0);
      }

    } catch (error) {
      console.error('[Gemini Audio] ❌ Queue error:', error);
    }
  }, []);

  // Handle messages from proxy (using refs to avoid dependency loops)
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message = JSON.parse(event.data);
      console.log('[Gemini WS] 📨 Message type:', message.type || Object.keys(message)[0]);

      // Setup complete
      if (message.setupComplete) {
        console.log('[Gemini] ✅ Setup complete!');
        setIsConnected(true);
        options.onConnected?.();
        
        // CRITICAL: Send initial message to trigger Gemini's greeting
        // Gemini does NOT speak first automatically - we must prompt it
        console.log('[Gemini] 📤 Sending initial greeting prompt to trigger AI response...');
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            clientContent: {
              turns: [{
                role: "user",
                parts: [{ text: "Hello" }]
              }],
              turnComplete: true
            }
          }));
        }
        return;
      }

      // Server content (AI response)
      if (message.serverContent) {
        const content = message.serverContent;

        // Turn complete
        if (content.turnComplete) {
          console.log('[Gemini] ✅ Turn complete');
        }

        // Model turn (AI output)
        if (content.modelTurn?.parts) {
          for (const part of content.modelTurn.parts) {
            // DEBUG: Log what we're receiving
            console.log('[Gemini] 📦 Part received:', {
              hasInlineData: !!part.inlineData,
              mimeType: part.inlineData?.mimeType,
              hasData: !!part.inlineData?.data,
              hasText: !!part.text
            });
            
            // Audio data - check for ANY audio/* MIME type
            if (part.inlineData?.mimeType?.startsWith('audio/') && part.inlineData.data) {
              console.log('[Gemini Audio] 🎵 Received audio chunk, MIME:', part.inlineData.mimeType);
              queueAudioChunk(part.inlineData.data);
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
        
        // Check for text in other locations (Gemini might send it differently)
        const allText = content.modelTurn?.parts
          ?.map((p: any) => p.text)
          ?.filter((t: any) => t)
          ?.join(' ') || '';
        
        if (allText && !content.modelTurn?.parts?.some((p: any) => p.text)) {
          console.log('[Gemini Transcript] 📝 Found text in serverContent:', allText);
          setTranscript(prev => [...prev, {
            speaker: 'tutor',
            text: allText,
            timestamp: new Date().toISOString()
          }]);
          options.onTranscript?.(allText, false);
        }
      }

      // Error from server
      if (message.error) {
        console.error('[Gemini] ❌ Server error:', message.error);
        options.onError?.(new Error(message.error.message || 'Server error'));
      }

    } catch (error) {
      console.error('[Gemini WS] ❌ Message parse error:', error);
      console.error('[Gemini WS] 📦 Raw event data:', event.data);
    }
  }, [options, queueAudioChunk]);

  // Start session using WebSocket proxy
  const startSession = useCallback(async (geminiApiKey: string, systemInstruction: string) => {
    try {
      console.log('[Gemini] 🚀 Starting session via WebSocket PROXY...');
      console.log('[Gemini] 🔑 API Key:', geminiApiKey.substring(0, 10) + '...');

      // Initialize audio context (MUST do this on user interaction!)
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 24000 });
        console.log('[Gemini] 🔊 AudioContext created, state:', audioContextRef.current.state);
      }

      // CRITICAL: Resume AudioContext (browsers block audio without user gesture)
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
        console.log('[Gemini] 🔊 AudioContext RESUMED from suspended state');
      }
      
      console.log('[Gemini] 🔊 AudioContext ready, state:', audioContextRef.current.state);

      // Connect to our WebSocket proxy (not directly to Gemini!)
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/api/gemini-ws`;
      
      console.log('[Gemini] 🌐 Connecting to proxy:', wsUrl);

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[Gemini WS] ✅ WebSocket OPENED to proxy!');
        
        // LATENCY FIX: Optimized config for faster, shorter responses
        const initMessage = {
          type: 'init',
          apiKey: geminiApiKey,
          model: 'models/gemini-2.0-flash-exp',
          config: {
            systemInstruction: {
              parts: [{ 
                text: systemInstruction + '\n\nIMPORTANT: Keep responses CONCISE (2-3 sentences max) unless specifically asked for detailed explanations. Respond quickly and naturally, like a real conversation.'
              }]
            },
            generationConfig: {
              responseModalities: ['AUDIO'],  // LATENCY FIX: Audio only (uppercase as per API)
              maxOutputTokens: 100,  // REDUCED: Even shorter responses for faster interaction
              temperature: 0.7,
              candidateCount: 1,
              speechConfig: {
                voiceConfig: { 
                  prebuiltVoiceConfig: { voiceName: 'Aoede' },
                  preemptibleSpeech: true  // Allow interruption
                }
              }
            }
          }
        };
        
        console.log('[Gemini WS] 📤 Sending init message...');
        ws.send(JSON.stringify(initMessage));
      };

      ws.onmessage = handleMessage;

      ws.onerror = (error) => {
        console.error('[Gemini WS] ❌ WebSocket error:', error);
        setIsConnected(false);
        options.onError?.(new Error('WebSocket connection error'));
      };

      ws.onclose = (event) => {
        console.log('[Gemini WS] 🔌 Connection closed:', {
          code: event.code,
          reason: event.reason || 'No reason provided'
        });
        setIsConnected(false);
        options.onDisconnected?.();
      };

    } catch (error: any) {
      console.error('[Gemini] ❌ Failed to start session:', error);
      setIsConnected(false);
      options.onError?.(error);
      throw error;
    }
  }, [handleMessage, options]);

  // Send audio to Gemini via proxy
  const sendAudio = useCallback((audioData: ArrayBuffer) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.log('[Gemini] ⚠️ Cannot send audio - WebSocket not open');
      return;
    }

    try {
      // Convert ArrayBuffer to base64
      const bytes = new Uint8Array(audioData);
      const binaryString = Array.from(bytes)
        .map(byte => String.fromCharCode(byte))
        .join('');
      const base64 = btoa(binaryString);

      // Log audio being sent
      console.log('[Gemini] 🎤 Sending microphone audio, size:', audioData.byteLength);

      // Send to proxy
      wsRef.current.send(JSON.stringify({
        type: 'audio',
        data: base64
      }));
    } catch (error) {
      console.error('[Gemini] ❌ Failed to send audio:', error);
    }
  }, []);

  // Send text message to Gemini via proxy
  const sendTextMessage = useCallback((text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('[Gemini] Cannot send text: not connected');
      return;
    }

    try {
      console.log('[Gemini] 📤 Sending text:', text);
      wsRef.current.send(JSON.stringify({
        type: 'text',
        text
      }));
    } catch (error) {
      console.error('[Gemini] ❌ Failed to send text:', error);
    }
  }, []);

  // Stop audio playback (for interruption)
  const stopPlayback = useCallback(() => {
    // Clear the audio queue
    audioQueueRef.current = [];
    
    // Reset playing state
    isPlayingRef.current = false;
    setIsPlaying(false);
    
    console.log('[Gemini Audio] 🛑 Playback stopped and queue cleared');
  }, []);

  // End session
  const endSession = useCallback(() => {
    console.log('[Gemini] 🛑 Ending session');

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (error) {
        console.error('[Gemini] Error closing WebSocket:', error);
      }
      wsRef.current = null;
    }

    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (error) {
        console.error('[Gemini] Error closing audio context:', error);
      }
      audioContextRef.current = null;
    }

    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setIsConnected(false);
    setIsPlaying(false);
    setTranscript([]);
  }, []);

  return {
    isConnected,
    isPlaying,
    transcript,
    startSession,
    sendAudio,
    sendTextMessage,
    stopPlayback,
    endSession
  };
}
