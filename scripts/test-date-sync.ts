#!/usr/bin/env tsx

import { db } from '../server/db';
import { users } from '../shared/schema';
import { getUserMinuteBalance } from '../server/services/voice-minutes';

async function testDateSync() {
  console.log('🔍 Testing Date Synchronization...\n');
  
  // Find an active subscription user
  const activeUsers = await db
    .select()
    .from(users)
    .where(users.subscriptionStatus.eq('active'))
    .limit(3);
  
  if (activeUsers.length === 0) {
    console.log('❌ No active subscription users found');
    return;
  }
  
  for (const user of activeUsers) {
    console.log(`📧 User: ${user.email}`);
    console.log(`📋 Plan: ${user.subscriptionPlan}`);
    
    const billingDate = user.billingCycleStart ? new Date(user.billingCycleStart) : null;
    const resetDate = user.monthlyResetDate ? new Date(user.monthlyResetDate) : null;
    const lastReset = user.lastResetAt ? new Date(user.lastResetAt) : null;
    
    console.log(`📅 Billing Cycle Start: ${billingDate?.toLocaleDateString()}`);
    console.log(`🔄 Monthly Reset Date: ${resetDate?.toLocaleDateString()}`);
    console.log(`⏰ Last Reset At: ${lastReset?.toLocaleDateString()}`);
    
    // Check if dates are synchronized
    const datesMatch = billingDate && resetDate && lastReset &&
      billingDate.getTime() === resetDate.getTime() &&
      billingDate.getTime() === lastReset.getTime();
    
    console.log(`✅ Dates Synchronized: ${datesMatch ? 'YES ✓' : 'NO ✗'}`);
    
    // Get minute balance to check calculated reset date
    const balance = await getUserMinuteBalance(user.id);
    console.log(`📊 Next Reset Date (calculated): ${balance.resetDate.toLocaleDateString()}`);
    
    // Calculate expected next reset (30 days from billing cycle)
    if (billingDate) {
      const expectedNextReset = new Date(billingDate);
      expectedNextReset.setDate(expectedNextReset.getDate() + 30);
      console.log(`📆 Expected Next Reset: ${expectedNextReset.toLocaleDateString()}`);
      
      const calculatedMatchesExpected = 
        balance.resetDate.toDateString() === expectedNextReset.toDateString();
      console.log(`✅ Calculation Correct: ${calculatedMatchesExpected ? 'YES ✓' : 'NO ✗'}`);
    }
    
    console.log('---\n');
  }
  
  console.log('✅ Date synchronization test complete!');
  process.exit(0);
}

testDateSync().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});