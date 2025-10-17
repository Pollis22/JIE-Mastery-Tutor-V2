import { db } from '../db';
import { sql } from 'drizzle-orm';
import { users, minutePurchases } from '@shared/schema';

export interface MinuteBalance {
  subscriptionMinutes: number;
  subscriptionLimit: number;
  purchasedMinutes: number;
  totalAvailable: number;
  resetDate: Date;
  subscriptionUsed: number;
  purchasedUsed: number;
  // Trial fields
  isTrialActive?: boolean;
  trialMinutesRemaining?: number;
  trialMinutesLimit?: number;
  trialEndsAt?: Date;
}

export async function getUserMinuteBalance(userId: string): Promise<MinuteBalance> {
  const userResult = await db.execute(sql`
    SELECT 
      subscription_minutes_used,
      subscription_minutes_limit,
      purchased_minutes_balance,
      billing_cycle_start,
      last_reset_at,
      is_trial_active,
      trial_minutes_used,
      trial_minutes_limit,
      trial_ends_at
    FROM users 
    WHERE id = ${userId}
  `);

  if (!userResult.rows || userResult.rows.length === 0) {
    throw new Error('User not found');
  }

  const userData = userResult.rows[0] as any;
  
  const now = new Date();
  
  // Check if trial is active
  if (userData.is_trial_active && userData.trial_ends_at) {
    const trialEndsAt = new Date(userData.trial_ends_at);
    const isTrialExpired = now > trialEndsAt;
    
    if (isTrialExpired) {
      // Trial expired, mark as inactive
      console.log(`⏰ [VoiceMinutes] Trial expired for user ${userId}`);
      await db.execute(sql`
        UPDATE users 
        SET is_trial_active = false
        WHERE id = ${userId}
      `);
      userData.is_trial_active = false;
    }
  }
  
  // If user is on trial, return trial balance
  if (userData.is_trial_active) {
    const trialMinutesRemaining = Math.max(
      0, 
      (userData.trial_minutes_limit || 30) - (userData.trial_minutes_used || 0)
    );
    
    return {
      subscriptionMinutes: 0,
      subscriptionLimit: 0,
      purchasedMinutes: 0,
      totalAvailable: trialMinutesRemaining,
      resetDate: new Date(userData.trial_ends_at),
      subscriptionUsed: 0,
      purchasedUsed: 0,
      // Trial fields
      isTrialActive: true,
      trialMinutesRemaining: trialMinutesRemaining,
      trialMinutesLimit: userData.trial_minutes_limit || 30,
      trialEndsAt: new Date(userData.trial_ends_at)
    };
  }
  
  // Regular subscription logic
  const lastReset = new Date(userData.last_reset_at || userData.billing_cycle_start);
  const daysSinceReset = (now.getTime() - lastReset.getTime()) / (1000 * 60 * 60 * 24);
  
  if (daysSinceReset >= 30) {
    console.log(`🔄 [VoiceMinutes] Resetting subscription minutes for user ${userId}`);
    
    await db.execute(sql`
      UPDATE users 
      SET 
        subscription_minutes_used = 0,
        last_reset_at = NOW()
      WHERE id = ${userId}
    `);
    
    userData.subscription_minutes_used = 0;
  }

  // Calculate purchased minutes used by querying minute_purchases table
  // Include both 'active' and 'used' status to count fully consumed purchases
  const purchasesResult = await db.execute(sql`
    SELECT 
      COALESCE(SUM(minutes_purchased - minutes_remaining), 0) as purchased_used
    FROM minute_purchases
    WHERE user_id = ${userId}
      AND status IN ('active', 'used')
  `);
  
  const purchasedUsed = Number((purchasesResult.rows[0] as any)?.purchased_used || 0);

  const subscriptionRemaining = Math.max(
    0, 
    (userData.subscription_minutes_limit || 60) - (userData.subscription_minutes_used || 0)
  );

  const nextReset = new Date(lastReset);
  nextReset.setDate(nextReset.getDate() + 30);

  return {
    subscriptionMinutes: subscriptionRemaining,
    subscriptionLimit: userData.subscription_minutes_limit || 60,
    purchasedMinutes: userData.purchased_minutes_balance || 0,
    totalAvailable: subscriptionRemaining + (userData.purchased_minutes_balance || 0),
    resetDate: nextReset,
    // Add total used minutes including both subscription and purchased
    subscriptionUsed: userData.subscription_minutes_used || 0,
    purchasedUsed: purchasedUsed,
    isTrialActive: false
  };
}

export async function deductMinutes(userId: string, minutesUsed: number): Promise<void> {
  console.log('⏱️ [VoiceMinutes] Deducting minutes', { userId, minutesUsed });

  const userResult = await db.execute(sql`
    SELECT 
      subscription_minutes_used,
      subscription_minutes_limit,
      purchased_minutes_balance,
      is_trial_active,
      trial_minutes_used,
      trial_minutes_limit,
      trial_ends_at
    FROM users 
    WHERE id = ${userId}
  `);

  if (!userResult.rows || userResult.rows.length === 0) {
    throw new Error('User not found');
  }

  const userData = userResult.rows[0] as any;
  
  // Handle trial users
  if (userData.is_trial_active) {
    const now = new Date();
    const trialEndsAt = new Date(userData.trial_ends_at);
    
    // Check if trial expired
    if (now > trialEndsAt) {
      console.log('⏰ [VoiceMinutes] Trial expired during session');
      throw new Error('Your trial has expired. Please subscribe to continue.');
    }
    
    const trialRemaining = Math.max(0, (userData.trial_minutes_limit || 30) - (userData.trial_minutes_used || 0));
    
    if (trialRemaining < minutesUsed) {
      console.error(`❌ [VoiceMinutes] Insufficient trial minutes. User ${userId} needs ${minutesUsed} but only has ${trialRemaining} remaining.`);
      throw new Error(`Insufficient trial minutes. You need ${minutesUsed} minutes but only have ${trialRemaining} trial minutes remaining.`);
    }
    
    // Deduct from trial minutes
    await db.execute(sql`
      UPDATE users 
      SET trial_minutes_used = trial_minutes_used + ${minutesUsed}
      WHERE id = ${userId}
    `);
    
    console.log(`✅ [VoiceMinutes] Deducted ${minutesUsed} trial minutes`);
    return;
  }
  const subscriptionRemaining = Math.max(0, (userData.subscription_minutes_limit || 60) - (userData.subscription_minutes_used || 0));
  const purchasedBalance = userData.purchased_minutes_balance || 0;
  const totalAvailable = subscriptionRemaining + purchasedBalance;

  // Validate sufficient minutes before deducting
  if (totalAvailable < minutesUsed) {
    const shortfall = minutesUsed - totalAvailable;
    console.error(`❌ [VoiceMinutes] Insufficient minutes. User ${userId} needs ${minutesUsed} but only has ${totalAvailable}. Shortfall: ${shortfall}`);
    throw new Error(`Insufficient voice minutes. You need ${minutesUsed} minutes but only have ${totalAvailable} available.`);
  }

  // Deduct from subscription first, then purchased
  if (subscriptionRemaining >= minutesUsed) {
    // All from subscription
    await db.execute(sql`
      UPDATE users 
      SET subscription_minutes_used = subscription_minutes_used + ${minutesUsed}
      WHERE id = ${userId}
    `);
    
    console.log('✅ [VoiceMinutes] Deducted from subscription minutes');
  } else if (subscriptionRemaining > 0) {
    // Partial subscription, rest from purchased
    const fromSubscription = subscriptionRemaining;
    const fromPurchased = minutesUsed - fromSubscription;
    
    await db.execute(sql`
      UPDATE users 
      SET 
        subscription_minutes_used = subscription_minutes_limit,
        purchased_minutes_balance = purchased_minutes_balance - ${fromPurchased}
      WHERE id = ${userId}
    `);
    
    // Deduct from minute_purchases table
    await deductFromPurchases(userId, fromPurchased);
    
    console.log('✅ [VoiceMinutes] Deducted from both pools', { fromSubscription, fromPurchased });
  } else {
    // All from purchased
    await db.execute(sql`
      UPDATE users 
      SET purchased_minutes_balance = purchased_minutes_balance - ${minutesUsed}
      WHERE id = ${userId}
    `);
    
    // Deduct from minute_purchases table
    await deductFromPurchases(userId, minutesUsed);
    
    console.log('✅ [VoiceMinutes] Deducted from purchased minutes');
  }
}

// Helper function to deduct minutes from minute_purchases table
async function deductFromPurchases(userId: string, minutesToDeduct: number): Promise<void> {
  let remaining = minutesToDeduct;
  
  // Get active purchases ordered by oldest first (FIFO)
  const purchases = await db.execute(sql`
    SELECT id, minutes_remaining
    FROM minute_purchases
    WHERE user_id = ${userId}
      AND status = 'active'
      AND minutes_remaining > 0
    ORDER BY purchased_at ASC
  `);
  
  for (const purchase of purchases.rows) {
    if (remaining <= 0) break;
    
    const purchaseId = (purchase as any).id;
    const minutesAvailable = Number((purchase as any).minutes_remaining || 0);
    const toDeduct = Math.min(remaining, minutesAvailable);
    const newRemaining = minutesAvailable - toDeduct;
    
    // Update minutes_remaining and mark as 'used' if fully consumed
    if (newRemaining <= 0) {
      await db.execute(sql`
        UPDATE minute_purchases
        SET minutes_remaining = 0, status = 'used'
        WHERE id = ${purchaseId}
      `);
    } else {
      await db.execute(sql`
        UPDATE minute_purchases
        SET minutes_remaining = ${newRemaining}
        WHERE id = ${purchaseId}
      `);
    }
    
    remaining -= toDeduct;
    console.log(`💰 [VoiceMinutes] Deducted ${toDeduct} from purchase ${purchaseId}, ${newRemaining} remaining`);
  }
  
  if (remaining > 0) {
    console.error(`⚠️ [VoiceMinutes] Could not deduct all minutes. ${remaining} minutes unaccounted for.`);
  }
}

export async function addPurchasedMinutes(
  userId: string, 
  minutes: number,
  pricePaid: number
): Promise<void> {
  await db.execute(sql`
    UPDATE users 
    SET purchased_minutes_balance = purchased_minutes_balance + ${minutes}
    WHERE id = ${userId}
  `);

  await db.execute(sql`
    INSERT INTO minute_purchases (
      user_id, 
      minutes_purchased, 
      minutes_remaining, 
      price_paid,
      expires_at
    ) VALUES (${userId}, ${minutes}, ${minutes}, ${pricePaid}, NULL)
  `);

  console.log('✅ [VoiceMinutes] Added purchased minutes', { userId, minutes });
}
