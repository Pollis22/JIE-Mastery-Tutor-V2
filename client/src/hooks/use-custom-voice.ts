import { useState, useRef, useCallback, useEffect } from "react";

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
  const audioEnabledRef = useRef<boolean>(true); // Tutor audio enabled (default true)
  const micEnabledRef = useRef<boolean>(true); // Student mic enabled (default true)

  // Synchronize refs with state
  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
  }, [audioEnabled]);

  useEffect(() => {
    micEnabledRef.current = micEnabled;
  }, [micEnabled]);

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
            console.log("[Custom Voice] ✅ Session ready");
            setIsConnected(true);
            
            // Only start microphone if student mic is enabled
            if (micEnabledRef.current) {
              console.log("[Custom Voice] 🎤 Starting microphone (Voice mode)");
              await startMicrophone();
            } else {
              console.log("[Custom Voice] 🔇 Skipping microphone (Hybrid/Text mode)");
            }
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
            console.log("[Custom Voice] ✅ Session ended (deprecated message)");
            break;
          
          case "session_ended":
            console.log("[Custom Voice] ✅ Received session_ended ACK from server");
            console.log("[Custom Voice] Session ID:", message.sessionId);
            console.log("[Custom Voice] Transcript length:", message.transcriptLength);
            // Cleanup is handled in ws.onclose
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
      
      // Resume audio context if suspended
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
        console.log("[Custom Voice] ✅ Audio context resumed from suspended state");
      }
      
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
        
        // Keep track of consecutive silent chunks
        let silentChunks = 0;
        const MAX_SILENT_CHUNKS = 10;
        
        processor.onaudioprocess = (e) => {
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
          
          // Check if media stream is still active
          if (!mediaStreamRef.current || !mediaStreamRef.current.active) {
            console.error('[Custom Voice] ❌ Media stream is no longer active!');
            return;
          }
          
          // Check audio context state and resume if needed
          if (audioContextRef.current?.state === 'suspended') {
            audioContextRef.current.resume();
            console.log('[Custom Voice] ⚠️ Resuming suspended audio context');
          }

          const inputData = e.inputBuffer.getChannelData(0);
          
          // Check if audio buffer contains actual audio (not just silence)
          let hasAudio = false;
          let maxAmplitude = 0;
          for (let i = 0; i < inputData.length; i++) {
            const amplitude = Math.abs(inputData[i]);
            if (amplitude > maxAmplitude) maxAmplitude = amplitude;
            if (amplitude > 0.001) {  // Threshold for detecting audio
              hasAudio = true;
            }
          }
          
          // Track consecutive silent chunks
          if (!hasAudio) {
            silentChunks++;
            if (silentChunks <= MAX_SILENT_CHUNKS) {
              // Still send a few silent chunks (user might be pausing)
              console.log(`[Custom Voice] 🔇 Silent chunk ${silentChunks}/${MAX_SILENT_CHUNKS}, max amplitude: ${maxAmplitude}`);
            } else {
              // Too many silent chunks, skip to save bandwidth
              return;
            }
          } else {
            if (silentChunks > 0) {
              console.log(`[Custom Voice] 🎤 Audio detected after ${silentChunks} silent chunks, max amplitude: ${maxAmplitude}`);
            }
            silentChunks = 0;  // Reset counter when audio is detected
          }
          
          // Convert to PCM16 with amplification
          const GAIN = 100; // Amplify quiet microphones (increased from 10)
          const pcm16 = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            // Apply gain before conversion
            const amplified = inputData[i] * GAIN;
            const s = Math.max(-1, Math.min(1, amplified));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          
          // Log sample of audio for debugging
          if (silentChunks === 0 && hasAudio) {
            const samplePCM = Array.from(pcm16.slice(0, 10));
            console.log(`[Custom Voice] 📊 PCM16 sample after gain: ${samplePCM}`);
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
        
        console.log('[Custom Voice] 📊 ScriptProcessor connected:', {
          bufferSize: processor.bufferSize,
          inputChannels: processor.numberOfInputs,
          outputChannels: processor.numberOfOutputs,
          contextState: audioContextRef.current.state,
          streamActive: stream.active,
          trackState: stream.getAudioTracks()[0]?.readyState
        });
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
  
  const stopMicrophone = () => {
    console.log("[Custom Voice] 🛑 Stopping microphone...");
    
    // Stop all tracks in the media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log("[Custom Voice] ⏸️ Stopped track:", track.kind);
      });
      mediaStreamRef.current = null;
    }
    
    // Disconnect and clean up audio processor
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
        console.log("[Custom Voice] 🔌 Disconnected audio processor");
      } catch (error) {
        console.warn("[Custom Voice] ⚠️ Error disconnecting processor:", error);
      }
      processorRef.current = null;
    }
    
    console.log("[Custom Voice] ✅ Microphone stopped successfully");
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

  const disconnectInProgress = useRef(false);
  
  const disconnect = useCallback(async (sessionId?: string) => {
    // Prevent concurrent disconnect calls
    if (disconnectInProgress.current) {
      console.log("[Custom Voice] ⚠️ Disconnect already in progress, ignoring duplicate call");
      return;
    }
    
    disconnectInProgress.current = true;
    
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("[Custom Voice] 🛑 DISCONNECT CALLED");
    console.log("[Custom Voice] Session ID:", sessionId);
    console.log("[Custom Voice] WebSocket state:", wsRef.current?.readyState);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    
    // Capture current WebSocket instance to prevent issues if wsRef changes during async ops
    const ws = wsRef.current;
    let ackHandler: ((event: MessageEvent) => void) | null = null;
    let ackReceived = false;
    
    try {
      // Try WebSocket termination if connection is open
      if (ws && ws.readyState === WebSocket.OPEN) {
        console.log("[Custom Voice] ✅ WebSocket is OPEN - attempting WebSocket termination");
        
        let sessionEndedAckReceived = false;
        const HTTP_FALLBACK_TIMEOUT = 3000; // 3 seconds
        
        // Listen for session_ended ACK using addEventListener (doesn't overwrite existing handlers)
        const ackPromise = new Promise<boolean>((resolve) => {
          console.log("[Custom Voice] 🕐 Setting up ACK listener with", HTTP_FALLBACK_TIMEOUT, "ms timeout");
          
          ackHandler = (event: MessageEvent) => {
            try {
              const message = JSON.parse(event.data);
              console.log("[Custom Voice] 📨 Received message during ACK wait:", message.type);
              if (message.type === "session_ended") {
                console.log("[Custom Voice] ✅ Received session_ended ACK - WebSocket succeeded");
                sessionEndedAckReceived = true;
                resolve(true);
              }
            } catch (e) {
              // Ignore parsing errors
            }
          };
          
          // Add our listener (doesn't replace existing onmessage handler)
          console.log("[Custom Voice] 📡 Adding ACK event listener");
          ws.addEventListener('message', ackHandler);
          
          // Also listen for close event to resolve early if WebSocket closes
          const closeHandler = () => {
            console.log("[Custom Voice] 🔌 WebSocket closed before ACK");
            if (!sessionEndedAckReceived) {
              resolve(false);
            }
          };
          ws.addEventListener('close', closeHandler, { once: true });
          
          // Timeout after 3 seconds
          setTimeout(() => {
            console.log("[Custom Voice] ⏱️ ACK timeout fired. ACK received?", sessionEndedAckReceived);
            if (!sessionEndedAckReceived) {
              console.log("[Custom Voice] ⚠️ No ACK received within timeout - will use HTTP fallback");
              resolve(false);
            }
          }, HTTP_FALLBACK_TIMEOUT);
        });
      
        console.log("[Custom Voice] 📤 Sending end message via WebSocket...");
        ws.send(JSON.stringify({ type: "end" }));
        console.log("[Custom Voice] ⏳ Waiting for ACK or timeout...");
        
        // Wait for ACK or timeout
        ackReceived = await ackPromise;
        console.log("[Custom Voice] 🎯 ACK promise resolved. ACK received?", ackReceived);
        
        // Close WebSocket
        console.log("[Custom Voice] 🔌 Closing WebSocket connection...");
        ws.close(1000, 'User ended session');
        wsRef.current = null;
      } else {
        console.log("[Custom Voice] ⚠️ WebSocket not open or already closed");
        console.log("[Custom Voice] State:", ws?.readyState);
      }
      
      // Always try HTTP fallback if:
      // 1. WebSocket ACK failed (no ACK received)
      // 2. OR WebSocket was not open in the first place (Railway proxy scenario)
      if (!ackReceived && sessionId) {
        console.log("[Custom Voice] 🔄 Using HTTP fallback to end session...");
        console.log("[Custom Voice] 🌐 HTTP POST to /api/voice-sessions/" + sessionId + "/end");
        try {
          const response = await fetch(`/api/voice-sessions/${sessionId}/end`, {
            method: 'POST',
            credentials: 'include',
          });
          
          console.log("[Custom Voice] 📡 HTTP response status:", response.status);
          
          if (response.ok) {
            const result = await response.json();
            console.log("[Custom Voice] ✅ HTTP fallback successful:", result);
          } else {
            const errorText = await response.text();
            console.error("[Custom Voice] ❌ HTTP fallback failed:", response.status, errorText);
          }
        } catch (error) {
          console.error("[Custom Voice] ❌ HTTP fallback error:", error);
        }
      } else if (!ackReceived && !sessionId) {
        console.warn("[Custom Voice] ⚠️ Cannot end session - no sessionId provided");
      } else {
        console.log("[Custom Voice] ✅ Session ended via WebSocket ACK - HTTP fallback not needed");
      }
      
    } finally {
      // Always cleanup: remove event listener and reset flag
      console.log("[Custom Voice] 🧹 Running finally block cleanup");
      
      if (ackHandler && ws) {
        console.log("[Custom Voice] 🔄 Removing ACK listener in finally");
        ws.removeEventListener('message', ackHandler);
      }
      
      cleanup();
      setIsConnected(false);
      disconnectInProgress.current = false;
      
      console.log("[Custom Voice] ✅ Disconnect complete");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    }
    
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

  const updateMode = useCallback(async (tutorAudio: boolean, studentMic: boolean) => {
    console.log("[Custom Voice] 🔄 Updating mode:", { tutorAudio, studentMic });

    const previousMicState = micEnabledRef.current;

    // Update local state (works even before connection for initial setup)
    setAudioEnabled(tutorAudio);
    setMicEnabled(studentMic);

    // Send to server only if connected
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "update_mode",
        tutorAudio,
        studentMic,
      }));
    } else {
      console.log("[Custom Voice] 📝 Mode updated locally (not connected yet)");
    }

    // Stop audio if muting
    if (!tutorAudio && isPlayingRef.current) {
      stopAudio();
    }

    // Handle microphone toggling (only if connected)
    const isConnected = wsRef.current && wsRef.current.readyState === WebSocket.OPEN;
    
    if (isConnected && studentMic && !previousMicState) {
      // Switching to Voice mode - start microphone
      console.log("[Custom Voice] 🎤 Enabling microphone for Voice mode");
      await startMicrophone();
    } else if (isConnected && !studentMic && previousMicState) {
      // Switching to Hybrid/Text mode - stop microphone
      console.log("[Custom Voice] 🔇 Disabling microphone for Hybrid/Text mode");
      stopMicrophone();
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
