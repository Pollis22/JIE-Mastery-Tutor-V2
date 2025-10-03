import { Router, raw } from 'express';
import Stripe from 'stripe';
import { storage } from '../storage';

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

          if (!userId) {
            console.error('[Stripe Webhook] Missing userId in checkout session');
            break;
          }

          // Handle minute top-up purchases
          if (type === 'minute_topup') {
            const minutesToAdd = parseInt(session.metadata?.minutesToAdd || '0');
            
            if (minutesToAdd > 0) {
              await storage.addBonusMinutes(userId, minutesToAdd);
              console.log(`[Stripe Webhook] Added ${minutesToAdd} bonus minutes to user ${userId}`);
            }
            break;
          }

          // Handle subscription checkout
          const plan = session.metadata?.plan;
          if (!plan) {
            console.error('[Stripe Webhook] Missing plan in subscription checkout');
            break;
          }

          console.log(`[Stripe Webhook] Checkout completed for user ${userId}, plan: ${plan}`);

          // Map plan to monthly minutes
          const minutesMap: Record<string, number> = {
            'starter': 60,
            'standard': 240,
            'pro': 600,
          };

          const monthlyMinutes = minutesMap[plan] || 60;

          // Update subscription in database with customer and subscription IDs
          await storage.updateUserStripeInfo(
            userId,
            session.customer as string,
            session.subscription as string
          );

          // Update subscription status, plan, and monthly minute allowance
          await storage.updateUserSubscription(
            userId,
            plan as 'starter' | 'standard' | 'pro',
            'active',
            monthlyMinutes
          );

          // Reset monthly usage counter
          await storage.resetUserVoiceUsage(userId);
          
          console.log(`[Stripe Webhook] Subscription activated for user ${userId}`);
          break;
        }

        case 'invoice.payment_succeeded': {
          const invoice = event.data.object as Stripe.Invoice;
          const customerId = invoice.customer as string;

          // Find user by Stripe customer ID
          const user = await storage.getUserByStripeCustomerId(customerId);
          
          if (!user) {
            console.error(`[Stripe Webhook] User not found for customer ${customerId}`);
            break;
          }

          // Reset monthly minutes on successful payment (monthly billing cycle)
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
          
          await storage.updateUserSubscription(
            user.id, 
            (user.subscriptionPlan || 'starter') as 'starter' | 'standard' | 'pro' | 'single' | 'all', 
            status
          );
          
          console.log(`[Stripe Webhook] Subscription ${subscription.status} for user ${user.id}`);
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
