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
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);

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

  // Helper to ensure remote audio element exists
  const ensureRemoteAudioElement = useCallback((): HTMLAudioElement => {
    let el = document.getElementById("realtime-audio") as HTMLAudioElement | null;
    if (!el) {
      el = document.createElement("audio");
      el.id = "realtime-audio";
      el.autoplay = true;
      el.setAttribute('playsinline', 'true');
      document.body.appendChild(el);
    }
    return el;
  }, []);

  // Connect to OpenAI Realtime via WebRTC
  const connectToOpenAIWebRTC = useCallback(async ({
    clientSecret,
    model = "gpt-4o-realtime-preview",
  }: { clientSecret: string; model?: string }) => {
    if (!clientSecret) throw new Error("Missing clientSecret for WebRTC");

    console.log("🔵 Starting WebRTC connection...");

    // 1) Create peer connection
    const pc = new RTCPeerConnection();
    pcRef.current = pc;

    // Log connection states
    pc.onconnectionstatechange = () => {
      console.log("pc.state", pc.connectionState);
      if (pc.connectionState === 'connected') {
        setIsConnected(true);
        setStatus('active');
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setIsConnected(false);
        setStatus('error');
      }
    };
    pc.oniceconnectionstatechange = () => console.log("pc.ice", pc.iceConnectionState);

    // 2) Remote audio sink (must be created after user gesture)
    const audioEl = ensureRemoteAudioElement();
    pc.ontrack = (e) => {
      console.log("🎵 Received audio track");
      if (audioEl.srcObject !== e.streams[0]) {
        audioEl.srcObject = e.streams[0];
      }
    };

    // 3) Data channel for events/logs (optional but useful)
    const dc = pc.createDataChannel("oai-events");
    dataChannelRef.current = dc;
    dc.onopen = () => console.log("✅ DataChannel open");
    dc.onmessage = (ev) => {
      try {
        const message = JSON.parse(ev.data);
        console.log("DC message:", message.type);
        
        // Handle transcript messages from data channel
        if (message.type === 'response.audio_transcript.done' && message.transcript) {
          addMessage({
            role: 'assistant',
            content: message.transcript,
            timestamp: new Date(),
          });
        } else if (message.type === 'conversation.item.input_audio_transcription.completed' && message.transcript) {
          addMessage({
            role: 'user',
            content: message.transcript,
            timestamp: new Date(),
          });
        }
      } catch (error) {
        console.log("DC message (non-JSON):", ev.data);
      }
    };

    // 4) Add local mic track (Opus over WebRTC)
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getAudioTracks().forEach((t) => pc.addTrack(t, stream));

    // 5) Create and set local offer
    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: false,
    });
    await pc.setLocalDescription(offer);

    // 6) Send SDP offer to OpenAI
    const base = "https://api.openai.com/v1/realtime";
    const sdpResp = await fetch(`${base}?model=${encodeURIComponent(model)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${clientSecret}`,
        "Content-Type": "application/sdp",
        "OpenAI-Beta": "realtime=v1",
      },
      body: offer.sdp,
    });

    if (!sdpResp.ok) {
      const text = await sdpResp.text().catch(() => "");
      console.error(`❌ SDP exchange failed: ${sdpResp.status}`, text);
      throw new Error(`Realtime SDP exchange failed: ${sdpResp.status} ${text}`);
    }

    // 7) Apply remote answer
    const answerSdp = await sdpResp.text();
    await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

    console.log("✅ WebRTC connected; remote description set");
    return pc;
  }, [ensureRemoteAudioElement, addMessage]);

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

      ws.onmessage = async (event) => {
        try {
          // Check if the message is binary audio data or JSON
          if (event.data instanceof Blob) {
            // Binary audio data from OpenAI
            const arrayBuffer = await event.data.arrayBuffer();
            const pcm16 = new Int16Array(arrayBuffer);
            audioQueueRef.current.push(pcm16);
            playAudioQueue();
            return;
          }

          // JSON message
          const message = JSON.parse(event.data);
          console.log('[RealtimeVoice] Received message:', message.type);

          // Handle different message types
          switch (message.type) {
            case 'webrtc.credentials': {
              console.log('🔑 Received webrtc.credentials');
              const { client_secret, model } = message;
              
              try {
                await connectToOpenAIWebRTC({ 
                  clientSecret: client_secret?.value, 
                  model: model || "gpt-4o-realtime-preview" 
                });
                
                // After WebRTC connection, send hello probe via existing socket
                if (ws) {
                  ws.send(JSON.stringify({
                    type: "response.create",
                    response: { 
                      modalities: ["audio"], 
                      instructions: "Say 'hello' clearly once.", 
                      voice: voice || "alloy" 
                    }
                  }));
                }
              } catch (error) {
                console.error("❌ WebRTC connection failed:", error);
                setStatus('error');
                onError?.('Failed to setup WebRTC connection');
              }
              break;
            }

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
  }, [wsUrl, token, addMessage, onError, toast, connectToOpenAIWebRTC, voice]);

  const disconnect = useCallback(() => {
    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    // Close WebRTC connection
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    
    setIsConnected(false);
    setStatus('ended');
  }, []);

  const sendAudio = useCallback((audioData: ArrayBuffer) => {
    // For WebRTC, audio is sent automatically via the media track
    // Only send via WebSocket if that's the active connection
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
