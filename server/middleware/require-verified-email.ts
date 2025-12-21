import { Request, Response, NextFunction } from 'express';

// Only require verification for users created after this date
const VERIFICATION_CUTOFF_DATE = new Date('2025-10-13');

export function requireVerifiedEmail(req: Request, res: Response, next: NextFunction) {
  const user = req.user as any;
  
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  // Allow users created before the verification feature was added
  const accountCreatedAt = new Date(user.createdAt);
  if (accountCreatedAt <= VERIFICATION_CUTOFF_DATE) {
    return next();
  }
  
  // Block unverified users created after cutoff date
  if (!user.emailVerified) {
    return res.status(403).json({
      error: 'Email not verified',
      code: 'EMAIL_NOT_VERIFIED',
      message: 'Please verify your email address to access this feature.',
      email: user.email
    });
  }
  
  next();
}
