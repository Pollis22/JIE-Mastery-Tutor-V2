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
  const [wantToUploadDocs, setWantToUploadDocs] = useState<boolean | null>(null);
  const [sessionContext, setSessionContext] = useState<any>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [profileDrawerOpen, setProfileDrawerOpen] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState<string | undefined>();
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [dynamicAgentId, setDynamicAgentId] = useState<string | null>(null);
  const [dynamicConversationId, setDynamicConversationId] = useState<string | null>(null);
  const [transcriptMessages, setTranscriptMessages] = useState<ConvaiMessage[]>([]);
  const [isTranscriptConnected, setIsTranscriptConnected] = useState(false);

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
    
    // Save progress
    const currentProgress = loadProgress();
    saveProgress({
      ...currentProgress,
      lastLevel: level,
      lastSubject: subject,
      updatedAt: new Date().toISOString(),
    });

    // Map level to gradeBand for API
    const gradeBandMap: Record<string, string> = {
      'k2': 'K-2',
      'g3_5': '3-5',
      'g6_8': '6-8',
      'g9_12': '9-12',
      'college': 'College/Adult'
    };
    const gradeBand = gradeBandMap[level];

    try {
      // Create dynamic agent session with documents
      toast({
        title: "Creating your session...",
        description: "Setting up your personalized tutor with your materials",
      });

      const sessionRes = await apiRequest('POST', '/api/session/create', {
        studentId: selectedStudentId || undefined,
        studentName: studentName.trim(),
        gradeBand,
        subject,
        documentIds: selectedDocuments
      });
      const sessionData = await sessionRes.json();
      
      console.log('[TutorPage] Dynamic agent created:', {
        sessionId: sessionData.sessionId,
        agentId: sessionData.agentId,
        documentCount: selectedDocuments.length
      });

      setCurrentSessionId(sessionData.sessionId);
      setDynamicAgentId(sessionData.agentId);
      setDynamicConversationId(sessionData.conversationId);
      setMounted(true);

      toast({
        title: "Ready to learn!",
        description: `Your ${gradeBand} ${subject} tutor is ready with your ${selectedDocuments.length} uploaded materials.`,
      });

    } catch (error: any) {
      console.error('Failed to create session agent:', error);
      toast({
        title: "Failed to start session",
        description: error.message || "Unable to create your personalized tutor. Please try again.",
        variant: "destructive",
      });
    }

    // Analytics
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'tutor_session_start', {
        event_category: 'tutoring',
        custom_parameter_1: level,
        custom_parameter_2: subject,
        custom_parameter_3: studentName || selectedStudent?.name || 'anonymous',
        custom_parameter_4: selectedDocuments.length
      });
    }
  };

  const switchAgent = () => {
    setMounted(false);
    setTimeout(() => setMounted(true), 100);
  };

  const stop = async () => {
    setMounted(false);
    
    // Cleanup dynamic agent session
    if (currentSessionId) {
      try {
        await apiRequest('POST', `/api/session/${currentSessionId}/end`, {});
        console.log('[TutorPage] Session ended and cleaned up');
      } catch (error) {
        console.error('Failed to cleanup session:', error);
      }
    }
    
    // Reset session state
    setCurrentSessionId(null);
    setDynamicAgentId(null);
    setDynamicConversationId(null);
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

  // Use dynamic agent ID if available, otherwise fall back to static agent
  const staticAgentId = AGENTS[level as keyof typeof AGENTS];
  const agentId = dynamicAgentId || staticAgentId;
  
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
              disabled={!scriptReady || !studentName.trim() || wantToUploadDocs === null}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="button-start-tutor"
              title={
                !studentName.trim() 
                  ? "Please enter student name to connect" 
                  : wantToUploadDocs === null 
                  ? "Please choose whether to upload documents" 
                  : ""
              }
            >
              Connect to Tutor
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

          {/* Document Upload Choice */}
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-400 dark:border-yellow-600 p-4 rounded-md">
            <h3 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-3">📄 Do you want to upload study materials?</h3>
            <div className="flex gap-6 items-center">
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="upload-choice"
                  checked={wantToUploadDocs === true}
                  onChange={() => {
                    setWantToUploadDocs(true);
                    setShowAssignments(true);
                  }}
                  className="w-4 h-4 text-primary focus:ring-2 focus:ring-primary"
                  data-testid="radio-upload-yes"
                />
                <span className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                  Yes - I want to upload homework, notes, or assignments
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="upload-choice"
                  checked={wantToUploadDocs === false}
                  onChange={() => {
                    setWantToUploadDocs(false);
                    setShowAssignments(false);
                    setSelectedDocuments([]);
                  }}
                  className="w-4 h-4 text-primary focus:ring-2 focus:ring-primary"
                  data-testid="radio-upload-no"
                />
                <span className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                  No - Connect directly without uploading
                </span>
              </label>
            </div>
            {wantToUploadDocs === null && (
              <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-2 font-semibold">
                ⚠️ Please make a selection before connecting to the tutor
              </p>
            )}
          </div>

          {/* Getting Started Instructions */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 rounded-md">
            <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">📚 How to Use JIE Mastery Tutor</h3>
            <ol className="text-sm text-blue-800 dark:text-blue-200 space-y-1.5 list-decimal list-inside">
              <li><strong>Enter your name</strong> above (required for a personalized experience)</li>
              <li><strong>Select your grade level and subject</strong> you want help with</li>
              <li><strong>Choose document upload</strong> - Select "Yes" if you want to upload homework/notes, or "No" to connect directly</li>
              <li><strong>Upload materials</strong> (if you selected Yes) - Add your homework, notes, or assignments and check the "Use" box for documents you want referenced</li>
              <li><strong>Click "Connect to Tutor"</strong> to start your personalized learning session</li>
              <li><strong>Ask questions</strong> about your materials or the subject - the tutor will help you understand!</li>
            </ol>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-3 italic">💡 Tip: Uploading documents before connecting provides the best personalized tutoring experience</p>
          </div>

          {/* Study Materials Panel (shown only if user wants to upload) */}
          {wantToUploadDocs === true && user && (
            <div className="mb-6">
              <AssignmentsPanel 
                userId={user.id}
                onSelectionChange={setSelectedDocuments}
              />
            </div>
          )}

          {/* ConvAI Widget */}
          {mounted && dynamicAgentId && (
            <div className="mt-6 space-y-4">
              <ConvaiHost
                agentId={dynamicAgentId}
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