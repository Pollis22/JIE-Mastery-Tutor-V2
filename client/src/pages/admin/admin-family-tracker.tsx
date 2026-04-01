import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { NavigationHeader } from "@/components/navigation-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface FamilyOverview {
  totalFamilies: number;
  totalChildren: number;
  totalTasks: number;
  completedTasks: number;
  totalEvents: number;
  atRiskChildren: number;
}

interface FamilyRow {
  parentUserId: string;
  childCount: number;
  parentEmail: string;
  parentName: string | null;
}

interface EngagementRow {
  childId: string;
  childName: string;
  gradeLevel: string | null;
  engagementScore: string | null;
  riskLevel: string | null;
  trend: string | null;
  weekStart: string | null;
}

interface InterventionRow {
  childId: string;
  childName: string;
  parentEmail: string;
  engagementScore: string | null;
  riskLevel: string | null;
  weekStart: string | null;
}

const riskColors: Record<string, string> = {
  on_track: "bg-green-100 text-green-800",
  needs_attention: "bg-yellow-100 text-yellow-800",
  at_risk: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

const trendEmojis: Record<string, string> = {
  improving: "📈",
  stable: "➡️",
  declining: "📉",
};

export default function AdminFamilyTracker() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const { data: overview, isLoading: loadingOverview } = useQuery<FamilyOverview>({
    queryKey: ["/api/admin/family-academic/overview"],
    enabled: !!user?.isAdmin,
  });

  const { data: families } = useQuery<FamilyRow[]>({
    queryKey: ["/api/admin/family-academic/families"],
    enabled: !!user?.isAdmin,
  });

  const { data: engagement } = useQuery<EngagementRow[]>({
    queryKey: ["/api/admin/family-academic/engagement"],
    enabled: !!user?.isAdmin,
  });

  const { data: interventions } = useQuery<InterventionRow[]>({
    queryKey: ["/api/admin/family-academic/interventions"],
    enabled: !!user?.isAdmin,
  });

  if (!user?.isAdmin) {
    return (
      <>
        <NavigationHeader />
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-gray-500">Admin access required.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <NavigationHeader />
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">📚 Study Tracker — Admin</h1>
              <p className="text-sm text-gray-500">Monitor student engagement, identify at-risk students, and track platform usage</p>
            </div>
            <Button variant="outline" onClick={() => setLocation("/admin")}>← Admin Dashboard</Button>
          </div>

          {/* Overview Cards */}
          {overview && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-primary">{overview.totalFamilies}</div>
                  <div className="text-xs text-gray-500">Families</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">{overview.totalChildren}</div>
                  <div className="text-xs text-gray-500">Children</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">{overview.completedTasks}</div>
                  <div className="text-xs text-gray-500">Tasks Done</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-amber-600">{overview.totalTasks}</div>
                  <div className="text-xs text-gray-500">Total Tasks</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-primary">{overview.totalEvents}</div>
                  <div className="text-xs text-gray-500">Calendar Events</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-red-600">{overview.atRiskChildren}</div>
                  <div className="text-xs text-gray-500">At Risk</div>
                </CardContent>
              </Card>
            </div>
          )}

          <Tabs defaultValue="families" className="space-y-6">
            <TabsList>
              <TabsTrigger value="families">Families</TabsTrigger>
              <TabsTrigger value="engagement">Engagement</TabsTrigger>
              <TabsTrigger value="interventions">
                Interventions
                {interventions && interventions.length > 0 && (
                  <Badge variant="destructive" className="ml-2">{interventions.length}</Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Families Tab */}
            <TabsContent value="families">
              <Card>
                <CardHeader>
                  <CardTitle>Active Families</CardTitle>
                </CardHeader>
                <CardContent>
                  {!families || families.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">No families registered yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-gray-500">
                            <th className="p-3">Parent</th>
                            <th className="p-3">Email</th>
                            <th className="p-3 text-center">Children</th>
                          </tr>
                        </thead>
                        <tbody>
                          {families.map((f) => (
                            <tr key={f.parentUserId} className="border-b hover:bg-gray-50">
                              <td className="p-3 font-medium">{f.parentName || "—"}</td>
                              <td className="p-3 text-gray-600">{f.parentEmail}</td>
                              <td className="p-3 text-center">
                                <Badge variant="secondary">{f.childCount}</Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Engagement Tab */}
            <TabsContent value="engagement">
              <Card>
                <CardHeader>
                  <CardTitle>Weekly Engagement Scores</CardTitle>
                </CardHeader>
                <CardContent>
                  {!engagement || engagement.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">No engagement data yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-gray-500">
                            <th className="p-3">Child</th>
                            <th className="p-3">Grade</th>
                            <th className="p-3">Week</th>
                            <th className="p-3 text-center">Score</th>
                            <th className="p-3 text-center">Risk</th>
                            <th className="p-3 text-center">Trend</th>
                          </tr>
                        </thead>
                        <tbody>
                          {engagement.map((e, i) => (
                            <tr key={`${e.childId}-${i}`} className="border-b hover:bg-gray-50">
                              <td className="p-3 font-medium">{e.childName}</td>
                              <td className="p-3">{e.gradeLevel || "—"}</td>
                              <td className="p-3 text-gray-500">{e.weekStart || "—"}</td>
                              <td className="p-3 text-center font-bold">{Number(e.engagementScore || 0).toFixed(0)}</td>
                              <td className="p-3 text-center">
                                <Badge className={riskColors[e.riskLevel || "on_track"]}>
                                  {(e.riskLevel || "on_track").replace(/_/g, " ")}
                                </Badge>
                              </td>
                              <td className="p-3 text-center">{trendEmojis[e.trend || "stable"] || "➡️"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Interventions Tab */}
            <TabsContent value="interventions">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    ⚠️ Students Needing Attention
                    {interventions && interventions.length > 0 && (
                      <Badge variant="destructive">{interventions.length}</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!interventions || interventions.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="text-4xl mb-2">✅</div>
                      <p className="text-gray-500">All students are on track. No interventions needed.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-gray-500">
                            <th className="p-3">Child</th>
                            <th className="p-3">Parent Email</th>
                            <th className="p-3 text-center">Score</th>
                            <th className="p-3 text-center">Risk Level</th>
                            <th className="p-3">Week</th>
                          </tr>
                        </thead>
                        <tbody>
                          {interventions.map((item, i) => (
                            <tr key={`${item.childId}-${i}`} className="border-b hover:bg-gray-50">
                              <td className="p-3 font-medium">{item.childName}</td>
                              <td className="p-3 text-gray-600">{item.parentEmail}</td>
                              <td className="p-3 text-center font-bold text-red-600">
                                {Number(item.engagementScore || 0).toFixed(0)}
                              </td>
                              <td className="p-3 text-center">
                                <Badge className={riskColors[item.riskLevel || "at_risk"]}>
                                  {(item.riskLevel || "at_risk").replace(/_/g, " ")}
                                </Badge>
                              </td>
                              <td className="p-3 text-gray-500">{item.weekStart || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
}
