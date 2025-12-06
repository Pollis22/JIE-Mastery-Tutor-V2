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
  const playbackGainNodeRef = useRef<GainNode | null>(null); // For smooth fadeout during playback
  const nextPlayTimeRef = useRef<number>(0); // Schedule next chunk seamlessly
  const scheduledSourcesRef = useRef<AudioBufferSourceNode[]>([]); // Track scheduled sources for cleanup

  // Track when tutor audio playback started to prevent self-interrupt
  // VAD will ignore speech detection for a short period after playback starts
  const lastAudioPlaybackStartRef = useRef<number>(0);
  const isTutorSpeakingRef = useRef<boolean>(false); // Ref version for audio worklet access

  // Synchronize refs with state
  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
  }, [audioEnabled]);

  useEffect(() => {
    micEnabledRef.current = micEnabled;
  }, [micEnabled]);

  useEffect(() => {
    isTutorSpeakingRef.current = isTutorSpeaking;
  }, [isTutorSpeaking]);

  const connect = useCallback(async (
    sessionId: string, 
    userId: string,
    studentName: string,
    ageGroup: string,
    systemInstruction: string,
    documents: string[] = [],
    language: string = 'en'
  ) => {
    try {
      console.log("[Custom Voice] 🚀 Connecting...", { language });
      
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
          language, // LANGUAGE: Pass selected language to backend
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
            // Handle streaming transcripts: isPartial = first chunk, isComplete = final
            if (message.isComplete) {
              // Replace partial transcript with final complete version
              setTranscript(prev => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                if (lastIdx >= 0 && updated[lastIdx].speaker === 'tutor') {
                  updated[lastIdx] = {
                    speaker: message.speaker,
                    text: message.text,
                    timestamp: new Date().toISOString(),
                  };
                  return updated;
                }
                return [...prev, {
                  speaker: message.speaker,
                  text: message.text,
                  timestamp: new Date().toISOString(),
                }];
              });
            } else {
              // New transcript entry (or partial first chunk)
              setTranscript(prev => [...prev, {
                speaker: message.speaker,
                text: message.text,
                timestamp: new Date().toISOString(),
              }]);
            }
            break;
          
          case "transcript_update":
            // Streaming: append text to last tutor transcript entry
            console.log(`[Custom Voice] 📝 +${message.speaker}: ${message.text.substring(0, 30)}...`);
            setTranscript(prev => {
              const updated = [...prev];
              const lastIdx = updated.length - 1;
              if (lastIdx >= 0 && updated[lastIdx].speaker === 'tutor') {
                updated[lastIdx] = {
                  ...updated[lastIdx],
                  text: updated[lastIdx].text + ' ' + message.text,
                };
                return updated;
              }
              return prev;
            });
            break;

          case "audio":
            // Log streaming metadata for debugging
            const audioBytes = message.data?.length || 0;
            const isChunk = message.isChunk || false;
            const chunkIdx = message.chunkIndex || 0;
            console.log(`[Custom Voice] 🔊 Received audio: ${audioBytes} chars (isChunk=${isChunk}, chunkIndex=${chunkIdx})`);
            
            if (audioEnabled) {
              console.log("[Custom Voice] 🔊 Playing audio chunk");
              // Record when playback starts to prevent self-interrupt from echo
              lastAudioPlaybackStartRef.current = Date.now();
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
            console.log("[Custom Voice] Reason:", message.reason);
            console.log("[Custom Voice] Transcript length:", message.transcriptLength);
            
            // Show notification if session ended due to inactivity
            if (message.reason === 'inactivity_timeout') {
              console.log("[Custom Voice] 🔔 Session ended due to inactivity - will show notification");
              // Store inactivity flag so parent component can show notification
              (window as any).__sessionEndedReason = 'inactivity_timeout';
            }
            
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
          noiseSuppression: false,  // Disable - can cut off quiet speech
          autoGainControl: true,    // Let browser boost quiet audio
        }
      });
      
      console.log("[Custom Voice] ✅ Microphone access granted");
      
      // Clear any previous errors
      setMicrophoneError(null);
      
      mediaStreamRef.current = stream;
      
      // CRITICAL: Reuse existing AudioContext if it exists (created by playAudio)
      // Creating a new one would orphan gain nodes and scheduled sources from playback
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioContext({ sampleRate: 16000 });
        console.log("[Custom Voice] 🔊 Created new AudioContext for microphone");
      } else {
        console.log("[Custom Voice] 🔊 Reusing existing AudioContext");
      }
      
      // Resume audio context if suspended
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
        console.log("[Custom Voice] ✅ Audio context resumed from suspended state");
      }
      
      try {
        // Load AudioWorklet processor (modern API, replaces deprecated ScriptProcessorNode)
        await audioContextRef.current.audioWorklet.addModule('/audio-processor.js');

        const source = audioContextRef.current.createMediaStreamSource(stream);

        // Add a GainNode to amplify quiet microphones at the hardware level
        const gainNode = audioContextRef.current.createGain();
        gainNode.gain.value = 3.0; // 3x amplification before processing

        const processor = new AudioWorkletNode(audioContextRef.current, 'audio-processor');
        processorRef.current = processor;
        
        // Handle audio data and VAD events from AudioWorklet
        processor.port.onmessage = (event) => {
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          // RESPONSIVE BARGE-IN with ECHO PROTECTION (AudioWorklet)
          // - Lowered thresholds for faster interruption (0.08 RMS, 0.15 peak)
          // - Reduced 300ms cooldown (was 500ms) for snappier response
          // - Still distinguishes user speech from echo/ambient
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          if (event.data.type === 'speech_start') {
            // If tutor is currently speaking, we need confidence that this is
            // the USER speaking and not just echo from the speakers
            if (isTutorSpeakingRef.current && isPlayingRef.current) {
              const rms = event.data.rms || 0;
              const peak = event.data.peak || 0;
              const now = Date.now();
              const timeSincePlayback = now - lastAudioPlaybackStartRef.current;
              
              // Skip VAD for 300ms after tutor audio starts (reduced from 500ms for faster response)
              if (timeSincePlayback < 300) {
                console.log(`[Custom Voice] ⏱️ VAD cooldown active (${(300 - timeSincePlayback).toFixed(0)}ms) - ignoring speech`);
                return;
              }

              // Lowered thresholds for more responsive interruption
              // Real user speech should be RMS 0.08+, ambient noise is typically 0.02-0.04
              const BARGE_IN_RMS = 0.08;   // Lowered from 0.12 for faster interrupt
              const BARGE_IN_PEAK = 0.15;  // Lowered from 0.25 for faster interrupt

              if (rms < BARGE_IN_RMS && peak < BARGE_IN_PEAK) {
                console.log(`[Custom Voice] 🔇 VAD: Ignoring ambient sound during tutor (rms=${rms.toFixed(4)}, peak=${peak.toFixed(4)}) - below barge-in threshold`);
                return;
              }

              console.log(`[Custom Voice] 🛑 VAD: CONFIRMED barge-in (rms=${rms.toFixed(4)}, peak=${peak.toFixed(4)}) - stopping tutor`);
              stopAudio();
              setIsTutorSpeaking(false);

              // Notify server for state sync
              wsRef.current.send(JSON.stringify({ type: "speech_detected" }));
            } else {
              // Tutor not speaking, just log for debugging
              console.log("[Custom Voice] 🎤 VAD: Speech detected (tutor not playing)");
            }
            return;
          }

          if (event.data.type === 'speech_end') {
            console.log("[Custom Voice] 🔇 VAD: Speech ended");
            return;
          }
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

          const float32Data = event.data.data; // Float32Array from AudioWorklet

          // Convert Float32 to PCM16 with gain amplification and SOFT LIMITING
          // Note: We already have 3x hardware gain from GainNode, so use moderate software gain
          const GAIN = 10; // Reduced from 30 to prevent clipping (30x total with 3x hardware)
          const SOFT_THRESHOLD = 0.8; // Start soft limiting at 80% of max amplitude
          
          // Soft limiting function - prevents harsh clipping that breaks Deepgram STT
          // Uses tanh-based compression for values above threshold
          const softLimit = (x: number): number => {
            const absX = Math.abs(x);
            if (absX < SOFT_THRESHOLD) return x;
            const sign = x > 0 ? 1 : -1;
            const excess = absX - SOFT_THRESHOLD;
            const headroom = 1.0 - SOFT_THRESHOLD;
            // Smooth compression: excess is compressed using tanh
            const compressed = SOFT_THRESHOLD + headroom * Math.tanh(excess / headroom * 2);
            return sign * Math.min(compressed, 0.98); // Never quite hit 1.0
          };
          
          const pcm16 = new Int16Array(float32Data.length);
          for (let i = 0; i < float32Data.length; i++) {
            const amplified = float32Data[i] * GAIN;
            const limited = softLimit(amplified);
            pcm16[i] = limited < 0 ? limited * 0x8000 : limited * 0x7FFF;
          }

          const uint8Array = new Uint8Array(pcm16.buffer);
          const binaryString = Array.from(uint8Array).map(byte => String.fromCharCode(byte)).join('');

          wsRef.current.send(JSON.stringify({
            type: "audio",
            data: btoa(binaryString),
          }));
        };

        // Connect: source -> gainNode -> processor -> destination
        source.connect(gainNode);
        gainNode.connect(processor);
        processor.connect(audioContextRef.current.destination);

        console.log("[Custom Voice] 🔊 Audio chain: mic -> gain(3x) -> worklet -> destination");
      } catch (workletError) {
        console.warn('[Custom Voice] ⚠️ AudioWorklet not supported, falling back to ScriptProcessorNode:', workletError);

        // Fallback to ScriptProcessorNode for older browsers
        const source = audioContextRef.current.createMediaStreamSource(stream);

        // Add gain node for fallback path too
        const gainNode = audioContextRef.current.createGain();
        gainNode.gain.value = 3.0; // 3x amplification

        const processor = audioContextRef.current.createScriptProcessor(2048, 1, 1); // Smaller buffer for lower latency
        processorRef.current = processor as any;

        // VAD state for fallback processor
        let speechActive = false;
        let silentChunks = 0;
        let speechStartTime = 0; // Track when speech detected
        let speechEndTime = 0; // Track when silence started
        
        const MAX_SILENT_CHUNKS = 5; // Only ~100ms of silence before considering speech ended
        const VAD_THRESHOLD = 0.06; // Base speech detection threshold (was 0.003, too low)
        const SPEECH_DEBOUNCE_MS = 150; // Require 150ms of sustained speech to trigger
        const SILENCE_DEBOUNCE_MS = 300; // Require 300ms of sustained silence to end

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

          // Calculate RMS for VAD
          let sumSquares = 0;
          let maxAmplitude = 0;
          for (let i = 0; i < inputData.length; i++) {
            const amplitude = Math.abs(inputData[i]);
            sumSquares += inputData[i] * inputData[i];
            if (amplitude > maxAmplitude) maxAmplitude = amplitude;
          }
          const rms = Math.sqrt(sumSquares / inputData.length);

          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          // RESPONSIVE VAD with ECHO PROTECTION for ScriptProcessor fallback
          // - Lowered barge-in thresholds (0.08 RMS, 0.15 peak)
          // - Reduced 300ms cooldown (was 500ms) for snappier response
          // - Debounce timing (150-300ms)
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          
          // VAD: detect speech based on RMS or peak amplitude
          const hasAudio = rms > VAD_THRESHOLD || maxAmplitude > 0.02;
          const now = Date.now();
          const timeSincePlayback = now - lastAudioPlaybackStartRef.current;
          
          if (hasAudio && !speechActive) {
            // Skip VAD for 300ms after tutor audio starts (reduced from 500ms)
            if (isTutorSpeakingRef.current && isPlayingRef.current && timeSincePlayback < 300) {
              console.log(`[Custom Voice] ⏱️ VAD cooldown active (${(300 - timeSincePlayback).toFixed(0)}ms remaining) - ignoring speech`);
              return;
            }
            
            // If tutor is currently speaking, check for user speech above threshold
            // Lowered from 0.12/0.25 for more responsive interruption
            if (isTutorSpeakingRef.current && isPlayingRef.current) {
              const BARGE_IN_RMS_THRESHOLD = 0.08; // Lowered from 0.12
              const BARGE_IN_PEAK_THRESHOLD = 0.15; // Lowered from 0.25

              if (rms < BARGE_IN_RMS_THRESHOLD || maxAmplitude < BARGE_IN_PEAK_THRESHOLD) {
                console.log(`[Custom Voice] 🔇 VAD (fallback): Ignoring ambient sound during tutor (rms=${rms.toFixed(4)}, peak=${maxAmplitude.toFixed(4)}) - below barge-in threshold`);
                return;
              }
              
              // Start debounce timer for sustained speech
              if (speechStartTime === 0) {
                speechStartTime = now;
                console.log(`[Custom Voice] 🎤 VAD (fallback): Speech onset detected (rms=${rms.toFixed(4)}, starting 150ms debounce...)`);
                return; // Wait for debounce
              }
              
              // Check if speech sustained for 150ms
              if (now - speechStartTime < SPEECH_DEBOUNCE_MS) {
                console.log(`[Custom Voice] ⏱️ VAD debounce: ${(now - speechStartTime).toFixed(0)}ms - waiting for sustained speech`);
                return;
              }
              
              // Speech confirmed after debounce - trigger barge-in
              speechActive = true;
              silentChunks = 0;
              speechStartTime = 0;
              console.log(`[Custom Voice] 🛑 VAD (fallback): CONFIRMED barge-in after debounce (rms=${rms.toFixed(4)}, peak=${maxAmplitude.toFixed(4)})`);
              stopAudio();
              setIsTutorSpeaking(false);
              wsRef.current.send(JSON.stringify({ type: "speech_detected" }));
            } else {
              // Tutor not speaking - lower threshold OK
              if (speechStartTime === 0) {
                speechStartTime = now;
                console.log("[Custom Voice] 🎤 VAD (fallback): Speech onset (tutor not playing)");
                return; // Wait for debounce
              }
              
              if (now - speechStartTime < SPEECH_DEBOUNCE_MS) {
                return;
              }
              
              speechActive = true;
              silentChunks = 0;
              speechStartTime = 0;
              console.log("[Custom Voice] 🎤 VAD (fallback): Speech confirmed (tutor not playing)");
            }
          } else if (!hasAudio && speechActive) {
            // Debounce speech end: require 300ms of silence
            if (speechEndTime === 0) {
              speechEndTime = now;
              console.log("[Custom Voice] ⏱️ VAD (fallback): Silence detected, starting 300ms debounce...");
              return;
            }
            
            if (now - speechEndTime < SILENCE_DEBOUNCE_MS) {
              console.log(`[Custom Voice] ⏱️ VAD silence debounce: ${(now - speechEndTime).toFixed(0)}ms`);
              return;
            }
            
            // Confirmed silence
            speechActive = false;
            speechEndTime = 0;
            silentChunks = 0;
            console.log("[Custom Voice] 🔇 VAD (fallback): Speech ended (confirmed)");
          } else if (hasAudio && speechActive) {
            // Reset silence debounce timer if sound detected
            speechEndTime = 0;
            silentChunks = 0;
          } else if (!hasAudio && !speechActive) {
            // Stay silent, reset timers
            speechStartTime = 0;
            speechEndTime = 0;
          }
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

          // Convert to PCM16 with amplification and SOFT LIMITING
          // Note: We already have 3x hardware gain from GainNode, so use moderate software gain
          const GAIN = 10; // Reduced from 30 to prevent clipping (30x total with 3x hardware)
          const SOFT_THRESHOLD = 0.8; // Start soft limiting at 80% of max amplitude
          
          // Soft limiting function - prevents harsh clipping that breaks Deepgram STT
          // Uses tanh-based compression for values above threshold
          const softLimit = (x: number): number => {
            const absX = Math.abs(x);
            if (absX < SOFT_THRESHOLD) return x;
            const sign = x > 0 ? 1 : -1;
            const excess = absX - SOFT_THRESHOLD;
            const headroom = 1.0 - SOFT_THRESHOLD;
            // Smooth compression: excess is compressed using tanh
            const compressed = SOFT_THRESHOLD + headroom * Math.tanh(excess / headroom * 2);
            return sign * Math.min(compressed, 0.98); // Never quite hit 1.0
          };
          
          const pcm16 = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            const amplified = inputData[i] * GAIN;
            const limited = softLimit(amplified);
            pcm16[i] = limited < 0 ? limited * 0x8000 : limited * 0x7FFF;
          }

          const uint8Array = new Uint8Array(pcm16.buffer);
          const binaryString = Array.from(uint8Array).map(byte => String.fromCharCode(byte)).join('');

          wsRef.current.send(JSON.stringify({
            type: "audio",
            data: btoa(binaryString),
          }));
        };

        // Connect: source -> gainNode -> processor -> destination
        source.connect(gainNode);
        gainNode.connect(processor);
        processor.connect(audioContextRef.current.destination);

        console.log("[Custom Voice] 🔊 Audio chain (fallback): mic -> gain(3x) -> processor -> destination");
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

  const MAX_AUDIO_QUEUE_SIZE = 20; // Prevent unbounded queue growth
  
  const playAudio = async (base64Audio: string) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
    }

    try {
      // Safety: Prevent unbounded queue growth if playback stalls
      if (audioQueueRef.current.length >= MAX_AUDIO_QUEUE_SIZE) {
        console.warn(`[Custom Voice] ⚠️ Audio queue at max capacity (${MAX_AUDIO_QUEUE_SIZE}), dropping oldest chunks`);
        audioQueueRef.current = audioQueueRef.current.slice(-10); // Keep last 10 chunks
      }
      
      // Resume audio context if suspended (browser autoplay policy)
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const audioData = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0));
      
      // Convert PCM16 to Float32 for Web Audio API
      const pcm16 = new Int16Array(audioData.buffer);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768.0;
      }

      const audioBuffer = audioContextRef.current.createBuffer(1, float32.length, 16000);
      audioBuffer.getChannelData(0).set(float32);
      
      // Add to queue and schedule immediately for seamless playback
      audioQueueRef.current.push(audioBuffer);
      
      if (!isPlayingRef.current) {
        // First chunk - start playback chain
        isPlayingRef.current = true;
        nextPlayTimeRef.current = audioContextRef.current.currentTime;
        scheduleNextChunks();
      } else {
        // Already playing - schedule this new chunk seamlessly
        scheduleNextChunks();
      }
      
    } catch (error) {
      console.error("[Custom Voice] ❌ Audio playback error:", error);
    }
  };

  const scheduleNextChunks = () => {
    if (!audioContextRef.current) return;
    
    const ctx = audioContextRef.current;
    const CROSSFADE_DURATION = 0.015; // 15ms crossfade between chunks
    
    // Create shared gain node for playback if not exists or if context changed
    // The gain node must belong to the current context
    if (!playbackGainNodeRef.current) {
      playbackGainNodeRef.current = ctx.createGain();
      playbackGainNodeRef.current.connect(ctx.destination);
      console.log("[Custom Voice] 🔊 Created playback gain node");
    }
    
    // Schedule all queued chunks
    while (audioQueueRef.current.length > 0) {
      const audioBuffer = audioQueueRef.current.shift()!;
      
      // Ensure we're scheduling in the future
      const scheduleTime = Math.max(ctx.currentTime + 0.001, nextPlayTimeRef.current);
      
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      
      // Create individual gain node for crossfade
      const chunkGain = ctx.createGain();
      source.connect(chunkGain);
      chunkGain.connect(playbackGainNodeRef.current);
      
      // Apply subtle crossfade: fade in at start, fade out at end
      const duration = audioBuffer.duration;
      chunkGain.gain.setValueAtTime(0.85, scheduleTime);
      chunkGain.gain.linearRampToValueAtTime(1.0, scheduleTime + Math.min(CROSSFADE_DURATION, duration * 0.1));
      chunkGain.gain.setValueAtTime(1.0, scheduleTime + duration - Math.min(CROSSFADE_DURATION, duration * 0.1));
      chunkGain.gain.linearRampToValueAtTime(0.85, scheduleTime + duration);
      
      // Track this source for cleanup on interruption
      scheduledSourcesRef.current.push(source);
      currentAudioSourceRef.current = source;
      
      // Clean up when this chunk ends
      source.onended = () => {
        // Remove from tracked sources
        const idx = scheduledSourcesRef.current.indexOf(source);
        if (idx > -1) {
          scheduledSourcesRef.current.splice(idx, 1);
        }
        
        // Check if all playback complete
        if (scheduledSourcesRef.current.length === 0 && audioQueueRef.current.length === 0) {
          isPlayingRef.current = false;
          setIsTutorSpeaking(false);
          currentAudioSourceRef.current = null;
        }
      };
      
      // CRITICAL: Start playback at scheduled time (no gaps!)
      try {
        source.start(scheduleTime);
        console.log(`[Custom Voice] 🔊 Scheduled audio chunk at ${scheduleTime.toFixed(3)}s, duration: ${duration.toFixed(3)}s`);
      } catch (startError) {
        console.error("[Custom Voice] ❌ Failed to start audio source:", startError);
      }
      
      // Update next play time: slight overlap for seamless transition
      nextPlayTimeRef.current = scheduleTime + duration - 0.005; // 5ms overlap
    }
  };

  const stopAudio = () => {
    console.log("[Custom Voice] ⏹️ Stopping audio playback");
    
    // Stop ALL scheduled audio sources with smooth fadeout
    if (playbackGainNodeRef.current && audioContextRef.current) {
      const now = audioContextRef.current.currentTime;
      // Quick fadeout to avoid clicks
      playbackGainNodeRef.current.gain.cancelScheduledValues(now);
      playbackGainNodeRef.current.gain.setValueAtTime(playbackGainNodeRef.current.gain.value, now);
      playbackGainNodeRef.current.gain.linearRampToValueAtTime(0, now + 0.05); // 50ms fadeout
    }
    
    // Stop all scheduled sources
    scheduledSourcesRef.current.forEach(source => {
      try {
        source.stop();
        source.disconnect();
      } catch (e) {
        // Source might already be stopped
      }
    });
    scheduledSourcesRef.current = [];
    
    // Stop current audio source
    if (currentAudioSourceRef.current) {
      try {
        currentAudioSourceRef.current.stop();
        currentAudioSourceRef.current.disconnect();
      } catch (e) {
        // Source might already be stopped
      }
      currentAudioSourceRef.current = null;
    }
    
    // Clear the audio queue and reset state
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    nextPlayTimeRef.current = 0;
    
    // Reset gain node for next playback
    if (playbackGainNodeRef.current && audioContextRef.current) {
      const now = audioContextRef.current.currentTime;
      playbackGainNodeRef.current.gain.setValueAtTime(1.0, now + 0.06);
    }
    
    console.log("[Custom Voice] ✅ Audio stopped smoothly, microphone still active");
  };

  const cleanup = () => {
    stopAudio();
    
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

    // Disconnect playback gain node before closing context
    if (playbackGainNodeRef.current) {
      try {
        playbackGainNodeRef.current.disconnect();
      } catch (e) {
        // Already disconnected
      }
      playbackGainNodeRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    audioQueueRef.current = [];
    scheduledSourcesRef.current = [];
    isPlayingRef.current = false;
    nextPlayTimeRef.current = 0;
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