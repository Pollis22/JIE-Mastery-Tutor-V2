import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation, useParams } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { NavigationHeader } from "@/components/navigation-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef } from "react";
import { Sparkles, Plus, Trash2, Upload, FileText, X } from "lucide-react";

interface ChildDashboard {
  child: {
    id: string;
    childName: string;
    childAge: number | null;
    gradeLevel: string | null;
    avatarEmoji: string | null;
    photoUrl: string | null;
    studentId: string | null;
    color: string | null;
  };
  courses: Array<{ id: string; courseName: string; teacherName: string | null; color: string | null; isActive: boolean }>;
  pendingTasks: Array<{ id: string; title: string; dueDate: string | null; priority: string | null; xpReward: number | null; status: string }>;
  completedTasksThisWeek: number;
  achievements: Array<{ id: string; achievementType: string; achievementName: string; achievementEmoji: string | null; earnedAt: string }>;
  streak: number;
  streakBadges: Array<{ days: number; name: string; emoji: string }>;
  totalXp: number;
  level: number;
  goals: Array<{ id: string; goalType: string; targetValue: number; currentValue: number | null; isActive: boolean }>;
  upcomingEvents: Array<{ id: string; title: string; startDate: string; eventType: string | null; courseId: string | null }>;
  engagement: { score: number; riskLevel: string };
  isSummerMode: boolean;
}

function getGradeCategory(grade: string | null): "k5" | "68" | "912" {
  if (!grade) return "68";
  const g = grade.toLowerCase();
  if (g.includes("k") || g.includes("1st") || g.includes("2nd") || g.includes("3rd") || g.includes("4th") || g.includes("5th")) return "k5";
  if (g.includes("6") || g.includes("7") || g.includes("8")) return "68";
  return "912";
}

const COURSE_COLORS = ["#C5050C", "#2563eb", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#be185d", "#854d0e"];

export default function FamilyChildDashboardPage() {
  const { user } = useAuth();
  const params = useParams<{ childId: string }>();
  const childId = params.childId;
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Course dialog state (2-step)
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [addCourseStep, setAddCourseStep] = useState<"info" | "syllabus">("info");
  const [newCourse, setNewCourse] = useState({ courseName: "", teacherName: "", schoolName: "" });
  const [newlyCreatedCourseId, setNewlyCreatedCourseId] = useState<string | null>(null);
  const [syllabusText, setSyllabusText] = useState("");
  const [syllabusUploadMode, setSyllabusUploadMode] = useState<"paste" | "file">("paste");
  const [syllabusFile, setSyllabusFile] = useState<File | null>(null);
  const syllabusFileRef = useRef<HTMLInputElement>(null);

  // Syllabus upload on existing course
  const [showSyllabusDialog, setShowSyllabusDialog] = useState(false);
  const [selectedCourseForSyllabus, setSelectedCourseForSyllabus] = useState<string | null>(null);
  const [existingSyllabusText, setExistingSyllabusText] = useState("");
  const [existingSyllabusUploadMode, setExistingSyllabusUploadMode] = useState<"paste" | "file">("paste");
  const [existingSyllabusFile, setExistingSyllabusFile] = useState<File | null>(null);
  const existingSyllabusFileRef = useRef<HTMLInputElement>(null);

  // Event/Assignment dialog state
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [eventForm, setEventForm] = useState({ courseId: "", title: "", eventType: "assignment", startDate: "", description: "", priority: "medium" });

  // Goal dialog state
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [newGoal, setNewGoal] = useState({ goalType: "sessions_per_week", targetValue: "3" });

  const dashboardKey = `/api/family-academic/children/${childId}/dashboard`;

  const { data, isLoading } = useQuery<ChildDashboard>({
    queryKey: [dashboardKey],
    enabled: !!user && !!childId,
  });

  // ━━━ Mutations ━━━

  const completeTaskMutation = useMutation({
    mutationFn: (taskId: string) => apiRequest("POST", `/api/family-academic/tasks/${taskId}/complete`, {}),
    onSuccess: async (res) => {
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: [dashboardKey] });
      toast({
        title: `+${result.xpAwarded} XP!`,
        description: `Total: ${result.totalXp} XP — Level ${result.level} Scholar`,
      });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const addCourseMutation = useMutation({
    mutationFn: (course: any) => apiRequest("POST", `/api/family-academic/children/${childId}/courses`, course),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [dashboardKey] });
      setShowAddCourse(false);
      setAddCourseStep("info");
      setNewCourse({ courseName: "", teacherName: "", schoolName: "", color: COURSE_COLORS[0] });
      toast({ title: "Course added!" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteCourseMutation = useMutation({
    mutationFn: (courseId: string) => apiRequest("DELETE", `/api/family-academic/courses/${courseId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [dashboardKey] });
      toast({ title: "Course removed" });
    },
  });

  // File upload mutation — uploads to /api/documents/upload so it appears in Study Materials
  const uploadFileMutation = useMutation({
    mutationFn: async ({ file, courseId }: { file: File; courseId: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", `Syllabus: ${file.name}`);
      formData.append("subject", "syllabus");
      const uploadRes = await fetch("/api/documents/upload", { method: "POST", body: formData, credentials: "include" });
      if (!uploadRes.ok) throw new Error("File upload failed");
      const uploadData = await uploadRes.json();

      const contentRes = await fetch(`/api/documents/${uploadData.id}/content`, { credentials: "include" });
      if (!contentRes.ok) throw new Error("Could not read uploaded file");
      const contentData = await contentRes.json();
      const extractedText = contentData.content || contentData.text || "";

      if (!extractedText || extractedText.length < 20) {
        throw new Error("Could not extract enough text from the file. Try pasting the syllabus text instead.");
      }

      const parseRes = await apiRequest("POST", `/api/family-academic/courses/${courseId}/syllabus`, { syllabusText: extractedText });
      return parseRes.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [dashboardKey] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setShowSyllabusDialog(false);
      setShowAddCourse(false);
      setAddCourseStep("info");
      setSyllabusFile(null);
      setExistingSyllabusFile(null);
      toast({ title: "Syllabus processed!", description: `Created ${data.eventsCreated} events, ${data.tasksCreated} study tasks. File saved to Study Materials.` });
    },
    onError: (err: Error) => toast({ title: "Error processing file", description: err.message, variant: "destructive" }),
  });

  const processSyllabusMutation = useMutation({
    mutationFn: async ({ courseId, syllabusText: text }: { courseId: string; syllabusText: string }) => {
      const res = await apiRequest("POST", `/api/family-academic/courses/${courseId}/syllabus`, { syllabusText: text });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [dashboardKey] });
      setShowSyllabusDialog(false);
      setExistingSyllabusText("");
      setSyllabusText("");
      setShowAddCourse(false);
      setAddCourseStep("info");
      toast({
        title: "Syllabus processed!",
        description: `Created ${data.eventsCreated} events, ${data.tasksCreated} study tasks, and ${data.remindersCreated} reminders.`,
      });
    },
    onError: (err: Error) => toast({ title: "Error processing syllabus", description: err.message, variant: "destructive" }),
  });

  const createEventMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/family-academic/events", data);
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [dashboardKey] });
      setShowAddEvent(false);
      setEventForm({ courseId: "", title: "", eventType: "assignment", startDate: "", description: "", priority: "medium" });
      const taskMsg = result.autoTasksCreated > 0 ? ` + ${result.autoTasksCreated} study tasks auto-created` : "";
      toast({ title: "Event added!" + taskMsg });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const addGoalMutation = useMutation({
    mutationFn: (goal: any) => apiRequest("POST", "/api/family-academic/goals", { ...goal, childId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [dashboardKey] });
      setShowAddGoal(false);
      toast({ title: "Goal set!" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (isLoading || !data) {
    return (
      <>
        <NavigationHeader />
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="animate-pulse text-lg text-primary">Loading dashboard...</div>
        </div>
      </>
    );
  }

  const { child, courses, pendingTasks, achievements, streak, streakBadges, totalXp, level, goals, upcomingEvents, engagement, isSummerMode } = data;
  const gradeCategory = getGradeCategory(child.gradeLevel);

  const todayStr = new Date().toISOString().split("T")[0];
  const todayTasks = pendingTasks.filter((t) => t.dueDate === todayStr);
  const overdueTasks = pendingTasks.filter((t) => t.dueDate && t.dueDate < todayStr);
  const upcomingTasks = pendingTasks.filter((t) => !t.dueDate || t.dueDate > todayStr);

  // Theme based on grade category
  const themes = {
    k5: {
      bg: "from-yellow-50 via-orange-50 to-pink-50",
      accent: "text-orange-600",
      button: "bg-orange-500 hover:bg-orange-600",
      card: "border-orange-200",
      header: "Welcome back, superstar! 🌟",
      taskLabel: "Today's Missions",
      streakLabel: "🔥 Day Streak!",
    },
    "68": {
      bg: "from-primary/5 via-background to-primary/10",
      accent: "text-blue-600",
      button: "bg-blue-600 hover:bg-blue-700",
      card: "border-blue-200",
      header: `Hey ${child.childName}! Ready to level up?`,
      taskLabel: "Today's Tasks",
      streakLabel: "Streak",
    },
    "912": {
      bg: "from-gray-50 via-slate-50 to-zinc-50",
      accent: "text-slate-700",
      button: "bg-slate-700 hover:bg-slate-800",
      card: "border-slate-200",
      header: `${child.childName}'s Academic Dashboard`,
      taskLabel: "Due Today",
      streakLabel: "Study Streak",
    },
  };
  const theme = themes[gradeCategory];

  return (
    <>
      <NavigationHeader />
      <div className={`min-h-screen bg-gradient-to-br ${theme.bg}`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
            <div className="flex items-center gap-4">
              {child.photoUrl ? (
                <img src={child.photoUrl} alt={child.childName} className="w-14 h-14 rounded-full object-cover border-2" style={{ borderColor: child.color || "#6366f1" }} />
              ) : (
                <div className="text-5xl">{child.avatarEmoji || "🧒"}</div>
              )}
              <div>
                <h1 className={`text-2xl font-bold ${theme.accent}`}>{theme.header}</h1>
                <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                  {child.gradeLevel && <Badge variant="secondary">{child.gradeLevel}</Badge>}
                  <Badge variant="outline">Level {level} Scholar</Badge>
                  {isSummerMode && <Badge className="bg-yellow-100 text-yellow-800">☀️ Summer Mode</Badge>}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setLocation("/family")}>← Study Tracker</Button>
              <Button className={theme.button} onClick={() => setLocation(child.studentId ? `/tutor?student=${child.studentId}` : "/tutor")}>
                🎓 Study with JIE
              </Button>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <Card className={`bg-white/80 backdrop-blur ${theme.card}`}>
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold">
                  {streak > 0 ? (streakBadges.length > 0 ? streakBadges[streakBadges.length - 1].emoji : "🔥") : "💤"}
                </div>
                <div className={`text-2xl font-bold ${theme.accent}`}>{streak}</div>
                <div className="text-xs text-gray-500">{theme.streakLabel}</div>
              </CardContent>
            </Card>
            <Card className={`bg-white/80 backdrop-blur ${theme.card}`}>
              <CardContent className="p-4 text-center">
                <div className="text-3xl">⚡</div>
                <div className={`text-2xl font-bold ${theme.accent}`}>{totalXp}</div>
                <div className="text-xs text-gray-500">Total XP</div>
              </CardContent>
            </Card>
            <Card className={`bg-white/80 backdrop-blur ${theme.card}`}>
              <CardContent className="p-4 text-center">
                <div className="text-3xl">📋</div>
                <div className={`text-2xl font-bold ${theme.accent}`}>{pendingTasks.length}</div>
                <div className="text-xs text-gray-500">Tasks to do</div>
              </CardContent>
            </Card>
            <Card className={`bg-white/80 backdrop-blur ${theme.card}`}>
              <CardContent className="p-4 text-center">
                <div className="text-3xl">📊</div>
                <div className={`text-2xl font-bold ${theme.accent}`}>{engagement.score}</div>
                <div className="text-xs text-gray-500">Engagement</div>
              </CardContent>
            </Card>
          </div>

          {/* XP Level Progress */}
          <Card className={`bg-white/80 backdrop-blur mb-6 ${theme.card}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Level {level} Scholar</span>
                <span className="text-sm text-gray-500">{totalXp} / {level * 100 + totalXp - (totalXp % (level * 100))} XP to Level {level + 1}</span>
              </div>
              <Progress
                value={((totalXp % (level * 100)) / (level * 100)) * 100}
                className="h-3"
              />
            </CardContent>
          </Card>

          <Tabs defaultValue="tasks" className="space-y-6">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="tasks">
                {gradeCategory === "k5" ? "🎯 Missions" : "📋 Tasks"}
              </TabsTrigger>
              <TabsTrigger value="courses">📚 Courses</TabsTrigger>
              <TabsTrigger value="calendar">📅 Calendar</TabsTrigger>
              <TabsTrigger value="badges">🏆 Badges</TabsTrigger>
              <TabsTrigger value="goals">🎯 Goals</TabsTrigger>
            </TabsList>

            {/* Tasks Tab */}
            <TabsContent value="tasks" className="space-y-4">
              {overdueTasks.length > 0 && (
                <div>
                  <h3 className="font-semibold text-red-600 mb-2">⚠️ Overdue</h3>
                  {overdueTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      gradeCategory={gradeCategory}
                      onComplete={() => completeTaskMutation.mutate(task.id)}
                      isPending={completeTaskMutation.isPending}
                    />
                  ))}
                </div>
              )}

              {todayTasks.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-700 mb-2">{theme.taskLabel}</h3>
                  {todayTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      gradeCategory={gradeCategory}
                      onComplete={() => completeTaskMutation.mutate(task.id)}
                      isPending={completeTaskMutation.isPending}
                    />
                  ))}
                </div>
              )}

              {upcomingTasks.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-500 mb-2">Coming Up</h3>
                  {upcomingTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      gradeCategory={gradeCategory}
                      onComplete={() => completeTaskMutation.mutate(task.id)}
                      isPending={completeTaskMutation.isPending}
                    />
                  ))}
                </div>
              )}

              {pendingTasks.length === 0 && (
                <Card className="bg-white/80">
                  <CardContent className="p-8 text-center">
                    <div className="text-4xl mb-2">{gradeCategory === "k5" ? "🎉" : "✅"}</div>
                    <p className="text-gray-500">
                      {gradeCategory === "k5" ? "All missions complete! You're amazing!" : "No tasks pending. Great job!"}
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Courses Tab */}
            <TabsContent value="courses" className="space-y-4">
              <div className="flex justify-end">
                <Button className={theme.button} onClick={() => { setShowAddCourse(true); setAddCourseStep("info"); }}>
                  <Plus className="h-4 w-4 mr-1" /> Add Course
                </Button>
              </div>

              {courses.length === 0 ? (
                <Card className="bg-white/80">
                  <CardContent className="p-8 text-center">
                    <div className="text-4xl mb-2">📚</div>
                    <p className="text-gray-500 mb-4">No courses yet. Add your classes to get started!</p>
                    <p className="text-sm text-gray-400">Tip: You can paste a syllabus when adding a course — AI will extract all dates automatically.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {courses.map((course) => (
                    <Card key={course.id} className="bg-white/80 relative overflow-hidden" style={{ borderLeft: `4px solid ${course.color || "#6366f1"}` }}>
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-semibold">{course.courseName}</h4>
                            {course.teacherName && <p className="text-sm text-gray-500">{course.teacherName}</p>}
                          </div>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteCourseMutation.mutate(course.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => { setSelectedCourseForSyllabus(course.id); setShowSyllabusDialog(true); }}
                          >
                            <Sparkles className="h-4 w-4 mr-1" /> Upload Syllabus
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => { setEventForm(f => ({ ...f, courseId: course.id })); setShowAddEvent(true); }}
                          >
                            <Plus className="h-4 w-4 mr-1" /> Add Assignment
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Calendar Tab — Upcoming Events */}
            <TabsContent value="calendar" className="space-y-4">
              <div className="flex justify-end">
                <Button className={theme.button} onClick={() => setShowAddEvent(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Add Event / Assignment
                </Button>
              </div>

              {upcomingEvents.length === 0 ? (
                <Card className="bg-white/80">
                  <CardContent className="p-8 text-center">
                    <div className="text-4xl mb-2">📅</div>
                    <p className="text-gray-500">No upcoming events. Upload a syllabus or add assignments manually.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {upcomingEvents.map((event) => {
                    const eventCourse = courses.find(c => c.id === event.courseId);
                    const isOverdue = event.startDate < todayStr;
                    const isToday = event.startDate === todayStr;
                    return (
                      <Card key={event.id} className={`bg-white/80 ${isOverdue ? "border-red-300" : isToday ? "border-amber-300" : ""}`}>
                        <CardContent className="p-4 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {eventCourse && (
                              <div className="w-2 h-8 rounded-full" style={{ background: eventCourse.color || "#6366f1" }} />
                            )}
                            <div>
                              <span className="font-medium">{event.title}</span>
                              <div className="flex items-center gap-2 mt-1">
                                {event.eventType && (
                                  <Badge variant="secondary" className="text-xs">{event.eventType}</Badge>
                                )}
                                {eventCourse && (
                                  <span className="text-xs text-gray-500">{eventCourse.courseName}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className={`text-sm font-medium ${isOverdue ? "text-red-600" : isToday ? "text-amber-600" : "text-gray-500"}`}>
                              {isOverdue ? "Overdue" : isToday ? "Today" : event.startDate}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Badges Tab */}
            <TabsContent value="badges">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { days: 3, name: "On Fire!", emoji: "🔥" },
                  { days: 7, name: "Star Learner", emoji: "⭐" },
                  { days: 14, name: "Trophy Winner", emoji: "🏆" },
                  { days: 30, name: "Royal Scholar", emoji: "👑" },
                ].map((badge) => (
                  <Card
                    key={badge.days}
                    className={`text-center transition-all ${
                      streak >= badge.days ? "bg-white shadow-md" : "bg-gray-100 opacity-50"
                    }`}
                  >
                    <CardContent className="p-4">
                      <div className="text-4xl mb-1">{badge.emoji}</div>
                      <div className="font-semibold text-sm">{badge.name}</div>
                      <div className="text-xs text-gray-500">{badge.days}-day streak</div>
                    </CardContent>
                  </Card>
                ))}

                {achievements.map((a) => (
                  <Card key={a.id} className="text-center bg-white shadow-md">
                    <CardContent className="p-4">
                      <div className="text-4xl mb-1">{a.achievementEmoji || "🏅"}</div>
                      <div className="font-semibold text-sm">{a.achievementName}</div>
                      <div className="text-xs text-gray-500">
                        {new Date(a.earnedAt).toLocaleDateString()}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* Goals Tab */}
            <TabsContent value="goals" className="space-y-4">
              <div className="flex justify-end">
                <Button className={theme.button} onClick={() => setShowAddGoal(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Set Goal
                </Button>
              </div>

              {goals.length === 0 ? (
                <Card className="bg-white/80">
                  <CardContent className="p-8 text-center">
                    <div className="text-4xl mb-2">🎯</div>
                    <p className="text-gray-500">No goals set yet. Set targets to track progress!</p>
                  </CardContent>
                </Card>
              ) : (
                goals.map((goal) => (
                  <Card key={goal.id} className="bg-white/80">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium capitalize">
                          {goal.goalType.replace(/_/g, " ")}
                        </span>
                        <span className="text-sm text-gray-500">
                          {goal.currentValue ?? 0} / {goal.targetValue}
                        </span>
                      </div>
                      <Progress value={((goal.currentValue ?? 0) / goal.targetValue) * 100} className="h-2" />
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* ━━━ DIALOGS ━━━ */}

      {/* Add Course Dialog — 2-step: course info → optional syllabus */}
      <Dialog open={showAddCourse} onOpenChange={(open) => { setShowAddCourse(open); if (!open) { setAddCourseStep("info"); setSyllabusText(""); setSyllabusFile(null); setSyllabusUploadMode("paste"); } }}>
        <DialogContent className={addCourseStep === "syllabus" ? "max-w-2xl" : ""}>
          <DialogHeader>
            <DialogTitle>{addCourseStep === "info" ? "Add a Course" : "Upload Syllabus (Optional)"}</DialogTitle>
            <DialogDescription>
              {addCourseStep === "info"
                ? "Add a class — then optionally upload a syllabus for your tutor to extract all dates."
                : "Upload a file or paste your syllabus text. Your tutor will extract all exams, assignments, quizzes, and deadlines automatically."}
            </DialogDescription>
          </DialogHeader>

          {addCourseStep === "info" ? (
            <>
              <div className="space-y-4">
                <div>
                  <Label>Course Name *</Label>
                  <Input
                    value={newCourse.courseName}
                    onChange={(e) => setNewCourse({ ...newCourse, courseName: e.target.value })}
                    placeholder="e.g., Math, English, Science"
                  />
                </div>
                <div>
                  <Label>Teacher Name (optional)</Label>
                  <Input
                    value={newCourse.teacherName}
                    onChange={(e) => setNewCourse({ ...newCourse, teacherName: e.target.value })}
                    placeholder="e.g., Mrs. Smith"
                  />
                </div>
              </div>
              <DialogFooter>
                <div className="flex w-full justify-between gap-2">
                  <Button variant="outline" onClick={() => setShowAddCourse(false)}>Cancel</Button>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => addCourseMutation.mutate(newCourse)}
                      disabled={!newCourse.courseName || addCourseMutation.isPending}
                    >
                      {addCourseMutation.isPending ? "Adding..." : "Skip Syllabus"}
                    </Button>
                    <Button
                      onClick={async () => {
                        if (!newCourse.courseName) return;
                        try {
                          const res = await apiRequest("POST", `/api/family-academic/children/${childId}/courses`, newCourse);
                          const created = await res.json();
                          queryClient.invalidateQueries({ queryKey: [dashboardKey] });
                          setNewlyCreatedCourseId(created.id);
                          setAddCourseStep("syllabus");
                          toast({ title: "Course created! Now add your syllabus." });
                        } catch (err: any) {
                          toast({ title: "Error", description: err.message, variant: "destructive" });
                        }
                      }}
                      disabled={!newCourse.courseName}
                    >
                      <Sparkles className="h-4 w-4 mr-1" /> Next: Add Syllabus
                    </Button>
                  </div>
                </div>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="space-y-4">
                {/* Toggle: Paste vs Upload */}
                <div className="flex gap-2">
                  <Button variant={syllabusUploadMode === "paste" ? "default" : "outline"} size="sm" onClick={() => setSyllabusUploadMode("paste")}>
                    <FileText className="h-4 w-4 mr-1" /> Paste Text
                  </Button>
                  <Button variant={syllabusUploadMode === "file" ? "default" : "outline"} size="sm" onClick={() => setSyllabusUploadMode("file")}>
                    <Upload className="h-4 w-4 mr-1" /> Upload File
                  </Button>
                </div>

                {syllabusUploadMode === "paste" ? (
                  <>
                    <Textarea
                      value={syllabusText}
                      onChange={e => setSyllabusText(e.target.value)}
                      placeholder="Paste your full syllabus text here — include all dates, assignments, exams, and deadlines..."
                      className="min-h-[250px] font-mono text-sm"
                    />
                    {syllabusText && (
                      <p className="text-xs text-muted-foreground">{syllabusText.length.toLocaleString()} characters</p>
                    )}
                  </>
                ) : (
                  <div className="space-y-3">
                    <div
                      className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => syllabusFileRef.current?.click()}
                    >
                      {syllabusFile ? (
                        <div className="flex items-center justify-center gap-2">
                          <FileText className="h-6 w-6 text-primary" />
                          <span className="font-medium">{syllabusFile.name}</span>
                          <span className="text-sm text-muted-foreground">({(syllabusFile.size / 1024).toFixed(0)} KB)</span>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); setSyllabusFile(null); }}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <Upload className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
                          <p className="font-medium">Click to upload syllabus</p>
                          <p className="text-sm text-muted-foreground mt-1">PDF, Word, PowerPoint, Text, Images, or Excel</p>
                        </>
                      )}
                    </div>
                    <input
                      ref={syllabusFileRef}
                      type="file"
                      className="hidden"
                      accept=".pdf,.docx,.doc,.pptx,.ppt,.txt,.csv,.xlsx,.xls,.png,.jpg,.jpeg,.gif,.bmp"
                      onChange={(e) => { if (e.target.files?.[0]) setSyllabusFile(e.target.files[0]); }}
                    />
                    <p className="text-xs text-muted-foreground">File will also be saved to your Study Materials for use during tutoring sessions.</p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <div className="flex w-full justify-between gap-2">
                  <Button variant="outline" onClick={() => { setShowAddCourse(false); setAddCourseStep("info"); setSyllabusText(""); setSyllabusFile(null); setNewCourse({ courseName: "", teacherName: "", schoolName: "" }); }}>
                    Skip — I'll Add Later
                  </Button>
                  {syllabusUploadMode === "paste" ? (
                    <Button
                      onClick={() => {
                        if (newlyCreatedCourseId && syllabusText) {
                          processSyllabusMutation.mutate({ courseId: newlyCreatedCourseId, syllabusText });
                        }
                      }}
                      disabled={!syllabusText || processSyllabusMutation.isPending}
                    >
                      {processSyllabusMutation.isPending ? (
                        <><Sparkles className="h-4 w-4 mr-1 animate-pulse" /> Processing...</>
                      ) : (
                        <><Sparkles className="h-4 w-4 mr-1" /> Process with Tutor</>
                      )}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => {
                        if (newlyCreatedCourseId && syllabusFile) {
                          uploadFileMutation.mutate({ file: syllabusFile, courseId: newlyCreatedCourseId });
                        }
                      }}
                      disabled={!syllabusFile || uploadFileMutation.isPending}
                    >
                      {uploadFileMutation.isPending ? (
                        <><Sparkles className="h-4 w-4 mr-1 animate-pulse" /> Uploading &amp; Processing...</>
                      ) : (
                        <><Upload className="h-4 w-4 mr-1" /> Upload &amp; Process</>
                      )}
                    </Button>
                  )}
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Syllabus Upload Dialog (for existing courses) */}
      <Dialog open={showSyllabusDialog} onOpenChange={(open) => { setShowSyllabusDialog(open); if (!open) { setExistingSyllabusText(""); setExistingSyllabusFile(null); setExistingSyllabusUploadMode("paste"); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload Syllabus</DialogTitle>
            <DialogDescription>
              Upload a file or paste your syllabus text. Your tutor will extract all dates, exams, assignments, and create your calendar and study plan automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button variant={existingSyllabusUploadMode === "paste" ? "default" : "outline"} size="sm" onClick={() => setExistingSyllabusUploadMode("paste")}>
                <FileText className="h-4 w-4 mr-1" /> Paste Text
              </Button>
              <Button variant={existingSyllabusUploadMode === "file" ? "default" : "outline"} size="sm" onClick={() => setExistingSyllabusUploadMode("file")}>
                <Upload className="h-4 w-4 mr-1" /> Upload File
              </Button>
            </div>

            {existingSyllabusUploadMode === "paste" ? (
              <>
                <Textarea
                  value={existingSyllabusText}
                  onChange={e => setExistingSyllabusText(e.target.value)}
                  placeholder="Paste your full syllabus text here..."
                  className="min-h-[280px] font-mono text-sm"
                />
                {existingSyllabusText && (
                  <p className="text-xs text-muted-foreground">{existingSyllabusText.length.toLocaleString()} characters</p>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <div
                  className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => existingSyllabusFileRef.current?.click()}
                >
                  {existingSyllabusFile ? (
                    <div className="flex items-center justify-center gap-2">
                      <FileText className="h-6 w-6 text-primary" />
                      <span className="font-medium">{existingSyllabusFile.name}</span>
                      <span className="text-sm text-muted-foreground">({(existingSyllabusFile.size / 1024).toFixed(0)} KB)</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); setExistingSyllabusFile(null); }}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
                      <p className="font-medium">Click to upload syllabus</p>
                      <p className="text-sm text-muted-foreground mt-1">PDF, Word, PowerPoint, Text, Images, or Excel</p>
                    </>
                  )}
                </div>
                <input
                  ref={existingSyllabusFileRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.docx,.doc,.pptx,.ppt,.txt,.csv,.xlsx,.xls,.png,.jpg,.jpeg,.gif,.bmp"
                  onChange={(e) => { if (e.target.files?.[0]) setExistingSyllabusFile(e.target.files[0]); }}
                />
                <p className="text-xs text-muted-foreground">File will also be saved to your Study Materials for use during tutoring sessions.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <div className="flex w-full justify-between gap-2">
              <Button variant="outline" onClick={() => { setShowSyllabusDialog(false); setExistingSyllabusText(""); setExistingSyllabusFile(null); }}>Cancel</Button>
              {existingSyllabusUploadMode === "paste" ? (
                <Button
                  onClick={() => {
                    if (selectedCourseForSyllabus && existingSyllabusText) {
                      processSyllabusMutation.mutate({ courseId: selectedCourseForSyllabus, syllabusText: existingSyllabusText });
                    }
                  }}
                  disabled={!existingSyllabusText || processSyllabusMutation.isPending}
                >
                  {processSyllabusMutation.isPending ? (
                    <><Sparkles className="h-4 w-4 mr-1 animate-pulse" /> Processing...</>
                  ) : (
                    <><Sparkles className="h-4 w-4 mr-1" /> Process with Tutor</>
                  )}
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    if (selectedCourseForSyllabus && existingSyllabusFile) {
                      uploadFileMutation.mutate({ file: existingSyllabusFile, courseId: selectedCourseForSyllabus });
                    }
                  }}
                  disabled={!existingSyllabusFile || uploadFileMutation.isPending}
                >
                  {uploadFileMutation.isPending ? (
                    <><Sparkles className="h-4 w-4 mr-1 animate-pulse" /> Uploading &amp; Processing...</>
                  ) : (
                    <><Upload className="h-4 w-4 mr-1" /> Upload &amp; Process</>
                  )}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Event / Assignment Dialog */}
      <Dialog open={showAddEvent} onOpenChange={setShowAddEvent}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Event / Assignment</DialogTitle>
            <DialogDescription>
              Add a test, assignment, project, or other deadline. Study tasks and reminders will be created automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input value={eventForm.title} onChange={e => setEventForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g., Chapter 5 Test, Science Project Due" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Course</Label>
                <Select value={eventForm.courseId || "none"} onValueChange={v => setEventForm(f => ({ ...f, courseId: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Course</SelectItem>
                    {courses.map(c => <SelectItem key={c.id} value={c.id}>{c.courseName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Type</Label>
                <Select value={eventForm.eventType} onValueChange={v => setEventForm(f => ({ ...f, eventType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="test">Test / Exam</SelectItem>
                    <SelectItem value="quiz">Quiz</SelectItem>
                    <SelectItem value="homework">Homework</SelectItem>
                    <SelectItem value="assignment">Assignment</SelectItem>
                    <SelectItem value="project">Project</SelectItem>
                    <SelectItem value="presentation">Presentation</SelectItem>
                    <SelectItem value="lab">Lab</SelectItem>
                    <SelectItem value="custom">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Due Date *</Label>
                <Input type="date" value={eventForm.startDate} onChange={e => setEventForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={eventForm.priority} onValueChange={v => setEventForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Textarea value={eventForm.description} onChange={e => setEventForm(f => ({ ...f, description: e.target.value }))} placeholder="Chapters covered, instructions, etc." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddEvent(false)}>Cancel</Button>
            <Button
              onClick={() => createEventMutation.mutate({
                childId,
                courseId: eventForm.courseId || null,
                title: eventForm.title,
                eventType: eventForm.eventType,
                startDate: eventForm.startDate,
                description: eventForm.description || null,
                priority: eventForm.priority,
                status: "upcoming",
              })}
              disabled={!eventForm.title || !eventForm.startDate || createEventMutation.isPending}
            >
              {createEventMutation.isPending ? "Creating..." : "Create Event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Goal Dialog */}
      <Dialog open={showAddGoal} onOpenChange={setShowAddGoal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Set a Study Goal</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Goal Type</Label>
              <Select value={newGoal.goalType} onValueChange={(v) => setNewGoal({ ...newGoal, goalType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sessions_per_week">Sessions per week</SelectItem>
                  <SelectItem value="minutes_per_day">Minutes per day</SelectItem>
                  <SelectItem value="tasks_per_week">Tasks per week</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Target</Label>
              <Input
                type="number"
                value={newGoal.targetValue}
                onChange={(e) => setNewGoal({ ...newGoal, targetValue: e.target.value })}
                min={1}
              />
            </div>
            <Button
              className="w-full"
              disabled={addGoalMutation.isPending}
              onClick={() => addGoalMutation.mutate({ goalType: newGoal.goalType, targetValue: parseInt(newGoal.targetValue) })}
            >
              {addGoalMutation.isPending ? "Setting..." : "Set Goal"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TaskCard({ task, gradeCategory, onComplete, isPending }: {
  task: { id: string; title: string; dueDate: string | null; priority: string | null; xpReward: number | null };
  gradeCategory: "k5" | "68" | "912";
  onComplete: () => void;
  isPending: boolean;
}) {
  const priorityColors: Record<string, string> = {
    high: "bg-red-100 text-red-700",
    medium: "bg-yellow-100 text-yellow-700",
    low: "bg-green-100 text-green-700",
  };

  return (
    <Card className="bg-white/90 mb-2">
      <CardContent className="p-4 flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{task.title}</span>
            {task.priority && (
              <Badge className={`text-xs ${priorityColors[task.priority] || ""}`}>{task.priority}</Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
            {task.dueDate && <span>Due: {task.dueDate}</span>}
            <span>⚡ {task.xpReward || 10} XP</span>
          </div>
        </div>
        <Button
          size="sm"
          onClick={onComplete}
          disabled={isPending}
          className={gradeCategory === "k5" ? "bg-green-500 hover:bg-green-600" : ""}
        >
          {gradeCategory === "k5" ? "✅ Done!" : "Complete"}
        </Button>
      </CardContent>
    </Card>
  );
}
