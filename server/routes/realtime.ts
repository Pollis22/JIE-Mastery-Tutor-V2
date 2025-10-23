import { Router } from 'express';
import { z } from 'zod';
import { storage } from '../storage';
import { db } from '../db';
import { realtimeSessions } from '@shared/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';

const router = Router();

// Schema for starting a realtime session
const startSessionSchema = z.object({
  studentId: z.string().optional(),
  studentName: z.string().optional(),
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
      realtimeEnabled: process.env.REALTIME_ENABLED !== 'false'
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
  
  // SECURITY FIX: Require authentication for ALL voice sessions
  if (!req.isAuthenticated() || !req.user) {
    console.log('🚫 [RealtimeAPI] BLOCKED: Unauthorized voice session attempt');
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'You must be logged in to start a voice session. Please login first.'
    });
  }
  
  try {
    console.log('🎬 [RealtimeAPI] Creating session via HTTP');
    console.log('   User authenticated:', req.user.email);
    
    // Check if Realtime is enabled
    const realtimeEnabled = process.env.REALTIME_ENABLED !== 'false';
    
    if (!realtimeEnabled) {
      return res.status(503).json({ 
        error: 'OpenAI Realtime is currently disabled',
        realtimeEnabled
      });
    }

    // Parse request body with defaults
    const data = startSessionSchema.parse(req.body);
    const model = data.model || 'gpt-4o-realtime-preview-2024-10-01';
    
    // CRITICAL: Always use authenticated user ID, never accept from request body
    const checkUserId = req.user.id; // SECURITY: Only use authenticated user
    if (checkUserId) {
      // First, clean up any expired or stuck sessions (older than 30 minutes)
      const cleanupResult = await db.update(realtimeSessions)
        .set({ 
          status: 'ended', 
          endedAt: new Date(),
          errorMessage: 'Session auto-ended due to timeout'
        })
        .where(and(
          eq(realtimeSessions.userId, checkUserId),
          inArray(realtimeSessions.status, ['connecting', 'active']),
          sql`${realtimeSessions.startedAt} < NOW() - INTERVAL '30 minutes'`
        ))
        .returning({ id: realtimeSessions.id });
      
      if (cleanupResult.length > 0) {
        console.log(`🧹 [RealtimeAPI] Cleaned up ${cleanupResult.length} expired sessions for user ${checkUserId}`);
      }
      
      // Get user's concurrent session limit
      const user = await storage.getUser(checkUserId);
      const maxConcurrentSessions = user?.maxConcurrentSessions || 1;
      
      // Check for any active sessions on this account
      const activeSessions = await db.select({
        id: realtimeSessions.id,
        studentName: realtimeSessions.studentName,
        startedAt: realtimeSessions.startedAt,
        status: realtimeSessions.status
      })
      .from(realtimeSessions)
      .where(and(
        eq(realtimeSessions.userId, checkUserId),
        inArray(realtimeSessions.status, ['connecting', 'active'])
      ));
      
      // Block if at or over limit
      if (activeSessions && activeSessions.length >= maxConcurrentSessions) {
        const activeSession = activeSessions[0];
        const studentInUse = activeSession.studentName || 'another family member';
        
        console.log(`🚫 [RealtimeAPI] Session blocked - Account ${checkUserId} at concurrent session limit`);
        console.log(`   Active sessions: ${activeSessions.length}/${maxConcurrentSessions}`);
        console.log(`   Student using: ${studentInUse}`);
        
        return res.status(409).json({ 
          error: 'Session in use',
          code: 'CONCURRENT_SESSION_BLOCKED',
          message: maxConcurrentSessions === 1 
            ? `A tutoring session is already in progress with ${studentInUse}. Only one voice session is allowed per family account at a time. Please wait for the current session to end.`
            : `Your account has reached its limit of ${maxConcurrentSessions} concurrent sessions. ${activeSessions.length} session(s) are currently active. Please wait for one to end before starting another.`,
          activeSession: {
            sessionId: activeSession.id,
            studentName: activeSession.studentName,
            startedAt: activeSession.startedAt,
            estimatedEndTime: activeSession.startedAt ? new Date(activeSession.startedAt.getTime() + 15 * 60 * 1000) : null
          },
          activeSessions: activeSessions.length,
          maxAllowed: maxConcurrentSessions,
          suggestion: maxConcurrentSessions === 1 
            ? 'Family members can take turns using the voice tutor. The current session will automatically end after 5 minutes of inactivity.'
            : `Your ${user?.subscriptionPlan || 'current'} plan allows up to ${maxConcurrentSessions} simultaneous sessions. Upgrade to Elite Family ($199.99/mo) for 3 concurrent devices!`
        });
      }
      
      // Check if user has available minutes before creating session
      const { getUserMinuteBalance } = await import('../services/voice-minutes');
      const balance = await getUserMinuteBalance(checkUserId);
      
      // Block session if no minutes available
      if (balance.totalAvailable <= 0) {
        console.log(`⛔ [RealtimeAPI] Session blocked - User ${checkUserId} has no available minutes`);
        console.log(`   Subscription: ${balance.subscriptionUsed}/${balance.subscriptionLimit} used`);
        console.log(`   Purchased: ${balance.purchasedMinutes} available`);
        
        // Check if they need to wait for reset or purchase minutes
        const user = await storage.getUser(checkUserId);
        const needsReset = user && user.billingCycleStart ? 
          new Date(user.billingCycleStart).getTime() + (30 * 24 * 60 * 60 * 1000) : null;
        const resetDate = needsReset ? new Date(needsReset) : null;
        
        return res.status(403).json({ 
          error: 'No minutes available',
          message: balance.purchasedMinutes === 0 && resetDate ? 
            `You've used all ${balance.subscriptionLimit} minutes in your plan. Your minutes will reset on ${resetDate.toLocaleDateString()} or you can purchase additional minutes.` :
            `You've used all your minutes. Please purchase additional minutes to continue.`,
          minuteBalance: {
            subscriptionUsed: balance.subscriptionUsed,
            subscriptionLimit: balance.subscriptionLimit,
            purchasedAvailable: balance.purchasedMinutes,
            totalAvailable: balance.totalAvailable,
            nextResetDate: resetDate?.toISOString()
          }
        });
      }
      
      console.log(`✅ [RealtimeAPI] User ${checkUserId} has ${balance.totalAvailable} minutes available`);
    }
    
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
    
    // Add personalized greeting with student name and document awareness
    const hasDocuments = documentContext && documentContext.length > 0;
    const studentGreeting = data.studentName ? `
IMPORTANT: The student's name is ${data.studentName}. Start your first message by greeting them warmly by name. 
${hasDocuments ? `Also mention that you see they've uploaded ${data.contextDocumentIds?.length} document(s) and you're ready to help with them.` : ''}

For example:
- "Hello ${data.studentName}! I'm so glad you're here to learn with me today!${hasDocuments ? ` I see you've uploaded some materials - I'm ready to help you work through them!`  : ''}"
- "Hi ${data.studentName}! ${hasDocuments ? `I noticed you have some documents uploaded. ` : ''}What would you like to work on in ${data.subject || 'our lessons'} today?"
- "Welcome ${data.studentName}! I'm excited to help you learn!${hasDocuments ? ` I can see your uploaded assignments, so let's dive in!` : ''}"

Throughout the conversation:
- Use ${data.studentName}'s name naturally every 3-4 exchanges
- Examples: "Great question, ${data.studentName}!" or "You're doing really well with this, ${data.studentName}!"
- Keep it natural and encouraging, don't overuse the name

Remember: You're not just teaching content, you're building ${data.studentName}'s confidence and love of learning!
` : '';
    
    // Combine personality prompt with document context
    const instructions = `${baseInstructions}
${studentGreeting}
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
        instructions,
        // CRITICAL: Enable input audio transcription (REQUIRED for AI to hear user)
        input_audio_transcription: {
          model: 'whisper-1'
        },
        // Configure turn detection for better conversation flow
        turn_detection: {
          type: 'server_vad',           // Voice Activity Detection
          threshold: 0.5,                // Sensitivity (0.0 - 1.0)
          prefix_padding_ms: 300,        // Wait 300ms before user starts
          silence_duration_ms: 1200      // Wait 1.2 seconds of silence before AI responds
        },
        temperature: 0.8  // More natural, conversational responses
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

    // Save to database and get the DB session ID for transcript tracking
    let dbSessionId = sessionId; // Default to OpenAI session ID
    if (sessionUserId && storage.createRealtimeSession) {
      try {
        const dbSession = await storage.createRealtimeSession({
          userId: sessionUserId,
          studentId: data.studentId,
          studentName: data.studentName,
          subject: data.subject,
          language: data.language,
          ageGroup: data.ageGroup,
          voice: selectedVoice,
          model,
          status: 'active',
          transcript: [],
          contextDocuments: data.contextDocumentIds || [],
        });
        dbSessionId = dbSession.id; // Use database session ID
        console.log('✅ Session saved to DB:', dbSession.id);
        
        // Start activity tracking with auto-timeout after 5 minutes
        const { startActivityTracking } = await import('../services/session-activity-tracker');
        startActivityTracking(
          sessionUserId,
          dbSessionId,
          // Warning callback (4 minutes) - could send a system message to frontend
          () => {
            console.log(`⚠️ [ActivityTracker] Inactivity warning for user ${sessionUserId}`);
            // TODO: Could optionally send a warning via WebSocket or data channel
          },
          // End callback (5 minutes) - auto-end the session
          async () => {
            console.log(`⏰ [ActivityTracker] Auto-ending session ${dbSessionId} due to inactivity`);
            try {
              // Calculate duration for minute tracking
              const session = await storage.getRealtimeSession(dbSessionId, sessionUserId);
              if (session && session.status === 'active') {
                const endTime = new Date();
                const startTime = session.startedAt ? new Date(session.startedAt) : endTime;
                const durationMs = endTime.getTime() - startTime.getTime();
                const minutesUsed = Math.ceil(durationMs / 60000);
                
                // End session and deduct minutes
                await storage.endRealtimeSession(dbSessionId, sessionUserId, session.transcript || [], minutesUsed);
                console.log(`✅ [ActivityTracker] Auto-ended session. Minutes used: ${minutesUsed}`);
              }
            } catch (error) {
              console.error('[ActivityTracker] Error auto-ending session:', error);
            }
          }
        );
        console.log('⏱️ [ActivityTracker] Started activity tracking for session');
      } catch (err: any) {
        // PostgreSQL error code 42P01 = "undefined_table"
        if (err.code === '42P01') {
          console.warn('⚠️ realtime_sessions table missing; using OpenAI session ID');
        } else {
          console.warn('⚠️ DB save failed (non-blocking):', err.message);
        }
      }
    }

    // Return credentials immediately with database session ID
    const duration = Date.now() - startTime;
    console.log(`✅ [RealtimeAPI] Session ready in ${duration}ms`);

    res.json({
      success: true,
      sessionId: dbSessionId,  // Return DB session ID for transcript tracking
      session_id: dbSessionId,  // Also include for backwards compatibility
      client_secret: sessionData.client_secret,
      model: sessionData.model,
      voice: selectedVoice,
      expires_at: sessionData.expires_at,
      instructions: instructions,  // CRITICAL: Send instructions to frontend!
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
    
    if (!realtimeEnabled) {
      return res.status(503).json({ 
        error: 'OpenAI Realtime is currently disabled',
        realtimeEnabled
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

    // Transform transcript from database format (role/content) to frontend format (speaker/text)
    const transformedTranscript = session.transcript && Array.isArray(session.transcript)
      ? session.transcript.map((entry: any) => ({
          speaker: entry.role === 'assistant' ? 'tutor' : 'student',
          text: entry.content || entry.text || '',
          timestamp: entry.timestamp,
          messageId: entry.messageId || crypto.randomUUID()
        }))
      : [];

    res.json({
      id: session.id,
      status: session.status,
      language: session.language,
      voice: session.voice,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      minutesUsed: session.minutesUsed,
      transcript: transformedTranscript,
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

    // Stop activity tracking when session ends
    const { stopActivityTracking } = await import('../services/session-activity-tracker');
    stopActivityTracking(userId);
    console.log('🛑 [ActivityTracker] Stopped tracking for user');

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

/**
 * POST /api/session/realtime/cleanup - Clean up stuck sessions for current user
 * This is a maintenance endpoint to help users who get stuck due to crashed sessions
 */
router.post('/cleanup', async (req, res) => {
  try {
    const userId = req.user?.id || req.body.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Clean up ALL stuck sessions for this user
    const cleanupResult = await db.update(realtimeSessions)
      .set({ 
        status: 'ended', 
        endedAt: new Date(),
        errorMessage: 'Session manually cleaned up'
      })
      .where(and(
        eq(realtimeSessions.userId, userId),
        inArray(realtimeSessions.status, ['connecting', 'active'])
      ))
      .returning({ 
        id: realtimeSessions.id, 
        studentName: realtimeSessions.studentName,
        startedAt: realtimeSessions.startedAt 
      });
    
    console.log(`🧹 [RealtimeAPI] Manual cleanup: Ended ${cleanupResult.length} sessions for user ${userId}`);
    
    res.json({ 
      success: true,
      cleanedSessions: cleanupResult.length,
      sessions: cleanupResult
    });
  } catch (error) {
    console.error('[RealtimeAPI] Cleanup error:', error);
    res.status(500).json({ error: 'Failed to cleanup sessions' });
  }
});

/**
 * POST /api/session/activity - Update activity timestamp
 * Prevents auto-timeout by updating last activity time
 * Returns session status so frontend can disconnect if session was ended
 */
router.post('/activity', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
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
    
    // Import activity tracker
    const { updateActivity, getActivityInfo } = await import('../services/session-activity-tracker');
    
    // Update activity timestamp
    updateActivity(userId);
    
    // Return current activity info
    const info = getActivityInfo(userId);
    
    res.json({ 
      success: true,
      sessionEnded: false,
      activityInfo: info,
    });
    
  } catch (error) {
    console.error('[RealtimeAPI] Error updating activity:', error);
    res.status(500).json({ error: 'Failed to update activity' });
  }
});

export default router;
