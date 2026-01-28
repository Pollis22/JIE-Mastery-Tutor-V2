import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatChicagoDateTime, formatChicagoDate } from "@/lib/date-utils";
import { Search, UserPlus, Edit, Trash2, CreditCard, Eye } from "lucide-react";
import { Link } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface AdminUser {
  id: string;
  username: string;
  email: string;
  createdAt: string;
  lastActiveAt?: string | null;
  isAdmin: boolean;
  subscriptionStatus?: string;
  subscriptionPlan?: string;
  subscriptionEndDate?: string;
  voiceMinutesRemaining?: number;
  bonusMinutes?: number;
  gradeLevel?: string;
  monthlyVoiceMinutes?: number;
  monthlyVoiceMinutesUsed?: number;
}

export default function AdminUsers() {
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [showAddMinutes, setShowAddMinutes] = useState(false);
  const [minutesToAdd, setMinutesToAdd] = useState("");
  const { toast } = useToast();

  const { data: users, isLoading } = useQuery<{ users: AdminUser[]; total: number }>({
    queryKey: ["/api/admin/users", { search }],
  });

  const addMinutesMutation = useMutation({
    mutationFn: async ({ userId, minutes }: { userId: string; minutes: number }) => {
      const response = await apiRequest("POST", `/api/admin/users/${userId}/minutes`, { minutes });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setShowAddMinutes(false);
      setSelectedUser(null);
      setMinutesToAdd("");
      toast({
        title: "Minutes added",
        description: "User credits have been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAddMinutes = () => {
    if (!selectedUser || !minutesToAdd) return;
    const minutes = parseInt(minutesToAdd);
    if (isNaN(minutes)) {
      toast({
        title: "Invalid input",
        description: "Please enter a valid number",
        variant: "destructive",
      });
      return;
    }
    addMinutesMutation.mutate({ userId: selectedUser.id, minutes });
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-foreground">User Management</h2>
            <p className="text-muted-foreground">Manage all platform users</p>
          </div>
        </div>

        {/* Search Bar */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <Search className="w-5 h-5 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or username..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1"
                data-testid="input-search-users"
              />
            </div>
          </CardContent>
        </Card>

        {/* Users Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Users ({users?.users?.length || users?.total || 0})</CardTitle>
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
                      <th className="text-left p-3 font-semibold">Grade Level</th>
                      <th className="text-left p-3 font-semibold">Subscription</th>
                      <th className="text-left p-3 font-semibold">Minutes</th>
                      <th className="text-left p-3 font-semibold">Created</th>
                      <th className="text-left p-3 font-semibold">Last Active</th>
                      <th className="text-left p-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users?.users?.map((user) => (
                      <tr key={user.id} className="border-b hover:bg-muted/50">
                        <td className="p-3">
                          <div>
                            <p className="font-medium">{user.username}</p>
                            <p className="text-sm text-muted-foreground">{user.email}</p>
                            {user.isAdmin && (
                              <Badge variant="secondary" className="mt-1">Admin</Badge>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="text-sm">{user.gradeLevel || "N/A"}</span>
                        </td>
                        <td className="p-3">
                          {user.subscriptionStatus ? (
                            <Badge
                              variant={user.subscriptionStatus === "active" ? "default" : "secondary"}
                            >
                              {user.subscriptionPlan || "N/A"}
                            </Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">No subscription</span>
                          )}
                        </td>
                        <td className="p-3">
                          <span className="text-sm font-medium">
                            {user.monthlyVoiceMinutesUsed || 0} / {user.monthlyVoiceMinutes || 0}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="text-sm text-muted-foreground">
                            {formatChicagoDate(user.createdAt)}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="text-sm text-muted-foreground" data-testid={`text-last-active-${user.id}`}>
                            {formatChicagoDateTime(user.lastActiveAt)}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center space-x-2">
                            <Link href={`/admin/users/${user.id}`}>
                              <Button
                                size="sm"
                                variant="outline"
                                data-testid={`button-view-user-${user.id}`}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </Link>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedUser(user);
                                setShowAddMinutes(true);
                              }}
                              data-testid={`button-add-minutes-${user.id}`}
                            >
                              <CreditCard className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Minutes Dialog */}
      <Dialog open={showAddMinutes} onOpenChange={setShowAddMinutes}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Bonus Minutes</DialogTitle>
            <DialogDescription>
              Add or remove voice minutes for {selectedUser?.username}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Minutes (use negative to remove)</Label>
              <Input
                type="number"
                value={minutesToAdd}
                onChange={(e) => setMinutesToAdd(e.target.value)}
                placeholder="e.g., 60 or -30"
                data-testid="input-minutes-amount"
              />
            </div>
            <div className="text-sm text-muted-foreground">
              Current bonus minutes: {selectedUser?.bonusMinutes || 0}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddMinutes(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddMinutes}
              disabled={addMinutesMutation.isPending}
              data-testid="button-confirm-add-minutes"
            >
              {addMinutesMutation.isPending ? "Adding..." : "Add Minutes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
