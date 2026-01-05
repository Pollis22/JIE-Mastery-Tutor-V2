import { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  BookOpen, 
  Calculator, 
  Languages, 
  GraduationCap,
  Clock,
  ChevronRight,
  CheckCircle,
  PlayCircle,
  Download,
  Loader2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PracticeLesson {
  id: string;
  grade: string;
  subject: string;
  topic: string;
  lessonTitle: string;
  learningGoal: string;
  difficultyLevel: number;
  estimatedMinutes: number;
  orderIndex: number;
  status?: 'not_started' | 'in_progress' | 'completed';
}

const gradeLabels: Record<string, string> = {
  'K': 'Kindergarten',
  '1': '1st Grade',
  '2': '2nd Grade',
  '3': '3rd Grade',
  '4': '4th Grade',
  '5': '5th Grade',
  '6': '6th Grade',
  '7': '7th Grade',
  '8': '8th Grade',
  '9': '9th Grade',
  '10': '10th Grade',
  '11': '11th Grade',
  '12': '12th Grade',
};

const subjectIcons: Record<string, typeof BookOpen> = {
  'Math': Calculator,
  'ELA': BookOpen,
  'Spanish': Languages,
};

const subjectColors: Record<string, string> = {
  'Math': 'bg-blue-500',
  'ELA': 'bg-green-500',
  'Spanish': 'bg-orange-500',
};

export function PracticeLessonsSection() {
  const [, setLocation] = useLocation();
  const [selectedGrade, setSelectedGrade] = useState<string>('K');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const { toast } = useToast();

  const studentId = (() => {
    try {
      return localStorage.getItem('jie-selected-student-id') || undefined;
    } catch {
      return undefined;
    }
  })();

  const buildLessonsUrl = () => {
    const params = new URLSearchParams();
    if (selectedGrade) params.set('grade', selectedGrade);
    if (selectedSubject) params.set('subject', selectedSubject);
    if (selectedTopic) params.set('topic', selectedTopic);
    if (studentId) params.set('studentId', studentId);
    return `/api/practice-lessons?${params.toString()}`;
  };

  const { data: gradesData } = useQuery<{ grades: string[] }>({
    queryKey: ['/api/practice-lessons/grades'],
  });

  const { data: subjectsData } = useQuery<{ subjects: string[] }>({
    queryKey: [`/api/practice-lessons/subjects?grade=${encodeURIComponent(selectedGrade)}`],
    enabled: !!selectedGrade,
  });

  const { data: topicsData } = useQuery<{ topics: string[] }>({
    queryKey: [`/api/practice-lessons/topics?grade=${encodeURIComponent(selectedGrade)}&subject=${encodeURIComponent(selectedSubject)}`],
    enabled: !!selectedGrade && !!selectedSubject,
  });

  const { data: lessonsData, isLoading: lessonsLoading } = useQuery<{ lessons: PracticeLesson[] }>({
    queryKey: [buildLessonsUrl()],
    enabled: !!selectedGrade && !!selectedSubject,
  });

  const handleStartLesson = (lessonId: string) => {
    setLocation(`/tutor?lessonId=${lessonId}`);
  };

  const handleDownloadPDF = async (lesson: PracticeLesson) => {
    try {
      setDownloadingId(lesson.id);
      console.log('[Download] Fetching full lesson details:', lesson.id);

      // Fetch full lesson details from API
      const response = await fetch(`/api/practice-lessons/${lesson.id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch lesson details');
      }
      const fullLesson = await response.json();

      // Dynamic import of jsPDF
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF();

      // Title
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text(fullLesson.lessonTitle || lesson.lessonTitle, 20, 25);

      // Subtitle
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100);
      doc.text(`${lesson.subject} | ${gradeLabels[lesson.grade] || `Grade ${lesson.grade}`} | ${lesson.estimatedMinutes} minutes`, 20, 35);

      // Reset color
      doc.setTextColor(0);
      let yPos = 50;

      // Learning Goal
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Learning Goal:', 20, yPos);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      yPos += 8;
      const goalLines = doc.splitTextToSize(fullLesson.learningGoal || lesson.learningGoal, 170);
      doc.text(goalLines, 20, yPos);
      yPos += goalLines.length * 6 + 10;

      // Introduction
      if (fullLesson.tutorIntroduction) {
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Introduction:', 20, yPos);
        yPos += 8;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        const introLines = doc.splitTextToSize(fullLesson.tutorIntroduction, 170);
        doc.text(introLines, 20, yPos);
        yPos += introLines.length * 6 + 10;
      }

      // Guided Questions
      if (fullLesson.guidedQuestions?.length > 0) {
        if (yPos > 240) { doc.addPage(); yPos = 20; }
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Practice Questions:', 20, yPos);
        yPos += 8;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        fullLesson.guidedQuestions.forEach((q: string, i: number) => {
          if (yPos > 270) { doc.addPage(); yPos = 20; }
          const qLines = doc.splitTextToSize(`${i + 1}. ${q}`, 165);
          doc.text(qLines, 25, yPos);
          yPos += qLines.length * 6 + 4;
        });
        yPos += 6;
      }

      // Practice Prompts
      if (fullLesson.practicePrompts?.length > 0) {
        if (yPos > 240) { doc.addPage(); yPos = 20; }
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Practice Exercises:', 20, yPos);
        yPos += 8;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        fullLesson.practicePrompts.forEach((p: string, i: number) => {
          if (yPos > 270) { doc.addPage(); yPos = 20; }
          const pLines = doc.splitTextToSize(`${i + 1}. ${p}`, 165);
          doc.text(pLines, 25, yPos);
          yPos += pLines.length * 6 + 4;
        });
      }

      // Practice Problems (Enhanced Content)
      if (fullLesson.practiceProblems) {
        doc.addPage();
        yPos = 20;
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Practice Problems:', 20, yPos);
        yPos += 8;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        const problemLines = doc.splitTextToSize(fullLesson.practiceProblems, 170);
        doc.text(problemLines, 20, yPos);
      }

      // Answer Key (Enhanced Content)
      if (fullLesson.answerKey) {
        doc.addPage();
        yPos = 20;
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Answer Key:', 20, yPos);
        yPos += 8;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        const answerLines = doc.splitTextToSize(fullLesson.answerKey, 170);
        doc.text(answerLines, 20, yPos);
      }

      // Footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(9);
        doc.setTextColor(150);
        doc.text(`JIE Mastery AI Tutor - Page ${i} of ${pageCount}`, 105, 290, { align: 'center' });
      }

      // Download
      const safeTitle = lesson.lessonTitle.replace(/[^a-z0-9]/gi, '_');
      doc.save(`${safeTitle}.pdf`);

      toast({
        title: "PDF Downloaded",
        description: "Open the PDF to view while talking to your tutor!",
      });
    } catch (error) {
      console.error('[Download] PDF generation failed:', error);
      toast({
        title: "Download Failed",
        description: "Could not generate PDF. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const grades = gradesData?.grades || [];
  const subjects = subjectsData?.subjects || [];
  const topics = topicsData?.topics || [];
  const lessons = lessonsData?.lessons || [];

  return (
    <div className="space-y-4" data-testid="practice-lessons-section">
      <div className="flex items-center gap-2 mb-4">
        <GraduationCap className="h-5 w-5 text-primary" />
        <span className="font-medium">Browse Practice Lessons</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Select value={selectedGrade} onValueChange={(val) => {
          setSelectedGrade(val);
          setSelectedSubject('');
          setSelectedTopic('');
        }}>
          <SelectTrigger data-testid="select-grade">
            <SelectValue placeholder="Select Grade" />
          </SelectTrigger>
          <SelectContent>
            {grades.map(grade => (
              <SelectItem key={grade} value={grade}>
                {gradeLabels[grade] || `Grade ${grade}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select 
          value={selectedSubject} 
          onValueChange={(val) => {
            setSelectedSubject(val);
            setSelectedTopic('');
          }}
          disabled={!selectedGrade || subjects.length === 0}
        >
          <SelectTrigger data-testid="select-subject">
            <SelectValue placeholder="Select Subject" />
          </SelectTrigger>
          <SelectContent>
            {subjects.map(subject => {
              const Icon = subjectIcons[subject] || BookOpen;
              return (
                <SelectItem key={subject} value={subject}>
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {subject}
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        <Select 
          value={selectedTopic || "all"} 
          onValueChange={(val) => setSelectedTopic(val === "all" ? "" : val)}
          disabled={!selectedSubject || topics.length === 0}
        >
          <SelectTrigger data-testid="select-topic">
            <SelectValue placeholder="All Topics" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Topics</SelectItem>
            {topics.map(topic => (
              <SelectItem key={topic} value={topic}>{topic}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedSubject && (
        <ScrollArea className="h-[300px] border rounded-lg">
          {lessonsLoading ? (
            <div className="p-4 text-center text-muted-foreground">
              Loading lessons...
            </div>
          ) : lessons.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              No lessons available for this selection.
            </div>
          ) : (
            <div className="divide-y">
              {lessons.map((lesson) => {
                const SubjectIcon = subjectIcons[lesson.subject] || BookOpen;
                const colorClass = subjectColors[lesson.subject] || 'bg-gray-500';
                
                return (
                  <div 
                    key={lesson.id} 
                    className="p-3 hover:bg-muted/50 transition-colors"
                    data-testid={`lesson-item-${lesson.id}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-1.5 h-1.5 rounded-full ${colorClass}`} />
                          <span className="font-medium text-sm truncate">{lesson.lessonTitle}</span>
                          {lesson.status === 'completed' && (
                            <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                          )}
                          {lesson.status === 'in_progress' && (
                            <Badge variant="secondary" className="text-xs">In Progress</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1 mb-1">
                          {lesson.learningGoal}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className="text-xs py-0">
                            <SubjectIcon className="h-3 w-3 mr-1" />
                            {lesson.subject}
                          </Badge>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {lesson.estimatedMinutes}min
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleDownloadPDF(lesson)}
                          disabled={downloadingId === lesson.id}
                          className="text-xs"
                          data-testid={`button-download-lesson-${lesson.id}`}
                        >
                          {downloadingId === lesson.id ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <Download className="h-3 w-3 mr-1" />
                          )}
                          PDF
                        </Button>
                        <Button 
                          size="sm" 
                          onClick={() => handleStartLesson(lesson.id)}
                          className="text-xs"
                          data-testid={`button-start-lesson-${lesson.id}`}
                        >
                          <PlayCircle className="h-3 w-3 mr-1" />
                          Start
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      )}

      {!selectedSubject && selectedGrade && (
        <div className="p-8 text-center border rounded-lg bg-muted/20">
          <GraduationCap className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground">
            Select a subject to browse available practice lessons
          </p>
        </div>
      )}
    </div>
  );
}
