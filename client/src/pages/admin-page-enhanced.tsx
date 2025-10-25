import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { NavigationHeader } from "@/components/navigation-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { useLocation } from "wouter";
import { Download, Users, Clock, Activity, TrendingUp, FileText, DollarSign } from "lucide-react";

interface AdminStats {
  totalUsers?: number;
  activeSubscriptions?: number;
  avgSessionTime?: string;
  monthlyRevenue?: number;
  totalVoiceMinutes?: number;
  totalMinutesUsed?: number;
  totalDocuments?: number;
}

interface AdminAnalytics {
  newUsersThisMonth?: number;
  totalSessions?: number;
  sessionsThisWeek?: number;
  totalUsers?: number;
  totalDocuments?: number;
  recentSessions?: Array<{
    id: string;
    studentName: string;
    subject: string;
    startedAt: string;
    minutesUsed: number;
  }>;
  totalVoiceMinutes?: number;
  totalMinutesUsed?: number;
  usageBySubject?: Array<{ subject: string; sessions: number }>;
}

interface AdminUser {
  id: string;
  username: string;
  email: string;
  isAdmin: boolean;
  subscriptionStatus?: string;
  voiceMinutesRemaining?: number;
}

interface AdminUsersData {
  users: AdminUser[];
  total: number;
  totalPages?: number;
  totalCount?: number;
}

export default function AdminPageEnhanced() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState("overview");

  // Check admin access
  if (!user?.isAdmin) {
    setLocation("/");
    return null;
  }

  const { data: stats, isLoading: statsLoading } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
    enabled: !!user?.isAdmin,
  });

  const { data: usersData, isLoading: usersLoading } = useQuery<AdminUsersData>({
    queryKey: ["/api/admin/users", currentPage, searchTerm],
    enabled: !!user?.isAdmin,
  });

  const { data: analytics } = useQuery<AdminAnalytics>({
    queryKey: ["/api/admin/analytics"],
    enabled: !!user?.isAdmin,
  });

  const exportMutation = useMutation({
    mutationFn: async (type: string) => {
      const endpoint = type === 'sessions' ? '/api/admin/sessions/export' : '/api/admin/export';
      const response = await fetch(endpoint, {
        method: 'GET',
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`);
      }
      
      return { response, type };
    },
    onSuccess: async ({ response, type }) => {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = type === 'sessions' ? 'sessions-export.csv' : 'users-export.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Export successful",
        description: `${type === 'sessions' ? 'Session' : 'User'} data exported to CSV.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Export failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
  };

  if (statsLoading) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationHeader />
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader />
      
      <div className="flex-1 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="text-admin-title">
                Elite Admin Dashboard
              </h1>
              <p className="text-muted-foreground">Comprehensive platform management and analytics</p>
            </div>
            <div className="flex space-x-2">
              <Button 
                onClick={() => exportMutation.mutate('users')}
                disabled={exportMutation.isPending}
                variant="outline"
                className="flex items-center space-x-2"
                data-testid="button-export-users"
              >
                <Download className="w-4 h-4" />
                <span>Export Users</span>
              </Button>
              <Button 
                onClick={() => exportMutation.mutate('sessions')}
                disabled={exportMutation.isPending}
                variant="outline"
                className="flex items-center space-x-2"
                data-testid="button-export-sessions"
              >
                <Download className="w-4 h-4" />
                <span>Export Sessions</span>
              </Button>
            </div>
          </div>

          {/* Tab Navigation */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
              <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>
              <TabsTrigger value="sessions" data-testid="tab-sessions">Sessions</TabsTrigger>
              <TabsTrigger value="usage" data-testid="tab-usage">Usage Reports</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              {/* Key Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="text-total-users">
                      {stats?.totalUsers || 0}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      +{analytics?.newUsersThisMonth || 0} this month
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="text-active-subscriptions">
                      {stats?.activeSubscriptions || 0}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {((stats?.activeSubscriptions || 0) / (stats?.totalUsers || 1) * 100).toFixed(1)}% conversion
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
                    <Activity className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="text-total-sessions">
                      {analytics?.totalSessions || 0}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {analytics?.sessionsThisWeek || 0} this week
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Avg Session</CardTitle>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="text-avg-session">
                      {stats?.avgSessionTime || "0 min"}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Per tutoring session
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Revenue & Engagement */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <DollarSign className="w-5 h-5" />
                      <span>Revenue Overview</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Monthly Recurring Revenue</span>
                      <span className="text-lg font-bold">${stats?.monthlyRevenue || 0}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Avg Revenue Per User</span>
                      <span className="text-lg font-bold">
                        ${(stats && stats.totalUsers && stats.totalUsers > 0) ? ((stats.monthlyRevenue || 0) / stats.totalUsers).toFixed(2) : '0.00'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Total Lifetime Value</span>
                      <span className="text-lg font-bold">${((stats?.monthlyRevenue || 0) * 12).toFixed(2)}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <FileText className="w-5 h-5" />
                      <span>Engagement Metrics</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Total Voice Minutes</span>
                      <span className="text-lg font-bold">{analytics?.totalVoiceMinutes || analytics?.totalMinutesUsed || 0} min</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Avg Minutes Per User</span>
                      <span className="text-lg font-bold">
                        {(stats && stats.totalUsers && stats.totalUsers > 0) ? ((analytics?.totalVoiceMinutes || analytics?.totalMinutesUsed || 0) / stats.totalUsers).toFixed(1) : '0'} min
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Documents Uploaded</span>
                      <span className="text-lg font-bold">{analytics?.totalDocuments || 0}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Users Tab */}
            <TabsContent value="users" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>User Management</CardTitle>
                      <CardDescription>Manage user accounts, subscriptions, and contact information</CardDescription>
                    </div>
                    <form onSubmit={handleSearch} className="flex items-center space-x-2">
                      <Input
                        type="search"
                        placeholder="Search users..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-64"
                        data-testid="input-search-users"
                      />
                      <Button type="submit" size="sm">Search</Button>
                    </form>
                  </div>
                </CardHeader>
                
                <CardContent>
                  {usersLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>User Info</TableHead>
                            <TableHead>Contact</TableHead>
                            <TableHead>Plan</TableHead>
                            <TableHead>Usage</TableHead>
                            <TableHead>Devices</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {usersData?.users?.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                No users found
                              </TableCell>
                            </TableRow>
                          ) : (
                            usersData?.users?.map((userData: any, index: number) => (
                              <TableRow key={userData.id} data-testid={`row-user-${index}`}>
                                <TableCell>
                                  <div className="flex items-center">
                                    <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center mr-3">
                                      <span className="text-primary-foreground font-medium text-sm">
                                        {userData.firstName?.[0] || userData.username[0].toUpperCase()}
                                      </span>
                                    </div>
                                    <div>
                                      <div className="font-medium text-foreground">
                                        {userData.firstName && userData.lastName 
                                          ? `${userData.firstName} ${userData.lastName}`
                                          : userData.username
                                        }
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        {userData.parentName && `Parent: ${userData.parentName}`}
                                      </div>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="text-sm">
                                    <div className="font-medium">{userData.email}</div>
                                    {userData.studentName && (
                                      <div className="text-xs text-muted-foreground">Student: {userData.studentName}</div>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant={userData.subscriptionPlan === 'elite' ? 'default' : 'secondary'}>
                                    {userData.subscriptionPlan?.toUpperCase() || 'Starter'}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <div className="text-sm">
                                    <div className="font-medium">
                                      {userData.subscriptionMinutesUsed || 0} / {userData.subscriptionMinutesLimit || 60} min
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      +{userData.purchasedMinutesBalance || 0} purchased
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="text-sm">
                                  {userData.maxConcurrentLogins || 1}/{userData.maxConcurrentLogins || 1}
                                </TableCell>
                                <TableCell>
                                  <Badge variant={userData.subscriptionStatus === 'active' ? 'default' : 'secondary'}>
                                    {userData.subscriptionStatus || 'Active'}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={() => setLocation(`/admin/users/${userData.id}`)}
                                    data-testid={`button-view-user-${index}`}
                                  >
                                    View
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  {usersData && usersData.totalPages && usersData.totalPages > 1 && (
                    <div className="mt-4 flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        Showing {((currentPage - 1) * 10) + 1} to {Math.min(currentPage * 10, usersData.total || 0)} of {usersData.total} users
                      </div>
                      <div className="flex space-x-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setCurrentPage(currentPage - 1)}
                          disabled={currentPage <= 1}
                        >
                          Previous
                        </Button>
                        <Button variant="outline" size="sm" className="bg-primary text-primary-foreground">
                          {currentPage}
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setCurrentPage(currentPage + 1)}
                          disabled={!usersData.totalPages || currentPage >= usersData.totalPages}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Sessions Tab */}
            <TabsContent value="sessions" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Sessions</CardTitle>
                  <CardDescription>All voice tutoring sessions across the platform</CardDescription>
                </CardHeader>
                <CardContent>
                  {analytics?.recentSessions && analytics.recentSessions.length > 0 ? (
                    <div className="space-y-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Student</TableHead>
                            <TableHead>Subject</TableHead>
                            <TableHead>Age Group</TableHead>
                            <TableHead>Duration</TableHead>
                            <TableHead>Minutes Used</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {analytics.recentSessions.slice(0, 20).map((session: any, index: number) => (
                            <TableRow key={session.id || index}>
                              <TableCell className="font-medium">
                                {session.studentName || 'Unknown'}
                              </TableCell>
                              <TableCell>{session.subject || 'N/A'}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{session.ageGroup || 'N/A'}</Badge>
                              </TableCell>
                              <TableCell>
                                {session.duration || 'N/A'}
                              </TableCell>
                              <TableCell>{session.minutesUsed || 0} min</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {session.startedAt ? new Date(session.startedAt).toLocaleDateString() : 'N/A'}
                              </TableCell>
                              <TableCell>
                                <Badge variant={session.status === 'ended' ? 'default' : 'secondary'}>
                                  {session.status || 'unknown'}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      <div className="text-sm text-muted-foreground text-center pt-4">
                        Showing {Math.min(20, analytics.recentSessions.length)} of {analytics.recentSessions.length} total sessions
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No sessions found
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Usage Reports Tab */}
            <TabsContent value="usage" className="space-y-4">
              {/* Voice Minutes Usage */}
              <Card>
                <CardHeader>
                  <CardTitle>Voice Minutes Usage</CardTitle>
                  <CardDescription>Detailed breakdown of platform-wide minute consumption</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-muted-foreground">Total Minutes Used</div>
                      <div className="text-3xl font-bold">{analytics?.totalVoiceMinutes || analytics?.totalMinutesUsed || 0}</div>
                      <div className="text-xs text-muted-foreground">Across all users</div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-muted-foreground">Average per User</div>
                      <div className="text-3xl font-bold">
                        {(analytics && analytics.totalUsers && analytics.totalUsers > 0) 
                          ? Math.round(((analytics.totalVoiceMinutes || analytics.totalMinutesUsed || 0) / analytics.totalUsers)) 
                          : 0}
                      </div>
                      <div className="text-xs text-muted-foreground">Minutes per user</div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-muted-foreground">Total Sessions</div>
                      <div className="text-3xl font-bold">{analytics?.totalSessions || 0}</div>
                      <div className="text-xs text-muted-foreground">Voice conversations</div>
                    </div>
                  </div>

                  {analytics?.usageBySubject && analytics.usageBySubject.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold">Usage by Subject</h4>
                      {analytics.usageBySubject.map((item: any, index: number) => (
                        <div key={index} className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <Badge variant="secondary">{item.subject}</Badge>
                            <span className="text-sm text-muted-foreground">{item.sessions} sessions</span>
                          </div>
                          <span className="text-sm font-medium">{item.minutes || 0} min</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Top Users by Usage */}
              <Card>
                <CardHeader>
                  <CardTitle>Top Users by Minutes</CardTitle>
                  <CardDescription>Highest minute consumers on the platform</CardDescription>
                </CardHeader>
                <CardContent>
                  {usersData?.users && usersData.users.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Plan</TableHead>
                          <TableHead>Minutes Used</TableHead>
                          <TableHead>Purchased Minutes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {usersData.users
                          .sort((a: any, b: any) => 
                            (b.subscriptionMinutesUsed || 0) - (a.subscriptionMinutesUsed || 0)
                          )
                          .slice(0, 10)
                          .map((user: any, index: number) => (
                            <TableRow key={user.id || index}>
                              <TableCell className="font-medium">
                                {user.parentName || user.studentName || user.firstName || 'Unknown'}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">{user.email}</TableCell>
                              <TableCell>
                                <Badge variant={user.subscriptionPlan === 'elite' ? 'default' : 'secondary'}>
                                  {user.subscriptionPlan?.toUpperCase() || 'Starter'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm">
                                  <div className="font-medium">
                                    {user.subscriptionMinutesUsed || 0} / {user.subscriptionMinutesLimit || 60}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {Math.round(((user.subscriptionMinutesUsed || 0) / (user.subscriptionMinutesLimit || 60)) * 100)}% used
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">{user.purchasedMinutesBalance || 0} min</Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No user data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
