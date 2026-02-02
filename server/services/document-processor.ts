/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 * 
 * This source code is confidential and proprietary.
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */


import * as fs from 'fs';
import * as path from 'path';
import mammoth from 'mammoth';
import { PdfJsTextExtractor, PdfExtractionResult } from './pdf-extractor';
import xlsx from 'xlsx';
import { parse } from 'csv-parse/sync';
import { createWorker } from 'tesseract.js';
import OpenAI from 'openai';

export interface ProcessedDocument {
  chunks: Array<{
    content: string;
    chunkIndex: number;
    tokenCount?: number;
    metadata?: any;
  }>;
  totalTokens: number;
  processingTime: number;
  extractionMethod?: string;
  extractionWarning?: string;
}

export class DocumentProcessor {
  private pdfExtractor: PdfJsTextExtractor;
  private readonly maxChunkSize = 800; // tokens per chunk (400-800 range)
  private readonly chunkOverlap = 100; // token overlap between chunks
  private openai: OpenAI;
  
  private static readonly TESSERACT_LANGUAGE_MAP: Record<string, string> = {
    'en': 'eng',
    'es': 'spa',
    'fr': 'fra',
    'de': 'deu',
    'it': 'ita',
    'pt': 'por',
    'zh': 'chi_sim',
    'ja': 'jpn',
    'ko': 'kor',
    'ar': 'ara',
    'hi': 'hin',
    'ru': 'rus',
    'nl': 'nld',
    'pl': 'pol',
    'tr': 'tur',
    'vi': 'vie',
    'th': 'tha',
    'id': 'ind',
    'sv': 'swe',
    'da': 'dan',
    'no': 'nor',
    'fi': 'fin',
    'sw': 'swa',
    'yo': 'eng',
    'ha': 'eng',
  };

  constructor() {
    this.pdfExtractor = new PdfJsTextExtractor();
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  
  private getTesseractLanguage(languageCode: string): string {
    return DocumentProcessor.TESSERACT_LANGUAGE_MAP[languageCode] || 'eng';
  }

  /**
   * Process uploaded file and extract text content
   * @param filePath - Path to the file
   * @param fileType - File extension (pdf, docx, png, etc.)
   * @param language - Language code for OCR (default: 'en')
   */
  async processFile(filePath: string, fileType: string, language: string = 'en'): Promise<ProcessedDocument> {
    const startTime = Date.now();
    let text: string;
    let extractionMethod: string | undefined;
    let extractionWarning: string | undefined;

    try {
      switch (fileType.toLowerCase()) {
        case 'pdf':
          const pdfResult = await this.extractPdfText(filePath);
          text = pdfResult.text;
          extractionMethod = pdfResult.method;
          extractionWarning = pdfResult.warning;
          
          // If PDF extraction failed, throw to trigger the error handling
          if (pdfResult.method === 'failed') {
            throw new Error(pdfResult.warning || 'PDF extraction failed');
          }
          break;
        case 'docx':
        case 'doc':
          text = await this.extractDocxText(filePath);
          extractionMethod = 'mammoth';
          break;
        case 'txt':
        case 'md':
        case 'markdown':
          text = await this.extractTxtText(filePath);
          extractionMethod = 'text';
          break;
        case 'csv':
          text = await this.extractCsvText(filePath);
          extractionMethod = 'csv-parse';
          break;
        case 'xlsx':
        case 'xls':
          text = await this.extractExcelText(filePath);
          extractionMethod = 'xlsx';
          break;
        case 'png':
        case 'jpg':
        case 'jpeg':
        case 'gif':
        case 'bmp':
        case 'webp':
          text = await this.extractImageText(filePath, language);
          extractionMethod = 'tesseract-ocr';
          break;
        default:
          // Best-effort: try to read as plain text for unknown formats
          console.log(`[DOCS] Attempting best-effort text extraction for unknown type: ${fileType}`);
          try {
            text = await this.extractTxtText(filePath);
            extractionMethod = 'text-fallback';
            console.log(`[DOCS] Best-effort extraction succeeded for ${fileType}: ${text.length} chars`);
          } catch (e) {
            console.error(`[DOCS] Best-effort extraction failed for ${fileType}:`, e);
            throw new Error(`Unsupported file type: ${fileType}. Please try uploading as PDF, DOCX, TXT, or paste the content directly.`);
          }
      }

      // Clean and validate text
      text = this.cleanText(text);
      if (!text.trim()) {
        throw new Error('No readable text content found in document');
      }

      // Split into chunks
      const chunks = await this.createTextChunks(text);
      const totalTokens = chunks.reduce((sum, chunk) => sum + (chunk.tokenCount || 0), 0);

      return {
        chunks,
        totalTokens,
        processingTime: Date.now() - startTime,
        extractionMethod,
        extractionWarning,
      };
    } catch (error) {
      console.error(`Failed to process ${fileType} file:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to process document: ${errorMessage}`);
    }
  }

  /**
   * Extract text from PDF using multiple methods with fallbacks
   */
  private async extractPdfText(filePath: string): Promise<{ text: string; method: string; warning?: string }> {
    const result = await this.pdfExtractor.extractTextWithDetails(filePath);
    
    if (result.success) {
      return { text: result.text, method: result.method };
    }
    
    // Extraction failed - return error info instead of throwing
    return { 
      text: '', 
      method: 'failed', 
      warning: result.error || 'PDF extraction failed'
    };
  }

  /**
   * Extract text from DOCX
   */
  private async extractDocxText(filePath: string): Promise<string> {
    const result = await mammoth.extractRawText({ path: filePath });
    if (result.messages.length > 0) {
      console.warn('DOCX processing warnings:', result.messages);
    }
    return result.value;
  }

  /**
   * Extract text from TXT
   */
  private async extractTxtText(filePath: string): Promise<string> {
    return fs.readFileSync(filePath, 'utf-8');
  }

  /**
   * Extract text from CSV
   */
  private async extractCsvText(filePath: string): Promise<string> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const records = parse(content, {
      skip_empty_lines: true,
      trim: true,
    });
    
    // Convert CSV to readable text format with headers
    if (records.length === 0) return '';
    
    const headers = records[0];
    const rows = records.slice(1);
    
    let text = `CSV Data:\n\n`;
    text += `Headers: ${headers.join(' | ')}\n\n`;
    
    rows.forEach((row: any[], idx: number) => {
      text += `Row ${idx + 1}: ${row.join(' | ')}\n`;
    });
    
    return text;
  }

  /**
   * Extract text from Excel files
   */
  private async extractExcelText(filePath: string): Promise<string> {
    const workbook = xlsx.readFile(filePath);
    let text = '';

    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      text += `\n=== Sheet: ${sheetName} ===\n`;
      text += xlsx.utils.sheet_to_txt(sheet) + '\n';
    });

    return text.trim();
  }

  /**
   * Extract text from images using OCR (Tesseract.js)
   * Supports: png, jpg, jpeg, gif, bmp
   * Supports 25 languages for multilingual document processing
   */
  private async extractImageText(filePath: string, language: string = 'en'): Promise<string> {
    let worker;
    const tesseractLang = this.getTesseractLanguage(language);
    
    console.log(`[OCR] Processing image with language: ${language} (Tesseract: ${tesseractLang})`);
    
    try {
      worker = await createWorker(tesseractLang);
      
      const { data: { text } } = await worker.recognize(filePath);
      
      if (!text || text.trim().length === 0) {
        if (tesseractLang !== 'eng') {
          console.log(`[OCR] No text found with ${tesseractLang}, falling back to English OCR`);
          await worker.terminate();
          worker = await createWorker('eng');
          const fallbackResult = await worker.recognize(filePath);
          if (fallbackResult.data.text?.trim()) {
            return fallbackResult.data.text;
          }
        }
        throw new Error('No readable text found in image');
      }
      
      console.log(`[OCR] ✅ Extracted ${text.length} characters using ${tesseractLang}`);
      return text;
    } catch (error) {
      console.error(`[OCR] ❌ Extraction failed for language ${tesseractLang}:`, error);
      throw new Error(`Failed to extract text from image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      if (worker) {
        await worker.terminate();
      }
    }
  }

  /**
   * Clean extracted text
   */
  private cleanText(text: string): string {
    return text
      .replace(/\x00/g, '') // remove null bytes (PostgreSQL doesn't allow them)
      .replace(/\r\n/g, '\n') // normalize line endings
      .replace(/\n{3,}/g, '\n\n') // collapse multiple newlines
      .replace(/\s+/g, ' ') // normalize whitespace
      .trim();
  }

  /**
   * Split text into chunks with overlap
   */
  private async createTextChunks(text: string): Promise<Array<{
    content: string;
    chunkIndex: number;
    tokenCount: number;
    metadata?: any;
  }>> {
    const sentences = this.splitIntoSentences(text);
    const chunks: Array<{content: string; chunkIndex: number; tokenCount: number; metadata?: any}> = [];
    
    let currentChunk = '';
    let currentTokenCount = 0;
    let chunkIndex = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const sentenceTokens = this.estimateTokens(sentence);

      // If adding this sentence would exceed max chunk size, start new chunk
      if (currentTokenCount + sentenceTokens > this.maxChunkSize && currentChunk) {
        chunks.push({
          content: currentChunk.trim(),
          chunkIndex: chunkIndex++,
          tokenCount: currentTokenCount,
          metadata: { startSentence: Math.max(0, i - 20), endSentence: i }
        });

        // Start new chunk with overlap from previous chunk
        const overlapSentences = this.getOverlapSentences(sentences, i, this.chunkOverlap);
        currentChunk = overlapSentences.join(' ') + ' ';
        currentTokenCount = this.estimateTokens(currentChunk);
      }

      currentChunk += sentence + ' ';
      currentTokenCount += sentenceTokens;
    }

    // Add final chunk if it has content
    if (currentChunk.trim()) {
      chunks.push({
        content: currentChunk.trim(),
        chunkIndex: chunkIndex,
        tokenCount: currentTokenCount,
        metadata: { startSentence: Math.max(0, sentences.length - 20), endSentence: sentences.length }
      });
    }

    return chunks;
  }

  /**
   * Split text into sentences
   */
  private splitIntoSentences(text: string): string[] {
    return text
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .map(s => s + '.');
  }

  /**
   * Get overlap sentences for chunk boundary
   */
  private getOverlapSentences(sentences: string[], endIndex: number, maxOverlapTokens: number): string[] {
    const overlapSentences: string[] = [];
    let tokenCount = 0;
    
    for (let i = endIndex - 1; i >= 0 && tokenCount < maxOverlapTokens; i--) {
      const sentence = sentences[i];
      const sentenceTokens = this.estimateTokens(sentence);
      
      if (tokenCount + sentenceTokens <= maxOverlapTokens) {
        overlapSentences.unshift(sentence);
        tokenCount += sentenceTokens;
      } else {
        break;
      }
    }
    
    return overlapSentences;
  }

  /**
   * Estimate token count for text (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters for English
    return Math.ceil(text.length / 4);
  }

  /**
   * Generate embeddings for text content using OpenAI text-embedding-ada-002 (1536 dims)
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      console.log('[Embeddings] Generating embedding with text-embedding-ada-002');
      
      // Use OpenAI's text-embedding-ada-002 model (1536 dimensions)
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text.substring(0, 8000), // Limit to ~8000 chars to stay within token limits
      });

      const embedding = response.data[0].embedding;
      console.log('[Embeddings] ✅ Generated embedding:', embedding.length, 'dimensions');
      
      if (embedding.length !== 1536) {
        throw new Error(`Expected 1536 dimensions, got ${embedding.length}`);
      }
      
      return embedding;
    } catch (error: any) {
      console.error('[Embeddings] ❌ Error:', error);
      throw new Error(`Failed to generate text embedding: ${error.message}`);
    }
  }

  /**
   * Calculate cosine similarity between embeddings
   */
  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Embedding vectors must have same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}