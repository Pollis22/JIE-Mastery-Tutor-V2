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

const router = Router();

const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeKey ? new Stripe(stripeKey, {
  apiVersion: "2025-08-27.basil",
}) : null;

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

    const { stripeCustomerId, stripeSubscriptionId } = user;

    // If user has active subscription, update it
    if (stripeSubscriptionId) {
      console.log('🔄 [Subscription] Updating existing subscription:', stripeSubscriptionId);
      
      try {
        const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
        
        const updatedSubscription = await stripe.subscriptions.update(
          stripeSubscriptionId,
          {
            items: [{
              id: subscription.items.data[0].id,
              price: priceId,
            }],
            proration_behavior: 'create_prorations',
          }
        );

        // Update database
        await storage.updateUserSubscription(
          userId,
          plan as 'starter' | 'standard' | 'pro',
          'active',
          plan === 'starter' ? 60 : plan === 'standard' ? 240 : 600
        );

        console.log('✅ [Subscription] Subscription updated successfully');

        return res.json({ 
          success: true,
          subscription: updatedSubscription.id,
          plan: plan
        });
      } catch (error: any) {
        console.error('❌ [Subscription] Error updating subscription:', error);
        // Fall through to create new checkout session
      }
    }

    // Create new subscription checkout
    console.log('🆕 [Subscription] Creating new subscription checkout');
    
    // Ensure we have or create a Stripe customer
    let customerId = stripeCustomerId;
    
    if (customerId) {
      try {
        await stripe.customers.retrieve(customerId);
        console.log('✅ Using existing Stripe customer:', customerId);
      } catch (error) {
        console.warn('⚠️ Invalid Stripe customer ID, creating new one');
        customerId = null;
      }
    }
    
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.parentName || user.username,
        metadata: { userId }
      });
      customerId = customer.id;
      await storage.updateUserStripeInfo(userId, customerId, null);
      console.log('✅ Created new Stripe customer:', customerId);
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    const session = await stripe.checkout.sessions.create({
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
