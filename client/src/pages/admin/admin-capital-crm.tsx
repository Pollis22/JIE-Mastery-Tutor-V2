/**
 * Capital CRM — Admin Funding Pipeline Page
 * Tabbed interface: Dashboard | Opportunities | Today | Tasks
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Target,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Clock,
  Activity as ActivityIcon,
  Zap,
  Shield,
  Layers,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Flame,
  Ban,
  Plus,
  Search,
  ExternalLink,
  ChevronRight,
  RefreshCw,
} from "lucide-react";

// ============ TYPES ============
interface DashboardStats {
  totalOpportunities: number;
  activeOpportunities: number;
  byStage: Record<string, number>;
  byCategory: Record<string, number>;
  totalPipelineValue: number;
  weightedPipeline: number;
  expected30_60Capital: number;
  tier1Count: number;
  nonDilutiveCount: number;
  nonDilutivePipeline: number;
  atRiskCount: number;
  stalledCount: number;
  overdueFollowUpsCount: number;
  overdueTasksCount: number;
  deadlines7: number;
  deadlines14: number;
  deadlines30: number;
  upcomingDeadlines: Opportunity[];
  recentActivities: CapitalActivity[];
  topOpportunities: Opportunity[];
  pipelineByStage: Array<{ stage: string; count: number; value: number }>;
  pipelineByCategory: Array<{ category: string; count: number; value: number; weightedValue: number }>;
}

interface TodayStats {
  tasksDueToday: CapitalTask[];
  overdueTasks: CapitalTask[];
  followUpsDue: Opportunity[];
  deadlinesWithin7: Opportunity[];
  topScoringOpps: Opportunity[];
  atRiskOpps: Opportunity[];
  stalledOpps: Opportunity[];
  recentlyUpdated: Opportunity[];
  fastCapitalOpps: Opportunity[];
  founderActions: Array<{
    type: string;
    urgency: "critical" | "high" | "medium";
    title: string;
    description: string;
    opportunityId?: string;
    opportunityName?: string;
    taskId?: string;
  }>;
  alerts: Array<{
    type: string;
    severity: "critical" | "warning" | "info";
    title: string;
    description: string;
  }>;
}

interface Opportunity {
  id: string;
  name: string;
  fundingSource: string;
  programName: string | null;
  fundingCategory: string;
  capitalType: string;
  geography: string | null;
  website: string | null;
  applicationUrl: string | null;
  description: string | null;
  strategicFitNotes: string | null;
  minAmount: string | null;
  maxAmount: string | null;
  expectedAmount: string | null;
  probabilityToClose: number | null;
  useOfFunds: string | null;
  matchRequirement: string | null;
  equityRequired: boolean | null;
  repaymentRequired: boolean | null;
  openDate: string | null;
  deadlineDate: string | null;
  estimatedDecisionDate: string | null;
  nextFollowUpDate: string | null;
  submissionDate: string | null;
  meetingDate: string | null;
  lastContactDate: string | null;
  stage: string;
  strategicFitScore: number | null;
  speedScore: number | null;
  probabilityScore: number | null;
  effortScore: number | null;
  amountScore: number | null;
  weightedScore: string | null;
  priorityTier: string | null;
  eligible30_60: boolean | null;
  warmIntroAvailable: boolean | null;
  requiresResearchPartner: boolean | null;
  requiresPilotData: boolean | null;
  contactEmail: string | null;
  contactPhone: string | null;
  sourceUrl: string | null;
  notes: string | null;
  founderNotes: string | null;
  healthStatus: string | null;
  nextAction: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CapitalTask {
  id: string;
  title: string;
  opportunityId: string | null;
  contactId: string | null;
  taskType: string | null;
  dueDate: string | null;
  priority: string | null;
  status: string | null;
  notes: string | null;
  completedDate: string | null;
  createdAt: string;
}

interface CapitalActivity {
  id: string;
  opportunityId: string | null;
  contactId: string | null;
  activityType: string;
  notes: string | null;
  createdAt: string;
}

// ============ HELPERS ============
const API_BASE = "/api/admin/capital";

function formatCurrency(amount: string | number | null | undefined): string {
  const num = Number(amount);
  if (!num || isNaN(num)) return "$0";
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num.toLocaleString()}`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getStageBadgeColor(stage: string): string {
  switch (stage) {
    case "Identified": case "Researching": return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";
    case "Qualified": case "Contact Identified": return "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300";
    case "Outreach Drafted": case "Outreach Sent": return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300";
    case "Intro Call Scheduled": case "In Discussion": return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
    case "Application In Progress": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300";
    case "Submitted": case "Follow-Up Pending": return "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300";
    case "Due Diligence": case "Verbal Interest": case "Negotiation": return "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300";
    case "Awarded": return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
    case "Closed Lost": return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
    default: return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  }
}

function getPriorityColor(tier: string | null | undefined): string {
  switch (tier) {
    case "Tier 1 Immediate": return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
    case "Tier 2 Near-Term": return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
    default: return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  }
}

function getHealthBadgeVariant(status: string | null | undefined): string {
  switch (status) {
    case "Healthy": return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
    case "At Risk": return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
    case "Stalled": return "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300";
    default: return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  }
}

function getUrgencyColor(urgency: string): string {
  switch (urgency) {
    case "critical": return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800";
    case "high": return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800";
    default: return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800";
  }
}

function getSeverityColor(severity: string): string {
  switch (severity) {
    case "critical": return "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30";
    case "warning": return "border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30";
    default: return "border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30";
  }
}

async function apiRequest(method: string, url: string, body?: any) {
  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Request failed" }));
    throw new Error(err.message || "Request failed");
  }
  if (res.status === 204) return null;
  return res.json();
}

// ============ MAIN PAGE ============
export default function AdminCapitalCRM() {
  const [activeTab, setActiveTab] = useState("today");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Capital CRM</h1>
        <p className="text-sm text-muted-foreground mt-1">Funding pipeline tracker — 141 opportunities across grants, VCs, accelerators, and foundations</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 max-w-lg">
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="opportunities">Pipeline</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="mt-6">
          <TodayTab />
        </TabsContent>
        <TabsContent value="dashboard" className="mt-6">
          <DashboardTab />
        </TabsContent>
        <TabsContent value="opportunities" className="mt-6">
          <OpportunitiesTab />
        </TabsContent>
        <TabsContent value="tasks" className="mt-6">
          <TasksTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============ TODAY TAB ============
function TodayTab() {
  const { data: stats, isLoading } = useQuery<TodayStats>({
    queryKey: [`${API_BASE}/today`],
    queryFn: () => apiRequest("GET", `${API_BASE}/today`),
  });

  if (isLoading) return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-32 w-full" />)}</div>;
  if (!stats) return null;

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{today}</p>

      {/* Alerts */}
      {stats.alerts.length > 0 && (
        <div className="space-y-2">
          {stats.alerts.map((alert, i) => (
            <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${getSeverityColor(alert.severity)}`}>
              {alert.severity === "critical" ? <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-red-600" /> :
               alert.severity === "warning" ? <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" /> :
               <ActivityIcon className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />}
              <div>
                <p className="text-sm font-medium">{alert.title}</p>
                <p className="text-xs text-muted-foreground">{alert.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Founder Actions */}
      {stats.founderActions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-red-500" />
              <CardTitle className="text-sm font-semibold">Needs Your Action ({stats.founderActions.length})</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {stats.founderActions.map((action, i) => (
                <div key={i} className={`p-3 rounded-lg border ${getUrgencyColor(action.urgency)}`}>
                  <Badge variant="outline" className="text-[10px] border-0 mb-1">{action.urgency}</Badge>
                  <p className="text-sm font-medium">{action.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{action.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Tasks Due Today */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Tasks Due Today ({stats.tasksDueToday.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.tasksDueToday.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No tasks due today</p>
            ) : (
              <div className="space-y-2 max-h-[240px] overflow-y-auto">
                {stats.tasksDueToday.map((task) => (
                  <div key={task.id} className="p-2 rounded-md bg-accent/30">
                    <p className="text-sm font-medium">{task.title}</p>
                    <p className="text-xs text-muted-foreground">{task.taskType}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Overdue Tasks */}
        <Card className={stats.overdueTasks.length > 0 ? "border-red-300 dark:border-red-800" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-red-500" /> Overdue ({stats.overdueTasks.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.overdueTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No overdue tasks</p>
            ) : (
              <div className="space-y-2 max-h-[240px] overflow-y-auto">
                {stats.overdueTasks.slice(0, 8).map((task) => (
                  <div key={task.id} className="p-2 rounded-md bg-red-50 dark:bg-red-950/20">
                    <p className="text-sm font-medium">{task.title}</p>
                    <p className="text-xs text-red-600 dark:text-red-400">Due {formatDate(task.dueDate)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Scoring */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Top Scoring
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.topScoringOpps.map((opp, i) => (
                <div key={opp.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/50">
                  <span className="text-xs font-bold text-muted-foreground w-5">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{opp.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge variant="outline" className={`${getPriorityColor(opp.priorityTier)} border-0 text-[10px]`}>
                        {opp.priorityTier?.replace("Tier ", "T")}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-primary">{Number(opp.weightedScore ?? 0).toFixed(1)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* At Risk / Stalled / Fast Capital */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <OppListCard title="At Risk" icon={<AlertCircle className="h-4 w-4 text-amber-500" />} opps={stats.atRiskOpps} borderColor={stats.atRiskOpps.length > 0 ? "border-amber-300 dark:border-amber-800" : ""} />
        <OppListCard title="Stalled" icon={<Ban className="h-4 w-4 text-orange-500" />} opps={stats.stalledOpps} borderColor={stats.stalledOpps.length > 0 ? "border-orange-300 dark:border-orange-800" : ""} />
        <OppListCard title="Fast Capital (30-60d)" icon={<Zap className="h-4 w-4 text-teal-500" />} opps={stats.fastCapitalOpps} />
      </div>
    </div>
  );
}

function OppListCard({ title, icon, opps, borderColor = "" }: { title: string; icon: React.ReactNode; opps: Opportunity[]; borderColor?: string }) {
  return (
    <Card className={borderColor}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">{icon} {title} ({opps.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {opps.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">None</p>
        ) : (
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {opps.slice(0, 6).map((opp) => (
              <div key={opp.id} className="p-2 rounded-md hover:bg-accent/50">
                <p className="text-sm font-medium truncate">{opp.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">{formatCurrency(opp.expectedAmount)}</span>
                  <Badge variant="outline" className={`${getStageBadgeColor(opp.stage)} border-0 text-[10px]`}>{opp.stage}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============ DASHBOARD TAB ============
function DashboardTab() {
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: [`${API_BASE}/dashboard`],
    queryFn: () => apiRequest("GET", `${API_BASE}/dashboard`),
  });

  if (isLoading) return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>;
  if (!stats) return null;

  return (
    <div className="space-y-6">
      {/* KPI Row 1 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard title="Active Opps" value={stats.activeOpportunities} icon={<Target className="h-4 w-4" />} />
        <KPICard title="Pipeline Value" value={stats.totalPipelineValue} icon={<DollarSign className="h-4 w-4" />} format="currency" />
        <KPICard title="Weighted Pipeline" value={stats.weightedPipeline} icon={<TrendingUp className="h-4 w-4" />} format="currency" />
        <KPICard title="30-60 Day Capital" value={stats.expected30_60Capital} icon={<Zap className="h-4 w-4" />} format="currency" highlight />
        <KPICard title="Non-Dilutive" value={stats.nonDilutiveCount} icon={<Shield className="h-4 w-4" />} />
        <KPICard title="Tier 1 Immediate" value={stats.tier1Count} icon={<Layers className="h-4 w-4" />} />
      </div>

      {/* KPI Row 2 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        <KPICard title="At Risk" value={stats.atRiskCount} icon={<AlertTriangle className="h-4 w-4" />} alert={stats.atRiskCount > 0} />
        <KPICard title="Overdue Tasks" value={stats.overdueTasksCount} icon={<Clock className="h-4 w-4" />} alert={stats.overdueTasksCount > 0} />
        <KPICard title="Overdue Follow-ups" value={stats.overdueFollowUpsCount} icon={<ActivityIcon className="h-4 w-4" />} alert={stats.overdueFollowUpsCount > 0} />
        <KPICard title="Deadlines (7d)" value={stats.deadlines7} icon={<Calendar className="h-4 w-4" />} alert={stats.deadlines7 > 0} />
        <KPICard title="Deadlines (30d)" value={stats.deadlines30} icon={<Calendar className="h-4 w-4" />} />
      </div>

      {/* Top Opps + Capital Snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Top by Weighted Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {stats.topOpportunities.slice(0, 10).map((opp, i) => (
                <div key={opp.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/50">
                  <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{opp.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge variant="outline" className={`${getPriorityColor(opp.priorityTier)} border-0 text-[10px]`}>
                        {opp.priorityTier?.replace("Tier ", "T")}
                      </Badge>
                      <Badge variant="outline" className={`${getHealthBadgeVariant(opp.healthStatus)} border-0 text-[10px]`}>
                        {opp.healthStatus}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-primary">{Number(opp.weightedScore ?? 0).toFixed(1)}</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(opp.expectedAmount)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Capital Snapshot</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800">
                <p className="text-xs font-medium text-teal-700 dark:text-teal-300 uppercase tracking-wide">Non-dilutive Pipeline</p>
                <p className="text-2xl font-bold text-teal-800 dark:text-teal-200">{formatCurrency(stats.nonDilutivePipeline)}</p>
                <p className="text-xs text-teal-600 dark:text-teal-400">{stats.nonDilutiveCount} opportunities</p>
              </div>
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                <p className="text-xs font-medium text-blue-700 dark:text-blue-300 uppercase tracking-wide">Expected 30-60 Day</p>
                <p className="text-2xl font-bold text-blue-800 dark:text-blue-200">{formatCurrency(stats.expected30_60Capital)}</p>
              </div>
              <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800">
                <p className="text-xs font-medium text-purple-700 dark:text-purple-300 uppercase tracking-wide">Weighted Pipeline</p>
                <p className="text-2xl font-bold text-purple-800 dark:text-purple-200">{formatCurrency(stats.weightedPipeline)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Deadlines + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Upcoming Deadlines (30d)</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.upcomingDeadlines.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No upcoming deadlines</p>
            ) : (
              <div className="space-y-2 max-h-[280px] overflow-y-auto">
                {stats.upcomingDeadlines.slice(0, 10).map((opp) => {
                  const days = daysUntil(opp.deadlineDate);
                  return (
                    <div key={opp.id} className="flex items-center justify-between p-2 rounded-md hover:bg-accent/50">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{opp.name}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(opp.deadlineDate)}</p>
                      </div>
                      <Badge variant="outline" className={days !== null && days <= 7 ? "bg-red-100 text-red-700 border-0" : "border-0"}>
                        {days !== null ? `${days}d` : "—"}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.recentActivities.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No recent activities</p>
            ) : (
              <div className="space-y-2 max-h-[280px] overflow-y-auto">
                {stats.recentActivities.map((act) => (
                  <div key={act.id} className="p-2 rounded-md">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] border-0 bg-secondary">{act.activityType}</Badge>
                      <span className="text-xs text-muted-foreground">{formatDate(act.createdAt)}</span>
                    </div>
                    {act.notes && <p className="text-xs text-muted-foreground mt-0.5 truncate">{act.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pipeline by Category */}
      {stats.pipelineByCategory.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Pipeline by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {stats.pipelineByCategory.map((cat) => (
                <div key={cat.category} className="p-3 rounded-lg border">
                  <p className="text-xs font-medium text-muted-foreground">{cat.category}</p>
                  <p className="text-lg font-bold mt-1">{cat.count} opps</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(cat.value)} total</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KPICard({ title, value, icon, format = "number", alert = false, highlight = false }: {
  title: string; value: number; icon: React.ReactNode; format?: "number" | "currency"; alert?: boolean; highlight?: boolean;
}) {
  return (
    <Card className={alert ? "border-red-300 dark:border-red-800" : highlight ? "border-teal-300 dark:border-teal-800" : ""}>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{title}</span>
          <span className={alert ? "text-red-500" : highlight ? "text-teal-500" : "text-muted-foreground"}>{icon}</span>
        </div>
        <p className={`text-xl font-bold ${alert ? "text-red-600 dark:text-red-400" : highlight ? "text-teal-600 dark:text-teal-400" : ""}`}>
          {format === "currency" ? formatCurrency(value) : value.toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
}

// ============ OPPORTUNITIES TAB ============
function OpportunitiesTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newOpp, setNewOpp] = useState({
    name: "", fundingSource: "", programName: "", fundingCategory: "Government Grant",
    capitalType: "Non-dilutive", geography: "National", website: "", applicationUrl: "",
    description: "", stage: "Identified", expectedAmount: "", minAmount: "", maxAmount: "",
    contactEmail: "", contactPhone: "", sourceUrl: "", notes: "",
    strategicFitScore: 5, speedScore: 5, probabilityScore: 5, effortScore: 5, amountScore: 5,
  });

  const queryParams = new URLSearchParams();
  if (search) queryParams.set("search", search);
  if (stageFilter !== "all") queryParams.set("stage", stageFilter);
  if (categoryFilter !== "all") queryParams.set("category", categoryFilter);

  const { data: opps, isLoading } = useQuery<Opportunity[]>({
    queryKey: [`${API_BASE}/opportunities`, search, stageFilter, categoryFilter],
    queryFn: () => apiRequest("GET", `${API_BASE}/opportunities?${queryParams.toString()}`),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `${API_BASE}/opportunities`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${API_BASE}/opportunities`] });
      queryClient.invalidateQueries({ queryKey: [`${API_BASE}/dashboard`] });
      queryClient.invalidateQueries({ queryKey: [`${API_BASE}/today`] });
      setShowAdd(false);
      setNewOpp({
        name: "", fundingSource: "", programName: "", fundingCategory: "Government Grant",
        capitalType: "Non-dilutive", geography: "National", website: "", applicationUrl: "",
        description: "", stage: "Identified", expectedAmount: "", minAmount: "", maxAmount: "",
        contactEmail: "", contactPhone: "", sourceUrl: "", notes: "",
        strategicFitScore: 5, speedScore: 5, probabilityScore: 5, effortScore: 5, amountScore: 5,
      });
      toast({ title: "Opportunity created" });
    },
    onError: (err: any) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });

  const stages = ["Identified","Researching","Qualified","Contact Identified","Outreach Drafted","Outreach Sent","Intro Call Scheduled","In Discussion","Application In Progress","Submitted","Follow-Up Pending","Due Diligence","Verbal Interest","Negotiation","Awarded","Closed Lost","Deferred"];
  const categories = ["Government Grant","Foundation","Accelerator","Venture Capital","Strategic Partner","Loan/Debt","Competition","Fellowship"];
  const capitalTypes = ["Non-dilutive", "Dilutive", "Debt", "Hybrid"];
  const geographies = ["National", "Illinois", "Chicago", "Midwest", "Other"];

  return (
    <div className="space-y-4">
      {/* Filters + Add Button */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search opportunities..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Stages" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {stages.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="h-4 w-4 mr-1" /> New Opportunity
        </Button>
      </div>

      {/* Add Opportunity Form */}
      {showAdd && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">New Funding Opportunity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Row 1: Name + Source */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Opportunity Name *</Label>
                <Input value={newOpp.name} onChange={e => setNewOpp({...newOpp, name: e.target.value})} placeholder="e.g. SBIR Phase I — NSF" />
              </div>
              <div>
                <Label>Funding Source *</Label>
                <Input value={newOpp.fundingSource} onChange={e => setNewOpp({...newOpp, fundingSource: e.target.value})} placeholder="e.g. National Science Foundation" />
              </div>
            </div>

            {/* Row 2: Category + Capital Type + Geography + Stage */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label>Category *</Label>
                <Select value={newOpp.fundingCategory} onValueChange={v => setNewOpp({...newOpp, fundingCategory: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Capital Type *</Label>
                <Select value={newOpp.capitalType} onValueChange={v => setNewOpp({...newOpp, capitalType: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {capitalTypes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Geography</Label>
                <Select value={newOpp.geography} onValueChange={v => setNewOpp({...newOpp, geography: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {geographies.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Stage</Label>
                <Select value={newOpp.stage} onValueChange={v => setNewOpp({...newOpp, stage: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {stages.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 3: Amounts */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Min Amount ($)</Label>
                <Input type="number" value={newOpp.minAmount} onChange={e => setNewOpp({...newOpp, minAmount: e.target.value})} placeholder="e.g. 50000" />
              </div>
              <div>
                <Label>Max Amount ($)</Label>
                <Input type="number" value={newOpp.maxAmount} onChange={e => setNewOpp({...newOpp, maxAmount: e.target.value})} placeholder="e.g. 275000" />
              </div>
              <div>
                <Label>Expected Amount ($)</Label>
                <Input type="number" value={newOpp.expectedAmount} onChange={e => setNewOpp({...newOpp, expectedAmount: e.target.value})} placeholder="e.g. 150000" />
              </div>
            </div>

            {/* Row 4: URLs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label>Website</Label>
                <Input value={newOpp.website} onChange={e => setNewOpp({...newOpp, website: e.target.value})} placeholder="https://..." />
              </div>
              <div>
                <Label>Application URL</Label>
                <Input value={newOpp.applicationUrl} onChange={e => setNewOpp({...newOpp, applicationUrl: e.target.value})} placeholder="https://..." />
              </div>
              <div>
                <Label>Source URL</Label>
                <Input value={newOpp.sourceUrl} onChange={e => setNewOpp({...newOpp, sourceUrl: e.target.value})} placeholder="https://..." />
              </div>
            </div>

            {/* Row 5: Contact */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Contact Email</Label>
                <Input value={newOpp.contactEmail} onChange={e => setNewOpp({...newOpp, contactEmail: e.target.value})} placeholder="contact@example.com" />
              </div>
              <div>
                <Label>Contact Phone</Label>
                <Input value={newOpp.contactPhone} onChange={e => setNewOpp({...newOpp, contactPhone: e.target.value})} placeholder="(555) 123-4567" />
              </div>
            </div>

            {/* Row 6: Description */}
            <div>
              <Label>Description</Label>
              <Textarea value={newOpp.description} onChange={e => setNewOpp({...newOpp, description: e.target.value})} placeholder="Describe the opportunity..." rows={3} />
            </div>

            {/* Row 7: Notes */}
            <div>
              <Label>Notes</Label>
              <Textarea value={newOpp.notes} onChange={e => setNewOpp({...newOpp, notes: e.target.value})} placeholder="Internal notes..." rows={2} />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button
                size="sm"
                onClick={() => createMutation.mutate(newOpp)}
                disabled={!newOpp.name || !newOpp.fundingSource || createMutation.isPending}
              >
                {createMutation.isPending ? "Creating..." : "Create Opportunity"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Count */}
      <p className="text-sm text-muted-foreground">{opps?.length ?? 0} opportunities</p>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : (
        <div className="space-y-2">
          {opps?.map((opp) => (
            <div
              key={opp.id}
              className="flex items-center gap-4 p-3 rounded-lg border hover:bg-accent/50 cursor-pointer transition-colors"
              onClick={() => setSelectedOpp(opp)}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{opp.name}</p>
                <p className="text-xs text-muted-foreground truncate">{opp.fundingSource}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className={`${getStageBadgeColor(opp.stage)} border-0 text-[10px]`}>{opp.stage}</Badge>
                <Badge variant="outline" className={`${getPriorityColor(opp.priorityTier)} border-0 text-[10px]`}>
                  {opp.priorityTier?.replace("Tier ", "T")}
                </Badge>
                <Badge variant="outline" className={`${getHealthBadgeVariant(opp.healthStatus)} border-0 text-[10px]`}>
                  {opp.healthStatus}
                </Badge>
              </div>
              <div className="text-right shrink-0 w-20">
                <p className="text-sm font-bold">{formatCurrency(opp.expectedAmount)}</p>
                <p className="text-xs text-muted-foreground">{Number(opp.weightedScore ?? 0).toFixed(1)} pts</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </div>
          ))}
        </div>
      )}

      {/* Opportunity Detail Dialog */}
      {selectedOpp && (
        <OpportunityDetailDialog opp={selectedOpp} onClose={() => setSelectedOpp(null)} />
      )}
    </div>
  );
}

// ============ OPPORTUNITY DETAIL DIALOG ============
function OpportunityDetailDialog({ opp, onClose }: { opp: Opportunity; onClose: () => void }) {
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">{opp.name}</DialogTitle>
          <p className="text-sm text-muted-foreground">{opp.fundingSource}</p>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Status Badges */}
          <div className="flex flex-wrap gap-2">
            <Badge className={getStageBadgeColor(opp.stage)}>{opp.stage}</Badge>
            <Badge className={getPriorityColor(opp.priorityTier)}>{opp.priorityTier}</Badge>
            <Badge className={getHealthBadgeVariant(opp.healthStatus)}>{opp.healthStatus}</Badge>
            <Badge variant="outline">{opp.capitalType}</Badge>
            <Badge variant="outline">{opp.fundingCategory}</Badge>
            {opp.geography && <Badge variant="outline">{opp.geography}</Badge>}
          </div>

          {/* Financial */}
          <div className="grid grid-cols-3 gap-3">
            {opp.minAmount && (
              <div className="p-2 rounded bg-accent/30">
                <p className="text-xs text-muted-foreground">Min Amount</p>
                <p className="text-sm font-bold">{formatCurrency(opp.minAmount)}</p>
              </div>
            )}
            {opp.maxAmount && (
              <div className="p-2 rounded bg-accent/30">
                <p className="text-xs text-muted-foreground">Max Amount</p>
                <p className="text-sm font-bold">{formatCurrency(opp.maxAmount)}</p>
              </div>
            )}
            {opp.expectedAmount && (
              <div className="p-2 rounded bg-accent/30">
                <p className="text-xs text-muted-foreground">Expected</p>
                <p className="text-sm font-bold">{formatCurrency(opp.expectedAmount)}</p>
              </div>
            )}
          </div>

          {/* Scoring */}
          <div className="p-3 rounded-lg border">
            <p className="text-xs font-medium text-muted-foreground mb-2">SCORING</p>
            <div className="grid grid-cols-5 gap-2 text-center">
              <div><p className="text-xs text-muted-foreground">Strategic</p><p className="font-bold">{opp.strategicFitScore ?? 5}</p></div>
              <div><p className="text-xs text-muted-foreground">Speed</p><p className="font-bold">{opp.speedScore ?? 5}</p></div>
              <div><p className="text-xs text-muted-foreground">Prob</p><p className="font-bold">{opp.probabilityScore ?? 5}</p></div>
              <div><p className="text-xs text-muted-foreground">Amount</p><p className="font-bold">{opp.amountScore ?? 5}</p></div>
              <div><p className="text-xs text-muted-foreground">Effort</p><p className="font-bold">{opp.effortScore ?? 5}</p></div>
            </div>
            <div className="mt-2 text-center">
              <p className="text-xs text-muted-foreground">Weighted Score</p>
              <p className="text-xl font-bold text-primary">{Number(opp.weightedScore ?? 0).toFixed(1)}</p>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            {opp.deadlineDate && <div><p className="text-xs text-muted-foreground">Deadline</p><p className="text-sm font-medium">{formatDate(opp.deadlineDate)}</p></div>}
            {opp.nextFollowUpDate && <div><p className="text-xs text-muted-foreground">Next Follow-up</p><p className="text-sm font-medium">{formatDate(opp.nextFollowUpDate)}</p></div>}
            {opp.lastContactDate && <div><p className="text-xs text-muted-foreground">Last Contact</p><p className="text-sm font-medium">{formatDate(opp.lastContactDate)}</p></div>}
            {opp.submissionDate && <div><p className="text-xs text-muted-foreground">Submitted</p><p className="text-sm font-medium">{formatDate(opp.submissionDate)}</p></div>}
          </div>

          {/* Description */}
          {opp.description && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">DESCRIPTION</p>
              <p className="text-sm leading-relaxed">{opp.description}</p>
            </div>
          )}

          {/* Contact */}
          <div className="flex flex-wrap gap-4">
            {opp.contactEmail && (
              <div className="flex items-center gap-1">
                <p className="text-xs text-muted-foreground">Email:</p>
                <a href={`mailto:${opp.contactEmail}`} className="text-xs text-primary hover:underline">{opp.contactEmail}</a>
              </div>
            )}
            {opp.contactPhone && (
              <div className="flex items-center gap-1">
                <p className="text-xs text-muted-foreground">Phone:</p>
                <p className="text-xs">{opp.contactPhone}</p>
              </div>
            )}
          </div>

          {/* Links */}
          <div className="flex flex-wrap gap-2">
            {opp.website && (
              <a href={opp.website} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm"><ExternalLink className="h-3 w-3 mr-1" /> Website</Button>
              </a>
            )}
            {opp.applicationUrl && (
              <a href={opp.applicationUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm"><ExternalLink className="h-3 w-3 mr-1" /> Apply</Button>
              </a>
            )}
            {opp.sourceUrl && (
              <a href={opp.sourceUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm"><ExternalLink className="h-3 w-3 mr-1" /> Source</Button>
              </a>
            )}
          </div>

          {/* Notes */}
          {opp.notes && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">NOTES</p>
              <p className="text-sm">{opp.notes}</p>
            </div>
          )}
          {opp.founderNotes && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">FOUNDER NOTES</p>
              <p className="text-sm">{opp.founderNotes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============ TASKS TAB ============
function TasksTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", dueDate: "", priority: "Medium", taskType: "General", notes: "" });

  const { data: tasks, isLoading } = useQuery<CapitalTask[]>({
    queryKey: [`${API_BASE}/tasks`],
    queryFn: () => apiRequest("GET", `${API_BASE}/tasks`),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `${API_BASE}/tasks`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${API_BASE}/tasks`] });
      setShowAdd(false);
      setNewTask({ title: "", dueDate: "", priority: "Medium", taskType: "General", notes: "" });
      toast({ title: "Task created" });
    },
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `${API_BASE}/tasks/${id}`, { status: "Completed", completedDate: new Date().toISOString().split("T")[0] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${API_BASE}/tasks`] });
      toast({ title: "Task completed" });
    },
  });

  const pending = tasks?.filter(t => t.status !== "Completed") ?? [];
  const completed = tasks?.filter(t => t.status === "Completed") ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{pending.length} pending, {completed.length} completed</p>
        <Button size="sm" onClick={() => setShowAdd(!showAdd)}><Plus className="h-4 w-4 mr-1" /> Add Task</Button>
      </div>

      {/* Add Task Form */}
      {showAdd && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div>
              <Label>Title</Label>
              <Input value={newTask.title} onChange={e => setNewTask({...newTask, title: e.target.value})} placeholder="Task title..." />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Due Date</Label>
                <Input type="date" value={newTask.dueDate} onChange={e => setNewTask({...newTask, dueDate: e.target.value})} />
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={newTask.priority} onValueChange={v => setNewTask({...newTask, priority: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="Low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Type</Label>
                <Select value={newTask.taskType} onValueChange={v => setNewTask({...newTask, taskType: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["General","Follow-Up","Application","Research","Meeting","Document","Outreach"].map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={newTask.notes} onChange={e => setNewTask({...newTask, notes: e.target.value})} placeholder="Optional notes..." rows={2} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => createMutation.mutate(newTask)} disabled={!newTask.title || createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Task"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending Tasks */}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : (
        <div className="space-y-2">
          {pending.map(task => {
            const isOverdue = task.dueDate && task.dueDate < new Date().toISOString().split("T")[0];
            return (
              <div key={task.id} className={`flex items-center gap-3 p-3 rounded-lg border ${isOverdue ? "border-red-300 dark:border-red-800" : ""}`}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 shrink-0"
                  onClick={() => completeMutation.mutate(task.id)}
                >
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground hover:text-emerald-500" />
                </Button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{task.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {task.dueDate && (
                      <span className={`text-xs ${isOverdue ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"}`}>
                        {isOverdue ? "Overdue: " : "Due: "}{formatDate(task.dueDate)}
                      </span>
                    )}
                    <Badge variant="outline" className="text-[10px] border-0 bg-secondary">{task.taskType}</Badge>
                  </div>
                </div>
                <Badge variant="outline" className={`text-[10px] border-0 ${
                  task.priority === "High" ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" :
                  task.priority === "Medium" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" :
                  "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                }`}>{task.priority}</Badge>
              </div>
            );
          })}
        </div>
      )}

      {/* Completed Tasks */}
      {completed.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Completed ({completed.length})</p>
          <div className="space-y-1">
            {completed.slice(0, 10).map(task => (
              <div key={task.id} className="flex items-center gap-3 p-2 rounded opacity-60">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <p className="text-sm line-through">{task.title}</p>
                <span className="text-xs text-muted-foreground ml-auto">{formatDate(task.completedDate)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
