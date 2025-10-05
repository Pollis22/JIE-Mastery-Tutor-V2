import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, CreditCard, FileText, Activity, Download } from "lucide-react";

interface AdminStats {
  totalUsers: number;
  activeSubscriptions: number;
  totalDocuments: number;
  activeSessions: number;
  monthlyRevenue: number;
  avgSessionTime: string;
  totalSessions: number;
  storageUsed: string;
  recentUsers?: Array<{
    id: string;
    username: string;
    email: string;
    createdAt: string;
  }>;
}

export default function AdminOverview() {
  const [exportingSegment, setExportingSegment] = useState<string | null>(null);
  
  const { data: stats, isLoading } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
  });

  const handleQuickExport = async (segment: string, segmentName: string) => {
    try {
      setExportingSegment(segment);
      const response = await fetch(`/api/admin/contacts/export/${segment}`, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error("Failed to export contacts");
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contacts-${segment}-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Export failed:", error);
      alert("Failed to export contacts. Please try again.");
    } finally {
      setExportingSegment(null);
    }
  };

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

        {/* Quick Export Section */}
        <Card>
          <CardHeader>
            <CardTitle data-testid="heading-quick-export">Quick Contact Export</CardTitle>
            <CardDescription>
              Export contact lists for common marketing segments
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Button
                variant="outline"
                onClick={() => handleQuickExport('all', 'All Users')}
                disabled={exportingSegment === 'all'}
                data-testid="button-export-all"
                className="justify-start"
              >
                <Download className="h-4 w-4 mr-2" />
                {exportingSegment === 'all' ? 'Exporting...' : 'All Opted-In Users'}
              </Button>
              
              <Button
                variant="outline"
                onClick={() => handleQuickExport('active-premium', 'Active Premium')}
                disabled={exportingSegment === 'active-premium'}
                data-testid="button-export-premium"
                className="justify-start"
              >
                <Download className="h-4 w-4 mr-2" />
                {exportingSegment === 'active-premium' ? 'Exporting...' : 'Active Premium Users'}
              </Button>
              
              <Button
                variant="outline"
                onClick={() => handleQuickExport('cancelled', 'Cancelled')}
                disabled={exportingSegment === 'cancelled'}
                data-testid="button-export-cancelled"
                className="justify-start"
              >
                <Download className="h-4 w-4 mr-2" />
                {exportingSegment === 'cancelled' ? 'Exporting...' : 'Cancelled Subscriptions'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              For more export options and campaign tracking, visit the{" "}
              <a href="/admin/contacts" className="text-primary underline">
                Contacts page
              </a>
            </p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
