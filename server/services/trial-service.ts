import { db } from '../db';
import { trialSessions, trialRateLimits, TrialSession } from '@shared/schema';
import { eq, and, gte, sql } from 'drizzle-orm';
import { createHash, randomBytes, createHmac } from 'crypto';
import { EmailService } from './email-service';

const TRIAL_DURATION_SECONDS = 300;
const TRIAL_TOKEN_EXPIRY_SECONDS = 600; // 10 minutes token validity
const IP_RATE_LIMIT_WINDOW_HOURS = 24;
const IP_RATE_LIMIT_MAX_ATTEMPTS = 3;
const DEVICE_COOLDOWN_DAYS = 30;

// Device blocking is OFF by default for dev/staging. Set TRIAL_ENFORCE_DEVICE_LIMIT=1 to enable.
const ENFORCE_DEVICE_LIMIT = process.env.TRIAL_ENFORCE_DEVICE_LIMIT === '1';

// QA Mode: Set TRIAL_QA_MODE=1 to bypass IP rate limiting and device blocking for development
// Still enforces 5-minute trial cap
const QA_MODE = process.env.TRIAL_QA_MODE === '1';

// QA Emails: Comma-separated list of emails that can bypass "email already used" restriction
// Example: TRIAL_QA_EMAILS=test@example.com,dev@example.com
const QA_EMAILS = (process.env.TRIAL_QA_EMAILS || '').split(',').map(e => e.toLowerCase().trim()).filter(Boolean);

function hashValue(value: string): string {
  return createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
}

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

// Standardized error codes for trial operations
export type TrialErrorCode = 
  | 'TRIAL_EMAIL_USED'
  | 'TRIAL_DEVICE_USED'
  | 'TRIAL_RATE_LIMITED'
  | 'TRIAL_EXPIRED'
  | 'TRIAL_INTERNAL_ERROR'
  | 'TRIAL_DB_MIGRATION_MISSING';

// Helper to check if error is a missing table error
function isMissingTableError(error: any): boolean {
  // PostgreSQL error code 42P01 = undefined_table
  return error?.code === '42P01' || 
    error?.message?.includes('relation') && error?.message?.includes('does not exist');
}

export interface TrialStartResult {
  ok: boolean;
  error?: string;
  code?: TrialErrorCode;
  // Keep legacy errorCode for backwards compatibility
  errorCode?: 'email_used' | 'device_blocked' | 'ip_rate_limited' | 'server_error';
}

export interface TrialVerifyResult {
  ok: boolean;
  status?: 'active' | 'expired' | 'pending';
  secondsRemaining?: number;
  error?: string;
  errorCode?: 'invalid_token' | 'expired_token' | 'already_expired' | 'server_error';
}

export interface TrialEntitlement {
  hasAccess: boolean;
  reason: 'trial_active' | 'trial_expired' | 'trial_not_found' | 'trial_not_verified';
  trialSecondsRemaining?: number;
  trialId?: string;
}

export interface TrialSessionToken {
  type: 'trial';
  trialId: string;
  issuedAt: number;
  expiresAt: number;
}

export interface TrialSessionTokenResult {
  ok: boolean;
  token?: string;
  secondsRemaining?: number;
  trialId?: string;
  error?: string;
}

export class TrialService {
  private emailService: EmailService;

  constructor() {
    this.emailService = new EmailService();
  }

  async startTrial(email: string, deviceIdHash: string, ipHash: string): Promise<TrialStartResult> {
    try {
      const normalizedEmail = normalizeEmail(email);
      const emailHash = hashValue(normalizedEmail);
      
      // Check if this is a QA email that bypasses "email already used" restriction
      const isQaEmail = QA_EMAILS.includes(normalizedEmail);
      
      if (QA_MODE) {
        console.log('[TrialService] QA_MODE enabled - bypassing IP/device rate limits');
        if (isQaEmail) {
          console.log('[TrialService] QA email detected - bypassing email-already-used check:', normalizedEmail);
        }
      }

      // Email already used check - skip for QA emails in QA mode
      if (!isQaEmail) {
        const existing = await db.select()
          .from(trialSessions)
          .where(eq(trialSessions.emailHash, emailHash))
          .limit(1);

        if (existing.length > 0) {
          console.log('[TrialService] Error: TRIAL_EMAIL_USED');
          return { 
            ok: false, 
            code: 'TRIAL_EMAIL_USED',
            error: 'This email address has already been used for a free trial.',
            errorCode: 'email_used' 
          };
        }
      }

      // Device blocking check - skip if QA_MODE or TRIAL_ENFORCE_DEVICE_LIMIT is not "1"
      if (ENFORCE_DEVICE_LIMIT && !QA_MODE) {
        const thirtyDaysAgo = new Date(Date.now() - DEVICE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
        const deviceTrial = await db.select()
          .from(trialSessions)
          .where(and(
            eq(trialSessions.deviceIdHash, deviceIdHash),
            gte(trialSessions.createdAt, thirtyDaysAgo)
          ))
          .limit(1);

        if (deviceTrial.length > 0) {
          console.log('[TrialService] Error: TRIAL_DEVICE_USED');
          return { 
            ok: false, 
            code: 'TRIAL_DEVICE_USED',
            error: 'A free trial has already been used on this device.',
            errorCode: 'device_blocked' 
          };
        }
      }

      // IP rate limiting - skip if QA_MODE
      if (!QA_MODE) {
        const windowStart = new Date(Date.now() - IP_RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000);
        const ipLimit = await db.select()
          .from(trialRateLimits)
          .where(and(
            eq(trialRateLimits.ipHash, ipHash),
            gte(trialRateLimits.windowStart, windowStart)
          ))
          .limit(1);

        if (ipLimit.length > 0 && (ipLimit[0].attemptCount ?? 0) >= IP_RATE_LIMIT_MAX_ATTEMPTS) {
          console.log('[TrialService] Error: TRIAL_RATE_LIMITED');
          return { 
            ok: false, 
            code: 'TRIAL_RATE_LIMITED',
            error: 'Too many trial attempts from this location. Please try again later.',
            errorCode: 'ip_rate_limited' 
          };
        }
      }

      const verificationToken = randomBytes(32).toString('hex');
      const verificationExpiry = new Date(Date.now() + 30 * 60 * 1000);

      await db.insert(trialSessions).values({
        emailHash,
        email: normalizedEmail,
        verificationToken,
        verificationExpiry,
        deviceIdHash,
        ipHash,
        status: 'pending',
        consumedSeconds: 0,
      });

      // Track IP rate limits (skip in QA mode)
      if (!QA_MODE) {
        const windowStart = new Date(Date.now() - IP_RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000);
        const ipLimit = await db.select()
          .from(trialRateLimits)
          .where(and(
            eq(trialRateLimits.ipHash, ipHash),
            gte(trialRateLimits.windowStart, windowStart)
          ))
          .limit(1);
          
        if (ipLimit.length > 0) {
          await db.update(trialRateLimits)
            .set({ attemptCount: sql`${trialRateLimits.attemptCount} + 1` })
            .where(eq(trialRateLimits.ipHash, ipHash));
        } else {
          await db.insert(trialRateLimits).values({
            ipHash,
            attemptCount: 1,
            windowStart: new Date(),
          });
        }
      }

      await this.sendTrialVerificationEmail(normalizedEmail, verificationToken);

      return { ok: true };
    } catch (error: any) {
      console.error('[TrialService] Error starting trial:', error);
      
      // Check if this is a missing table error (migration not applied)
      if (isMissingTableError(error)) {
        console.error('[TrialService] CRITICAL: trial_sessions table does not exist!');
        console.error('[TrialService] Run migrations: npm run init-db');
        console.error('[TrialService] Error code: TRIAL_DB_MIGRATION_MISSING');
        return { 
          ok: false, 
          code: 'TRIAL_DB_MIGRATION_MISSING',
          error: 'Trial service is temporarily unavailable. Please try again later.',
          errorCode: 'server_error' 
        };
      }
      
      console.log('[TrialService] Error: TRIAL_INTERNAL_ERROR');
      return { 
        ok: false, 
        code: 'TRIAL_INTERNAL_ERROR',
        error: 'Something went wrong. Please try again.',
        errorCode: 'server_error' 
      };
    }
  }

  async verifyTrialToken(token: string): Promise<TrialVerifyResult> {
    try {
      const trial = await db.select()
        .from(trialSessions)
        .where(eq(trialSessions.verificationToken, token))
        .limit(1);

      if (trial.length === 0) {
        return { ok: false, error: 'Invalid verification link.', errorCode: 'invalid_token' };
      }

      const trialSession = trial[0];

      if (trialSession.verificationExpiry && new Date() > trialSession.verificationExpiry) {
        return { ok: false, error: 'Verification link has expired. Please start a new trial.', errorCode: 'expired_token' };
      }

      if (trialSession.status === 'expired') {
        return { ok: false, error: 'This trial has already expired.', errorCode: 'already_expired' };
      }

      const now = new Date();
      const trialEndsAt = new Date(now.getTime() + TRIAL_DURATION_SECONDS * 1000);

      if (!trialSession.verifiedAt) {
        await db.update(trialSessions)
          .set({
            verifiedAt: now,
            trialStartedAt: now,
            trialEndsAt,
            status: 'active',
            verificationToken: null,
            updatedAt: now,
          })
          .where(eq(trialSessions.id, trialSession.id));
      }

      return {
        ok: true,
        status: 'active',
        secondsRemaining: TRIAL_DURATION_SECONDS - (trialSession.consumedSeconds ?? 0),
      };
    } catch (error) {
      console.error('[TrialService] Error verifying trial:', error);
      return { ok: false, error: 'An error occurred. Please try again.', errorCode: 'server_error' };
    }
  }

  async getTrialStatus(deviceIdHash: string): Promise<TrialSession | null> {
    try {
      const trial = await db.select()
        .from(trialSessions)
        .where(eq(trialSessions.deviceIdHash, deviceIdHash))
        .limit(1);

      return trial.length > 0 ? trial[0] : null;
    } catch (error) {
      console.error('[TrialService] Error getting trial status:', error);
      return null;
    }
  }

  async getTrialById(trialId: string): Promise<TrialSession | null> {
    try {
      const trial = await db.select()
        .from(trialSessions)
        .where(eq(trialSessions.id, trialId))
        .limit(1);

      return trial.length > 0 ? trial[0] : null;
    } catch (error) {
      console.error('[TrialService] Error getting trial by ID:', error);
      return null;
    }
  }

  async getTrialEntitlement(deviceIdHash: string): Promise<TrialEntitlement> {
    try {
      const trial = await this.getTrialStatus(deviceIdHash);

      if (!trial) {
        return { hasAccess: false, reason: 'trial_not_found' };
      }

      if (!trial.verifiedAt) {
        return { hasAccess: false, reason: 'trial_not_verified' };
      }

      const consumedSeconds = trial.consumedSeconds ?? 0;
      const secondsRemaining = TRIAL_DURATION_SECONDS - consumedSeconds;

      if (secondsRemaining <= 0 || trial.status === 'expired') {
        return { hasAccess: false, reason: 'trial_expired', trialId: trial.id };
      }

      return {
        hasAccess: true,
        reason: 'trial_active',
        trialSecondsRemaining: secondsRemaining,
        trialId: trial.id,
      };
    } catch (error) {
      console.error('[TrialService] Error getting trial entitlement:', error);
      return { hasAccess: false, reason: 'trial_not_found' };
    }
  }

  async updateConsumedSeconds(trialId: string, secondsToAdd: number): Promise<boolean> {
    try {
      const trial = await this.getTrialById(trialId);
      if (!trial) return false;

      const newConsumed = Math.min(
        (trial.consumedSeconds ?? 0) + secondsToAdd,
        TRIAL_DURATION_SECONDS
      );

      const newStatus = newConsumed >= TRIAL_DURATION_SECONDS ? 'expired' : 'active';

      await db.update(trialSessions)
        .set({
          consumedSeconds: newConsumed,
          status: newStatus as 'pending' | 'active' | 'expired' | 'blocked',
          lastActiveAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(trialSessions.id, trialId));

      return true;
    } catch (error) {
      console.error('[TrialService] Error updating consumed seconds:', error);
      return false;
    }
  }

  async expireTrial(trialId: string): Promise<boolean> {
    try {
      await db.update(trialSessions)
        .set({
          status: 'expired',
          consumedSeconds: TRIAL_DURATION_SECONDS,
          updatedAt: new Date(),
        })
        .where(eq(trialSessions.id, trialId));

      return true;
    } catch (error) {
      console.error('[TrialService] Error expiring trial:', error);
      return false;
    }
  }

  private async sendTrialVerificationEmail(email: string, token: string): Promise<void> {
    const baseUrl = this.getBaseUrl();
    const verifyUrl = `${baseUrl}/trial/verify?token=${token}`;
    
    // Validate URL format
    if (!verifyUrl.startsWith('https://') && !verifyUrl.startsWith('http://')) {
      console.error('[TrialService] ERROR: verifyUrl does not start with https:// - emails may not work');
    }
    
    // Dev logging only (don't log full token in production)
    if (process.env.NODE_ENV === 'development') {
      console.log('[TrialService] Sending trial email to:', email);
      console.log('[TrialService] verifyUrl:', verifyUrl);
      console.log('[TrialService] URL starts with https:', verifyUrl.startsWith('https://'));
    } else {
      console.log('[TrialService] Sending trial email to:', email);
      console.log('[TrialService] baseUrl:', baseUrl);
    }

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Start Your Free Trial</title>
</head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background-color:#f4f4f4;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;">
<tr>
<td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;max-width:600px;">
<tr>
<td style="padding:40px;">
<h1 style="margin:0 0 20px 0;color:#dc2626;font-size:28px;font-weight:bold;">Start Your Free Trial!</h1>
<p style="margin:0 0 30px 0;color:#333333;font-size:16px;line-height:24px;">Thank you for your interest in JIE Mastery AI Tutor. Click the button below to verify your email and start your 5-minute free trial.</p>
<table cellpadding="0" cellspacing="0" style="margin:0 0 30px 0;">
<tr>
<td align="center" bgcolor="#dc2626" style="border-radius:6px;">
<a href="${verifyUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;">Start My Free Trial</a>
</td>
</tr>
</table>
<p style="margin:0 0 10px 0;color:#666666;font-size:14px;">If the button doesn't work, copy and paste this link into your browser:</p>
<p style="margin:0 0 20px 0;color:#666666;font-size:14px;word-break:break-all;"><a href="${verifyUrl}" style="color:#dc2626;text-decoration:underline;">${verifyUrl}</a></p>
<p style="margin:0 0 10px 0;color:#666666;font-size:14px;">This link expires in 30 minutes.</p>
<p style="margin:0;color:#666666;font-size:14px;">If you didn't request this, you can safely ignore this email.</p>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;

    const textContent = `Start Your Free Trial!

Thank you for your interest in JIE Mastery AI Tutor.

Click the link below to verify your email and start your 5-minute free trial:

${verifyUrl}

This link expires in 30 minutes.

If you didn't request this, you can safely ignore this email.`;

    await this.emailService.sendEmail({
      to: email,
      subject: 'Verify your email for JIE Mastery Free Trial',
      html: htmlContent,
      text: textContent,
    });
  }

  private getBaseUrl(): string {
    if (process.env.APP_URL) {
      return process.env.APP_URL.replace(/\/$/, '');
    } else if (process.env.RAILWAY_STATIC_URL) {
      return process.env.RAILWAY_STATIC_URL.replace(/\/$/, '');
    } else if (process.env.RAILWAY_PUBLIC_DOMAIN) {
      return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
    } else if (process.env.REPLIT_DOMAINS) {
      return `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`;
    } else {
      return process.env.REPLIT_DEV_DOMAIN || `http://localhost:${process.env.PORT || 5000}`;
    }
  }

  // Generate a signed session token for WebSocket authentication
  generateSessionToken(trialId: string): string {
    const secret = process.env.SESSION_SECRET || 'development-session-secret-only';
    const now = Math.floor(Date.now() / 1000);
    const payload: TrialSessionToken = {
      type: 'trial',
      trialId,
      issuedAt: now,
      expiresAt: now + TRIAL_TOKEN_EXPIRY_SECONDS,
    };
    const data = JSON.stringify(payload);
    const signature = createHmac('sha256', secret).update(data).digest('hex');
    return Buffer.from(`${data}.${signature}`).toString('base64');
  }

  // Validate a session token and return the payload
  validateSessionToken(token: string): TrialSessionToken | null {
    try {
      const secret = process.env.SESSION_SECRET || 'development-session-secret-only';
      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      const lastDotIndex = decoded.lastIndexOf('.');
      if (lastDotIndex === -1) return null;
      
      const data = decoded.substring(0, lastDotIndex);
      const signature = decoded.substring(lastDotIndex + 1);
      
      const expectedSignature = createHmac('sha256', secret).update(data).digest('hex');
      if (signature !== expectedSignature) {
        console.log('[TrialService] Token signature mismatch');
        return null;
      }
      
      const payload = JSON.parse(data) as TrialSessionToken;
      const now = Math.floor(Date.now() / 1000);
      
      if (payload.expiresAt < now) {
        console.log('[TrialService] Token expired');
        return null;
      }
      
      if (payload.type !== 'trial') {
        console.log('[TrialService] Invalid token type');
        return null;
      }
      
      return payload;
    } catch (error) {
      console.error('[TrialService] Token validation error:', error);
      return null;
    }
  }

  // Get a session token for WebSocket connection
  async getSessionToken(deviceIdHash: string): Promise<TrialSessionTokenResult> {
    try {
      const entitlement = await this.getTrialEntitlement(deviceIdHash);
      
      // Strictly enforce entitlement checks
      if (!entitlement.hasAccess) {
        console.log('[TrialService] Token denied: no access, reason:', entitlement.reason);
        return { ok: false, error: entitlement.reason };
      }
      
      if (!entitlement.trialId) {
        console.log('[TrialService] Token denied: no trial ID');
        return { ok: false, error: 'trial_not_found' };
      }
      
      // Verify trial still has remaining time
      if (!entitlement.trialSecondsRemaining || entitlement.trialSecondsRemaining <= 0) {
        console.log('[TrialService] Token denied: no seconds remaining');
        return { ok: false, error: 'trial_expired' };
      }
      
      const token = this.generateSessionToken(entitlement.trialId);
      console.log('[TrialService] Token issued for trial:', entitlement.trialId, 'remaining:', entitlement.trialSecondsRemaining);
      
      return {
        ok: true,
        token,
        secondsRemaining: entitlement.trialSecondsRemaining,
        trialId: entitlement.trialId,
      };
    } catch (error) {
      console.error('[TrialService] Error generating session token:', error);
      return { ok: false, error: 'server_error' };
    }
  }
}

export const trialService = new TrialService();
