// Security middleware for production deployment
import { Request, Response, NextFunction } from 'express';

export function setupSecurityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', [
    'microphone=(self)',
    'camera=()',
    'geolocation=()',
    'payment=(self "https://js.stripe.com")'
  ].join(', '));
  next();
}

export function setupCORS(req: Request, res: Response, next: NextFunction) {
  const envOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o: string) => o.trim()).filter(Boolean)
    : [];

  const allowedOrigins = [
    'http://localhost:5000',
    'http://localhost:3000',
    'https://www.jiemastery.ai',
    'https://jiemastery.ai',
    'https://jie-mastery-tutor-v2-production.up.railway.app',
    'https://jie-mobile-tutor-app-production.up.railway.app', // JIE Mobile App
    process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : '',
    process.env.CUSTOM_DOMAIN || '',
    ...envOrigins,
  ].filter(Boolean);

  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
}
