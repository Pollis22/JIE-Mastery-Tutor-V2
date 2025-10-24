import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { voiceService } from "./services/voice";
import { lessonsService } from "./services/lessons";
import { openaiService } from "./services/openai";
import voiceRoutes from "./routes/voiceRoutes";
import conversationRoutes from "./routes/conversationRoutes";
import streamingRoutes from "./routes/streamingRoutes";
import { debugRoutes } from "./routes/debugRoutes";
import { setupSecurityHeaders, setupCORS } from "./middleware/security";
import { requireAdmin } from "./middleware/admin-auth";
import { auditActions } from "./middleware/audit-log";
import { convertUsersToCSV, generateFilename } from "./utils/csv-export";
import { sql } from "drizzle-orm";
import { db } from "./db";
import Stripe from "stripe";
import { z } from "zod";
import { createHmac, timingSafeEqual } from "crypto";

// Stripe is optional - if not configured, subscription features will be disabled
const stripeKey = process.env.STRIPE_SECRET_KEY;
const isStripeEnabled = !!stripeKey;

if (!isStripeEnabled) {
  console.log('[Stripe] Not configured - subscription features disabled');
}

const stripe = isStripeEnabled ? new Stripe(stripeKey, {
  apiVersion: "2025-08-27.basil",
}) : null;

// Generate unsubscribe token using HMAC
// Exported for use in email service
export function generateUnsubscribeToken(email: string): string {
  const secret = process.env.SESSION_SECRET || 'development-session-secret-only';
  const hmac = createHmac('sha256', secret);
  hmac.update(email.toLowerCase());
  return hmac.digest('hex');
}

// Validate unsubscribe token using constant-time comparison
function validateUnsubscribeToken(email: string, token: string): boolean {
  try {
    const expectedToken = generateUnsubscribeToken(email);
    
    // Ensure both tokens are the same length before comparing
    if (token.length !== expectedToken.length) {
      return false;
    }
    
    // Use constant-time comparison to prevent timing attacks
    const tokenBuffer = Buffer.from(token, 'hex');
    const expectedBuffer = Buffer.from(expectedToken, 'hex');
    
    // Check if both are valid hex strings of the same length
    if (tokenBuffer.length !== expectedBuffer.length) {
      return false;
    }
    
    return timingSafeEqual(tokenBuffer, expectedBuffer);
  } catch (error) {
    // Invalid hex string or other error
    return false;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Apply security middleware
  app.use(setupCORS);
  app.use(setupSecurityHeaders);
  
  // Stripe webhooks must be registered BEFORE body parsing middleware
  // because they need raw body for signature verification
  const stripeWebhookRoutes = await import('./routes/stripe-webhooks');
  app.use('/api/stripe', stripeWebhookRoutes.default);
  
  // Health check endpoint
  app.get("/api/health", (req, res) => {
    const testMode = process.env.VOICE_TEST_MODE !== '0';
    const hasAzureTTS = !!(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION);
    
    res.status(200).json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV,
      voiceTestMode: testMode,
      ttsEnabled: testMode || hasAzureTTS, // Always true in test mode or with Azure TTS
      hasOpenAI: !!process.env.OPENAI_API_KEY,
      multiAgent: true, // Flag indicating multi-agent ConvAI system is active
      hasAzureTTS: hasAzureTTS,
      useRealtime: process.env.USE_REALTIME === 'true' || process.env.USE_REALTIME === '1',
      debugMode: process.env.DEBUG_TUTOR === '1',
      // Voice system selection
      convai: true, // Multi-agent system - agents are hardcoded in frontend
      useConvai: process.env.USE_CONVAI?.toLowerCase() === 'true' // Use ConvAI when explicitly true
    });
  });

  // Database health check endpoint - verify realtime_sessions table exists
  app.get("/api/health/db", async (req, res) => {
    const checks = {
      database: false,
      realtimeSessions: false,
      timestamp: new Date().toISOString()
    };

    try {
      // Check basic DB connection
      const { db } = await import('./db');
      await db.execute(sql`SELECT 1`);
      checks.database = true;

      // Check if realtime_sessions table exists
      const result = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'realtime_sessions'
        );
      `);
      checks.realtimeSessions = result.rows[0]?.exists === true;

      const allHealthy = checks.database && checks.realtimeSessions;
      res.status(allHealthy ? 200 : 503).json({
        status: allHealthy ? 'healthy' : 'degraded',
        checks
      });
    } catch (error: any) {
      res.status(503).json({
        status: 'unhealthy',
        checks,
        error: error.message
      });
    }
  });

  // Setup authentication
  setupAuth(app);

  // Unsubscribe endpoint - GET version for email links (public - no authentication required)
  app.get("/api/unsubscribe", async (req, res) => {
    try {
      const { email, token } = req.query;

      if (!email || !token) {
        return res.status(400).send(`
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f9fafb; }
                .container { max-width: 500px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                h1 { color: #ef4444; }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>❌ Invalid Request</h1>
                <p>Email address and token are required to unsubscribe.</p>
              </div>
            </body>
          </html>
        `);
      }

      const emailStr = Array.isArray(email) ? email[0] : email;
      const tokenStr = Array.isArray(token) ? token[0] : token;

      // Validate the unsubscribe token
      if (!validateUnsubscribeToken(emailStr as string, tokenStr as string)) {
        return res.status(403).send(`
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f9fafb; }
                .container { max-width: 500px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                h1 { color: #ef4444; }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>❌ Invalid Token</h1>
                <p>The unsubscribe link is invalid or has expired. Please use the link from the most recent email.</p>
              </div>
            </body>
          </html>
        `);
      }

      const user = await storage.getUserByEmail(emailStr as string);
      
      if (!user) {
        return res.send(`
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f9fafb; }
                .container { max-width: 500px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                h1 { color: #f59e0b; }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>⚠️ Email Not Found</h1>
                <p>We couldn't find that email address in our system.</p>
              </div>
            </body>
          </html>
        `);
      }

      await storage.updateUserMarketingPreferences(user.id, false);
      
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f9fafb; }
              .container { max-width: 500px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
              h1 { color: #10b981; }
              p { line-height: 1.6; color: #4b5563; }
              .footer { margin-top: 30px; color: #6b7280; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>✅ Unsubscribed Successfully</h1>
              <p>You have been unsubscribed from marketing emails.</p>
              <p>You will still receive important account-related emails such as receipts and password resets.</p>
              <p class="footer">
                Changed your mind? You can re-subscribe anytime in your <a href="/settings" style="color: #dc2626;">account settings</a>.
              </p>
            </div>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error('[Unsubscribe] GET Error:', error);
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f9fafb; }
              .container { max-width: 500px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
              h1 { color: #ef4444; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>❌ Error</h1>
              <p>An error occurred while processing your request. Please try again later.</p>
            </div>
          </body>
        </html>
      `);
    }
  });

  // Unsubscribe endpoint - POST version for API calls (public - no authentication required)
  app.post("/api/unsubscribe", async (req, res) => {
    try {
      // Validate email format with Zod
      const unsubscribeSchema = z.object({
        email: z.string().email("Invalid email address"),
      });

      const validation = unsubscribeSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ error: "Invalid email address" });
      }

      const { email } = validation.data;
      const user = await storage.getUserByEmail(email);
      
      if (!user) {
        // Return success even if user not found (don't reveal account existence)
        return res.json({ success: true });
      }

      await storage.updateUserMarketingPreferences(user.id, false);
      
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Unsubscribe] Error:', error);
      res.status(500).json({ error: "Failed to unsubscribe" });
    }
  });

  // Contact form endpoint (public - no authentication required)
  app.post("/api/contact", async (req, res) => {
    try {
      const contactSchema = z.object({
        name: z.string().min(1, "Name is required"),
        email: z.string().email("Invalid email address"),
        subject: z.string().min(1, "Subject is required"),
        message: z.string().min(10, "Message must be at least 10 characters"),
      });

      const validation = contactSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ 
          error: validation.error.errors[0].message 
        });
      }

      const { name, email, subject, message } = validation.data;
      
      // Log contact submission (future: could send email to support)
      console.log('[Contact] New message:', { name, email, subject, message });
      
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Contact] Error:', error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // Enhanced voice API routes (use existing voiceRoutes but add enhancedVoiceRoutes functionality if needed)
  app.use("/api/voice", voiceRoutes);
  
  // Conversation management routes
  app.use("/api/conversation", conversationRoutes);
  app.use("/api/streaming", streamingRoutes);
  
  // Debug routes for monitoring and troubleshooting
  app.use("/api/debug", debugRoutes);
  
  // User analytics and subscription management routes
  const { default: userAnalyticsRoutes } = await import('./routes/user-analytics');
  const { default: subscriptionRoutes } = await import('./routes/subscription');
  app.use("/api/user", userAnalyticsRoutes);
  app.use("/api/subscription", subscriptionRoutes);
  
  // Document and context routes for RAG system
  const { default: documentRoutes } = await import('./routes/documents');
  const { default: contextRoutes } = await import('./routes/context');
  const { default: geminiRealtimeRoutes } = await import('./routes/gemini-realtime');
  app.use("/api/documents", documentRoutes);
  app.use("/api/context", contextRoutes);
  app.use("/api/session/gemini", geminiRealtimeRoutes);
  
  // Debug endpoint to verify route mounting
  app.get("/api/routes", (req, res) => {
    const routes: any[] = [];
    app._router.stack.forEach((middleware: any) => {
      if (middleware.route) {
        routes.push({
          path: middleware.route.path,
          methods: Object.keys(middleware.route.methods)
        });
      } else if (middleware.name === 'router') {
        middleware.handle.stack.forEach((handler: any) => {
          if (handler.route) {
            const path = middleware.regexp.source
              .replace('\\/', '')
              .replace('(?:\\/(?=$))?', '')
              .replace(/\\/g, '');
            routes.push({
              path: path + handler.route.path,
              methods: Object.keys(handler.route.methods)
            });
          }
        });
      }
    });
    res.json({ routes, total: routes.length });
  });
  
  // Student memory routes
  const { default: studentRoutes } = await import('./routes/students');
  app.use("/api/students", studentRoutes);
  
  // Session agent routes (dynamic agent creation)
  const { sessionRouter } = await import('./routes/session');
  app.use("/api/session", sessionRouter);
  
  // Support, payment, and billing routes
  const { default: supportRoutes } = await import('./routes/support');
  const { default: paymentMethodRoutes } = await import('./routes/payment-methods');
  const { default: billingRoutes } = await import('./routes/billing');
  app.use("/api/support", supportRoutes);
  app.use("/api/payment-methods", paymentMethodRoutes);
  app.use("/api/billing", billingRoutes);

  // Learning sessions routes
  const { default: sessionsRoutes } = await import('./routes/sessions');
  app.use("/api/sessions", sessionsRoutes);

  // Legacy voice API routes (for compatibility)
  // Note: live-token endpoint is now handled in voiceRoutes

  app.post("/api/voice/narrate", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const { text, style = 'cheerful' } = req.body;
      if (!text) {
        return res.status(400).json({ message: "Text is required" });
      }

      const audioUrl = await voiceService.generateNarration(text, style);
      res.json({ audioUrl });
    } catch (error: any) {
      res.status(500).json({ message: "Error generating narration: " + error.message });
    }
  });

  // Voice balance endpoint - get user's voice minute balance
  app.get("/api/voice-balance", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const user = req.user as any;
      const { getUserMinuteBalance } = await import('./services/voice-minutes');
      const balance = await getUserMinuteBalance(user.id);
      
      const totalUsed = balance.subscriptionUsed + balance.purchasedUsed;
      const totalPurchased = balance.purchasedMinutes + balance.purchasedUsed;
      
      res.json({
        // New hybrid format
        subscriptionMinutes: balance.subscriptionMinutes,
        subscriptionLimit: balance.subscriptionLimit,
        subscriptionUsed: balance.subscriptionUsed,
        purchasedMinutes: balance.purchasedMinutes,
        purchasedUsed: balance.purchasedUsed,
        totalAvailable: balance.totalAvailable,
        resetDate: balance.resetDate,
        // Legacy format for backward compatibility
        total: balance.subscriptionLimit + totalPurchased,
        used: totalUsed,
        remaining: balance.totalAvailable,
        bonusMinutes: balance.purchasedMinutes
      });
    } catch (error: any) {
      console.error('[VoiceBalance] Error fetching balance:', error);
      res.status(500).json({ message: "Error fetching voice balance: " + error.message });
    }
  });

  // Dashboard statistics endpoint
  app.get("/api/dashboard/stats", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const user = req.user as any;
      
      // Get total sessions count
      const sessionsResult = await db.execute(sql`
        SELECT COUNT(*) as count
        FROM learning_sessions
        WHERE user_id = ${user.id}
      `);
      const totalSessions = Number((sessionsResult.rows[0] as any)?.count || 0);
      
      // Get minutes used in the past 7 days
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      
      const weeklyResult = await db.execute(sql`
        SELECT COALESCE(SUM(duration), 0) as weekly_minutes
        FROM learning_sessions
        WHERE user_id = ${user.id}
          AND created_at >= ${weekAgo.toISOString()}
      `);
      const weeklyMinutes = Number((weeklyResult.rows[0] as any)?.weekly_minutes || 0);
      
      res.json({
        totalSessions,
        weeklyMinutes: Math.round(weeklyMinutes)
      });
    } catch (error: any) {
      console.error('[DashboardStats] Error fetching stats:', error);
      res.status(500).json({ message: "Error fetching dashboard statistics: " + error.message });
    }
  });

  // Lessons API routes
  app.get("/api/lessons", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const user = req.user as any;
      const lessons = await lessonsService.getUserLessons(user.id);
      res.json(lessons);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching lessons: " + error.message });
    }
  });

  app.get("/api/lessons/:lessonId", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const { lessonId } = req.params;
      const user = req.user as any;
      const lesson = await lessonsService.getLessonWithProgress(lessonId, user.id);
      res.json(lesson);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching lesson: " + error.message });
    }
  });

  // User sessions endpoints
  app.get("/api/user/sessions", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const user = req.user as any;
      const sessions = await storage.getUserSessions(user.id);
      res.json({ sessions });
    } catch (error: any) {
      console.error('[Sessions] Error fetching sessions:', error);
      res.status(500).json({ message: "Error fetching sessions: " + error.message });
    }
  });

  app.get("/api/user/sessions/:studentId", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const user = req.user as any;
      const { studentId } = req.params;
      const sessions = await storage.getStudentSessions(studentId, user.id);
      res.json({ sessions });
    } catch (error: any) {
      console.error('[Sessions] Error fetching student sessions:', error);
      res.status(500).json({ message: "Error fetching student sessions: " + error.message });
    }
  });

  // Billing history endpoint
  app.get("/api/billing/history", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!stripe) {
      return res.json({ history: [] });
    }

    try {
      const user = req.user as any;
      
      if (!user.stripeCustomerId) {
        return res.json({ history: [] });
      }

      const invoices = await stripe.invoices.list({
        customer: user.stripeCustomerId,
        limit: 50
      });

      const history = invoices.data.map(invoice => ({
        id: invoice.id,
        date: new Date(invoice.created * 1000),
        amount: invoice.amount_paid / 100,
        status: invoice.status,
        description: invoice.description || 'Subscription payment',
        invoiceUrl: invoice.hosted_invoice_url
      }));

      res.json({ history });
    } catch (error: any) {
      console.error('[Billing] Error fetching history:', error);
      res.status(500).json({ message: "Error fetching billing history: " + error.message });
    }
  });

  // Email preferences endpoints
  app.get("/api/user/email-preferences", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const user = req.user as any;
      const preferences = {
        weeklyNewsletter: user.marketingOptIn || false,
        productUpdates: true,
        promotionalOffers: user.marketingOptIn || false,
        learningTips: true
      };
      res.json({ preferences });
    } catch (error: any) {
      console.error('[Preferences] Error fetching preferences:', error);
      res.status(500).json({ message: "Error fetching preferences: " + error.message });
    }
  });

  app.patch("/api/user/email-preferences", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const user = req.user as any;
      const { weeklyNewsletter, productUpdates, promotionalOffers, learningTips } = req.body;
      
      // For now, we only track marketing opt-in/opt-out
      const marketingOptIn = weeklyNewsletter || promotionalOffers;
      await storage.updateUserMarketingPreferences(user.id, marketingOptIn);
      
      res.json({ success: true, message: "Email preferences updated" });
    } catch (error: any) {
      console.error('[Preferences] Error updating preferences:', error);
      res.status(500).json({ message: "Error updating preferences: " + error.message });
    }
  });

  // Update user settings
  app.put("/api/settings", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const user = req.user as any;
      
      // Validate and sanitize settings data
      const settingsSchema = z.object({
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        email: z.string().email().optional(),
        preferredLanguage: z.string().optional(),
        voiceStyle: z.string().optional(),
        speechSpeed: z.string().optional(),
        volumeLevel: z.number().min(0).max(100).optional(),
        marketingOptIn: z.boolean().optional(),
      });
      
      const validation = settingsSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid settings data",
          errors: validation.error.issues 
        });
      }
      
      const settings = validation.data;
      
      // Only include defined fields to prevent overwriting with undefined
      const updateData: any = { updatedAt: new Date() };
      if (settings.firstName !== undefined) updateData.firstName = settings.firstName;
      if (settings.lastName !== undefined) updateData.lastName = settings.lastName;
      if (settings.email !== undefined) updateData.email = settings.email;
      if (settings.preferredLanguage !== undefined) updateData.preferredLanguage = settings.preferredLanguage;
      if (settings.voiceStyle !== undefined) updateData.voiceStyle = settings.voiceStyle;
      if (settings.speechSpeed !== undefined) updateData.speechSpeed = settings.speechSpeed;
      if (settings.volumeLevel !== undefined) updateData.volumeLevel = settings.volumeLevel;
      if (settings.marketingOptIn !== undefined) updateData.marketingOptIn = settings.marketingOptIn;
      
      // Update user settings
      const updatedUser = await storage.updateUserSettings(user.id, updateData);
      
      res.json({ success: true, message: "Settings updated successfully", user: updatedUser });
    } catch (error: any) {
      console.error('[Settings] Error updating settings:', error);
      res.status(500).json({ message: "Error updating settings: " + error.message });
    }
  });

  app.post("/api/lessons/:lessonId/progress", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const { lessonId } = req.params;
      const user = req.user as any;
      const { progressPercentage, status } = req.body;

      const progress = await storage.updateUserProgress(user.id, lessonId, {
        progressPercentage,
        status,
        lastAccessed: new Date(),
      });

      res.json(progress);
    } catch (error: any) {
      res.status(500).json({ message: "Error updating progress: " + error.message });
    }
  });

  // Learning sessions API
  app.post("/api/sessions/start", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const user = req.user as any;
      const { lessonId, sessionType } = req.body;

      // Check usage limits for voice sessions
      if (sessionType === 'voice') {
        const canUseVoice = await storage.canUserUseVoice(user.id);
        if (!canUseVoice) {
          return res.status(429).json({ 
            message: "Weekly voice limit exceeded",
            fallbackMode: "text"
          });
        }
      }

      const session = await storage.createLearningSession({
        userId: user.id,
        lessonId,
        sessionType,
      });

      res.json(session);
    } catch (error: any) {
      res.status(500).json({ message: "Error starting session: " + error.message });
    }
  });

  app.put("/api/sessions/:sessionId/end", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const { sessionId } = req.params;
      const user = req.user as any;
      const { transcript, voiceMinutesUsed = 0 } = req.body;

      const session = await storage.endLearningSession(sessionId, user.id, {
        transcript,
        voiceMinutesUsed,
        endedAt: new Date(),
        isCompleted: true,
      });

      // Update user's weekly voice usage
      if (voiceMinutesUsed > 0) {
        await storage.updateUserVoiceUsage(user.id, voiceMinutesUsed);
      }

      res.json(session);
    } catch (error: any) {
      res.status(500).json({ message: "Error ending session: " + error.message });
    }
  });

  // Quiz API routes
  app.post("/api/quiz/:lessonId/submit", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const { lessonId } = req.params;
      const user = req.user as any;
      const { answers, sessionId, timeSpent } = req.body;

      const result = await lessonsService.submitQuiz(user.id, lessonId, {
        answers,
        sessionId,
        timeSpent,
      });

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Error submitting quiz: " + error.message });
    }
  });

  // Dashboard API
  app.get("/api/dashboard", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const user = req.user as any;
      const dashboard = await storage.getUserDashboard(user.id);
      res.json(dashboard);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching dashboard: " + error.message });
    }
  });

  // Resume session API
  app.get("/api/resume", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const user = req.user as any;
      const resumeData = await storage.getResumeSession(user.id);
      res.json(resumeData);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching resume data: " + error.message });
    }
  });

  // Stripe subscription routes
  app.post('/api/get-or-create-subscription', async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }

    if (!isStripeEnabled) {
      return res.status(503).json({ message: "Subscription service temporarily unavailable - Stripe not configured" });
    }

    let user = req.user as any;
    const { plan = 'all' } = req.body; // 'single' or 'all'

    if (user.stripeSubscriptionId) {
      const subscription = await stripe!.subscriptions.retrieve(user.stripeSubscriptionId);
      
      const latestInvoice = subscription.latest_invoice;
      const clientSecret = latestInvoice && typeof latestInvoice === 'object' 
        ? (latestInvoice as any).payment_intent?.client_secret 
        : undefined;

      res.send({
        subscriptionId: subscription.id,
        clientSecret,
      });

      return;
    }
    
    if (!user.email) {
      throw new Error('No user email on file');
    }

    try {
      const customer = await stripe!.customers.create({
        email: user.email,
        name: `${user.firstName} ${user.lastName}`.trim() || user.username,
      });

      user = await storage.updateUserStripeInfo(user.id, customer.id, null);

      // Get price ID based on plan
      const priceId = plan === 'single' 
        ? process.env.STRIPE_SINGLE_PRICE_ID 
        : process.env.STRIPE_ALL_PRICE_ID;

      if (!priceId) {
        throw new Error(`Missing Stripe price ID for ${plan} plan`);
      }

      const subscription = await stripe!.subscriptions.create({
        customer: customer.id,
        items: [{ price: priceId }],
        payment_behavior: 'default_incomplete',
        expand: ['latest_invoice.payment_intent'],
      });

      await storage.updateUserStripeInfo(user.id, customer.id, subscription.id);
      await storage.updateUserSubscription(user.id, plan, 'active');

      const latestInvoice = subscription.latest_invoice;
      const clientSecret = latestInvoice && typeof latestInvoice === 'object' 
        ? (latestInvoice as any).payment_intent?.client_secret 
        : undefined;

      res.send({
        subscriptionId: subscription.id,
        clientSecret,
      });
    } catch (error: any) {
      return res.status(400).send({ error: { message: error.message } });
    }
  });

  // Stripe checkout session (new subscription flow)
  app.post('/api/create-checkout-session', async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }

    if (!isStripeEnabled || !stripe) {
      return res.status(503).json({ message: "Checkout service temporarily unavailable - Stripe not configured" });
    }

    const user = req.user as any;
    const { plan } = req.body;

    // Map plan IDs to Stripe price IDs
    const priceMap: Record<string, string> = {
      'starter': process.env.STRIPE_PRICE_STARTER || '',
      'standard': process.env.STRIPE_PRICE_STANDARD || '',
      'pro': process.env.STRIPE_PRICE_PRO || '',
    };

    const priceId = priceMap[plan];

    if (!priceId) {
      console.error(`❌ Price ID not configured for plan: ${plan}`);
      return res.status(503).json({ 
        message: `Subscription service temporarily unavailable - Stripe pricing not configured for ${plan} plan. Please set STRIPE_PRICE_${plan.toUpperCase()} environment variable.` 
      });
    }

    // CRITICAL VALIDATION: Ensure we have a Price ID, not a Product ID
    if (priceId.startsWith('prod_')) {
      console.error(`❌ CRITICAL ERROR: Product ID detected instead of Price ID: ${priceId}`);
      return res.status(500).json({ 
        error: `Configuration error: ${plan} is using a Product ID (${priceId}) instead of a Price ID. Please update environment variable STRIPE_PRICE_${plan.toUpperCase()} with the correct Price ID from Stripe Dashboard.` 
      });
    }

    if (!priceId.startsWith('price_')) {
      console.error(`❌ Invalid Price ID format: ${priceId}`);
      return res.status(500).json({ 
        error: `Invalid Price ID format for ${plan}: ${priceId}. Price IDs must start with "price_"` 
      });
    }

    console.log(`✅ Using valid Price ID for ${plan}: ${priceId}`);

    try {
      // Create or retrieve Stripe customer with validation
      let customerId = user.stripeCustomerId;
      
      // CRITICAL FIX: Verify customer exists in Stripe, create new one if invalid
      if (customerId) {
        try {
          await stripe.customers.retrieve(customerId);
          console.log(`✅ Using existing Stripe customer: ${customerId}`);
        } catch (error) {
          console.warn(`⚠️ Invalid Stripe customer ID: ${customerId}. Creating new customer.`);
          customerId = null; // Reset to create new customer
        }
      }
      
      // Create new Stripe customer if needed
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: `${user.firstName} ${user.lastName}`.trim() || user.username,
          metadata: {
            userId: user.id,
          },
        });
        customerId = customer.id;
        await storage.updateUserStripeInfo(user.id, customerId, null);
        console.log(`✅ Created new Stripe customer: ${customerId}`);
      }

      // Create checkout session
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        line_items: [{
          price: priceId,
          quantity: 1,
        }],
        success_url: `${baseUrl}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/pricing`,
        metadata: {
          userId: user.id,
          plan,
        },
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error('[Stripe Checkout] Error:', error);
      res.status(500).json({ 
        message: "Error creating checkout session: " + error.message,
        details: error.message 
      });
    }
  });

  // Minute top-up checkout (one-time payment)
  app.post('/api/checkout/buy-minutes', async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!isStripeEnabled) {
      return res.status(503).json({ message: "Checkout temporarily unavailable - Stripe not configured" });
    }

    try {
      const { minutePackage } = req.body;
      const user = req.user as any;

      // Define available minute packages
      const packages: Record<string, { price: number; minutes: number; priceId: string }> = {
        '60': { 
          price: 1999, // $19.99 in cents
          minutes: 60, 
          priceId: process.env.STRIPE_PRICE_TOPUP_60 || ''
        }
      };

      const pkg = packages[minutePackage];
      if (!pkg) {
        return res.status(400).json({ message: "Invalid minute package" });
      }

      // Check if Price ID is configured
      if (!pkg.priceId) {
        console.error('❌ STRIPE_PRICE_TOPUP_60 environment variable not configured');
        return res.status(503).json({ 
          message: "Top-up service temporarily unavailable - Stripe pricing not configured. Please set STRIPE_PRICE_TOPUP_60 environment variable." 
        });
      }

      // CRITICAL VALIDATION: Ensure we have a Price ID, not a Product ID
      if (pkg.priceId.startsWith('prod_')) {
        console.error(`❌ CRITICAL ERROR: Product ID detected instead of Price ID for top-up: ${pkg.priceId}`);
        return res.status(500).json({ 
          error: `Configuration error: Top-up is using a Product ID (${pkg.priceId}) instead of a Price ID. Please update environment variable STRIPE_PRICE_TOPUP_60 with the correct Price ID from Stripe Dashboard.` 
        });
      }

      if (!pkg.priceId.startsWith('price_')) {
        console.error(`❌ Invalid Price ID format for top-up: ${pkg.priceId}`);
        return res.status(500).json({ 
          error: `Invalid Price ID format for top-up: ${pkg.priceId}. Price IDs must start with "price_"` 
        });
      }

      console.log(`✅ Using valid Price ID for ${minutePackage}-minute top-up: ${pkg.priceId}`);

      // Create or retrieve Stripe customer with validation
      let customerId = user.stripeCustomerId;
      
      // CRITICAL FIX: Verify customer exists in Stripe, create new one if invalid
      if (customerId) {
        try {
          await stripe!.customers.retrieve(customerId);
          console.log(`✅ Using existing Stripe customer: ${customerId}`);
        } catch (error) {
          console.warn(`⚠️ Invalid Stripe customer ID: ${customerId}. Creating new customer.`);
          customerId = null; // Reset to create new customer
        }
      }
      
      // Create new Stripe customer if needed
      if (!customerId) {
        const customer = await stripe!.customers.create({
          email: user.email,
          name: `${user.firstName} ${user.lastName}`.trim() || user.username,
          metadata: {
            userId: user.id,
          },
        });
        customerId = customer.id;
        await storage.updateUserStripeInfo(user.id, customerId, null);
        console.log(`✅ Created new Stripe customer: ${customerId}`);
      }

      // Create one-time payment checkout session
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const session = await stripe!.checkout.sessions.create({
        customer: customerId,
        mode: 'payment', // One-time payment, not subscription
        line_items: [{ price: pkg.priceId, quantity: 1 }],
        success_url: `${baseUrl}/tutor?topup=success`,
        cancel_url: `${baseUrl}/tutor`,
        metadata: { 
          userId: user.id,
          minutesToAdd: pkg.minutes.toString(),
          type: 'minute_topup'
        },
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error('[Minute Top-up] Error:', error);
      res.status(500).json({ message: "Error creating checkout: " + error.message });
    }
  });

  // Stripe customer portal (accessible via GET for direct link or POST for API)
  const handleStripePortal = async (req: any, res: any) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }

    if (!isStripeEnabled) {
      return res.status(503).json({ message: "Customer portal temporarily unavailable - Stripe not configured" });
    }

    const user = req.user as any;
    
    if (!user.stripeCustomerId) {
      return res.status(400).json({ message: "No Stripe customer found" });
    }

    try {
      const session = await stripe!.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${req.protocol}://${req.get('host')}/dashboard?tab=subscription`,
      });

      // For GET requests, redirect directly. For POST, return the URL
      if (req.method === 'GET') {
        res.redirect(session.url);
      } else {
        res.json({ url: session.url });
      }
    } catch (error: any) {
      res.status(500).json({ message: "Error creating portal session: " + error.message });
    }
  };

  app.get('/api/stripe/portal', handleStripePortal);
  app.post('/api/stripe/portal', handleStripePortal);
  
  // Legacy endpoint for backward compatibility
  app.post('/api/customer-portal', handleStripePortal);

  // Usage tracking endpoint
  app.post('/api/usage/log', async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const { minutesUsed, sessionStart, sessionEnd, sessionId } = req.body;
      const userId = (req.user as any).id;

      if (!minutesUsed || minutesUsed <= 0) {
        return res.status(400).json({ message: "Invalid minutes used" });
      }

      // Log the usage
      await storage.createUsageLog(userId, minutesUsed, 'voice', sessionId);

      // Update user's voice usage counter
      await storage.updateUserVoiceUsage(userId, minutesUsed);

      res.json({ success: true, minutesUsed });
    } catch (error: any) {
      console.error('[Usage Log] Error:', error);
      res.status(500).json({ message: "Error logging usage: " + error.message });
    }
  });

  // Admin routes
  // Stripe customer cleanup endpoint (admin only)
  app.post("/api/admin/cleanup-stripe", requireAdmin, async (req, res) => {
    try {
      const { manualCleanupEndpoint } = await import('./utils/stripe-cleanup');
      await manualCleanupEndpoint(req, res);
    } catch (error: any) {
      console.error('[Admin] Stripe cleanup error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Bootstrap: Make user admin (TEMPORARY - remove after first admin is created)
  app.post("/api/bootstrap/make-admin", async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "Email required" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Update user to admin
      await storage.updateUserSettings(user.id, { isAdmin: true });
      
      console.log(`✅ User ${email} is now an admin`);
      res.json({ success: true, message: `${email} is now an admin` });
    } catch (error: any) {
      console.error('[Bootstrap] Make admin error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/users", requireAdmin, auditActions.viewUsers, async (req, res) => {
    try {
      const { page = 1, limit = 10, search = '' } = req.query;
      const users = await storage.getAdminUsers({
        page: Number(page),
        limit: Number(limit),
        search: String(search),
      });
      res.json(users);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching users: " + error.message });
    }
  });

  app.get("/api/admin/stats", requireAdmin, async (req, res) => {
    try {
      const stats = await storage.getAdminStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching stats: " + error.message });
    }
  });

  app.get("/api/admin/export", requireAdmin, auditActions.exportData, async (req, res) => {
    try {
      const csvData = await storage.exportUsersCSV();
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=users-export.csv');
      res.send(csvData);
    } catch (error: any) {
      res.status(500).json({ message: "Error exporting data: " + error.message });
    }
  });

  // Admin: Add/remove bonus minutes
  app.post("/api/admin/users/:id/minutes", requireAdmin, auditActions.addMinutes, async (req, res) => {
    try {
      const { id } = req.params;
      const { minutes } = req.body;

      if (typeof minutes !== 'number') {
        return res.status(400).json({ message: "Minutes must be a number" });
      }

      await storage.addBonusMinutes(id, minutes);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: "Error adding minutes: " + error.message });
    }
  });

  // Admin: Get subscriptions data
  app.get("/api/admin/subscriptions", requireAdmin, auditActions.viewSubscriptions, async (req, res) => {
    try {
      const result = await storage.getAdminUsers({ page: 1, limit: 1000, search: '' });
      const activeSubscriptions = result.users.filter((u: any) => u.subscriptionStatus === 'active');
      
      const analytics = {
        mrr: activeSubscriptions.reduce((sum: number, u: any) => {
          const planRevenue: any = { starter: 19, standard: 59, pro: 99, single: 99, all: 199 };
          return sum + (planRevenue[u.subscriptionPlan] || 0);
        }, 0),
        active: activeSubscriptions.length,
        growth: 0,
        upcomingRenewals: activeSubscriptions.length,
      };

      res.json({ users: result.users, analytics });
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching subscriptions: " + error.message });
    }
  });

  // Admin: Get documents data
  app.get("/api/admin/documents", requireAdmin, auditActions.viewDocuments, async (req, res) => {
    try {
      const documents = await storage.getAllDocumentsForAdmin();
      const analytics = {
        totalDocuments: documents.length,
        storageUsed: "N/A",
        avgPerUser: 0,
      };

      res.json({ documents, analytics });
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching documents: " + error.message });
    }
  });

  // Admin: Get analytics data
  app.get("/api/admin/analytics", requireAdmin, auditActions.viewAnalytics, async (req, res) => {
    try {
      const stats = await storage.getAdminStats();
      const analytics = {
        totalUsers: stats.totalUsers || 0,
        userGrowth: 0,
        mrr: 0,
        revenueGrowth: 0,
        activeSessions: stats.activeSessions || 0,
        sessionGrowth: 0,
        retentionRate: 85,
        retentionChange: 2,
        totalSessions: stats.totalSessions || 0,
        avgSessionLength: stats.avgSessionTime || "0 min",
        totalVoiceMinutes: 0,
        totalDocuments: stats.totalDocuments || 0,
        gradeDistribution: {
          k2: 0,
          grades35: 0,
          grades68: 0,
          grades912: 0,
          college: 0,
        },
        revenueByPlan: {},
      };

      res.json(analytics);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching analytics: " + error.message });
    }
  });

  // Admin: Get audit logs
  app.get("/api/admin/logs", requireAdmin, auditActions.viewLogs, async (req, res) => {
    try {
      const { page = 1, limit = 50, adminId, action } = req.query;
      
      // Validate query parameters
      const pageNum = Number(page);
      const limitNum = Number(limit);
      
      if (isNaN(pageNum) || pageNum < 1) {
        return res.status(400).json({ message: "Invalid page parameter" });
      }
      
      if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
        return res.status(400).json({ message: "Invalid limit parameter (must be 1-100)" });
      }
      
      const result = await storage.getAdminLogs({
        page: pageNum,
        limit: limitNum,
        adminId: adminId ? String(adminId) : undefined,
        action: action ? String(action) : undefined,
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching audit logs: " + error.message });
    }
  });

  // Admin: Get marketing campaigns
  app.get("/api/admin/campaigns", requireAdmin, auditActions.viewCampaigns, async (req, res) => {
    try {
      const { page = 1, limit = 20 } = req.query;
      const pageNum = Number(page);
      const limitNum = Number(limit);
      
      if (isNaN(pageNum) || pageNum < 1) {
        return res.status(400).json({ message: "Invalid page parameter" });
      }
      
      if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
        return res.status(400).json({ message: "Invalid limit parameter (must be 1-100)" });
      }
      
      const result = await storage.getCampaigns({ page: pageNum, limit: limitNum });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching campaigns: " + error.message });
    }
  });

  // Admin: Export contacts for a segment
  app.get("/api/admin/contacts/export/:segment", requireAdmin, auditActions.exportContacts, async (req, res) => {
    try {
      const user = req.user as any;
      const { segment } = req.params;
      
      // Get contacts for segment
      const contacts = await storage.getContactsForSegment(segment);
      
      // Convert to CSV
      const csv = convertUsersToCSV(contacts);
      
      // Log campaign export
      await storage.createCampaign({
        adminId: user.id,
        campaignName: `Export: ${segment}`,
        segment,
        contactCount: contacts.length,
      });
      
      // Send CSV file
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${generateFilename(segment)}"`);
      res.send(csv);
    } catch (error: any) {
      console.error('[Admin] Contact export error:', error);
      res.status(500).json({ message: "Error exporting contacts: " + error.message });
    }
  });

  // Admin: Get segment preview (first 10 contacts)
  app.get("/api/admin/contacts/preview/:segment", requireAdmin, async (req, res) => {
    try {
      const { segment } = req.params;
      const contacts = await storage.getContactsForSegment(segment);
      res.json({
        count: contacts.length,
        preview: contacts.slice(0, 10),
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching contacts: " + error.message });
    }
  });

  // Admin: Get agent statistics
  app.get("/api/admin/agents/stats", requireAdmin, auditActions.viewAnalytics, async (req, res) => {
    try {
      const agents = [
        { id: 'k2', name: 'K-2', envKey: 'ELEVENLABS_AGENT_K2', gradeLevel: 'kindergarten-2' },
        { id: 'g3_5', name: 'Grades 3-5', envKey: 'ELEVENLABS_AGENT_35', gradeLevel: 'grades-3-5' },
        { id: 'g6_8', name: 'Grades 6-8', envKey: 'ELEVENLABS_AGENT_68', gradeLevel: 'grades-6-8' },
        { id: 'g9_12', name: 'Grades 9-12', envKey: 'ELEVENLABS_AGENT_912', gradeLevel: 'grades-9-12' },
        { id: 'college', name: 'College/Adult', envKey: 'ELEVENLABS_AGENT_COLLEGE', gradeLevel: 'college-adult' },
      ];

      const agentStats = agents.map((agent) => {
        return {
          id: agent.id,
          name: agent.name,
          gradeLevel: agent.gradeLevel,
          agentId: process.env[agent.envKey] || 'Not configured',
          totalSessions: 0, // TODO: Implement session tracking per agent
          recentSessions: 0,
          isConfigured: !!process.env[agent.envKey],
        };
      });

      res.json({ agents: agentStats });
    } catch (error: any) {
      console.error('[Admin] Agent stats error:', error);
      res.status(500).json({ message: "Error fetching agent stats: " + error.message });
    }
  });

  // AI tutor chat endpoint
  app.post("/api/chat", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const user = req.user as any;
      const { message, lessonId, sessionId } = req.body;

      const response = await openaiService.generateTutorResponse(message, {
        userId: user.id,
        lessonId,
        sessionId,
      });

      res.json({ response });
    } catch (error: any) {
      res.status(500).json({ message: "Error generating response: " + error.message });
    }
  });

  // Settings API
  app.put("/api/settings", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const user = req.user as any;
      const updates = req.body;

      // Handle marketing preferences separately to ensure proper date tracking
      if ('marketingOptIn' in updates) {
        const marketingOptIn = updates.marketingOptIn;
        delete updates.marketingOptIn;
        
        // Update marketing preferences with proper date tracking
        await storage.updateUserMarketingPreferences(user.id, marketingOptIn);
      }

      // Update other settings
      if (Object.keys(updates).length > 0) {
        await storage.updateUserSettings(user.id, updates);
      }

      // Fetch and return updated user
      const updatedUser = await storage.getUser(user.id);
      res.json(updatedUser);
    } catch (error: any) {
      res.status(500).json({ message: "Error updating settings: " + error.message });
    }
  });

  const httpServer = createServer(app);
  
  return httpServer;
}
