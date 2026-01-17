import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import bcrypt from "bcrypt";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import { emailService } from "./services/email-service";
import { z } from "zod";
import { enforceConcurrentLoginsAfterAuth } from "./middleware/enforce-concurrent-logins";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

// Session middleware for WebSocket authentication
let sessionMiddleware: session.RequestHandler;

// Getter function to access sessionMiddleware after setupAuth runs
export function getSessionMiddleware(): session.RequestHandler {
  if (!sessionMiddleware) {
    throw new Error('Session middleware not initialized. Call setupAuth first.');
  }
  return sessionMiddleware;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function comparePasswords(supplied: string, stored: string) {
  if (stored.startsWith('$2a$') || stored.startsWith('$2b$')) {
    return bcrypt.compare(supplied, stored);
  }
  const [hashed, salt] = stored.split(".");
  if (!hashed || !salt) {
    return false;
  }
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  // Secure session secret configuration
  let sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SESSION_SECRET must be set in production');
    }
    sessionSecret = 'development-session-secret-only';
  }

  // Environment-aware session cookie configuration
  // Production (Railway HTTPS): secure=true, sameSite='none' (required for cross-site requests)
  // Development (local HTTP): secure=false, sameSite='lax'
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieSecure = process.env.SESSION_COOKIE_SECURE 
    ? process.env.SESSION_COOKIE_SECURE === 'true' 
    : isProduction;
  const cookieSameSite = (process.env.SESSION_COOKIE_SAMESITE || (isProduction ? 'none' : 'lax')) as 'lax' | 'none' | 'strict';

  console.log('[Session] Cookie configuration:', {
    environment: process.env.NODE_ENV,
    secure: cookieSecure,
    sameSite: cookieSameSite,
    maxAge: '24 hours'
  });

  const sessionSettings: session.SessionOptions = {
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: cookieSameSite,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  };

  // Create and export session middleware for WebSocket authentication
  sessionMiddleware = session(sessionSettings);

  app.set("trust proxy", 1);
  app.use(sessionMiddleware);
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(
      { usernameField: 'email', passwordField: 'password' },
      async (emailOrUsername, password, done) => {
        // Test mode authentication
        const isTestMode = process.env.AUTH_TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
        const testEmail = process.env.TEST_USER_EMAIL || 'test@example.com';
        const testPassword = process.env.TEST_USER_PASSWORD || 'TestPass123!';
        
        if (isTestMode && (emailOrUsername ?? '').toLowerCase() === testEmail.toLowerCase() && password === testPassword) {
          const testUser = {
            id: 'test-user-id',
            username: testEmail,
            email: testEmail,
            password: await hashPassword(process.env.TEST_USER_PASSWORD || 'TestPass123!'),
            firstName: 'Test',
            lastName: 'User',
            parentName: 'Test Parent',
            studentName: 'Test Student',
            studentAge: 10,
            gradeLevel: 'grades-3-5' as const,
            primarySubject: 'math' as const,
            subscriptionPlan: 'elite' as const,
            subscriptionStatus: 'active' as const,
            maxConcurrentSessions: 3, // Test user gets 3 concurrent voice sessions
            maxConcurrentLogins: 3, // Test user gets 3 concurrent device logins (Elite tier)
            stripeCustomerId: null,
            stripeSubscriptionId: null,
            subscriptionMinutesUsed: 0, // New hybrid minute field
            subscriptionMinutesLimit: 600, // Test user gets 600 minutes
            purchasedMinutesBalance: 0, // New hybrid minute field
            billingCycleStart: new Date(), // New hybrid minute field
            lastResetAt: null, // New hybrid minute field
            monthlyVoiceMinutes: 600, // Test user gets 600 minutes
            monthlyVoiceMinutesUsed: 0,
            bonusMinutes: 0,
            monthlyResetDate: new Date(),
            weeklyVoiceMinutesUsed: 0,
            weeklyResetDate: new Date(),
            preferredLanguage: 'en' as const, // Fixed: Use ISO language code instead of 'english'
            voiceStyle: 'cheerful',
            speechSpeed: '1.0',
            volumeLevel: 75,
            isAdmin: false,
            emailVerified: true, // Added missing field
            emailVerificationToken: null, // Added missing field
            emailVerificationExpiry: null, // Added missing field
            resetToken: null, // Added missing field
            resetTokenExpiry: null, // Added missing field
            marketingOptIn: false,
            marketingOptInDate: null,
            marketingOptOutDate: null,
            subscriptionEndsAt: null,
            interfaceLanguage: null,
            voiceLanguage: null,
            emailNotifications: null,
            marketingEmails: null,
            emailSummaryFrequency: 'daily',
            securityQuestion1: null,
            securityAnswer1: null,
            securityQuestion2: null,
            securityAnswer2: null,
            securityQuestion3: null,
            securityAnswer3: null,
            securityQuestionsSet: false,
            securityVerificationToken: null,
            securityVerificationExpiry: null,
            trialActive: false,
            trialMinutesTotal: 30,
            trialMinutesUsed: 0,
            trialStartedAt: null,
            trialDeviceHash: null,
            trialIpHash: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          return done(null, testUser);
        }
        
        // Normal authentication flow - support both email and username
        try {
          console.log('[Auth] Login attempt for:', emailOrUsername);
          let user = null;
          
          // Try email first
          user = await storage.getUserByEmail(emailOrUsername).catch(err => {
            console.error('[Auth] Error fetching user by email:', err);
            return null;
          });
          console.log('[Auth] User found by email:', user ? 'YES' : 'NO');
          
          // If not found by email, try username
          if (!user) {
            user = await storage.getUserByUsername(emailOrUsername).catch(err => {
              console.error('[Auth] Error fetching user by username:', err);
              return null;
            });
            console.log('[Auth] User found by username:', user ? 'YES' : 'NO');
          }
          
          if (!user) {
            console.log('[Auth] User not found:', emailOrUsername);
            return done(null, false);
          }
          
          // Validate password
          console.log('[Auth] Checking password for user:', user.email);
          const passwordMatch = await comparePasswords(password, user.password);
          console.log('[Auth] Password match:', passwordMatch);
          
          if (!passwordMatch) {
            console.log('[Auth] Password mismatch for:', emailOrUsername);
            return done(null, false);
          }
          
          console.log('[Auth] Login successful for:', user.email);
          return done(null, user);
        } catch (error) {
          console.error('[Auth] Login error:', error);
          return done(error);
        }
      }
    ),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    // Handle test user deserialization
    const isTestMode = process.env.AUTH_TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
    if (isTestMode && id === 'test-user-id') {
      const testEmail = process.env.TEST_USER_EMAIL || 'test@example.com';
      const testUser = {
        id: 'test-user-id',
        username: testEmail,
        email: testEmail,
        password: await hashPassword(process.env.TEST_USER_PASSWORD || 'TestPass123!'),
        firstName: 'Test',
        lastName: 'User',
        parentName: 'Test Parent',
        studentName: 'Test Student',
        studentAge: 10,
        gradeLevel: 'grades-3-5' as const,
        primarySubject: 'math' as const,
        subscriptionPlan: 'elite' as const,
        subscriptionStatus: 'active' as const,
        maxConcurrentSessions: 3, // Test user gets 3 concurrent voice sessions
        maxConcurrentLogins: 3, // Test user gets 3 concurrent device logins (Elite tier)
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        subscriptionMinutesUsed: 0, // New hybrid minute field
        subscriptionMinutesLimit: 600, // New hybrid minute field
        purchasedMinutesBalance: 0, // New hybrid minute field
        billingCycleStart: new Date(), // New hybrid minute field
        lastResetAt: null, // New hybrid minute field
        monthlyVoiceMinutes: 600, // Test user gets 600 minutes
        monthlyVoiceMinutesUsed: 0,
        bonusMinutes: 0,
        monthlyResetDate: new Date(),
        weeklyVoiceMinutesUsed: 0,
        weeklyResetDate: new Date(),
        preferredLanguage: 'en' as const,
        voiceStyle: 'cheerful',
        speechSpeed: '1.0',
        volumeLevel: 75,
        isAdmin: false,
        emailVerified: true, // Added missing field
        emailVerificationToken: null, // Added missing field
        emailVerificationExpiry: null, // Added missing field
        resetToken: null, // Added missing field
        resetTokenExpiry: null, // Added missing field
        marketingOptIn: false,
        marketingOptInDate: null,
        marketingOptOutDate: null,
        subscriptionEndsAt: null,
        interfaceLanguage: null,
        voiceLanguage: null,
        emailNotifications: null,
        marketingEmails: null,
        emailSummaryFrequency: 'daily',
        securityQuestion1: null,
        securityAnswer1: null,
        securityQuestion2: null,
        securityAnswer2: null,
        securityQuestion3: null,
        securityAnswer3: null,
        securityQuestionsSet: false,
        securityVerificationToken: null,
        securityVerificationExpiry: null,
        trialActive: false,
        trialMinutesTotal: 30,
        trialMinutesUsed: 0,
        trialStartedAt: null,
        trialDeviceHash: null,
        trialIpHash: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      return done(null, testUser);
    }
    
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(null, null);
    }
  });

  // POST /api/check-email - Check email availability before registration
  app.post("/api/check-email", async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ 
          available: false,
          error: 'Email is required' 
        });
      }
      
      const normalizedEmail = email.toLowerCase().trim();
      
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(normalizedEmail)) {
        return res.status(400).json({ 
          available: false,
          error: 'Invalid email format' 
        });
      }
      
      // Check database
      const existingUser = await storage.getUserByEmail(normalizedEmail);
      
      if (existingUser) {
        console.log(`[Auth] Email check: ${normalizedEmail} already exists`);
        return res.json({
          available: false,
          error: 'This email is already registered',
          suggestion: 'Please log in or reset your password if you forgot it.'
        });
      }
      
      // Check Stripe for any existing customer (not just active subscriptions)
      // This catches orphaned customers and prevents duplicate Stripe entries
      if (process.env.STRIPE_SECRET_KEY) {
        try {
          const Stripe = (await import('stripe')).default;
          const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-08-27.basil' as any });
            
          const customers = await stripeClient.customers.list({
            email: normalizedEmail,
            limit: 1
          });
          
          if (customers.data.length > 0) {
            const existingCustomer = customers.data[0];
            
            // Check for any subscription (active, past_due, canceled, etc.)
            const subs = await stripeClient.subscriptions.list({
              customer: existingCustomer.id,
              limit: 1
            });
            
            if (subs.data.length > 0) {
              const sub = subs.data[0];
              console.log(`[Auth] Email ${normalizedEmail} has Stripe subscription (status: ${sub.status})`);
              
              if (sub.status === 'active' || sub.status === 'trialing') {
                return res.json({
                  available: false,
                  error: 'This email already has an active subscription',
                  suggestion: 'Please log in to manage your account.'
                });
              } else {
                // Has subscription but not active - still warn but may allow
                console.log(`[Auth] Email ${normalizedEmail} has inactive Stripe subscription (${sub.status})`);
              }
            }
            
            // Customer exists but no subscriptions - could be orphaned
            console.log(`[Auth] Email ${normalizedEmail} found in Stripe (customer: ${existingCustomer.id}) but no subscriptions`);
          }
        } catch (stripeError: any) {
          console.error('[Auth] Stripe customer check failed:', stripeError.message);
          // Don't block if Stripe check fails - gracefully continue
        }
      }
      
      console.log(`[Auth] Email check: ${normalizedEmail} is available`);
      res.json({ available: true });
      
    } catch (error: any) {
      console.error('[Auth] Email check error:', error);
      res.status(500).json({ 
        available: false,
        error: 'Failed to check email availability' 
      });
    }
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      // 🔍 Log incoming registration request
      console.log('[Register] 📝 Registration attempt:', {
        email: req.body.email,
        accountName: req.body.accountName,
        studentName: req.body.studentName,
        gradeLevel: req.body.gradeLevel,
        hasPassword: !!req.body.password,
        passwordLength: req.body.password?.length || 0,
      });

      // Validate registration payload with detailed error messages
      const registerSchema = z.object({
        accountName: z.string()
          .min(1, "Account name is required"),
        studentName: z.string()
          .min(1, "Student name is required"),
        studentAge: z.number()
          .int("Student age must be a whole number")
          .min(4, "Student must be at least 4 years old")
          .max(99, "Invalid student age")
          .optional(),
        gradeLevel: z.string()
          .min(1, "Grade level is required"),
        primarySubject: z.string().optional(),
        email: z.string()
          .min(1, "Email is required")
          .email("Invalid email format"),
        password: z.string()
          .min(1, "Password is required")
          .min(8, "Password must be at least 8 characters"),
        marketingOptIn: z.boolean().optional(),
      });

      console.log('[Register] ✓ Starting validation...');
      const validation = registerSchema.safeParse(req.body);
      
      if (!validation.success) {
        // Extract first validation error for clear messaging
        const firstError = validation.error.errors[0];
        const fieldName = firstError.path.join('.');
        const errorMessage = firstError.message;
        
        console.log('[Register] ❌ Validation failed:', {
          field: fieldName,
          error: errorMessage,
          allErrors: validation.error.errors,
        });
        
        return res.status(400).json({ 
          error: errorMessage,
          field: fieldName,
          details: validation.error.errors,
        });
      }

      console.log('[Register] ✓ Validation passed');

      // Check for duplicate email (case-insensitive)
      console.log('[Register] 🔍 Checking for duplicate email...');
      const existingEmail = await storage.getUserByEmail(validation.data.email.toLowerCase());
      if (existingEmail) {
        console.log('[Register] ❌ Email already registered:', validation.data.email);
        return res.status(400).json({ 
          error: "Email already registered",
          field: "email",
        });
      }
      console.log('[Register] ✓ Email available');

      // Auto-generate username from email (e.g., "john@example.com" → "john_abc123")
      const emailPrefix = validation.data.email.split('@')[0].toLowerCase();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const autoGeneratedUsername = `${emailPrefix}_${randomSuffix}`;
      console.log('[Register] ✓ Auto-generated username:', autoGeneratedUsername);

      // Parse accountName into firstName/lastName for database compatibility
      const nameParts = validation.data.accountName.trim().split(/\s+/);
      const firstName = nameParts[0] || validation.data.accountName;
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
      const parentName = validation.data.accountName; // Use full accountName as parentName
      
      console.log('[Register] ✓ Parsed name:', { firstName, lastName, parentName });

      // Set default plan and minutes for new users
      const defaultPlan = 'starter';
      const minutesMap: Record<string, number> = {
        'starter': 60,
        'standard': 240,
        'pro': 600,
      };
      
      console.log('[Register] ✓ Creating user in database...');
      
      const user = await storage.createUser({
        ...validation.data,
        email: validation.data.email.toLowerCase(), // Store email in lowercase
        username: autoGeneratedUsername, // Use auto-generated username
        password: await hashPassword(validation.data.password),
        firstName, // Parsed from accountName
        lastName, // Parsed from accountName
        parentName, // Full accountName
        marketingOptInDate: validation.data.marketingOptIn ? new Date() : null,
        subscriptionPlan: defaultPlan,
        subscriptionStatus: 'active', // New users start with active status
        subscriptionMinutesLimit: minutesMap[defaultPlan], // Set correct minutes for plan
        subscriptionMinutesUsed: 0,
        purchasedMinutesBalance: 0,
        billingCycleStart: new Date(),
      });

      console.log('[Register] ✅ User created successfully:', user.email);

      req.login(user, async (err) => {
        if (err) {
          console.error('[Register] ❌ Login after registration failed:', err);
          return next(err);
        }
        
        console.log('[Register] ✓ User logged in after registration');
        
        // Generate and send email verification (non-blocking)
        const verificationToken = await storage.generateEmailVerificationToken(user.id);
        emailService.sendEmailVerification({
          email: user.email,
          name: user.parentName || user.firstName || 'User',
          token: verificationToken,
        }).catch(error => console.error('[Register] Email verification failed:', error));

        // Send welcome email (non-blocking)
        if (user.parentName && user.studentName) {
          emailService.sendWelcomeEmail({
            email: user.email,
            parentName: user.parentName,
            studentName: user.studentName,
          }).catch(error => console.error('[Register] Welcome email failed:', error));
        }

        // Send admin notification with complete user details (non-blocking)
        emailService.sendAdminNotification('Account Created', {
          email: user.email,
          parentName: user.parentName || user.firstName || '',
          studentName: user.studentName || '',
          gradeLevel: user.gradeLevel || '',
          primarySubject: user.primarySubject || '',
          plan: 'Free Trial',
          amount: 0,
        }).catch(error => console.error('[Register] Admin notification failed:', error));

        console.log('[Register] ✅ Registration complete');
        res.status(201).json(user);
      });
      
    } catch (error: any) {
      console.error('[Register] ❌ Registration error:', error);
      
      // Handle PostgreSQL unique constraint violation (23505)
      if (error.code === '23505') {
        const constraintName = error.constraint || '';
        console.log('[Register] ❌ PostgreSQL constraint violation:', constraintName);
        
        if (constraintName.includes('email')) {
          return res.status(400).json({ 
            error: "Email already registered",
            field: "email",
          });
        }
        
        // Generic constraint violation (shouldn't happen with auto-generated usernames)
        return res.status(400).json({ 
          error: "An account with these details already exists",
        });
      }
      
      // Generic error handler
      return res.status(500).json({ 
        error: "Registration failed. Please try again.",
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  });

  // POST /api/auth/trial-signup - Create trial account and start 30-minute trial
  app.post("/api/auth/trial-signup", async (req, res, next) => {
    try {
      const { createHash } = await import('crypto');
      
      console.log('[Trial Signup] 📝 Trial signup attempt:', {
        email: req.body.email,
        studentName: req.body.studentName,
        gradeLevel: req.body.gradeLevel,
      });

      // Validate trial signup payload
      const trialSignupSchema = z.object({
        email: z.string().min(1, "Email is required").email("Invalid email format"),
        password: z.string().min(1, "Password is required").min(8, "Password must be at least 8 characters"),
        studentName: z.string().min(1, "Student name is required"),
        studentAge: z.number().int().min(4).max(99).optional(),
        gradeLevel: z.string().min(1, "Grade level is required"),
        primarySubject: z.string().optional(),
        deviceId: z.string().optional(),
      });

      const validation = trialSignupSchema.safeParse(req.body);
      
      if (!validation.success) {
        const firstError = validation.error.errors[0];
        return res.status(400).json({ 
          error: firstError.message,
          field: firstError.path.join('.'),
        });
      }

      const { email, password, studentName, studentAge, gradeLevel, primarySubject, deviceId } = validation.data;
      const normalizedEmail = email.toLowerCase().trim();

      // Check for existing user - return 409 for conflict
      const existingUser = await storage.getUserByEmail(normalizedEmail);
      if (existingUser) {
        return res.status(409).json({ 
          error: "Email already registered. Please log in instead.",
          field: "email",
          redirect: "/auth"
        });
      }

      // Generate abuse prevention hashes
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 
                       req.socket?.remoteAddress || 'unknown';
      const ipHash = createHash('sha256').update(clientIp).digest('hex');
      const deviceHash = deviceId ? createHash('sha256').update(deviceId).digest('hex') : null;

      // Check abuse limits (soft limits: warn on 2nd, block on 3rd)
      const { db } = await import('./db');
      const { trialAbuseTracking } = await import('@shared/schema');
      const { eq, or, and, gte } = await import('drizzle-orm');
      
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      
      // Check IP-based abuse (max 3 per IP/week)
      const ipAbuse = await db.select()
        .from(trialAbuseTracking)
        .where(and(
          eq(trialAbuseTracking.ipHash, ipHash),
          gte(trialAbuseTracking.lastTrialAt, oneWeekAgo)
        ))
        .limit(1);

      const ipTrialCount = ipAbuse[0]?.trialCount || 0;
      
      if (ipTrialCount >= 3) {
        console.log('[Trial Signup] ❌ IP rate limit exceeded:', ipHash.substring(0, 8));
        return res.status(429).json({ 
          error: "Too many trial accounts from this location. Please try again next week or subscribe now.",
          blocked: true
        });
      }

      // Check if IP is blocked
      if (ipAbuse[0]?.blocked) {
        console.log('[Trial Signup] ❌ IP is blocked:', ipHash.substring(0, 8));
        return res.status(429).json({ 
          error: "Trial access is not available from this location. Please subscribe to continue.",
          blocked: true
        });
      }

      // Check device-based abuse (max 2 per device)
      let deviceTrialCount = 0;
      let deviceAbuseRecord: any = null;
      if (deviceHash) {
        const deviceAbuse = await db.select()
          .from(trialAbuseTracking)
          .where(eq(trialAbuseTracking.deviceHash, deviceHash))
          .limit(1);
        deviceAbuseRecord = deviceAbuse[0];
        deviceTrialCount = deviceAbuseRecord?.trialCount || 0;
        
        // Check if device is blocked
        if (deviceAbuseRecord?.blocked) {
          console.log('[Trial Signup] ❌ Device is blocked:', deviceHash.substring(0, 8));
          return res.status(429).json({ 
            error: "Trial access is not available on this device. Please subscribe to continue.",
            blocked: true
          });
        }
        
        if (deviceTrialCount >= 2) {
          console.log('[Trial Signup] ❌ Device rate limit exceeded:', deviceHash.substring(0, 8));
          return res.status(429).json({ 
            error: "Trial limit reached on this device. Please subscribe to continue learning.",
            blocked: true
          });
        }
      }

      // Auto-generate username from email
      const emailPrefix = normalizedEmail.split('@')[0];
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const autoGeneratedUsername = `trial_${emailPrefix}_${randomSuffix}`;

      // Generate email verification token
      const crypto = await import('crypto');
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Create trial user with verification token
      const user = await storage.createUser({
        email: normalizedEmail,
        username: autoGeneratedUsername,
        password: await hashPassword(password),
        studentName,
        studentAge: studentAge || null,
        gradeLevel: gradeLevel as any,
        primarySubject: primarySubject as any || 'general',
        firstName: studentName.split(' ')[0],
        lastName: studentName.split(' ').slice(1).join(' ') || null,
        parentName: null,
        subscriptionPlan: null,
        subscriptionStatus: 'trialing',
        subscriptionMinutesLimit: 0,
        subscriptionMinutesUsed: 0,
        purchasedMinutesBalance: 0,
        billingCycleStart: new Date(),
        trialActive: false, // Trial activates on first session start
        trialMinutesTotal: 30,
        trialMinutesUsed: 0,
        trialStartedAt: null, // Set when trial actually starts
        trialDeviceHash: deviceHash,
        trialIpHash: ipHash,
        emailVerified: false,
        emailVerificationToken: verificationToken,
        emailVerificationExpiry: verificationExpiry,
      });

      console.log('[Trial Signup] ✅ Trial user created:', user.email, 'emailVerified=false');
      console.log('[Trial Signup] 🔑 Created verification token expires:', verificationExpiry.toISOString());
      
      // DEV: Log verification URL for testing
      if (process.env.NODE_ENV !== 'production' || process.env.TEST_MODE === 'true') {
        const baseUrl = process.env.REPLIT_DEV_DOMAIN 
          ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
          : 'http://localhost:5000';
        console.log('[Trial Signup] 🔗 DEV VERIFICATION URL:', `${baseUrl}/api/auth/verify-email?token=${verificationToken}`);
      }

      // Record abuse tracking for IP
      try {
        if (ipAbuse[0]) {
          await db.update(trialAbuseTracking)
            .set({ 
              trialCount: ipTrialCount + 1,
              lastTrialAt: new Date(),
              userId: user.id
            })
            .where(eq(trialAbuseTracking.ipHash, ipHash));
        } else {
          await db.insert(trialAbuseTracking).values({
            ipHash,
            deviceHash: null,
            userId: user.id,
            trialCount: 1,
            lastTrialAt: new Date(),
            weekStart: new Date(),
          });
        }
        
        // Record device abuse tracking separately if device hash provided
        if (deviceHash) {
          if (deviceAbuseRecord) {
            await db.update(trialAbuseTracking)
              .set({ 
                trialCount: deviceTrialCount + 1,
                lastTrialAt: new Date(),
                userId: user.id
              })
              .where(eq(trialAbuseTracking.deviceHash, deviceHash));
          } else {
            await db.insert(trialAbuseTracking).values({
              ipHash: null,
              deviceHash,
              userId: user.id,
              trialCount: 1,
              lastTrialAt: new Date(),
              weekStart: new Date(),
            });
          }
        }
      } catch (trackingError) {
        // Log but don't fail the signup if tracking fails
        console.error('[Trial Signup] ⚠️ Abuse tracking error (non-fatal):', trackingError);
      }

      // Check if email provider is configured
      const hasResendKey = !!process.env.RESEND_API_KEY;
      console.log('[Trial Signup] 📧 Email provider config: RESEND_API_KEY=' + (hasResendKey ? 'SET' : 'NOT SET'));
      
      // Send verification email (required before trial can start)
      let emailSent = false;
      let emailError: any = null;
      
      console.log('[Trial Signup] ✉️ Sending verification email to:', user.email);
      try {
        await emailService.sendEmailVerification({
          email: user.email,
          name: user.studentName || user.firstName || 'Student',
          token: verificationToken,
        });
        emailSent = true;
        console.log('[Trial Signup] ✅ Verification email sent successfully to:', user.email);
      } catch (err: any) {
        emailError = err;
        console.error('[Trial Signup] ❌ Failed to send verification email:', err?.message || err);
        console.error('[Trial Signup] Full error:', JSON.stringify(err, null, 2));
        
        // In dev, fail hard so we can debug
        if (process.env.NODE_ENV !== 'production') {
          return res.status(500).json({
            error: 'Failed to send verification email. Check server logs.',
            details: err?.message || 'Unknown email error',
            emailConfigured: hasResendKey,
          });
        }
      }

      // Send lead notification to JIE internal (non-blocking)
      const leadEmail = process.env.JIE_LEAD_NOTIFY_EMAIL || process.env.ADMIN_EMAIL || 'leads@jiemastery.ai';
      console.log('[Trial Signup] 📨 Sending lead notification to:', leadEmail);
      emailService.sendAdminNotification('New Trial Lead', {
        email: user.email,
        parentName: '',
        studentName: user.studentName || '',
        gradeLevel: user.gradeLevel || '',
        primarySubject: user.primarySubject || '',
        plan: '30-Minute Free Trial',
        amount: 0,
        source: '/start-trial',
        createdAt: new Date().toISOString(),
      }).catch(error => console.error('[Trial Signup] Lead notification failed:', error));

      // Return success - user must verify email before starting trial
      const response: any = { 
        success: true,
        requiresVerification: true,
        emailSent,
        user: {
          id: user.id,
          email: user.email,
          studentName: user.studentName,
          gradeLevel: user.gradeLevel,
          trialActive: user.trialActive,
          emailVerified: false,
        },
        message: emailSent 
          ? 'Please check your email to verify your account and start your trial.'
          : 'Account created but email delivery failed. Use the verification link in the server logs.',
      };

      // Add warning if approaching limits
      if (ipTrialCount >= 2 || deviceTrialCount >= 1) {
        response.warning = "This is your last trial from this device/location.";
      }

      res.status(201).json(response);
      
    } catch (error: any) {
      console.error('[Trial Signup] ❌ Error:', error);
      
      if (error.code === '23505') {
        return res.status(409).json({ 
          error: "Email already registered. Please log in instead.",
          field: "email",
          redirect: "/auth"
        });
      }
      
      return res.status(500).json({ 
        error: "Trial signup failed. Please try again.",
      });
    }
  });

  // GET /api/auth/verify-email - Verify email and auto-login
  app.get("/api/auth/verify-email", async (req, res) => {
    try {
      const { token } = req.query;
      
      if (!token || typeof token !== 'string') {
        return res.redirect('/start-trial?error=invalid_token');
      }

      const { db } = await import('./db');
      const { users } = await import('@shared/schema');
      const { eq, and, gt } = await import('drizzle-orm');
      
      // Find user with this verification token
      const [user] = await db.select()
        .from(users)
        .where(and(
          eq(users.emailVerificationToken, token),
          gt(users.emailVerificationExpiry, new Date())
        ))
        .limit(1);

      if (!user) {
        console.log('[Email Verify] ❌ Invalid or expired token');
        return res.redirect('/start-trial?error=expired_token');
      }

      // Update user to verified
      await db.update(users)
        .set({
          emailVerified: true,
          emailVerificationToken: null,
          emailVerificationExpiry: null,
        })
        .where(eq(users.id, user.id));

      console.log('[Email Verify] ✅ Email verified for:', user.email);

      // Log the user in
      req.login(user, (err) => {
        if (err) {
          console.error('[Email Verify] ❌ Auto-login failed:', err);
          return res.redirect('/auth?verified=1');
        }
        
        console.log('[Email Verify] ✓ User logged in after verification');
        
        // Redirect to tutor page
        return res.redirect('/tutor?verified=1');
      });
      
    } catch (error: any) {
      console.error('[Email Verify] ❌ Error:', error);
      return res.redirect('/start-trial?error=verification_failed');
    }
  });

  // POST /api/auth/resend-verification - Resend verification email
  app.post("/api/auth/resend-verification", async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      const normalizedEmail = email.toLowerCase().trim();
      const user = await storage.getUserByEmail(normalizedEmail);

      if (!user) {
        // Don't reveal if email exists
        return res.json({ success: true, message: "If this email exists, a verification link has been sent." });
      }

      if (user.emailVerified) {
        return res.status(400).json({ error: "Email is already verified. Please log in." });
      }

      // Rate limit: only allow resend every 2 minutes
      if (user.emailVerificationExpiry) {
        const timeSinceLastSend = Date.now() - (new Date(user.emailVerificationExpiry).getTime() - 24 * 60 * 60 * 1000);
        if (timeSinceLastSend < 2 * 60 * 1000) {
          return res.status(429).json({ error: "Please wait 2 minutes before requesting another verification email." });
        }
      }

      // Generate new verification token
      const crypto = await import('crypto');
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

      // Update user with new token
      const { db } = await import('./db');
      const { users } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');
      
      await db.update(users)
        .set({
          emailVerificationToken: verificationToken,
          emailVerificationExpiry: verificationExpiry,
        })
        .where(eq(users.id, user.id));

      // Send verification email
      await emailService.sendEmailVerification({
        email: user.email,
        name: user.studentName || user.firstName || 'Student',
        token: verificationToken,
      });

      console.log('[Resend Verification] ✉️ Verification email resent to:', user.email);

      return res.json({ success: true, message: "Verification email sent. Please check your inbox." });
      
    } catch (error: any) {
      console.error('[Resend Verification] ❌ Error:', error);
      return res.status(500).json({ error: "Failed to resend verification email. Please try again." });
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) {
        console.error('[Auth] Login error:', err);
        // Better error handling - capture the full error
        const errorMessage = err.message || err.toString() || 'Unknown authentication error';
        return res.status(500).json({ error: 'Authentication error', details: errorMessage });
      }
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      // Check if email is verified - but only for NEW users
      // Skip check for users created before verification feature (Oct 13, 2025)
      const verificationCutoffDate = new Date('2025-10-13');
      const accountCreatedAt = new Date(user.createdAt);
      
      // Only require verification for users created after the feature was added
      if (accountCreatedAt > verificationCutoffDate && !user.emailVerified) {
        console.log('[Auth] Login with unverified email (new user):', user.email);
        return res.status(403).json({ 
          error: 'Email not verified',
          message: 'Please verify your email address to continue. Check your inbox for the verification link.',
          email: user.email,
          requiresVerification: true
        });
      }
      
      // Auto-verify old users if not already verified
      if (accountCreatedAt <= verificationCutoffDate && !user.emailVerified) {
        console.log('[Auth] Auto-verifying existing user:', user.email);
        // Mark as verified in background (non-blocking)
        storage.markUserEmailAsVerified(user.id).catch(err => 
          console.error('[Auth] Failed to auto-verify user:', err)
        );
      }
      
      // CRITICAL FIX: Repair missing subscription IDs at login time
      if (user.subscriptionStatus === 'active' && !user.stripeSubscriptionId && user.stripeCustomerId) {
        console.error(`[Auth] ⚠️ ALERT: User ${user.email} has active status but no subscription ID!`);
        
        // Try to find subscription in Stripe (non-blocking)
        (async () => {
          try {
            const Stripe = (await import('stripe')).default;
            const stripe = process.env.STRIPE_SECRET_KEY
              ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-08-27.basil' as any })
              : null;
            
            if (!stripe || !user.stripeCustomerId) return;
            
            const subscriptions = await stripe.subscriptions.list({
              customer: user.stripeCustomerId,
              status: 'active',
              limit: 1,
            });
            
            if (subscriptions.data.length > 0) {
              const sub = subscriptions.data[0];
              console.log(`[Auth] 🔧 REPAIR: Found orphaned subscription ${sub.id} - linking now`);
              
              await storage.updateUserStripeInfo(user.id, user.stripeCustomerId, sub.id);
              console.log(`[Auth] ✅ REPAIR SUCCESS: Subscription ID ${sub.id} saved for ${user.email}`);
            } else {
              console.error(`[Auth] ❌ No active Stripe subscription found for customer ${user.stripeCustomerId}`);
              // Don't mark inactive here - user may have valid access that was paid
            }
          } catch (error: any) {
            console.error(`[Auth] Error checking Stripe subscriptions:`, error.message);
          }
        })();
      }
      
      req.login(user, async (err) => {
        if (err) {
          console.error('[Auth] Session error:', err);
          const errorMessage = err.message || err.toString() || 'Unknown session error';
          return res.status(500).json({ error: 'Session error', details: errorMessage });
        }
        
        // Session rotation for security (prevents session fixation attacks)
        // Regenerate session ID and track rotation timestamp
        req.session.regenerate((regenerateErr) => {
          if (regenerateErr) {
            console.error('[Auth] Session regeneration failed:', regenerateErr);
            // Continue anyway - this is non-critical for login flow
          } else {
            console.log('[Auth] ✓ Session regenerated for security');
          }
          
          // Re-login user after session regeneration (session.regenerate clears data)
          req.login(user, async (loginErr) => {
            if (loginErr) {
              console.error('[Auth] Re-login after regeneration failed:', loginErr);
              return res.status(500).json({ error: 'Session error', details: loginErr.message });
            }
            
            // Track session rotation timestamp for freshness validation
            req.session.lastRotatedAt = Date.now();
            
            // Save session explicitly to ensure lastRotatedAt is persisted
            req.session.save((saveErr) => {
              if (saveErr) {
                console.error('[Auth] Session save failed:', saveErr);
              }
            });
            
            // Enforce concurrent login limits AFTER successful authentication
            // This ensures old sessions are only terminated when new login succeeds
            await enforceConcurrentLoginsAfterAuth(user.id).catch(err => 
              console.error('[Auth] Concurrent login enforcement failed:', err)
            );
            
            // Sanitize user response to exclude sensitive fields
            const { password, ...safeUser } = user as any;
            res.status(200).json(safeUser);
          });
        });
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    // Get session ID before logout
    const sessionId = req.sessionID;
    
    req.logout((err) => {
      if (err) {
        console.error('[Auth] Logout error:', err);
        return next(err);
      }
      
      // Explicitly destroy session from session store
      if (sessionId && req.session) {
        req.session.destroy((destroyErr) => {
          if (destroyErr) {
            console.error('[Auth] Session destroy error:', destroyErr);
            // Continue anyway - user is logged out from Passport
          } else {
            console.log('[Auth] ✓ Session explicitly destroyed');
          }
          
          // Clear the session cookie
          res.clearCookie('connect.sid');
          res.sendStatus(200);
        });
      } else {
        res.sendStatus(200);
      }
    });
  });

  // Email Verification Endpoint (GET - for clicking links in email)
  app.get("/api/verify-email", async (req, res) => {
    try {
      const { token } = req.query;
      
      if (!token || typeof token !== 'string') {
        return res.redirect('/auth?verified=error&reason=missing_token');
      }

      console.log('[Auth] 🔍 Email verification via link');
      
      const result = await storage.verifyEmailToken(token);
      
      if (!result) {
        console.log('[Auth] ❌ Invalid verification token');
        return res.redirect('/auth?verified=error&reason=invalid_token');
      }

      const { user, alreadyVerified } = result;

      // Check if already verified (token was reused)
      if (alreadyVerified) {
        console.log('[Auth] ✅ Email already verified for:', user.email);
        return res.redirect('/auth?verified=already');
      }

      console.log('[Auth] ✅ Email verified for:', user.email);
      
      // Send welcome email after successful verification
      emailService.sendWelcomeEmail({
        email: user.email,
        parentName: user.parentName || user.firstName || 'there',
        studentName: user.studentName || 'your student'
      }).catch(err => console.error('[Auth] Failed to send welcome email:', err));

      res.redirect('/auth?verified=success');
    } catch (error) {
      console.error('[Auth] ❌ Verification error:', error);
      res.redirect('/auth?verified=error&reason=server_error');
    }
  });

  // Email Verification Endpoint (POST - for API calls)
  app.post("/api/auth/verify-email", async (req, res) => {
    try {
      const { token } = req.body;
      
      if (!token) {
        return res.status(400).json({ error: 'Verification token required' });
      }

      console.log('[Auth] 🔍 Email verification attempt');
      
      const result = await storage.verifyEmailToken(token);
      
      if (!result) {
        console.log('[Auth] ❌ Verification failed: Invalid token');
        return res.status(400).json({ 
          error: 'Invalid verification link. Please request a new verification email.',
          code: 'INVALID_TOKEN'
        });
      }

      const { user, alreadyVerified } = result;

      if (alreadyVerified) {
        console.log('[Auth] ✅ Email already verified for:', user.email);
        return res.json({
          success: true,
          message: 'Your email is already verified. You can log in.',
          alreadyVerified: true
        });
      }

      console.log('[Auth] ✅ Email verified for:', user.email);

      // Send welcome email after successful verification
      emailService.sendWelcomeEmail({
        email: user.email,
        parentName: user.parentName || user.firstName || 'there',
        studentName: user.studentName || 'your student'
      }).catch(err => console.error('[Auth] Failed to send welcome email:', err));

      res.json({
        success: true,
        message: 'Email verified successfully! You can now log in.',
      });
    } catch (error) {
      console.error('[Auth] ❌ Verification error:', error);
      res.status(500).json({ error: 'Verification failed. Please try again.' });
    }
  });

  // Resend Verification Email Endpoint
  app.post("/api/auth/resend-verification", async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: 'Email required' });
      }

      console.log('[Auth] 🔄 Resend verification request:', email);

      const user = await storage.getUserByEmail(email.toLowerCase());
      
      if (!user) {
        // Don't reveal if email exists - security best practice
        return res.json({
          success: true,
          message: 'If that email is registered, a verification email has been sent.',
        });
      }

      if (user.emailVerified) {
        return res.json({
          success: true,
          message: 'Email is already verified.',
          alreadyVerified: true,
        });
      }

      // Generate new verification token
      const verificationToken = await storage.generateEmailVerificationToken(user.id);
      
      // Send verification email
      await emailService.sendEmailVerification({
        email: user.email,
        name: user.parentName || user.firstName || 'there',
        token: verificationToken,
      });

      console.log('[Auth] ✅ Verification email resent');

      res.json({
        success: true,
        message: 'Verification email sent! Please check your inbox.',
      });
    } catch (error) {
      console.error('[Auth] ❌ Resend verification error:', error);
      res.status(500).json({ error: 'Failed to resend verification email. Please try again.' });
    }
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    // Sanitize user response to exclude sensitive fields
    const { password, ...safeUser } = req.user as any;
    res.json(safeUser);
  });

  // Alias for /api/user for frontend compatibility
  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    // Sanitize user response to exclude sensitive fields
    const { password, ...safeUser } = req.user as any;
    res.json(safeUser);
  });

  // Request password reset
  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      console.log('[Auth] Password reset requested for:', email);
      
      const result = await storage.generatePasswordResetToken(email.toLowerCase());
      
      // Always return success even if user doesn't exist (security best practice)
      if (result) {
        console.log('[Auth] Reset token generated for:', result.user.email);
        
        try {
          await emailService.sendPasswordReset({
            email: result.user.email,
            name: result.user.parentName || result.user.firstName || 'User',
            token: result.token,
          });
          console.log('[Auth] Password reset email sent successfully to:', result.user.email);
        } catch (emailError) {
          console.error('[Auth] Failed to send reset email:', emailError);
          // Don't fail the request if email fails - user might still contact support
        }
      } else {
        console.log('[Auth] No user found for email:', email);
      }
      
      // Always return success to avoid user enumeration
      res.json({ 
        success: true, 
        message: 'If an account exists with that email, a password reset link has been sent.' 
      });
    } catch (error) {
      console.error('[Auth] Password reset request error:', error);
      // Return a more detailed error in development
      const errorMessage = process.env.NODE_ENV === 'development' 
        ? (error as Error).message 
        : 'Failed to process password reset request';
      res.status(500).json({ 
        error: 'Failed to process password reset request. Please try again.',
        details: errorMessage 
      });
    }
  });

  // Verify password reset token and update password
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      
      if (!token || !newPassword) {
        return res.status(400).json({ error: 'Token and new password are required' });
      }
      
      // Validate password strength
      if (newPassword.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      
      const user = await storage.verifyPasswordResetToken(token);
      if (!user) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }
      
      const hashedPassword = await hashPassword(newPassword);
      await storage.updateUserPassword(user.id, hashedPassword);
      await storage.clearPasswordResetToken(user.id);
      
      res.json({ success: true, message: 'Password has been reset successfully' });
    } catch (error) {
      console.error('[Auth] Password reset error:', error);
      res.status(500).json({ error: 'Failed to reset password' });
    }
  });

  // Change password for authenticated users
  app.post("/api/user/change-password", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ error: 'You must be logged in to change your password' });
      }

      // Server-side validation with Zod
      const changePasswordSchema = z.object({
        currentPassword: z.string().min(1, 'Current password is required'),
        newPassword: z.string().min(8, 'New password must be at least 8 characters'),
        confirmPassword: z.string().optional()
      }).refine(data => {
        // If confirmPassword is provided, ensure it matches
        if (data.confirmPassword !== undefined) {
          return data.newPassword === data.confirmPassword;
        }
        return true;
      }, {
        message: 'New passwords do not match',
        path: ['confirmPassword']
      });

      const validation = changePasswordSchema.safeParse(req.body);
      if (!validation.success) {
        const firstError = validation.error.errors[0]?.message || 'Invalid input';
        return res.status(400).json({ error: firstError });
      }

      const { currentPassword, newPassword } = validation.data;
      
      // Get the user's current password from storage
      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Verify current password
      const isCurrentPasswordValid = await comparePasswords(currentPassword, user.password);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }
      
      // Prevent reusing the same password
      const isSameAsOld = await comparePasswords(newPassword, user.password);
      if (isSameAsOld) {
        return res.status(400).json({ error: 'New password must be different from your current password' });
      }
      
      // Hash new password and update
      const hashedNewPassword = await hashPassword(newPassword);
      await storage.updateUserPassword(user.id, hashedNewPassword);
      
      console.log('[Auth] Password changed successfully for user:', user.email);
      res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
      console.error('[Auth] Change password error:', error);
      res.status(500).json({ error: 'Failed to change password' });
    }
  });

  // One-time admin setup endpoint for production
  app.post("/api/setup/admin", async (req, res) => {
    try {
      console.log('[Setup] Admin setup request received');
      
      // Check if any admin users exist
      const adminCount = await storage.getAdminCount();
      
      if (adminCount > 0) {
        console.log('[Setup] Admin already exists, refusing setup');
        return res.status(403).json({ 
          error: 'Admin already exists',
          message: 'An admin user has already been created. This endpoint can only be used once.'
        });
      }
      
      // Validate the setup data
      const setupSchema = z.object({
        email: z.string().email(),
        password: z.string().min(8),
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        setupKey: z.string(), // Require a setup key for security
      });
      
      const validation = setupSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validation.error.errors 
        });
      }
      
      // Check setup key matches (you can set this in Railway env vars)
      const expectedSetupKey = process.env.ADMIN_SETUP_KEY || 'JIEMastery2025Admin!';
      if (validation.data.setupKey !== expectedSetupKey) {
        console.log('[Setup] Invalid setup key provided');
        return res.status(403).json({ 
          error: 'Invalid setup key',
          message: 'The setup key is incorrect. Check your deployment configuration.'
        });
      }
      
      console.log('[Setup] Creating admin user:', validation.data.email);
      
      // Create the admin user
      const adminUser = await storage.createUser({
        email: validation.data.email,
        username: validation.data.email, // Use email as username
        password: await hashPassword(validation.data.password),
        firstName: validation.data.firstName,
        lastName: validation.data.lastName,
        parentName: validation.data.firstName + ' ' + validation.data.lastName,
        studentName: 'Admin',
        studentAge: null,
        gradeLevel: 'college-adult',
        primarySubject: 'general',
        isAdmin: true, // Set as admin
        emailVerified: true, // Pre-verify admin
        subscriptionPlan: 'elite', // Give admin elite plan
        subscriptionStatus: 'active',
        subscriptionMinutesLimit: 1800, // Elite minutes
        subscriptionMinutesUsed: 0,
        purchasedMinutesBalance: 0,
        billingCycleStart: new Date(),
        maxConcurrentSessions: 3, // Elite concurrent voice tutoring sessions
        maxConcurrentLogins: 3, // Elite concurrent device logins
        marketingOptIn: false,
      });
      
      console.log('[Setup] Admin user created successfully:', adminUser.email);
      
      // Log them in automatically
      req.login(adminUser, (err) => {
        if (err) {
          console.error('[Setup] Auto-login failed:', err);
          return res.status(201).json({ 
            success: true,
            message: 'Admin user created successfully. Please login manually.',
            user: {
              id: adminUser.id,
              email: adminUser.email,
              isAdmin: true
            }
          });
        }
        
        res.status(201).json({ 
          success: true,
          message: 'Admin user created and logged in successfully',
          user: {
            id: adminUser.id,
            email: adminUser.email,
            isAdmin: true,
            firstName: adminUser.firstName,
            lastName: adminUser.lastName
          }
        });
      });
      
    } catch (error) {
      console.error('[Setup] Admin setup error:', error);
      res.status(500).json({ 
        error: 'Failed to create admin user',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Complete registration after successful Stripe checkout
  app.post("/api/auth/complete-registration", async (req, res, next) => {
    try {
      const { sessionId } = req.body;

      if (!sessionId) {
        return res.status(400).json({ error: 'Session ID is required' });
      }

      console.log('[Complete Registration] Verifying session:', sessionId);

      // Import Stripe
      const { stripe } = await import('./services/stripe-service');
      if (!stripe) {
        return res.status(503).json({ error: 'Stripe is not configured' });
      }

      // Retrieve checkout session from Stripe
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      
      if (!session || session.payment_status !== 'paid') {
        console.log('[Complete Registration] ❌ Invalid or unpaid session');
        return res.status(400).json({ error: 'Invalid or unpaid session' });
      }

      if (session.metadata?.type !== 'registration') {
        console.log('[Complete Registration] ❌ Not a registration session');
        return res.status(400).json({ error: 'Not a registration session' });
      }

      const email = session.metadata?.email || session.client_reference_id;
      if (!email) {
        console.log('[Complete Registration] ❌ No email in session');
        return res.status(400).json({ error: 'No email found in session' });
      }

      // Get user by email (should have been created by webhook)
      const user = await storage.getUserByEmail(email.toLowerCase());
      
      if (!user) {
        console.log('[Complete Registration] ❌ User not found - webhook may not have processed yet');
        return res.status(404).json({ 
          error: 'Account creation pending',
          message: 'Please wait a moment and try again'
        });
      }

      // SECURITY FIX: Do NOT auto-login users until they verify their email
      // The verification email was already sent by the Stripe webhook
      console.log('[Complete Registration] ✅ Account created, user must verify email:', user.email);
      
      return res.json({
        success: true,
        requiresVerification: true,
        message: 'Please check your email to verify your account before logging in.',
        email: user.email,
        user: {
          email: user.email,
          parentName: user.parentName,
          studentName: user.studentName,
          subscriptionPlan: user.subscriptionPlan,
        }
      });

    } catch (error: any) {
      console.error('[Complete Registration] ❌ Error:', error);
      return res.status(500).json({ 
        error: 'Failed to complete registration',
        message: error.message
      });
    }
  });
}
