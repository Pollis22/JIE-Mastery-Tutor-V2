import { Request, Response, NextFunction } from 'express';

export function requireVerifiedEmail(req: Request, res: Response, next: NextFunction) {
  const user = req.user as any;
  
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
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
