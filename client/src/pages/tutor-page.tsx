import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState } from "react";
import { TutorErrorBoundary } from "@/components/tutor-error-boundary";
import { NetworkAwareWrapper } from "@/components/network-aware-wrapper";
import ConvaiHost, { type ConvaiMessage } from "@/components/convai-host";
import { ConvaiTranscript } from "@/components/convai-transcript";
import { RealtimeVoiceHost } from "@/components/realtime-voice-host";
import { AssignmentsPanel } from "@/components/AssignmentsPanel";
import { StudentSwitcher } from "@/components/StudentSwitcher";
import { StudentProfilePanel } from "@/components/StudentProfilePanel";
import { SessionSummaryModal } from "@/components/SessionSummaryModal";
import { TopUpModal } from "@/components/TopUpModal";
import { AGENTS, GREETINGS, type AgentLevel } from "@/agents";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Clock, AlertCircle, Upload, File, X, Paperclip, LogOut, Settings, LayoutDashboard, User, Globe } from "lucide-react";
import { SUPPORTED_LANGUAGES } from "@shared/languages";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import jieLogo from "@/assets/jie-mastery-logo-new.jpg";

interface ProgressData {
  lastLevel?: string;
  lastSubject?: string;
  lastSummary?: string;
  updatedAt?: string;
}

const loadProgress = (): ProgressData => {
  try {
    const saved = localStorage.getItem('jie-tutor-progress');
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
};

const saveProgress = (data: ProgressData) => {
  try {
    localStorage.setItem('jie-tutor-progress', JSON.stringify(data));
  } catch {
    // Ignore storage errors
  }
};

// Map full language names to ISO codes for voice API
const mapLanguageToISO = (language?: string | null): 'en' | 'es' | 'hi' | 'zh' => {
  if (!language) return 'en';
  
  const lang = language.toLowerCase();
  switch (lang) {
    case 'spanish':
      return 'es';
    case 'hindi':
      return 'hi';
    case 'chinese':
      return 'zh';
    case 'english':
    default:
      return 'en';
  }
};

export default function TutorPage() {
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [scriptReady, setScriptReady] = useState(false);

  const memo = loadProgress();
  const [level, setLevel] = useState<AgentLevel>((memo.lastLevel as AgentLevel) || "k2");
  const [subject, setSubject] = useState(memo.lastSubject || "general");
  const [studentName, setStudentName] = useState("");
  const [gradeText, setGradeText] = useState("");
  const [mounted, setMounted] = useState(false);
  const [lastSummary, setLastSummary] = useState(memo.lastSummary || "");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [profileDrawerOpen, setProfileDrawerOpen] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState<string | undefined>();
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [transcriptMessages, setTranscriptMessages] = useState<ConvaiMessage[]>([]);
  const [isTranscriptConnected, setIsTranscriptConnected] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<string>(() => {
    try {
      return localStorage.getItem('jie-tutor-language') || 'en';
    } catch {
      return 'en';
    }
  });

  // Debug state for Realtime debugging
  const [debugInfo, setDebugInfo] = useState<{
    transport?: string;
    sessionStatus?: string;
    lastError?: any;
    helloProbeStatus?: string;
    vadEnabled?: boolean;
    modelName?: string;
    connectionStatus?: 'connecting' | 'connected' | 'disconnected' | 'error';
    lastEvent?: string;
  }>({});

  // Sync student name and grade when user loads
  useEffect(() => {
    if (user?.studentName) {
      setStudentName(user.studentName);
    }
    if (user?.gradeLevel) {
      setGradeText(user.gradeLevel);
    }
  }, [user]);
  
  // Session tracking state
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  
  // Document selection state
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  
  // Save language preference to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('jie-tutor-language', selectedLanguage);
    } catch {
      // Ignore storage errors
    }
  }, [selectedLanguage]);

  // Fetch available minutes
  const { data: minutesData } = useQuery<{
    total: number;
    used: number;
    remaining: number;
    bonusMinutes: number;
  }>({
    queryKey: ['/api/session/check-availability'],
    queryFn: async () => {
      const response = await apiRequest('POST', '/api/session/check-availability', {});
      return response.json();
    },
    enabled: !!user,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch voice system configuration
  const { data: systemConfig } = useQuery<{ useConvai: boolean }>({
    queryKey: ['/api/health'],
    queryFn: async () => {
      const response = await fetch('/api/health');
      return response.json();
    },
  });

  const useConvai = systemConfig?.useConvai ?? true; // Default to ConvAI for backward compatibility

  // Fetch selected student data
  const { data: selectedStudent } = useQuery<{ id: string; name: string; avatarUrl?: string; grade?: string }>({
    queryKey: ['/api/students', selectedStudentId],
    enabled: !!selectedStudentId,
  });

  // Fetch student's pinned documents for RAG context
  const { data: pinnedDocs } = useQuery<Array<{ pin: any; document: { id: string; title: string } }>>({
    queryKey: ['/api/students', selectedStudentId, 'pinned-docs'],
    enabled: !!selectedStudentId,
  });

  const contextDocumentIds = pinnedDocs?.map(pd => pd.document.id) || [];

  // Load ConvAI script
  useEffect(() => {
    const existing = document.querySelector('script[data-elevenlabs-convai]');
    if (existing) {
      setScriptReady(true);
      return;
    }

    const s = document.createElement("script");
    s.src = "https://unpkg.com/@elevenlabs/convai-widget-embed";
    s.async = true;
    s.type = "text/javascript";
    s.setAttribute("data-elevenlabs-convai", "1");
    
    s.onload = () => {
      setScriptReady(true);
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', 'convai_script_loaded', {
          event_category: 'performance'
        });
      }
    };
    
    s.onerror = () => {
      console.error('Failed to load ElevenLabs ConvAI script');
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', 'convai_script_error', {
          event_category: 'error',
          event_label: 'script_load_failed'
        });
      }
    };
    
    document.body.appendChild(s);
  }, []);

  const startTutor = async () => {
    if (!scriptReady) return;
    
    // Require a student profile to be selected
    if (!selectedStudentId || !selectedStudent) {
      toast({
        title: "Student profile required",
        description: "Please select or create a student profile before starting a session.",
        variant: "destructive",
      });
      // Open the profile panel to create a new student
      setProfileDrawerOpen(true);
      return;
    }
    
    // Use the selected student's name
    const effectiveStudentName = selectedStudent.name || studentName.trim();
    
    if (!effectiveStudentName) {
      toast({
        title: "Student name required",
        description: "Please select a student profile with a valid name.",
        variant: "destructive",
      });
      return;
    }
    
    // Update the lastSessionAt timestamp for the selected student
    try {
      await apiRequest('POST', `/api/students/${selectedStudentId}/session-started`, {});
    } catch (error) {
      console.log('[TutorPage] Could not update session timestamp:', error);
    }

    // Check session availability
    try {
      const response = await apiRequest('POST', '/api/session/check-availability', {});
      const availabilityData = await response.json();

      if (!availabilityData.allowed) {
        if (availabilityData.reason === 'no_subscription') {
          toast({
            title: "Subscription Required",
            description: availabilityData.message,
            variant: "destructive",
          });
          setLocation('/pricing');
          return;
        } else if (availabilityData.reason === 'no_minutes') {
          toast({
            title: "Out of Minutes",
            description: availabilityData.message,
            variant: "destructive",
          });
          setShowTopUpModal(true);
          return;
        }
      }

      // Show warning if running low on minutes
      if (availabilityData.warningThreshold && availabilityData.remainingMinutes < 10) {
        toast({
          title: "Low Minutes",
          description: `Only ${availabilityData.remainingMinutes} minutes remaining`,
          variant: "default",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to check session availability. Please try again.",
        variant: "destructive",
      });
      return;
    }
    
    // Save progress
    const currentProgress = loadProgress();
    saveProgress({
      ...currentProgress,
      lastLevel: level,
      lastSubject: subject,
      updatedAt: new Date().toISOString(),
    });

    // Reset transcript and connection state for fresh session
    setTranscriptMessages([]);
    setIsTranscriptConnected(false);
    
    // Start session tracking
    setSessionStartTime(new Date());
    
    // Simple static agent connection - no dynamic session creation
    setMounted(true);
    
    toast({
      title: "Connected!",
      description: `Your ${level} ${subject} tutor is ready to help.`,
    });

    // Analytics
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'tutor_session_start', {
        event_category: 'tutoring',
        custom_parameter_1: level,
        custom_parameter_2: subject,
        custom_parameter_3: studentName || selectedStudent?.name || 'anonymous'
      });
    }
  };

  const switchAgent = async () => {
    // Properly end the current session first
    console.log('[TutorPage] 🔄 Switching tutor - ending current session...');
    
    // End the session (this disconnects WebSocket and logs usage)
    await stop();
    
    // Wait a bit longer to ensure cleanup is complete
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Reset transcript for new agent
    setTranscriptMessages([]);
    setIsTranscriptConnected(false);
    
    // Start new session with updated agent
    console.log('[TutorPage] ✅ Starting new tutor session...');
    await startTutor();
  };

  const stop = async () => {
    // Log usage if session was active
    if (sessionStartTime) {
      const endTime = new Date();
      const durationMs = endTime.getTime() - sessionStartTime.getTime();
      const minutesUsed = Math.ceil(durationMs / 60000);

      if (minutesUsed > 0) {
        try {
          await apiRequest('POST', '/api/usage/log', {
            minutesUsed,
            sessionStart: sessionStartTime.toISOString(),
            sessionEnd: endTime.toISOString(),
          });
          
          // Refresh minutes data - invalidate ALL balance-related caches
          queryClient.invalidateQueries({ queryKey: ['/api/session/check-availability'] });
          queryClient.invalidateQueries({ queryKey: ['/api/voice-balance'] });
          queryClient.invalidateQueries({ queryKey: ['/api/user/voice-balance'] });
          queryClient.invalidateQueries({ queryKey: ['/api/user'] });
          
          toast({
            title: "Session Ended",
            description: `${minutesUsed} minute${minutesUsed === 1 ? '' : 's'} logged`,
          });
        } catch (error: any) {
          console.error('Failed to log usage:', error);
        }
      }
      
      setSessionStartTime(null);
    }

    setMounted(false);
    setTranscriptMessages([]);
    setIsTranscriptConnected(false);
    
    // Show summary modal if we have a student profile
    if (selectedStudentId) {
      setSummaryModalOpen(true);
    }
    
    // Analytics
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'tutor_session_end', {
        event_category: 'tutoring'
      });
    }
  };

  // Use static agent ID based on selected level
  const agentId = AGENTS[level as keyof typeof AGENTS];
  
  const levelGreetings = GREETINGS[level as keyof typeof GREETINGS];
  const greetingPreview = (levelGreetings as any)?.[subject] || 
                         (levelGreetings as any)?.["general"] || 
                         "Hello! I'm your AI tutor, ready to help you learn.";

  const metadata = {
    ...(studentName && { student_name: studentName }),
    ...(gradeText && { grade: gradeText }),
    subject,
    level
  };

  const firstUserMessage = lastSummary ? 
    `Previous session summary: ${lastSummary}. Please continue our learning journey from here.` : 
    undefined;

  // Save progress when level or subject changes
  useEffect(() => {
    if (level && subject) {
      const currentProgress = loadProgress();
      saveProgress({
        ...currentProgress,
        lastLevel: level,
        lastSubject: subject,
        updatedAt: new Date().toISOString(),
      });
    }
  }, [level, subject]);

  const handleOpenProfile = (studentId?: string) => {
    setEditingStudentId(studentId);
    setProfileDrawerOpen(true);
  };

  // Handle page close/refresh to log minutes
  useEffect(() => {
    const handleBeforeUnload = async () => {
      if (sessionStartTime) {
        const endTime = new Date();
        const durationMs = endTime.getTime() - sessionStartTime.getTime();
        const minutesUsed = Math.ceil(durationMs / 60000);

        if (minutesUsed > 0) {
          // Use sendBeacon for reliable logging during page unload
          const data = JSON.stringify({
            minutesUsed,
            sessionStart: sessionStartTime.toISOString(),
            sessionEnd: endTime.toISOString(),
          });
          
          navigator.sendBeacon('/api/usage/log', data);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [sessionStartTime]);

  return (
    <NetworkAwareWrapper>
      <TutorErrorBoundary>
        <div className="tutor-page max-w-3xl mx-auto p-4 space-y-4">
          {/* Header with Logo and Student Switcher */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex-1" />
              <div className="flex items-center gap-3">
                <img 
                  src={jieLogo} 
                  alt="JIE Mastery Logo" 
                  className="h-12 w-auto"
                  data-testid="img-jie-logo"
                />
                <h1 id="page-title" className="text-2xl font-bold text-foreground">
                  JIE Mastery Tutor — Multi-Agent
                </h1>
              </div>
              <div className="flex-1 flex justify-end items-center gap-2">
                <StudentSwitcher
                  selectedStudentId={selectedStudentId || undefined}
                  onSelectStudent={setSelectedStudentId}
                  onOpenProfile={handleOpenProfile}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" data-testid="button-user-menu">
                      <User className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setLocation("/dashboard")} data-testid="menu-item-dashboard">
                      <LayoutDashboard className="mr-2 h-4 w-4" />
                      Dashboard
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLocation("/settings")} data-testid="menu-item-settings">
                      <Settings className="mr-2 h-4 w-4" />
                      Settings
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={() => {
                        logoutMutation.mutate(undefined, {
                          onSuccess: () => {
                            setLocation('/auth');
                          }
                        });
                      }}
                      data-testid="menu-item-signout"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <p className="text-muted-foreground text-center">
              Age-appropriate AI tutoring with voice conversation
            </p>
          </div>

          {/* Usage Display */}
          {minutesData && (
            <Card className="shadow-sm" data-testid="card-usage-display">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-primary" />
                    <h3 className="font-semibold text-foreground">Voice Minutes</h3>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-foreground" data-testid="text-remaining-minutes">
                      {minutesData.remaining}
                    </p>
                    <p className="text-xs text-muted-foreground">of {minutesData.total} remaining</p>
                  </div>
                </div>

                <Progress 
                  value={(minutesData.used / minutesData.total) * 100} 
                  className="h-2 mb-3"
                  data-testid="progress-usage"
                />

                <div className="flex items-center justify-between text-sm">
                  <p className="text-muted-foreground">
                    {minutesData.used} used · {minutesData.bonusMinutes > 0 && `${minutesData.bonusMinutes} bonus`}
                  </p>
                  
                  {minutesData.remaining < 10 && (
                    <button
                      onClick={() => setShowTopUpModal(true)}
                      className="text-primary hover:underline font-medium flex items-center gap-1"
                      data-testid="button-buy-more-minutes"
                    >
                      <AlertCircle className="w-4 h-4" />
                      Buy More
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Controls */}
          <div className="flex flex-wrap gap-3 items-center justify-center">
            <select 
              id="age-range" 
              value={level} 
              onChange={e => setLevel(e.target.value as AgentLevel)}
              className="px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="select-level"
            >
              <option value="k2">Kindergarten–2</option>
              <option value="g3_5">Grades 3–5</option>
              <option value="g6_8">Grades 6–8</option>
              <option value="g9_12">Grades 9–12</option>
              <option value="college">College/Adult</option>
            </select>

            <select 
              id="subject" 
              value={subject} 
              onChange={e => setSubject(e.target.value)}
              className="px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="select-subject"
            >
              <option value="general">General</option>
              <option value="math">Math</option>
              <option value="english">English</option>
              <option value="spanish">Spanish</option>
            </select>

            <select 
              id="language" 
              value={selectedLanguage} 
              onChange={e => setSelectedLanguage(e.target.value)}
              className="px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-primary flex items-center gap-2"
              data-testid="select-language"
            >
              {SUPPORTED_LANGUAGES.map(lang => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>

            {/* Student Profile Selector */}
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setProfileDrawerOpen(true)}
                className={`flex items-center gap-2 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary ${
                  selectedStudent 
                    ? 'border-primary bg-primary/5 text-foreground' 
                    : 'border-destructive bg-destructive/5 text-destructive'
                }`}
                data-testid="button-select-student"
              >
                {selectedStudent?.avatarUrl ? (
                  <span className="text-lg">{selectedStudent.avatarUrl}</span>
                ) : (
                  <User className="w-4 h-4" />
                )}
                <span className="max-w-[120px] truncate">
                  {selectedStudent?.name || 'Select Student'}
                </span>
              </button>
            </div>

            <button 
              id="start-btn" 
              onClick={startTutor} 
              disabled={!scriptReady || !selectedStudentId}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="button-start-tutor"
              title={!selectedStudentId ? "Please select a student profile to connect" : ""}
            >
              Start Tutoring Session
            </button>
            
            <button 
              id="switch-btn" 
              onClick={switchAgent} 
              disabled={!mounted}
              className="px-4 py-2 bg-secondary text-secondary-foreground border border-input rounded-md hover:bg-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="button-switch-agent"
            >
              Switch Tutor
            </button>
            
            <button 
              id="end-btn" 
              onClick={stop} 
              disabled={!mounted}
              className="px-4 py-2 bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="button-stop-tutor"
            >
              Stop Session
            </button>
          </div>

          {/* Getting Started Instructions */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 rounded-md">
            <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">📚 How to Use JIE Mastery Tutor</h3>
            <ol className="text-sm text-blue-800 dark:text-blue-200 space-y-1.5 list-decimal list-inside">
              <li><strong>Select a student profile</strong> - Click "Select Student" to choose or create a profile. Each family member can have their own profile with custom avatar!</li>
              <li><strong>Select your grade level and subject</strong> you want help with</li>
              <li><strong>Upload your materials (optional)</strong> - Share homework, worksheets, or study guides (PDF, DOCX, or images). All uploaded documents are automatically available to your tutor and retained for 6 months</li>
              <li><strong>Wait a few seconds</strong> after uploading for documents to process completely</li>
              <li><strong>Click "Start Tutoring Session"</strong> to begin your voice conversation</li>
              <li><strong>Start speaking</strong> - Ask questions about your homework or discuss any topic. The tutor uses your uploaded documents to give personalized guidance!</li>
              <li><strong>View the transcript</strong> below to see your conversation in real-time</li>
            </ol>
          </div>

          {/* Document Upload Section - Using AssignmentsPanel */}
          {mounted && user && (
            <Card className="mt-4" data-testid="card-document-upload">
              <CardContent className="pt-4">
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                  <Paperclip className="w-4 h-4" />
                  Study Materials
                </h3>
                <AssignmentsPanel 
                  userId={user.id}
                  selectedDocumentIds={selectedDocumentIds}
                  onDocumentSelectionChange={setSelectedDocumentIds}
                />
              </CardContent>
            </Card>
          )}

          {/* Voice System Widget */}
          {mounted && (
            <div className="mt-6 space-y-4">
              {useConvai ? (
                <>
                  {/* ElevenLabs ConvAI System */}
                  <ConvaiHost
                    agentId={agentId}
                    onMessage={(message) => {
                      setTranscriptMessages(prev => [...prev, message]);
                    }}
                    onConnectionStatus={(connected) => {
                      setIsTranscriptConnected(connected);
                    }}
                  />
                  
                  <ConvaiTranscript 
                    messages={transcriptMessages}
                    isConnected={isTranscriptConnected}
                  />
                </>
              ) : (
                <>
                  {/* Custom Voice System (Deepgram + Claude + ElevenLabs) */}
                  <RealtimeVoiceHost
                    studentId={selectedStudentId || undefined}
                    studentName={studentName}
                    subject={subject}
                    language={selectedLanguage}
                    ageGroup={level === 'k2' ? 'K-2' : level === 'g3_5' ? '3-5' : level === 'g6_8' ? '6-8' : level === 'g9_12' ? '9-12' : 'College/Adult'}
                    contextDocumentIds={selectedDocumentIds.length > 0 ? selectedDocumentIds : contextDocumentIds}
                    onSessionStart={() => setSessionStartTime(new Date())}
                    onSessionEnd={() => setSessionStartTime(null)}
                  />
                </>
              )}
            </div>
          )}
        </div>

        {/* Student Profile Panel */}
        <StudentProfilePanel
          open={profileDrawerOpen}
          onOpenChange={setProfileDrawerOpen}
          studentId={editingStudentId}
          onStudentSaved={(studentId) => {
            setSelectedStudentId(studentId);
            setProfileDrawerOpen(false);
          }}
          onStudentDeleted={(deletedId) => {
            if (selectedStudentId === deletedId) {
              setSelectedStudentId(null);
            }
          }}
        />

        {/* Session Summary Modal */}
        <SessionSummaryModal
          open={summaryModalOpen}
          onOpenChange={(open) => {
            setSummaryModalOpen(open);
          }}
          sessionId={undefined}
          studentName={selectedStudent?.name}
          onSaved={() => {
            // No session cleanup needed with static agents
          }}
        />

        {/* Minute Top-Up Modal */}
        <TopUpModal
          isOpen={showTopUpModal}
          onClose={() => setShowTopUpModal(false)}
          remainingMinutes={minutesData?.remaining}
        />

      </TutorErrorBoundary>
    </NetworkAwareWrapper>
  );
}