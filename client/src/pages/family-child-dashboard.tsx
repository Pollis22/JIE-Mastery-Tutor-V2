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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface ChildDashboard {
  child: {
    id: string;
    childName: string;
    childAge: number | null;
    gradeLevel: string | null;
    avatarEmoji: string | null;
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
  upcomingEvents: Array<{ id: string; title: string; startDate: string; eventType: string | null }>;
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

export default function FamilyChildDashboardPage() {
  const { user } = useAuth();
  const params = useParams<{ childId: string }>();
  const childId = params.childId;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [newCourse, setNewCourse] = useState({ courseName: "", teacherName: "", schoolName: "" });
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [newGoal, setNewGoal] = useState({ goalType: "sessions_per_week", targetValue: "3" });

  const { data, isLoading } = useQuery<ChildDashboard>({
    queryKey: [`/api/family-academic/children/${childId}/dashboard`],
    enabled: !!user && !!childId,
  });

  const completeTaskMutation = useMutation({
    mutationFn: (taskId: string) => apiRequest("POST", `/api/family-academic/tasks/${taskId}/complete`, {}),
    onSuccess: async (res) => {
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: [`/api/family-academic/children/${childId}/dashboard`] });
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
      queryClient.invalidateQueries({ queryKey: [`/api/family-academic/children/${childId}/dashboard`] });
      setShowAddCourse(false);
      setNewCourse({ courseName: "", teacherName: "", schoolName: "" });
      toast({ title: "Course added!" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const addGoalMutation = useMutation({
    mutationFn: (goal: any) => apiRequest("POST", "/api/family-academic/goals", { ...goal, childId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/family-academic/children/${childId}/dashboard`] });
      setShowAddGoal(false);
      toast({ title: "Goal set!" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (isLoading || !data) {
    return (
      <>
        <NavigationHeader />
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center">
          <div className="animate-pulse text-lg text-indigo-600">Loading dashboard...</div>
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
      bg: "from-cyan-50 via-blue-50 to-indigo-50",
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
              <div className="text-5xl">{child.avatarEmoji || "🧒"}</div>
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
              <Button variant="outline" onClick={() => setLocation("/family")}>← Family Hub</Button>
              <Button className={theme.button} onClick={() => setLocation("/tutor")}>
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
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="tasks">
                {gradeCategory === "k5" ? "🎯 Missions" : "📋 Tasks"}
              </TabsTrigger>
              <TabsTrigger value="badges">🏆 Badges</TabsTrigger>
              <TabsTrigger value="courses">📚 Courses</TabsTrigger>
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

            {/* Badges Tab */}
            <TabsContent value="badges">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {/* Streak Badges */}
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

                {/* Achievement Badges */}
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

            {/* Courses Tab */}
            <TabsContent value="courses" className="space-y-4">
              <div className="flex justify-end">
                <Dialog open={showAddCourse} onOpenChange={setShowAddCourse}>
                  <DialogTrigger asChild>
                    <Button className={theme.button}>+ Add Course</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Add a Course</DialogTitle></DialogHeader>
                    <div className="space-y-4 mt-4">
                      <div>
                        <Label>Course Name</Label>
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
                      <Button
                        className="w-full"
                        disabled={!newCourse.courseName || addCourseMutation.isPending}
                        onClick={() => addCourseMutation.mutate(newCourse)}
                      >
                        {addCourseMutation.isPending ? "Adding..." : "Add Course"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {courses.length === 0 ? (
                <Card className="bg-white/80">
                  <CardContent className="p-8 text-center">
                    <div className="text-4xl mb-2">📚</div>
                    <p className="text-gray-500">No courses yet. Add your classes to get started!</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {courses.map((course) => (
                    <Card key={course.id} className="bg-white/80" style={{ borderLeft: `4px solid ${course.color || "#6366f1"}` }}>
                      <CardContent className="p-4">
                        <h4 className="font-semibold">{course.courseName}</h4>
                        {course.teacherName && <p className="text-sm text-gray-500">{course.teacherName}</p>}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Goals Tab */}
            <TabsContent value="goals" className="space-y-4">
              <div className="flex justify-end">
                <Dialog open={showAddGoal} onOpenChange={setShowAddGoal}>
                  <DialogTrigger asChild>
                    <Button className={theme.button}>+ Set Goal</Button>
                  </DialogTrigger>
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

          {/* Upcoming Events */}
          {upcomingEvents.length > 0 && (
            <Card className="mt-6 bg-white/80 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-lg">📅 Coming Up</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {upcomingEvents.map((event) => (
                    <div key={event.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div>
                        <span className="font-medium">{event.title}</span>
                        {event.eventType && (
                          <Badge variant="secondary" className="ml-2 text-xs">{event.eventType}</Badge>
                        )}
                      </div>
                      <span className="text-sm text-gray-500">{event.startDate}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
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
