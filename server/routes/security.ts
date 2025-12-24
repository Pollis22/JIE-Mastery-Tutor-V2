import { Router, Request, Response } from 'express';
import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { storage } from '../storage';
import { emailService } from '../services/email-service';
import { hashPassword, comparePasswords as authComparePasswords } from '../auth';

const router = Router();
const scryptAsync = promisify(scrypt);

export const SECURITY_QUESTIONS = [
  "What was the name of your first pet?",
  "What city were you born in?",
  "What is your mother's maiden name?",
  "What was the name of your elementary school?",
  "What was the make of your first car?",
  "What is your favorite movie?",
  "What street did you grow up on?",
  "What was your childhood nickname?",
  "What is the name of your favorite childhood friend?",
  "What was your favorite food as a child?"
];

async function hashSecurityAnswer(answer: string): Promise<string> {
  const normalized = answer.toLowerCase().trim();
  const salt = randomBytes(16).toString('hex');
  const buf = (await scryptAsync(normalized, salt, 64)) as Buffer;
  return `${buf.toString('hex')}.${salt}`;
}

async function compareSecurityAnswer(supplied: string, stored: string): Promise<boolean> {
  try {
    const normalized = supplied.toLowerCase().trim();
    const [hashed, salt] = stored.split('.');
    if (!hashed || !salt) return false;
    const hashedBuf = Buffer.from(hashed, 'hex');
    const suppliedBuf = (await scryptAsync(normalized, salt, 64)) as Buffer;
    return timingSafeEqual(hashedBuf, suppliedBuf);
  } catch {
    return false;
  }
}

async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  // Use the auth module's comparePasswords which supports both bcrypt and scrypt
  return authComparePasswords(supplied, stored);
}

router.get('/security-questions-list', (req: Request, res: Response) => {
  res.json({ questions: SECURITY_QUESTIONS });
});

router.post('/user/security-questions', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userId = req.user.id;
    const { question1, answer1, question2, answer2, question3, answer3, currentPassword } = req.body;

    console.log('[SecurityQuestions] Save attempt for user:', req.user.email);
    console.log('[SecurityQuestions] Fields provided:', { 
      q1: !!question1, a1: !!answer1, 
      q2: !!question2, a2: !!answer2, 
      q3: !!question3, a3: !!answer3, 
      password: !!currentPassword 
    });

    if (!question1 || !answer1 || !question2 || !answer2 || !question3 || !answer3 || !currentPassword) {
      console.log('[SecurityQuestions] Missing required fields');
      return res.status(400).json({ error: 'All fields are required' });
    }

    const user = await storage.getUser(userId);
    if (!user) {
      console.log('[SecurityQuestions] User not found:', userId);
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('[SecurityQuestions] Password hash type:', user.password.startsWith('$2') ? 'bcrypt' : 'scrypt');
    
    const isValidPassword = await comparePasswords(currentPassword, user.password);
    console.log('[SecurityQuestions] Password valid:', isValidPassword);
    
    if (!isValidPassword) {
      console.log('[SecurityQuestions] Password verification failed for user:', req.user.email);
      return res.status(401).json({ error: 'Incorrect password' });
    }

    if (question1 === question2 || question2 === question3 || question1 === question3) {
      return res.status(400).json({ error: 'Please choose 3 different security questions' });
    }

    const hashedAnswer1 = await hashSecurityAnswer(answer1);
    const hashedAnswer2 = await hashSecurityAnswer(answer2);
    const hashedAnswer3 = await hashSecurityAnswer(answer3);

    await storage.updateUserSecurityQuestions(userId, {
      securityQuestion1: question1,
      securityAnswer1: hashedAnswer1,
      securityQuestion2: question2,
      securityAnswer2: hashedAnswer2,
      securityQuestion3: question3,
      securityAnswer3: hashedAnswer3,
      securityQuestionsSet: true
    });

    console.log(`[Security] Security questions set for user ${userId}`);
    res.json({ success: true, message: 'Security questions saved' });

  } catch (error: any) {
    console.error('[Security] Set questions error:', error);
    res.status(500).json({ error: 'Failed to save security questions' });
  }
});

router.get('/user/security-questions', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const user = await storage.getUser(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ 
      hasSecurityQuestions: user.securityQuestionsSet || false,
      securityQuestion1: user.securityQuestion1,
      securityQuestion2: user.securityQuestion2,
      securityQuestion3: user.securityQuestion3,
    });
  } catch (error: any) {
    console.error('[Security] Get security questions error:', error);
    res.status(500).json({ error: 'Failed to get security questions' });
  }
});

router.get('/user/security-questions-status', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const user = await storage.getUser(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ 
      securityQuestionsSet: user.securityQuestionsSet || false,
      questions: user.securityQuestionsSet ? [
        user.securityQuestion1,
        user.securityQuestion2,
        user.securityQuestion3
      ] : []
    });
  } catch (error: any) {
    console.error('[Security] Get questions status error:', error);
    res.status(500).json({ error: 'Failed to get security status' });
  }
});

router.post('/user/change-password', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new passwords are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const user = await storage.getUser(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isValidPassword = await comparePasswords(currentPassword, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = await hashPassword(newPassword);
    await storage.updateUserPassword(user.id, hashedPassword);

    console.log(`[Security] Password changed for user ${user.id}`);
    res.json({ success: true, message: 'Password changed successfully' });

  } catch (error: any) {
    console.error('[Security] Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

router.post('/verify-security-questions', async (req: Request, res: Response) => {
  try {
    const { email, answer1, answer2, answer3 } = req.body;

    if (!email || !answer1 || !answer2 || !answer3) {
      return res.status(400).json({ error: 'All answers are required' });
    }

    const user = await storage.getUserByEmail(email.toLowerCase().trim());
    if (!user || !user.securityQuestionsSet) {
      return res.status(404).json({ error: 'Account not found or security questions not set' });
    }

    const valid1 = await compareSecurityAnswer(answer1, user.securityAnswer1 || '');
    const valid2 = await compareSecurityAnswer(answer2, user.securityAnswer2 || '');
    const valid3 = await compareSecurityAnswer(answer3, user.securityAnswer3 || '');

    if (!valid1 || !valid2 || !valid3) {
      console.log(`[Security] Failed verification for ${email}`);
      return res.status(401).json({ error: 'One or more answers are incorrect' });
    }

    const verificationToken = randomBytes(32).toString('hex');
    const tokenExpiry = new Date(Date.now() + 15 * 60 * 1000);

    await storage.updateUserSecurityVerification(user.id, verificationToken, tokenExpiry);

    console.log(`[Security] Security questions verified for ${email}`);
    res.json({ 
      success: true, 
      verificationToken,
      message: 'Security questions verified' 
    });

  } catch (error: any) {
    console.error('[Security] Verify questions error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await storage.getUserByEmail(normalizedEmail);

    if (!user) {
      console.log(`[Auth] Password reset requested for non-existent email: ${normalizedEmail}`);
      return res.json({ 
        success: true, 
        message: 'If an account exists with this email, you will receive a password reset link.' 
      });
    }

    const resetToken = randomBytes(32).toString('hex');
    const resetExpiry = new Date(Date.now() + 60 * 60 * 1000);

    await storage.setPasswordResetToken(user.id, resetToken, resetExpiry);

    // Note: The resetUrl is built by emailService.sendPasswordReset using its getBaseUrl()
    // This local baseUrl is kept for logging purposes only

    try {
      await emailService.sendPasswordReset({
        email: user.email,
        name: user.firstName || 'there',
        token: resetToken
      });
      console.log(`[Auth] Password reset email sent to ${user.email}`);
    } catch (emailError) {
      console.error('[Auth] Failed to send password reset email:', emailError);
    }

    res.json({ 
      success: true, 
      message: 'If an account exists with this email, you will receive a password reset link.' 
    });

  } catch (error: any) {
    console.error('[Auth] Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

router.get('/verify-reset-token', async (req: Request, res: Response) => {
  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ valid: false, error: 'Token is required' });
    }

    const user = await storage.getUserByResetToken(token);
    if (!user) {
      return res.json({ valid: false, error: 'Invalid or expired reset link' });
    }

    res.json({ valid: true, email: user.email.replace(/(.{2}).*@/, '$1***@') });
  } catch (error: any) {
    console.error('[Auth] Verify reset token error:', error);
    res.status(500).json({ valid: false, error: 'Failed to verify token' });
  }
});

router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const user = await storage.getUserByResetToken(token);
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset link' });
    }

    const hashedPassword = await hashPassword(newPassword);
    await storage.resetUserPassword(user.id, hashedPassword);

    try {
      await emailService.sendEmail({
        to: user.email,
        subject: 'Your Password Has Been Reset - JIE Mastery',
        html: `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #16a34a;">Password Changed Successfully</h2>
            <p>Hi ${user.firstName || 'there'},</p>
            <p>Your password was successfully reset.</p>
            <p>If you did not make this change, please contact us immediately at support@jiemastery.ai</p>
            <p style="margin-top: 30px; color: #666;">The JIE Mastery Team</p>
          </div>
        `,
        text: `Your password was successfully reset. If you didn't do this, contact support immediately.`
      });
    } catch (emailError) {
      console.error('[Auth] Failed to send password reset confirmation:', emailError);
    }

    console.log(`[Auth] Password reset completed for ${user.email}`);
    res.json({ success: true, message: 'Password reset successful. You can now log in.' });

  } catch (error: any) {
    console.error('[Auth] Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

router.post('/user/change-email', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userId = req.user.id;
    const { newEmail, currentPassword, verificationToken } = req.body;

    if (!newEmail || !currentPassword) {
      return res.status(400).json({ error: 'New email and current password are required' });
    }

    const normalizedEmail = newEmail.toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const existing = await storage.getUserByEmail(normalizedEmail);
    if (existing && existing.id !== userId) {
      return res.status(409).json({ error: 'This email is already in use' });
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isValidPassword = await comparePasswords(currentPassword, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    if (user.securityQuestionsSet) {
      if (!verificationToken) {
        return res.status(400).json({ 
          error: 'Security verification required',
          requiresSecurityQuestions: true,
          questions: [user.securityQuestion1, user.securityQuestion2, user.securityQuestion3]
        });
      }

      if (user.securityVerificationToken !== verificationToken) {
        return res.status(401).json({ error: 'Invalid verification token' });
      }

      if (!user.securityVerificationExpiry || new Date() > new Date(user.securityVerificationExpiry)) {
        return res.status(401).json({ error: 'Verification token expired' });
      }
    }

    const oldEmail = user.email;

    await storage.updateUserEmail(userId, normalizedEmail);

    if (user.stripeCustomerId) {
      try {
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2025-08-27.basil' as any });
        await stripe.customers.update(user.stripeCustomerId, { email: normalizedEmail });
        console.log(`[Account] Updated Stripe customer email to ${normalizedEmail}`);
      } catch (stripeError) {
        console.error('[Account] Failed to update Stripe email:', stripeError);
      }
    }

    try {
      await emailService.sendEmail({
        to: oldEmail,
        subject: 'Your JIE Mastery Email Was Changed',
        html: `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #dc2626;">Email Address Changed</h2>
            <p>Hi ${user.firstName || 'there'},</p>
            <p>Your JIE Mastery account email was just changed from <strong>${oldEmail}</strong> to <strong>${normalizedEmail}</strong>.</p>
            <p>If you made this change, no action is needed.</p>
            <p><strong>If you did NOT make this change</strong>, please contact us immediately at support@jiemastery.ai</p>
            <p style="margin-top: 30px; color: #666;">The JIE Mastery Team</p>
          </div>
        `,
        text: `Your email was changed from ${oldEmail} to ${normalizedEmail}. If you didn't do this, contact support@jiemastery.ai immediately.`
      });
    } catch (emailError) {
      console.error('[Account] Failed to send email change notification:', emailError);
    }

    console.log(`[Account] Email changed from ${oldEmail} to ${normalizedEmail} for user ${userId}`);
    res.json({ 
      success: true, 
      message: 'Email updated successfully. Please verify your new email address.',
      requiresVerification: true
    });

  } catch (error: any) {
    console.error('[Account] Change email error:', error);
    res.status(500).json({ error: 'Failed to change email' });
  }
});

router.post('/forgot-email', async (req: Request, res: Response) => {
  try {
    const { firstName, lastName, securityAnswer } = req.body;

    if (!firstName || !lastName) {
      return res.json({
        success: false,
        message: 'Please provide your first and last name to help locate your account.'
      });
    }

    const users = await storage.searchUsersByName(firstName.toLowerCase(), lastName.toLowerCase());

    if (users.length === 0) {
      return res.json({
        success: false,
        message: 'No account found with that name. Please contact support@jiemastery.ai for help.'
      });
    }

    if (users.length > 1) {
      return res.json({
        success: false,
        message: 'Multiple accounts found. Please contact support@jiemastery.ai for help.'
      });
    }

    const user = users[0];

    if (!user.securityQuestionsSet) {
      const hint = user.email.replace(/(.{2}).*@/, '$1***@');
      return res.json({
        success: true,
        requiresSecurityAnswer: false,
        hint: `Your account email ends with: ${hint}`,
        message: 'No security questions set. Use the hint above or contact support for help.'
      });
    }

    if (!securityAnswer) {
      return res.json({
        success: true,
        requiresSecurityAnswer: true,
        securityQuestion: user.securityQuestion1,
        hint: `Account email ends with: ...${user.email.slice(-10)}`
      });
    }

    const isValid = await compareSecurityAnswer(securityAnswer, user.securityAnswer1 || '');
    if (!isValid) {
      return res.status(401).json({ error: 'Incorrect answer. Please try again or contact support.' });
    }

    const maskedEmail = user.email.replace(/(.{2}).*@/, '$1***@');
    res.json({
      success: true,
      email: maskedEmail,
      message: 'Your email is shown above. Use this to log in or reset your password.'
    });

  } catch (error: any) {
    console.error('[Auth] Forgot email error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

export default router;
