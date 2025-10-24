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
        console.log('[VoiceHost] 🎤 About to start microphone...');
        try {
          await startMicrophone();
          console.log('[VoiceHost] ✅ Microphone started successfully');
        } catch (micError) {
          console.error('[VoiceHost] ❌ Microphone failed to start:', micError);
          // Continue anyway - user can still hear AI even without mic
        }
        
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
      
      // Check current permission status
      try {
        const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        console.log('[Microphone] 📋 Current permission state:', permissionStatus.state);
        
        if (permissionStatus.state === 'denied') {
          throw new Error('Microphone permission denied. Please enable it in browser settings.');
        }
      } catch (permError) {
        console.warn('[Microphone] ⚠️ Could not check permission status:', permError);
      }
      
      // Get user's microphone at WHATEVER sample rate their hardware uses
      console.log('[Microphone] 📞 Calling getUserMedia...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
          // NO sampleRate constraint - accept whatever the hardware provides
        }
      });
      console.log('[Microphone] ✅ getUserMedia succeeded!');
      mediaStreamRef.current = stream;
      
      // Log the actual microphone settings
      const audioTrack = stream.getAudioTracks()[0];
      const settings = audioTrack.getSettings();
      console.log('[Microphone] 📊 User microphone settings:', settings);
      
      // Create audio context at 16kHz - this automatically resamples ANY input to 16kHz!
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;
      
      console.log('[Microphone] 🔄 Resampling:', settings.sampleRate || 'unknown', 'Hz → 16000 Hz');
      
      const source = audioContext.createMediaStreamSource(stream);
      
      // Try to use AudioWorklet for better performance (fallback to ScriptProcessor if needed)
      let useWorklet = false;
      try {
        await audioContext.audioWorklet.addModule('/audio-processor.js');
        const workletNode = new AudioWorkletNode(audioContext, 'audio-processor');
        
        workletNode.port.onmessage = (event) => {
          console.log('[Microphone] 📨 Received audio from worklet:', {
            type: event.data.type,
            hasData: !!event.data.data,
            isMuted,
            isConnected: geminiVoice.isConnected
          });
          
          if (!isMuted && geminiVoice.isConnected && event.data.type === 'audio') {
            const audioData = event.data.data; // Float32Array, 16kHz, mono
            
            // Convert Float32 to PCM16 for Gemini
            const pcm16 = new Int16Array(audioData.length);
            for (let i = 0; i < audioData.length; i++) {
              const s = Math.max(-1, Math.min(1, audioData[i]));
              pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            
            // Send to Gemini
            console.log('[Microphone] 🎤 Sending audio to Gemini, size:', pcm16.buffer.byteLength);
            geminiVoice.sendAudio(pcm16.buffer);
          } else {
            console.log('[Microphone] ⚠️ Skipping audio send:', {
              reason: !geminiVoice.isConnected ? 'Not connected' : isMuted ? 'Muted' : 'Unknown'
            });
          }
        };
        
        source.connect(workletNode);
        workletNode.connect(audioContext.destination);
        audioProcessorRef.current = workletNode as any;
        useWorklet = true;
        console.log('[Microphone] ✅ Using AudioWorklet for optimal performance');
        
      } catch (workletError) {
        console.warn('[Microphone] ⚠️ AudioWorklet not available, using ScriptProcessor fallback');
        
        // Fallback to ScriptProcessor for older browsers
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        audioProcessorRef.current = processor;
        
        console.log('🎤 [DEBUG] ScriptProcessor created:', {
          exists: !!processor,
          bufferSize: processor.bufferSize
        });
        
        source.connect(processor);
        processor.connect(audioContext.destination);
        
        console.log('🎤 [DEBUG] ScriptProcessor connected to audio chain');
        
        let callbackCount = 0;
        processor.onaudioprocess = (e) => {
          callbackCount++;
          
          // Log every 10 callbacks to prove it's working (more frequent for debugging)
          if (callbackCount % 10 === 0) {
            console.log(`🎤 [DEBUG] Callback firing! Count: ${callbackCount}`);
          }
          
          if (!isMuted && geminiVoice.isConnected) {
            const inputData = e.inputBuffer.getChannelData(0);
            
            // Check if there's actual audio (not silence) - VERY lenient threshold
            const maxAmplitude = Math.max(...Array.from(inputData).map(Math.abs));
            const hasAudio = maxAmplitude > 0.001; // Much more lenient!
            
            if (callbackCount % 50 === 0) {
              console.log('[Microphone] 📈 Audio level check:', {
                maxAmplitude,
                hasAudio,
                isMuted,
                isConnected: geminiVoice.isConnected
              });
            }
            
            if (hasAudio) {
              // Convert Float32 to PCM16 for Gemini
              const pcm16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                const s = Math.max(-1, Math.min(1, inputData[i]));
                pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
              }
              
              // Send to Gemini
              console.log('[Microphone] 🎤 Sending audio to Gemini, size:', pcm16.buffer.byteLength, 'amplitude:', maxAmplitude.toFixed(4));
              geminiVoice.sendAudio(pcm16.buffer);
            }
          } else {
            if (callbackCount % 50 === 0) {
              console.log('[Microphone] ⚠️ Not sending audio:', {
                isMuted,
                isConnected: geminiVoice.isConnected
              });
            }
          }
        };
        
        console.log('🎤 [DEBUG] Callback assigned:', !!processor.onaudioprocess);
      }
      
      setIsRecording(true);
      console.log('[Microphone] ✅ Active and streaming to Gemini at standardized 16kHz');
      console.log('[Microphone] 🎯 Compatible with ALL microphones:', {
        method: useWorklet ? 'AudioWorklet' : 'ScriptProcessor',
        input: settings.sampleRate || 'any',
        output: '16000 Hz mono PCM16'
      });
      
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
