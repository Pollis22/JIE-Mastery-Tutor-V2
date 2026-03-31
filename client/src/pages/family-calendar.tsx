import { useState, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NavigationHeader } from "@/components/navigation-header";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Calendar as CalendarIcon, ChevronLeft, ChevronRight,
  Plus, BookOpen, Filter
} from "lucide-react";

interface CalEvent {
  id: string;
  childId: string;
  title: string;
  eventType: string | null;
  description: string | null;
  startDate: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  priority: string | null;
  status: string;
  courseId: string | null;
}

interface FamilyChild {
  id: string;
  childName: string;
  avatarEmoji: string | null;
  color: string | null;
  gradeLevel: string | null;
}

const EVENT_TYPES = ["test", "exam", "quiz", "homework", "project", "field_trip", "meeting", "other"];

export default function FamilyCalendar() {
  const [, setLocation] = useLocation();
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const filterChild = params.get("child") || "";
  const { toast } = useToast();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [childFilter, setChildFilter] = useState(filterChild);
  const [addEventOpen, setAddEventOpen] = useState(false);
  const [eventForm, setEventForm] = useState({
    childId: filterChild || "",
    title: "",
    eventType: "homework",
    startDate: "",
    endDate: "",
    startTime: "",
    endTime: "",
    description: "",
    priority: "medium",
  });

  const { data: children } = useQuery<FamilyChild[]>({
    queryKey: ["/api/family-academic/children"],
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - firstDay.getDay());
  const endDate = new Date(lastDay);
  endDate.setDate(endDate.getDate() + (6 - lastDay.getDay()));

  const { data: events } = useQuery<CalEvent[]>({
    queryKey: ["/api/family-academic/events", { startDate: startDate.toISOString().split("T")[0], endDate: endDate.toISOString().split("T")[0] }],
    queryFn: async () => {
      const res = await fetch(`/api/family-academic/events?startDate=${startDate.toISOString().split("T")[0]}&endDate=${endDate.toISOString().split("T")[0]}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch events");
      return res.json();
    },
  });

  const addEventMutation = useMutation({
    mutationFn: async (data: typeof eventForm) => {
      const res = await apiRequest("POST", `/api/family-academic/children/${data.childId}/events`, {
        title: data.title,
        eventType: data.eventType,
        startDate: data.startDate,
        endDate: data.endDate || undefined,
        startTime: data.startTime || undefined,
        endTime: data.endTime || undefined,
        description: data.description || undefined,
        priority: data.priority,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/family-academic/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/family-academic/dashboard"] });
      setAddEventOpen(false);
      toast({ title: "Event added!", description: data.autoTasksCreated > 0 ? `${data.autoTasksCreated} study tasks auto-generated` : undefined });
    },
  });

  const filteredEvents = useMemo(() => {
    if (!events) return [];
    if (!childFilter) return events;
    return events.filter((e) => e.childId === childFilter);
  }, [events, childFilter]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalEvent[]> = {};
    for (const e of filteredEvents) {
      if (!map[e.startDate]) map[e.startDate] = [];
      map[e.startDate].push(e);
    }
    return map;
  }, [filteredEvents]);

  const childMap = useMemo(() => {
    const map: Record<string, FamilyChild> = {};
    for (const c of children || []) map[c.id] = c;
    return map;
  }, [children]);

  // Calendar grid
  const calendarDays: Date[] = [];
  const d = new Date(startDate);
  while (d <= endDate) {
    calendarDays.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const todayStr = new Date().toISOString().split("T")[0];

  const selectedDayEvents = selectedDate ? (eventsByDate[selectedDate] || []) : [];

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader />
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/family")}>
            <ArrowLeft className="h-4 w-4 mr-1" />Back
          </Button>
          <CalendarIcon className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Family Calendar</h1>
          <div className="ml-auto flex items-center gap-2">
            {/* Child filter */}
            <Select value={childFilter} onValueChange={setChildFilter}>
              <SelectTrigger className="w-40">
                <Filter className="h-4 w-4 mr-1" />
                <SelectValue placeholder="All Children" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Children</SelectItem>
                {(children || []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.avatarEmoji} {c.childName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Dialog open={addEventOpen} onOpenChange={setAddEventOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => {
                  setEventForm({ ...eventForm, startDate: selectedDate || todayStr, childId: childFilter || (children?.[0]?.id || "") });
                }}>
                  <Plus className="h-4 w-4 mr-1" />Add Event
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Add Calendar Event</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Child</Label>
                    <Select value={eventForm.childId} onValueChange={(v) => setEventForm({ ...eventForm, childId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select child" /></SelectTrigger>
                      <SelectContent>
                        {(children || []).map((c) => (<SelectItem key={c.id} value={c.id}>{c.avatarEmoji} {c.childName}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Title</Label><Input value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} placeholder="Math Test Chapter 5" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Type</Label>
                      <Select value={eventForm.eventType} onValueChange={(v) => setEventForm({ ...eventForm, eventType: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {EVENT_TYPES.map((t) => (<SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Priority</Label>
                      <Select value={eventForm.priority} onValueChange={(v) => setEventForm({ ...eventForm, priority: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Start Date</Label><Input type="date" value={eventForm.startDate} onChange={(e) => setEventForm({ ...eventForm, startDate: e.target.value })} /></div>
                    <div><Label>End Date</Label><Input type="date" value={eventForm.endDate} onChange={(e) => setEventForm({ ...eventForm, endDate: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Start Time</Label><Input type="time" value={eventForm.startTime} onChange={(e) => setEventForm({ ...eventForm, startTime: e.target.value })} /></div>
                    <div><Label>End Time</Label><Input type="time" value={eventForm.endTime} onChange={(e) => setEventForm({ ...eventForm, endTime: e.target.value })} /></div>
                  </div>
                  <div><Label>Description</Label><Input value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} placeholder="Optional notes" /></div>
                  <Button onClick={() => addEventMutation.mutate(eventForm)} disabled={!eventForm.title || !eventForm.childId || !eventForm.startDate || addEventMutation.isPending} className="w-full">
                    {addEventMutation.isPending ? "Adding..." : "Add Event"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Calendar Grid */}
          <div className="lg:col-span-3">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <Button variant="ghost" size="sm" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
                  <h2 className="text-lg font-semibold">{monthNames[month]} {year}</h2>
                  <Button variant="ghost" size="sm" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-7 gap-px">
                  {dayNames.map((d) => (
                    <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
                  ))}
                  {calendarDays.map((day) => {
                    const dateStr = day.toISOString().split("T")[0];
                    const isCurrentMonth = day.getMonth() === month;
                    const isToday = dateStr === todayStr;
                    const isSelected = dateStr === selectedDate;
                    const dayEvents = eventsByDate[dateStr] || [];

                    return (
                      <button
                        key={dateStr}
                        onClick={() => setSelectedDate(dateStr)}
                        className={`min-h-[80px] p-1 text-left border rounded-md transition-colors
                          ${!isCurrentMonth ? "opacity-40" : ""}
                          ${isToday ? "bg-primary/5 border-primary" : "border-border hover:bg-muted/50"}
                          ${isSelected ? "ring-2 ring-primary" : ""}
                        `}
                      >
                        <div className={`text-xs font-medium ${isToday ? "text-primary" : ""}`}>{day.getDate()}</div>
                        <div className="space-y-0.5 mt-0.5">
                          {dayEvents.slice(0, 3).map((e) => {
                            const c = childMap[e.childId];
                            return (
                              <div key={e.id} className="text-[10px] truncate px-1 py-0.5 rounded" style={{ backgroundColor: (c?.color || "#4f46e5") + "20", color: c?.color || "#4f46e5" }}>
                                {e.title}
                              </div>
                            );
                          })}
                          {dayEvents.length > 3 && <div className="text-[10px] text-muted-foreground">+{dayEvents.length - 3} more</div>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Day Detail Sidebar */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  {selectedDate ? new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "Select a day"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedDayEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No events on this day.</p>
                ) : (
                  <div className="space-y-3">
                    {selectedDayEvents.map((e) => {
                      const c = childMap[e.childId];
                      return (
                        <div key={e.id} className="border-l-2 pl-3 py-1" style={{ borderColor: c?.color || "#4f46e5" }}>
                          <div className="flex items-center gap-1">
                            <span className="text-sm">{c?.avatarEmoji}</span>
                            <span className="text-xs text-muted-foreground">{c?.childName}</span>
                          </div>
                          <div className="font-medium text-sm">{e.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {e.eventType}{e.startTime ? ` at ${e.startTime}` : ""}
                          </div>
                          {e.description && <div className="text-xs text-muted-foreground mt-1">{e.description}</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick add for selected date */}
            {selectedDate && children && children.length > 0 && (
              <Button variant="outline" className="w-full" onClick={() => {
                setEventForm({ ...eventForm, startDate: selectedDate, childId: childFilter || children[0].id });
                setAddEventOpen(true);
              }}>
                <Plus className="h-4 w-4 mr-1" />Add Event on {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
