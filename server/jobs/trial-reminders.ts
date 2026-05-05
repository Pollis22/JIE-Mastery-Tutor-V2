/**
 * Trial Verification Reminder Job
 *
 * DISABLED (May 2026): free trial removed. The cron scheduler no longer
 * starts and the manual "Run Now" trigger is a no-op. File retained for
 * easy revert — to re-enable, remove the early returns below.
 */

import cron from 'node-cron';
import { trialService } from '../services/trial-service';

const REMINDER_CRON = '0 */6 * * *';
const REMINDER_TIMEZONE = 'America/Chicago';

export function startTrialReminderJob() {
  console.log('[TrialReminders] 🚫 Free trial discontinued — reminder cron NOT starting');
  return; // Early exit. Original scheduler code preserved below for revert.

  cron.schedule(REMINDER_CRON, async () => {
    console.log('[TrialReminders] Running scheduled reminder job...');

    try {
      const result = await trialService.processPendingReminders();
      console.log(`[TrialReminders] Scheduled job complete: sent=${result.sent}, skipped=${result.skipped}, errors=${result.errors}`);
    } catch (error) {
      console.error('[TrialReminders] Scheduled job failed:', error);
    }
  }, {
    timezone: REMINDER_TIMEZONE
  });
}

export async function runTrialRemindersNow(): Promise<{ sent: number; skipped: number; errors: number }> {
  console.log('[TrialReminders] 🚫 Manual run rejected — free trial discontinued');
  return { sent: 0, skipped: 0, errors: 0 };
}
