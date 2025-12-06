/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 * 
 * This source code is confidential and proprietary.
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */


import { Router } from 'express';
import { storage } from '../storage';
import { insertStudentSchema, insertStudentDocPinSchema, insertTutorSessionSchema } from '@shared/schema';
import { z } from 'zod';

const router = Router();

// Middleware to ensure authentication
const requireAuth = (req: any, res: any, next: any) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  next();
};

// All routes require authentication
router.use(requireAuth);

// GET /api/students - List all students for the authenticated user
router.get('/', async (req, res) => {
  try {
    const user = req.user as any;
    const students = await storage.getStudentsByOwner(user.id);
    
    // Map backend fields to frontend field names
    const mappedStudents = students.map((student: any) => ({
      ...student,
      grade: student.gradeBand,
      learningPace: student.pace,
      encouragementLevel: student.encouragement,
    }));
    
    res.json(mappedStudents);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching students: ' + error.message });
  }
});

// POST /api/students - Create a new student
router.post('/', async (req, res) => {
  try {
    const user = req.user as any;
    
    // Map frontend field names to backend schema field names
    const mappedData = {
      name: req.body.name,
      gradeBand: req.body.grade || req.body.gradeBand || 'k-2', // Map 'grade' to 'gradeBand' with a default
      pace: (req.body.learningPace || req.body.pace || 'normal') as 'slow' | 'normal' | 'fast',
      encouragement: (req.body.encouragementLevel || req.body.encouragement || 'medium') as 'low' | 'medium' | 'high',
      goals: req.body.goals || [],
      avatarUrl: req.body.avatarUrl || null,
      avatarType: (req.body.avatarType || 'default') as 'default' | 'upload' | 'preset',
      age: req.body.age ? parseInt(req.body.age) : null,
      ownerUserId: user.id,
    };
    
    const data = insertStudentSchema.parse(mappedData);
    
    const student = await storage.createStudent(data);
    
    // Map backend fields back to frontend field names
    const responseStudent = {
      ...student,
      grade: student.gradeBand,
      learningPace: student.pace,
      encouragementLevel: student.encouragement,
    };
    
    console.log(`[Students] ✅ Created student profile: ${student.name} for user ${user.id}`);
    
    res.status(201).json(responseStudent);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    res.status(500).json({ message: 'Error creating student: ' + error.message });
  }
});

// GET /api/students/:studentId - Get a specific student
router.get('/:studentId', async (req, res) => {
  try {
    const user = req.user as any;
    const { studentId } = req.params;
    
    const student = await storage.getStudent(studentId, user.id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    
    // Map backend fields to frontend field names
    const mappedStudent = {
      ...student,
      grade: student.gradeBand,
      learningPace: student.pace,
      encouragementLevel: student.encouragement,
    };
    
    res.json(mappedStudent);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching student: ' + error.message });
  }
});

// PUT /api/students/:studentId - Update a student
router.put('/:studentId', async (req, res) => {
  try {
    const user = req.user as any;
    const { studentId } = req.params;
    
    // Map frontend field names to backend schema field names with proper typing
    const mappedData: Partial<{
      name: string;
      gradeBand: string;
      pace: 'slow' | 'normal' | 'fast';
      encouragement: 'low' | 'medium' | 'high';
      goals: string[];
      avatarUrl: string | null;
      avatarType: 'default' | 'upload' | 'preset';
      age: number | null;
    }> = {};
    
    if (req.body.name !== undefined) mappedData.name = req.body.name;
    if (req.body.grade !== undefined) mappedData.gradeBand = req.body.grade;
    if (req.body.gradeBand !== undefined) mappedData.gradeBand = req.body.gradeBand;
    if (req.body.learningPace !== undefined) mappedData.pace = req.body.learningPace as 'slow' | 'normal' | 'fast';
    if (req.body.pace !== undefined) mappedData.pace = req.body.pace as 'slow' | 'normal' | 'fast';
    if (req.body.encouragementLevel !== undefined) mappedData.encouragement = req.body.encouragementLevel as 'low' | 'medium' | 'high';
    if (req.body.encouragement !== undefined) mappedData.encouragement = req.body.encouragement as 'low' | 'medium' | 'high';
    if (req.body.goals !== undefined) mappedData.goals = req.body.goals;
    if (req.body.avatarUrl !== undefined) mappedData.avatarUrl = req.body.avatarUrl;
    if (req.body.avatarType !== undefined) mappedData.avatarType = req.body.avatarType as 'default' | 'upload' | 'preset';
    if (req.body.age !== undefined) mappedData.age = req.body.age ? parseInt(req.body.age) : null;
    
    const student = await storage.updateStudent(studentId, user.id, mappedData);
    
    // Map backend fields back to frontend field names
    const responseStudent = {
      ...student,
      grade: student.gradeBand,
      learningPace: student.pace,
      encouragementLevel: student.encouragement,
    };
    
    console.log(`[Students] ✅ Updated student profile: ${studentId}`);
    
    res.json(responseStudent);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    if (error.message.includes('not found') || error.message.includes('unauthorized')) {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error updating student: ' + error.message });
  }
});

// DELETE /api/students/:studentId - Delete a student
router.delete('/:studentId', async (req, res) => {
  try {
    const user = req.user as any;
    const { studentId } = req.params;
    
    await storage.deleteStudent(studentId, user.id);
    res.status(204).send();
  } catch (error: any) {
    res.status(500).json({ message: 'Error deleting student: ' + error.message });
  }
});

// POST /api/students/:studentId/pins - Pin a document to a student
router.post('/:studentId/pins', async (req, res) => {
  try {
    const user = req.user as any;
    const { studentId } = req.params;
    
    const data = insertStudentDocPinSchema.parse({
      studentId,
      docId: req.body.docId,
    });
    
    const pin = await storage.pinDocument(data.studentId, data.docId, user.id);
    res.status(201).json(pin);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    if (error.message.includes('not found') || error.message.includes('unauthorized')) {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error pinning document: ' + error.message });
  }
});

// DELETE /api/students/:studentId/pins/:pinId - Unpin a document
router.delete('/:studentId/pins/:pinId', async (req, res) => {
  try {
    const user = req.user as any;
    const { pinId } = req.params;
    
    await storage.unpinDocument(pinId, user.id);
    res.status(204).send();
  } catch (error: any) {
    res.status(500).json({ message: 'Error unpinning document: ' + error.message });
  }
});

// GET /api/students/:studentId/pins - Get pinned documents for a student
router.get('/:studentId/pins', async (req, res) => {
  try {
    const user = req.user as any;
    const { studentId } = req.params;
    
    const pinnedDocs = await storage.getStudentPinnedDocs(studentId, user.id);
    res.json(pinnedDocs);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching pinned documents: ' + error.message });
  }
});

// GET /api/students/:studentId/sessions - Get tutor sessions for a student
router.get('/:studentId/sessions', async (req, res) => {
  try {
    const user = req.user as any;
    const { studentId } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    
    const sessions = await storage.getStudentSessions(studentId, user.id, limit);
    res.json(sessions);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching sessions: ' + error.message });
  }
});

// POST /api/students/:studentId/sessions - Create a new tutor session
router.post('/:studentId/sessions', async (req, res) => {
  try {
    const user = req.user as any;
    const { studentId } = req.params;
    
    const sessionSchema = z.object({
      subject: z.string().optional(),
      contextDocuments: z.any().optional(),
    });
    
    const data = sessionSchema.parse(req.body);
    
    const session = await storage.createTutorSession(
      {
        studentId,
        ...data,
      },
      user.id
    );
    
    res.status(201).json(session);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    if (error.message.includes('not found') || error.message.includes('unauthorized')) {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error creating session: ' + error.message });
  }
});

// PUT /api/sessions/:sessionId - Update a tutor session
router.put('/sessions/:sessionId', async (req, res) => {
  try {
    const user = req.user as any;
    const { sessionId } = req.params;
    
    const updateSchema = z.object({
      endedAt: z.date().or(z.string()).transform(val => typeof val === 'string' ? new Date(val) : val).optional(),
      minutesUsed: z.number().optional(),
      summary: z.string().optional(),
      misconceptions: z.string().optional(),
      nextSteps: z.string().optional(),
      subject: z.string().optional(),
    });
    
    const parsed = updateSchema.parse(req.body);
    
    // Build updates object with proper types
    const updates: Partial<{
      endedAt: Date;
      minutesUsed: number;
      summary: string;
      misconceptions: string;
      nextSteps: string;
      subject: string;
    }> = {};
    
    if (parsed.endedAt) updates.endedAt = parsed.endedAt;
    if (parsed.minutesUsed !== undefined) updates.minutesUsed = parsed.minutesUsed;
    if (parsed.summary) updates.summary = parsed.summary;
    if (parsed.misconceptions) updates.misconceptions = parsed.misconceptions;
    if (parsed.nextSteps) updates.nextSteps = parsed.nextSteps;
    if (parsed.subject) updates.subject = parsed.subject;
    
    const session = await storage.updateTutorSession(sessionId, user.id, updates);
    res.json(session);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    if (error.message.includes('not found') || error.message.includes('unauthorized')) {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error updating session: ' + error.message });
  }
});

// POST /api/students/:studentId/session-started - Update last session timestamp
router.post('/:studentId/session-started', async (req, res) => {
  try {
    const user = req.user as any;
    const { studentId } = req.params;
    
    // Verify student belongs to user and update lastSessionAt
    const student = await storage.updateStudent(studentId, user.id, {
      lastSessionAt: new Date(),
    });
    
    console.log(`[Students] ✅ Updated session timestamp for student: ${studentId}`);
    
    res.json({ success: true, lastSessionAt: student.lastSessionAt });
  } catch (error: any) {
    if (error.message.includes('not found') || error.message.includes('unauthorized')) {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error updating session timestamp: ' + error.message });
  }
});

// POST /api/students/:studentId/export - Export student memory
router.post('/:studentId/export', async (req, res) => {
  try {
    const user = req.user as any;
    const { studentId } = req.params;
    
    const memory = await storage.exportStudentMemory(studentId, user.id);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="student-${studentId}-memory.json"`);
    res.json(memory);
  } catch (error: any) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error exporting memory: ' + error.message });
  }
});

// DELETE /api/students/:studentId/memory - Delete student memory (sessions only or full profile)
router.delete('/:studentId/memory', async (req, res) => {
  try {
    const user = req.user as any;
    const { studentId } = req.params;
    const deleteProfile = req.query.deleteProfile === 'true';
    
    await storage.deleteStudentMemory(studentId, user.id, deleteProfile);
    res.status(204).send();
  } catch (error: any) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error deleting memory: ' + error.message });
  }
});

export default router;
