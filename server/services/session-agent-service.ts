import { v4 as uuidv4 } from 'uuid';
import { storage } from '../storage';
import { ElevenLabsClient } from './elevenlabs-client';

const elevenlabs = new ElevenLabsClient();

export interface CreateSessionAgentParams {
  userId: string;
  studentId?: string;
  studentName: string;
  gradeBand: string;
  subject: string;
  documentIds: string[];
}

export interface SessionAgentResult {
  sessionId: string;
  agentId: string;
  conversationId: string;
}

const BASE_AGENT_IDS: Record<string, string> = {
  'K-2': process.env.ELEVENLABS_AGENT_K2 || '',
  '3-5': process.env.ELEVENLABS_AGENT_35 || '',
  '6-8': process.env.ELEVENLABS_AGENT_68 || '',
  '9-12': process.env.ELEVENLABS_AGENT_912 || '',
  'College/Adult': process.env.ELEVENLABS_AGENT_COLLEGE || ''
};

export class SessionAgentService {
  private getBaseAgentId(gradeBand: string): string {
    const agentId = BASE_AGENT_IDS[gradeBand];
    if (!agentId) {
      throw new Error(`No base agent configured for grade band: ${gradeBand}`);
    }
    return agentId;
  }

  private async uploadDocumentsToElevenLabs(userId: string, documentIds: string[]): Promise<string[]> {
    const docIds: string[] = [];
    
    for (const docId of documentIds) {
      const content = await storage.getDocumentContent(docId);
      if (!content) {
        console.warn(`Document ${docId} not found, skipping...`);
        continue;
      }
      
      const doc = await storage.getDocument(docId, userId);
      if (!doc) continue;
      
      try {
        const result = await elevenlabs.uploadDocument({
          name: doc.originalName || doc.fileName,
          content,
          mimeType: doc.fileType || 'application/octet-stream'
        });
        docIds.push(result.id);
      } catch (error) {
        console.error(`Failed to upload document ${docId}:`, error);
      }
    }
    
    return docIds;
  }

  async createSessionAgent(params: CreateSessionAgentParams): Promise<SessionAgentResult> {
    const { userId, studentId, studentName, gradeBand, subject, documentIds } = params;
    
    const baseAgentId = this.getBaseAgentId(gradeBand);
    
    const elevenLabsDocIds = await this.uploadDocumentsToElevenLabs(userId, documentIds);
    
    const sessionId = uuidv4();
    const conversationId = uuidv4();
    
    const agentName = `${studentName} - ${gradeBand} - ${subject}`;
    const agentPrompt = this.buildAgentPrompt(studentName, gradeBand, subject);
    const firstMessage = `Hi ${studentName}! I'm your ${gradeBand} ${subject} tutor. I've reviewed your materials and I'm ready to help you learn. What would you like to work on today?`;
    
    const agentResult = await elevenlabs.createAgent({
      name: agentName,
      prompt: agentPrompt,
      firstMessage
    });
    
    const agentId = agentResult.agent_id;
    
    if (elevenLabsDocIds.length > 0) {
      await elevenlabs.updateAgentKnowledgeBase(agentId, elevenLabsDocIds);
    }
    
    await storage.createAgentSession({
      id: sessionId,
      userId,
      studentId: studentId || null,
      agentId,
      conversationId,
      baseAgentId,
      knowledgeBaseId: null,
      studentName,
      gradeBand,
      subject,
      documentIds: documentIds.length > 0 ? documentIds : null,
      fileIds: elevenLabsDocIds.length > 0 ? elevenLabsDocIds : null,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
    
    return { sessionId, agentId, conversationId };
  }

  async endSession(sessionId: string): Promise<void> {
    const session = await storage.getAgentSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    
    try {
      if (session.agentId) {
        await elevenlabs.deleteAgent(session.agentId);
      }
      
      if (session.fileIds && Array.isArray(session.fileIds)) {
        for (const docId of session.fileIds) {
          try {
            await elevenlabs.deleteDocument(docId);
          } catch (error) {
            console.error(`Failed to delete document ${docId}:`, error);
          }
        }
      }
    } catch (error) {
      console.error(`Error cleaning up session ${sessionId}:`, error);
    }
    
    await storage.endAgentSession(sessionId);
  }

  async cleanupExpiredSessions(): Promise<void> {
    const expiredSessions = await storage.getExpiredAgentSessions(24);
    
    for (const session of expiredSessions) {
      try {
        await this.endSession(session.id);
      } catch (error) {
        console.error(`Failed to cleanup session ${session.id}:`, error);
      }
    }
  }

  private buildAgentPrompt(studentName: string, gradeBand: string, subject: string): string {
    return `You are a ${gradeBand} AI tutor for ${studentName}, specializing in ${subject}.

Your role:
- Address the student by name (${studentName})
- Use the uploaded documents in your knowledge base to provide contextual help
- When referencing materials, mention specific pages, sections, or content from their documents
- Adapt your teaching style to ${gradeBand} level
- Use the Socratic method: ask guiding questions rather than giving direct answers
- Encourage critical thinking and problem-solving

Teaching approach:
- Reference their uploaded materials naturally in conversation
- Help them understand concepts from their specific coursework
- Point to relevant sections in their documents when applicable
- Build on what they're currently learning
- Celebrate progress and maintain encouragement

Remember: The knowledge base contains ${studentName}'s actual learning materials. Use them to provide personalized, contextual tutoring.`;
  }
}

export const sessionAgentService = new SessionAgentService();
