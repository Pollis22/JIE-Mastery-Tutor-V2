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

  private getBaseUrl(): string {
    // Priority: APP_URL > RAILWAY_STATIC_URL > RAILWAY_PUBLIC_DOMAIN > REPLIT_DOMAINS > localhost
    if (process.env.APP_URL) {
      return process.env.APP_URL.replace(/\/$/, ''); // Remove trailing slash
    }
    if (process.env.RAILWAY_STATIC_URL) {
      return process.env.RAILWAY_STATIC_URL.replace(/\/$/, '');
    }
    if (process.env.RAILWAY_PUBLIC_DOMAIN) {
      return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
    }
    if (process.env.REPLIT_DOMAINS) {
      return `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`;
    }
    return process.env.REPLIT_DEV_DOMAIN || `http://localhost:${process.env.PORT || 5000}`;
  }

  async sendEmail(params: {
    to: string;
    subject: string;
    html: string;
    text?: string;
  }): Promise<void> {
    try {
      const resend = getResendClient();
      const fromEmail = getFromEmail();
      
      await resend.emails.send({
        from: fromEmail,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text
      });
      console.log(`[EmailService] Email sent to ${params.to}: ${params.subject}`);
    } catch (error) {
      console.error('[EmailService] Failed to send email:', error);
      throw error;
    }
  }
  
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
          <a href="${this.getBaseUrl()}/pricing" style="display:inline-block;padding:12px 24px;background:#dc2626;color:white;text-decoration:none;border-radius:6px;">View Plans</a>
          <p style="margin-top:24px;color:#666;font-size:14px;">
            If you no longer wish to receive updates, <a href="${this.getBaseUrl()}/unsubscribe?email=${user.email}">unsubscribe here</a>.
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
          <a href="${this.getBaseUrl()}/tutor" style="display:inline-block;padding:12px 24px;background:#dc2626;color:white;text-decoration:none;border-radius:6px;">Go to Dashboard</a>
          <p style="margin-top:30px;padding:20px;background:#fef2f2;border-radius:8px;text-align:center;color:#C41E3A;font-size:18px;font-weight:600;">
            Thank you, we appreciate your business!
          </p>
          <p style="margin-top:24px;">Questions? Reply to this email anytime.</p>
          <p style="margin-top:24px;color:#666;font-size:14px;">
            <a href="${this.getBaseUrl()}/unsubscribe?email=${user.email}">Unsubscribe from marketing emails</a>
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
          <a href="${this.getBaseUrl()}/tutor" style="display:inline-block;padding:12px 24px;background:#dc2626;color:white;text-decoration:none;border-radius:6px;">Continue Learning</a>
          <p style="margin-top:30px;padding:20px;background:#fef2f2;border-radius:8px;text-align:center;color:#C41E3A;font-size:18px;font-weight:600;">
            Thank you, we appreciate your business!
          </p>
          <p style="margin-top:24px;color:#666;font-size:14px;">
            <a href="${this.getBaseUrl()}/unsubscribe?email=${user.email}">Unsubscribe from marketing emails</a>
          </p>
        `
      });
    } catch (error) {
      console.error('[EmailService] Failed to send top-up confirmation:', error);
    }
  }

  async sendAdminNotification(type: string, data: {
    email?: string;
    parentName?: string;
    studentName?: string;
    plan?: string;
    amount?: number;
    phone?: string;
    gradeLevel?: string;
    primarySubject?: string;
    [key: string]: any;
  }) {
    try {
      const resend = getResendClient();
      const fromEmail = getFromEmail();
      const adminEmail = process.env.ADMIN_EMAIL || 'support@jiemastery.ai';
      
      // Format amount as currency (treat 0 as valid, only N/A for undefined/null)
      const formattedAmount = typeof data.amount === 'number' ? `$${data.amount.toFixed(2)}` : 'N/A';
      
      // Build professional HTML email
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); padding: 20px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">🔔 ${type}</h1>
          </div>
          
          <div style="background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
            <h2 style="color: #111827; margin-top: 0; border-bottom: 2px solid #dc2626; padding-bottom: 8px;">
              Customer Details
            </h2>
            
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 0; color: #6b7280; font-weight: 500; width: 140px;">Email:</td>
                <td style="padding: 12px 0; color: #111827;">
                  <a href="mailto:${data.email || 'N/A'}" style="color: #dc2626; text-decoration: none;">${data.email || 'N/A'}</a>
                </td>
              </tr>
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 0; color: #6b7280; font-weight: 500;">Parent Name:</td>
                <td style="padding: 12px 0; color: #111827;">${data.parentName || 'N/A'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 0; color: #6b7280; font-weight: 500;">Student Name:</td>
                <td style="padding: 12px 0; color: #111827;">${data.studentName || 'N/A'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 0; color: #6b7280; font-weight: 500;">Grade Level:</td>
                <td style="padding: 12px 0; color: #111827;">${data.gradeLevel || 'N/A'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 0; color: #6b7280; font-weight: 500;">Primary Subject:</td>
                <td style="padding: 12px 0; color: #111827;">${data.primarySubject || 'N/A'}</td>
              </tr>
              ${data.phone ? `
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 0; color: #6b7280; font-weight: 500;">Phone:</td>
                <td style="padding: 12px 0; color: #111827;">
                  <a href="tel:${data.phone}" style="color: #dc2626; text-decoration: none;">${data.phone}</a>
                </td>
              </tr>
              ` : ''}
            </table>
            
            <h2 style="color: #111827; border-bottom: 2px solid #dc2626; padding-bottom: 8px;">
              Subscription Details
            </h2>
            
            <table style="width: 100%; border-collapse: collapse;">
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 0; color: #6b7280; font-weight: 500; width: 140px;">Plan:</td>
                <td style="padding: 12px 0; color: #111827; font-weight: 600;">${data.plan || 'N/A'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 0; color: #6b7280; font-weight: 500;">Amount Paid:</td>
                <td style="padding: 12px 0; color: #16a34a; font-weight: 600; font-size: 18px;">${formattedAmount}</td>
              </tr>
              <tr>
                <td style="padding: 12px 0; color: #6b7280; font-weight: 500;">Date:</td>
                <td style="padding: 12px 0; color: #111827;">${new Date().toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}</td>
              </tr>
            </table>
            
            <div style="margin-top: 24px; padding: 16px; background: #ecfdf5; border-radius: 8px; border-left: 4px solid #10b981;">
              <p style="margin: 0; color: #065f46; font-weight: 500;">
                ✅ New subscriber added successfully!
              </p>
            </div>
          </div>
          
          <p style="text-align: center; color: #9ca3af; font-size: 12px; margin-top: 16px;">
            JIE Mastery AI Tutor - Admin Notification System
          </p>
        </div>
      `;
      
      await resend.emails.send({
        from: fromEmail,
        to: adminEmail,
        subject: `🔔 ${type} - ${data.parentName || data.email || 'New User'} (${data.plan || 'Unknown Plan'})`,
        html
      });
    } catch (error) {
      console.error('[EmailService] Failed to send admin notification:', error);
    }
  }

  async sendAdminRenewalNotification(params: {
    customerEmail: string;
    customerName: string;
    planName: string;
    amountPaid: number;
    invoiceNumber: string | null;
    invoiceUrl: string | null;
    renewalDate: Date;
  }): Promise<boolean> {
    try {
      const resend = getResendClient();
      const fromEmail = getFromEmail();
      const adminEmail = process.env.ADMIN_EMAIL || 'support@jiemastery.ai';
      
      const { customerEmail, customerName, planName, amountPaid, invoiceNumber, invoiceUrl, renewalDate } = params;
      
      const formattedDate = renewalDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      const logoUrl = `${this.getBaseUrl()}/logo.png`;
      
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Subscription Renewed</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f4f4f4;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f4;">
            <tr>
              <td align="center" style="padding: 40px 20px;">
                <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                  
                  <!-- Header with Logo and JIE Branding -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #C41E3A 0%, #8B0000 100%); padding: 30px; text-align: center;">
                      <img src="${logoUrl}" alt="JIE Mastery" width="150" style="max-width: 150px; height: auto;">
                      <h1 style="color: #ffffff; margin: 20px 0 0; font-size: 28px; font-weight: 600;">
                        Subscription Renewed!
                      </h1>
                    </td>
                  </tr>
                  
                  <!-- Revenue Box -->
                  <tr>
                    <td style="padding: 30px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                        <tr>
                          <td style="background-color: #ecfdf5; border: 2px solid #10b981; border-radius: 12px; padding: 25px; text-align: center;">
                            <p style="margin: 0 0 5px; color: #059669; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Recurring Revenue</p>
                            <p style="margin: 0; color: #047857; font-size: 42px; font-weight: 700;">+$${amountPaid.toFixed(2)}</p>
                            <p style="margin: 10px 0 0; color: #065f46; font-size: 16px; font-weight: 500;">${planName}</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  
                  <!-- Customer Details -->
                  <tr>
                    <td style="padding: 0 30px 30px;">
                      <h2 style="color: #C41E3A; font-size: 18px; margin: 0 0 20px; border-bottom: 2px solid #C41E3A; padding-bottom: 10px;">
                        Customer Details
                      </h2>
                      
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                        <tr>
                          <td width="48%" style="background-color: #f8f8f8; border-radius: 8px; padding: 15px; vertical-align: top;">
                            <p style="margin: 0 0 5px; color: #666; font-size: 12px; text-transform: uppercase;">Customer</p>
                            <p style="margin: 0; color: #1a1a1a; font-size: 16px; font-weight: 600;">${customerName}</p>
                          </td>
                          <td width="4%"></td>
                          <td width="48%" style="background-color: #f8f8f8; border-radius: 8px; padding: 15px; vertical-align: top;">
                            <p style="margin: 0 0 5px; color: #666; font-size: 12px; text-transform: uppercase;">Email</p>
                            <p style="margin: 0; color: #1a1a1a; font-size: 16px; font-weight: 600;">${customerEmail}</p>
                          </td>
                        </tr>
                        <tr><td colspan="3" height="15"></td></tr>
                        <tr>
                          <td width="48%" style="background-color: #f8f8f8; border-radius: 8px; padding: 15px; vertical-align: top;">
                            <p style="margin: 0 0 5px; color: #666; font-size: 12px; text-transform: uppercase;">Plan</p>
                            <p style="margin: 0; color: #1a1a1a; font-size: 16px; font-weight: 600;">${planName}</p>
                          </td>
                          <td width="4%"></td>
                          <td width="48%" style="background-color: #f8f8f8; border-radius: 8px; padding: 15px; vertical-align: top;">
                            <p style="margin: 0 0 5px; color: #666; font-size: 12px; text-transform: uppercase;">Renewed</p>
                            <p style="margin: 0; color: #1a1a1a; font-size: 16px; font-weight: 600;">${formattedDate}</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  
                  ${invoiceNumber ? `
                  <!-- Invoice Link -->
                  <tr>
                    <td style="padding: 0 30px 30px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                        <tr>
                          <td style="background-color: #fff8f8; border: 1px solid #fecaca; border-radius: 8px; padding: 20px;">
                            <p style="margin: 0 0 10px; color: #1a1a1a; font-size: 14px;">
                              <strong>Invoice:</strong> #${invoiceNumber}
                            </p>
                            ${invoiceUrl ? `
                            <a href="${invoiceUrl}" style="display: inline-block; background-color: #C41E3A; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">
                              View Invoice
                            </a>
                            ` : ''}
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  ` : ''}
                  
                  <!-- Footer Note -->
                  <tr>
                    <td style="padding: 0 30px 20px;">
                      <p style="margin: 0; color: #666; font-size: 14px;">
                        Customer minutes have been reset for the new billing cycle.
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #1a1a1a; padding: 25px; text-align: center;">
                      <p style="margin: 0; color: #ffffff; font-size: 14px; font-weight: 600;">
                        JIE Mastery AI Tutor
                      </p>
                      <p style="margin: 10px 0 0; color: #999; font-size: 12px;">
                        Admin Notification - ${new Date().getFullYear()}
                      </p>
                    </td>
                  </tr>
                  
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;
      
      const text = `
JIE MASTERY - SUBSCRIPTION RENEWED

Recurring Revenue: +$${amountPaid.toFixed(2)}
Plan: ${planName}

CUSTOMER DETAILS
Customer: ${customerName}
Email: ${customerEmail}
Plan: ${planName}
Renewed: ${formattedDate}
${invoiceNumber ? `Invoice: #${invoiceNumber}` : ''}
${invoiceUrl ? `View Invoice: ${invoiceUrl}` : ''}

Customer minutes have been reset for the new billing cycle.
      `;
      
      await resend.emails.send({
        from: fromEmail,
        to: adminEmail,
        subject: `Renewal: ${customerName} - ${planName} (+$${amountPaid.toFixed(2)})`,
        html,
        text
      });
      
      console.log(`[EmailService] Admin renewal notification sent for ${customerEmail}`);
      return true;
    } catch (error) {
      console.error('[EmailService] Failed to send admin renewal notification:', error);
      return false;
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
      const verificationUrl = `${this.getBaseUrl()}/api/verify-email?token=${user.token}`;
      
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f8fafc; }
            .container { max-width: 600px; margin: 0 auto; background: white; }
            .header { background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); color: white; padding: 40px 20px; text-align: center; }
            .header h1 { margin: 0; font-size: 28px; }
            .content { padding: 40px 30px; background: #ffffff; }
            .verify-box { background: #fef2f2; border: 2px solid #dc2626; padding: 30px; border-radius: 12px; margin: 30px 0; text-align: center; }
            .verify-button { display: inline-block; background: #dc2626; color: white !important; padding: 18px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 18px; }
            .feature-list { background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .feature-list li { margin: 8px 0; }
            .link-fallback { background: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0; word-break: break-all; font-size: 12px; color: #666; }
            .footer { background: #f8fafc; padding: 30px; text-align: center; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎓 Verify Your Email</h1>
              <p style="margin: 10px 0 0; opacity: 0.9;">One quick step to start learning</p>
            </div>
            
            <div class="content">
              <p>Hi ${user.name}!</p>
              
              <p>Thank you for signing up for JIE Mastery! Your payment has been processed successfully.</p>
              
              <p><strong>Please verify your email address</strong> to activate your account and start using the AI tutor.</p>
              
              <div class="verify-box">
                <a href="${verificationUrl}" class="verify-button">
                  ✓ Verify My Email
                </a>
              </div>
              
              <p>Once verified, you'll have immediate access to:</p>
              <div class="feature-list">
                <ul style="margin: 0; padding-left: 20px;">
                  <li>🎤 Voice tutoring sessions</li>
                  <li>📚 Upload homework and study materials</li>
                  <li>👨‍👩‍👧‍👦 Create student profiles for your family</li>
                  <li>📊 Track learning progress</li>
                </ul>
              </div>
              
              <div class="link-fallback">
                <strong>Button not working?</strong> Copy and paste this link into your browser:<br>
                ${verificationUrl}
              </div>
              
              <p>If you didn't create an account with JIE Mastery, you can safely ignore this email.</p>
              
              <p>Welcome to the family!<br><strong>The JIE Mastery Team</strong></p>
            </div>
            
            <div class="footer">
              <p><strong>JIE Mastery AI Tutor</strong> | Patent Pending System</p>
              <p>Questions? Reply to this email for support.</p>
            </div>
          </div>
        </body>
        </html>
      `;
      
      const text = `Hi ${user.name}!

Thank you for signing up for JIE Mastery! Your payment has been processed successfully.

Please verify your email address to activate your account:

${verificationUrl}

Once verified, you'll have immediate access to voice tutoring, study materials, and more!

If you didn't create an account, you can ignore this email.

Welcome to the family!
The JIE Mastery Team`;
      
      await resend.emails.send({
        from: fromEmail,
        to: user.email,
        subject: '✓ Verify Your Email - JIE Mastery',
        html,
        text
      });
      
      console.log('[EmailService] Verification email sent to:', user.email);
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
      const resetLink = `${this.getBaseUrl()}/reset-password?token=${user.token}`;
      
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

  // ==========================================
  // PROFESSIONAL SUBSCRIPTION EMAIL TEMPLATES
  // ==========================================

  private getAdminEmail(): string {
    return process.env.ADMIN_EMAIL || 'support@jiemastery.ai';
  }

  // Customer Cancellation Email
  async sendCancellationEmailToUser(params: {
    email: string;
    firstName: string;
    planName: string;
    accessEndDate: string;
  }): Promise<boolean> {
    const { email, firstName, planName, accessEndDate } = params;
    
    try {
      const resend = getResendClient();
      const fromEmail = getFromEmail();
      
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; }
            .header { background: #64748b; color: white; padding: 40px 20px; text-align: center; }
            .content { padding: 40px 30px; background: #ffffff; }
            .access-box { background: #f0f9ff; border: 2px solid #0ea5e9; padding: 25px; border-radius: 8px; margin: 25px 0; text-align: center; }
            .access-date { font-size: 24px; font-weight: bold; color: #0369a1; }
            .features-list { background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .cta-button { display: inline-block; background: #dc2626; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; }
            .footer { background: #f8fafc; padding: 30px; text-align: center; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>We're Sorry to See You Go</h1>
            </div>
            
            <div class="content">
              <p>Hi ${firstName},</p>
              
              <p>Your <strong>${planName}</strong> subscription has been canceled.</p>
              
              <div class="access-box">
                <div style="margin-bottom: 10px;">📅 Your access continues until:</div>
                <div class="access-date">${accessEndDate}</div>
              </div>
              
              <div class="features-list">
                <strong>Until then, you still have full access to:</strong>
                <ul>
                  <li>✓ Voice tutoring sessions</li>
                  <li>✓ All your uploaded study materials</li>
                  <li>✓ Learning session history & transcripts</li>
                  <li>✓ All student profiles</li>
                </ul>
              </div>
              
              <p><strong>Changed your mind?</strong> You can reactivate anytime before ${accessEndDate} and keep everything as-is.</p>
              
              <center style="margin: 30px 0;">
                <a href="${this.getBaseUrl()}/dashboard?tab=subscription" class="cta-button">
                  Reactivate Subscription
                </a>
              </center>
              
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
              
              <p style="color: #666;">We'd love to know why you're leaving so we can improve. Just reply to this email with any feedback - it really helps!</p>
              
              <p>Thank you for being part of JIE Mastery. We hope to see you again!</p>
              
              <p>Warmly,<br>The JIE Mastery Team</p>
            </div>
            
            <div class="footer">
              <p><strong>JIE Mastery AI Tutor</strong></p>
              <p>Questions? Reply to this email.</p>
            </div>
          </div>
        </body>
        </html>
      `;
      
      await resend.emails.send({
        from: fromEmail,
        to: email,
        subject: 'Your JIE Mastery Subscription Has Been Canceled',
        html,
        text: `Hi ${firstName},\n\nYour ${planName} subscription has been canceled.\n\nYour access continues until: ${accessEndDate}\n\nReactivate anytime: ${this.getBaseUrl()}/dashboard?tab=subscription`
      });
      
      console.log(`[EmailService] ✅ Cancellation email sent to ${email}`);
      return true;
    } catch (error) {
      console.error('[EmailService] Failed to send cancellation email:', error);
      return false;
    }
  }

  // Admin Cancellation Email
  async sendCancellationEmailToAdmin(params: {
    userEmail: string;
    userName: string;
    planName: string;
    planPrice: number;
    accessEndDate: string;
    totalMonthsSubscribed?: number;
    totalSpent?: number;
  }): Promise<boolean> {
    const { userEmail, userName, planName, planPrice, accessEndDate, totalMonthsSubscribed, totalSpent } = params;
    
    try {
      const resend = getResendClient();
      const fromEmail = getFromEmail();
      
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; }
            .header { background: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
            .revenue-box { background: #fee2e2; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; }
            .revenue-box .amount { font-size: 24px; font-weight: bold; color: #dc2626; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
            .info-card { background: white; padding: 15px; border-radius: 8px; }
            .info-card .label { font-size: 12px; color: #666; text-transform: uppercase; }
            .info-card .value { font-size: 16px; font-weight: bold; }
            .action-box { background: #fef3c7; padding: 20px; border-radius: 8px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🚨 Subscription Canceled</h1>
            </div>
            
            <div class="content">
              <div class="revenue-box">
                <div>Monthly Revenue Lost</div>
                <div class="amount">-$${planPrice.toFixed(2)}/mo</div>
              </div>
              
              <h3>👤 Customer Details</h3>
              <div class="info-grid">
                <div class="info-card">
                  <div class="label">Name</div>
                  <div class="value">${userName}</div>
                </div>
                <div class="info-card">
                  <div class="label">Email</div>
                  <div class="value">${userEmail}</div>
                </div>
                <div class="info-card">
                  <div class="label">Plan</div>
                  <div class="value">${planName}</div>
                </div>
                <div class="info-card">
                  <div class="label">Access Until</div>
                  <div class="value">${accessEndDate}</div>
                </div>
                ${totalMonthsSubscribed ? `
                <div class="info-card">
                  <div class="label">Months Subscribed</div>
                  <div class="value">${totalMonthsSubscribed}</div>
                </div>
                ` : ''}
                ${totalSpent ? `
                <div class="info-card">
                  <div class="label">Lifetime Value</div>
                  <div class="value">$${totalSpent.toFixed(2)}</div>
                </div>
                ` : ''}
              </div>
              
              <div class="action-box">
                <h4 style="margin: 0 0 10px; color: #92400e;">💡 Win-Back Actions:</h4>
                <ol style="margin: 0; padding-left: 20px;">
                  <li>Send a personal email asking for feedback</li>
                  <li>Offer a discount to return (if appropriate)</li>
                  <li>Note any patterns with cancellations</li>
                </ol>
              </div>
              
              <p style="margin-top: 20px;">
                <a href="mailto:${userEmail}" style="color: #dc2626;">📧 Email this customer</a>
              </p>
            </div>
          </div>
        </body>
        </html>
      `;
      
      await resend.emails.send({
        from: fromEmail,
        to: this.getAdminEmail(),
        subject: `🚨 Cancellation: ${userName} - ${planName} (-$${planPrice.toFixed(2)}/mo)`,
        html,
        text: `CANCELLATION\n\n${userName} (${userEmail})\nPlan: ${planName} ($${planPrice.toFixed(2)}/mo)\nAccess until: ${accessEndDate}`
      });
      
      console.log(`[EmailService] ✅ Admin cancellation email sent`);
      return true;
    } catch (error) {
      console.error('[EmailService] Failed to send admin cancellation email:', error);
      return false;
    }
  }

  // Customer Upgrade Email
  async sendUpgradeEmail(params: {
    email: string;
    firstName: string;
    oldPlan: string;
    newPlan: string;
    oldMinutes: number;
    newMinutes: number;
    proratedCharge: number;
  }): Promise<boolean> {
    const { email, firstName, oldPlan, newPlan, oldMinutes, newMinutes, proratedCharge } = params;
    
    try {
      const resend = getResendClient();
      const fromEmail = getFromEmail();
      
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; }
            .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 40px 20px; text-align: center; }
            .content { padding: 40px 30px; background: #ffffff; }
            .upgrade-box { display: flex; align-items: center; justify-content: center; gap: 20px; margin: 30px 0; }
            .plan-box { background: #f8fafc; padding: 20px; border-radius: 8px; text-align: center; min-width: 150px; }
            .plan-box.old { opacity: 0.6; }
            .plan-box.new { border: 2px solid #10b981; }
            .plan-name { font-weight: bold; font-size: 18px; }
            .plan-minutes { color: #666; }
            .benefits { background: #d1fae5; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .charge-info { background: #f0fdf4; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #86efac; }
            .cta-button { display: inline-block; background: #10b981; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; }
            .footer { background: #f8fafc; padding: 30px; text-align: center; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🚀 Upgrade Confirmed!</h1>
              <p>More minutes, more learning</p>
            </div>
            
            <div class="content">
              <p>Hi ${firstName}!</p>
              
              <p>Great news! Your plan has been upgraded and is active immediately.</p>
              
              <table style="width: 100%; margin: 30px 0;">
                <tr>
                  <td style="text-align: center; padding: 20px; background: #f8fafc; border-radius: 8px; opacity: 0.7;">
                    <div style="font-weight: bold; font-size: 18px;">${oldPlan}</div>
                    <div style="color: #666;">${oldMinutes} min/mo</div>
                  </td>
                  <td style="text-align: center; font-size: 24px; color: #10b981;">→</td>
                  <td style="text-align: center; padding: 20px; background: #f8fafc; border-radius: 8px; border: 2px solid #10b981;">
                    <div style="font-weight: bold; font-size: 18px; color: #10b981;">${newPlan}</div>
                    <div style="color: #666;">${newMinutes} min/mo</div>
                  </td>
                </tr>
              </table>
              
              <div class="benefits">
                <strong>🎁 You now have:</strong>
                <ul style="margin: 10px 0 0;">
                  <li><strong>${newMinutes} minutes</strong> per month (was ${oldMinutes})</li>
                  <li>More time for each child to learn</li>
                  <li>All subjects and features included</li>
                </ul>
              </div>
              
              <div class="charge-info">
                <strong>💳 Billing:</strong> A prorated charge of <strong>$${proratedCharge.toFixed(2)}</strong> has been applied for the remainder of this billing period.
              </div>
              
              <center>
                <a href="${this.getBaseUrl()}/tutor" class="cta-button">
                  Start a Tutoring Session →
                </a>
              </center>
              
              <div style="margin-top: 30px; padding: 20px; border-top: 1px solid #eee; text-align: center;">
                <p style="margin: 0; color: #C41E3A; font-size: 18px; font-weight: 600;">
                  Thank you, we appreciate your business!
                </p>
              </div>
              
              <p style="margin-top: 20px;">The JIE Mastery Team</p>
            </div>
            
            <div class="footer">
              <p><strong>JIE Mastery AI Tutor</strong></p>
            </div>
          </div>
        </body>
        </html>
      `;
      
      await resend.emails.send({
        from: fromEmail,
        to: email,
        subject: `Upgrade Confirmed: Welcome to ${newPlan}!`,
        html,
        text: `Upgrade Confirmed!\n\nHi ${firstName},\n\nYour plan has been upgraded from ${oldPlan} (${oldMinutes} min) to ${newPlan} (${newMinutes} min).\n\nA prorated charge of $${proratedCharge.toFixed(2)} has been applied.\n\nStart learning: ${this.getBaseUrl()}/tutor`
      });
      
      console.log(`[EmailService] ✅ Upgrade email sent to ${email}`);
      return true;
    } catch (error) {
      console.error('[EmailService] Failed to send upgrade email:', error);
      return false;
    }
  }

  // Admin Upgrade Email
  async sendAdminUpgradeEmail(params: {
    email: string;
    userName: string;
    oldPlan: string;
    newPlan: string;
    oldPrice: number;
    newPrice: number;
    proratedCharge: number;
    monthlyIncrease: number;
  }): Promise<boolean> {
    const { email, userName, oldPlan, newPlan, oldPrice, newPrice, proratedCharge, monthlyIncrease } = params;
    
    try {
      const resend = getResendClient();
      const fromEmail = getFromEmail();
      
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; }
            .header { background: #10b981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
            .revenue-box { background: #d1fae5; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; }
            .revenue-box .amount { font-size: 28px; font-weight: bold; color: #059669; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
            .info-card { background: white; padding: 15px; border-radius: 8px; }
            .info-card .label { font-size: 12px; color: #666; text-transform: uppercase; }
            .info-card .value { font-size: 16px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📈 Plan Upgrade!</h1>
            </div>
            
            <div class="content">
              <div class="revenue-box">
                <div style="color: #065f46; font-size: 14px;">Monthly Revenue Increase</div>
                <div class="amount">+$${monthlyIncrease.toFixed(2)}/mo</div>
                <div style="font-size: 14px; margin-top: 10px;">Today's Charge: $${proratedCharge.toFixed(2)}</div>
              </div>
              
              <h3>👤 Customer</h3>
              <div class="info-grid">
                <div class="info-card">
                  <div class="label">Name</div>
                  <div class="value">${userName}</div>
                </div>
                <div class="info-card">
                  <div class="label">Email</div>
                  <div class="value">${email}</div>
                </div>
              </div>
              
              <h3 style="margin-top: 20px;">📦 Plan Change</h3>
              <div class="info-grid">
                <div class="info-card">
                  <div class="label">Previous Plan</div>
                  <div class="value">${oldPlan}</div>
                  <div style="color: #666;">$${oldPrice.toFixed(2)}/mo</div>
                </div>
                <div class="info-card" style="border: 2px solid #10b981;">
                  <div class="label">New Plan</div>
                  <div class="value">${newPlan}</div>
                  <div style="color: #059669;">$${newPrice.toFixed(2)}/mo</div>
                </div>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;
      
      await resend.emails.send({
        from: fromEmail,
        to: this.getAdminEmail(),
        subject: `📈 Upgrade: ${userName} - ${oldPlan} → ${newPlan} (+$${monthlyIncrease.toFixed(2)}/mo)`,
        html,
        text: `PLAN UPGRADE\n\nCustomer: ${userName} (${email})\n${oldPlan} ($${oldPrice}) → ${newPlan} ($${newPrice})\nMonthly increase: +$${monthlyIncrease.toFixed(2)}\nToday's charge: $${proratedCharge.toFixed(2)}`
      });
      
      console.log(`[EmailService] ✅ Admin upgrade email sent`);
      return true;
    } catch (error) {
      console.error('[EmailService] Failed to send admin upgrade email:', error);
      return false;
    }
  }

  // Customer Downgrade Email
  async sendDowngradeEmail(params: {
    email: string;
    firstName: string;
    currentPlan: string;
    newPlan: string;
    currentMinutes: number;
    newMinutes: number;
    effectiveDate: string;
  }): Promise<boolean> {
    const { email, firstName, currentPlan, newPlan, currentMinutes, newMinutes, effectiveDate } = params;
    
    try {
      const resend = getResendClient();
      const fromEmail = getFromEmail();
      
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; }
            .header { background: #6366f1; color: white; padding: 40px 20px; text-align: center; }
            .content { padding: 40px 30px; background: #ffffff; }
            .info-box { background: #eef2ff; border-left: 4px solid #6366f1; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0; }
            .cta-button { display: inline-block; background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; }
            .footer { background: #f8fafc; padding: 30px; text-align: center; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Plan Change Scheduled</h1>
            </div>
            
            <div class="content">
              <p>Hi ${firstName},</p>
              
              <p>Your plan change from <strong>${currentPlan}</strong> to <strong>${newPlan}</strong> has been scheduled.</p>
              
              <div class="info-box">
                <strong>📅 What happens next:</strong>
                <ul style="margin: 15px 0 0;">
                  <li><strong>Now until ${effectiveDate}:</strong> You keep full access to ${currentPlan} with ${currentMinutes} minutes</li>
                  <li><strong>Starting ${effectiveDate}:</strong> Your plan changes to ${newPlan} with ${newMinutes} minutes</li>
                </ul>
              </div>
              
              <p><strong>No refunds or prorated charges</strong> - you'll simply start the new plan on your next billing date.</p>
              
              <p>Changed your mind? You can cancel this change anytime before ${effectiveDate}.</p>
              
              <center style="margin: 30px 0;">
                <a href="${this.getBaseUrl()}/dashboard?tab=subscription" class="cta-button">
                  Manage Subscription
                </a>
              </center>
              
              <div style="margin-top: 30px; padding: 20px; border-top: 1px solid #eee; text-align: center;">
                <p style="margin: 0; color: #C41E3A; font-size: 18px; font-weight: 600;">
                  Thank you, we appreciate your business!
                </p>
              </div>
              
              <p style="margin-top: 20px;">Questions? Just reply to this email.</p>
              <p>The JIE Mastery Team</p>
            </div>
            
            <div class="footer">
              <p><strong>JIE Mastery AI Tutor</strong></p>
            </div>
          </div>
        </body>
        </html>
      `;
      
      await resend.emails.send({
        from: fromEmail,
        to: email,
        subject: `Plan Change Scheduled: ${newPlan} starting ${effectiveDate}`,
        html,
        text: `Your plan will change from ${currentPlan} to ${newPlan} on ${effectiveDate}.`
      });
      
      console.log(`[EmailService] ✅ Downgrade email sent to ${email}`);
      return true;
    } catch (error) {
      console.error('[EmailService] Failed to send downgrade email:', error);
      return false;
    }
  }

  // Admin Downgrade Email
  async sendAdminDowngradeEmail(params: {
    email: string;
    userName: string;
    oldPlan: string;
    newPlan: string;
    oldPrice: number;
    newPrice: number;
    effectiveDate: string;
    monthlyDecrease: number;
  }): Promise<boolean> {
    const { email, userName, oldPlan, newPlan, oldPrice, newPrice, effectiveDate, monthlyDecrease } = params;
    
    try {
      const resend = getResendClient();
      const fromEmail = getFromEmail();
      
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; }
            .header { background: #f59e0b; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
            .revenue-box { background: #fef3c7; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; }
            .revenue-box .amount { font-size: 24px; font-weight: bold; color: #d97706; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
            .info-card { background: white; padding: 15px; border-radius: 8px; }
            .info-card .label { font-size: 12px; color: #666; text-transform: uppercase; }
            .info-card .value { font-size: 16px; font-weight: bold; }
            .action-note { background: #fff7ed; padding: 15px; border-radius: 8px; margin-top: 20px; border: 1px solid #fed7aa; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>⚠️ Plan Downgrade Scheduled</h1>
            </div>
            
            <div class="content">
              <div class="revenue-box">
                <div>Monthly Revenue Impact</div>
                <div class="amount">-$${monthlyDecrease.toFixed(2)}/mo</div>
                <div style="font-size: 14px; margin-top: 5px;">Effective: ${effectiveDate}</div>
              </div>
              
              <h3>👤 Customer</h3>
              <div class="info-grid">
                <div class="info-card">
                  <div class="label">Name</div>
                  <div class="value">${userName}</div>
                </div>
                <div class="info-card">
                  <div class="label">Email</div>
                  <div class="value">${email}</div>
                </div>
              </div>
              
              <h3 style="margin-top: 20px;">📦 Plan Change</h3>
              <div class="info-grid">
                <div class="info-card">
                  <div class="label">Current Plan</div>
                  <div class="value">${oldPlan}</div>
                  <div style="color: #666;">$${oldPrice.toFixed(2)}/mo</div>
                </div>
                <div class="info-card">
                  <div class="label">New Plan (${effectiveDate})</div>
                  <div class="value">${newPlan}</div>
                  <div style="color: #d97706;">$${newPrice.toFixed(2)}/mo</div>
                </div>
              </div>
              
              <div class="action-note">
                <strong>💡 Win-back opportunity:</strong> Consider reaching out to understand why they're downgrading and if there's anything we can do to retain them at the higher tier.
              </div>
            </div>
          </div>
        </body>
        </html>
      `;
      
      await resend.emails.send({
        from: fromEmail,
        to: this.getAdminEmail(),
        subject: `⚠️ Downgrade: ${userName} - ${oldPlan} → ${newPlan} (-$${monthlyDecrease.toFixed(2)}/mo)`,
        html,
        text: `DOWNGRADE SCHEDULED\n\n${userName} (${email})\n${oldPlan} → ${newPlan}\nEffective: ${effectiveDate}\nMonthly impact: -$${monthlyDecrease.toFixed(2)}`
      });
      
      console.log(`[EmailService] ✅ Admin downgrade email sent`);
      return true;
    } catch (error) {
      console.error('[EmailService] Failed to send admin downgrade email:', error);
      return false;
    }
  }

  // Customer Top-Off Email
  async sendTopOffEmail(params: {
    email: string;
    firstName: string;
    minutesPurchased: number;
    amountPaid: number;
    newBalance: number;
  }): Promise<boolean> {
    const { email, firstName, minutesPurchased, amountPaid, newBalance } = params;
    
    try {
      const resend = getResendClient();
      const fromEmail = getFromEmail();
      
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; }
            .header { background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); color: white; padding: 40px 20px; text-align: center; }
            .content { padding: 40px 30px; background: #ffffff; }
            .purchase-box { background: #f5f3ff; border: 2px solid #8b5cf6; padding: 25px; border-radius: 8px; margin: 25px 0; text-align: center; }
            .minutes { font-size: 48px; font-weight: bold; color: #6d28d9; }
            .balance-box { background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .cta-button { display: inline-block; background: #8b5cf6; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; }
            .footer { background: #f8fafc; padding: 30px; text-align: center; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>⚡ Minutes Added!</h1>
            </div>
            
            <div class="content">
              <p>Hi ${firstName}!</p>
              
              <p>Your purchase is complete and your minutes are ready to use.</p>
              
              <div class="purchase-box">
                <div class="minutes">+${minutesPurchased}</div>
                <div>minutes added</div>
                <div style="margin-top: 10px; color: #666;">Paid: $${amountPaid.toFixed(2)}</div>
              </div>
              
              <div class="balance-box">
                <strong>📊 Your New Balance:</strong>
                <div style="font-size: 24px; font-weight: bold; color: #059669; margin-top: 10px;">
                  ${newBalance} minutes available
                </div>
                <div style="color: #666; font-size: 14px; margin-top: 5px;">
                  Purchased minutes never expire!
                </div>
              </div>
              
              <center style="margin: 30px 0;">
                <a href="${this.getBaseUrl()}/tutor" class="cta-button">
                  Start Learning Now
                </a>
              </center>
              
              <div style="margin-top: 30px; padding: 20px; border-top: 1px solid #eee; text-align: center;">
                <p style="margin: 0; color: #C41E3A; font-size: 18px; font-weight: 600;">
                  Thank you, we appreciate your business!
                </p>
              </div>
              
              <p style="margin-top: 20px;">The JIE Mastery Team</p>
            </div>
            
            <div class="footer">
              <p><strong>JIE Mastery AI Tutor</strong></p>
            </div>
          </div>
        </body>
        </html>
      `;
      
      await resend.emails.send({
        from: fromEmail,
        to: email,
        subject: `${minutesPurchased} Minutes Added to Your Account!`,
        html,
        text: `Hi ${firstName}!\n\n+${minutesPurchased} minutes added!\nPaid: $${amountPaid.toFixed(2)}\n\nNew balance: ${newBalance} minutes\n\nStart learning: ${this.getBaseUrl()}/tutor`
      });
      
      console.log(`[EmailService] ✅ Top-off email sent to ${email}`);
      return true;
    } catch (error) {
      console.error('[EmailService] Failed to send top-off email:', error);
      return false;
    }
  }

  // Admin Top-Off Email
  async sendAdminTopOffEmail(params: {
    userEmail: string;
    userName: string;
    minutesPurchased: number;
    amountPaid: number;
    currentPlan: string;
  }): Promise<boolean> {
    const { userEmail, userName, minutesPurchased, amountPaid, currentPlan } = params;
    
    try {
      const resend = getResendClient();
      const fromEmail = getFromEmail();
      
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; }
            .header { background: #8b5cf6; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
            .revenue-box { background: #f5f3ff; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; }
            .revenue-box .amount { font-size: 28px; font-weight: bold; color: #6d28d9; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
            .info-card { background: white; padding: 15px; border-radius: 8px; }
            .info-card .label { font-size: 12px; color: #666; text-transform: uppercase; }
            .info-card .value { font-size: 16px; font-weight: bold; }
            .insight { background: #ddd6fe; padding: 15px; border-radius: 8px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>⚡ Top-Off Purchase!</h1>
            </div>
            
            <div class="content">
              <div class="revenue-box">
                <div>Additional Revenue</div>
                <div class="amount">+$${amountPaid.toFixed(2)}</div>
              </div>
              
              <div class="info-grid">
                <div class="info-card">
                  <div class="label">Customer</div>
                  <div class="value">${userName}</div>
                </div>
                <div class="info-card">
                  <div class="label">Email</div>
                  <div class="value">${userEmail}</div>
                </div>
                <div class="info-card">
                  <div class="label">Current Plan</div>
                  <div class="value">${currentPlan}</div>
                </div>
                <div class="info-card">
                  <div class="label">Minutes Purchased</div>
                  <div class="value">${minutesPurchased} min</div>
                </div>
              </div>
              
              <div class="insight">
                <strong>💡 Insight:</strong> This customer is buying extra minutes - they may be a good candidate for an upgrade to a higher tier plan.
              </div>
            </div>
          </div>
        </body>
        </html>
      `;
      
      await resend.emails.send({
        from: fromEmail,
        to: this.getAdminEmail(),
        subject: `⚡ Top-Off: ${userName} purchased ${minutesPurchased} min (+$${amountPaid.toFixed(2)})`,
        html,
        text: `TOP-OFF PURCHASE\n\n${userName} (${userEmail})\nPlan: ${currentPlan}\nPurchased: ${minutesPurchased} minutes\nRevenue: $${amountPaid.toFixed(2)}`
      });
      
      console.log(`[EmailService] ✅ Admin top-off email sent`);
      return true;
    } catch (error) {
      console.error('[EmailService] Failed to send admin top-off email:', error);
      return false;
    }
  }

  // Customer Reactivation Email
  async sendReactivationEmail(params: {
    email: string;
    firstName: string;
    planName: string;
    minutes: number;
  }): Promise<boolean> {
    const { email, firstName, planName, minutes } = params;
    
    try {
      const resend = getResendClient();
      const fromEmail = getFromEmail();
      
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; }
            .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 40px 20px; text-align: center; }
            .content { padding: 40px 30px; background: #ffffff; }
            .welcome-box { background: #d1fae5; border: 2px solid #10b981; padding: 25px; border-radius: 8px; margin: 25px 0; text-align: center; }
            .plan-details { background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .cta-button { display: inline-block; background: #10b981; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; }
            .footer { background: #f8fafc; padding: 30px; text-align: center; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Welcome Back!</h1>
              <p>Your subscription is active again</p>
            </div>
            
            <div class="content">
              <p>Hi ${firstName}!</p>
              
              <div class="welcome-box">
                <div style="font-size: 24px; margin-bottom: 10px;">✨ You're all set!</div>
                <div>Your <strong>${planName}</strong> subscription is now active.</div>
              </div>
              
              <div class="plan-details">
                <h3 style="margin-top: 0; color: #10b981;">Your Plan Details:</h3>
                <p><strong>${minutes} voice minutes</strong> per month for your entire family</p>
                <p>✓ Unlimited student profiles</p>
                <p>✓ All subjects: Math, English, Science, Spanish & more</p>
                <p>✓ Personalized AI tutoring for each child</p>
              </div>
              
              <center style="margin: 30px 0;">
                <a href="${this.getBaseUrl()}/tutor" class="cta-button">
                  Start Learning Now →
                </a>
              </center>
              
              <p>We're excited to have you back! If you have any questions, just reply to this email.</p>
              
              <p>Happy learning!<br><strong>The JIE Mastery Team</strong></p>
            </div>
            
            <div class="footer">
              <p><strong>JIE Mastery AI Tutor</strong></p>
            </div>
          </div>
        </body>
        </html>
      `;
      
      await resend.emails.send({
        from: fromEmail,
        to: email,
        subject: `🎉 Welcome Back to JIE Mastery!`,
        html,
        text: `Welcome back, ${firstName}!\n\nYour ${planName} subscription is now active with ${minutes} minutes per month.\n\nStart learning: ${this.getBaseUrl()}/tutor`
      });
      
      console.log(`[EmailService] ✅ Reactivation email sent to ${email}`);
      return true;
    } catch (error) {
      console.error('[EmailService] Failed to send reactivation email:', error);
      return false;
    }
  }

  // Admin Reactivation Email
  async sendAdminReactivationEmail(params: {
    userEmail: string;
    userName: string;
    planName: string;
    planPrice: number;
    reactivationType: 'undo_cancellation' | 'new_subscription';
  }): Promise<boolean> {
    const { userEmail, userName, planName, planPrice, reactivationType } = params;
    
    try {
      const resend = getResendClient();
      const fromEmail = getFromEmail();
      
      const typeLabel = reactivationType === 'undo_cancellation' 
        ? 'Cancellation Reversed' 
        : 'New Subscription';
      
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; }
            .header { background: #10b981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
            .revenue-box { background: #d1fae5; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; }
            .revenue-box .amount { font-size: 28px; font-weight: bold; color: #059669; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
            .info-card { background: white; padding: 15px; border-radius: 8px; }
            .info-card .label { font-size: 12px; color: #666; text-transform: uppercase; }
            .info-card .value { font-size: 16px; font-weight: bold; }
            .success-note { background: #d1fae5; padding: 15px; border-radius: 8px; margin-top: 20px; border: 1px solid #86efac; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Customer Reactivated!</h1>
            </div>
            
            <div class="content">
              <div class="revenue-box">
                <div>Monthly Revenue Recovered</div>
                <div class="amount">+$${planPrice.toFixed(2)}/mo</div>
                <div style="font-size: 14px; margin-top: 5px;">${typeLabel}</div>
              </div>
              
              <div class="info-grid">
                <div class="info-card">
                  <div class="label">Customer</div>
                  <div class="value">${userName}</div>
                </div>
                <div class="info-card">
                  <div class="label">Email</div>
                  <div class="value">${userEmail}</div>
                </div>
                <div class="info-card">
                  <div class="label">Plan</div>
                  <div class="value">${planName}</div>
                </div>
                <div class="info-card">
                  <div class="label">Type</div>
                  <div class="value">${typeLabel}</div>
                </div>
              </div>
              
              <div class="success-note">
                <strong>✅ Win-back Success!</strong> This customer decided to stay or return. Great for retention!
              </div>
            </div>
          </div>
        </body>
        </html>
      `;
      
      await resend.emails.send({
        from: fromEmail,
        to: this.getAdminEmail(),
        subject: `🎉 Reactivation: ${userName} - ${planName} (+$${planPrice.toFixed(2)}/mo)`,
        html,
        text: `REACTIVATION\n\n${userName} (${userEmail})\nPlan: ${planName}\nType: ${typeLabel}\nRevenue: +$${planPrice.toFixed(2)}/mo`
      });
      
      console.log(`[EmailService] ✅ Admin reactivation email sent`);
      return true;
    } catch (error) {
      console.error('[EmailService] Failed to send admin reactivation email:', error);
      return false;
    }
  }

  /**
   * Send parent a summary email after their child completes a tutoring session
   */
  async sendSessionSummary(data: {
    parentEmail: string;
    parentName: string;
    studentName: string;
    subject: string;
    gradeLevel: string;
    duration: number;
    messageCount: number;
    transcript: Array<{ role: string; text: string }>;
    sessionDate: Date;
  }): Promise<boolean> {
    try {
      const resend = getResendClient();
      const fromEmail = getFromEmail();
      
      // Generate AI summary of what was learned
      const learningSummary = await this.generateLearningSummary(data.transcript, data.subject);
      
      // Format transcript for email (last 6 messages max)
      const highlightExchanges = this.formatTranscriptHighlights(data.transcript);
      
      const formattedDate = data.sessionDate.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
      
      await resend.emails.send({
        from: `JIE Mastery <${fromEmail}>`,
        to: data.parentEmail,
        subject: `${data.studentName}'s Tutoring Session Summary - ${data.subject}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f8fafc; }
              .container { max-width: 600px; margin: 0 auto; }
              .header { background: linear-gradient(135deg, #4F46E5 0%, #3730A3 100%); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center; }
              .header h1 { margin: 0; font-size: 24px; }
              .content { background: #ffffff; padding: 30px; border-radius: 0 0 8px 8px; }
              .summary-box { background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4F46E5; }
              .summary-box h3 { margin-top: 0; color: #1e40af; }
              .stats { display: flex; justify-content: space-around; text-align: center; margin: 25px 0; padding: 20px; background: #fafafa; border-radius: 8px; }
              .stat { flex: 1; }
              .stat-value { font-size: 28px; font-weight: bold; color: #4F46E5; }
              .stat-label { font-size: 12px; color: #666; text-transform: uppercase; margin-top: 4px; }
              .transcript { background: #fafafa; padding: 20px; border-radius: 8px; margin: 20px 0; }
              .transcript h3 { margin-top: 0; color: #374151; }
              .tutor-msg { color: #4F46E5; margin: 12px 0; padding-left: 12px; border-left: 2px solid #4F46E5; }
              .student-msg { color: #059669; margin: 12px 0; padding-left: 12px; border-left: 2px solid #059669; }
              .cta-button { display: inline-block; background: #4F46E5; color: white !important; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; margin-top: 20px; }
              .footer { text-align: center; margin-top: 30px; padding: 20px; color: #6b7280; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>📚 Session Complete!</h1>
                <p style="margin: 8px 0 0; opacity: 0.9;">${data.studentName}'s learning session on ${formattedDate}</p>
              </div>
              
              <div class="content">
                <p>Hi ${data.parentName || 'there'},</p>
                
                <p>${data.studentName} just finished a tutoring session! Here's what happened:</p>
                
                <div class="summary-box">
                  <h3>📖 What ${data.studentName} Learned</h3>
                  <p style="margin-bottom: 0;">${learningSummary}</p>
                </div>
                
                <div class="stats">
                  <div class="stat">
                    <div class="stat-value">${data.duration}</div>
                    <div class="stat-label">Minutes</div>
                  </div>
                  <div class="stat">
                    <div class="stat-value">${data.messageCount}</div>
                    <div class="stat-label">Exchanges</div>
                  </div>
                  <div class="stat">
                    <div class="stat-value">${data.subject}</div>
                    <div class="stat-label">Subject</div>
                  </div>
                </div>
                
                <div class="transcript">
                  <h3>💬 Session Highlights</h3>
                  ${highlightExchanges}
                </div>
                
                <p style="font-size: 18px;">Keep up the great work! 🌟</p>
                
                <div style="text-align: center;">
                  <a href="${this.getBaseUrl()}/dashboard" class="cta-button">View Full Transcript</a>
                </div>
              </div>
              
              <div class="footer">
                <p style="margin: 0;">JIE Mastery AI Tutor</p>
                <p style="margin: 8px 0 0;">You're receiving this because ${data.studentName} completed a tutoring session.</p>
                <p style="margin: 8px 0 0;"><a href="${this.getBaseUrl()}/settings" style="color: #6b7280;">Manage email preferences</a></p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `SESSION COMPLETE - ${data.studentName}

${data.parentName || 'Hi there'},

${data.studentName} just finished a tutoring session!

WHAT ${data.studentName.toUpperCase()} LEARNED:
${learningSummary}

SESSION STATS:
- Duration: ${data.duration} minutes
- Exchanges: ${data.messageCount}
- Subject: ${data.subject}

Keep up the great work!

View full transcript: ${this.getBaseUrl()}/dashboard

--
JIE Mastery AI Tutor`
      });
      
      console.log('[EmailService] ✅ Session summary email sent to:', data.parentEmail);
      return true;
    } catch (error) {
      console.error('[EmailService] Failed to send session summary email:', error);
      return false;
    }
  }

  /**
   * Generate an AI summary of what the student learned during the session
   */
  private async generateLearningSummary(
    transcript: Array<{ role: string; text: string }>,
    subject: string
  ): Promise<string> {
    // Fallback summary if AI fails
    const fallbackSummary = 'Your child had a productive tutoring session today.';
    
    if (transcript.length < 2) {
      return fallbackSummary;
    }
    
    // Build conversation text (limit to last 20 messages to stay within token limits)
    const recentTranscript = transcript.slice(-20);
    const conversationText = recentTranscript
      .map(t => `${t.role === 'assistant' ? 'Tutor' : 'Student'}: ${t.text}`)
      .join('\n');
    
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY || '',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 150,
          messages: [{
            role: 'user',
            content: `You are summarizing a tutoring session for a parent. Based on this ${subject} tutoring conversation, write a 2-3 sentence summary of what the student learned or worked on. Be positive, specific, and encouraging. Do not use quotes. Focus on concrete skills or concepts.

Conversation:
${conversationText}

Summary for parent:`
          }]
        })
      });
      
      if (!response.ok) {
        console.error('[EmailService] Claude API error:', response.status);
        return fallbackSummary;
      }
      
      const data = await response.json();
      const summary = data.content?.[0]?.text?.trim();
      
      return summary || fallbackSummary;
    } catch (error) {
      console.error('[EmailService] Failed to generate AI summary:', error);
      return fallbackSummary;
    }
  }

  /**
   * Format the last few transcript messages as HTML highlights
   */
  private formatTranscriptHighlights(
    transcript: Array<{ role: string; text: string }>
  ): string {
    // Get last 6 messages (3 exchanges) for highlights
    const highlights = transcript.slice(-6);
    
    if (highlights.length === 0) {
      return '<p style="color: #666; font-style: italic;">No transcript available.</p>';
    }
    
    return highlights
      .map(t => {
        const isTutor = t.role === 'assistant';
        const speaker = isTutor ? 'Tutor' : 'Student';
        const className = isTutor ? 'tutor-msg' : 'student-msg';
        const icon = isTutor ? '🎓' : '👤';
        // Truncate long messages
        const text = t.text.length > 200 ? t.text.substring(0, 200) + '...' : t.text;
        return `<p class="${className}">${icon} <strong>${speaker}:</strong> ${text}</p>`;
      })
      .join('');
  }
}

export const emailService = new EmailService();
