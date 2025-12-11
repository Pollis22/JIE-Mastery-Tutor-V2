/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 * 
 * This source code is confidential and proprietary.
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */

import Stripe from 'stripe';

const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeKey ? new Stripe(stripeKey, {
  apiVersion: "2025-08-27.basil",
}) : null;

/**
 * Get the active subscription for a customer
 * 
 * @param customerId - Stripe customer ID
 * @returns Active subscription or null if none exists
 */
export async function getActiveSubscription(
  customerId: string
): Promise<Stripe.Subscription | null> {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  try {
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1,
    });
    
    const activeSubscription = subscriptions.data[0] || null;
    
    if (activeSubscription) {
      console.log('[Stripe] ✓ Found active subscription:', activeSubscription.id);
    } else {
      console.log('[Stripe] No active subscription found for customer:', customerId);
    }
    
    return activeSubscription;
  } catch (error) {
    console.error('[Stripe] Error getting active subscription:', error);
    throw error;
  }
}

/**
 * Create or update subscription (prevents duplicates)
 * 
 * This ensures only ONE active subscription per customer.
 * If subscription exists, it updates the price. Otherwise, creates new.
 * 
 * @param customerId - Stripe customer ID
 * @param priceId - New price ID to subscribe to
 * @returns Updated or newly created subscription
 */
export async function createOrUpdateSubscription(
  customerId: string,
  priceId: string
): Promise<Stripe.Subscription> {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  const existingSubscription = await getActiveSubscription(customerId);
  
  if (existingSubscription) {
    // UPDATE existing subscription (prevents duplicate charges)
    console.log('[Stripe] ✓ Updating existing subscription:', existingSubscription.id);
    console.log('[Stripe] Changing from price:', existingSubscription.items.data[0].price.id);
    console.log('[Stripe] Changing to price:', priceId);
    
    const updatedSubscription = await stripe.subscriptions.update(existingSubscription.id, {
      items: [
        {
          id: existingSubscription.items.data[0].id,
          price: priceId,
        },
      ],
      proration_behavior: 'none', // No mid-cycle charges - clean invoices
      billing_cycle_anchor: 'unchanged', // Keep billing date
    });
    
    console.log('[Stripe] ✅ Subscription updated successfully');
    return updatedSubscription;
  } else {
    // CREATE new subscription
    console.log('[Stripe] ✓ Creating new subscription for customer:', customerId);
    
    const newSubscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
    });
    
    console.log('[Stripe] ✅ New subscription created:', newSubscription.id);
    return newSubscription;
  }
}

/**
 * Cancel all active subscriptions for a customer except the specified one
 * 
 * Used for cleanup when duplicates are detected
 * 
 * @param customerId - Stripe customer ID
 * @param keepSubscriptionId - Subscription ID to keep (optional)
 */
export async function cancelDuplicateSubscriptions(
  customerId: string,
  keepSubscriptionId?: string
): Promise<number> {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  try {
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
    });
    
    if (subscriptions.data.length <= 1) {
      console.log('[Stripe] No duplicate subscriptions found');
      return 0;
    }
    
    console.log(`[Stripe] ⚠️ Found ${subscriptions.data.length} active subscriptions for customer ${customerId}`);
    
    // Sort by creation date (keep newest unless specified)
    const sorted = subscriptions.data.sort((a, b) => b.created - a.created);
    const keep = keepSubscriptionId 
      ? sorted.find(sub => sub.id === keepSubscriptionId) || sorted[0]
      : sorted[0];
    const cancel = sorted.filter(sub => sub.id !== keep.id);
    
    console.log(`[Stripe] ✓ Keeping subscription: ${keep.id}`);
    
    let canceledCount = 0;
    for (const sub of cancel) {
      console.log(`[Stripe] ✗ Canceling duplicate subscription: ${sub.id}`);
      await stripe.subscriptions.cancel(sub.id);
      canceledCount++;
    }
    
    console.log(`[Stripe] ✅ Canceled ${canceledCount} duplicate subscription(s)`);
    return canceledCount;
  } catch (error) {
    console.error('[Stripe] Error canceling duplicate subscriptions:', error);
    throw error;
  }
}

/**
 * Get all subscriptions for a customer (active and inactive)
 * 
 * @param customerId - Stripe customer ID
 * @returns List of all subscriptions
 */
export async function getAllSubscriptions(
  customerId: string
): Promise<Stripe.Subscription[]> {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  try {
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 100,
    });
    
    return subscriptions.data;
  } catch (error) {
    console.error('[Stripe] Error getting subscriptions:', error);
    throw error;
  }
}

export { stripe };
