/**
 * Daily Digest Job
 * Sends parents a daily summary email of all tutoring sessions at 8:00 PM EST/EDT
 */

import cron from 'node-cron';
import { pool } from '../db';
import { emailService } from '../services/email-service';

// Run at 8:00 PM America/New_York (handles EST/EDT automatically)
const DIGEST_CRON = '0 20 * * *';
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

export function startDailyDigestJob() {
  console.log('[DailyDigest] Starting daily digest scheduler (runs at 8:00 PM America/New_York)');

  cron.schedule(DIGEST_CRON, async () => {
    console.log('[DailyDigest] Running daily digest job...');

    try {
      await sendDailyDigests();
    } catch (error) {
      console.error('[DailyDigest] Job failed:', error);
    }
  }, {
    timezone: DIGEST_TIMEZONE
  });
}

async function sendDailyDigests(targetDate?: Date) {
  // Use provided date or current date - allows manual backfill/rerun
  const digestDate = targetDate || new Date();
  
  // Get date in America/New_York as YYYY-MM-DD for SQL parameter
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: DIGEST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const digestDateString = formatter.format(digestDate); // e.g. "2025-12-21"

  console.log(`[DailyDigest] Looking for sessions on ${digestDateString} (America/New_York)`);

  // Use parameterized date for correct backfill/rerun support
  const usersWithSessions = await pool.query<UserRow>(`
    SELECT DISTINCT 
      u.id as user_id,
      u.email,
      u."parentName" as parent_name,
      u."firstName" as first_name
    FROM users u
    INNER JOIN realtime_sessions rs ON rs.user_id = u.id
    WHERE DATE(rs.started_at AT TIME ZONE 'America/New_York') = $1::date
      AND rs.minutes_used >= 1
      AND rs.status = 'ended'
      AND u.email IS NOT NULL
  `, [digestDateString]);

  console.log(`[DailyDigest] Found ${usersWithSessions.rows.length} users with sessions on ${digestDateString}`);

  for (const user of usersWithSessions.rows) {
    try {
      await sendDigestForUser(user, digestDateString, digestDate);
    } catch (error) {
      console.error(`[DailyDigest] Failed for user ${user.email}:`, error);
    }
  }

  console.log('[DailyDigest] Job complete');
}

async function sendDigestForUser(
  user: UserRow,
  digestDateString: string,
  digestDate: Date
) {
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
    return;
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

  console.log(`[DailyDigest] Sent to ${user.email} (${sessions.length} sessions)`);
}

async function generateSessionSummary(
  transcript: Array<{ speaker: string; text: string }> | null,
  subject: string | null
): Promise<string> {
  if (!transcript || transcript.length < 2) {
    return 'Had a tutoring session.';
  }

  try {
    // Extract text from transcript
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

// Export for manual testing
export { sendDailyDigests };
