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

const router = Router();

// PATCH /api/user/profile - Update user profile
router.patch('/profile', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.user!.id;
    const { firstName, lastName, email } = req.body;

    // Basic validation
    if (!firstName && !lastName && !email) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const user = await storage.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if email is already taken (if changing email)
    if (email && email.toLowerCase() !== user.email.toLowerCase()) {
      const existingUser = await storage.getUserByEmail(email.toLowerCase());
      if (existingUser) {
        return res.status(400).json({ error: 'Email already in use' });
      }
    }

    const updateData: any = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (email) updateData.email = email.toLowerCase();

    console.log(`[Profile] Updating user ${userId} with data:`, updateData);

    // Update user in database
    const updatedUser = await storage.updateUserSettings(userId, updateData);
    
    console.log(`[Profile] ✅ Database update completed. Updated user:`, {
      id: updatedUser.id,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      email: updatedUser.email
    });

    // Update Stripe customer if exists
    if (user.stripeCustomerId) {
      try {
        const { stripe } = await import('../services/stripe-service');
        if (stripe) {
          await stripe.customers.update(user.stripeCustomerId, {
            email: email ? email.toLowerCase() : user.email,
            name: `${firstName || user.firstName} ${lastName || user.lastName}`.trim()
          });
        }
      } catch (error) {
        console.error('⚠️ [Profile] Failed to update Stripe customer:', error);
        // Continue - not critical enough to fail the request
      }
    }

    console.log(`✅ [Profile] User ${userId} updated profile`);
    res.json({ 
      success: true, 
      message: 'Profile updated successfully',
      user: updatedUser 
    });

  } catch (error: any) {
    console.error('❌ [Profile] Failed to update profile:', error);
    res.status(500).json({ 
      error: 'Failed to update profile',
      message: error.message 
    });
  }
});

// DELETE /api/user/account - Delete user account
router.delete('/account', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.user!.id;
    const user = await storage.getUserById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`🗑️ [Account] Deleting account for user: ${userId} (${user.email})`);

    // Cancel Stripe subscription if active
    if (user.stripeCustomerId) {
      try {
        const { stripe, getActiveSubscription } = await import('../services/stripe-service');
        if (stripe) {
          const subscription = await getActiveSubscription(user.stripeCustomerId);
          if (subscription) {
            await stripe.subscriptions.cancel(subscription.id);
            console.log(`✅ [Account] Cancelled Stripe subscription: ${subscription.id}`);
          }
          
          // Optionally delete customer from Stripe (or just keep for records)
          // await stripe.customers.del(user.stripeCustomerId);
        }
      } catch (error) {
        console.error('⚠️ [Account] Failed to cancel Stripe subscription:', error);
        // Continue deletion process even if Stripe fails
      }
    }

    // Delete user data from database (cascade will handle related records if configured, otherwise manual cleanup needed)
    // Note: Implementing soft delete or hard delete depends on requirements. 
    // For now, we'll mark as deleted or delete if supported by storage.
    // Since storage.deleteUser doesn't exist, we'll implement a basic db delete here.
    
    const { db } = await import('../db');
    const { users } = await import('@shared/schema');
    const { eq } = await import('drizzle-orm');

    // Hard delete for now to ensure GDPR compliance (right to be forgotten)
    await db.delete(users).where(eq(users.id, userId));

    // Logout user
    req.logout((err) => {
      if (err) {
        console.error('⚠️ [Account] Logout error after deletion:', err);
      }
      res.json({ success: true, message: 'Account deleted successfully' });
    });

  } catch (error: any) {
    console.error('❌ [Account] Failed to delete account:', error);
    res.status(500).json({ 
      error: 'Failed to delete account',
      message: error.message 
    });
  }
});

// GET /api/user/export-data - Export user data (GDPR)
router.get('/export-data', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.user!.id;
    const user = await storage.getUserById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Gather all user data
    const sessions = await storage.getUserSessions(userId);
    const documents = await storage.getUserDocuments(userId);
    
    // Get realtime sessions
    let realtimeSessionsData = [];
    try {
      const { db } = await import('../db');
      const { realtimeSessions } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');
      
      realtimeSessionsData = await db.select().from(realtimeSessions).where(eq(realtimeSessions.userId, userId));
    } catch (e) {
      console.warn('⚠️ [Export] Could not fetch realtime sessions');
    }

    const exportData = {
      profile: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        createdAt: user.createdAt,
        gradeLevel: user.gradeLevel,
        preferences: {
          language: user.preferredLanguage,
          voiceStyle: user.voiceStyle,
          speechSpeed: user.speechSpeed
        }
      },
      subscription: {
        plan: user.subscriptionPlan,
        status: user.subscriptionStatus,
        minutesUsed: user.monthlyVoiceMinutesUsed,
        minutesLimit: user.monthlyVoiceMinutes
      },
      sessions: sessions,
      realtimeSessions: realtimeSessionsData,
      documents: documents.map(d => ({ 
        filename: d.fileName, 
        uploadedAt: d.createdAt,
        size: d.fileSize 
      }))
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="user-export-${userId}.json"`);
    res.json(exportData);

  } catch (error: any) {
    console.error('❌ [Export] Failed to export data:', error);
    res.status(500).json({ 
      error: 'Failed to export data',
      message: error.message 
    });
  }
});

// GET /api/user/analytics - User analytics dashboard
router.get('/analytics', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.user!.id;
    const user = await storage.getUserById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('📊 [Analytics] Fetching analytics for user:', userId);

    // Get voice usage statistics from realtime_sessions
    let usageStats = {
      total_sessions: 0,
      total_minutes_used: 0,
      active_days: 0,
      unique_students: 0
    };

    try {
      const { db } = await import('../db');
      const { sql } = await import('drizzle-orm');
      
      const statsResult = await db.execute(sql`
        SELECT 
          COUNT(DISTINCT id) as total_sessions,
          COALESCE(SUM(minutes_used), 0) as total_minutes_used,
          COUNT(DISTINCT DATE(started_at)) as active_days,
          COUNT(DISTINCT student_id) as unique_students
        FROM realtime_sessions
        WHERE user_id = ${userId}
          AND status = 'ended'
      `);

      if (statsResult.rows && statsResult.rows[0]) {
        usageStats = statsResult.rows[0] as any;
      }
    } catch (error: any) {
      console.error('[Analytics] Error fetching session stats:', error);
      // Continue with empty stats
    }

    // Get recent sessions
    let recentSessions: any[] = [];
    try {
      const { db } = await import('../db');
      const { sql } = await import('drizzle-orm');
      
      const sessionsResult = await db.execute(sql`
        SELECT 
          id,
          subject,
          language,
          minutes_used,
          started_at,
          ended_at,
          status
        FROM realtime_sessions
        WHERE user_id = ${userId}
        ORDER BY started_at DESC
        LIMIT 10
      `);

      recentSessions = sessionsResult.rows || [];
    } catch (error: any) {
      console.error('[Analytics] Error fetching recent sessions:', error);
    }

    // Get usage by subject
    let bySubject: any[] = [];
    try {
      const { db } = await import('../db');
      const { sql } = await import('drizzle-orm');
      
      const subjectResult = await db.execute(sql`
        SELECT 
          subject,
          COUNT(*) as session_count,
          SUM(COALESCE(minutes_used, 0)) as total_minutes
        FROM realtime_sessions
        WHERE user_id = ${userId}
          AND status = 'ended'
        GROUP BY subject
        ORDER BY total_minutes DESC
      `);

      bySubject = subjectResult.rows || [];
    } catch (error: any) {
      console.error('[Analytics] Error fetching subject breakdown:', error);
    }

    // Current usage from user record
    const currentUsage = {
      minutesUsed: user.monthlyVoiceMinutesUsed || 0,
      minutesLimit: user.monthlyVoiceMinutes || 60,
      bonusMinutes: user.bonusMinutes || 0,
      minutesRemaining: (user.monthlyVoiceMinutes || 60) + (user.bonusMinutes || 0) - (user.monthlyVoiceMinutesUsed || 0),
      plan: user.subscriptionPlan || 'starter'
    };

    const response = {
      summary: {
        totalSessions: parseInt(usageStats.total_sessions?.toString() || '0'),
        totalMinutesUsed: parseFloat(usageStats.total_minutes_used?.toString() || '0'),
        activeDays: parseInt(usageStats.active_days?.toString() || '0'),
        uniqueStudents: parseInt(usageStats.unique_students?.toString() || '0')
      },
      currentUsage,
      recentSessions,
      bySubject
    };

    console.log('✅ [Analytics] Analytics fetched successfully');
    res.json(response);

  } catch (error: any) {
    console.error('❌ [Analytics] Failed to fetch analytics:', error);
    res.status(500).json({ 
      error: 'Failed to fetch analytics',
      message: error.message 
    });
  }
});

// GET /api/user/voice-balance - Get hybrid minute balance for dashboard
router.get('/voice-balance', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.user!.id;
    
    const { getUserMinuteBalance } = await import('../services/voice-minutes');
    const balance = await getUserMinuteBalance(userId);
    
    console.log('💰 [VoiceBalance] Fetched balance for user:', userId);
    res.json(balance);

  } catch (error: any) {
    console.error('❌ [VoiceBalance] Failed to fetch balance:', error);
    res.status(500).json({ 
      error: 'Failed to fetch voice balance',
      message: error.message 
    });
  }
});

export default router;
