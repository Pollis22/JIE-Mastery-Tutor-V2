/**
 * Daily Digest Job
 * Sends parents a daily summary email of all tutoring sessions at 8:00 PM EST/EDT
 * 
 * Production Note: In autoscale deployments, use external cron services to trigger
 * /api/cron/daily-digest and /api/cron/weekly-digest endpoints since the in-process
 * scheduler may not fire when the server is idle.
 */

import cron from 'node-cron';
import { pool } from '../db';
import { emailService } from '../services/email-service';

// Run at 8:00 PM America/New_York (handles EST/EDT automatically)
const DIGEST_CRON = '0 20 * * *';
// Weekly digest runs Sunday at 8:00 PM America/New_York
const WEEKLY_DIGEST_CRON = '0 20 * * 0';
const DIGEST_TIMEZONE = 'America/New_York';

interface SessionRow {
  id: string;
  student_name: string | null;
  subject: string | null;
  minutes_used: number | null;
  total_messages: number | null;
  started_at: Date;
  transcript: Array<{ speaker: string; text: string }> | null;
}

interface UserRow {
  user_id: string;
  email: string;
  parent_name: string | null;
  first_name: string | null;
}

interface DigestStats {
  usersProcessed: number;
  emailsSent: number;
  sessionsIncluded: number;
  skippedAlreadySent: number;
  failures: string[];
}

/**
 * Starts the in-process daily digest scheduler.
 * Note: This only works when the server process is running continuously.
 * For autoscale deployments, use external cron triggers instead.
 */
export function startDailyDigestJob() {
  const now = new Date();
  const etNow = now.toLocaleString('en-US', { timeZone: DIGEST_TIMEZONE });
  
  console.log('[DailyDigest] ========================================');
  console.log(`[DailyDigest] Scheduler initialized at ${now.toISOString()}`);
  console.log(`[DailyDigest] Current time in ${DIGEST_TIMEZONE}: ${etNow}`);
  console.log(`[DailyDigest] Scheduled to run at: 8:00 PM ${DIGEST_TIMEZONE} daily`);
  console.log('[DailyDigest] ========================================');

  cron.schedule(DIGEST_CRON, async () => {
    const triggerTime = new Date();
    const etTrigger = triggerTime.toLocaleString('en-US', { timeZone: DIGEST_TIMEZONE });
    
    console.log('[DailyDigest] ========================================');
    console.log('[DailyDigest] CRON TRIGGER FIRED');
    console.log(`[DailyDigest] Trigger time (UTC): ${triggerTime.toISOString()}`);
    console.log(`[DailyDigest] Trigger time (ET): ${etTrigger}`);
    console.log('[DailyDigest] ========================================');

    try {
      const stats = await sendDailyDigests();
      console.log('[DailyDigest] Job completed with stats:', JSON.stringify(stats));
    } catch (error) {
      console.error('[DailyDigest] Job failed with error:', error);
    }
  }, {
    timezone: DIGEST_TIMEZONE
  });
}

/**
 * Starts the in-process weekly digest scheduler.
 */
export function startWeeklyDigestJob() {
  const now = new Date();
  const etNow = now.toLocaleString('en-US', { timeZone: DIGEST_TIMEZONE });
  
  console.log('[WeeklyDigest] ========================================');
  console.log(`[WeeklyDigest] Scheduler initialized at ${now.toISOString()}`);
  console.log(`[WeeklyDigest] Current time in ${DIGEST_TIMEZONE}: ${etNow}`);
  console.log(`[WeeklyDigest] Scheduled to run at: 8:00 PM ${DIGEST_TIMEZONE} on Sundays`);
  console.log('[WeeklyDigest] ========================================');

  cron.schedule(WEEKLY_DIGEST_CRON, async () => {
    const triggerTime = new Date();
    const etTrigger = triggerTime.toLocaleString('en-US', { timeZone: DIGEST_TIMEZONE });
    
    console.log('[WeeklyDigest] ========================================');
    console.log('[WeeklyDigest] CRON TRIGGER FIRED');
    console.log(`[WeeklyDigest] Trigger time (UTC): ${triggerTime.toISOString()}`);
    console.log(`[WeeklyDigest] Trigger time (ET): ${etTrigger}`);
    console.log('[WeeklyDigest] ========================================');

    try {
      const stats = await sendWeeklyDigests();
      console.log('[WeeklyDigest] Job completed with stats:', JSON.stringify(stats));
    } catch (error) {
      console.error('[WeeklyDigest] Job failed with error:', error);
    }
  }, {
    timezone: DIGEST_TIMEZONE
  });
}

/**
 * Get the date string in America/New_York timezone (YYYY-MM-DD format)
 */
function getETDateString(date: Date): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: DIGEST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date); // e.g. "2025-12-21"
}

/**
 * Check if a digest was already sent for a user on a specific date
 */
async function wasDigestAlreadySent(
  userId: string, 
  digestType: 'daily' | 'weekly', 
  digestDate: string
): Promise<boolean> {
  try {
    const result = await pool.query(
      `SELECT id FROM digest_tracking 
       WHERE user_id = $1 AND digest_type = $2 AND digest_date = $3::date`,
      [userId, digestType, digestDate]
    );
    return result.rows.length > 0;
  } catch (error) {
    // Table might not exist yet - allow sending
    console.warn('[DailyDigest] Could not check digest_tracking table:', error);
    return false;
  }
}

/**
 * Record that a digest was sent
 */
async function recordDigestSent(
  userId: string,
  digestType: 'daily' | 'weekly',
  digestDate: string,
  sessionCount: number
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO digest_tracking (user_id, digest_type, digest_date, session_count)
       VALUES ($1, $2, $3::date, $4)
       ON CONFLICT (user_id, digest_type, digest_date) DO NOTHING`,
      [userId, digestType, digestDate, sessionCount]
    );
  } catch (error) {
    // Non-fatal - log but continue
    console.warn('[DailyDigest] Could not record digest sent:', error);
  }
}

/**
 * Send daily digests for all eligible users.
 * Can be called manually with a specific date for backfill/testing.
 */
async function sendDailyDigests(targetDate?: Date): Promise<DigestStats> {
  const stats: DigestStats = {
    usersProcessed: 0,
    emailsSent: 0,
    sessionsIncluded: 0,
    skippedAlreadySent: 0,
    failures: []
  };

  const digestDate = targetDate || new Date();
  const digestDateString = getETDateString(digestDate);
  const startTime = Date.now();

  console.log('[DailyDigest] ========================================');
  console.log(`[DailyDigest] Starting daily digest run`);
  console.log(`[DailyDigest] Run time (UTC): ${new Date().toISOString()}`);
  console.log(`[DailyDigest] Target date (ET): ${digestDateString}`);
  console.log('[DailyDigest] ----------------------------------------');

  // Query users with daily preference (or NULL which defaults to daily) who had sessions today
  const usersWithSessions = await pool.query<UserRow>(`
    SELECT DISTINCT 
      u.id as user_id,
      u.email,
      u.parent_name,
      u.first_name
    FROM users u
    INNER JOIN realtime_sessions rs ON rs.user_id = u.id
    WHERE DATE(rs.started_at AT TIME ZONE 'America/New_York') = $1::date
      AND rs.minutes_used >= 1
      AND rs.status = 'ended'
      AND u.email IS NOT NULL
      AND (u.email_summary_frequency = 'daily' OR u.email_summary_frequency IS NULL)
  `, [digestDateString]);

  console.log(`[DailyDigest] Found ${usersWithSessions.rows.length} users with daily preference and sessions on ${digestDateString}`);
  
  if (usersWithSessions.rows.length === 0) {
    console.log('[DailyDigest] No users to process');
    console.log('[DailyDigest] ========================================');
    return stats;
  }

  console.log(`[DailyDigest] Users queued: ${usersWithSessions.rows.map(u => u.email).join(', ')}`);

  for (const user of usersWithSessions.rows) {
    stats.usersProcessed++;
    
    try {
      // Check idempotency - skip if already sent today
      const alreadySent = await wasDigestAlreadySent(user.user_id, 'daily', digestDateString);
      if (alreadySent) {
        console.log(`[DailyDigest] Skipping ${user.email} - digest already sent for ${digestDateString}`);
        stats.skippedAlreadySent++;
        continue;
      }

      const sessionCount = await sendDigestForUser(user, digestDateString, digestDate);
      
      if (sessionCount > 0) {
        stats.emailsSent++;
        stats.sessionsIncluded += sessionCount;
        
        // Record that we sent this digest
        await recordDigestSent(user.user_id, 'daily', digestDateString, sessionCount);
        
        console.log(`[DailyDigest] ✅ Sent to ${user.email} (${sessionCount} sessions)`);
      }
    } catch (error: any) {
      const errorMsg = `Failed for ${user.email}: ${error.message}`;
      stats.failures.push(errorMsg);
      console.error(`[DailyDigest] ❌ ${errorMsg}`);
    }
  }

  const duration = Date.now() - startTime;
  console.log('[DailyDigest] ----------------------------------------');
  console.log(`[DailyDigest] Run complete in ${duration}ms`);
  console.log(`[DailyDigest] Stats: ${stats.emailsSent} emails sent, ${stats.sessionsIncluded} sessions, ${stats.skippedAlreadySent} skipped (already sent), ${stats.failures.length} failures`);
  console.log('[DailyDigest] ========================================');

  return stats;
}

/**
 * Send digest email for a single user
 * Returns the number of sessions included (0 if none found)
 */
async function sendDigestForUser(
  user: UserRow,
  digestDateString: string,
  digestDate: Date
): Promise<number> {
  // Get all sessions for this user on the target date
  const sessionsResult = await pool.query<SessionRow>(`
    SELECT 
      id,
      student_name,
      subject,
      minutes_used,
      total_messages,
      started_at,
      transcript
    FROM realtime_sessions
    WHERE user_id = $1 
      AND DATE(started_at AT TIME ZONE 'America/New_York') = $2::date
      AND minutes_used >= 1
      AND status = 'ended'
    ORDER BY started_at ASC
  `, [user.user_id, digestDateString]);

  if (sessionsResult.rows.length === 0) {
    return 0;
  }

  // Generate AI summaries for each session
  const sessions = await Promise.all(
    sessionsResult.rows.map(async (session) => ({
      studentName: session.student_name || 'Student',
      subject: session.subject || 'General',
      duration: session.minutes_used || 1,
      messageCount: session.total_messages || 0,
      timestamp: session.started_at,
      keyLearning: await generateSessionSummary(session.transcript, session.subject)
    }))
  );

  // Send the digest
  await emailService.sendDailyDigest({
    parentEmail: user.email,
    parentName: user.parent_name || user.first_name || '',
    sessions,
    date: digestDate
  });

  return sessions.length;
}

/**
 * Generate a brief AI summary of a session
 */
async function generateSessionSummary(
  transcript: Array<{ speaker: string; text: string }> | null,
  subject: string | null
): Promise<string> {
  if (!transcript || transcript.length < 2) {
    return 'Had a tutoring session.';
  }

  try {
    const conversationText = transcript
      .map((t) => `${t.speaker === 'tutor' ? 'Tutor' : 'Student'}: ${t.text}`)
      .join('\n');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: `Summarize this ${subject || 'tutoring'} session in ONE sentence (max 20 words). Focus on what the student learned or worked on. Be specific and positive.\n\nConversation:\n${conversationText.substring(0, 2000)}\n\nOne sentence summary:`
        }]
      })
    });

    const data = await response.json();
    return data.content?.[0]?.text || 'Worked on ' + (subject || 'various topics') + '.';
  } catch (error) {
    console.error('[DailyDigest] Summary generation failed:', error);
    return 'Worked on ' + (subject || 'various topics') + '.';
  }
}

/**
 * Send weekly digests for all eligible users
 */
async function sendWeeklyDigests(): Promise<DigestStats> {
  const stats: DigestStats = {
    usersProcessed: 0,
    emailsSent: 0,
    sessionsIncluded: 0,
    skippedAlreadySent: 0,
    failures: []
  };

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);
  
  const startDateString = getETDateString(weekStart);
  const endDateString = getETDateString(now);
  const startTime = Date.now();

  console.log('[WeeklyDigest] ========================================');
  console.log(`[WeeklyDigest] Starting weekly digest run`);
  console.log(`[WeeklyDigest] Run time (UTC): ${new Date().toISOString()}`);
  console.log(`[WeeklyDigest] Date range (ET): ${startDateString} to ${endDateString}`);
  console.log('[WeeklyDigest] ----------------------------------------');

  // Get users with weekly preference who had sessions this week
  const usersWithSessions = await pool.query<UserRow>(`
    SELECT DISTINCT 
      u.id as user_id,
      u.email,
      u.parent_name,
      u.first_name
    FROM users u
    INNER JOIN realtime_sessions rs ON rs.user_id = u.id
    WHERE DATE(rs.started_at AT TIME ZONE 'America/New_York') >= $1::date
      AND DATE(rs.started_at AT TIME ZONE 'America/New_York') <= $2::date
      AND rs.minutes_used >= 1
      AND rs.status = 'ended'
      AND u.email IS NOT NULL
      AND u.email_summary_frequency = 'weekly'
  `, [startDateString, endDateString]);

  console.log(`[WeeklyDigest] Found ${usersWithSessions.rows.length} users with weekly preference`);

  if (usersWithSessions.rows.length === 0) {
    console.log('[WeeklyDigest] No users to process');
    console.log('[WeeklyDigest] ========================================');
    return stats;
  }

  for (const user of usersWithSessions.rows) {
    stats.usersProcessed++;
    
    try {
      // Check idempotency - use end date as the digest date for weekly
      const alreadySent = await wasDigestAlreadySent(user.user_id, 'weekly', endDateString);
      if (alreadySent) {
        console.log(`[WeeklyDigest] Skipping ${user.email} - weekly digest already sent for week ending ${endDateString}`);
        stats.skippedAlreadySent++;
        continue;
      }

      const sessionCount = await sendWeeklyDigestForUser(user, startDateString, endDateString, now);
      
      if (sessionCount > 0) {
        stats.emailsSent++;
        stats.sessionsIncluded += sessionCount;
        
        // Record that we sent this digest
        await recordDigestSent(user.user_id, 'weekly', endDateString, sessionCount);
        
        console.log(`[WeeklyDigest] ✅ Sent to ${user.email} (${sessionCount} sessions)`);
      }
    } catch (error: any) {
      const errorMsg = `Failed for ${user.email}: ${error.message}`;
      stats.failures.push(errorMsg);
      console.error(`[WeeklyDigest] ❌ ${errorMsg}`);
    }
  }

  const duration = Date.now() - startTime;
  console.log('[WeeklyDigest] ----------------------------------------');
  console.log(`[WeeklyDigest] Run complete in ${duration}ms`);
  console.log(`[WeeklyDigest] Stats: ${stats.emailsSent} emails sent, ${stats.sessionsIncluded} sessions, ${stats.skippedAlreadySent} skipped (already sent), ${stats.failures.length} failures`);
  console.log('[WeeklyDigest] ========================================');

  return stats;
}

/**
 * Send weekly digest for a single user
 */
async function sendWeeklyDigestForUser(
  user: UserRow,
  startDateString: string,
  endDateString: string,
  digestDate: Date
): Promise<number> {
  const sessionsResult = await pool.query<SessionRow>(`
    SELECT 
      id,
      student_name,
      subject,
      minutes_used,
      total_messages,
      started_at,
      transcript
    FROM realtime_sessions
    WHERE user_id = $1 
      AND DATE(started_at AT TIME ZONE 'America/New_York') >= $2::date
      AND DATE(started_at AT TIME ZONE 'America/New_York') <= $3::date
      AND minutes_used >= 1
      AND status = 'ended'
    ORDER BY started_at ASC
  `, [user.user_id, startDateString, endDateString]);

  if (sessionsResult.rows.length === 0) {
    return 0;
  }

  const sessions = await Promise.all(
    sessionsResult.rows.map(async (session) => ({
      studentName: session.student_name || 'Student',
      subject: session.subject || 'General',
      duration: session.minutes_used || 1,
      messageCount: session.total_messages || 0,
      timestamp: session.started_at,
      keyLearning: await generateSessionSummary(session.transcript, session.subject)
    }))
  );

  await emailService.sendDailyDigest({
    parentEmail: user.email,
    parentName: user.parent_name || user.first_name || '',
    sessions,
    date: digestDate,
    isWeekly: true
  });

  return sessions.length;
}

/**
 * Send digest for a single user (for testing/debugging)
 * This bypasses idempotency checks when force=true
 */
export async function sendDigestForSingleUser(
  userId: string,
  digestType: 'daily' | 'weekly' = 'daily',
  targetDate?: Date,
  force: boolean = false
): Promise<{ success: boolean; message: string; sessionCount?: number }> {
  const digestDate = targetDate || new Date();
  const digestDateString = getETDateString(digestDate);

  console.log(`[DigestTest] Testing ${digestType} digest for user ${userId} on ${digestDateString}`);

  // Get user info
  const userResult = await pool.query<UserRow>(`
    SELECT 
      id as user_id,
      email,
      parent_name,
      first_name
    FROM users
    WHERE id = $1
  `, [userId]);

  if (userResult.rows.length === 0) {
    return { success: false, message: 'User not found' };
  }

  const user = userResult.rows[0];

  // Check idempotency unless force=true
  if (!force) {
    const alreadySent = await wasDigestAlreadySent(userId, digestType, digestDateString);
    if (alreadySent) {
      return { success: false, message: `Digest already sent for ${digestDateString}. Use force=true to resend.` };
    }
  }

  try {
    let sessionCount: number;
    
    if (digestType === 'daily') {
      sessionCount = await sendDigestForUser(user, digestDateString, digestDate);
    } else {
      const weekStart = new Date(digestDate);
      weekStart.setDate(weekStart.getDate() - 7);
      const startDateString = getETDateString(weekStart);
      sessionCount = await sendWeeklyDigestForUser(user, startDateString, digestDateString, digestDate);
    }

    if (sessionCount === 0) {
      return { success: false, message: 'No sessions found for the specified date range' };
    }

    // Record the send unless it's a forced resend
    if (!force) {
      await recordDigestSent(userId, digestType, digestDateString, sessionCount);
    }

    return { 
      success: true, 
      message: `${digestType} digest sent to ${user.email} with ${sessionCount} sessions`,
      sessionCount 
    };
  } catch (error: any) {
    return { success: false, message: `Failed to send: ${error.message}` };
  }
}

// Export for external cron triggers and manual testing
export { sendDailyDigests, sendWeeklyDigests };
