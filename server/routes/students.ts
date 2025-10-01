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
    res.json(students);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching students: ' + error.message });
  }
});

// POST /api/students - Create a new student
router.post('/', async (req, res) => {
  try {
    const user = req.user as any;
    const data = insertStudentSchema.parse({
      ...req.body,
      ownerUserId: user.id,
    });
    
    const student = await storage.createStudent(data);
    res.status(201).json(student);
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
    
    res.json(student);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching student: ' + error.message });
  }
});

// PUT /api/students/:studentId - Update a student
router.put('/:studentId', async (req, res) => {
  try {
    const user = req.user as any;
    const { studentId } = req.params;
    
    const updateSchema = insertStudentSchema.partial().omit({ ownerUserId: true });
    const updates = updateSchema.parse(req.body);
    
    const student = await storage.updateStudent(studentId, user.id, updates);
    res.json(student);
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
      endedAt: z.date().or(z.string()).optional(),
      minutesUsed: z.number().optional(),
      summary: z.string().optional(),
      misconceptions: z.string().optional(),
      nextSteps: z.string().optional(),
      subject: z.string().optional(),
    });
    
    const updates = updateSchema.parse(req.body);
    
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
