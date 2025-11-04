import { useState, useRef, useCallback } from "react";

interface TranscriptMessage {
  speaker: "student" | "tutor" | "system";
  text: string;
  timestamp?: string;
}

interface MicrophoneError {
  message: string;
  troubleshooting: string[];
  errorType: string;
}

export function useCustomVoice() {
  const [isConnected, setIsConnected] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [microphoneError, setMicrophoneError] = useState<MicrophoneError | null>(null);
  const [isTutorSpeaking, setIsTutorSpeaking] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<AudioWorkletNode | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const connect = useCallback(async (
    sessionId: string, 
    userId: string,
    studentName: string,
    ageGroup: string,
    systemInstruction: string,
    documents: string[] = []
  ) => {
    try {
      console.log("[Custom Voice] 🚀 Connecting...");
      
      // Get WebSocket URL (use wss:// in production)
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/api/custom-voice-ws`;
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[Custom Voice] ✅ Connected");
        
        ws.send(JSON.stringify({
          type: "init",
          sessionId,
          userId,
          studentName,
          ageGroup,
          systemInstruction,
          documents,
        }));
      };

      ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case "ready":
            console.log("[Custom Voice] ✅ Session ready, starting microphone...");
            setIsConnected(true);
            await startMicrophone();
            break;

          case "transcript":
            console.log(`[Custom Voice] 📝 ${message.speaker}: ${message.text}`);
            setTranscript(prev => [...prev, {
              speaker: message.speaker,
              text: message.text,
              timestamp: new Date().toISOString(),
            }]);
            break;

          case "audio":
            console.log("[Custom Voice] 🔊 Received audio");
            if (audioEnabled) {
              console.log("[Custom Voice] 🔊 Playing audio");
              setIsTutorSpeaking(true);
              await playAudio(message.data);
            } else {
              console.log("[Custom Voice] 🔇 Audio muted, showing text only");
            }
            break;

          case "interrupt":
            console.log("[Custom Voice] 🛑 Interruption detected - stopping tutor");
            stopAudio();
            setIsTutorSpeaking(false);
            break;
          
          case "mode_updated":
            console.log("[Custom Voice] Mode synced:", {
              tutorAudio: message.tutorAudio,
              studentMic: message.studentMic
            });
            setAudioEnabled(message.tutorAudio);
            setMicEnabled(message.studentMic);
            break;

          case "error":
            console.error("[Custom Voice] ❌ Error:", message.error);
            setError(message.error);
            break;

          case "ended":
            console.log("[Custom Voice] ✅ Session ended");
            break;
        }
      };

      ws.onerror = (error) => {
        console.error("[Custom Voice] ❌ WebSocket error:", error);
        setError("Connection error");
      };

      ws.onclose = () => {
        console.log("[Custom Voice] 🔌 Disconnected");
        setIsConnected(false);
        cleanup();
      };

    } catch (error) {
      console.error("[Custom Voice] ❌ Connection failed:", error);
      setError(error instanceof Error ? error.message : "Connection failed");
    }
  }, []);

  const startMicrophone = async () => {
    try {
      console.log("[Custom Voice] 🎤 Requesting microphone access...");
      
      // Check if browser supports getUserMedia
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('BROWSER_NOT_SUPPORTED');
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      
      console.log("[Custom Voice] ✅ Microphone access granted");
      
      // Clear any previous errors
      setMicrophoneError(null);
      
      mediaStreamRef.current = stream;
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      
      try {
        // Load AudioWorklet processor (modern API, replaces deprecated ScriptProcessorNode)
        await audioContextRef.current.audioWorklet.addModule('/audio-processor.js');
        
        const source = audioContextRef.current.createMediaStreamSource(stream);
        const processor = new AudioWorkletNode(audioContextRef.current, 'audio-processor');
        processorRef.current = processor;
        
        // Handle audio data from AudioWorklet
        processor.port.onmessage = (event) => {
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
          
          const float32Data = event.data.data; // Float32Array from AudioWorklet
          
          // Convert Float32 to PCM16
          const pcm16 = new Int16Array(float32Data.length);
          for (let i = 0; i < float32Data.length; i++) {
            const s = Math.max(-1, Math.min(1, float32Data[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }

          const uint8Array = new Uint8Array(pcm16.buffer);
          const binaryString = Array.from(uint8Array).map(byte => String.fromCharCode(byte)).join('');
          
          wsRef.current.send(JSON.stringify({
            type: "audio",
            data: btoa(binaryString),
          }));
        };

        source.connect(processor);
        processor.connect(audioContextRef.current.destination);
      } catch (workletError) {
        console.warn('[Custom Voice] ⚠️ AudioWorklet not supported, falling back to ScriptProcessorNode:', workletError);
        
        // Fallback to ScriptProcessorNode for older browsers
        const source = audioContextRef.current.createMediaStreamSource(stream);
        const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor as any;
        
        processor.onaudioprocess = (e) => {
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

          const inputData = e.inputBuffer.getChannelData(0);
          const pcm16 = new Int16Array(inputData.length);
          
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }

          const uint8Array = new Uint8Array(pcm16.buffer);
          const binaryString = Array.from(uint8Array).map(byte => String.fromCharCode(byte)).join('');
          
          wsRef.current.send(JSON.stringify({
            type: "audio",
            data: btoa(binaryString),
          }));
        };

        source.connect(processor);
        processor.connect(audioContextRef.current.destination);
      }
      
      console.log("[Custom Voice] ✅ Microphone started successfully");
      
    } catch (error: any) {
      console.error("[Custom Voice] ❌ Microphone error:", error.name || error.message, error);
      
      let userMessage = '';
      let troubleshooting: string[] = [];
      let errorType = error.name || error.message || 'Unknown';
      
      // Provide specific guidance based on error type
      if (errorType === 'BROWSER_NOT_SUPPORTED' || error.message === 'BROWSER_NOT_SUPPORTED') {
        userMessage = '🎤 Your browser does not support voice features';
        troubleshooting = [
          'Try using Chrome, Edge, or Firefox',
          'Make sure your browser is up to date',
          'Check that you\'re using HTTPS (secure connection)',
          'You can still chat via text below'
        ];
      } else if (errorType === 'NotAllowedError' || errorType === 'PermissionDeniedError') {
        userMessage = '🎤 Microphone access was denied';
        troubleshooting = [
          'Click the 🔒 lock icon in your browser address bar',
          'Change Microphone setting to "Allow"',
          'Refresh the page and start a new session',
          'Or continue using the text chat below'
        ];
      } else if (errorType === 'NotFoundError' || errorType === 'DevicesNotFoundError') {
        userMessage = '🎤 No microphone detected';
        troubleshooting = [
          'Make sure a microphone is connected to your device',
          'Check your system sound settings',
          'Try a different microphone if available',
          'You can use text chat in the meantime'
        ];
      } else if (errorType === 'NotReadableError' || errorType === 'TrackStartError') {
        userMessage = '🎤 Microphone is busy or unavailable';
        troubleshooting = [
          'Close other apps using your microphone (Zoom, Teams, Skype, Discord)',
          'Restart your browser',
          'Check system sound settings > Recording devices',
          'For now, you can chat using the text box below'
        ];
      } else if (errorType === 'OverconstrainedError' || errorType === 'ConstraintNotSatisfiedError') {
        userMessage = '🎤 Microphone settings incompatible';
        troubleshooting = [
          'Your microphone may not support the required audio quality',
          'Try updating your audio drivers',
          'Use text chat while we investigate'
        ];
      } else if (errorType === 'TypeError') {
        userMessage = '🎤 Browser configuration issue';
        troubleshooting = [
          'Make sure you\'re using HTTPS (secure connection)',
          'Try using a different browser (Chrome, Edge, Firefox)',
          'Update your browser to the latest version',
          'Use text chat as an alternative'
        ];
      } else {
        userMessage = `🎤 Microphone error: ${error.message || 'Unknown error'}`;
        troubleshooting = [
          'Check your browser microphone permissions',
          'Try refreshing the page',
          'Make sure no other apps are using your microphone',
          'You can still chat via text below'
        ];
      }
      
      // Set error state to display to user
      setMicrophoneError({
        message: userMessage,
        troubleshooting: troubleshooting,
        errorType: errorType
      });
      
      // Add friendly message to transcript
      setTranscript(prev => [...prev, {
        speaker: 'system',
        text: `⚠️ ${userMessage}\n\n💡 Don't worry! You can still have a great tutoring session using the text chat box below. Type your questions and your tutor will respond with voice.`,
        timestamp: new Date().toISOString(),
      }]);
      
      // Don't throw - allow session to continue with text-only mode
      console.log('[Custom Voice] 📝 Continuing in text-only mode');
    }
  };
  
  const retryMicrophone = useCallback(async () => {
    console.log("[Custom Voice] 🔄 Retrying microphone access...");
    setMicrophoneError(null);
    await startMicrophone();
  }, []);
  
  const dismissMicrophoneError = useCallback(() => {
    console.log("[Custom Voice] ✕ Dismissing microphone error");
    
    // Remove system error messages from transcript
    if (microphoneError) {
      setTranscript(prev => prev.filter(
        t => t.speaker !== 'system' || !t.text.includes(microphoneError.message)
      ));
    }
    
    // Clear error state
    setMicrophoneError(null);
  }, [microphoneError]);

  const playAudio = async (base64Audio: string) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
    }

    try {
      const audioData = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0));
      
      // Convert PCM16 to Float32 for Web Audio API
      const pcm16 = new Int16Array(audioData.buffer);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768.0;
      }

      const audioBuffer = audioContextRef.current.createBuffer(1, float32.length, 16000);
      audioBuffer.getChannelData(0).set(float32);
      
      audioQueueRef.current.push(audioBuffer);
      
      if (!isPlayingRef.current) {
        playNextChunk();
      }
      
    } catch (error) {
      console.error("[Custom Voice] ❌ Audio playback error:", error);
    }
  };

  const playNextChunk = () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      setIsTutorSpeaking(false);
      return;
    }

    isPlayingRef.current = true;
    const audioBuffer = audioQueueRef.current.shift()!;

    if (!audioContextRef.current) return;

    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContextRef.current.destination);
    currentAudioSourceRef.current = source;
    
    source.onended = () => {
      currentAudioSourceRef.current = null;
      playNextChunk();
    };
    
    source.start();
  };

  const stopAudio = () => {
    console.log("[Custom Voice] ⏹️ Stopping audio playback");
    
    // Stop currently playing audio source
    if (currentAudioSourceRef.current) {
      try {
        currentAudioSourceRef.current.stop();
        currentAudioSourceRef.current.disconnect();
      } catch (e) {
        // Source might already be stopped
      }
      currentAudioSourceRef.current = null;
    }
    
    // Clear the audio queue
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    
    console.log("[Custom Voice] ✅ Audio stopped, microphone still active");
  };

  const cleanup = () => {
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
        // Close AudioWorklet port if it exists
        if ('port' in processorRef.current) {
          processorRef.current.port.close();
        }
      } catch (e) {
        console.warn('[Custom Voice] Cleanup warning:', e);
      }
      processorRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    audioQueueRef.current = [];
    isPlayingRef.current = false;
  };

  const disconnect = useCallback(() => {
    console.log("[Custom Voice] 🛑 Disconnecting...");
    
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: "end" }));
      wsRef.current.close();
      wsRef.current = null;
    }

    cleanup();
    setIsConnected(false);
    
  }, []);

  const sendTextMessage = useCallback((message: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error("[Custom Voice] Cannot send text message: WebSocket not connected");
      return;
    }

    console.log("[Custom Voice] 📝 Sending text message to AI");
    
    // DON'T add to transcript here - let the server send it back to avoid duplicates
    // The WebSocket handler will send back a transcript entry that we'll receive in onmessage

    // Send to WebSocket
    wsRef.current.send(JSON.stringify({
      type: "text_message",
      message: message,
    }));
  }, []);

  const sendDocumentUploaded = useCallback((documentId: string, filename: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error("[Custom Voice] Cannot send document notification: WebSocket not connected");
      return;
    }

    console.log("[Custom Voice] 📄 Notifying AI about uploaded document:", filename);

    // Send to WebSocket
    wsRef.current.send(JSON.stringify({
      type: "document_uploaded",
      documentId: documentId,
      filename: filename,
    }));
  }, []);

  const updateMode = useCallback((tutorAudio: boolean, studentMic: boolean) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error("[Custom Voice] Cannot update mode: WebSocket not connected");
      return;
    }

    console.log("[Custom Voice] 🔄 Updating mode:", { tutorAudio, studentMic });

    // Update local state
    setAudioEnabled(tutorAudio);
    setMicEnabled(studentMic);

    // Send to server
    wsRef.current.send(JSON.stringify({
      type: "update_mode",
      tutorAudio,
      studentMic,
    }));

    // Stop audio if muting
    if (!tutorAudio && isPlayingRef.current) {
      stopAudio();
    }
  }, []);

  const addSystemMessage = useCallback((message: string) => {
    console.log("[Custom Voice] 📢 System message:", message);
    setTranscript(prev => [...prev, {
      speaker: "system",
      text: message,
      timestamp: new Date().toISOString(),
    }]);
  }, []);

  return {
    connect,
    disconnect,
    sendTextMessage,
    sendDocumentUploaded,
    updateMode,
    addSystemMessage,
    retryMicrophone,
    dismissMicrophoneError,
    isConnected,
    transcript,
    error,
    microphoneError,
    isTutorSpeaking,
    audioEnabled,
    micEnabled,
  };
}
