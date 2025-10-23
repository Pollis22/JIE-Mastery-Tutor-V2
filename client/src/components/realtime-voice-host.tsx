import { useEffect, useState, useRef } from 'react';
import { useRealtimeVoice } from '@/hooks/use-realtime-voice';
import { RealtimeVoiceTranscript } from './realtime-voice-transcript';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';

interface RealtimeVoiceHostProps {
  studentId?: string;
  studentName?: string;
  subject?: string;
  language?: 'en' | 'es' | 'hi' | 'zh';
  ageGroup?: 'K-2' | '3-5' | '6-8' | '9-12' | 'College/Adult';
  contextDocumentIds?: string[];
  onSessionStart?: () => void;
  onSessionEnd?: () => void;
}

export function RealtimeVoiceHost({
  studentId,
  studentName,
  subject,
  language = 'en',
  ageGroup = '3-5',
  contextDocumentIds = [],
  onSessionStart,
  onSessionEnd,
}: RealtimeVoiceHostProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [voice, setVoice] = useState<string>('alloy');
  const [clientSecret, setClientSecret] = useState<any>(null);
  const [model, setModel] = useState<string>('gpt-4o-realtime-preview-2024-10-01');
  const [isRecording, setIsRecording] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [voiceProvider, setVoiceProvider] = useState<'gemini' | 'openai'>('gemini'); // Default to Gemini
  const hasGreetedRef = useRef(false);
  
  // Use props for these
  const selectedSubject = subject;
  const student = { id: studentId };

  const {
    isConnected,
    status,
    messages,
    connect,
    disconnect,
    sendAudio,
    isConnecting,
    isProcessingDocuments,
  } = useRealtimeVoice();

  const startSession = async () => {
    try {
      // Try Gemini first (cheaper and working), fallback to OpenAI if needed
      let endpoint = '/api/session/gemini';
      let provider: 'gemini' | 'openai' = 'gemini';
      
      // Check if user prefers OpenAI or if Gemini fails
      if (voiceProvider === 'openai') {
        endpoint = '/api/session/realtime';
        provider = 'openai';
      }

      console.log(`🎯 [VoiceHost] Starting ${provider} session...`);
      
      const response = await apiRequest('POST', endpoint, {
        studentId,
        studentName,
        subject,
        language,
        ageGroup,
        contextDocumentIds,
        model: provider === 'openai' ? 'gpt-4o-mini-realtime-preview-2024-12-17' : undefined
      });

      const data = await response.json();
      
      if (data.provider === 'gemini') {
        // Gemini session
        setSessionId(data.sessionId);
        setVoiceProvider('gemini');
        onSessionStart?.();
        
        toast({
          title: "Gemini Voice Session Started",
          description: `Connected with ${data.metadata?.studentName || 'your tutor'} - 93% cheaper than OpenAI!`,
        });
      } else if (data.success && data.sessionId && data.client_secret) {
        // OpenAI session
        setSessionId(data.sessionId);
        setClientSecret(data.client_secret);
        setModel(data.model || 'gpt-4o-mini-realtime-preview-2024-12-17');
        setVoice(data.voice || 'alloy');
        setToken(data.sessionId);
        setVoiceProvider('openai');
        onSessionStart?.();
        
        toast({
          title: "OpenAI Voice Session Started",
          description: `Connected with ${data.voice} voice in ${language.toUpperCase()}`,
        });
      } else {
        throw new Error(data.error || 'Failed to start session');
      }
    } catch (error: any) {
      console.error('[RealtimeVoiceHost] Failed to start session:', error);
      
      // If Gemini fails and we haven't tried OpenAI yet, fallback
      if (voiceProvider === 'gemini') {
        console.log('🔄 [VoiceHost] Gemini failed, trying OpenAI fallback...');
        setVoiceProvider('openai');
        toast({
          title: "Switching to OpenAI",
          description: "Gemini unavailable, using OpenAI as backup...",
        });
        // Retry with OpenAI
        setTimeout(() => startSession(), 1000);
        return;
      }
      
      toast({
        title: "Session Error",
        description: error.message || 'Failed to start voice session',
        variant: "destructive",
      });
    }
  };

  const endSession = async () => {
    console.log('🔴 [RealtimeVoiceHost] Ending session...');
    
    // Save session and track minutes used
    if (sessionId) {
      try {
        const response = await apiRequest('POST', `/api/session/realtime/${sessionId}/end`, {});
        const data = await response.json();
        
        if (data.success) {
          console.log(`✅ [RealtimeVoiceHost] Session saved. Minutes used: ${data.minutesUsed}`);
          
          // Show appropriate message based on minute deduction status
          if (data.insufficientMinutes) {
            toast({
              title: "Session Ended - Out of Minutes",
              description: `Voice session completed (${data.minutesUsed} minutes). You've run out of voice minutes. Please upgrade your plan or purchase additional minutes to continue.`,
              variant: "destructive",
            });
          } else {
            toast({
              title: "Session Ended",
              description: `Voice session completed. ${data.minutesUsed} minute${data.minutesUsed !== 1 ? 's' : ''} used.`,
            });
          }
        }
      } catch (error: any) {
        console.error('[RealtimeVoiceHost] Failed to save session:', error);
        // Continue with cleanup even if API call fails
        toast({
          title: "Session Ended",
          description: "Voice session has been closed",
        });
      }
    }
    
    // Clean up WebRTC connection
    disconnect();
    stopRecording();
    
    // Clear local state
    setSessionId(null);
    setWsUrl(null);
    setToken(null);
    setClientSecret(null);
    hasGreetedRef.current = false; // Reset for next session
    
    // Notify parent component
    onSessionEnd?.();
    
    console.log('✅ [RealtimeVoiceHost] Session ended successfully');
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext({ sampleRate: 24000 });
      setAudioContext(ctx);

      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        if (!isMuted) {
          const inputData = e.inputBuffer.getChannelData(0);
          const pcm16 = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            pcm16[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
          }
          sendAudio(pcm16.buffer);
        }
      };

      source.connect(processor);
      processor.connect(ctx.destination);

      setIsRecording(true);
      toast({
        title: "Microphone Active",
        description: "You can now speak to the AI tutor",
      });
    } catch (error: any) {
      console.error('[RealtimeVoiceHost] Microphone access error:', error);
      toast({
        title: "Microphone Error",
        description: "Could not access microphone. Please check permissions.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (audioContext) {
      audioContext.close();
      setAudioContext(null);
    }
    setIsRecording(false);
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  // Auto-connect when we have clientSecret and sessionId
  useEffect(() => {
    if (clientSecret && sessionId && !isConnected) {
      console.log('🔗 [RealtimeVoiceHost] Connecting with credentials:', { 
        sessionId, 
        hasClientSecret: !!clientSecret, 
        clientSecretType: typeof clientSecret,
        clientSecretValue: clientSecret?.value ? 'has value' : 'no value'
      });
      connect({
        sessionId: sessionId,  // Pass the sessionId we already have
        clientSecret: clientSecret,  // Pass the clientSecret we already have
        model: model || 'gpt-4o-realtime-preview-2024-10-01',
        voice: voice || 'alloy',
        language: language || 'en',
        ageGroup: ageGroup || '3-5',
        subject: selectedSubject || 'Math',
        contextDocumentIds: contextDocumentIds || [],
        userId: user?.id,
        studentId: studentId,
        studentName: studentName,
      });
    }
  }, [clientSecret, sessionId, isConnected, connect, model, voice, language, ageGroup, selectedSubject, contextDocumentIds, user?.id, studentId, studentName]);

  // Auto-start microphone and send greeting when connected
  useEffect(() => {
    const initializeSession = async () => {
      if (isConnected && sessionId && !hasGreetedRef.current && !isRecording) {
        hasGreetedRef.current = true;
        
        // Auto-start microphone
        try {
          await startRecording();
          console.log('[RealtimeVoiceHost] Microphone auto-started');
        } catch (error) {
          console.error('[RealtimeVoiceHost] Failed to auto-start mic:', error);
        }
        
        // Send greeting - the greeting will come from server-side system prompt
        // No need to send explicit greeting message
        console.log('[RealtimeVoiceHost] Session initialized with auto-mic');
      }
    };
    
    initializeSession();
  }, [isConnected, sessionId, isRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
      disconnect();
    };
  }, []);

  return (
    <div className="space-y-4" data-testid="realtime-voice-host">
      <div className="flex items-center gap-2">
        {!sessionId ? (
          <Button onClick={startSession} data-testid="button-start-voice">
            Start Voice Session
          </Button>
        ) : (
          <>
            <Button
              onClick={isRecording ? stopRecording : startRecording}
              variant={isRecording ? "destructive" : "default"}
              data-testid="button-toggle-recording"
            >
              {isRecording ? <MicOff className="w-4 h-4 mr-2" /> : <Mic className="w-4 h-4 mr-2" />}
              {isRecording ? 'Stop Mic' : 'Start Mic'}
            </Button>
            
            <Button
              onClick={toggleMute}
              variant="outline"
              disabled={!isRecording}
              data-testid="button-toggle-mute"
            >
              {isMuted ? <VolumeX className="w-4 h-4 mr-2" /> : <Volume2 className="w-4 h-4 mr-2" />}
              {isMuted ? 'Unmute' : 'Mute'}
            </Button>
            
            <Button onClick={endSession} variant="secondary" data-testid="button-end-voice">
              End Session
            </Button>
          </>
        )}
      </div>

      {sessionId && (
        <RealtimeVoiceTranscript
          messages={messages}
          isConnected={isConnected}
          status={status}
          language={language}
          voice={voice}
        />
      )}
    </div>
  );
}
