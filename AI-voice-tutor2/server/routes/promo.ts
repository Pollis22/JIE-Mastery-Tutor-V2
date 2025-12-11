/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 * 
 * This source code is confidential and proprietary.
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */

import { Router } from 'express';
import { stripe } from '../services/stripe-service';

const router = Router();

// POST /api/promo/validate - Validate a promo code
router.post('/validate', async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ valid: false, error: 'Promo code required' });
    }
    
    if (!stripe) {
      return res.status(503).json({ valid: false, error: 'Payment service unavailable' });
    }
    
    // Search for the promotion code in Stripe
    const promoCodes = await stripe.promotionCodes.list({
      code: code.toUpperCase().trim(),
      active: true,
      limit: 1,
    });
    
    if (promoCodes.data.length === 0) {
      return res.status(400).json({ valid: false, error: 'Invalid or expired promo code' });
    }
    
    const promo = promoCodes.data[0];
    const coupon = promo.coupon;
    
    // Check if coupon is still valid
    if (!coupon.valid) {
      return res.status(400).json({ valid: false, error: 'This promo code has expired' });
    }
    
    // Build discount description
    let discountText = '';
    if (coupon.percent_off) {
      discountText = `${coupon.percent_off}% off`;
    } else if (coupon.amount_off) {
      discountText = `$${(coupon.amount_off / 100).toFixed(2)} off`;
    }
    
    // Add duration info
    if (coupon.duration === 'once') {
      discountText += ' your first month';
    } else if (coupon.duration === 'repeating' && coupon.duration_in_months) {
      discountText += ` for ${coupon.duration_in_months} months`;
    } else if (coupon.duration === 'forever') {
      discountText += ' forever';
    }
    
    console.log(`[Promo] ✅ Valid promo code: ${code} - ${discountText}`);
    
    res.json({
      valid: true,
      promoCodeId: promo.id,
      code: promo.code,
      discount: discountText,
      percentOff: coupon.percent_off || null,
      amountOff: coupon.amount_off ? coupon.amount_off / 100 : null,
      duration: coupon.duration,
      durationInMonths: coupon.duration_in_months || null,
    });
    
  } catch (error: any) {
    console.error('[Promo] Validation error:', error.message);
    res.status(500).json({ valid: false, error: 'Failed to validate promo code' });
  }
});

// GET /api/promo/check/:code - Quick check if a promo code exists (for inline validation)
router.get('/check/:code', async (req, res) => {
  try {
    const { code } = req.params;
    
    if (!code || !stripe) {
      return res.json({ valid: false });
    }
    
    const promoCodes = await stripe.promotionCodes.list({
      code: code.toUpperCase().trim(),
      active: true,
      limit: 1,
    });
    
    if (promoCodes.data.length === 0) {
      return res.json({ valid: false });
    }
    
    const promo = promoCodes.data[0];
    const coupon = promo.coupon;
    
    res.json({
      valid: coupon.valid,
      percentOff: coupon.percent_off || null,
      amountOff: coupon.amount_off ? coupon.amount_off / 100 : null,
    });
    
  } catch (error) {
    res.json({ valid: false });
  }
});

export default router;
