import { useState, useRef, useCallback, useEffect } from "react";
import { VOICE_TIMING, VOICE_THRESHOLDS, VOICE_MESSAGES, EXCLUDED_DEVICE_PATTERNS, ADAPTIVE_BARGE_IN, GradeBandType, TURN_TAKING_FLAGS, FILLER_WORDS } from "@/config/voice-constants";
import { voiceLogger } from "@/utils/voice-logger";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ADAPTIVE BARGE-IN: Duck-then-confirm flow for quiet/nervous speakers
// Feature flag: BARGE_IN_ADAPTIVE_ENABLED (from server config)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface BaselineState {
  samples: number[];
  timestamps: number[];
}

interface DuckState {
  isActive: boolean;
  startTime: number;
  originalGain: number;
  speechStartTime: number;
}

function createBaselineState(): BaselineState {
  return { samples: [], timestamps: [] };
}

function createDuckState(): DuckState {
  return {
    isActive: false,
    startTime: 0,
    originalGain: 1.0,
    speechStartTime: 0,
  };
}

function updateBaseline(state: BaselineState, rms: number, windowMs: number): void {
  const now = Date.now();
  state.samples.push(rms);
  state.timestamps.push(now);
  
  const cutoff = now - windowMs;
  while (state.timestamps.length > 0 && state.timestamps[0] < cutoff) {
    state.samples.shift();
    state.timestamps.shift();
  }
  if (state.samples.length > 100) {
    state.samples = state.samples.slice(-100);
    state.timestamps = state.timestamps.slice(-100);
  }
}

function getBaselineMedian(state: BaselineState): number {
  if (state.samples.length === 0) return 0.01;
  const sorted = [...state.samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 
    ? (sorted[mid - 1] + sorted[mid]) / 2 
    : sorted[mid];
}

function getBargeInConfig(gradeBand: string | null): { adaptiveRatio: number; minSpeechMs: number; rmsThreshold: number; peakThreshold: number } {
  if (!gradeBand) return ADAPTIVE_BARGE_IN.DEFAULT;
  const normalized = gradeBand.toUpperCase().replace(/[^A-Z0-9-]/g, '') as GradeBandType;
  return ADAPTIVE_BARGE_IN.GRADE_BANDS[normalized] || ADAPTIVE_BARGE_IN.DEFAULT;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TURN-TAKING HELPERS (Jan 2026)
// Fix ghost turns and interruption gating
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// A) Single truth function for tutor speaking state
interface TutorSpeakingState {
  isTutorSpeakingFlag: boolean;
  isPlayingFlag: boolean;
  audioQueueSize: number;
  scheduledSourcesCount: number;
}

function isTutorActuallySpeaking(state: TutorSpeakingState): boolean {
  return Boolean(
    state.isTutorSpeakingFlag ||
    state.isPlayingFlag ||
    state.audioQueueSize > 0 ||
    state.scheduledSourcesCount > 0
  );
}

// C) Ghost turn guardrails - check if text is valid student turn
function isValidStudentTurn(text: string, lastFinalTranscript: string, lastFinalTimestamp: number): { valid: boolean; reason: string } {
  if (!TURN_TAKING_FLAGS.GHOST_GUARD_ENABLED) {
    return { valid: true, reason: 'guard_disabled' };
  }
  
  const trimmed = text.trim().toLowerCase();
  
  // C1) Minimum content guard
  if (trimmed.length < TURN_TAKING_FLAGS.MIN_TURN_CHARS) {
    return { valid: false, reason: 'min_content' };
  }
  
  // Check if only punctuation
  if (/^[.,!?;:\-'"()[\]{}]+$/.test(trimmed)) {
    return { valid: false, reason: 'punctuation_only' };
  }
  
  // Check if only filler words
  const words = trimmed.split(/\s+/).filter(w => w.length > 0);
  const nonFillerWords = words.filter(w => !FILLER_WORDS.includes(w as any));
  if (nonFillerWords.length === 0 && words.length > 0) {
    return { valid: false, reason: 'filler_only' };
  }
  
  // C2) Duplicate transcript guard
  const now = Date.now();
  if (trimmed === lastFinalTranscript.trim().toLowerCase() && 
      (now - lastFinalTimestamp) < TURN_TAKING_FLAGS.DUPLICATE_WINDOW_MS) {
    return { valid: false, reason: 'duplicate' };
  }
  
  return { valid: true, reason: 'valid' };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VAD PROFILES: Turn-taking parameters for different learner types
// VAD is ONLY for: 1) UI speech detection 2) Barge-in to stop tutor
// Turn commits are controlled by AssemblyAI end_of_turn, NOT by VAD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
type VADProfileName = 'BALANCED' | 'PATIENT' | 'FAST';

interface VADProfile {
  minSpeechMs: number;        // Minimum speech duration before considering valid
  endSilenceMs: number;       // Silence duration before VAD speech_end
  coalesceWindowMs: number;   // Window to merge rapid speech events
  thinkPauseGraceMs: number;  // Grace period for thinking pauses
  minBargeInSpeechMs: number; // Minimum sustained speech for barge-in
  minBargeInEnergyMs: number; // Minimum sustained energy for barge-in
}

const VAD_PROFILES: Record<VADProfileName, VADProfile> = {
  BALANCED: {
    minSpeechMs: 250,
    endSilenceMs: 850,
    coalesceWindowMs: 2200,
    thinkPauseGraceMs: 1400,
    minBargeInSpeechMs: 400,
    minBargeInEnergyMs: 220,
  },
  PATIENT: {
    minSpeechMs: 200,
    endSilenceMs: 1100,
    coalesceWindowMs: 3000,
    thinkPauseGraceMs: 2200,
    minBargeInSpeechMs: 550,
    minBargeInEnergyMs: 260,
  },
  FAST: {
    minSpeechMs: 300,
    endSilenceMs: 650,
    coalesceWindowMs: 1500,
    thinkPauseGraceMs: 900,
    minBargeInSpeechMs: 350,
    minBargeInEnergyMs: 200,
  },
};

// Current active profile - starts BALANCED, can auto-escalate to PATIENT
let activeVADProfile: VADProfileName = 'BALANCED';
let sessionStartTime = 0;
let shortBurstCount = 0;  // Track bursts < 500ms for auto-escalation

interface TranscriptMessage {
  speaker: "student" | "tutor" | "system";
  text: string;
  timestamp?: string;
  isPartial?: boolean;
}

interface MicrophoneError {
  message: string;
  troubleshooting: string[];
  errorType: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MIC STATUS INDICATOR: Track current microphone/voice state for UI
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export type MicStatus = 
  | 'mic_off'           // Microphone disabled by user
  | 'listening'         // Mic on, waiting for speech
  | 'hearing_you'       // Detected student speech
  | 'ignoring_noise'    // Detected background noise (not speech)
  | 'tutor_speaking'    // TTS playback in progress
  | 'processing'        // Waiting for AI response
  | 'reconnecting'      // STT connection being re-established
  | 'error'             // STT connection failed
  | 'silent';           // Mic is receiving silent/empty audio

// Hysteresis timing constants (prevents flicker)
const MIC_STATUS_HYSTERESIS = {
  ENTER_HEARING_YOU_MS: 300,    // 250-400ms to enter "Hearing You"
  EXIT_HEARING_YOU_MS: 600,     // 500-800ms to exit "Hearing You"
  ENTER_IGNORING_NOISE_MS: 800, // Sustained non-speech audio before showing
  EXIT_IGNORING_NOISE_MS: 400,  // Quick exit when noise stops
};

export function useCustomVoice() {
  const [isConnected, setIsConnected] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [microphoneError, setMicrophoneError] = useState<MicrophoneError | null>(null);
  const [isTutorSpeaking, setIsTutorSpeaking] = useState(false);
  const [isTutorThinking, setIsTutorThinking] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // MIC STATUS STATE: Authoritative state driven by server WebSocket events
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const [micStatus, setMicStatus] = useState<MicStatus>('mic_off');
  const micStatusTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingMicStatusRef = useRef<MicStatus | null>(null);
  const lastSpeechDetectedRef = useRef<number>(0);
  const lastNoiseDetectedRef = useRef<number>(0);
  
  // THINKING INDICATOR: Track current turn for matching events
  const thinkingTurnIdRef = useRef<string | null>(null);
  
  // iOS/mobile audio unlock state
  const audioUnlockedRef = useRef<boolean>(false);
  
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
  
  // Track if stream cleanup has been triggered to prevent spam logging
  const streamCleanupTriggeredRef = useRef<boolean>(false);
  
  // Track auto-recovery for unexpected audio track deaths
  // Uses a Promise-based mutex to serialize recovery attempts
  const recoveryPromiseRef = useRef<Promise<void> | null>(null);
  const selectedMicrophoneIdRef = useRef<string | null>(null);  // Store original device ID
  const selectedMicrophoneLabelRef = useRef<string | null>(null);  // Store device label as backup
  
  // Timer tracking for proper cleanup
  const timersRef = useRef<Set<NodeJS.Timeout>>(new Set());
  const intervalsRef = useRef<Set<NodeJS.Timeout>>(new Set());
  
  // Audio buffer queue for reconnection resilience
  const audioBufferQueueRef = useRef<ArrayBuffer[]>([]);
  const isReconnectingRef = useRef<boolean>(false);
  
  // Refs for state used in async callbacks (prevents stale closures)
  const isConnectedRef = useRef<boolean>(false);
  const isProcessingRef = useRef<boolean>(false);
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ADAPTIVE BARGE-IN STATE (Feature flag: BARGE_IN_ADAPTIVE_ENABLED)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const adaptiveBargeInEnabledRef = useRef<boolean>(false); // Set from server config
  const baselineStateRef = useRef<BaselineState>(createBaselineState());
  const duckStateRef = useRef<DuckState>(createDuckState());
  const gradeBandRef = useRef<string | null>(null); // Set from session config
  const activityModeRef = useRef<'default' | 'reading'>('default'); // Set from session config
  
  // Check if user allows virtual audio devices
  const getAllowVirtualAudio = (): boolean => {
    try {
      return localStorage.getItem('jie-allow-virtual-audio') === 'true';
    } catch {
      return false;
    }
  };

  // Find best microphone by filtering out system audio devices (respects user's virtual audio preference)
  const findBestMicrophone = async (): Promise<string | null> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const microphones = devices.filter(d => d.kind === 'audioinput');
      const allowVirtual = getAllowVirtualAudio();
      
      // Filter out system audio devices unless user explicitly enabled virtual devices
      const realMics = microphones.filter(mic => {
        if (allowVirtual) return true;
        const label = mic.label.toLowerCase();
        return !EXCLUDED_DEVICE_PATTERNS.some(pattern => label.includes(pattern));
      });
      
      if (realMics.length > 0) {
        voiceLogger.debug(`Found ${realMics.length} real microphone(s) after filtering (allowVirtual=${allowVirtual})`);
        return realMics[0].deviceId;
      }
      
      return null;
    } catch (error) {
      voiceLogger.error('Error finding best microphone:', error);
      return null;
    }
  };
  
  // Find microphone by label - helps when device IDs change between sessions
  const findMicrophoneByLabel = async (label: string): Promise<string | null> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const microphones = devices.filter(d => d.kind === 'audioinput');
      
      // Exact match
      const exactMatch = microphones.find(m => m.label === label);
      if (exactMatch) {
        voiceLogger.debug(`Found microphone by exact label match: ${label}`);
        return exactMatch.deviceId;
      }
      
      // Partial match (first few characters)
      const partialMatch = microphones.find(m => 
        m.label.toLowerCase().includes(label.substring(0, 10).toLowerCase())
      );
      if (partialMatch) {
        voiceLogger.debug(`Found microphone by partial label match: ${partialMatch.label}`);
        return partialMatch.deviceId;
      }
      
      return null;
    } catch (error) {
      voiceLogger.error('Error finding microphone by label:', error);
      return null;
    }
  };
  
  // Safe timer functions with tracking for proper cleanup
  const safeSetTimeout = useCallback((callback: () => void, ms: number): NodeJS.Timeout => {
    const id = setTimeout(() => {
      timersRef.current.delete(id);
      callback();
    }, ms);
    timersRef.current.add(id);
    return id;
  }, []);

  const safeSetInterval = useCallback((callback: () => void, ms: number): NodeJS.Timeout => {
    const id = setInterval(callback, ms);
    intervalsRef.current.add(id);
    return id;
  }, []);

  const safeClearTimeout = useCallback((id: NodeJS.Timeout) => {
    clearTimeout(id);
    timersRef.current.delete(id);
  }, []);

  const safeClearInterval = useCallback((id: NodeJS.Timeout) => {
    clearInterval(id);
    intervalsRef.current.delete(id);
  }, []);

  const cleanupAllTimers = useCallback(() => {
    timersRef.current.forEach(id => clearTimeout(id));
    timersRef.current.clear();
    intervalsRef.current.forEach(id => clearInterval(id));
    // Also clear mic status timer
    if (micStatusTimerRef.current) {
      clearTimeout(micStatusTimerRef.current);
      micStatusTimerRef.current = null;
    }
    pendingMicStatusRef.current = null;
    intervalsRef.current.clear();
  }, []);

  // Sync state refs whenever state changes (prevents stale closures in callbacks)
  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  // Add transcript message with size limiting
  const addTranscriptMessage = useCallback((message: TranscriptMessage) => {
    setTranscript(prev => {
      const updated = [...prev, message];
      
      if (updated.length > VOICE_THRESHOLDS.TRANSCRIPT_TRIM_THRESHOLD) {
        const systemMessages = updated.filter(m => 
          m.speaker === 'system' && 
          (m.text.includes('Session started') || m.text.includes('Document loaded') || m.text.includes('uploaded'))
        );
        
        const recentMessages = updated.slice(-VOICE_THRESHOLDS.MAX_TRANSCRIPT_MESSAGES);
        
        const merged = [...systemMessages];
        for (const msg of recentMessages) {
          if (!merged.some(m => m.timestamp === msg.timestamp && m.text === msg.text)) {
            merged.push(msg);
          }
        }
        
        return merged.sort((a, b) => 
          new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime()
        );
      }
      
      return updated;
    });
  }, []);

  // Update partial transcript (replaces previous partial, doesn't accumulate)
  const updatePartialTranscript = useCallback((text: string) => {
    setTranscript(prev => {
      const withoutPartial = prev.filter(m => !m.isPartial);
      return [...withoutPartial, {
        speaker: 'student' as const,
        text,
        isPartial: true,
        timestamp: new Date().toISOString()
      }];
    });
  }, []);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // MIC STATUS HELPERS: Update with hysteresis to prevent flicker
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const updateMicStatus = useCallback((newStatus: MicStatus, immediate = false) => {
    // Clear any pending transition
    if (micStatusTimerRef.current) {
      clearTimeout(micStatusTimerRef.current);
      micStatusTimerRef.current = null;
    }
    
    // Immediate updates for high-priority states
    if (immediate || newStatus === 'mic_off' || newStatus === 'processing' || newStatus === 'tutor_speaking') {
      pendingMicStatusRef.current = null;
      setMicStatus(newStatus);
      return;
    }
    
    // Determine hysteresis delay based on transition type
    setMicStatus(prev => {
      let delay = 0;
      
      if (newStatus === 'hearing_you' && prev !== 'hearing_you') {
        // Entering "Hearing You" - require sustained speech
        delay = MIC_STATUS_HYSTERESIS.ENTER_HEARING_YOU_MS;
      } else if (prev === 'hearing_you' && newStatus === 'listening') {
        // Exiting "Hearing You" - longer delay to prevent flicker
        delay = MIC_STATUS_HYSTERESIS.EXIT_HEARING_YOU_MS;
      } else if (newStatus === 'ignoring_noise' && prev !== 'ignoring_noise') {
        // Entering "Ignoring Noise" - require sustained non-speech audio
        delay = MIC_STATUS_HYSTERESIS.ENTER_IGNORING_NOISE_MS;
      } else if (prev === 'ignoring_noise' && newStatus === 'listening') {
        // Exiting "Ignoring Noise" - quicker exit
        delay = MIC_STATUS_HYSTERESIS.EXIT_IGNORING_NOISE_MS;
      }
      
      if (delay > 0) {
        pendingMicStatusRef.current = newStatus;
        micStatusTimerRef.current = setTimeout(() => {
          if (pendingMicStatusRef.current === newStatus) {
            setMicStatus(newStatus);
            pendingMicStatusRef.current = null;
          }
          micStatusTimerRef.current = null;
        }, delay);
        return prev; // Keep current status during hysteresis
      }
      
      pendingMicStatusRef.current = null;
      return newStatus;
    });
  }, []);

  // Audio queue functions for reconnection resilience
  const queueAudioChunk = useCallback((chunk: ArrayBuffer) => {
    if (audioBufferQueueRef.current.length < VOICE_TIMING.AUDIO_QUEUE_MAX_CHUNKS) {
      audioBufferQueueRef.current.push(chunk);
      voiceLogger.debug(`Queued audio chunk (${audioBufferQueueRef.current.length} in queue)`);
    }
  }, []);

  const flushAudioQueue = useCallback(() => {
    const queuedChunks = audioBufferQueueRef.current;
    audioBufferQueueRef.current = [];
    
    if (queuedChunks.length > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
      voiceLogger.info(`Flushing ${queuedChunks.length} queued audio chunks`);
      queuedChunks.forEach(chunk => {
        wsRef.current?.send(JSON.stringify({
          type: "audio",
          data: Array.from(new Uint8Array(chunk))
        }));
      });
    }
  }, []);

  // Cleanup helper - safely cleans up mic resources
  // Sets streamCleanupTriggeredRef BEFORE stopping to prevent onended from triggering recovery
  const cleanupMicResources = () => {
    // CRITICAL: Set flag BEFORE stopping tracks to prevent onended from triggering false recovery
    streamCleanupTriggeredRef.current = true;
    
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (processorRef.current) {
      try { processorRef.current.disconnect(); } catch (e) { /* ignore */ }
      processorRef.current = null;
    }
    
    // Reset flag after cleanup is complete - new startMicrophone will set it to false
  };
  
  // Dedicated recovery function with multi-stage retry strategy
  // Stage 1: Exact deviceId (same device)
  // Stage 2: Match by label (device label changed)
  // Stage 3: Filter & pick best microphone (avoid Stereo Mix)
  const attemptMicRecovery = async () => {
    // Don't recover if mic is intentionally disabled
    if (!micEnabledRef.current) {
      voiceLogger.info('Mic disabled, skipping recovery');
      return;
    }
    
    // If recovery is already in progress, wait for it to complete
    if (recoveryPromiseRef.current) {
      voiceLogger.info('Recovery already in progress, waiting...');
      try {
        await recoveryPromiseRef.current;
      } catch (e) { /* ignore */ }
      // After waiting, check if stream is now healthy
      const currentStream = mediaStreamRef.current as MediaStream | null;
      if (currentStream && currentStream.active) {
        voiceLogger.info('Stream already recovered by previous attempt');
        return;
      }
      // Otherwise fall through to start a new recovery
    }
    
    // Start new recovery - create and store the promise
    const recoveryPromise = (async () => {
      let lastError: unknown = null;
      
      for (let attempt = 1; attempt <= VOICE_TIMING.MIC_RECOVERY_MAX_ATTEMPTS; attempt++) {
        voiceLogger.info(`Auto-recovering microphone (attempt ${attempt}/${VOICE_TIMING.MIC_RECOVERY_MAX_ATTEMPTS})...`);
        
        // Clean up old resources first (sets streamCleanupTriggeredRef to prevent false triggers)
        cleanupMicResources();
        
        // Stage 1: Try exact device ID first
        if (selectedMicrophoneIdRef.current && attempt === 1) {
          const delayMs = 500;
          console.log(`[Custom Voice] ⏳ Waiting ${delayMs}ms for device to stabilize...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          
          try {
            console.log(`[Custom Voice] 🎯 Attempt ${attempt}: Trying exact deviceId`);
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                deviceId: { exact: selectedMicrophoneIdRef.current },
                sampleRate: 16000,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,  // ECHO GUARD
                autoGainControl: true,
              }
            });
            
            // Setup stream and exit recovery, persist to localStorage
            const track = stream.getAudioTracks()[0];
            selectedMicrophoneLabelRef.current = track?.label || '';
            mediaStreamRef.current = stream;
            setupAudioTrackListener(stream);
            setMicrophoneError(null);
            
            // Persist recovered device to localStorage
            try {
              if (selectedMicrophoneIdRef.current) {
                localStorage.setItem('jie-preferred-microphone-id', selectedMicrophoneIdRef.current);
              }
              if (track?.label) localStorage.setItem('jie-preferred-microphone-label', track.label);
            } catch (e) { /* ignore */ }
            
            voiceLogger.info('Recovered with exact deviceId');
            return;
          } catch (e) {
            voiceLogger.warn(`Exact deviceId failed: ${(e as Error).message}`);
          }
        }
        
        // Stage 2: Try matching by label (if we stored it)
        if (selectedMicrophoneLabelRef.current && attempt === 2) {
          const delayMs = 1000;
          console.log(`[Custom Voice] ⏳ Waiting ${delayMs}ms before label-match attempt...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          
          try {
            const matchedDeviceId = await findMicrophoneByLabel(selectedMicrophoneLabelRef.current);
            if (matchedDeviceId) {
              console.log(`[Custom Voice] 🎯 Attempt ${attempt}: Trying label match`);
              const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                  deviceId: { exact: matchedDeviceId },
                  sampleRate: 16000,
                  channelCount: 1,
                  echoCancellation: true,
                  noiseSuppression: true,  // ECHO GUARD
                  autoGainControl: true,
                }
              });
              
              // Update stored ID and setup, persist to localStorage
              const track = stream.getAudioTracks()[0];
              selectedMicrophoneIdRef.current = matchedDeviceId;
              selectedMicrophoneLabelRef.current = track?.label || '';
              mediaStreamRef.current = stream;
              setupAudioTrackListener(stream);
              setMicrophoneError(null);
              
              // Persist recovered device to localStorage
              try {
                localStorage.setItem('jie-preferred-microphone-id', matchedDeviceId);
                if (track?.label) localStorage.setItem('jie-preferred-microphone-label', track.label);
              } catch (e) { /* ignore */ }
              
              voiceLogger.info('Recovered with label match');
              return;
            }
          } catch (e) {
            voiceLogger.warn(`Label match failed: ${(e as Error).message}`);
          }
        }
        
        // Stage 3: Fall back to best microphone (filtered list)
        if (attempt >= 2) {
          const delayMs = 1500;
          console.log(`[Custom Voice] ⏳ Waiting ${delayMs}ms before filtered fallback...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          
          try {
            const bestMicId = await findBestMicrophone();
            if (bestMicId) {
              console.log(`[Custom Voice] 🎯 Attempt ${attempt}: Trying filtered fallback (${bestMicId})`);
              const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                  deviceId: { exact: bestMicId },
                  sampleRate: 16000,
                  channelCount: 1,
                  echoCancellation: true,
                  noiseSuppression: true,  // ECHO GUARD
                  autoGainControl: true,
                }
              });
              
              // Update stored info and setup, persist to localStorage
              const track = stream.getAudioTracks()[0];
              selectedMicrophoneIdRef.current = bestMicId;
              selectedMicrophoneLabelRef.current = track?.label || '';
              mediaStreamRef.current = stream;
              setupAudioTrackListener(stream);
              setMicrophoneError(null);
              
              // Persist recovered device to localStorage
              try {
                localStorage.setItem('jie-preferred-microphone-id', bestMicId);
                if (track?.label) localStorage.setItem('jie-preferred-microphone-label', track.label);
              } catch (e) { /* ignore */ }
              
              voiceLogger.info('Recovered with filtered fallback');
              return;
            }
          } catch (e) {
            voiceLogger.warn(`Filtered fallback failed: ${(e as Error).message}`);
          }
        }
        
        // Give it time before next attempt
        if (attempt < VOICE_TIMING.MIC_RECOVERY_MAX_ATTEMPTS) {
          const nextDelayMs = 500 * (attempt + 1);
          console.log(`[Custom Voice] ⏳ Waiting ${nextDelayMs}ms before next recovery attempt...`);
          await new Promise(resolve => setTimeout(resolve, nextDelayMs));
        }
      }
      
      // All attempts exhausted - ALWAYS show error to user
      console.error('[Custom Voice] ❌ All recovery attempts failed, last error:', lastError);
      setMicrophoneError({
        message: 'Microphone connection lost',
        troubleshooting: [
          'Click the microphone icon to retry',
          'Check if another app is using your microphone',
          'Try refreshing the page'
        ],
        errorType: 'TRACK_ENDED'
      });
    })();
    
    recoveryPromiseRef.current = recoveryPromise;
    
    try {
      await recoveryPromise;
    } finally {
      // Clear the promise only if it's still the current one
      if (recoveryPromiseRef.current === recoveryPromise) {
        recoveryPromiseRef.current = null;
      }
    }
  };
  
  // Manual retry helper - waits for any active recovery, then starts fresh
  const forceStartMicrophone = async () => {
    console.log('[Custom Voice] 🔄 Manual microphone retry requested');
    
    // Wait for any active recovery to complete first
    if (recoveryPromiseRef.current) {
      console.log('[Custom Voice] ℹ️ Waiting for active recovery to complete...');
      try {
        await recoveryPromiseRef.current;
      } catch (e) { /* ignore */ }
    }
    
    // Now start fresh
    cleanupMicResources();
    setMicrophoneError(null);
    await startMicrophone();
  };

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
              // MIC STATUS: Set to listening once mic starts
              updateMicStatus('listening', true);
            } else {
              console.log("[Custom Voice] 🔇 Skipping microphone (Hybrid/Text mode)");
              // MIC STATUS: Mic is off in hybrid/text mode
              updateMicStatus('mic_off', true);
            }
            break;
          
          case "session_config":
            // Receive adaptive barge-in and voice UX configuration from server
            console.log("[Custom Voice] ⚙️ Session config received:", message);
            if (message.adaptiveBargeInEnabled !== undefined) {
              adaptiveBargeInEnabledRef.current = message.adaptiveBargeInEnabled;
              console.log(`[Custom Voice] 🎛️ Adaptive barge-in: ${message.adaptiveBargeInEnabled ? 'ENABLED' : 'disabled'}`);
            }
            if (message.gradeBand) {
              gradeBandRef.current = message.gradeBand;
              console.log(`[Custom Voice] 📚 Grade band: ${message.gradeBand}`);
            }
            if (message.activityMode) {
              activityModeRef.current = message.activityMode;
              console.log(`[Custom Voice] 📖 Activity mode: ${message.activityMode}`);
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
              // MIC STATUS: Tutor is speaking
              updateMicStatus('tutor_speaking', true);
              await playAudio(message.data);
            } else {
              console.log("[Custom Voice] 🔇 Audio muted, showing text only");
            }
            break;
          
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          // MIC STATUS EVENTS: Server-authoritative state for UI indicator
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          case "speech_detected":
            // Server confirms speech detected (from STT)
            console.log("[Custom Voice] 🎤 Speech detected by server");
            lastSpeechDetectedRef.current = Date.now();
            updateMicStatus('hearing_you');
            break;
          
          case "speech_ended":
            // Server confirms speech ended (student stopped talking)
            console.log("[Custom Voice] 🔇 Speech ended");
            // Return to listening if mic enabled, otherwise mic_off
            if (micEnabledRef.current) {
              updateMicStatus('listening');
            }
            break;
          
          case "noise_ignored":
            // Server filtered out background noise (not speech)
            console.log("[Custom Voice] 🔊 Background noise ignored");
            lastNoiseDetectedRef.current = Date.now();
            updateMicStatus('ignoring_noise');
            break;
          
          case "tts_playing":
            // Server started TTS playback
            console.log("[Custom Voice] 🔊 TTS playback started");
            updateMicStatus('tutor_speaking', true);
            break;
          
          case "tts_finished":
            // Server finished TTS playback
            console.log("[Custom Voice] 🔇 TTS playback finished");
            // Return to listening if mic enabled
            if (micEnabledRef.current) {
              updateMicStatus('listening');
            }
            break;
          
          case "duck":
            // Server ducked audio volume (potential speech detected)
            console.log("[Custom Voice] 🔉 Audio ducked - potential speech");
            updateMicStatus('hearing_you');
            break;
          
          case "unduck":
            // Server restored audio volume (speech ended or not confirmed)
            console.log("[Custom Voice] 🔊 Audio restored");
            // Return to listening if mic enabled, otherwise tutor_speaking
            if (isTutorSpeakingRef.current) {
              updateMicStatus('tutor_speaking', true);
            } else if (micEnabledRef.current) {
              updateMicStatus('listening');
            }
            break;

          case "interrupt":
            console.log("[Custom Voice] 🛑 Interruption detected", {
              reason: message.reason,
              stopMic: message.stopMic,
              stopPlayback: message.stopPlayback
            });
            
            // Always stop audio playback on interrupt
            if (message.stopPlayback !== false) {
              stopAudio();
              setIsTutorSpeaking(false);
            }
            
            // GOODBYE HARD STOP: Stop microphone when server requests it
            // This prevents trailing audio being sent after session termination
            if (message.stopMic === true) {
              console.log("[Custom Voice] 🎤 Stopping mic per server request (goodbye hard stop)");
              stopMicrophone();
              setMicEnabled(false);
              // CRITICAL: Update ref immediately to prevent race conditions with recovery logic
              micEnabledRef.current = false;
            }
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
          
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          // STT WATCHDOG STATUS (Jan 2026): Handle stall recovery
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          case "stt_status":
            console.log("[Custom Voice] 🔍 STT status:", message.status);
            if (message.status === 'stalled') {
              console.warn("[Custom Voice] ⚠️ STT stalled - reconnecting...");
              updateMicStatus('reconnecting', false);
            } else if (message.status === 'reconnected') {
              console.log("[Custom Voice] ✅ STT reconnected");
              updateMicStatus('listening', true);
            } else if (message.status === 'failed') {
              console.error("[Custom Voice] ❌ STT reconnect failed");
              updateMicStatus('error', false);
              setError("Voice recognition connection lost. Tap to reconnect.");
            }
            break;
          
          case "mic_status":
            console.log("[Custom Voice] 🎤 Mic status:", message.status);
            if (message.status === 'silent_input') {
              console.warn("[Custom Voice] 🔇 Mic is picking up silent audio");
              updateMicStatus('silent', false);
            }
            break;

          case "ended":
            console.log("[Custom Voice] ✅ Session ended (deprecated message)");
            break;
          
          case "session_ended":
            console.log("[Custom Voice] ✅ Received session_ended ACK from server", {
              sessionId: message.sessionId,
              reason: message.reason,
              hardStop: message.hardStop,
              transcriptLength: message.transcriptLength
            });
            
            // DETERMINISTIC CLEANUP: Immediately stop all audio/mic on session end
            // This ensures no trailing tutor audio or mic pickup after session terminates
            console.log("[Custom Voice] 🧹 Performing immediate session cleanup");
            stopAudio();
            stopMicrophone();
            setIsTutorSpeaking(false);
            setMicEnabled(false);
            
            // CRITICAL: Update refs immediately to prevent race conditions
            // This stops any recovery/retry logic from re-enabling after session ends
            micEnabledRef.current = false;
            audioEnabledRef.current = false;
            isTutorSpeakingRef.current = false;
            
            // Show notification if session ended due to inactivity
            if (message.reason === 'inactivity_timeout') {
              console.log("[Custom Voice] 🔔 Session ended due to inactivity - will show notification");
              (window as any).__sessionEndedReason = 'inactivity_timeout';
            }
            
            // Store goodbye reason so tutor page can handle appropriately
            if (message.reason === 'user_goodbye') {
              console.log("[Custom Voice] 👋 Session ended by user goodbye");
              (window as any).__sessionEndedReason = 'user_goodbye';
            }
            
            // Clear thinking indicator on session end
            setIsTutorThinking(false);
            thinkingTurnIdRef.current = null;
            // MIC STATUS: Session ended, mic is off
            updateMicStatus('mic_off', true);
            
            // Note: ws.onclose handles final cleanup and state reset
            break;
          
          // THINKING INDICATOR: Handle tutor thinking state events
          case "tutor_thinking":
            console.log("[Custom Voice] 💭 Tutor is thinking...", message.turnId);
            thinkingTurnIdRef.current = message.turnId;
            setIsTutorThinking(true);
            // MIC STATUS: Processing (waiting for AI response)
            updateMicStatus('processing', true);
            break;
          
          case "tutor_responding":
            console.log("[Custom Voice] 💬 Tutor is responding...", message.turnId);
            // Only clear if turnId matches (prevents stale clears)
            if (message.turnId === thinkingTurnIdRef.current) {
              setIsTutorThinking(false);
              thinkingTurnIdRef.current = null;
            }
            // MIC STATUS: Tutor is now speaking (will get audio event too)
            updateMicStatus('tutor_speaking', true);
            break;
          
          case "tutor_error":
            console.log("[Custom Voice] ❌ Tutor error, clearing thinking", message.turnId);
            // Clear thinking on error (any turnId)
            setIsTutorThinking(false);
            thinkingTurnIdRef.current = null;
            // MIC STATUS: Return to listening on error
            if (micEnabledRef.current) {
              updateMicStatus('listening');
            }
            break;
        }
      };

      ws.onerror = (error) => {
        console.error("[Custom Voice] ❌ WebSocket error:", error);
        console.trace("[Custom Voice] onerror stack trace");
        setError("Connection error");
      };

      ws.onclose = (event: CloseEvent) => {
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // DIAGNOSTIC FIX (Dec 23, 2025): Log close reason for debugging
        // Helps diagnose premature session endings
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        console.log("[Custom Voice] 🔌 Disconnected", {
          code: event.code,
          reason: event.reason || "(no reason)",
          wasClean: event.wasClean,
        });
        console.trace("[Custom Voice] onclose stack trace");
        setIsConnected(false);
        // Clear thinking indicator on disconnect
        setIsTutorThinking(false);
        thinkingTurnIdRef.current = null;
        // MIC STATUS: Disconnected, mic is off
        updateMicStatus('mic_off', true);
        cleanup();
      };

    } catch (error) {
      console.error("[Custom Voice] ❌ Connection failed:", error);
      setError(error instanceof Error ? error.message : "Connection failed");
    }
  }, []);

  // Helper to setup track listener - extracted so recovery can also use it
  const setupAudioTrackListener = (stream: MediaStream) => {
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      // Store device ID AND label from successful connection for recovery
      const settings = audioTrack.getSettings();
      selectedMicrophoneIdRef.current = settings.deviceId || null;
      selectedMicrophoneLabelRef.current = audioTrack.label || null;
      console.log(`[Custom Voice] 🎤 Using microphone: ${audioTrack.label}, deviceId: ${selectedMicrophoneIdRef.current || 'unknown'}`);
      
      audioTrack.onended = () => {
        // Skip if this was an intentional cleanup
        if (streamCleanupTriggeredRef.current) {
          console.log('[Custom Voice] ℹ️ Audio track ended (intentional cleanup)');
          return;
        }
        
        console.error('[Custom Voice] ⚠️ Audio track ended unexpectedly');
        console.error('[Custom Voice] Track state:', audioTrack.readyState);
        console.error('[Custom Voice] Track enabled:', audioTrack.enabled);
        console.error('[Custom Voice] Track muted:', audioTrack.muted);
        attemptMicRecovery(); // Async recovery with multi-stage retry
      };
      console.log('[Custom Voice] 📡 Added track.onended listener for track:', audioTrack.label);
    }
  };

  // Helper to get preferred microphone from settings
  // Helper to check if a device is a loopback/virtual device that shouldn't be used as a mic
  const isLoopbackDevice = (label: string): boolean => {
    const lowerLabel = label.toLowerCase();
    return EXCLUDED_DEVICE_PATTERNS.some(pattern => lowerLabel.includes(pattern));
  };

  const getPreferredMicrophoneId = async (): Promise<string | null> => {
    try {
      const preferredId = localStorage.getItem('jie-preferred-microphone-id');
      const preferredLabel = localStorage.getItem('jie-preferred-microphone-label');
      const allowVirtual = getAllowVirtualAudio();
      
      // If no preference set or explicitly system-default, return null
      if (!preferredId) {
        return null;
      }
      
      // Try to find device by ID first
      const devices = await navigator.mediaDevices.enumerateDevices();
      const byId = devices.find(d => d.kind === 'audioinput' && d.deviceId === preferredId);
      if (byId) {
        // CRITICAL: Check if stored preference is a loopback device
        if (!allowVirtual && isLoopbackDevice(byId.label)) {
          console.warn('[Custom Voice] ⚠️ Stored preference is a loopback device, ignoring:', byId.label);
          // Clear the bad preference
          localStorage.removeItem('jie-preferred-microphone-id');
          localStorage.removeItem('jie-preferred-microphone-label');
          return null;
        }
        console.log('[Custom Voice] 🎯 Found preferred mic by ID:', byId.label);
        return byId.deviceId;
      }
      
      // Try to find device by label (IDs can change between sessions)
      if (preferredLabel) {
        const byLabel = devices.find(d => d.kind === 'audioinput' && d.label === preferredLabel);
        if (byLabel) {
          // CRITICAL: Check if stored preference is a loopback device
          if (!allowVirtual && isLoopbackDevice(byLabel.label)) {
            console.warn('[Custom Voice] ⚠️ Stored preference is a loopback device, ignoring:', byLabel.label);
            // Clear the bad preference
            localStorage.removeItem('jie-preferred-microphone-id');
            localStorage.removeItem('jie-preferred-microphone-label');
            return null;
          }
          console.log('[Custom Voice] 🎯 Found preferred mic by label:', byLabel.label);
          return byLabel.deviceId;
        }
      }
      
      console.log('[Custom Voice] ℹ️ Preferred mic not found, using system default');
      return null;
    } catch (e) {
      console.warn('[Custom Voice] ⚠️ Error getting preferred mic:', e);
      return null;
    }
  };

  const startMicrophone = async () => {
    try {
      console.log("[Custom Voice] 🎤 Requesting microphone access...");
      
      // Reset cleanup flag for new microphone session
      streamCleanupTriggeredRef.current = false;
      
      // Check if browser supports getUserMedia
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('[Custom Voice] ❌ Browser does not support getUserMedia');
        setMicrophoneError({
          message: 'Your browser does not support voice recording. Please use a modern browser like Chrome, Firefox, or Edge.',
          troubleshooting: [
            'Use a modern browser like Chrome, Firefox, or Edge',
            'Update your browser to the latest version',
            'Voice features are not available in Safari on iOS versions before 14.3'
          ],
          errorType: 'BROWSER_NOT_SUPPORTED',
        });
        return; // Exit gracefully instead of throwing
      }
      
      // First check for user's preferred microphone from settings
      const preferredMicId = await getPreferredMicrophoneId();
      
      // Priority: 1) User preference from settings, 2) Recovery deviceId, 3) System default
      const targetDeviceId = preferredMicId || selectedMicrophoneIdRef.current;
      
      // Build constraints: use the target device if we have one
      // ECHO GUARD: Enable all WebRTC echo cancellation features
      const audioConstraints: MediaStreamConstraints['audio'] = targetDeviceId
        ? {
            deviceId: { exact: targetDeviceId },
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: true,   // ECHO GUARD: Essential for preventing speaker-to-mic feedback
            noiseSuppression: true,   // ECHO GUARD: Helps filter ambient noise and echo artifacts
            autoGainControl: true,    // ECHO GUARD: Prevents mic from boosting echo
          }
        : {
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: true,   // ECHO GUARD: Essential for preventing speaker-to-mic feedback
            noiseSuppression: true,   // ECHO GUARD: Helps filter ambient noise and echo artifacts
            autoGainControl: true,    // ECHO GUARD: Prevents mic from boosting echo
          };
      
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      } catch (error) {
        // If exact device ID constraint failed (device disconnected?), try any device
        if (targetDeviceId) {
          console.warn('[Custom Voice] ⚠️ Failed to use preferred/recovery device (ID:', targetDeviceId, '), trying any device...');
          selectedMicrophoneIdRef.current = null; // Reset device ID
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              sampleRate: 16000,
              channelCount: 1,
              echoCancellation: true,   // ECHO GUARD
              noiseSuppression: true,   // ECHO GUARD
              autoGainControl: true,    // ECHO GUARD
            }
          });
        } else {
          throw error;
        }
      }
      
      console.log("[Custom Voice] ✅ Microphone access granted");
      
      // ECHO GUARD: Log the actual applied audio settings
      const audioTrackForLogging = stream.getAudioTracks()[0];
      if (audioTrackForLogging) {
        const appliedSettings = audioTrackForLogging.getSettings();
        console.log("[Custom Voice] 🔊 ECHO GUARD: Applied audio settings:", {
          echoCancellation: appliedSettings.echoCancellation,
          noiseSuppression: appliedSettings.noiseSuppression,
          autoGainControl: appliedSettings.autoGainControl,
          deviceId: appliedSettings.deviceId?.substring(0, 8) + '...',
          sampleRate: appliedSettings.sampleRate,
        });
      }
      
      // Clear any previous errors
      setMicrophoneError(null);
      
      // Sync the actual device ID/label to localStorage for preference persistence
      // This ensures recovery and fallback choices become the stored preference
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        const settings = audioTrack.getSettings();
        const actualDeviceId = settings.deviceId;
        const allowVirtual = getAllowVirtualAudio();
        
        // CRITICAL: Check if acquired device is a loopback device (Stereo Mix, etc.)
        if (!allowVirtual && isLoopbackDevice(audioTrack.label)) {
          console.error('[Custom Voice] ❌ Browser selected a loopback device:', audioTrack.label);
          stream.getTracks().forEach(t => t.stop());
          
          // Try to find a real microphone instead
          const realMicId = await findBestMicrophone();
          if (realMicId) {
            console.log('[Custom Voice] 🎯 Retrying with real microphone...');
            const realStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                deviceId: { exact: realMicId },
                sampleRate: 16000,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,  // ECHO GUARD
                autoGainControl: true,
              }
            });
            mediaStreamRef.current = realStream;
            setupAudioTrackListener(realStream);
            
            const realTrack = realStream.getAudioTracks()[0];
            console.log('[Custom Voice] ✅ Now using real microphone:', realTrack?.label);
            return; // Exit and let the new stream be used
          } else {
            setMicrophoneError({
              message: 'No valid microphone found. "Stereo Mix" cannot be used for voice input.',
              troubleshooting: [
                'Connect a real microphone (headset, USB mic, or built-in)',
                'In Windows Sound Settings, disable "Stereo Mix" device',
                'Check that your microphone is set as the default input device'
              ],
              errorType: 'LOOPBACK_DEVICE',
            });
            return;
          }
        }
        
        if (actualDeviceId) {
          selectedMicrophoneIdRef.current = actualDeviceId;
          selectedMicrophoneLabelRef.current = audioTrack.label;
          
          console.log('[Custom Voice] 🎤 Using microphone:', audioTrack.label);
          
          // Always persist the acquired device so next session uses it directly
          // Only skip if user explicitly cleared preferences (system default)
          try {
            localStorage.setItem('jie-preferred-microphone-id', actualDeviceId);
            localStorage.setItem('jie-preferred-microphone-label', audioTrack.label);
            voiceLogger.info('Synced mic preference:', audioTrack.label);
          } catch (e) {
            voiceLogger.warn('Could not save mic preference:', e);
          }
        }
      }
      
      mediaStreamRef.current = stream;
      
      // Setup track listener with new helper
      setupAudioTrackListener(stream);
      
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
      
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // SHARED HELPERS: Used by both AudioWorklet and ScriptProcessor paths
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      
      // Initialize session tracking for auto-escalation (once per session)
      if (sessionStartTime === 0) {
        sessionStartTime = Date.now();
        shortBurstCount = 0;
        activeVADProfile = 'BALANCED';
        console.log(`[VoiceHost] Session started with ${activeVADProfile} profile`);
      }
      
      // Get current profile parameters
      const getProfile = () => VAD_PROFILES[activeVADProfile];
      
      // Auto-escalation helper: check if we should switch to PATIENT
      const checkAutoEscalation = (speechDuration: number) => {
        const sessionAge = Date.now() - sessionStartTime;
        
        // Only check during first 60 seconds
        if (sessionAge > 60000) return;
        
        // Track short bursts (< 500ms)
        if (speechDuration > 0 && speechDuration < 500) {
          shortBurstCount++;
          console.log(`[VoiceHost] Short burst detected (${speechDuration}ms) - count: ${shortBurstCount}/6`);
          
          // If 6+ short bursts in first 60 seconds, switch to PATIENT
          if (shortBurstCount >= 6 && activeVADProfile === 'BALANCED') {
            activeVADProfile = 'PATIENT';
            console.log(`[VoiceHost] Turn profile switched to PATIENT (reason: frequent short bursts)`);
          }
        }
      };

      try {
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // FIX (Dec 23, 2025): Load AudioWorklet via blob URL
        // This avoids file loading issues that cause "AbortError: Unable to load a worklet's module"
        // Inline worklet code eliminates CORS and path resolution problems
        // Full implementation from public/audio-processor.js preserved
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const workletCode = `
// Audio Worklet Processor for universal microphone handling
// Processes audio at 16kHz regardless of input format
// Enhanced with AGGRESSIVE Voice Activity Detection (VAD) for instant barge-in

class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Smaller buffer for faster audio transmission (~64ms at 16kHz)
    this.bufferSize = 1024;
    this.buffer = [];

    // AGGRESSIVE VAD for instant barge-in
    this.speechActive = false;
    this.silenceFrames = 0;
    // Very short silence threshold - only 10 frames (~25ms) before speech_end
    this.silenceThreshold = 10;
    // AGGRESSIVE: Very low RMS threshold to catch any voice activity
    this.vadThreshold = 0.003;
    // Track consecutive speech frames to avoid single-frame false positives
    this.speechFrames = 0;
    this.minSpeechFrames = 2; // Require 2 consecutive frames (~5ms) to trigger
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    // Get audio data (already resampled to 16kHz by AudioContext)
    const audioData = input[0]; // Float32Array

    // Convert to mono if stereo
    let monoData;
    if (input.length > 1 && input[1]) {
      // Mix stereo to mono
      monoData = new Float32Array(audioData.length);
      for (let i = 0; i < audioData.length; i++) {
        monoData[i] = (input[0][i] + input[1][i]) / 2;
      }
    } else {
      // Already mono
      monoData = audioData;
    }

    // AGGRESSIVE VAD: Check for speech on every audio frame (~2.6ms)
    // Uses very low threshold for instant barge-in detection
    const rms = Math.sqrt(
      monoData.reduce((sum, sample) => sum + sample * sample, 0) / monoData.length
    );

    // Also check peak amplitude for transients (catches plosives like "p", "t", "k")
    let maxAmp = 0;
    for (let i = 0; i < monoData.length; i++) {
      const amp = Math.abs(monoData[i]);
      if (amp > maxAmp) maxAmp = amp;
    }

    // Speech detected if RMS OR peak amplitude exceeds threshold
    const isSpeech = rms > this.vadThreshold || maxAmp > 0.02;

    if (isSpeech) {
      this.speechFrames++;
      this.silenceFrames = 0;

      // Trigger speech_start after minimum consecutive frames (avoids false positives)
      if (!this.speechActive && this.speechFrames >= this.minSpeechFrames) {
        this.speechActive = true;
        this.port.postMessage({ type: 'speech_start', rms: rms, peak: maxAmp });
      }
    } else {
      this.speechFrames = 0;

      if (this.speechActive) {
        this.silenceFrames++;
        if (this.silenceFrames >= this.silenceThreshold) {
          this.speechActive = false;
          this.port.postMessage({ type: 'speech_end' });
        }
      }
    }

    // Buffer audio data
    this.buffer.push(...monoData);

    // Send chunks of audio when buffer is full
    if (this.buffer.length >= this.bufferSize) {
      const chunk = new Float32Array(this.buffer.splice(0, this.bufferSize));

      // ALWAYS send audio to Deepgram - it needs continuous stream for accurate transcription
      // Deepgram handles silence detection internally, so don't filter here
      this.port.postMessage({
        type: 'audio',
        data: chunk
      });
    }

    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
`;
        const blob = new Blob([workletCode], { type: 'application/javascript' });
        const workletUrl = URL.createObjectURL(blob);
        
        try {
          await audioContextRef.current.audioWorklet.addModule(workletUrl);
          console.log("[Custom Voice] ✅ AudioWorklet loaded via blob URL");
        } finally {
          URL.revokeObjectURL(workletUrl);
        }

        const source = audioContextRef.current.createMediaStreamSource(stream);

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // MIC METER INSTRUMENTATION (Dec 24, 2025)
        // Diagnose mic capture before any processing
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const analyser = audioContextRef.current.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
        
        const logMicRms = () => {
          if (!analyser || !audioContextRef.current) return;
          const data = new Float32Array(analyser.fftSize);
          analyser.getFloatTimeDomainData(data);
          let sum = 0;
          let hasNonZero = false;
          for (let i = 0; i < data.length; i++) {
            sum += data[i] * data[i];
            if (data[i] !== 0) hasNonZero = true;
          }
          const rms = Math.sqrt(sum / data.length);
          
          // Get track state
          const track = mediaStreamRef.current?.getAudioTracks()[0];
          const trackState = track?.readyState || 'no-track';
          const streamActive = mediaStreamRef.current?.active || false;
          
          console.log(`[MicMeter] rms=${rms.toFixed(6)} hasNonZero=${hasNonZero} ctx=${audioContextRef.current?.state} track=${trackState} stream=${streamActive ? 'active' : 'inactive'}`);
        };
        
        // Log mic level every 2 seconds
        const micMeterInterval = setInterval(logMicRms, 2000);
        
        // Initial log
        setTimeout(logMicRms, 100);
        
        // Cleanup interval when processor is disconnected
        const originalDisconnect = () => {
          clearInterval(micMeterInterval);
        };
        // Note: will be called when session ends
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        // Add a GainNode to amplify quiet microphones at the hardware level
        // REDUCED from 3.0 to 1.5 to prevent clipping/distortion (Dec 2025)
        const gainNode = audioContextRef.current.createGain();
        gainNode.gain.value = 1.5; // 1.5x amplification before processing

        const processor = new AudioWorkletNode(audioContextRef.current, 'audio-processor');
        processorRef.current = processor;
        
        // VAD state for AudioWorklet path (mirrors ScriptProcessor fallback logic)
        let workletSpeechStartTime = 0;
        let workletLastSpeechEndTime = 0;
        let workletPostInterruptionBufferActive = false;
        let workletPostInterruptionTimeout: ReturnType<typeof setTimeout> | null = null;
        
        // Use profile values instead of hardcoded constants
        const POST_INTERRUPTION_BUFFER_MS = 2000;  // Fixed - always protect after barge-in
        
        // Handle audio data and VAD events from AudioWorklet
        processor.port.onmessage = (event) => {
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          // RESPONSIVE BARGE-IN with ECHO PROTECTION (AudioWorklet)
          // - Lowered thresholds for faster interruption (0.08 RMS, 0.15 peak)
          // - Reduced 300ms cooldown (was 500ms) for snappier response
          // - Post-interruption buffer prevents fragmented speech (Dec 10, 2025)
          // - Minimum speech duration and coalescing for complete utterances
          // - ADAPTIVE BARGE-IN: Duck-then-confirm for quiet/nervous speakers (Jan 2026)
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          if (event.data.type === 'speech_start') {
            const now = Date.now();
            const rms = event.data.rms || 0;
            const peak = event.data.peak || 0;
            
            // Update baseline with all RMS samples (for adaptive threshold calculation)
            if (!isTutorSpeakingRef.current) {
              updateBaseline(baselineStateRef.current, rms, ADAPTIVE_BARGE_IN.COMMON.BASELINE_WINDOW_MS);
            }
            
            // A) Check tutor speaking state using single truth function
            const tutorState: TutorSpeakingState = {
              isTutorSpeakingFlag: isTutorSpeakingRef.current,
              isPlayingFlag: isPlayingRef.current,
              audioQueueSize: audioQueueRef.current.length,
              scheduledSourcesCount: scheduledSourcesRef.current.length
            };
            const tutorActuallySpeaking = isTutorActuallySpeaking(tutorState);
            
            // If tutor is currently speaking, we need confidence that this is
            // the USER speaking and not just echo from the speakers
            if (tutorActuallySpeaking) {
              const timeSincePlayback = now - lastAudioPlaybackStartRef.current;
              
              // B) Barge-in path: use much shorter cooldown (or bypass entirely)
              const cooldownMs = TURN_TAKING_FLAGS.BARGE_IN_COOLDOWN_BYPASS_ENABLED 
                ? TURN_TAKING_FLAGS.BARGE_IN_MAX_COOLDOWN_MS 
                : 300;
              
              if (timeSincePlayback < cooldownMs) {
                console.log(`[Custom Voice] ⏱️ VAD barge-in cooldown (${(cooldownMs - timeSincePlayback).toFixed(0)}ms) - waiting`);
                return;
              }
              
              // Log barge-in evaluation for debugging
              console.log(`[Custom Voice] 🎯 barge_in_eval: tutorActuallySpeaking=${tutorActuallySpeaking}, isPlaying=${isPlayingRef.current}, queueSize=${audioQueueRef.current.length}, scheduledSources=${scheduledSourcesRef.current.length}`);

              // Get grade-specific config for adaptive thresholds
              const bargeInCfg = getBargeInConfig(gradeBandRef.current);
              const baseline = getBaselineMedian(baselineStateRef.current);
              const adaptiveThreshold = baseline * bargeInCfg.adaptiveRatio;
              
              // ADAPTIVE BARGE-IN: Check both adaptive and absolute thresholds
              const adaptiveTriggered = adaptiveBargeInEnabledRef.current && rms >= adaptiveThreshold;
              const absoluteTriggered = rms >= bargeInCfg.rmsThreshold || peak >= bargeInCfg.peakThreshold;
              const bargeInTriggered = adaptiveTriggered || absoluteTriggered;

              if (!bargeInTriggered) {
                // Log rejected barge-in for observability (only occasionally to avoid spam)
                if (adaptiveBargeInEnabledRef.current && wsRef.current && Math.random() < 0.1) {
                  wsRef.current.send(JSON.stringify({
                    type: "barge_in_event",
                    evaluation: {
                      inputEnergy: rms,
                      baselineRms: baseline,
                      ratio: baseline > 0 ? rms / baseline : 0,
                      threshold: adaptiveThreshold,
                      outcome: 'rejected',
                    }
                  }));
                }
                console.log(`[Custom Voice] 🔇 VAD: Ignoring ambient sound during tutor (rms=${rms.toFixed(4)}, peak=${peak.toFixed(4)}, baseline=${baseline.toFixed(4)}, adaptiveThreshold=${adaptiveThreshold.toFixed(4)}) - below barge-in threshold`);
                return;
              }
              
              // Get profile for timing values
              const profile = getProfile();
              const minSpeechMs = adaptiveBargeInEnabledRef.current ? bargeInCfg.minSpeechMs : profile.minBargeInSpeechMs;
              
              // Start debounce timer for sustained speech
              if (workletSpeechStartTime === 0) {
                workletSpeechStartTime = now;
                
                // DUCK-THEN-CONFIRM: Apply duck gain immediately on suspected barge-in
                if (adaptiveBargeInEnabledRef.current && playbackGainNodeRef.current && !duckStateRef.current.isActive) {
                  duckStateRef.current.isActive = true;
                  duckStateRef.current.startTime = now;
                  duckStateRef.current.originalGain = playbackGainNodeRef.current.gain.value;
                  duckStateRef.current.speechStartTime = now;
                  playbackGainNodeRef.current.gain.value = ADAPTIVE_BARGE_IN.COMMON.DUCK_GAIN;
                  console.log(`[Custom Voice] 🔉 DUCK: Applied duck gain (${ADAPTIVE_BARGE_IN.COMMON.DUCK_GAIN}) for suspected barge-in (rms=${rms.toFixed(4)}, adaptive=${adaptiveTriggered})`);
                }
                
                console.log(`[Custom Voice] 🎤 VAD: Speech onset detected (rms=${rms.toFixed(4)}, adaptive=${adaptiveTriggered}, starting ${minSpeechMs}ms debounce, grade=${gradeBandRef.current || 'default'})`);
                return;
              }
              
              // Check if speech sustained for barge-in threshold
              if (now - workletSpeechStartTime < minSpeechMs) {
                console.log(`[Custom Voice] ⏱️ VAD debounce: ${(now - workletSpeechStartTime).toFixed(0)}ms/${minSpeechMs}ms - waiting for sustained speech`);
                return;
              }

              // CONFIRMED BARGE-IN: Stop playback
              console.log(`[Custom Voice] 🛑 VAD: CONFIRMED barge-in after debounce (rms=${rms.toFixed(4)}, peak=${peak.toFixed(4)}, adaptive=${adaptiveTriggered})`);
              
              // Reset duck state before stopping
              if (duckStateRef.current.isActive) {
                duckStateRef.current.isActive = false;
                console.log(`[Custom Voice] 🔉 DUCK: Confirmed barge-in, stopping playback`);
              }
              
              stopAudio();
              setIsTutorSpeaking(false);
              
              // POST-INTERRUPTION BUFFER (Dec 10, 2025 FIX)
              // After barge-in, ignore rapid speech-end events for 2 seconds
              workletPostInterruptionBufferActive = true;
              if (workletPostInterruptionTimeout) {
                clearTimeout(workletPostInterruptionTimeout);
              }
              workletPostInterruptionTimeout = setTimeout(() => {
                workletPostInterruptionBufferActive = false;
                console.log('[Custom Voice] ✅ Post-interruption buffer ended (AudioWorklet)');
              }, POST_INTERRUPTION_BUFFER_MS);
              console.log(`[Custom Voice] 🛡️ Post-interruption buffer active for ${POST_INTERRUPTION_BUFFER_MS}ms (AudioWorklet)`);

              // Notify server for state sync with barge-in details
              wsRef.current.send(JSON.stringify({ 
                type: "speech_detected",
                bargeIn: true,
                adaptive: adaptiveTriggered,
                gradeBand: gradeBandRef.current
              }));
              
              // Send barge-in event for server-side structured logging
              if (adaptiveBargeInEnabledRef.current) {
                wsRef.current.send(JSON.stringify({
                  type: "barge_in_event",
                  evaluation: {
                    inputEnergy: rms,
                    baselineRms: baseline,
                    ratio: baseline > 0 ? rms / baseline : 0,
                    threshold: adaptiveThreshold,
                    outcome: 'confirmed',
                    duckGain: ADAPTIVE_BARGE_IN.COMMON.DUCK_GAIN,
                    confirmWindowMs: minSpeechMs,
                  }
                }));
              }
            } else {
              // Tutor not speaking - track speech start for min duration check
              // Also reset duck state if it was active
              if (duckStateRef.current.isActive && playbackGainNodeRef.current) {
                playbackGainNodeRef.current.gain.value = duckStateRef.current.originalGain;
                duckStateRef.current.isActive = false;
                console.log(`[Custom Voice] 🔊 DUCK: Restored original gain (tutor stopped playing)`);
              }
              
              if (workletSpeechStartTime === 0) {
                workletSpeechStartTime = now;
              }
              console.log("[Custom Voice] 🎤 VAD: Speech detected (tutor not playing)");
            }
            return;
          }
          
          // Handle duck timeout - restore volume if speech not confirmed
          if (event.data.type === 'speech_end' && duckStateRef.current.isActive) {
            const now = Date.now();
            const duckDuration = now - duckStateRef.current.startTime;
            
            // If duck active but no confirmed barge-in, restore volume
            if (playbackGainNodeRef.current && duckDuration < ADAPTIVE_BARGE_IN.COMMON.CONFIRM_MS) {
              playbackGainNodeRef.current.gain.value = duckStateRef.current.originalGain;
              console.log(`[Custom Voice] 🔊 DUCK: Restored original gain (speech ended before confirmation, ${duckDuration}ms)`);
            }
            duckStateRef.current.isActive = false;
          }

          if (event.data.type === 'speech_end') {
            const now = Date.now();
            const speechDuration = workletSpeechStartTime > 0 ? now - workletSpeechStartTime : 0;
            const timeSinceLastEnd = workletLastSpeechEndTime > 0 ? now - workletLastSpeechEndTime : Infinity;
            
            // POST-INTERRUPTION BUFFER: Ignore speech-end during buffer period
            if (workletPostInterruptionBufferActive) {
              console.log(`[Custom Voice] 🛡️ VAD: Ignoring speech_end during post-interruption buffer (AudioWorklet)`);
              return;
            }
            
            // Get current profile for dynamic thresholds
            const profile = getProfile();
            
            // Track for auto-escalation
            checkAutoEscalation(speechDuration);
            
            // MIN SPEECH DURATION: Ignore very short utterances (likely noise/hesitation)
            if (speechDuration > 0 && speechDuration < profile.minSpeechMs) {
              console.log(`[Custom Voice] ⏱️ VAD: Speech too short (${speechDuration}ms < ${profile.minSpeechMs}ms), ignoring (profile=${activeVADProfile})`);
              workletSpeechStartTime = 0;
              return;
            }
            
            // SPEECH COALESCING: If speech ended recently, this might be a continuation
            if (timeSinceLastEnd < profile.coalesceWindowMs) {
              console.log(`[Custom Voice] 🔗 VAD: Coalescing speech (${timeSinceLastEnd}ms since last end < ${profile.coalesceWindowMs}ms window, profile=${activeVADProfile})`);
              return;
            }
            
            console.log(`[Custom Voice] 🔇 VAD: Speech ended (duration=${speechDuration}ms) (AudioWorklet)`);
            workletLastSpeechEndTime = now;
            workletSpeechStartTime = 0;
            return;
          }
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

          // Handle audio data messages from AudioWorklet
          // The worklet sends { type: 'audio', data: Float32Array }
          if (event.data.type !== 'audio' || !event.data.data) {
            return; // Skip non-audio messages (already handled speech_start/speech_end above)
          }

          const float32Data = event.data.data; // Float32Array from AudioWorklet

          // Convert Float32 to PCM16 with gain amplification and SOFT LIMITING
          // Note: We have 1.5x hardware gain from GainNode, so use moderate software gain
          // REDUCED from 10 to 4 to prevent clipping/distortion (Dec 2025) - total ~6x
          const GAIN = 4; // Low gain to prevent clipping (6x total with 1.5x hardware)
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

        console.log("[Custom Voice] 🔊 Audio chain: mic -> gain(1.5x) -> worklet -> destination");
      } catch (workletError) {
        console.warn('[Custom Voice] ⚠️ AudioWorklet not supported, falling back to ScriptProcessorNode:', workletError);

        // Fallback to ScriptProcessorNode for older browsers
        const source = audioContextRef.current.createMediaStreamSource(stream);

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // MIC METER INSTRUMENTATION (ScriptProcessor fallback)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const fallbackAnalyser = audioContextRef.current.createAnalyser();
        fallbackAnalyser.fftSize = 2048;
        source.connect(fallbackAnalyser);
        
        const logFallbackMicRms = () => {
          if (!fallbackAnalyser || !audioContextRef.current) return;
          const data = new Float32Array(fallbackAnalyser.fftSize);
          fallbackAnalyser.getFloatTimeDomainData(data);
          let sum = 0;
          let hasNonZero = false;
          for (let i = 0; i < data.length; i++) {
            sum += data[i] * data[i];
            if (data[i] !== 0) hasNonZero = true;
          }
          const rms = Math.sqrt(sum / data.length);
          
          const track = mediaStreamRef.current?.getAudioTracks()[0];
          const trackState = track?.readyState || 'no-track';
          const streamActive = mediaStreamRef.current?.active || false;
          
          console.log(`[MicMeter-Fallback] rms=${rms.toFixed(6)} hasNonZero=${hasNonZero} ctx=${audioContextRef.current?.state} track=${trackState} stream=${streamActive ? 'active' : 'inactive'}`);
        };
        
        const fallbackMicMeterInterval = setInterval(logFallbackMicRms, 2000);
        setTimeout(logFallbackMicRms, 100);
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        // Add gain node for fallback path too
        // REDUCED from 3.0 to 1.5 to prevent clipping/distortion (Dec 2025)
        const gainNode = audioContextRef.current.createGain();
        gainNode.gain.value = 1.5; // 1.5x amplification

        const processor = audioContextRef.current.createScriptProcessor(2048, 1, 1); // Smaller buffer for lower latency
        processorRef.current = processor as any;

        // VAD state for fallback processor
        let speechActive = false;
        let silentChunks = 0;
        let speechStartTime = 0; // Track when speech detected
        let speechEndTime = 0; // Track when silence started
        let lastSpeechEndTime = 0; // Track last confirmed speech end for coalescing
        let postInterruptionBufferActive = false; // Post-barge-in buffer period
        let postInterruptionTimeout: NodeJS.Timeout | null = null; // Timer for buffer period
        
        const MAX_SILENT_CHUNKS = 5; // Only ~100ms of silence before considering speech ended
        const VAD_THRESHOLD = 0.06; // Base speech detection threshold (was 0.003, too low)
        const POST_INTERRUPTION_BUFFER_MS = 2000; // After barge-in, ignore speech-end events for 2s

        processor.onaudioprocess = (e) => {
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

          // Check if media stream is still active - trigger recovery if died
          if (!mediaStreamRef.current || !mediaStreamRef.current.active) {
            if (!streamCleanupTriggeredRef.current) {
              console.warn('[Custom Voice] ⚠️ Media stream died unexpectedly');
              attemptMicRecovery(); // Async recovery with retry loop
            }
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
              
              // Start debounce timer for sustained speech using profile's minBargeInSpeechMs
              const profile = getProfile();
              if (speechStartTime === 0) {
                speechStartTime = now;
                console.log(`[Custom Voice] 🎤 VAD (fallback): Speech onset detected (rms=${rms.toFixed(4)}, starting ${profile.minBargeInSpeechMs}ms debounce, profile=${activeVADProfile})`);
                return; // Wait for debounce
              }
              
              // Check if speech sustained for barge-in threshold
              if (now - speechStartTime < profile.minBargeInSpeechMs) {
                console.log(`[Custom Voice] ⏱️ VAD debounce: ${(now - speechStartTime).toFixed(0)}ms/${profile.minBargeInSpeechMs}ms - waiting for sustained speech`);
                return;
              }
              
              // Speech confirmed after debounce - trigger barge-in
              speechActive = true;
              silentChunks = 0;
              speechStartTime = now; // Track speech start for MIN_SPEECH_DURATION check
              console.log(`[Custom Voice] 🛑 VAD (fallback): CONFIRMED barge-in after debounce (rms=${rms.toFixed(4)}, peak=${maxAmplitude.toFixed(4)})`);
              stopAudio();
              setIsTutorSpeaking(false);
              wsRef.current.send(JSON.stringify({ type: "speech_detected" }));
              
              // POST-INTERRUPTION BUFFER (Dec 10, 2025 FIX)
              // After barge-in, ignore rapid speech-end events for 2 seconds
              // This prevents fragmented transcripts from being sent to AI
              postInterruptionBufferActive = true;
              if (postInterruptionTimeout) clearTimeout(postInterruptionTimeout);
              postInterruptionTimeout = setTimeout(() => {
                postInterruptionBufferActive = false;
                console.log('[Custom Voice] 📦 Post-interruption buffer ended');
              }, POST_INTERRUPTION_BUFFER_MS);
              console.log('[Custom Voice] 📦 Post-interruption buffer started (2s)');
            } else {
              // Tutor not speaking - lower threshold OK
              const profile = getProfile();
              if (speechStartTime === 0) {
                speechStartTime = now;
                console.log("[Custom Voice] 🎤 VAD (fallback): Speech onset (tutor not playing)");
                return; // Wait for debounce
              }
              
              if (now - speechStartTime < profile.minSpeechMs) {
                return;
              }
              
              speechActive = true;
              silentChunks = 0;
              speechStartTime = now; // Track speech start for MIN_SPEECH_DURATION check
              console.log("[Custom Voice] 🎤 VAD (fallback): Speech confirmed (tutor not playing)");
            }
          } else if (!hasAudio && speechActive) {
            // POST-INTERRUPTION BUFFER CHECK (Dec 10, 2025 FIX)
            // During buffer period, ignore speech-end events to prevent fragmentation
            if (postInterruptionBufferActive) {
              console.log('[Custom Voice] 📦 Ignoring silence during post-interruption buffer');
              return;
            }
            
            // Debounce speech end: require sustained silence before ending (allows thinking pauses)
            if (speechEndTime === 0) {
              speechEndTime = now;
              console.log(`[Custom Voice] ⏱️ VAD (fallback): Silence detected, starting ${VOICE_TIMING.SILENCE_DEBOUNCE_MS}ms debounce...`);
              return;
            }
            
            if (now - speechEndTime < VOICE_TIMING.SILENCE_DEBOUNCE_MS) {
              console.log(`[Custom Voice] ⏱️ VAD silence debounce: ${(now - speechEndTime).toFixed(0)}ms`);
              return;
            }
            
            // MINIMUM SPEECH DURATION CHECK using profile values
            const profile = getProfile();
            const speechDuration = speechStartTime > 0 ? now - speechStartTime : 0;
            
            // Track for auto-escalation
            checkAutoEscalation(speechDuration);
            
            if (speechDuration > 0 && speechDuration < profile.minSpeechMs) {
              console.log(`[Custom Voice] ⏱️ Speech too short (${speechDuration}ms < ${profile.minSpeechMs}ms), waiting for more (profile=${activeVADProfile})`);
              return;
            }
            
            // SPEECH COALESCING CHECK using profile values
            if (lastSpeechEndTime > 0 && now - lastSpeechEndTime < profile.coalesceWindowMs) {
              console.log(`[Custom Voice] 📦 Coalescing rapid speech events (${now - lastSpeechEndTime}ms < ${profile.coalesceWindowMs}ms, profile=${activeVADProfile})`);
              return;
            }
            
            // Confirmed silence - CLEANUP ALL STATE (Dec 10, 2025 FIX)
            speechActive = false;
            speechEndTime = 0;
            speechStartTime = 0;
            lastSpeechEndTime = now; // Track for coalescing
            silentChunks = 0;
            // Clear post-interruption buffer on valid speech end
            if (postInterruptionTimeout) {
              clearTimeout(postInterruptionTimeout);
              postInterruptionTimeout = null;
            }
            postInterruptionBufferActive = false;
            console.log("[Custom Voice] 🔇 VAD (fallback): Speech ended (confirmed)");
          } else if (hasAudio && speechActive) {
            // Reset silence debounce timer if sound detected
            speechEndTime = 0;
            silentChunks = 0;
            // Clear post-interruption buffer if user resumes speaking (Dec 10, 2025 FIX)
            if (postInterruptionBufferActive) {
              postInterruptionBufferActive = false;
              if (postInterruptionTimeout) {
                clearTimeout(postInterruptionTimeout);
                postInterruptionTimeout = null;
              }
              console.log('[Custom Voice] 📦 Post-interruption buffer cleared (speech resumed)');
            }
          } else if (!hasAudio && !speechActive) {
            // Stay silent, reset timers
            speechStartTime = 0;
            speechEndTime = 0;
          }
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

          // Convert to PCM16 with amplification and SOFT LIMITING
          // Note: We have 1.5x hardware gain from GainNode, so use moderate software gain
          // REDUCED from 10 to 4 to prevent clipping/distortion (Dec 2025) - total ~6x
          const GAIN = 4; // Low gain to prevent clipping (6x total with 1.5x hardware)
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

        console.log("[Custom Voice] 🔊 Audio chain (fallback): mic -> gain(1.5x) -> processor -> destination");
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
    await forceStartMicrophone(); // Uses force helper to clear recovery flags
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
    // Guard: Skip playback if audio data is empty or invalid
    if (!base64Audio || base64Audio.length === 0) {
      console.log('[🔊 Audio] ⚠️ No audio data received, skipping playback');
      return;
    }
    
    console.log('[🔊 Audio] Starting playback', {
      dataLength: base64Audio.length,
      contextExists: !!audioContextRef.current,
      contextState: audioContextRef.current?.state || 'none'
    });
    
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      console.log('[🔊 Audio] Created new AudioContext');
    }

    try {
      // Safety: Prevent unbounded queue growth if playback stalls
      if (audioQueueRef.current.length >= MAX_AUDIO_QUEUE_SIZE) {
        console.warn(`[🔊 Audio] ⚠️ Audio queue at max capacity (${MAX_AUDIO_QUEUE_SIZE}), dropping oldest chunks`);
        audioQueueRef.current = audioQueueRef.current.slice(-10); // Keep last 10 chunks
      }
      
      // CRITICAL: Resume audio context if suspended (browser autoplay policy)
      if (audioContextRef.current.state === 'suspended') {
        console.log('[🔊 Audio] Resuming suspended AudioContext...');
        await audioContextRef.current.resume();
        console.log('[🔊 Audio] ✅ AudioContext resumed, state:', audioContextRef.current.state);
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
        console.log(`[🔊 Audio] ✅ Scheduled chunk at ${scheduleTime.toFixed(3)}s, duration: ${duration.toFixed(3)}s, samples: ${audioBuffer.length}`);
      } catch (startError) {
        console.error("[🔊 Audio] ❌ Failed to start audio source:", startError);
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
    
    // Reset stream cleanup flag for next session
    streamCleanupTriggeredRef.current = false;
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
      voiceLogger.debug("Mode updated locally (not connected yet)");
    }

    // Stop audio if muting
    if (!tutorAudio && isPlayingRef.current) {
      stopAudio();
    }

    // Handle microphone toggling (only if connected)
    const isConnected = wsRef.current && wsRef.current.readyState === WebSocket.OPEN;
    
    if (isConnected && studentMic && !previousMicState) {
      // Switching to Voice mode - start microphone
      voiceLogger.info("Enabling microphone for Voice mode");
      await startMicrophone();
      // MIC STATUS: Mic is now listening
      updateMicStatus('listening', true);
    } else if (isConnected && !studentMic && previousMicState) {
      // Switching to Hybrid/Text mode - stop microphone
      voiceLogger.info("Disabling microphone for Hybrid/Text mode");
      stopMicrophone();
      // MIC STATUS: Mic is now off
      updateMicStatus('mic_off', true);
    }
  }, [updateMicStatus]);

  const addSystemMessage = useCallback((message: string) => {
    voiceLogger.info("System message:", message);
    addTranscriptMessage({
      speaker: "system",
      text: message,
      timestamp: new Date().toISOString(),
    });
  }, [addTranscriptMessage]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // iOS/Android AUDIO UNLOCK
  // Must be called during a user gesture (button tap) to enable audio playback
  // iOS Safari and some Android browsers require user interaction before audio
  // IMPORTANT: This function fires synchronously to catch the gesture timing window
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const unlockAudioForMobile = useCallback(() => {
    if (audioUnlockedRef.current) {
      voiceLogger.debug("Audio already unlocked, skipping");
      return;
    }
    
    voiceLogger.info("Unlocking audio for iOS/Android...");
    
    try {
      // Create AudioContext synchronously during user gesture
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 16000 });
        voiceLogger.info("Created AudioContext for mobile unlock");
      }
      
      // Play a tiny silent buffer immediately to unlock audio playback
      // This must happen synchronously during the gesture
      const silentBuffer = audioContextRef.current.createBuffer(1, 1, 16000);
      const source = audioContextRef.current.createBufferSource();
      source.buffer = silentBuffer;
      source.connect(audioContextRef.current.destination);
      source.start(0);
      
      // Resume context asynchronously (but audio is already unlocked by silent play)
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().then(() => {
          voiceLogger.info("AudioContext resumed from suspended state");
        }).catch(err => {
          voiceLogger.warn("AudioContext resume failed:", err);
        });
      }
      
      audioUnlockedRef.current = true;
      voiceLogger.info("Audio unlocked successfully for mobile");
    } catch (err) {
      voiceLogger.warn("Audio unlock attempt failed (may still work):", err);
      // Mark as unlocked anyway - we tried during user gesture
      audioUnlockedRef.current = true;
    }
  }, []);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      cleanupAllTimers();
    };
  }, [cleanupAllTimers]);

  return {
    connect,
    disconnect,
    sendTextMessage,
    sendDocumentUploaded,
    updateMode,
    addSystemMessage,
    retryMicrophone,
    dismissMicrophoneError,
    unlockAudioForMobile,
    isConnected,
    transcript,
    error,
    microphoneError,
    isTutorSpeaking,
    isTutorThinking,
    audioEnabled,
    micEnabled,
    micStatus,
  };
}