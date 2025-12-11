/**
 * Admin Utility: Reset User Subscription Minutes
 * 
 * Usage: tsx scripts/reset-user-minutes.ts <email> <plan> <minutes>
 * 
 * Examples:
 *   tsx scripts/reset-user-minutes.ts pollis@mfhfoods.com elite 1800
 *   tsx scripts/reset-user-minutes.ts pollis@aquavertclean.com starter 60
 */

import { db } from "../server/db";
import { users, minutePurchases } from "../shared/schema";
import { eq } from "drizzle-orm";

async function resetUserMinutes(email: string, plan: string, minutesLimit: number) {
  console.log(`\n🔍 Looking up user: ${email}...`);
  
  // Find user
  const userResults = await db.select().from(users).where(eq(users.email, email)).limit(1);
  
  if (userResults.length === 0) {
    console.error(`❌ User not found: ${email}`);
    process.exit(1);
  }
  
  const user = userResults[0];
  console.log(`✅ Found user: ${user.username} (ID: ${user.id})`);
  console.log(`   Current plan: ${user.subscriptionPlan}`);
  console.log(`   Current minutes: ${user.subscriptionMinutesLimit - user.subscriptionMinutesUsed} available of ${user.subscriptionMinutesLimit}`);
  console.log(`   Purchased balance: ${user.purchasedMinutesBalance}`);
  
  // Determine max concurrent logins based on plan
  const maxConcurrentLogins = plan.toLowerCase() === 'elite' ? 3 : 1;
  
  console.log(`\n🔧 Resetting to:`);
  console.log(`   Plan: ${plan}`);
  console.log(`   Minutes limit: ${minutesLimit}`);
  console.log(`   Minutes used: 0 (reset)`);
  console.log(`   Purchased balance: 0 (cleared)`);
  console.log(`   Max concurrent logins: ${maxConcurrentLogins}`);
  console.log(`   Status: active`);
  
  // Update user
  await db.update(users)
    .set({
      subscriptionPlan: plan,
      subscriptionStatus: 'active',
      subscriptionMinutesLimit: minutesLimit,
      subscriptionMinutesUsed: 0,
      purchasedMinutesBalance: 0,
      maxConcurrentLogins,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));
  
  console.log(`✅ User updated successfully`);
  
  // Clear any purchased minute records
  const deletedRecords = await db.delete(minutePurchases)
    .where(eq(minutePurchases.userId, user.id))
    .returning();
  
  if (deletedRecords.length > 0) {
    console.log(`🗑️  Cleared ${deletedRecords.length} purchased minute record(s)`);
  }
  
  // Verify the update
  const verifyResults = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const updatedUser = verifyResults[0];
  
  console.log(`\n✨ Final state:`);
  console.log(`   Plan: ${updatedUser.subscriptionPlan}`);
  console.log(`   Status: ${updatedUser.subscriptionStatus}`);
  console.log(`   Minutes available: ${updatedUser.subscriptionMinutesLimit - updatedUser.subscriptionMinutesUsed} of ${updatedUser.subscriptionMinutesLimit}`);
  console.log(`   Purchased balance: ${updatedUser.purchasedMinutesBalance}`);
  console.log(`   Max concurrent logins: ${updatedUser.maxConcurrentLogins}`);
  console.log(`\n🎉 Reset complete!\n`);
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length !== 3) {
  console.error(`
Usage: tsx scripts/reset-user-minutes.ts <email> <plan> <minutes>

Examples:
  tsx scripts/reset-user-minutes.ts pollis@mfhfoods.com elite 1800
  tsx scripts/reset-user-minutes.ts pollis@aquavertclean.com starter 60

Available plans: starter, standard, pro, elite
  `);
  process.exit(1);
}

const [email, plan, minutesStr] = args;
const minutes = parseInt(minutesStr, 10);

if (isNaN(minutes) || minutes < 0) {
  console.error(`❌ Invalid minutes: ${minutesStr}`);
  process.exit(1);
}

// Run the reset
resetUserMinutes(email, plan, minutes)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`\n❌ Error:`, error);
    process.exit(1);
  });
