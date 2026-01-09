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

const startTrialSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

router.post('/start', async (req: Request, res: Response) => {
  try {
    const parsed = startTrialSchema.safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json({ 
        ok: false, 
        error: parsed.error.errors[0]?.message || 'Invalid email',
        errorCode: 'validation_error'
      });
    }

    const deviceIdHash = getDeviceIdHash(req, res);
    const ipHash = getIpHash(req);

    const result = await trialService.startTrial(parsed.data.email, deviceIdHash, ipHash);

    if (result.ok) {
      return res.json({ ok: true, message: 'Verification email sent. Please check your inbox.' });
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    console.error('[TrialRoutes] Error starting trial:', error);
    return res.status(500).json({ ok: false, error: 'Server error', errorCode: 'server_error' });
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

export default router;
