import * as fs from 'fs';
import * as path from 'path';
import mammoth from 'mammoth';

// Lazy load pdf-parse to avoid initialization issues
let pdfParse: any = null;
const loadPdfParse = async () => {
  if (!pdfParse) {
    try {
      pdfParse = (await import('pdf-parse')).default;
    } catch (error) {
      console.warn('Failed to load pdf-parse:', error);
      return null;
    }
  }
  return pdfParse;
};
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
  private openai: OpenAI;
  private readonly maxChunkSize = 1000; // tokens per chunk
  private readonly chunkOverlap = 200; // token overlap between chunks

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
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
          text = await this.extractDocxText(filePath);
          break;
        case 'txt':
          text = await this.extractTxtText(filePath);
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
   * Extract text from PDF
   */
  private async extractPdfText(filePath: string): Promise<string> {
    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(dataBuffer);
    return pdfData.text;
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
   * Clean extracted text
   */
  private cleanText(text: string): string {
    return text
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
   * Generate embeddings for text content
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text,
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('Failed to generate embedding:', error);
      throw new Error('Failed to generate text embedding');
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