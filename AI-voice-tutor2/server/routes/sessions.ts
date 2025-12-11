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
import PDFDocument from 'pdfkit';

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

// GET /api/sessions/:id/export - Export session transcript as downloadable file (txt/json/pdf)
router.get('/:id/export', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { id } = req.params;
    const { format = 'txt' } = req.query; // 'txt', 'json', or 'pdf'
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
    
    if (format === 'pdf') {
      // PDF format with professional styling
      const doc = new PDFDocument({ margin: 50 });
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
      
      doc.pipe(res);
      
      // Header with branding
      doc.fontSize(24).font('Helvetica-Bold').text('JIE Mastery AI', { align: 'center' });
      doc.fontSize(14).font('Helvetica').text('Tutoring Session Transcript', { align: 'center' });
      doc.moveDown();
      
      // Session info
      doc.fontSize(10).font('Helvetica-Bold').text('Session Details:');
      doc.fontSize(9).font('Helvetica');
      doc.text(`Student: ${session.studentName || 'Unknown'}`);
      doc.text(`Subject: ${session.subject || 'General'}`);
      doc.text(`Age Group: ${session.ageGroup || 'Not specified'}`);
      doc.text(`Language: ${session.language || 'English'}`);
      doc.text(`Date: ${session.startedAt ? new Date(session.startedAt).toLocaleString() : 'Unknown'}`);
      doc.text(`Duration: ${session.minutesUsed || 0} minutes`);
      doc.text(`Total Messages: ${session.totalMessages || 0}`);
      doc.moveDown();
      
      // Summary section
      if (session.summary) {
        doc.fontSize(10).font('Helvetica-Bold').text('Summary:');
        doc.fontSize(9).font('Helvetica').text(session.summary, { align: 'left' });
        doc.moveDown();
      }
      
      // Divider line
      doc.strokeColor('#cccccc').lineWidth(1)
         .moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown();
      
      // Transcript content
      doc.fontSize(10).font('Helvetica-Bold').text('Conversation:');
      doc.moveDown(0.5);
      
      for (const entry of transcript) {
        const isTutor = entry.speaker === 'Tutor';
        const roleColor = isTutor ? '#2563eb' : '#16a34a';
        
        // Check for page break
        if (doc.y > 700) {
          doc.addPage();
        }
        
        // Role label in color
        doc.fontSize(9).font('Helvetica-Bold').fillColor(roleColor).text(`${entry.speaker}:`, { indent: 0 });
        
        // Message content
        doc.fontSize(9).font('Helvetica').fillColor('#333333').text(entry.text || '', {
          indent: 20,
          align: 'left'
        });
        doc.moveDown(0.3);
      }
      
      // Footer
      doc.moveDown(1);
      doc.fontSize(7).fillColor('#999999').text(
        `Generated by JIE Mastery AI Tutor | ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`,
        { align: 'center' }
      );
      
      doc.end();
      return;
    }
    
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