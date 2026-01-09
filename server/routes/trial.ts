import { Router, Request, Response } from 'express';
import { trialService } from '../services/trial-service';
import { createHash, randomUUID } from 'crypto';
import { z } from 'zod';

const router = Router();

const TRIAL_COOKIE_NAME = 'trial_device_id';
const TRIAL_COOKIE_MAX_AGE = 365 * 24 * 60 * 60 * 1000;

function getDeviceIdHash(req: Request, res: Response): string {
  let deviceId = req.signedCookies?.[TRIAL_COOKIE_NAME];
  
  if (!deviceId) {
    deviceId = randomUUID();
    res.cookie(TRIAL_COOKIE_NAME, deviceId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: TRIAL_COOKIE_MAX_AGE,
      signed: true,
    });
  }
  
  return createHash('sha256').update(deviceId).digest('hex');
}

function getIpHash(req: Request): string {
  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() 
    || req.socket.remoteAddress 
    || 'unknown';
  return createHash('sha256').update(ip).digest('hex');
}

router.post('/start', async (req: Request, res: Response) => {
  try {
    console.log('[TrialRoutes] /start received body:', JSON.stringify(req.body));
    
    const rawEmail = req.body?.email;
    
    // Strict validation: email must exist
    if (rawEmail === undefined || rawEmail === null) {
      console.log('[TrialRoutes] /start error: email field missing from request body');
      return res.status(400).json({ 
        ok: false, 
        error: 'Email is required.',
        code: 'EMAIL_REQUIRED'
      });
    }
    
    // Strict validation: email must not be empty
    if (typeof rawEmail !== 'string' || rawEmail.trim() === '') {
      console.log('[TrialRoutes] /start error: email is blank');
      return res.status(400).json({ 
        ok: false, 
        error: 'Email is required.',
        code: 'EMAIL_REQUIRED'
      });
    }
    
    const trimmedEmail = rawEmail.trim().toLowerCase();
    
    // Strict validation: email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      console.log('[TrialRoutes] /start error: invalid email format');
      return res.status(400).json({ 
        ok: false, 
        error: 'Please enter a valid email address.',
        code: 'EMAIL_INVALID'
      });
    }
    
    const deviceIdHash = getDeviceIdHash(req, res);
    const ipHash = getIpHash(req);
    
    // Debug logging (hashed values only for privacy)
    const emailHash = createHash('sha256').update(trimmedEmail).digest('hex').substring(0, 12);
    console.log('[TrialRoutes] /start processing:', {
      emailHash: emailHash + '...',
      deviceIdHash: deviceIdHash.substring(0, 12) + '...',
      ipHash: ipHash.substring(0, 12) + '...',
    });

    const result = await trialService.startTrial(trimmedEmail, deviceIdHash, ipHash);

    if (result.ok) {
      console.log('[TrialRoutes] /start success: verification email sent');
      return res.json({ ok: true, message: 'Verification email sent. Please check your inbox.' });
    } else {
      // Map internal error codes to client-facing codes with appropriate HTTP status
      const errorCode = result.errorCode;
      let httpStatus = 400;
      let code = 'TRIAL_ERROR';
      
      if (errorCode === 'email_used') {
        httpStatus = 409;
        code = 'TRIAL_EMAIL_USED';
      } else if (errorCode === 'device_blocked') {
        httpStatus = 400;
        code = 'TRIAL_DEVICE_BLOCKED';
      } else if (errorCode === 'ip_rate_limited') {
        httpStatus = 429;
        code = 'TRIAL_RATE_LIMITED';
      }
      
      console.log('[TrialRoutes] /start denied:', { code, error: result.error });
      return res.status(httpStatus).json({
        ok: false,
        error: result.error,
        code,
      });
    }
  } catch (error) {
    console.error('[TrialRoutes] Error starting trial:', error);
    return res.status(500).json({ ok: false, error: 'Server error', code: 'SERVER_ERROR' });
  }
});

const verifyTrialSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

router.post('/verify', async (req: Request, res: Response) => {
  try {
    const parsed = verifyTrialSchema.safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Invalid token',
        errorCode: 'validation_error'
      });
    }

    const result = await trialService.verifyTrialToken(parsed.data.token);

    if (result.ok) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    console.error('[TrialRoutes] Error verifying trial:', error);
    return res.status(500).json({ ok: false, error: 'Server error', errorCode: 'server_error' });
  }
});

router.get('/status', async (req: Request, res: Response) => {
  try {
    const deviceIdHash = getDeviceIdHash(req, res);
    const entitlement = await trialService.getTrialEntitlement(deviceIdHash);

    return res.json({
      hasAccess: entitlement.hasAccess,
      reason: entitlement.reason,
      secondsRemaining: entitlement.trialSecondsRemaining,
      trialId: entitlement.trialId,
    });
  } catch (error) {
    console.error('[TrialRoutes] Error getting trial status:', error);
    return res.status(500).json({ hasAccess: false, reason: 'server_error' });
  }
});

router.post('/end-session', async (req: Request, res: Response) => {
  try {
    const { trialId, secondsUsed } = req.body;
    
    if (!trialId || typeof secondsUsed !== 'number') {
      return res.status(400).json({ ok: false, error: 'Invalid request' });
    }

    const success = await trialService.updateConsumedSeconds(trialId, secondsUsed);

    return res.json({ ok: success });
  } catch (error) {
    console.error('[TrialRoutes] Error ending trial session:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// Get a session token for WebSocket connection (trial users only)
router.post('/session-token', async (req: Request, res: Response) => {
  try {
    const deviceIdHash = getDeviceIdHash(req, res);
    
    if (!deviceIdHash) {
      console.log('[TrialRoutes] session-token: no device ID hash');
      return res.status(400).json({ ok: false, error: 'Missing device identification' });
    }
    
    const result = await trialService.getSessionToken(deviceIdHash);

    if (result.ok && result.token) {
      console.log('[TrialRoutes] session-token: success, trial:', result.trialId);
      return res.json({
        ok: true,
        token: result.token,
        secondsRemaining: result.secondsRemaining,
        trialId: result.trialId,
      });
    } else {
      console.log('[TrialRoutes] session-token: denied, error:', result.error);
      return res.status(403).json({ ok: false, error: result.error || 'Trial not available' });
    }
  } catch (error) {
    console.error('[TrialRoutes] Error getting session token:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

export default router;
