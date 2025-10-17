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
 * GET /api/session/realtime/test - Test endpoint
 * Verifies the route is working and has necessary configuration
 */
router.get('/test', (req, res) => {
  res.json({ 
    message: 'Session endpoint is working!',
    timestamp: new Date().toISOString(),
    env: {
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      nodeEnv: process.env.NODE_ENV,
      realtimeEnabled: process.env.REALTIME_ENABLED !== 'false',
      useConvai: process.env.USE_CONVAI?.toLowerCase() === 'true'
    }
  });
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

    // Fetch document context if documents are selected
    let documentContext = '';
    const sessionUserId = req.user?.id || data.userId;
    console.log(`🔍 [Realtime] Checking for documents. User: ${sessionUserId}, Document IDs:`, data.contextDocumentIds);
    
    if (sessionUserId && data.contextDocumentIds && data.contextDocumentIds.length > 0) {
      try {
        const { chunks, documents } = await storage.getDocumentContext(sessionUserId, data.contextDocumentIds);
        console.log(`📄 [Realtime] Found ${documents.length} documents with ${chunks.length} total chunks`);
        
        if (documents.length > 0) {
          documentContext = '\n\n# Student Documents for Reference:\n';
          documentContext += 'The student has uploaded the following documents. Please reference these when helping them:\n';
          
          // Add document summaries
          for (const doc of documents) {
            documentContext += `\n## Document: "${doc.title || doc.originalName}"\n`;
            if (doc.subject) documentContext += `Subject: ${doc.subject}\n`;
            if (doc.grade) documentContext += `Grade Level: ${doc.grade}\n`;
            if (doc.description) documentContext += `Description: ${doc.description}\n`;
            
            // Add first few chunks of content (limit to avoid token overflow)
            const docChunks = chunks
              .filter(c => c.documentId === doc.id)
              .slice(0, 3); // Take first 3 chunks
            
            if (docChunks.length > 0) {
              documentContext += '\n### Content from this document:\n';
              docChunks.forEach((chunk, idx) => {
                // Limit each chunk to 500 characters for context
                const content = chunk.content.slice(0, 500);
                documentContext += `Part ${idx + 1}:\n${content}${chunk.content.length > 500 ? '...' : ''}\n\n`;
              });
            }
          }
          
          console.log(`📚 Added context from ${documents.length} documents. Total context length: ${documentContext.length} chars`);
        } else {
          console.log('⚠️ [Realtime] No documents found for provided IDs');
        }
      } catch (error) {
        console.error('⚠️ Failed to fetch document context:', error);
        // Continue without document context
      }
    }

    // Get personalized system prompt based on grade level
    const { getPersonalizedSystemPrompt } = await import('../llm/systemPrompt');
    const { getTutorPersonality } = await import('../config/tutor-personalities');
    
    // Get the personality configuration for this grade level
    const personality = data.ageGroup ? getTutorPersonality(data.ageGroup) : null;
    
    // Build personalized instructions with personality
    const baseInstructions = getPersonalizedSystemPrompt(data.ageGroup, data.subject);
    
    // Combine personality prompt with document context
    const instructions = `${baseInstructions}
${documentContext ? documentContext : ''}
${documentContext ? '\nPlease reference the student\'s documents when relevant to provide personalized help.' : ''}`;
    
    // Log personality selection
    if (personality) {
      console.log(`🎭 [Realtime] Using personality: ${personality.name} for ${data.ageGroup}`);
      console.log(`   Voice style: ${personality.voice.style}, Speed: ${personality.voice.speed}`);
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
        instructions
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
    if (sessionUserId && storage.createRealtimeSession) {
      storage.createRealtimeSession({
        userId: sessionUserId,
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
 * POST /api/session/realtime/transcript
 * Save transcript message to database
 */
router.post('/transcript', async (req, res) => {
  try {
    const { sessionId, message } = req.body;
    
    if (!sessionId || !message) {
      return res.status(400).json({ error: 'Missing sessionId or message' });
    }

    // Save transcript to database (if table exists)
    try {
      await storage.saveRealtimeTranscript(sessionId, message);
      console.log(`💬 [Transcript] Saved message for session ${sessionId}`);
    } catch (error: any) {
      // Fail silently if table doesn't exist to avoid breaking voice sessions
      if (error.code === '42P01') {
        console.log(`⚠️ [Transcript] Table not found, skipping save`);
      } else {
        console.error(`⚠️ [Transcript] Save failed:`, error.message);
      }
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('[Transcript] Error:', error);
    // Return success even on error to avoid breaking client
    res.json({ success: true });
  }
});

/**
 * POST /api/session/realtime/:sessionId/end
 * End an active session and track voice minutes used
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

    // Calculate duration and minutes used
    const endTime = new Date();
    const startTime = session.startedAt ? new Date(session.startedAt) : endTime;
    const durationMs = endTime.getTime() - startTime.getTime();
    const minutesUsed = Math.ceil(durationMs / 60000); // Round up to nearest minute

    console.log(`⏱️ [RealtimeAPI] Session ${session.id} ended. Duration: ${minutesUsed} minutes (${durationMs}ms)`);

    // Update session with minutes used and end time
    await storage.updateRealtimeSession(session.id, userId, {
      status: 'ended',
      endedAt: endTime,
      minutesUsed: minutesUsed,
    });

    // Deduct minutes using hybrid rollover policy (subscription first, then purchased)
    let minutesDeducted = false;
    let insufficientMinutes = false;
    
    if (minutesUsed > 0) {
      try {
        const { deductMinutes } = await import('../services/voice-minutes');
        await deductMinutes(userId, minutesUsed);
        minutesDeducted = true;
        console.log(`✅ [RealtimeAPI] Deducted ${minutesUsed} minutes from user ${userId}`);
      } catch (error: any) {
        if (error.message?.includes('Insufficient voice minutes')) {
          insufficientMinutes = true;
          console.warn(`⚠️ [RealtimeAPI] User ${userId} has insufficient minutes for ${minutesUsed} minute session`);
        } else {
          throw error; // Re-throw other errors
        }
      }
    }

    res.json({ 
      success: true,
      sessionId: session.id,
      minutesUsed: minutesUsed,
      duration: durationMs,
      minutesDeducted: minutesDeducted,
      insufficientMinutes: insufficientMinutes
    });

  } catch (error) {
    console.error('[RealtimeAPI] Error ending session:', error);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

export default router;
