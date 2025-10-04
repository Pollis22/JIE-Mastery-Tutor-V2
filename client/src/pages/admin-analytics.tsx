import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, DollarSign, Activity, TrendingUp } from "lucide-react";

export default function AdminAnalytics() {
  const { data: analytics, isLoading } = useQuery({
    queryKey: ["/api/admin/analytics"],
  });

  const metrics = [
    {
      title: "Total Users",
      value: analytics?.totalUsers || 0,
      change: analytics?.userGrowth || 0,
      icon: Users,
      color: "text-blue-600",
      bg: "bg-blue-100",
    },
    {
      title: "Revenue (MRR)",
      value: `$${analytics?.mrr || 0}`,
      change: analytics?.revenueGrowth || 0,
      icon: DollarSign,
      color: "text-green-600",
      bg: "bg-green-100",
    },
    {
      title: "Active Sessions",
      value: analytics?.activeSessions || 0,
      change: analytics?.sessionGrowth || 0,
      icon: Activity,
      color: "text-purple-600",
      bg: "bg-purple-100",
    },
    {
      title: "Retention Rate",
      value: `${analytics?.retentionRate || 0}%`,
      change: analytics?.retentionChange || 0,
      icon: TrendingUp,
      color: "text-orange-600",
      bg: "bg-orange-100",
    },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Platform Analytics</h2>
          <p className="text-muted-foreground">Comprehensive performance metrics</p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            const isPositive = metric.change >= 0;
            return (
              <Card key={metric.title}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{metric.title}</p>
                      <p className="text-2xl font-bold text-foreground mt-2">{metric.value}</p>
                      <p
                        className={`text-xs mt-1 ${
                          isPositive ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {isPositive ? "+" : ""}
                        {metric.change}% vs last month
                      </p>
                    </div>
                    <div className={`${metric.bg} p-3 rounded-full`}>
                      <Icon className={`w-6 h-6 ${metric.color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Usage Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Usage Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total Sessions</span>
                  <span className="font-bold">{analytics?.totalSessions || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Avg Session Length</span>
                  <span className="font-bold">{analytics?.avgSessionLength || "0 min"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Voice Minutes Used</span>
                  <span className="font-bold">{analytics?.totalVoiceMinutes || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Documents Uploaded</span>
                  <span className="font-bold">{analytics?.totalDocuments || 0}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>User Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">K-2</span>
                  <span className="font-bold">{analytics?.gradeDistribution?.k2 || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Grades 3-5</span>
                  <span className="font-bold">{analytics?.gradeDistribution?.grades35 || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Grades 6-8</span>
                  <span className="font-bold">{analytics?.gradeDistribution?.grades68 || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Grades 9-12</span>
                  <span className="font-bold">{analytics?.gradeDistribution?.grades912 || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">College/Adult</span>
                  <span className="font-bold">{analytics?.gradeDistribution?.college || 0}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Revenue Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Revenue by Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(analytics?.revenueByPlan || {}).map(([plan, revenue]) => (
                <div key={plan} className="flex items-center justify-between">
                  <span className="text-muted-foreground capitalize">{plan}</span>
                  <span className="font-bold">${revenue}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
