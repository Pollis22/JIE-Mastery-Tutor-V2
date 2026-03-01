import { db } from '../db';
import { users, verificationReminderTracking } from '@shared/schema';
import { and, isNull, isNotNull, eq, sql, count } from 'drizzle-orm';
import { emailService } from '../services/email-service';

const MAX_REMINDERS = 11; // 7 daily + 4 weekly
const DAILY_PHASE_COUNT = 7; // First 7 are daily, then weekly

interface ReminderStats {
  scanned: number;
  eligible: number;
  sent: number;
  skippedAlreadySent: number;
  skippedLoggedIn: number;
  skippedMaxReached: number;
  skippedTooSoon: number;
  failed: number;
}

export async function processVerificationReminders(): Promise<ReminderStats> {
  const stats: ReminderStats = {
    scanned: 0,
    eligible: 0,
    sent: 0,
    skippedAlreadySent: 0,
    skippedLoggedIn: 0,
    skippedMaxReached: 0,
    skippedTooSoon: 0,
    failed: 0,
  };

  const now = new Date();
  const todayET = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  console.log(`[cron:verification-reminders] Starting run for date: ${todayET}`);

  try {
    const eligibleUsers = await db
      .select()
      .from(users)
      .where(
        and(
          isNull(users.firstLoginAt),
          isNotNull(users.email),
          eq(users.isDisabled, false),
          isNull(users.deletedAt),
        )
      );

    stats.scanned = eligibleUsers.length;
    console.log(`[cron:verification-reminders] Scanned ${stats.scanned} users with no first login`);

    for (const user of eligibleUsers) {
      try {
        if (user.firstLoginAt) {
          stats.skippedLoggedIn++;
          continue;
        }

        const isUnverified = !user.emailVerified;
        const isVerifiedNoLogin = user.emailVerified && !user.firstLoginAt;

        if (!isUnverified && !isVerifiedNoLogin) {
          continue;
        }

        stats.eligible++;

        // Count how many reminders have already been sent to this user
        const [reminderCountResult] = await db
          .select({ total: count() })
          .from(verificationReminderTracking)
          .where(eq(verificationReminderTracking.userId, user.id));

        const remindersSent = reminderCountResult?.total ?? 0;

        // Check if max reminders reached
        if (remindersSent >= MAX_REMINDERS) {
          stats.skippedMaxReached++;
          continue;
        }

        // Check interval: daily for first 7, weekly after that
        if (remindersSent >= DAILY_PHASE_COUNT) {
          // Weekly phase — check if at least 7 days since last reminder
          const [lastReminder] = await db
            .select()
            .from(verificationReminderTracking)
            .where(eq(verificationReminderTracking.userId, user.id))
            .orderBy(sql`created_at DESC`)
            .limit(1);

          if (lastReminder?.createdAt) {
            const daysSinceLast = (now.getTime() - new Date(lastReminder.createdAt).getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceLast < 6.5) { // 6.5 days to account for cron timing drift
              stats.skippedTooSoon++;
              continue;
            }
          }
        }

        // Try to insert tracking record (unique constraint prevents same-day duplicates)
        try {
          await db.insert(verificationReminderTracking).values({
            userId: user.id,
            reminderDate: todayET,
          });
        } catch (insertErr: any) {
          if (insertErr.code === '23505') {
            stats.skippedAlreadySent++;
            continue;
          }
          throw insertErr;
        }

        const hasValidToken = user.emailVerificationToken &&
          user.emailVerificationExpiry &&
          new Date(user.emailVerificationExpiry) > now;

        const tokenExpired = !hasValidToken;
        const name = user.studentName || user.parentName || user.firstName || 'there';
        const reminderNumber = remindersSent + 1;

        await emailService.sendVerificationReminder({
          email: user.email,
          name,
          verificationToken: user.emailVerificationToken,
          tokenExpired,
          reminderNumber,
        });

        stats.sent++;
        console.log(`[cron:verification-reminders] Sent reminder #${reminderNumber} to: ${user.email} (${reminderNumber <= DAILY_PHASE_COUNT ? 'daily' : 'weekly'} phase)`);

        // Small delay between emails to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (userErr: any) {
        stats.failed++;
        console.error(`[cron:verification-reminders] Failed for user ${user.id}:`, userErr.message);
      }
    }

  } catch (error: any) {
    console.error('[cron:verification-reminders] Fatal error:', error.message);
    throw error;
  }

  console.log(`[cron:verification-reminders] Complete:`, JSON.stringify(stats));
  return stats;
}
