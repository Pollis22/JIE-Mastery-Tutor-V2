import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  // Security: Block path traversal attempts BEFORE any other middleware
  app.use((req, res, next) => {
    const url = req.originalUrl;
    
    // Block any path traversal attempts
    if (url.includes('../') || url.includes('..\\') || url.includes('%2e%2e')) {
      console.error(`[SECURITY] Path traversal attempt blocked: ${url}`);
      return res.status(403).json({ error: 'Forbidden: Path traversal detected' });
    }
    
    // Block direct access to sensitive SERVER files only
    // Allow /src/ for Vite development but block /server/ and config files
    const blockedPaths = ['/etc/', '/server/', '/.env', '/package.json', '/tsconfig', '/drizzle.config'];
    if (blockedPaths.some(path => url.toLowerCase().includes(path))) {
      console.error(`[SECURITY] Access to sensitive path blocked: ${url}`);
      return res.status(403).json({ error: 'Forbidden: Access to sensitive files denied' });
    }
    
    next();
  });
  
  // Wrap Vite middleware to skip API routes
  app.use((req, res, next) => {
    if (req.originalUrl.startsWith('/api/')) {
      return next();
    }
    vite.middlewares(req, res, next);
  });
  
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    
    // Skip API routes - let them be handled by API handlers
    if (url.startsWith('/api/')) {
      return next();
    }

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "..", "dist", "public");

  console.log(`Looking for static files at: ${distPath}`);

  if (!fs.existsSync(distPath)) {
    console.error(`Build directory not found at: ${distPath}`);
    console.error(`Current directory: ${import.meta.dirname}`);
    console.error(`Parent directory contents:`, fs.readdirSync(path.resolve(import.meta.dirname, "..")));
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  console.log(`✓ Serving static files from: ${distPath}`);
  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (req, res) => {
    // Skip API routes - they should be handled by API handlers
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
