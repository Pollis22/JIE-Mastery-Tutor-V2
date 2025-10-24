import { useEffect, useState, useRef, useCallback } from 'react';
import { useGeminiVoice } from '@/hooks/use-gemini-voice';
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
  const [isRecording, setIsRecording] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [transcriptMessages, setTranscriptMessages] = useState<Array<{
    speaker: 'tutor' | 'student';
    text: string;
    timestamp: string;
  }>>([]);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  
  // Gemini Voice Hook (ONLY PROVIDER - 93% cheaper than OpenAI!)
  const geminiVoice = useGeminiVoice({
    onTranscript: (text: string, isUser: boolean) => {
      setTranscriptMessages(prev => [...prev, {
        speaker: isUser ? 'student' : 'tutor',
        text,
        timestamp: new Date().toISOString()
      }]);
    },
    onError: (error: Error) => {
      console.error('[Voice Host] Gemini error:', error);
      toast({
        title: "Voice Error",
        description: error.message,
        variant: "destructive",
      });
    },
    onConnected: () => {
      console.log('[Voice Host] Gemini connected successfully');
    },
    onDisconnected: () => {
      console.log('[Voice Host] Gemini disconnected');
    }
  });

  const startSession = async () => {
    try {
      console.log('🎯 [VoiceHost] 📞 Requesting Gemini session from backend...');
      
      const response = await apiRequest('POST', '/api/session/gemini', {
        studentId,
        studentName,
        subject,
        language,
        ageGroup,
        contextDocumentIds
      });

      const data = await response.json();
      
      console.log('[VoiceHost] 📦 Backend response:', {
        success: data.success,
        sessionId: data.sessionId,
        provider: data.provider,
        hasApiKey: !!data.geminiApiKey,
        apiKeyLength: data.geminiApiKey?.length,
        hasSystemInstruction: !!data.systemInstruction,
        instructionLength: data.systemInstruction?.length,
        documentsLoaded: data.metadata?.documentsLoaded
      });
      
      // CRITICAL: Verify we got the API key
      if (!data.geminiApiKey) {
        throw new Error('Backend did not provide Gemini API key!');
      }

      if (data.geminiApiKey.length < 30) {
        throw new Error('Gemini API key seems too short - might be invalid');
      }
      
      if (data.success && data.provider === 'gemini' && data.geminiApiKey && data.systemInstruction) {
        console.log('[VoiceHost] ✅ Got valid credentials, starting Gemini...');
        
        setSessionId(data.sessionId);
        
        // Start Gemini WebSocket session
        await geminiVoice.startSession(
          data.geminiApiKey,
          data.systemInstruction
        );
        
        // Start microphone capture
        await startMicrophone();
        
        onSessionStart?.();
        
        toast({
          title: "Voice Session Started",
          description: `Connected with Gemini - ${data.metadata?.studentName || studentName}`,
        });
        
      } else {
        throw new Error(data.error || 'Invalid session response');
      }
      
    } catch (error: any) {
      console.error('[VoiceHost] ❌ Session failed:', error);
      toast({
        title: "Session Error",
        description: error.message || 'Failed to start voice session',
        variant: "destructive",
      });
    }
  };

  // Start microphone capture for Gemini
  const startMicrophone = async () => {
    try {
      console.log('[Microphone] 🎤 Requesting access...');
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      
      // Create audio context for processing (24kHz for Gemini)
      const audioContext = new AudioContext({ sampleRate: 24000 });
      audioContextRef.current = audioContext;
      
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      audioProcessorRef.current = processor;
      
      processor.onaudioprocess = (e) => {
        if (!isMuted && geminiVoice.isConnected) {
          const inputData = e.inputBuffer.getChannelData(0);
          
          // Convert Float32 to PCM16 for Gemini
          const pcm16 = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          
          // Send to Gemini
          geminiVoice.sendAudio(pcm16.buffer);
        }
      };
      
      source.connect(processor);
      processor.connect(audioContext.destination);
      
      setIsRecording(true);
      console.log('[Microphone] ✅ Active and streaming to Gemini');
      
      toast({
        title: "Microphone Active",
        description: "You can now speak to the AI tutor",
      });
      
    } catch (error: any) {
      console.error('[Microphone] ❌ Access error:', error);
      toast({
        title: "Microphone Error",
        description: "Could not access microphone. Please check permissions.",
        variant: "destructive",
      });
    }
  };

  // Stop microphone capture
  const stopMicrophone = () => {
    console.log('[Microphone] 🛑 Stopping...');
    
    if (audioProcessorRef.current) {
      audioProcessorRef.current.disconnect();
      audioProcessorRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    
    setIsRecording(false);
    console.log('[Microphone] ✅ Stopped');
  };

  const endSession = async () => {
    console.log('🔴 [VoiceHost] Ending session...');
    
    // Save session and track minutes used
    if (sessionId) {
      try {
        const response = await apiRequest('POST', `/api/session/gemini/${sessionId}/end`, {});
        const data = await response.json();
        
        if (data.success) {
          console.log(`✅ [VoiceHost] Session saved. Minutes used: ${data.minutesUsed}`);
          
          // Show appropriate message based on minute deduction status
          if (data.insufficientMinutes) {
            toast({
              title: "Session Ended - Out of Minutes",
              description: `Voice session completed (${data.minutesUsed} minutes). You've run out of voice minutes.`,
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
        console.error('[VoiceHost] Failed to save session:', error);
        toast({
          title: "Session Ended",
          description: "Voice session has been closed",
        });
      }
    }
    
    // Stop microphone
    stopMicrophone();
    
    // Disconnect Gemini
    geminiVoice.endSession();
    
    // Clear local state
    setSessionId(null);
    setTranscriptMessages([]);
    
    // Notify parent component
    onSessionEnd?.();
    
    console.log('✅ [VoiceHost] Session ended successfully');
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  // Cleanup on unmount - no dependencies to avoid infinite loop
  useEffect(() => {
    return () => {
      stopMicrophone();
      geminiVoice.endSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
              onClick={toggleMute}
              variant={isMuted ? "destructive" : "default"}
              disabled={!isRecording}
              data-testid="button-toggle-mute"
            >
              {isMuted ? <VolumeX className="w-4 h-4 mr-2" /> : <Volume2 className="w-4 h-4 mr-2" />}
              {isMuted ? 'Unmute' : 'Mute'}
            </Button>
            
            <Button onClick={endSession} variant="secondary" data-testid="button-end-voice">
              End Session
            </Button>
            
            {geminiVoice.isConnected && (
              <div className="text-sm text-muted-foreground">
                Connected via 🔵 Gemini Live
              </div>
            )}
          </>
        )}
      </div>

      {sessionId && (
        <div className="mt-4 p-4 border rounded-lg">
          <h3 className="font-semibold mb-2">Conversation Transcript</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {transcriptMessages.map((msg, idx) => (
              <div key={idx} className={`p-2 rounded ${msg.speaker === 'tutor' ? 'bg-blue-50 dark:bg-blue-900' : 'bg-gray-50 dark:bg-gray-800'}`}>
                <div className="text-xs text-muted-foreground">{msg.speaker === 'tutor' ? '🤖 AI Tutor' : '👤 Student'}</div>
                <div className="text-sm">{msg.text}</div>
              </div>
            ))}
            {transcriptMessages.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-4">
                Speak to start the conversation...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
