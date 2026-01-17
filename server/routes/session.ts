/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 * 
 * This source code is confidential and proprietary.
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */


import { Router } from 'express';
import { sessionAgentService } from '../services/session-agent-service';
import { storage } from '../storage';

export const sessionRouter = Router();

sessionRouter.post('/create', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { studentId, studentName, gradeBand, subject, documentIds } = req.body;
    
    if (!studentName || !gradeBand || !subject) {
      return res.status(400).json({ 
        error: 'Missing required fields: studentName, gradeBand, subject' 
      });
    }
    
    const result = await sessionAgentService.createSessionAgent({
      userId: req.user!.id,
      studentId: studentId || undefined,
      studentName,
      gradeBand,
      subject,
      documentIds: documentIds || []
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error creating session agent:', error);
    res.status(500).json({ 
      error: 'Failed to create session agent',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

sessionRouter.post('/:sessionId/end', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { sessionId } = req.params;
    
    await sessionAgentService.endSession(sessionId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error ending session:', error);
    res.status(500).json({ 
      error: 'Failed to end session',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

sessionRouter.post('/cleanup', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Clean up both expired and orphaned sessions
    await sessionAgentService.cleanupExpiredSessions();
    await sessionAgentService.cleanupOrphanedSessions();
    
    res.json({ success: true, message: 'Expired and orphaned sessions cleaned up' });
  } catch (error) {
    console.error('Error cleaning up sessions:', error);
    res.status(500).json({ 
      error: 'Failed to cleanup sessions',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

sessionRouter.post('/check-availability', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const userId = req.user!.id;
    const user = await storage.getUser(userId);
    
    if (!user) {
      return res.status(404).json({ 
        allowed: false, 
        reason: 'user_not_found',
        message: 'User not found',
        // Frontend expects these fields
        total: 0,
        used: 0,
        remaining: 0,
        bonusMinutes: 0
      });
    }

    // Check if user is a pending trial user (subscriptionStatus = 'trialing', trialActive = false)
    const isPendingTrial = user.subscriptionStatus === 'trialing' && !user.trialActive;
    
    if (isPendingTrial) {
      // GATING: Trial users must verify email before starting
      if (!user.emailVerified) {
        return res.status(403).json({ 
          allowed: false, 
          reason: 'email_not_verified',
          message: 'Please verify your email to start your free trial.',
          total: user.trialMinutesTotal || 30,
          used: 0,
          remaining: user.trialMinutesTotal || 30,
          bonusMinutes: 0,
          isTrial: true,
          requiresVerification: true
        });
      }
      
      // Email verified - activate trial on first session!
      const { activateTrial } = await import('../services/voice-minutes');
      await activateTrial(userId);
      console.log(`[Session] ✅ Trial activated for user ${userId} on first session start`);
      
      // Return trial availability
      return res.json({ 
        allowed: true,
        total: user.trialMinutesTotal || 30,
        used: 0,
        remaining: user.trialMinutesTotal || 30,
        bonusMinutes: 0,
        isTrial: true,
        warningThreshold: false,
        trialJustActivated: true
      });
    }
    
    // Check if user is on active trial
    if (user.trialActive) {
      const trialMinutesRemaining = (user.trialMinutesTotal || 30) - (user.trialMinutesUsed || 0);
      
      if (trialMinutesRemaining <= 0) {
        return res.json({ 
          allowed: false, 
          reason: 'trial_expired',
          message: 'Your free trial has ended. Subscribe to continue learning!',
          total: user.trialMinutesTotal || 30,
          used: user.trialMinutesUsed || 0,
          remaining: 0,
          bonusMinutes: 0,
          isTrial: true
        });
      }
      
      return res.json({ 
        allowed: true,
        total: user.trialMinutesTotal || 30,
        used: user.trialMinutesUsed || 0,
        remaining: trialMinutesRemaining,
        bonusMinutes: 0,
        isTrial: true,
        warningThreshold: trialMinutesRemaining < 5
      });
    }

    // Check if user has an active subscription or purchased minutes
    const hasPurchasedMinutes = (user.purchasedMinutesBalance || 0) > 0;
    if ((!user.subscriptionStatus || user.subscriptionStatus !== 'active') && !hasPurchasedMinutes) {
      return res.json({ 
        allowed: false, 
        reason: 'no_subscription',
        message: 'Please subscribe to start tutoring sessions',
        // Frontend expects these fields
        total: 0,
        used: 0,
        remaining: 0,
        bonusMinutes: 0
      });
    }

    // Get hybrid minute balance using the voice minutes service
    const { getUserMinuteBalance } = await import('../services/voice-minutes');
    const balance = await getUserMinuteBalance(userId);
    
    // Convert hybrid balance to expected format
    // Total should be remaining + used for consistency
    const used = balance.subscriptionUsed + balance.purchasedUsed;
    const remaining = balance.totalAvailable;
    const total = used + remaining; // This ensures total = used + remaining
    const bonusMinutes = balance.purchasedMinutes; // Purchased minutes act as "bonus"

    if (remaining <= 0) {
      return res.json({ 
        allowed: false, 
        reason: 'no_minutes',
        message: 'You\'ve used all your minutes. Purchase more to continue.',
        // Frontend expects these fields
        total,
        used,
        remaining: 0,
        bonusMinutes
      });
    }

    res.json({ 
      allowed: true,
      // Frontend expects these fields
      total,
      used,
      remaining,
      bonusMinutes,
      // Additional metadata
      warningThreshold: remaining < 10,
      subscriptionUsed: balance.subscriptionUsed,
      subscriptionLimit: balance.subscriptionLimit,
      purchasedMinutes: balance.purchasedMinutes,
      purchasedUsed: balance.purchasedUsed
    });
  } catch (error) {
    console.error('Error checking session availability:', error);
    res.status(500).json({ 
      error: 'Failed to check session availability',
      details: error instanceof Error ? error.message : 'Unknown error',
      // Frontend expects these fields even on error
      total: 0,
      used: 0,
      remaining: 0,
      bonusMinutes: 0
    });
  }
});
