import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, TrendingUp, Users as UsersIcon, Calendar } from "lucide-react";

export default function AdminSubscriptions() {
  const { data: subscriptions, isLoading } = useQuery({
    queryKey: ["/api/admin/subscriptions"],
  });

  const stats = subscriptions?.analytics || {};

  const statCards = [
    {
      title: "Monthly Revenue",
      value: `$${stats.mrr || 0}`,
      icon: DollarSign,
      color: "text-green-600",
      bg: "bg-green-100",
    },
    {
      title: "Active Subscriptions",
      value: stats.active || 0,
      icon: UsersIcon,
      color: "text-blue-600",
      bg: "bg-blue-100",
    },
    {
      title: "Growth Rate",
      value: `${stats.growth || 0}%`,
      icon: TrendingUp,
      color: "text-purple-600",
      bg: "bg-purple-100",
    },
    {
      title: "Upcoming Renewals",
      value: stats.upcomingRenewals || 0,
      icon: Calendar,
      color: "text-orange-600",
      bg: "bg-orange-100",
    },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Subscription Management</h2>
          <p className="text-muted-foreground">Monitor and manage user subscriptions</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.title}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                      <p className="text-2xl font-bold text-foreground mt-2">{stat.value}</p>
                    </div>
                    <div className={`${stat.bg} p-3 rounded-full`}>
                      <Icon className={`w-6 h-6 ${stat.color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Subscriptions Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Subscriptions</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="animate-pulse space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-muted rounded"></div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-semibold">User</th>
                      <th className="text-left p-3 font-semibold">Plan</th>
                      <th className="text-left p-3 font-semibold">Status</th>
                      <th className="text-left p-3 font-semibold">Start Date</th>
                      <th className="text-left p-3 font-semibold">Monthly Minutes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscriptions?.users?.map((user: any) => (
                      <tr key={user.id} className="border-b hover:bg-muted/50">
                        <td className="p-3">
                          <div>
                            <p className="font-medium">{user.username}</p>
                            <p className="text-sm text-muted-foreground">{user.email}</p>
                          </div>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline">{user.subscriptionPlan || "N/A"}</Badge>
                        </td>
                        <td className="p-3">
                          <Badge
                            variant={user.subscriptionStatus === "active" ? "default" : "secondary"}
                          >
                            {user.subscriptionStatus || "inactive"}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <span className="text-sm text-muted-foreground">
                            {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "N/A"}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="text-sm font-medium">
                            {user.monthlyVoiceMinutes || 0} min
                          </span>
                        </td>
                      </tr>
                    )) || (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-muted-foreground">
                          No subscriptions found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
