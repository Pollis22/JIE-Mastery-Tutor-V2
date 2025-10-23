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

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  if (!hashed || !salt) {
    console.error('[comparePasswords] Invalid password format - missing hash or salt');
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

  const sessionSettings: session.SessionOptions = {
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      httpOnly: true,
      secure: false, // Set to false for development (HTTP)
      sameSite: 'lax', // Changed from 'none' - lax works with secure: false
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
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
            password: await hashPassword(testPassword),
            firstName: 'Test',
            lastName: 'User',
            parentName: 'Test Parent',
            studentName: 'Test Student',
            studentAge: 10,
            gradeLevel: 'grades-3-5' as const,
            primarySubject: 'math' as const,
            subscriptionPlan: 'all' as const,
            subscriptionStatus: 'active' as const,
            maxConcurrentSessions: 3, // Test user gets full concurrent access
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
            deletedAt: null,
            deletionRequestedAt: null,
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
        subscriptionPlan: 'all' as const,
        subscriptionStatus: 'active' as const,
        maxConcurrentSessions: 3, // Test user gets full concurrent access
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
        deletedAt: null,
        deletionRequestedAt: null,
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
    // Validate registration payload
    const registerSchema = z.object({
      email: z.string().email(),
      username: z.string().min(1),
      password: z.string().min(8),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      parentName: z.string().min(1, "Parent/Guardian name is required"),
      studentName: z.string().min(1, "Student name is required"),
      studentAge: z.number().optional(),
      gradeLevel: z.string().min(1, "Grade level is required"),
      primarySubject: z.string().optional(),
      marketingOptIn: z.boolean().optional(),
    });

    const validation = registerSchema.safeParse(req.body);
    if (!validation.success) {
      console.error('[Register] Validation failed:', validation.error.errors);
      return res.status(400).json({ 
        error: "Validation failed", 
        details: validation.error.errors 
      });
    }

    // Split parentName into firstName and lastName if not provided separately
    let firstName = validation.data.firstName;
    let lastName = validation.data.lastName;
    
    if (!firstName && !lastName && validation.data.parentName) {
      const nameParts = validation.data.parentName.trim().split(/\s+/);
      firstName = nameParts[0];
      lastName = nameParts.slice(1).join(' ') || nameParts[0];
    }

    const existingUser = await storage.getUserByUsername(validation.data.username);
    if (existingUser) {
      return res.status(400).send("Username already exists");
    }

    // New users start WITHOUT an active subscription - they must pay first
    const user = await storage.createUser({
      ...validation.data,
      firstName: firstName || validation.data.parentName?.split(' ')[0] || 'User',
      lastName: lastName || validation.data.parentName?.split(' ').slice(1).join(' ') || '',
      password: await hashPassword(validation.data.password),
      marketingOptInDate: validation.data.marketingOptIn ? new Date() : null,
      subscriptionPlan: null, // No plan until payment
      subscriptionStatus: 'pending', // Pending until payment
      subscriptionMinutesLimit: 0, // No minutes until payment
      subscriptionMinutesUsed: 0,
      purchasedMinutesBalance: 0,
      billingCycleStart: null, // No billing cycle until subscription starts
    });

    req.login(user, async (err) => {
      if (err) return next(err);
      
      // Generate and send email verification (non-blocking)
      const verificationToken = await storage.generateEmailVerificationToken(user.id);
      emailService.sendEmailVerification({
        email: user.email,
        name: user.parentName || user.firstName || 'User',
        token: verificationToken,
      }).catch(error => console.error('[Auth] Email verification failed:', error));

      // Send welcome email (non-blocking)
      if (user.parentName && user.studentName) {
        emailService.sendWelcomeEmail({
          email: user.email,
          parentName: user.parentName,
          studentName: user.studentName,
        }).catch(error => console.error('[Auth] Welcome email failed:', error));
      }

      // Send admin notification (non-blocking)
      emailService.sendAdminNotification('Account Created', {
        email: user.email,
        studentName: user.studentName,
        gradeLevel: user.gradeLevel,
        marketingOptIn: user.marketingOptIn,
      }).catch(error => console.error('[Auth] Admin notification failed:', error));

      res.status(201).json(user);
    });
  });

  // Support both /api/login and /api/auth/login for compatibility
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
      
      req.login(user, (err) => {
        if (err) {
          console.error('[Auth] Session error:', err);
          const errorMessage = err.message || err.toString() || 'Unknown session error';
          return res.status(500).json({ error: 'Session error', details: errorMessage });
        }
        // Sanitize user response to exclude sensitive fields
        const { password, ...safeUser } = user as any;
        res.status(200).json(safeUser);
      });
    })(req, res, next);
  });
  
  // Add /api/auth/login alias for frontend compatibility
  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: Error, user: SelectUser | false) => {
      if (err) {
        console.error('[Auth] Authentication error:', err);
        const errorMessage = err.message || err.toString() || 'Unknown authentication error';
        return res.status(500).json({ error: 'Authentication error', details: errorMessage });
      }
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      // Check if email is verified - but only for NEW users
      const verificationCutoffDate = new Date('2025-10-13');
      const accountCreatedAt = user.createdAt ? new Date(user.createdAt) : new Date();
      
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
      
      req.login(user, (err) => {
        if (err) {
          console.error('[Auth] Session error:', err);
          const errorMessage = err.message || err.toString() || 'Unknown session error';
          return res.status(500).json({ error: 'Session error', details: errorMessage });
        }
        // Sanitize user response to exclude sensitive fields
        const { password, ...safeUser } = user as any;
        res.status(200).json(safeUser);
      });
    })(req, res, next);
  });

  // Support both /api/logout and /api/auth/logout for compatibility
  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });
  
  app.post("/api/auth/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
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

  // Resend email verification
  app.post("/api/auth/resend-verification", async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }
      
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      if (user.emailVerified) {
        return res.status(400).json({ error: 'Email is already verified' });
      }
      
      const token = await storage.generateEmailVerificationToken(user.id);
      await emailService.sendEmailVerification({
        email: user.email,
        name: user.parentName || user.firstName || 'User',
        token,
      });
      
      res.json({ success: true, message: 'Verification email sent' });
    } catch (error) {
      console.error('[Auth] Resend verification error:', error);
      res.status(500).json({ error: 'Failed to send verification email' });
    }
  });

  // Verify email token
  app.get("/api/auth/verify-email", async (req, res) => {
    try {
      const { token } = req.query;
      
      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'Invalid verification token' });
      }
      
      const user = await storage.verifyEmailToken(token);
      if (!user) {
        return res.status(400).json({ error: 'Invalid or expired verification token' });
      }
      
      res.json({ success: true, message: 'Email verified successfully' });
    } catch (error) {
      console.error('[Auth] Email verification error:', error);
      res.status(500).json({ error: 'Failed to verify email' });
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
        maxConcurrentSessions: 3, // Elite concurrent sessions
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
}
