/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 * 
 * This source code is confidential and proprietary.
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */


import { Router, raw } from 'express';
import Stripe from 'stripe';
import { storage } from '../storage';
import { emailService } from '../services/email-service';
import { registrationTokenStore } from '../services/registration-tokens';

const router = Router();

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-08-27.basil",
    })
  : null;

// Webhook endpoint must use raw body for signature verification
router.post(
  '/webhook',
  raw({ type: 'application/json' }),
  async (req, res) => {
    if (!stripe) {
      console.error('[Stripe Webhook] Stripe not configured');
      return res.status(503).json({ error: 'Stripe not configured' });
    }

    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    if (!sig) {
      console.error('[Stripe Webhook] No signature found');
      return res.status(400).json({ error: 'No signature' });
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        webhookSecret
      );
    } catch (err: any) {
      console.error(`[Stripe Webhook] Signature verification failed:`, err.message);
      return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    console.log(`[Stripe Webhook] Received event: ${event.type}`);

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const userId = session.metadata?.userId;
          const type = session.metadata?.type;

          // Handle payment-first registration
          if (type === 'registration') {
            console.log('[Stripe Webhook] 🎉 Processing registration checkout');
            
            const plan = session.metadata?.plan;
            const registrationToken = session.metadata?.registrationToken;

            if (!plan || !registrationToken) {
              console.error('[Stripe Webhook] Missing plan or registration token in metadata');
              break;
            }

            // 🔒 SECURITY: Fetch registration data from database
            const registrationData = await registrationTokenStore.getRegistrationData(registrationToken);
            
            if (!registrationData) {
              console.error('[Stripe Webhook] Registration token not found or expired:', registrationToken.substring(0, 8));
              break;
            }

            const { email, password, accountName, studentName, gradeLevel, studentAge, primarySubject, marketingOptIn } = registrationData;

            if (!email || !password || !accountName) {
              console.error('[Stripe Webhook] Missing required registration data from token store');
              break;
            }

            // Check if user already exists (prevent duplicate accounts)
            const existingUser = await storage.getUserByEmail(email.toLowerCase());
            if (existingUser) {
              console.log('[Stripe Webhook] ⚠️ User already exists for email:', email);
              // Update their subscription instead
              await storage.updateUserStripeInfo(
                existingUser.id,
                session.customer as string,
                session.subscription as string
              );
              await storage.updateUserSubscription(
                existingUser.id,
                plan as 'starter' | 'standard' | 'pro',
                'active',
                plan === 'starter' ? 60 : plan === 'standard' ? 240 : 600
              );
              break;
            }

            // Auto-generate username from email
            const emailPrefix = email.split('@')[0].toLowerCase();
            const randomSuffix = Math.random().toString(36).substring(2, 8);
            const username = `${emailPrefix}_${randomSuffix}`;

            // Parse accountName into firstName/lastName
            const nameParts = accountName.trim().split(/\s+/);
            const firstName = nameParts[0] || accountName;
            const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

            // Map plan to monthly minutes
            const minutesMap: Record<string, number> = {
              'starter': 60,
              'standard': 240,
              'pro': 600,
              'elite': 1800,
            };
            const monthlyMinutes = minutesMap[plan] || 60;

            // Create user account AFTER successful payment
            // Password is already hashed when stored in registration_tokens table
            const newUser = await storage.createUser({
              email: email.toLowerCase(),
              username,
              password, // Already hashed by checkout route before storing in DB
              firstName,
              lastName,
              parentName: accountName,
              studentName,
              studentAge,
              gradeLevel,
              primarySubject,
              marketingOptInDate: marketingOptIn ? new Date() : null,
              emailVerified: true, // ✅ Auto-verify users who complete payment
              subscriptionPlan: plan as 'starter' | 'standard' | 'pro' | 'elite',
              subscriptionStatus: 'active',
              subscriptionMinutesLimit: monthlyMinutes,
              subscriptionMinutesUsed: 0,
              purchasedMinutesBalance: 0,
              billingCycleStart: new Date(),
            });

            // Update with Stripe customer and subscription IDs
            await storage.updateUserStripeInfo(
              newUser.id,
              session.customer as string,
              session.subscription as string
            );

            console.log('[Stripe Webhook] ✅ User account created:', newUser.email);

            // 🔒 SECURITY: Delete registration token from database after successful account creation
            await registrationTokenStore.deleteToken(registrationToken);

            // Send welcome email (non-blocking)
            const planNames: Record<string, string> = {
              'starter': 'Starter Family',
              'standard': 'Standard Family',
              'pro': 'Pro Family',
              'elite': 'Elite Family',
            };

            emailService.sendSubscriptionConfirmation({
              email: newUser.email,
              parentName: newUser.parentName || newUser.username,
              studentName: newUser.studentName || '',
              plan: planNames[plan] || plan,
              minutes: monthlyMinutes,
            }).catch(error => console.error('[Stripe Webhook] Welcome email failed:', error));

            // Send admin notification
            emailService.sendAdminNotification('New Registration (Paid)', {
              email: newUser.email,
              plan: planNames[plan] || plan,
              amount: session.amount_total ? session.amount_total / 100 : 0,
            }).catch(error => console.error('[Stripe Webhook] Admin notification failed:', error));

            break;
          }

          if (!userId) {
            console.error('[Stripe Webhook] Missing userId in checkout session');
            break;
          }

          // Handle minute top-up purchases (hybrid rollover policy)
          if (type === 'minute_topup') {
            const minutesToAdd = parseInt(session.metadata?.minutesToAdd || '0');
            
            if (minutesToAdd > 0) {
              const pricePaid = session.amount_total ? session.amount_total / 100 : 0; // Convert cents to dollars
              
              // Use new hybrid rollover system
              const { addPurchasedMinutes } = await import('../services/voice-minutes');
              await addPurchasedMinutes(userId, minutesToAdd, pricePaid);
              console.log(`[Stripe Webhook] Added ${minutesToAdd} purchased minutes (rollover) to user ${userId}`);
              
              // Send top-up confirmation email (non-blocking)
              const user = await storage.getUser(userId);
              if (user && user.parentName) {
                emailService.sendTopUpConfirmation({
                  email: user.email,
                  parentName: user.parentName,
                  minutesPurchased: minutesToAdd,
                }).catch(error => console.error('[Stripe Webhook] Top-up email failed:', error));
              }
            }
            break;
          }

          // Handle subscription checkout (new subscriptions AND upgrades/downgrades)
          const plan = session.metadata?.plan;
          if (!plan) {
            console.error('[Stripe Webhook] Missing plan in subscription checkout');
            break;
          }

          console.log(`[Stripe Webhook] Checkout completed for user ${userId}, plan: ${plan}`);
          
          // 🚨 CRITICAL: Handle plan changes - cancel previous subscription
          if (type === 'subscription_change') {
            const previousSubscriptionId = session.metadata?.previousSubscriptionId;
            const previousPlan = session.metadata?.previousPlan;
            
            console.log(`[Stripe Webhook] 🔄 Plan change detected: ${previousPlan} → ${plan}`);
            
            if (previousSubscriptionId && stripe) {
              try {
                // Cancel the old subscription immediately (no prorated refund - user is upgrading)
                await stripe.subscriptions.cancel(previousSubscriptionId);
                console.log(`[Stripe Webhook] ✅ Cancelled previous subscription: ${previousSubscriptionId}`);
              } catch (cancelError: any) {
                // Log but don't fail - subscription might already be cancelled
                console.warn(`[Stripe Webhook] ⚠️ Could not cancel previous subscription: ${cancelError.message}`);
              }
            }
          }

          // Map plan to monthly minutes and concurrent sessions
          const minutesMap: Record<string, number> = {
            'starter': 60,
            'standard': 240,
            'pro': 600,
            'elite': 1800,
          };
          
          const concurrentSessionsMap: Record<string, number> = {
            'starter': 1,
            'standard': 1,
            'pro': 1,
            'elite': 3, // Elite tier gets 3 concurrent voice tutoring sessions
          };

          const concurrentLoginsMap: Record<string, number> = {
            'starter': 1,
            'standard': 1,
            'pro': 1,
            'elite': 3, // Elite tier gets 3 concurrent device logins
          };

          const monthlyMinutes = minutesMap[plan] || 60;
          const maxConcurrentSessions = concurrentSessionsMap[plan] || 1;
          const maxConcurrentLogins = concurrentLoginsMap[plan] || 1;

          // Update subscription in database with customer and subscription IDs
          await storage.updateUserStripeInfo(
            userId,
            session.customer as string,
            session.subscription as string
          );

          // Update subscription status, plan, monthly minute allowance, and concurrent limits
          await storage.updateUserSubscription(
            userId,
            plan as 'starter' | 'standard' | 'pro' | 'elite',
            'active',
            monthlyMinutes,
            maxConcurrentSessions,
            maxConcurrentLogins
          );

          // Reset monthly usage counter
          await storage.resetUserVoiceUsage(userId);
          
          console.log(`[Stripe Webhook] Subscription activated for user ${userId}`);
          
          // Send subscription confirmation email (non-blocking)
          const user = await storage.getUser(userId);
          if (user && user.parentName && user.studentName) {
            const planNames: Record<string, string> = {
              'starter': 'Starter Family',
              'standard': 'Standard Family',
              'pro': 'Pro Family',
              'elite': 'Elite Family',
            };
            
            emailService.sendSubscriptionConfirmation({
              email: user.email,
              parentName: user.parentName,
              studentName: user.studentName,
              plan: planNames[plan] || plan,
              minutes: monthlyMinutes,
            }).catch(error => console.error('[Stripe Webhook] Subscription email failed:', error));
            
            // Send admin notification
            emailService.sendAdminNotification('New Subscription', {
              email: user.email,
              plan: planNames[plan] || plan,
              amount: session.amount_total ? session.amount_total / 100 : 0,
            }).catch(error => console.error('[Stripe Webhook] Admin notification failed:', error));
          }
          break;
        }

        case 'invoice.payment_succeeded': {
          const invoice = event.data.object as Stripe.Invoice;
          const customerId = invoice.customer as string;
          const subscriptionId = (invoice as any).subscription as string;

          // Find user by Stripe customer ID
          const user = await storage.getUserByStripeCustomerId(customerId);
          
          if (!user) {
            console.error(`[Stripe Webhook] User not found for customer ${customerId}`);
            break;
          }

          // Check if this invoice is for a subscription with a scheduled downgrade
          if (subscriptionId && stripe) {
            try {
              const subscription = await stripe.subscriptions.retrieve(subscriptionId);
              const changeType = subscription.metadata?.changeType;
              const scheduledPlan = subscription.metadata?.plan;
              
              // If this is a downgrade that was scheduled, NOW apply it
              if (changeType === 'downgrade' && scheduledPlan && scheduledPlan !== user.subscriptionPlan) {
                console.log(`[Stripe Webhook] 📉 APPLYING SCHEDULED DOWNGRADE: ${user.subscriptionPlan} → ${scheduledPlan}`);
                
                const planMinutes: Record<string, number> = {
                  'starter': 60,
                  'standard': 240,
                  'pro': 600,
                  'elite': 1800,
                };
                
                const newMinutes = planMinutes[scheduledPlan] || 60;
                
                // Apply the downgrade now
                await storage.updateUserSubscription(
                  user.id,
                  scheduledPlan as 'starter' | 'standard' | 'pro' | 'elite',
                  'active',
                  newMinutes,
                  scheduledPlan === 'elite' ? 3 : 1,
                  scheduledPlan === 'elite' ? 3 : 1
                );
                
                // Reset usage for new billing cycle
                await storage.resetUserVoiceUsage(user.id);
                
                // Clear the downgrade metadata (use empty strings, not null)
                await stripe.subscriptions.update(subscriptionId, {
                  metadata: {
                    userId: user.id,
                    plan: scheduledPlan,
                    changeType: '',  // Clear the scheduled flag
                    previousPlan: '',
                    scheduledAt: ''
                  }
                });
                
                console.log(`[Stripe Webhook] ✅ Downgrade applied: ${scheduledPlan} with ${newMinutes} minutes`);
                break;
              }
            } catch (e) {
              console.error('[Stripe Webhook] Error checking subscription for downgrade:', e);
            }
          }

          // Normal billing cycle - just reset minutes
          await storage.resetUserVoiceUsage(user.id);
          
          console.log(`[Stripe Webhook] Minutes reset for user ${user.id} after payment`);
          break;
        }

        case 'customer.subscription.updated': {
          const subscription = event.data.object as Stripe.Subscription;
          const customerId = subscription.customer as string;

          // Find user by Stripe customer ID
          const user = await storage.getUserByStripeCustomerId(customerId);
          
          if (!user) {
            console.error(`[Stripe Webhook] User not found for customer ${customerId}`);
            break;
          }

          // Update subscription status
          const status = subscription.status === 'active' ? 'active' : 
                        subscription.status === 'canceled' ? 'canceled' : 'paused';
          
          // Detect plan change using both current price and previous_attributes
          const currentPriceId = subscription.items.data[0]?.price.id;
          const previousAttributes = (event.data as any).previous_attributes;
          const previousPriceId = previousAttributes?.items?.data?.[0]?.price?.id;
          
          const priceToPlans: Record<string, { plan: string; minutes: number }> = {
            [process.env.STRIPE_PRICE_STARTER || '']: { plan: 'starter', minutes: 60 },
            [process.env.STRIPE_PRICE_STANDARD || '']: { plan: 'standard', minutes: 240 },
            [process.env.STRIPE_PRICE_PRO || '']: { plan: 'pro', minutes: 600 },
            [process.env.STRIPE_PRICE_ELITE || '']: { plan: 'elite', minutes: 1800 },
          };

          const newPlanInfo = priceToPlans[currentPriceId];
          const currentPlan = user.subscriptionPlan || 'starter';
          const currentMinutesLimit = user.subscriptionMinutesLimit || 60;
          const usedMinutes = user.subscriptionMinutesUsed || 0;
          const remainingMinutes = Math.max(0, currentMinutesLimit - usedMinutes);

          // Detect plan change: either price ID changed or new price differs from user's stored plan
          const priceChanged = previousPriceId && previousPriceId !== currentPriceId;
          const planMismatch = newPlanInfo && newPlanInfo.plan !== currentPlan;
          
          if (newPlanInfo && (priceChanged || planMismatch)) {
            // Plan change detected via webhook
            console.log(`[Stripe Webhook] Plan change detected: ${currentPlan} → ${newPlanInfo.plan}`);
            console.log(`[Stripe Webhook] Detection method: priceChanged=${priceChanged}, planMismatch=${planMismatch}`);

            // Compare against user's ACTUAL current limit, not the plan's default
            const isUpgrade = newPlanInfo.minutes > currentMinutesLimit;
            const isDowngrade = newPlanInfo.minutes < currentMinutesLimit;
            
            // Check metadata for scheduled downgrade
            const changeType = subscription.metadata?.changeType;
            
            // 🚨 CRITICAL: For downgrades, DON'T apply immediately
            // User keeps current plan until billing cycle ends
            // The invoice.payment_succeeded webhook will apply the new limits
            if (isDowngrade && changeType === 'downgrade') {
              console.log(`[Stripe Webhook] 📉 DOWNGRADE SCHEDULED - keeping current plan until billing cycle ends`);
              console.log(`[Stripe Webhook] Current: ${currentPlan} (${currentMinutesLimit} min), Scheduled: ${newPlanInfo.plan} (${newPlanInfo.minutes} min)`);
              // Don't update the database - user keeps current limits
              break;
            }

            let finalMinutesLimit: number;

            if (isUpgrade) {
              // UPGRADE: Add remaining minutes to new tier's allocation
              finalMinutesLimit = newPlanInfo.minutes + remainingMinutes;
              console.log(`[Stripe Webhook] 📈 UPGRADE: ${remainingMinutes} remaining + ${newPlanInfo.minutes} new = ${finalMinutesLimit} total`);
            } else if (isDowngrade) {
              // DOWNGRADE without scheduled flag (e.g., via Stripe dashboard) - apply immediately
              finalMinutesLimit = newPlanInfo.minutes;
              console.log(`[Stripe Webhook] 📉 IMMEDIATE DOWNGRADE: limit capped to ${newPlanInfo.minutes}, used=${usedMinutes}`);
            } else {
              // Same tier minutes but different plan name
              finalMinutesLimit = newPlanInfo.minutes;
            }

            // Use proper plan change handler that handles upgrade/downgrade correctly
            await storage.handleSubscriptionPlanChange(
              user.id,
              newPlanInfo.plan as 'starter' | 'standard' | 'pro' | 'elite',
              finalMinutesLimit,
              isUpgrade,
              usedMinutes
            );

            console.log(`[Stripe Webhook] Plan updated: ${newPlanInfo.plan}, minutes: ${finalMinutesLimit}`);
          } else {
            // Status change only (no plan change)
            await storage.updateUserSubscription(
              user.id, 
              (currentPlan) as 'starter' | 'standard' | 'pro' | 'single' | 'all', 
              status
            );
            
            console.log(`[Stripe Webhook] Subscription status update: ${subscription.status} for user ${user.id}`);
          }
          break;
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription;
          const customerId = subscription.customer as string;

          // Find user by Stripe customer ID
          const user = await storage.getUserByStripeCustomerId(customerId);
          
          if (!user) {
            console.error(`[Stripe Webhook] User not found for customer ${customerId}`);
            break;
          }

          // Cancel subscription
          await storage.updateUserSubscription(
            user.id, 
            (user.subscriptionPlan || 'starter') as 'starter' | 'standard' | 'pro' | 'single' | 'all', 
            'canceled'
          );
          
          console.log(`[Stripe Webhook] Subscription canceled for user ${user.id}`);
          break;
        }

        default:
          console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error: any) {
      console.error(`[Stripe Webhook] Error processing event:`, error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }
);

export default router;
