import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import { storage } from "../storage";
import Stripe from "stripe";

const router = Router();

// Initialize Stripe if configured
const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-11-20.acacia' })
  : null;

// Middleware - check authentication
const requireAuth = (req: Request, res: Response, next: Function) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// POST /api/subscription/cancel - Cancel subscription (keep account)
router.post('/cancel', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    
    console.log('[Subscription] Cancellation requested for user:', userId);
    
    // Get current subscription info
    const user = await storage.getUserById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // If has Stripe subscription, cancel it
    if (user.stripeSubscriptionId && stripe) {
      try {
        await stripe.subscriptions.cancel(user.stripeSubscriptionId);
        console.log('[Subscription] Cancelled Stripe subscription:', user.stripeSubscriptionId);
      } catch (stripeError: any) {
        console.error('[Subscription] Stripe cancellation error:', stripeError.message);
        // Continue with local cancellation even if Stripe fails
      }
    }
    
    // Update user status to cancelled
    await storage.updateUserSubscription(
      userId,
      null as any, // Clear plan
      'canceled',
      0 // Zero minutes
    );
    
    // Clear Stripe IDs
    await storage.updateUserStripeInfo(userId, null, null);
    
    console.log('[Subscription] Subscription cancelled for:', user.email);
    
    res.json({
      success: true,
      message: 'Subscription cancelled successfully',
      note: 'Your account remains active but you no longer have access to tutoring sessions. You can resubscribe anytime.'
    });
    
  } catch (error: any) {
    console.error('[Subscription] Error cancelling subscription:', error);
    res.status(500).json({ 
      error: 'Failed to cancel subscription',
      details: error.message 
    });
  }
});

// POST /api/account/request-deletion - Request account deletion
router.post('/request-deletion', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { confirmPassword } = req.body;
    
    console.log('[Account] Deletion requested for user:', userId);
    
    // Get user details
    const user = await storage.getUserById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Verify password for security
    const passwordValid = await bcrypt.compare(confirmPassword, user.password);
    
    if (!passwordValid) {
      console.log('[Account] Invalid password for deletion request');
      return res.status(401).json({ 
        error: 'Invalid password',
        message: 'Please enter your current password to confirm deletion'
      });
    }
    
    // Mark for deletion (30-day grace period)
    await storage.markAccountForDeletion(userId);
    
    console.log('[Account] Deletion requested, 30-day grace period started:', user.email);
    
    const deletionDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    
    res.json({
      success: true,
      message: 'Account deletion requested',
      details: 'Your account will be permanently deleted in 30 days. You can cancel this request anytime before then by logging in.',
      deletionDate: deletionDate.toISOString()
    });
    
  } catch (error: any) {
    console.error('[Account] Error requesting deletion:', error);
    res.status(500).json({ error: 'Failed to request account deletion' });
  }
});

// POST /api/account/delete-now - Immediate deletion (for testing/admin)
router.post('/delete-now', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { confirmPassword, confirmText } = req.body;
    
    console.log('[Account] IMMEDIATE deletion requested for user:', userId);
    
    // Get user details
    const user = await storage.getUserById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Verify password
    const passwordValid = await bcrypt.compare(confirmPassword, user.password);
    
    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid password' });
    }
    
    // Verify confirmation text
    if (confirmText !== 'DELETE MY ACCOUNT') {
      return res.status(400).json({ 
        error: 'Confirmation required',
        message: 'Please type "DELETE MY ACCOUNT" to confirm'
      });
    }
    
    // Prevent admin deletion
    if (user.isAdmin) {
      return res.status(403).json({ 
        error: 'Cannot delete admin account',
        message: 'Admin accounts cannot be self-deleted for security reasons'
      });
    }
    
    // Store email for response
    const deletedEmail = user.email;
    
    // Delete all user data
    const success = await storage.deleteUserAccount(userId);
    
    if (!success) {
      throw new Error('Failed to delete account data');
    }
    
    // Destroy session
    req.logout((err) => {
      if (err) {
        console.error('[Account] Error destroying session:', err);
      }
    });
    
    console.log('[Account] Account fully deleted:', deletedEmail);
    
    res.json({
      success: true,
      message: 'Account permanently deleted',
      email: deletedEmail,
      note: 'All your data has been permanently removed. You can create a new account anytime.'
    });
    
  } catch (error: any) {
    console.error('[Account] Error deleting account:', error);
    res.status(500).json({ 
      error: 'Failed to delete account',
      details: error.message 
    });
  }
});

// POST /api/account/cancel-deletion - Cancel pending deletion
router.post('/cancel-deletion', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    
    await storage.cancelAccountDeletion(userId);
    
    res.json({
      success: true,
      message: 'Account deletion cancelled',
      note: 'Your account will remain active'
    });
    
  } catch (error: any) {
    console.error('[Account] Error cancelling deletion:', error);
    res.status(500).json({ error: 'Failed to cancel deletion' });
  }
});

// GET /api/account/status - Get account status
router.get('/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const user = await storage.getUserById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Calculate minutes
    const minutesRemaining = user.subscriptionMinutesLimit - user.subscriptionMinutesUsed + user.purchasedMinutesBalance;
    
    let deletionInfo = null;
    if (user.deletionRequestedAt) {
      const deletionDate = new Date(user.deletionRequestedAt);
      deletionDate.setDate(deletionDate.getDate() + 30);
      
      deletionInfo = {
        requested: user.deletionRequestedAt,
        scheduledDate: deletionDate.toISOString(),
        daysRemaining: Math.ceil((deletionDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      };
    }
    
    const accountAge = Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24));
    
    res.json({
      email: user.email,
      subscriptionPlan: user.subscriptionPlan,
      subscriptionStatus: user.subscriptionStatus,
      minutesRemaining,
      accountAge,
      pendingDeletion: deletionInfo
    });
    
  } catch (error: any) {
    console.error('[Account] Error fetching status:', error);
    res.status(500).json({ error: 'Failed to fetch account status' });
  }
});

export default router;