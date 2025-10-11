import { useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

interface RealtimeMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface UseRealtimeVoiceOptions {
  sessionId?: string;
  wsUrl?: string;
  token?: string;
  language?: string;
  voice?: string;
  onTranscript?: (message: RealtimeMessage) => void;
  onError?: (error: string) => void;
}

interface UseRealtimeVoiceReturn {
  isConnected: boolean;
  status: 'connecting' | 'active' | 'ended' | 'error' | 'idle';
  messages: RealtimeMessage[];
  connect: () => void;
  disconnect: () => void;
  sendAudio: (audioData: ArrayBuffer) => void;
}

export function useRealtimeVoice(options: UseRealtimeVoiceOptions): UseRealtimeVoiceReturn {
  const { sessionId, wsUrl, token, language, voice, onTranscript, onError } = options;
  const { toast } = useToast();
  
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState<'connecting' | 'active' | 'ended' | 'error' | 'idle'>('idle');
  const [messages, setMessages] = useState<RealtimeMessage[]>([]);
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<Int16Array[]>([]);
  const isPlayingRef = useRef(false);

  const addMessage = useCallback((message: RealtimeMessage) => {
    setMessages(prev => [...prev, message]);
    onTranscript?.(message);
  }, [onTranscript]);

  const playAudioQueue = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0 || !audioContextRef.current) {
      return;
    }

    isPlayingRef.current = true;

    while (audioQueueRef.current.length > 0) {
      const pcm16 = audioQueueRef.current.shift()!;
      const audioBuffer = audioContextRef.current.createBuffer(1, pcm16.length, 24000);
      const channelData = audioBuffer.getChannelData(0);

      // Convert Int16 PCM to Float32 for Web Audio API
      for (let i = 0; i < pcm16.length; i++) {
        channelData[i] = pcm16[i] / 32768.0;
      }

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      
      await new Promise<void>(resolve => {
        source.onended = () => resolve();
        source.start();
      });
    }

    isPlayingRef.current = false;
  }, []);

  const connect = useCallback(() => {
    if (!wsUrl || !token) {
      console.error('[RealtimeVoice] Missing wsUrl or token');
      onError?.('Missing connection parameters');
      return;
    }

    try {
      console.log('[RealtimeVoice] Connecting to:', wsUrl);
      setStatus('connecting');
      
      // Initialize audio context for playback
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      }
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[RealtimeVoice] WebSocket connected');
        setIsConnected(true);
        setStatus('active');
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('[RealtimeVoice] Received message:', message.type);

          // Handle different message types
          switch (message.type) {
            case 'session.ready':
              console.log('[RealtimeVoice] Session ready');
              break;

            case 'conversation.item.created':
              if (message.item?.type === 'message') {
                const transcript = message.item.content?.[0]?.transcript;
                if (transcript) {
                  addMessage({
                    role: message.item.role,
                    content: transcript,
                    timestamp: new Date(),
                  });
                }
              }
              break;

            case 'response.audio_transcript.delta':
              // Handle streaming transcript deltas
              if (message.delta) {
                // For now, we'll collect these - could show live streaming text
                console.log('[RealtimeVoice] Transcript delta:', message.delta);
              }
              break;

            case 'response.audio_transcript.done':
              // Final transcript from assistant
              if (message.transcript) {
                addMessage({
                  role: 'assistant',
                  content: message.transcript,
                  timestamp: new Date(),
                });
              }
              break;

            case 'conversation.item.input_audio_transcription.completed':
              // User's speech transcribed
              if (message.transcript) {
                addMessage({
                  role: 'user',
                  content: message.transcript,
                  timestamp: new Date(),
                });
              }
              break;

            case 'error':
              console.error('[RealtimeVoice] Error from server:', message.error);
              setStatus('error');
              onError?.(message.error?.message || 'Unknown error');
              toast({
                title: "Voice Error",
                description: message.error?.message || 'Connection error',
                variant: "destructive",
              });
              break;

            case 'response.audio.delta':
              // Decode base64 audio and queue for playback
              if (message.delta) {
                try {
                  const audioData = atob(message.delta);
                  const pcm16 = new Int16Array(audioData.length / 2);
                  for (let i = 0; i < pcm16.length; i++) {
                    const byte1 = audioData.charCodeAt(i * 2);
                    const byte2 = audioData.charCodeAt(i * 2 + 1);
                    let sample = byte1 | (byte2 << 8);
                    // Convert unsigned to signed Int16
                    if (sample >= 0x8000) {
                      sample -= 0x10000;
                    }
                    pcm16[i] = sample;
                  }
                  audioQueueRef.current.push(pcm16);
                  playAudioQueue();
                } catch (error) {
                  console.error('[RealtimeVoice] Audio decode error:', error);
                }
              }
              break;
          }
        } catch (error) {
          console.error('[RealtimeVoice] Error parsing message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('[RealtimeVoice] WebSocket error:', error);
        setStatus('error');
        onError?.('Connection error');
        toast({
          title: "Connection Error",
          description: "Failed to connect to voice service",
          variant: "destructive",
        });
      };

      ws.onclose = () => {
        console.log('[RealtimeVoice] WebSocket closed');
        setIsConnected(false);
        setStatus(prev => prev === 'error' ? 'error' : 'ended');
      };

    } catch (error) {
      console.error('[RealtimeVoice] Connection error:', error);
      setStatus('error');
      onError?.('Failed to initialize connection');
    }
  }, [wsUrl, token, addMessage, onError, toast]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    setStatus('ended');
  }, []);

  const sendAudio = useCallback((audioData: ArrayBuffer) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(audioData);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    status,
    messages,
    connect,
    disconnect,
    sendAudio,
  };
}
