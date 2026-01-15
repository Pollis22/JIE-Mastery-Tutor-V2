import { db } from '../db';
import { trialSessions, trialRateLimits, trialLoginTokens, TrialSession } from '@shared/schema';
import { eq, and, gte, sql, isNull, lt, or } from 'drizzle-orm';
import crypto, { createHash, randomBytes, createHmac } from 'crypto';
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

// Canonical hashing function - used EVERYWHERE for consistency
export function hashEmail(email: string): string {
  const normalized = email.toLowerCase().trim();
  return createHash('sha256').update(normalized).digest('hex');
}

// Canonical email normalization - used EVERYWHERE
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

// Legacy alias for internal use - DO NOT use in new code
function hashValue(value: string): string {
  return createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
}

// Standardized error codes for trial operations
export type TrialErrorCode = 
  | 'TRIAL_EMAIL_USED'
  | 'TRIAL_DEVICE_USED'
  | 'TRIAL_RATE_LIMITED'
  | 'TRIAL_EXPIRED'
  | 'TRIAL_INTERNAL_ERROR'
  | 'TRIAL_DB_MIGRATION_MISSING'
  | 'TRIAL_DB_SCHEMA_MISMATCH'
  | 'TRIAL_DB_ERROR'
  | 'EMAIL_SEND_FAILED'
  | 'TRIAL_CONFIG_ERROR';

// Helper to check if error is a missing table error
function isMissingTableError(error: any): boolean {
  // PostgreSQL error code 42P01 = undefined_table
  return error?.code === '42P01' || 
    error?.message?.includes('relation') && error?.message?.includes('does not exist');
}

// Helper to check if error is a missing column error
function isMissingColumnError(error: any): boolean {
  // PostgreSQL error code 42703 = undefined_column
  return error?.code === '42703' || 
    (error?.message?.includes('column') && error?.message?.includes('does not exist'));
}

// Extract column name from error message
function extractMissingColumn(error: any): string | null {
  const match = error?.message?.match(/column ["']?(\w+)["']? (?:of relation|does not exist)/i) ||
                error?.message?.match(/column (\w+) does not exist/i);
  return match ? match[1] : null;
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

// Unified trial resolution result - used by both /status and /session-token
export interface TrialResolutionResult {
  trialSession: TrialSession | null;
  hasAccess: boolean;
  reason: 'trial_active' | 'trial_expired' | 'trial_not_found' | 'trial_not_verified';
  secondsRemaining: number;
  trialId: string | null;
  lookupPath: 'email_hash_cookie' | 'email_body_fallback';
  emailHashUsed: string | null;
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

export type MagicLinkErrorCode = 
  | 'NOT_VERIFIED'
  | 'TRIAL_EXHAUSTED'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export interface MagicLinkRequestResult {
  ok: boolean;
  code?: MagicLinkErrorCode;
  error?: string;
  verificationResent?: boolean;
}

export interface MagicLinkValidateResult {
  ok: boolean;
  trial?: TrialSession;
  secondsRemaining?: number;
  error?: string;
  errorCode?: 'invalid_token' | 'expired_token' | 'trial_exhausted' | 'server_error';
}

const MAGIC_TOKEN_EXPIRY_MINUTES = 15;

export class TrialService {
  private emailService: EmailService;

  constructor() {
    this.emailService = new EmailService();
  }

  async startTrial(email: string, deviceIdHash: string, ipHash: string): Promise<TrialStartResult> {
    const requestId = randomBytes(4).toString('hex');
    let currentStep = 'init';
    
    try {
      console.log(`[TrialService:${requestId}] startTrial BEGIN`);
      currentStep = 'normalize_email';
      const normalizedEmail = normalizeEmail(email);
      const emailHash = hashValue(normalizedEmail);
      console.log(`[TrialService:${requestId}] Step: ${currentStep} OK - emailHash: ${emailHash.substring(0, 12)}...`);
      
      // Check if this is a QA email that bypasses "email already used" restriction
      const isQaEmail = QA_EMAILS.includes(normalizedEmail);
      
      if (QA_MODE) {
        console.log(`[TrialService:${requestId}] QA_MODE enabled - bypassing IP/device rate limits`);
        if (isQaEmail) {
          console.log(`[TrialService:${requestId}] QA email detected - bypassing email-already-used check`);
        }
      }

      // Check if trial already exists for this email
      currentStep = 'check_existing_trial';
      console.log(`[TrialService:${requestId}] Step: ${currentStep}...`);
      const existing = await db.select()
        .from(trialSessions)
        .where(eq(trialSessions.emailHash, emailHash))
        .limit(1);
      console.log(`[TrialService:${requestId}] Step: ${currentStep} OK - found: ${existing.length}`);

      // Handle existing trials (except QA emails which bypass all checks)
      if (existing.length > 0 && !isQaEmail) {
        const existingTrial = existing[0];
        const now = new Date();
        
        // Case 1: Verified and still active (not expired) - block with 409
        if (existingTrial.verifiedAt !== null) {
          const consumedSeconds = existingTrial.consumedSeconds ?? 0;
          const secondsRemaining = TRIAL_DURATION_SECONDS - consumedSeconds;
          const isExpired = secondsRemaining <= 0 || existingTrial.status === 'expired' ||
            (existingTrial.trialEndsAt && now > existingTrial.trialEndsAt);
          
          if (!isExpired) {
            // Active trial - return 409 with continue trial path
            console.log(`[TrialService:${requestId}] BLOCKED: TRIAL_EMAIL_USED - active trial exists, secondsRemaining: ${secondsRemaining}`);
            return { 
              ok: false, 
              code: 'TRIAL_EMAIL_USED',
              error: 'This email has an active trial. Use "Continue Trial" to resume.',
              errorCode: 'email_used' 
            };
          } else {
            // Expired trial - block without continue path
            console.log(`[TrialService:${requestId}] BLOCKED: TRIAL_EMAIL_USED - trial expired, no new trial allowed`);
            return { 
              ok: false, 
              code: 'TRIAL_EMAIL_USED',
              error: 'This email address has already been used for a free trial.',
              errorCode: 'email_used' 
            };
          }
        }
        
        // Case 2: Pending trial with expired verification token - rotate and resend
        if (existingTrial.verificationExpiry && now > existingTrial.verificationExpiry) {
          console.log(`[TrialService:${requestId}] Existing trial is pending with expired verification - will rotate token and resend`);
          // Continue to upsert logic below which will refresh token
        } else {
          // Case 3: Pending trial with valid verification token - resend same token
          console.log(`[TrialService:${requestId}] Existing trial is pending with valid verification - will resend verification`);
        }
      }

      // Device blocking check - skip if QA_MODE or TRIAL_ENFORCE_DEVICE_LIMIT is not "1"
      if (ENFORCE_DEVICE_LIMIT && !QA_MODE) {
        currentStep = 'check_device_limit';
        console.log(`[TrialService:${requestId}] Step: ${currentStep}...`);
        const thirtyDaysAgo = new Date(Date.now() - DEVICE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
        const deviceTrial = await db.select()
          .from(trialSessions)
          .where(and(
            eq(trialSessions.deviceIdHash, deviceIdHash),
            gte(trialSessions.createdAt, thirtyDaysAgo)
          ))
          .limit(1);
        console.log(`[TrialService:${requestId}] Step: ${currentStep} OK - found: ${deviceTrial.length}`);

        if (deviceTrial.length > 0 && deviceTrial[0].verifiedAt !== null) {
          console.log(`[TrialService:${requestId}] BLOCKED: TRIAL_DEVICE_USED`);
          return { 
            ok: false, 
            code: 'TRIAL_DEVICE_USED',
            error: 'A free trial has already been used on this device.',
            errorCode: 'device_blocked' 
          };
        }
      } else {
        console.log(`[TrialService:${requestId}] Step: check_device_limit SKIPPED (QA_MODE or disabled)`);
      }

      // IP rate limiting - skip if QA_MODE
      if (!QA_MODE) {
        currentStep = 'check_ip_rate_limit';
        console.log(`[TrialService:${requestId}] Step: ${currentStep}...`);
        const windowStart = new Date(Date.now() - IP_RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000);
        const ipLimit = await db.select()
          .from(trialRateLimits)
          .where(and(
            eq(trialRateLimits.ipHash, ipHash),
            gte(trialRateLimits.windowStart, windowStart)
          ))
          .limit(1);
        console.log(`[TrialService:${requestId}] Step: ${currentStep} OK - found: ${ipLimit.length}, count: ${ipLimit[0]?.attemptCount ?? 0}`);

        if (ipLimit.length > 0 && (ipLimit[0].attemptCount ?? 0) >= IP_RATE_LIMIT_MAX_ATTEMPTS) {
          console.log(`[TrialService:${requestId}] BLOCKED: TRIAL_RATE_LIMITED`);
          return { 
            ok: false, 
            code: 'TRIAL_RATE_LIMITED',
            error: 'Too many trial attempts from this location. Please try again later.',
            errorCode: 'ip_rate_limited' 
          };
        }
      } else {
        console.log(`[TrialService:${requestId}] Step: check_ip_rate_limit SKIPPED (QA_MODE)`);
      }

      currentStep = 'generate_token';
      const verificationToken = randomBytes(32).toString('hex');
      const verificationExpiry = new Date(Date.now() + 30 * 60 * 1000);
      const now = new Date();
      console.log(`[TrialService:${requestId}] Step: ${currentStep} OK - token: ${verificationToken.substring(0, 12)}...`);

      // UPSERT: Insert or update by email_hash (unique constraint)
      if (existing.length > 0) {
        // Update existing pending trial with new verification token
        currentStep = 'db_update_trial';
        console.log(`[TrialService:${requestId}] Step: ${currentStep}...`);
        await db.update(trialSessions)
          .set({
            verificationToken,
            verificationExpiry,
            deviceIdHash,
            ipHash,
            status: 'pending',
            consumedSeconds: 0,
            lastActiveAt: now,
            updatedAt: now,
          })
          .where(eq(trialSessions.emailHash, emailHash));
        console.log(`[TrialService:${requestId}] Step: ${currentStep} OK`);
      } else {
        // Insert new trial
        currentStep = 'db_insert_trial';
        console.log(`[TrialService:${requestId}] Step: ${currentStep}...`);
        await db.insert(trialSessions).values({
          emailHash,
          email: normalizedEmail,
          verificationToken,
          verificationExpiry,
          deviceIdHash,
          ipHash,
          status: 'pending',
          consumedSeconds: 0,
          lastActiveAt: now,
          updatedAt: now,
        });
        console.log(`[TrialService:${requestId}] Step: ${currentStep} OK`);
      }

      // Track IP rate limits (skip in QA mode)
      if (!QA_MODE) {
        currentStep = 'update_ip_rate_limit';
        console.log(`[TrialService:${requestId}] Step: ${currentStep}...`);
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
        console.log(`[TrialService:${requestId}] Step: ${currentStep} OK`);
      }

      currentStep = 'send_verification_email';
      console.log(`[TrialService:${requestId}] Step: ${currentStep}...`);
      await this.sendTrialVerificationEmail(normalizedEmail, verificationToken);
      console.log(`[TrialService:${requestId}] Step: ${currentStep} OK`);

      // Send admin notification (non-blocking)
      this.sendAdminTrialNotification(normalizedEmail, 'pending', TRIAL_DURATION_SECONDS / 60).catch(err => {
        console.error(`[TrialService:${requestId}] Failed to send admin trial notification:`, err);
      });

      console.log(`[TrialService:${requestId}] startTrial SUCCESS`);
      return { ok: true };
    } catch (error: any) {
      console.error(`[TrialService:${requestId}] ERROR at step '${currentStep}':`, error?.message || error);
      console.error(`[TrialService:${requestId}] Full error:`, error);
      
      // Check if this is a missing table error (migration not applied)
      if (isMissingTableError(error)) {
        console.error(`[TrialService:${requestId}] CRITICAL: trial_sessions table does not exist!`);
        console.error(`[TrialService:${requestId}] ACTION REQUIRED: Ensure trial_sessions table exists in database`);
        return { 
          ok: false, 
          code: 'TRIAL_DB_MIGRATION_MISSING',
          error: 'Trial service is temporarily unavailable. Please try again later.',
          errorCode: 'server_error' 
        };
      }
      
      // Check if this is a missing column error (schema mismatch)
      if (isMissingColumnError(error)) {
        const missingColumn = extractMissingColumn(error);
        console.error(`[TrialService:${requestId}] CRITICAL: Schema mismatch - column '${missingColumn}' does not exist!`);
        console.error(`[TrialService:${requestId}] Continue-trial tokens use trial_login_tokens table. Error code: 42703`);
        return { 
          ok: false, 
          code: 'TRIAL_DB_SCHEMA_MISMATCH',
          error: 'Trial service is temporarily unavailable. Please try again later.',
          errorCode: 'server_error' 
        };
      }
      
      // Check for DB constraint violations
      if (error?.code === '23505') { // unique_violation
        console.error(`[TrialService:${requestId}] DB unique constraint violation`);
        return { 
          ok: false, 
          code: 'TRIAL_DB_ERROR',
          error: 'A trial with this email already exists.',
          errorCode: 'email_used' 
        };
      }
      
      // Check for email provider errors
      if (currentStep === 'send_verification_email') {
        console.error(`[TrialService:${requestId}] Email send failed`);
        return { 
          ok: false, 
          code: 'EMAIL_SEND_FAILED',
          error: 'Failed to send verification email. Please try again.',
          errorCode: 'server_error' 
        };
      }
      
      // Check for missing env vars
      if (error?.message?.includes('environment variable') || error?.message?.includes('API key')) {
        console.error(`[TrialService:${requestId}] Config error - missing env var`);
        return { 
          ok: false, 
          code: 'TRIAL_CONFIG_ERROR',
          error: 'Trial service is misconfigured. Please contact support.',
          errorCode: 'server_error' 
        };
      }
      
      console.error(`[TrialService:${requestId}] INTERNAL_ERROR at step '${currentStep}'`);
      return { 
        ok: false, 
        code: 'TRIAL_INTERNAL_ERROR',
        error: 'Something went wrong. Please try again.',
        errorCode: 'server_error' 
      };
    }
  }

  async verifyTrialToken(token: string): Promise<TrialVerifyResult & { emailHash?: string }> {
    try {
      console.log('[TrialService] verifyTrialToken called with token:', token.substring(0, 12) + '...');
      
      const trial = await db.select()
        .from(trialSessions)
        .where(eq(trialSessions.verificationToken, token))
        .limit(1);

      if (trial.length === 0) {
        console.log('[TrialService] VERIFY FAILED: token not found');
        return { ok: false, error: 'Invalid verification link.', errorCode: 'invalid_token' };
      }

      const trialSession = trial[0];
      console.log('[TrialService] VERIFY: Found trial', {
        emailHash: trialSession.emailHash.substring(0, 12) + '...',
        status: trialSession.status,
        verifiedAt: trialSession.verifiedAt ? 'set' : 'null',
        trialEndsAt: trialSession.trialEndsAt ? trialSession.trialEndsAt.toISOString() : 'null',
      });

      if (trialSession.verificationExpiry && new Date() > trialSession.verificationExpiry) {
        console.log('[TrialService] VERIFY FAILED: token expired');
        return { ok: false, error: 'Verification link has expired. Please start a new trial.', errorCode: 'expired_token' };
      }

      if (trialSession.status === 'expired') {
        console.log('[TrialService] VERIFY FAILED: trial already expired');
        return { ok: false, error: 'This trial has already expired.', errorCode: 'already_expired' };
      }

      const now = new Date();
      const trialEndsAt = new Date(now.getTime() + TRIAL_DURATION_SECONDS * 1000);

      // ALWAYS update the trial to active state (even if already verified)
      // This ensures all required fields are populated for /status check
      await db.update(trialSessions)
        .set({
          verifiedAt: now,
          trialStartedAt: now,
          trialEndsAt,
          status: 'active',
          verificationToken: null,
          lastActiveAt: now,
          updatedAt: now,
        })
        .where(eq(trialSessions.id, trialSession.id));

      console.log('[TrialService] VERIFY SUCCESS:', {
        emailHash: trialSession.emailHash.substring(0, 12) + '...',
        status: 'active',
        verifiedAt: now.toISOString(),
        trialEndsAt: trialEndsAt.toISOString(),
      });

      return {
        ok: true,
        status: 'active',
        secondsRemaining: TRIAL_DURATION_SECONDS - (trialSession.consumedSeconds ?? 0),
        emailHash: trialSession.emailHash,
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

  async getTrialByEmailHash(emailHash: string): Promise<TrialSession | null> {
    try {
      const trial = await db.select()
        .from(trialSessions)
        .where(eq(trialSessions.emailHash, emailHash))
        .limit(1);

      return trial.length > 0 ? trial[0] : null;
    } catch (error) {
      console.error('[TrialService] Error getting trial by email hash:', error);
      return null;
    }
  }

  /**
   * UNIFIED TRIAL RESOLUTION - used by BOTH /status AND /session-token
   * 
   * Lookup priority:
   * 1. email_hash cookie (set during verification)
   * 2. email from request body → normalize → hash (fallback only)
   * 
   * NEVER uses deviceIdHash or ipHash for trial lookup (those are for rate limiting only)
   */
  async resolveTrialFromRequest(
    emailHashFromCookie: string | undefined,
    emailFromBody: string | undefined
  ): Promise<TrialResolutionResult> {
    let emailHashUsed: string | null = null;
    let lookupPath: 'email_hash_cookie' | 'email_body_fallback';

    // Primary: email_hash cookie
    if (emailHashFromCookie) {
      emailHashUsed = emailHashFromCookie;
      lookupPath = 'email_hash_cookie';
    } else if (emailFromBody) {
      // Fallback: email from request body → normalize → hash
      emailHashUsed = hashEmail(emailFromBody);
      lookupPath = 'email_body_fallback';
    } else {
      // No identification available
      console.log('[TrialService] resolveTrialFromRequest: NO email_hash cookie or email body');
      return {
        trialSession: null,
        hasAccess: false,
        reason: 'trial_not_found',
        secondsRemaining: 0,
        trialId: null,
        lookupPath: 'email_hash_cookie',
        emailHashUsed: null,
      };
    }

    console.log('[TrialService] resolveTrialFromRequest:', {
      lookupPath,
      emailHash: emailHashUsed.substring(0, 12) + '...',
    });

    // Query trial_sessions by email_hash ONLY
    const trial = await this.getTrialByEmailHash(emailHashUsed);

    if (!trial) {
      console.log('[TrialService] resolveTrialFromRequest: trial NOT FOUND for hash:', emailHashUsed.substring(0, 12) + '...');
      return {
        trialSession: null,
        hasAccess: false,
        reason: 'trial_not_found',
        secondsRemaining: 0,
        trialId: null,
        lookupPath,
        emailHashUsed,
      };
    }

    console.log('[TrialService] resolveTrialFromRequest: trial FOUND:', {
      trialId: trial.id,
      status: trial.status,
      verifiedAt: trial.verifiedAt ? 'set' : 'null',
      lookupPath,
    });

    // Check verification status
    if (!trial.verifiedAt) {
      return {
        trialSession: trial,
        hasAccess: false,
        reason: 'trial_not_verified',
        secondsRemaining: 0,
        trialId: trial.id,
        lookupPath,
        emailHashUsed,
      };
    }

    // Check if trial has expired by time
    const now = new Date();
    if (trial.trialEndsAt && now > trial.trialEndsAt) {
      await db.update(trialSessions)
        .set({ status: 'expired', updatedAt: now })
        .where(eq(trialSessions.id, trial.id));
      return {
        trialSession: trial,
        hasAccess: false,
        reason: 'trial_expired',
        secondsRemaining: 0,
        trialId: trial.id,
        lookupPath,
        emailHashUsed,
      };
    }

    // Check consumed seconds
    const consumedSeconds = trial.consumedSeconds ?? 0;
    const secondsRemaining = TRIAL_DURATION_SECONDS - consumedSeconds;

    if (secondsRemaining <= 0 || trial.status === 'expired') {
      return {
        trialSession: trial,
        hasAccess: false,
        reason: 'trial_expired',
        secondsRemaining: 0,
        trialId: trial.id,
        lookupPath,
        emailHashUsed,
      };
    }

    // Trial is active
    return {
      trialSession: trial,
      hasAccess: true,
      reason: 'trial_active',
      secondsRemaining,
      trialId: trial.id,
      lookupPath,
      emailHashUsed,
    };
  }

  async getTrialEntitlementByEmailHash(emailHash: string, lookupPath: string): Promise<TrialEntitlement> {
    try {
      const trial = await this.getTrialByEmailHash(emailHash);

      console.log('[TrialService] STATUS lookup:', {
        emailHash: emailHash.substring(0, 12) + '...',
        lookupPath,
        status: trial?.status ?? 'not_found',
        verifiedAt: trial?.verifiedAt ? 'set' : 'null',
        trialEndsAt: trial?.trialEndsAt ? trial.trialEndsAt.toISOString() : 'null',
      });

      if (!trial) {
        return { hasAccess: false, reason: 'trial_not_found' };
      }

      if (!trial.verifiedAt) {
        return { hasAccess: false, reason: 'trial_not_verified' };
      }

      // Check if trial has expired by time
      const now = new Date();
      if (trial.trialEndsAt && now > trial.trialEndsAt) {
        // Update status to expired in DB
        await db.update(trialSessions)
          .set({ status: 'expired', updatedAt: now })
          .where(eq(trialSessions.id, trial.id));
        return { hasAccess: false, reason: 'trial_expired', trialId: trial.id };
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
      console.error('[TrialService] Error getting trial entitlement by email hash:', error);
      return { hasAccess: false, reason: 'trial_not_found' };
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
<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<!--[if mso]>
<xml>
<o:OfficeDocumentSettings>
<o:AllowPNG/>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
<![endif]-->
<title>Start Your Free Trial</title>
</head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background-color:#f4f4f4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f4;">
<tr>
<td align="center" style="padding:40px 20px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:8px;max-width:600px;">
<tr>
<td style="padding:40px;">
<h1 style="margin:0 0 20px 0;color:#dc2626;font-size:28px;font-weight:bold;font-family:Arial,Helvetica,sans-serif;">Start Your Free Trial!</h1>
<p style="margin:0 0 30px 0;color:#333333;font-size:16px;line-height:24px;font-family:Arial,Helvetica,sans-serif;">Thank you for your interest in JIE Mastery AI Tutor. Click the button below to verify your email and start your 5-minute free trial.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 30px 0;">
<tr>
<td align="center">
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${verifyUrl}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="10%" strokecolor="#dc2626" fillcolor="#dc2626">
<w:anchorlock/>
<center style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;">Start My Free Trial</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<a href="${verifyUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;background-color:#dc2626;border-radius:6px;font-family:Arial,Helvetica,sans-serif;">Start My Free Trial</a>
<!--<![endif]-->
</td>
</tr>
</table>
<p style="margin:0 0 10px 0;color:#666666;font-size:14px;font-family:Arial,Helvetica,sans-serif;">If the button doesn't work, copy and paste this link into your browser:</p>
<p style="margin:0 0 20px 0;color:#666666;font-size:14px;word-break:break-all;font-family:Arial,Helvetica,sans-serif;"><a href="${verifyUrl}" style="color:#dc2626;text-decoration:underline;">${verifyUrl}</a></p>
<p style="margin:0 0 10px 0;color:#666666;font-size:14px;font-family:Arial,Helvetica,sans-serif;">This link expires in 30 minutes.</p>
<p style="margin:0;color:#666666;font-size:14px;font-family:Arial,Helvetica,sans-serif;">If you didn't request this, you can safely ignore this email.</p>
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

  private async sendAdminTrialNotification(email: string, status: string, trialMinutes: number): Promise<void> {
    // Admin email for trial notifications - uses TRIAL_LEAD_NOTIFY_EMAIL or fallbacks
    const adminEmail = process.env.TRIAL_LEAD_NOTIFY_EMAIL || process.env.ADMIN_TRIAL_ALERT_EMAIL || process.env.ADMIN_EMAIL;
    
    if (!adminEmail) {
      console.warn('[TrialService] TRIAL_LEAD_NOTIFY_EMAIL not set - skipping admin notification');
      return;
    }
    
    const baseUrl = this.getBaseUrl();
    const adminPanelLink = `${baseUrl}/admin`;
    const createdAt = new Date().toLocaleString('en-US', { 
      timeZone: 'America/New_York',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    console.log(`[TrialService] Sending admin trial notification to: ${adminEmail}`);

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>New Free Trial Started</title>
</head>
<body style="margin:0;padding:20px;font-family:Arial,Helvetica,sans-serif;background-color:#f4f4f4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:8px;max-width:600px;">
<tr>
<td style="padding:30px;">
<h2 style="margin:0 0 20px 0;color:#dc2626;font-size:22px;">New JIE Mastery Free Trial Started</h2>
<table role="presentation" cellpadding="8" cellspacing="0" border="0" style="margin-bottom:20px;width:100%;">
<tr>
<td style="color:#666;font-size:14px;width:120px;"><strong>Email:</strong></td>
<td style="color:#333;font-size:14px;">${email}</td>
</tr>
<tr>
<td style="color:#666;font-size:14px;"><strong>Status:</strong></td>
<td style="color:#333;font-size:14px;">${status.charAt(0).toUpperCase() + status.slice(1)}</td>
</tr>
<tr>
<td style="color:#666;font-size:14px;"><strong>Trial Minutes:</strong></td>
<td style="color:#333;font-size:14px;">${trialMinutes}</td>
</tr>
<tr>
<td style="color:#666;font-size:14px;"><strong>Created:</strong></td>
<td style="color:#333;font-size:14px;">${createdAt} (ET)</td>
</tr>
</table>
<p style="margin:20px 0 0 0;">
<a href="${adminPanelLink}" style="display:inline-block;padding:10px 20px;font-size:14px;color:#ffffff;text-decoration:none;background-color:#dc2626;border-radius:4px;">View in Admin Panel</a>
</p>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;

    const textContent = `New JIE Mastery Free Trial Started

Email: ${email}
Status: ${status.charAt(0).toUpperCase() + status.slice(1)}
Trial Minutes: ${trialMinutes}
Created: ${createdAt} (ET)

View in Admin Panel: ${adminPanelLink}`;

    await this.emailService.sendEmail({
      to: adminEmail,
      subject: 'New JIE Mastery Free Trial Started',
      html: htmlContent,
      text: textContent,
    });

    console.log(`[TrialService] Admin trial notification sent successfully`);
  }

  private getBaseUrl(): string {
    let baseUrl = '';
    
    if (process.env.APP_URL) {
      baseUrl = process.env.APP_URL.replace(/\/$/, '');
    } else if (process.env.RAILWAY_STATIC_URL) {
      baseUrl = process.env.RAILWAY_STATIC_URL.replace(/\/$/, '');
    } else if (process.env.RAILWAY_PUBLIC_DOMAIN) {
      baseUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
    } else if (process.env.REPLIT_DOMAINS) {
      baseUrl = `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`;
    } else {
      baseUrl = process.env.REPLIT_DEV_DOMAIN || `http://localhost:${process.env.PORT || 5000}`;
    }
    
    // CRITICAL: Ensure https:// protocol is present (required for Outlook email links)
    if (baseUrl && !baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = `https://${baseUrl}`;
    }
    
    return baseUrl;
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

  // Get a session token using email hash (primary lookup - matches /status behavior)
  async getSessionTokenByEmailHash(emailHash: string, lookupPath: string): Promise<TrialSessionTokenResult> {
    try {
      console.log('[TrialService] getSessionTokenByEmailHash:', {
        emailHash: emailHash.substring(0, 12) + '...',
        lookupPath,
      });

      const entitlement = await this.getTrialEntitlementByEmailHash(emailHash, lookupPath);
      
      // Strictly enforce entitlement checks
      if (!entitlement.hasAccess) {
        console.log('[TrialService] Token denied (emailHash): no access, reason:', entitlement.reason, 'lookupPath:', lookupPath);
        return { ok: false, error: entitlement.reason };
      }
      
      if (!entitlement.trialId) {
        console.log('[TrialService] Token denied (emailHash): no trial ID, lookupPath:', lookupPath);
        return { ok: false, error: 'trial_not_found' };
      }
      
      // Verify trial still has remaining time
      if (!entitlement.trialSecondsRemaining || entitlement.trialSecondsRemaining <= 0) {
        console.log('[TrialService] Token denied (emailHash): no seconds remaining, lookupPath:', lookupPath);
        return { ok: false, error: 'trial_expired' };
      }
      
      const token = this.generateSessionToken(entitlement.trialId);
      console.log('[TrialService] Token issued (emailHash) for trial:', entitlement.trialId, 'remaining:', entitlement.trialSecondsRemaining, 'lookupPath:', lookupPath);
      
      return {
        ok: true,
        token,
        secondsRemaining: entitlement.trialSecondsRemaining,
        trialId: entitlement.trialId,
      };
    } catch (error) {
      console.error('[TrialService] Error generating session token by emailHash:', error);
      return { ok: false, error: 'server_error' };
    }
  }

  // Magic Link: Request a magic link for returning trial users
  // Uses trial_login_tokens table (separate from verification_token)
  async requestMagicLink(email: string): Promise<MagicLinkRequestResult> {
    try {
      const normalizedEmail = normalizeEmail(email);
      const emailHash = hashValue(normalizedEmail);

      console.log('[TrialService] Magic link requested for email_hash:', emailHash.substring(0, 12) + '...');

      // Find trial by email hash
      const trial = await this.getTrialByEmailHash(emailHash);

      if (!trial) {
        // Don't reveal if email exists - return generic success message
        console.log('[TrialService] Magic link: email not found (returning safe response)');
        return { ok: true }; // Safe response - don't reveal if email exists
      }

      // Check if trial is verified
      if (!trial.verifiedAt) {
        console.log('[TrialService] Magic link: trial not verified, resending verification email');
        // Resend verification email if trial exists but not verified
        if (trial.email) {
          const verificationToken = randomBytes(32).toString('hex');
          const verificationExpiry = new Date(Date.now() + 30 * 60 * 1000);
          
          await db.update(trialSessions)
            .set({
              verificationToken,
              verificationExpiry,
              updatedAt: new Date(),
            })
            .where(eq(trialSessions.id, trial.id));
          
          await this.sendTrialVerificationEmail(trial.email, verificationToken);
        }
        return { ok: false, code: 'NOT_VERIFIED', error: 'Please verify your email first. We\'ve resent the verification email.', verificationResent: true };
      }

      // Check if trial is exhausted
      const consumedSeconds = trial.consumedSeconds ?? 0;
      const secondsRemaining = TRIAL_DURATION_SECONDS - consumedSeconds;
      
      if (secondsRemaining <= 0 || trial.status === 'expired') {
        console.log('[TrialService] Magic link: trial exhausted');
        return { ok: false, code: 'TRIAL_EXHAUSTED', error: 'Your trial has ended. Please sign up to continue using JIE Mastery.' };
      }

      // Invalidate any previous unused tokens for this trial session
      await db.update(trialLoginTokens)
        .set({ usedAt: new Date() })
        .where(and(
          eq(trialLoginTokens.trialSessionId, trial.id),
          isNull(trialLoginTokens.usedAt)
        ));

      // Generate new login token and store in trial_login_tokens table
      const loginToken = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + MAGIC_TOKEN_EXPIRY_MINUTES * 60 * 1000);

      await db.insert(trialLoginTokens).values({
        trialSessionId: trial.id,
        token: loginToken,
        expiresAt,
      });

      // Send magic link email
      if (trial.email) {
        await this.sendMagicLinkEmail(trial.email, loginToken);
      }

      console.log('[TrialService] Magic link sent for email_hash:', emailHash.substring(0, 12) + '...');
      return { ok: true };
    } catch (error: any) {
      console.error('[TrialService] Error requesting magic link:', error);
      
      // Check for schema mismatch (missing table/column)
      if (isMissingColumnError(error) || isMissingTableError(error)) {
        const missingColumn = extractMissingColumn(error);
        console.error(`[TrialService] CRITICAL: Schema mismatch in requestMagicLink - '${missingColumn || 'table'}' does not exist!`);
        console.error('[TrialService] Continue-trial tokens use trial_login_tokens table.');
      }
      
      return { ok: false, code: 'INTERNAL_ERROR', error: 'Something went wrong. Please try again.' };
    }
  }

  // Magic Link: Validate magic token and return trial session
  // Uses trial_login_tokens table (one-time use tokens)
  async validateMagicToken(token: string): Promise<MagicLinkValidateResult> {
    try {
      console.log('[TrialService] Validating magic token:', token.substring(0, 12) + '...');

      // Find token in trial_login_tokens table
      const tokenRecords = await db.select()
        .from(trialLoginTokens)
        .where(eq(trialLoginTokens.token, token))
        .limit(1);

      if (tokenRecords.length === 0) {
        console.log('[TrialService] Magic token: not found');
        return { ok: false, error: 'Invalid or expired sign-in link.', errorCode: 'invalid_token' };
      }

      const tokenRecord = tokenRecords[0];

      // Check if token already used
      if (tokenRecord.usedAt) {
        console.log('[TrialService] Magic token: already used');
        return { ok: false, error: 'This sign-in link has already been used. Please request a new one.', errorCode: 'invalid_token' };
      }

      // Check if token expired
      if (new Date() > tokenRecord.expiresAt) {
        console.log('[TrialService] Magic token: expired');
        return { ok: false, error: 'This sign-in link has expired. Please request a new one.', errorCode: 'expired_token' };
      }

      // Get the associated trial session
      const trials = await db.select()
        .from(trialSessions)
        .where(eq(trialSessions.id, tokenRecord.trialSessionId))
        .limit(1);

      if (trials.length === 0) {
        console.log('[TrialService] Magic token: trial session not found');
        return { ok: false, error: 'Trial session not found.', errorCode: 'invalid_token' };
      }

      const trialSession = trials[0];

      // Check if trial is exhausted
      const consumedSeconds = trialSession.consumedSeconds ?? 0;
      const secondsRemaining = TRIAL_DURATION_SECONDS - consumedSeconds;
      
      if (secondsRemaining <= 0 || trialSession.status === 'expired') {
        console.log('[TrialService] Magic token: trial exhausted');
        return { ok: false, error: 'Your trial has ended. Please sign up to continue.', errorCode: 'trial_exhausted' };
      }

      // Mark the token as used (one-time use)
      await db.update(trialLoginTokens)
        .set({ usedAt: new Date() })
        .where(eq(trialLoginTokens.id, tokenRecord.id));

      // Update trial session last active
      await db.update(trialSessions)
        .set({
          lastActiveAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(trialSessions.id, trialSession.id));

      console.log('[TrialService] Magic token validated for email_hash:', trialSession.emailHash.substring(0, 12) + '...', 'remaining:', secondsRemaining);

      return {
        ok: true,
        trial: trialSession,
        secondsRemaining,
      };
    } catch (error: any) {
      console.error('[TrialService] Error validating magic token:', error);
      
      // Check for schema mismatch (missing table/column)
      if (isMissingColumnError(error) || isMissingTableError(error)) {
        const missingColumn = extractMissingColumn(error);
        console.error(`[TrialService] CRITICAL: Schema mismatch in validateMagicToken - '${missingColumn || 'table'}' does not exist!`);
        console.error('[TrialService] Continue-trial tokens use trial_login_tokens table.');
      }
      
      return { ok: false, error: 'An error occurred. Please try again.', errorCode: 'server_error' };
    }
  }

  // Send magic link email
  private async sendMagicLinkEmail(email: string, token: string): Promise<void> {
    const baseUrl = this.getBaseUrl();
    const magicUrl = `${baseUrl}/auth/magic?token=${token}`;

    console.log('[TrialService] Sending magic link email to:', email);

    const htmlContent = `<!DOCTYPE html>
<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<!--[if mso]>
<xml>
<o:OfficeDocumentSettings>
<o:AllowPNG/>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
<![endif]-->
<title>Continue Your Free Trial</title>
</head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background-color:#f4f4f4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f4;">
<tr>
<td align="center" style="padding:40px 20px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:8px;max-width:600px;">
<tr>
<td style="padding:40px;">
<h1 style="margin:0 0 20px 0;color:#dc2626;font-size:28px;font-weight:bold;font-family:Arial,Helvetica,sans-serif;">Continue Your Free Trial</h1>
<p style="margin:0 0 30px 0;color:#333333;font-size:16px;line-height:24px;font-family:Arial,Helvetica,sans-serif;">Click the button below to sign in and continue your JIE Mastery AI Tutor free trial.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 30px 0;">
<tr>
<td align="center">
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${magicUrl}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="10%" strokecolor="#dc2626" fillcolor="#dc2626">
<w:anchorlock/>
<center style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;">Continue My Trial</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<a href="${magicUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;background-color:#dc2626;border-radius:6px;font-family:Arial,Helvetica,sans-serif;">Continue My Trial</a>
<!--<![endif]-->
</td>
</tr>
</table>
<p style="margin:0 0 10px 0;color:#666666;font-size:14px;font-family:Arial,Helvetica,sans-serif;">If the button doesn't work, copy and paste this link into your browser:</p>
<p style="margin:0 0 20px 0;color:#666666;font-size:14px;word-break:break-all;font-family:Arial,Helvetica,sans-serif;"><a href="${magicUrl}" style="color:#dc2626;text-decoration:underline;">${magicUrl}</a></p>
<p style="margin:0 0 10px 0;color:#666666;font-size:14px;font-family:Arial,Helvetica,sans-serif;">This link expires in ${MAGIC_TOKEN_EXPIRY_MINUTES} minutes and can only be used once.</p>
<p style="margin:0;color:#666666;font-size:14px;font-family:Arial,Helvetica,sans-serif;">If you didn't request this, you can safely ignore this email.</p>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;

    const textContent = `Continue Your Free Trial

Click the link below to sign in and continue your JIE Mastery AI Tutor free trial:

${magicUrl}

This link expires in ${MAGIC_TOKEN_EXPIRY_MINUTES} minutes and can only be used once.

If you didn't request this, you can safely ignore this email.`;

    await this.emailService.sendEmail({
      to: email,
      subject: 'Continue Your JIE Mastery Free Trial',
      html: htmlContent,
      text: textContent,
    });
  }

  // Get trial by email (for magic link lookup)
  async getTrialByEmail(email: string): Promise<TrialSession | null> {
    try {
      const normalizedEmail = normalizeEmail(email);
      const emailHash = hashValue(normalizedEmail);
      return this.getTrialByEmailHash(emailHash);
    } catch (error) {
      console.error('[TrialService] Error getting trial by email:', error);
      return null;
    }
  }

  // ========================================
  // VERIFICATION REMINDER METHODS
  // ========================================

  private readonly MAX_REMINDERS = 2; // Cap reminders at 2 per lead
  private readonly REMINDER_INTERVAL_HOURS = 6; // Minimum hours between reminders

  // Get pending trials eligible for reminders
  async getPendingTrialsForReminders(): Promise<TrialSession[]> {
    try {
      const sixHoursAgo = new Date(Date.now() - this.REMINDER_INTERVAL_HOURS * 60 * 60 * 1000);
      
      // Query for pending trials where:
      // - status = 'pending'
      // - verifiedAt IS NULL
      // - reminderCount < MAX_REMINDERS
      // - lastReminderAt IS NULL OR lastReminderAt < 6 hours ago
      const pendingTrials = await db.select()
        .from(trialSessions)
        .where(
          and(
            eq(trialSessions.status, 'pending'),
            isNull(trialSessions.verifiedAt),
            or(
              isNull(trialSessions.verificationReminderCount),
              lt(trialSessions.verificationReminderCount, this.MAX_REMINDERS)
            ),
            or(
              isNull(trialSessions.lastVerificationReminderAt),
              lt(trialSessions.lastVerificationReminderAt, sixHoursAgo)
            )
          )
        );
      
      console.log(`[TrialService] Found ${pendingTrials.length} pending trials eligible for reminders`);
      return pendingTrials;
    } catch (error) {
      console.error('[TrialService] Error getting pending trials for reminders:', error);
      return [];
    }
  }

  // Send reminder email for a single trial
  async sendVerificationReminder(trial: TrialSession): Promise<{ success: boolean; error?: string }> {
    try {
      if (!trial.email) {
        console.log(`[TrialService] Skipping reminder - no email for trial ${trial.id}`);
        return { success: false, error: 'No email address' };
      }

      // Check if already verified
      if (trial.verifiedAt) {
        console.log(`[TrialService] Skipping reminder - trial ${trial.id} already verified`);
        return { success: false, error: 'Already verified' };
      }

      // Check reminder count cap
      const currentCount = trial.verificationReminderCount ?? 0;
      if (currentCount >= this.MAX_REMINDERS) {
        console.log(`[TrialService] Skipping reminder - trial ${trial.id} reached max reminders (${currentCount})`);
        return { success: false, error: 'Max reminders reached' };
      }

      // Check time since last reminder
      if (trial.lastVerificationReminderAt) {
        const hoursSinceLastReminder = (Date.now() - trial.lastVerificationReminderAt.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastReminder < this.REMINDER_INTERVAL_HOURS) {
          console.log(`[TrialService] Skipping reminder - too soon (${hoursSinceLastReminder.toFixed(1)}h < ${this.REMINDER_INTERVAL_HOURS}h)`);
          return { success: false, error: 'Too soon since last reminder' };
        }
      }

      // Generate a fresh verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

      // Update trial with new token and increment reminder count
      await db.update(trialSessions)
        .set({
          verificationToken,
          verificationExpiry,
          lastVerificationReminderAt: new Date(),
          verificationReminderCount: currentCount + 1,
          updatedAt: new Date(),
        })
        .where(eq(trialSessions.id, trial.id));

      // Send the reminder email
      await this.sendVerificationReminderEmail(trial.email, verificationToken, currentCount + 1);

      console.log(`[TrialService] Sent reminder #${currentCount + 1} to ${trial.email}`);
      return { success: true };
    } catch (error) {
      console.error(`[TrialService] Error sending reminder for trial ${trial.id}:`, error);
      return { success: false, error: String(error) };
    }
  }

  // Process all pending reminders (called by scheduler or admin)
  async processPendingReminders(): Promise<{ sent: number; skipped: number; errors: number }> {
    console.log('[TrialService] Starting pending reminders processing...');
    
    const pendingTrials = await this.getPendingTrialsForReminders();
    let sent = 0;
    let skipped = 0;
    let errors = 0;

    for (const trial of pendingTrials) {
      const result = await this.sendVerificationReminder(trial);
      if (result.success) {
        sent++;
      } else if (result.error && result.error.includes('error')) {
        errors++;
      } else {
        skipped++;
      }
      
      // Small delay between emails to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`[TrialService] Pending reminders complete: sent=${sent}, skipped=${skipped}, errors=${errors}`);
    return { sent, skipped, errors };
  }

  // Reminder email template
  private async sendVerificationReminderEmail(email: string, token: string, reminderNumber: number): Promise<void> {
    const baseUrl = this.getBaseUrl();
    const verifyUrl = `${baseUrl}/trial/verify?token=${token}`;
    
    console.log(`[TrialService] Sending reminder email #${reminderNumber} to: ${email}`);

    const subject = reminderNumber === 1 
      ? 'Reminder: Complete your JIE Mastery Free Trial signup'
      : 'Final Reminder: Your JIE Mastery Free Trial is waiting';

    const urgencyText = reminderNumber === 1
      ? 'You started signing up for your free trial but haven\'t verified your email yet.'
      : 'This is your final reminder. Don\'t miss out on your 5-minute free AI tutoring session!';

    const htmlContent = `<!DOCTYPE html>
<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<!--[if mso]>
<xml>
<o:OfficeDocumentSettings>
<o:AllowPNG/>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
<![endif]-->
<title>Complete Your Free Trial</title>
</head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background-color:#f4f4f4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f4;">
<tr>
<td align="center" style="padding:40px 20px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:8px;max-width:600px;">
<tr>
<td style="padding:40px;">
<h1 style="margin:0 0 20px 0;color:#dc2626;font-size:28px;font-weight:bold;font-family:Arial,Helvetica,sans-serif;">Complete Your Free Trial</h1>
<p style="margin:0 0 20px 0;color:#333333;font-size:16px;line-height:24px;font-family:Arial,Helvetica,sans-serif;">${urgencyText}</p>
<p style="margin:0 0 30px 0;color:#333333;font-size:16px;line-height:24px;font-family:Arial,Helvetica,sans-serif;">Click the button below to verify your email and experience our AI tutor. Your personalized learning session awaits!</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 30px 0;">
<tr>
<td align="center">
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${verifyUrl}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="10%" strokecolor="#dc2626" fillcolor="#dc2626">
<w:anchorlock/>
<center style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;">Verify & Start Trial</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<a href="${verifyUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;background-color:#dc2626;border-radius:6px;font-family:Arial,Helvetica,sans-serif;">Verify & Start Trial</a>
<!--<![endif]-->
</td>
</tr>
</table>
<p style="margin:0 0 10px 0;color:#666666;font-size:14px;font-family:Arial,Helvetica,sans-serif;">If the button doesn't work, copy and paste this link into your browser:</p>
<p style="margin:0 0 20px 0;color:#666666;font-size:14px;word-break:break-all;font-family:Arial,Helvetica,sans-serif;"><a href="${verifyUrl}" style="color:#dc2626;text-decoration:underline;">${verifyUrl}</a></p>
<p style="margin:0 0 10px 0;color:#666666;font-size:14px;font-family:Arial,Helvetica,sans-serif;">This link expires in 30 minutes.</p>
<p style="margin:0 0 10px 0;color:#666666;font-size:14px;font-family:Arial,Helvetica,sans-serif;"><strong>Pro tip:</strong> Check your Spam/Junk folder if you don't see our emails in your inbox.</p>
<p style="margin:0;color:#666666;font-size:14px;font-family:Arial,Helvetica,sans-serif;">If you no longer wish to receive these reminders, simply ignore this email.</p>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;

    const textContent = `Complete Your Free Trial

${urgencyText}

Click the link below to verify your email and experience our AI tutor:

${verifyUrl}

This link expires in 30 minutes.

Pro tip: Check your Spam/Junk folder if you don't see our emails in your inbox.

If you no longer wish to receive these reminders, simply ignore this email.`;

    await this.emailService.sendEmail({
      to: email,
      subject,
      html: htmlContent,
      text: textContent,
    });
  }
}

export const trialService = new TrialService();
