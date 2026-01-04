import { useEffect, useState, useRef, useCallback } from 'react';
import { useCustomVoice } from '@/hooks/use-custom-voice';
import { RealtimeVoiceTranscript } from './realtime-voice-transcript';
import { ChatInput } from './ChatInput';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Volume2, VolumeX, AlertTriangle, FileText, Type, Headphones } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';

interface ActiveLesson {
  id: string;
  grade: string;
  subject: string;
  topic: string;
  lessonTitle: string;
  learningGoal: string;
  tutorIntroduction: string;
  guidedQuestions: string[];
  practicePrompts: string[];
  checkUnderstanding: string;
  encouragementClose: string;
  estimatedMinutes: number;
}

interface RealtimeVoiceHostProps {
  studentId?: string;
  studentName?: string;
  subject?: string;
  language?: string; // LANGUAGE: Now supports all 22 languages
  ageGroup?: 'K-2' | '3-5' | '6-8' | '9-12' | 'College/Adult';
  contextDocumentIds?: string[];
  activeLesson?: ActiveLesson | null; // Practice lesson context
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
  activeLesson,
  onSessionStart,
  onSessionEnd,
}: RealtimeVoiceHostProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null); // Ref to track current sessionId
  const [isMuted, setIsMuted] = useState(false);
  const previouslyConnectedRef = useRef(false); // Track if we were previously connected
  
  // Communication mode state (voice, hybrid, text-only)
  type CommunicationMode = 'voice' | 'hybrid' | 'text';
  const [communicationMode, setCommunicationMode] = useState<CommunicationMode>('voice');
  const [tutorAudioEnabled, setTutorAudioEnabled] = useState(true);
  const [studentMicEnabled, setStudentMicEnabled] = useState(true);
  
  // Mode configurations
  const MODES = {
    voice: {
      label: 'Voice Conversation',
      description: 'Speak and hear your tutor',
      tutorAudio: true,
      studentMic: true,
      icon: Mic,
      emoji: '🎤'
    },
    hybrid: {
      label: 'Listen Only',
      description: 'Type to tutor, hear responses',
      tutorAudio: true,
      studentMic: false,
      icon: Headphones,
      emoji: '🎧'
    },
    text: {
      label: 'Text Only',
      description: 'Type & read (silent mode)',
      tutorAudio: false,
      studentMic: false,
      icon: Type,
      emoji: '📝'
    }
  };
  
  // Use Custom Voice Stack (Deepgram + Claude + ElevenLabs)
  const customVoice = useCustomVoice();
  
  // Generate a unique session ID
  const generateSessionId = () => {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  // Load saved communication mode preference on mount
  useEffect(() => {
    const savedMode = localStorage.getItem('preferred-communication-mode') as CommunicationMode;
    if (savedMode && MODES[savedMode]) {
      console.log('[Mode] Loading saved preference:', savedMode);
      switchMode(savedMode, false);
    }
  }, []);
  
  // Switch between preset modes
  const switchMode = useCallback((mode: CommunicationMode, notify = true) => {
    console.log('[Mode] Switching to:', mode);
    
    setCommunicationMode(mode);
    const config = MODES[mode];
    
    // Update audio/mic states
    setTutorAudioEnabled(config.tutorAudio);
    setStudentMicEnabled(config.studentMic);
    
    // If session is active, update immediately
    if (customVoice.isConnected) {
      customVoice.updateMode(config.tutorAudio, config.studentMic);
      
      // Add system message to transcript
      const modeMessages = {
        voice: '🎤 Switched to Voice mode - Speak naturally with your tutor',
        hybrid: '🎧 Switched to Listen mode - Type to communicate, hear responses',
        text: '📝 Switched to Text-only mode - Type to communicate silently'
      };
      
      customVoice.addSystemMessage(modeMessages[mode]);
    }
    
    // Save preference
    localStorage.setItem('preferred-communication-mode', mode);
    
    // Show confirmation
    if (notify) {
      toast({
        title: `${config.emoji} ${config.label}`,
        description: config.description,
      });
    }
  }, [customVoice, toast, MODES]);
  
  // Toggle tutor audio on/off
  const toggleTutorAudio = useCallback(() => {
    const newState = !tutorAudioEnabled;
    setTutorAudioEnabled(newState);
    
    console.log('[Mode] Tutor audio:', newState ? 'enabled' : 'muted');
    
    if (customVoice.isConnected) {
      customVoice.updateMode(newState, studentMicEnabled);
      customVoice.addSystemMessage(
        newState ? '🔊 Tutor audio unmuted - You will hear responses' : '🔇 Tutor audio muted - Text-only responses'
      );
    }
    
    // Update mode based on new combination
    updateCommunicationModeFromToggles(newState, studentMicEnabled);
  }, [tutorAudioEnabled, studentMicEnabled, customVoice]);
  
  // Toggle student microphone on/off
  const toggleStudentMic = useCallback(() => {
    const newState = !studentMicEnabled;
    setStudentMicEnabled(newState);
    
    console.log('[Mode] Student mic:', newState ? 'enabled' : 'muted');
    
    if (customVoice.isConnected) {
      customVoice.updateMode(tutorAudioEnabled, newState);
      customVoice.addSystemMessage(
        newState ? '🎤 Microphone enabled - You can speak now' : '⌨️  Microphone disabled - Type to communicate'
      );
    }
    
    // Update mode based on new combination
    updateCommunicationModeFromToggles(tutorAudioEnabled, newState);
  }, [tutorAudioEnabled, studentMicEnabled, customVoice]);
  
  // Determine current mode based on toggle states
  const updateCommunicationModeFromToggles = (audio: boolean, mic: boolean) => {
    if (audio && mic) {
      setCommunicationMode('voice');
    } else if (audio && !mic) {
      setCommunicationMode('hybrid');
    } else {
      setCommunicationMode('text');
    }
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

    let baseInstruction = `You are an AI tutor helping ${studentName || 'a student'} (${ageGroup} level) with ${subject || 'their studies'}. 
    ${ageSpecificInstructions[ageGroup]}
    Keep responses concise (2-3 sentences) suitable for voice conversation.
    Speak in ${language === 'es' ? 'Spanish' : language === 'hi' ? 'Hindi' : language === 'zh' ? 'Chinese' : 'English'}.`;

    // Add practice lesson context if available
    if (activeLesson) {
      baseInstruction += `

ACTIVE PRACTICE LESSON:
Title: ${activeLesson.lessonTitle}
Subject: ${activeLesson.subject}
Topic: ${activeLesson.topic}
Learning Goal: ${activeLesson.learningGoal}

YOUR OPENING (use this exact introduction): "${activeLesson.tutorIntroduction}"

GUIDED QUESTIONS (ask these progressively):
${activeLesson.guidedQuestions?.map((q, i) => `${i + 1}. ${q}`).join('\n') || 'Ask exploratory questions about the topic.'}

PRACTICE PROMPTS (use when student needs practice):
${activeLesson.practicePrompts?.map((p, i) => `${i + 1}. ${p}`).join('\n') || 'Provide practice problems related to the topic.'}

CHECK UNDERSTANDING: ${activeLesson.checkUnderstanding || 'Ask student to explain in their own words.'}

CLOSING ENCOURAGEMENT: ${activeLesson.encouragementClose || 'Great job! Keep up the excellent work!'}

IMPORTANT: Start the session by reading the opening introduction naturally. Then guide the student through the lesson using the questions and prompts.`;
    }

    return baseInstruction;
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
      sessionIdRef.current = newSessionId; // Store in ref for reliable access
      
      // Trigger onSessionStart callback if provided
      onSessionStart?.();
      
      // Apply saved communication mode preferences to the hook BEFORE connecting
      // This ensures the hook starts with the correct mic/audio settings
      console.log('[VoiceHost] 🎛️ Applying communication mode before connection:', {
        mode: communicationMode,
        tutorAudio: tutorAudioEnabled,
        studentMic: studentMicEnabled
      });
      customVoice.updateMode(tutorAudioEnabled, studentMicEnabled);
      
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
      console.log('[VoiceHost] 🔌 Connecting to WebSocket with session:', newSessionId, 'language:', language);
      await customVoice.connect(
        newSessionId,
        user.id,
        studentName || 'Student',
        ageGroup,
        createSystemInstruction(),
        documents,
        language // LANGUAGE: Pass selected language to backend
      );
      
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
    }
  };

  const endSession = useCallback(async () => {
    try {
      const currentSessionId = sessionIdRef.current;
      console.log('[VoiceHost] 🛑 Ending session...');
      console.log('[VoiceHost] Session ID from ref:', currentSessionId);
      
      // Disconnect custom voice with sessionId for HTTP fallback
      if (currentSessionId) {
        console.log('[VoiceHost] 📤 Calling disconnect with sessionId:', currentSessionId);
        await customVoice.disconnect(currentSessionId);
      } else {
        console.warn('[VoiceHost] ⚠️ No sessionId available for HTTP fallback');
        await customVoice.disconnect();
      }
      
      // Reset state
      setIsMuted(false);
      setSessionId(null);
      sessionIdRef.current = null;
      previouslyConnectedRef.current = false; // Reset connection tracking for next session
      
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
  }, [customVoice, toast, onSessionEnd]);

  const toggleMute = () => {
    setIsMuted(prev => !prev);
    console.log('[VoiceHost]', isMuted ? 'Unmuted' : 'Muted');
  };

  const handleChatMessage = useCallback(async (message: string) => {
    if (!customVoice.isConnected || !sessionId) {
      console.error('[Chat] Cannot send message: no active session');
      toast({
        title: "Not Connected",
        description: "Please start a voice session first",
        variant: "destructive",
      });
      return;
    }

    console.log('[Chat] 📝 Sending text message:', message);

    // Send to WebSocket for AI processing
    customVoice.sendTextMessage(message);
  }, [customVoice, sessionId, toast]);

  const handleChatFileUpload = useCallback(async (file: File) => {
    if (!customVoice.isConnected) {
      console.error('[Chat] Cannot upload file: no active session');
      toast({
        title: "Not Connected",
        description: "Please start a voice session first",
        variant: "destructive",
      });
      return;
    }

    console.log('[Chat] 📤 Uploading file from chat:', file.name);

    // Upload file
    const formData = new FormData();
    formData.append('file', file);
    formData.append('studentId', studentId || '');

    try {
      toast({
        title: "Uploading...",
        description: `Uploading ${file.name}...`,
      });

      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const data = await response.json();
      console.log('[Chat] ✅ File uploaded:', data.id);

      toast({
        title: "Upload Complete",
        description: `${file.name} uploaded successfully`,
      });

      // Notify WebSocket about new document
      customVoice.sendDocumentUploaded(data.id, file.name);

    } catch (error: any) {
      console.error('[Chat] Upload error:', error);
      toast({
        title: "Upload Failed",
        description: error.message || `Failed to upload ${file.name}`,
        variant: "destructive",
      });
    }
  }, [customVoice, studentId, toast]);

  // Watch for connection status changes - only trigger if we were previously connected
  useEffect(() => {
    // Update the ref to track current connection state
    if (customVoice.isConnected) {
      previouslyConnectedRef.current = true;
    }
    
    // Only trigger endSession if:
    // 1. We're not currently connected
    // 2. We have a sessionId
    // 3. We were previously connected (to avoid triggering during initial connection)
    if (!customVoice.isConnected && sessionId && previouslyConnectedRef.current) {
      console.log('[VoiceHost] Lost connection after being connected, ending session');
      
      // Check if session ended due to inactivity
      const endReason = (window as any).__sessionEndedReason;
      if (endReason === 'inactivity_timeout') {
        console.log('[VoiceHost] 💤 Session ended due to inactivity');
        toast({
          title: "Session Ended - Inactivity",
          description: "Your session ended after 5 minutes of silence. Your progress has been saved.",
          duration: 5000,
        });
        // Clear the flag
        (window as any).__sessionEndedReason = null;
      }
      
      endSession();
      previouslyConnectedRef.current = false; // Reset for next session
    }
  }, [customVoice.isConnected, sessionId, endSession]);

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
          {!customVoice.isConnected ? (
            <Button
              onClick={startSession}
              variant="default"
              size="sm"
              className="gap-2"
              disabled={!user}
              data-testid="button-start-session"
            >
              <Mic className="h-4 w-4" />
              Talk to your tutor
            </Button>
          ) : (
            <>
              <Button
                onClick={endSession}
                variant="destructive"
                size="sm"
                className="gap-2"
                data-testid="button-end-session"
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
            <div className="text-sm text-muted-foreground flex items-center gap-4">
              <span>Connected via 🎙️ AI Voice Tutor</span>
              {contextDocumentIds && contextDocumentIds.length > 0 && (
                <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-medium">
                  <FileText className="h-3.5 w-3.5" />
                  {contextDocumentIds.length} document{contextDocumentIds.length !== 1 ? 's' : ''} loaded
                </span>
              )}
            </div>
          )}
        </div>
        
        {customVoice.isConnected && (
          <div className="flex items-center gap-3">
            {customVoice.isTutorThinking ? (
              <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400" data-testid="status-tutor-thinking">
                <div className="flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="inline-block w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="inline-block w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="font-medium italic">JIE is thinking...</span>
              </div>
            ) : customVoice.isTutorSpeaking ? (
              <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400" data-testid="status-tutor-speaking">
                <Volume2 className="h-4 w-4 animate-pulse" />
                <span className="font-medium">Tutor is speaking... (you can interrupt)</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400" data-testid="status-listening">
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
      
      {/* Communication Mode Controls - Only shown during active session */}
      {customVoice.isConnected && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-blue-900 dark:text-blue-100">Communication Mode:</span>
              <div className="flex gap-2">
                {Object.entries(MODES).map(([key, config]) => {
                  const ModeIcon = config.icon;
                  return (
                    <Button
                      key={key}
                      onClick={() => switchMode(key as 'voice' | 'hybrid' | 'text')}
                      variant={communicationMode === key ? 'default' : 'outline'}
                      size="sm"
                      className="gap-1.5"
                      data-testid={`button-mode-${key}`}
                    >
                      <ModeIcon className="h-4 w-4" />
                      <span>{config.label}</span>
                      {communicationMode === key && <span className="ml-1">✓</span>}
                    </Button>
                  );
                })}
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Button
                onClick={toggleTutorAudio}
                variant="ghost"
                size="sm"
                className="gap-2"
                data-testid="button-toggle-tutor-audio"
                title={tutorAudioEnabled ? 'Mute tutor voice' : 'Unmute tutor voice'}
              >
                {tutorAudioEnabled ? (
                  <>
                    <Volume2 className="h-4 w-4" />
                    <span>Tutor Audio</span>
                  </>
                ) : (
                  <>
                    <VolumeX className="h-4 w-4 text-red-600 dark:text-red-400" />
                    <span className="text-red-600 dark:text-red-400">Muted</span>
                  </>
                )}
              </Button>
              
              <div className="h-4 w-px bg-border" />
              
              <Button
                onClick={toggleStudentMic}
                variant="ghost"
                size="sm"
                className="gap-2"
                data-testid="button-toggle-student-mic"
                title={studentMicEnabled ? 'Turn off microphone' : 'Turn on microphone'}
              >
                {studentMicEnabled ? (
                  <>
                    <Mic className="h-4 w-4" />
                    <span>Your Mic</span>
                  </>
                ) : (
                  <>
                    <MicOff className="h-4 w-4 text-red-600 dark:text-red-400" />
                    <span className="text-red-600 dark:text-red-400">Off</span>
                  </>
                )}
              </Button>
            </div>
          </div>
          
          {/* Mode indicator message */}
          <div className="mt-3 text-sm">
            {!tutorAudioEnabled && !studentMicEnabled && (
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-medium">
                <Type className="h-4 w-4" />
                <span>📝 Text-only mode - Type to communicate silently</span>
              </div>
            )}
            {tutorAudioEnabled && !studentMicEnabled && (
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-medium">
                <Headphones className="h-4 w-4" />
                <span>🎧 Listen mode - Type to communicate, hear responses</span>
              </div>
            )}
            {tutorAudioEnabled && studentMicEnabled && (
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-medium">
                <Mic className="h-4 w-4" />
                <span>🎤 Voice mode - Speak naturally with your tutor</span>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Microphone Error Banner */}
      {customVoice.microphoneError && customVoice.isConnected && (
        <div className="bg-yellow-50 dark:bg-yellow-950/20 border-l-4 border-yellow-400 dark:border-yellow-600 p-4 rounded-r-lg" data-testid="microphone-error-banner">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <h3 className="text-sm font-semibold text-yellow-800 dark:text-yellow-300">
                {customVoice.microphoneError.message}
              </h3>
              <div className="text-sm text-yellow-700 dark:text-yellow-400">
                <p className="font-medium mb-1.5">How to fix:</p>
                <ol className="list-decimal list-inside space-y-1 ml-1">
                  {customVoice.microphoneError.troubleshooting.map((step, i) => (
                    <li key={i} className="leading-relaxed">{step}</li>
                  ))}
                </ol>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={customVoice.retryMicrophone}
                  className="text-sm font-medium text-yellow-800 dark:text-yellow-300 hover:text-yellow-900 dark:hover:text-yellow-200 underline underline-offset-2 transition-colors"
                  data-testid="button-retry-microphone"
                >
                  🔄 Try again
                </button>
                <button
                  onClick={customVoice.dismissMicrophoneError}
                  className="text-sm font-medium text-yellow-800 dark:text-yellow-300 hover:text-yellow-900 dark:hover:text-yellow-200 transition-colors"
                  data-testid="button-dismiss-error"
                >
                  ✕ Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Transcript Display */}
      <RealtimeVoiceTranscript
        messages={[
          ...customVoice.transcript.map(t => ({
            role: t.speaker === 'student' ? 'user' as const : 'assistant' as const,
            content: t.text,
            timestamp: t.timestamp ? new Date(t.timestamp) : new Date()
          })),
          // THINKING INDICATOR: Add pseudo-message when tutor is thinking
          ...(customVoice.isTutorThinking ? [{
            role: 'assistant' as const,
            content: '💭 *thinking...*',
            timestamp: new Date(),
            isThinking: true,
          }] : [])
        ]}
        isConnected={customVoice.isConnected}
        status={customVoice.isConnected ? 'active' : sessionId ? 'ended' : 'idle'}
        language={language}
        voice={`${ageGroup} Tutor`}
        isTutorThinking={customVoice.isTutorThinking}
      />
      
      {/* Chat Input - Only shown during active session */}
      {customVoice.isConnected && (
        <div className={customVoice.microphoneError || !studentMicEnabled ? 'text-mode-emphasis' : ''}>
          {(customVoice.microphoneError || !studentMicEnabled) && (
            <div className="text-center mb-3 px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border-2 border-blue-300 dark:border-blue-700 rounded-lg shadow-sm">
              <div className="flex items-center justify-center gap-2">
                <Type className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <p className="text-blue-700 dark:text-blue-300 font-semibold text-sm">
                  {!studentMicEnabled && !customVoice.microphoneError
                    ? '👇 Text Mode Active - Type your messages below 👇'
                    : '👇 Your tutor is listening! Type your questions here 👇'}
                </p>
              </div>
            </div>
          )}
          <ChatInput
            onSendMessage={handleChatMessage}
            onFileUpload={handleChatFileUpload}
            disabled={!customVoice.isConnected}
          />
        </div>
      )}
      
      {/* Debug Info (remove in production) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded">
          <div>Session ID: {sessionId || 'None'}</div>
          <div>Connected: {customVoice.isConnected ? 'Yes' : 'No'}</div>
          <div>Muted: {isMuted ? 'Yes' : 'No'}</div>
          <div>Tutor Thinking: {customVoice.isTutorThinking ? 'Yes' : 'No'}</div>
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