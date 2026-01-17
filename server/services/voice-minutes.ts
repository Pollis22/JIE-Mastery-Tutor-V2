/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 * 
 * This source code is confidential and proprietary.
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */


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
}

export async function getUserMinuteBalance(userId: string): Promise<MinuteBalance> {
  // Special handling for test user only in development
  if (userId === 'test-user-id' && process.env.NODE_ENV === 'development') {
    const now = new Date();
    const nextReset = new Date(now);
    nextReset.setDate(nextReset.getDate() + 30);
    
    return {
      subscriptionMinutes: 600, // Test user has full 600 minutes
      subscriptionLimit: 600,
      purchasedMinutes: 0,
      totalAvailable: 600,
      resetDate: nextReset,
      subscriptionUsed: 0,
      purchasedUsed: 0
    };
  }

  const userResult = await db.execute(sql`
    SELECT 
      subscription_minutes_used,
      subscription_minutes_limit,
      purchased_minutes_balance,
      billing_cycle_start,
      last_reset_at,
      monthly_reset_date,
      trial_active,
      trial_minutes_total,
      trial_minutes_used,
      trial_started_at,
      subscription_plan
    FROM users 
    WHERE id = ${userId}
  `);

  if (!userResult.rows || userResult.rows.length === 0) {
    throw new Error('User not found');
  }

  const userData = userResult.rows[0] as any;
  
  const now = new Date();
  
  // TRIAL USER HANDLING: Use trial minutes instead of subscription
  if (userData.trial_active) {
    const trialTotal = userData.trial_minutes_total || 30;
    const trialUsed = userData.trial_minutes_used || 0;
    const trialRemaining = Math.max(0, trialTotal - trialUsed);
    
    // Calculate trial expiry (30 days from start, or never if not started)
    const trialStarted = userData.trial_started_at ? new Date(userData.trial_started_at) : now;
    const trialExpiry = new Date(trialStarted);
    trialExpiry.setDate(trialExpiry.getDate() + 30);
    
    console.log(`[VoiceMinutes] Trial user ${userId}: ${trialRemaining}/${trialTotal} minutes remaining`);
    
    return {
      subscriptionMinutes: trialRemaining,
      subscriptionLimit: trialTotal,
      purchasedMinutes: 0, // Trial users don't have purchased minutes
      totalAvailable: trialRemaining,
      resetDate: trialExpiry, // When trial expires
      subscriptionUsed: trialUsed,
      purchasedUsed: 0
    };
  }
  
  // Regular subscription logic
  const lastReset = new Date(userData.last_reset_at || userData.billing_cycle_start);
  const daysSinceReset = (now.getTime() - lastReset.getTime()) / (1000 * 60 * 60 * 24);
  
  if (daysSinceReset >= 30) {
    console.log(`🔄 [VoiceMinutes] Resetting subscription minutes for user ${userId}`);
    
    // Calculate next reset (30 days from now)
    const nextResetDate = new Date(now);
    nextResetDate.setDate(nextResetDate.getDate() + 30);
    
    await db.execute(sql`
      UPDATE users 
      SET 
        subscription_minutes_used = 0,
        last_reset_at = NOW(),
        monthly_reset_date = ${nextResetDate.toISOString()}
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

  // Prefer persisted monthly_reset_date (synced with Stripe) over calculated date
  // Detect stale dates (in the past) and recalculate to prevent desync
  let nextReset: Date;
  const storedResetDate = userData.monthly_reset_date ? new Date(userData.monthly_reset_date) : null;
  
  if (storedResetDate && storedResetDate > now) {
    // Use the stored date if it's in the future (valid)
    nextReset = storedResetDate;
  } else {
    // Stored date is stale (in the past) or missing - calculate from last_reset_at + 30 days
    nextReset = new Date(lastReset);
    nextReset.setDate(nextReset.getDate() + 30);
    
    // If even the calculated date is in the past, set it to 30 days from now
    if (nextReset <= now) {
      nextReset = new Date(now);
      nextReset.setDate(nextReset.getDate() + 30);
    }
    
    // Update the stored date to prevent future stale reads (non-blocking)
    db.execute(sql`
      UPDATE users 
      SET monthly_reset_date = ${nextReset.toISOString()}
      WHERE id = ${userId}
    `).catch(e => console.error('[VoiceMinutes] Failed to update stale reset date:', e));
  }

  return {
    subscriptionMinutes: subscriptionRemaining,
    subscriptionLimit: userData.subscription_minutes_limit || 60,
    purchasedMinutes: userData.purchased_minutes_balance || 0,
    totalAvailable: subscriptionRemaining + (userData.purchased_minutes_balance || 0),
    resetDate: nextReset,
    subscriptionUsed: userData.subscription_minutes_used || 0,
    purchasedUsed: purchasedUsed
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
