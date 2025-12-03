/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 * 
 * This source code is confidential and proprietary.
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */


import { Router } from 'express';
import Stripe from 'stripe';
import { storage } from '../storage';
import { 
  getActiveSubscription, 
  createOrUpdateSubscription,
  cancelDuplicateSubscriptions,
  stripe 
} from '../services/stripe-service';

const router = Router();

// POST /api/subscription/change - Change subscription plan
router.post('/change', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { plan } = req.body;
    const userId = req.user!.id;

    console.log('📝 [Subscription] Change request', { userId, plan });

    if (!plan) {
      return res.status(400).json({ error: 'Plan is required' });
    }

    if (!stripe) {
      return res.status(503).json({ 
        error: 'Subscription service unavailable',
        message: 'Stripe is not configured' 
      });
    }

    // Price ID mapping - use environment variables
    const priceIds: Record<string, string> = {
      starter: process.env.STRIPE_PRICE_STARTER || '',
      standard: process.env.STRIPE_PRICE_STANDARD || '',
      pro: process.env.STRIPE_PRICE_PRO || '',
      elite: process.env.STRIPE_PRICE_ELITE || '',
    };

    const priceId = priceIds[plan.toLowerCase()];
    if (!priceId) {
      console.error(`❌ [Subscription] Price ID not configured for plan: ${plan}`);
      return res.status(503).json({ 
        error: 'Subscription service temporarily unavailable',
        message: `Stripe pricing not configured for ${plan} plan. Please set STRIPE_PRICE_${plan.toUpperCase()} environment variable.`
      });
    }

    console.log('💳 [Subscription] Using price ID:', priceId);

    // Get user's stripe info
    const user = await storage.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { stripeCustomerId } = user;

    // 🚨 CRITICAL FIX: Ensure we have or create a Stripe customer first
    let customerId = stripeCustomerId;
    
    if (customerId) {
      try {
        await stripe!.customers.retrieve(customerId);
        console.log('✅ Using existing Stripe customer:', customerId);
      } catch (error) {
        console.warn('⚠️ Invalid Stripe customer ID, creating new one');
        customerId = null;
      }
    }
    
    if (!customerId) {
      const customer = await stripe!.customers.create({
        email: user.email,
        name: user.parentName || user.username,
        metadata: { userId }
      });
      customerId = customer.id;
      await storage.updateUserStripeInfo(userId, customerId, null);
      console.log('✅ Created new Stripe customer:', customerId);
    }

    // 🚨 CRITICAL FIX: Check for existing subscription before creating checkout
    const existingSubscription = await getActiveSubscription(customerId);
    
    if (existingSubscription) {
      console.log('🔄 [Subscription] User already has active subscription, updating it...');
      
      try {
        // Use helper function to update subscription (prevents duplicates)
        const updatedSubscription = await createOrUpdateSubscription(customerId, priceId);

        // Plan minute allocation map
        const minutesMap: Record<string, number> = {
          'starter': 60,
          'standard': 240,
          'pro': 600,
          'elite': 1800,
        };

        const newPlanMinutes = minutesMap[plan.toLowerCase()] || 60;
        const oldPlanMinutes = user.subscriptionMinutesLimit || 60;
        const usedMinutes = user.subscriptionMinutesUsed || 0;
        const remainingMinutes = Math.max(0, oldPlanMinutes - usedMinutes);

        let finalMinutesLimit: number;
        let finalMinutesUsed: number;

        // Determine if upgrade or downgrade
        const isUpgrade = newPlanMinutes > oldPlanMinutes;
        const isDowngrade = newPlanMinutes < oldPlanMinutes;

        if (isUpgrade) {
          // UPGRADE: Add remaining minutes to new tier's allocation
          // Example: 40 remaining Starter + 600 Pro = 640 total for this cycle
          finalMinutesLimit = newPlanMinutes + remainingMinutes;
          finalMinutesUsed = 0; // Reset usage counter
          console.log(`📈 [Subscription] UPGRADE: ${remainingMinutes} remaining + ${newPlanMinutes} new = ${finalMinutesLimit} total`);
        } else if (isDowngrade) {
          // DOWNGRADE: Cap remaining minutes at new tier's maximum
          // Example: 500 remaining Pro → min(500, 60) = 60 for Starter
          finalMinutesLimit = newPlanMinutes;
          finalMinutesUsed = Math.max(0, usedMinutes - (oldPlanMinutes - newPlanMinutes));
          // Alternative: Let them keep remaining until cycle resets
          // For now, we reset to new plan's allocation
          console.log(`📉 [Subscription] DOWNGRADE: ${remainingMinutes} remaining capped to ${newPlanMinutes} (new limit)`);
        } else {
          // Same tier - just refresh allocation
          finalMinutesLimit = newPlanMinutes;
          finalMinutesUsed = usedMinutes;
          console.log(`🔄 [Subscription] SAME TIER: Keeping ${finalMinutesLimit} limit with ${finalMinutesUsed} used`);
        }

        // Update database with calculated minutes
        // Note: updateUserSubscription automatically resets subscriptionMinutesUsed to 0 when active
        // This is correct because: 
        // - For upgrades: remaining minutes are already included in finalMinutesLimit
        // - For downgrades: cap is applied to finalMinutesLimit
        await storage.updateUserSubscription(
          userId,
          plan as 'starter' | 'standard' | 'pro' | 'elite',
          'active',
          finalMinutesLimit
        );

        // Store the updated subscription ID
        if (updatedSubscription.id !== existingSubscription.id) {
          await storage.updateUserStripeInfo(userId, customerId, updatedSubscription.id);
        }

        console.log('✅ [Subscription] Subscription updated successfully', {
          plan,
          newLimit: finalMinutesLimit,
          usedAfterChange: finalMinutesUsed
        });

        return res.json({ 
          success: true,
          subscription: updatedSubscription.id,
          plan: plan,
          message: 'Subscription plan updated successfully',
          minutesAllocated: finalMinutesLimit
        });
      } catch (error: any) {
        console.error('❌ [Subscription] Error updating subscription:', error);
        return res.status(500).json({
          error: 'Failed to update subscription',
          message: error.message
        });
      }
    }

    // No existing subscription - create new checkout session
    console.log('🆕 [Subscription] Creating new subscription checkout');
    
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    const session = await stripe!.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      payment_method_collection: 'always',
      line_items: [{ 
        price: priceId, 
        quantity: 1 
      }],
      metadata: {
        userId,
        plan,
        type: 'subscription_change'
      },
      subscription_data: {
        metadata: {
          userId,
          plan
        }
      },
      success_url: `${baseUrl}/dashboard?subscription=success&plan=${plan}`,
      cancel_url: `${baseUrl}/dashboard?subscription=cancelled`,
      allow_promotion_codes: true,
    });

    console.log('✅ [Subscription] Checkout session created:', session.id);

    res.json({ 
      sessionId: session.id,
      url: session.url 
    });

  } catch (error: any) {
    console.error('❌ [Subscription] Change failed:', error);
    res.status(500).json({ 
      error: 'Failed to change subscription',
      message: error.message,
      type: error.type || 'unknown'
    });
  }
});

// GET /api/subscription/status - Get current subscription status
router.get('/status', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.user!.id;
    const user = await storage.getUserById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const minutesData = await storage.getAvailableMinutes(userId);

    res.json({
      plan: user.subscriptionPlan || 'starter',
      status: user.subscriptionStatus || 'active',
      minutesUsed: minutesData.used,
      minutesLimit: minutesData.total,
      minutesRemaining: minutesData.remaining,
      bonusMinutes: user.bonusMinutes || 0,
      hasActiveSubscription: !!user.stripeSubscriptionId
    });

  } catch (error: any) {
    console.error('❌ [Subscription] Failed to get status:', error);
    res.status(500).json({ 
      error: 'Failed to get subscription status',
      message: error.message 
    });
  }
});

export default router;
