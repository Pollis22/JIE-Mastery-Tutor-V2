/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 * 
 * This source code is confidential and proprietary.
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */


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
      transcript: realtimeSessions.transcript,
    })
    .from(realtimeSessions)
    .where(and(
      eq(realtimeSessions.userId, userId),
      eq(realtimeSessions.status, 'ended'),
      gte(realtimeSessions.startedAt, thirtyDaysAgo)
    ))
    .orderBy(desc(realtimeSessions.startedAt))
    .limit(10);
    
    // Transform transcripts to consistent format for frontend
    const transformedSessions = sessions.map(session => ({
      ...session,
      transcript: session.transcript && Array.isArray(session.transcript)
        ? session.transcript.map((entry: any) => ({
            speaker: entry.role === 'assistant' ? 'tutor' : (entry.speaker || 'student'),
            text: entry.content || entry.text || '',
            timestamp: entry.timestamp,
            messageId: entry.messageId || crypto.randomUUID()
          }))
        : []
    }));
    
    console.log(`[Sessions] Found ${sessions.length} recent sessions for user ${userId}`);
    res.json({ sessions: transformedSessions });
    
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
      transcript: realtimeSessions.transcript,
    })
    .from(realtimeSessions)
    .where(and(...conditions))
    .orderBy(desc(realtimeSessions.startedAt))
    .limit(limitNum)
    .offset(offset);
    
    // Transform transcripts to consistent format for frontend
    const transformedSessions = sessions.map(session => ({
      ...session,
      transcript: session.transcript && Array.isArray(session.transcript)
        ? session.transcript.map((entry: any) => ({
            speaker: entry.role === 'assistant' ? 'tutor' : (entry.speaker || 'student'),
            text: entry.content || entry.text || '',
            timestamp: entry.timestamp,
            messageId: entry.messageId || crypto.randomUUID()
          }))
        : []
    }));
    
    res.json({
      sessions: transformedSessions,
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
    
    // Transform transcript to consistent format for frontend (respects existing speaker field)
    const transformedSession = {
      ...session,
      transcript: session.transcript && Array.isArray(session.transcript)
        ? session.transcript.map((entry: any) => ({
            speaker: entry.role === 'assistant' ? 'tutor' : (entry.speaker || 'student'),
            text: entry.content || entry.text || '',
            timestamp: entry.timestamp,
            messageId: entry.messageId || crypto.randomUUID()
          }))
        : []
    };
    
    res.json({ session: transformedSession });
    
  } catch (error) {
    console.error('[Sessions] Failed to fetch session:', error);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// GET /api/sessions/:id/export - Export session transcript as downloadable file
router.get('/:id/export', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { id } = req.params;
    const { format = 'txt' } = req.query; // 'txt' or 'json'
    const userId = req.user!.id;
    
    // Get session and verify ownership
    const [session] = await db.select()
      .from(realtimeSessions)
      .where(and(
        eq(realtimeSessions.id, id),
        eq(realtimeSessions.userId, userId)
      ));
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Transform transcript to consistent format
    const transcript = session.transcript && Array.isArray(session.transcript)
      ? session.transcript.map((entry: any) => ({
          speaker: entry.role === 'assistant' ? 'Tutor' : (entry.speaker === 'tutor' ? 'Tutor' : 'Student'),
          text: entry.content || entry.text || '',
          timestamp: entry.timestamp
        }))
      : [];
    
    // Format session date for filename
    const sessionDate = session.startedAt 
      ? new Date(session.startedAt).toISOString().split('T')[0] 
      : 'unknown-date';
    const studentName = session.studentName?.replace(/[^a-zA-Z0-9]/g, '-') || 'session';
    const filename = `transcript-${studentName}-${sessionDate}`;
    
    if (format === 'json') {
      // JSON format with full metadata
      const exportData = {
        sessionId: session.id,
        studentName: session.studentName,
        subject: session.subject,
        ageGroup: session.ageGroup,
        language: session.language,
        date: session.startedAt,
        endedAt: session.endedAt,
        durationMinutes: session.minutesUsed,
        totalMessages: session.totalMessages,
        summary: session.summary,
        transcript: transcript
      };
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
      return res.json(exportData);
    }
    
    // Plain text format (default) - more readable for parents
    const header = [
      `=== Tutoring Session Transcript ===`,
      ``,
      `Student: ${session.studentName || 'Unknown'}`,
      `Subject: ${session.subject || 'General'}`,
      `Age Group: ${session.ageGroup || 'Not specified'}`,
      `Language: ${session.language || 'English'}`,
      `Date: ${session.startedAt ? new Date(session.startedAt).toLocaleString() : 'Unknown'}`,
      `Duration: ${session.minutesUsed || 0} minutes`,
      ``,
      `--- Summary ---`,
      session.summary || 'No summary available',
      ``,
      `--- Conversation ---`,
      ``
    ].join('\n');
    
    const textTranscript = transcript
      .map((t: any) => `[${t.speaker}]: ${t.text}`)
      .join('\n\n');
    
    const fullText = header + textTranscript;
    
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.txt"`);
    return res.send(fullText);
    
  } catch (error) {
    console.error('[Sessions] Export error:', error);
    res.status(500).json({ error: 'Failed to export transcript' });
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