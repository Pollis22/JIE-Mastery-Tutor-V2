import { db } from "../db";
import { users } from "@shared/schema";
import { isNotNull, eq } from "drizzle-orm";
import Stripe from "stripe";

const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2025-08-27.basil" })
  : null;

export async function cleanupInvalidStripeCustomers(): Promise<{ 
  checked: number; 
  fixed: number; 
  errors: string[] 
}> {
  if (!stripe) {
    console.log('⚠️ Stripe not configured, skipping customer cleanup');
    return { checked: 0, fixed: 0, errors: ['Stripe not configured'] };
  }

  console.log('🔍 Checking for invalid Stripe customer IDs...');
  
  const usersWithStripeId = await db.query.users.findMany({
    where: isNotNull(users.stripeCustomerId),
    columns: {
      id: true,
      email: true,
      stripeCustomerId: true,
    }
  });

  let checkedCount = 0;
  let fixedCount = 0;
  const errors: string[] = [];

  for (const user of usersWithStripeId) {
    checkedCount++;
    
    try {
      await stripe.customers.retrieve(user.stripeCustomerId!);
      console.log(`✅ Valid customer: ${user.email} (${user.stripeCustomerId})`);
    } catch (error: any) {
      console.log(`❌ Invalid customer for ${user.email} (${user.stripeCustomerId}), clearing...`);
      
      try {
        await db.update(users)
          .set({ stripeCustomerId: null })
          .where(eq(users.id, user.id));
        
        fixedCount++;
        console.log(`   ✅ Cleared invalid customer ID for user ${user.id}`);
      } catch (updateError: any) {
        const errorMsg = `Failed to update user ${user.id}: ${updateError.message}`;
        errors.push(errorMsg);
        console.error(`   ❌ ${errorMsg}`);
      }
    }
  }

  const summary = {
    checked: checkedCount,
    fixed: fixedCount,
    errors
  };

  console.log(`
✅ Cleanup complete:
   - Checked: ${checkedCount} users
   - Fixed: ${fixedCount} invalid customer IDs
   - Errors: ${errors.length}
  `);

  return summary;
}

export async function manualCleanupEndpoint(req: any, res: any) {
  try {
    const result = await cleanupInvalidStripeCustomers();
    res.json({
      success: true,
      message: 'Stripe customer cleanup completed',
      ...result
    });
  } catch (error: any) {
    console.error('Cleanup error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
