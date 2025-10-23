import { useEffect, useState, useRef, useCallback } from 'react';
import { useRealtimeVoice } from '@/hooks/use-realtime-voice';
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
  const [voiceProvider, setVoiceProvider] = useState<'gemini' | 'openai'>('gemini'); // Default to Gemini
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
  const fallbackAttemptedRef = useRef(false);
  
  // Gemini Voice Hook
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
      
      // If Gemini fails and we haven't tried OpenAI yet, trigger fallback
      if (!fallbackAttemptedRef.current && voiceProvider === 'gemini') {
        fallbackAttemptedRef.current = true;
        console.log('🔄 [VoiceHost] Gemini error, triggering OpenAI fallback...');
        
        // CRITICAL: Stop Gemini microphone before switching to OpenAI
        stopMicrophone();
        geminiVoice.endSession();
        
        toast({
          title: "Switching to OpenAI",
          description: "Gemini unavailable, using OpenAI as backup...",
        });
        
        setVoiceProvider('openai');
        
        // Trigger OpenAI fallback
        startOpenAISession().catch(err => {
          console.error('[VoiceHost] OpenAI fallback failed:', err);
          toast({
            title: "All Providers Failed",
            description: "Unable to start voice session. Please try again later.",
            variant: "destructive",
          });
        });
      } else {
        // Regular error toast (not a fallback scenario)
        toast({
          title: "Voice Error",
          description: error.message,
          variant: "destructive",
        });
      }
    },
    onConnected: () => {
      console.log('[Voice Host] Gemini connected successfully');
    },
    onDisconnected: () => {
      console.log('[Voice Host] Gemini disconnected');
    }
  });

  // OpenAI Voice Hook (Fallback)
  const {
    isConnected: openaiConnected,
    status: openaiStatus,
    messages: openaiMessages,
    connect: openaiConnect,
    disconnect: openaiDisconnect,
    sendAudio: openaiSendAudio,
    isConnecting: openaiConnecting,
    isProcessingDocuments: openaiProcessingDocs,
  } = useRealtimeVoice();

  // Determine which provider is active
  const isConnected = voiceProvider === 'gemini' ? geminiVoice.isConnected : openaiConnected;
  const isSpeaking = voiceProvider === 'gemini' ? false : false; // Can add geminiVoice.isSpeaking if needed

  const startSession = async () => {
    try {
      // Reset fallback flag
      fallbackAttemptedRef.current = false;
      
      // Route to correct endpoint based on provider
      if (voiceProvider === 'openai') {
        // User explicitly wants OpenAI - go straight there
        await startOpenAISession();
        return;
      }
      
      // Default: Try Gemini first (93% cheaper)
      console.log('🎯 [VoiceHost] Starting Gemini session...');
      
      const response = await apiRequest('POST', '/api/session/gemini', {
        studentId,
        studentName,
        subject,
        language,
        ageGroup,
        contextDocumentIds
      });

      const data = await response.json();
      
      if (data.success && data.provider === 'gemini' && data.geminiApiKey && data.systemInstruction) {
        // Gemini session - establish WebSocket connection
        console.log('[VoiceHost] ✅ Got Gemini credentials, connecting...');
        
        setSessionId(data.sessionId);
        setVoiceProvider('gemini');
        
        // Start Gemini WebSocket session
        await geminiVoice.startSession(
          data.geminiApiKey,
          data.systemInstruction,
          data.sessionId  // Database session ID for tracking
        );
        
        // Start microphone capture for Gemini
        await startMicrophoneForGemini();
        
        onSessionStart?.();
        
        toast({
          title: "Gemini Voice Session Started",
          description: `Connected with ${data.metadata?.studentName || studentName} - Saving 93% vs OpenAI!`,
        });
        
      } else {
        throw new Error(data.error || 'Invalid Gemini session response');
      }
      
    } catch (error: any) {
      console.error('[VoiceHost] Gemini failed:', error);
      
      // If Gemini fails and we haven't tried fallback yet, try OpenAI
      if (!fallbackAttemptedRef.current) {
        fallbackAttemptedRef.current = true;
        console.log('🔄 [VoiceHost] Gemini failed, trying OpenAI fallback...');
        
        toast({
          title: "Switching to OpenAI",
          description: "Gemini unavailable, using OpenAI as backup...",
        });
        
        setVoiceProvider('openai');
        
        // Try OpenAI fallback
        await startOpenAISession();
        return;
      }
      
      toast({
        title: "Session Error",
        description: error.message || 'Failed to start voice session',
        variant: "destructive",
      });
    }
  };

  // OpenAI fallback session starter
  const startOpenAISession = async () => {
    try {
      console.log('[VoiceHost] Starting OpenAI session...');
      
      const response = await apiRequest('POST', '/api/session/realtime', {
        studentId,
        studentName,
        subject,
        language,
        ageGroup,
        contextDocumentIds,
        model: 'gpt-4o-mini-realtime-preview-2024-12-17'
      });

      const data = await response.json();
      
      if (data.success && data.sessionId && data.client_secret) {
        console.log('[VoiceHost] ✅ Got OpenAI credentials, connecting...');
        
        setSessionId(data.sessionId);
        setVoiceProvider('openai');
        
        // Connect OpenAI WebRTC with credentials
        await openaiConnect({
          sessionId: data.sessionId,
          clientSecret: data.client_secret,
          model: data.model || 'gpt-4o-mini-realtime-preview-2024-12-17',
          voice: data.voice || 'alloy',
          language: language,
          ageGroup: ageGroup,
          subject: subject,
          contextDocumentIds: contextDocumentIds,
          userId: user?.id,
          studentId: studentId,
          studentName: studentName,
        });
        
        console.log('[VoiceHost] OpenAI WebRTC connection initiated');
        
        onSessionStart?.();
        
        toast({
          title: "OpenAI Voice Session Started",
          description: `Connected with ${data.voice} voice${voiceProvider === 'openai' ? '' : ' (fallback mode)'}`,
        });
      } else {
        throw new Error(data.error || 'Failed to start OpenAI session');
      }
    } catch (error: any) {
      console.error('[VoiceHost] OpenAI session failed:', error);
      toast({
        title: voiceProvider === 'openai' ? "OpenAI Session Failed" : "All Providers Failed",
        description: error.message || "Unable to start voice session. Please try again later.",
        variant: "destructive",
      });
    }
  };

  // Start microphone capture for Gemini
  const startMicrophoneForGemini = async () => {
    try {
      console.log('[Microphone] 🎤 Requesting access...');
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      
      // Create audio context for processing
      const audioContext = new AudioContext({ sampleRate: 24000 });
      audioContextRef.current = audioContext;
      
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      audioProcessorRef.current = processor;
      
      processor.onaudioprocess = (e) => {
        if (!isMuted && geminiVoice.isConnected) {
          const inputData = e.inputBuffer.getChannelData(0);
          
          // Convert Float32 to PCM16
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
        const response = await apiRequest('POST', `/api/session/realtime/${sessionId}/end`, {});
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
    
    // Disconnect provider
    if (voiceProvider === 'gemini') {
      geminiVoice.endSession();
    } else {
      openaiDisconnect();
    }
    
    // Clear local state
    setSessionId(null);
    setTranscriptMessages([]);
    fallbackAttemptedRef.current = false;
    
    // Notify parent component
    onSessionEnd?.();
    
    console.log('✅ [VoiceHost] Session ended successfully');
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMicrophone();
      if (voiceProvider === 'gemini') {
        geminiVoice.endSession();
      } else {
        openaiDisconnect();
      }
    };
  }, [voiceProvider, geminiVoice, openaiDisconnect]);

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
            
            {isConnected && (
              <div className="text-sm text-muted-foreground">
                Connected via {voiceProvider === 'gemini' ? '🔵 Gemini' : '🟠 OpenAI'}
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
              <div key={idx} className={`p-2 rounded ${msg.speaker === 'tutor' ? 'bg-blue-50' : 'bg-gray-50'}`}>
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
