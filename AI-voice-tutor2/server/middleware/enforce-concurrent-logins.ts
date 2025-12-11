import { storage } from '../storage';
import { db } from '../db';
import { sessions } from '@shared/schema';
import { sql, eq } from 'drizzle-orm';

/**
 * Enforce concurrent login limits based on subscription tier
 * - Default tiers: 1 concurrent login (one device at a time)
 * - Elite tier: 3 concurrent logins (three devices at a time)
 * 
 * This function is called AFTER successful authentication to ensure
 * old sessions are only terminated when a new login actually succeeds.
 */
export async function enforceConcurrentLoginsAfterAuth(userId: string): Promise<void> {
  try {
    // Get user to check their concurrent login limit
    const user = await storage.getUser(userId);
    
    if (!user) {
      console.error('[ConcurrentLogin] User not found:', userId);
      return;
    }
    
    // Get user's max concurrent login limit (default 1, Elite gets 3)
    const maxConcurrentLogins = user.maxConcurrentLogins || 1;
    
    // Count active sessions for this user - order by expire column (ASC = oldest first)
    const activeSessions = await db.execute(sql`
      SELECT sid, expire 
      FROM sessions 
      WHERE sess->'passport'->>'user' = ${userId}
      AND expire > NOW()
      ORDER BY expire ASC
    `);
    
    const activeSessionCount = activeSessions.rows?.length || 0;
    
    console.log(`[ConcurrentLogin] User ${user.email} has ${activeSessionCount}/${maxConcurrentLogins} active sessions`);
    
    // If over limit, terminate oldest sessions
    // Note: activeSessionCount includes the session just created by this login
    if (activeSessionCount > maxConcurrentLogins) {
      // Calculate how many sessions to remove
      const sessionsToRemove = activeSessionCount - maxConcurrentLogins;
      console.log(`[ConcurrentLogin] User over limit. Terminating ${sessionsToRemove} oldest session(s)`);
      
      for (let i = 0; i < sessionsToRemove && i < activeSessions.rows.length; i++) {
        const oldestSessionId = (activeSessions.rows[i] as any).sid;
        await db.delete(sessions).where(eq(sessions.sid, oldestSessionId));
        console.log(`[ConcurrentLogin] ✓ Terminated oldest session: ${oldestSessionId}`);
      }
    }
  } catch (error) {
    console.error('[ConcurrentLogin] Error enforcing concurrent login limits:', error);
    // Don't throw - allow login to complete even if pruning fails
  }
}
