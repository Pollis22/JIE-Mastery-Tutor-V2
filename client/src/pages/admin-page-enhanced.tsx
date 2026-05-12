import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { NavigationHeader } from "@/components/navigation-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatChicagoDateTime, formatChicagoDate } from "@/lib/date-utils";
import { useState } from "react";
import { useLocation } from "wouter";
import { Download, Users, Clock, Activity, TrendingUp, FileText, DollarSign, Mail, Shield, AlertTriangle, Eye, BarChart3, Calendar, ExternalLink } from "lucide-react";
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
  transcript?: Array<{
    speaker: 'tutor' | 'student';
    text: string;
    timestamp: string;
    messageId: string;
  }> | null;
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


interface TranscriptRow {
  id: string;
  userId: string;
  studentName?: string | null;
  subject?: string | null;
  ageGroup?: string | null;
  language?: string | null;
  startedAt: string;
  endedAt?: string | null;
  minutesUsed: number;
  status?: string | null;
  totalMessages?: number | null;
  strikeCount?: number | null;
  terminatedForSafety?: boolean | null;
  safetyFlagCount?: number | null;
  userEmail?: string | null;
  userFirstName?: string | null;
  userLastName?: string | null;
  parentEmail?: string | null;
  durationMinutes?: number | null;
  flagged: boolean;
}

interface TranscriptsListData {
  transcripts: TranscriptRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface TranscriptMessage {
  speaker: 'tutor' | 'student';
  text: string;
  timestamp: string;
  messageId: string;
}

interface SafetyFlag {
  type: string;
  timestamp: string;
  messageIndex?: number;
  triggerText?: string;
  tutorResponse?: string;
  severity: 'info' | 'warning' | 'alert' | 'critical';
}

interface TranscriptDetail {
  id: string;
  userId: string;
  studentName?: string | null;
  subject?: string | null;
  ageGroup?: string | null;
  language?: string | null;
  startedAt: string;
  endedAt?: string | null;
  minutesUsed: number;
  status?: string | null;
  transcript: TranscriptMessage[];
  summary?: string | null;
  safetyFlags?: SafetyFlag[] | null;
  strikeCount?: number | null;
  terminatedForSafety?: boolean | null;
  closeReason?: string | null;
  userEmail?: string | null;
  userFirstName?: string | null;
  userLastName?: string | null;
  parentEmail?: string | null;
}

export default function AdminPageEnhanced() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [trialLeadsPage, setTrialLeadsPage] = useState(1);
  const [safetyIncidentsPage, setSafetyIncidentsPage] = useState(1);
  const [selectedIncident, setSelectedIncident] = useState<SafetyIncident | null>(null);
  const [sessionsPage, setSessionsPage] = useState(1);
  const [usagePage, setUsagePage] = useState(1);
  const [activeTab, setActiveTab] = useState("overview");

  // ---- Transcripts tab state ----
  const [transcriptsPage, setTranscriptsPage] = useState(1);
  const [transcriptsSearch, setTranscriptsSearch] = useState("");
  const [transcriptsSearchInput, setTranscriptsSearchInput] = useState("");
  const [transcriptsFlaggedOnly, setTranscriptsFlaggedOnly] = useState(false);
  const [transcriptsFrom, setTranscriptsFrom] = useState("");
  const [transcriptsTo, setTranscriptsTo] = useState("");
  const [selectedTranscriptId, setSelectedTranscriptId] = useState<string | null>(null);


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

  // ---- Transcripts list query ----
  const { data: transcriptsData, isLoading: transcriptsLoading } = useQuery<TranscriptsListData>({
    queryKey: ["/api/admin/transcripts", transcriptsPage, transcriptsSearch, transcriptsFlaggedOnly, transcriptsFrom, transcriptsTo],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: transcriptsPage.toString(),
        limit: '25',
      });
      if (transcriptsSearch) params.set('search', transcriptsSearch);
      if (transcriptsFlaggedOnly) params.set('flaggedOnly', 'true');
      if (transcriptsFrom) params.set('from', transcriptsFrom);
      if (transcriptsTo) params.set('to', transcriptsTo);
      const response = await fetch(`/api/admin/transcripts?${params}`, { credentials: 'include' });
      if (!response.ok) throw new Error(`Failed to fetch transcripts: ${response.status}`);
      return response.json();
    },
    enabled: !!user?.isAdmin && activeTab === 'transcripts',
  });

  // ---- Single transcript detail query (lazy on dialog open) ----
  const { data: transcriptDetail, isLoading: transcriptDetailLoading } = useQuery<TranscriptDetail>({
    queryKey: ["/api/admin/transcripts", selectedTranscriptId],
    queryFn: async () => {
      const response = await fetch(`/api/admin/transcripts/${selectedTranscriptId}`, { credentials: 'include' });
      if (!response.ok) throw new Error(`Failed to fetch transcript: ${response.status}`);
      return response.json();
    },
    enabled: !!user?.isAdmin && !!selectedTranscriptId,
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

  // Generate a transcript PDF client-side from already-loaded detail data.
  // Pings the server first so the export is recorded in the admin audit log,
  // then renders the PDF locally via jsPDF (already a direct dep).
  const generateTranscriptPDF = async (detail: TranscriptDetail) => {
    try {
      // Audit-log ping (non-blocking — proceed with PDF either way)
      try {
        await fetch(`/api/admin/transcripts/${detail.id}/export?format=pdf-audit`, { credentials: 'include' });
      } catch { /* audit failure shouldn't block the export */ }

      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'pt', format: 'letter' });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 48;
      const contentWidth = pageWidth - margin * 2;
      let y = margin;

      const newPageIfNeeded = (needed: number) => {
        if (y + needed > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
      };

      const writeWrapped = (text: string, size: number, style: 'normal' | 'bold' = 'normal', leading = 1.35) => {
        doc.setFont('helvetica', style);
        doc.setFontSize(size);
        const lines = doc.splitTextToSize(text || '', contentWidth);
        const lineHeight = size * leading;
        lines.forEach((line: string) => {
          newPageIfNeeded(lineHeight);
          doc.text(line, margin, y);
          y += lineHeight;
        });
      };

      // ---- Header ----
      writeWrapped('JIE Tutor — Session Transcript', 18, 'bold');
      y += 6;

      doc.setDrawColor(180);
      doc.line(margin, y, pageWidth - margin, y);
      y += 14;

      const flagged = !!detail.terminatedForSafety || (detail.safetyFlags?.length || 0) > 0 || (detail.strikeCount || 0) > 0;

      const metaLines: Array<[string, string]> = [
        ['Student', `${detail.studentName || 'Unknown'} (${detail.ageGroup || 'N/A'})`],
        ['Subject', detail.subject || 'general'],
        ['Language', detail.language || 'en'],
        ['Started', formatChicagoDateTime(detail.startedAt)],
        ['Ended', detail.endedAt ? formatChicagoDateTime(detail.endedAt) : 'N/A'],
        ['Duration', `${detail.minutesUsed || 0} min`],
        ['Messages', String(detail.transcript?.length || 0)],
      ];
      if (detail.userEmail) {
        const userName = `${detail.userFirstName || ''} ${detail.userLastName || ''}`.trim();
        metaLines.push(['Account', userName ? `${userName} <${detail.userEmail}>` : detail.userEmail]);
      }
      if (detail.parentEmail) metaLines.push(['Transcript Email', detail.parentEmail]);
      if (flagged) metaLines.push(['Status', '⚠ FLAGGED']);

      doc.setFontSize(10);
      metaLines.forEach(([k, v]) => {
        newPageIfNeeded(14);
        doc.setFont('helvetica', 'bold');
        doc.text(`${k}:`, margin, y);
        doc.setFont('helvetica', 'normal');
        const valLines = doc.splitTextToSize(v, contentWidth - 100);
        valLines.forEach((vl: string, idx: number) => {
          if (idx > 0) { newPageIfNeeded(14); y += 14; }
          doc.text(vl, margin + 100, y);
        });
        y += 14;
      });

      // ---- Safety flags block ----
      if (detail.safetyFlags && detail.safetyFlags.length > 0) {
        y += 8;
        writeWrapped('Safety Flags', 12, 'bold');
        detail.safetyFlags.forEach(f => {
          const line = `• [${f.severity}] ${f.type}${f.triggerText ? ` — "${f.triggerText}"` : ''}`;
          writeWrapped(line, 10);
        });
      }

      // ---- Summary block ----
      if (detail.summary) {
        y += 8;
        writeWrapped('Session Summary', 12, 'bold');
        writeWrapped(detail.summary, 10);
      }

      // ---- Conversation ----
      y += 12;
      newPageIfNeeded(40);
      doc.setDrawColor(180);
      doc.line(margin, y, pageWidth - margin, y);
      y += 14;
      writeWrapped('Conversation', 13, 'bold');
      y += 4;

      if (!detail.transcript || detail.transcript.length === 0) {
        writeWrapped('(No messages recorded for this session.)', 10);
      } else {
        detail.transcript.forEach((msg, i) => {
          const speaker = (msg.speaker || '').toUpperCase();
          const t = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '';
          newPageIfNeeded(28);
          writeWrapped(`[${i + 1}] ${speaker}  ${t}`, 9, 'bold');
          writeWrapped(msg.text || '', 10);
          y += 4;
        });
      }

      y += 10;
      newPageIfNeeded(20);
      doc.setDrawColor(180);
      doc.line(margin, y, pageWidth - margin, y);
      y += 14;
      writeWrapped(`End of transcript — ${detail.transcript?.length || 0} messages`, 9, 'bold');

      doc.save(`transcript-${detail.id}.pdf`);
    } catch (err: any) {
      console.error('PDF export error:', err);
      toast({
        title: 'PDF export failed',
        description: err?.message || 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  // Lightweight variant for list-row exports — fetches detail first, then renders PDF.
  const exportTranscriptRowAsPDF = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/admin/transcripts/${sessionId}`, { credentials: 'include' });
      if (!response.ok) throw new Error(`Failed to fetch transcript: ${response.status}`);
      const detail: TranscriptDetail = await response.json();
      await generateTranscriptPDF(detail);
    } catch (err: any) {
      toast({
        title: 'PDF export failed',
        description: err?.message || 'Unknown error',
        variant: 'destructive',
      });
    }
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
            <TabsList className="grid w-full grid-cols-12">
              <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
              <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>
              <TabsTrigger value="sessions" data-testid="tab-sessions">Sessions</TabsTrigger>
              <TabsTrigger value="trial-leads" data-testid="tab-trial-leads">Trial Leads</TabsTrigger>
              <TabsTrigger value="safety-incidents" data-testid="tab-safety-incidents">Safety</TabsTrigger>
              <TabsTrigger value="usage" data-testid="tab-usage">Usage</TabsTrigger>
              <TabsTrigger value="pricing-studio" data-testid="tab-pricing-studio">Pricing Studio</TabsTrigger>
              <TabsTrigger value="investment-console" data-testid="tab-investment-console">Investment</TabsTrigger>
              <TabsTrigger value="capital-crm" data-testid="tab-capital-crm">Capital CRM</TabsTrigger>
              <TabsTrigger value="sales-crm" data-testid="tab-sales-crm">Sales CRM</TabsTrigger>
              <TabsTrigger value="family-tracker" data-testid="tab-family-tracker">Study Tracker</TabsTrigger>
                          <TabsTrigger value="transcripts" data-testid="tab-transcripts">Transcripts</TabsTrigger>
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


            {/* Transcripts Tab — quality control & safety incident review */}
            <TabsContent value="transcripts" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Session Transcripts
                  </CardTitle>
                  <CardDescription>
                    Full conversation logs from every voice tutoring session. Use for quality control, incident review, and forensic verification. Every view and export is recorded in the admin audit log.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Filter bar */}
                  <div className="flex flex-wrap gap-3 mb-4 items-end">
                    <div className="flex-1 min-w-[220px]">
                      <label className="text-xs text-muted-foreground block mb-1">Search (student, email, subject)</label>
                      <Input
                        placeholder="Search..."
                        value={transcriptsSearchInput}
                        onChange={(e) => setTranscriptsSearchInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            setTranscriptsSearch(transcriptsSearchInput);
                            setTranscriptsPage(1);
                          }
                        }}
                        data-testid="input-transcripts-search"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">From</label>
                      <Input
                        type="date"
                        value={transcriptsFrom}
                        onChange={(e) => { setTranscriptsFrom(e.target.value); setTranscriptsPage(1); }}
                        data-testid="input-transcripts-from"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">To</label>
                      <Input
                        type="date"
                        value={transcriptsTo}
                        onChange={(e) => { setTranscriptsTo(e.target.value); setTranscriptsPage(1); }}
                        data-testid="input-transcripts-to"
                      />
                    </div>
                    <div className="flex items-center gap-2 pb-2">
                      <input
                        type="checkbox"
                        id="transcripts-flagged-only"
                        checked={transcriptsFlaggedOnly}
                        onChange={(e) => { setTranscriptsFlaggedOnly(e.target.checked); setTranscriptsPage(1); }}
                        data-testid="checkbox-transcripts-flagged"
                      />
                      <label htmlFor="transcripts-flagged-only" className="text-sm cursor-pointer">Flagged only</label>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setTranscriptsSearchInput("");
                        setTranscriptsSearch("");
                        setTranscriptsFlaggedOnly(false);
                        setTranscriptsFrom("");
                        setTranscriptsTo("");
                        setTranscriptsPage(1);
                      }}
                      data-testid="button-transcripts-reset"
                    >
                      Reset
                    </Button>
                  </div>

                  {transcriptsLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
                    </div>
                  ) : transcriptsData?.transcripts && transcriptsData.transcripts.length > 0 ? (
                    <div className="space-y-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Student</TableHead>
                            <TableHead>User Email</TableHead>
                            <TableHead>Subject</TableHead>
                            <TableHead>Age</TableHead>
                            <TableHead>Duration</TableHead>
                            <TableHead>Messages</TableHead>
                            <TableHead>Started</TableHead>
                            <TableHead>Flags</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {transcriptsData.transcripts.map((row) => (
                            <TableRow
                              key={row.id}
                              className={row.flagged ? 'bg-red-50/40 dark:bg-red-950/20' : ''}
                              data-testid={`transcript-row-${row.id}`}
                            >
                              <TableCell className="font-medium">{row.studentName || 'Unknown'}</TableCell>
                              <TableCell className="text-sm">{row.userEmail || '—'}</TableCell>
                              <TableCell>{row.subject || 'N/A'}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{row.ageGroup || 'N/A'}</Badge>
                              </TableCell>
                              <TableCell>{row.durationMinutes !== null ? `${row.durationMinutes} min` : 'N/A'}</TableCell>
                              <TableCell>{row.totalMessages ?? 0}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {formatChicagoDate(row.startedAt)}
                              </TableCell>
                              <TableCell>
                                {row.flagged ? (
                                  <Badge variant="destructive" className="gap-1">
                                    <AlertTriangle className="h-3 w-3" />
                                    {(row.safetyFlagCount || 0) + (row.terminatedForSafety ? 1 : 0)}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground text-xs">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex gap-1 justify-end">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setSelectedTranscriptId(row.id)}
                                    data-testid={`button-view-transcript-${row.id}`}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => exportTranscriptRowAsPDF(row.id)}
                                    title="Download as PDF"
                                    data-testid={`button-export-transcript-${row.id}`}
                                  >
                                    <Download className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>

                      <div className="flex justify-between items-center mt-4">
                        <p className="text-sm text-muted-foreground">
                          Showing {((transcriptsPage - 1) * 25) + 1} - {Math.min(transcriptsPage * 25, transcriptsData.total)} of {transcriptsData.total} transcripts
                        </p>
                        {transcriptsData.totalPages > 1 && (
                          <div className="flex gap-2 items-center">
                            <span className="text-sm text-muted-foreground">
                              Page {transcriptsData.page} of {transcriptsData.totalPages}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setTranscriptsPage(p => Math.max(1, p - 1))}
                              disabled={transcriptsPage === 1}
                              data-testid="button-transcripts-prev"
                            >
                              Previous
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setTranscriptsPage(p => Math.min(transcriptsData.totalPages, p + 1))}
                              disabled={transcriptsPage >= transcriptsData.totalPages}
                              data-testid="button-transcripts-next"
                            >
                              Next
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No transcripts found for the current filters.
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Transcript Detail Dialog */}
              <Dialog open={!!selectedTranscriptId} onOpenChange={(open) => !open && setSelectedTranscriptId(null)}>
                <DialogContent className="max-w-5xl w-[95vw] h-[90vh] sm:h-[85vh] overflow-hidden flex flex-col">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Transcript Detail
                      {transcriptDetail && (
                        <Badge variant="secondary" className="ml-2">
                          {transcriptDetail.transcript?.length || 0} {((transcriptDetail.transcript?.length || 0) === 1) ? 'message' : 'messages'}
                        </Badge>
                      )}
                      {transcriptDetail && (transcriptDetail.terminatedForSafety || (transcriptDetail.safetyFlags?.length || 0) > 0) && (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Flagged
                        </Badge>
                      )}
                    </DialogTitle>
                    <DialogDescription>
                      {transcriptDetail ? (
                        <span>
                          {transcriptDetail.studentName} ({transcriptDetail.ageGroup || 'N/A'}) · {transcriptDetail.subject || 'No subject'} · {formatChicagoDateTime(transcriptDetail.startedAt)}
                          {transcriptDetail.userEmail && <span> · {transcriptDetail.userEmail}</span>}
                          {transcriptDetail.minutesUsed !== undefined && <span> · {transcriptDetail.minutesUsed} min</span>}
                        </span>
                      ) : 'Loading…'}
                    </DialogDescription>
                  </DialogHeader>

                  {transcriptDetailLoading ? (
                    <div className="flex justify-center py-12">
                      <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
                    </div>
                  ) : transcriptDetail ? (
                    <>
                      {/* Summary + safety flags */}
                      {(transcriptDetail.summary || (transcriptDetail.safetyFlags && transcriptDetail.safetyFlags.length > 0)) && (
                        <div className="space-y-3 border-b pb-3">
                          {transcriptDetail.summary && (
                            <div>
                              <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Session Summary</p>
                              <p className="text-sm">{transcriptDetail.summary}</p>
                            </div>
                          )}
                          {transcriptDetail.safetyFlags && transcriptDetail.safetyFlags.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Safety Flags</p>
                              <div className="space-y-1">
                                {transcriptDetail.safetyFlags.map((flag, i) => (
                                  <div key={i} className="text-xs bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded px-2 py-1">
                                    <Badge variant={flag.severity === 'critical' || flag.severity === 'alert' ? 'destructive' : 'secondary'} className="mr-2">
                                      {flag.severity}
                                    </Badge>
                                    <span className="font-medium">{flag.type}</span>
                                    {flag.triggerText && <span className="text-muted-foreground"> — "{flag.triggerText}"</span>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Message log — fills available height, always scrollable */}
                      <ScrollArea className="flex-1 min-h-[300px] pr-3 border rounded-md">
                        <div className="space-y-2 p-3">
                          {transcriptDetail.transcript && transcriptDetail.transcript.length > 0 ? (
                            <>
                              {transcriptDetail.transcript.map((msg, i) => (
                                <div
                                  key={msg.messageId || i}
                                  className={`flex ${msg.speaker === 'tutor' ? 'justify-start' : 'justify-end'}`}
                                >
                                  <div
                                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                                      msg.speaker === 'tutor'
                                        ? 'bg-muted'
                                        : 'bg-primary text-primary-foreground'
                                    }`}
                                  >
                                    <div className="flex items-baseline gap-2 mb-1">
                                      <span className="text-xs font-semibold uppercase opacity-70">
                                        [{i + 1}] {msg.speaker}
                                      </span>
                                      <span className="text-xs opacity-50">
                                        {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ''}
                                      </span>
                                    </div>
                                    <div className="whitespace-pre-wrap">{msg.text}</div>
                                  </div>
                                </div>
                              ))}
                              <div className="text-center text-xs text-muted-foreground py-3 border-t mt-3">
                                — End of transcript ({transcriptDetail.transcript.length} {transcriptDetail.transcript.length === 1 ? 'message' : 'messages'}) —
                              </div>
                            </>
                          ) : (
                            <p className="text-center text-muted-foreground py-8">
                              No transcript content available (session may have ended before any exchange, or transcript may have been purged).
                            </p>
                          )}
                        </div>
                      </ScrollArea>

                      <div className="flex justify-end gap-2 border-t pt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(`/api/admin/transcripts/${transcriptDetail.id}/export?format=text`, '_blank')}
                          data-testid="button-detail-export-text"
                        >
                          <Download className="h-4 w-4 mr-1" /> Export Text
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => generateTranscriptPDF(transcriptDetail)}
                          data-testid="button-detail-export-pdf"
                        >
                          <Download className="h-4 w-4 mr-1" /> Export PDF
                        </Button>
                      </div>
                    </>
                  ) : null}
                </DialogContent>
              </Dialog>
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
                            <TableHead>Student</TableHead>
                            <TableHead>Parent Email</TableHead>
                            <TableHead>Trigger Text</TableHead>
                            <TableHead>Action</TableHead>
                            <TableHead>Notified</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Details</TableHead>
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
                              <TableCell>
                                {incident.studentName || '-'}
                              </TableCell>
                              <TableCell className="max-w-xs truncate" title={incident.parentEmail || ''}>
                                {incident.parentEmail || '-'}
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
                              <TableCell>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSelectedIncident(incident)}
                                  className="flex items-center gap-1"
                                >
                                  <Eye className="h-3 w-3" />
                                  View
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                          {(!safetyIncidentsData?.incidents || safetyIncidentsData.incidents.length === 0) && (
                            <TableRow>
                              <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
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

              {/* Safety Incident Details Dialog */}
              <Dialog open={!!selectedIncident} onOpenChange={(open) => !open && setSelectedIncident(null)}>
                <DialogContent className="max-w-4xl max-h-[80vh]">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <AlertTriangle className={`h-5 w-5 ${
                        selectedIncident?.severity === 'critical' ? 'text-red-500' :
                        selectedIncident?.severity === 'alert' ? 'text-orange-500' :
                        selectedIncident?.severity === 'warning' ? 'text-yellow-500' :
                        'text-blue-500'
                      }`} />
                      Safety Incident Details
                    </DialogTitle>
                    <DialogDescription>
                      {selectedIncident?.flagType.replace(/_/g, ' ')} - {formatChicagoDateTime(selectedIncident?.createdAt)}
                    </DialogDescription>
                  </DialogHeader>

                  <ScrollArea className="max-h-[60vh] pr-4">
                    <div className="space-y-4">
                      {/* Incident Metadata */}
                      <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Student Name</p>
                          <p className="text-base font-semibold">{selectedIncident?.studentName || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Parent Email</p>
                          <p className="text-base font-semibold">{selectedIncident?.parentEmail || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Severity</p>
                          <Badge variant={
                            selectedIncident?.severity === 'critical' ? 'destructive' :
                            selectedIncident?.severity === 'alert' ? 'default' :
                            selectedIncident?.severity === 'warning' ? 'secondary' : 'outline'
                          }>
                            {selectedIncident?.severity}
                          </Badge>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Action Taken</p>
                          <p className="text-base">{selectedIncident?.actionTaken || 'N/A'}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-sm font-medium text-muted-foreground">Notifications Sent</p>
                          <div className="flex gap-2 mt-1">
                            {selectedIncident?.adminNotified && <Badge variant="outline">Admin</Badge>}
                            {selectedIncident?.parentNotified && <Badge variant="outline">Parent</Badge>}
                            {!selectedIncident?.adminNotified && !selectedIncident?.parentNotified && (
                              <span className="text-sm text-muted-foreground">None</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Trigger Text */}
                      {selectedIncident?.triggerText && (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                          <p className="text-sm font-medium text-red-900 mb-2">Trigger Text</p>
                          <p className="text-base text-red-800">{selectedIncident.triggerText}</p>
                        </div>
                      )}

                      {/* Tutor Response */}
                      {selectedIncident?.tutorResponse && (
                        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                          <p className="text-sm font-medium text-blue-900 mb-2">Tutor Response</p>
                          <p className="text-base text-blue-800">{selectedIncident.tutorResponse}</p>
                        </div>
                      )}

                      {/* Full Session Transcript */}
                      {selectedIncident?.transcript && selectedIncident.transcript.length > 0 ? (
                        <div className="p-4 bg-muted/30 border rounded-lg">
                          <p className="text-sm font-medium mb-3">Full Session Transcript</p>
                          <div className="space-y-3">
                            {selectedIncident.transcript.map((message, idx) => (
                              <div
                                key={message.messageId || idx}
                                className={`p-3 rounded-lg ${
                                  message.speaker === 'tutor'
                                    ? 'bg-blue-50 border border-blue-200'
                                    : 'bg-green-50 border border-green-200'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className={`text-xs font-semibold uppercase ${
                                    message.speaker === 'tutor' ? 'text-blue-700' : 'text-green-700'
                                  }`}>
                                    {message.speaker}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(message.timestamp).toLocaleTimeString()}
                                  </span>
                                </div>
                                <p className={`text-sm ${
                                  message.speaker === 'tutor' ? 'text-blue-900' : 'text-green-900'
                                }`}>
                                  {message.text}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 bg-muted/30 border rounded-lg text-center text-muted-foreground">
                          No transcript available for this incident
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </DialogContent>
              </Dialog>
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

            {/* Pricing Studio Tab */}
            <TabsContent value="pricing-studio" className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Quote & Pricing Studio</h2>
                  <p className="text-sm text-muted-foreground">Model institutional deals · Generate client quotes · Internal margin reports</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open("/pricing-studio.html", "_blank")}
                  className="flex items-center gap-1.5 text-xs"
                >
                  <Download className="h-3.5 w-3.5" />
                  Open in New Tab
                </Button>
              </div>
              <div className="rounded-lg border overflow-hidden" style={{ height: "calc(100vh - 280px)" }}>
                <iframe
                  src="/pricing-studio.html"
                  className="w-full h-full border-0"
                  title="JIE Mastery Quote & Pricing Studio"
                />
              </div>
            </TabsContent>

            {/* Investment Console Tab */}
            <TabsContent value="investment-console" className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Investment Console</h2>
                  <p className="text-sm text-muted-foreground">Pro forma · Sources & uses · Runway scenarios · Investor-deck financials</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open("/investment-console.html", "_blank")}
                  className="flex items-center gap-1.5 text-xs"
                >
                  <Download className="h-3.5 w-3.5" />
                  Open in New Tab
                </Button>
              </div>
              <div className="rounded-lg border overflow-hidden" style={{ height: "calc(100vh - 280px)" }}>
                <iframe
                  src="/investment-console.html"
                  className="w-full h-full border-0"
                  title="JIE Mastery Investment Console"
                />
              </div>
            </TabsContent>

            {/* Capital CRM Tab */}
            <TabsContent value="capital-crm" className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Capital CRM</h2>
                  <p className="text-sm text-muted-foreground">Funding pipeline tracker · 141 opportunities across grants, VCs, accelerators & foundations</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.location.href = "/admin/capital"}
                  className="flex items-center gap-1.5 text-xs"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open Full View
                </Button>
              </div>
              <div className="rounded-lg border overflow-hidden" style={{ height: "calc(100vh - 280px)" }}>
                <iframe
                  src="/admin/capital"
                  className="w-full h-full border-0"
                  title="JIE Mastery Capital CRM"
                />
              </div>
            </TabsContent>

            {/* Sales / Prospects CRM Tab */}
            <TabsContent value="sales-crm" className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Sales & Prospects CRM</h2>
                  <p className="text-sm text-muted-foreground">Track institutional leads, demos, pilots, and contracts across K-12, charter, university, and corporate segments</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.location.href = "/admin/prospects"}
                  className="flex items-center gap-1.5 text-xs"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open Full View
                </Button>
              </div>
              <div className="rounded-lg border overflow-hidden" style={{ height: "calc(100vh - 280px)" }}>
                <iframe
                  src="/admin/prospects"
                  className="w-full h-full border-0"
                  title="JIE Mastery Sales CRM"
                />
              </div>
            </TabsContent>

            {/* Family Tracker Tab */}
            <TabsContent value="family-tracker" className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Study Tracker</h3>
                  <p className="text-sm text-muted-foreground">Monitor student engagement, progress, and intervention needs</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.location.href = "/admin/family-tracker"}
                  className="flex items-center gap-1.5 text-xs"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open Full View
                </Button>
              </div>
              <div className="rounded-lg border overflow-hidden" style={{ height: "calc(100vh - 280px)" }}>
                <iframe
                  src="/admin/family-tracker"
                  className="w-full h-full border-0"
                  title="Study Tracker"
                />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
