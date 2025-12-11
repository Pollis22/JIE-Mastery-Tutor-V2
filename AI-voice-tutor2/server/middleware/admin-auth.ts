import { Request, Response, NextFunction } from 'express';

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  // Verify user is authenticated
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = req.user as any;

  // Verify user has admin role
  if (!user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
};
