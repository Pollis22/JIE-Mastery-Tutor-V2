import { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import { getUserMinuteBalance } from '../services/voice-minutes';

/**
 * Middleware to enforce subscription and minute-based access control for tutor features.
 * 
 * Checks:
 * 1. User is authenticated
 * 2. User has an active subscription OR purchased minutes
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

    // Step 3: Check for active subscription OR purchased minutes
    const hasActiveSubscription = user.subscriptionStatus === 'active';
    const hasPurchasedMinutes = (user.purchasedMinutesBalance || 0) > 0;
    
    if (!hasActiveSubscription && !hasPurchasedMinutes) {
      return res.status(403).json({ 
        error: 'No active subscription',
        message: 'Please subscribe to access AI tutoring',
        reason: 'no_subscription',
        action: 'subscribe',
        redirectTo: '/pricing'
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

    const hasActiveSubscription = user.subscriptionStatus === 'active';
    const hasPurchasedMinutes = (user.purchasedMinutesBalance || 0) > 0;
    
    if (!hasActiveSubscription && !hasPurchasedMinutes) {
      return res.status(403).json({ 
        error: 'No active subscription',
        message: 'Please subscribe to access this feature',
        redirectTo: '/pricing'
      });
    }

    next();
  } catch (error) {
    console.error('[Subscription Middleware] Error:', error);
    return res.status(500).json({ error: 'Failed to verify subscription' });
  }
};
