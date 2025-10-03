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
    
    // Handle empty document list gracefully
    if (!documentIds || documentIds.length === 0) {
      console.log('[SessionAgent] No documents to upload, proceeding without documents');
      return docIds;
    }
    
    for (const docId of documentIds) {
      const content = await storage.getDocumentContent(docId);
      if (!content) {
        console.warn(`[SessionAgent] Document ${docId} content not found, skipping`);
        continue; // Skip this document instead of failing
      }
      
      const doc = await storage.getDocument(docId, userId);
      if (!doc) {
        console.warn(`[SessionAgent] Document ${docId} metadata not found, skipping`);
        continue; // Skip this document instead of failing
      }
      
      // Upload document - any failure will throw and trigger rollback
      try {
        // Map file extension to proper MIME type
        const mimeTypeMap: Record<string, string> = {
          'pdf': 'application/pdf',
          'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'txt': 'text/plain',
          'html': 'text/html'
        };
        const mimeType = mimeTypeMap[doc.fileType || ''] || 'application/octet-stream';
        
        const result = await elevenlabs.uploadDocument({
          name: doc.originalName || doc.fileName,
          content,
          mimeType
        });
        docIds.push(result.id);
        console.log(`[SessionAgent] Successfully uploaded document ${docId} to ElevenLabs as ${result.id}`);
      } catch (error) {
        console.error(`[SessionAgent] Failed to upload document ${docId}:`, error);
        // Continue with other documents instead of failing completely
      }
    }
    
    console.log(`[SessionAgent] Uploaded ${docIds.length}/${documentIds.length} documents successfully`);
    return docIds;
  }

  async createSessionAgent(params: CreateSessionAgentParams): Promise<SessionAgentResult> {
    const { userId, studentId, studentName, gradeBand, subject, documentIds } = params;
    
    const baseAgentId = this.getBaseAgentId(gradeBand);
    
    const sessionId = uuidv4();
    const conversationId = uuidv4();
    
    // Track uploaded resources for cleanup on failure
    const uploadedDocIds: string[] = [];
    let createdAgentId: string | null = null;
    
    try {
      // 1. Create pending session record first (transactional anchor)
      await storage.createAgentSession({
        id: sessionId,
        userId,
        studentId: studentId || null,
        agentId: null, // Will be updated after agent creation
        conversationId,
        baseAgentId,
        knowledgeBaseId: null,
        studentName,
        gradeBand,
        subject,
        documentIds: documentIds.length > 0 ? documentIds : null,
        fileIds: null, // Will be updated after upload
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });
      
      // 2. Upload documents to ElevenLabs
      if (documentIds.length > 0) {
        const docIds = await this.uploadDocumentsToElevenLabs(userId, documentIds);
        uploadedDocIds.push(...docIds);
      }
      
      // 3. Create agent
      const agentName = `${studentName} - ${gradeBand} - ${subject}`;
      const agentPrompt = this.buildAgentPrompt(studentName, gradeBand, subject);
      
      // Build personalized first greeting
      let firstMessage = `Hi ${studentName}! I'm your ${gradeBand} ${subject} tutor. `;
      if (uploadedDocIds.length > 0) {
        const docCount = uploadedDocIds.length;
        const docText = docCount === 1 ? 'document' : 'documents';
        firstMessage += `I've reviewed your ${docCount} ${docText} and I'm ready to help you learn. `;
      }
      firstMessage += `What would you like to work on today?`;
      
      const agentResult = await elevenlabs.createAgent({
        name: agentName,
        prompt: agentPrompt,
        firstMessage
      });
      
      createdAgentId = agentResult.agent_id;
      
      // 4. Attach knowledge base if documents were uploaded
      if (uploadedDocIds.length > 0 && createdAgentId) {
        await elevenlabs.updateAgentKnowledgeBase(createdAgentId, uploadedDocIds);
      }
      
      // 5. Update session with agent ID and file IDs (commit transaction)
      if (!createdAgentId) {
        throw new Error('Agent creation failed: no agent ID returned');
      }
      
      await storage.updateAgentSession(sessionId, {
        agentId: createdAgentId,
        fileIds: uploadedDocIds.length > 0 ? uploadedDocIds : null
      });
      
      return { sessionId, agentId: createdAgentId, conversationId };
      
    } catch (error) {
      console.error(`[SessionAgent] Failed to create session ${sessionId}, rolling back:`, error);
      
      // Cleanup: delete uploaded documents
      for (const docId of uploadedDocIds) {
        try {
          await elevenlabs.deleteDocument(docId);
          console.log(`[SessionAgent] Cleaned up document ${docId}`);
        } catch (cleanupError) {
          console.error(`[SessionAgent] Failed to cleanup document ${docId}:`, cleanupError);
        }
      }
      
      // Cleanup: delete agent if created
      if (createdAgentId) {
        try {
          await elevenlabs.deleteAgent(createdAgentId);
          console.log(`[SessionAgent] Cleaned up agent ${createdAgentId}`);
        } catch (cleanupError) {
          console.error(`[SessionAgent] Failed to cleanup agent ${createdAgentId}:`, cleanupError);
        }
      }
      
      // Cleanup: mark session as failed (don't delete, keep for audit)
      try {
        await storage.endAgentSession(sessionId);
      } catch (cleanupError) {
        console.error(`[SessionAgent] Failed to end session ${sessionId}:`, cleanupError);
      }
      
      throw error;
    }
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

  async cleanupOrphanedSessions(): Promise<void> {
    // Clean up sessions that are older than 1 hour with no agent ID (failed creations)
    const cutoffDate = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    const orphanedSessions = await storage.getOrphanedAgentSessions(cutoffDate);
    
    console.log(`[SessionAgent] Found ${orphanedSessions.length} orphaned sessions to clean up`);
    
    for (const session of orphanedSessions) {
      try {
        // Clean up any uploaded documents
        if (session.fileIds && Array.isArray(session.fileIds)) {
          for (const docId of session.fileIds) {
            try {
              await elevenlabs.deleteDocument(docId);
              console.log(`[SessionAgent] Cleaned up orphaned document ${docId}`);
            } catch (error) {
              console.error(`Failed to delete orphaned document ${docId}:`, error);
            }
          }
        }
        
        // Mark session as ended
        await storage.endAgentSession(session.id);
        console.log(`[SessionAgent] Cleaned up orphaned session ${session.id}`);
      } catch (error) {
        console.error(`Failed to cleanup orphaned session ${session.id}:`, error);
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
