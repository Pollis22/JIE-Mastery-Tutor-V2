import { useState, useRef, useCallback, useEffect } from 'react';

export interface RealtimeMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export function useRealtimeVoice() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<RealtimeMessage[]>([]);
  
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const connect = useCallback(async (config: {
    model?: string;
    voice?: string;
    userId?: string;
    studentId?: string;
    subject?: string;
    language?: string;
    ageGroup?: string;
    contextDocumentIds?: string[];
  }) => {
    try {
      setIsConnecting(true);
      setError(null);
      console.log('🔵 [RealtimeVoice] Starting connection...');

      // Step 1: Get credentials via HTTP (working!)
      console.log('🔑 [RealtimeVoice] Requesting credentials...');
      const response = await fetch('/api/session/realtime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.model || 'gpt-4o-realtime-preview-2024-10-01',
          voice: config.voice || 'alloy',
          userId: config.userId,
          studentId: config.studentId,
          subject: config.subject,
          language: config.language || 'en',
          ageGroup: config.ageGroup,
          contextDocumentIds: config.contextDocumentIds || [],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`HTTP ${response.status}: ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      console.log('✅ [RealtimeVoice] Got credentials:', {
        sessionId: data.sessionId,
        hasSecret: !!data.client_secret?.value
      });

      if (!data.client_secret?.value) {
        throw new Error('No client_secret in response');
      }

      // Store sessionId for transcript persistence
      sessionIdRef.current = data.sessionId;

      // Step 2: Establish WebRTC to OpenAI
      await connectWebRTC(data.client_secret.value, data.model);

      console.log('✅ [RealtimeVoice] Connected successfully!');
      setIsConnected(true);

    } catch (err: any) {
      console.error('❌ [RealtimeVoice] Connection failed:', err);
      setError(err.message);
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  // Helper function to save transcript messages
  const saveTranscriptMessage = async (sessionId: string, message: RealtimeMessage) => {
    try {
      await fetch('/api/session/realtime/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: {
            role: message.role,
            content: message.content,
            timestamp: message.timestamp.toISOString(),
          }
        }),
      });
    } catch (error) {
      console.error('Failed to save transcript:', error);
    }
  };

  const connectWebRTC = async (clientSecret: string, model: string) => {
    console.log('🔵 [WebRTC] Creating peer connection...');

    // Create peer connection
    const pc = new RTCPeerConnection();
    peerConnectionRef.current = pc;

    // Log state changes
    pc.onconnectionstatechange = () => {
      console.log('🔗 [WebRTC] Connection state:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        console.log('✅ [WebRTC] Connected to OpenAI!');
        setIsConnected(true);
      } else if (pc.connectionState === 'failed') {
        setError('WebRTC connection failed');
        setIsConnected(false);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('🧊 [WebRTC] ICE state:', pc.iceConnectionState);
    };

    // Handle incoming audio from OpenAI
    pc.ontrack = (event) => {
      console.log('🎵 [WebRTC] Received audio track from OpenAI');
      
      // Create or get audio element
      let audioEl = audioElementRef.current;
      if (!audioEl) {
        audioEl = document.createElement('audio');
        audioEl.id = 'openai-audio';
        audioEl.autoplay = true;
        audioEl.setAttribute('playsinline', 'true');
        document.body.appendChild(audioEl);
        audioElementRef.current = audioEl;
      }

      // Attach remote stream
      if (audioEl.srcObject !== event.streams[0]) {
        audioEl.srcObject = event.streams[0];
        console.log('🔊 [WebRTC] Audio stream attached to element');
      }
    };

    // Create data channel for messages
    const dc = pc.createDataChannel('oai-events');
    dataChannelRef.current = dc;

    dc.onopen = () => {
      console.log('✅ [DataChannel] Opened');
      
      // Send initial greeting immediately upon connection
      console.log('👋 [DataChannel] Sending greeting...');
      
      // First, add a system message to set the context
      dc.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'system',
          content: [{
            type: 'text',
            text: 'You are a friendly AI tutor. Start with a warm greeting that mentions you speak multiple languages and encourages the student to ask questions.'
          }]
        }
      }));
      
      // Then request the greeting response
      setTimeout(() => {
        dc.send(JSON.stringify({
          type: 'response.create',
          response: {
            modalities: ['audio', 'text'],
            instructions: 'Greet the student warmly. Say: "Hello and welcome! I\'m your AI tutor, ready to make learning fun and effective. I speak many languages fluently - English, Spanish, French, Mandarin, Arabic, German, and more - so feel free to use whichever you\'re most comfortable with. Don\'t worry about making mistakes; that\'s how we learn! Now, what would you like to explore today?"'
          }
        }));
        console.log('✅ [DataChannel] Greeting request sent');
      }, 100); // Small delay to ensure system message is processed first
    };

    dc.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('📨 [DataChannel] Message:', message.type);
        
        if (message.type === 'error') {
          console.error('❌ [OpenAI] Error:', message.error);
          setError(message.error.message);
        }
        
        // Capture transcript messages
        if (message.type === 'conversation.item.created') {
          const item = message.item;
          if (item && (item.type === 'message' || item.type === 'function_call_output')) {
            const role = item.role === 'user' ? 'user' : item.role === 'assistant' ? 'assistant' : 'system';
            let content = '';
            
            // Extract text content from the item
            if (item.content && Array.isArray(item.content)) {
              content = item.content
                .filter((c: any) => c.type === 'text' || c.type === 'input_text')
                .map((c: any) => c.text || c.transcript || '')
                .join(' ');
            } else if (typeof item.content === 'string') {
              content = item.content;
            }
            
            if (content) {
              const newMessage: RealtimeMessage = {
                id: item.id || `msg-${Date.now()}`,
                role,
                content,
                timestamp: new Date(),
              };
              
              setMessages((prev) => [...prev, newMessage]);
              console.log('💬 [Transcript] Added message:', { role, content: content.substring(0, 50) });
              
              // Persist to database if we have a sessionId
              if (sessionIdRef.current) {
                saveTranscriptMessage(sessionIdRef.current, newMessage);
              }
            }
          }
        }
        
        // Also capture response text for assistant messages
        if (message.type === 'response.output_item.added' || message.type === 'response.text.delta') {
          const item = message.item || message;
          if (item && item.content && Array.isArray(item.content)) {
            const textContent = item.content
              .filter((c: any) => c.type === 'text')
              .map((c: any) => c.text || '')
              .join(' ');
              
            if (textContent) {
              // Check if we need to create or update the last assistant message
              setMessages((prev) => {
                const lastMessage = prev[prev.length - 1];
                if (lastMessage && lastMessage.role === 'assistant' && 
                    (Date.now() - lastMessage.timestamp.getTime()) < 5000) {
                  // Update the last assistant message if it's recent
                  return [
                    ...prev.slice(0, -1),
                    { ...lastMessage, content: lastMessage.content + ' ' + textContent }
                  ];
                } else {
                  // Create a new assistant message
                  const newMessage: RealtimeMessage = {
                    id: `msg-${Date.now()}`,
                    role: 'assistant',
                    content: textContent,
                    timestamp: new Date(),
                  };
                  return [...prev, newMessage];
                }
              });
            }
          }
        }
        
        // Capture user speech transcription
        if (message.type === 'conversation.item.input_audio_transcription.completed') {
          const transcript = message.transcript;
          if (transcript) {
            const newMessage: RealtimeMessage = {
              id: `msg-${Date.now()}`,
              role: 'user',
              content: transcript,
              timestamp: new Date(),
            };
            
            setMessages((prev) => [...prev, newMessage]);
            console.log('🎤 [Transcript] User said:', transcript);
            
            // Persist to database
            if (sessionIdRef.current) {
              saveTranscriptMessage(sessionIdRef.current, newMessage);
            }
          }
        }
      } catch (err) {
        console.error('❌ [DataChannel] Parse error:', err);
      }
    };

    // Get microphone
    console.log('🎤 [WebRTC] Requesting microphone...');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 24000,
      }
    });
    micStreamRef.current = stream;

    // Add audio track to peer connection
    stream.getTracks().forEach(track => {
      console.log('🎤 [WebRTC] Adding microphone track');
      pc.addTrack(track, stream);
    });

    // Create offer
    console.log('📤 [WebRTC] Creating SDP offer...');
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Send to OpenAI
    console.log('🌐 [WebRTC] Sending SDP to OpenAI...');
    const sdpResponse = await fetch(
      `https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${clientSecret}`,
          'Content-Type': 'application/sdp',
          'OpenAI-Beta': 'realtime=v1',
        },
        body: offer.sdp,
      }
    );

    if (!sdpResponse.ok) {
      const errorText = await sdpResponse.text();
      console.error('❌ [WebRTC] SDP exchange failed:', sdpResponse.status, errorText);
      throw new Error(`WebRTC SDP failed: ${sdpResponse.status}`);
    }

    // Apply answer
    const answerSdp = await sdpResponse.text();
    console.log('📥 [WebRTC] Applying remote answer...');
    await pc.setRemoteDescription({
      type: 'answer',
      sdp: answerSdp,
    });

    console.log('✅ [WebRTC] Setup complete, waiting for connection...');
  };

  const disconnect = useCallback(() => {
    console.log('🔴 [RealtimeVoice] Disconnecting...');

    try {
      // 1. Close data channel first
      if (dataChannelRef.current) {
        console.log('🔴 [DataChannel] Closing...');
        try {
          dataChannelRef.current.close();
        } catch (e) {
          console.warn('⚠️ [DataChannel] Error closing:', e);
        }
        dataChannelRef.current = null;
      }

      // 2. Close peer connection
      if (peerConnectionRef.current) {
        console.log('🔴 [WebRTC] Closing peer connection...');
        try {
          peerConnectionRef.current.close();
        } catch (e) {
          console.warn('⚠️ [WebRTC] Error closing:', e);
        }
        peerConnectionRef.current = null;
      }

      // 3. Stop microphone tracks
      if (micStreamRef.current) {
        console.log('🔴 [Microphone] Stopping tracks...');
        micStreamRef.current.getTracks().forEach(track => {
          try {
            track.stop();
            console.log('✅ [Microphone] Track stopped');
          } catch (e) {
            console.warn('⚠️ [Microphone] Error stopping track:', e);
          }
        });
        micStreamRef.current = null;
      }

      // 4. Remove and cleanup audio element
      if (audioElementRef.current) {
        console.log('🔴 [Audio] Removing element...');
        try {
          audioElementRef.current.pause();
          audioElementRef.current.srcObject = null;
          audioElementRef.current.remove();
        } catch (e) {
          console.warn('⚠️ [Audio] Error removing:', e);
        }
        audioElementRef.current = null;
      }

      console.log('✅ [RealtimeVoice] Disconnected successfully');
      
      // Update state
      setIsConnected(false);
      setError(null);
      setMessages([]);

    } catch (error) {
      console.error('❌ [RealtimeVoice] Error during disconnect:', error);
      // Force state update even if cleanup failed
      setIsConnected(false);
    }
  }, []);

  const sendAudio = useCallback((audioData: ArrayBuffer) => {
    // This can be implemented later for sending audio chunks
    console.log('[RealtimeVoice] sendAudio not yet implemented');
  }, []);

  // Cleanup on unmount or page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      disconnect();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      disconnect(); // Cleanup on component unmount
    };
  }, [disconnect]);

  // Return compatible interface with existing components
  return {
    connect,
    disconnect,
    isConnected,
    isConnecting,
    error,
    sendAudio,
    status: isConnecting ? 'connecting' as const : 
           isConnected ? 'active' as const : 
           error ? 'error' as const : 
           'idle' as const,
    messages,
  };
}