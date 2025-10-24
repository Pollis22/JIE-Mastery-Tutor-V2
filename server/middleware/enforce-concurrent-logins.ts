import { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import { db } from '../db';
import { sessions } from '@shared/schema';
import { sql, and, eq } from 'drizzle-orm';

/**
 * Middleware to enforce concurrent login limits based on subscription tier
 * - Default tiers: 1 concurrent login (one device at a time)
 * - Elite tier: 3 concurrent logins (three devices at a time)
 * 
 * This middleware runs BEFORE login to check if user can have another active session.
 * If at limit, it will terminate the oldest session before allowing new login.
 */
export async function enforceConcurrentLogins(req: Request, res: Response, next: NextFunction) {
  try {
    // Only enforce on login attempts
    if (req.path !== '/api/login' || req.method !== 'POST') {
      return next();
    }
    
    // Get username/email from request body
    const { email } = req.body;
    if (!email) {
      return next();
    }
    
    // Get user to check their concurrent login limit
    const user = await storage.getUserByEmail(email).catch(() => null) || 
                 await storage.getUserByUsername(email).catch(() => null);
    
    if (!user) {
      // User doesn't exist, let passport handle authentication failure
      return next();
    }
    
    // Get user's max concurrent login limit (default 1, Elite gets 3)
    const maxConcurrentLogins = user.maxConcurrentLogins || 1;
    
    // Count active sessions for this user
    const activeSessions = await db.execute(sql`
      SELECT sid, sess, expire 
      FROM sessions 
      WHERE sess->>'passport'->>'user' = ${user.id}
      AND expire > NOW()
      ORDER BY (sess->>'cookie'->>'expires')::timestamp ASC
    `);
    
    const activeSessionCount = activeSessions.rows?.length || 0;
    
    console.log(`[ConcurrentLogin] User ${user.email} has ${activeSessionCount}/${maxConcurrentLogins} active sessions`);
    
    // If at or over limit, terminate oldest sessions to make room
    if (activeSessionCount >= maxConcurrentLogins) {
      const sessionsToRemove = activeSessionCount - maxConcurrentLogins + 1;
      console.log(`[ConcurrentLogin] User at limit. Terminating ${sessionsToRemove} oldest session(s)`);
      
      for (let i = 0; i < sessionsToRemove && i < activeSessions.rows.length; i++) {
        const oldestSessionId = (activeSessions.rows[i] as any).sid;
        await db.delete(sessions).where(eq(sessions.sid, oldestSessionId));
        console.log(`[ConcurrentLogin] Terminated session: ${oldestSessionId}`);
      }
    }
    
    // Allow login to proceed
    next();
  } catch (error) {
    console.error('[ConcurrentLogin] Error enforcing concurrent login limits:', error);
    // Don't block login on middleware errors
    next();
  }
}
