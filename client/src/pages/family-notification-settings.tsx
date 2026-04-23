/**
 * Family Notification Settings
 * ---------------------------
 * A dedicated page where parents opt in (or out) of upcoming-work digest emails.
 * Accessible at /family/notifications. The feature is OFF by default — this page
 * is the ONLY place it gets turned on. No nags, no banners, no onboarding popups.
 *
 * Layout per child:
 *   - Master toggle (Off / Daily / Weekly)
 *   - Recipient email + optional name
 *   - Day of week (weekly only) and hour-of-day
 *   - Separate "at-risk alerts" checkbox
 *   - "Send preview now" button
 *   - Unsubscribe / delete row
 */
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { NavigationHeader } from "@/components/navigation-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Bell, Trash2, Mail, Plus } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ChildSummary {
  id: string;
  childName: string;
  gradeLevel: string | null;
}

interface NotificationPref {
  id: string;
  userId: string;
  childId: string | null;
  recipientEmail: string;
  recipientName: string | null;
  recipientRole: 'self' | 'parent' | 'admin';
  frequency: 'off' | 'daily' | 'weekly';
  horizonDays: number;
  dayOfWeek: number;
  hourLocal: number;
  timezone: string;
  atRiskAlerts: boolean;
  isActive: boolean;
  lastSentAt: string | null;
}

const DAYS_OF_WEEK = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: i === 0 ? "12 AM" : i < 12 ? `${i} AM` : i === 12 ? "12 PM" : `${i - 12} PM`,
}));

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function FamilyNotificationSettings() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Load children (scope picker) — endpoint returns a raw array
  const { data: rawChildren } = useQuery<ChildSummary[]>({
    queryKey: ["/api/family-academic/children"],
  });

  // Load existing preferences
  const { data: prefsData, isLoading } = useQuery<{ preferences: NotificationPref[] }>({
    queryKey: ["/api/notifications/prefs"],
  });

  const children = rawChildren || [];
  const prefs = prefsData?.preferences || [];

  // ------- Create -------
  const createMutation = useMutation({
    mutationFn: async (body: Partial<NotificationPref>) => {
      const res = await apiRequest("POST", "/api/notifications/prefs", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/prefs"] });
      toast({ title: "Added", description: "Notification preference created." });
    },
    onError: (err: any) => {
      toast({
        title: "Could not add",
        description: err?.message || "Something went wrong.",
        variant: "destructive",
      });
    },
  });

  // ------- Update -------
  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<NotificationPref> }) => {
      const res = await apiRequest("PATCH", `/api/notifications/prefs/${id}`, patch);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/prefs"] });
    },
    onError: (err: any) => {
      toast({
        title: "Could not save",
        description: err?.message || "Something went wrong.",
        variant: "destructive",
      });
    },
  });

  // ------- Delete -------
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/notifications/prefs/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/prefs"] });
      toast({ title: "Removed", description: "Notification preference deleted." });
    },
  });

  // ------- Preview -------
  const previewMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/notifications/prefs/${id}/preview`);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Preview sent",
        description: "Check the recipient's inbox in a moment.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Preview failed",
        description: err?.message || "Could not send preview email.",
        variant: "destructive",
      });
    },
  });

  // ------- Add new pref form state -------
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");

  const handleAdd = (childId: string | null) => {
    if (!newEmail.trim()) {
      toast({ title: "Email required", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      childId,
      recipientEmail: newEmail.trim(),
      recipientName: newName.trim() || null,
      recipientRole: 'parent',
      frequency: 'off', // start off — parent flips it on after creating
    });
    setNewEmail("");
    setNewName("");
    setAddingFor(null);
  };

  // ------- Group prefs by child -------
  const prefsByChild: Record<string, NotificationPref[]> = {};
  for (const p of prefs) {
    const key = p.childId || "_self";
    if (!prefsByChild[key]) prefsByChild[key] = [];
    prefsByChild[key].push(p);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
      <NavigationHeader />

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => setLocation("/family")}>
            ← Back to Study Tracker
          </Button>
        </div>

        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Bell className="w-6 h-6 text-primary" />
            <h1 className="text-3xl font-bold">Notifications</h1>
          </div>
          <p className="text-muted-foreground">
            Get an email digest of each child's upcoming assignments, quizzes, and tests.
            Off by default — turn on per child as needed.
          </p>
        </div>

        {isLoading && <div className="text-muted-foreground">Loading…</div>}

        {!isLoading && children.length === 0 && (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              Add a child in the Study Tracker before configuring notifications.
            </CardContent>
          </Card>
        )}

        {children.map(child => {
          const childPrefs = prefsByChild[child.id] || [];
          return (
            <Card key={child.id} className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{child.childName}</span>
                  {child.gradeLevel && (
                    <Badge variant="outline">{child.gradeLevel}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {childPrefs.length === 0 && addingFor !== child.id && (
                  <div className="text-sm text-muted-foreground">
                    No notifications set up for {child.childName} yet.
                  </div>
                )}

                {childPrefs.map(pref => (
                  <PrefRow
                    key={pref.id}
                    pref={pref}
                    onUpdate={(patch) => updateMutation.mutate({ id: pref.id, patch })}
                    onDelete={() => {
                      if (confirm("Remove this recipient?")) deleteMutation.mutate(pref.id);
                    }}
                    onPreview={() => previewMutation.mutate(pref.id)}
                    isSaving={updateMutation.isPending}
                    isPreviewing={previewMutation.isPending}
                  />
                ))}

                {addingFor === child.id ? (
                  <div className="p-4 border rounded-lg space-y-3 bg-muted/30">
                    <div>
                      <Label htmlFor={`email-${child.id}`}>Recipient email</Label>
                      <Input
                        id={`email-${child.id}`}
                        type="email"
                        placeholder="parent@example.com"
                        value={newEmail}
                        onChange={e => setNewEmail(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`name-${child.id}`}>Name (optional)</Label>
                      <Input
                        id={`name-${child.id}`}
                        placeholder="Mom, Grandma, Tutor"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => handleAdd(child.id)} disabled={createMutation.isPending}>
                        Add
                      </Button>
                      <Button variant="outline" onClick={() => { setAddingFor(null); setNewEmail(""); setNewName(""); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="outline" onClick={() => setAddingFor(child.id)}>
                    <Plus className="w-4 h-4 mr-2" /> Add recipient
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PrefRow component — one recipient's settings
// ---------------------------------------------------------------------------
function PrefRow({
  pref,
  onUpdate,
  onDelete,
  onPreview,
  isSaving,
  isPreviewing,
}: {
  pref: NotificationPref;
  onUpdate: (patch: Partial<NotificationPref>) => void;
  onDelete: () => void;
  onPreview: () => void;
  isSaving: boolean;
  isPreviewing: boolean;
}) {
  const isOn = pref.frequency !== 'off' && pref.isActive;

  return (
    <div className="p-4 border rounded-lg space-y-3">
      {/* Header: recipient + master toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-muted-foreground" />
          <div>
            <div className="font-medium">{pref.recipientEmail}</div>
            {pref.recipientName && (
              <div className="text-xs text-muted-foreground">{pref.recipientName}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={`active-${pref.id}`} className="text-sm text-muted-foreground">
            {isOn ? "On" : "Off"}
          </Label>
          <Switch
            id={`active-${pref.id}`}
            checked={isOn}
            onCheckedChange={(checked) => {
              onUpdate({
                isActive: checked,
                // When turning on for the first time, default to weekly.
                frequency: checked ? (pref.frequency === 'off' ? 'weekly' : pref.frequency) : 'off',
              });
            }}
            disabled={isSaving}
          />
        </div>
      </div>

      {/* Expanded settings — only shown when on */}
      {isOn && (
        <div className="grid gap-3 pt-2 border-t sm:grid-cols-2">
          <div>
            <Label>Frequency</Label>
            <Select
              value={pref.frequency}
              onValueChange={(v) => onUpdate({ frequency: v as 'daily' | 'weekly' })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {pref.frequency === 'weekly' && (
            <div>
              <Label>Day of week</Label>
              <Select
                value={String(pref.dayOfWeek)}
                onValueChange={(v) => onUpdate({ dayOfWeek: Number(v) })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DAYS_OF_WEEK.map(d => (
                    <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Time of day</Label>
            <Select
              value={String(pref.hourLocal)}
              onValueChange={(v) => onUpdate({ hourLocal: Number(v) })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {HOURS.map(h => (
                  <SelectItem key={h.value} value={String(h.value)}>{h.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Look-ahead</Label>
            <Select
              value={String(pref.horizonDays)}
              onValueChange={(v) => onUpdate({ horizonDays: Number(v) })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="3">Next 3 days</SelectItem>
                <SelectItem value="7">Next 7 days</SelectItem>
                <SelectItem value="14">Next 14 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-2 flex items-center gap-2 pt-2 border-t">
            <Switch
              id={`atrisk-${pref.id}`}
              checked={pref.atRiskAlerts}
              onCheckedChange={(checked) => onUpdate({ atRiskAlerts: checked })}
            />
            <Label htmlFor={`atrisk-${pref.id}`} className="text-sm">
              Also alert me if the student falls behind (3+ overdue tasks, low engagement, or a test in 48h with no prep)
            </Label>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t">
        <Button
          size="sm"
          variant="outline"
          onClick={onPreview}
          disabled={isPreviewing}
        >
          <Mail className="w-3 h-3 mr-1" />
          {isPreviewing ? "Sending…" : "Send preview"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDelete} className="text-destructive ml-auto">
          <Trash2 className="w-3 h-3 mr-1" /> Remove
        </Button>
      </div>

      {pref.lastSentAt && (
        <div className="text-xs text-muted-foreground">
          Last sent: {new Date(pref.lastSentAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}
