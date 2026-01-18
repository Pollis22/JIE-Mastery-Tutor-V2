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
  const publicPath = path.resolve(import.meta.dirname, "..", "public");

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
  
  // Serve robots.txt from public folder
  app.get('/robots.txt', (req, res) => {
    const robotsPath = path.join(publicPath, 'robots.txt');
    if (fs.existsSync(robotsPath)) {
      res.type('text/plain').sendFile(robotsPath);
    } else {
      res.type('text/plain').send('User-agent: *\nAllow: /');
    }
  });
  
  // Serve sitemap.xml from public folder
  app.get('/sitemap.xml', (req, res) => {
    const sitemapPath = path.join(publicPath, 'sitemap.xml');
    if (fs.existsSync(sitemapPath)) {
      res.type('application/xml').sendFile(sitemapPath);
    } else {
      res.status(404).send('Sitemap not found');
    }
  });
  
  // Static assets with long cache (hashed filenames in /assets/)
  app.use('/assets', express.static(path.join(distPath, 'assets'), {
    maxAge: '1y',
    immutable: true,
    etag: false,
  }));
  
  // Other static files with shorter cache
  app.use(express.static(distPath, {
    maxAge: '1h',
    etag: true,
  }));

  // fall through to index.html if the file doesn't exist
  app.use("*", (req, res) => {
    const url = req.originalUrl;
    
    // Skip API routes - they should be handled by API handlers
    if (url.startsWith('/api/')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    
    // Return 404 for missing static assets (don't serve index.html for .js/.css/.map requests)
    if (url.startsWith('/assets/') || url.match(/\.(js|css|map|json|ico|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot)$/)) {
      console.error(`[Static 404] Missing asset: ${url}`);
      return res.status(404).send('Asset not found');
    }
    
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
