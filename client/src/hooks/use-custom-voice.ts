import { useState, useRef, useCallback } from "react";

interface TranscriptMessage {
  speaker: "student" | "tutor";
  text: string;
  timestamp?: string;
}

export function useCustomVoice() {
  const [isConnected, setIsConnected] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);

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
            await playAudio(message.data);
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
      console.log("[Custom Voice] 🎤 Starting microphone...");
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });
      
      mediaStreamRef.current = stream;
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      
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
      
      console.log("[Custom Voice] ✅ Microphone started");
      
    } catch (error) {
      console.error("[Custom Voice] ❌ Microphone error:", error);
      setError("Microphone access denied");
    }
  };

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
      return;
    }

    isPlayingRef.current = true;
    const audioBuffer = audioQueueRef.current.shift()!;

    if (!audioContextRef.current) return;

    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContextRef.current.destination);
    
    source.onended = () => {
      playNextChunk();
    };
    
    source.start();
  };

  const cleanup = () => {
    if (processorRef.current) {
      processorRef.current.disconnect();
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

  return {
    connect,
    disconnect,
    isConnected,
    transcript,
    error,
  };
}
