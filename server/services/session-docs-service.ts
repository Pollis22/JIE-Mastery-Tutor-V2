/**
 * Session-Scoped Document Activation Service
 * 
 * Manages which documents are "active" (eligible for RAG retrieval) per voice session.
 * Documents are stored as "uploaded" by default and must be explicitly activated.
 * 
 * Feature flag: DOCS_REQUIRE_EXPLICIT_ACTIVATION (default: true)
 */

// Feature flag - when true, documents must be explicitly activated for retrieval
// When false, preserves legacy behavior where selected documents are automatically used
export const DOCS_REQUIRE_EXPLICIT_ACTIVATION = 
  process.env.DOCS_REQUIRE_EXPLICIT_ACTIVATION !== 'false';

// In-memory store for session-scoped active document IDs
// Key: sessionId, Value: Set of active document IDs
const sessionActiveDocsMap = new Map<string, Set<string>>();

// Track session metadata for logging
interface SessionDocsMeta {
  userId: string;
  createdAt: Date;
  lastUpdated: Date;
}
const sessionMetaMap = new Map<string, SessionDocsMeta>();

/**
 * Initialize active docs tracking for a new session
 */
export function initSessionDocs(sessionId: string, userId: string): void {
  sessionActiveDocsMap.set(sessionId, new Set());
  sessionMetaMap.set(sessionId, {
    userId,
    createdAt: new Date(),
    lastUpdated: new Date(),
  });
  
  console.log('[SessionDocs] Initialized session:', {
    sessionId,
    userId,
    featureFlag: DOCS_REQUIRE_EXPLICIT_ACTIVATION,
  });
}

/**
 * Get active document IDs for a session
 * Returns empty array if session not found or no docs activated
 */
export function getActiveDocIds(sessionId: string): string[] {
  const activeDocs = sessionActiveDocsMap.get(sessionId);
  return activeDocs ? Array.from(activeDocs) : [];
}

/**
 * Activate a document for a session (makes it eligible for RAG retrieval)
 */
export function activateDocForSession(
  sessionId: string, 
  docId: string, 
  userId: string
): { success: boolean; activeCount: number; reason?: string } {
  let activeDocs = sessionActiveDocsMap.get(sessionId);
  
  // Auto-initialize if session doesn't exist
  if (!activeDocs) {
    initSessionDocs(sessionId, userId);
    activeDocs = sessionActiveDocsMap.get(sessionId)!;
  }
  
  activeDocs.add(docId);
  
  const meta = sessionMetaMap.get(sessionId);
  if (meta) {
    meta.lastUpdated = new Date();
  }
  
  console.log('[SessionDocs] Document activated:', {
    sessionId,
    docId,
    userId,
    activeCount: activeDocs.size,
  });
  
  return { 
    success: true, 
    activeCount: activeDocs.size 
  };
}

/**
 * Deactivate a document for a session (removes it from RAG retrieval)
 */
export function deactivateDocForSession(
  sessionId: string, 
  docId: string, 
  userId: string
): { success: boolean; activeCount: number; reason?: string } {
  const activeDocs = sessionActiveDocsMap.get(sessionId);
  
  if (!activeDocs) {
    return { 
      success: false, 
      activeCount: 0, 
      reason: 'Session not found' 
    };
  }
  
  activeDocs.delete(docId);
  
  const meta = sessionMetaMap.get(sessionId);
  if (meta) {
    meta.lastUpdated = new Date();
  }
  
  console.log('[SessionDocs] Document deactivated:', {
    sessionId,
    docId,
    userId,
    activeCount: activeDocs.size,
  });
  
  return { 
    success: true, 
    activeCount: activeDocs.size 
  };
}

/**
 * Set all active docs for a session at once (replaces existing)
 */
export function setActiveDocsForSession(
  sessionId: string, 
  docIds: string[], 
  userId: string
): { success: boolean; activeCount: number } {
  sessionActiveDocsMap.set(sessionId, new Set(docIds));
  
  const meta = sessionMetaMap.get(sessionId);
  if (meta) {
    meta.lastUpdated = new Date();
  } else {
    sessionMetaMap.set(sessionId, {
      userId,
      createdAt: new Date(),
      lastUpdated: new Date(),
    });
  }
  
  console.log('[SessionDocs] Active docs set:', {
    sessionId,
    userId,
    docIds,
    activeCount: docIds.length,
  });
  
  return { 
    success: true, 
    activeCount: docIds.length 
  };
}

/**
 * Clear session docs tracking when session ends
 */
export function clearSessionDocs(sessionId: string): void {
  const activeDocs = sessionActiveDocsMap.get(sessionId);
  const activeCount = activeDocs?.size || 0;
  
  sessionActiveDocsMap.delete(sessionId);
  sessionMetaMap.delete(sessionId);
  
  console.log('[SessionDocs] Session cleared:', {
    sessionId,
    previousActiveCount: activeCount,
  });
}

/**
 * Check if a specific document is active for a session
 */
export function isDocActiveForSession(sessionId: string, docId: string): boolean {
  const activeDocs = sessionActiveDocsMap.get(sessionId);
  return activeDocs?.has(docId) ?? false;
}

/**
 * Get all active sessions count (for debugging/monitoring)
 */
export function getActiveSessionCount(): number {
  return sessionActiveDocsMap.size;
}

/**
 * Structured logging for RAG retrieval document selection
 */
export function logRagRetrievalDocsSelected(params: {
  sessionId: string;
  userId: string;
  activeDocCount: number;
  docIds: string[];
  reason: 'active_docs_only' | 'feature_flag_off' | 'no_active_docs' | 'legacy_mode';
}): void {
  console.log('[RAG] Retrieval docs selected:', JSON.stringify({
    timestamp: new Date().toISOString(),
    sessionId: params.sessionId,
    userId: params.userId,
    activeDocCount: params.activeDocCount,
    docIdHashes: params.docIds.map(id => id.substring(0, 8) + '...'),
    reason: params.reason,
  }));
}
