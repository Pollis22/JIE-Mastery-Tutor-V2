/**
 * D-ID Agent Routes
 * 
 * Server-side endpoints for D-ID agent session management.
 * These endpoints handle D-ID authentication server-side to avoid exposing
 * client keys in the browser and to provide proper error handling.
 */

import { Router, Request, Response } from 'express';
import dns from 'dns';
import { promisify } from 'util';

const router = Router();

const DID_AGENT_ID = process.env.DID_AGENT_ID || 'v2_agt_0KyN0XA6';
const DID_CLIENT_KEY = process.env.DID_CLIENT_KEY;
const DID_API_KEY = process.env.DID_API_KEY;

// Promisify DNS lookup for health checks
const dnsLookup = promisify(dns.lookup);

/**
 * GET /api/did/session
 * 
 * Returns the D-ID embed configuration.
 * For the simple embed approach, returns the embed URL with clientKey.
 * The clientKey is kept server-side and only the final embed URL is returned.
 * 
 * This endpoint is public (no auth required) since it's used on the landing page.
 */
router.get('/session', async (req: Request, res: Response) => {
  try {
    console.log('[D-ID] Session request received');
    
    // Check if D-ID is enabled
    if (!DID_CLIENT_KEY) {
      console.log('[D-ID] Client key not configured');
      return res.json({
        ok: false,
        status: 503,
        message: 'D-ID integration not configured',
        code: 'NOT_CONFIGURED'
      });
    }

    // Build the embed URL
    const embedUrl = `https://agents.d-id.com/${DID_AGENT_ID}?clientKey=${encodeURIComponent(DID_CLIENT_KEY)}`;
    
    console.log('[D-ID] Session generated for agent:', DID_AGENT_ID);
    
    return res.json({
      ok: true,
      embedUrl,
      agentId: DID_AGENT_ID
    });
  } catch (error) {
    console.error('[D-ID] Session error:', error);
    return res.json({
      ok: false,
      status: 500,
      message: error instanceof Error ? error.message : 'Unknown error',
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * GET /api/did/health
 * 
 * Diagnostic endpoint to check D-ID connectivity.
 * Performs DNS resolution and optionally tests the D-ID API.
 * 
 * Returns structured JSON with status information.
 */
router.get('/health', async (req: Request, res: Response) => {
  const results: {
    dnsOk: boolean;
    dnsError?: string;
    httpOk: boolean;
    httpStatus?: number;
    httpError?: string;
    configured: boolean;
    agentId: string;
  } = {
    dnsOk: false,
    httpOk: false,
    configured: !!DID_CLIENT_KEY,
    agentId: DID_AGENT_ID
  };

  // Test 1: DNS resolution for agents.d-id.com
  try {
    await dnsLookup('agents.d-id.com');
    results.dnsOk = true;
    console.log('[D-ID Health] DNS lookup successful');
  } catch (error) {
    results.dnsOk = false;
    results.dnsError = error instanceof Error ? error.message : 'DNS lookup failed';
    console.log('[D-ID Health] DNS lookup failed:', results.dnsError);
  }

  // Test 2: HTTP HEAD request to D-ID (basic connectivity)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch('https://agents.d-id.com/', {
      method: 'HEAD',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    results.httpOk = response.ok || response.status < 500;
    results.httpStatus = response.status;
    console.log('[D-ID Health] HTTP check status:', response.status);
  } catch (error) {
    results.httpOk = false;
    results.httpError = error instanceof Error ? error.message : 'HTTP request failed';
    console.log('[D-ID Health] HTTP check failed:', results.httpError);
  }

  // Return results
  const overallOk = results.dnsOk && results.httpOk && results.configured;
  
  return res.json({
    ok: overallOk,
    ...results,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/did/debug
 * 
 * Extended diagnostic info (development only).
 */
router.get('/debug', async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Debug endpoint disabled in production' });
  }

  return res.json({
    agentId: DID_AGENT_ID,
    clientKeyConfigured: !!DID_CLIENT_KEY,
    clientKeyLength: DID_CLIENT_KEY?.length || 0,
    apiKeyConfigured: !!DID_API_KEY,
    nodeEnv: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

export default router;
