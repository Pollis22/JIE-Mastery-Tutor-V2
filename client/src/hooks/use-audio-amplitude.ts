import { useEffect, useRef, useCallback, useState } from 'react';

interface UseAudioAmplitudeOptions {
  fftSize?: number;
  smoothingTimeConstant?: number;
  updateInterval?: number;
}

interface UseAudioAmplitudeReturn {
  amplitude: number;
  connectAudioContext: (ctx: AudioContext, sourceNode: AudioNode) => void;
  disconnect: () => void;
}

export function useAudioAmplitude(options: UseAudioAmplitudeOptions = {}): UseAudioAmplitudeReturn {
  const {
    fftSize = 256,
    smoothingTimeConstant = 0.8,
    updateInterval = 33
  } = options;

  const [amplitude, setAmplitude] = useState(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const rafIdRef = useRef<number>(0);
  const lastUpdateRef = useRef<number>(0);
  const connectedRef = useRef<boolean>(false);
  const intermediateNodeRef = useRef<GainNode | null>(null);

  const calculateRMS = useCallback((dataArray: Uint8Array): number => {
    let sum = 0;
    const length = dataArray.length;
    for (let i = 0; i < length; i++) {
      const normalized = (dataArray[i] - 128) / 128;
      sum += normalized * normalized;
    }
    return Math.sqrt(sum / length);
  }, []);

  const updateAmplitude = useCallback(() => {
    if (!analyserRef.current || !dataArrayRef.current || !connectedRef.current) {
      rafIdRef.current = requestAnimationFrame(updateAmplitude);
      return;
    }

    const now = performance.now();
    if (now - lastUpdateRef.current < updateInterval) {
      rafIdRef.current = requestAnimationFrame(updateAmplitude);
      return;
    }
    lastUpdateRef.current = now;

    try {
      analyserRef.current.getByteTimeDomainData(dataArrayRef.current);
      const rms = calculateRMS(dataArrayRef.current);
      const normalizedAmplitude = Math.min(rms * 3, 1);
      setAmplitude(normalizedAmplitude);
    } catch (e) {
    }

    rafIdRef.current = requestAnimationFrame(updateAmplitude);
  }, [calculateRMS, updateInterval]);

  const connectAudioContext = useCallback((ctx: AudioContext, sourceNode: AudioNode) => {
    if (connectedRef.current) {
      return;
    }

    try {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = fftSize;
      analyser.smoothingTimeConstant = smoothingTimeConstant;
      
      const intermediateGain = ctx.createGain();
      intermediateGain.gain.value = 1;
      
      sourceNode.connect(intermediateGain);
      intermediateGain.connect(analyser);
      
      analyserRef.current = analyser;
      intermediateNodeRef.current = intermediateGain;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
      connectedRef.current = true;

      rafIdRef.current = requestAnimationFrame(updateAmplitude);
    } catch (e) {
      console.warn('[AudioAmplitude] Failed to connect:', e);
    }
  }, [fftSize, smoothingTimeConstant, updateAmplitude]);

  const disconnect = useCallback(() => {
    cancelAnimationFrame(rafIdRef.current);
    
    if (intermediateNodeRef.current) {
      try {
        intermediateNodeRef.current.disconnect();
      } catch (e) {
      }
      intermediateNodeRef.current = null;
    }
    
    analyserRef.current = null;
    dataArrayRef.current = null;
    connectedRef.current = false;
    setAmplitude(0);
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    amplitude,
    connectAudioContext,
    disconnect
  };
}

export function useSimulatedAmplitude(isActive: boolean): number {
  const [amplitude, setAmplitude] = useState(0);
  const rafIdRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const lastUpdateRef = useRef<number>(0);

  useEffect(() => {
    if (!isActive) {
      setAmplitude(0);
      return;
    }

    startTimeRef.current = performance.now();
    lastUpdateRef.current = 0;

    const animate = () => {
      const now = performance.now();
      if (now - lastUpdateRef.current < 33) {
        rafIdRef.current = requestAnimationFrame(animate);
        return;
      }
      lastUpdateRef.current = now;

      const elapsed = (now - startTimeRef.current) / 1000;
      const base = 0.3;
      const wave1 = Math.sin(elapsed * 2.5) * 0.2;
      const wave2 = Math.sin(elapsed * 4.1) * 0.15;
      const wave3 = Math.sin(elapsed * 7.3) * 0.1;
      const noise = (Math.random() - 0.5) * 0.1;
      
      const combined = base + wave1 + wave2 + wave3 + noise;
      setAmplitude(Math.max(0, Math.min(1, combined)));
      
      rafIdRef.current = requestAnimationFrame(animate);
    };

    rafIdRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafIdRef.current);
    };
  }, [isActive]);

  return amplitude;
}
