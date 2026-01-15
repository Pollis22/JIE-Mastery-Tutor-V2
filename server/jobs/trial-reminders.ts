/**
 * Trial Verification Reminder Job
 * Sends reminder emails to pending trial leads every 6 hours
 */

import cron from 'node-cron';
import { trialService } from '../services/trial-service';

const REMINDER_CRON = '0 */6 * * *';
const REMINDER_TIMEZONE = 'America/Chicago';

export function startTrialReminderJob() {
  console.log('[TrialReminders] Starting trial reminder scheduler (runs every 6 hours)');

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
  console.log('[TrialReminders] Manual "Run Now" triggered');
  return await trialService.processPendingReminders();
}
