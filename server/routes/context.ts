import { Router } from 'express';
import { z } from 'zod';
import { storage } from '../storage';
import { DocumentProcessor } from '../services/document-processor';

const router = Router();
const processor = new DocumentProcessor();

// Request schemas
const sessionStartSchema = z.object({
  subject: z.string().optional(),
  grade: z.string().optional(),
  includeDocIds: z.array(z.string()).default([]),
  sessionId: z.string().optional(),
  studentId: z.string().optional() // For student memory integration
});

const queryContextSchema = z.object({
  query: z.string(),
  documentIds: z.array(z.string()).optional(),
  maxResults: z.number().min(1).max(10).default(3)
});

/**
 * Prepare context for session start
 */
router.post('/session-start', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  try {
    const request = sessionStartSchema.parse(req.body);
    const userId = (req.user as any).id;
    
    // Get student profile if studentId provided
    let student = null;
    let lastSession = null;
    let pinnedDocs: any[] = [];
    
    if (request.studentId) {
      student = await storage.getStudent(request.studentId, userId);
      if (student) {
        lastSession = await storage.getLastStudentSession(request.studentId, userId, 30);
        const pinnedData = await storage.getStudentPinnedDocs(request.studentId, userId);
        pinnedDocs = pinnedData.map(pd => pd.document);
      }
    }
    
    // Get user documents for context
    let documentsToUse = request.includeDocIds;
    
    // If student has pinned docs, use those
    if (documentsToUse.length === 0 && pinnedDocs.length > 0) {
      documentsToUse = pinnedDocs
        .filter(doc => doc.processingStatus === 'ready')
        .map(doc => doc.id);
    }
    
    // If no specific documents selected, get "keep for future sessions" docs
    if (documentsToUse.length === 0) {
      const userDocs = await storage.getUserDocuments(userId);
      documentsToUse = userDocs
        .filter(doc => doc.keepForFutureSessions && doc.processingStatus === 'ready')
        .map(doc => doc.id);
    }

    if (documentsToUse.length === 0 && !student) {
      return res.json({
        systemPrompt: null,
        firstMessage: null,
        summary: 'No documents or student profile available for context',
        hasContext: false
      });
    }

    // Get document context
    const contextData = documentsToUse.length > 0 
      ? await storage.getDocumentContext(userId, documentsToUse)
      : { documents: [], chunks: [] };
    
    // Only return early if no documents AND no student
    if (contextData.documents.length === 0 && !student) {
      return res.json({
        systemPrompt: null,
        firstMessage: null,
        summary: 'Selected documents are not ready or not found',
        hasContext: false
      });
    }

    // Build enhanced context with actual content
    const documentsWithContent = contextData.documents.map(doc => {
      const docChunks = contextData.chunks.filter(chunk => chunk.documentId === doc.id);
      return {
        title: doc.title,
        type: doc.fileType,
        subject: doc.subject,
        grade: doc.grade,
        chunkCount: docChunks.length,
        description: doc.description,
        chunks: docChunks.map(chunk => chunk.content)
      };
    });

    // Create comprehensive system prompt with student memory and document content
    const systemPrompt = buildSystemPrompt(
      documentsWithContent, 
      request.subject, 
      request.grade,
      student,
      lastSession
    );
    
    // Create engaging first message with student personalization
    const firstMessage = buildFirstMessage(
      documentsWithContent, 
      request.subject,
      student,
      lastSession
    );

    res.json({
      systemPrompt,
      firstMessage,
      summary: student 
        ? `Context prepared for ${student.name} with ${contextData.documents.length} document(s)${lastSession ? ' and previous session memory' : ''}`
        : `Context prepared with ${contextData.documents.length} document(s) and ${contextData.chunks.length} content sections`,
      hasContext: true,
      documentCount: contextData.documents.length,
      chunkCount: contextData.chunks.length,
      documents: documentsWithContent.map(d => ({ title: d.title, type: d.type, subject: d.subject, grade: d.grade, chunkCount: d.chunkCount })),
      student: student ? {
        name: student.name,
        gradeBand: student.gradeBand,
        pace: student.pace,
        encouragement: student.encouragement,
        goals: student.goals
      } : null
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
        page: (result.chunk.metadata as any)?.page || null
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
 * Build system prompt with document context and student memory
 */
function buildSystemPrompt(
  documents: any[], 
  subject?: string, 
  grade?: string,
  student?: any,
  lastSession?: any
): string {
  let prompt = '';
  
  // Student profile context
  if (student) {
    const paceMap: Record<string, string> = {
      slow: 'a slower, more deliberate',
      normal: 'a balanced',
      fast: 'a quicker'
    };
    const encouragementMap: Record<string, string> = {
      low: 'minimal',
      medium: 'moderate',
      high: 'frequent'
    };
    
    prompt += `You are an AI tutor helping ${student.name}, a ${student.gradeBand} student. `;
    prompt += `Use ${paceMap[student.pace] || 'a balanced'} pace and provide ${encouragementMap[student.encouragement] || 'moderate'} encouragement.\n\n`;
    
    if (student.goals && student.goals.length > 0) {
      prompt += `Student's learning goals: ${student.goals.join(', ')}\n\n`;
    }
  } else {
    const gradeContext = grade ? ` for ${grade} level` : '';
    const subjectContext = subject ? ` focusing on ${subject}` : '';
    prompt += `You are an AI tutor helping a student${gradeContext}${subjectContext}.\n\n`;
  }
  
  // Last session context
  if (lastSession && lastSession.summary) {
    prompt += `PREVIOUS SESSION CONTEXT:\n`;
    if (lastSession.summary) prompt += `- What we covered: ${lastSession.summary}\n`;
    if (lastSession.misconceptions) prompt += `- Areas that needed work: ${lastSession.misconceptions}\n`;
    if (lastSession.nextSteps) prompt += `- Recommended next steps: ${lastSession.nextSteps}\n`;
    prompt += `\nBuild on this previous session naturally, but don't constantly reference it unless relevant.\n\n`;
  }
  
  // Document context with actual content
  if (documents.length > 0) {
    prompt += `STUDY MATERIALS PROVIDED BY STUDENT:\n\n`;
    
    documents.forEach((doc, index) => {
      prompt += `[Document ${index + 1}: ${doc.title}]\n`;
      if (doc.subject) prompt += `Subject: ${doc.subject}\n`;
      if (doc.grade) prompt += `Grade Level: ${doc.grade}\n`;
      prompt += `Type: ${doc.type.toUpperCase()}\n\n`;
      
      if (doc.chunks && doc.chunks.length > 0) {
        // Include actual content, limiting to first 2000 chars per doc to avoid token limits
        const contentPreview = doc.chunks.join('\n\n').slice(0, 2000);
        prompt += `Content:\n${contentPreview}${contentPreview.length >= 2000 ? '...[content continues]' : ''}\n\n`;
      }
      
      prompt += `---\n\n`;
    });
    
    prompt += `IMPORTANT TUTORING GUIDELINES:\n`;
    prompt += `1. Use ONLY the content from these study materials when answering content-specific questions\n`;
    prompt += `2. Reference which document you're using (e.g., "According to Document 1: ${documents[0].title}...")\n`;
    prompt += `3. If asked about content not in the materials, say "I don't see that in your uploaded materials, but I can help you with..."\n`;
    prompt += `4. Help the student understand and apply the concepts from their materials\n`;
    prompt += `5. Ask follow-up questions to check understanding\n\n`;
  }
  
  return prompt;
}

/**
 * Build engaging first message with student personalization
 */
function buildFirstMessage(
  documents: any[], 
  subject?: string,
  student?: any,
  lastSession?: any
): string {
  const greeting = student ? `Hi ${student.name}!` : 'Hi!';
  
  // Reference last session if available
  if (lastSession && lastSession.nextSteps) {
    return `${greeting} Welcome back! Last time we worked on ${lastSession.subject || 'your studies'}. ${lastSession.nextSteps} ${documents.length > 0 ? `I can see you've brought materials today - ready to dive in?` : 'Ready to continue?'}`;
  }
  
  // Document-based greeting
  if (documents.length === 1) {
    const doc = documents[0];
    const subjectHint = doc.subject || subject;
    return `${greeting} I can see you've brought "${doc.title}" to work on today${subjectHint ? ` for ${subjectHint}` : ''}. I've reviewed the material and I'm ready to help you understand it better. What specific part would you like to start with, or do you have any questions about the content?`;
  } else if (documents.length > 1) {
    const titles = documents.slice(0, 2).map(d => `"${d.title}"`).join(' and ');
    const remaining = documents.length > 2 ? ` and ${documents.length - 2} other document${documents.length > 3 ? 's' : ''}` : '';
    return `${greeting} I can see you've brought several materials to work with today: ${titles}${remaining}. I've reviewed all your documents and I'm ready to help you tackle any questions or problems you have. What would you like to focus on first?`;
  }
  
  // Student but no documents
  if (student) {
    const goalHint = student.goals && student.goals.length > 0 ? ` We're working towards: ${student.goals[0]}.` : '';
    return `${greeting} Ready to learn today?${goalHint} What would you like to work on?`;
  }
  
  // Fallback
  return `${greeting} I'm ready to help you learn today. What would you like to work on?`;
}

export default router;