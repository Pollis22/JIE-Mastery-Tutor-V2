import { Router } from 'express';
import { db } from '../db';
import { realtimeSessions, users } from '@shared/schema';
import { eq, desc, and, gte, lte, or, ilike, sql } from 'drizzle-orm';

const router = Router();

// GET /api/sessions/recent - Last 10 sessions for dashboard
router.get('/recent', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const userId = req.user!.id;
    
    // Get last 10 completed sessions from last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const sessions = await db.select({
      id: realtimeSessions.id,
      studentId: realtimeSessions.studentId,
      studentName: realtimeSessions.studentName,
      subject: realtimeSessions.subject,
      language: realtimeSessions.language,
      ageGroup: realtimeSessions.ageGroup,
      startedAt: realtimeSessions.startedAt,
      endedAt: realtimeSessions.endedAt,
      minutesUsed: realtimeSessions.minutesUsed,
      summary: realtimeSessions.summary,
      totalMessages: realtimeSessions.totalMessages,
      status: realtimeSessions.status,
    })
    .from(realtimeSessions)
    .where(and(
      eq(realtimeSessions.userId, userId),
      eq(realtimeSessions.status, 'ended'),
      gte(realtimeSessions.startedAt, thirtyDaysAgo)
    ))
    .orderBy(desc(realtimeSessions.startedAt))
    .limit(10);
    
    res.json({ sessions });
    
  } catch (error) {
    console.error('[Sessions] Failed to fetch recent sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// GET /api/sessions - All sessions (last 30 days) with filters
router.get('/', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const userId = req.user!.id;
    const { 
      page = 1, 
      limit = 20,
      studentId,
      subject,
      search,
      startDate,
      endDate
    } = req.query;
    
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const offset = (pageNum - 1) * limitNum;
    
    // Build filter conditions
    const conditions: any[] = [
      eq(realtimeSessions.userId, userId),
      eq(realtimeSessions.status, 'ended')
    ];
    
    // Add 30-day limit unless custom date range provided
    if (!startDate && !endDate) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      conditions.push(gte(realtimeSessions.startedAt, thirtyDaysAgo));
    }
    
    if (studentId) {
      conditions.push(eq(realtimeSessions.studentId, studentId as string));
    }
    
    if (subject) {
      conditions.push(eq(realtimeSessions.subject, subject as string));
    }
    
    if (search) {
      conditions.push(
        or(
          ilike(realtimeSessions.summary, `%${search}%`),
          ilike(realtimeSessions.studentName, `%${search}%`)
        )
      );
    }
    
    if (startDate) {
      conditions.push(gte(realtimeSessions.startedAt, new Date(startDate as string)));
    }
    
    if (endDate) {
      conditions.push(lte(realtimeSessions.startedAt, new Date(endDate as string)));
    }
    
    // Get total count
    const [{ count }] = await db.select({ count: sql<number>`count(*)` })
      .from(realtimeSessions)
      .where(and(...conditions));
    
    // Get paginated results
    const sessions = await db.select({
      id: realtimeSessions.id,
      studentId: realtimeSessions.studentId,
      studentName: realtimeSessions.studentName,
      subject: realtimeSessions.subject,
      language: realtimeSessions.language,
      ageGroup: realtimeSessions.ageGroup,
      startedAt: realtimeSessions.startedAt,
      endedAt: realtimeSessions.endedAt,
      minutesUsed: realtimeSessions.minutesUsed,
      summary: realtimeSessions.summary,
      totalMessages: realtimeSessions.totalMessages,
      status: realtimeSessions.status,
    })
    .from(realtimeSessions)
    .where(and(...conditions))
    .orderBy(desc(realtimeSessions.startedAt))
    .limit(limitNum)
    .offset(offset);
    
    res.json({
      sessions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: Number(count),
        totalPages: Math.ceil(Number(count) / limitNum)
      }
    });
    
  } catch (error) {
    console.error('[Sessions] Failed to fetch sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// GET /api/sessions/:id - Get full session with transcript
router.get('/:id', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { id } = req.params;
    const userId = req.user!.id;
    
    const [session] = await db.select()
      .from(realtimeSessions)
      .where(and(
        eq(realtimeSessions.id, id),
        eq(realtimeSessions.userId, userId)
      ));
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json({ session });
    
  } catch (error) {
    console.error('[Sessions] Failed to fetch session:', error);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// DELETE /api/sessions/:id - Delete a session
router.delete('/:id', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { id } = req.params;
    const userId = req.user!.id;
    
    const result = await db.delete(realtimeSessions)
      .where(and(
        eq(realtimeSessions.id, id),
        eq(realtimeSessions.userId, userId)
      ))
      .returning({ id: realtimeSessions.id });
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json({ message: 'Session deleted successfully' });
    
  } catch (error) {
    console.error('[Sessions] Failed to delete session:', error);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// GET /api/sessions/cleanup/old - Auto-cleanup sessions older than 30 days
router.post('/cleanup/old', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // This could be restricted to admin only
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const result = await db.delete(realtimeSessions)
      .where(lte(realtimeSessions.startedAt, thirtyDaysAgo))
      .returning({ id: realtimeSessions.id });
    
    console.log(`[Sessions] Cleaned up ${result.length} old sessions`);
    res.json({ 
      message: `Cleaned up ${result.length} sessions older than 30 days` 
    });
    
  } catch (error) {
    console.error('[Sessions] Failed to cleanup old sessions:', error);
    res.status(500).json({ error: 'Failed to cleanup sessions' });
  }
});

export default router;