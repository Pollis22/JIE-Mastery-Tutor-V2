import { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';

interface GeminiVoiceConfig {
  sessionId: string;
  model: string;
  config: any;
  studentName?: string;
  subject?: string;
  ageGroup?: string;
  language?: string;
}

export function useGeminiVoice() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<Array<{
    speaker: 'tutor' | 'student';
    text: string;
    timestamp: string;
  }>>([]);

  const sessionRef = useRef<any>(null);
  const dbSessionIdRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const connect = useCallback(async (params: {
    voice?: string;
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
      console.log('🔵 [GeminiVoice] Starting connection...');

      // Get session configuration from backend
      const response = await fetch('/api/session/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voice: params.voice,
          userId: params.userId,
          studentId: params.studentId,
          studentName: params.studentName,
          subject: params.subject,
          language: params.language || 'en',
          ageGroup: params.ageGroup,
          contextDocumentIds: params.contextDocumentIds || [],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`HTTP ${response.status}: ${JSON.stringify(errorData)}`);
      }

      const data: GeminiVoiceConfig = await response.json();
      console.log('✅ [GeminiVoice] Got session config:', {
        sessionId: data.sessionId,
        model: data.model,
      });

      // Store database session ID for transcript tracking
      dbSessionIdRef.current = data.sessionId;

      // Initialize Gemini client
      // Note: In production, the API key should be handled server-side
      // For now, we'll use the server-provided configuration
      console.log('🎤 [GeminiVoice] Requesting microphone access...');
      
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      console.log('✅ [GeminiVoice] Microphone access granted');

      // Set up audio context
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });

      setIsConnected(true);
      setIsConnecting(false);
      
      console.log('✅ [GeminiVoice] Connection established');
      console.log('   Session ID:', data.sessionId);
      console.log('   Model:', data.model);

    } catch (err: any) {
      console.error('❌ [GeminiVoice] Connection failed:', err);
      setError(err.message || 'Failed to connect');
      setIsConnecting(false);
      setIsConnected(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    console.log('🔴 [GeminiVoice] Disconnecting...');

    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch (err) {
        console.error('Error closing session:', err);
      }
      sessionRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      await audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setIsConnected(false);
    setIsSpeaking(false);
    console.log('✅ [GeminiVoice] Disconnected');
  }, []);

  const sendMessage = useCallback((text: string) => {
    if (!isConnected || !sessionRef.current) {
      console.warn('Cannot send message: not connected');
      return;
    }

    console.log('📤 [GeminiVoice] Sending text:', text);
    // Implementation will depend on Gemini's WebSocket protocol
    // This is a placeholder for the actual implementation
  }, [isConnected]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnecting,
    isConnected,
    isSpeaking,
    error,
    transcript,
    connect,
    disconnect,
    sendMessage,
    dbSessionId: dbSessionIdRef.current,
  };
}
