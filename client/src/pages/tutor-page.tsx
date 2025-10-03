import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState } from "react";
import { TutorErrorBoundary } from "@/components/tutor-error-boundary";
import { NetworkAwareWrapper } from "@/components/network-aware-wrapper";
import ConvaiHost, { type ConvaiMessage } from "@/components/convai-host";
import { ConvaiTranscript } from "@/components/convai-transcript";
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
import { Clock, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import jieLogo from "@/assets/jie-mastery-logo.png";

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

export default function TutorPage() {
  const { user } = useAuth();
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
  
  // Session tracking state
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  const [showTopUpModal, setShowTopUpModal] = useState(false);

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

  // Fetch selected student data
  const { data: selectedStudent } = useQuery<{ id: string; name: string }>({
    queryKey: ['/api/students', selectedStudentId],
    enabled: !!selectedStudentId,
  });

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
    if (!studentName.trim()) {
      toast({
        title: "Student name required",
        description: "Please enter a student name before connecting to the tutor.",
        variant: "destructive",
      });
      return;
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

  const switchAgent = () => {
    // Reset transcript for new agent
    setTranscriptMessages([]);
    setIsTranscriptConnected(false);
    // Remount widget
    setMounted(false);
    setTimeout(() => setMounted(true), 100);
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
          
          // Refresh minutes data
          queryClient.invalidateQueries({ queryKey: ['/api/session/check-availability'] });
          
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
              <div className="flex-1 flex justify-end">
                <StudentSwitcher
                  selectedStudentId={selectedStudentId || undefined}
                  onSelectStudent={setSelectedStudentId}
                  onOpenProfile={handleOpenProfile}
                />
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

            <input 
              id="student-name" 
              placeholder="Student name (required)" 
              value={studentName} 
              onChange={e => setStudentName(e.target.value)}
              required
              className="px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="input-student-name"
            />
            
            <input 
              id="grade-text" 
              placeholder="Grade text (optional)" 
              value={gradeText} 
              onChange={e => setGradeText(e.target.value)}
              className="px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="input-grade-text"
            />

            <button 
              id="start-btn" 
              onClick={startTutor} 
              disabled={!scriptReady || !studentName.trim()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="button-start-tutor"
              title={!studentName.trim() ? "Please enter student name to connect" : ""}
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
              <li><strong>Enter your name</strong> above (required for a personalized experience)</li>
              <li><strong>Select your grade level and subject</strong> you want help with</li>
              <li><strong>Click "Start Tutoring Session"</strong> to connect with your AI tutor</li>
              <li><strong>Start speaking</strong> - the tutor will help you learn and answer your questions!</li>
              <li><strong>You may copy and paste your homework into the message box</strong> if there is something specific you want to cover</li>
              <li><strong>View the transcript</strong> below to see your conversation in real-time</li>
            </ol>
          </div>

          {/* ConvAI Widget */}
          {mounted && (
            <div className="mt-6 space-y-4">
              <ConvaiHost
                agentId={agentId}
                onMessage={(message) => {
                  setTranscriptMessages(prev => [...prev, message]);
                }}
                onConnectionStatus={(connected) => {
                  setIsTranscriptConnected(connected);
                }}
              />
              
              {/* Real-time Transcript */}
              <ConvaiTranscript 
                messages={transcriptMessages}
                isConnected={isTranscriptConnected}
              />
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