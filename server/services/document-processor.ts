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
import { PdfJsTextExtractor } from './pdf-extractor';
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
}

export class DocumentProcessor {
  private pdfExtractor: PdfJsTextExtractor;
  private readonly maxChunkSize = 800; // tokens per chunk (400-800 range)
  private readonly chunkOverlap = 100; // token overlap between chunks
  private openai: OpenAI;

  constructor() {
    this.pdfExtractor = new PdfJsTextExtractor();
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  /**
   * Process uploaded file and extract text content
   */
  async processFile(filePath: string, fileType: string): Promise<ProcessedDocument> {
    const startTime = Date.now();
    let text: string;

    try {
      switch (fileType.toLowerCase()) {
        case 'pdf':
          text = await this.extractPdfText(filePath);
          break;
        case 'docx':
        case 'doc':
          text = await this.extractDocxText(filePath);
          break;
        case 'txt':
          text = await this.extractTxtText(filePath);
          break;
        case 'csv':
          text = await this.extractCsvText(filePath);
          break;
        case 'xlsx':
        case 'xls':
          text = await this.extractExcelText(filePath);
          break;
        case 'png':
        case 'jpg':
        case 'jpeg':
        case 'gif':
        case 'bmp':
          text = await this.extractImageText(filePath);
          break;
        default:
          throw new Error(`Unsupported file type: ${fileType}`);
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
      };
    } catch (error) {
      console.error(`Failed to process ${fileType} file:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to process document: ${errorMessage}`);
    }
  }

  /**
   * Extract text from PDF using PDF.js
   */
  private async extractPdfText(filePath: string): Promise<string> {
    return this.pdfExtractor.extractText(filePath);
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
   */
  private async extractImageText(filePath: string): Promise<string> {
    let worker;
    try {
      // Create OCR worker with English language support
      worker = await createWorker('eng');
      
      // Perform OCR on the image
      const { data: { text } } = await worker.recognize(filePath);
      
      if (!text || text.trim().length === 0) {
        throw new Error('No readable text found in image');
      }
      
      return text;
    } catch (error) {
      console.error('OCR extraction failed:', error);
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