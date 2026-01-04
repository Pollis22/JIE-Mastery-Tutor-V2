import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ChevronRight,
  ChevronLeft,
  BookOpen,
  Clock,
  CheckCircle,
  PlayCircle,
  Circle,
  GraduationCap,
  Calculator,
  BookA,
  Languages,
  Star,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { queryClient, apiRequest } from '@/lib/queryClient';

interface PracticeLesson {
  id: string;
  grade: string;
  subject: string;
  topic: string;
  lessonTitle: string;
  learningGoal: string;
  tutorIntroduction?: string;
  guidedQuestions?: string[];
  practicePrompts?: string[];
  checkUnderstanding?: string;
  encouragementClose?: string;
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
  'ELA': BookA,
  'Spanish': Languages,
};

const subjectColors: Record<string, string> = {
  'Math': 'bg-blue-500',
  'ELA': 'bg-green-500',
  'Spanish': 'bg-orange-500',
};

export default function PracticeLessonsPage() {
  const [, setLocation] = useLocation();
  const [selectedGrade, setSelectedGrade] = useState<string>('K');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [selectedLesson, setSelectedLesson] = useState<PracticeLesson | null>(null);
  
  const [studentId] = useState<string | undefined>(() => {
    try {
      return localStorage.getItem('jie-selected-student-id') || undefined;
    } catch {
      return undefined;
    }
  });

  const { data: gradesData, isLoading: gradesLoading } = useQuery<{ grades: string[] }>({
    queryKey: ['/api/practice-lessons/grades'],
  });

  const { data: subjectsData, isLoading: subjectsLoading } = useQuery<{ subjects: string[] }>({
    queryKey: ['/api/practice-lessons/subjects', { grade: selectedGrade }],
    queryFn: async () => {
      const res = await fetch(`/api/practice-lessons/subjects?grade=${encodeURIComponent(selectedGrade)}`);
      return res.json();
    },
    enabled: !!selectedGrade,
  });

  const { data: topicsData, isLoading: topicsLoading } = useQuery<{ topics: string[] }>({
    queryKey: ['/api/practice-lessons/topics', { grade: selectedGrade, subject: selectedSubject }],
    queryFn: async () => {
      const res = await fetch(`/api/practice-lessons/topics?grade=${encodeURIComponent(selectedGrade)}&subject=${encodeURIComponent(selectedSubject)}`);
      return res.json();
    },
    enabled: !!selectedGrade && !!selectedSubject,
  });

  const { data: lessonsData, isLoading: lessonsLoading } = useQuery<{ lessons: PracticeLesson[] }>({
    queryKey: ['/api/practice-lessons', { grade: selectedGrade, subject: selectedSubject, topic: selectedTopic, studentId }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedGrade) params.set('grade', selectedGrade);
      if (selectedSubject) params.set('subject', selectedSubject);
      if (selectedTopic) params.set('topic', selectedTopic);
      if (studentId) params.set('studentId', studentId);
      const res = await fetch(`/api/practice-lessons?${params.toString()}`);
      return res.json();
    },
    enabled: !!selectedGrade && !!selectedSubject,
  });

  const { data: lessonDetailData, isLoading: lessonDetailLoading } = useQuery<{ lesson: PracticeLesson }>({
    queryKey: ['/api/practice-lessons/detail', selectedLesson?.id],
    queryFn: async () => {
      const res = await fetch(`/api/practice-lessons/${selectedLesson?.id}`);
      return res.json();
    },
    enabled: !!selectedLesson?.id,
  });

  const startLessonMutation = useMutation({
    mutationFn: async (lessonId: string) => {
      return apiRequest('POST', `/api/practice-lessons/${lessonId}/start`, { studentId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/practice-lessons'] });
    },
  });

  const handleSubjectSelect = (subject: string) => {
    setSelectedSubject(subject);
    setSelectedTopic('');
    setSelectedLesson(null);
  };

  const handleTopicSelect = (topic: string) => {
    setSelectedTopic(topic);
    setSelectedLesson(null);
  };

  const handleLessonSelect = (lesson: PracticeLesson) => {
    setSelectedLesson(lesson);
  };

  const handleStartLesson = async () => {
    if (!selectedLesson) return;
    
    await startLessonMutation.mutateAsync(selectedLesson.id);
    setLocation(`/tutor?lessonId=${selectedLesson.id}`);
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'in_progress':
        return <PlayCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Circle className="h-4 w-4 text-gray-300" />;
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-500">Completed</Badge>;
      case 'in_progress':
        return <Badge variant="default" className="bg-yellow-500">In Progress</Badge>;
      default:
        return <Badge variant="outline">Not Started</Badge>;
    }
  };

  const filteredLessons = lessonsData?.lessons?.filter(
    lesson => !selectedTopic || lesson.topic === selectedTopic
  ) || [];

  const completedCount = filteredLessons.filter(l => l.status === 'completed').length;
  const progressPercentage = filteredLessons.length > 0 
    ? (completedCount / filteredLessons.length) * 100 
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Button variant="ghost" size="sm" onClick={() => setLocation('/dashboard')}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back to Dashboard
            </Button>
          </div>
          <h1 className="text-3xl font-bold flex items-center gap-3" data-testid="text-page-title">
            <BookOpen className="h-8 w-8 text-primary" />
            Practice Lessons
          </h1>
          <p className="text-muted-foreground mt-2">
            Browse structured curriculum lessons with your AI tutor
          </p>
        </div>

        <div className="grid lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <GraduationCap className="h-5 w-5" />
                  Grade Level
                </CardTitle>
              </CardHeader>
              <CardContent>
                {gradesLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <Select value={selectedGrade} onValueChange={setSelectedGrade}>
                    <SelectTrigger data-testid="select-grade">
                      <SelectValue placeholder="Select grade" />
                    </SelectTrigger>
                    <SelectContent>
                      {gradesData?.grades.map(grade => (
                        <SelectItem key={grade} value={grade}>
                          {gradeLabels[grade] || `Grade ${grade}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Subjects</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {subjectsLoading ? (
                  <>
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </>
                ) : subjectsData?.subjects.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No subjects available for this grade</p>
                ) : (
                  subjectsData?.subjects.map(subject => {
                    const Icon = subjectIcons[subject] || BookOpen;
                    return (
                      <Button
                        key={subject}
                        variant={selectedSubject === subject ? 'default' : 'outline'}
                        className={cn(
                          'w-full justify-start gap-2',
                          selectedSubject === subject && subjectColors[subject]
                        )}
                        onClick={() => handleSubjectSelect(subject)}
                        data-testid={`button-subject-${subject.toLowerCase()}`}
                      >
                        <Icon className="h-4 w-4" />
                        {subject}
                      </Button>
                    );
                  })
                )}
              </CardContent>
            </Card>

            {selectedSubject && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Topics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {topicsLoading ? (
                    <>
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </>
                  ) : (
                    <>
                      <Button
                        variant={selectedTopic === '' ? 'secondary' : 'ghost'}
                        className="w-full justify-start text-sm"
                        onClick={() => handleTopicSelect('')}
                        data-testid="button-topic-all"
                      >
                        All Topics
                      </Button>
                      {topicsData?.topics.map(topic => (
                        <Button
                          key={topic}
                          variant={selectedTopic === topic ? 'secondary' : 'ghost'}
                          className="w-full justify-start text-sm"
                          onClick={() => handleTopicSelect(topic)}
                          data-testid={`button-topic-${topic.toLowerCase().replace(/\s+/g, '-')}`}
                        >
                          {topic}
                        </Button>
                      ))}
                    </>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          <div className="lg:col-span-2">
            {!selectedSubject ? (
              <Card className="h-[400px] flex items-center justify-center">
                <CardContent className="text-center">
                  <BookOpen className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-xl font-semibold mb-2">Select a Subject</h3>
                  <p className="text-muted-foreground">
                    Choose a grade and subject to browse available lessons
                  </p>
                </CardContent>
              </Card>
            ) : lessonsLoading ? (
              <Card>
                <CardHeader>
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-32" />
                </CardHeader>
                <CardContent className="space-y-3">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {gradeLabels[selectedGrade] || `Grade ${selectedGrade}`} - {selectedSubject}
                        {selectedTopic && ` / ${selectedTopic}`}
                      </CardTitle>
                      <CardDescription>
                        {filteredLessons.length} lessons available
                      </CardDescription>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground mb-1">
                        {completedCount} of {filteredLessons.length} completed
                      </div>
                      <Progress value={progressPercentage} className="w-32 h-2" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 max-h-[600px] overflow-y-auto">
                  {filteredLessons.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No lessons available for this selection
                    </div>
                  ) : (
                    filteredLessons.map((lesson, index) => (
                      <div
                        key={lesson.id}
                        className={cn(
                          'p-4 border rounded-lg cursor-pointer transition-all hover:shadow-md',
                          selectedLesson?.id === lesson.id
                            ? 'border-primary bg-primary/5'
                            : 'hover:border-primary/50'
                        )}
                        onClick={() => handleLessonSelect(lesson)}
                        data-testid={`card-lesson-${lesson.id}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 mt-1">
                            {getStatusIcon(lesson.status)}
                          </div>
                          <div className="flex-grow min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-muted-foreground">
                                Lesson {index + 1}
                              </span>
                              {lesson.status && getStatusBadge(lesson.status)}
                            </div>
                            <h4 className="font-medium truncate">{lesson.lessonTitle}</h4>
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {lesson.learningGoal}
                            </p>
                          </div>
                          <div className="flex-shrink-0 text-right">
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {lesson.estimatedMinutes} min
                            </div>
                            <div className="flex items-center gap-0.5 mt-1">
                              {[...Array(5)].map((_, i) => (
                                <Star
                                  key={i}
                                  className={cn(
                                    'h-3 w-3',
                                    i < (lesson.difficultyLevel || 1)
                                      ? 'text-yellow-400 fill-yellow-400'
                                      : 'text-gray-200'
                                  )}
                                />
                              ))}
                            </div>
                          </div>
                          <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          <div className="lg:col-span-1">
            {selectedLesson ? (
              <Card className="sticky top-4">
                <CardHeader>
                  <Badge className={subjectColors[selectedLesson.subject]}>
                    {selectedLesson.subject}
                  </Badge>
                  <CardTitle className="text-lg mt-2">{selectedLesson.lessonTitle}</CardTitle>
                  <CardDescription>{selectedLesson.topic}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {lessonDetailLoading ? (
                    <>
                      <Skeleton className="h-20 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </>
                  ) : (
                    <>
                      <div>
                        <h4 className="font-medium text-sm mb-1">Learning Goal</h4>
                        <p className="text-sm text-muted-foreground">
                          {lessonDetailData?.lesson?.learningGoal || selectedLesson.learningGoal}
                        </p>
                      </div>

                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Duration</span>
                        <span className="font-medium flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {selectedLesson.estimatedMinutes} minutes
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Difficulty</span>
                        <div className="flex items-center gap-0.5">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              className={cn(
                                'h-3.5 w-3.5',
                                i < (selectedLesson.difficultyLevel || 1)
                                  ? 'text-yellow-400 fill-yellow-400'
                                  : 'text-gray-200'
                              )}
                            />
                          ))}
                        </div>
                      </div>

                      {lessonDetailData?.lesson?.tutorIntroduction && (
                        <div>
                          <h4 className="font-medium text-sm mb-1">Preview</h4>
                          <p className="text-sm text-muted-foreground italic">
                            "{lessonDetailData.lesson.tutorIntroduction}"
                          </p>
                        </div>
                      )}

                      <Button
                        className="w-full"
                        size="lg"
                        onClick={handleStartLesson}
                        disabled={startLessonMutation.isPending}
                        data-testid="button-start-lesson"
                      >
                        {startLessonMutation.isPending ? (
                          'Starting...'
                        ) : selectedLesson.status === 'completed' ? (
                          <>
                            <PlayCircle className="h-4 w-4 mr-2" />
                            Review Lesson
                          </>
                        ) : selectedLesson.status === 'in_progress' ? (
                          <>
                            <PlayCircle className="h-4 w-4 mr-2" />
                            Continue Lesson
                          </>
                        ) : (
                          <>
                            <PlayCircle className="h-4 w-4 mr-2" />
                            Start Lesson
                          </>
                        )}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="sticky top-4">
                <CardContent className="py-12 text-center">
                  <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-medium mb-2">Select a Lesson</h3>
                  <p className="text-sm text-muted-foreground">
                    Click on a lesson to see details and start learning
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
