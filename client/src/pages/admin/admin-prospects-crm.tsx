/**
 * Sales / Prospects CRM — Admin Sales Pipeline Page
 * Tabbed interface: Today | Dashboard | Pipeline | Tasks
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Target, DollarSign, TrendingUp, AlertTriangle, Clock,
  Activity as ActivityIcon, Building2, Calendar, CheckCircle2,
  Flame, Plus, Search, ChevronRight, ChevronLeft, RefreshCw,
  Rocket, GraduationCap, Briefcase,
} from "lucide-react";

const API_BASE = "/api/admin/prospects";

const STAGES = [
  "Identified", "Researching", "Outreach Sent", "Intro Scheduled",
  "Discovery", "Qualified", "Demo Scheduled", "Demo Completed",
  "Needs Analysis", "Proposal In Progress", "Proposal Sent",
  "Pilot Discussion", "Pilot Active", "Pilot Review",
  "Procurement Review", "Contract Sent", "Contract Review",
  "Verbal Commit", "Closed Won", "Closed Lost", "Nurture / Deferred",
];

const INSTITUTION_TYPES = [
  "K-12 District", "Charter School", "Private School",
  "University", "Community College", "Corporate L&D",
  "Government Agency", "Nonprofit", "Tutoring Company", "Other",
];

const STAGE_COLORS: Record<string, string> = {
  "Identified": "bg-slate-100 text-slate-600", "Researching": "bg-slate-200 text-slate-700",
  "Outreach Sent": "bg-blue-100 text-blue-700", "Intro Scheduled": "bg-blue-200 text-blue-800",
  "Discovery": "bg-indigo-100 text-indigo-700", "Qualified": "bg-indigo-200 text-indigo-800",
  "Demo Scheduled": "bg-violet-100 text-violet-700", "Demo Completed": "bg-violet-200 text-violet-800",
  "Proposal In Progress": "bg-purple-200 text-purple-800", "Proposal Sent": "bg-fuchsia-100 text-fuchsia-700",
  "Pilot Discussion": "bg-orange-100 text-orange-700", "Pilot Active": "bg-orange-200 text-orange-800",
  "Pilot Review": "bg-amber-100 text-amber-700", "Procurement Review": "bg-amber-200 text-amber-800",
  "Contract Sent": "bg-yellow-100 text-yellow-700", "Contract Review": "bg-yellow-200 text-yellow-800",
  "Verbal Commit": "bg-teal-100 text-teal-700",
  "Closed Won": "bg-emerald-100 text-emerald-700", "Closed Lost": "bg-red-100 text-red-700",
  "Nurture / Deferred": "bg-gray-100 text-gray-600",
};

const HEALTH_COLORS: Record<string, string> = {
  "Healthy": "bg-emerald-100 text-emerald-700", "At Risk": "bg-yellow-100 text-yellow-700",
  "Stalled": "bg-red-100 text-red-700", "Closed": "bg-gray-100 text-gray-600",
};

const TIER_COLORS: Record<string, string> = {
  "Tier 1": "bg-red-100 text-red-700 border-red-300",
  "Tier 2": "bg-yellow-100 text-yellow-700 border-yellow-300",
  "Tier 3": "bg-slate-100 text-slate-600 border-slate-300",
};

function fmtMoney(v?: string | number | null): string {
  const n = typeof v === "string" ? parseFloat(v) : (v ?? 0);
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
}

function fmtDate(d?: string | null): string {
  if (!d) return "—";
  return new Date(d.includes("T") ? d : d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isOverdue(d?: string | null): boolean {
  if (!d) return false;
  return new Date(d.includes("T") ? d : d + "T00:00:00") < new Date(new Date().toDateString());
}

function StageBadge({ stage }: { stage: string }) {
  return <Badge className={`text-[10px] border-0 ${STAGE_COLORS[stage] || "bg-muted text-muted-foreground"}`}>{stage}</Badge>;
}

function KPICard({ label, value, sub, icon, color }: { label: string; value: string | number; sub?: string; icon: React.ReactNode; color: string }) {
  return (
    <Card><CardContent className="p-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">{label}</div>
          <div className="text-lg font-bold text-foreground">{value}</div>
          {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
        </div>
        <div className={`p-1.5 rounded-md ${color}`}>{icon}</div>
      </div>
    </CardContent></Card>
  );
}

// ============ CREATE FORM ============
function CreateProspectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<any>({
    institutionName: "", institutionType: "K-12 District", sector: "Education",
    stage: "Identified", city: "", state: "", dealSize: "", probability: 5,
    source: "Existing List", notes: "",
  });

  const create = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`${API_BASE}/prospects`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sales-prospects"] }); qc.invalidateQueries({ queryKey: ["sales-dashboard"] }); toast({ title: "Prospect created" }); onClose(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-base">New Prospect</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Institution Name *</Label><Input value={form.institutionName} onChange={e => setForm({ ...form, institutionName: e.target.value })} placeholder="Organization name" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Type *</Label>
              <Select value={form.institutionType} onValueChange={v => setForm({ ...form, institutionType: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{INSTITUTION_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select></div>
            <div><Label className="text-xs">Stage</Label>
              <Select value={form.stage} onValueChange={v => setForm({ ...form, stage: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select></div>
            <div><Label className="text-xs">City</Label><Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
            <div><Label className="text-xs">State</Label><Input value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} /></div>
            <div><Label className="text-xs">Deal Size ($)</Label><Input type="number" value={form.dealSize} onChange={e => setForm({ ...form, dealSize: e.target.value })} /></div>
            <div><Label className="text-xs">Probability (%)</Label><Input type="number" min="0" max="100" value={form.probability} onChange={e => setForm({ ...form, probability: parseInt(e.target.value) || 0 })} /></div>
            <div><Label className="text-xs">Source</Label>
              <Select value={form.source} onValueChange={v => setForm({ ...form, source: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{["Cold Outreach","Referral","Inbound Website","Conference","Partner","Existing List","LinkedIn","Other"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select></div>
            <div><Label className="text-xs">Est. Students</Label><Input type="number" value={form.estimatedStudents || ""} onChange={e => setForm({ ...form, estimatedStudents: parseInt(e.target.value) || undefined })} /></div>
          </div>
          <div><Label className="text-xs">Notes</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={() => create.mutate(form)} disabled={create.isPending || !form.institutionName}>{create.isPending ? "Creating..." : "Create Prospect"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============ TODAY TAB ============
function TodayTab() {
  const { data, isLoading } = useQuery({ queryKey: ["sales-today"], queryFn: () => fetch(`${API_BASE}/today`).then(r => r.json()), refetchInterval: 60000 });
  if (isLoading) return <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>;
  if (!data) return null;

  const sections = [
    { title: "🔴 Overdue Tasks", items: data.overdueTasks, empty: "No overdue tasks", type: "task" },
    { title: "📋 Tasks Due Today", items: data.todayTasks, empty: "No tasks due today", type: "task" },
    { title: "⚠️ Overdue Follow-Ups", items: data.overdueFollowUps, empty: "All follow-ups current", type: "prospect" },
    { title: "🔥 Tier 1 Prospects", items: data.tier1Prospects, empty: "No Tier 1 prospects", type: "prospect" },
    { title: "📄 Proposals Pending", items: data.proposalsPending, empty: "No pending proposals", type: "prospect" },
    { title: "🚀 Active Pilots", items: data.pilotActive, empty: "No active pilots", type: "prospect" },
    { title: "⏸️ Stalled Prospects", items: data.stalledProspects, empty: "No stalled prospects", type: "prospect" },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Sales Command Center — Today</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sections.map((sec) => (
          <Card key={sec.title}>
            <CardHeader className="px-4 py-2.5 border-b border-border">
              <CardTitle className="text-xs font-semibold flex items-center justify-between">
                <span>{sec.title}</span>
                {sec.items?.length > 0 && <Badge variant="secondary" className="text-[10px]">{sec.items.length}</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!sec.items || sec.items.length === 0 ? (
                <div className="px-4 py-4 text-center text-xs text-muted-foreground">{sec.empty}</div>
              ) : (
                <div className="divide-y divide-border max-h-48 overflow-y-auto">
                  {sec.items.slice(0, 6).map((item: any) => (
                    <div key={item.id} className="flex items-center gap-2 px-4 py-2 text-xs">
                      {sec.type === "task" ? (
                        <><div className={`w-1.5 h-1.5 rounded-full ${item.priority === "High" ? "bg-red-500" : "bg-yellow-500"}`} />
                        <span className="flex-1 truncate font-medium">{item.title}</span>
                        {item.dueDate && <span className={isOverdue(item.dueDate) ? "text-red-500" : "text-muted-foreground"}>{fmtDate(item.dueDate)}</span>}</>
                      ) : (
                        <><span className="flex-1 truncate font-medium">{item.institutionName}</span>
                        <StageBadge stage={item.stage} /><span className="tabular-nums">{fmtMoney(item.dealSize)}</span></>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ============ DASHBOARD TAB ============
function DashboardTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["sales-dashboard"], queryFn: () => fetch(`${API_BASE}/dashboard`).then(r => r.json()) });
  if (isLoading || !data) return <div className="grid grid-cols-4 gap-3">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-20" />)}</div>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard label="Active Prospects" value={data.activeProspects} sub={`${data.totalProspects} total`} icon={<Building2 size={15} />} color="bg-blue-100" />
        <KPICard label="Pipeline Value" value={fmtMoney(data.totalPipelineValue)} sub={`weighted: ${fmtMoney(data.weightedPipeline)}`} icon={<DollarSign size={15} />} color="bg-primary/10" />
        <KPICard label="Closed Won" value={fmtMoney(data.closedWonValue)} sub={`${data.closedWonCount} deals · ${data.winRate}% win`} icon={<CheckCircle2 size={15} />} color="bg-emerald-100" />
        <KPICard label="Tier 1" value={data.tier1Count} sub="highest priority" icon={<Flame size={15} />} color="bg-red-100" />
        <KPICard label="Pilots" value={data.activePilotsCount} icon={<Rocket size={15} />} color="bg-orange-100" />
        <KPICard label="Stalled" value={data.stalledCount} sub={`${data.atRiskCount} at risk`} icon={<AlertTriangle size={15} />} color="bg-yellow-100" />
        <KPICard label="Overdue Tasks" value={data.overdueTasksCount} sub={`${data.todayTasksCount} due today`} icon={<Clock size={15} />} color="bg-red-100" />
        <KPICard label="Close in 30d" value={data.closeDeadlines30} sub={`${data.closeDeadlines7} this week`} icon={<Calendar size={15} />} color="bg-indigo-100" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card><CardHeader className="px-4 py-2.5 border-b"><CardTitle className="text-xs font-semibold">Pipeline by Stage</CardTitle></CardHeader>
          <CardContent className="p-4 space-y-2">
            {Object.entries(data.byStage || {}).sort((a: any, b: any) => b[1] - a[1]).map(([stage, count]: any) => (
              <div key={stage} className="flex items-center justify-between text-xs"><StageBadge stage={stage} /><span className="font-bold">{count}</span></div>
            ))}
          </CardContent></Card>
        <Card><CardHeader className="px-4 py-2.5 border-b"><CardTitle className="text-xs font-semibold">By Institution Type</CardTitle></CardHeader>
          <CardContent className="p-4 space-y-2">
            {Object.entries(data.byType || {}).sort((a: any, b: any) => b[1] - a[1]).map(([type, count]: any) => (
              <div key={type} className="flex items-center justify-between text-xs"><span>{type}</span><span className="font-bold">{count}</span></div>
            ))}
          </CardContent></Card>
        <Card><CardHeader className="px-4 py-2.5 border-b"><CardTitle className="text-xs font-semibold">Forecast</CardTitle></CardHeader>
          <CardContent className="p-4 space-y-3">
            {Object.entries(data.byForecast || {}).map(([cat, { count, value }]: any) => (
              <div key={cat} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${cat === "Commit" ? "bg-emerald-500" : cat === "Best Case" ? "bg-blue-500" : "bg-primary"}`} /><span>{cat}</span></div>
                <div className="text-right"><span className="font-bold">{fmtMoney(value)}</span><span className="text-muted-foreground ml-2">{count} deals</span></div>
              </div>
            ))}
          </CardContent></Card>
        <Card><CardHeader className="px-4 py-2.5 border-b"><CardTitle className="text-xs font-semibold">Closing in 30 Days</CardTitle></CardHeader>
          <CardContent className="p-0">
            {(!data.upcomingCloseDeals || data.upcomingCloseDeals.length === 0) ?
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">No close dates within 30 days</div> :
              <div className="divide-y divide-border">{data.upcomingCloseDeals.map((p: any) => (
                <div key={p.id} className="flex items-center gap-2 px-4 py-2 text-xs">
                  <span className="flex-1 truncate font-medium">{p.institutionName}</span>
                  <span className="tabular-nums">{fmtMoney(p.dealSize)}</span>
                  <span className="text-muted-foreground">{fmtDate(p.closeDate)}</span>
                </div>
              ))}</div>}
          </CardContent></Card>
      </div>
    </div>
  );
}

// ============ PIPELINE TAB ============
function PipelineTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: prospects = [], isLoading } = useQuery<any[]>({ queryKey: ["sales-prospects"], queryFn: () => fetch(`${API_BASE}/prospects`).then(r => r.json()) });
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");

  const moveStage = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const res = await fetch(`${API_BASE}/prospects/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage }) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sales-prospects"] }); qc.invalidateQueries({ queryKey: ["sales-dashboard"] }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="flex gap-3 overflow-x-auto">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-64 w-48 flex-shrink-0" />)}</div>;

  let filtered = prospects;
  if (search) { const s = search.toLowerCase(); filtered = filtered.filter((p: any) => p.institutionName.toLowerCase().includes(s) || (p.city || "").toLowerCase().includes(s)); }
  if (filterType !== "all") filtered = filtered.filter((p: any) => p.institutionType === filterType);

  const byStage: Record<string, any[]> = {};
  for (const stage of STAGES) byStage[stage] = [];
  for (const p of filtered) { if (byStage[p.stage]) byStage[p.stage].push(p); }
  const activeStages = STAGES.filter(s => (byStage[s] || []).length > 0 || ["Identified", "Discovery", "Proposal Sent", "Pilot Active", "Closed Won", "Closed Lost"].includes(s));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-xs"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input type="search" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-7 text-xs" /></div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="h-7 text-[11px] w-32"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Types</SelectItem>{INSTITUTION_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
        <span className="text-[11px] text-muted-foreground">{filtered.length} prospects</span>
      </div>
      <div className="flex gap-2.5 overflow-x-auto pb-4">
        {activeStages.map(stage => {
          const items = byStage[stage] || [];
          const value = items.reduce((s: number, p: any) => s + parseFloat(p.dealSize || "0"), 0);
          return (
            <div key={stage} className="flex-shrink-0 w-48">
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <div className="px-2.5 py-2 border-b border-border">
                  <div className="flex items-center justify-between"><span className="text-[11px] font-semibold truncate">{stage}</span><Badge variant="secondary" className="text-[9px] px-1 h-4">{items.length}</Badge></div>
                  {value > 0 && <div className="text-[10px] text-muted-foreground flex items-center gap-0.5"><DollarSign size={9} />{fmtMoney(value)}</div>}
                </div>
                <div className="p-1.5 space-y-1.5 min-h-[80px] max-h-[calc(100vh-300px)] overflow-y-auto">
                  {items.length === 0 ? <div className="text-center py-4 text-[10px] text-muted-foreground/40">Empty</div> :
                  items.map((p: any) => {
                    const stageIdx = STAGES.indexOf(p.stage);
                    return (
                      <div key={p.id} className={`bg-card border rounded p-2 space-y-1 ${p.healthStatus === "Stalled" ? "border-l-2 border-l-red-500" : p.healthStatus === "At Risk" ? "border-l-2 border-l-yellow-500" : "border-border"}`}>
                        <div className="text-[11px] font-semibold leading-tight line-clamp-2">{p.institutionName}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{p.institutionType}</div>
                        <div className="flex items-center justify-between"><span className="text-[11px] font-bold">{fmtMoney(p.dealSize)}</span><span className="text-[10px] text-muted-foreground">{p.probability}%</span></div>
                        <div className="flex items-center gap-0.5 pt-0.5">
                          <Button size="icon" variant="ghost" className="h-4 w-4" disabled={stageIdx <= 0} onClick={() => moveStage.mutate({ id: p.id, stage: STAGES[stageIdx - 1] })}><ChevronLeft size={10} /></Button>
                          <span className="flex-1 text-center text-[9px] text-muted-foreground">move</span>
                          <Button size="icon" variant="ghost" className="h-4 w-4" disabled={stageIdx >= STAGES.length - 1} onClick={() => moveStage.mutate({ id: p.id, stage: STAGES[stageIdx + 1] })}><ChevronRight size={10} /></Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============ TASKS TAB ============
function TasksTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: tasks = [], isLoading } = useQuery<any[]>({ queryKey: ["sales-tasks"], queryFn: () => fetch(`${API_BASE}/tasks`).then(r => r.json()) });
  const [showAdd, setShowAdd] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", priority: "Medium", dueDate: "", taskType: "General" });

  const createTask = useMutation({
    mutationFn: async (data: any) => { const res = await fetch(`${API_BASE}/tasks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); if (!res.ok) throw new Error(await res.text()); return res.json(); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sales-tasks"] }); toast({ title: "Task created" }); setShowAdd(false); setNewTask({ title: "", priority: "Medium", dueDate: "", taskType: "General" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleTask = useMutation({
    mutationFn: async (task: any) => { const res = await fetch(`${API_BASE}/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: task.status === "Completed" ? "Pending" : "Completed" }) }); if (!res.ok) throw new Error(await res.text()); return res.json(); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sales-tasks"] }),
  });

  if (isLoading) return <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;

  const pending = tasks.filter((t: any) => t.status !== "Completed");
  const completed = tasks.filter((t: any) => t.status === "Completed");
  const overdue = pending.filter((t: any) => isOverdue(t.dueDate));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Tasks</h2>
          <Badge variant="secondary" className="text-[10px]">{pending.length} pending</Badge>
          {overdue.length > 0 && <Badge variant="destructive" className="text-[10px]">{overdue.length} overdue</Badge>}
        </div>
        <Button size="sm" className="h-7 text-xs" onClick={() => setShowAdd(!showAdd)}><Plus size={12} className="mr-1" /> Add Task</Button>
      </div>
      {showAdd && (
        <Card className="p-3 space-y-2">
          <Input value={newTask.title} onChange={e => setNewTask({ ...newTask, title: e.target.value })} placeholder="Task title *" className="h-7 text-xs" />
          <div className="grid grid-cols-4 gap-2">
            <Select value={newTask.priority} onValueChange={v => setNewTask({ ...newTask, priority: v })}><SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="High">High</SelectItem><SelectItem value="Medium">Medium</SelectItem><SelectItem value="Low">Low</SelectItem></SelectContent></Select>
            <Input type="date" value={newTask.dueDate} onChange={e => setNewTask({ ...newTask, dueDate: e.target.value })} className="h-7 text-[11px]" />
            <Select value={newTask.taskType} onValueChange={v => setNewTask({ ...newTask, taskType: v })}><SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger><SelectContent>{["General","Follow-Up","Demo","Proposal","Pilot Setup","Contract","Onboarding","Research","Outreach"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
            <Button size="sm" className="h-7 text-xs" onClick={() => createTask.mutate(newTask)} disabled={!newTask.title || createTask.isPending}>{createTask.isPending ? "..." : "Create"}</Button>
          </div>
        </Card>
      )}
      <div className="border border-border rounded-lg divide-y divide-border">
        {pending.length === 0 && completed.length === 0 ? <div className="px-4 py-8 text-center text-sm text-muted-foreground">No tasks yet</div> : <>
          {pending.map((t: any) => (
            <div key={t.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/30">
              <button onClick={() => toggleTask.mutate(t)} className="text-muted-foreground hover:text-primary flex-shrink-0"><div className="w-4 h-4 rounded-full border-2 border-current" /></button>
              <div className="flex-1 min-w-0"><div className="text-xs font-medium truncate">{t.title}</div><div className="text-[10px] text-muted-foreground">{t.taskType}</div></div>
              <Badge variant="outline" className={`text-[9px] ${t.priority === "High" ? "border-red-300 text-red-600" : ""}`}>{t.priority}</Badge>
              {t.dueDate && <span className={`text-[11px] ${isOverdue(t.dueDate) ? "text-red-500 font-medium" : "text-muted-foreground"}`}>{isOverdue(t.dueDate) && <AlertTriangle size={10} className="inline mr-0.5" />}{fmtDate(t.dueDate)}</span>}
            </div>
          ))}
          {completed.length > 0 && <div className="px-3 py-1.5 bg-muted/30"><span className="text-[10px] text-muted-foreground font-medium">Completed ({completed.length})</span></div>}
          {completed.slice(0, 5).map((t: any) => (
            <div key={t.id} className="flex items-center gap-2.5 px-3 py-2 opacity-50">
              <button onClick={() => toggleTask.mutate(t)} className="text-emerald-500 flex-shrink-0"><CheckCircle2 size={16} /></button>
              <span className="text-xs line-through truncate">{t.title}</span>
              <span className="text-[10px] text-muted-foreground">{fmtDate(t.completedDate)}</span>
            </div>
          ))}
        </>}
      </div>
    </div>
  );
}

// ============ MAIN PAGE ============
export default function AdminProspectsCRM() {
  const [showCreate, setShowCreate] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();

  const seed = useMutation({
    mutationFn: async () => { const res = await fetch(`${API_BASE}/seed`, { method: "POST" }); if (!res.ok) throw new Error(await res.text()); return res.json(); },
    onSuccess: (data) => { qc.invalidateQueries(); toast({ title: data.count > 0 ? `Seeded ${data.count} prospects` : "Data already exists" }); },
    onError: (e: any) => toast({ title: "Seed Error", description: e.message, variant: "destructive" }),
  });

  const recalc = useMutation({
    mutationFn: async () => { const res = await fetch(`${API_BASE}/recalculate`, { method: "POST" }); if (!res.ok) throw new Error(await res.text()); return res.json(); },
    onSuccess: (data) => { qc.invalidateQueries(); toast({ title: `Recalculated ${data.updated} prospects` }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="p-6 space-y-4 max-w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground flex items-center gap-2"><Target size={18} className="text-primary" /> Sales & Prospects CRM</h1>
          <p className="text-xs text-muted-foreground">Track institutional leads, demos, pilots, and contracts</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => seed.mutate()} disabled={seed.isPending}>{seed.isPending ? "Seeding..." : "Seed Data"}</Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => recalc.mutate()} disabled={recalc.isPending}><RefreshCw size={11} className="mr-1" /> Recalc</Button>
          <Button size="sm" className="h-7 text-xs" onClick={() => setShowCreate(true)}><Plus size={12} className="mr-1" /> New Prospect</Button>
        </div>
      </div>
      <Tabs defaultValue="today" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="today" className="text-xs">Today</TabsTrigger>
          <TabsTrigger value="dashboard" className="text-xs">Dashboard</TabsTrigger>
          <TabsTrigger value="pipeline" className="text-xs">Pipeline</TabsTrigger>
          <TabsTrigger value="tasks" className="text-xs">Tasks</TabsTrigger>
        </TabsList>
        <TabsContent value="today"><TodayTab /></TabsContent>
        <TabsContent value="dashboard"><DashboardTab /></TabsContent>
        <TabsContent value="pipeline"><PipelineTab /></TabsContent>
        <TabsContent value="tasks"><TasksTab /></TabsContent>
      </Tabs>
      <CreateProspectDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}
