/**
 * Notifications API — Preferences CRUD + preview + unsubscribe
 * Mounted at /api/notifications (user routes) and exposes:
 *   GET    /api/notifications/prefs                 — list my prefs
 *   POST   /api/notifications/prefs                 — create
 *   PATCH  /api/notifications/prefs/:id             — update
 *   DELETE /api/notifications/prefs/:id             — delete
 *   POST   /api/notifications/prefs/:id/preview     — send preview to recipient
 *   GET    /api/notifications/unsubscribe           — one-click (token param)
 *
 * Also: POST /api/cron/upcoming-digest — external cron trigger (guarded)
 */
import { Router, type Request, type Response } from "express";
import { db, pool } from "../db";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import { notificationPreferences, familyChildren, users } from "@shared/schema";

const router = Router();

const requireAuth = (req: Request, res: Response, next: any) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
};

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const createSchema = z.object({
  childId: z.string().nullable().optional(),
  recipientEmail: z.string().email(),
  recipientName: z.string().max(120).optional().nullable(),
  recipientRole: z.enum(['self', 'parent', 'admin']).default('self'),
  frequency: z.enum(['off', 'daily', 'weekly']).default('weekly'),
  horizonDays: z.number().int().min(1).max(30).default(7),
  dayOfWeek: z.number().int().min(0).max(6).default(0),
  hourLocal: z.number().int().min(0).max(23).default(18),
  timezone: z.string().max(64).default('America/New_York'),
  atRiskAlerts: z.boolean().default(false),
});

const updateSchema = createSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// List prefs for current user
// ---------------------------------------------------------------------------
router.get("/prefs", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const rows = await db.select().from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId));
    res.json({ preferences: rows });
  } catch (err: any) {
    console.error('[Notifications] list prefs error', err?.message || err);
    res.status(500).json({ error: "Failed to load preferences" });
  }
});

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------
router.post("/prefs", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const parsed = createSchema.parse(req.body);

    // If childId given, verify it belongs to this user.
    if (parsed.childId) {
      const child = await db.select().from(familyChildren)
        .where(and(
          eq(familyChildren.id, parsed.childId),
          eq(familyChildren.parentUserId, userId)
        )).limit(1);
      if (child.length === 0) {
        return res.status(403).json({ error: "Child does not belong to this user" });
      }
    }

    const [created] = await db.insert(notificationPreferences).values({
      userId,
      childId: parsed.childId ?? null,
      recipientEmail: parsed.recipientEmail.toLowerCase(),
      recipientName: parsed.recipientName ?? null,
      recipientRole: parsed.recipientRole,
      frequency: parsed.frequency,
      horizonDays: parsed.horizonDays,
      dayOfWeek: parsed.dayOfWeek,
      hourLocal: parsed.hourLocal,
      timezone: parsed.timezone,
      atRiskAlerts: parsed.atRiskAlerts,
    }).returning();

    res.json({ preference: created });
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid input', details: err.issues });
    }
    if (err?.code === '23505') {
      return res.status(409).json({ error: "A preference already exists for this recipient + child" });
    }
    console.error('[Notifications] create error', err?.message || err);
    res.status(500).json({ error: "Failed to create preference" });
  }
});

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
router.patch("/prefs/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const { id } = req.params;
    const patch = updateSchema.parse(req.body);

    const patchObj: Record<string, any> = { updatedAt: new Date() };
    if (patch.frequency !== undefined)     patchObj.frequency = patch.frequency;
    if (patch.horizonDays !== undefined)   patchObj.horizonDays = patch.horizonDays;
    if (patch.dayOfWeek !== undefined)     patchObj.dayOfWeek = patch.dayOfWeek;
    if (patch.hourLocal !== undefined)     patchObj.hourLocal = patch.hourLocal;
    if (patch.timezone !== undefined)      patchObj.timezone = patch.timezone;
    if (patch.atRiskAlerts !== undefined)  patchObj.atRiskAlerts = patch.atRiskAlerts;
    if (patch.isActive !== undefined)      patchObj.isActive = patch.isActive;
    if (patch.recipientEmail !== undefined) patchObj.recipientEmail = patch.recipientEmail.toLowerCase();
    if (patch.recipientName !== undefined) patchObj.recipientName = patch.recipientName;
    if (patch.recipientRole !== undefined) patchObj.recipientRole = patch.recipientRole;

    const [updated] = await db.update(notificationPreferences)
      .set(patchObj)
      .where(and(
        eq(notificationPreferences.id, id),
        eq(notificationPreferences.userId, userId)
      ))
      .returning();

    if (!updated) return res.status(404).json({ error: "Preference not found" });
    res.json({ preference: updated });
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid input', details: err.issues });
    }
    console.error('[Notifications] update error', err?.message || err);
    res.status(500).json({ error: "Failed to update preference" });
  }
});

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------
router.delete("/prefs/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const { id } = req.params;
    const result = await db.delete(notificationPreferences)
      .where(and(
        eq(notificationPreferences.id, id),
        eq(notificationPreferences.userId, userId)
      ));
    res.json({ success: true });
  } catch (err: any) {
    console.error('[Notifications] delete error', err?.message || err);
    res.status(500).json({ error: "Failed to delete preference" });
  }
});

// ---------------------------------------------------------------------------
// Preview — send a one-off test email using the upcoming-digest renderer
// ---------------------------------------------------------------------------
router.post("/prefs/:id/preview", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const { id } = req.params;

    const [pref] = await db.select().from(notificationPreferences)
      .where(and(
        eq(notificationPreferences.id, id),
        eq(notificationPreferences.userId, userId)
      )).limit(1);

    if (!pref) return res.status(404).json({ error: "Preference not found" });

    // Temporarily override the time-gate: trigger a one-shot using the job's
    // email renderer but send even if "nothing due" (preview should show layout).
    const { runPreviewForPreference } = await import('../jobs/upcoming-digest');
    const result = await runPreviewForPreference(pref.id);
    if (!result.ok) return res.status(500).json({ error: result.reason });
    res.json({ success: true });
  } catch (err: any) {
    console.error('[Notifications] preview error', err?.message || err);
    res.status(500).json({ error: "Failed to send preview" });
  }
});

// ---------------------------------------------------------------------------
// Unsubscribe — no auth required (token-based)
// ---------------------------------------------------------------------------
router.get("/unsubscribe", async (req: Request, res: Response) => {
  const token = String(req.query.token || '');
  if (!token) {
    return res.status(400).send(unsubHtmlPage('Invalid unsubscribe link.', false));
  }
  try {
    const result = await pool.query(
      `UPDATE notification_preferences
          SET is_active = false, frequency = 'off', at_risk_alerts = false,
              updated_at = NOW()
        WHERE unsubscribe_token = $1
        RETURNING recipient_email`,
      [token]
    );
    if (result.rowCount === 0) {
      return res.status(404).send(unsubHtmlPage('This link is no longer valid.', false));
    }
    return res.send(unsubHtmlPage(`You've been unsubscribed. No more emails will be sent.`, true));
  } catch (err: any) {
    console.error('[Notifications] unsubscribe error', err?.message || err);
    return res.status(500).send(unsubHtmlPage('Something went wrong. Please try again.', false));
  }
});

function unsubHtmlPage(message: string, success: boolean): string {
  const color = success ? '#3a7' : '#b00020';
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Unsubscribe</title></head>
<body style="font-family:-apple-system,Segoe UI,sans-serif;background:#f7f7f9;padding:48px;text-align:center;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
    <div style="width:48px;height:48px;border-radius:50%;background:${color};margin:0 auto 16px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:24px;">
      ${success ? '✓' : '!'}
    </div>
    <h1 style="color:#222;font-size:20px;margin:0 0 8px;">JIE Mastery Notifications</h1>
    <p style="color:#555;">${message}</p>
  </div>
</body></html>`;
}

export default router;
