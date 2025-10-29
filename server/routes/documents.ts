import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { storage } from '../storage';
import { DocumentProcessor } from '../services/document-processor';
import { createRequire } from 'module';

// Create require for CommonJS modules
const require = createRequire(import.meta.url);

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
    // Allow PDF, Word, PowerPoint (PPTX only), text, images, Excel, and CSV files
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/msword', // .doc
      'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
      'text/plain', // .txt
      'text/csv', // .csv
      'application/vnd.ms-excel', // .xls
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/gif',
      'image/bmp',
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Supported file types: PDF, Word (DOCX/DOC), PowerPoint (PPTX), text (TXT), images (PNG/JPG/GIF/BMP), Excel (XLSX/XLS), and CSV'));
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

// File system promises
const fsPromises = fs.promises;

// Text extraction helper functions
async function extractTextFromPDF(filePath: string): Promise<string> {
  try {
    // Import pdf-parse as CommonJS module
    const pdfParse = require('pdf-parse');
    const dataBuffer = await fsPromises.readFile(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text || '';
  } catch (error) {
    console.error('[PDF Extract] Error:', error);
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function extractTextFromWord(filePath: string): Promise<string> {
  try {
    // Import mammoth as CommonJS module
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value || '';
  } catch (error) {
    console.error('[Word Extract] Error:', error);
    throw new Error(`Failed to extract text from Word: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function extractTextFromImage(filePath: string): Promise<string> {
  try {
    // Import tesseract.js for OCR
    const Tesseract = require('tesseract.js');
    console.log('[OCR] Starting text recognition from image...');
    
    const { data: { text } } = await Tesseract.recognize(filePath, 'eng', {
      logger: (m: any) => {
        if (m.status === 'recognizing text') {
          console.log(`[OCR] Progress: ${Math.round(m.progress * 100)}%`);
        }
      }
    });
    
    console.log(`[OCR] Extracted ${text.length} characters from image`);
    return text || '';
  } catch (error) {
    console.error('[OCR Extract] Error:', error);
    throw new Error(`Failed to extract text from image: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function extractTextFromExcel(filePath: string): Promise<string> {
  try {
    // Import xlsx for Excel parsing
    const XLSX = require('xlsx');
    console.log('[Excel] Reading spreadsheet...');
    
    const workbook = XLSX.readFile(filePath);
    const textParts: string[] = [];
    
    // Process each sheet
    for (const sheetName of workbook.SheetNames) {
      textParts.push(`\n=== Sheet: ${sheetName} ===\n`);
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to CSV format (preserves structure)
      const csvText = XLSX.utils.sheet_to_csv(worksheet);
      textParts.push(csvText);
    }
    
    const fullText = textParts.join('\n');
    console.log(`[Excel] Extracted ${fullText.length} characters from ${workbook.SheetNames.length} sheet(s)`);
    return fullText;
  } catch (error) {
    console.error('[Excel Extract] Error:', error);
    throw new Error(`Failed to extract text from Excel: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function extractTextFromCSV(filePath: string): Promise<string> {
  try {
    console.log('[CSV] Reading CSV file...');
    const csvText = await fsPromises.readFile(filePath, 'utf-8');
    
    // Parse CSV to make it more readable
    const XLSX = require('xlsx');
    const workbook = XLSX.read(csvText, { type: 'string' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    
    // Convert to formatted text
    const formattedText = XLSX.utils.sheet_to_csv(worksheet);
    console.log(`[CSV] Extracted ${formattedText.length} characters`);
    return formattedText;
  } catch (error) {
    console.error('[CSV Extract] Error:', error);
    throw new Error(`Failed to extract text from CSV: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function extractTextFromPowerPoint(filePath: string): Promise<string> {
  try {
    console.log('[PowerPoint] Reading presentation...');
    const AdmZip = require('adm-zip');
    const xml2js = require('xml2js');
    
    const zip = new AdmZip(filePath);
    const zipEntries = zip.getEntries();
    
    const textParts: string[] = [];
    let slideNumber = 0;
    
    // Extract text from each slide
    for (const entry of zipEntries) {
      if (entry.entryName.match(/ppt\/slides\/slide\d+\.xml/)) {
        slideNumber++;
        const content = entry.getData().toString('utf8');
        
        // Parse XML to extract text
        const parser = new xml2js.Parser();
        const result = await parser.parseStringPromise(content);
        
        // Extract all text nodes
        const slideText: string[] = [];
        const extractTextNodes = (obj: any) => {
          if (typeof obj === 'string') {
            slideText.push(obj);
          } else if (Array.isArray(obj)) {
            obj.forEach(extractTextNodes);
          } else if (obj && typeof obj === 'object') {
            Object.values(obj).forEach(extractTextNodes);
          }
        };
        
        extractTextNodes(result);
        
        if (slideText.length > 0) {
          textParts.push(`\n=== Slide ${slideNumber} ===\n${slideText.join(' ')}`);
        }
      }
    }
    
    const fullText = textParts.join('\n');
    console.log(`[PowerPoint] Extracted ${fullText.length} characters from ${slideNumber} slide(s)`);
    return fullText;
  } catch (error) {
    console.error('[PowerPoint Extract] Error:', error);
    throw new Error(`Failed to extract text from PowerPoint: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Chunk text into manageable pieces
function chunkText(text: string, maxChunkSize: number = 1000): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n\n+/);
  
  let currentChunk = '';
  
  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;
    
    if (currentChunk.length + trimmed.length > maxChunkSize) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      
      // If single paragraph is too long, split by sentences
      if (trimmed.length > maxChunkSize) {
        const sentences = trimmed.match(/[^.!?]+[.!?]+/g) || [trimmed];
        for (const sentence of sentences) {
          if (currentChunk.length + sentence.length > maxChunkSize) {
            if (currentChunk) chunks.push(currentChunk.trim());
            currentChunk = sentence;
          } else {
            currentChunk += ' ' + sentence;
          }
        }
      } else {
        currentChunk = trimmed;
      }
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + trimmed;
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.filter(chunk => chunk.length > 0);
}

// Estimate token count
function estimateTokens(text: string): number {
  return Math.ceil(text.split(/\s+/).length * 1.3);
}

/**
 * Upload and process document SYNCHRONOUSLY
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  let documentId: string | null = null;
  
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Get user ID from session
    const userId = req.user?.id;
    if (!userId) {
      console.log('[Upload] ❌ User not authenticated');
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    console.log('[Upload] 📤 Processing file:', {
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      userId,
    });

    // Validate metadata
    const metadata = uploadMetadataSchema.parse({
      subject: req.body.subject,
      grade: req.body.grade,
      title: req.body.title,
      description: req.body.description,
      keepForFutureSessions: req.body.keepForFutureSessions === 'true'
    });

    // Determine file type - support all document types (PPTX only, not legacy PPT)
    const fileExtension = path.extname(req.file.originalname).toLowerCase().slice(1);
    const supportedTypes = ['pdf', 'docx', 'doc', 'pptx', 'txt', 'csv', 'xlsx', 'xls', 'png', 'jpg', 'jpeg', 'gif', 'bmp'];
    
    if (!supportedTypes.includes(fileExtension)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ 
        error: 'Unsupported file type. Supported: PDF, Word (DOCX/DOC), PowerPoint (PPTX), text (TXT), images (PNG/JPG/GIF/BMP), Excel (XLSX/XLS), and CSV' 
      });
    }

    // 1. Create document record with "processing" status
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
      processingStatus: 'processing', // ← Changed from 'queued'
      retryCount: 0
    });
    
    documentId = document.id;
    console.log(`[Upload] ✅ Document created: ${documentId}`);
    
    // 2. Extract text based on file type
    let extractedText = '';
    
    try {
      if (req.file.mimetype === 'application/pdf') {
        console.log('[Upload] 📄 Extracting text from PDF...');
        extractedText = await extractTextFromPDF(req.file.path);
      } else if (
        req.file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        req.file.mimetype === 'application/msword' ||
        req.file.originalname.endsWith('.docx')
      ) {
        console.log('[Upload] 📝 Extracting text from Word...');
        extractedText = await extractTextFromWord(req.file.path);
      } else if (
        req.file.mimetype === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
        req.file.originalname.endsWith('.pptx')
      ) {
        console.log('[Upload] 📊 Extracting text from PowerPoint (PPTX)...');
        extractedText = await extractTextFromPowerPoint(req.file.path);
      } else if (req.file.mimetype === 'text/plain') {
        console.log('[Upload] 📃 Reading text file...');
        extractedText = await fsPromises.readFile(req.file.path, 'utf-8');
      } else if (req.file.mimetype === 'text/csv') {
        console.log('[Upload] 📊 Extracting text from CSV...');
        extractedText = await extractTextFromCSV(req.file.path);
      } else if (
        req.file.mimetype === 'application/vnd.ms-excel' ||
        req.file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ) {
        console.log('[Upload] 📊 Extracting text from Excel...');
        extractedText = await extractTextFromExcel(req.file.path);
      } else if (
        req.file.mimetype === 'image/png' ||
        req.file.mimetype === 'image/jpeg' ||
        req.file.mimetype === 'image/jpg' ||
        req.file.mimetype === 'image/gif' ||
        req.file.mimetype === 'image/bmp'
      ) {
        console.log('[Upload] 🖼️ Extracting text from image using OCR...');
        extractedText = await extractTextFromImage(req.file.path);
      } else {
        throw new Error(`Unsupported file type: ${req.file.mimetype}`);
      }
      
      console.log(`[Upload] ✅ Extracted ${extractedText.length} characters`);
      
      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error('No text could be extracted from the document');
      }
      
    } catch (extractError: any) {
      console.error('[Upload] ❌ Text extraction failed:', extractError);
      
      await storage.updateDocument(documentId, userId, {
        processingStatus: 'failed',
        processingError: `Text extraction failed: ${extractError.message}`,
      });
      
      return res.status(500).json({
        error: 'Failed to extract text from document',
        details: extractError.message,
      });
    }
    
    // 3. Chunk the text
    console.log('[Upload] ✂️ Chunking text...');
    const chunks = chunkText(extractedText, 1000);
    console.log(`[Upload] ✅ Created ${chunks.length} chunks`);
    
    // 4. Save chunks to database
    console.log('[Upload] 💾 Saving chunks to database...');
    for (let i = 0; i < chunks.length; i++) {
      await storage.createDocumentChunk({
        documentId: documentId,
        chunkIndex: i,
        content: chunks[i],
        tokenCount: estimateTokens(chunks[i]),
        metadata: {}
      });
    }
    
    // 5. Update document with extracted text and mark as ready
    await storage.updateDocument(documentId, userId, {
      processingStatus: 'ready',
      retryCount: 0
    });
    
    console.log(`[Upload] 🎉 Document ${documentId} processed successfully!`);
    console.log(`[Upload] - Chunks: ${chunks.length}`);
    console.log(`[Upload] - Characters: ${extractedText.length}`);
    
    res.json({
      id: document.id,
      title: document.title,
      originalName: document.originalName,
      fileType: document.fileType,
      fileSize: document.fileSize,
      processingStatus: 'ready', // ← Return ready status
      createdAt: document.createdAt,
      chunks: chunks.length,
      characters: extractedText.length
    });

  } catch (error: any) {
    console.error('[Upload] ❌ Error:', error);
    
    // Update document status if we created one
    if (documentId) {
      try {
        await storage.updateDocument(documentId, req.user?.id || '', {
          processingStatus: 'failed',
          processingError: error.message,
        });
      } catch (updateError) {
        console.error('[Upload] Failed to update error status:', updateError);
      }
    }
    
    // Clean up uploaded file
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      error: 'Failed to process document',
      details: error.message,
    });
  }
});

/**
 * Get user's documents (root route)
 * Returns array directly for compatibility with StudentProfilePanel
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const documents = await storage.getUserDocuments(userId);
    
    // Return array directly (not wrapped in object)
    res.json(documents.map(doc => ({
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
    })));

  } catch (error) {
    console.error('List documents error:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

/**
 * Get user's documents (alias for compatibility)
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
 * Get document content/text
 */
router.get('/:id/content', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const documentId = req.params.id;
    
    console.log(`[Documents API] 📖 Fetching content for document: ${documentId}`);
    
    // Get document metadata and chunks
    const contextData = await storage.getDocumentContext(userId, [documentId]);
    
    if (contextData.documents.length === 0) {
      console.log(`[Documents API] ❌ Document not found: ${documentId}`);
      return res.status(404).json({ error: 'Document not found' });
    }
    
    const document = contextData.documents[0];
    console.log(`[Documents API] ✅ Found document: ${document.originalName}`);
    
    // Concatenate all chunks to get full text
    const fullText = contextData.chunks
      .sort((a, b) => a.chunkIndex - b.chunkIndex)
      .map(chunk => chunk.content)
      .join('\n\n');
    
    console.log(`[Documents API] 📄 Document has ${contextData.chunks.length} chunks, total text length: ${fullText.length} chars`);
    
    res.json({
      id: document.id,
      filename: document.originalName,
      title: document.title || document.originalName,
      text: fullText,
      contentType: document.fileType,
      chunkCount: contextData.chunks.length
    });
    
  } catch (error) {
    console.error('[Documents API] ❌ Error fetching document content:', error);
    res.status(500).json({ error: 'Failed to fetch document content' });
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