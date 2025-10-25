import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { storage } from '../storage';
import { db } from '../db';
import { realtimeSessions } from '@shared/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { geminiLiveService } from '../services/gemini-live';
import { requireSubscription } from '../middleware/require-subscription';

const router = Router();

// Schema for starting a Gemini Live session
const startSessionSchema = z.object({
  studentId: z.string().optional(),
  studentName: z.string().optional(),
  subject: z.string().optional(),
  language: z.enum(['en', 'es', 'hi', 'zh']).default('en'),
  ageGroup: z.enum(['K-2', '3-5', '6-8', '9-12', 'College/Adult']).default('3-5'),
  voice: z.string().optional(),
  contextDocumentIds: z.array(z.string()).optional(),
  userId: z.string().optional(),
});

/**
 * GET /api/session/gemini/test - Test endpoint
 */
router.get('/test', (req, res) => {
  res.json({ 
    message: 'Gemini Live endpoint is working!',
    timestamp: new Date().toISOString(),
    env: {
      hasGeminiKey: !!process.env.GEMINI_API_KEY,
      geminiEnabled: geminiLiveService.isEnabled(),
      nodeEnv: process.env.NODE_ENV,
    }
  });
});

/**
 * POST /api/session/gemini - Create Gemini Live session
 * Returns session configuration for client-side WebSocket connection
 * Protected by requireSubscription middleware to enforce subscription + minute balance
 */
router.post('/', requireSubscription, async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log('🎬 [GeminiLive] Creating session via HTTP');
    
    // CRITICAL: Require authentication
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      console.log('⛔ [GeminiLive] Unauthorized request - no authentication');
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'You must be logged in to start a voice session'
      });
    }
    
    // Check if Gemini Live is enabled
    if (!geminiLiveService.isEnabled()) {
      return res.status(503).json({ 
        error: 'Gemini Live API is not configured',
        message: 'GEMINI_API_KEY environment variable is required'
      });
    }

    // Parse request body with defaults
    const data = startSessionSchema.parse(req.body);
    
    // CRITICAL: Check for active sessions on this account
    // Now that we've verified authentication, req.user.id is guaranteed to exist
    const checkUserId = req.user!.id;
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
        console.log(`🧹 [GeminiLive] Cleaned up ${cleanupResult.length} expired sessions for user ${checkUserId}`);
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
        
        console.log(`⛔ [GeminiLive] Session blocked - User ${checkUserId} has ${activeSessions.length}/${maxConcurrentSessions} active sessions`);
        
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
        console.log(`⛔ [GeminiLive] Session blocked - User ${checkUserId} has no available minutes`);
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
      
      console.log(`✅ [GeminiLive] User ${checkUserId} has ${balance.totalAvailable} minutes available`);
    }
    
    // Fetch document context if documents are selected
    let documentContext = '';
    // Use authenticated user ID for document fetching
    console.log(`🔍 [GeminiLive] Checking for documents. User: ${checkUserId}, Document IDs:`, data.contextDocumentIds);
    
    if (data.contextDocumentIds && data.contextDocumentIds.length > 0) {
      try {
        const { chunks, documents } = await storage.getDocumentContext(checkUserId, data.contextDocumentIds);
        console.log(`📄 [GeminiLive] Found ${documents.length} documents with ${chunks.length} total chunks`);
        
        if (documents.length > 0) {
          documentContext = '\n\n# Student Documents for Reference:\n';
          documentContext += 'The student has uploaded the following documents. Please reference these when helping them:\n';
          
          // Add document summaries
          for (const doc of documents) {
            documentContext += `\n## Document: "${doc.title || doc.originalName}"\n`;
            if (doc.subject) documentContext += `Subject: ${doc.subject}\n`;
            if (doc.grade) documentContext += `Grade Level: ${doc.grade}\n`;
            if (doc.description) documentContext += `Description: ${doc.description}\n`;
            
            // Add first few chunks of content
            const docChunks = chunks
              .filter(c => c.documentId === doc.id)
              .slice(0, 5); // Gemini has larger context window
            
            if (docChunks.length > 0) {
              documentContext += '\n### Content from this document:\n';
              docChunks.forEach((chunk, idx) => {
                const content = chunk.content.slice(0, 1000); // Gemini can handle more
                documentContext += `Part ${idx + 1}:\n${content}${chunk.content.length > 1000 ? '...' : ''}\n\n`;
              });
            }
          }
          
          console.log(`📚 Added context from ${documents.length} documents. Total context length: ${documentContext.length} chars`);
        }
      } catch (error) {
        console.error('⚠️ Failed to fetch document context:', error);
      }
    }

    // Get personalized system prompt
    const { getPersonalizedSystemPrompt } = await import('../llm/systemPrompt');
    const { getTutorPersonality } = await import('../config/tutor-personalities');
    
    const personality = data.ageGroup ? getTutorPersonality(data.ageGroup) : null;
    const baseInstructions = getPersonalizedSystemPrompt(data.ageGroup, data.subject);
    
    // Add personalized greeting with student name
    let greetingContext = '';
    if (data.studentName) {
      greetingContext = `\n\n# Important - Student Information:\nThe student's name is ${data.studentName}. Please use their name when greeting them and throughout the conversation to make it more personal and engaging.\n`;
      greetingContext += `Start your first message with a warm, friendly greeting using their name. For example: "Hi ${data.studentName}! I'm so excited to learn with you today!"\n`;
    }
    
    const fullInstructions = baseInstructions + greetingContext + documentContext;
    
    // Create Gemini Live configuration
    const config = geminiLiveService.createLiveConfig({
      systemInstruction: fullInstructions,
      voice: data.voice,
      ageGroup: data.ageGroup,
      language: data.language,
    });
    
    // Create database session record
    const [dbSession] = await db.insert(realtimeSessions).values({
      userId: checkUserId, // Authentication verified - always valid
      studentId: data.studentId,
      studentName: data.studentName,
      subject: data.subject,
      language: data.language,
      ageGroup: data.ageGroup,
      voice: data.voice || geminiLiveService.getVoiceForAgeGroup(data.ageGroup),
      model: geminiLiveService.getModelName(),
      status: 'connecting',
      startedAt: new Date(),
    }).returning();

    const responseTime = Date.now() - startTime;
    console.log(`✅ [GeminiLive] Session created in ${responseTime}ms`);
    console.log(`   DB Session ID: ${dbSession.id}`);
    console.log(`   Model: ${geminiLiveService.getModelName()}`);
    console.log(`   Voice: ${config}`);
    
    // Get Gemini API key for frontend WebSocket connection
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    // Return configuration for client-side connection
    res.json({
      success: true,
      provider: 'gemini',
      sessionId: dbSession.id, // Our database session ID for tracking
      geminiApiKey, // Frontend needs this to establish WebSocket connection
      systemInstruction: fullInstructions, // Full system prompt for Gemini
      model: geminiLiveService.getModelName(),
      config: config,
      metadata: {
        studentName: data.studentName,
        subject: data.subject,
        ageGroup: data.ageGroup,
        language: data.language,
        documentsLoaded: data.contextDocumentIds?.length || 0,
      },
      timing: {
        responseTime,
      },
    });
    
  } catch (error: any) {
    console.error('❌ [GeminiLive] Session creation failed:', error);
    
    if (error.name === 'ZodError') {
      return res.status(400).json({ 
        error: 'Invalid request data',
        details: error.errors 
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to create Gemini Live session',
      message: error.message 
    });
  }
});

/**
 * POST /api/session/gemini/:sessionId/transcript - Save transcript entry
 * Adds a transcript entry to an active session
 */
router.post('/:sessionId/transcript', async (req, res) => {
  const { sessionId } = req.params;
  
  try {
    // Require authentication
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const userId = req.user!.id;
    
    // Validate transcript entry
    const entrySchema = z.object({
      speaker: z.enum(['tutor', 'student']),
      text: z.string(),
      timestamp: z.string().optional(),
    });
    
    const entry = entrySchema.parse(req.body);
    
    // Get current session
    const [session] = await db.select()
      .from(realtimeSessions)
      .where(and(
        eq(realtimeSessions.id, sessionId),
        eq(realtimeSessions.userId, userId)
      ))
      .limit(1);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Append to transcript
    const currentTranscript = Array.isArray(session.transcript) ? session.transcript : [];
    const transcriptEntry = {
      speaker: entry.speaker,
      text: entry.text,
      timestamp: entry.timestamp || new Date().toISOString(),
      messageId: crypto.randomUUID(),
    };
    
    const updatedTranscript = [...currentTranscript, transcriptEntry];
    
    // Update session with new transcript
    await db.update(realtimeSessions)
      .set({ transcript: updatedTranscript as any })
      .where(eq(realtimeSessions.id, sessionId));
    
    res.json({ success: true, entry: transcriptEntry });
    
  } catch (error: any) {
    console.error(`❌ [GeminiLive] Failed to save transcript:`, error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/session/gemini/:sessionId/end - End Gemini Live session
 * Calculates duration, updates database, deducts minutes from user account
 */
router.post('/:sessionId/end', async (req, res) => {
  const { sessionId } = req.params;
  
  try {
    console.log(`🛑 [GeminiLive] Ending session: ${sessionId}`);
    
    // CRITICAL: Require authentication
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      console.log('⛔ [GeminiLive] Unauthorized request - no authentication');
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'You must be logged in to end a session'
      });
    }
    
    const userId = req.user!.id;
    
    // Get session from database
    const [session] = await db.select()
      .from(realtimeSessions)
      .where(and(
        eq(realtimeSessions.id, sessionId),
        eq(realtimeSessions.userId, userId)
      ))
      .limit(1);

    if (!session) {
      console.log(`⚠️ [GeminiLive] Session ${sessionId} not found for user ${userId}`);
      return res.status(404).json({ 
        success: false,
        error: 'Session not found' 
      });
    }

    // Calculate duration in minutes
    const startTime = session.startedAt ? new Date(session.startedAt) : new Date();
    const endTime = new Date();
    const durationMs = endTime.getTime() - startTime.getTime();
    const durationMinutes = Math.ceil(durationMs / (1000 * 60)); // Round up to nearest minute

    // Update session in database
    await db.update(realtimeSessions)
      .set({
        status: 'ended',
        endedAt: endTime,
        minutesUsed: durationMinutes,
      })
      .where(eq(realtimeSessions.id, sessionId));

    // Deduct minutes from user account using voice-minutes service
    let insufficientMinutes = false;
    try {
      const { deductMinutes } = await import('../services/voice-minutes');
      await deductMinutes(userId, durationMinutes);
      console.log(`✅ [GeminiLive] Deducted ${durationMinutes} minutes from user ${userId}`);
    } catch (error: any) {
      console.error(`⚠️ [GeminiLive] Failed to deduct minutes:`, error.message);
      // Mark insufficient minutes but don't fail the request
      if (error.message.includes('insufficient')) {
        insufficientMinutes = true;
      }
    }

    console.log(`✅ [GeminiLive] Session ${sessionId} ended successfully - ${durationMinutes} minute(s)`);

    res.json({
      success: true,
      sessionId,
      minutesUsed: durationMinutes,
      insufficientMinutes,
      duration: {
        minutes: durationMinutes,
        seconds: Math.floor(durationMs / 1000),
      }
    });

  } catch (error: any) {
    console.error(`❌ [GeminiLive] Failed to end session ${sessionId}:`, error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

export default router;
