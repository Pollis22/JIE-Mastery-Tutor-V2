import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import * as dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

// Enable test mode by default in development
if (process.env.NODE_ENV === 'development' && !process.env.AUTH_TEST_MODE) {
  process.env.AUTH_TEST_MODE = 'true';
}

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Log ALL POST requests after body parsing
app.use((req, res, next) => {
  if (req.method === 'POST') {
    console.log('🌐 POST REQUEST:', {
      method: req.method,
      path: req.path,
      body: req.body,
      contentType: req.headers['content-type']
    });
  }
  next();
});

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
  const server = await registerRoutes(app);

  // Start embedding worker for background document processing
  const { startEmbeddingWorker } = await import('./services/embedding-worker');
  startEmbeddingWorker();
  log('Embedding worker started for background document processing');

  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    
    console.error('❌ ERROR HANDLER:', {
      path: req.path,
      method: req.method,
      status,
      message,
      stack: err.stack
    });

    if (!res.headersSent) {
      res.status(status).json({ message });
    }
    // Don't throw - just log
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
