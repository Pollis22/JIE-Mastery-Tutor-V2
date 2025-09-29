import { Router } from 'express';
import { z } from 'zod';
import { storage } from '../storage';
import { DocumentProcessor } from '../services/document-processor';

const router = Router();
const processor = new DocumentProcessor();

// Request schemas
const sessionStartSchema = z.object({
  userId: z.string(),
  subject: z.string().optional(),
  grade: z.string().optional(),
  includeDocIds: z.array(z.string()).default([]),
  sessionId: z.string().optional()
});

const queryContextSchema = z.object({
  userId: z.string(),
  query: z.string(),
  documentIds: z.array(z.string()).optional(),
  maxResults: z.number().min(1).max(10).default(3)
});

/**
 * Prepare context for session start
 */
router.post('/session-start', async (req, res) => {
  try {
    const request = sessionStartSchema.parse(req.body);
    
    // Get user documents for context
    let documentsToUse = request.includeDocIds;
    
    // If no specific documents selected, get "keep for future sessions" docs
    if (documentsToUse.length === 0) {
      const userDocs = await storage.getUserDocuments(request.userId);
      documentsToUse = userDocs
        .filter(doc => doc.keepForFutureSessions && doc.processingStatus === 'completed')
        .map(doc => doc.id);
    }

    if (documentsToUse.length === 0) {
      return res.json({
        systemPrompt: null,
        firstMessage: null,
        summary: 'No documents available for context',
        hasContext: false
      });
    }

    // Get document context
    const contextData = await storage.getDocumentContext(request.userId, documentsToUse);
    
    if (contextData.documents.length === 0) {
      return res.json({
        systemPrompt: null,
        firstMessage: null,
        summary: 'Selected documents are not ready or not found',
        hasContext: false
      });
    }

    // Build enhanced context
    const documentSummaries = contextData.documents.map(doc => {
      const docChunks = contextData.chunks.filter(chunk => chunk.documentId === doc.id);
      return {
        title: doc.title,
        type: doc.fileType,
        subject: doc.subject,
        grade: doc.grade,
        chunkCount: docChunks.length,
        description: doc.description
      };
    });

    // Create comprehensive system prompt
    const systemPrompt = buildSystemPrompt(documentSummaries, request.subject, request.grade);
    
    // Create engaging first message
    const firstMessage = buildFirstMessage(documentSummaries, request.subject);

    res.json({
      systemPrompt,
      firstMessage,
      summary: `Context prepared with ${contextData.documents.length} document(s) and ${contextData.chunks.length} content sections`,
      hasContext: true,
      documentCount: contextData.documents.length,
      chunkCount: contextData.chunks.length,
      documents: documentSummaries
    });

  } catch (error) {
    console.error('Session context preparation error:', error);
    res.status(500).json({ error: 'Failed to prepare session context' });
  }
});

/**
 * Query document context during conversation
 */
router.post('/query', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { query, documentIds, maxResults } = queryContextSchema.parse(req.body);
    
    // Generate embedding for the query
    const queryEmbedding = await processor.generateEmbedding(query);
    
    // Search for relevant content
    const searchResults = await storage.searchSimilarContent(
      userId, 
      queryEmbedding, 
      maxResults, 
      0.7 // similarity threshold
    );

    // Filter by specific documents if requested
    const filteredResults = documentIds 
      ? searchResults.filter(result => documentIds.includes(result.document.id))
      : searchResults;

    // Format response
    const contextChunks = filteredResults.map(result => ({
      content: result.chunk.content,
      similarity: Math.round(result.similarity * 100) / 100,
      source: {
        title: result.document.title,
        type: result.document.fileType,
        page: result.chunk.metadata?.page || null
      },
      relevance: result.similarity > 0.85 ? 'high' : result.similarity > 0.7 ? 'medium' : 'low'
    }));

    res.json({
      query,
      results: contextChunks,
      totalFound: filteredResults.length,
      hasRelevantContent: contextChunks.some(chunk => chunk.relevance !== 'low')
    });

  } catch (error) {
    console.error('Context query error:', error);
    res.status(500).json({ error: 'Failed to query document context' });
  }
});

/**
 * Build system prompt with document context
 */
function buildSystemPrompt(documents: any[], subject?: string, grade?: string): string {
  const docList = documents.map(doc => 
    `- "${doc.title}" (${doc.type.toUpperCase()}${doc.subject ? `, ${doc.subject}` : ''})`
  ).join('\n');

  const gradeContext = grade ? ` for ${grade} level` : '';
  const subjectContext = subject ? ` focusing on ${subject}` : '';

  return `You are an AI tutor helping a student${gradeContext}${subjectContext}. The student has provided specific study materials for this session:

${docList}

IMPORTANT GUIDELINES:
1. **Reference their materials**: When answering questions, prioritize information from their uploaded documents
2. **Be specific**: Mention which document you're referencing (e.g., "According to your uploaded assignment...")  
3. **Stay grounded**: If asked about content not in their materials, acknowledge this and offer to help with what's available
4. **Adapt your level**: Match your explanations to their grade level and the complexity of their materials
5. **Encourage engagement**: Ask follow-up questions about their assignments and help them think through problems

You have access to ${documents.reduce((sum, doc) => sum + doc.chunkCount, 0)} sections of content from their materials. Use this context to provide personalized, relevant tutoring.`;
}

/**
 * Build engaging first message
 */
function buildFirstMessage(documents: any[], subject?: string): string {
  if (documents.length === 1) {
    const doc = documents[0];
    const subjectHint = doc.subject || subject;
    return `Hi! I can see you've brought "${doc.title}" to work on today${subjectHint ? ` for ${subjectHint}` : ''}. I've reviewed the material and I'm ready to help you understand it better. What specific part would you like to start with, or do you have any questions about the content?`;
  } else {
    const titles = documents.slice(0, 2).map(d => `"${d.title}"`).join(' and ');
    const remaining = documents.length > 2 ? ` and ${documents.length - 2} other document${documents.length > 3 ? 's' : ''}` : '';
    return `Hi! I can see you've brought several materials to work with today: ${titles}${remaining}. I've reviewed all your documents and I'm ready to help you tackle any questions or problems you have. What would you like to focus on first?`;
  }
}

export default router;