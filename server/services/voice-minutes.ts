import { db } from '../db';
import { sql } from 'drizzle-orm';
import { users, minutePurchases } from '@shared/schema';

export interface MinuteBalance {
  subscriptionMinutes: number;
  subscriptionLimit: number;
  purchasedMinutes: number;
  totalAvailable: number;
  resetDate: Date;
}

export async function getUserMinuteBalance(userId: string): Promise<MinuteBalance> {
  const userResult = await db.execute(sql`
    SELECT 
      subscription_minutes_used,
      subscription_minutes_limit,
      purchased_minutes_balance,
      billing_cycle_start,
      last_reset_at
    FROM users 
    WHERE id = ${userId}
  `);

  if (!userResult.rows || userResult.rows.length === 0) {
    throw new Error('User not found');
  }

  const userData = userResult.rows[0] as any;
  
  const now = new Date();
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
    resetDate: nextReset
  };
}

export async function deductMinutes(userId: string, minutesUsed: number): Promise<void> {
  console.log('⏱️ [VoiceMinutes] Deducting minutes', { userId, minutesUsed });

  const userResult = await db.execute(sql`
    SELECT 
      subscription_minutes_used,
      subscription_minutes_limit,
      purchased_minutes_balance
    FROM users 
    WHERE id = ${userId}
  `);

  if (!userResult.rows || userResult.rows.length === 0) {
    throw new Error('User not found');
  }

  const userData = userResult.rows[0] as any;
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
    
    console.log('✅ [VoiceMinutes] Deducted from both pools', { fromSubscription, fromPurchased });
  } else {
    // All from purchased
    await db.execute(sql`
      UPDATE users 
      SET purchased_minutes_balance = purchased_minutes_balance - ${minutesUsed}
      WHERE id = ${userId}
    `);
    
    console.log('✅ [VoiceMinutes] Deducted from purchased minutes');
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
