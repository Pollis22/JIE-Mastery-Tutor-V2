import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NavigationHeader } from "@/components/navigation-header";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, BookOpen, Calendar, CheckCircle2, Circle, Clock,
  Flame, Medal, Plus, Target, Trophy, AlertCircle, Star
} from "lucide-react";

interface ChildDashboard {
  child: {
    id: string;
    childName: string;
    childAge: number | null;
    gradeLevel: string | null;
    avatarEmoji: string | null;
    color: string | null;
  };
  styleMode: "elementary" | "middle" | "high";
  todayTasks: Task[];
  upcomingTasks: Task[];
  overdueTasks: Task[];
  upcomingEvents: CalEvent[];
  achievements: Achievement[];
  currentStreak: number;
  totalXp: number;
  level: number;
  goals: Goal[];
  engagement: { engagementScore: string; riskLevel: string; trend: string } | null;
}

interface Task {
  id: string;
  title: string;
  taskType: string | null;
  dueDate: string | null;
  priority: string | null;
  status: string;
  xpReward: number | null;
  estimatedMinutes: number | null;
  courseId: string | null;
}

interface CalEvent {
  id: string;
  title: string;
  eventType: string | null;
  startDate: string;
  startTime: string | null;
  status: string;
}

interface Achievement {
  id: string;
  achievementType: string;
  achievementName: string;
  achievementEmoji: string | null;
  earnedAt: string;
}

interface Goal {
  id: string;
  goalType: string;
  targetValue: number;
  currentValue: number;
}

interface Course {
  id: string;
  courseName: string;
  teacherName: string | null;
  schoolName: string | null;
  color: string | null;
}

function PriorityBadge({ priority }: { priority: string | null }) {
  if (!priority) return null;
  const colors: Record<string, string> = { high: "bg-red-100 text-red-700", medium: "bg-yellow-100 text-yellow-700", low: "bg-green-100 text-green-700" };
  return <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${colors[priority] || "bg-gray-100"}`}>{priority}</span>;
}

export default function FamilyChildDashboard() {
  const { id: childId } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [addCourseOpen, setAddCourseOpen] = useState(false);
  const [addGoalOpen, setAddGoalOpen] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [courseForm, setCourseForm] = useState({ courseName: "", teacherName: "", schoolName: "" });
  const [goalForm, setGoalForm] = useState({ goalType: "sessions_per_week", targetValue: "3" });
  const [taskForm, setTaskForm] = useState({ title: "", dueDate: "", priority: "medium", estimatedMinutes: "30", xpReward: "10" });

  const { data: dashboard, isLoading } = useQuery<ChildDashboard>({
    queryKey: [`/api/family-academic/children/${childId}/dashboard`],
    enabled: !!childId,
  });

  const { data: courses } = useQuery<Course[]>({
    queryKey: [`/api/family-academic/children/${childId}/courses`],
    enabled: !!childId,
  });

  const completeTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const res = await apiRequest("PUT", `/api/family-academic/tasks/${taskId}/complete`, {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/family-academic/children/${childId}/dashboard`] });
      queryClient.invalidateQueries({ queryKey: ["/api/family-academic/dashboard"] });
      toast({ title: `+${data.xpEarned} XP!`, description: data.newAchievements?.length > 0 ? `New badge: ${data.newAchievements[0].achievementName} ${data.newAchievements[0].achievementEmoji}` : undefined });
    },
  });

  const addCourseMutation = useMutation({
    mutationFn: async (data: { courseName: string; teacherName?: string; schoolName?: string }) => {
      const res = await apiRequest("POST", `/api/family-academic/children/${childId}/courses`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/family-academic/children/${childId}/courses`] });
      setAddCourseOpen(false);
      setCourseForm({ courseName: "", teacherName: "", schoolName: "" });
      toast({ title: "Course added!" });
    },
  });

  const addGoalMutation = useMutation({
    mutationFn: async (data: { goalType: string; targetValue: number }) => {
      const res = await apiRequest("POST", `/api/family-academic/children/${childId}/goals`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/family-academic/children/${childId}/dashboard`] });
      setAddGoalOpen(false);
      toast({ title: "Goal set!" });
    },
  });

  const addTaskMutation = useMutation({
    mutationFn: async (data: { title: string; dueDate?: string; priority?: string; estimatedMinutes?: number; xpReward?: number }) => {
      const res = await apiRequest("POST", `/api/family-academic/children/${childId}/tasks`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/family-academic/children/${childId}/dashboard`] });
      setAddTaskOpen(false);
      setTaskForm({ title: "", dueDate: "", priority: "medium", estimatedMinutes: "30", xpReward: "10" });
      toast({ title: "Task created!" });
    },
  });

  if (isLoading || !dashboard) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationHeader />
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  const { child, styleMode, todayTasks, upcomingTasks, overdueTasks, upcomingEvents, achievements, currentStreak, totalXp, level, goals, engagement } = dashboard;

  const isElementary = styleMode === "elementary";
  const bgGradient = isElementary ? "from-purple-50 via-pink-50 to-yellow-50" : "";

  return (
    <div className={`min-h-screen bg-background ${isElementary ? `bg-gradient-to-b ${bgGradient}` : ""}`}>
      <NavigationHeader />
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/family")}>
            <ArrowLeft className="h-4 w-4 mr-1" />Back
          </Button>
          <span className="text-4xl">{child.avatarEmoji || "🧒"}</span>
          <div>
            <h1 className={`font-bold ${isElementary ? "text-3xl" : "text-2xl"}`}>
              {isElementary ? `${child.childName}'s Dashboard` : child.childName}
            </h1>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              {child.gradeLevel && <span>Grade {child.gradeLevel}</span>}
              <span className="flex items-center gap-1"><Flame className="h-4 w-4 text-orange-500" />{currentStreak} day streak</span>
              <span>Level {level} ({totalXp} XP)</span>
            </div>
          </div>
          <div className="ml-auto">
            <Button onClick={() => setLocation(`/tutor?childId=${childId}`)}>
              <BookOpen className="h-4 w-4 mr-2" />{isElementary ? "Let's Study!" : "Study with JIE"}
            </Button>
          </div>
        </div>

        {/* XP Bar + Streak */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-2">
                <span className={`font-medium ${isElementary ? "text-lg" : "text-sm"}`}>
                  {isElementary ? `Level ${level} Scholar` : `Level ${level}`}
                </span>
                <Star className="h-4 w-4 text-yellow-500" />
              </div>
              <Progress value={(totalXp % 100)} className="h-3" />
              <div className="text-xs text-muted-foreground mt-1">{totalXp % 100}/100 XP to next level</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <Flame className={`h-8 w-8 mx-auto ${currentStreak > 0 ? "text-orange-500" : "text-gray-300"}`} />
              <div className={`font-bold ${isElementary ? "text-2xl" : "text-xl"}`}>{currentStreak}</div>
              <div className="text-xs text-muted-foreground">{isElementary ? "Days in a Row!" : "Day Streak"}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <div className="text-2xl font-bold">{engagement ? Number(engagement.engagementScore) : "—"}</div>
              <div className="text-xs text-muted-foreground">Engagement Score</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="tasks">
          <TabsList>
            <TabsTrigger value="tasks">{isElementary ? "Missions" : "Tasks"}</TabsTrigger>
            <TabsTrigger value="courses">Courses</TabsTrigger>
            <TabsTrigger value="goals">Goals</TabsTrigger>
            <TabsTrigger value="achievements">{isElementary ? "Badges" : "Achievements"}</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
          </TabsList>

          {/* Tasks Tab */}
          <TabsContent value="tasks" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">{isElementary ? "Today's Missions" : "Tasks"}</h2>
              <Dialog open={addTaskOpen} onOpenChange={setAddTaskOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4 mr-1" />Add Task</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Task</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div><Label>Title</Label><Input value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} /></div>
                    <div className="grid grid-cols-2 gap-4">
                      <div><Label>Due Date</Label><Input type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })} /></div>
                      <div>
                        <Label>Priority</Label>
                        <Select value={taskForm.priority} onValueChange={(v) => setTaskForm({ ...taskForm, priority: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button onClick={() => addTaskMutation.mutate({ title: taskForm.title, dueDate: taskForm.dueDate || undefined, priority: taskForm.priority, estimatedMinutes: parseInt(taskForm.estimatedMinutes), xpReward: parseInt(taskForm.xpReward) })} disabled={!taskForm.title} className="w-full">Add Task</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {/* Overdue */}
            {overdueTasks.length > 0 && (
              <Card className="border-red-200 bg-red-50/50">
                <CardHeader className="pb-2"><CardTitle className="text-sm text-red-600 flex items-center gap-2"><AlertCircle className="h-4 w-4" />Overdue</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {overdueTasks.map((t) => (
                    <TaskRow key={t.id} task={t} onComplete={() => completeTaskMutation.mutate(t.id)} elementary={isElementary} />
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Today */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{isElementary ? "Today's Missions" : "Due Today"}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {todayTasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">{isElementary ? "No missions today! You're all caught up!" : "No tasks due today."}</p>
                ) : todayTasks.map((t) => (
                  <TaskRow key={t.id} task={t} onComplete={() => completeTaskMutation.mutate(t.id)} elementary={isElementary} />
                ))}
              </CardContent>
            </Card>

            {/* Upcoming */}
            {upcomingTasks.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Coming Up</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {upcomingTasks.map((t) => (
                    <TaskRow key={t.id} task={t} onComplete={() => completeTaskMutation.mutate(t.id)} elementary={isElementary} />
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Courses Tab */}
          <TabsContent value="courses" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Courses</h2>
              <Dialog open={addCourseOpen} onOpenChange={setAddCourseOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4 mr-1" />Add Course</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Course</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div><Label>Course Name</Label><Input value={courseForm.courseName} onChange={(e) => setCourseForm({ ...courseForm, courseName: e.target.value })} placeholder="e.g. Algebra 1" /></div>
                    <div><Label>Teacher</Label><Input value={courseForm.teacherName} onChange={(e) => setCourseForm({ ...courseForm, teacherName: e.target.value })} placeholder="Optional" /></div>
                    <div><Label>School</Label><Input value={courseForm.schoolName} onChange={(e) => setCourseForm({ ...courseForm, schoolName: e.target.value })} placeholder="Optional" /></div>
                    <Button onClick={() => addCourseMutation.mutate({ courseName: courseForm.courseName, teacherName: courseForm.teacherName || undefined, schoolName: courseForm.schoolName || undefined })} disabled={!courseForm.courseName} className="w-full">Add Course</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            {(!courses || courses.length === 0) ? (
              <Card className="p-6 text-center text-muted-foreground">No courses yet. Add your child's classes to get started.</Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {courses.map((c) => (
                  <Card key={c.id}>
                    <CardContent className="py-4">
                      <h3 className="font-medium">{c.courseName}</h3>
                      {c.teacherName && <p className="text-sm text-muted-foreground">{c.teacherName}</p>}
                      {c.schoolName && <p className="text-xs text-muted-foreground">{c.schoolName}</p>}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Goals Tab */}
          <TabsContent value="goals" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Study Goals</h2>
              <Dialog open={addGoalOpen} onOpenChange={setAddGoalOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4 mr-1" />Set Goal</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Set Study Goal</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Goal Type</Label>
                      <Select value={goalForm.goalType} onValueChange={(v) => setGoalForm({ ...goalForm, goalType: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sessions_per_week">Sessions per Week</SelectItem>
                          <SelectItem value="minutes_per_day">Minutes per Day</SelectItem>
                          <SelectItem value="tasks_per_week">Tasks per Week</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label>Target</Label><Input type="number" value={goalForm.targetValue} onChange={(e) => setGoalForm({ ...goalForm, targetValue: e.target.value })} /></div>
                    <Button onClick={() => addGoalMutation.mutate({ goalType: goalForm.goalType, targetValue: parseInt(goalForm.targetValue) })} className="w-full">Set Goal</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            {goals.length === 0 ? (
              <Card className="p-6 text-center text-muted-foreground">No goals set yet. Set weekly study goals to track progress.</Card>
            ) : (
              goals.map((g) => (
                <Card key={g.id}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4 text-primary" />
                        <span className="font-medium">{g.goalType.replace(/_/g, " ")}</span>
                      </div>
                      <span className="text-sm font-bold">{g.currentValue}/{g.targetValue}</span>
                    </div>
                    <Progress value={Math.min(100, (g.currentValue / Math.max(1, g.targetValue)) * 100)} className="h-3" />
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Achievements Tab */}
          <TabsContent value="achievements" className="space-y-4">
            <h2 className="text-lg font-semibold">{isElementary ? "Badge Collection" : "Achievements"}</h2>
            {achievements.length === 0 ? (
              <Card className="p-6 text-center text-muted-foreground">
                {isElementary ? "Complete tasks and keep your streak going to earn badges!" : "No achievements yet. Complete tasks and maintain streaks to earn badges."}
              </Card>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {achievements.map((a) => (
                  <Card key={a.id} className="text-center">
                    <CardContent className="py-4">
                      <span className="text-4xl">{a.achievementEmoji || "🏅"}</span>
                      <div className="font-medium mt-2 text-sm">{a.achievementName}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Events Tab */}
          <TabsContent value="events" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Upcoming Events</h2>
              <Button size="sm" variant="outline" onClick={() => setLocation(`/family/calendar?child=${childId}`)}>
                <Calendar className="h-4 w-4 mr-1" />Full Calendar
              </Button>
            </div>
            {upcomingEvents.length === 0 ? (
              <Card className="p-6 text-center text-muted-foreground">No upcoming events.</Card>
            ) : (
              upcomingEvents.map((e) => (
                <Card key={e.id}>
                  <CardContent className="py-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium">{e.title}</div>
                      <div className="text-sm text-muted-foreground">{e.eventType} — {e.startDate}{e.startTime ? ` at ${e.startTime}` : ""}</div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setLocation(`/tutor?childId=${childId}`)}>
                      <BookOpen className="h-4 w-4 mr-1" />Study
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function TaskRow({ task, onComplete, elementary }: { task: Task; onComplete: () => void; elementary: boolean }) {
  const isCompleted = task.status === "completed";
  return (
    <div className={`flex items-center gap-3 py-2 ${isCompleted ? "opacity-50" : ""}`}>
      <button onClick={onComplete} disabled={isCompleted} className="shrink-0">
        {isCompleted ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <Circle className="h-5 w-5 text-muted-foreground hover:text-primary" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium ${isCompleted ? "line-through" : ""}`}>{task.title}</div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {task.dueDate && <span>{task.dueDate}</span>}
          {task.estimatedMinutes && <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{task.estimatedMinutes}m</span>}
        </div>
      </div>
      <PriorityBadge priority={task.priority} />
      <Badge variant="secondary" className="text-xs">{elementary ? `⭐ ${task.xpReward || 10}` : `${task.xpReward || 10} XP`}</Badge>
    </div>
  );
}
