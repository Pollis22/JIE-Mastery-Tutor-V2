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
        message: 'User not found' 
      });
    }

    // Check if user has an active subscription
    if (!user.subscriptionStatus || user.subscriptionStatus !== 'active') {
      return res.json({ 
        allowed: false, 
        reason: 'no_subscription',
        message: 'Please subscribe to start tutoring sessions',
        remainingMinutes: 0
      });
    }

    // Get available minutes
    const minutesData = await storage.getAvailableMinutes(userId);
    
    if (minutesData.remaining <= 0) {
      return res.json({ 
        allowed: false, 
        reason: 'no_minutes',
        message: 'You\'ve used all your minutes. Purchase more to continue.',
        remainingMinutes: 0,
        totalMinutes: minutesData.total,
        usedMinutes: minutesData.used
      });
    }

    res.json({ 
      allowed: true, 
      remainingMinutes: minutesData.remaining,
      totalMinutes: minutesData.total,
      usedMinutes: minutesData.used,
      warningThreshold: minutesData.remaining < 10 
    });
  } catch (error) {
    console.error('Error checking session availability:', error);
    res.status(500).json({ 
      error: 'Failed to check session availability',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
