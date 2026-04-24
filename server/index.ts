/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 * 
 * This source code is confidential and proprietary.
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */

// DIAGNOSTIC: Prove logs are flowing to the same place we're grepping
console.log('██████ SERVER BOOT ██████', new Date().toISOString(), 'pid=', process.pid);
console.log('LOG DESTINATION CHECK: stdout is active');
console.log('DEPLOY MARKER: ASSEMBLYAI_DIAG_V2');
setInterval(() => console.log('[HEARTBEAT]', new Date().toISOString()), 5000).unref();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PROCESS-LEVEL ERROR HANDLERS: Prevent single errors from
// crashing the entire Node process and killing all active sessions.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
process.on('uncaughtException', (error: Error) => {
  console.error(`[UNCAUGHT_EXCEPTION] ${error.message}`);
  console.error(error.stack);
  // Log but do NOT exit — keep the server running for active sessions
});

process.on('unhandledRejection', (reason: unknown) => {
  console.error(`[UNHANDLED_REJECTION]`, reason);
  // Log but do NOT exit
});

import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import * as dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

// Validate critical API keys exist
const requiredEnvVars = [
  'DEEPGRAM_API_KEY',
  'ANTHROPIC_API_KEY', 
  'ELEVENLABS_API_KEY'
];

console.log('=== Validating Environment Variables ===');
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`);
    console.error(`   Please add ${envVar} to your .env file`);
  } else {
    console.log(`✅ ${envVar} loaded (${process.env[envVar]?.substring(0, 15)}...)`);
  }
}
console.log('=========================================');

// Enable test mode by default in development
if (process.env.NODE_ENV === 'development' && !process.env.AUTH_TEST_MODE) {
  process.env.AUTH_TEST_MODE = 'true';
}

const app = express();

// CRITICAL: Trust proxy must be set FIRST for secure cookies behind Railway/load balancer
// This ensures req.secure is true when behind HTTPS proxy
app.set('trust proxy', 1);

// Production: Canonical hostname redirect (apex → www) for session cookie consistency
// Ensures all users are on www.jiemastery.ai so host-only cookies work correctly
// Railway domain is NOT redirected - it must continue to work for health checks
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    const host = (req.headers.host || '').toLowerCase().split(':')[0]; // Normalize and remove port
    // Only redirect apex to www, don't touch Railway domain
    if (host === 'jiemastery.ai') {
      const redirectUrl = `https://www.jiemastery.ai${req.originalUrl}`;
      console.log(`[Redirect] Canonical redirect: ${host} → www.jiemastery.ai${req.originalUrl}`);
      return res.redirect(301, redirectUrl);
    }
    next();
  });
}

// Diagnostic logging for production debugging (temporary)
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    const logPaths = ['/', '/api/health', '/api/user', '/api/auth/login', '/api/auth/logout', '/api/diag'];
    if (logPaths.includes(req.path) || req.path.startsWith('/api/auth/')) {
      console.log(`[REQ] ${req.method} ${req.url} host=${req.headers.host} proto=${req.headers['x-forwarded-proto']}`);
    }
    next();
  });
}

// CRITICAL: Stripe webhook needs raw body for signature verification
// Must register webhook route BEFORE JSON parser, so we conditionally parse
app.use((req, res, next) => {
  if (req.path === '/api/stripe/webhook') {
    // Skip JSON parsing for webhook - it uses raw() middleware
    next();
  } else {
    express.json()(req, res, next);
  }
});

app.use(express.urlencoded({ extended: false }));

// Cookie parser with secret for signed cookies (used by trial system)
const cookieSecret = process.env.SESSION_SECRET || 'development-session-secret-only';
app.use(cookieParser(cookieSecret));

// Explicitly set headers to indicate this is a web application for deployment
app.use((req, res, next) => {
  res.setHeader('X-Application-Type', 'web-app');
  res.setHeader('X-Deployment-Type', 'autoscale');
  res.setHeader('X-Not-Agent', 'true');
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    console.log('=== Server Startup Started ===');
    console.log(`NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
    console.log(`PORT: ${process.env.PORT || '8080'}`);
    console.log(`DATABASE_URL: ${process.env.DATABASE_URL ? 'Set ✓' : 'Missing ✗'}`);
    
    // Initialize database schema before anything else
    if (process.env.DATABASE_URL) {
      console.log('Initializing database...');
      try {
        const { initializeDatabase } = await import('./db-init');
        const dbInitSuccess = await initializeDatabase();
        if (!dbInitSuccess && process.env.NODE_ENV === 'production') {
          console.error('❌ Failed to initialize database in production!');
          console.error('Ensure DATABASE_URL is correctly set in Railway');
          process.exit(1);
        }
        console.log('✅ Database initialized successfully');
      } catch (dbError) {
        console.error('❌ Database initialization error:', dbError);
        if (process.env.NODE_ENV === 'production') {
          console.error('Cannot continue without database in production');
          process.exit(1);
        } else {
          console.warn('⚠️  Continuing without database in development');
        }
      }
    } else {
      console.warn('⚠️  DATABASE_URL not set - running without database');
      if (process.env.NODE_ENV === 'production') {
        console.error('❌ DATABASE_URL is required in production!');
        process.exit(1);
      }
    }
    
    // Validate Stripe Price IDs at startup
    console.log('\n🔍 Validating Stripe Configuration...');
    const stripeVars = {
      'STRIPE_PRICE_STARTER': process.env.STRIPE_PRICE_STARTER,
      'STRIPE_PRICE_STANDARD': process.env.STRIPE_PRICE_STANDARD,
      'STRIPE_PRICE_PRO': process.env.STRIPE_PRICE_PRO,
      'STRIPE_PRICE_ELITE': process.env.STRIPE_PRICE_ELITE,
      'STRIPE_PRICE_TOPUP_60': process.env.STRIPE_PRICE_TOPUP_60,
      'STRIPE_PRICE_TOPUP_180': process.env.STRIPE_PRICE_TOPUP_180,
      'STRIPE_PRICE_TOPUP_360': process.env.STRIPE_PRICE_TOPUP_360,
    };

    let hasStripeErrors = false;
    Object.entries(stripeVars).forEach(([key, value]) => {
      if (!value) {
        console.log(`⚠️  ${key}: Not set`);
      } else if (value.startsWith('prod_')) {
        console.error(`❌ CRITICAL ERROR: ${key} is using a Product ID (${value}) instead of a Price ID!`);
        console.error(`   Fix: Go to Stripe Dashboard → Products → Copy the PRICE ID (starts with "price_")`);
        hasStripeErrors = true;
      } else if (value.startsWith('price_')) {
        console.log(`✅ ${key}: ${value}`);
      } else {
        console.warn(`⚠️  ${key}: Invalid format (${value}) - should start with "price_"`);
        hasStripeErrors = true;
      }
    });

    if (hasStripeErrors) {
      console.error('\n❌ STRIPE CONFIGURATION ERROR DETECTED!');
      console.error('Please update your environment variables with correct Price IDs from Stripe Dashboard.');
      console.error('Price IDs start with "price_" NOT "prod_"\n');
      if (process.env.NODE_ENV === 'production') {
        console.error('Server will continue but checkout will fail until fixed.\n');
      }
    } else {
      console.log('✅ All Stripe Price IDs validated\n');
    }
    
    console.log('Registering routes...');
    const server = await registerRoutes(app);
    console.log('Routes registered successfully ✓');

    // Setup Custom Voice WebSocket (Deepgram + Claude + ElevenLabs)
    console.log('Setting up Custom Voice WebSocket...');
    const { setupCustomVoiceWebSocket } = await import('./routes/custom-voice-ws');
    const voiceWss = setupCustomVoiceWebSocket(server);
    console.log('✓ Custom Voice WebSocket ready at /api/custom-voice-ws');

    // Start embedding worker ONLY in development (requires vector DB configuration)
    // In production (Railway), disable to prevent startup failures
    if (process.env.NODE_ENV !== 'production') {
      console.log('Starting embedding worker...');
      const { startEmbeddingWorker } = await import('./services/embedding-worker');
      startEmbeddingWorker();
      log('Embedding worker started for background document processing');
    } else {
      console.log('⏭️  Embedding worker disabled in production (Railway deployment)');
      log('Embedding worker disabled in production');
    }

    // Start document cleanup service (auto-delete after 6 months)
    console.log('Starting document cleanup service...');
    const { documentCleanupService } = await import('./services/document-cleanup');
    documentCleanupService.start();
    log('Document cleanup service started (auto-delete after 6 months)');

    // Start daily and weekly digest email jobs
    console.log('Starting email digest jobs...');
    const { startDailyDigestJob, startWeeklyDigestJob } = await import('./jobs/daily-digest');
    startDailyDigestJob();
    startWeeklyDigestJob();
    log('Email digest jobs started (daily at 8 PM, weekly on Sundays)');

    // Start upcoming-work digest job (SRM notifications — off-by-default per-user)
    console.log('Starting upcoming-work digest job...');
    const { startUpcomingDigestJob } = await import('./jobs/upcoming-digest');
    startUpcomingDigestJob();
    log('Upcoming-work digest job started (hourly tick, per-user opt-in)');

    // Start trial verification reminder job (every 6 hours)
    console.log('Starting trial reminder job...');
    const { startTrialReminderJob } = await import('./jobs/trial-reminders');
    startTrialReminderJob();
    log('Trial reminder job started (every 6 hours)');

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      if (!res.headersSent) {
        res.status(status).json({ message });
      }
    });

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (app.get("env") === "development") {
      console.log('Setting up Vite dev server...');
      await setupVite(app, server);
    } else {
      console.log('Serving static files for production...');
      serveStatic(app);
    }

    // ALWAYS serve the app on the port specified in the environment variable PORT
    // Railway sets PORT automatically. Default to 8080 if not specified.
    // this serves both the API and the client.
    const port = parseInt(process.env.PORT || '8080', 10);
    const env = process.env.NODE_ENV || 'development';
    
    console.log(`Attempting to listen on 0.0.0.0:${port}...`);
    server.listen({
      port,
      host: "0.0.0.0",
      reusePort: true,
    }, () => {
      console.log('=== SERVER STARTED SUCCESSFULLY ===');
      console.log(`Listening on port: ${port}`);
      console.log(`Environment: ${env}`);
      console.log(`GET / → 200 (SPA served)`);
      console.log(`✓ Health check: http://0.0.0.0:${port}/api/health`);
      console.log('===================================');
      log(`serving on port ${port}`);
    });

    server.on('error', (err: any) => {
      console.error('❌ Server error:', err);
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use`);
      }
      process.exit(1);
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // GRACEFUL SHUTDOWN v1 (Apr 22, 2026)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Before this handler existed, SIGTERM from Railway (on every
    // deploy or infra restart) killed the Node process instantly,
    // dropping active voice sessions mid-sentence. See Log 2 from
    // 2026-04-22T16:36:49Z: user was mid-turn, LLM was streaming,
    // ElevenLabs was generating audio — then SIGTERM, dead.
    //
    // This handler:
    //   1. Stops accepting NEW HTTP connections immediately.
    //   2. Notifies every active voice WebSocket with a
    //      'server_shutdown' message so the client knows to
    //      reconnect (client already has reconnect logic).
    //   3. Gives active sessions up to 60 seconds to finish their
    //      current turn naturally (typical turn is 15-25s).
    //   4. Force-closes any sockets still open at the deadline.
    //   5. Exits cleanly so Railway doesn't have to SIGKILL.
    //
    // Pairs with railway.json's `overlapSeconds: 60` which tells
    // Railway to let this old container live for 60s after the
    // new container is marked healthy — preventing traffic to a
    // draining container while still giving us time to finish.
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const SHUTDOWN_GRACE_MS = 60_000;
    let shuttingDown = false;

    const gracefulShutdown = async (signal: string) => {
      if (shuttingDown) {
        console.log(`[Shutdown] ⚠️ Received ${signal} during shutdown — ignoring`);
        return;
      }
      shuttingDown = true;

      const startedAt = Date.now();
      console.log(`[Shutdown] 🛑 Received ${signal}, beginning graceful shutdown`);
      console.log(`[Shutdown] Active voice sessions: ${voiceWss.clients.size}`);
      console.log(`[Shutdown] Grace period: ${SHUTDOWN_GRACE_MS / 1000}s`);

      // Step 1: Stop accepting new HTTP connections. Existing connections
      // (including upgraded WebSockets) keep working.
      server.close((err) => {
        if (err) {
          console.error('[Shutdown] ❌ Error closing HTTP server:', err);
        } else {
          console.log('[Shutdown] ✅ HTTP server closed to new connections');
        }
      });

      // Step 2: Notify each active voice WebSocket that the server is
      // restarting. The client-side code in use-custom-voice.ts has
      // existing auto-reconnect logic that will handle the rest.
      let notifiedCount = 0;
      voiceWss.clients.forEach((ws: any) => {
        try {
          if (ws.readyState === 1 /* OPEN */) {
            ws.send(JSON.stringify({
              type: 'server_shutdown',
              reason: 'deploy_restart',
              message: 'Server is restarting for a new version. Your session will reconnect automatically.',
              reconnect_hint: true,
              grace_period_seconds: SHUTDOWN_GRACE_MS / 1000,
            }));
            notifiedCount++;
          }
        } catch (err) {
          console.error('[Shutdown] ❌ Error notifying client:', err);
        }
      });
      console.log(`[Shutdown] 📢 Notified ${notifiedCount} active voice session(s)`);

      // Step 3: Poll for active sessions to finish naturally. Checks
      // every 500ms and exits early if everyone drains.
      const deadline = startedAt + SHUTDOWN_GRACE_MS;
      const drainCheck = setInterval(() => {
        const remaining = voiceWss.clients.size;
        const elapsed = Date.now() - startedAt;
        if (remaining === 0) {
          clearInterval(drainCheck);
          console.log(`[Shutdown] ✅ All sessions drained after ${elapsed}ms`);
          console.log('[Shutdown] 👋 Exiting cleanly');
          process.exit(0);
        }
        if (Date.now() >= deadline) {
          clearInterval(drainCheck);
          console.log(`[Shutdown] ⏰ Grace period expired with ${remaining} session(s) still active`);
          // Step 4: Force-close any sockets still open.
          voiceWss.clients.forEach((ws: any) => {
            try {
              ws.terminate();
            } catch {}
          });
          console.log('[Shutdown] 🔪 Force-closed remaining sockets');
          console.log('[Shutdown] 👋 Exiting');
          process.exit(0);
        }
        // Progress log every 10 seconds so the deploy log shows life.
        if (elapsed > 0 && elapsed % 10_000 < 500) {
          console.log(`[Shutdown] ⏳ ${remaining} session(s) still active at ${elapsed}ms / ${SHUTDOWN_GRACE_MS}ms`);
        }
      }, 500);
    };

    process.on('SIGTERM', () => { void gracefulShutdown('SIGTERM'); });
    process.on('SIGINT',  () => { void gracefulShutdown('SIGINT'); });
    console.log('✓ Graceful shutdown handler registered (60s grace period)');

  } catch (error) {
    console.error('❌ FATAL ERROR during server startup:');
    console.error(error);
    console.error('Stack trace:', (error as Error).stack);
    process.exit(1);
  }
})().catch((error) => {
  console.error('❌ Unhandled error in main async function:');
  console.error(error);
  process.exit(1);
});
