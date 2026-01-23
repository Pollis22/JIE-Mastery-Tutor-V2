/**
 * D-ID API Routes (WebRTC Stream Flow)
 * 
 * Server-side endpoints for D-ID Realtime Agents Streams API.
 * These routes use the official D-ID API instead of the embed iframe.
 * 
 * All D-ID API calls are made server-side to keep secrets secure.
 */

import { Router, Request, Response } from 'express';
import { didClient } from '../lib/didClient';

const router = Router();

/**
 * GET /api/did-api/status
 * 
 * Returns configuration and connectivity status for D-ID API.
 * This endpoint is PUBLIC for diagnostics.
 */
router.get('/status', async (req: Request, res: Response) => {
  console.log('[D-ID API Route] Status check');
  
  const configured = didClient.isConfigured();
  const agentId = didClient.getAgentId();
  const mode = process.env.DID_MODE || 'embed';
  
  let connectivity: { dnsOk: boolean; httpOk: boolean; httpStatus?: number; error?: string } = { dnsOk: false, httpOk: false };
  
  if (configured) {
    connectivity = await didClient.checkApiReachability();
  }
  
  return res.json({
    ok: configured && connectivity.dnsOk && connectivity.httpOk,
    configured,
    mode,
    agentId: agentId ? `${agentId.slice(0, 10)}...` : null,
    canResolveApiDomain: connectivity.dnsOk,
    outboundHttpOk: connectivity.httpOk,
    httpStatus: connectivity.httpStatus,
    error: connectivity.error,
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /api/did-api/stream/create
 * 
 * Creates a new D-ID stream for WebRTC connection.
 * Returns only the minimal fields needed for client-side WebRTC setup.
 */
router.post('/stream/create', async (req: Request, res: Response) => {
  console.log('[D-ID API Route] Create stream');
  
  if (!didClient.isConfigured()) {
    return res.status(500).json({
      ok: false,
      message: 'D-ID API not configured. Set DID_API_KEY environment variable.'
    });
  }
  
  const result = await didClient.createStream();
  
  if (!result.ok) {
    return res.status(result.status).json({
      ok: false,
      message: result.message,
      upstream: result.upstream
    });
  }
  
  const { id, session_id, offer, ice_servers } = result.data;
  
  return res.json({
    ok: true,
    streamId: id,
    sessionId: session_id,
    offerSdp: offer.sdp,
    iceServers: ice_servers
  });
});

/**
 * POST /api/did-api/stream/:streamId/sdp
 * 
 * Sends the WebRTC SDP answer to D-ID.
 */
router.post('/stream/:streamId/sdp', async (req: Request, res: Response) => {
  const { streamId } = req.params;
  const { sessionId, answerSdp } = req.body;
  
  console.log('[D-ID API Route] Send SDP answer for stream:', streamId);
  
  if (!sessionId || !answerSdp) {
    return res.status(400).json({
      ok: false,
      message: 'Missing sessionId or answerSdp'
    });
  }
  
  const result = await didClient.sendSdpAnswer(streamId, sessionId, answerSdp);
  
  if (!result.ok) {
    return res.status(result.status).json({
      ok: false,
      message: result.message,
      upstream: result.upstream
    });
  }
  
  return res.json({ ok: true, status: result.data.status });
});

/**
 * POST /api/did-api/stream/:streamId/ice
 * 
 * Sends ICE candidate to D-ID.
 */
router.post('/stream/:streamId/ice', async (req: Request, res: Response) => {
  const { streamId } = req.params;
  const { sessionId, candidate } = req.body;
  
  console.log('[D-ID API Route] Send ICE candidate for stream:', streamId);
  
  if (!sessionId || !candidate) {
    return res.status(400).json({
      ok: false,
      message: 'Missing sessionId or candidate'
    });
  }
  
  const result = await didClient.sendIceCandidate(streamId, sessionId, candidate);
  
  if (!result.ok) {
    return res.status(result.status).json({
      ok: false,
      message: result.message,
      upstream: result.upstream
    });
  }
  
  return res.json({ ok: true, status: result.data.status });
});

/**
 * POST /api/did-api/stream/:streamId/speak
 * 
 * Makes the avatar speak the given text.
 */
router.post('/stream/:streamId/speak', async (req: Request, res: Response) => {
  const { streamId } = req.params;
  const { sessionId, text } = req.body;
  
  console.log('[D-ID API Route] Speak for stream:', streamId, 'text length:', text?.length);
  
  if (!sessionId || !text) {
    return res.status(400).json({
      ok: false,
      message: 'Missing sessionId or text'
    });
  }
  
  const result = await didClient.speak(streamId, sessionId, text);
  
  if (!result.ok) {
    return res.status(result.status).json({
      ok: false,
      message: result.message,
      upstream: result.upstream
    });
  }
  
  return res.json({ ok: true, data: result.data });
});

export default router;
