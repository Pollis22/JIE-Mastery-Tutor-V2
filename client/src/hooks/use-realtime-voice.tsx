import { useState, useRef, useCallback, useEffect } from 'react';

export interface RealtimeMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

// Helper to safely extract client_secret (string or {value: string})
export function extractClientSecret(raw: unknown): string {
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (raw && typeof raw === "object" && "value" in (raw as any)) {
    const v = (raw as any).value;
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  throw new Error("Invalid client_secret in response");
}

export function useRealtimeVoice() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isProcessingDocuments, setIsProcessingDocuments] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<RealtimeMessage[]>([]);
  
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const currentAssistantMessage = useRef<RealtimeMessage | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isEndingSessionRef = useRef<boolean>(false); // Prevent duplicate session ending

  const connect = useCallback(async (config: {
    sessionId?: string;
    clientSecret?: any;
    model?: string;
    voice?: string;
    instructions?: string;
    userId?: string;
    studentId?: string;
    studentName?: string;
    subject?: string;
    language?: string;
    ageGroup?: string;
    contextDocumentIds?: string[];
  }) => {
    try {
      setIsConnecting(true);
      setError(null);
      console.log('🔵 [RealtimeVoice] Starting connection...');

      // If documents provided, show processing state
      if (config.contextDocumentIds && config.contextDocumentIds.length > 0) {
        setIsProcessingDocuments(true);
        console.log('📚 Processing', config.contextDocumentIds.length, 'documents...');
      }

      let clientSecret: any;
      let sessionId: string = '';
      let model: string = '';
      let instructions: string = '';

      // Check if we already have credentials passed from parent
      const hasProvidedCredentials = !!(config.clientSecret && config.sessionId);
      
      if (hasProvidedCredentials) {
        // Use the passed credentials (avoids creating duplicate session)
        console.log('✅ [RealtimeVoice] Using provided credentials from parent, SKIPPING API CALL');
        console.log('   Session ID:', config.sessionId);
        console.log('   Has client secret:', !!config.clientSecret);
        clientSecret = extractClientSecret(config.clientSecret);
        sessionId = config.sessionId || '';
        model = config.model || 'gpt-4o-realtime-preview-2024-10-01';
        instructions = config.instructions || '';  // CRITICAL: Use instructions passed from host!
        console.log('📋 [RealtimeVoice] Using provided instructions, length:', instructions.length);
      } else {
        // Fallback: Get credentials via HTTP (for backward compatibility)
        console.log('🔑 [RealtimeVoice] No credentials provided, requesting from API...');
        const response = await fetch('/api/session/realtime', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: config.model || 'gpt-4o-realtime-preview-2024-10-01',
            voice: config.voice || 'alloy',
            userId: config.userId,
            studentId: config.studentId,
            studentName: config.studentName,
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

        clientSecret = data.client_secret.value;  // ✅ Extract the actual value string
        sessionId = data.session_id || data.sessionId;
        model = data.model || 'gpt-4o-realtime-preview-2024-10-01';
        instructions = data.instructions || '';  // Get instructions from backend
      }

      // Documents processed!
      setIsProcessingDocuments(false);
      
      if (config.contextDocumentIds && config.contextDocumentIds.length > 0) {
        console.log('✅ Documents ready for AI context');
      }

      // Check if we have a valid client secret
      const hasValidSecret = clientSecret && (typeof clientSecret === 'string' || clientSecret.value);
      if (!hasValidSecret) {
        throw new Error('No valid client_secret available');
      }

      // Store sessionId for transcript persistence
      sessionIdRef.current = sessionId;

      // Step 2: Establish WebRTC to OpenAI
      const secretValue = typeof clientSecret === 'string' ? clientSecret : clientSecret.value;
      await connectWebRTC(secretValue, model, instructions);

      console.log('✅ [RealtimeVoice] Connected successfully!');
      setIsConnected(true);
      
      // Step 3: Start heartbeat polling to detect auto-timeout
      startSessionHeartbeat(sessionId);

    } catch (err: any) {
      console.error('❌ [RealtimeVoice] Connection failed:', err);
      setError(err.message);
      setIsConnected(false);
      setIsProcessingDocuments(false);
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

  const connectWebRTC = async (clientSecret: string, model: string, instructions: string = '') => {
    console.log('🔵 [WebRTC] Creating peer connection...');

    // Create peer connection
    const pc = new RTCPeerConnection();
    peerConnectionRef.current = pc;

    // CRITICAL: Add audio transceiver to receive audio from OpenAI
    // Without this, OpenAI drops the media channel and disconnects immediately
    console.log('🎤 [WebRTC] Adding audio transceiver for receiving OpenAI audio...');
    pc.addTransceiver('audio', { direction: 'recvonly' });

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
        
        // CRITICAL: Force audio to play (handle browser autoplay policies)
        audioEl.play().then(() => {
          console.log('✅ [Audio] Playing successfully');
        }).catch((err) => {
          console.error('❌ [Audio] Playback failed:', err);
          console.log('⚠️ [Audio] User interaction may be needed to enable audio');
          // Try to play again on next user interaction
          document.addEventListener('click', () => {
            audioEl.play().catch(() => {});
          }, { once: true });
        });
      }
    };

    // Create data channel for messages
    const dc = pc.createDataChannel('oai-events');
    dataChannelRef.current = dc;

    dc.onopen = () => {
      console.log('✅ [DataChannel] Opened');
      
      // Configure session with FULL configuration including instructions
      console.log('🎙️ [DataChannel] Configuring session with instructions...');
      
      // Send complete session configuration
      const sessionConfig = {
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          voice: 'echo', // CRITICAL: Must specify voice for audio generation!
          instructions: instructions || `You are an AI tutor. Start EVERY session by greeting the student warmly saying "Hello! I'm your AI tutor. I'm here to help you learn. What subject would you like to work on today?" Then wait for their response.`,
          input_audio_format: 'pcm16',
          output_audio_format: 'pcm16',
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500
          },
          input_audio_transcription: {
            model: 'whisper-1'
          }
        }
      };
      
      console.log('📋 [DataChannel] Sending session config with instructions length:', sessionConfig.session.instructions.length);
      console.log('📋 [DataChannel] Instructions preview:', sessionConfig.session.instructions.substring(0, 200) + '...');
      dc.send(JSON.stringify(sessionConfig));
      
      // CRITICAL: Give model something to respond to!
      setTimeout(() => {
        console.log('🎤 [DataChannel] Sending greeting prompt...');
        
        // First, send input text to give model something to respond to
        dc.send(JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: 'Please greet the student and ask what subject they would like help with today.'
              }
            ]
          }
        }));
        
        // Then request response (inherits session defaults)
        dc.send(JSON.stringify({
          type: 'response.create'
        }));
        
        console.log('✅ [DataChannel] Greeting prompt sent, response requested');
      }, 1000);  // Give session.update time to process
    };

    dc.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('📨 [DataChannel] Message:', message.type);
        
        if (message.type === 'error') {
          console.error('❌ [OpenAI] Error:', message.error);
          setError(message.error.message);
        }
        
        // CRITICAL: Trigger AI response when user audio is committed
        if (message.type === 'input_audio_buffer.committed') {
          console.log('📝 [DataChannel] User audio committed, triggering AI response...');
          dc.send(JSON.stringify({
            type: 'response.create'
          }));
        }
        
        // Track user activity for inactivity timeout
        if (message.type === 'input_audio_buffer.speech_started' || 
            message.type === 'conversation.item.created') {
          // User is active - notify server and check if session was auto-ended
          fetch('/api/session/activity', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: sessionIdRef.current }),
          })
            .then(res => res.json())
            .then(data => {
              // If session was auto-ended due to inactivity, disconnect
              if (data.sessionEnded) {
                console.log('⏰ [RealtimeVoice] Session auto-ended by server, disconnecting...');
                setError('Session ended due to inactivity');
                disconnect();
              }
            })
            .catch(() => {
              // Fail silently - activity tracking is non-critical
            });
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
        
        // Capture audio transcript completion
        if (message.type === 'response.audio.done' && message.item) {
          const item = message.item;
          if (item.content && Array.isArray(item.content)) {
            const textContent = item.content
              .filter((c: any) => c.type === 'text')
              .map((c: any) => c.text || '')
              .join(' ');
              
            if (textContent) {
              const newMessage: RealtimeMessage = {
                id: item.id || `msg-${Date.now()}`,
                role: 'assistant',
                content: textContent,
                timestamp: new Date(),
              };
              
              setMessages((prev) => {
                // Check if message already exists
                const exists = prev.some(m => m.id === newMessage.id);
                if (exists) return prev;
                return [...prev, newMessage];
              });
              console.log('🎵 [Transcript] Audio transcript:', textContent.substring(0, 50));
              
              // Persist to database
              if (sessionIdRef.current) {
                saveTranscriptMessage(sessionIdRef.current, newMessage);
              }
            }
          }
        }
        
        // Handle audio delta - PLAY THE AUDIO!
        if (message.type === 'response.audio.delta') {
          if (message.delta) {
            console.log('🎵 [Audio] Received audio delta, playing...');
            playAudioDelta(message.delta);
          }
        }
        
        // Capture streaming AI response transcript
        if (message.type === 'response.audio_transcript.delta') {
          // This fires for each chunk of AI speech - accumulate
          if (!currentAssistantMessage.current) {
            currentAssistantMessage.current = {
              id: message.response_id || `assistant-${Date.now()}`,
              role: 'assistant',
              content: '',
              timestamp: new Date(),
            };
          }

          currentAssistantMessage.current.content += message.delta || '';
          console.log('🔊 [Transcript] AI speaking:', message.delta);
        }

        // AI finished speaking - save complete message
        if (message.type === 'response.done') {
          if (currentAssistantMessage.current && currentAssistantMessage.current.content) {
            console.log('🤖 [Transcript] AI complete:', currentAssistantMessage.current.content);
            
            const finalMessage = { ...currentAssistantMessage.current };
            setMessages((prev) => {
              // Check if message already exists
              const exists = prev.some(m => m.id === finalMessage.id);
              if (exists) return prev;
              return [...prev, finalMessage];
            });

            // Save to server
            if (sessionIdRef.current) {
              saveTranscriptMessage(sessionIdRef.current, finalMessage);
            }

            currentAssistantMessage.current = null;
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
              
            if (textContent && !currentAssistantMessage.current) {
              // Only use this as fallback if we're not already capturing via audio_transcript.delta
              const newMessage: RealtimeMessage = {
                id: `msg-${Date.now()}`,
                role: 'assistant',
                content: textContent,
                timestamp: new Date(),
              };
              
              setMessages((prev) => {
                const exists = prev.some(m => m.content === textContent);
                if (exists) return prev;
                return [...prev, newMessage];
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
        sampleRate: 16000,  // CRITICAL: Match OpenAI's expected sample rate for PCM16
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

  // Start heartbeat polling to detect auto-timeout
  const startSessionHeartbeat = (sessionId: string) => {
    // Poll every 10 seconds to check if session is still active
    // NOTE: With WebRTC, the connection is peer-to-peer (browser <-> OpenAI)
    // Server cannot directly close it, so we poll to detect server-side timeout
    console.log('💓 [Heartbeat] Starting session heartbeat polling (10s intervals)');
    
    const checkSessionStatus = async () => {
      try {
        const response = await fetch('/api/session/activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });
        
        const data = await response.json();
        
        // If session was auto-ended, disconnect immediately
        if (data.sessionEnded) {
          console.log('⏰ [Heartbeat] Session auto-ended by server, disconnecting...');
          setError('Session ended due to inactivity');
          disconnect();
        }
      } catch (error) {
        console.warn('⚠️ [Heartbeat] Failed to check session status:', error);
      }
    };
    
    // Initial check
    checkSessionStatus();
    
    // Set up interval for periodic checks (every 10 seconds for faster response)
    heartbeatIntervalRef.current = setInterval(checkSessionStatus, 10000);
  };

  const disconnect = useCallback(async () => {
    console.log('🔴 [RealtimeVoice] Disconnecting...');

    // Prevent duplicate disconnection
    if (isEndingSessionRef.current) {
      console.log('⚠️ [RealtimeVoice] Already disconnecting, skipping duplicate call');
      return;
    }
    isEndingSessionRef.current = true;

    try {
      // 0. Stop heartbeat polling
      if (heartbeatIntervalRef.current) {
        console.log('💓 [Heartbeat] Stopping heartbeat polling');
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }

      // 0.5 End the session on the backend to mark it as ended
      if (sessionIdRef.current) {
        console.log('📡 [RealtimeVoice] Ending session on backend:', sessionIdRef.current);
        try {
          await fetch(`/api/session/realtime/${sessionIdRef.current}/end`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          console.log('✅ [RealtimeVoice] Session ended on backend');
        } catch (error) {
          console.warn('⚠️ [RealtimeVoice] Failed to end session on backend:', error);
          // Continue with cleanup even if backend call fails
        }
        const endedSessionId = sessionIdRef.current;
        sessionIdRef.current = null;
        
        // Mark this session as ended to prevent beacon from ending it again
        (window as any)._endedSessionIds = (window as any)._endedSessionIds || new Set();
        (window as any)._endedSessionIds.add(endedSessionId);
      }

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
    } finally {
      // Always reset the flag after disconnect completes or fails
      isEndingSessionRef.current = false;
    }
  }, []);

  // Audio playback setup
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);
  
  const sendAudio = useCallback((audioData: ArrayBuffer) => {
    // Send audio through WebRTC data channel to OpenAI
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      // Convert ArrayBuffer to base64 for sending through data channel
      const uint8Array = new Uint8Array(audioData);
      let binaryString = '';
      for (let i = 0; i < uint8Array.length; i++) {
        binaryString += String.fromCharCode(uint8Array[i]);
      }
      const base64Audio = btoa(binaryString);
      
      // Send audio to OpenAI using the input_audio_buffer.append message
      const audioMessage = {
        type: 'input_audio_buffer.append',
        audio: base64Audio
      };
      
      dataChannelRef.current.send(JSON.stringify(audioMessage));
    }
  }, []);
  
  // Function to play audio from OpenAI response
  const playAudioDelta = useCallback(async (base64Audio: string) => {
    try {
      if (!base64Audio) {
        console.warn('[RealtimeVoice] No audio data to play');
        return;
      }
      
      console.log('[RealtimeVoice] Playing AI audio response...');
      
      // Initialize audio context if not exists
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ 
          sampleRate: 24000 
        });
        console.log('[RealtimeVoice] Audio context created with sample rate:', audioContextRef.current.sampleRate);
      }
      
      // Decode base64 to binary
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Create Int16Array from bytes (PCM16 format)
      const int16Array = new Int16Array(bytes.buffer);
      
      // Convert to Float32Array for Web Audio API
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        // Convert from Int16 range (-32768 to 32767) to Float32 range (-1 to 1)
        float32Array[i] = int16Array[i] / 32768.0;
      }
      
      // Create audio buffer
      const audioBuffer = audioContextRef.current.createBuffer(
        1, // mono
        float32Array.length,
        24000 // sample rate
      );
      
      // Copy our data to the audio buffer
      audioBuffer.copyToChannel(float32Array, 0);
      
      // Add to queue
      audioQueueRef.current.push(audioBuffer);
      
      // Start playing if not already playing
      if (!isPlayingRef.current) {
        playNextInQueue();
      }
      
    } catch (error) {
      console.error('[RealtimeVoice] Audio playback error:', error);
    }
  }, []);
  
  // Play audio buffers from queue - not using useCallback to avoid circular dependency
  const playNextInQueueRef = useRef<(() => void) | null>(null);
  
  const playNextInQueue = () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      return;
    }
    
    if (!audioContextRef.current) return;
    
    isPlayingRef.current = true;
    const audioBuffer = audioQueueRef.current.shift()!;
    
    // Create source and play
    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContextRef.current.destination);
    
    source.onended = () => {
      // Play next in queue
      if (playNextInQueueRef.current) {
        playNextInQueueRef.current();
      }
    };
    
    source.start();
    console.log('[RealtimeVoice] Playing audio chunk, queue size:', audioQueueRef.current.length);
  };
  
  // Store the function in ref for self-reference
  playNextInQueueRef.current = playNextInQueue;

  // Cleanup on unmount or page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Use beacon API for page unload since async operations might not complete
      // Only send beacon if session wasn't already ended
      if (sessionIdRef.current && navigator.sendBeacon) {
        const endedSessions = (window as any)._endedSessionIds || new Set();
        if (!endedSessions.has(sessionIdRef.current)) {
          const data = new Blob([JSON.stringify({ sessionId: sessionIdRef.current })], { type: 'application/json' });
          navigator.sendBeacon(`/api/session/realtime/${sessionIdRef.current}/end`, data);
          console.log('🚀 [RealtimeVoice] Sent beacon to end session on page unload');
        } else {
          console.log('⏭️ [RealtimeVoice] Session already ended, skipping beacon');
        }
      }
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
    isProcessingDocuments,
    error,
    sendAudio,
    status: isConnecting ? 'connecting' as const : 
           isConnected ? 'active' as const : 
           error ? 'error' as const : 
           'idle' as const,
    messages,
  };
}