import { Router, Request, Response } from 'express';
import { trialService, hashEmail, normalizeEmail, TrialResolutionResult } from '../services/trial-service';
import { createHash, randomUUID } from 'crypto';
import { z } from 'zod';

const router = Router();

const TRIAL_COOKIE_NAME = 'trial_device_id';
const TRIAL_EMAIL_HASH_COOKIE = 'trial_email_hash';
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
      const internalCode = result.code;
      let httpStatus = 400;
      let code = internalCode || 'TRIAL_ERROR';
      
      // Map codes to HTTP status
      if (internalCode === 'TRIAL_EMAIL_USED' || internalCode === 'TRIAL_DB_ERROR') {
        httpStatus = 409;
      } else if (internalCode === 'TRIAL_RATE_LIMITED') {
        httpStatus = 429;
      } else if (internalCode === 'EMAIL_SEND_FAILED') {
        httpStatus = 502;
      } else if (internalCode === 'TRIAL_CONFIG_ERROR' || internalCode === 'TRIAL_DB_MIGRATION_MISSING' || internalCode === 'TRIAL_DB_SCHEMA_MISMATCH') {
        httpStatus = 503; // Service Unavailable - signals deployment issue
      } else if (internalCode === 'TRIAL_INTERNAL_ERROR') {
        httpStatus = 500;
      }
      
      console.log('[TrialRoutes] /start denied:', { code, httpStatus, error: result.error });
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
      console.log('[TrialRoutes] /verify FAILED: validation error - missing or invalid token');
      return res.status(400).json({ 
        ok: false, 
        error: 'Invalid token',
        errorCode: 'validation_error'
      });
    }

    const tokenPreview = parsed.data.token.substring(0, 12) + '...';
    console.log('[TrialRoutes] /verify: attempting verification for token:', tokenPreview);
    
    const result = await trialService.verifyTrialToken(parsed.data.token);

    if (result.ok && result.emailHash) {
      // Set email_hash cookie for deterministic status lookup
      res.cookie(TRIAL_EMAIL_HASH_COOKIE, result.emailHash, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: TRIAL_COOKIE_MAX_AGE,
        signed: true,
      });
      console.log('[TrialRoutes] /verify SUCCESS: email verified, cookie set for:', result.emailHash.substring(0, 12) + '...');
      console.log('[TrialRoutes] /verify: status updated to active, secondsRemaining:', result.secondsRemaining);
      
      // Don't return emailHash to client
      const { emailHash, ...clientResult } = result;
      return res.json(clientResult);
    } else if (result.ok) {
      console.log('[TrialRoutes] /verify SUCCESS: but no emailHash returned');
      return res.json(result);
    } else {
      console.log('[TrialRoutes] /verify FAILED:', { errorCode: result.errorCode, error: result.error });
      return res.status(400).json(result);
    }
  } catch (error) {
    console.error('[TrialRoutes] /verify ERROR:', error);
    return res.status(500).json({ ok: false, error: 'Server error', errorCode: 'server_error' });
  }
});

router.get('/status', async (req: Request, res: Response) => {
  try {
    // Use UNIFIED lookup: email_hash cookie (primary) or email from body (fallback)
    // NEVER uses deviceIdHash or ipHash for trial lookup
    const emailHashFromCookie = req.signedCookies?.[TRIAL_EMAIL_HASH_COOKIE];
    const emailFromQuery = typeof req.query.email === 'string' ? req.query.email : undefined;
    
    const resolution = await trialService.resolveTrialFromRequest(emailHashFromCookie, emailFromQuery);

    console.log('[TrialRoutes] /status result:', {
      lookupPath: resolution.lookupPath,
      emailHashUsed: resolution.emailHashUsed ? resolution.emailHashUsed.substring(0, 12) + '...' : 'null',
      trialId: resolution.trialId,
      hasAccess: resolution.hasAccess,
      reason: resolution.reason,
    });

    return res.json({
      hasAccess: resolution.hasAccess,
      reason: resolution.reason,
      secondsRemaining: resolution.secondsRemaining,
      trialId: resolution.trialId,
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
// Uses SAME UNIFIED lookup as /status: email_hash cookie (primary), email body (fallback)
// NEVER uses deviceIdHash or ipHash for trial lookup
router.post('/session-token', async (req: Request, res: Response) => {
  try {
    const emailHashFromCookie = req.signedCookies?.[TRIAL_EMAIL_HASH_COOKIE];
    const emailFromBody = typeof req.body?.email === 'string' ? req.body.email : undefined;
    
    // Use UNIFIED lookup - SAME as /status endpoint
    const resolution = await trialService.resolveTrialFromRequest(emailHashFromCookie, emailFromBody);

    console.log('[TrialRoutes] session-token resolution:', {
      lookupPath: resolution.lookupPath,
      emailHashUsed: resolution.emailHashUsed ? resolution.emailHashUsed.substring(0, 12) + '...' : 'null',
      trialId: resolution.trialId,
      hasAccess: resolution.hasAccess,
      reason: resolution.reason,
    });

    if (!resolution.hasAccess) {
      // Return same denial reason as /status
      console.log('[TrialRoutes] session-token: denied, reason:', resolution.reason);
      return res.status(403).json({ ok: false, error: resolution.reason });
    }

    if (!resolution.trialId) {
      console.log('[TrialRoutes] session-token: denied, no trial ID');
      return res.status(403).json({ ok: false, error: 'trial_not_found' });
    }

    if (resolution.secondsRemaining <= 0) {
      console.log('[TrialRoutes] session-token: denied, no seconds remaining');
      return res.status(403).json({ ok: false, error: 'trial_expired' });
    }

    // Mint session token using the resolved trial ID
    const token = trialService.generateSessionToken(resolution.trialId);
    
    console.log('[TrialRoutes] session-token: success, trial:', resolution.trialId, 'lookupPath:', resolution.lookupPath);
    return res.json({
      ok: true,
      token,
      secondsRemaining: resolution.secondsRemaining,
      trialId: resolution.trialId,
    });
  } catch (error) {
    console.error('[TrialRoutes] Error getting session token:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// Resume Trial: Allow returning users to resume without re-verification
const resumeTrialSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

router.post('/resume', async (req: Request, res: Response) => {
  try {
    console.log('[TrialRoutes] /resume received');
    
    const parsed = resumeTrialSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Please enter a valid email address.',
      });
    }

    const { email } = parsed.data;
    const result = await trialService.resumeTrial(email);

    // Handle error case (no action field)
    if (!result.ok || !result.action) {
      console.log('[TrialRoutes] /resume: error -', result.error);
      return res.status(500).json({ 
        ok: false, 
        error: result.error || 'Something went wrong. Please try again.' 
      });
    }

    // Handle RESUME action - set cookie and allow immediate redirect
    if (result.action === 'RESUME' && result.emailHash) {
      console.log('[TrialRoutes] /resume: action=RESUME, setting cookie, trialId:', result.trialId);
      
      // Set the email hash cookie so the trial session is linked to this browser
      res.cookie(TRIAL_EMAIL_HASH_COOKIE, result.emailHash, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: TRIAL_COOKIE_MAX_AGE,
        signed: true,
      });
      
      return res.json({ 
        ok: true,
        action: 'RESUME',
        secondsRemaining: result.secondsRemaining,
        trialId: result.trialId,
        courtesyApplied: result.courtesyApplied,
      });
    }
    
    // Handle other actions (START, VERIFY_REQUIRED, ENDED)
    console.log('[TrialRoutes] /resume: action=' + result.action + ', reason=' + result.reason);
    return res.json({
      ok: true,
      action: result.action,
      reason: result.reason,
    });
  } catch (error) {
    console.error('[TrialRoutes] Error resuming trial:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// Magic Link: Request a magic link to continue trial
const magicLinkRequestSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

router.post('/magic-link', async (req: Request, res: Response) => {
  try {
    console.log('[TrialRoutes] /magic-link received');
    
    const parsed = magicLinkRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Please enter a valid email address.',
        code: 'EMAIL_INVALID' 
      });
    }

    const { email } = parsed.data;
    const result = await trialService.requestMagicLink(email);

    if (result.ok) {
      // Check if this is an instant resume (verified active trial)
      if (result.instantResume && result.emailHash) {
        console.log('[TrialRoutes] /magic-link: INSTANT RESUME, setting cookie and redirecting');
        
        // Set the email hash cookie so the trial session is linked to this browser
        res.cookie(TRIAL_EMAIL_HASH_COOKIE, result.emailHash, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: TRIAL_COOKIE_MAX_AGE,
          signed: true,
        });
        
        return res.json({ 
          ok: true,
          instantResume: true,
          secondsRemaining: result.secondsRemaining,
          redirectTo: '/trial/tutor',
        });
      }
      
      // Not instant resume - either email not found or magic link sent
      console.log('[TrialRoutes] /magic-link: link sent (or safe response for unknown email)');
      return res.json({ 
        ok: true, 
        message: 'If a trial exists for this email, you will receive a sign-in link shortly.' 
      });
    } else {
      // Return specific error codes for frontend handling
      const httpStatus = result.code === 'TRIAL_EXHAUSTED' ? 410 : 400;
      console.log('[TrialRoutes] /magic-link: error:', result.code, result.error);
      return res.status(httpStatus).json({
        ok: false,
        error: result.error,
        code: result.code,
        verificationResent: result.verificationResent,
      });
    }
  } catch (error) {
    console.error('[TrialRoutes] Error requesting magic link:', error);
    return res.status(500).json({ ok: false, error: 'Server error', code: 'SERVER_ERROR' });
  }
});

// Continue-trial: Validate token and set session cookie
const continueTrialTokenSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

router.post('/magic-validate', async (req: Request, res: Response) => {
  try {
    console.log('[TrialRoutes] /magic-validate received');
    
    const parsed = continueTrialTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Invalid request.',
        errorCode: 'invalid_token' 
      });
    }

    const { token } = parsed.data;
    const result = await trialService.validateMagicToken(token);

    if (result.ok && result.trial) {
      console.log('[TrialRoutes] /magic-validate: success, trial:', result.trial.id);
      
      // Set the email hash cookie so the trial session is linked to this browser
      res.cookie(TRIAL_EMAIL_HASH_COOKIE, result.trial.emailHash, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: TRIAL_COOKIE_MAX_AGE,
        signed: true,
      });

      return res.json({
        ok: true,
        trialId: result.trial.id,
        secondsRemaining: result.secondsRemaining,
        email: result.trial.email,
      });
    } else {
      console.log('[TrialRoutes] /magic-validate: error:', result.errorCode, result.error);
      const httpStatus = result.errorCode === 'trial_exhausted' ? 410 : 400;
      return res.status(httpStatus).json({
        ok: false,
        error: result.error,
        errorCode: result.errorCode,
      });
    }
  } catch (error) {
    console.error('[TrialRoutes] Error validating magic token:', error);
    return res.status(500).json({ ok: false, error: 'Server error', errorCode: 'server_error' });
  }
});

export default router;
