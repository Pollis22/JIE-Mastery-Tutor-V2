/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 * 
 * This source code is confidential and proprietary.
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */

import { Router } from 'express';
import { storage } from '../storage';
import { stripe } from '../services/stripe-service';
import { registrationTokenStore } from '../services/registration-tokens';
import { hashPassword } from '../auth';

const router = Router();

// POST /api/checkout/create-registration-session - Payment-first registration
router.post('/create-registration-session', async (req, res) => {
  try {
    const { plan, registrationData } = req.body;

    console.log('💳 [Registration Checkout] Creating session for plan:', plan);

    if (!plan || !registrationData) {
      return res.status(400).json({ error: 'Plan and registration data are required' });
    }

    if (!stripe) {
      return res.status(503).json({ 
        error: 'Subscription service unavailable',
        message: 'Stripe is not configured' 
      });
    }

    // Validate registration data structure
    const requiredFields = ['accountName', 'studentName', 'gradeLevel', 'email', 'password'];
    const missingFields = requiredFields.filter(field => !registrationData[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({ 
        error: 'Missing required registration fields',
        fields: missingFields 
      });
    }

    // Check for duplicate email before creating checkout
    const existingUser = await storage.getUserByEmail(registrationData.email.toLowerCase());
    if (existingUser) {
      return res.status(400).json({ 
        error: 'Email already registered',
        field: 'email'
      });
    }

    // Price ID mapping
    const priceIds: Record<string, string> = {
      starter: process.env.STRIPE_PRICE_STARTER || '',
      standard: process.env.STRIPE_PRICE_STANDARD || '',
      pro: process.env.STRIPE_PRICE_PRO || '',
      elite: process.env.STRIPE_PRICE_ELITE || '',
    };

    const priceId = priceIds[plan.toLowerCase()];
    if (!priceId) {
      return res.status(503).json({ 
        error: 'Subscription service temporarily unavailable',
        message: `Stripe pricing not configured for ${plan} plan`
      });
    }

    // Get base URL for redirect (production-safe)
    const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : process.env.REPLIT_DOMAINS 
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : `http://localhost:${process.env.PORT || 5000}`;
    
    console.log(`[Registration Checkout] Using base URL: ${baseUrl}`);

    // 🔒 SECURITY: Hash password before storing in database
    // This prevents storing plaintext passwords even temporarily
    const hashedPassword = await hashPassword(registrationData.password);
    const registrationToken = registrationTokenStore.generateToken();
    
    await registrationTokenStore.storeRegistrationData(registrationToken, {
      accountName: registrationData.accountName,
      studentName: registrationData.studentName,
      studentAge: registrationData.studentAge,
      gradeLevel: registrationData.gradeLevel,
      primarySubject: registrationData.primarySubject,
      email: registrationData.email,
      password: hashedPassword, // Store HASHED password only
      selectedPlan: plan.toLowerCase() as 'starter' | 'standard' | 'pro' | 'elite',
      marketingOptIn: registrationData.marketingOptIn,
    });

    // Only pass token to Stripe (NO sensitive data)
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      client_reference_id: registrationData.email, // Easy lookup
      line_items: [{
        price: priceId,
        quantity: 1 
      }],
      metadata: {
        type: 'registration',
        plan,
        registrationToken, // Only the token is stored in Stripe
        email: registrationData.email, // Safe to store (not secret)
      },
      subscription_data: {
        metadata: {
          type: 'registration',
          plan,
        }
      },
      success_url: `${baseUrl}/auth/registration-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/auth?registration=cancelled`,
      allow_promotion_codes: true,
    });

    console.log('✅ [Registration Checkout] Session created:', session.id);

    res.json({ 
      sessionId: session.id,
      url: session.url 
    });

  } catch (error: any) {
    console.error('❌ [Registration Checkout] Failed:', error);
    console.error('❌ [Registration Checkout] Error stack:', error.stack);
    console.error('❌ [Registration Checkout] Request body:', req.body);
    res.status(500).json({ 
      error: 'Failed to create registration checkout',
      message: error.message,
      details: error.stack
    });
  }
});

export default router;
