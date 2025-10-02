import { Router } from 'express';
import { sessionAgentService } from '../services/session-agent-service';
import { ensureAuthenticated } from '../middleware/auth';

export const sessionRouter = Router();

sessionRouter.post('/create', ensureAuthenticated, async (req, res) => {
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

sessionRouter.post('/:sessionId/end', ensureAuthenticated, async (req, res) => {
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

sessionRouter.post('/cleanup', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    await sessionAgentService.cleanupExpiredSessions();
    
    res.json({ success: true, message: 'Expired sessions cleaned up' });
  } catch (error) {
    console.error('Error cleaning up sessions:', error);
    res.status(500).json({ 
      error: 'Failed to cleanup sessions',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
