import { Router } from 'express';
import { sessionAgentService } from '../services/session-agent-service';

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
