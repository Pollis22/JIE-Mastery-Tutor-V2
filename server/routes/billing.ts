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
import { getUserMinuteBalance } from '../services/voice-minutes';

const router = Router();

// Initialize Stripe if configured
const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeKey ? new Stripe(stripeKey, {
  apiVersion: "2025-08-27.basil",
}) : null;

// Plan labels for display
const planLabels: Record<string, string> = {
  starter: 'Starter Family',
  standard: 'Standard Family',
  pro: 'Pro Family',
  elite: 'Elite Family',
};

// GET /api/billing/entitlements - Get computed entitlements for current user
router.get('/entitlements', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = req.user as any;
    
    // Debug: Log user trial fields to diagnose field naming
    console.log('[Billing] User trial fields:', {
      id: user.id,
      trialActive: user.trialActive,
      trial_active: user.trial_active,
      trialMinutesTotal: user.trialMinutesTotal,
      subscriptionPlan: user.subscriptionPlan,
      subscriptionStatus: user.subscriptionStatus,
    });
    
    const balance = await getUserMinuteBalance(user.id);

    // Determine plan type and label - check both camelCase and snake_case
    const isTrialUser = user.trialActive || user.trial_active;
    const trialStarted = user.trialStartedAt || user.trial_started_at;
    const isEmailVerified = user.emailVerified || user.email_verified;
    
    let planType: 'trial' | 'paid' | 'free';
    let planLabel: string;
    let canPurchaseTopups = false;
    let canStartSession = true;
    let resetsAt: string | undefined;

    if (isTrialUser) {
      // TRIAL USER
      planType = 'trial';
      planLabel = '30-Minute Trial';
      canPurchaseTopups = false; // Trial users should upgrade, not buy topups
      canStartSession = balance.totalAvailable > 0 && isEmailVerified;
      
      // Trial "expires" 30 days after start
      if (trialStarted) {
        const expiry = new Date(trialStarted);
        expiry.setDate(expiry.getDate() + 30);
        resetsAt = expiry.toISOString();
      }
    } else if (user.subscriptionPlan && user.subscriptionStatus === 'active') {
      // PAID USER
      planType = 'paid';
      planLabel = planLabels[user.subscriptionPlan] || `${user.subscriptionPlan} Plan`;
      canPurchaseTopups = true;
      canStartSession = balance.totalAvailable > 0;
      resetsAt = balance.resetDate?.toISOString();
    } else {
      // FREE/INACTIVE USER
      planType = 'free';
      planLabel = 'No Active Plan';
      canPurchaseTopups = false;
      canStartSession = false;
    }

    const entitlements = {
      planLabel,
      planType,
      minutesTotal: balance.subscriptionLimit,
      minutesUsed: balance.subscriptionUsed,
      minutesRemaining: balance.totalAvailable,
      purchasedMinutes: balance.purchasedMinutes,
      resetsAt,
      canPurchaseTopups,
      canStartSession,
      // Additional context
      subscriptionStatus: user.subscriptionStatus,
      emailVerified: isEmailVerified || false,
    };

    console.log('[Billing] Entitlements for', user.email, ':', entitlements);
    res.json(entitlements);

  } catch (error: any) {
    console.error('❌ [Billing] Entitlements error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch entitlements',
      message: error.message 
    });
  }
});

// GET /api/billing/history - Get billing history
router.get('/history', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = req.user as any;

    if (!stripe || !user.stripeCustomerId) {
      return res.json([]); // Return empty array if no billing history
    }

    // Fetch invoices from Stripe
    const invoices = await stripe.invoices.list({
      customer: user.stripeCustomerId,
      limit: 20,
    });

    // Format for frontend
    const history = invoices.data.map(invoice => ({
      id: invoice.id,
      date: new Date(invoice.created * 1000).toISOString(),
      amount: invoice.amount_paid,
      status: invoice.status,
      description: invoice.lines.data[0]?.description || 'Subscription',
      invoiceUrl: invoice.hosted_invoice_url,
      pdfUrl: invoice.invoice_pdf,
    }));

    res.json(history);

  } catch (error: any) {
    console.error('❌ [Billing] History error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch billing history',
      message: error.message 
    });
  }
});

export default router;