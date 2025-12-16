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
import { emailService } from '../services/email-service';

// Plan pricing for email notifications
const PLAN_PRICES: Record<string, number> = {
  'starter': 9.99,
  'standard': 19.99,
  'pro': 39.99,
  'elite': 79.99,
};

// Plan display names
const PLAN_NAMES: Record<string, string> = {
  'starter': 'Starter Family',
  'standard': 'Standard Family',
  'pro': 'Pro Family',
  'elite': 'Elite Family',
};

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

        // Send upgrade emails
        const oldPlanName = PLAN_NAMES[currentPlan] || currentPlan;
        const newPlanName = PLAN_NAMES[newPlan] || newPlan;
        const oldMinutes = PLAN_MINUTES[currentPlan] || 60;
        const oldPrice = PLAN_PRICES[currentPlan] || 9.99;
        const newPrice = PLAN_PRICES[newPlan] || 9.99;
        const proratedCharge = Math.max(0, newPrice - oldPrice);
        const firstName = user.parentName?.split(' ')[0] || user.firstName || 'Customer';
        
        // Send customer upgrade email
        emailService.sendUpgradeEmail({
          email: user.email,
          firstName,
          oldPlan: oldPlanName,
          newPlan: newPlanName,
          oldMinutes,
          newMinutes,
          proratedCharge
        }).catch(err => console.error('[Subscription] Failed to send upgrade email:', err));
        
        // Send admin upgrade email
        emailService.sendAdminUpgradeEmail({
          email: user.email,
          userName: user.parentName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || 'Unknown',
          oldPlan: oldPlanName,
          newPlan: newPlanName,
          oldPrice,
          newPrice,
          proratedCharge,
          monthlyIncrease: newPrice - oldPrice
        }).catch(err => console.error('[Subscription] Failed to send admin upgrade email:', err));

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
        // Note: With proration_behavior: 'none', Stripe applies the new price at the next billing cycle
        const updatedSubscription = await stripe!.subscriptions.update(
          existingSubscription.id,
          {
            items: [{
              id: subscriptionItemId,
              price: priceId,
            }],
            proration_behavior: 'none',  // No proration/refund for downgrade - change applies at next billing
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

        // Send downgrade emails
        const currentPlanName = PLAN_NAMES[currentPlan] || currentPlan;
        const newPlanName = PLAN_NAMES[newPlan] || newPlan;
        const currentMinutes = PLAN_MINUTES[currentPlan] || 60;
        const newMinutes = PLAN_MINUTES[newPlan] || 60;
        const oldPrice = PLAN_PRICES[currentPlan] || 9.99;
        const newPrice = PLAN_PRICES[newPlan] || 9.99;
        const effectiveDateFormatted = periodEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        const firstName = user.parentName?.split(' ')[0] || user.firstName || 'Customer';
        
        // Send customer downgrade email
        emailService.sendDowngradeEmail({
          email: user.email,
          firstName,
          currentPlan: currentPlanName,
          newPlan: newPlanName,
          currentMinutes,
          newMinutes,
          effectiveDate: effectiveDateFormatted
        }).catch(err => console.error('[Subscription] Failed to send downgrade email:', err));
        
        // Send admin downgrade email
        emailService.sendAdminDowngradeEmail({
          email: user.email,
          userName: user.parentName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || 'Unknown',
          oldPlan: currentPlanName,
          newPlan: newPlanName,
          oldPrice,
          newPrice,
          effectiveDate: effectiveDateFormatted,
          monthlyDecrease: oldPrice - newPrice
        }).catch(err => console.error('[Subscription] Failed to send admin downgrade email:', err));

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

// POST /api/subscription/cancel - Cancel subscription at period end
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

    console.log(`[Subscription] Cancel request for user ${userId}:`, {
      stripeSubscriptionId: user.stripeSubscriptionId,
      subscriptionStatus: user.subscriptionStatus,
      subscriptionPlan: user.subscriptionPlan
    });

    if (!user.stripeSubscriptionId) {
      // User has no Stripe subscription ID - this could be a data inconsistency
      // If they have an active status, we should set them to inactive since there's nothing to cancel
      if (user.subscriptionStatus === 'active') {
        console.log(`[Subscription] User ${userId} has active status but no Stripe subscription - setting to inactive`);
        await storage.updateUserSettings(userId, {
          subscriptionStatus: 'inactive',
          subscriptionEndsAt: null,
          subscriptionMinutesLimit: 0,
          subscriptionMinutesUsed: 0
        });
        return res.status(400).json({ 
          error: 'No subscription found', 
          message: 'Your account was not linked to a subscription. Status has been updated. Please subscribe to access tutoring features.'
        });
      }
      return res.status(400).json({ error: 'No active subscription to cancel' });
    }

    if (user.subscriptionStatus === 'canceled') {
      return res.status(400).json({ error: 'Subscription already canceled' });
    }

    if (user.subscriptionStatus === 'inactive') {
      return res.status(400).json({ error: 'Subscription already expired' });
    }

    if (!stripe) {
      return res.status(503).json({ error: 'Stripe not configured' });
    }

    // First verify the subscription exists in Stripe
    let stripeSubscription;
    try {
      stripeSubscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
    } catch (stripeError: any) {
      console.error(`[Subscription] Could not find Stripe subscription ${user.stripeSubscriptionId}:`, stripeError.message);
      
      // Subscription doesn't exist in Stripe - clean up our database
      if (stripeError.code === 'resource_missing') {
        await storage.updateUserSettings(userId, {
          subscriptionStatus: 'inactive',
          stripeSubscriptionId: null,
          subscriptionEndsAt: null
        });
        return res.status(400).json({ 
          error: 'Subscription not found',
          message: 'Your subscription could not be found. It may have already been canceled. Please subscribe again to continue.'
        });
      }
      throw stripeError;
    }

    // Check if already canceled in Stripe
    if (stripeSubscription.cancel_at_period_end) {
      const endsAt = new Date((stripeSubscription as any).current_period_end * 1000);
      // Update our database to match
      await storage.updateUserSettings(userId, {
        subscriptionStatus: 'canceled',
        subscriptionEndsAt: endsAt
      });
      return res.json({
        success: true,
        message: 'Subscription was already scheduled to cancel',
        accessUntil: endsAt.toISOString(),
        accessUntilFormatted: endsAt.toLocaleDateString('en-US', { 
          month: 'long', day: 'numeric', year: 'numeric' 
        })
      });
    }

    // Cancel at period end (NOT immediately)
    const subscription = await stripe.subscriptions.update(
      user.stripeSubscriptionId,
      { cancel_at_period_end: true }
    );

    const endsAt = new Date((subscription as any).current_period_end * 1000);

    // Update database with canceled status and end date
    await storage.updateUserSettings(userId, {
      subscriptionStatus: 'canceled',
      subscriptionEndsAt: endsAt
    });

    console.log(`🚫 [Subscription] User ${userId} canceled - access until ${endsAt.toISOString()}`);

    // Send cancellation emails (don't await to not block response)
    const planName = PLAN_NAMES[user.subscriptionPlan || 'starter'] || user.subscriptionPlan || 'Subscription';
    const planPrice = PLAN_PRICES[user.subscriptionPlan || 'starter'] || 9.99;
    const accessEndDate = endsAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const firstName = user.parentName?.split(' ')[0] || user.firstName || 'Customer';
    
    // Send customer email
    emailService.sendCancellationEmailToUser({
      email: user.email,
      firstName,
      planName,
      accessEndDate
    }).catch(err => console.error('[Subscription] Failed to send customer cancellation email:', err));
    
    // Send admin email
    emailService.sendCancellationEmailToAdmin({
      userEmail: user.email,
      userName: user.parentName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || 'Unknown',
      planName,
      planPrice,
      accessEndDate
    }).catch(err => console.error('[Subscription] Failed to send admin cancellation email:', err));

    res.json({
      success: true,
      message: 'Subscription canceled',
      accessUntil: endsAt.toISOString(),
      accessUntilFormatted: accessEndDate
    });

  } catch (error: any) {
    console.error('❌ [Subscription] Cancel error:', error);
    
    // Provide more specific error messages
    if (error.type === 'StripeInvalidRequestError') {
      return res.status(400).json({ 
        error: 'Subscription error',
        message: 'There was an issue with your subscription. Please contact support.'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to cancel subscription',
      message: error.message 
    });
  }
});

// POST /api/subscription/reactivate - Reactivate a canceled or expired subscription
router.post('/reactivate', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.user!.id;
    const { planId } = req.body;

    const user = await storage.getUserById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!stripe) {
      return res.status(503).json({ error: 'Stripe not configured' });
    }

    // If user already has active subscription, use change endpoint instead
    if (user.subscriptionStatus === 'active') {
      return res.status(400).json({ 
        error: 'Already have active subscription',
        message: 'Use the plan change option to switch plans'
      });
    }

    // If subscription is canceled but not expired, just remove the scheduled cancellation
    if (user.subscriptionStatus === 'canceled' && user.stripeSubscriptionId) {
      try {
        // Remove the scheduled cancellation
        await stripe.subscriptions.update(
          user.stripeSubscriptionId,
          { cancel_at_period_end: false }
        );

        await storage.updateUserSettings(userId, {
          subscriptionStatus: 'active',
          subscriptionEndsAt: null
        });

        console.log(`✅ [Subscription] User ${userId} reactivated existing subscription`);

        // Send reactivation emails
        const planName = PLAN_NAMES[user.subscriptionPlan || 'starter'] || user.subscriptionPlan || 'Subscription';
        const planPrice = PLAN_PRICES[user.subscriptionPlan || 'starter'] || 9.99;
        const minutes = PLAN_MINUTES[user.subscriptionPlan || 'starter'] || 60;
        const firstName = user.parentName?.split(' ')[0] || user.firstName || 'Customer';
        
        // Send customer reactivation email
        emailService.sendReactivationEmail({
          email: user.email,
          firstName,
          planName,
          minutes
        }).catch(err => console.error('[Subscription] Failed to send reactivation email:', err));
        
        // Send admin reactivation email
        emailService.sendAdminReactivationEmail({
          userEmail: user.email,
          userName: user.parentName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || 'Unknown',
          planName,
          planPrice,
          reactivationType: 'undo_cancellation'
        }).catch(err => console.error('[Subscription] Failed to send admin reactivation email:', err));

        return res.json({
          success: true,
          message: 'Subscription reactivated! Your subscription will continue as normal.',
          type: 'reactivated'
        });
      } catch (stripeError: any) {
        // Subscription might be fully deleted, need to create new one
        console.log('[Subscription] Could not reactivate existing, will create new:', stripeError.message);
      }
    }

    // For inactive users or failed reactivation, redirect to checkout with a plan
    // They need to go through checkout to create a new subscription
    const targetPlan = planId || user.subscriptionPlan || 'starter';
    
    // Price ID mapping
    const priceIds: Record<string, string> = {
      starter: process.env.STRIPE_PRICE_STARTER || '',
      standard: process.env.STRIPE_PRICE_STANDARD || '',
      pro: process.env.STRIPE_PRICE_PRO || '',
      elite: process.env.STRIPE_PRICE_ELITE || '',
    };

    const priceId = priceIds[targetPlan];
    if (!priceId) {
      return res.status(400).json({ 
        error: 'Invalid plan',
        message: 'Please select a valid subscription plan'
      });
    }

    // Ensure we have a Stripe customer
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.parentName || user.username,
        metadata: { userId }
      });
      customerId = customer.id;
      await storage.updateUserStripeInfo(userId, customerId, null);
    }

    // Create checkout session for new subscription
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ 
        price: priceId, 
        quantity: 1 
      }],
      metadata: {
        userId,
        plan: targetPlan,
        type: 'reactivation',
      },
      subscription_data: {
        metadata: {
          userId,
          plan: targetPlan
        }
      },
      success_url: `${baseUrl}/dashboard?subscription=reactivated&plan=${targetPlan}`,
      cancel_url: `${baseUrl}/dashboard?subscription=cancelled`,
      allow_promotion_codes: true,
    });

    console.log(`🔄 [Subscription] User ${userId} starting reactivation checkout for ${targetPlan}`);

    res.json({
      success: true,
      type: 'checkout',
      sessionId: session.id,
      url: session.url,
      message: 'Please complete checkout to reactivate your subscription'
    });

  } catch (error: any) {
    console.error('❌ [Subscription] Reactivation error:', error);
    
    if (error.type === 'StripeCardError') {
      return res.status(400).json({ 
        error: 'Payment failed', 
        message: error.message 
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to reactivate subscription',
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
      status: user.subscriptionStatus || 'inactive',
      subscriptionEndsAt: user.subscriptionEndsAt?.toISOString(),
      minutesUsed: minutesData.used,
      minutesLimit: minutesData.total,
      minutesRemaining: minutesData.remaining,
      bonusMinutes: user.bonusMinutes || 0,
      hasActiveSubscription: !!user.stripeSubscriptionId,
      scheduledPlanChange,
      canUseVoice: user.subscriptionStatus === 'active' || 
                   user.subscriptionStatus === 'trialing' ||
                   (user.subscriptionStatus === 'canceled' && user.subscriptionEndsAt && new Date(user.subscriptionEndsAt) > new Date())
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
