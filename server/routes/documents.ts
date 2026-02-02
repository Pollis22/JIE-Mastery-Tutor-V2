/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 * 
 * This source code is confidential and proprietary.
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */


import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { z } from 'zod';
import { storage } from '../storage';
import { db } from '../db';
import { documentChunks } from '@shared/schema';
import { DocumentProcessor } from '../services/document-processor';
import { PdfJsTextExtractor } from '../services/pdf-extractor';
import Anthropic from '@anthropic-ai/sdk';
import { createRequire } from 'module';
import { 
  logDocUpload, 
  logDocExtracted, 
  logDocEmbedded 
} from '../services/session-docs-service';

// Create require for CommonJS modules
const require = createRequire(import.meta.url);

// Import CommonJS modules at the top (pdf-parse no longer needed - using PdfJsTextExtractor)
const mammoth = require('mammoth');
const Tesseract = require('tesseract.js');
const XLSX = require('xlsx');
const AdmZip = require('adm-zip');
const xml2js = require('xml2js');

// Initialize PDF extractor with multiple fallback methods
const pdfExtractor = new PdfJsTextExtractor();

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
// Uses PdfJsTextExtractor which tries pdfjs-dist first, then pdf-parse as fallback
async function extractTextFromPDF(filePath: string): Promise<string> {
  console.log('[PDF Extract] Using multi-method extraction with fallbacks...');
  
  // Use the robust extractor that tries multiple methods
  const result = await pdfExtractor.extractTextWithDetails(filePath);
  
  if (result.success && result.text.trim().length > 0) {
    console.log(`[PDF Extract] ✅ Extracted ${result.text.length} chars via ${result.method}`);
    return result.text;
  }
  
  // Extraction failed or returned empty text - throw to trigger graceful degradation
  // NO-GHOSTING: Do NOT return placeholder text - let the upload handler deal with it
  console.log(`[PDF Extract] ❌ No text extracted (method: ${result.method}, error: ${result.error || 'empty text'})`);
  throw new Error(result.error || 'No readable text content found in PDF. The file may be scanned, encrypted, or in an unsupported format.');
}

async function extractTextFromWord(filePath: string): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value || '';
  } catch (error) {
    console.error('[Word Extract] Error:', error);
    throw new Error(`Failed to extract text from Word: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

const TESSERACT_LANGUAGE_MAP: Record<string, string> = {
  'en': 'eng', 'es': 'spa', 'fr': 'fra', 'de': 'deu', 'it': 'ita', 'pt': 'por',
  'zh': 'chi_sim', 'ja': 'jpn', 'ko': 'kor', 'ar': 'ara', 'hi': 'hin', 'ru': 'rus',
  'nl': 'nld', 'pl': 'pol', 'tr': 'tur', 'vi': 'vie', 'th': 'tha', 'id': 'ind',
  'sv': 'swe', 'da': 'dan', 'no': 'nor', 'fi': 'fin', 'sw': 'swa', 'yo': 'eng', 'ha': 'eng',
};

async function extractTextFromImage(filePath: string, language: string = 'en'): Promise<string> {
  const tesseractLang = TESSERACT_LANGUAGE_MAP[language] || 'eng';
  
  try {
    console.log(`[OCR] Starting text recognition from image (language: ${language} -> ${tesseractLang})...`);
    
    const { data: { text } } = await Tesseract.recognize(filePath, tesseractLang, {
      logger: (m: any) => {
        if (m.status === 'recognizing text') {
          console.log(`[OCR] Progress: ${Math.round(m.progress * 100)}%`);
        }
      }
    });
    
    if (!text || text.trim().length === 0) {
      if (tesseractLang !== 'eng') {
        console.log(`[OCR] No text found with ${tesseractLang}, falling back to English...`);
        const fallbackResult = await Tesseract.recognize(filePath, 'eng');
        if (fallbackResult.data.text?.trim()) {
          return fallbackResult.data.text;
        }
      }
    }
    
    console.log(`[OCR] Extracted ${text.length} characters from image using ${tesseractLang}`);
    return text || '';
  } catch (error) {
    console.error(`[OCR Extract] Error with language ${tesseractLang}:`, error);
    throw new Error(`Failed to extract text from image: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function extractTextFromExcel(filePath: string): Promise<string> {
  try {
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
    
    // Get document language (default to English)
    const documentLanguage = req.body.language || 'en';
    
    console.log('[Upload] 📤 Processing file:', {
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      userId,
      language: documentLanguage,
    });

    // Validate metadata
    const metadata = uploadMetadataSchema.parse({
      subject: req.body.subject,
      grade: req.body.grade,
      title: req.body.title,
      description: req.body.description,
    });

    // Calculate expiration date (6 months from now)
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 6);

    // Determine file type - support all document types (PPTX only, not legacy PPT)
    const fileExtension = path.extname(req.file.originalname).toLowerCase().slice(1);
    const supportedTypes = ['pdf', 'docx', 'doc', 'pptx', 'txt', 'csv', 'xlsx', 'xls', 'png', 'jpg', 'jpeg', 'gif', 'bmp'];
    
    if (!supportedTypes.includes(fileExtension)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ 
        error: 'Unsupported file type. Supported: PDF, Word (DOCX/DOC), PowerPoint (PPTX), text (TXT), images (PNG/JPG/GIF/BMP), Excel (XLSX/XLS), and CSV' 
      });
    }

    // 1. Create document record with "processing" status and auto-expiration
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
      language: documentLanguage, // Store document language for OCR
      expiresAt, // Auto-delete after 6 months
      processingStatus: 'processing', // ← Changed from 'queued'
      retryCount: 0
    });
    
    documentId = document.id;
    console.log(`[Upload] ✅ Document created: ${documentId}`);
    
    // Log upload event per spec
    logDocUpload({
      userId,
      docId: documentId,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      bytes: req.file.size,
    });
    
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
        console.log(`[Upload] 🖼️ Extracting text from image using OCR (language: ${documentLanguage})...`);
        extractedText = await extractTextFromImage(req.file.path, documentLanguage);
      } else {
        throw new Error(`Unsupported file type: ${req.file.mimetype}`);
      }
      
      console.log(`[Upload] ✅ Extracted ${extractedText.length} characters`);
      
      // Log extraction event per spec
      const isImageType = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/bmp'].includes(req.file.mimetype);
      logDocExtracted({
        docId: documentId,
        mimeType: req.file.mimetype,
        extractedChars: extractedText.length,
        extractionMethod: isImageType ? 'ocr' : 'text_extraction',
        ocrUsed: isImageType,
      });
      
      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error('No text could be extracted from the document');
      }
      
    } catch (extractError: any) {
      console.error('[Upload] ❌ Text extraction failed:', extractError);
      
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // FIX (Feb 2, 2026): Graceful fallback - file is stored but not indexed for RAG
      // User can still see the file in UI and paste content manually
      // NO-GHOSTING: We do NOT create chunks or embeddings for failed extractions
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      console.log('[Upload] ⚠️ Extraction failed - file stored but NOT indexed');
      
      // Update document status - use 'ready' so UI doesn't show "Failed"
      // The file is stored, just without extracted text for RAG
      try {
        await storage.updateDocument(documentId, userId, { processingStatus: 'ready' });
        console.log('[Upload] ✅ Document stored as ready (extraction failed but file accessible)');
      } catch (updateError) {
        console.error('[Upload] ⚠️ Could not update status:', updateError);
      }
      
      // Log extraction failure for diagnostics
      console.error(`[DOCS] extraction_failed: ${JSON.stringify({
        docId: documentId,
        mimeType: req.file.mimetype,
        error: extractError.message,
      })}`);
      logDocExtracted({
        docId: documentId,
        mimeType: req.file.mimetype,
        extractedChars: 0,
        extractionMethod: 'failed',
        ocrUsed: false,
      });
      
      // Return success with warning - file shows as Ready in UI but no RAG content
      // User can still reference file by name or paste content manually
      console.log('[Upload] ⚠️ Returning success with extraction warning (status=ready)');
      return res.json({
        id: document.id,
        title: document.title,
        originalName: document.originalName,
        fileType: fileExtension,
        fileSize: req.file.size,
        processingStatus: 'ready',  // Show as Ready, not Failed
        createdAt: document.createdAt,
        chunks: 0,
        characters: 0,
        extractionWarning: 'Text could not be extracted from this file. The AI tutor can see the filename but cannot read its contents. Consider pasting the text directly.'
      });
    }
    
    // 3. Chunk the text (only reached if extraction succeeded)
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
    
    // Log embedding event (chunks created, embeddings will be generated by worker)
    logDocEmbedded({
      docId: documentId,
      chunkCount: chunks.length,
      embeddingModel: 'text-embedding-ada-002',
    });
    
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
    console.error('[Upload] Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      userId: req.user?.id,
      fileName: req.file?.originalname
    });
    
    // Check for database schema errors
    if (error.message?.includes('column') || error.code === '42703') {
      console.error('[Upload] ⚠️ DATABASE SCHEMA ERROR - Missing columns in user_documents table');
      console.error('[Upload] Run migration script: tsx server/scripts/migrate-production-schema.ts');
    }
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // FIX (Nov 3, 2025): DELETE failed uploads completely
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (documentId) {
      console.log('[Upload] 🧹 Cleaning up failed upload:', documentId);
      try {
        await storage.deleteDocument(documentId, req.user?.id || '');
        console.log('[Upload] ✅ Failed document deleted from database');
      } catch (deleteError) {
        console.error('[Upload] ❌ Failed to delete document:', deleteError);
      }
    }
    
    // Clean up uploaded file
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
        console.log('[Upload] ✅ Failed file deleted from disk');
      } catch (fileDeleteError) {
        console.error('[Upload] ❌ Failed to delete file:', fileDeleteError);
      }
    }
    
    res.status(500).json({
      error: 'Failed to process document',
      details: error.message,
    });
  }
});

/**
 * Analyze image using Claude Vision
 * Used during live voice sessions to let the tutor "see" uploaded images
 */

// Lazy init for Anthropic client
let anthropicVision: Anthropic | null = null;
function getAnthropicVisionClient(): Anthropic {
  if (!anthropicVision) {
    anthropicVision = new Anthropic();
  }
  return anthropicVision;
}

// Supported image types for Claude Vision (BMP not supported - requires conversion)
const CLAUDE_VISION_TYPES: Record<string, 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'> = {
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'image/gif': 'image/gif',
  'image/webp': 'image/webp',
};

// Configure multer for memory storage (for base64 encoding)
const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are supported for vision analysis'));
    }
  }
});

router.post('/analyze-image', uploadMemory.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    if (!file) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    
    // Check if it's a supported image type
    const mediaType = CLAUDE_VISION_TYPES[file.mimetype];
    if (!mediaType) {
      return res.status(400).json({ 
        error: 'Unsupported image format',
        supported: Object.keys(CLAUDE_VISION_TYPES)
      });
    }
    
    console.log(`[Image Vision] 📸 Analyzing image: ${file.originalname} (${file.size} bytes, ${file.mimetype})`);
    
    // Convert to base64
    const base64Image = file.buffer.toString('base64');
    
    // Use Claude Vision to analyze the image
    const client = getAnthropicVisionClient();
    
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64Image,
            }
          },
          {
            type: 'text',
            text: `You are helping an AI tutor understand what a student has uploaded. Analyze this image and provide a detailed description that will help the tutor assist the student.

If this is a homework problem, math equation, diagram, chart, or educational content:
- Transcribe any text, equations, or numbers exactly as they appear
- Describe the structure and components clearly
- Note what subject/topic it relates to (Math, Science, English, etc.)

If this is handwritten work:
- Transcribe the handwriting as accurately as possible
- Note if any parts are unclear or illegible

If this is a general image:
- Describe what you see
- Note any text visible
- Identify the educational context if applicable

Provide your analysis in a clear format that the tutor can reference during the conversation.`
          }
        ]
      }]
    });
    
    // Extract the text response - NO-GHOSTING: only accept actual text content
    const rawDescription = response.content[0].type === 'text' 
      ? response.content[0].text.trim()
      : '';
    
    // NO-GHOSTING: Validate that we have meaningful content
    const hasActualContent = rawDescription.length > 20; // More than a trivial response
    
    if (!hasActualContent) {
      console.log(`[Image Vision] ⚠️ No meaningful content extracted (${rawDescription.length} chars)`);
    } else {
      console.log(`[Image Vision] ✅ Analysis complete: ${rawDescription.substring(0, 100)}...`);
    }
    
    // Calculate expiration date (6 months from now)
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 6);
    
    // Store the image record with the vision description as "extracted text"
    const fileExtension = path.extname(file.originalname).toLowerCase().slice(1) || 'png';
    const document = await storage.uploadDocument(userId, {
      originalName: file.originalname,
      fileName: `vision_${Date.now()}_${file.originalname}`,
      filePath: '', // No disk storage for vision-analyzed images
      fileType: fileExtension,
      fileSize: file.size,
      title: file.originalname.replace(/\.[^/.]+$/, ''),
      description: hasActualContent ? 'Image analyzed with Claude Vision' : 'Image uploaded (analysis unavailable)',
      expiresAt,
      processingStatus: 'ready',
      retryCount: 0
    });
    
    // NO-GHOSTING: Only create chunks if we have actual content
    let chunksCreated = 0;
    if (hasActualContent) {
      const chunks = chunkText(rawDescription, 500);
      for (let i = 0; i < chunks.length; i++) {
        await db.insert(documentChunks).values({
          id: crypto.randomUUID(),
          documentId: document.id,
          chunkIndex: i,
          content: chunks[i],
          metadata: JSON.stringify({ 
            type: 'image_vision',
            originalName: file.originalname
          }),
        });
      }
      chunksCreated = chunks.length;
      console.log(`[Image Vision] 📝 Created ${chunksCreated} chunks for image description`);
    } else {
      console.log(`[Image Vision] ⚠️ No chunks created - NO-GHOSTING preserved`);
    }
    
    res.json({
      success: true,
      id: document.id,
      filename: file.originalname,
      description: hasActualContent ? rawDescription : null,
      contentLength: rawDescription.length,
      chunks: chunksCreated,
      processingStatus: 'ready',
      extractionWarning: hasActualContent ? undefined : 'Image could not be analyzed. The tutor cannot see its contents.'
    });
    
  } catch (error: any) {
    console.error(`[Image Vision] ❌ Analysis failed:`, error);
    res.status(500).json({ 
      error: 'Image analysis failed',
      details: error.message 
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
      processingStatus: doc.processingStatus,
      processingError: doc.processingError,
      retryCount: doc.retryCount,
      nextRetryAt: doc.nextRetryAt,
      expiresAt: doc.expiresAt,
      createdAt: doc.createdAt
    })));

  } catch (error: any) {
    console.error('[Documents] List documents error (root route):', error);
    console.error('[Documents] Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      userId: req.user?.id
    });
    
    // Check for database schema errors
    if (error.message?.includes('column') || error.code === '42703') {
      console.error('[Documents] ⚠️ DATABASE SCHEMA ERROR - Missing columns in user_documents table');
      console.error('[Documents] Run migration script: tsx server/scripts/migrate-production-schema.ts');
    }
    
    res.status(500).json({ 
      error: 'Failed to fetch documents',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
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
        processingStatus: doc.processingStatus,
        processingError: doc.processingError,
        retryCount: doc.retryCount,
        nextRetryAt: doc.nextRetryAt,
        expiresAt: doc.expiresAt,
        createdAt: doc.createdAt
      }))
    });

  } catch (error: any) {
    console.error('[Documents] List documents error:', error);
    console.error('[Documents] Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      userId: req.user?.id
    });
    
    // Check for database schema errors
    if (error.message?.includes('column') || error.code === '42703') {
      console.error('[Documents] ⚠️ DATABASE SCHEMA ERROR - Missing columns in user_documents table');
      console.error('[Documents] Run migration script: tsx server/scripts/migrate-production-schema.ts');
    }
    
    res.status(500).json({ 
      error: 'Failed to fetch documents',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
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
      expiresAt: document.expiresAt,
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
 * @param documentId - Document ID in database
 * @param filePath - Path to the uploaded file
 * @param fileType - File extension
 * @param language - Language code for OCR (default: 'en')
 */
async function processDocumentAsync(documentId: string, filePath: string, fileType: string, language: string = 'en') {
  try {
    console.log(`Processing document ${documentId} with language ${language}...`);
    
    // Process the file with language support for OCR
    const processed = await processor.processFile(filePath, fileType, language);
    
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

/**
 * Paste-via-chat ingestion endpoint
 * Creates an ephemeral document from pasted text
 * Per spec: canonical ingestion path for pasted content
 */
router.post('/paste', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    // Validate request body
    const { text, sessionId, conversationId } = req.body;
    
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Text content is required' });
    }
    
    const trimmedText = text.trim();
    
    // Cap text length (prevent huge pastes)
    const maxPasteChars = 100000; // 100KB max
    const truncated = trimmedText.length > maxPasteChars;
    const textToStore = truncated ? trimmedText.substring(0, maxPasteChars) : trimmedText;
    
    // Create ephemeral document with timestamp filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `Pasted Text ${timestamp}`;
    
    // Create document in database first to get docId
    const document = await storage.uploadDocument(userId, {
      title: filename.substring(0, 50),
      description: `Pasted text content (${textToStore.length} chars)`,
      fileType: 'txt',
      fileSize: textToStore.length,
      originalName: filename,
      fileName: filename, // virtual filename for pasted content
      filePath: '', // No file on disk
      processingStatus: 'processing',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    });
    
    // Log upload event with docId
    logDocUpload({
      userId,
      sessionId: sessionId || undefined,
      conversationId: conversationId || undefined,
      docId: document.id,
      filename,
      mimeType: 'text/plain',
      bytes: textToStore.length,
    });
    
    console.log(`[Paste] 📋 Created ephemeral document: ${document.id}`);
    
    // Log extraction event
    logDocExtracted({
      docId: document.id,
      mimeType: 'text/plain',
      extractedChars: textToStore.length,
      extractionMethod: 'paste',
      ocrUsed: false,
    });
    
    // Chunk the text
    const chunks = chunkText(textToStore, 1000);
    console.log(`[Paste] ✂️ Created ${chunks.length} chunks`);
    
    // Save chunks to database
    for (let i = 0; i < chunks.length; i++) {
      await storage.createDocumentChunk({
        documentId: document.id,
        chunkIndex: i,
        content: chunks[i],
        tokenCount: estimateTokens(chunks[i]),
        metadata: { source: 'paste' }
      });
    }
    
    // Log embedding event (chunks created, embeddings will be generated by worker)
    logDocEmbedded({
      docId: document.id,
      chunkCount: chunks.length,
      embeddingModel: 'text-embedding-ada-002',
    });
    
    // Update document status to ready
    await storage.updateDocument(document.id, userId, {
      processingStatus: 'ready',
    });
    
    console.log(`[Paste] ✅ Pasted text processed: ${document.id}, ${chunks.length} chunks`);
    
    res.json({
      success: true,
      document: {
        id: document.id,
        title: document.title,
        description: document.description,
        chunkCount: chunks.length,
        truncated,
        processingStatus: 'ready',
      },
      message: truncated 
        ? `Text was truncated to ${maxPasteChars} characters. ${chunks.length} chunks created.`
        : `Text processed successfully. ${chunks.length} chunks created.`,
    });
    
  } catch (error) {
    console.error('[Paste] Error:', error);
    res.status(500).json({ 
      error: 'Failed to process pasted text',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;