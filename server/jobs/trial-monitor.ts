import { db } from '../db';
import { sql } from 'drizzle-orm';
import { emailService } from '../services/email-service';

/**
 * Check for trials ending within 24 hours and send reminder emails
 */
export async function checkTrialReminders() {
  console.log('🔍 [TrialMonitor] Checking for trials ending soon...');

  try {
    // Find users whose trial ends in 24 hours and haven't been sent a reminder
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const today = new Date();

    const result = await db.execute(sql`
      SELECT 
        id, 
        email, 
        parent_name,
        student_name,
        trial_ends_at,
        trial_minutes_limit,
        trial_minutes_used
      FROM users 
      WHERE is_trial_active = true 
        AND trial_reminder_sent = false 
        AND trial_ends_at > ${today.toISOString()}
        AND trial_ends_at <= ${tomorrow.toISOString()}
    `);

    console.log(`📧 [TrialMonitor] Found ${result.rows.length} users to remind`);

    for (const user of result.rows) {
      const userData = user as any;
      const minutesRemaining = Math.max(0, (userData.trial_minutes_limit || 30) - (userData.trial_minutes_used || 0));
      
      try {
        // Send reminder email
        await emailService.sendTrialEndingReminder({
          email: userData.email,
          name: userData.parent_name || userData.student_name || 'there',
          trialEndsAt: new Date(userData.trial_ends_at),
          minutesRemaining: minutesRemaining
        });

        // Mark reminder as sent
        await db.execute(sql`
          UPDATE users 
          SET trial_reminder_sent = true 
          WHERE id = ${userData.id}
        `);
        
        console.log(`✅ [TrialMonitor] Reminder sent to ${userData.email}`);
      } catch (error) {
        console.error(`❌ [TrialMonitor] Failed to send reminder to ${userData.email}:`, error);
      }
    }

  } catch (error) {
    console.error('❌ [TrialMonitor] Error checking trial reminders:', error);
  }
}

/**
 * Check for expired trials and mark them as inactive
 */
export async function checkExpiredTrials() {
  console.log('🔍 [TrialMonitor] Checking for expired trials...');

  try {
    const now = new Date();

    // Find expired trials
    const result = await db.execute(sql`
      SELECT 
        id, 
        email,
        parent_name,
        student_name
      FROM users 
      WHERE is_trial_active = true 
        AND trial_ends_at <= ${now.toISOString()}
    `);

    console.log(`⏰ [TrialMonitor] Found ${result.rows.length} expired trials`);

    for (const user of result.rows) {
      const userData = user as any;
      
      try {
        // Mark trial as inactive
        await db.execute(sql`
          UPDATE users 
          SET is_trial_active = false
          WHERE id = ${userData.id}
        `);
        
        console.log(`✅ [TrialMonitor] Marked trial as expired for ${userData.email}`);
      } catch (error) {
        console.error(`❌ [TrialMonitor] Failed to update expired trial for ${userData.email}:`, error);
      }
    }

  } catch (error) {
    console.error('❌ [TrialMonitor] Error checking expired trials:', error);
  }
}

// Run checks every hour
let intervalId: NodeJS.Timeout | null = null;

export function startTrialMonitoring() {
  // Run immediately on startup
  checkTrialReminders();
  checkExpiredTrials();

  // Schedule to run every hour
  intervalId = setInterval(() => {
    checkTrialReminders();
    checkExpiredTrials();
  }, 60 * 60 * 1000); // 1 hour

  console.log('✅ [TrialMonitor] Trial monitoring service started');
}

export function stopTrialMonitoring() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('⏹️ [TrialMonitor] Trial monitoring service stopped');
  }
}