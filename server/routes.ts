import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import path from "path";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { voiceService } from "./services/voice";
import { lessonsService } from "./services/lessons";
import conversationRoutes from "./routes/conversationRoutes";
import { debugRoutes } from "./routes/debugRoutes";
import { setupSecurityHeaders, setupCORS } from "./middleware/security";
import { requireAdmin } from "./middleware/admin-auth";
import { auditActions } from "./middleware/audit-log";
import { convertUsersToCSV, generateFilename } from "./utils/csv-export";
import { sql, desc, eq } from "drizzle-orm";
import { db } from "./db";
import { realtimeSessions, trialSessions, safetyIncidents, users, userDocuments, documentChunks, documentEmbeddings, learningSessions } from "@shared/schema";
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
  
  // Serve uploaded files (avatars, etc.) as static assets
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
  
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

  // Database health check endpoint - verify required tables exist
  app.get("/api/health/db", async (req, res) => {
    const checks: Record<string, boolean | string> = {
      database: false,
      realtimeSessions: false,
      trialSessions: false,
      trialRateLimits: false,
      timestamp: new Date().toISOString()
    };

    try {
      // Check basic DB connection
      const { db } = await import('./db');
      await db.execute(sql`SELECT 1`);
      checks.database = true;

      // Check if required tables exist
      const tableCheckResult = await db.execute(sql`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('realtime_sessions', 'trial_sessions', 'trial_rate_limits');
      `);
      
      const existingTables = new Set(tableCheckResult.rows.map((r: any) => r.table_name));
      checks.realtimeSessions = existingTables.has('realtime_sessions');
      checks.trialSessions = existingTables.has('trial_sessions');
      checks.trialRateLimits = existingTables.has('trial_rate_limits');

      // Core tables that must exist
      const coreHealthy = checks.database && checks.realtimeSessions;
      // Trial tables - warn if missing but don't fail entire health check
      const trialTablesHealthy = checks.trialSessions && checks.trialRateLimits;
      
      const allHealthy = coreHealthy && trialTablesHealthy;
      const status = allHealthy ? 'healthy' : (coreHealthy ? 'degraded' : 'unhealthy');
      
      res.status(allHealthy ? 200 : 503).json({
        status,
        checks,
        missingTables: !trialTablesHealthy ? 
          ['trial_sessions', 'trial_rate_limits'].filter(t => !existingTables.has(t)) : []
      });
    } catch (error: any) {
      res.status(503).json({
        status: 'unhealthy',
        checks,
        error: error.message
      });
    }
  });

  // Site visit analytics endpoint - tracks unique visits (once per session)
  // This is the primary traffic tracking endpoint
  app.post("/api/analytics/site-visit", async (req, res) => {
    try {
      const { landingPage, pageTitle, sessionId, referrer } = req.body;
      
      if (!landingPage || typeof landingPage !== 'string') {
        return res.json({ success: false });
      }
      
      const { pageViews } = await import('@shared/schema');
      await db.insert(pageViews).values({
        pagePath: landingPage,
        pageTitle: pageTitle || null,
        sessionId: sessionId || null,
        userId: null,
      });
      
      console.log(`[Analytics] Site visit: ${landingPage} (referrer: ${referrer || 'direct'})`);
      res.json({ success: true });
    } catch {
      res.json({ success: false });
    }
  });

  // Legacy page view endpoint - kept for backwards compatibility
  app.post("/api/analytics/page-view", async (req, res) => {
    try {
      const { pagePath, pageTitle, sessionId, userId } = req.body;
      
      if (!pagePath || typeof pagePath !== 'string') {
        return res.json({ success: false });
      }
      
      const { pageViews } = await import('@shared/schema');
      await db.insert(pageViews).values({
        pagePath,
        pageTitle: pageTitle || null,
        sessionId: sessionId || null,
        userId: userId || null,
      });
      
      res.json({ success: true });
    } catch {
      res.json({ success: false });
    }
  });

  // Setup authentication
  setupAuth(app);

  // CRITICAL SECURITY: Global email verification middleware
  // This ensures ALL authenticated API requests require email verification (for users created after Oct 13, 2025)
  // EXACT paths that don't require email verification
  const EXACT_PUBLIC_PATHS = new Set([
    '/health',
    '/health/db',
    '/login',
    '/register',
    '/logout',
    '/user', // Allow GET /api/user to show verification banner
    '/pricing',
  ]);
  
  // Prefix paths that don't require email verification
  const PREFIX_PUBLIC_PATHS = [
    '/stripe', // Webhooks handled separately
    '/auth/', // All auth routes (verify-email, resend-verification, etc.)
    '/unsubscribe',
    '/support', // FAQ support (public)
    '/analytics/', // Page view tracking (public, fire-and-forget)
  ];
  
  const VERIFICATION_CUTOFF_DATE = new Date('2025-10-13');
  
  app.use('/api', (req, res, next) => {
    // Normalize path by removing trailing slashes (except for root '/')
    const rawPath = req.path;
    const path = rawPath.length > 1 && rawPath.endsWith('/') 
      ? rawPath.slice(0, -1) 
      : rawPath;
    
    // Skip exact public paths
    if (EXACT_PUBLIC_PATHS.has(path)) {
      return next();
    }
    
    // Skip prefix public paths
    if (PREFIX_PUBLIC_PATHS.some(p => path.startsWith(p))) {
      return next();
    }
    
    // Skip if not authenticated (auth checks happen elsewhere)
    if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
      return next();
    }
    
    const user = req.user as any;
    
    // Allow users created before verification feature
    const accountCreatedAt = user.createdAt ? new Date(user.createdAt) : new Date(0);
    if (accountCreatedAt <= VERIFICATION_CUTOFF_DATE) {
      return next();
    }
    
    // Block unverified users from protected routes
    if (!user.emailVerified) {
      console.log(`[Email Verification] Blocking unverified user ${user.email} from ${req.path}`);
      return res.status(403).json({
        error: 'Email not verified',
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Please verify your email address to access this feature. Check your inbox for the verification link.',
        email: user.email,
        redirectTo: '/dashboard'
      });
    }
    
    next();
  });

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
      
      // Send contact form emails via Resend
      const { emailService } = await import('./services/email-service');
      await emailService.sendContactForm({ name, email, subject, message });
      
      console.log('[Contact] Message sent successfully:', { name, email, subject });
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Contact] Error:', error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // Enhanced voice API routes (use existing voiceRoutes but add enhancedVoiceRoutes functionality if needed)
  
  // Conversation management routes
  app.use("/api/conversation", conversationRoutes);
  
  // Debug routes for monitoring and troubleshooting
  app.use("/api/debug", debugRoutes);
  
  // User analytics and subscription management routes
  const { default: userAnalyticsRoutes } = await import('./routes/user-analytics');
  const { default: userPreferencesRoutes } = await import('./routes/user-preferences');
  const { default: subscriptionRoutes } = await import('./routes/subscription');
  const { default: checkoutRoutes } = await import('./routes/checkout');
  const { default: securityRoutes } = await import('./routes/security');
  app.use("/api/user", userAnalyticsRoutes);
  app.use("/api/user/preferences", userPreferencesRoutes);
  app.use("/api/subscription", subscriptionRoutes);
  app.use("/api/checkout", checkoutRoutes);
  app.use("/api", securityRoutes);
  
  // Document and context routes for RAG system
  const { default: documentRoutes } = await import('./routes/documents');
  const { default: contextRoutes } = await import('./routes/context');
  app.use("/api/documents", documentRoutes);
  app.use("/api/context", contextRoutes);
  
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
  
  // Support, payment, billing, and promo routes
  const { default: supportRoutes } = await import('./routes/support');
  const { default: paymentMethodRoutes } = await import('./routes/payment-methods');
  const { default: billingRoutes } = await import('./routes/billing');
  const { default: promoRoutes } = await import('./routes/promo');
  app.use("/api/support", supportRoutes);
  app.use("/api/payment-methods", paymentMethodRoutes);
  app.use("/api/billing", billingRoutes);
  app.use("/api/promo", promoRoutes);

  // Learning sessions routes
  const { default: sessionsRoutes } = await import('./routes/sessions');
  app.use("/api/sessions", sessionsRoutes);

  // Trial routes (5-minute free trial - no auth required)
  const { default: trialRoutes } = await import('./routes/trial');
  app.use("/api/trial", trialRoutes);

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
      
      console.log('[DashboardStats] Fetching stats for user:', user.id);
      
      // Get total sessions count from realtime_sessions (FIXED: was querying wrong table)
      const sessionsResult = await db.execute(sql`
        SELECT COUNT(*) as count
        FROM realtime_sessions
        WHERE user_id = ${user.id}
          AND status = 'ended'
      `);
      const totalSessions = Number((sessionsResult.rows[0] as any)?.count || 0);
      
      console.log('[DashboardStats] Total sessions found:', totalSessions);
      
      // Get minutes used in the past 7 days from realtime_sessions (FIXED: was querying wrong table)
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      
      const weeklyResult = await db.execute(sql`
        SELECT COALESCE(SUM(minutes_used), 0) as weekly_minutes
        FROM realtime_sessions
        WHERE user_id = ${user.id}
          AND status = 'ended'
          AND started_at >= ${weekAgo.toISOString()}
      `);
      const weeklyMinutes = Number((weeklyResult.rows[0] as any)?.weekly_minutes || 0);
      
      console.log('[DashboardStats] Weekly minutes found:', weeklyMinutes);
      
      res.json({
        totalSessions,
        weeklyMinutes: Math.round(weeklyMinutes)
      });
    } catch (error: any) {
      console.error('[DashboardStats] CRITICAL ERROR fetching stats:', error);
      console.error('[DashboardStats] Error details:', {
        message: error.message,
        code: error.code,
        stack: error.stack
      });
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

  // ✅ FIX #3: Add user progress endpoint
  app.get("/api/progress", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const user = req.user as any;
      const { userProgress, lessons, subjects } = await import('@shared/schema');
      const { eq, desc } = await import('drizzle-orm');
      
      // Get all user progress records with lesson and subject details
      const progress = await db
        .select({
          id: userProgress.id,
          lessonId: userProgress.lessonId,
          status: userProgress.status,
          progressPercentage: userProgress.progressPercentage,
          quizScore: userProgress.quizScore,
          timeSpent: userProgress.timeSpent,
          lastAccessed: userProgress.lastAccessed,
          completedAt: userProgress.completedAt,
          lessonTitle: lessons.title,
          lessonDescription: lessons.description,
          subjectName: subjects.name,
          subjectIcon: subjects.iconColor,
        })
        .from(userProgress)
        .leftJoin(lessons, eq(userProgress.lessonId, lessons.id))
        .leftJoin(subjects, eq(lessons.subjectId, subjects.id))
        .where(eq(userProgress.userId, user.id))
        .orderBy(desc(userProgress.lastAccessed));

      // Calculate overall stats
      const progressWithScores = progress.filter(p => p.quizScore !== null && p.quizScore !== undefined);
      const stats = {
        totalLessons: progress.length,
        completed: progress.filter(p => p.status === 'completed' || p.status === 'mastered').length,
        inProgress: progress.filter(p => p.status === 'in_progress').length,
        totalTimeSpent: progress.reduce((sum, p) => sum + (p.timeSpent || 0), 0),
        averageScore: progressWithScores.length > 0
          ? Math.round(progressWithScores.reduce((sum, p) => sum + (p.quizScore || 0), 0) / progressWithScores.length)
          : 0,
      };

      res.json({ progress, stats });
    } catch (error: any) {
      console.error('[Progress] Error fetching user progress:', error);
      res.status(500).json({ message: "Error fetching progress: " + error.message });
    }
  });

  // Create realtime session endpoint (for custom voice stack)
  app.post("/api/realtime-sessions/create", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const user = req.user as any;
      const { 
        studentId, 
        studentName, 
        subject, 
        language = 'en', 
        ageGroup = '3-5',
        voice,
        model = 'custom',
        contextDocuments = []
      } = req.body;

      // Create session in database
      const [session] = await db.insert(realtimeSessions).values({
        userId: user.id,
        studentId: studentId || null,
        studentName: studentName || user.studentName || 'Student',
        subject: subject || 'General',
        language,
        ageGroup,
        voice,
        model,
        status: 'connecting',
        contextDocuments,
        transcript: [],
        totalMessages: 0,
        minutesUsed: 0,
        aiCost: '0'
      }).returning();

      console.log(`[RealtimeSession] ✅ Created session ${session.id} for user ${user.id}`);

      res.json({
        sessionId: session.id,
        userId: session.userId,
        studentName: session.studentName,
        status: session.status
      });
    } catch (error: any) {
      console.error('[RealtimeSession] Error creating session:', error);
      res.status(500).json({ message: "Error creating session: " + error.message });
    }
  });

  // HTTP fallback endpoint to end voice session (for Railway proxy issues)
  // This provides a reliable way to end sessions when WebSocket close frames are dropped
  app.post("/api/voice-sessions/:sessionId/end", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const user = req.user as any;
      const { sessionId } = req.params;

      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("[HTTP Session End] 🛑 RECEIVED HTTP END REQUEST");
      console.log("[HTTP Session End] Session ID:", sessionId);
      console.log("[HTTP Session End] User ID:", user.id);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      // Get session from database
      const sessions = await db.select()
        .from(realtimeSessions)
        .where(eq(realtimeSessions.id, sessionId))
        .limit(1);
      
      const session = sessions[0];

      if (!session) {
        console.log("[HTTP Session End] ❌ Session not found:", sessionId);
        return res.status(404).json({ error: "Session not found" });
      }

      // Verify session belongs to user
      if (session.userId !== user.id) {
        console.log("[HTTP Session End] ❌ Unauthorized - session belongs to different user");
        return res.status(403).json({ error: "Unauthorized" });
      }

      // Check if already ended
      if (session.status === 'ended' && session.endedAt) {
        console.log("[HTTP Session End] ℹ️ Session already ended at:", session.endedAt);
        return res.json({
          success: true,
          message: "Session already ended",
          endedAt: session.endedAt,
          minutesUsed: session.minutesUsed
        });
      }

      // Calculate session duration
      const startTime = session.createdAt ? new Date(session.createdAt) : new Date();
      const endTime = new Date();
      const durationSeconds = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
      const durationMinutes = Math.max(1, Math.ceil(durationSeconds / 60));

      console.log("[HTTP Session End] ⏱️ Duration:", durationSeconds, "seconds (", durationMinutes, "minutes)");

      // Update session in database
      console.log("[HTTP Session End] 💾 Updating database...");
      await db.update(realtimeSessions)
        .set({
          endedAt: endTime,
          status: 'ended',
          minutesUsed: durationMinutes,
        })
        .where(eq(realtimeSessions.id, sessionId));

      console.log("[HTTP Session End] ✅ Database updated");

      // Deduct minutes from user balance
      console.log("[HTTP Session End] 💰 Deducting minutes...");
      const { deductMinutes } = await import('./services/voice-minutes');
      await deductMinutes(user.id, durationMinutes);
      console.log("[HTTP Session End] ✅ Deducted", durationMinutes, "minutes from user", user.id);

      console.log("[HTTP Session End] ✅ Session ended successfully via HTTP");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      res.json({
        success: true,
        sessionId: sessionId,
        minutesUsed: durationMinutes,
        endedAt: endTime,
        transcript: session.transcript
      });

    } catch (error: any) {
      console.error("[HTTP Session End] ❌ Error ending session:", error);
      res.status(500).json({ error: "Failed to end session: " + error.message });
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

  // Update email summary frequency preference
  app.patch("/api/user/email-summary-preferences", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const user = req.user as any;
      const { emailSummaryFrequency } = req.body;
      
      // Validate the frequency value
      const validFrequencies = ['off', 'per_session', 'daily', 'weekly'];
      if (!validFrequencies.includes(emailSummaryFrequency)) {
        return res.status(400).json({ 
          message: "Invalid email summary frequency. Must be one of: off, per_session, daily, weekly" 
        });
      }
      
      // Update user's email summary frequency
      await storage.updateUserSettings(user.id, { emailSummaryFrequency });
      
      res.json({ 
        success: true, 
        preferences: { emailSummaryFrequency } 
      });
    } catch (error: any) {
      console.error('[EmailSummaryPreferences] Error updating preferences:', error);
      res.status(500).json({ message: "Error updating preferences: " + error.message });
    }
  });

  // Get email summary preferences
  app.get("/api/user/email-summary-preferences", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const user = req.user as any;
      const userData = await storage.getUser(user.id);
      
      res.json({
        emailSummaryFrequency: userData?.emailSummaryFrequency || 'daily'
      });
    } catch (error: any) {
      console.error('[EmailSummaryPreferences] Error fetching preferences:', error);
      res.status(500).json({ message: "Error fetching preferences: " + error.message });
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

  // ==========================================
  // PRACTICE LESSONS CURRICULUM BROWSER API
  // ==========================================

  // Get all available grades
  app.get("/api/practice-lessons/grades", async (req, res) => {
    try {
      const { practiceLessons } = await import('@shared/schema');
      const { db } = await import('./db');
      const { sql } = await import('drizzle-orm');
      
      const result = await db.selectDistinct({ grade: practiceLessons.grade })
        .from(practiceLessons)
        .orderBy(practiceLessons.grade);
      
      const grades = result.map(r => r.grade);
      res.json({ grades });
    } catch (error: any) {
      console.error('[Practice Lessons] Error fetching grades:', error);
      res.status(500).json({ message: "Error fetching grades: " + error.message });
    }
  });

  // Get subjects for a specific grade
  app.get("/api/practice-lessons/subjects", async (req, res) => {
    try {
      const { grade } = req.query;
      if (!grade || typeof grade !== 'string') {
        return res.status(400).json({ message: "Grade parameter is required" });
      }

      const { practiceLessons } = await import('@shared/schema');
      const { db } = await import('./db');
      const { eq } = await import('drizzle-orm');
      
      const result = await db.selectDistinct({ subject: practiceLessons.subject })
        .from(practiceLessons)
        .where(eq(practiceLessons.grade, grade))
        .orderBy(practiceLessons.subject);
      
      const subjects = result.map(r => r.subject);
      res.json({ subjects, grade });
    } catch (error: any) {
      console.error('[Practice Lessons] Error fetching subjects:', error);
      res.status(500).json({ message: "Error fetching subjects: " + error.message });
    }
  });

  // Get topics for a specific grade and subject
  app.get("/api/practice-lessons/topics", async (req, res) => {
    try {
      const { grade, subject } = req.query;
      if (!grade || !subject || typeof grade !== 'string' || typeof subject !== 'string') {
        return res.status(400).json({ message: "Grade and subject parameters are required" });
      }

      const { practiceLessons } = await import('@shared/schema');
      const { db } = await import('./db');
      const { eq, and } = await import('drizzle-orm');
      
      const result = await db.selectDistinct({ topic: practiceLessons.topic })
        .from(practiceLessons)
        .where(and(
          eq(practiceLessons.grade, grade),
          eq(practiceLessons.subject, subject)
        ))
        .orderBy(practiceLessons.topic);
      
      const topics = result.map(r => r.topic);
      res.json({ topics, grade, subject });
    } catch (error: any) {
      console.error('[Practice Lessons] Error fetching topics:', error);
      res.status(500).json({ message: "Error fetching topics: " + error.message });
    }
  });

  // Get all lessons for a specific grade, subject, and optionally topic
  app.get("/api/practice-lessons", async (req, res) => {
    try {
      const { grade, subject, topic, studentId } = req.query;
      
      const { practiceLessons, studentLessonProgress } = await import('@shared/schema');
      const { db } = await import('./db');
      const { eq, and, asc } = await import('drizzle-orm');
      
      let conditions: any[] = [];
      
      if (grade && typeof grade === 'string') {
        conditions.push(eq(practiceLessons.grade, grade));
      }
      if (subject && typeof subject === 'string') {
        conditions.push(eq(practiceLessons.subject, subject));
      }
      if (topic && typeof topic === 'string') {
        conditions.push(eq(practiceLessons.topic, topic));
      }
      
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      
      const lessons = await db.select({
        id: practiceLessons.id,
        grade: practiceLessons.grade,
        subject: practiceLessons.subject,
        topic: practiceLessons.topic,
        lessonTitle: practiceLessons.lessonTitle,
        learningGoal: practiceLessons.learningGoal,
        difficultyLevel: practiceLessons.difficultyLevel,
        estimatedMinutes: practiceLessons.estimatedMinutes,
        orderIndex: practiceLessons.orderIndex,
      })
        .from(practiceLessons)
        .where(whereClause)
        .orderBy(asc(practiceLessons.orderIndex));
      
      // If studentId is provided, fetch their progress for these lessons
      let progressMap: Record<string, string> = {};
      if (studentId && typeof studentId === 'string') {
        const lessonIds = lessons.map(l => l.id);
        if (lessonIds.length > 0) {
          const progressRecords = await db.select({
            lessonId: studentLessonProgress.lessonId,
            status: studentLessonProgress.status,
          })
            .from(studentLessonProgress)
            .where(eq(studentLessonProgress.studentId, studentId));
          
          progressRecords.forEach(p => {
            progressMap[p.lessonId] = p.status || 'not_started';
          });
        }
      }
      
      const lessonsWithProgress = lessons.map(lesson => ({
        ...lesson,
        status: progressMap[lesson.id] || 'not_started',
      }));
      
      res.json({ lessons: lessonsWithProgress });
    } catch (error: any) {
      console.error('[Practice Lessons] Error fetching lessons:', error);
      res.status(500).json({ message: "Error fetching lessons: " + error.message });
    }
  });

  // Get a specific lesson by ID with full content
  app.get("/api/practice-lessons/:lessonId", async (req, res) => {
    try {
      const { lessonId } = req.params;
      const { studentId } = req.query;
      
      const { practiceLessons, studentLessonProgress } = await import('@shared/schema');
      const { db } = await import('./db');
      const { eq, and } = await import('drizzle-orm');
      
      const [lesson] = await db.select()
        .from(practiceLessons)
        .where(eq(practiceLessons.id, lessonId))
        .limit(1);
      
      if (!lesson) {
        return res.status(404).json({ message: "Lesson not found" });
      }
      
      // Get progress if studentId is provided
      let progress = null;
      if (studentId && typeof studentId === 'string') {
        const [progressRecord] = await db.select()
          .from(studentLessonProgress)
          .where(and(
            eq(studentLessonProgress.studentId, studentId),
            eq(studentLessonProgress.lessonId, lessonId)
          ))
          .limit(1);
        
        progress = progressRecord || null;
      }
      
      res.json({ lesson, progress });
    } catch (error: any) {
      console.error('[Practice Lessons] Error fetching lesson:', error);
      res.status(500).json({ message: "Error fetching lesson: " + error.message });
    }
  });

  // Start a lesson for a student (creates or updates progress)
  app.post("/api/practice-lessons/:lessonId/start", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const { lessonId } = req.params;
      const { studentId, sessionId } = req.body;
      
      if (!studentId) {
        return res.status(400).json({ message: "studentId is required" });
      }
      
      const { studentLessonProgress, practiceLessons } = await import('@shared/schema');
      const { db } = await import('./db');
      const { eq, and } = await import('drizzle-orm');
      
      // Verify lesson exists
      const [lesson] = await db.select({ id: practiceLessons.id })
        .from(practiceLessons)
        .where(eq(practiceLessons.id, lessonId))
        .limit(1);
      
      if (!lesson) {
        return res.status(404).json({ message: "Lesson not found" });
      }
      
      // Check if progress already exists
      const [existingProgress] = await db.select()
        .from(studentLessonProgress)
        .where(and(
          eq(studentLessonProgress.studentId, studentId),
          eq(studentLessonProgress.lessonId, lessonId)
        ))
        .limit(1);
      
      if (existingProgress) {
        // Update existing progress to in_progress
        const [updated] = await db.update(studentLessonProgress)
          .set({
            status: 'in_progress',
            sessionId: sessionId || existingProgress.sessionId,
            startedAt: existingProgress.startedAt || new Date(),
            updatedAt: new Date(),
          })
          .where(eq(studentLessonProgress.id, existingProgress.id))
          .returning();
        
        res.json({ progress: updated, isNew: false });
      } else {
        // Create new progress
        const [newProgress] = await db.insert(studentLessonProgress)
          .values({
            studentId,
            lessonId,
            status: 'in_progress',
            sessionId: sessionId || null,
            startedAt: new Date(),
          })
          .returning();
        
        res.json({ progress: newProgress, isNew: true });
      }
    } catch (error: any) {
      console.error('[Practice Lessons] Error starting lesson:', error);
      res.status(500).json({ message: "Error starting lesson: " + error.message });
    }
  });

  // Complete a lesson for a student
  app.post("/api/practice-lessons/:lessonId/complete", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const { lessonId } = req.params;
      const { studentId, timeSpentSeconds } = req.body;
      
      if (!studentId) {
        return res.status(400).json({ message: "studentId is required" });
      }
      
      const { studentLessonProgress } = await import('@shared/schema');
      const { db } = await import('./db');
      const { eq, and } = await import('drizzle-orm');
      
      // Find the progress record
      const [existingProgress] = await db.select()
        .from(studentLessonProgress)
        .where(and(
          eq(studentLessonProgress.studentId, studentId),
          eq(studentLessonProgress.lessonId, lessonId)
        ))
        .limit(1);
      
      if (!existingProgress) {
        return res.status(404).json({ message: "No progress found for this lesson. Please start the lesson first." });
      }
      
      // Update to completed
      const [updated] = await db.update(studentLessonProgress)
        .set({
          status: 'completed',
          completedAt: new Date(),
          timeSpentSeconds: timeSpentSeconds || existingProgress.timeSpentSeconds,
          updatedAt: new Date(),
        })
        .where(eq(studentLessonProgress.id, existingProgress.id))
        .returning();
      
      res.json({ progress: updated });
    } catch (error: any) {
      console.error('[Practice Lessons] Error completing lesson:', error);
      res.status(500).json({ message: "Error completing lesson: " + error.message });
    }
  });

  // Get student's lesson progress summary
  app.get("/api/practice-lessons/student/:studentId/progress", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const { studentId } = req.params;
      const { grade, subject } = req.query;
      
      const { studentLessonProgress, practiceLessons } = await import('@shared/schema');
      const { db } = await import('./db');
      const { eq, and, sql } = await import('drizzle-orm');
      
      // Get counts by status
      let conditions: any[] = [eq(studentLessonProgress.studentId, studentId)];
      
      const progressRecords = await db.select({
        lessonId: studentLessonProgress.lessonId,
        status: studentLessonProgress.status,
        startedAt: studentLessonProgress.startedAt,
        completedAt: studentLessonProgress.completedAt,
        timeSpentSeconds: studentLessonProgress.timeSpentSeconds,
        lessonGrade: practiceLessons.grade,
        lessonSubject: practiceLessons.subject,
        lessonTopic: practiceLessons.topic,
        lessonTitle: practiceLessons.lessonTitle,
      })
        .from(studentLessonProgress)
        .innerJoin(practiceLessons, eq(studentLessonProgress.lessonId, practiceLessons.id))
        .where(and(...conditions));
      
      // Filter by grade/subject if provided
      let filteredRecords = progressRecords;
      if (grade && typeof grade === 'string') {
        filteredRecords = filteredRecords.filter(r => r.lessonGrade === grade);
      }
      if (subject && typeof subject === 'string') {
        filteredRecords = filteredRecords.filter(r => r.lessonSubject === subject);
      }
      
      const completed = filteredRecords.filter(r => r.status === 'completed').length;
      const inProgress = filteredRecords.filter(r => r.status === 'in_progress').length;
      const totalTimeSeconds = filteredRecords.reduce((sum, r) => sum + (r.timeSpentSeconds || 0), 0);
      
      res.json({
        studentId,
        completed,
        inProgress,
        totalTimeSeconds,
        recentLessons: filteredRecords.slice(0, 5),
      });
    } catch (error: any) {
      console.error('[Practice Lessons] Error fetching progress:', error);
      res.status(500).json({ message: "Error fetching progress: " + error.message });
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
  // Trial verification reminder - run now (admin only)
  app.post("/api/admin/trial-reminders", requireAdmin, async (req, res) => {
    try {
      console.log('[Admin] Running trial verification reminders...');
      const { runTrialRemindersNow } = await import('./jobs/trial-reminders');
      const result = await runTrialRemindersNow();
      console.log(`[Admin] Trial reminders complete: sent=${result.sent}, skipped=${result.skipped}, errors=${result.errors}`);
      res.json({
        success: true,
        message: 'Pending reminders processed',
        ...result,
      });
    } catch (error: any) {
      console.error('[Admin] Trial reminders error:', error);
      res.status(500).json({ error: error.message });
    }
  });

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

  // Repair broken subscription IDs - finds users with active status but no subscription ID
  app.post("/api/admin/repair-subscriptions", requireAdmin, async (req, res) => {
    try {
      console.log('[Admin] 🔧 Starting subscription repair scan...');
      
      // Find all users with broken subscription state
      const allUsers = await storage.getAdminUsers({ page: 1, limit: 1000, search: '' });
      const brokenUsers = allUsers.users.filter(
        (u: any) => u.subscriptionStatus === 'active' && !u.stripeSubscriptionId && u.stripeCustomerId
      );
      
      console.log(`[Admin] Found ${brokenUsers.length} accounts with missing subscription IDs`);
      
      if (brokenUsers.length === 0) {
        return res.json({
          success: true,
          message: 'No broken subscriptions found',
          totalBroken: 0,
          results: []
        });
      }
      
      const Stripe = (await import('stripe')).default;
      const stripe = process.env.STRIPE_SECRET_KEY
        ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-08-27.basil' as any })
        : null;
      
      if (!stripe) {
        return res.status(500).json({ error: 'Stripe not configured' });
      }
      
      const results: any[] = [];
      
      for (const user of brokenUsers) {
        try {
          // Look up subscription in Stripe
          const subscriptions = await stripe.subscriptions.list({
            customer: user.stripeCustomerId!,
            limit: 1,
          });
          
          if (subscriptions.data.length > 0) {
            const sub = subscriptions.data[0];
            
            await storage.updateUserStripeInfo(user.id, user.stripeCustomerId!, sub.id);
            
            // Also update status to match Stripe
            const stripeStatus = sub.status === 'active' ? 'active' : 
                                 sub.status === 'canceled' ? 'canceled' : 
                                 sub.status === 'past_due' ? 'past_due' : 'inactive';
            
            if (stripeStatus !== 'active') {
              await storage.updateUserSettings(user.id, { subscriptionStatus: stripeStatus as any });
            }
            
            results.push({
              email: user.email,
              status: 'fixed',
              subscriptionId: sub.id,
              subscriptionStatus: sub.status
            });
            
            console.log(`[Admin] ✅ Fixed: ${user.email} → ${sub.id}`);
          } else {
            // No subscription found - mark as inactive
            await storage.updateUserSettings(user.id, { subscriptionStatus: 'inactive' });
            
            results.push({
              email: user.email,
              status: 'marked_inactive',
              reason: 'No Stripe subscription found'
            });
            
            console.log(`[Admin] ⚠️ Marked inactive: ${user.email} (no Stripe subscription)`);
          }
        } catch (error: any) {
          results.push({
            email: user.email,
            status: 'error',
            error: error.message
          });
          console.error(`[Admin] ❌ Error repairing ${user.email}:`, error.message);
        }
      }
      
      console.log(`[Admin] 🔧 Repair complete: ${results.filter(r => r.status === 'fixed').length} fixed, ${results.filter(r => r.status === 'marked_inactive').length} marked inactive`);
      
      res.json({
        success: true,
        totalBroken: brokenUsers.length,
        results
      });
      
    } catch (error: any) {
      console.error('[Admin] Repair subscriptions error:', error);
      res.status(500).json({ error: 'Repair failed: ' + error.message });
    }
  });

  // Admin duplicate check - finds accounts with issues
  app.get("/api/admin/duplicate-check", requireAdmin, async (req, res) => {
    try {
      console.log('[Admin] 🔍 Running duplicate and integrity check...');
      
      // Get all users for analysis
      const allUsers = await storage.getAdminUsers({ page: 1, limit: 10000, search: '' });
      
      // Find duplicate emails (case-insensitive)
      const emailCounts: Record<string, any[]> = {};
      for (const user of allUsers.users) {
        const normalizedEmail = (user.email || '').toLowerCase();
        if (!emailCounts[normalizedEmail]) {
          emailCounts[normalizedEmail] = [];
        }
        emailCounts[normalizedEmail].push({
          id: user.id,
          email: user.email,
          subscriptionStatus: user.subscriptionStatus,
          subscriptionPlan: user.subscriptionPlan,
          stripeCustomerId: user.stripeCustomerId,
          stripeSubscriptionId: user.stripeSubscriptionId,
          createdAt: user.createdAt
        });
      }
      
      const duplicateEmails = Object.entries(emailCounts)
        .filter(([_, users]) => users.length > 1)
        .map(([email, users]) => ({ email, count: users.length, accounts: users }));
      
      // Find users with no Stripe subscription ID but active status
      const missingStripeIds = allUsers.users.filter(
        (u: any) => u.subscriptionStatus === 'active' && !u.stripeSubscriptionId
      ).map((u: any) => ({
        id: u.id,
        email: u.email,
        subscriptionStatus: u.subscriptionStatus,
        subscriptionPlan: u.subscriptionPlan,
        stripeCustomerId: u.stripeCustomerId
      }));
      
      // Find users with active status but no Stripe customer ID
      const missingCustomerIds = allUsers.users.filter(
        (u: any) => u.subscriptionStatus === 'active' && !u.stripeCustomerId
      ).map((u: any) => ({
        id: u.id,
        email: u.email,
        subscriptionStatus: u.subscriptionStatus,
        subscriptionPlan: u.subscriptionPlan
      }));
      
      console.log(`[Admin] Found ${duplicateEmails.length} duplicate emails, ${missingStripeIds.length} missing subscription IDs, ${missingCustomerIds.length} missing customer IDs`);
      
      res.json({
        duplicateEmails,
        missingStripeIds,
        missingCustomerIds,
        summary: {
          totalUsers: allUsers.users.length,
          duplicateEmailCount: duplicateEmails.length,
          missingStripeIdCount: missingStripeIds.length,
          missingCustomerIdCount: missingCustomerIds.length
        }
      });
      
    } catch (error: any) {
      console.error('[Admin] Duplicate check error:', error);
      res.status(500).json({ error: 'Duplicate check failed: ' + error.message });
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

  // ✅ FIX #1: Add individual user details endpoint
  app.get("/api/admin/users/:id", requireAdmin, auditActions.viewUsers, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Get user details
      const user = await storage.getUserById(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Get user's session history from realtime_sessions
      const { realtimeSessions } = await import('@shared/schema');
      const { desc, eq } = await import('drizzle-orm');
      
      const sessions = await db.select({
        id: realtimeSessions.id,
        studentName: realtimeSessions.studentName,
        subject: realtimeSessions.subject,
        ageGroup: realtimeSessions.ageGroup,
        language: realtimeSessions.language,
        minutesUsed: realtimeSessions.minutesUsed,
        startedAt: realtimeSessions.startedAt,
        endedAt: realtimeSessions.endedAt,
        status: realtimeSessions.status,
      })
      .from(realtimeSessions)
      .where(eq(realtimeSessions.userId, id))
      .orderBy(desc(realtimeSessions.startedAt))
      .limit(50);

      // Get user's documents
      const documents = await storage.getUserDocuments(id);

      // Calculate stats
      const totalSessions = sessions.filter(s => s.status === 'ended').length;
      const totalMinutes = sessions
        .filter(s => s.status === 'ended')
        .reduce((sum, s) => sum + (s.minutesUsed || 0), 0);

      res.json({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          studentName: user.studentName,
          gradeLevel: user.gradeLevel,
          subscriptionPlan: user.subscriptionPlan,
          subscriptionStatus: user.subscriptionStatus,
          subscriptionMinutesLimit: user.subscriptionMinutesLimit,
          subscriptionMinutesUsed: user.subscriptionMinutesUsed,
          purchasedMinutesBalance: user.purchasedMinutesBalance,
          createdAt: user.createdAt,
          emailVerified: user.emailVerified,
          isAdmin: user.isAdmin,
          isDisabled: user.isDisabled,
          deletedAt: user.deletedAt,
          stripeCustomerId: user.stripeCustomerId,
          stripeSubscriptionId: user.stripeSubscriptionId,
        },
        stats: {
          totalSessions,
          totalMinutes,
          documentsCount: documents.length,
        },
        recentSessions: sessions.slice(0, 10),
        documents: documents.slice(0, 10),
      });
    } catch (error: any) {
      console.error('[Admin] Error fetching user details:', error);
      res.status(500).json({ message: "Error fetching user details: " + error.message });
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

  // Admin: Get site views stats (unique visits, today, this week, this month, history)
  // Note: Using page_views table which now stores site visits (one per session)
  // All queries use US Central timezone (America/Chicago) for consistent daily resets at midnight Central
  const getSiteViewsStats = async (req: any, res: any) => {
    try {
      // Today's views (Central timezone - resets at midnight Central)
      const todayResult = await db.execute(sql`
        SELECT COUNT(*) as count FROM page_views 
        WHERE created_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'America/Chicago') AT TIME ZONE 'America/Chicago'
      `);
      const todayCount = parseInt(todayResult.rows[0]?.count as string || '0', 10);
      
      // This week's views (Monday start, Central timezone)
      const thisWeekResult = await db.execute(sql`
        SELECT COUNT(*) as count FROM page_views 
        WHERE created_at >= DATE_TRUNC('week', NOW() AT TIME ZONE 'America/Chicago') AT TIME ZONE 'America/Chicago'
      `);
      const thisWeekViews = parseInt(thisWeekResult.rows[0]?.count as string || '0', 10);
      
      // Last week's views (previous Monday 00:00 to this Monday 00:00, Central timezone)
      const lastWeekResult = await db.execute(sql`
        SELECT COUNT(*) as count FROM page_views 
        WHERE created_at >= DATE_TRUNC('week', (NOW() AT TIME ZONE 'America/Chicago') - INTERVAL '7 days') AT TIME ZONE 'America/Chicago'
          AND created_at < DATE_TRUNC('week', NOW() AT TIME ZONE 'America/Chicago') AT TIME ZONE 'America/Chicago'
      `);
      const lastWeekViews = parseInt(lastWeekResult.rows[0]?.count as string || '0', 10);
      
      // Calculate Week-over-Week percentage
      let weeklyWoWPercent: number | null = null;
      if (lastWeekViews <= 0) {
        if (thisWeekViews > 0) {
          weeklyWoWPercent = null; // Can't calculate % from 0
        } else {
          weeklyWoWPercent = 0; // Both are 0
        }
      } else {
        weeklyWoWPercent = Math.round(((thisWeekViews - lastWeekViews) / lastWeekViews) * 1000) / 10; // Round to 1 decimal
      }
      
      // This month's views (Central timezone)
      const thisMonthResult = await db.execute(sql`
        SELECT COUNT(*) as count FROM page_views 
        WHERE created_at >= DATE_TRUNC('month', NOW() AT TIME ZONE 'America/Chicago') AT TIME ZONE 'America/Chicago'
      `);
      const thisMonthViews = parseInt(thisMonthResult.rows[0]?.count as string || '0', 10);
      
      // Last month's views (Central timezone)
      const lastMonthResult = await db.execute(sql`
        SELECT COUNT(*) as count FROM page_views 
        WHERE created_at >= DATE_TRUNC('month', (NOW() AT TIME ZONE 'America/Chicago') - INTERVAL '1 month') AT TIME ZONE 'America/Chicago'
          AND created_at < DATE_TRUNC('month', NOW() AT TIME ZONE 'America/Chicago') AT TIME ZONE 'America/Chicago'
      `);
      const lastMonthViews = parseInt(lastMonthResult.rows[0]?.count as string || '0', 10);
      
      // Last 12 months breakdown (Central timezone)
      const historyResult = await db.execute(sql`
        SELECT 
          TO_CHAR(DATE_TRUNC('month', created_at AT TIME ZONE 'America/Chicago'), 'YYYY-MM') as month,
          TO_CHAR(DATE_TRUNC('month', created_at AT TIME ZONE 'America/Chicago'), 'Mon YYYY') as label,
          COUNT(*) as views
        FROM page_views
        WHERE created_at >= DATE_TRUNC('month', (NOW() AT TIME ZONE 'America/Chicago') - INTERVAL '11 months') AT TIME ZONE 'America/Chicago'
        GROUP BY DATE_TRUNC('month', created_at AT TIME ZONE 'America/Chicago')
        ORDER BY month DESC
      `);
      
      const monthlyHistory = historyResult.rows.map((row: any) => ({
        month: row.month,
        label: row.label,
        views: parseInt(row.views as string || '0', 10)
      }));
      
      res.json({ 
        todayCount,
        thisWeekViews,
        lastWeekViews,
        weeklyWoWPercent,
        thisMonthViews, 
        lastMonthViews,
        monthlyHistory 
      });
    } catch (error: any) {
      console.error('[Admin] Error fetching site views stats:', error);
      res.json({ todayCount: 0, thisWeekViews: 0, lastWeekViews: 0, weeklyWoWPercent: null, thisMonthViews: 0, lastMonthViews: 0, monthlyHistory: [] });
    }
  };
  
  // Register both endpoints - new name and legacy alias
  app.get("/api/admin/site-views-stats", requireAdmin, getSiteViewsStats);
  app.get("/api/admin/page-views-stats", requireAdmin, getSiteViewsStats);

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

  // ========== ADMIN ACCOUNT MANAGEMENT ENDPOINTS ==========

  // Admin: Cancel user's subscription (Admin → Stripe → DB)
  app.post("/api/admin/users/:id/cancel-subscription", requireAdmin, async (req, res) => {
    const adminUser = req.user as any;
    const { id: userId } = req.params;
    const { cancelImmediately = true } = req.body;

    console.log(`[Admin] Cancel subscription request for user ${userId} by admin ${adminUser.id}, immediate: ${cancelImmediately}`);

    try {
      // Get the target user
      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      // Check if there's a Stripe subscription to cancel
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        return res.status(500).json({ success: false, message: "Stripe is not configured" });
      }

      const Stripe = await import('stripe');
      const stripe = new Stripe.default(stripeKey, { apiVersion: "2025-08-27.basil" });

      let stripeResult: any = null;
      let subscriptionsCanceled = 0;

      // Try to cancel by subscription ID first
      if (targetUser.stripeSubscriptionId) {
        try {
          const subscription = await stripe.subscriptions.retrieve(targetUser.stripeSubscriptionId);
          if (subscription.status !== 'canceled') {
            if (cancelImmediately) {
              stripeResult = await stripe.subscriptions.cancel(targetUser.stripeSubscriptionId);
            } else {
              stripeResult = await stripe.subscriptions.update(targetUser.stripeSubscriptionId, {
                cancel_at_period_end: true,
              });
            }
            subscriptionsCanceled = 1;
            console.log(`[Admin] Stripe subscription ${targetUser.stripeSubscriptionId} canceled (immediate: ${cancelImmediately})`);
          } else {
            console.log(`[Admin] Subscription ${targetUser.stripeSubscriptionId} already canceled`);
          }
        } catch (subError: any) {
          console.log(`[Admin] Error with subscription ID, trying customer lookup: ${subError.message}`);
        }
      }

      // If no subscription ID or it failed, try by customer ID
      if (subscriptionsCanceled === 0 && targetUser.stripeCustomerId) {
        const subscriptions = await stripe.subscriptions.list({
          customer: targetUser.stripeCustomerId,
          status: 'active',
        });

        for (const sub of subscriptions.data) {
          if (cancelImmediately) {
            await stripe.subscriptions.cancel(sub.id);
          } else {
            await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
          }
          subscriptionsCanceled++;
          console.log(`[Admin] Canceled subscription ${sub.id}`);
        }
      }

      if (subscriptionsCanceled === 0 && !targetUser.stripeCustomerId && !targetUser.stripeSubscriptionId) {
        // No Stripe info at all - just update DB
        console.log(`[Admin] No Stripe subscription found, updating DB only`);
      }

      // Update database
      const now = new Date();
      const newStatus = cancelImmediately ? 'canceled' : 'active'; // 'active' with cancel_at_period_end becomes 'canceling' behavior
      const subscriptionEndsAt = stripeResult?.current_period_end 
        ? new Date(stripeResult.current_period_end * 1000) 
        : (cancelImmediately ? now : null);

      await db.update(users)
        .set({
          subscriptionStatus: cancelImmediately ? 'canceled' : 'active',
          subscriptionEndsAt: subscriptionEndsAt,
          canceledAt: now,
          canceledByAdminId: adminUser.id,
          updatedAt: now,
        })
        .where(eq(users.id, userId));

      // Create audit log
      await storage.createAdminLog({
        adminId: adminUser.id,
        action: cancelImmediately ? 'cancel_subscription_immediate' : 'cancel_subscription_period_end',
        targetType: 'subscription',
        targetId: userId,
        details: {
          targetEmail: targetUser.email,
          stripeSubscriptionId: targetUser.stripeSubscriptionId,
          stripeCustomerId: targetUser.stripeCustomerId,
          subscriptionsCanceled,
          cancelImmediately,
          previousStatus: targetUser.subscriptionStatus,
        },
      });

      res.json({
        success: true,
        message: subscriptionsCanceled > 0 
          ? `Subscription ${cancelImmediately ? 'canceled immediately' : 'set to cancel at period end'}`
          : 'No active Stripe subscription found, database updated',
        subscriptionsCanceled,
        cancelImmediately,
      });
    } catch (error: any) {
      console.error(`[Admin] Error canceling subscription:`, error);
      
      // Log failed attempt
      await storage.createAdminLog({
        adminId: adminUser.id,
        action: 'cancel_subscription_failed',
        targetType: 'subscription',
        targetId: userId,
        details: { error: error.message },
      });

      res.status(500).json({ success: false, message: `Failed to cancel subscription: ${error.message}` });
    }
  });

  // Admin: Disable/Enable user account (Admin → DB only)
  app.post("/api/admin/users/:id/disable", requireAdmin, async (req, res) => {
    const adminUser = req.user as any;
    const { id: userId } = req.params;
    const { isDisabled } = req.body;

    if (typeof isDisabled !== 'boolean') {
      return res.status(400).json({ success: false, message: "isDisabled must be a boolean" });
    }

    console.log(`[Admin] ${isDisabled ? 'Disable' : 'Enable'} account request for user ${userId} by admin ${adminUser.id}`);

    try {
      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      // Prevent disabling yourself
      if (userId === adminUser.id) {
        return res.status(400).json({ success: false, message: "Cannot disable your own account" });
      }

      const now = new Date();
      await db.update(users)
        .set({
          isDisabled: isDisabled,
          disabledAt: isDisabled ? now : null,
          disabledByAdminId: isDisabled ? adminUser.id : null,
          updatedAt: now,
        })
        .where(eq(users.id, userId));

      // Create audit log
      await storage.createAdminLog({
        adminId: adminUser.id,
        action: isDisabled ? 'disable_account' : 'enable_account',
        targetType: 'user',
        targetId: userId,
        details: {
          targetEmail: targetUser.email,
          targetUsername: targetUser.username,
        },
      });

      res.json({
        success: true,
        message: isDisabled ? 'Account disabled' : 'Account enabled',
        isDisabled,
      });
    } catch (error: any) {
      console.error(`[Admin] Error toggling account status:`, error);
      res.status(500).json({ success: false, message: `Failed to update account: ${error.message}` });
    }
  });

  // Admin: Delete user account (Soft Delete) (Admin → Stripe → DB)
  app.post("/api/admin/users/:id/delete", requireAdmin, async (req, res) => {
    const adminUser = req.user as any;
    const { id: userId } = req.params;
    const { confirm, purgeData = false, deleteStripeCustomer = false, reason = '' } = req.body;

    if (confirm !== 'DELETE') {
      return res.status(400).json({ success: false, message: "Must confirm with 'DELETE'" });
    }

    console.log(`[Admin] Delete account request for user ${userId} by admin ${adminUser.id}, purge: ${purgeData}, deleteStripe: ${deleteStripeCustomer}`);

    try {
      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      // Prevent deleting yourself
      if (userId === adminUser.id) {
        return res.status(400).json({ success: false, message: "Cannot delete your own account" });
      }

      // Check if already deleted
      if (targetUser.deletedAt) {
        return res.status(400).json({ success: false, message: "Account already deleted" });
      }

      const stripeKey = process.env.STRIPE_SECRET_KEY;
      let stripeOperations: any = { subscriptionCanceled: false, customerDeleted: false };

      // Step 1: Cancel Stripe subscription if exists
      if (stripeKey && (targetUser.stripeSubscriptionId || targetUser.stripeCustomerId)) {
        const Stripe = await import('stripe');
        const stripe = new Stripe.default(stripeKey, { apiVersion: "2025-08-27.basil" });

        // Cancel subscription
        if (targetUser.stripeSubscriptionId) {
          try {
            const subscription = await stripe.subscriptions.retrieve(targetUser.stripeSubscriptionId);
            if (subscription.status !== 'canceled') {
              await stripe.subscriptions.cancel(targetUser.stripeSubscriptionId);
              stripeOperations.subscriptionCanceled = true;
              console.log(`[Admin] Canceled subscription ${targetUser.stripeSubscriptionId}`);
            }
          } catch (e: any) {
            console.log(`[Admin] Subscription cancel note: ${e.message}`);
          }
        }

        // Also check for any active subscriptions by customer ID
        if (targetUser.stripeCustomerId) {
          try {
            const subs = await stripe.subscriptions.list({ customer: targetUser.stripeCustomerId, status: 'active' });
            for (const sub of subs.data) {
              await stripe.subscriptions.cancel(sub.id);
              stripeOperations.subscriptionCanceled = true;
            }
          } catch (e: any) {
            console.log(`[Admin] Customer subscription check note: ${e.message}`);
          }
        }

        // Step 2: Delete Stripe customer if requested (TEST ACCOUNTS ONLY)
        if (deleteStripeCustomer && targetUser.stripeCustomerId) {
          try {
            await stripe.customers.del(targetUser.stripeCustomerId);
            stripeOperations.customerDeleted = true;
            console.log(`[Admin] Deleted Stripe customer ${targetUser.stripeCustomerId}`);
          } catch (e: any) {
            console.log(`[Admin] Customer deletion note: ${e.message}`);
          }
        }
      }

      // Step 3: Purge data if requested
      let purgeResults: any = {};
      if (purgeData) {
        // Delete user documents
        const deletedDocs = await db.delete(userDocuments).where(eq(userDocuments.userId, userId)).returning();
        purgeResults.documentsDeleted = deletedDocs.length;

        // Delete document chunks
        const deletedChunks = await db.delete(documentChunks).where(eq(documentChunks.userId, userId)).returning();
        purgeResults.chunksDeleted = deletedChunks.length;

        // Delete document embeddings
        const deletedEmbeddings = await db.delete(documentEmbeddings).where(eq(documentEmbeddings.userId, userId)).returning();
        purgeResults.embeddingsDeleted = deletedEmbeddings.length;

        // Delete sessions/transcripts
        const deletedSessions = await db.delete(learningSessions).where(eq(learningSessions.userId, userId)).returning();
        purgeResults.sessionsDeleted = deletedSessions.length;

        console.log(`[Admin] Purged data:`, purgeResults);
      }

      // Step 4: Soft delete in database
      const now = new Date();
      await db.update(users)
        .set({
          deletedAt: now,
          deletedByAdminId: adminUser.id,
          deletedReason: reason || null,
          isDisabled: true,
          disabledAt: now,
          disabledByAdminId: adminUser.id,
          subscriptionStatus: 'canceled',
          canceledAt: now,
          canceledByAdminId: adminUser.id,
          updatedAt: now,
        })
        .where(eq(users.id, userId));

      // Create comprehensive audit log
      await storage.createAdminLog({
        adminId: adminUser.id,
        action: 'delete_account',
        targetType: 'user',
        targetId: userId,
        details: {
          targetEmail: targetUser.email,
          targetUsername: targetUser.username,
          reason,
          purgeData,
          purgeResults,
          deleteStripeCustomer,
          stripeOperations,
          stripeCustomerId: targetUser.stripeCustomerId,
          stripeSubscriptionId: targetUser.stripeSubscriptionId,
        },
      });

      res.json({
        success: true,
        message: 'Account deleted successfully',
        stripeOperations,
        purgeResults: purgeData ? purgeResults : null,
      });
    } catch (error: any) {
      console.error(`[Admin] Error deleting account:`, error);
      
      // Log failed attempt
      await storage.createAdminLog({
        adminId: adminUser.id,
        action: 'delete_account_failed',
        targetType: 'user',
        targetId: userId,
        details: { error: error.message, reason },
      });

      res.status(500).json({ success: false, message: `Failed to delete account: ${error.message}` });
    }
  });

  // ========== END ADMIN ACCOUNT MANAGEMENT ENDPOINTS ==========

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

  // Admin: Get enhanced analytics data
  app.get("/api/admin/analytics", requireAdmin, auditActions.viewAnalytics, async (req, res) => {
    try {
      const stats = await storage.getAdminStats();
      
      // Calculate new users this month (mock - would need date filtering in real implementation)
      const newUsersThisMonth = Math.floor((stats.totalUsers || 0) * 0.15);
      
      // Calculate sessions this week (mock)
      const sessionsThisWeek = Math.floor((stats.totalSessions || 0) * 0.25);
      
      // Get recent sessions from database
      let recentSessions: any[] = [];
      let totalVoiceMinutes = 0;
      let usageBySubject: any[] = [];
      
      try {
        const { realtimeSessions } = await import('@shared/schema');
        const { desc, sql } = await import('drizzle-orm');
        
        // Fetch recent sessions (last 50)
        const sessions = await db.select({
          id: realtimeSessions.id,
          studentName: realtimeSessions.studentName,
          subject: realtimeSessions.subject,
          ageGroup: realtimeSessions.ageGroup,
          minutesUsed: realtimeSessions.minutesUsed,
          startedAt: realtimeSessions.startedAt,
          endedAt: realtimeSessions.endedAt,
          status: realtimeSessions.status,
        })
        .from(realtimeSessions)
        .orderBy(desc(realtimeSessions.startedAt))
        .limit(50);
        
        recentSessions = sessions.map(s => ({
          ...s,
          duration: s.startedAt && s.endedAt 
            ? `${Math.round((new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 60000)} min`
            : 'N/A'
        }));
        
        // Calculate total voice minutes
        const minutesResult = await db.execute(sql`
          SELECT COALESCE(SUM(minutes_used), 0) as total_minutes
          FROM realtime_sessions
          WHERE status = 'ended'
        `);
        totalVoiceMinutes = Number(minutesResult.rows[0]?.total_minutes || 0);
        
        // Calculate usage by subject
        const subjectResult = await db.execute(sql`
          SELECT 
            subject,
            COUNT(*) as sessions,
            COALESCE(SUM(minutes_used), 0) as minutes
          FROM realtime_sessions
          WHERE status = 'ended' AND subject IS NOT NULL
          GROUP BY subject
          ORDER BY sessions DESC
          LIMIT 10
        `);
        usageBySubject = (subjectResult.rows || []).map((row: any) => ({
          subject: row.subject,
          sessions: Number(row.sessions),
          minutes: Number(row.minutes)
        }));
      } catch (error) {
        console.error('[Admin Analytics] Error fetching session data:', error);
        // Continue with empty arrays if session data fetch fails
      }
      
      const analytics = {
        totalUsers: stats.totalUsers || 0,
        newUsersThisMonth,
        userGrowth: 15,
        mrr: stats.monthlyRevenue || 0,
        revenueGrowth: 8,
        activeSessions: stats.activeSessions || 0,
        sessionsThisWeek,
        sessionGrowth: 12,
        retentionRate: 85,
        retentionChange: 2,
        totalSessions: stats.totalSessions || 0,
        avgSessionLength: stats.avgSessionTime || "0 min",
        totalVoiceMinutes,
        totalMinutesUsed: totalVoiceMinutes,
        totalDocuments: stats.totalDocuments || 0,
        gradeDistribution: {
          k2: Math.floor((stats.totalUsers || 0) * 0.2),
          grades35: Math.floor((stats.totalUsers || 0) * 0.3),
          grades68: Math.floor((stats.totalUsers || 0) * 0.25),
          grades912: Math.floor((stats.totalUsers || 0) * 0.15),
          college: Math.floor((stats.totalUsers || 0) * 0.1),
        },
        revenueByPlan: {
          starter: stats.activeSubscriptions * 60,
          standard: stats.activeSubscriptions * 100,
          pro: stats.activeSubscriptions * 180,
          elite: stats.activeSubscriptions * 200,
        },
        recentSessions,
        usageBySubject,
      };

      res.json(analytics);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching analytics: " + error.message });
    }
  });

  // Admin: Export sessions to CSV
  app.get("/api/admin/sessions/export", requireAdmin, auditActions.exportData, async (req, res) => {
    try {
      // Export all realtime sessions
      const sessions = await db.select({
        id: realtimeSessions.id,
        userId: realtimeSessions.userId,
        studentName: realtimeSessions.studentName,
        subject: realtimeSessions.subject,
        language: realtimeSessions.language,
        ageGroup: realtimeSessions.ageGroup,
        startedAt: realtimeSessions.startedAt,
        endedAt: realtimeSessions.endedAt,
        minutesUsed: realtimeSessions.minutesUsed,
        status: realtimeSessions.status,
      }).from(realtimeSessions)
        .orderBy(desc(realtimeSessions.startedAt))
        .limit(1000);
      
      // Convert to CSV
      const csvHeader = 'Session ID,User ID,Student Name,Subject,Language,Age Group,Started At,Ended At,Minutes Used,Status\n';
      const csvRows = sessions.map(session => 
        `"${session.id}","${session.userId}","${session.studentName || 'N/A'}","${session.subject || 'N/A'}","${session.language || 'en'}","${session.ageGroup || 'N/A'}","${session.startedAt?.toISOString() || 'N/A'}","${session.endedAt?.toISOString() || 'N/A'}","${session.minutesUsed || 0}","${session.status || 'N/A'}"`
      ).join('\n');
      
      const csvData = csvHeader + csvRows;
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="sessions-export-${Date.now()}.csv"`);
      res.send(csvData);
    } catch (error: any) {
      res.status(500).json({ message: "Error exporting sessions: " + error.message });
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
  // Queries realtime_sessions table to get session counts per age group (grade band)
  // Completed sessions are defined as: status = 'ended' OR ended_at IS NOT NULL
  app.get("/api/admin/agents/stats", requireAdmin, auditActions.viewAnalytics, async (req, res) => {
    try {
      // Agent configuration with mapping from DB age_group values to admin gradeLevel values
      const agents = [
        { id: 'k2', name: 'K-2', envKey: 'ELEVENLABS_AGENT_K2', gradeLevel: 'kindergarten-2', dbAgeGroup: 'K-2' },
        { id: 'g3_5', name: 'Grades 3-5', envKey: 'ELEVENLABS_AGENT_35', gradeLevel: 'grades-3-5', dbAgeGroup: '3-5' },
        { id: 'g6_8', name: 'Grades 6-8', envKey: 'ELEVENLABS_AGENT_68', gradeLevel: 'grades-6-8', dbAgeGroup: '6-8' },
        { id: 'g9_12', name: 'Grades 9-12', envKey: 'ELEVENLABS_AGENT_912', gradeLevel: 'grades-9-12', dbAgeGroup: '9-12' },
        { id: 'college', name: 'College/Adult', envKey: 'ELEVENLABS_AGENT_COLLEGE', gradeLevel: 'college-adult', dbAgeGroup: 'College/Adult' },
      ];

      // Query to get all-time and last-7-days session counts per age_group in one pass
      // Completed session criteria: status = 'ended' OR ended_at IS NOT NULL
      const sessionStatsResult = await db.execute(sql`
        SELECT 
          age_group,
          COUNT(*) FILTER (WHERE status = 'ended' OR ended_at IS NOT NULL) as total_sessions,
          COUNT(*) FILTER (
            WHERE (status = 'ended' OR ended_at IS NOT NULL) 
            AND created_at >= NOW() - INTERVAL '7 days'
          ) as recent_sessions
        FROM realtime_sessions
        GROUP BY age_group
      `);

      // Build a map of age_group -> stats for quick lookup
      const statsMap = new Map<string, { total: number; recent: number }>();
      for (const row of sessionStatsResult.rows) {
        const ageGroup = row.age_group as string;
        statsMap.set(ageGroup, {
          total: parseInt(row.total_sessions as string || '0', 10),
          recent: parseInt(row.recent_sessions as string || '0', 10),
        });
      }

      // Build agent stats with real session counts
      const agentStats = agents.map((agent) => {
        const stats = statsMap.get(agent.dbAgeGroup) || { total: 0, recent: 0 };
        return {
          id: agent.id,
          name: agent.name,
          gradeLevel: agent.gradeLevel,
          agentId: process.env[agent.envKey] || 'agent_' + agent.id + Date.now().toString(36),
          totalSessions: stats.total,
          recentSessions: stats.recent,
          isConfigured: !!process.env[agent.envKey],
        };
      });

      res.json({ agents: agentStats });
    } catch (error: any) {
      console.error('[Admin] Agent stats error:', error);
      res.status(500).json({ message: "Error fetching agent stats: " + error.message });
    }
  });

  // Admin: Get trial leads (emails from free trial signups)
  app.get("/api/admin/trial-leads", requireAdmin, auditActions.viewAnalytics, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = (page - 1) * limit;

      const leads = await db.select({
        id: trialSessions.id,
        email: trialSessions.email,
        status: trialSessions.status,
        verifiedAt: trialSessions.verifiedAt,
        trialStartedAt: trialSessions.trialStartedAt,
        trialEndsAt: trialSessions.trialEndsAt,
        consumedSeconds: trialSessions.consumedSeconds,
        createdAt: trialSessions.createdAt,
      })
        .from(trialSessions)
        .orderBy(desc(trialSessions.createdAt))
        .limit(limit)
        .offset(offset);

      const countResult = await db.select({ count: sql<number>`count(*)` })
        .from(trialSessions);
      const total = Number(countResult[0]?.count || 0);

      res.json({
        leads,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error: any) {
      console.error('[Admin] Trial leads error:', error);
      res.status(500).json({ message: "Error fetching trial leads: " + error.message });
    }
  });

  // Admin: Export trial leads as CSV
  app.get("/api/admin/trial-leads/export", requireAdmin, auditActions.exportData, async (req, res) => {
    try {
      const leads = await db.select({
        email: trialSessions.email,
        status: trialSessions.status,
        verifiedAt: trialSessions.verifiedAt,
        trialStartedAt: trialSessions.trialStartedAt,
        consumedSeconds: trialSessions.consumedSeconds,
        createdAt: trialSessions.createdAt,
      })
        .from(trialSessions)
        .orderBy(desc(trialSessions.createdAt));

      const csvHeader = 'Email,Status,Verified At,Trial Started,Seconds Used,Created At\n';
      const csvRows = leads.map(lead => 
        `"${lead.email || ''}","${lead.status || ''}","${lead.verifiedAt || ''}","${lead.trialStartedAt || ''}","${lead.consumedSeconds || 0}","${lead.createdAt || ''}"`
      ).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="trial-leads-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvHeader + csvRows);
    } catch (error: any) {
      console.error('[Admin] Trial leads export error:', error);
      res.status(500).json({ message: "Error exporting trial leads: " + error.message });
    }
  });

  // Admin: Get safety incidents
  app.get("/api/admin/safety-incidents", requireAdmin, auditActions.viewAnalytics, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = (page - 1) * limit;

      const incidents = await db.select()
        .from(safetyIncidents)
        .orderBy(desc(safetyIncidents.createdAt))
        .limit(limit)
        .offset(offset);

      const countResult = await db.select({ count: sql<number>`count(*)` })
        .from(safetyIncidents);
      const total = Number(countResult[0]?.count || 0);

      res.json({
        incidents,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error: any) {
      console.error('[Admin] Safety incidents error:', error);
      res.status(500).json({ message: "Error fetching safety incidents: " + error.message });
    }
  });

  // AI tutor chat endpoint (Legacy - replaced by custom voice WebSocket)
  // Commented out as we're using the custom voice stack now
  /*
  app.post("/api/chat", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const user = req.user as any;
      const { message, lessonId, sessionId } = req.body;

      // This used OpenAI which is no longer used
      // const response = await openaiService.generateTutorResponse(message, {
      //   userId: user.id,
      //   lessonId,
      //   sessionId,
      // });

      // res.json({ response });
      res.status(501).json({ message: "Chat endpoint deprecated - use voice WebSocket instead" });
    } catch (error: any) {
      res.status(500).json({ message: "Error generating response: " + error.message });
    }
  });
  */

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
