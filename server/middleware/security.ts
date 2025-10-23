// Security middleware for production deployment
import { Request, Response, NextFunction } from 'express';

export function setupSecurityHeaders(req: Request, res: Response, next: NextFunction) {
  // Security headers for OpenAI Realtime API voice tutoring
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions Policy for microphone access
  res.setHeader('Permissions-Policy', [
    'microphone=(self)',
    'camera=()',
    'geolocation=()',
    'payment=(self "https://js.stripe.com")'
  ].join(', '));

  next();
}

export function setupCORS(req: Request, res: Response, next: NextFunction) {
  // Build allowed origins list - support both REPLIT_DEV_DOMAIN and custom domains
  const allowedOrigins = [
    'http://localhost:5000',
    'http://localhost:3000',
    process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : '',
    process.env.CUSTOM_DOMAIN || ''
  ].filter(Boolean);

  const origin = req.headers.origin;
  
  // For requests with origin header that matches allowed origins, set CORS headers
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else if (!origin) {
    // Same-origin requests don't need CORS headers
    // Don't set any Access-Control headers for same-origin
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
}