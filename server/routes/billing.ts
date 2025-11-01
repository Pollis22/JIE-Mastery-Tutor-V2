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