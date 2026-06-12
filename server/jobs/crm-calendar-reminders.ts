/**
 * CRM Calendar Reminders Job (JIE Mastery — Sales/Prospects CRM)
 * ---------------------------------------------------------------
 * Emails the founder about upcoming calendar events (conferences, deadlines)
 * and sends a Monday weekly digest that also prompts CRM hygiene:
 *  - Event reminders fire at each event's configured day-offsets (default 30/14/7/1)
 *  - Weekly digest covers: this week's events, next 45 days by tier, events
 *    still in "New" status (prompt to triage), pending/overdue sales tasks,
 *    and prospect follow-ups coming due.
 *
 * Dedupe: every send is recorded in sales_reminder_log with a unique
 * (kind, ref, sent_on) constraint, so restarts/redeploys never double-send.
 *
 * Scheduling:
 *  - In-process node-cron ticks hourly ("0 * * * *"); sends fire once per day
 *    at/after SEND_HOUR local time (default 7 AM America/Chicago).
 *  - External trigger: POST /api/cron/crm-calendar (Railway autoscale safety).
 *
 * Recipient: CRM_NOTIFY_EMAIL env var, default pollis@jiemastery.ai
 */

import cron from 'node-cron';
import { pool } from '../db';
import { emailService } from '../services/email-service';

const HOURLY_CRON = '0 * * * *';
const CRM_TZ = process.env.CRM_TZ || 'America/Chicago';
const SEND_HOUR = parseInt(process.env.CRM_REMINDER_HOUR || '7', 10);
const NOTIFY_EMAIL = process.env.CRM_NOTIFY_EMAIL || 'pollis@jiemastery.ai';
const JIE_RED = '#CE2522';

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_date: string;
  end_date: string | null;
  url: string | null;
  event_type: string;
  audience: string | null;
  relevance: string | null;
  score: number | null;
  priority_tier: string | null;
  claude_comments: string | null;
  status: string;
  owner_notes: string | null;
  reminder_days: string;
  email_reminders: boolean;
}

// ---------------------------------------------------------------------------
// Local-time helpers
// ---------------------------------------------------------------------------
function nowInTz(tz: string): { hour: number; dow: number; date: string } {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hour: '2-digit', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find(p => p.type === t)?.value || '';
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    hour: parseInt(get('hour'), 10) % 24,
    dow: dowMap[get('weekday')] ?? 0,
    date: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

function daysBetween(fromYmd: string, toYmd: string): number {
  const a = Date.UTC(+fromYmd.slice(0, 4), +fromYmd.slice(5, 7) - 1, +fromYmd.slice(8, 10));
  const b = Date.UTC(+toYmd.slice(0, 4), +toYmd.slice(5, 7) - 1, +toYmd.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

function fmtDate(ymd: string | null): string {
  if (!ymd) return '';
  const d = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function dateRange(ev: { start_date: string; end_date: string | null }): string {
  if (!ev.end_date || ev.end_date === ev.start_date) return fmtDate(ev.start_date);
  return `${fmtDate(ev.start_date)} – ${fmtDate(ev.end_date)}`;
}

function addDays(ymd: string, n: number): string {
  const d = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) + n * 86400000);
  return d.toISOString().slice(0, 10);
}

function adminUrl(): string {
  const base = (process.env.APP_URL || 'https://jiemastery.ai').replace(/\/$/, '');
  return `${base}/admin/prospects`;
}

function esc(s: string | null | undefined): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// Dedupe log (unique kind+ref+sent_on — survives restarts)
// ---------------------------------------------------------------------------
async function tryLogSend(kind: string, ref: string, sentOn: string): Promise<boolean> {
  const r = await pool.query(
    `INSERT INTO sales_reminder_log (kind, ref, sent_on, created_at)
     VALUES ($1, $2, $3, now()::text)
     ON CONFLICT (kind, ref, sent_on) DO NOTHING
     RETURNING id`,
    [kind, ref, sentOn],
  );
  return (r.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Email composition
// ---------------------------------------------------------------------------
function tierColor(tier: string | null): string {
  switch (tier) {
    case 'Must Attend': return JIE_RED;
    case 'High': return '#D97706';
    case 'Medium': return '#2563EB';
    default: return '#6B7280';
  }
}

function eventReminderHtml(ev: EventRow, daysOut: number): string {
  const tier = ev.priority_tier || 'Medium';
  const when = daysOut === 0 ? 'TODAY' : daysOut === 1 ? 'TOMORROW' : `in ${daysOut} days`;
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#111827;">
    <div style="background:${JIE_RED};color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;">
      <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;opacity:.9;">JIE CRM Calendar Reminder</div>
      <div style="font-size:20px;font-weight:bold;margin-top:4px;">${esc(ev.title)}</div>
      <div style="font-size:14px;margin-top:2px;">Starts ${when} — ${esc(dateRange(ev))}</div>
    </div>
    <div style="border:1px solid #E5E7EB;border-top:0;padding:20px;border-radius:0 0 8px 8px;">
      <table style="font-size:14px;line-height:1.7;border-collapse:collapse;">
        ${ev.location ? `<tr><td style="color:#6B7280;padding-right:12px;vertical-align:top;">Location</td><td>${esc(ev.location)}</td></tr>` : ''}
        <tr><td style="color:#6B7280;padding-right:12px;vertical-align:top;">Priority</td><td><span style="background:${tierColor(tier)};color:#fff;border-radius:4px;padding:2px 8px;font-size:12px;">${esc(tier)}</span>${ev.score != null ? ` &nbsp;Score: <b>${ev.score}/10</b>` : ''}</td></tr>
        <tr><td style="color:#6B7280;padding-right:12px;vertical-align:top;">Status</td><td>${esc(ev.status)}</td></tr>
        ${ev.relevance ? `<tr><td style="color:#6B7280;padding-right:12px;vertical-align:top;">Relevance</td><td>${esc(ev.relevance)}</td></tr>` : ''}
        ${ev.audience ? `<tr><td style="color:#6B7280;padding-right:12px;vertical-align:top;">Audience</td><td>${esc(ev.audience)}</td></tr>` : ''}
      </table>
      ${ev.claude_comments ? `<div style="background:#F9FAFB;border-left:3px solid ${tierColor(tier)};padding:10px 14px;margin-top:14px;font-size:13px;color:#374151;">${esc(ev.claude_comments)}</div>` : ''}
      ${ev.owner_notes ? `<div style="margin-top:10px;font-size:13px;"><b>Your notes:</b> ${esc(ev.owner_notes)}</div>` : ''}
      <div style="margin-top:18px;">
        ${ev.url ? `<a href="${esc(ev.url)}" style="background:${JIE_RED};color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:14px;display:inline-block;margin-right:10px;">Event Site / Register</a>` : ''}
        <a href="${adminUrl()}" style="background:#111827;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:14px;display:inline-block;">Update Status in CRM</a>
      </div>
      ${ev.status === 'New' || ev.status === 'Researching' ? `<div style="margin-top:14px;font-size:13px;color:#B45309;">⚠️ This event is still marked <b>${esc(ev.status)}</b> — decide and update its status so reminders stay useful.</div>` : ''}
    </div>
    <div style="font-size:11px;color:#9CA3AF;margin-top:12px;text-align:center;">JIE Mastery AI — Sales CRM Calendar · Reminders configurable per event in the admin dashboard</div>
  </div>`;
}

function digestSection(title: string, rowsHtml: string): string {
  if (!rowsHtml) return '';
  return `<div style="margin-top:20px;"><div style="font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:.5px;color:#374151;border-bottom:2px solid ${JIE_RED};padding-bottom:4px;margin-bottom:8px;">${title}</div>${rowsHtml}</div>`;
}

function eventLine(ev: EventRow, today: string): string {
  const d = daysBetween(today, ev.start_date);
  const tier = ev.priority_tier || 'Medium';
  return `<div style="font-size:13px;padding:6px 0;border-bottom:1px solid #F3F4F6;">
    <span style="background:${tierColor(tier)};color:#fff;border-radius:3px;padding:1px 6px;font-size:11px;margin-right:6px;">${esc(tier)}</span>
    <b>${esc(ev.title)}</b> — ${esc(dateRange(ev))}${ev.location ? ` · ${esc(ev.location)}` : ''}
    <span style="color:#6B7280;"> (${d <= 0 ? 'underway' : `${d}d out`}, ${esc(ev.status)})</span>
  </div>`;
}

// ---------------------------------------------------------------------------
// Core runs
// ---------------------------------------------------------------------------
export async function runEventReminders(todayOverride?: string): Promise<{ sent: number; checked: number }> {
  const { date: today } = todayOverride ? { date: todayOverride } : nowInTz(CRM_TZ);
  const { rows } = await pool.query<EventRow>(
    `SELECT * FROM sales_events
     WHERE email_reminders = true
       AND status NOT IN ('Skipped', 'Attended')
       AND start_date >= $1
     ORDER BY start_date ASC`,
    [today],
  );

  let sent = 0;
  for (const ev of rows) {
    const daysOut = daysBetween(today, ev.start_date);
    const offsets = (ev.reminder_days || '30,14,7,1')
      .split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n >= 0);
    if (!offsets.includes(daysOut)) continue;

    const fresh = await tryLogSend('event_reminder', `${ev.id}:${daysOut}`, today);
    if (!fresh) continue;

    try {
      await emailService.sendEmail({
        to: NOTIFY_EMAIL,
        subject: `⏰ ${ev.title} — ${daysOut === 0 ? 'starts today' : daysOut === 1 ? 'starts tomorrow' : `${daysOut} days out`} (${fmtDate(ev.start_date)})`,
        html: eventReminderHtml(ev, daysOut),
      });
      sent++;
      console.log(`[CrmCalendar] Reminder sent: "${ev.title}" (${daysOut}d out)`);
    } catch (err: any) {
      console.error(`[CrmCalendar] Failed reminder for "${ev.title}":`, err?.message || err);
    }
  }
  return { sent, checked: rows.length };
}

export async function runWeeklyDigest(todayOverride?: string): Promise<{ sent: boolean }> {
  const { date: today } = todayOverride ? { date: todayOverride } : nowInTz(CRM_TZ);
  const fresh = await tryLogSend('weekly_digest', 'crm', today);
  if (!fresh) return { sent: false };

  const horizon45 = addDays(today, 45);
  const week = addDays(today, 7);

  const { rows: events } = await pool.query<EventRow>(
    `SELECT * FROM sales_events
     WHERE status NOT IN ('Skipped', 'Attended')
       AND start_date <= $1 AND COALESCE(end_date, start_date) >= $2
     ORDER BY start_date ASC`,
    [horizon45, today],
  );
  const thisWeek = events.filter(e => e.start_date <= week);
  const later = events.filter(e => e.start_date > week && (e.priority_tier === 'Must Attend' || e.priority_tier === 'High'));
  const needsTriage = events.filter(e => e.status === 'New');

  const { rows: tasks } = await pool.query(
    `SELECT title, due_date, priority, status FROM sales_tasks
     WHERE status != 'Completed' AND due_date IS NOT NULL AND due_date <= $1
     ORDER BY due_date ASC LIMIT 25`,
    [week],
  );
  const { rows: followUps } = await pool.query(
    `SELECT institution_name, stage, next_follow_up_date FROM sales_prospects
     WHERE next_follow_up_date IS NOT NULL AND next_follow_up_date != ''
       AND next_follow_up_date <= $1
       AND stage NOT IN ('Closed Won', 'Closed Lost', 'Nurture / Deferred')
     ORDER BY next_follow_up_date ASC LIMIT 25`,
    [week],
  );

  const taskLine = (t: any) => {
    const overdue = t.due_date < today;
    return `<div style="font-size:13px;padding:5px 0;border-bottom:1px solid #F3F4F6;">${overdue ? `<span style="color:${JIE_RED};font-weight:bold;">OVERDUE</span> · ` : ''}<b>${esc(t.title)}</b> — due ${fmtDate(t.due_date)} <span style="color:#6B7280;">(${esc(t.priority)})</span></div>`;
  };
  const fuLine = (p: any) => {
    const overdue = p.next_follow_up_date < today;
    return `<div style="font-size:13px;padding:5px 0;border-bottom:1px solid #F3F4F6;">${overdue ? `<span style="color:${JIE_RED};font-weight:bold;">OVERDUE</span> · ` : ''}<b>${esc(p.institution_name)}</b> — follow up ${fmtDate(p.next_follow_up_date)} <span style="color:#6B7280;">(${esc(p.stage)})</span></div>`;
  };

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#111827;">
    <div style="background:#111827;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;">
      <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#F87171;">JIE Mastery — Sales CRM</div>
      <div style="font-size:20px;font-weight:bold;margin-top:4px;">📅 Weekly Pipeline & Calendar Digest</div>
      <div style="font-size:13px;color:#D1D5DB;margin-top:2px;">Week of ${fmtDate(today)}</div>
    </div>
    <div style="border:1px solid #E5E7EB;border-top:0;padding:6px 20px 20px;border-radius:0 0 8px 8px;">
      ${digestSection('🔥 Events This Week', thisWeek.map(e => eventLine(e, today)).join(''))}
      ${digestSection('Coming Up (45 days, Must Attend / High)', later.map(e => eventLine(e, today)).join(''))}
      ${digestSection('⚠️ Needs a Decision — still marked "New"', needsTriage.map(e => eventLine(e, today)).join(''))}
      ${digestSection('✅ Tasks Due / Overdue', (tasks as any[]).map(taskLine).join(''))}
      ${digestSection('📞 Prospect Follow-Ups Due', (followUps as any[]).map(fuLine).join(''))}
      ${!thisWeek.length && !later.length && !needsTriage.length && !tasks.length && !followUps.length
        ? `<div style="font-size:13px;color:#6B7280;margin-top:16px;">Nothing due this week. Add events, tasks, or follow-up dates in the CRM to keep this digest working for you.</div>` : ''}
      <div style="margin-top:22px;">
        <a href="${adminUrl()}" style="background:${JIE_RED};color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:14px;display:inline-block;">Open the CRM — Update Statuses</a>
      </div>
    </div>
    <div style="font-size:11px;color:#9CA3AF;margin-top:12px;text-align:center;">Sent every Monday ~${SEND_HOUR}:00 ${CRM_TZ} · JIE Mastery AI Sales CRM</div>
  </div>`;

  try {
    await emailService.sendEmail({
      to: NOTIFY_EMAIL,
      subject: `📅 CRM Weekly Digest — ${thisWeek.length} event${thisWeek.length === 1 ? '' : 's'} this week, ${tasks.length + followUps.length} action item${tasks.length + followUps.length === 1 ? '' : 's'}`,
      html,
    });
    console.log('[CrmCalendar] Weekly digest sent');
    return { sent: true };
  } catch (err: any) {
    console.error('[CrmCalendar] Weekly digest failed:', err?.message || err);
    return { sent: false };
  }
}

/** Combined run — used by the hourly cron tick and the external cron endpoint. */
export async function runCrmCalendarReminders(force = false): Promise<{ reminders: { sent: number; checked: number }; digest: { sent: boolean } }> {
  const { hour, dow } = nowInTz(CRM_TZ);
  let reminders = { sent: 0, checked: 0 };
  let digest = { sent: false };

  if (force || hour >= SEND_HOUR) {
    reminders = await runEventReminders();
    if (force || dow === 1) {
      digest = await runWeeklyDigest();
    }
  }
  return { reminders, digest };
}

export function startCrmCalendarReminderJob(): void {
  cron.schedule(HOURLY_CRON, async () => {
    try {
      await runCrmCalendarReminders();
    } catch (err: any) {
      // Table may not exist yet (migration pending) — fail safe and quiet
      console.error('[CrmCalendar] Tick error (safe to ignore if migration not yet run):', err?.message || err);
    }
  }, { timezone: CRM_TZ });
  console.log(`[CrmCalendar] Reminder job scheduled (hourly tick, sends daily at/after ${SEND_HOUR}:00 ${CRM_TZ}, digest Mondays) → ${NOTIFY_EMAIL}`);
}
