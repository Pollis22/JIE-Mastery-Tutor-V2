import { db } from '../db';
import { users, verificationReminderTracking } from '@shared/schema';
import { and, isNull, isNotNull, eq, gt, sql } from 'drizzle-orm';
import { emailService } from '../services/email-service';

interface ReminderStats {
  scanned: number;
  eligible: number;
  sent: number;
  skippedAlreadySent: number;
  skippedLoggedIn: number;
  failed: number;
}

export async function processVerificationReminders(): Promise<ReminderStats> {
  const stats: ReminderStats = {
    scanned: 0,
    eligible: 0,
    sent: 0,
    skippedAlreadySent: 0,
    skippedLoggedIn: 0,
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

        const hasValidToken = user.emailVerificationToken &&
          user.emailVerificationExpiry &&
          new Date(user.emailVerificationExpiry) > now;

        const isUnverified = !user.emailVerified;
        const isVerifiedNoLogin = user.emailVerified && !user.firstLoginAt;

        if (!isUnverified && !isVerifiedNoLogin) {
          continue;
        }

        stats.eligible++;

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

        const tokenExpired = !hasValidToken;
        const name = user.studentName || user.parentName || user.firstName || 'there';

        await emailService.sendVerificationReminder({
          email: user.email,
          name,
          verificationToken: user.emailVerificationToken,
          tokenExpired,
        });

        stats.sent++;
        console.log(`[cron:verification-reminders] Sent reminder to: ${user.email}`);

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
