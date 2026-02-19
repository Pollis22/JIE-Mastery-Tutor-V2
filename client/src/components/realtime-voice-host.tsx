import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useCustomVoice } from '@/hooks/use-custom-voice';
import { RealtimeVoiceTranscript } from './realtime-voice-transcript';
import { ChatInput } from './ChatInput';
import { VoicePresenceIndicator, VoicePresenceState } from './VoicePresenceIndicator';
import { TutorAvatar, TutorState } from './TutorAvatar';
import { AnimatedBackground } from './AnimatedBackground';
import { SessionProgress } from './SessionProgress';
import { useSimulatedAmplitude } from '@/hooks/use-audio-amplitude';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Volume2, VolumeX, AlertTriangle, FileText, Type, Headphones, Timer } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';
import { AgeThemeProvider } from '@/contexts/ThemeContext';
import { isYoungLearner as checkYoungLearner } from '@/styles/themes';

// Session Timer Component - UI only, no billing logic
function SessionTimer({ isActive }: { isActive: boolean }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isActiveRef = useRef(isActive);

  // Keep ref in sync to avoid stale closures
  isActiveRef.current = isActive;

  useEffect(() => {
    if (isActive) {
      // Reset and start timer
      setElapsedSeconds(0);
      
      // Guard against double-start
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      
      intervalRef.current = setInterval(() => {
        if (isActiveRef.current) {
          setElapsedSeconds(prev => prev + 1);
        }
      }, 1000);
    } else {
      // Stop timer (keep final value displayed)
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive]);

  // Format seconds as mm:ss
  const formatTime = (totalSeconds: number): string => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div 
      className="flex items-center gap-1.5 px-2.5 py-1 bg-muted/50 rounded-full text-sm font-medium"
      data-testid="session-timer"
    >
      <Timer className="h-3.5 w-3.5 text-muted-foreground" />
      <span className={isActive ? "text-foreground" : "text-muted-foreground"}>
        {formatTime(elapsedSeconds)}
      </span>
    </div>
  );
}

// Minutes Remaining Badge - shows remaining voice minutes from the same API as main widget
function MinutesRemainingBadge() {
  const { user } = useAuth();
  const [remaining, setRemaining] = useState<number | null>(null);
  
  // Fetch from the same endpoint as the main minutes widget
  useEffect(() => {
    if (!user) return;
    
    const fetchMinutes = async () => {
      try {
        const response = await fetch('/api/session/check-availability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({})
        });
        if (response.ok) {
          const data = await response.json();
          setRemaining(data.remainingMinutes ?? data.remaining ?? null);
        }
      } catch (error) {
        console.error('[MinutesRemainingBadge] Failed to fetch minutes:', error);
      }
    };
    
    fetchMinutes();
    
    // Refresh every 30 seconds to stay in sync with main widget
    const interval = setInterval(fetchMinutes, 30000);
    return () => clearInterval(interval);
  }, [user]);
  
  if (!user || remaining === null) return null;
  
  return (
    <div 
      className="flex items-center gap-1 px-2 py-1 bg-blue-50 dark:bg-blue-950/30 rounded-full text-xs text-blue-600 dark:text-blue-400"
      data-testid="minutes-remaining"
    >
      <span>{remaining} min left</span>
    </div>
  );
}

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
  uploadedDocCount?: number;
  activeLesson?: ActiveLesson | null; // Practice lesson context
  autoConnect?: boolean;
  onSessionStart?: () => void;
  onSessionEnd?: () => void;
  onDisconnected?: () => void;
}

export function RealtimeVoiceHost({
  studentId,
  studentName,
  subject,
  language = 'en',
  ageGroup = '3-5',
  contextDocumentIds = [],
  uploadedDocCount = 0,
  activeLesson,
  autoConnect = false,
  onSessionStart,
  onSessionEnd,
  onDisconnected,
}: RealtimeVoiceHostProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [location] = useLocation();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null); // Ref to track current sessionId
  const [isMuted, setIsMuted] = useState(false);
  const previouslyConnectedRef = useRef(false); // Track if we were previously connected
  
  // Debug mode - only show debug info when ?debug=true is in URL
  const isDebugMode = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('debug') === 'true';
  }, [location]);
  
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
  
  // Voice Presence Indicator - simulated amplitude for visual feedback
  const simulatedAmplitude = useSimulatedAmplitude(customVoice.isTutorSpeaking);
  
  // Check if young learner for enhanced visuals
  const isYoungLearner = checkYoungLearner(ageGroup);
  
  // Compute voice presence state from voice connection status
  const voicePresenceState: VoicePresenceState = (() => {
    if (!customVoice.isConnected) return 'idle';
    if (customVoice.isTutorSpeaking) return 'tutorSpeaking';
    if (customVoice.micStatus === 'hearing_you') return 'userSpeaking';
    return 'listening';
  })();
  
  // Compute tutor avatar state for young learners
  const tutorAvatarState: TutorState = (() => {
    if (!customVoice.isConnected) return 'idle';
    if (customVoice.isTutorThinking) return 'thinking';
    if (customVoice.isTutorSpeaking) return 'speaking';
    if (customVoice.micStatus === 'hearing_you') return 'listening';
    return 'idle';
  })();
  
  // Generate a unique session ID
  const generateSessionId = () => {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  // Always start with voice mode (mic ON) - don't restore saved preferences
  // This ensures users always start with mic enabled for the best experience
  useEffect(() => {
    // Clear any saved mode that might turn mic off
    const savedMode = localStorage.getItem('preferred-communication-mode') as CommunicationMode;
    if (savedMode && savedMode !== 'voice') {
      console.log('[Mode] Resetting to voice mode (mic on) - was:', savedMode);
      localStorage.setItem('preferred-communication-mode', 'voice');
    }
    // Ensure we start with mic on
    setCommunicationMode('voice');
    setTutorAudioEnabled(true);
    setStudentMicEnabled(true);
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

  useEffect(() => {
    if (!customVoice.isConnected) return;
    if (customVoice.sttStatus === 'connected') return;
    
    if (customVoice.sttStatus === 'failed') {
      toast({
        title: "Speech Service Lost",
        description: "Voice recognition is unavailable. You can still type to communicate.",
        variant: "destructive",
      });
      return;
    }
    
    const timerId = setTimeout(() => {
      if (customVoice.sttStatus === 'disconnected' || customVoice.sttStatus === 'reconnecting') {
        toast({
          title: "Speech Service Reconnecting",
          description: "Voice recognition is reconnecting. You can type while waiting.",
        });
      }
    }, 5000);
    
    return () => clearTimeout(timerId);
  }, [customVoice.sttStatus, customVoice.isConnected, toast]);
  
  const startSession = async () => {
    // CRITICAL: Unlock audio for iOS/Android FIRST - must happen synchronously during user gesture (button tap)
    // Do NOT await this - fire it immediately to catch the gesture timing window
    customVoice.unlockAudioForMobile();
    
    try {
      console.log('🎯 [VoiceHost] Starting custom voice session...');
      
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      // Step 1: Create session in database FIRST (with retry on 502)
      console.log('[VoiceHost] 📝 Creating session in database...');
      
      const SESSION_RETRY_DELAYS = [300, 800, 1500];
      let response: Response | null = null;
      let lastError: string = '';
      
      for (let attempt = 0; attempt <= SESSION_RETRY_DELAYS.length; attempt++) {
        try {
          response = await fetch('/api/realtime-sessions/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              studentId,
              studentName: studentName || 'Student',
              subject: subject || 'General',
              language,
              ageGroup,
              voice: 'rachel',
              model: 'custom',
              contextDocuments: contextDocumentIds || []
            }),
          });
          
          if (response.status === 401) {
            console.error('[VoiceHost] 🔒 Session expired (401) - blocking voice start');
            toast({
              title: "Session Expired",
              description: "Please refresh the page and log in again.",
              variant: "destructive",
            });
            return;
          }
          
          if (response.status === 502 && attempt < SESSION_RETRY_DELAYS.length) {
            console.warn(`[VoiceHost] ⚠️ Server returned 502 - retrying in ${SESSION_RETRY_DELAYS[attempt]}ms (attempt ${attempt + 1}/${SESSION_RETRY_DELAYS.length})`);
            await new Promise(r => setTimeout(r, SESSION_RETRY_DELAYS[attempt]));
            continue;
          }
          
          if (response.ok) break;
          
          const errorData = await response.json().catch(() => ({ message: `HTTP ${response!.status}` }));
          lastError = errorData.message || `Server error (${response.status})`;
          break;
        } catch (fetchErr) {
          lastError = fetchErr instanceof Error ? fetchErr.message : 'Network error';
          if (attempt < SESSION_RETRY_DELAYS.length) {
            console.warn(`[VoiceHost] ⚠️ Fetch failed - retrying in ${SESSION_RETRY_DELAYS[attempt]}ms`);
            await new Promise(r => setTimeout(r, SESSION_RETRY_DELAYS[attempt]));
            continue;
          }
        }
      }
      
      if (!response || !response.ok) {
        throw new Error(lastError || 'Failed to create session');
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
        language,
        studentId,
        uploadedDocCount
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

    const isImage = file.type.startsWith('image/');
    console.log(`[Chat] 📤 Uploading ${isImage ? 'image' : 'file'} from chat:`, file.name);

    // Use the same upload endpoint for ALL files (images use OCR on server)
    const formData = new FormData();
    formData.append('file', file);
    formData.append('studentId', studentId || '');

    try {
      toast({
        title: "Uploading...",
        description: isImage 
          ? `Processing ${file.name} with OCR...` 
          : `Uploading ${file.name}...`,
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
      console.log(`[Chat] ✅ File uploaded:`, data.id, `(${data.characters || 0} chars, ${data.chunks || 0} chunks)`);

      // NO-GHOSTING: If extraction failed, warn user and do NOT notify WebSocket
      if (data.extractionWarning || data.chunks === 0) {
        toast({
          title: "File Uploaded",
          description: data.extractionWarning || 
            (isImage 
              ? "OCR could not read text from this image. Try a clearer photo or paste the text directly."
              : "No text could be extracted. The AI tutor cannot read this file's contents."),
          variant: "default",
        });
        console.log(`[Chat] ⚠️ NO-GHOSTING: Not notifying WebSocket - no extractable content`);
        return; // Early exit - do not notify WebSocket
      }

      toast({
        title: "Upload Complete",
        description: isImage 
          ? `AI can now read "${file.name}". Ask about it!`
          : `${file.name} uploaded successfully`,
      });

      // Notify WebSocket about new document (only reached if we have actual content)
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

  // Auto-connect on mount when autoConnect is true
  const autoConnectFired = useRef(false);
  useEffect(() => {
    if (autoConnect && !autoConnectFired.current && !customVoice.isConnected && user?.id) {
      autoConnectFired.current = true;
      startSession();
    }
  }, [autoConnect, user?.id]);

  // Notify parent when voice disconnects (e.g., session ended from within)
  const wasConnectedForParent = useRef(false);
  useEffect(() => {
    if (wasConnectedForParent.current && !customVoice.isConnected) {
      onDisconnected?.();
    }
    wasConnectedForParent.current = customVoice.isConnected;
  }, [customVoice.isConnected, onDisconnected]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (customVoice.isConnected) {
        customVoice.disconnect();
      }
    };
  }, []);

  return (
    <AgeThemeProvider ageGroup={ageGroup}>
      <div className={`w-full relative ${customVoice.isConnected ? 'h-[100dvh] min-h-[500px] flex flex-col overflow-hidden' : 'space-y-4'}`}>
        {/* Animated Background for young learners */}
        {isYoungLearner && customVoice.isConnected && <AnimatedBackground />}
        
        {/* Top Controls Section - Fixed height */}
        <div className="flex-shrink-0 space-y-4 relative z-10">
          <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {!customVoice.isConnected ? (
            <>
              <span className="text-sm text-muted-foreground flex items-center gap-2" data-testid="text-connecting-status">
                <Mic className="h-4 w-4 animate-pulse" />
                Connecting to voice service...
              </span>
              <MinutesRemainingBadge />
            </>
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
              
              <SessionTimer isActive={customVoice.isConnected} />
              <MinutesRemainingBadge />
            </>
          )}
          
          {customVoice.isConnected && contextDocumentIds && contextDocumentIds.length > 0 && (
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <FileText className="h-3 w-3" />
              {contextDocumentIds.length} doc{contextDocumentIds.length !== 1 ? 's' : ''}
            </span>
          )}
          </div>
        </div>
        
        {/* Centered Voice Presence - Single source of truth for session state */}
        {customVoice.isConnected && (
          <div className="flex flex-col items-center gap-3 py-4">
            <TutorAvatar 
              state={tutorAvatarState}
              amplitude={simulatedAmplitude}
              size="large"
            />
            
            {/* Session Progress - Gamification for K-8 students */}
            <SessionProgress 
              questionsAnswered={customVoice.transcript.filter(t => t.speaker === 'tutor').length}
              xpEarned={customVoice.transcript.filter(t => t.speaker === 'tutor').length * 10}
              streak={0}
            />
          </div>
        )}
        
        {/* Minimal Audio Controls - Only shown during active session */}
        {customVoice.isConnected && (
          <div className="bg-muted/30 border border-border/50 rounded-lg p-3">
            <div className="flex flex-wrap items-center justify-center gap-3">
            {Object.entries(MODES).map(([key, config]) => {
              const ModeIcon = config.icon;
              const isActive = communicationMode === key;
              return (
                <Button
                  key={key}
                  onClick={() => switchMode(key as 'voice' | 'hybrid' | 'text')}
                  variant={isActive ? 'secondary' : 'ghost'}
                  size="sm"
                  className={`gap-1.5 ${isActive ? 'bg-secondary' : 'opacity-60 hover:opacity-100'}`}
                  data-testid={`button-mode-${key}`}
                >
                  <ModeIcon className="h-3.5 w-3.5" />
                  <span className="text-xs">{config.label}</span>
                </Button>
              );
            })}
            
            <div className="h-4 w-px bg-border/50 mx-1" />
            
            <Button
              onClick={toggleTutorAudio}
              variant="ghost"
              size="sm"
              className="gap-1.5 opacity-70 hover:opacity-100"
              data-testid="button-toggle-tutor-audio"
              title={tutorAudioEnabled ? 'Mute tutor' : 'Unmute tutor'}
            >
              {tutorAudioEnabled ? (
                <Volume2 className="h-3.5 w-3.5" />
              ) : (
                <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </Button>
            
            <Button
              onClick={toggleStudentMic}
              variant="ghost"
              size="sm"
              className="gap-1.5 opacity-70 hover:opacity-100"
              data-testid="button-toggle-student-mic"
              title={studentMicEnabled ? 'Mute mic' : 'Unmute mic'}
            >
              {studentMicEnabled ? (
                <Mic className="h-3.5 w-3.5" />
              ) : (
                <MicOff className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </Button>
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
        </div>
        {/* End Top Controls Section */}
        
        {/* Scrollable Transcript Area - Takes remaining space */}
        <div className={`${customVoice.isConnected ? 'flex-1 min-h-0 overflow-y-auto px-2' : ''}`}>
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
            isTutorThinking={customVoice.isTutorThinking}
            isTutorSpeaking={customVoice.isTutorSpeaking}
            communicationMode={communicationMode}
            studentMicEnabled={studentMicEnabled}
            isHearingStudent={customVoice.micStatus === 'hearing_you'}
          />
        </div>
      
      {/* Sticky Chat Input - Always visible at bottom */}
      {customVoice.isConnected && (
        <div className={`flex-shrink-0 sticky bottom-0 bg-background/95 backdrop-blur-sm border-t shadow-[0_-4px_20px_rgba(0,0,0,0.1)] pt-3 pb-4 z-50 ${customVoice.microphoneError || !studentMicEnabled ? 'text-mode-emphasis' : ''}`}>
          {(customVoice.microphoneError || !studentMicEnabled) && (
            <div className="text-center mb-3 px-4 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border-2 border-blue-300 dark:border-blue-700 rounded-lg shadow-sm mx-1">
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
      
      {/* Debug Info - only visible with ?debug=true query param */}
      {isDebugMode && (
        <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded border border-dashed border-muted-foreground/30 relative z-10">
          <div className="font-medium mb-1 text-muted-foreground/70">Debug Panel</div>
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
    </AgeThemeProvider>
  );
}