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
            gradeLevel: '3-5',
            primarySubject: 'Math',
            subscriptionPlan: 'all' as const,
            subscriptionStatus: 'active' as const,
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
          user = await storage.getUserByEmail(emailOrUsername);
          console.log('[Auth] User found by email:', user ? 'YES' : 'NO');
          
          // If not found by email, try username
          if (!user) {
            user = await storage.getUserByUsername(emailOrUsername);
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
        gradeLevel: '3-5',
        primarySubject: 'Math',
        subscriptionPlan: 'all' as const,
        subscriptionStatus: 'active' as const,
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
    // Validate registration payload
    const registerSchema = z.object({
      email: z.string().email(),
      username: z.string().min(1),
      password: z.string().min(8),
      firstName: z.string().min(1, "First name is required"),
      lastName: z.string().min(1, "Last name is required"),
      parentName: z.string().optional(),
      studentName: z.string().min(1, "Student name is required"),
      studentAge: z.number().optional(),
      gradeLevel: z.string().min(1, "Grade level is required"),
      primarySubject: z.string().optional(),
      marketingOptIn: z.boolean().optional(),
    });

    const validation = registerSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: "Validation failed", 
        details: validation.error.errors 
      });
    }

    const existingUser = await storage.getUserByUsername(validation.data.username);
    if (existingUser) {
      return res.status(400).send("Username already exists");
    }

    const user = await storage.createUser({
      ...validation.data,
      password: await hashPassword(validation.data.password),
      marketingOptInDate: validation.data.marketingOptIn ? new Date() : null,
    });

    req.login(user, async (err) => {
      if (err) return next(err);
      
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

  app.post("/api/logout", (req, res, next) => {
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

  // Temporary password reset endpoint for debugging
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { email, newPassword } = req.body;
      
      if (!email || !newPassword) {
        return res.status(400).json({ error: 'Email and newPassword required' });
      }
      
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      const hashedPassword = await hashPassword(newPassword);
      await storage.updateUserPassword(user.id, hashedPassword);
      
      res.json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
      console.error('[Auth] Password reset error:', error);
      res.status(500).json({ error: 'Password reset failed' });
    }
  });
}
