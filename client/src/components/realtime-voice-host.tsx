import { useEffect, useState, useRef, useCallback } from 'react';
import { useCustomVoice } from '@/hooks/use-custom-voice';
import { RealtimeVoiceTranscript } from './realtime-voice-transcript';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
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
  
  // Use Custom Voice Stack (Deepgram + Claude + ElevenLabs)
  const customVoice = useCustomVoice();
  
  // Generate a unique session ID
  const generateSessionId = () => {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  // Create the system instruction for the AI tutor
  const createSystemInstruction = () => {
    const ageSpecificInstructions = {
      'K-2': 'Use simple words and short sentences. Be very encouraging and patient. Use fun comparisons.',
      '3-5': 'Explain things clearly with examples. Be encouraging and help build confidence.',
      '6-8': 'Balance fun with learning. Use relatable examples and encourage critical thinking.',
      '9-12': 'Be more sophisticated. Focus on college preparation and deeper understanding.',
      'College/Adult': 'Treat as a peer. Be efficient and focus on practical applications.'
    };

    return `You are an AI tutor helping ${studentName || 'a student'} (${ageGroup} level) with ${subject || 'their studies'}. 
    ${ageSpecificInstructions[ageGroup]}
    Keep responses concise (2-3 sentences) suitable for voice conversation.
    Speak in ${language === 'es' ? 'Spanish' : language === 'hi' ? 'Hindi' : language === 'zh' ? 'Chinese' : 'English'}.`;
  };

  const startSession = async () => {
    try {
      console.log('🎯 [VoiceHost] Starting custom voice session...');
      
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      // Step 1: Create session in database FIRST
      console.log('[VoiceHost] 📝 Creating session in database...');
      const response = await fetch('/api/realtime-sessions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          studentId,
          studentName: studentName || 'Student',
          subject: subject || 'General',
          language,
          ageGroup,
          voice: 'rachel', // Default voice
          model: 'custom',
          contextDocuments: contextDocumentIds || []
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create session');
      }

      const sessionData = await response.json();
      const { sessionId: newSessionId } = sessionData;
      
      console.log(`[VoiceHost] ✅ Session created in DB: ${newSessionId}`);
      setSessionId(newSessionId);
      
      // Trigger onSessionStart callback if provided
      onSessionStart?.();
      
      // Load document content if provided
      let documents: string[] = [];
      if (contextDocumentIds && contextDocumentIds.length > 0) {
        console.log('[VoiceHost] 📚 Loading document content for:', contextDocumentIds);
        
        for (const docId of contextDocumentIds) {
          try {
            console.log(`[VoiceHost] 📖 Fetching document: ${docId}`);
            
            const docResponse = await fetch(`/api/documents/${docId}/content`, {
              method: 'GET',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
            });
            
            if (!docResponse.ok) {
              console.warn(`[VoiceHost] ⚠️ Failed to fetch document ${docId}: ${docResponse.status}`);
              continue;
            }
            
            const docData = await docResponse.json();
            
            if (docData.text) {
              // Format document text with header for AI context
              const docText = `[Document: ${docData.title || docData.filename}]\n${docData.text}`;
              documents.push(docText);
              console.log(`[VoiceHost] ✅ Loaded: ${docData.filename} (${docData.text.length} chars)`);
            } else {
              console.warn(`[VoiceHost] ⚠️ No text content in document: ${docId}`);
            }
          } catch (error) {
            console.error(`[VoiceHost] ❌ Error loading document ${docId}:`, error);
          }
        }
        
        console.log(`[VoiceHost] 📚 Total documents loaded: ${documents.length}`);
        
        if (documents.length === 0 && contextDocumentIds.length > 0) {
          toast({
            title: "Document Loading",
            description: "Documents selected but couldn't extract text. Continuing without documents.",
            variant: "default",
          });
        } else if (documents.length > 0) {
          toast({
            title: "Documents Ready",
            description: `Loaded ${documents.length} document(s) for this session`,
          });
        }
      }
      
      // Step 2: Connect to custom voice WebSocket with valid session
      console.log('[VoiceHost] 🔌 Connecting to WebSocket with session:', newSessionId);
      await customVoice.connect(
        newSessionId,
        user.id,
        studentName || 'Student',
        ageGroup,
        createSystemInstruction(),
        documents
      );
      
      setIsRecording(true);
      
      toast({
        title: "Voice Session Started",
        description: `Connected to AI Tutor for ${studentName || 'Student'}`,
      });
      
      console.log('[VoiceHost] ✅ Custom voice session started successfully');
    } catch (error: any) {
      console.error('[VoiceHost] ❌ Failed to start session:', error);
      toast({
        title: "Connection Failed",
        description: error.message || "Could not start voice session",
        variant: "destructive",
      });
      // Reset state on error
      setSessionId(null);
      setIsRecording(false);
    }
  };

  const endSession = async () => {
    try {
      console.log('[VoiceHost] 🛑 Ending session...');
      
      // Disconnect custom voice
      customVoice.disconnect();
      
      // Reset state
      setIsRecording(false);
      setIsMuted(false);
      setSessionId(null);
      
      // Trigger onSessionEnd callback if provided
      onSessionEnd?.();
      
      toast({
        title: "Session Ended",
        description: "Voice tutoring session has ended",
      });
      
      console.log('[VoiceHost] ✅ Session ended successfully');
    } catch (error: any) {
      console.error('[VoiceHost] ❌ Error ending session:', error);
      toast({
        title: "Error",
        description: "Failed to end session properly",
        variant: "destructive",
      });
    }
  };

  const toggleMute = () => {
    setIsMuted(prev => !prev);
    console.log('[VoiceHost]', isMuted ? 'Unmuted' : 'Muted');
  };

  // Watch for connection status changes
  useEffect(() => {
    if (!customVoice.isConnected && isRecording) {
      console.log('[VoiceHost] Lost connection, ending session');
      endSession();
    }
  }, [customVoice.isConnected]);

  // Watch for errors from the custom voice hook
  useEffect(() => {
    if (customVoice.error) {
      console.error('[Voice Host] Custom voice error:', customVoice.error);
      toast({
        title: "Voice Error",
        description: customVoice.error,
        variant: "destructive",
      });
    }
  }, [customVoice.error, toast]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (customVoice.isConnected) {
        customVoice.disconnect();
      }
    };
  }, []);

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {!isRecording ? (
            <Button
              onClick={startSession}
              variant="default"
              size="sm"
              className="gap-2"
              disabled={!user}
            >
              <Mic className="h-4 w-4" />
              Start Voice Tutoring
            </Button>
          ) : (
            <>
              <Button
                onClick={endSession}
                variant="destructive"
                size="sm"
                className="gap-2"
              >
                <MicOff className="h-4 w-4" />
                End Session
              </Button>
              
              <Button
                onClick={toggleMute}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                {isMuted ? (
                  <>
                    <VolumeX className="h-4 w-4" />
                    Unmute
                  </>
                ) : (
                  <>
                    <Volume2 className="h-4 w-4" />
                    Mute
                  </>
                )}
              </Button>
            </>
          )}
          
          {customVoice.isConnected && (
            <div className="text-sm text-muted-foreground">
              Connected via 🎙️ AI Voice Tutor
            </div>
          )}
        </div>
        
        {isRecording && (
          <div className="flex items-center gap-3">
            {customVoice.isTutorSpeaking ? (
              <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                <Volume2 className="h-4 w-4 animate-pulse" />
                <span className="font-medium">Tutor is speaking... (you can interrupt)</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <Mic className="h-4 w-4 animate-pulse" />
                <span className="font-semibold">I'm listening - speak anytime!</span>
              </div>
            )}
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-2 w-2 bg-red-500 rounded-full animate-pulse" />
              <span>Recording</span>
            </div>
          </div>
        )}
      </div>
      
      {/* Transcript Display */}
      <RealtimeVoiceTranscript
        messages={customVoice.transcript.map(t => ({
          role: t.speaker === 'student' ? 'user' as const : 'assistant' as const,
          content: t.text,
          timestamp: t.timestamp ? new Date(t.timestamp) : new Date()
        }))}
        isConnected={customVoice.isConnected}
        status={customVoice.isConnected ? 'active' : sessionId ? 'ended' : 'idle'}
        language={language}
        voice={`${ageGroup} Tutor`}
      />
      
      {/* Debug Info (remove in production) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded">
          <div>Session ID: {sessionId || 'None'}</div>
          <div>Connected: {customVoice.isConnected ? 'Yes' : 'No'}</div>
          <div>Recording: {isRecording ? 'Yes' : 'No'}</div>
          <div>Muted: {isMuted ? 'Yes' : 'No'}</div>
          <div>Tutor Speaking: {customVoice.isTutorSpeaking ? 'Yes' : 'No'}</div>
          <div>Student: {studentName || 'Unknown'}</div>
          <div>Subject: {subject || 'General'}</div>
          <div>Age Group: {ageGroup}</div>
          <div>Language: {language}</div>
          <div>Documents: {contextDocumentIds?.length || 0}</div>
        </div>
      )}
    </div>
  );
}