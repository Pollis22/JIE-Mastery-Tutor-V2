import { Resend } from 'resend';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key)) {
    throw new Error('Resend not connected');
  }
  return {apiKey: connectionSettings.settings.api_key, fromEmail: connectionSettings.settings.from_email};
}

async function getUncachableResendClient() {
  const {apiKey, fromEmail} = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail: fromEmail
  };
}

export class EmailService {
  
  async sendWelcomeEmail(user: {
    email: string;
    parentName: string;
    studentName: string;
  }) {
    try {
      const {client, fromEmail} = await getUncachableResendClient();
      
      await client.emails.send({
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
      const {client, fromEmail} = await getUncachableResendClient();
      
      await client.emails.send({
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
      const {client, fromEmail} = await getUncachableResendClient();
      
      await client.emails.send({
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
      const {client, fromEmail} = await getUncachableResendClient();
      const adminEmail = process.env.ADMIN_EMAIL || fromEmail;
      
      await client.emails.send({
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
      const {client, fromEmail} = await getUncachableResendClient();
      const baseUrl = process.env.REPLIT_DEV_DOMAIN || 'http://localhost:5000';
      const verificationLink = `${baseUrl}/verify-email?token=${user.token}`;
      
      await client.emails.send({
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
      const {client, fromEmail} = await getUncachableResendClient();
      const baseUrl = process.env.REPLIT_DEV_DOMAIN || 'http://localhost:5000';
      const resetLink = `${baseUrl}/reset-password?token=${user.token}`;
      
      await client.emails.send({
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
}

export const emailService = new EmailService();
