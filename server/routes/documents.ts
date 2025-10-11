import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { storage } from '../storage';
import { DocumentProcessor } from '../services/document-processor';

const router = Router();

// Configure multer for file uploads
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/msword', // .doc
      'text/plain', // .txt
      'text/csv', // .csv
      'application/vnd.ms-excel', // .xls
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/gif',
      'image/bmp'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Supported: PDF, DOCX, TXT, CSV, Excel, Images'));
    }
  }
});

// Validation schemas
const uploadMetadataSchema = z.object({
  subject: z.string().optional(),
  grade: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  keepForFutureSessions: z.boolean().optional().default(false)
});

const contextRequestSchema = z.object({
  userId: z.string(),
  subject: z.string().optional(),
  grade: z.string().optional(),
  includeDocIds: z.array(z.string()).optional().default([]),
  sessionId: z.string().optional()
});

// Document processor instance
const processor = new DocumentProcessor();

/**
 * Upload and process document
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Get user ID from session
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Validate metadata
    const metadata = uploadMetadataSchema.parse({
      subject: req.body.subject,
      grade: req.body.grade,
      title: req.body.title,
      description: req.body.description,
      keepForFutureSessions: req.body.keepForFutureSessions === 'true'
    });

    // Determine file type
    const fileExtension = path.extname(req.file.originalname).toLowerCase().slice(1);
    const supportedTypes = ['pdf', 'docx', 'doc', 'txt', 'csv', 'xlsx', 'xls', 'png', 'jpg', 'jpeg', 'gif', 'bmp'];
    
    if (!supportedTypes.includes(fileExtension)) {
      fs.unlinkSync(req.file.path); // Clean up uploaded file
      return res.status(400).json({ error: 'Unsupported file type. Supported: PDF, DOCX, TXT, CSV, Excel, Images' });
    }

    // Save document record - queued for background processing by the embedding worker
    const document = await storage.uploadDocument(userId, {
      originalName: req.file.originalname,
      fileName: req.file.filename,
      filePath: req.file.path,
      fileType: fileExtension,
      fileSize: req.file.size,
      subject: metadata.subject,
      grade: metadata.grade,
      title: metadata.title || req.file.originalname,
      description: metadata.description,
      keepForFutureSessions: metadata.keepForFutureSessions,
      processingStatus: 'queued',
      retryCount: 0
    });

    // The embedding worker will automatically process this document in the background
    console.log(`Document ${document.id} queued for processing`);

    res.json({
      id: document.id,
      title: document.title,
      originalName: document.originalName,
      fileType: document.fileType,
      fileSize: document.fileSize,
      processingStatus: document.processingStatus,
      createdAt: document.createdAt
    });

  } catch (error) {
    console.error('Upload error:', error);
    
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

/**
 * Get user's documents
 */
router.get('/list', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const documents = await storage.getUserDocuments(userId);
    
    res.json({
      documents: documents.map(doc => ({
        id: doc.id,
        title: doc.title,
        originalName: doc.originalName,
        fileType: doc.fileType,
        fileSize: doc.fileSize,
        subject: doc.subject,
        grade: doc.grade,
        description: doc.description,
        keepForFutureSessions: doc.keepForFutureSessions,
        processingStatus: doc.processingStatus,
        processingError: doc.processingError,
        retryCount: doc.retryCount,
        nextRetryAt: doc.nextRetryAt,
        createdAt: doc.createdAt
      }))
    });

  } catch (error) {
    console.error('List documents error:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

/**
 * Delete document
 */
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const documentId = req.params.id;
    
    // Get document to delete file from disk
    const document = await storage.getDocument(documentId, userId);
    if (document && fs.existsSync(document.filePath)) {
      fs.unlinkSync(document.filePath);
    }

    await storage.deleteDocument(documentId, userId);
    
    res.json({ success: true });

  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

/**
 * Update document metadata
 */
router.put('/:id', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const documentId = req.params.id;
    const updates = uploadMetadataSchema.partial().parse(req.body);

    const document = await storage.updateDocument(documentId, userId, updates);
    
    res.json({
      id: document.id,
      title: document.title,
      subject: document.subject,
      grade: document.grade,
      description: document.description,
      keepForFutureSessions: document.keepForFutureSessions,
      updatedAt: document.updatedAt
    });

  } catch (error) {
    console.error('Update document error:', error);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

/**
 * Get context for learning session
 */
router.post('/context/session-start', async (req, res) => {
  try {
    const request = contextRequestSchema.parse(req.body);
    
    // Get relevant documents
    const contextData = await storage.getDocumentContext(request.userId, request.includeDocIds);
    
    if (contextData.documents.length === 0) {
      return res.json({
        systemPrompt: null,
        firstMessage: null,
        summary: 'No documents selected for this session'
      });
    }

    // Create context summary
    const documentTitles = contextData.documents.map(doc => doc.title).join(', ');
    const totalChunks = contextData.chunks.length;
    
    // Build system prompt with document context
    const systemPrompt = `You are an AI tutor helping a student with their specific materials. The student has uploaded the following documents for this session: ${documentTitles}.

You have access to ${totalChunks} sections of content from their materials. When answering questions, prioritize information from these documents and reference them specifically. If asked about content not in their materials, let them know and offer to help with what's available.

Be encouraging, patient, and adapt your teaching style to help them understand their specific assignments and materials.`;

    // Create personalized first message
    const firstMessage = contextData.documents.length === 1 
      ? `Hi! I can see you've uploaded "${contextData.documents[0].title}" for our session. I'm ready to help you understand and work through this material. What would you like to start with?`
      : `Hi! I can see you've uploaded ${contextData.documents.length} documents for our session: ${documentTitles}. I'm ready to help you work through these materials. What would you like to focus on first?`;

    res.json({
      systemPrompt,
      firstMessage,
      summary: `Session context prepared with ${contextData.documents.length} document(s): ${documentTitles}`,
      documentCount: contextData.documents.length,
      chunkCount: totalChunks
    });

  } catch (error) {
    console.error('Context session error:', error);
    res.status(500).json({ error: 'Failed to prepare session context' });
  }
});

/**
 * Search for similar content (for advanced RAG queries)
 */
router.post('/search', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { query, topK = 5, threshold = 0.7 } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query required' });
    }

    // Generate embedding for query
    const queryEmbedding = await processor.generateEmbedding(query);
    
    // Search for similar content
    const results = await storage.searchSimilarContent(userId, queryEmbedding, topK, threshold);
    
    res.json({
      query,
      results: results.map(result => ({
        content: result.chunk.content,
        similarity: result.similarity,
        document: {
          title: result.document.title,
          originalName: result.document.originalName
        },
        metadata: result.chunk.metadata
      }))
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * Process document asynchronously
 */
async function processDocumentAsync(documentId: string, filePath: string, fileType: string) {
  try {
    console.log(`Processing document ${documentId}...`);
    
    // Process the file
    const processed = await processor.processFile(filePath, fileType);
    
    // Store chunks and embeddings
    for (const chunkData of processed.chunks) {
      const chunk = await storage.createDocumentChunk({
        documentId,
        chunkIndex: chunkData.chunkIndex,
        content: chunkData.content,
        tokenCount: chunkData.tokenCount,
        metadata: chunkData.metadata
      });
      
      // Generate and store embedding
      const embedding = await processor.generateEmbedding(chunkData.content);
      await storage.createDocumentEmbedding({
        chunkId: chunk.id,
        embedding: embedding // Use vector array directly (pgvector type)
      });
    }
    
    // Update document status
    await storage.updateDocument(documentId, '', {
      processingStatus: 'ready'
    });
    
    console.log(`Document ${documentId} processed successfully: ${processed.chunks.length} chunks, ${processed.totalTokens} tokens`);
    
  } catch (error) {
    console.error(`Document processing failed for ${documentId}:`, error);
    
    // Update document with error
    const errorMessage = error instanceof Error ? error.message : 'Unknown processing error';
    await storage.updateDocument(documentId, '', {
      processingStatus: 'failed',
      processingError: errorMessage
    });
  }
}

export default router;