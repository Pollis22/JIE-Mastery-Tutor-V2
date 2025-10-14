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
  model: z.string().optional(),
  userId: z.string().optional(),
});

/**
 * POST /api/session/realtime - Single unified endpoint
 * Creates OpenAI session and returns credentials immediately
 * This matches what the client is actually calling
 */
router.post('/', async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log('🎬 [RealtimeAPI] Creating session via HTTP');
    
    // Check if Realtime is enabled
    const realtimeEnabled = process.env.REALTIME_ENABLED !== 'false';
    const useConvai = process.env.USE_CONVAI?.toLowerCase() === 'true';
    
    if (!realtimeEnabled || useConvai) {
      return res.status(503).json({ 
        error: 'OpenAI Realtime is currently disabled',
        realtimeEnabled,
        useConvai
      });
    }

    // Parse request body with defaults
    const data = startSessionSchema.parse(req.body);
    const model = data.model || 'gpt-4o-realtime-preview-2024-10-01';
    
    // Determine voice based on language and age group
    let selectedVoice = data.voice || 'alloy'; // default
    try {
      const { getRealtimeVoice } = await import('../config/realtimeVoiceMapping');
      const voiceConfig = getRealtimeVoice(data.language, data.ageGroup);
      selectedVoice = voiceConfig.openaiVoice;
      console.log(`[RealtimeAPI] Voice mapped: ${data.language}/${data.ageGroup} → ${selectedVoice}`);
    } catch (error) {
      console.error('[RealtimeAPI] Voice mapping error, using default:', error);
    }

    // Validate API key
    if (!process.env.OPENAI_API_KEY) {
      console.error('❌ Missing OPENAI_API_KEY');
      return res.status(500).json({ 
        error: 'Server configuration error' 
      });
    }

    // Request ephemeral session from OpenAI
    console.log('🔑 Requesting ephemeral session from OpenAI...');
    const openaiResponse = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        model,
        voice: selectedVoice,
        modalities: ['text', 'audio'],
        instructions: ''
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('❌ OpenAI API error:', {
        status: openaiResponse.status,
        error: errorText
      });
      return res.status(openaiResponse.status).json({ 
        error: 'Failed to create OpenAI session',
        details: errorText 
      });
    }

    const sessionData = await openaiResponse.json();
    const sessionId = sessionData.id || `stub-${Date.now()}`;

    console.log('✅ OpenAI session created', { 
      sessionId,
      hasClientSecret: !!sessionData.client_secret?.value 
    });

    // Save to database asynchronously (fail-safe, don't block on error)
    const userId = req.user?.id || data.userId;
    if (userId && storage.createRealtimeSession) {
      storage.createRealtimeSession({
        userId,
        studentId: data.studentId,
        subject: data.subject,
        language: data.language,
        ageGroup: data.ageGroup,
        voice: selectedVoice,
        model,
        status: 'active',
        transcript: [],
        contextDocuments: data.contextDocumentIds || [],
      }).then(session => {
        console.log('✅ Session saved to DB:', session.id);
      }).catch((err: any) => {
        // PostgreSQL error code 42P01 = "undefined_table"
        if (err.code === '42P01') {
          console.warn('⚠️ realtime_sessions table missing; skipping DB save');
        } else {
          console.warn('⚠️ DB save failed (non-blocking):', err.message);
        }
      });
    }

    // Return credentials immediately
    const duration = Date.now() - startTime;
    console.log(`✅ [RealtimeAPI] Session ready in ${duration}ms`);

    res.json({
      success: true,
      sessionId,
      client_secret: sessionData.client_secret,
      model: sessionData.model,
      voice: selectedVoice,
      expires_at: sessionData.expires_at,
    });

  } catch (error: any) {
    console.error('❌ [RealtimeAPI] Error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

/**
 * POST /api/session/realtime/start
 * Legacy endpoint - kept for backward compatibility
 */
router.post('/start', async (req, res) => {
  try {
    // Check if Realtime is enabled
    const realtimeEnabled = process.env.REALTIME_ENABLED !== 'false';
    const useConvai = process.env.USE_CONVAI?.toLowerCase() === 'true';
    
    if (!realtimeEnabled || useConvai) {
      return res.status(503).json({ 
        error: 'OpenAI Realtime is currently disabled',
        realtimeEnabled,
        useConvai
      });
    }

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
 * POST /api/session/realtime/:sessionId/credentials
 * Get WebRTC credentials for a session (HTTP alternative to WebSocket)
 * This bypasses WebSocket which doesn't work well in Railway
 */
router.post('/:sessionId/credentials', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const sessionId = req.params.sessionId;
    const session = await storage.getRealtimeSession(sessionId, userId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Mint ephemeral token from OpenAI
    console.log(`🎫 [Realtime] Minting WebRTC credentials for session ${sessionId}`);
    
    const mintResponse = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: session.model || 'gpt-4o-realtime-preview-2024-10-01',
        voice: session.voice || 'alloy',
        modalities: ['text', 'audio'],
        instructions: '', // Will be set separately
      }),
    });

    if (!mintResponse.ok) {
      const errorText = await mintResponse.text();
      console.error(`❌ [Realtime] OpenAI mint failed: ${mintResponse.status}`, errorText);
      return res.status(500).json({ 
        error: 'Failed to mint session credentials',
        details: errorText 
      });
    }

    const mintData = await mintResponse.json();
    console.log(`✅ [Realtime] Minted session: ${mintData.id}`);

    res.json({
      client_secret: mintData.client_secret,
      session_id: mintData.id,
      model: mintData.model,
      voice: session.voice,
      expires_at: mintData.expires_at,
    });

  } catch (error: any) {
    console.error('[Realtime] Error minting credentials:', error);
    res.status(500).json({ error: 'Failed to mint credentials', details: error.message });
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
