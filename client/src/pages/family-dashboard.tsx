import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { NavigationHeader } from "@/components/navigation-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef } from "react";
import { Camera } from "lucide-react";

interface ChildSummary {
  id: string;
  childName: string;
  childAge: number | null;
  gradeLevel: string | null;
  avatarEmoji: string | null;
  photoUrl: string | null;
  color: string | null;
  pendingTasks: number;
  completedTasksThisWeek: number;
  streak: number;
  totalXp: number;
  level: number;
  nextDeadline: { title: string; startDate: string } | null;
  streakBadge: { days: number; name: string; emoji: string } | null;
}

interface FamilyDashboard {
  children: ChildSummary[];
  familySummary: { totalStudyHours: number; totalTasksCompleted: number; totalUpcoming: number };
  leaderboard: { rank: number; childName: string; avatarEmoji: string | null; weeklyXp: number }[];
  isSummerMode: boolean;
}

const GRADE_OPTIONS = [
  "Kindergarten", "1st", "2nd", "3rd", "4th", "5th",
  "6th", "7th", "8th", "9th", "10th", "11th", "12th",
];

const AVATAR_EMOJIS = ["🧒", "👧", "👦", "🧒🏽", "👧🏾", "👦🏻", "🧒🏿", "👧🏼", "🦸", "🧙", "🐱", "🐶", "🦊", "🐼", "🦄", "🐸"];

const COLORS = [
  { value: "#6366f1", label: "Indigo" },
  { value: "#ec4899", label: "Pink" },
  { value: "#10b981", label: "Green" },
  { value: "#f59e0b", label: "Amber" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#8b5cf6", label: "Purple" },
  { value: "#ef4444", label: "Red" },
  { value: "#14b8a6", label: "Teal" },
];

export default function FamilyDashboardPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showAddChild, setShowAddChild] = useState(false);
  const [newChild, setNewChild] = useState({ childName: "", childAge: "", gradeLevel: "", avatarEmoji: "🧒", color: "#6366f1", photoUrl: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery<FamilyDashboard>({
    queryKey: ["/api/family-academic/dashboard"],
    enabled: !!user,
  });

  const addChildMutation = useMutation({
    mutationFn: (child: any) => apiRequest("POST", "/api/family-academic/children", child),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/family-academic/dashboard"] });
      setShowAddChild(false);
      setNewChild({ childName: "", childAge: "", gradeLevel: "", avatarEmoji: "🧒", color: "#6366f1", photoUrl: "" });
      toast({ title: "Child added!", description: "Your child's profile has been created." });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const reportMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/family-academic/weekly-report"),
    onSuccess: () => toast({ title: "Report sent!", description: "Check your email for the weekly summary." }),
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <>
        <NavigationHeader />
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="animate-pulse text-lg text-primary">Loading your study tracker...</div>
        </div>
      </>
    );
  }

  const dashboard = data;
  const children = dashboard?.children || [];
  const summary = dashboard?.familySummary;
  const leaderboard = dashboard?.leaderboard || [];

  return (
    <>
      <NavigationHeader />
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {dashboard?.isSummerMode ? "☀️ Summer Learning Hub" : "📚 Study Tracker"}
              </h1>
              <p className="text-gray-500 mt-1">
                {dashboard?.isSummerMode
                  ? "Keep the learning going all summer long!"
                  : "Track your children's academic progress"}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setLocation("/family/calendar")}>
                📅 Calendar
              </Button>
              <Button variant="outline" onClick={() => reportMutation.mutate()} disabled={reportMutation.isPending}>
                {reportMutation.isPending ? "Sending..." : "📊 Weekly Report"}
              </Button>
              <Dialog open={showAddChild} onOpenChange={setShowAddChild}>
                <DialogTrigger asChild>
                  <Button className="bg-primary hover:bg-primary/90">+ Add Child</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add a Child</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div>
                      <Label>Name</Label>
                      <Input
                        value={newChild.childName}
                        onChange={(e) => setNewChild({ ...newChild, childName: e.target.value })}
                        placeholder="Child's name"
                      />
                    </div>
                    <div>
                      <Label>Age</Label>
                      <Input
                        type="number"
                        value={newChild.childAge}
                        onChange={(e) => setNewChild({ ...newChild, childAge: e.target.value })}
                        placeholder="Age"
                        min={4}
                        max={18}
                      />
                    </div>
                    <div>
                      <Label>Grade Level</Label>
                      <Select value={newChild.gradeLevel} onValueChange={(v) => setNewChild({ ...newChild, gradeLevel: v })}>
                        <SelectTrigger><SelectValue placeholder="Select grade" /></SelectTrigger>
                        <SelectContent>
                          {GRADE_OPTIONS.map((g) => (
                            <SelectItem key={g} value={g}>{g}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Photo (optional)</Label>
                      <div className="flex items-center gap-3 mt-1">
                        {newChild.photoUrl ? (
                          <div className="relative">
                            <img src={newChild.photoUrl} alt="Child" className="w-16 h-16 rounded-full object-cover border-2 border-primary" />
                            <button
                              onClick={() => setNewChild({ ...newChild, photoUrl: "" })}
                              className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-white rounded-full text-xs flex items-center justify-center"
                            >×</button>
                          </div>
                        ) : (
                          <div
                            onClick={() => fileInputRef.current?.click()}
                            className="w-16 h-16 rounded-full border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors"
                          >
                            <Camera className="w-5 h-5 text-muted-foreground" />
                            <span className="text-[10px] text-muted-foreground">Upload</span>
                          </div>
                        )}
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (file.size > 2 * 1024 * 1024) {
                              toast({ title: "File too large", description: "Please use an image under 2MB", variant: "destructive" });
                              return;
                            }
                            const reader = new FileReader();
                            reader.onload = () => setNewChild({ ...newChild, photoUrl: reader.result as string });
                            reader.readAsDataURL(file);
                          }}
                        />
                        <p className="text-xs text-muted-foreground">Upload a photo or pick an avatar below</p>
                      </div>
                    </div>
                    <div>
                      <Label>Avatar</Label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {AVATAR_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => setNewChild({ ...newChild, avatarEmoji: emoji })}
                            className={`text-2xl p-1 rounded-lg border-2 transition-all ${
                              newChild.avatarEmoji === emoji ? "border-primary bg-primary/5" : "border-transparent hover:border-gray-200"
                            }`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Label>Color</Label>
                      <div className="flex gap-2 mt-1">
                        {COLORS.map((c) => (
                          <button
                            key={c.value}
                            onClick={() => setNewChild({ ...newChild, color: c.value })}
                            className={`w-8 h-8 rounded-full border-2 transition-all ${
                              newChild.color === c.value ? "border-gray-900 scale-110" : "border-transparent"
                            }`}
                            style={{ backgroundColor: c.value }}
                            title={c.label}
                          />
                        ))}
                      </div>
                    </div>
                    <Button
                      className="w-full bg-primary hover:bg-primary/90"
                      disabled={!newChild.childName || addChildMutation.isPending}
                      onClick={() =>
                        addChildMutation.mutate({
                          childName: newChild.childName,
                          childAge: newChild.childAge ? parseInt(newChild.childAge) : null,
                          gradeLevel: newChild.gradeLevel || null,
                          avatarEmoji: newChild.avatarEmoji,
                          photoUrl: newChild.photoUrl || null,
                          color: newChild.color,
                        })
                      }
                    >
                      {addChildMutation.isPending ? "Adding..." : "Add Child"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Weekly Summary Bar */}
          {summary && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <Card className="bg-white/80 backdrop-blur border-primary/20">
                <CardContent className="p-4 text-center">
                  <div className="text-3xl font-bold text-primary">{summary.totalTasksCompleted}</div>
                  <div className="text-sm text-gray-500">Tasks Completed This Week</div>
                </CardContent>
              </Card>
              <Card className="bg-white/80 backdrop-blur border-primary/20">
                <CardContent className="p-4 text-center">
                  <div className="text-3xl font-bold text-primary">{summary.totalUpcoming}</div>
                  <div className="text-sm text-gray-500">Upcoming Deadlines</div>
                </CardContent>
              </Card>
              <Card className="bg-white/80 backdrop-blur border-green-100">
                <CardContent className="p-4 text-center">
                  <div className="text-3xl font-bold text-green-600">{children.length}</div>
                  <div className="text-sm text-gray-500">Active Learners</div>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Children Cards */}
            <div className="lg:col-span-3 space-y-4">
              {children.length === 0 ? (
                <Card className="bg-white/80 backdrop-blur">
                  <CardContent className="p-12 text-center">
                    <div className="text-6xl mb-4">📚</div>
                    <h3 className="text-xl font-semibold text-gray-700 mb-2">Welcome to Your Study Tracker!</h3>
                    <p className="text-gray-500 mb-6">Add your children to start tracking their learning journey.</p>
                    <Button className="bg-primary hover:bg-primary/90" onClick={() => setShowAddChild(true)}>
                      + Add Your First Child
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                children.map((child) => (
                  <Card
                    key={child.id}
                    className="bg-white/90 backdrop-blur hover:shadow-lg transition-shadow cursor-pointer border-l-4"
                    style={{ borderLeftColor: child.color || "#6366f1" }}
                  >
                    <CardContent className="p-6">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          {child.photoUrl ? (
                            <img src={child.photoUrl} alt={child.childName} className="w-12 h-12 rounded-full object-cover border-2" style={{ borderColor: child.color || "#6366f1" }} />
                          ) : (
                            <div className="text-4xl">{child.avatarEmoji || "🧒"}</div>
                          )}
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900">{child.childName}</h3>
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                              {child.gradeLevel && <span>{child.gradeLevel}</span>}
                              {child.childAge && <span>• Age {child.childAge}</span>}
                              <span>• Level {child.level} Scholar</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-6 text-sm">
                          {/* Streak */}
                          <div className="text-center">
                            <div className="text-2xl">
                              {child.streakBadge ? child.streakBadge.emoji : child.streak > 0 ? "🔥" : "💤"}
                            </div>
                            <div className="text-xs text-gray-500">{child.streak}d streak</div>
                          </div>

                          {/* XP */}
                          <div className="text-center">
                            <div className="text-lg font-bold text-primary">{child.totalXp} XP</div>
                            <div className="text-xs text-gray-500">Level {child.level}</div>
                          </div>

                          {/* Pending Tasks */}
                          <div className="text-center">
                            <div className="text-lg font-bold text-amber-600">{child.pendingTasks}</div>
                            <div className="text-xs text-gray-500">Pending</div>
                          </div>

                          {/* Next Deadline */}
                          {child.nextDeadline && (
                            <div className="text-center max-w-[120px]">
                              <div className="text-xs font-medium text-red-600 truncate">{child.nextDeadline.title}</div>
                              <div className="text-xs text-gray-500">{child.nextDeadline.startDate}</div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* XP Progress Bar */}
                      <div className="mt-4">
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                          <span>Level {child.level}</span>
                          <span>Level {child.level + 1}</span>
                        </div>
                        <Progress value={(child.totalXp % (child.level * 100)) / (child.level * 100) * 100} className="h-2" />
                      </div>

                      {/* Quick Actions */}
                      <div className="flex gap-2 mt-4">
                        <Button
                          size="sm"
                          className="bg-primary hover:bg-primary/90"
                          onClick={(e) => { e.stopPropagation(); setLocation(child.studentId ? `/tutor?student=${child.studentId}` : "/tutor"); }}
                        >
                          🎓 Study with JIE
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); setLocation(`/family/child/${child.id}`); }}
                        >
                          📊 Dashboard
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); setLocation("/family/calendar"); }}
                        >
                          📅 Calendar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            {/* Leaderboard Sidebar */}
            <div className="space-y-4">
              {leaderboard.length > 1 && (
                <Card className="bg-white/90 backdrop-blur">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">🏆 Leaderboard</CardTitle>
                    <p className="text-xs text-gray-500">Weekly XP rankings</p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {leaderboard.map((entry) => (
                        <div key={entry.rank} className="flex items-center gap-3">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            entry.rank === 1 ? "bg-yellow-100 text-yellow-700" :
                            entry.rank === 2 ? "bg-gray-100 text-gray-700" :
                            "bg-orange-100 text-orange-700"
                          }`}>
                            {entry.rank}
                          </div>
                          <span className="text-lg">{entry.avatarEmoji || "🧒"}</span>
                          <div className="flex-1">
                            <div className="text-sm font-medium">{entry.childName}</div>
                            <div className="text-xs text-gray-500">{entry.weeklyXp} XP this week</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Quick Stats */}
              <Card className="bg-gradient-to-br from-primary to-primary/80 text-white">
                <CardContent className="p-6">
                  <h3 className="font-semibold text-lg mb-3">Quick Tips</h3>
                  <ul className="space-y-2 text-sm text-primary-foreground/80">
                    <li>📅 Add calendar events to auto-generate study tasks</li>
                    <li>🎯 Set weekly goals for each child</li>
                    <li>🔥 Daily activity builds streaks and earns badges</li>
                    <li>📊 Get weekly email reports on progress</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
