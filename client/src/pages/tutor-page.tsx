import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState } from "react";
import { TutorErrorBoundary } from "@/components/tutor-error-boundary";
import { NetworkAwareWrapper } from "@/components/network-aware-wrapper";
import ConvaiHost from "@/components/convai-host";
import { AssignmentsPanel } from "@/components/AssignmentsPanel";
import { StudentSwitcher } from "@/components/StudentSwitcher";
import { StudentProfilePanel } from "@/components/StudentProfilePanel";
import { SessionSummaryModal } from "@/components/SessionSummaryModal";
import { AGENTS, GREETINGS, type AgentLevel } from "@/agents";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
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
  const [scriptReady, setScriptReady] = useState(false);

  const memo = loadProgress();
  const [level, setLevel] = useState<AgentLevel>((memo.lastLevel as AgentLevel) || "k2");
  const [subject, setSubject] = useState(memo.lastSubject || "general");
  const [studentName, setStudentName] = useState("");
  const [gradeText, setGradeText] = useState("");
  const [mounted, setMounted] = useState(false);
  const [lastSummary, setLastSummary] = useState(memo.lastSummary || "");
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [showAssignments, setShowAssignments] = useState(false);
  const [sessionContext, setSessionContext] = useState<any>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [profileDrawerOpen, setProfileDrawerOpen] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState<string | undefined>();
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);

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
    
    setMounted(true);
    
    // Save progress
    const currentProgress = loadProgress();
    saveProgress({
      ...currentProgress,
      lastLevel: level,
      lastSubject: subject,
      updatedAt: new Date().toISOString(),
    });

    // Create session and fetch context if student is selected
    if (selectedStudentId) {
      try {
        // Create session
        const sessionRes = await apiRequest('POST', `/api/students/${selectedStudentId}/sessions`, {
          subject,
          contextDocuments: selectedDocuments.length > 0 ? selectedDocuments : undefined,
        });
        const session = await sessionRes.json();
        setCurrentSessionId(session.id);

        // Fetch context for personalized tutoring
        const contextRes = await apiRequest('POST', '/api/context/session-start', {
          studentId: selectedStudentId,
          subject,
          includeDocIds: selectedDocuments.length > 0 ? selectedDocuments : undefined,
        });
        const context = await contextRes.json();
        setSessionContext(context);
      } catch (error: any) {
        console.error('Failed to create session or fetch context:', error);
        toast({
          title: "Note",
          description: "Session memory won't be saved automatically. You can still use the tutor!",
          variant: "default",
        });
      }
    } else {
      // Clear context if no student selected
      setSessionContext(null);
    }

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
    setMounted(false);
    setTimeout(() => setMounted(true), 100);
  };

  const stop = () => {
    setMounted(false);
    
    // Show summary modal if we have a session to save
    if (currentSessionId && selectedStudentId) {
      setSummaryModalOpen(true);
    }
    
    // Analytics
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'tutor_session_end', {
        event_category: 'tutoring'
      });
    }
  };

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
              placeholder="Student name (optional)" 
              value={studentName} 
              onChange={e => setStudentName(e.target.value)}
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
              disabled={!scriptReady}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="button-start-tutor"
            >
              Start Learning
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

          {/* Greeting Preview */}
          <div className="bg-muted p-3 rounded-md">
            <div className="text-sm text-muted-foreground mb-1">Your Tutor Will Say:</div>
            <div className="text-base text-foreground italic">"{greetingPreview}"</div>
          </div>

          {/* Study Materials Toggle */}
          <div className="mb-4">
            <button 
              onClick={() => setShowAssignments(!showAssignments)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              data-testid="button-toggle-assignments"
            >
              {showAssignments ? 'Hide Study Materials' : 'Upload Study Materials Here'}
            </button>
          </div>

          {/* Study Materials Panel */}
          {showAssignments && user && (
            <div className="mb-6">
              <AssignmentsPanel 
                userId={user.id}
                onSelectionChange={setSelectedDocuments}
              />
            </div>
          )}

          {/* ConvAI Widget */}
          {mounted && (
            <div className="mt-6">
              <ConvaiHost
                agentId={agentId}
                firstUserMessage={sessionContext?.firstMessage || firstUserMessage}
                metadata={{
                  ...metadata, 
                  selectedDocuments,
                  systemPrompt: sessionContext?.systemPrompt,
                  hasDocuments: selectedDocuments.length > 0,
                  documentContext: sessionContext?.summary
                }}
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
          onOpenChange={async (open) => {
            // If closing without saving, still end the session
            if (!open && currentSessionId) {
              try {
                await apiRequest('PUT', `/api/sessions/${currentSessionId}`, {
                  endedAt: new Date().toISOString(),
                });
                queryClient.invalidateQueries({ queryKey: ['/api/students', selectedStudentId] });
              } catch (error) {
                console.error('Failed to end session:', error);
              }
              setCurrentSessionId(null);
            }
            setSummaryModalOpen(open);
          }}
          sessionId={currentSessionId || undefined}
          studentName={selectedStudent?.name}
          onSaved={() => {
            setCurrentSessionId(null);
          }}
        />
      </TutorErrorBoundary>
    </NetworkAwareWrapper>
  );
}