/**
 * Sales CRM — Calendar Tab
 * Month grid + agenda views for conferences, deadlines, meetings & travel.
 * Events carry a strategic score (0-10), priority tier, AI assessment, and
 * per-event email reminder offsets (default 30/14/7/1 days before start).
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus,
  MapPin, ExternalLink, Trash2, BellRing, List, LayoutGrid, Sparkles,
} from "lucide-react";

const API_BASE = "/api/admin/prospects";

const EVENT_STATUSES = ["New", "Researching", "Registered", "Attending", "Skipped", "Attended"];
const EVENT_TIERS = ["Must Attend", "High", "Medium", "Low"];
const EVENT_TYPES = ["Conference", "Meeting", "Deadline", "Travel", "Task"];

interface SalesEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startDate: string;
  endDate: string | null;
  url: string | null;
  eventType: string;
  audience: string | null;
  relevance: string | null;
  score: number | null;
  priorityTier: string | null;
  claudeComments: string | null;
  status: string;
  ownerNotes: string | null;
  reminderDays: string;
  emailReminders: boolean;
}

// ---------- date helpers (YYYY-MM-DD strings, no TZ drift) ----------
const todayYmd = () => new Date().toISOString().split("T")[0];
const ymd = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const fmtShort = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
const fmtLong = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const daysUntil = (s: string) => Math.round((Date.parse(s + "T12:00:00") - Date.parse(todayYmd() + "T12:00:00")) / 86400000);

const tierBg = (t: string | null) =>
  t === "Must Attend" ? "bg-red-600" : t === "High" ? "bg-amber-500" : t === "Medium" ? "bg-blue-500" : "bg-gray-400";
const tierBorder = (t: string | null) =>
  t === "Must Attend" ? "border-l-red-600" : t === "High" ? "border-l-amber-500" : t === "Medium" ? "border-l-blue-500" : "border-l-gray-400";
const statusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" =>
  s === "Registered" || s === "Attending" ? "default" : s === "Skipped" ? "destructive" : s === "Attended" ? "outline" : "secondary";

const EMPTY_EVENT = {
  title: "", description: "", location: "", startDate: "", endDate: "", url: "",
  eventType: "Conference", audience: "", relevance: "", score: 5, priorityTier: "Medium",
  claudeComments: "", status: "New", ownerNotes: "", reminderDays: "30,14,7,1", emailReminders: true,
};

export function CalendarTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const now = new Date();
  const [view, setView] = useState<"month" | "agenda">("month");
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [tierFilter, setTierFilter] = useState("all");
  const [showSkipped, setShowSkipped] = useState(false);
  const [selected, setSelected] = useState<SalesEvent | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState<any>(EMPTY_EVENT);

  const { data: events = [], isLoading } = useQuery<SalesEvent[]>({
    queryKey: ["sales-events"],
    queryFn: () => fetch(`${API_BASE}/events`).then(r => r.json()),
  });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["sales-events"] }); };

  const createEvent = useMutation({
    mutationFn: async (data: any) => {
      const payload = { ...data, score: data.score === "" ? null : Number(data.score) };
      Object.keys(payload).forEach(k => { if (payload[k] === "") payload[k] = null; });
      const res = await fetch(`${API_BASE}/events`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => { invalidate(); toast({ title: "Event added to calendar" }); setShowAdd(false); setDraft(EMPTY_EVENT); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateEvent = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const res = await fetch(`${API_BASE}/events/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (updated: SalesEvent) => { invalidate(); setSelected(updated); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteEvent = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API_BASE}/events/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => { invalidate(); toast({ title: "Event deleted" }); setSelected(null); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const sendReminder = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API_BASE}/events/${id}/send-reminder`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => toast({ title: "Reminder email sent", description: "Check your inbox." }),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filtered = useMemo(() => events.filter(e => {
    if (!showSkipped && e.status === "Skipped") return false;
    if (tierFilter !== "all" && e.priorityTier !== tierFilter) return false;
    return true;
  }), [events, tierFilter, showSkipped]);

  const upcoming = useMemo(() =>
    filtered.filter(e => (e.endDate || e.startDate) >= todayYmd() && e.status !== "Attended")
      .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [filtered]);

  // ---------- month grid ----------
  const grid = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const cells: { date: string | null; day: number | null }[] = [];
    for (let i = 0; i < startDow; i++) cells.push({ date: null, day: null });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ date: ymd(cursor.y, cursor.m, d), day: d });
    while (cells.length % 7 !== 0) cells.push({ date: null, day: null });
    return cells;
  }, [cursor]);

  const eventsOn = (date: string) =>
    filtered.filter(e => e.startDate <= date && (e.endDate || e.startDate) >= date);

  const monthLabel = new Date(cursor.y, cursor.m, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const shiftMonth = (n: number) => setCursor(c => {
    const d = new Date(c.y, c.m + n, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  if (isLoading) return <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      {/* Header / controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarIcon size={16} className="text-red-700" />
          <h2 className="text-sm font-semibold">Calendar</h2>
          <Badge variant="secondary" className="text-[10px]">{upcoming.length} upcoming</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Select value={tierFilter} onValueChange={setTierFilter}>
            <SelectTrigger className="h-7 w-32 text-[11px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All tiers</SelectItem>{EVENT_TIERS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Switch checked={showSkipped} onCheckedChange={setShowSkipped} className="scale-75" /> Skipped
          </div>
          <div className="flex rounded-md border overflow-hidden">
            <Button size="sm" variant={view === "month" ? "default" : "ghost"} className="h-7 rounded-none px-2" onClick={() => setView("month")}><LayoutGrid size={12} /></Button>
            <Button size="sm" variant={view === "agenda" ? "default" : "ghost"} className="h-7 rounded-none px-2" onClick={() => setView("agenda")}><List size={12} /></Button>
          </div>
          <Button size="sm" className="h-7 text-xs" onClick={() => { setDraft(EMPTY_EVENT); setShowAdd(true); }}><Plus size={12} className="mr-1" /> Add Event</Button>
        </div>
      </div>

      {/* Next 30 days strip */}
      {upcoming.filter(e => daysUntil(e.startDate) <= 30).length > 0 && (
        <Card className="p-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Next 30 Days</div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {upcoming.filter(e => daysUntil(e.startDate) <= 30).map(e => {
              const d = daysUntil(e.startDate);
              return (
                <button key={e.id} onClick={() => setSelected(e)}
                  className={`shrink-0 text-left border border-l-4 ${tierBorder(e.priorityTier)} rounded-md px-2.5 py-1.5 hover:bg-muted/60 transition-colors`}>
                  <div className="text-[11px] font-semibold max-w-[180px] truncate">{e.title}</div>
                  <div className="text-[10px] text-muted-foreground">{fmtShort(e.startDate)}{e.endDate && e.endDate !== e.startDate ? `–${fmtShort(e.endDate)}` : ""} · {d <= 0 ? "underway" : `${d}d out`}</div>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {view === "month" ? (
        <Card className="p-3">
          <div className="flex items-center justify-between mb-2">
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => shiftMonth(-1)}><ChevronLeft size={14} /></Button>
            <div className="text-sm font-semibold">{monthLabel}</div>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setCursor({ y: now.getFullYear(), m: now.getMonth() })}>Today</Button>
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => shiftMonth(1)}><ChevronRight size={14} /></Button>
            </div>
          </div>
          <div className="grid grid-cols-7 text-[10px] font-semibold text-muted-foreground mb-1">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => <div key={d} className="px-1 py-0.5">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-px bg-border rounded-md overflow-hidden">
            {grid.map((cell, i) => {
              const isToday = cell.date === todayYmd();
              const dayEvents = cell.date ? eventsOn(cell.date) : [];
              return (
                <div key={i} className={`bg-background min-h-[76px] p-1 ${cell.date ? "" : "bg-muted/40"}`}>
                  {cell.day && (
                    <div className={`text-[10px] mb-0.5 w-5 h-5 flex items-center justify-center rounded-full ${isToday ? "bg-red-600 text-white font-bold" : "text-muted-foreground"}`}>{cell.day}</div>
                  )}
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map(e => (
                      <button key={e.id} onClick={() => setSelected(e)}
                        className={`block w-full text-left text-[9.5px] leading-tight text-white px-1 py-0.5 rounded truncate ${tierBg(e.priorityTier)} ${e.status === "Skipped" ? "opacity-40 line-through" : ""}`}
                        title={e.title}>
                        {e.title}
                      </button>
                    ))}
                    {dayEvents.length > 3 && <div className="text-[9px] text-muted-foreground px-1">+{dayEvents.length - 3} more</div>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-3 mt-2 text-[10px] text-muted-foreground">
            {EVENT_TIERS.map(t => <span key={t} className="flex items-center gap-1"><span className={`inline-block w-2.5 h-2.5 rounded-sm ${tierBg(t)}`} />{t}</span>)}
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {upcoming.length === 0 && <Card className="p-6 text-center text-sm text-muted-foreground">No upcoming events. Add conferences, deadlines, or travel to build your calendar.</Card>}
          {upcoming.map(e => {
            const d = daysUntil(e.startDate);
            return (
              <Card key={e.id} className={`p-3 border-l-4 ${tierBorder(e.priorityTier)} cursor-pointer hover:bg-muted/40 transition-colors`} onClick={() => setSelected(e)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">{e.title}</span>
                      {e.score != null && <Badge className={`${tierBg(e.priorityTier)} text-white text-[10px]`}>{e.score}/10</Badge>}
                      <Badge variant={statusVariant(e.status)} className="text-[10px]">{e.status}</Badge>
                      {e.relevance && <span className="text-[10px] text-muted-foreground">{e.relevance}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>{fmtLong(e.startDate)}{e.endDate && e.endDate !== e.startDate ? ` – ${fmtShort(e.endDate)}` : ""}</span>
                      {e.location && <span className="flex items-center gap-0.5"><MapPin size={10} />{e.location}</span>}
                      <span className="font-medium text-foreground">{d <= 0 ? "Underway" : `${d} days out`}</span>
                    </div>
                    {e.claudeComments && (
                      <div className="text-[11px] text-muted-foreground mt-1.5 flex gap-1.5 items-start">
                        <Sparkles size={11} className="mt-0.5 shrink-0 text-red-700" />
                        <span className="line-clamp-2">{e.claudeComments}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail / edit dialog */}
      {selected && (
        <Dialog open onOpenChange={() => setSelected(null)}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base pr-6">
                {selected.title}
                {selected.score != null && <Badge className={`${tierBg(selected.priorityTier)} text-white text-[10px]`}>{selected.score}/10</Badge>}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                <span>{fmtLong(selected.startDate)}{selected.endDate && selected.endDate !== selected.startDate ? ` – ${fmtLong(selected.endDate)}` : ""}</span>
                {selected.location && <span className="flex items-center gap-0.5"><MapPin size={11} />{selected.location}</span>}
              </div>
              {selected.audience && <div className="text-xs"><span className="text-muted-foreground">Audience:</span> {selected.audience}</div>}
              {selected.relevance && <div className="text-xs"><span className="text-muted-foreground">Relevance:</span> {selected.relevance}</div>}
              {selected.claudeComments && (
                <div className="text-xs bg-muted/60 border-l-2 border-red-600 rounded-r px-3 py-2 flex gap-1.5">
                  <Sparkles size={12} className="mt-0.5 shrink-0 text-red-700" />
                  <span>{selected.claudeComments}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px]">Status</Label>
                  <Select value={selected.status} onValueChange={v => updateEvent.mutate({ id: selected.id, updates: { status: v } })}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{EVENT_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px]">Priority</Label>
                  <Select value={selected.priorityTier || "Medium"} onValueChange={v => updateEvent.mutate({ id: selected.id, updates: { priorityTier: v } })}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{EVENT_TIERS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 items-end">
                <div>
                  <Label className="text-[11px]">Reminder days before (comma-sep)</Label>
                  <Input className="h-7 text-xs" defaultValue={selected.reminderDays}
                    onBlur={e => { if (e.target.value !== selected.reminderDays) updateEvent.mutate({ id: selected.id, updates: { reminderDays: e.target.value } }); }} />
                </div>
                <div className="flex items-center gap-2 pb-1">
                  <Switch checked={selected.emailReminders} onCheckedChange={v => updateEvent.mutate({ id: selected.id, updates: { emailReminders: v } })} className="scale-90" />
                  <span className="text-[11px]">Email reminders</span>
                </div>
              </div>
              <div>
                <Label className="text-[11px]">Your notes</Label>
                <Textarea rows={2} className="text-xs" defaultValue={selected.ownerNotes || ""}
                  onBlur={e => { if (e.target.value !== (selected.ownerNotes || "")) updateEvent.mutate({ id: selected.id, updates: { ownerNotes: e.target.value } }); }} />
              </div>
              <div className="flex items-center justify-between pt-1">
                <div className="flex gap-2">
                  {selected.url && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => window.open(selected.url!, "_blank")}>
                      <ExternalLink size={12} className="mr-1" /> Event Site
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => sendReminder.mutate(selected.id)} disabled={sendReminder.isPending}>
                    <BellRing size={12} className="mr-1" /> {sendReminder.isPending ? "Sending..." : "Email Me Now"}
                  </Button>
                </div>
                <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600 hover:text-red-700" onClick={() => { if (confirm("Delete this event?")) deleteEvent.mutate(selected.id); }}>
                  <Trash2 size={12} className="mr-1" /> Delete
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Add event dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base">Add Calendar Event</DialogTitle></DialogHeader>
          <div className="space-y-2.5">
            <Input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="Event title *" className="h-8 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-[11px]">Start date *</Label><Input type="date" value={draft.startDate} onChange={e => setDraft({ ...draft, startDate: e.target.value })} className="h-7 text-xs" /></div>
              <div><Label className="text-[11px]">End date</Label><Input type="date" value={draft.endDate} onChange={e => setDraft({ ...draft, endDate: e.target.value })} className="h-7 text-xs" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input value={draft.location} onChange={e => setDraft({ ...draft, location: e.target.value })} placeholder="Location" className="h-7 text-xs" />
              <Input value={draft.url} onChange={e => setDraft({ ...draft, url: e.target.value })} placeholder="URL" className="h-7 text-xs" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Select value={draft.eventType} onValueChange={v => setDraft({ ...draft, eventType: v })}>
                <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
                <SelectContent>{EVENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={draft.priorityTier} onValueChange={v => setDraft({ ...draft, priorityTier: v })}>
                <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
                <SelectContent>{EVENT_TIERS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="number" min={0} max={10} value={draft.score} onChange={e => setDraft({ ...draft, score: e.target.value })} placeholder="Score 0-10" className="h-7 text-xs" />
            </div>
            <Input value={draft.relevance} onChange={e => setDraft({ ...draft, relevance: e.target.value })} placeholder="Relevance (JIE, ACE, Prelo, Fundraise)" className="h-7 text-xs" />
            <Textarea value={draft.ownerNotes} onChange={e => setDraft({ ...draft, ownerNotes: e.target.value })} placeholder="Notes (optional)" rows={2} className="text-xs" />
            <div className="grid grid-cols-2 gap-2 items-end">
              <div><Label className="text-[11px]">Reminder days before</Label><Input value={draft.reminderDays} onChange={e => setDraft({ ...draft, reminderDays: e.target.value })} className="h-7 text-xs" /></div>
              <div className="flex items-center gap-2 pb-1"><Switch checked={draft.emailReminders} onCheckedChange={v => setDraft({ ...draft, emailReminders: v })} className="scale-90" /><span className="text-[11px]">Email reminders</span></div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button size="sm" className="h-7 text-xs" onClick={() => createEvent.mutate(draft)} disabled={!draft.title || !draft.startDate || createEvent.isPending}>
                {createEvent.isPending ? "..." : "Add Event"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
