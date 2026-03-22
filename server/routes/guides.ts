/**
 * Study Guide Library Routes
 * 
 * Serves JIE-provided study materials that students can add to their document library.
 * When a student adds a guide, it creates a user_documents record + document_chunks
 * so the guide appears in their AssignmentsPanel with the standard checkbox flow.
 * 
 * Routes:
 *   GET  /api/guides/library          — List available guides (filtered by grade band)
 *   POST /api/guides/add-to-library   — Copy guide into user's document collection
 *   GET  /api/guides/:id              — Get full guide content (for preview)
 */

import { Router } from 'express';
import { db } from '../db';
import { studyGuides, userDocuments, documentChunks } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { storage } from '../storage';

const router = Router();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/guides/library — Browse available study guides
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.get('/library', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const gradeBand = (req.query.gradeBand as string) || 'College/Adult';
    const category = req.query.category as string | undefined;

    // Fetch all published guides
    let guides = await db.select({
      id: studyGuides.id,
      title: studyGuides.title,
      description: studyGuides.description,
      category: studyGuides.category,
      subcategory: studyGuides.subcategory,
      gradeBands: studyGuides.gradeBands,
      subject: studyGuides.subject,
      contentTokens: studyGuides.contentTokens,
      fileType: studyGuides.fileType,
      iconEmoji: studyGuides.iconEmoji,
      sortOrder: studyGuides.sortOrder,
      version: studyGuides.version,
    })
    .from(studyGuides)
    .where(eq(studyGuides.isPublished, true))
    .orderBy(studyGuides.sortOrder, studyGuides.title);

    // Filter by grade band (check if the guide's gradeBands array contains the requested band)
    guides = guides.filter(g => {
      const bands = g.gradeBands as string[];
      return bands && bands.some(b => 
        b.toLowerCase().includes(gradeBand.toLowerCase()) ||
        gradeBand.toLowerCase().includes(b.toLowerCase())
      );
    });

    // Filter by category if specified
    if (category) {
      guides = guides.filter(g => g.category === category);
    }

    // Check which guides the user has already added
    const userDocs = await db.select({ originalName: userDocuments.originalName })
      .from(userDocuments)
      .where(eq(userDocuments.userId, userId));
    
    const addedGuideNames = new Set(userDocs.map(d => d.originalName));

    // Annotate with "already added" flag
    const annotatedGuides = guides.map(g => ({
      ...g,
      alreadyAdded: addedGuideNames.has(`[JIE Guide] ${g.title}`),
    }));

    // Group by category for frontend display
    const grouped: Record<string, typeof annotatedGuides> = {};
    for (const guide of annotatedGuides) {
      if (!grouped[guide.category]) grouped[guide.category] = [];
      grouped[guide.category].push(guide);
    }

    res.json({
      guides: annotatedGuides,
      grouped,
      categories: Object.keys(grouped),
    });

  } catch (error: any) {
    console.error('[Guides] Library fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch study guides' });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/guides/add-to-library — Add guide to user's documents
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.post('/add-to-library', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { guideId } = req.body;
    if (!guideId) {
      return res.status(400).json({ error: 'guideId is required' });
    }

    // Fetch the guide
    const [guide] = await db.select()
      .from(studyGuides)
      .where(and(
        eq(studyGuides.id, guideId),
        eq(studyGuides.isPublished, true)
      ))
      .limit(1);

    if (!guide) {
      return res.status(404).json({ error: 'Study guide not found' });
    }

    // Check if user already has this guide
    const guideName = `[JIE Guide] ${guide.title}`;
    const existing = await db.select({ id: userDocuments.id })
      .from(userDocuments)
      .where(and(
        eq(userDocuments.userId, userId),
        eq(userDocuments.originalName, guideName)
      ))
      .limit(1);

    if (existing.length > 0) {
      return res.json({
        success: true,
        alreadyExists: true,
        documentId: existing[0].id,
        message: 'Guide already in your library',
      });
    }

    // Create a user_documents record for this guide
    // No expiration — JIE guides don't expire
    const document = await storage.uploadDocument(userId, {
      originalName: guideName,
      fileName: `jie-guide-${guide.id}.txt`,
      filePath: `guides/${guide.id}`, // Virtual path — content is in DB, not on disk
      fileType: 'guide',
      fileSize: guide.contentText.length,
      subject: guide.subject || undefined,
      grade: undefined,
      title: guide.title,
      description: guide.description || `JIE Study Guide: ${guide.subcategory || guide.category}`,
      language: 'en',
      processingStatus: 'ready', // Pre-processed — no extraction needed
    });

    console.log(`[Guides] 📚 Created user document ${document.id} for guide "${guide.title}" (user: ${userId})`);

    // Chunk the guide content and store — same pipeline as uploaded docs
    const chunks = chunkText(guide.contentText, 1000);
    
    for (let i = 0; i < chunks.length; i++) {
      await storage.createDocumentChunk({
        documentId: document.id,
        chunkIndex: i,
        content: chunks[i],
        tokenCount: estimateTokens(chunks[i]),
        metadata: { source: 'jie_guide', guideId: guide.id, version: guide.version },
      });
    }

    console.log(`[Guides] ✅ Added ${chunks.length} chunks for guide "${guide.title}" → user doc ${document.id}`);

    res.json({
      success: true,
      alreadyExists: false,
      documentId: document.id,
      title: guide.title,
      chunks: chunks.length,
      message: `"${guide.title}" added to your documents`,
    });

  } catch (error: any) {
    console.error('[Guides] Add to library error:', error);
    res.status(500).json({ error: 'Failed to add guide to your library' });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/guides/:id — Preview guide content
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.get('/:id', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const [guide] = await db.select()
      .from(studyGuides)
      .where(and(
        eq(studyGuides.id, req.params.id),
        eq(studyGuides.isPublished, true)
      ))
      .limit(1);

    if (!guide) {
      return res.status(404).json({ error: 'Study guide not found' });
    }

    // Return preview (first 2000 chars) + metadata
    res.json({
      id: guide.id,
      title: guide.title,
      description: guide.description,
      category: guide.category,
      subcategory: guide.subcategory,
      subject: guide.subject,
      iconEmoji: guide.iconEmoji,
      preview: guide.contentText.substring(0, 2000) + (guide.contentText.length > 2000 ? '...' : ''),
      totalLength: guide.contentText.length,
      contentTokens: guide.contentTokens,
    });

  } catch (error: any) {
    console.error('[Guides] Preview error:', error);
    res.status(500).json({ error: 'Failed to fetch guide preview' });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers (duplicated from documents.ts to avoid circular deps)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function chunkText(text: string, maxChunkSize: number = 1000): string[] {
  const chunks: string[] = [];
  let currentChunk = '';

  const paragraphs = text.split(/\n\n+/);

  for (const para of paragraphs) {
    if (currentChunk.length + para.length > maxChunkSize && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
    }

    if (para.length > maxChunkSize) {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = '';
      const sentences = para.split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > maxChunkSize && currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }
        currentChunk += sentence + ' ';
      }
    } else {
      currentChunk += para + '\n\n';
    }
  }

  if (currentChunk.trim()) chunks.push(currentChunk.trim());
  return chunks.filter(c => c.length > 0);
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export default router;
