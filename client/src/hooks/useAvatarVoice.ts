/**
 * Avatar Voice Hook
 * 
 * Cross-browser audio capture for D-ID avatar conversation.
 * Supports:
 * - WebAudio PCM16 capture (preferred, works on all browsers)
 * - MediaRecorder fallback for browsers without AudioWorklet
 * - Streaming STT via WebSocket
 * - Blob upload fallback
 * 
 * Compatible with Chrome, Firefox, Safari (desktop & mobile), Edge
 */

import { useCallback, useRef, useState, useEffect } from 'react';

const LOG_PREFIX = '[Avatar Voice]';

type VoiceStatus = 
  | 'idle'
  | 'requesting_mic'
  | 'listening'
  | 'transcribing'
  | 'speaking'
  | 'error';

interface DiagnosticsInfo {
  browser: string;
  captureMethod: 'webaudio' | 'mediarecorder' | 'none';
  sampleRate: number;
  channels: number;
  sttProvider: string;
  sttMode: 'streaming' | 'upload';
  lastTranscript: string;
  micPermission: 'granted' | 'denied' | 'prompt' | 'unknown';
}

interface UseAvatarVoiceOptions {
  onTranscript?: (text: string, isFinal: boolean) => void;
  onError?: (message: string) => void;
  onStatusChange?: (status: VoiceStatus) => void;
  onSpeakComplete?: () => void;
}

interface AudioCaptureState {
  audioContext: AudioContext | null;
  mediaStream: MediaStream | null;
  workletNode: AudioWorkletNode | null;
  scriptNode: ScriptProcessorNode | null;
  mediaRecorder: MediaRecorder | null;
  sttWebSocket: WebSocket | null;
}

function log(...args: unknown[]) {
  console.log(LOG_PREFIX, ...args);
}

function logError(...args: unknown[]) {
  console.error(LOG_PREFIX, ...args);
}

function detectBrowser(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
  if (ua.includes('Edg')) return 'Edge';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
  return 'Unknown';
}

function supportsAudioWorklet(): boolean {
  return typeof AudioWorkletNode !== 'undefined';
}

function supportsMediaRecorder(): boolean {
  return typeof MediaRecorder !== 'undefined';
}

function float32ToPcm16(float32Array: Float32Array): Int16Array {
  const pcm16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const sample = Math.max(-1, Math.min(1, float32Array[i]));
    pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
  }
  return pcm16;
}

function downsampleTo16k(inputBuffer: Float32Array, inputSampleRate: number): Float32Array {
  if (inputSampleRate === 16000) return inputBuffer;
  
  const ratio = inputSampleRate / 16000;
  const outputLength = Math.floor(inputBuffer.length / ratio);
  const output = new Float32Array(outputLength);
  
  for (let i = 0; i < outputLength; i++) {
    const inputIndex = Math.floor(i * ratio);
    output[i] = inputBuffer[inputIndex];
  }
  
  return output;
}

export function useAvatarVoice(options: UseAvatarVoiceOptions = {}) {
  const { onTranscript, onError, onStatusChange } = options;
  
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [diagnostics, setDiagnostics] = useState<DiagnosticsInfo>({
    browser: detectBrowser(),
    captureMethod: 'none',
    sampleRate: 0,
    channels: 0,
    sttProvider: 'unknown',
    sttMode: 'streaming',
    lastTranscript: '',
    micPermission: 'unknown'
  });
  const [transcript, setTranscript] = useState<string>('');
  const [isListening, setIsListening] = useState(false);
  
  const captureRef = useRef<AudioCaptureState>({
    audioContext: null,
    mediaStream: null,
    workletNode: null,
    scriptNode: null,
    mediaRecorder: null,
    sttWebSocket: null
  });
  
  const recordedChunksRef = useRef<Blob[]>([]);
  const isStoppingRef = useRef(false);
  
  const updateStatus = useCallback((newStatus: VoiceStatus) => {
    log('Status:', newStatus);
    setStatus(newStatus);
    onStatusChange?.(newStatus);
  }, [onStatusChange]);
  
  const stopCapture = useCallback(async () => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;
    
    log('Stopping capture...');
    setIsListening(false);
    
    const state = captureRef.current;
    
    if (state.sttWebSocket && state.sttWebSocket.readyState === WebSocket.OPEN) {
      try {
        state.sttWebSocket.send(JSON.stringify({ type: 'stop' }));
        state.sttWebSocket.close();
      } catch (e) {
        log('Error closing STT WebSocket:', e);
      }
    }
    state.sttWebSocket = null;
    
    if (state.workletNode) {
      state.workletNode.disconnect();
      state.workletNode = null;
    }
    
    if (state.scriptNode) {
      state.scriptNode.disconnect();
      state.scriptNode = null;
    }
    
    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
      state.mediaRecorder.stop();
    }
    state.mediaRecorder = null;
    
    if (state.mediaStream) {
      state.mediaStream.getTracks().forEach(track => track.stop());
      state.mediaStream = null;
    }
    
    if (state.audioContext && state.audioContext.state !== 'closed') {
      try {
        await state.audioContext.close();
      } catch (e) {
        log('Error closing AudioContext:', e);
      }
    }
    state.audioContext = null;
    
    recordedChunksRef.current = [];
    isStoppingRef.current = false;
    
    updateStatus('idle');
    log('Capture stopped');
  }, [updateStatus]);
  
  const connectSttWebSocket = useCallback((): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/did-api/stt/ws`;
      log('Connecting STT WebSocket:', wsUrl);
      
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
      } catch (e) {
        logError('Failed to create WebSocket:', e);
        reject(new Error('Failed to create STT WebSocket'));
        return;
      }
      
      let resolved = false;
      
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          log('STT WebSocket timeout, closing');
          ws.close();
          reject(new Error('STT WebSocket connection timeout'));
        }
      }, 10000);
      
      ws.onopen = () => {
        log('STT WebSocket connected, waiting for ready...');
      };
      
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          log('STT message:', msg.type, msg.transcript?.slice(0, 30) || '');
          
          if (msg.type === 'ready' && !resolved) {
            resolved = true;
            clearTimeout(timeout);
            setDiagnostics(prev => ({
              ...prev,
              sttProvider: msg.provider || 'assemblyai',
              sttMode: 'streaming'
            }));
            resolve(ws);
          }
          
          if (msg.type === 'transcript') {
            setTranscript(msg.transcript || '');
            setDiagnostics(prev => ({
              ...prev,
              lastTranscript: msg.transcript || ''
            }));
            onTranscript?.(msg.transcript || '', msg.isFinal || false);
          }
          
          if (msg.type === 'error') {
            logError('STT error:', msg.message);
            onError?.(msg.message);
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              reject(new Error(msg.message));
            }
          }
          
        } catch (e) {
          logError('Failed to parse STT message:', e);
        }
      };
      
      ws.onerror = (err) => {
        logError('STT WebSocket error:', err);
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(new Error('STT WebSocket connection failed'));
        }
      };
      
      ws.onclose = (event) => {
        log('STT WebSocket closed, code:', event.code);
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(new Error('STT WebSocket closed unexpectedly'));
        }
      };
    });
  }, [onTranscript, onError]);
  
  const startWebAudioCapture = useCallback(async (stream: MediaStream): Promise<boolean> => {
    log('Starting WebAudio capture...');
    
    try {
      const audioContext = new AudioContext({ sampleRate: 16000 });
      captureRef.current.audioContext = audioContext;
      
      if (audioContext.sampleRate !== 16000) {
        log('AudioContext sample rate:', audioContext.sampleRate, '- will resample');
      }
      
      setDiagnostics(prev => ({
        ...prev,
        captureMethod: 'webaudio',
        sampleRate: audioContext.sampleRate,
        channels: 1
      }));
      
      const source = audioContext.createMediaStreamSource(stream);
      
      let ws: WebSocket;
      try {
        ws = await connectSttWebSocket();
        captureRef.current.sttWebSocket = ws;
      } catch (e) {
        logError('Failed to connect STT WebSocket:', e);
        onError?.('Failed to connect to speech recognition');
        return false;
      }
      
      if (supportsAudioWorklet()) {
        log('Using AudioWorklet for capture');
        
        const processorCode = `
          class PCMProcessor extends AudioWorkletProcessor {
            constructor() {
              super();
              this.bufferSize = 4096;
              this.buffer = new Float32Array(this.bufferSize);
              this.bufferIndex = 0;
            }
            
            process(inputs, outputs, parameters) {
              const input = inputs[0];
              if (!input || !input[0]) return true;
              
              const channelData = input[0];
              
              for (let i = 0; i < channelData.length; i++) {
                this.buffer[this.bufferIndex++] = channelData[i];
                
                if (this.bufferIndex >= this.bufferSize) {
                  this.port.postMessage({ samples: this.buffer.slice() });
                  this.bufferIndex = 0;
                }
              }
              
              return true;
            }
          }
          registerProcessor('pcm-processor', PCMProcessor);
        `;
        
        const blob = new Blob([processorCode], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        
        await audioContext.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
        
        const workletNode = new AudioWorkletNode(audioContext, 'pcm-processor');
        captureRef.current.workletNode = workletNode;
        
        workletNode.port.onmessage = (event) => {
          const samples = event.data.samples as Float32Array;
          const resampled = downsampleTo16k(samples, audioContext.sampleRate);
          const pcm16 = float32ToPcm16(resampled);
          
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(pcm16.buffer);
          }
        };
        
        source.connect(workletNode);
        
      } else {
        log('AudioWorklet not supported, using ScriptProcessor');
        
        const bufferSize = 4096;
        const scriptNode = audioContext.createScriptProcessor(bufferSize, 1, 1);
        captureRef.current.scriptNode = scriptNode;
        
        scriptNode.onaudioprocess = (event) => {
          const inputData = event.inputBuffer.getChannelData(0);
          const resampled = downsampleTo16k(inputData, audioContext.sampleRate);
          const pcm16 = float32ToPcm16(resampled);
          
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(pcm16.buffer);
          }
        };
        
        source.connect(scriptNode);
        scriptNode.connect(audioContext.destination);
      }
      
      log('WebAudio capture started');
      return true;
      
    } catch (e) {
      logError('WebAudio capture failed:', e);
      return false;
    }
  }, [connectSttWebSocket, onError]);
  
  const startMediaRecorderCapture = useCallback(async (stream: MediaStream): Promise<boolean> => {
    log('Starting MediaRecorder capture...');
    
    if (!supportsMediaRecorder()) {
      logError('MediaRecorder not supported');
      return false;
    }
    
    try {
      setDiagnostics(prev => ({
        ...prev,
        captureMethod: 'mediarecorder',
        sttMode: 'upload'
      }));
      
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/mp4';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = '';
          }
        }
      }
      
      log('MediaRecorder MIME type:', mimeType || 'default');
      
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      captureRef.current.mediaRecorder = recorder;
      recordedChunksRef.current = [];
      
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };
      
      recorder.onstop = async () => {
        log('MediaRecorder stopped, chunks:', recordedChunksRef.current.length);
        
        if (recordedChunksRef.current.length === 0) return;
        
        updateStatus('transcribing');
        
        const blob = new Blob(recordedChunksRef.current, { type: mimeType || 'audio/webm' });
        log('Recording blob size:', blob.size, 'bytes');
        
        try {
          const response = await fetch('/api/did-api/stt/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: blob
          });
          
          const result = await response.json();
          
          if (result.ok && result.transcript) {
            log('Transcript:', result.transcript.slice(0, 50));
            setTranscript(result.transcript);
            setDiagnostics(prev => ({
              ...prev,
              lastTranscript: result.transcript,
              sttProvider: result.provider
            }));
            onTranscript?.(result.transcript, true);
          } else {
            logError('Transcription failed:', result.message);
            onError?.(result.message || 'Transcription failed');
          }
          
        } catch (e) {
          logError('Upload transcription error:', e);
          onError?.('Failed to transcribe audio');
        }
        
        recordedChunksRef.current = [];
      };
      
      recorder.start(1000);
      log('MediaRecorder started');
      return true;
      
    } catch (e) {
      logError('MediaRecorder capture failed:', e);
      return false;
    }
  }, [onTranscript, onError, updateStatus]);
  
  const startListening = useCallback(async () => {
    if (isListening) {
      log('Already listening, ignoring');
      return;
    }
    
    log('Starting listening...');
    updateStatus('requesting_mic');
    
    await stopCapture();
    
    try {
      const permissionResult = await navigator.permissions?.query?.({ name: 'microphone' as PermissionName });
      setDiagnostics(prev => ({
        ...prev,
        micPermission: (permissionResult?.state as any) || 'unknown'
      }));
    } catch (e) {
      log('Permission query not supported');
    }
    
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        }
      });
      
      captureRef.current.mediaStream = stream;
      log('Microphone access granted');
      
      setDiagnostics(prev => ({ ...prev, micPermission: 'granted' }));
      
    } catch (e: any) {
      logError('Microphone access denied:', e);
      
      setDiagnostics(prev => ({ ...prev, micPermission: 'denied' }));
      updateStatus('error');
      onError?.('Microphone access denied. Please allow microphone access and try again.');
      return;
    }
    
    updateStatus('listening');
    setIsListening(true);
    
    let success = await startWebAudioCapture(stream);
    
    if (!success) {
      log('WebAudio capture failed, trying MediaRecorder fallback...');
      success = await startMediaRecorderCapture(stream);
    }
    
    if (!success) {
      logError('All capture methods failed');
      updateStatus('error');
      onError?.('Audio capture not supported on this device');
      await stopCapture();
    }
    
  }, [isListening, stopCapture, startWebAudioCapture, startMediaRecorderCapture, updateStatus, onError]);
  
  const stopListening = useCallback(async () => {
    log('Stop listening requested');
    await stopCapture();
  }, [stopCapture]);
  
  useEffect(() => {
    return () => {
      stopCapture();
    };
  }, [stopCapture]);
  
  return {
    status,
    transcript,
    diagnostics,
    isListening,
    startListening,
    stopListening
  };
}
