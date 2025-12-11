/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 * 
 * This source code is confidential and proprietary.
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */

import { db } from '../db';
import { userDocuments } from '@shared/schema';
import { lt } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

/**
 * Document Cleanup Service
 * Automatically deletes documents that have expired (6+ months old)
 */
export class DocumentCleanupService {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // Run daily

  /**
   * Start automatic cleanup service
   */
  start() {
    if (this.cleanupInterval) {
      console.log('[DocumentCleanup] Service already running');
      return;
    }

    console.log('[DocumentCleanup] 🧹 Starting automatic cleanup service');
    console.log('[DocumentCleanup] Will run every 24 hours');

    // Run immediately on start
    this.runCleanup().catch(err => {
      console.error('[DocumentCleanup] ❌ Initial cleanup failed:', err);
    });

    // Then run daily
    this.cleanupInterval = setInterval(() => {
      this.runCleanup().catch(err => {
        console.error('[DocumentCleanup] ❌ Scheduled cleanup failed:', err);
      });
    }, this.CLEANUP_INTERVAL_MS);
  }

  /**
   * Stop automatic cleanup service
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log('[DocumentCleanup] Service stopped');
    }
  }

  /**
   * Run cleanup of expired documents
   */
  async runCleanup(): Promise<void> {
    const startTime = Date.now();
    console.log('[DocumentCleanup] 🧹 Starting cleanup of expired documents...');

    try {
      // Find all documents with expiresAt in the past
      const expiredDocs = await db
        .select()
        .from(userDocuments)
        .where(lt(userDocuments.expiresAt, new Date()));

      if (expiredDocs.length === 0) {
        console.log('[DocumentCleanup] ✅ No expired documents found');
        return;
      }

      console.log(`[DocumentCleanup] Found ${expiredDocs.length} expired documents`);

      let deletedCount = 0;
      let errorCount = 0;

      for (const doc of expiredDocs) {
        try {
          // Delete file from disk
          if (doc.filePath && fs.existsSync(doc.filePath)) {
            fs.unlinkSync(doc.filePath);
            console.log(`[DocumentCleanup] 🗑️  Deleted file: ${doc.originalName}`);
          }

          // Delete document record (will cascade delete chunks and embeddings)
          await db
            .delete(userDocuments)
            .where(eq(userDocuments.id, doc.id));

          deletedCount++;
          console.log(`[DocumentCleanup] ✅ Deleted document: ${doc.id} (${doc.originalName})`);
        } catch (error) {
          errorCount++;
          console.error(`[DocumentCleanup] ❌ Failed to delete document ${doc.id}:`, error);
        }
      }

      const duration = Date.now() - startTime;
      console.log('[DocumentCleanup] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`[DocumentCleanup] ✅ Cleanup completed in ${duration}ms`);
      console.log(`[DocumentCleanup] - Documents deleted: ${deletedCount}`);
      console.log(`[DocumentCleanup] - Errors: ${errorCount}`);
      console.log('[DocumentCleanup] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    } catch (error) {
      console.error('[DocumentCleanup] ❌ Cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Manually trigger cleanup (for testing/admin use)
   */
  async manualCleanup(): Promise<{ deleted: number; errors: number }> {
    await this.runCleanup();
    return { deleted: 0, errors: 0 }; // Could enhance to return actual counts
  }
}

// Import eq function
import { eq } from 'drizzle-orm';

// Singleton instance
export const documentCleanupService = new DocumentCleanupService();
