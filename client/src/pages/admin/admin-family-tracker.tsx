/**
 * Admin Family Academic Tracker
 * Aggregate view of all families, engagement stats, and at-risk children.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NavigationHeader } from "@/components/navigation-header";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import {
  Users, BookOpen, Calendar, CheckCircle2, AlertTriangle,
  Trophy, ArrowLeft, TrendingDown
} from "lucide-react";

interface OverviewData {
  totalFamilies: number;
  totalChildren: number;
  totalCourses: number;
  totalEvents: number;
  totalTasks: number;
  completedTasks: number;
  totalAchievements: number;
  atRiskChildren: number;
}

interface FamilyRow {
  parent_id: string;
  username: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  child_count: number;
  tasks_completed: number;
  total_tasks: number;
}

interface AtRiskRow {
  child_id: string;
  child_name: string;
  grade_level: string | null;
  avatar_emoji: string | null;
  parent_username: string;
  parent_email: string;
  engagement_score: string;
  risk_level: string;
  trend: string;
  week_start: string;
}

export default function AdminFamilyTracker() {
  const [, setLocation] = useLocation();

  const { data: overview, isLoading: loadingOverview } = useQuery<OverviewData>({
    queryKey: ["/api/admin/family-academic/overview"],
  });

  const { data: families, isLoading: loadingFamilies } = useQuery<FamilyRow[]>({
    queryKey: ["/api/admin/family-academic/families"],
  });

  const { data: atRisk, isLoading: loadingAtRisk } = useQuery<AtRiskRow[]>({
    queryKey: ["/api/admin/family-academic/at-risk"],
  });

  const stats = overview || { totalFamilies: 0, totalChildren: 0, totalCourses: 0, totalEvents: 0, totalTasks: 0, completedTasks: 0, totalAchievements: 0, atRiskChildren: 0 };

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader />
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/admin")}>
            <ArrowLeft className="h-4 w-4 mr-1" />Admin
          </Button>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            Family Academic Tracker
          </h1>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={<Users className="h-5 w-5 text-blue-500" />} label="Families" value={stats.totalFamilies} />
          <StatCard icon={<Users className="h-5 w-5 text-purple-500" />} label="Children" value={stats.totalChildren} />
          <StatCard icon={<BookOpen className="h-5 w-5 text-green-500" />} label="Courses" value={stats.totalCourses} />
          <StatCard icon={<Calendar className="h-5 w-5 text-indigo-500" />} label="Events" value={stats.totalEvents} />
          <StatCard icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />} label="Tasks Done" value={stats.completedTasks} />
          <StatCard icon={<CheckCircle2 className="h-5 w-5 text-gray-500" />} label="Total Tasks" value={stats.totalTasks} />
          <StatCard icon={<Trophy className="h-5 w-5 text-yellow-500" />} label="Achievements" value={stats.totalAchievements} />
          <StatCard
            icon={<AlertTriangle className="h-5 w-5 text-red-500" />}
            label="At Risk"
            value={stats.atRiskChildren}
            highlight={stats.atRiskChildren > 0}
          />
        </div>

        <Tabs defaultValue="families">
          <TabsList>
            <TabsTrigger value="families">Families</TabsTrigger>
            <TabsTrigger value="at-risk">
              At Risk
              {stats.atRiskChildren > 0 && (
                <Badge variant="destructive" className="ml-2 h-5 px-1.5">{stats.atRiskChildren}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="families" className="space-y-4">
            {loadingFamilies ? (
              <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded" />)}</div>
            ) : !families || families.length === 0 ? (
              <Card className="p-6 text-center text-muted-foreground">No families registered yet.</Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium">Parent</th>
                        <th className="text-left p-3 font-medium">Email</th>
                        <th className="text-center p-3 font-medium">Children</th>
                        <th className="text-center p-3 font-medium">Tasks Done</th>
                        <th className="text-center p-3 font-medium">Total Tasks</th>
                        <th className="text-center p-3 font-medium">Completion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {families.map((f) => {
                        const pct = f.total_tasks > 0 ? Math.round((f.tasks_completed / f.total_tasks) * 100) : 0;
                        return (
                          <tr key={f.parent_id} className="border-b hover:bg-muted/30">
                            <td className="p-3 font-medium">
                              {f.first_name && f.last_name ? `${f.first_name} ${f.last_name}` : f.username}
                            </td>
                            <td className="p-3 text-muted-foreground">{f.email}</td>
                            <td className="p-3 text-center">{f.child_count}</td>
                            <td className="p-3 text-center">{f.tasks_completed}</td>
                            <td className="p-3 text-center">{f.total_tasks}</td>
                            <td className="p-3 text-center">
                              <Badge variant={pct >= 70 ? "default" : pct >= 40 ? "secondary" : "destructive"}>
                                {pct}%
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="at-risk" className="space-y-4">
            {loadingAtRisk ? (
              <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded" />)}</div>
            ) : !atRisk || atRisk.length === 0 ? (
              <Card className="p-6 text-center">
                <CheckCircle2 className="h-8 w-8 mx-auto text-green-500 mb-2" />
                <p className="text-muted-foreground">No at-risk children. All students are on track!</p>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium">Child</th>
                        <th className="text-left p-3 font-medium">Grade</th>
                        <th className="text-left p-3 font-medium">Parent</th>
                        <th className="text-center p-3 font-medium">Score</th>
                        <th className="text-center p-3 font-medium">Risk</th>
                        <th className="text-center p-3 font-medium">Trend</th>
                        <th className="text-center p-3 font-medium">Week</th>
                      </tr>
                    </thead>
                    <tbody>
                      {atRisk.map((r) => (
                        <tr key={r.child_id} className="border-b hover:bg-muted/30">
                          <td className="p-3 font-medium">
                            <span className="mr-1">{r.avatar_emoji || "🧒"}</span>
                            {r.child_name}
                          </td>
                          <td className="p-3 text-muted-foreground">{r.grade_level || "—"}</td>
                          <td className="p-3 text-muted-foreground">{r.parent_username}</td>
                          <td className="p-3 text-center font-bold">{Number(r.engagement_score)}</td>
                          <td className="p-3 text-center">
                            <Badge variant={r.risk_level === "critical" ? "destructive" : "secondary"}>
                              {r.risk_level === "critical" ? "Critical" : "At Risk"}
                            </Badge>
                          </td>
                          <td className="p-3 text-center">
                            {r.trend === "declining" ? (
                              <TrendingDown className="h-4 w-4 text-red-500 mx-auto" />
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="p-3 text-center text-muted-foreground">{r.week_start}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: number; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-red-200 bg-red-50/50" : ""}>
      <CardContent className="py-4 flex items-center gap-3">
        {icon}
        <div>
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
