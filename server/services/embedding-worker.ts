import { storage } from '../storage';
import { DocumentProcessor } from './document-processor';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';

const MAX_RETRIES = 8;
const WORKER_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
const BATCH_SIZE = 3; // Process 3 documents at a time to avoid overwhelming the API

export class EmbeddingWorker {
  private processor: DocumentProcessor;
  private openai: OpenAI;
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly embeddingModel: string;

  constructor() {
    this.processor = new DocumentProcessor();
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.embeddingModel = process.env.EMBED_MODEL || 'text-embedding-3-small';
  }

  start() {
    if (this.isRunning) {
      console.log('[EmbeddingWorker] Already running');
      return;
    }

    this.isRunning = true;
    console.log('[EmbeddingWorker] Starting background embedding processor');
    
    // Run immediately on start
    this.tick();
    
    // Then run every WORKER_INTERVAL_MS
    this.intervalId = setInterval(() => this.tick(), WORKER_INTERVAL_MS);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('[EmbeddingWorker] Stopped');
  }

  private async tick() {
    try {
      const queuedDocs = await this.getQueuedDocuments(BATCH_SIZE);
      
      if (queuedDocs.length === 0) {
        return;
      }

      console.log(`[EmbeddingWorker] Processing ${queuedDocs.length} documents`);

      for (const doc of queuedDocs) {
        await this.processDocument(doc);
      }
    } catch (error) {
      console.error('[EmbeddingWorker] Tick error:', error);
    }
  }

  private async getQueuedDocuments(limit: number) {
    // Get all queued documents across all users that are ready for processing
    const allDocs = await storage.getAllDocumentsForProcessing();
    const now = new Date();

    return allDocs
      .filter(doc => 
        doc.processingStatus === 'queued' && 
        (!doc.nextRetryAt || new Date(doc.nextRetryAt) <= now)
      )
      .slice(0, limit);
  }

  private async processDocument(doc: any) {
    try {
      console.log(`[EmbeddingWorker] Processing document ${doc.id}`);
      
      // Mark as processing
      await storage.updateDocument(doc.id, '', {
        processingStatus: 'processing',
        processingError: null,
      });

      // Extract or load text
      const fullText = await this.getDocumentText(doc);
      
      // Save parsed text for future reference
      const parsedTextPath = await this.saveParsedText(doc.id, fullText);
      await storage.updateDocument(doc.id, '', { parsedTextPath });

      // Create chunks
      const processed = await this.processor.processFile(doc.filePath, doc.fileType);
      
      // Save chunks to storage
      const savedChunks = await Promise.all(
        processed.chunks.map((chunk, index) => 
          storage.createDocumentChunk({
            documentId: doc.id,
            chunkIndex: index,
            content: chunk.content,
            tokenCount: chunk.tokenCount,
            metadata: chunk.metadata,
          })
        )
      );

      // Generate embeddings with retry logic
      const embeddings = await this.generateEmbeddingsWithRetry(
        processed.chunks.map(c => c.content),
        savedChunks.map(c => c.id)
      );

      // Save embeddings to storage
      await Promise.all(
        embeddings.map(emb => 
          storage.createDocumentEmbedding({
            chunkId: emb.chunkId,
            embedding: JSON.stringify(emb.embedding),
            embeddingModel: this.embeddingModel,
          })
        )
      );

      // Mark as ready
      await storage.updateDocument(doc.id, '', {
        processingStatus: 'ready',
        retryCount: 0,
        nextRetryAt: null,
        processingError: null,
      });

      console.log(`[EmbeddingWorker] Successfully processed document ${doc.id}`);
    } catch (error: any) {
      console.error(`[EmbeddingWorker] Error processing document ${doc.id}:`, error);
      await this.handleProcessingError(doc, error);
    }
  }

  private async getDocumentText(doc: any): Promise<string> {
    // If we already have parsed text, use it
    if (doc.parsedTextPath && fs.existsSync(doc.parsedTextPath)) {
      return fs.readFileSync(doc.parsedTextPath, 'utf-8');
    }

    // Otherwise, extract it from the original file
    const processed = await this.processor.processFile(doc.filePath, doc.fileType);
    return processed.chunks.map(c => c.content).join('\n\n');
  }

  private async saveParsedText(docId: string, text: string): Promise<string> {
    const parsedDir = path.join(process.cwd(), 'uploads', 'parsed');
    if (!fs.existsSync(parsedDir)) {
      fs.mkdirSync(parsedDir, { recursive: true });
    }

    const parsedPath = path.join(parsedDir, `${docId}.txt`);
    fs.writeFileSync(parsedPath, text, 'utf-8');
    return parsedPath;
  }

  private async generateEmbeddingsWithRetry(
    texts: string[], 
    chunkIds: string[]
  ): Promise<Array<{ chunkId: string; embedding: number[] }>> {
    const results: Array<{ chunkId: string; embedding: number[] }> = [];
    
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      const chunkId = chunkIds[i];
      
      let delay = 500;
      let attempts = 0;
      
      while (attempts < 3) {
        try {
          const response = await this.openai.embeddings.create({
            model: this.embeddingModel,
            input: text,
          });
          
          results.push({
            chunkId,
            embedding: response.data[0].embedding,
          });
          
          break; // Success, move to next chunk
        } catch (error: any) {
          attempts++;
          const status = error?.status || error?.response?.status;
          
          if (status === 429 && attempts < 3) {
            console.log(`[EmbeddingWorker] Rate limited, retrying after ${delay}ms (attempt ${attempts}/3)`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2; // Exponential backoff
          } else {
            throw error; // Re-throw to trigger document-level retry
          }
        }
      }
    }
    
    return results;
  }

  private async handleProcessingError(doc: any, error: any) {
    const errorMessage = error?.message || String(error);
    const currentRetry = doc.retryCount || 0;

    // Check if it's a quota error
    const isQuotaError = error?.status === 429 || errorMessage.includes('quota') || errorMessage.includes('rate limit');

    if (currentRetry < MAX_RETRIES && isQuotaError) {
      // Schedule next retry with exponential backoff
      const minutes = Math.pow(2, currentRetry); // 1, 2, 4, 8, 16, 32, 64, 128 minutes
      const nextRetryAt = new Date(Date.now() + minutes * 60 * 1000);

      await storage.updateDocument(doc.id, '', {
        processingStatus: 'queued',
        retryCount: currentRetry + 1,
        nextRetryAt: nextRetryAt,
        processingError: `${errorMessage} (retry ${currentRetry + 1}/${MAX_RETRIES})`,
      });

      console.log(`[EmbeddingWorker] Scheduled retry for document ${doc.id} in ${minutes} minutes (attempt ${currentRetry + 1}/${MAX_RETRIES})`);
    } else {
      // Max retries exceeded or non-retryable error
      await storage.updateDocument(doc.id, '', {
        processingStatus: 'failed',
        processingError: errorMessage,
      });

      console.error(`[EmbeddingWorker] Document ${doc.id} failed permanently:`, errorMessage);
    }
  }
}

// Global worker instance
let workerInstance: EmbeddingWorker | null = null;

export function startEmbeddingWorker() {
  if (!workerInstance) {
    workerInstance = new EmbeddingWorker();
    workerInstance.start();
  }
  return workerInstance;
}

export function stopEmbeddingWorker() {
  if (workerInstance) {
    workerInstance.stop();
    workerInstance = null;
  }
}
