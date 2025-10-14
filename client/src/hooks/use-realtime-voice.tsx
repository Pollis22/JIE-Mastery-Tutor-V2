import { useState, useRef, useCallback } from 'react';

export function useRealtimeVoice() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  const connect = useCallback(async (config: {
    model?: string;
    voice?: string;
    userId?: string;
    studentId?: string;
    subject?: string;
    language?: string;
    ageGroup?: string;
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
      
      // Send greeting request
      console.log('👋 [DataChannel] Requesting greeting...');
      dc.send(JSON.stringify({
        type: 'response.create',
        response: {
          modalities: ['audio'],
          instructions: "Say 'Hi! I'm your tutor. What would you like to learn today?' clearly once.",
          voice: 'alloy'
        }
      }));
    };

    dc.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('📨 [DataChannel] Message:', message.type);
        
        if (message.type === 'error') {
          console.error('❌ [OpenAI] Error:', message.error);
          setError(message.error.message);
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

    // Close data channel
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }

    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // Stop microphone
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }

    // Remove audio element
    if (audioElementRef.current) {
      audioElementRef.current.srcObject = null;
      audioElementRef.current.remove();
      audioElementRef.current = null;
    }

    setIsConnected(false);
    setError(null);
  }, []);

  const sendAudio = useCallback((audioData: ArrayBuffer) => {
    // This can be implemented later for sending audio chunks
    console.log('[RealtimeVoice] sendAudio not yet implemented');
  }, []);

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
    messages: [],
  };
}