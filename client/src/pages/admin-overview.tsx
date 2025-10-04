import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, CreditCard, FileText, Activity } from "lucide-react";

export default function AdminOverview() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["/api/admin/stats"],
  });

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-muted rounded"></div>
          <div className="h-32 bg-muted rounded"></div>
        </div>
      </AdminLayout>
    );
  }

  const metrics = [
    {
      title: "Total Users",
      value: stats?.totalUsers || 0,
      icon: Users,
      color: "text-blue-600",
      bg: "bg-blue-100",
    },
    {
      title: "Active Subscriptions",
      value: stats?.activeSubscriptions || 0,
      icon: CreditCard,
      color: "text-green-600",
      bg: "bg-green-100",
    },
    {
      title: "Total Documents",
      value: stats?.totalDocuments || 0,
      icon: FileText,
      color: "text-purple-600",
      bg: "bg-purple-100",
    },
    {
      title: "Active Sessions",
      value: stats?.activeSessions || 0,
      icon: Activity,
      color: "text-orange-600",
      bg: "bg-orange-100",
    },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Dashboard Overview</h2>
          <p className="text-muted-foreground">Monitor your platform's key metrics</p>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <Card key={metric.title}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {metric.title}
                      </p>
                      <p className="text-3xl font-bold text-foreground mt-2">
                        {metric.value}
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

        {/* Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Registrations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats?.recentUsers?.map((user: any) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-3 bg-muted rounded-lg"
                  >
                    <div>
                      <p className="font-medium">{user.username}</p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                )) || <p className="text-muted-foreground">No recent users</p>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Platform Stats</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Monthly Revenue</span>
                  <span className="font-bold">${stats?.monthlyRevenue || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Avg Session Time</span>
                  <span className="font-bold">{stats?.avgSessionTime || "0 min"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total Sessions</span>
                  <span className="font-bold">{stats?.totalSessions || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Storage Used</span>
                  <span className="font-bold">{stats?.storageUsed || "0 MB"}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
