import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NavigationHeader } from "@/components/navigation-header";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Plus, Calendar, BookOpen, Flame, Trophy,
  TrendingUp, TrendingDown, Minus, AlertTriangle,
  ChevronRight, Sun, Target, Pencil
} from "lucide-react";

interface ChildSummary {
  id: string;
  childName: string;
  childAge: number | null;
  gradeLevel: string | null;
  avatarEmoji: string | null;
  color: string | null;
  pendingTaskCount: number;
  nextDeadline: { title: string; startDate: string } | null;
  engagementScore: number | null;
  riskLevel: string | null;
  trend: string | null;
  currentStreak: number;
  totalXp: number;
  level: number;
  goals: Array<{ goalType: string; targetValue: number; currentValue: number }>;
}

interface DashboardData {
  children: ChildSummary[];
  thisWeek: { totalStudyHours: number; tasksCompleted: number; upcomingDeadlines: number };
  isSummerMode: boolean;
}

const GRADE_OPTIONS = ["K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const EMOJI_OPTIONS = ["👧", "👦", "🧒", "👩‍🎓", "👨‍🎓", "🦊", "🐱", "🐶", "🦄", "🐼", "🦋", "🌟", "🚀", "🎨"];
const COLOR_OPTIONS = ["#4f46e5", "#dc2626", "#16a34a", "#ca8a04", "#9333ea", "#ec4899", "#0891b2", "#f97316"];

function TrendIcon({ trend }: { trend: string | null }) {
  if (trend === "improving") return <TrendingUp className="h-4 w-4 text-green-500" />;
  if (trend === "declining") return <TrendingDown className="h-4 w-4 text-red-500" />;
  return <Minus className="h-4 w-4 text-gray-400" />;
}

function RiskBadge({ level }: { level: string | null }) {
  if (!level) return null;
  const colors: Record<string, string> = {
    on_track: "bg-green-100 text-green-700",
    needs_attention: "bg-yellow-100 text-yellow-700",
    at_risk: "bg-orange-100 text-orange-700",
    critical: "bg-red-100 text-red-700",
  };
  const labels: Record<string, string> = {
    on_track: "On Track",
    needs_attention: "Needs Attention",
    at_risk: "At Risk",
    critical: "Critical",
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[level] || ""}`}>{labels[level] || level}</span>;
}

export default function FamilyDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [addChildOpen, setAddChildOpen] = useState(false);
  const [editChild, setEditChild] = useState<ChildSummary | null>(null);
  const [childForm, setChildForm] = useState({ childName: "", childAge: "", gradeLevel: "", avatarEmoji: "🧒", color: "#4f46e5" });

  const { data: dashboard, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/family-academic/dashboard"],
  });

  const { data: leaderboard } = useQuery<Array<{ childId: string; childName: string; avatarEmoji: string; weeklyXp: number }>>({
    queryKey: ["/api/family-academic/leaderboard"],
  });

  const addChildMutation = useMutation({
    mutationFn: async (data: { childName: string; childAge?: number; gradeLevel?: string; avatarEmoji?: string; color?: string }) => {
      const res = await apiRequest("POST", "/api/family-academic/children", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/family-academic/dashboard"] });
      setAddChildOpen(false);
      setChildForm({ childName: "", childAge: "", gradeLevel: "", avatarEmoji: "🧒", color: "#4f46e5" });
      toast({ title: "Child added!" });
    },
  });

  const updateChildMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; childName: string; childAge?: number; gradeLevel?: string; avatarEmoji?: string; color?: string }) => {
      const res = await apiRequest("PUT", `/api/family-academic/children/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/family-academic/dashboard"] });
      setEditChild(null);
      toast({ title: "Child updated!" });
    },
  });

  const handleAddChild = () => {
    addChildMutation.mutate({
      childName: childForm.childName,
      childAge: childForm.childAge ? parseInt(childForm.childAge) : undefined,
      gradeLevel: childForm.gradeLevel || undefined,
      avatarEmoji: childForm.avatarEmoji,
      color: childForm.color,
    });
  };

  const handleUpdateChild = () => {
    if (!editChild) return;
    updateChildMutation.mutate({
      id: editChild.id,
      childName: childForm.childName,
      childAge: childForm.childAge ? parseInt(childForm.childAge) : undefined,
      gradeLevel: childForm.gradeLevel || undefined,
      avatarEmoji: childForm.avatarEmoji,
      color: childForm.color,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationHeader />
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  const children = dashboard?.children || [];
  const thisWeek = dashboard?.thisWeek || { totalStudyHours: 0, tasksCompleted: 0, upcomingDeadlines: 0 };

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader />
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-6 w-6" />
              Family Command Center
              {dashboard?.isSummerMode && <Sun className="h-5 w-5 text-yellow-500" />}
            </h1>
            <p className="text-muted-foreground">Manage your family's academic journey</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setLocation("/family/calendar")}>
              <Calendar className="h-4 w-4 mr-2" />Calendar
            </Button>
            <Dialog open={addChildOpen} onOpenChange={setAddChildOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => setChildForm({ childName: "", childAge: "", gradeLevel: "", avatarEmoji: "🧒", color: "#4f46e5" })}>
                  <Plus className="h-4 w-4 mr-2" />Add Child
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Child</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Name</Label>
                    <Input value={childForm.childName} onChange={(e) => setChildForm({ ...childForm, childName: e.target.value })} placeholder="Child's name" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Age</Label>
                      <Input type="number" value={childForm.childAge} onChange={(e) => setChildForm({ ...childForm, childAge: e.target.value })} placeholder="Age" />
                    </div>
                    <div>
                      <Label>Grade</Label>
                      <Select value={childForm.gradeLevel} onValueChange={(v) => setChildForm({ ...childForm, gradeLevel: v })}>
                        <SelectTrigger><SelectValue placeholder="Grade" /></SelectTrigger>
                        <SelectContent>
                          {GRADE_OPTIONS.map((g) => (<SelectItem key={g} value={g}>{g === "K" ? "Kindergarten" : `Grade ${g}`}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label>Avatar</Label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {EMOJI_OPTIONS.map((e) => (
                        <button key={e} onClick={() => setChildForm({ ...childForm, avatarEmoji: e })} className={`text-2xl p-1 rounded ${childForm.avatarEmoji === e ? "bg-primary/20 ring-2 ring-primary" : "hover:bg-muted"}`}>{e}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label>Color</Label>
                    <div className="flex gap-2 mt-1">
                      {COLOR_OPTIONS.map((c) => (
                        <button key={c} onClick={() => setChildForm({ ...childForm, color: c })} className={`w-8 h-8 rounded-full ${childForm.color === c ? "ring-2 ring-offset-2 ring-primary" : ""}`} style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  </div>
                  <Button onClick={handleAddChild} disabled={!childForm.childName || addChildMutation.isPending} className="w-full">
                    {addChildMutation.isPending ? "Adding..." : "Add Child"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Summer mode banner */}
        {dashboard?.isSummerMode && (
          <Card className="bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-200">
            <CardContent className="py-3 flex items-center gap-3">
              <Sun className="h-5 w-5 text-yellow-600" />
              <span className="text-yellow-800 font-medium">Summer Mode Active — Set summer learning goals to keep skills sharp!</span>
            </CardContent>
          </Card>
        )}

        {/* This Week Summary */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="py-4 text-center">
              <div className="text-2xl font-bold">{thisWeek.totalStudyHours}h</div>
              <div className="text-sm text-muted-foreground">Study Hours This Week</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <div className="text-2xl font-bold">{thisWeek.tasksCompleted}</div>
              <div className="text-sm text-muted-foreground">Tasks Completed</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <div className="text-2xl font-bold">{thisWeek.upcomingDeadlines}</div>
              <div className="text-sm text-muted-foreground">Upcoming Deadlines</div>
            </CardContent>
          </Card>
        </div>

        {/* Children Cards + Leaderboard */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3 space-y-4">
            {children.length === 0 ? (
              <Card className="p-8 text-center">
                <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No children added yet</h3>
                <p className="text-muted-foreground mb-4">Add your first child to get started with the Family Academic Command Center.</p>
                <Button onClick={() => setAddChildOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />Add Your First Child
                </Button>
              </Card>
            ) : (
              children.map((child) => (
                <Card key={child.id} className="overflow-hidden" style={{ borderLeft: `4px solid ${child.color || "#4f46e5"}` }}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">{child.avatarEmoji || "🧒"}</span>
                        <div>
                          <h3 className="font-semibold text-lg">{child.childName}</h3>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            {child.gradeLevel && <span>Grade {child.gradeLevel}</span>}
                            {child.childAge && <span>Age {child.childAge}</span>}
                            <RiskBadge level={child.riskLevel} />
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="ghost" onClick={() => {
                          setEditChild(child);
                          setChildForm({
                            childName: child.childName,
                            childAge: child.childAge?.toString() || "",
                            gradeLevel: child.gradeLevel || "",
                            avatarEmoji: child.avatarEmoji || "🧒",
                            color: child.color || "#4f46e5",
                          });
                        }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setLocation(`/family/child/${child.id}`)}>
                          View <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-xl font-bold">{child.engagementScore ?? "—"}</span>
                          <TrendIcon trend={child.trend} />
                        </div>
                        <div className="text-xs text-muted-foreground">Engagement</div>
                      </div>
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Flame className="h-4 w-4 text-orange-500" />
                          <span className="text-xl font-bold">{child.currentStreak}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">Day Streak</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-bold">{child.pendingTaskCount}</div>
                        <div className="text-xs text-muted-foreground">Pending Tasks</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-bold">Lv {child.level}</div>
                        <div className="text-xs text-muted-foreground">{child.totalXp} XP</div>
                      </div>
                      <div className="text-center">
                        {child.nextDeadline ? (
                          <>
                            <div className="text-sm font-medium truncate">{child.nextDeadline.title}</div>
                            <div className="text-xs text-muted-foreground">{child.nextDeadline.startDate}</div>
                          </>
                        ) : (
                          <div className="text-sm text-muted-foreground">No upcoming</div>
                        )}
                      </div>
                    </div>

                    {/* Goals */}
                    {child.goals.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {child.goals.map((g, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <Target className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground w-32 truncate">{g.goalType}</span>
                            <Progress value={Math.min(100, (g.currentValue / Math.max(1, g.targetValue)) * 100)} className="flex-1 h-2" />
                            <span className="text-xs font-medium">{g.currentValue}/{g.targetValue}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Quick actions */}
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" variant="default" onClick={() => setLocation(`/tutor?childId=${child.id}`)}>
                        <BookOpen className="h-4 w-4 mr-1" />Study with JIE
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setLocation(`/family/calendar?child=${child.id}`)}>
                        <Calendar className="h-4 w-4 mr-1" />Calendar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {/* Leaderboard Sidebar */}
          {children.length > 1 && leaderboard && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-yellow-500" />
                    Weekly Leaderboard
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {leaderboard.map((entry, i) => (
                    <div key={entry.childId} className="flex items-center gap-2">
                      <span className="text-lg font-bold text-muted-foreground w-6">{i + 1}</span>
                      <span className="text-xl">{entry.avatarEmoji || "🧒"}</span>
                      <div className="flex-1">
                        <div className="text-sm font-medium">{entry.childName}</div>
                        <div className="text-xs text-muted-foreground">{entry.weeklyXp} XP</div>
                      </div>
                      {i === 0 && <Trophy className="h-4 w-4 text-yellow-500" />}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Edit Child Dialog */}
        <Dialog open={!!editChild} onOpenChange={(open) => !open && setEditChild(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Child</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input value={childForm.childName} onChange={(e) => setChildForm({ ...childForm, childName: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Age</Label>
                  <Input type="number" value={childForm.childAge} onChange={(e) => setChildForm({ ...childForm, childAge: e.target.value })} />
                </div>
                <div>
                  <Label>Grade</Label>
                  <Select value={childForm.gradeLevel} onValueChange={(v) => setChildForm({ ...childForm, gradeLevel: v })}>
                    <SelectTrigger><SelectValue placeholder="Grade" /></SelectTrigger>
                    <SelectContent>
                      {GRADE_OPTIONS.map((g) => (<SelectItem key={g} value={g}>{g === "K" ? "Kindergarten" : `Grade ${g}`}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Avatar</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {EMOJI_OPTIONS.map((e) => (
                    <button key={e} onClick={() => setChildForm({ ...childForm, avatarEmoji: e })} className={`text-2xl p-1 rounded ${childForm.avatarEmoji === e ? "bg-primary/20 ring-2 ring-primary" : "hover:bg-muted"}`}>{e}</button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Color</Label>
                <div className="flex gap-2 mt-1">
                  {COLOR_OPTIONS.map((c) => (
                    <button key={c} onClick={() => setChildForm({ ...childForm, color: c })} className={`w-8 h-8 rounded-full ${childForm.color === c ? "ring-2 ring-offset-2 ring-primary" : ""}`} style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <Button onClick={handleUpdateChild} disabled={!childForm.childName || updateChildMutation.isPending} className="w-full">
                {updateChildMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
