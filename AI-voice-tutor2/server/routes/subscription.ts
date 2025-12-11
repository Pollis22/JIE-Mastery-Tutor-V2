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

// Plan tier order for determining upgrade vs downgrade
const PLAN_TIERS: Record<string, number> = {
  'free': 0,
  'starter': 1,
  'standard': 2,
  'pro': 3,
  'elite': 4,
};

// Minutes allocation per plan
const PLAN_MINUTES: Record<string, number> = {
  'starter': 60,
  'standard': 240,
  'pro': 600,
  'elite': 1800,
};

// Concurrent session limits per plan
const PLAN_CONCURRENT_SESSIONS: Record<string, number> = {
  'starter': 1,
  'standard': 1,
  'pro': 1,
  'elite': 3,
};

// POST /api/subscription/change - Change subscription plan
router.post('/change', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { plan, promoCode } = req.body;
    const userId = req.user!.id;

    console.log('📝 [Subscription] Change request', { userId, plan, hasPromoCode: !!promoCode });

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

    const newPlan = plan.toLowerCase();
    const priceId = priceIds[newPlan];
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
    const currentPlan = user.subscriptionPlan || 'free';

    // Check if user is trying to change to their current plan
    if (currentPlan === newPlan) {
      return res.status(400).json({ 
        error: 'Already on this plan',
        message: 'You are already subscribed to this plan.'
      });
    }

    // Ensure we have or create a Stripe customer first
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

    const existingSubscription = await getActiveSubscription(customerId);
    
    // Determine if this is an upgrade or downgrade
    const currentTier = PLAN_TIERS[currentPlan] || 0;
    const newTier = PLAN_TIERS[newPlan] || 0;
    const isUpgrade = newTier > currentTier;
    const isDowngrade = newTier < currentTier;
    
    console.log('📊 [Subscription] Plan change analysis', {
      currentPlan,
      newPlan,
      currentTier,
      newTier,
      isUpgrade,
      isDowngrade,
      hasExistingSubscription: !!existingSubscription
    });

    // ============================================
    // CASE 1: User has NO existing subscription
    // → Use Stripe Checkout for new subscription
    // ============================================
    if (!existingSubscription) {
      console.log('🆕 [Subscription] No existing subscription - creating checkout session');
      
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
          plan: newPlan,
          type: 'new_subscription',
        },
        subscription_data: {
          metadata: {
            userId,
            plan: newPlan
          }
        },
        success_url: `${baseUrl}/dashboard?subscription=success&plan=${newPlan}`,
        cancel_url: `${baseUrl}/dashboard?subscription=cancelled`,
        allow_promotion_codes: true,
      });

      console.log('✅ [Subscription] Checkout session created:', session.id);

      return res.json({ 
        sessionId: session.id,
        url: session.url,
        type: 'checkout'
      });
    }

    // ============================================
    // CASE 2: UPGRADE - Charge immediately with proration
    // ============================================
    if (isUpgrade) {
      console.log('📈 [Subscription] Processing UPGRADE with immediate proration billing');
      
      try {
        const subscriptionItemId = existingSubscription.items.data[0]?.id;
        
        if (!subscriptionItemId) {
          throw new Error('No subscription item found');
        }

        // Build update params
        const updateParams: Stripe.SubscriptionUpdateParams = {
          items: [{
            id: subscriptionItemId,
            price: priceId,
          }],
          proration_behavior: 'always_invoice',     // CRITICAL: Charge prorated amount NOW
          payment_behavior: 'error_if_incomplete',  // CRITICAL: Fail if payment fails
          metadata: {
            userId,
            plan: newPlan,
            previousPlan: currentPlan,
            changeType: 'upgrade'
          }
        };
        
        // Track whether promo was successfully applied
        let discountApplied = false;
        
        // Apply promo code to upgrade if provided
        if (promoCode) {
          const promoCodes = await stripe!.promotionCodes.list({
            code: promoCode.toUpperCase().trim(),
            active: true,
            limit: 1,
          });
          
          if (promoCodes.data.length > 0 && promoCodes.data[0].coupon.valid) {
            const promoCodeData = promoCodes.data[0];
            
            // Check if this promo has customer restrictions
            // Stripe enforces first_time_transaction automatically, but we can add a friendly message
            if (promoCodeData.restrictions?.first_time_transaction) {
              // Check if customer has any previous subscriptions
              const previousSubs = await stripe!.subscriptions.list({
                customer: customerId,
                limit: 1,
                status: 'all'
              });
              
              if (previousSubs.data.length > 0) {
                console.log(`❌ [Subscription] Promo code ${promoCode} is for first-time customers only`);
                return res.status(400).json({
                  error: 'Promo code not eligible',
                  message: 'This promo code is only valid for first-time subscribers.',
                  type: 'promo_first_time_only'
                });
              }
            }
            
            // For subscription updates, use discounts with the promotion_code
            updateParams.discounts = [{ promotion_code: promoCodeData.id }];
            discountApplied = true;
            console.log(`🎟️ [Subscription] Applying promo to upgrade: ${promoCode} (duration: ${promoCodeData.coupon.duration})`);
          } else {
            // Return error if user explicitly provided a promo code that's invalid
            console.log(`❌ [Subscription] Invalid promo code: ${promoCode}`);
            return res.status(400).json({
              error: 'Invalid promo code',
              message: 'The promo code you entered is invalid or has expired. Please remove it and try again.',
              type: 'invalid_promo_code'
            });
          }
        }

        // Update subscription with IMMEDIATE proration billing
        const updatedSubscription = await stripe!.subscriptions.update(
          existingSubscription.id,
          updateParams
        );

        console.log('✅ [Subscription] Upgrade successful, invoice created:', updatedSubscription.latest_invoice);

        // Update database with new plan (payment already confirmed by Stripe)
        const newMinutes = PLAN_MINUTES[newPlan] || 60;
        const maxSessions = PLAN_CONCURRENT_SESSIONS[newPlan] || 1;
        
        await storage.updateUserSubscription(
          userId,
          newPlan as 'starter' | 'standard' | 'pro' | 'elite',
          'active',
          newMinutes,
          maxSessions,
          maxSessions
        );

        // Reset usage for new billing period on upgrade
        await storage.resetUserVoiceUsage(userId);
        
        // Update stripe subscription ID if changed
        await storage.updateUserStripeInfo(userId, customerId, updatedSubscription.id);

        console.log(`✅ [Subscription] User ${userId} upgraded to ${newPlan} with ${newMinutes} minutes (discount: ${discountApplied})`);

        return res.json({
          success: true,
          type: 'upgrade',
          plan: newPlan,
          message: discountApplied 
            ? 'Subscription upgraded successfully with discount applied! You have been charged the prorated difference.'
            : 'Subscription upgraded successfully! You have been charged the prorated difference.',
          minutesAllocated: newMinutes,
          discountApplied
        });

      } catch (error: any) {
        console.error('❌ [Subscription] Upgrade failed:', error);
        
        // Handle specific Stripe errors
        if (error.type === 'StripeCardError') {
          return res.status(402).json({
            error: 'Payment failed',
            message: 'Your card was declined. Please update your payment method and try again.',
            type: 'payment_failed'
          });
        }
        
        if (error.code === 'resource_missing') {
          return res.status(400).json({
            error: 'Subscription not found',
            message: 'Unable to find your subscription. Please contact support.',
            type: 'subscription_not_found'
          });
        }
        
        throw error;
      }
    }

    // ============================================
    // CASE 3: DOWNGRADE - Schedule for end of billing period
    // No refund, keeps current plan until period ends
    // ============================================
    if (isDowngrade) {
      console.log('📉 [Subscription] Processing DOWNGRADE - scheduling for end of billing period');
      
      try {
        const subscriptionItemId = existingSubscription.items.data[0]?.id;
        
        if (!subscriptionItemId) {
          throw new Error('No subscription item found');
        }

        // Schedule the downgrade for the end of the current billing period
        const updatedSubscription = await stripe!.subscriptions.update(
          existingSubscription.id,
          {
            items: [{
              id: subscriptionItemId,
              price: priceId,
            }],
            proration_behavior: 'none',  // No proration/refund for downgrade
            billing_cycle_anchor: 'unchanged',  // Keep same billing date
            metadata: {
              userId,
              plan: newPlan,
              previousPlan: currentPlan,
              changeType: 'downgrade',
              scheduledAt: new Date().toISOString()
            }
          }
        );

        // Calculate when the downgrade takes effect
        const periodEnd = new Date((existingSubscription as any).current_period_end * 1000);
        
        // Store the pending downgrade info but DON'T change minutes yet
        // User keeps current plan benefits until period ends
        // The invoice.payment_succeeded webhook will apply the new limits
        
        console.log(`📆 [Subscription] Downgrade scheduled for ${periodEnd.toLocaleDateString()}`);
        console.log(`📝 [Subscription] User keeps ${currentPlan} benefits until then`);

        return res.json({
          success: true,
          type: 'downgrade_scheduled',
          plan: newPlan,
          currentPlan: currentPlan,
          effectiveDate: periodEnd.toISOString(),
          message: `Your plan will change to ${newPlan.charAt(0).toUpperCase() + newPlan.slice(1)} on ${periodEnd.toLocaleDateString()}. You'll keep your current ${currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)} plan benefits until then.`
        });

      } catch (error: any) {
        console.error('❌ [Subscription] Downgrade scheduling failed:', error);
        throw error;
      }
    }

    // Should not reach here
    return res.status(400).json({ 
      error: 'Invalid plan change',
      message: 'Unable to determine plan change type'
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

// POST /api/subscription/cancel - Cancel subscription
router.post('/cancel', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.user!.id;
    const user = await storage.getUserById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.stripeSubscriptionId) {
      return res.status(400).json({ 
        error: 'No active subscription',
        message: 'You do not have an active subscription to cancel.'
      });
    }

    if (!stripe) {
      return res.status(503).json({ 
        error: 'Service unavailable',
        message: 'Stripe is not configured' 
      });
    }

    console.log(`📉 [Subscription] Cancellation request for user ${userId} (${user.email})`);

    // Cancel at period end (standard behavior)
    // This allows the user to access the service until the paid period is over
    const subscription = await stripe.subscriptions.update(user.stripeSubscriptionId, {
      cancel_at_period_end: true
    });

    // Update local status immediately to reflect "active (canceling)"
    // We don't change to 'canceled' yet because they still have access
    // The webhook will handle the final status change when the period ends
    
    const periodEnd = new Date(subscription.current_period_end * 1000);
    
    console.log(`✅ [Subscription] Scheduled cancellation for ${periodEnd.toLocaleDateString()}`);

    res.json({
      success: true,
      status: 'canceled', // Frontend expects this status to show cancellation UI
      periodEnd: periodEnd.toISOString(),
      message: `Your subscription has been canceled. You will retain access until ${periodEnd.toLocaleDateString()}.`
    });

  } catch (error: any) {
    console.error('❌ [Subscription] Cancellation failed:', error);
    res.status(500).json({ 
      error: 'Failed to cancel subscription',
      message: error.message 
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
    
    // Check if there's a scheduled downgrade
    let scheduledPlanChange = null;
    if (user.stripeSubscriptionId && stripe) {
      try {
        const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
        const scheduledPlan = subscription.metadata?.plan;
        const currentDbPlan = user.subscriptionPlan;
        
        // If Stripe plan differs from DB plan, there's a pending change
        if (scheduledPlan && scheduledPlan !== currentDbPlan) {
          scheduledPlanChange = {
            newPlan: scheduledPlan,
            effectiveDate: new Date((subscription as any).current_period_end * 1000).toISOString()
          };
        }
      } catch (e) {
        // Ignore errors fetching subscription
      }
    }

    res.json({
      plan: user.subscriptionPlan || 'starter',
      status: user.subscriptionStatus || 'active',
      minutesUsed: minutesData.used,
      minutesLimit: minutesData.total,
      minutesRemaining: minutesData.remaining,
      bonusMinutes: user.bonusMinutes || 0,
      hasActiveSubscription: !!user.stripeSubscriptionId,
      scheduledPlanChange
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
