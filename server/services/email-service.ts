/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 * 
 * This source code is confidential and proprietary.
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */


import { Resend } from 'resend';

// Get Resend API key from environment - works with Railway and other platforms
function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY environment variable is not set');
  }
  return new Resend(apiKey);
}

// Get the "from" email address - can be overridden via env var
function getFromEmail(): string {
  return process.env.RESEND_FROM_EMAIL || 'noreply@jiemastery.ai';
}

export class EmailService {
  
  async sendWelcomeEmail(user: {
    email: string;
    parentName: string;
    studentName: string;
  }) {
    try {
      const resend = getResendClient();
      const fromEmail = getFromEmail();
      
      await resend.emails.send({
        from: fromEmail,
        to: user.email,
        subject: 'Welcome to JIE Mastery Tutor!',
        html: `
          <h1>Welcome, ${user.parentName}!</h1>
          <p>Thank you for creating an account for ${user.studentName}.</p>
          <p>We're excited to help ${user.studentName} learn and grow with AI-powered tutoring.</p>
          <h2>Getting Started:</h2>
          <ul>
            <li>Choose a subscription plan that fits your needs</li>
            <li>Upload study materials (optional)</li>
            <li>Connect with your AI tutor and start learning</li>
          </ul>
          <a href="${process.env.REPLIT_DEV_DOMAIN || 'http://localhost:5000'}/pricing" style="display:inline-block;padding:12px 24px;background:#dc2626;color:white;text-decoration:none;border-radius:6px;">View Plans</a>
          <p style="margin-top:24px;color:#666;font-size:14px;">
            If you no longer wish to receive updates, <a href="${process.env.REPLIT_DEV_DOMAIN || 'http://localhost:5000'}/unsubscribe?email=${user.email}">unsubscribe here</a>.
          </p>
        `
      });
    } catch (error) {
      console.error('[EmailService] Failed to send welcome email:', error);
    }
  }

  async sendSubscriptionConfirmation(user: {
    email: string;
    parentName: string;
    studentName: string;
    plan: string;
    minutes: number;
  }) {
    try {
      const resend = getResendClient();
      const fromEmail = getFromEmail();
      
      await resend.emails.send({
        from: fromEmail,
        to: user.email,
        subject: 'Thank You for Subscribing!',
        html: `
          <h1>Thank You, ${user.parentName}!</h1>
          <p>Your ${user.plan} plan is now active for ${user.studentName}.</p>
          <h2>Your Plan Details:</h2>
          <ul>
            <li><strong>Plan:</strong> ${user.plan}</li>
            <li><strong>Minutes per month:</strong> ${user.minutes}</li>
            <li><strong>Subjects:</strong> Math, English, Science, Spanish and More</li>
          </ul>
          <p>Start your first tutoring session now:</p>
          <a href="${process.env.REPLIT_DEV_DOMAIN || 'http://localhost:5000'}/tutor" style="display:inline-block;padding:12px 24px;background:#dc2626;color:white;text-decoration:none;border-radius:6px;">Go to Dashboard</a>
          <p style="margin-top:24px;">Questions? Reply to this email anytime.</p>
          <p style="margin-top:24px;color:#666;font-size:14px;">
            <a href="${process.env.REPLIT_DEV_DOMAIN || 'http://localhost:5000'}/unsubscribe?email=${user.email}">Unsubscribe from marketing emails</a>
          </p>
        `
      });
    } catch (error) {
      console.error('[EmailService] Failed to send subscription confirmation:', error);
    }
  }

  async sendTopUpConfirmation(user: {
    email: string;
    parentName: string;
    minutesPurchased: number;
  }) {
    try {
      const resend = getResendClient();
      const fromEmail = getFromEmail();
      
      await resend.emails.send({
        from: fromEmail,
        to: user.email,
        subject: 'Minutes Added Successfully',
        html: `
          <h1>Minutes Added!</h1>
          <p>Hi ${user.parentName},</p>
          <p>We've added ${user.minutesPurchased} minutes to your account.</p>
          <a href="${process.env.REPLIT_DEV_DOMAIN || 'http://localhost:5000'}/tutor" style="display:inline-block;padding:12px 24px;background:#dc2626;color:white;text-decoration:none;border-radius:6px;">Continue Learning</a>
          <p style="margin-top:24px;color:#666;font-size:14px;">
            <a href="${process.env.REPLIT_DEV_DOMAIN || 'http://localhost:5000'}/unsubscribe?email=${user.email}">Unsubscribe from marketing emails</a>
          </p>
        `
      });
    } catch (error) {
      console.error('[EmailService] Failed to send top-up confirmation:', error);
    }
  }

  async sendAdminNotification(type: string, data: any) {
    try {
      const resend = getResendClient();
      const fromEmail = getFromEmail();
      const adminEmail = process.env.ADMIN_EMAIL || 'support@jiemastery.ai';
      
      await resend.emails.send({
        from: fromEmail,
        to: adminEmail,
        subject: `New ${type}`,
        html: `<pre>${JSON.stringify(data, null, 2)}</pre>`
      });
    } catch (error) {
      console.error('[EmailService] Failed to send admin notification:', error);
    }
  }

  async sendEmailVerification(user: {
    email: string;
    name: string;
    token: string;
  }) {
    try {
      const resend = getResendClient();
      const fromEmail = getFromEmail();
      const baseUrl = process.env.REPLIT_DEV_DOMAIN || 'http://localhost:5000';
      const verificationLink = `${baseUrl}/verify-email?token=${user.token}`;
      
      await resend.emails.send({
        from: fromEmail,
        to: user.email,
        subject: 'Verify Your Email - JIE Mastery Tutor',
        html: `
          <h1>Verify Your Email Address</h1>
          <p>Hi ${user.name},</p>
          <p>Thank you for signing up for JIE Mastery Tutor! Please verify your email address to activate your account.</p>
          <a href="${verificationLink}" style="display:inline-block;padding:12px 24px;background:#dc2626;color:white;text-decoration:none;border-radius:6px;margin:20px 0;">Verify Email Address</a>
          <p>Or copy and paste this link into your browser:</p>
          <p style="color:#666;font-size:14px;">${verificationLink}</p>
          <p style="margin-top:24px;color:#666;font-size:13px;">
            This verification link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.
          </p>
        `
      });
    } catch (error) {
      console.error('[EmailService] Failed to send email verification:', error);
      throw error;
    }
  }

  async sendPasswordReset(user: {
    email: string;
    name: string;
    token: string;
  }) {
    try {
      const resend = getResendClient();
      const fromEmail = getFromEmail();
      const baseUrl = process.env.REPLIT_DEV_DOMAIN || 'http://localhost:5000';
      const resetLink = `${baseUrl}/reset-password?token=${user.token}`;
      
      await resend.emails.send({
        from: fromEmail,
        to: user.email,
        subject: 'Reset Your Password - JIE Mastery Tutor',
        html: `
          <h1>Reset Your Password</h1>
          <p>Hi ${user.name},</p>
          <p>We received a request to reset your password. Click the button below to create a new password:</p>
          <a href="${resetLink}" style="display:inline-block;padding:12px 24px;background:#dc2626;color:white;text-decoration:none;border-radius:6px;margin:20px 0;">Reset Password</a>
          <p>Or copy and paste this link into your browser:</p>
          <p style="color:#666;font-size:14px;">${resetLink}</p>
          <p style="margin-top:24px;color:#666;font-size:13px;">
            This password reset link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
          </p>
        `
      });
    } catch (error) {
      console.error('[EmailService] Failed to send password reset:', error);
      throw error;
    }
  }

  async sendContactForm(contact: {
    name: string;
    email: string;
    subject: string;
    message: string;
  }) {
    try {
      const resend = getResendClient();
      const fromEmail = getFromEmail();
      const adminEmail = process.env.ADMIN_EMAIL || 'support@jiemastery.ai';
      
      // Send to admin
      await resend.emails.send({
        from: fromEmail,
        to: adminEmail,
        subject: `New Contact Form Submission: ${contact.subject}`,
        html: `
          <h2>New Contact Form Submission</h2>
          <p><strong>From:</strong> ${contact.name} (${contact.email})</p>
          <p><strong>Subject:</strong> ${contact.subject}</p>
          <hr>
          <p><strong>Message:</strong></p>
          <p style="white-space: pre-wrap;">${contact.message}</p>
          <hr>
          <p style="color:#666;font-size:14px;">Reply directly to ${contact.email}</p>
        `
      });

      // Send confirmation to user
      await resend.emails.send({
        from: fromEmail,
        to: contact.email,
        subject: 'We Received Your Message - JIE Mastery Tutor',
        html: `
          <h1>Thank You for Contacting Us</h1>
          <p>Hi ${contact.name},</p>
          <p>We've received your message and appreciate you reaching out. Our team will get back to you as soon as possible, typically within 24 hours.</p>
          <p><strong>Your Message Summary:</strong></p>
          <p><strong>Subject:</strong> ${contact.subject}</p>
          <hr>
          <p style="white-space: pre-wrap;">${contact.message}</p>
          <hr>
          <p>Best regards,<br>JIE Mastery Tutor Team</p>
          <p style="margin-top:24px;color:#666;font-size:14px;">
            <a href="${process.env.REPLIT_DEV_DOMAIN || 'http://localhost:5000'}/unsubscribe?email=${contact.email}">Unsubscribe from marketing emails</a>
          </p>
        `
      });
      
      console.log('[EmailService] ✅ Contact form emails sent successfully');
    } catch (error) {
      console.error('[EmailService] Failed to send contact form email:', error);
      throw error;
    }
  }
}

export const emailService = new EmailService();
