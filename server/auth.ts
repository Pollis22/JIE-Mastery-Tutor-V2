import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
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

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
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
            preferredLanguage: 'en', // Fixed: Use ISO language code instead of 'english'
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
        preferredLanguage: 'english',
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

        // Send admin notification (non-blocking)
        emailService.sendAdminNotification('Account Created', {
          email: user.email,
          studentName: user.studentName,
          gradeLevel: user.gradeLevel,
          marketingOptIn: user.marketingOptIn,
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

  // Email Verification Endpoint
  app.post("/api/auth/verify-email", async (req, res) => {
    try {
      const { token } = req.body;
      
      if (!token) {
        return res.status(400).json({ error: 'Verification token required' });
      }

      console.log('[Auth] 🔍 Email verification attempt');
      
      const result = await storage.verifyEmailToken(token);
      
      if (!result.success) {
        console.log('[Auth] ❌ Verification failed:', result.error);
        return res.status(400).json({ 
          error: result.error,
          expired: result.error?.includes('expired')
        });
      }

      console.log('[Auth] ✅ Email verified for:', result.user?.email);

      // Send welcome email after successful verification
      if (result.user) {
        emailService.sendWelcomeEmail({
          email: result.user.email,
          parentName: result.user.parentName || result.user.firstName || 'there',
          studentName: result.user.studentName || 'your student'
        }).catch(err => console.error('[Auth] Failed to send welcome email:', err));
      }

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

      // Log the user in
      req.login(user, async (err) => {
        if (err) {
          console.error('[Complete Registration] ❌ Login failed:', err);
          return next(err);
        }

        console.log('[Complete Registration] ✅ User logged in:', user.email);
        
        // Rotate session ID for security
        const oldSessionId = req.sessionID;
        req.session.regenerate((regenerateErr) => {
          if (regenerateErr) {
            console.error('[Complete Registration] Session regeneration error:', regenerateErr);
          } else {
            console.log('[Complete Registration] Session rotated:', oldSessionId, '->', req.sessionID);
          }

          // Re-login after regeneration
          req.login(user, async (loginErr) => {
            if (loginErr) {
              console.error('[Complete Registration] Re-login failed:', loginErr);
              return res.status(500).json({ error: 'Session error', details: loginErr.message });
            }

            res.json({
              success: true,
              user: {
                id: user.id,
                email: user.email,
                username: user.username,
                parentName: user.parentName,
                studentName: user.studentName,
                subscriptionPlan: user.subscriptionPlan,
                subscriptionStatus: user.subscriptionStatus,
              }
            });
          });
        });
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
