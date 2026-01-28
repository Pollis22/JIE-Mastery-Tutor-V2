import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatChicagoDateTime } from "@/lib/date-utils";
import { ScrollText } from "lucide-react";

export default function AdminLogs() {
  const { data, isLoading } = useQuery<{ logs: any[]; total: number }>({
    queryKey: ["/api/admin/logs"],
  });

  const logs = data?.logs || [];
  const total = data?.total || 0;

  const getActionBadge = (action: string) => {
    const actionMap: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", label: string }> = {
      add_minutes: { variant: "default", label: "Add Minutes" },
      view_users: { variant: "secondary", label: "View Users" },
      export_data: { variant: "outline", label: "Export Data" },
      view_subscriptions: { variant: "secondary", label: "View Subscriptions" },
      view_documents: { variant: "secondary", label: "View Documents" },
      view_analytics: { variant: "secondary", label: "View Analytics" },
    };
    
    const config = actionMap[action] || { variant: "outline" as const, label: action };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getTargetType = (type: string) => {
    const typeMap: Record<string, string> = {
      user: "User",
      subscription: "Subscription",
      document: "Document",
      agent: "Agent",
      system: "System",
    };
    return typeMap[type] || type;
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-foreground">Audit Logs</h2>
            <p className="text-muted-foreground">Track all admin actions and system events</p>
          </div>
          <div className="flex items-center space-x-2 text-muted-foreground">
            <ScrollText className="w-5 h-5" />
            <span className="text-sm">{total} total logs</span>
          </div>
        </div>

        {/* Logs Table */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="animate-pulse space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-16 bg-muted rounded"></div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-semibold">Timestamp</th>
                      <th className="text-left p-3 font-semibold">Admin</th>
                      <th className="text-left p-3 font-semibold">Action</th>
                      <th className="text-left p-3 font-semibold">Target Type</th>
                      <th className="text-left p-3 font-semibold">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.length > 0 ? (
                      logs.map((log: any) => (
                        <tr key={log.id} className="border-b hover:bg-muted/50">
                          <td className="p-3">
                            <span className="text-sm text-muted-foreground">
                              {formatChicagoDateTime(log.timestamp)}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="text-sm font-medium">{log.adminId}</span>
                          </td>
                          <td className="p-3">{getActionBadge(log.action)}</td>
                          <td className="p-3">
                            <span className="text-sm">{getTargetType(log.targetType)}</span>
                          </td>
                          <td className="p-3">
                            {log.details && (
                              <code className="text-xs bg-muted px-2 py-1 rounded">
                                {JSON.stringify(log.details)}
                              </code>
                            )}
                            {log.targetId && (
                              <span className="text-xs text-muted-foreground ml-2">
                                ID: {log.targetId}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-muted-foreground">
                          No audit logs found
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
