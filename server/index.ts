import express, { type Request, Response, NextFunction } from "express";
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
    console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
    console.log(`PORT: ${process.env.PORT || '5000'}`);
    console.log(`DATABASE_URL: ${process.env.DATABASE_URL ? 'Set ✓' : 'Missing ✗'}`);
    
    // Initialize database schema before anything else
    if (process.env.DATABASE_URL) {
      console.log('Initializing database...');
      const { initializeDatabase } = await import('./db-init');
      const dbInitSuccess = await initializeDatabase();
      if (!dbInitSuccess && process.env.NODE_ENV === 'production') {
        console.error('❌ Failed to initialize database in production!');
        process.exit(1);
      }
    }
    
    // Validate Stripe Price IDs at startup
    console.log('\n🔍 Validating Stripe Configuration...');
    const stripeVars = {
      'STRIPE_PRICE_STARTER': process.env.STRIPE_PRICE_STARTER,
      'STRIPE_PRICE_STANDARD': process.env.STRIPE_PRICE_STANDARD,
      'STRIPE_PRICE_PRO': process.env.STRIPE_PRICE_PRO,
      'STRIPE_PRICE_TOPUP_60': process.env.STRIPE_PRICE_TOPUP_60,
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
    setupCustomVoiceWebSocket(server);
    console.log('✓ Custom Voice WebSocket ready at /api/custom-voice-ws');

    // Start embedding worker for background document processing
    console.log('Starting embedding worker...');
    const { startEmbeddingWorker } = await import('./services/embedding-worker');
    startEmbeddingWorker();
    log('Embedding worker started for background document processing');

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
    // Other ports are firewalled. Default to 5000 if not specified.
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = parseInt(process.env.PORT || '5000', 10);
    
    console.log(`Attempting to listen on 0.0.0.0:${port}...`);
    server.listen({
      port,
      host: "0.0.0.0",
      reusePort: true,
    }, () => {
      console.log('=== SERVER STARTED SUCCESSFULLY ===');
      console.log(`✓ Listening on 0.0.0.0:${port}`);
      console.log(`✓ Environment: ${process.env.NODE_ENV}`);
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
