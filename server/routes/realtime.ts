import { Router } from 'express';
import { z } from 'zod';
import { storage } from '../storage';

const router = Router();

// Schema for starting a realtime session
const startSessionSchema = z.object({
  studentId: z.string().optional(),
  subject: z.string().optional(),
  language: z.enum(['en', 'es', 'hi', 'zh']).default('en'),
  ageGroup: z.enum(['K-2', '3-5', '6-8', '9-12', 'College/Adult']).default('3-5'),
  voice: z.string().optional(),
  contextDocumentIds: z.array(z.string()).optional(),
});

/**
 * POST /api/session/realtime/start
 * Start a new realtime voice session
 */
router.post('/start', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const data = startSessionSchema.parse(req.body);

    // Determine voice based on language and age group
    let selectedVoice = 'alloy'; // default
    try {
      const { getRealtimeVoice } = await import('../config/realtimeVoiceMapping');
      const voiceConfig = getRealtimeVoice(data.language, data.ageGroup);
      selectedVoice = voiceConfig.openaiVoice;
      console.log(`[RealtimeAPI] Voice mapped: ${data.language}/${data.ageGroup} → ${selectedVoice}`);
    } catch (error) {
      console.error('[RealtimeAPI] Voice mapping error, using default:', error);
    }

    // Check user has available voice minutes
    const user = await storage.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const totalMinutes = (user.monthlyVoiceMinutes || 0) + (user.bonusMinutes || 0);
    const usedMinutes = user.monthlyVoiceMinutesUsed || 0;
    const availableMinutes = totalMinutes - usedMinutes;

    if (availableMinutes <= 0) {
      return res.status(403).json({ 
        error: 'No voice minutes available',
        availableMinutes: 0,
        totalMinutes,
        usedMinutes,
      });
    }

    // Create session record with language, age group, and mapped voice
    const session = await storage.createRealtimeSession({
      userId,
      studentId: data.studentId,
      subject: data.subject,
      language: data.language,
      ageGroup: data.ageGroup,
      voice: selectedVoice, // Use mapped voice instead of client-provided
      model: 'gpt-4o-realtime-preview-2024-10-01',
      status: 'connecting',
      transcript: [],
      contextDocuments: data.contextDocumentIds || [],
    });

    console.log(`[RealtimeAPI] Created session ${session.id} for user ${userId}`);

    // Generate secure session token to prevent session hijacking
    const crypto = await import('crypto');
    const sessionToken = crypto.randomBytes(32).toString('hex');
    
    // Store token in session for validation
    await storage.updateRealtimeSession(session.id, userId, {
      errorMessage: sessionToken, // Temporarily store token in errorMessage field
    });

    // Return session details and WebSocket connection info
    const protocol = req.protocol === 'https' ? 'wss' : 'ws';
    const host = req.get('host');
    const wsUrl = `${protocol}://${host}/ws/realtime/${session.id}?token=${sessionToken}`;

    res.json({
      sessionId: session.id,
      wsUrl,
      token: sessionToken,
      language: session.language,
      ageGroup: session.ageGroup,
      voice: session.voice,
      availableMinutes,
      status: session.status,
    });

  } catch (error) {
    console.error('[RealtimeAPI] Error starting session:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    
    res.status(500).json({ error: 'Failed to start realtime session' });
  }
});

/**
 * GET /api/session/realtime/:sessionId
 * Get session details
 */
router.get('/:sessionId', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const session = await storage.getRealtimeSession(req.params.sessionId, userId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
      id: session.id,
      status: session.status,
      language: session.language,
      voice: session.voice,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      minutesUsed: session.minutesUsed,
      transcript: session.transcript,
    });

  } catch (error) {
    console.error('[RealtimeAPI] Error fetching session:', error);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

/**
 * POST /api/session/realtime/:sessionId/end
 * End an active session
 */
router.post('/:sessionId/end', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const session = await storage.getRealtimeSession(req.params.sessionId, userId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Update session status
    await storage.updateRealtimeSession(session.id, userId, {
      status: 'ended',
      endedAt: new Date(),
    });

    res.json({ 
      success: true,
      sessionId: session.id,
      minutesUsed: session.minutesUsed,
    });

  } catch (error) {
    console.error('[RealtimeAPI] Error ending session:', error);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

export default router;
