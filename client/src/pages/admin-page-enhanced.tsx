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
import { formatChicagoDateTime, formatChicagoDate } from "@/lib/date-utils";
import { useState } from "react";
import { useLocation } from "wouter";
import { Download, Users, Clock, Activity, TrendingUp, FileText, DollarSign, Mail, Shield, AlertTriangle, Eye, BarChart3, Calendar } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface PageViewsStats {
  todayCount: number;
  thisWeekViews: number;
  lastWeekViews: number;
  weeklyWoWPercent: number | null;
  thisMonthViews: number;
  lastMonthViews: number;
  monthlyHistory: Array<{ month: string; label: string; views: number }>;
}

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
    ageGroup?: string;
    duration?: string;
    startedAt: string;
    minutesUsed: number;
    status?: string;
  }>;
  totalVoiceMinutes?: number;
  totalMinutesUsed?: number;
  usageBySubject?: Array<{ 
    subject: string; 
    sessions: number;
    minutes?: number;
  }>;
}

interface AdminUser {
  id: string;
  username: string;
  email: string;
  isAdmin: boolean;
  subscriptionStatus?: string;
  subscriptionPlan?: string;
  voiceMinutesRemaining?: number;
  purchasedMinutesBalance?: number;
  subscriptionMinutesUsed?: number;
  subscriptionMinutesLimit?: number;
  maxConcurrentLogins?: number;
  firstName?: string;
  lastName?: string;
  studentName?: string;
  parentName?: string;
  // Trial fields
  isTrialActive?: boolean;
  trialMinutesUsed?: number;
  trialMinutesTotal?: number;
  // Activity tracking
  lastActiveAt?: string | null;
}

interface AdminUsersData {
  users: AdminUser[];
  total: number;
  totalPages?: number;
  totalCount?: number;
}

interface TrialLead {
  id: string;
  email: string | null;
  status: string | null;
  verifiedAt: string | null;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  consumedSeconds: number | null;
  createdAt: string | null;
}

interface TrialLeadsData {
  leads: TrialLead[];
  total: number;
  page: number;
  totalPages: number;
}

interface SafetyIncident {
  id: string;
  sessionId: string | null;
  studentId: string | null;
  userId: string | null;
  flagType: string;
  severity: 'info' | 'warning' | 'alert' | 'critical';
  triggerText: string | null;
  tutorResponse: string | null;
  actionTaken: string | null;
  adminNotified: boolean | null;
  parentNotified: boolean | null;
  createdAt: string | null;
  studentName?: string;
  parentEmail?: string;
}

interface SafetyIncidentsData {
  incidents: SafetyIncident[];
  total: number;
  page: number;
  totalPages: number;
}

interface SessionData {
  id: string;
  studentName: string;
  subject: string;
  ageGroup?: string;
  duration?: string;
  startedAt: string;
  endedAt?: string;
  minutesUsed: number;
  status?: string;
  closeReason?: string;
  closeDetails?: { wsCloseCode?: number };
  reconnectCount?: number;
  lastHeartbeatAt?: string;
}

interface SessionsData {
  sessions: SessionData[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface TopUsageUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  parentName?: string;
  studentName?: string;
  subscriptionPlan?: string;
  subscriptionStatus?: string;
  subscriptionMinutesUsed?: number;
  subscriptionMinutesLimit?: number;
  purchasedMinutesBalance?: number;
  isTrialActive?: boolean;
  trialMinutesUsed?: number;
  trialMinutesTotal?: number;
  createdAt?: string;
}

interface TopUsageData {
  users: TopUsageUser[];
  totalUsers: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export default function AdminPageEnhanced() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [trialLeadsPage, setTrialLeadsPage] = useState(1);
  const [safetyIncidentsPage, setSafetyIncidentsPage] = useState(1);
  const [sessionsPage, setSessionsPage] = useState(1);
  const [usagePage, setUsagePage] = useState(1);
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
    queryFn: async () => {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '10',
        search: searchTerm,
      });
      const response = await fetch(`/api/admin/users?${params}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch users: ${response.status}`);
      }
      return response.json();
    },
    enabled: !!user?.isAdmin,
  });

  const { data: analytics } = useQuery<AdminAnalytics>({
    queryKey: ["/api/admin/analytics"],
    enabled: !!user?.isAdmin,
  });

  const { data: pageViewsStats } = useQuery<PageViewsStats>({
    queryKey: ["/api/admin/page-views-stats"],
    enabled: !!user?.isAdmin,
  });

  const { data: trialLeadsData, isLoading: trialLeadsLoading } = useQuery<TrialLeadsData>({
    queryKey: ["/api/admin/trial-leads", trialLeadsPage],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: trialLeadsPage.toString(),
        limit: '20',
      });
      const response = await fetch(`/api/admin/trial-leads?${params}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch trial leads: ${response.status}`);
      }
      return response.json();
    },
    enabled: !!user?.isAdmin && activeTab === 'trial-leads',
  });

  const { data: safetyIncidentsData, isLoading: safetyIncidentsLoading } = useQuery<SafetyIncidentsData>({
    queryKey: ["/api/admin/safety-incidents", safetyIncidentsPage],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: safetyIncidentsPage.toString(),
        limit: '20',
      });
      const response = await fetch(`/api/admin/safety-incidents?${params}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch safety incidents: ${response.status}`);
      }
      return response.json();
    },
    enabled: !!user?.isAdmin && activeTab === 'safety-incidents',
  });

  const { data: sessionsData, isLoading: sessionsLoading } = useQuery<SessionsData>({
    queryKey: ["/api/admin/sessions", sessionsPage],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: sessionsPage.toString(),
        limit: '20',
      });
      const response = await fetch(`/api/admin/sessions?${params}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch sessions: ${response.status}`);
      }
      return response.json();
    },
    enabled: !!user?.isAdmin && activeTab === 'sessions',
  });

  const { data: topUsageData, isLoading: topUsageLoading } = useQuery<TopUsageData>({
    queryKey: ["/api/admin/usage/top-users", usagePage],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: usagePage.toString(),
        limit: '10',
      });
      const response = await fetch(`/api/admin/usage/top-users?${params}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch top usage users: ${response.status}`);
      }
      return response.json();
    },
    enabled: !!user?.isAdmin && activeTab === 'usage',
  });

  // Direct link export - more reliable for file downloads with session auth
  const handleExportDirect = (type: string) => {
    let endpoint = '/api/admin/export';
    if (type === 'sessions') endpoint = '/api/admin/sessions/export';
    if (type === 'trial-leads') endpoint = '/api/admin/trial-leads/export';
    
    // Use window.location for direct download - this ensures cookies are sent
    window.location.href = endpoint;
  };

  // Keep mutation for backwards compatibility but use direct approach
  const exportMutation = useMutation({
    mutationFn: async (type: string) => {
      // Use direct link approach - more reliable with session cookies
      handleExportDirect(type);
      return { type };
    },
    onSuccess: async ({ type }) => {
      toast({
        title: "Export started",
        description: `Downloading ${type} export...`,
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
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
              <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>
              <TabsTrigger value="sessions" data-testid="tab-sessions">Sessions</TabsTrigger>
              <TabsTrigger value="trial-leads" data-testid="tab-trial-leads">Trial Leads</TabsTrigger>
              <TabsTrigger value="safety-incidents" data-testid="tab-safety-incidents">Safety</TabsTrigger>
              <TabsTrigger value="usage" data-testid="tab-usage">Usage</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              {/* Site Views Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Site Visits (Today)</CardTitle>
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="text-site-views-today">
                      {pageViewsStats?.todayCount != null ? pageViewsStats.todayCount.toLocaleString() : '—'}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Unique visits today
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Site Visits (This Week)</CardTitle>
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="text-site-views-week">
                      {pageViewsStats?.thisWeekViews != null ? pageViewsStats.thisWeekViews.toLocaleString() : '—'}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {pageViewsStats?.weeklyWoWPercent != null ? (
                        <span className={
                          pageViewsStats.weeklyWoWPercent > 0 
                            ? 'text-green-600' 
                            : pageViewsStats.weeklyWoWPercent < 0 
                              ? 'text-red-600' 
                              : ''
                        }>
                          {pageViewsStats.weeklyWoWPercent > 0 ? '+' : ''}{pageViewsStats.weeklyWoWPercent}% vs last week
                        </span>
                      ) : (
                        <span>— vs last week</span>
                      )}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Site Visits (This Month)</CardTitle>
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="text-site-views-month">
                      {pageViewsStats?.thisMonthViews != null ? pageViewsStats.thisMonthViews.toLocaleString() : '—'}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      vs {(pageViewsStats?.lastMonthViews || 0).toLocaleString()} last month
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Last 12 Months Total</CardTitle>
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="text-site-views-12mo">
                      {pageViewsStats?.monthlyHistory ? pageViewsStats.monthlyHistory.reduce((sum, m) => sum + m.views, 0).toLocaleString() : '—'}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Total visits
                    </p>
                  </CardContent>
                </Card>
              </div>

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

              {/* Site Visits History Chart */}
              {pageViewsStats?.monthlyHistory && pageViewsStats.monthlyHistory.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <BarChart3 className="w-5 h-5" />
                      <span>Site Visits History (Last 12 Months)</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={[...pageViewsStats.monthlyHistory].reverse()}>
                        <XAxis 
                          dataKey="label" 
                          tick={{ fontSize: 11 }} 
                          angle={-45}
                          textAnchor="end"
                          height={60}
                        />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip 
                          formatter={(value: number) => [value.toLocaleString(), 'Views']}
                          labelFormatter={(label) => `Month: ${label}`}
                        />
                        <Bar dataKey="views" fill="#dc2626" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                    
                    {/* Monthly breakdown table */}
                    <div className="mt-4 max-h-48 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Month</TableHead>
                            <TableHead className="text-right">Views</TableHead>
                            <TableHead className="text-right">Change</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pageViewsStats.monthlyHistory.map((month, idx) => {
                            const prevMonth = pageViewsStats.monthlyHistory[idx + 1];
                            const change = prevMonth && prevMonth.views > 0
                              ? ((month.views - prevMonth.views) / prevMonth.views * 100).toFixed(0)
                              : null;
                            return (
                              <TableRow key={month.month}>
                                <TableCell>{month.label}</TableCell>
                                <TableCell className="text-right">{month.views.toLocaleString()}</TableCell>
                                <TableCell className={`text-right ${Number(change) > 0 ? 'text-green-600' : Number(change) < 0 ? 'text-red-600' : ''}`}>
                                  {change !== null ? `${Number(change) > 0 ? '+' : ''}${change}%` : '-'}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
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
                            <TableHead>Last Active</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {usersData?.users?.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                No users found
                              </TableCell>
                            </TableRow>
                          ) : (
                            usersData?.users?.map((userData, index: number) => (
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
                                    {userData.isTrialActive ? (
                                      <>
                                        <div className="font-medium text-blue-600">
                                          Trial: {userData.trialMinutesUsed || 0} / {userData.trialMinutesTotal || 30} min
                                        </div>
                                        {(userData.purchasedMinutesBalance || 0) > 0 && (
                                          <div className="text-xs text-muted-foreground">
                                            +{userData.purchasedMinutesBalance} purchased
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <>
                                        <div className="font-medium">
                                          {userData.subscriptionMinutesUsed || 0} / {userData.subscriptionMinutesLimit || 0} min
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                          +{userData.purchasedMinutesBalance || 0} purchased
                                        </div>
                                      </>
                                    )}
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
                                  <span className="text-sm text-muted-foreground" data-testid={`text-last-active-${index}`}>
                                    {formatChicagoDateTime(userData.lastActiveAt)}
                                  </span>
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
                  {sessionsLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
                    </div>
                  ) : sessionsData?.sessions && sessionsData.sessions.length > 0 ? (
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
                            <TableHead>Close Reason</TableHead>
                            <TableHead>Reconnects</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sessionsData.sessions.map((session, index: number) => (
                            <TableRow key={session.id || index} data-testid={`session-row-${session.id}`}>
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
                                {formatChicagoDate(session.startedAt)}
                              </TableCell>
                              <TableCell>
                                <Badge variant={session.status === 'ended' ? 'default' : 'secondary'}>
                                  {session.status || 'unknown'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <span className="text-xs" data-testid={`text-close-reason-${index}`}>
                                  {session.closeReason ? (
                                    <span className="flex flex-col">
                                      <span>{session.closeReason}</span>
                                      {session.closeDetails?.wsCloseCode && (
                                        <span className="text-muted-foreground">
                                          WS: {session.closeDetails.wsCloseCode}
                                        </span>
                                      )}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </span>
                              </TableCell>
                              <TableCell>
                                <span className="text-xs" data-testid={`text-reconnects-${index}`}>
                                  {session.reconnectCount !== undefined && session.reconnectCount > 0 ? (
                                    <Badge variant="outline">{session.reconnectCount}</Badge>
                                  ) : (
                                    <span className="text-muted-foreground">0</span>
                                  )}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      
                      {/* Pagination */}
                      <div className="flex justify-between items-center mt-4">
                        <p className="text-sm text-muted-foreground">
                          Showing {((sessionsPage - 1) * 20) + 1} - {Math.min(sessionsPage * 20, sessionsData.total)} of {sessionsData.total} total sessions
                        </p>
                        {sessionsData.totalPages > 1 && (
                          <div className="flex gap-2 items-center">
                            <span className="text-sm text-muted-foreground">
                              Page {sessionsData.page} of {sessionsData.totalPages}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSessionsPage(p => Math.max(1, p - 1))}
                              disabled={sessionsPage === 1}
                              data-testid="button-sessions-prev"
                            >
                              Previous
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSessionsPage(p => Math.min(sessionsData.totalPages, p + 1))}
                              disabled={sessionsPage >= sessionsData.totalPages}
                              data-testid="button-sessions-next"
                            >
                              Next
                            </Button>
                          </div>
                        )}
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

            {/* Trial Leads Tab */}
            <TabsContent value="trial-leads" className="space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Mail className="h-5 w-5" />
                      Trial Lead Emails
                    </CardTitle>
                    <CardDescription>
                      Email addresses collected from free trial signups ({trialLeadsData?.total || 0} total)
                    </CardDescription>
                  </div>
                  <Button 
                    onClick={() => exportMutation.mutate('trial-leads')}
                    disabled={exportMutation.isPending}
                    variant="outline"
                    className="flex items-center space-x-2"
                    data-testid="button-export-trial-leads"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export CSV</span>
                  </Button>
                </CardHeader>
                <CardContent>
                  {trialLeadsLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
                    </div>
                  ) : (
                    <>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Email</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Verified</TableHead>
                            <TableHead>Time Used</TableHead>
                            <TableHead>Created</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {trialLeadsData?.leads?.map((lead) => (
                            <TableRow key={lead.id} data-testid={`trial-lead-row-${lead.id}`}>
                              <TableCell className="font-medium">{lead.email || '(hidden)'}</TableCell>
                              <TableCell>
                                <Badge variant={
                                  lead.status === 'active' ? 'default' :
                                  lead.status === 'expired' ? 'secondary' :
                                  lead.status === 'pending' ? 'outline' : 'destructive'
                                }>
                                  {lead.status || 'unknown'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {formatChicagoDate(lead.verifiedAt)}
                              </TableCell>
                              <TableCell>
                                {lead.consumedSeconds ? `${Math.floor(lead.consumedSeconds / 60)}m ${lead.consumedSeconds % 60}s` : '0s'}
                              </TableCell>
                              <TableCell>
                                {formatChicagoDateTime(lead.createdAt)}
                              </TableCell>
                            </TableRow>
                          ))}
                          {(!trialLeadsData?.leads || trialLeadsData.leads.length === 0) && (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                                No trial leads yet
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                      
                      {trialLeadsData && trialLeadsData.totalPages > 1 && (
                        <div className="flex justify-between items-center mt-4">
                          <p className="text-sm text-muted-foreground">
                            Page {trialLeadsData.page} of {trialLeadsData.totalPages}
                          </p>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setTrialLeadsPage(p => Math.max(1, p - 1))}
                              disabled={trialLeadsPage === 1}
                            >
                              Previous
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setTrialLeadsPage(p => Math.min(trialLeadsData.totalPages, p + 1))}
                              disabled={trialLeadsPage >= trialLeadsData.totalPages}
                            >
                              Next
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Safety Incidents Tab */}
            <TabsContent value="safety-incidents" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Safety Incidents
                  </CardTitle>
                  <CardDescription>
                    Review flagged sessions and safety-related incidents ({safetyIncidentsData?.total || 0} total)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {safetyIncidentsLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
                    </div>
                  ) : (
                    <>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Type</TableHead>
                            <TableHead>Severity</TableHead>
                            <TableHead>Trigger Text</TableHead>
                            <TableHead>Action</TableHead>
                            <TableHead>Notified</TableHead>
                            <TableHead>Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {safetyIncidentsData?.incidents?.map((incident) => (
                            <TableRow key={incident.id} data-testid={`safety-incident-row-${incident.id}`}>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  <AlertTriangle className={`h-4 w-4 ${
                                    incident.severity === 'critical' ? 'text-red-500' :
                                    incident.severity === 'alert' ? 'text-orange-500' :
                                    incident.severity === 'warning' ? 'text-yellow-500' :
                                    'text-blue-500'
                                  }`} />
                                  {incident.flagType.replace(/_/g, ' ')}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant={
                                  incident.severity === 'critical' ? 'destructive' :
                                  incident.severity === 'alert' ? 'default' :
                                  incident.severity === 'warning' ? 'secondary' : 'outline'
                                }>
                                  {incident.severity}
                                </Badge>
                              </TableCell>
                              <TableCell className="max-w-xs truncate" title={incident.triggerText || ''}>
                                {incident.triggerText ? incident.triggerText.substring(0, 50) + (incident.triggerText.length > 50 ? '...' : '') : '-'}
                              </TableCell>
                              <TableCell>
                                <span className="text-xs text-muted-foreground">{incident.actionTaken || '-'}</span>
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  {incident.adminNotified && <Badge variant="outline" className="text-xs">Admin</Badge>}
                                  {incident.parentNotified && <Badge variant="outline" className="text-xs">Parent</Badge>}
                                  {!incident.adminNotified && !incident.parentNotified && <span className="text-muted-foreground">-</span>}
                                </div>
                              </TableCell>
                              <TableCell>
                                {formatChicagoDateTime(incident.createdAt)}
                              </TableCell>
                            </TableRow>
                          ))}
                          {(!safetyIncidentsData?.incidents || safetyIncidentsData.incidents.length === 0) && (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                No safety incidents recorded
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                      
                      {safetyIncidentsData && safetyIncidentsData.totalPages > 1 && (
                        <div className="flex justify-between items-center mt-4">
                          <p className="text-sm text-muted-foreground">
                            Page {safetyIncidentsData.page} of {safetyIncidentsData.totalPages}
                          </p>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSafetyIncidentsPage(p => Math.max(1, p - 1))}
                              disabled={safetyIncidentsPage === 1}
                            >
                              Previous
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSafetyIncidentsPage(p => Math.min(safetyIncidentsData.totalPages, p + 1))}
                              disabled={safetyIncidentsPage >= safetyIncidentsData.totalPages}
                            >
                              Next
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
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
                      {analytics.usageBySubject.map((item, index: number) => (
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
                  <CardDescription>Highest minute consumers on the platform ({topUsageData?.totalUsers || 0} total users)</CardDescription>
                </CardHeader>
                <CardContent>
                  {topUsageLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
                    </div>
                  ) : topUsageData?.users && topUsageData.users.length > 0 ? (
                    <div className="space-y-4">
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
                          {topUsageData.users.map((user, index: number) => (
                            <TableRow key={user.id || index} data-testid={`usage-user-row-${user.id}`}>
                              <TableCell className="font-medium">
                                {user.parentName || user.studentName || user.firstName || 'Unknown'}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">{user.email}</TableCell>
                              <TableCell>
                                <Badge variant={user.subscriptionPlan === 'elite' ? 'default' : 'secondary'}>
                                  {user.subscriptionPlan?.toUpperCase() || 'FREE'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm">
                                  {user.isTrialActive ? (
                                    <>
                                      <div className="font-medium text-blue-600">
                                        Trial: {user.trialMinutesUsed || 0} / {user.trialMinutesTotal || 30}
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        {user.trialMinutesTotal ? Math.round(((user.trialMinutesUsed || 0) / user.trialMinutesTotal) * 100) : 0}% used
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <div className="font-medium">
                                        {user.subscriptionMinutesUsed || 0} / {user.subscriptionMinutesLimit || 0}
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        {user.subscriptionMinutesLimit ? Math.round(((user.subscriptionMinutesUsed || 0) / user.subscriptionMinutesLimit) * 100) : 0}% used
                                      </div>
                                    </>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">{user.purchasedMinutesBalance || 0} min</Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      
                      {/* Pagination */}
                      <div className="flex justify-between items-center mt-4">
                        <p className="text-sm text-muted-foreground">
                          Showing {((usagePage - 1) * 10) + 1} - {Math.min(usagePage * 10, topUsageData.totalUsers)} of {topUsageData.totalUsers} users
                        </p>
                        {topUsageData.totalPages > 1 && (
                          <div className="flex gap-2 items-center">
                            <span className="text-sm text-muted-foreground">
                              Page {topUsageData.page} of {topUsageData.totalPages}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setUsagePage(p => Math.max(1, p - 1))}
                              disabled={usagePage === 1}
                              data-testid="button-usage-prev"
                            >
                              Previous
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setUsagePage(p => Math.min(topUsageData.totalPages, p + 1))}
                              disabled={usagePage >= topUsageData.totalPages}
                              data-testid="button-usage-next"
                            >
                              Next
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
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
