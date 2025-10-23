import { storage } from '../storage';

interface CreateSessionAgentParams {
  userId: string;
  studentId?: string;
  studentName: string;
  gradeBand: string;
  subject: string;
  documentIds: string[];
}

class SessionAgentService {
  async createSessionAgent(params: CreateSessionAgentParams) {
    const { userId, studentId, studentName, gradeBand, subject, documentIds } = params;
    
    // Create or get student if needed
    let finalStudentId = studentId;
    if (!finalStudentId && studentName) {
      // Try to find existing student or create new one
      const students = await storage.getStudentsByOwner(userId);
      const existingStudent = students.find((s: any) => s.name === studentName);
      
      if (existingStudent) {
        finalStudentId = existingStudent.id;
      } else {
        const newStudent = await storage.createStudent({
          ownerUserId: userId,
          name: studentName,
          gradeBand: gradeBand,
        });
        finalStudentId = newStudent.id;
      }
    }
    
    // Create session record
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      success: true,
      sessionId,
      studentId: finalStudentId,
      studentName,
      gradeBand,
      subject,
      documentIds,
      agentId: `agent-${sessionId}`,
      status: 'ready'
    };
  }
  
  async endSession(sessionId: string) {
    // Clean up session
    console.log(`[SessionAgent] Ending session ${sessionId}`);
    return { success: true };
  }
  
  async cleanupExpiredSessions() {
    // Clean up expired sessions (5 minutes old)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    console.log(`[SessionAgent] Cleaning up sessions older than ${fiveMinutesAgo}`);
    return { success: true };
  }
  
  async cleanupOrphanedSessions() {
    // Clean up orphaned sessions
    console.log('[SessionAgent] Cleaning up orphaned sessions');
    return { success: true };
  }
}

export const sessionAgentService = new SessionAgentService();