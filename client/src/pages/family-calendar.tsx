import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { NavigationHeader } from "@/components/navigation-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useState, useMemo } from "react";

interface CalendarEvent {
  id: string;
  childId: string;
  title: string;
  eventType: string | null;
  startDate: string;
  endDate: string | null;
  startTime: string | null;
  status: string | null;
  courseId: string | null;
  priority: string | null;
}

interface FamilyChild {
  id: string;
  childName: string;
  avatarEmoji: string | null;
  color: string | null;
}

const EVENT_TYPES = ["test", "quiz", "homework", "project", "class", "other"];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

export default function FamilyCalendarPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [filterChildId, setFilterChildId] = useState<string>("all");
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newEvent, setNewEvent] = useState({
    childId: "",
    title: "",
    eventType: "homework",
    startDate: "",
    startTime: "",
    description: "",
    priority: "medium",
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
  const startDate = `${monthStr}-01`;
  const endDate = `${monthStr}-${getDaysInMonth(year, month)}`;

  const { data: children } = useQuery<FamilyChild[]>({
    queryKey: ["/api/family-academic/children"],
    enabled: !!user,
  });

  const { data: events, isLoading } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/family-academic/events", { startDate, endDate, childId: filterChildId !== "all" ? filterChildId : undefined }],
    queryFn: async () => {
      const params = new URLSearchParams({ startDate, endDate });
      if (filterChildId !== "all") params.append("childId", filterChildId);
      const res = await fetch(`/api/family-academic/events?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch events");
      return res.json();
    },
    enabled: !!user,
  });

  const addEventMutation = useMutation({
    mutationFn: (event: any) => apiRequest("POST", "/api/family-academic/events", event),
    onSuccess: async (res) => {
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/family-academic/events"] });
      setShowAddEvent(false);
      setNewEvent({ childId: "", title: "", eventType: "homework", startDate: "", startTime: "", description: "", priority: "medium" });
      const autoTasks = result.autoTasksCreated;
      toast({
        title: "Event added!",
        description: autoTasks > 0 ? `${autoTasks} study tasks auto-created!` : "Added to calendar.",
      });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // Build calendar grid
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    (events || []).forEach((e) => {
      if (!map[e.startDate]) map[e.startDate] = [];
      map[e.startDate].push(e);
    });
    return map;
  }, [events]);

  const childMap = useMemo(() => {
    const map: Record<string, FamilyChild> = {};
    (children || []).forEach((c) => { map[c.id] = c; });
    return map;
  }, [children]);

  const daysToPrev = () => setCurrentDate(new Date(year, month - 1, 1));
  const daysToNext = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToToday = () => setCurrentDate(new Date());

  const todayStr = new Date().toISOString().split("T")[0];
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] || []) : [];

  return (
    <>
      <NavigationHeader />
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">📅 Family Calendar</h1>
              <p className="text-sm text-gray-500">Tests, homework, and events for all children</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setLocation("/family")}>← Family Hub</Button>
              <Dialog open={showAddEvent} onOpenChange={setShowAddEvent}>
                <DialogTrigger asChild>
                  <Button className="bg-indigo-600 hover:bg-indigo-700">+ Add Event</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Calendar Event</DialogTitle></DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div>
                      <Label>Child</Label>
                      <Select value={newEvent.childId} onValueChange={(v) => setNewEvent({ ...newEvent, childId: v })}>
                        <SelectTrigger><SelectValue placeholder="Select child" /></SelectTrigger>
                        <SelectContent>
                          {(children || []).map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.avatarEmoji} {c.childName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Title</Label>
                      <Input
                        value={newEvent.title}
                        onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                        placeholder="e.g., Math Chapter 5 Test"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Type</Label>
                        <Select value={newEvent.eventType} onValueChange={(v) => setNewEvent({ ...newEvent, eventType: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {EVENT_TYPES.map((t) => (
                              <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Priority</Label>
                        <Select value={newEvent.priority} onValueChange={(v) => setNewEvent({ ...newEvent, priority: v })}>
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
                      <div>
                        <Label>Date</Label>
                        <Input
                          type="date"
                          value={newEvent.startDate}
                          onChange={(e) => setNewEvent({ ...newEvent, startDate: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Time (optional)</Label>
                        <Input
                          type="time"
                          value={newEvent.startTime}
                          onChange={(e) => setNewEvent({ ...newEvent, startTime: e.target.value })}
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Description (optional)</Label>
                      <Input
                        value={newEvent.description}
                        onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                        placeholder="Additional notes..."
                      />
                    </div>
                    <Button
                      className="w-full bg-indigo-600 hover:bg-indigo-700"
                      disabled={!newEvent.childId || !newEvent.title || !newEvent.startDate || addEventMutation.isPending}
                      onClick={() => addEventMutation.mutate(newEvent)}
                    >
                      {addEventMutation.isPending ? "Adding..." : "Add Event"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Filter + Month Nav */}
          <div className="flex flex-col sm:flex-row items-center justify-between mb-4 gap-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={daysToPrev}>←</Button>
              <h2 className="text-lg font-semibold px-4">{monthNames[month]} {year}</h2>
              <Button variant="outline" size="sm" onClick={daysToNext}>→</Button>
              <Button variant="ghost" size="sm" onClick={goToToday}>Today</Button>
            </div>
            <Select value={filterChildId} onValueChange={setFilterChildId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All children" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Children</SelectItem>
                {(children || []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.avatarEmoji} {c.childName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Calendar Grid */}
            <Card className="lg:col-span-2 bg-white/90 backdrop-blur">
              <CardContent className="p-4">
                {/* Day headers */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                    <div key={d} className="text-center text-xs font-medium text-gray-500 py-1">{d}</div>
                  ))}
                </div>
                {/* Calendar days */}
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: firstDay }).map((_, i) => (
                    <div key={`empty-${i}`} className="h-20" />
                  ))}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const dayEvents = eventsByDate[dateStr] || [];
                    const isToday = dateStr === todayStr;
                    const isSelected = dateStr === selectedDate;

                    return (
                      <button
                        key={day}
                        onClick={() => setSelectedDate(dateStr)}
                        className={`h-20 p-1 rounded-lg text-left transition-all border ${
                          isSelected
                            ? "border-indigo-500 bg-indigo-50"
                            : isToday
                            ? "border-indigo-300 bg-indigo-50/50"
                            : "border-transparent hover:bg-gray-50"
                        }`}
                      >
                        <div className={`text-xs font-medium ${isToday ? "text-indigo-600 font-bold" : "text-gray-600"}`}>
                          {day}
                        </div>
                        <div className="space-y-0.5 mt-1">
                          {dayEvents.slice(0, 3).map((e) => {
                            const child = childMap[e.childId];
                            return (
                              <div
                                key={e.id}
                                className="text-[10px] truncate px-1 rounded"
                                style={{
                                  backgroundColor: (child?.color || "#6366f1") + "20",
                                  color: child?.color || "#6366f1",
                                }}
                              >
                                {e.title}
                              </div>
                            );
                          })}
                          {dayEvents.length > 3 && (
                            <div className="text-[10px] text-gray-400 px-1">+{dayEvents.length - 3} more</div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Day Detail Sidebar */}
            <Card className="bg-white/90 backdrop-blur">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">
                  {selectedDate
                    ? new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
                    : "Select a Day"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!selectedDate ? (
                  <p className="text-sm text-gray-500">Click on a calendar day to view events.</p>
                ) : selectedEvents.length === 0 ? (
                  <div className="text-center py-6">
                    <div className="text-3xl mb-2">📭</div>
                    <p className="text-sm text-gray-500">No events on this day.</p>
                    <Button
                      size="sm"
                      className="mt-3 bg-indigo-600 hover:bg-indigo-700"
                      onClick={() => {
                        setNewEvent({ ...newEvent, startDate: selectedDate });
                        setShowAddEvent(true);
                      }}
                    >
                      + Add Event
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedEvents.map((event) => {
                      const child = childMap[event.childId];
                      const typeEmojis: Record<string, string> = {
                        test: "📝", quiz: "❓", homework: "📄", project: "🔬", class: "🏫",
                      };
                      return (
                        <div
                          key={event.id}
                          className="p-3 rounded-lg border"
                          style={{ borderLeftWidth: 4, borderLeftColor: child?.color || "#6366f1" }}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span>{typeEmojis[event.eventType || ""] || "📌"}</span>
                            <span className="font-medium text-sm">{event.title}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span>{child?.avatarEmoji} {child?.childName}</span>
                            {event.startTime && <span>at {event.startTime}</span>}
                            {event.priority && (
                              <Badge
                                variant="secondary"
                                className={`text-xs ${
                                  event.priority === "high" ? "bg-red-100 text-red-700" :
                                  event.priority === "medium" ? "bg-yellow-100 text-yellow-700" :
                                  "bg-green-100 text-green-700"
                                }`}
                              >
                                {event.priority}
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Legend */}
          {(children || []).length > 1 && (
            <div className="flex items-center gap-4 mt-4 text-sm text-gray-500">
              <span>Children:</span>
              {(children || []).map((c) => (
                <div key={c.id} className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: c.color || "#6366f1" }} />
                  <span>{c.avatarEmoji} {c.childName}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
