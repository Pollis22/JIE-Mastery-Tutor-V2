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
import { TopUpModal } from "@/components/TopUpModal";
import { VerificationBanner } from "@/components/VerificationBanner";
import { AGENTS, GREETINGS, type AgentLevel } from "@/agents";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Clock, AlertCircle, Upload, File, X, Paperclip, LogOut, Settings, LayoutDashboard, User, Globe, Menu, BookOpen, GraduationCap, ChevronRight } from "lucide-react";
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
import tutorHero from "@/assets/tutor-hero.png";

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
  const [transcriptMessages, setTranscriptMessages] = useState<ConvaiMessage[]>([]);
  const [isTranscriptConnected, setIsTranscriptConnected] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<string>(() => {
    try {
      return localStorage.getItem('jie-tutor-language') || 'en';
    } catch {
      return 'en';
    }
  });

  // Practice lesson context
  const [activeLessonId, setActiveLessonId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('lessonId');
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

  // Meta Pixel: Track minute top-up purchase on successful checkout redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const topupSuccess = params.get('topup');
    
    if (topupSuccess === 'success' && typeof window !== 'undefined' && (window as any).fbq) {
      // Top-up is $19.99 for 60 minutes
      (window as any).fbq('track', 'Purchase', {
        value: 19.99,
        currency: 'USD',
        content_name: '60 minute top-up',
        content_type: 'minutes'
      });
      console.log('[Meta Pixel] Purchase event tracked for minute top-up');
      
      // Clean up URL param (prevent duplicate tracking on refresh)
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

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
  const { data: selectedStudent } = useQuery<{ id: string; name: string; avatarUrl?: string; avatarType?: 'default' | 'preset' | 'upload'; grade?: string }>({
    queryKey: ['/api/students', selectedStudentId],
    enabled: !!selectedStudentId,
  });

  // Map student grade to dropdown level value
  const mapGradeToLevel = (studentGrade: string): AgentLevel => {
    if (!studentGrade) return 'college';
    
    // Normalize: lowercase, remove punctuation, replace spaces/dashes with single dash
    const normalized = studentGrade
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '') // Remove punctuation except dashes
      .replace(/\s+/g, '-')     // Replace spaces with dashes
      .replace(/-+/g, '-')      // Collapse multiple dashes
      .replace(/^-|-$/g, '');   // Trim leading/trailing dashes
    
    // Check for college/adult keywords first (highest priority for explicit matches)
    if (normalized.includes('college') || normalized.includes('adult') || normalized.includes('university')) {
      return 'college';
    }
    
    // Check for kindergarten keywords
    if (normalized.includes('kindergarten') || normalized === 'k' || normalized.startsWith('k-')) {
      return 'k2';
    }
    
    // Check for grade band patterns: handles "3-5", "grades-3-5", "grade-3-5", "3-to-5"
    const bandMatch = normalized.match(/(\d+)-(?:to-)?(\d+)/);
    if (bandMatch) {
      const lowGrade = parseInt(bandMatch[1]);
      const highGrade = parseInt(bandMatch[2]);
      // Map based on the range
      if (highGrade <= 2) return 'k2';
      if (lowGrade >= 3 && highGrade <= 5) return 'g3_5';
      if (lowGrade >= 6 && highGrade <= 8) return 'g6_8';
      if (lowGrade >= 9 && highGrade <= 12) return 'g9_12';
    }
    
    // Extract any numeric grade (handles '5th', '5', 'grade-5', 'grade5', etc.)
    const numMatch = normalized.match(/(\d+)/);
    if (numMatch) {
      const gradeNum = parseInt(numMatch[1]);
      if (gradeNum >= 0 && gradeNum <= 2) return 'k2';
      if (gradeNum >= 3 && gradeNum <= 5) return 'g3_5';
      if (gradeNum >= 6 && gradeNum <= 8) return 'g6_8';
      if (gradeNum >= 9 && gradeNum <= 12) return 'g9_12';
      if (gradeNum > 12) return 'college';
    }
    
    // Default to college/adult
    return 'college';
  };

  // Auto-populate grade level from student profile
  useEffect(() => {
    if (selectedStudent?.grade) {
      const mappedLevel = mapGradeToLevel(selectedStudent.grade);
      setLevel(mappedLevel);
    }
  }, [selectedStudent?.grade]);

  // Fetch student's pinned documents for RAG context
  const { data: pinnedDocs } = useQuery<Array<{ pin: any; document: { id: string; title: string } }>>({
    queryKey: ['/api/students', selectedStudentId, 'pinned-docs'],
    enabled: !!selectedStudentId,
  });

  // Fetch active lesson details for structured tutoring
  const { data: activeLessonData } = useQuery<{
    lesson: {
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
    };
  }>({
    queryKey: ['/api/practice-lessons', activeLessonId],
    enabled: !!activeLessonId,
  });

  const activeLesson = activeLessonData?.lesson;

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
        if (availabilityData.code === 'EMAIL_NOT_VERIFIED') {
          toast({
            title: "Email Verification Required",
            description: availabilityData.message || "Please verify your email address to start tutoring.",
            variant: "destructive",
          });
          return;
        } else if (availabilityData.reason === 'no_subscription') {
          toast({
            title: "Subscription Required",
            description: availabilityData.message,
            variant: "destructive",
          });
          setLocation('/pricing');
          return;
        } else if (availabilityData.reason === 'subscription_expired' || availabilityData.reason === 'subscription_ended') {
          toast({
            title: "Subscription Expired",
            description: availabilityData.message || "Your subscription has ended. Please reactivate to continue learning.",
            variant: "destructive",
          });
          setLocation('/dashboard?tab=subscription');
          return;
        } else if (availabilityData.reason === 'payment_failed') {
          toast({
            title: "Payment Issue",
            description: availabilityData.message || "There is an issue with your payment. Please update your payment method.",
            variant: "destructive",
          });
          setLocation('/dashboard?tab=subscription');
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
    
    // Sessions are automatically saved by the backend when WebSocket connection ends
    // No manual save modal needed - transcript and duration are persisted automatically
    
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
        {/* Show verification banner if email not verified */}
        {user && !user.emailVerified && <VerificationBanner />}
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
                    <Button variant="outline" data-testid="button-user-menu">
                      <Menu className="h-4 w-4 mr-1" />
                      Menu
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setLocation("/dashboard")} data-testid="menu-item-dashboard">
                      <LayoutDashboard className="mr-2 h-4 w-4" />
                      Dashboard
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLocation("/support")} data-testid="menu-item-support">
                      <User className="mr-2 h-4 w-4" />
                      Live Support
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


            <button 
              id="start-btn" 
              onClick={startTutor} 
              disabled={!scriptReady || !selectedStudentId}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="button-start-tutor"
              title={!selectedStudentId ? "Please select a student profile to connect" : ""}
            >
              Talk to Your Tutor
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
          <div className="relative bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-4 rounded-md overflow-hidden">
            {/* Background image - positioned absolutely, behind content */}
            <div 
              className="absolute inset-0 opacity-15 pointer-events-none bg-cover bg-right-bottom"
              style={{ backgroundImage: `url(${tutorHero})` }}
            />
            {/* Content - positioned relatively to appear on top */}
            <div className="relative z-10">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">📚 How to Use JIE Mastery Tutor</h3>
            <ol className="text-sm text-gray-700 dark:text-gray-300 space-y-1.5 list-decimal list-inside">
              <li><strong>Create/Select a student profile</strong> - Use the profile dropdown at the top to choose your profile, or create a new one. Each family member can have their own profile with custom avatar!</li>
              <li><strong>Select your grade level</strong> you want help with</li>
              <li><strong>Upload your materials (optional)</strong> - Share homework, worksheets, or study guides (PDF, DOCX, or images). Select documents to use in this session, or upload new ones</li>
              <li><strong>Wait a few seconds</strong> after uploading for documents to process completely</li>
              <li><strong>Click "Talk to Your Tutor"</strong> to begin your voice conversation</li>
              <li><strong>Start speaking</strong> - Ask questions about your homework or discuss any topic. The tutor uses your uploaded documents to give personalized guidance!</li>
              <li><strong>View the transcript</strong> below to see your conversation in real-time</li>
            </ol>
            </div>
          </div>

          {/* Active Lesson Context Card */}
          {activeLesson && (
            <Card className="mt-4 border-2 border-primary/30 bg-gradient-to-r from-primary/5 to-primary/10" data-testid="card-active-lesson">
              <CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <GraduationCap className="h-5 w-5 text-primary" />
                      <span className="text-xs font-medium text-primary uppercase tracking-wide">
                        Practice Lesson
                      </span>
                    </div>
                    <h3 className="font-semibold text-lg mb-1">{activeLesson.lessonTitle}</h3>
                    <p className="text-sm text-muted-foreground mb-3">{activeLesson.learningGoal}</p>
                    
                    <div className="flex flex-wrap gap-2 mb-3">
                      <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded-full">
                        {activeLesson.subject}
                      </span>
                      <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full">
                        {activeLesson.topic}
                      </span>
                      <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {activeLesson.estimatedMinutes} min
                      </span>
                    </div>

                    <div className="bg-background/50 p-3 rounded-lg border">
                      <p className="text-sm italic text-muted-foreground">
                        "{activeLesson.tutorIntroduction}"
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setActiveLessonId(null);
                      window.history.replaceState({}, '', '/tutor');
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

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
                    studentName={selectedStudent?.name || studentName}
                    subject={activeLesson?.subject || subject}
                    language={selectedLanguage}
                    ageGroup={level === 'k2' ? 'K-2' : level === 'g3_5' ? '3-5' : level === 'g6_8' ? '6-8' : level === 'g9_12' ? '9-12' : 'College/Adult'}
                    contextDocumentIds={selectedDocumentIds}
                    activeLesson={activeLesson}
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