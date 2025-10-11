import { useEffect, useState } from 'react';
import { useRealtimeVoice } from '@/hooks/use-realtime-voice';
import { RealtimeVoiceTranscript } from './realtime-voice-transcript';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

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
  const { toast } = useToast();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [voice, setVoice] = useState<string>('alloy');
  const [isRecording, setIsRecording] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);

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
  });

  const startSession = async () => {
    try {
      const response = await apiRequest('POST', '/api/session/realtime/start', {
        studentId,
        subject,
        language,
        ageGroup,
        contextDocumentIds,
      });

      const data = await response.json();
      
      if (data.sessionId && data.wsUrl && data.token) {
        setSessionId(data.sessionId);
        setWsUrl(data.wsUrl);
        setToken(data.token);
        setVoice(data.voice || 'alloy');
        onSessionStart?.();
        
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

  useEffect(() => {
    if (wsUrl && token && !isConnected) {
      connect();
    }
  }, [wsUrl, token, isConnected, connect]);

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
