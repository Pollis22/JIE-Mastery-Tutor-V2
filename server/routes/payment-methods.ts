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

const router = Router();

// Initialize Stripe if configured
const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeKey ? new Stripe(stripeKey, {
  apiVersion: "2025-08-27.basil",
}) : null;

// GET /api/payment-methods - List user's payment methods
router.get('/', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = req.user as any;

    if (!stripe) {
      return res.json([]); // Return empty array if Stripe not configured
    }

    if (!user.stripeCustomerId) {
      return res.json([]); // No payment methods if no customer
    }

    // Fetch payment methods from Stripe
    const paymentMethods = await stripe.paymentMethods.list({
      customer: user.stripeCustomerId,
      type: 'card',
    });

    // Format for frontend
    const formatted = paymentMethods.data.map(pm => ({
      id: pm.id,
      brand: pm.card?.brand || 'card',
      last4: pm.card?.last4 || '****',
      expMonth: pm.card?.exp_month,
      expYear: pm.card?.exp_year,
      isDefault: pm.id === user.defaultPaymentMethodId,
    }));

    res.json(formatted);

  } catch (error: any) {
    console.error('❌ [PaymentMethods] List error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch payment methods',
      message: error.message 
    });
  }
});

// POST /api/payment-methods/add - Add new payment method (redirect to Stripe)
router.post('/add', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!stripe) {
      return res.status(503).json({ 
        error: 'Payment service unavailable',
        message: 'Stripe is not configured' 
      });
    }

    const user = req.user as any;
    let customerId = user.stripeCustomerId;

    // Create customer if doesn't exist
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.parentName || user.studentName || user.firstName || 'User',
        metadata: {
          userId: user.id,
        },
      });
      customerId = customer.id;

      // Save customer ID to database
      const { storage } = await import('../storage');
      await storage.updateUserStripeInfo(user.id, customerId, null);
    }

    // Create setup session for adding payment method
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'setup',
      payment_method_types: ['card'],
      success_url: `${baseUrl}/dashboard?tab=payments&setup=success`,
      cancel_url: `${baseUrl}/dashboard?tab=payments`,
      metadata: {
        userId: user.id,
        action: 'add_payment_method',
      },
    });

    res.json({ url: session.url });

  } catch (error: any) {
    console.error('❌ [PaymentMethods] Add error:', error);
    res.status(500).json({ 
      error: 'Failed to add payment method',
      message: error.message 
    });
  }
});

// DELETE /api/payment-methods/:id - Remove payment method
router.delete('/:id', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!stripe) {
      return res.status(503).json({ 
        error: 'Payment service unavailable' 
      });
    }

    const { id: methodId } = req.params;
    const user = req.user as any;

    // Verify the payment method belongs to this customer
    const paymentMethod = await stripe.paymentMethods.retrieve(methodId);
    
    if (paymentMethod.customer !== user.stripeCustomerId) {
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'This payment method does not belong to you' 
      });
    }

    // Detach the payment method
    await stripe.paymentMethods.detach(methodId);

    res.json({ success: true });

  } catch (error: any) {
    console.error('❌ [PaymentMethods] Remove error:', error);
    res.status(500).json({ 
      error: 'Failed to remove payment method',
      message: error.message 
    });
  }
});

// POST /api/payment-methods/:id/default - Set as default payment method
router.post('/:id/default', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!stripe) {
      return res.status(503).json({ 
        error: 'Payment service unavailable' 
      });
    }

    const { id: methodId } = req.params;
    const user = req.user as any;

    if (!user.stripeCustomerId) {
      return res.status(400).json({ 
        error: 'No Stripe customer found' 
      });
    }

    // Update default payment method for the customer
    await stripe.customers.update(user.stripeCustomerId, {
      invoice_settings: {
        default_payment_method: methodId,
      },
    });

    // If user has active subscriptions, update them too
    if (user.stripeSubscriptionId) {
      await stripe.subscriptions.update(user.stripeSubscriptionId, {
        default_payment_method: methodId,
      });
    }

    res.json({ success: true });

  } catch (error: any) {
    console.error('❌ [PaymentMethods] Set default error:', error);
    res.status(500).json({ 
      error: 'Failed to set default payment method',
      message: error.message 
    });
  }
});

export default router;