import { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import { getUserMinuteBalance } from '../services/voice-minutes';
import type { User } from '@shared/schema';

/**
 * Check if a user has voice access based on their subscription status.
 * 
 * Voice Access Rules:
 * - active: Always has access
 * - trialing: Has access during trial
 * - canceled: Has access until subscriptionEndsAt date
 * - inactive: No access
 * - past_due: No access (payment failed)
 */
export function hasVoiceAccess(user: User): boolean {
  // Active users always have access
  if (user.subscriptionStatus === 'active') {
    return true;
  }
  
  // Trialing users have access
  if (user.subscriptionStatus === 'trialing') {
    return true;
  }
  
  // Canceled users have access until period ends
  if (user.subscriptionStatus === 'canceled' && user.subscriptionEndsAt) {
    const endsAt = new Date(user.subscriptionEndsAt);
    const now = new Date();
    return now < endsAt;
  }
  
  // Everyone else (inactive, past_due) - no access unless they have purchased minutes
  return false;
}

/**
 * Middleware to enforce subscription and minute-based access control for tutor features.
 * 
 * Checks:
 * 1. User is authenticated
 * 2. User has voice access (active, trialing, or canceled with valid grace period) OR purchased minutes
 * 3. User has available minutes (totalAvailable > 0)
 * 
 * Returns 401 if not authenticated
 * Returns 403 if no subscription/minutes
 * 
 * Usage:
 *   router.post('/voice/generate-response', requireSubscription, async (req, res) => {...});
 */
export const requireSubscription = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Step 1: Verify authentication
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'You must be logged in to access AI tutoring'
      });
    }

    const userId = req.user!.id;
    
    // Step 2: Get user data
    const user = await storage.getUser(userId);
    
    if (!user) {
      return res.status(404).json({ 
        error: 'User not found',
        message: 'Your account could not be found'
      });
    }

    // Step 3: Check for voice access OR purchased minutes
    const hasAccess = hasVoiceAccess(user);
    const hasPurchasedMinutes = (user.purchasedMinutesBalance || 0) > 0;
    
    if (!hasAccess && !hasPurchasedMinutes) {
      // Provide status-specific messaging
      let message = 'Please subscribe to access AI tutoring';
      let reason = 'no_subscription';
      
      if (user.subscriptionStatus === 'canceled') {
        message = 'Your subscription has expired. Please reactivate to continue.';
        reason = 'subscription_expired';
      } else if (user.subscriptionStatus === 'past_due') {
        message = 'There is an issue with your payment. Please update your payment method.';
        reason = 'payment_failed';
      } else if (user.subscriptionStatus === 'inactive') {
        message = 'Your subscription has ended. Please reactivate to continue learning.';
        reason = 'subscription_ended';
      }
      
      return res.status(403).json({ 
        error: 'Subscription required',
        message,
        reason,
        status: user.subscriptionStatus,
        subscriptionEndsAt: user.subscriptionEndsAt?.toISOString(),
        action: user.subscriptionStatus === 'past_due' ? 'update_payment' : 'subscribe',
        redirectTo: user.subscriptionStatus === 'past_due' ? '/dashboard/payment' : '/pricing'
      });
    }

    // Step 4: Check minute availability
    const balance = await getUserMinuteBalance(userId);
    
    if (balance.totalAvailable <= 0) {
      // Determine if they need to wait for reset or purchase minutes
      const needsReset = user.billingCycleStart ? 
        new Date(user.billingCycleStart).getTime() + (30 * 24 * 60 * 60 * 1000) : null;
      const resetDate = needsReset ? new Date(needsReset) : null;
      
      return res.status(403).json({ 
        error: 'No minutes available',
        message: balance.purchasedMinutes === 0 && resetDate ? 
          `You've used all ${balance.subscriptionLimit} minutes in your plan. Your minutes will reset on ${resetDate.toLocaleDateString()} or you can purchase additional minutes.` :
          `You've used all your minutes. Please purchase additional minutes to continue.`,
        reason: 'no_minutes',
        action: 'purchase_or_wait',
        minuteBalance: {
          subscriptionUsed: balance.subscriptionUsed,
          subscriptionLimit: balance.subscriptionLimit,
          purchasedAvailable: balance.purchasedMinutes,
          totalAvailable: balance.totalAvailable,
          nextResetDate: resetDate?.toISOString()
        },
        redirectTo: '/pricing'
      });
    }

    // All checks passed - allow access
    console.log(`✅ [Subscription] User ${userId} authorized - ${balance.totalAvailable} minutes available`);
    next();
    
  } catch (error) {
    console.error('[Subscription Middleware] Error:', error);
    return res.status(500).json({ 
      error: 'Failed to verify subscription status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Optional: Lighter check that only verifies subscription exists,
 * without checking minute availability. Useful for non-voice endpoints.
 */
export const requireActiveSubscription = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'You must be logged in'
      });
    }

    const userId = req.user!.id;
    const user = await storage.getUser(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const hasAccess = hasVoiceAccess(user);
    const hasPurchasedMinutes = (user.purchasedMinutesBalance || 0) > 0;
    
    if (!hasAccess && !hasPurchasedMinutes) {
      return res.status(403).json({ 
        error: 'Subscription required',
        message: user.subscriptionStatus === 'canceled' 
          ? 'Your subscription has expired. Please reactivate to continue.'
          : 'Please subscribe to access this feature',
        status: user.subscriptionStatus,
        redirectTo: '/pricing'
      });
    }

    next();
  } catch (error) {
    console.error('[Subscription Middleware] Error:', error);
    return res.status(500).json({ error: 'Failed to verify subscription' });
  }
};

/**
 * Middleware specifically for voice endpoints that returns detailed status info.
 * Use this for WebSocket connection attempts and voice session starts.
 */
export const requireVoiceAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'You must be logged in to access voice tutoring'
      });
    }

    const userId = req.user!.id;
    const user = await storage.getUser(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!hasVoiceAccess(user)) {
      return res.status(403).json({
        error: 'Subscription required',
        status: user.subscriptionStatus,
        message: user.subscriptionStatus === 'canceled' 
          ? 'Your subscription has expired. Please reactivate to continue.'
          : user.subscriptionStatus === 'past_due'
            ? 'There is an issue with your payment. Please update your payment method.'
            : 'Please subscribe to access voice tutoring.',
        subscriptionEndsAt: user.subscriptionEndsAt?.toISOString(),
        reactivateUrl: '/dashboard/subscription'
      });
    }

    next();
  } catch (error) {
    console.error('[Voice Access Middleware] Error:', error);
    return res.status(500).json({ error: 'Failed to verify voice access' });
  }
};
