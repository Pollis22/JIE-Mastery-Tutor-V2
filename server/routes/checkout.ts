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

    const normalizedEmail = registrationData.email.toLowerCase().trim();

    // Check for duplicate email before creating checkout
    const existingUser = await storage.getUserByEmail(normalizedEmail);
    if (existingUser) {
      console.log(`[Registration] Blocked: Email ${normalizedEmail} already registered in database`);
      return res.status(409).json({ 
        error: 'Email already registered',
        code: 'EMAIL_EXISTS',
        message: 'An account with this email already exists. Please log in or reset your password.',
        field: 'email'
      });
    }

    // Check Stripe for existing customer and reuse to prevent customer duplication
    let existingStripeCustomerId: string | null = null;
    
    try {
      const existingCustomers = await stripe.customers.list({
        email: normalizedEmail,
        limit: 1
      });

      if (existingCustomers.data.length > 0) {
        const existingCustomer = existingCustomers.data[0];
        console.log(`[Registration] Found existing Stripe customer: ${existingCustomer.id} for ${normalizedEmail}`);

        // Check for any subscription (not just active)
        const existingSubs = await stripe.subscriptions.list({
          customer: existingCustomer.id,
          limit: 1
        });

        if (existingSubs.data.length > 0) {
          const sub = existingSubs.data[0];
          
          if (sub.status === 'active' || sub.status === 'trialing') {
            console.log(`[Registration] Blocked: Stripe customer ${existingCustomer.id} has ${sub.status} subscription`);
            return res.status(409).json({
              error: 'Active subscription exists',
              code: 'SUBSCRIPTION_EXISTS',
              message: 'This email already has an active subscription. Please log in to manage your account.',
              field: 'email'
            });
          } else if (sub.status === 'past_due') {
            console.log(`[Registration] Blocked: Stripe customer ${existingCustomer.id} has past_due subscription`);
            return res.status(409).json({
              error: 'Subscription payment issue',
              code: 'SUBSCRIPTION_PAST_DUE',
              message: 'This email has a subscription with a payment issue. Please log in to update your payment method.',
              field: 'email'
            });
          }
          // Allow for canceled, unpaid, or other inactive states - user may be re-subscribing
          console.log(`[Registration] Re-subscribing: Reusing Stripe customer ${existingCustomer.id} (subscription status: ${sub.status})`);
        }
        
        // Reuse existing Stripe customer to prevent duplication
        existingStripeCustomerId = existingCustomer.id;
        console.log(`[Registration] Will reuse existing Stripe customer: ${existingStripeCustomerId}`);
      }
    } catch (stripeError: any) {
      console.error('[Registration] Stripe customer check failed:', stripeError.message);
      // Don't block registration if Stripe check fails - gracefully continue
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

    // Create checkout session - reuse existing customer if available
    const sessionConfig: any = {
      mode: 'subscription',
      payment_method_types: ['card'],
      client_reference_id: normalizedEmail, // Easy lookup
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
    };
    
    // CRITICAL: Reuse existing Stripe customer to prevent duplicate customers
    if (existingStripeCustomerId) {
      sessionConfig.customer = existingStripeCustomerId;
      console.log(`[Registration] Using existing customer ID: ${existingStripeCustomerId}`);
    } else {
      sessionConfig.customer_email = normalizedEmail;
      console.log(`[Registration] Creating new customer for: ${normalizedEmail}`);
    }
    
    const session = await stripe.checkout.sessions.create(sessionConfig);

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
