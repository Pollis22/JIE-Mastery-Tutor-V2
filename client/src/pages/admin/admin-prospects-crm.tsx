/**
 * Sales / Prospects CRM — Admin Sales Pipeline Page
 * Tabbed interface: Today | Dashboard | Pipeline | Tasks
 * Click any prospect to open full detail/edit panel with contacts & activity history.
 */
import { useState, useEffect } from "react";
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
  Target, DollarSign, AlertTriangle, Clock,
  Activity as ActivityIcon, Building2, Calendar, CheckCircle2,
  Flame, Plus, Search, ChevronRight, ChevronLeft, RefreshCw,
  Rocket, GraduationCap, Briefcase, X, Save, UserPlus,
  Phone, Mail, Globe, MapPin, Edit3, Trash2, MessageSquare,
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

const ACTIVITY_TYPES = [
  "Email Sent", "Email Received", "Call", "Meeting", "Demo",
  "Site Visit", "Proposal Sent", "Contract Sent", "Follow-Up",
  "Internal Note", "Stage Changed", "Pilot Update",
];

const BUYING_ROLES = [
  "Decision Maker", "Champion", "Influencer", "Evaluator",
  "End User", "Procurement", "Executive Sponsor", "Blocker",
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

function fmtMoney(v?: string | number | null): string {
  const n = typeof v === "string" ? parseFloat(v) : (v ?? 0);
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
}

function fmtDate(d?: string | null): string {
  if (!d) return "—";
  return new Date(d.includes("T") ? d : d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateShort(d?: string | null): string {
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

// ============================================================
// PROSPECT DETAIL PANEL
// ============================================================
function ProspectDetailPanel({ prospectId, onClose }: { prospectId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState<"details" | "contacts" | "activity">("details");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [showAddContact, setShowAddContact] = useState(false);
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [newContact, setNewContact] = useState({ firstName: "", lastName: "", title: "", email: "", phone: "", buyingRole: "", notes: "" });
  const [newActivity, setNewActivity] = useState({ activityType: "Call", subject: "", notes: "", outcome: "" });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["sales-prospect-detail", prospectId],
    queryFn: () => fetch(`${API_BASE}/prospects/${prospectId}`).then(r => r.json()),
    enabled: !!prospectId,
  });

  useEffect(() => {
    if (data?.prospect && !editing) setEditForm(data.prospect);
  }, [data?.prospect]);

  const updateProspect = useMutation({
    mutationFn: async (updates: any) => {
      const res = await fetch(`${API_BASE}/prospects/${prospectId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ["sales-prospects"] }); qc.invalidateQueries({ queryKey: ["sales-dashboard"] }); toast({ title: "Prospect updated" }); setEditing(false); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteProspect = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/prospects/${prospectId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sales-prospects"] }); qc.invalidateQueries({ queryKey: ["sales-dashboard"] }); toast({ title: "Prospect deleted" }); onClose(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addContact = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`${API_BASE}/contacts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, prospectId }) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => { refetch(); toast({ title: "Contact added" }); setShowAddContact(false); setNewContact({ firstName: "", lastName: "", title: "", email: "", phone: "", buyingRole: "", notes: "" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteContact = useMutation({
    mutationFn: async (contactId: string) => {
      const res = await fetch(`${API_BASE}/contacts/${contactId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => { refetch(); toast({ title: "Contact removed" }); },
  });

  const addActivity = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`${API_BASE}/activities`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, prospectId }) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => { refetch(); toast({ title: "Activity logged" }); setShowAddActivity(false); setNewActivity({ activityType: "Call", subject: "", notes: "", outcome: "" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="p-6 space-y-4">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>;
  if (!data?.prospect) return <div className="p-6 text-center text-sm text-muted-foreground">Prospect not found</div>;

  const p = data.prospect;
  const contacts = data.contacts || [];
  const activities = data.activities || [];
  const ef = editForm;
  const setF = (field: string, val: any) => setEditForm({ ...editForm, [field]: val });

  function handleSave() {
    const updates: any = {};
    const fields = [
      "institutionName", "institutionType", "sector", "subsector", "website", "phone", "email",
      "address", "city", "state", "zip", "region", "stage", "dealSize", "probability",
      "closeDate", "nextFollowUpDate", "nextMeetingDate", "currentSolution", "painPoints",
      "buyingProcess", "budgetStatus", "decisionTimeline", "source", "nextAction",
      "strategicNotes", "founderNotes", "notes", "estimatedStudents", "estimatedStaff",
      "numberOfSchools", "pilotStartDate", "pilotEndDate", "contractStartDate", "contractEndDate",
      "championIdentified", "pilotRequired", "competitorPresent", "forecastCategory",
    ];
    for (const f of fields) { if (ef[f] !== p[f]) updates[f] = ef[f]; }
    if (Object.keys(updates).length > 0) updateProspect.mutate(updates);
    else setEditing(false);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between px-5 py-4 border-b border-border bg-muted/30">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-base font-bold text-foreground truncate">{p.institutionName}</h2>
            <StageBadge stage={p.stage} />
            <Badge className={`text-[10px] border-0 ${HEALTH_COLORS[p.healthStatus] || ""}`}>{p.healthStatus}</Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{p.institutionType}</span>
            {p.city && <span className="flex items-center gap-0.5"><MapPin size={10} />{p.city}{p.state ? `, ${p.state}` : ""}</span>}
            <span className="font-semibold text-foreground">{fmtMoney(p.dealSize)}</span>
            <span>{p.probability}%</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {editing ? (
            <>
              <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={updateProspect.isPending}><Save size={11} className="mr-1" />{updateProspect.isPending ? "Saving..." : "Save"}</Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setEditing(false); setEditForm(p); }}>Cancel</Button>
            </>
          ) : (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditing(true)}><Edit3 size={11} className="mr-1" />Edit</Button>
          )}
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}><X size={14} /></Button>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex border-b border-border px-5">
        {(["details", "contacts", "activity"] as const).map(s => (
          <button key={s} onClick={() => setActiveSection(s)} className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${activeSection === s ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {s === "details" ? "Details" : s === "contacts" ? `Contacts (${contacts.length})` : `Activity (${activities.length})`}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* DETAILS */}
        {activeSection === "details" && (
          <div className="space-y-5">
            <div><h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Institution Info</h3>
              <div className="grid grid-cols-2 gap-3">
                <FieldRow label="Name" value={ef.institutionName} field="institutionName" editing={editing} onChange={setF} />
                <FieldSelect label="Type" value={ef.institutionType} field="institutionType" editing={editing} onChange={setF} options={INSTITUTION_TYPES} />
                <FieldRow label="Website" value={ef.website} field="website" editing={editing} onChange={setF} link />
                <FieldRow label="Phone" value={ef.phone} field="phone" editing={editing} onChange={setF} />
                <FieldRow label="Email" value={ef.email} field="email" editing={editing} onChange={setF} />
                <FieldRow label="Address" value={ef.address} field="address" editing={editing} onChange={setF} />
                <FieldRow label="City" value={ef.city} field="city" editing={editing} onChange={setF} />
                <FieldRow label="State" value={ef.state} field="state" editing={editing} onChange={setF} />
                <FieldRow label="Region" value={ef.region} field="region" editing={editing} onChange={setF} />
                <FieldRow label="Students" value={ef.estimatedStudents} field="estimatedStudents" editing={editing} onChange={setF} type="number" />
                <FieldRow label="Staff" value={ef.estimatedStaff} field="estimatedStaff" editing={editing} onChange={setF} type="number" />
                <FieldRow label="Schools" value={ef.numberOfSchools} field="numberOfSchools" editing={editing} onChange={setF} type="number" />
              </div></div>
            <div><h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Pipeline & Deal</h3>
              <div className="grid grid-cols-2 gap-3">
                <FieldSelect label="Stage" value={ef.stage} field="stage" editing={editing} onChange={setF} options={STAGES} />
                <FieldRow label="Deal Size ($)" value={ef.dealSize} field="dealSize" editing={editing} onChange={setF} type="number" />
                <FieldRow label="Probability (%)" value={ef.probability} field="probability" editing={editing} onChange={setF} type="number" />
                <FieldRow label="Weighted Value" value={fmtMoney(p.weightedValue)} field="" editing={false} onChange={() => {}} />
                <FieldSelect label="Forecast" value={ef.forecastCategory} field="forecastCategory" editing={editing} onChange={setF} options={["Pipeline", "Best Case", "Commit", "Closed Won", "Closed Lost"]} />
                <FieldRow label="Source" value={ef.source} field="source" editing={editing} onChange={setF} />
                <FieldRow label="Priority" value={p.priorityTier} field="" editing={false} onChange={() => {}} />
                <FieldRow label="Score" value={p.weightedScore} field="" editing={false} onChange={() => {}} />
              </div></div>
            <div><h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Key Dates</h3>
              <div className="grid grid-cols-2 gap-3">
                <FieldRow label="Close Date" value={ef.closeDate} field="closeDate" editing={editing} onChange={setF} type="date" />
                <FieldRow label="Next Follow-Up" value={ef.nextFollowUpDate} field="nextFollowUpDate" editing={editing} onChange={setF} type="date" />
                <FieldRow label="Next Meeting" value={ef.nextMeetingDate} field="nextMeetingDate" editing={editing} onChange={setF} type="date" />
                <FieldRow label="Last Activity" value={fmtDate(p.lastActivityDate)} field="" editing={false} onChange={() => {}} />
                <FieldRow label="Pilot Start" value={ef.pilotStartDate} field="pilotStartDate" editing={editing} onChange={setF} type="date" />
                <FieldRow label="Pilot End" value={ef.pilotEndDate} field="pilotEndDate" editing={editing} onChange={setF} type="date" />
              </div></div>
            <div><h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Qualification</h3>
              <div className="grid grid-cols-2 gap-3">
                <FieldSelect label="Budget Status" value={ef.budgetStatus} field="budgetStatus" editing={editing} onChange={setF} options={["Allocated", "Pending Approval", "Not Budgeted", "Unknown"]} />
                <FieldSelect label="Timeline" value={ef.decisionTimeline} field="decisionTimeline" editing={editing} onChange={setF} options={["This Quarter", "Next Quarter", "This Year", "Next Year", "Unknown"]} />
                <FieldRow label="Current Solution" value={ef.currentSolution} field="currentSolution" editing={editing} onChange={setF} />
                <FieldRow label="Competitor" value={ef.competitorPresent} field="competitorPresent" editing={editing} onChange={setF} />
              </div>
              <div className="grid grid-cols-1 gap-3 mt-3">
                <FieldTextarea label="Pain Points" value={ef.painPoints} field="painPoints" editing={editing} onChange={setF} />
                <FieldTextarea label="Next Action" value={ef.nextAction} field="nextAction" editing={editing} onChange={setF} />
              </div></div>
            <div><h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Notes</h3>
              <div className="space-y-3">
                <FieldTextarea label="Strategic Notes" value={ef.strategicNotes} field="strategicNotes" editing={editing} onChange={setF} />
                <FieldTextarea label="Founder Notes" value={ef.founderNotes} field="founderNotes" editing={editing} onChange={setF} />
                <FieldTextarea label="General Notes" value={ef.notes} field="notes" editing={editing} onChange={setF} />
              </div></div>
            <div className="pt-4 border-t border-border">
              <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => { if (confirm("Delete this prospect and all associated data?")) deleteProspect.mutate(); }}>
                <Trash2 size={11} className="mr-1" /> Delete Prospect
              </Button>
            </div>
          </div>
        )}

        {/* CONTACTS */}
        {activeSection === "contacts" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contacts at {p.institutionName}</h3>
              <Button size="sm" className="h-7 text-xs" onClick={() => setShowAddContact(!showAddContact)}><UserPlus size={11} className="mr-1" /> Add Contact</Button>
            </div>
            {showAddContact && (
              <Card className="p-3 space-y-2 border-primary/30">
                <div className="grid grid-cols-2 gap-2">
                  <Input value={newContact.firstName} onChange={e => setNewContact({ ...newContact, firstName: e.target.value })} placeholder="First name *" className="h-7 text-xs" />
                  <Input value={newContact.lastName} onChange={e => setNewContact({ ...newContact, lastName: e.target.value })} placeholder="Last name *" className="h-7 text-xs" />
                  <Input value={newContact.title} onChange={e => setNewContact({ ...newContact, title: e.target.value })} placeholder="Title / Role" className="h-7 text-xs" />
                  <Select value={newContact.buyingRole} onValueChange={v => setNewContact({ ...newContact, buyingRole: v })}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Buying Role" /></SelectTrigger>
                    <SelectContent>{BUYING_ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input value={newContact.email} onChange={e => setNewContact({ ...newContact, email: e.target.value })} placeholder="Email" className="h-7 text-xs" />
                  <Input value={newContact.phone} onChange={e => setNewContact({ ...newContact, phone: e.target.value })} placeholder="Phone" className="h-7 text-xs" />
                </div>
                <Input value={newContact.notes} onChange={e => setNewContact({ ...newContact, notes: e.target.value })} placeholder="Notes" className="h-7 text-xs" />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowAddContact(false)}>Cancel</Button>
                  <Button size="sm" className="h-7 text-xs" onClick={() => addContact.mutate(newContact)} disabled={!newContact.firstName || !newContact.lastName || addContact.isPending}>{addContact.isPending ? "Adding..." : "Add Contact"}</Button>
                </div>
              </Card>
            )}
            {contacts.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">No contacts yet. Add the first contact at this institution.</div>
            ) : (
              <div className="space-y-2">{contacts.map((c: any) => (
                <Card key={c.id} className="p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{c.firstName} {c.lastName}</span>
                        {c.buyingRole && <Badge variant="outline" className="text-[9px]">{c.buyingRole}</Badge>}
                        {c.relationshipStrength && <Badge className={`text-[9px] border-0 ${c.relationshipStrength === "Hot" ? "bg-red-100 text-red-700" : c.relationshipStrength === "Warm" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}>{c.relationshipStrength}</Badge>}
                      </div>
                      {c.title && <div className="text-xs text-muted-foreground mt-0.5">{c.title}</div>}
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                        {c.email && <span className="flex items-center gap-1"><Mail size={10} />{c.email}</span>}
                        {c.phone && <span className="flex items-center gap-1"><Phone size={10} />{c.phone}</span>}
                      </div>
                      {c.notes && <div className="text-xs text-muted-foreground mt-1 italic">{c.notes}</div>}
                    </div>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-red-500" onClick={() => { if (confirm(`Remove ${c.firstName} ${c.lastName}?`)) deleteContact.mutate(c.id); }}><Trash2 size={12} /></Button>
                  </div>
                </Card>
              ))}</div>
            )}
          </div>
        )}

        {/* ACTIVITY */}
        {activeSection === "activity" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Activity Log</h3>
              <Button size="sm" className="h-7 text-xs" onClick={() => setShowAddActivity(!showAddActivity)}><MessageSquare size={11} className="mr-1" /> Log Activity</Button>
            </div>
            {showAddActivity && (
              <Card className="p-3 space-y-2 border-primary/30">
                <div className="grid grid-cols-2 gap-2">
                  <Select value={newActivity.activityType} onValueChange={v => setNewActivity({ ...newActivity, activityType: v })}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{ACTIVITY_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input value={newActivity.subject} onChange={e => setNewActivity({ ...newActivity, subject: e.target.value })} placeholder="Subject" className="h-7 text-xs" />
                </div>
                <Textarea value={newActivity.notes} onChange={e => setNewActivity({ ...newActivity, notes: e.target.value })} placeholder="Notes / details" rows={2} className="text-xs" />
                <Input value={newActivity.outcome} onChange={e => setNewActivity({ ...newActivity, outcome: e.target.value })} placeholder="Outcome / result" className="h-7 text-xs" />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowAddActivity(false)}>Cancel</Button>
                  <Button size="sm" className="h-7 text-xs" onClick={() => addActivity.mutate(newActivity)} disabled={addActivity.isPending}>{addActivity.isPending ? "Logging..." : "Log Activity"}</Button>
                </div>
              </Card>
            )}
            {activities.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">No activity recorded yet. Log the first interaction.</div>
            ) : (
              <div className="relative border-l-2 border-border ml-2 space-y-0">
                {activities.map((a: any) => (
                  <div key={a.id} className="relative pl-5 pb-4">
                    <div className="absolute left-[-5px] top-1.5 w-2 h-2 rounded-full bg-primary border-2 border-background" />
                    <div className="flex items-center gap-2 mb-0.5">
                      <Badge variant="outline" className="text-[9px]">{a.activityType}</Badge>
                      <span className="text-[10px] text-muted-foreground">{fmtDate(a.createdAt)}</span>
                    </div>
                    {a.subject && <div className="text-xs font-medium text-foreground">{a.subject}</div>}
                    {a.notes && <div className="text-xs text-muted-foreground mt-0.5">{a.notes}</div>}
                    {a.outcome && <div className="text-xs text-emerald-600 mt-0.5">Outcome: {a.outcome}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Field components
function FieldRow({ label, value, field, editing, onChange, type, link }: { label: string; value: any; field: string; editing: boolean; onChange: (f: string, v: any) => void; type?: string; link?: boolean }) {
  if (editing && field) {
    return (<div><Label className="text-[10px] text-muted-foreground">{label}</Label>
      <Input type={type || "text"} value={value ?? ""} onChange={e => onChange(field, type === "number" ? (parseInt(e.target.value) || null) : e.target.value)} className="h-7 text-xs mt-0.5" /></div>);
  }
  const display = type === "date" ? fmtDate(value) : (value ?? "—");
  return (<div><Label className="text-[10px] text-muted-foreground">{label}</Label>
    <div className="text-xs font-medium text-foreground mt-0.5">{link && value ? <a href={value.startsWith("http") ? value : `https://${value}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{value}</a> : display}</div></div>);
}

function FieldSelect({ label, value, field, editing, onChange, options }: { label: string; value: any; field: string; editing: boolean; onChange: (f: string, v: any) => void; options: readonly string[] | string[] }) {
  if (editing && field) {
    return (<div><Label className="text-[10px] text-muted-foreground">{label}</Label>
      <Select value={value || ""} onValueChange={v => onChange(field, v)}><SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>);
  }
  return (<div><Label className="text-[10px] text-muted-foreground">{label}</Label><div className="text-xs font-medium text-foreground mt-0.5">{value || "—"}</div></div>);
}

function FieldTextarea({ label, value, field, editing, onChange }: { label: string; value: any; field: string; editing: boolean; onChange: (f: string, v: any) => void }) {
  if (editing && field) {
    return (<div><Label className="text-[10px] text-muted-foreground">{label}</Label>
      <Textarea value={value ?? ""} onChange={e => onChange(field, e.target.value)} rows={2} className="text-xs mt-0.5" /></div>);
  }
  return (<div><Label className="text-[10px] text-muted-foreground">{label}</Label><div className="text-xs text-foreground mt-0.5 whitespace-pre-wrap">{value || "—"}</div></div>);
}

// ============ CREATE FORM ============
function CreateProspectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<any>({
    institutionName: "", institutionType: "K-12 District", sector: "Education",
    stage: "Identified", city: "", state: "", dealSize: "", probability: 5, source: "Existing List", notes: "",
  });
  const create = useMutation({
    mutationFn: async (data: any) => { const res = await fetch(`${API_BASE}/prospects`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); if (!res.ok) throw new Error(await res.text()); return res.json(); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sales-prospects"] }); qc.invalidateQueries({ queryKey: ["sales-dashboard"] }); toast({ title: "Prospect created" }); onClose(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-base">New Prospect</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Institution Name *</Label><Input value={form.institutionName} onChange={e => setForm({ ...form, institutionName: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Type *</Label><Select value={form.institutionType} onValueChange={v => setForm({ ...form, institutionType: v })}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{INSTITUTION_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-xs">Stage</Label><Select value={form.stage} onValueChange={v => setForm({ ...form, stage: v })}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-xs">City</Label><Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
            <div><Label className="text-xs">State</Label><Input value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} /></div>
            <div><Label className="text-xs">Deal Size ($)</Label><Input type="number" value={form.dealSize} onChange={e => setForm({ ...form, dealSize: e.target.value })} /></div>
            <div><Label className="text-xs">Probability (%)</Label><Input type="number" min="0" max="100" value={form.probability} onChange={e => setForm({ ...form, probability: parseInt(e.target.value) || 0 })} /></div>
            <div><Label className="text-xs">Source</Label><Select value={form.source} onValueChange={v => setForm({ ...form, source: v })}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{["Cold Outreach","Referral","Inbound Website","Conference","Partner","Existing List","LinkedIn","Other"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
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
function TodayTab({ onSelectProspect }: { onSelectProspect: (id: string) => void }) {
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
        {sections.map(sec => (
          <Card key={sec.title}>
            <CardHeader className="px-4 py-2.5 border-b border-border"><CardTitle className="text-xs font-semibold flex items-center justify-between"><span>{sec.title}</span>{sec.items?.length > 0 && <Badge variant="secondary" className="text-[10px]">{sec.items.length}</Badge>}</CardTitle></CardHeader>
            <CardContent className="p-0">
              {!sec.items || sec.items.length === 0 ? <div className="px-4 py-4 text-center text-xs text-muted-foreground">{sec.empty}</div> :
              <div className="divide-y divide-border max-h-48 overflow-y-auto">{sec.items.slice(0, 6).map((item: any) => (
                <div key={item.id} className="flex items-center gap-2 px-4 py-2 text-xs hover:bg-muted/40 cursor-pointer" onClick={() => sec.type === "prospect" && onSelectProspect(item.id)}>
                  {sec.type === "task" ? <><div className={`w-1.5 h-1.5 rounded-full ${item.priority === "High" ? "bg-red-500" : "bg-yellow-500"}`} /><span className="flex-1 truncate font-medium">{item.title}</span>{item.dueDate && <span className={isOverdue(item.dueDate) ? "text-red-500" : "text-muted-foreground"}>{fmtDateShort(item.dueDate)}</span>}</>
                  : <><span className="flex-1 truncate font-medium">{item.institutionName}</span><StageBadge stage={item.stage} /><span className="tabular-nums">{fmtMoney(item.dealSize)}</span></>}
                </div>
              ))}</div>}
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
        <Card><CardHeader className="px-4 py-2.5 border-b"><CardTitle className="text-xs font-semibold">Pipeline by Stage</CardTitle></CardHeader><CardContent className="p-4 space-y-2">{Object.entries(data.byStage || {}).sort((a: any, b: any) => b[1] - a[1]).map(([stage, count]: any) => (<div key={stage} className="flex items-center justify-between text-xs"><StageBadge stage={stage} /><span className="font-bold">{count}</span></div>))}</CardContent></Card>
        <Card><CardHeader className="px-4 py-2.5 border-b"><CardTitle className="text-xs font-semibold">By Institution Type</CardTitle></CardHeader><CardContent className="p-4 space-y-2">{Object.entries(data.byType || {}).sort((a: any, b: any) => b[1] - a[1]).map(([type, count]: any) => (<div key={type} className="flex items-center justify-between text-xs"><span>{type}</span><span className="font-bold">{count}</span></div>))}</CardContent></Card>
        <Card><CardHeader className="px-4 py-2.5 border-b"><CardTitle className="text-xs font-semibold">Forecast</CardTitle></CardHeader><CardContent className="p-4 space-y-3">{Object.entries(data.byForecast || {}).map(([cat, { count, value }]: any) => (<div key={cat} className="flex items-center justify-between text-xs"><div className="flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${cat === "Commit" ? "bg-emerald-500" : cat === "Best Case" ? "bg-blue-500" : "bg-primary"}`} /><span>{cat}</span></div><div className="text-right"><span className="font-bold">{fmtMoney(value)}</span><span className="text-muted-foreground ml-2">{count} deals</span></div></div>))}</CardContent></Card>
        <Card><CardHeader className="px-4 py-2.5 border-b"><CardTitle className="text-xs font-semibold">Closing in 30 Days</CardTitle></CardHeader><CardContent className="p-0">{(!data.upcomingCloseDeals || data.upcomingCloseDeals.length === 0) ? <div className="px-4 py-6 text-center text-xs text-muted-foreground">No close dates within 30 days</div> : <div className="divide-y divide-border">{data.upcomingCloseDeals.map((p: any) => (<div key={p.id} className="flex items-center gap-2 px-4 py-2 text-xs"><span className="flex-1 truncate font-medium">{p.institutionName}</span><span className="tabular-nums">{fmtMoney(p.dealSize)}</span><span className="text-muted-foreground">{fmtDateShort(p.closeDate)}</span></div>))}</div>}</CardContent></Card>
      </div>
    </div>
  );
}

// ============ PIPELINE TAB ============
function PipelineTab({ onSelectProspect }: { onSelectProspect: (id: string) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: prospects = [], isLoading } = useQuery<any[]>({ queryKey: ["sales-prospects"], queryFn: () => fetch(`${API_BASE}/prospects`).then(r => r.json()) });
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const moveStage = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => { const res = await fetch(`${API_BASE}/prospects/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage }) }); if (!res.ok) throw new Error(await res.text()); return res.json(); },
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
        <Select value={filterType} onValueChange={setFilterType}><SelectTrigger className="h-7 text-[11px] w-32"><SelectValue placeholder="All Types" /></SelectTrigger><SelectContent><SelectItem value="all">All Types</SelectItem>{INSTITUTION_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
        <span className="text-[11px] text-muted-foreground">{filtered.length} prospects</span>
      </div>
      <div className="flex gap-2.5 overflow-x-auto pb-4">
        {activeStages.map(stage => {
          const items = byStage[stage] || [];
          const value = items.reduce((s: number, p: any) => s + parseFloat(p.dealSize || "0"), 0);
          return (
            <div key={stage} className="flex-shrink-0 w-48">
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <div className="px-2.5 py-2 border-b border-border"><div className="flex items-center justify-between"><span className="text-[11px] font-semibold truncate">{stage}</span><Badge variant="secondary" className="text-[9px] px-1 h-4">{items.length}</Badge></div>{value > 0 && <div className="text-[10px] text-muted-foreground flex items-center gap-0.5"><DollarSign size={9} />{fmtMoney(value)}</div>}</div>
                <div className="p-1.5 space-y-1.5 min-h-[80px] max-h-[calc(100vh-300px)] overflow-y-auto">
                  {items.length === 0 ? <div className="text-center py-4 text-[10px] text-muted-foreground/40">Empty</div> :
                  items.map((p: any) => {
                    const stageIdx = STAGES.indexOf(p.stage);
                    return (
                      <div key={p.id} className={`bg-card border rounded p-2 space-y-1 cursor-pointer hover:shadow-md transition-shadow ${p.healthStatus === "Stalled" ? "border-l-2 border-l-red-500" : p.healthStatus === "At Risk" ? "border-l-2 border-l-yellow-500" : "border-border"}`} onClick={() => onSelectProspect(p.id)}>
                        <div className="text-[11px] font-semibold leading-tight line-clamp-2">{p.institutionName}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{p.institutionType}</div>
                        <div className="flex items-center justify-between"><span className="text-[11px] font-bold">{fmtMoney(p.dealSize)}</span><span className="text-[10px] text-muted-foreground">{p.probability}%</span></div>
                        <div className="flex items-center gap-0.5 pt-0.5" onClick={e => e.stopPropagation()}>
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
        <div className="flex items-center gap-2"><h2 className="text-sm font-semibold">Tasks</h2><Badge variant="secondary" className="text-[10px]">{pending.length} pending</Badge>{overdue.length > 0 && <Badge variant="destructive" className="text-[10px]">{overdue.length} overdue</Badge>}</div>
        <Button size="sm" className="h-7 text-xs" onClick={() => setShowAdd(!showAdd)}><Plus size={12} className="mr-1" /> Add Task</Button>
      </div>
      {showAdd && (<Card className="p-3 space-y-2"><Input value={newTask.title} onChange={e => setNewTask({ ...newTask, title: e.target.value })} placeholder="Task title *" className="h-7 text-xs" /><div className="grid grid-cols-4 gap-2"><Select value={newTask.priority} onValueChange={v => setNewTask({ ...newTask, priority: v })}><SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="High">High</SelectItem><SelectItem value="Medium">Medium</SelectItem><SelectItem value="Low">Low</SelectItem></SelectContent></Select><Input type="date" value={newTask.dueDate} onChange={e => setNewTask({ ...newTask, dueDate: e.target.value })} className="h-7 text-[11px]" /><Select value={newTask.taskType} onValueChange={v => setNewTask({ ...newTask, taskType: v })}><SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger><SelectContent>{["General","Follow-Up","Demo","Proposal","Pilot Setup","Contract","Onboarding","Research","Outreach"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select><Button size="sm" className="h-7 text-xs" onClick={() => createTask.mutate(newTask)} disabled={!newTask.title || createTask.isPending}>{createTask.isPending ? "..." : "Create"}</Button></div></Card>)}
      <div className="border border-border rounded-lg divide-y divide-border">
        {pending.length === 0 && completed.length === 0 ? <div className="px-4 py-8 text-center text-sm text-muted-foreground">No tasks yet</div> : <>
          {pending.map((t: any) => (<div key={t.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/30"><button onClick={() => toggleTask.mutate(t)} className="text-muted-foreground hover:text-primary flex-shrink-0"><div className="w-4 h-4 rounded-full border-2 border-current" /></button><div className="flex-1 min-w-0"><div className="text-xs font-medium truncate">{t.title}</div><div className="text-[10px] text-muted-foreground">{t.taskType}</div></div><Badge variant="outline" className={`text-[9px] ${t.priority === "High" ? "border-red-300 text-red-600" : ""}`}>{t.priority}</Badge>{t.dueDate && <span className={`text-[11px] ${isOverdue(t.dueDate) ? "text-red-500 font-medium" : "text-muted-foreground"}`}>{isOverdue(t.dueDate) && <AlertTriangle size={10} className="inline mr-0.5" />}{fmtDateShort(t.dueDate)}</span>}</div>))}
          {completed.length > 0 && <div className="px-3 py-1.5 bg-muted/30"><span className="text-[10px] text-muted-foreground font-medium">Completed ({completed.length})</span></div>}
          {completed.slice(0, 5).map((t: any) => (<div key={t.id} className="flex items-center gap-2.5 px-3 py-2 opacity-50"><button onClick={() => toggleTask.mutate(t)} className="text-emerald-500 flex-shrink-0"><CheckCircle2 size={16} /></button><span className="text-xs line-through truncate">{t.title}</span><span className="text-[10px] text-muted-foreground">{fmtDateShort(t.completedDate)}</span></div>))}
        </>}
      </div>
    </div>
  );
}

// ============ MAIN PAGE ============
export default function AdminProspectsCRM() {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedProspectId, setSelectedProspectId] = useState<string | null>(null);
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
    <div className="flex h-screen max-h-screen">
      <div className={`flex-1 flex flex-col min-w-0 ${selectedProspectId ? "max-w-[calc(100%-420px)]" : ""}`}>
        <div className="p-6 pb-2 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground flex items-center gap-2"><Target size={18} className="text-primary" /> Sales & Prospects CRM</h1>
            <p className="text-xs text-muted-foreground">Click any prospect to view details, edit info, manage contacts & log activity</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => seed.mutate()} disabled={seed.isPending}>{seed.isPending ? "Seeding..." : "Seed Data"}</Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => recalc.mutate()} disabled={recalc.isPending}><RefreshCw size={11} className="mr-1" /> Recalc</Button>
            <Button size="sm" className="h-7 text-xs" onClick={() => setShowCreate(true)}><Plus size={12} className="mr-1" /> New Prospect</Button>
          </div>
        </div>
        <div className="flex-1 overflow-auto px-6 pb-6">
          <Tabs defaultValue="today" className="w-full">
            <TabsList className="grid w-full grid-cols-4"><TabsTrigger value="today" className="text-xs">Today</TabsTrigger><TabsTrigger value="dashboard" className="text-xs">Dashboard</TabsTrigger><TabsTrigger value="pipeline" className="text-xs">Pipeline</TabsTrigger><TabsTrigger value="tasks" className="text-xs">Tasks</TabsTrigger></TabsList>
            <TabsContent value="today"><TodayTab onSelectProspect={setSelectedProspectId} /></TabsContent>
            <TabsContent value="dashboard"><DashboardTab /></TabsContent>
            <TabsContent value="pipeline"><PipelineTab onSelectProspect={setSelectedProspectId} /></TabsContent>
            <TabsContent value="tasks"><TasksTab /></TabsContent>
          </Tabs>
        </div>
      </div>
      {selectedProspectId && (
        <div className="w-[420px] border-l border-border bg-background flex-shrink-0 overflow-hidden">
          <ProspectDetailPanel prospectId={selectedProspectId} onClose={() => setSelectedProspectId(null)} />
        </div>
      )}
      <CreateProspectDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}
