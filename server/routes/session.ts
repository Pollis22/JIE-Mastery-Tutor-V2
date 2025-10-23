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

// POST /api/session/activity - Track session activity and prevent timeout
sessionRouter.post('/activity', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const userId = req.user!.id;
    const { sessionId } = req.body;
    
    // Check if session is still active in database
    let sessionStatus = 'active';
    if (sessionId) {
      const session = await storage.getRealtimeSession(sessionId, userId);
      if (session) {
        sessionStatus = session.status || 'active';
      }
    }
    
    // If session was auto-ended, return that info so frontend can disconnect
    if (sessionStatus === 'ended') {
      console.log(`⏰ [ActivityAPI] Session ${sessionId} was auto-ended, notifying frontend to disconnect`);
      return res.json({
        success: true,
        sessionEnded: true,
        reason: 'inactivity_timeout',
        message: 'Session was automatically ended due to inactivity'
      });
    }
    
    // Update activity timestamp to prevent timeout
    console.log(`✅ [ActivityAPI] Activity updated for session ${sessionId}`);
    res.json({ 
      success: true,
      sessionEnded: false,
      sessionStatus 
    });
    
  } catch (error) {
    console.error('[ActivityAPI] Error updating activity:', error);
    res.status(500).json({ 
      error: 'Failed to update activity',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
