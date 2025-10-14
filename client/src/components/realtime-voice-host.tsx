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
  subject?: string;
  language?: 'en' | 'es' | 'hi' | 'zh';
  ageGroup?: 'K-2' | '3-5' | '6-8' | '9-12' | 'College/Adult';
  contextDocumentIds?: string[];
  onSessionStart?: () => void;
  onSessionEnd?: () => void;
}

export function RealtimeVoiceHost({
  studentId,
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
  const hasGreetedRef = useRef(false);

  const {
    isConnected,
    status,
    messages,
    connect,
    disconnect,
    sendAudio,
  } = useRealtimeVoice({
    sessionId: sessionId || undefined,
    wsUrl: wsUrl || undefined,
    token: token || undefined,
    language,
    voice,
    clientSecret: clientSecret || undefined,
    model: model || undefined,
  });

  const startSession = async () => {
    try {
      // Call the unified endpoint (without /start)
      const response = await apiRequest('POST', '/api/session/realtime', {
        studentId,
        subject,
        language,
        ageGroup,
        contextDocumentIds,
        model: 'gpt-4o-realtime-preview-2024-10-01'
      });

      const data = await response.json();
      
      // The new endpoint returns success flag and client_secret directly
      if (data.success && data.sessionId && data.client_secret) {
        setSessionId(data.sessionId);
        setClientSecret(data.client_secret); // Store the client_secret for WebRTC
        setModel(data.model || 'gpt-4o-realtime-preview-2024-10-01');
        setVoice(data.voice || 'alloy');
        setToken(data.sessionId); // Use sessionId as token for backward compatibility
        onSessionStart?.();
        
        // The hook will automatically connect when clientSecret is set
        
        toast({
          title: "Voice Session Started",
          description: `Connected with ${data.voice} voice in ${language.toUpperCase()}`,
        });
      } else {
        throw new Error(data.error || 'Failed to start session');
      }
    } catch (error: any) {
      console.error('[RealtimeVoiceHost] Failed to start session:', error);
      toast({
        title: "Session Error",
        description: error.message || 'Failed to start voice session',
        variant: "destructive",
      });
    }
  };

  const endSession = async () => {
    try {
      if (sessionId) {
        await apiRequest('POST', `/api/session/realtime/${sessionId}/end`, {});
      }
      
      disconnect();
      stopRecording();
      setSessionId(null);
      setWsUrl(null);
      setToken(null);
      hasGreetedRef.current = false; // Reset for next session
      onSessionEnd?.();
      
      toast({
        title: "Session Ended",
        description: "Voice session has been closed",
      });
    } catch (error: any) {
      console.error('[RealtimeVoiceHost] Failed to end session:', error);
    }
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

  // Auto-connect when we have wsUrl and token
  useEffect(() => {
    if (wsUrl && token && !isConnected) {
      connect();
    }
  }, [wsUrl, token, isConnected, connect]);

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
