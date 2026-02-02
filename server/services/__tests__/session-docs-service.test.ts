/**
 * Session Documents Service Tests
 * Tests for document activation/deactivation and RAG retrieval gating
 * 
 * Run with: npx tsx server/services/__tests__/session-docs-service.test.ts
 */

import {
  DOCS_REQUIRE_EXPLICIT_ACTIVATION,
  initSessionDocs,
  getActiveDocIds,
  activateDocForSession,
  deactivateDocForSession,
  setActiveDocsForSession,
  isDocActiveForSession,
  clearSessionDocs,
} from '../session-docs-service';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error: any) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
    failed++;
  }
}

function expect(actual: any) {
  return {
    toBe(expected: any) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
      }
    },
    toEqual(expected: any) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
      }
    },
    toBeTrue() {
      if (actual !== true) {
        throw new Error(`Expected true but got ${JSON.stringify(actual)}`);
      }
    },
    toBeFalse() {
      if (actual !== false) {
        throw new Error(`Expected false but got ${JSON.stringify(actual)}`);
      }
    },
    toHaveLength(expected: number) {
      if (!Array.isArray(actual) || actual.length !== expected) {
        throw new Error(`Expected array of length ${expected} but got ${JSON.stringify(actual)}`);
      }
    },
  };
}

console.log('\n🧪 Session Documents Service Tests\n');
console.log('=' .repeat(60));

// Test Feature Flag
console.log('\n📝 Testing Feature Flag:\n');

test('DOCS_REQUIRE_EXPLICIT_ACTIVATION should be true by default', () => {
  expect(DOCS_REQUIRE_EXPLICIT_ACTIVATION).toBeTrue();
});

// Test Session Initialization
console.log('\n📝 Testing Session Initialization:\n');

test('initSessionDocs should create empty active docs set', () => {
  const sessionId = 'test-session-init-1';
  const userId = 'user-123';
  
  initSessionDocs(sessionId, userId);
  const activeDocIds = getActiveDocIds(sessionId);
  
  expect(activeDocIds).toHaveLength(0);
  
  // Cleanup
  clearSessionDocs(sessionId);
});

test('getActiveDocIds should return empty array for unknown session', () => {
  const activeDocIds = getActiveDocIds('nonexistent-session');
  expect(activeDocIds).toHaveLength(0);
});

// Test Document Activation
console.log('\n📝 Testing Document Activation:\n');

test('activateDocForSession should add document to active set', () => {
  const sessionId = 'test-session-activate-1';
  const userId = 'user-123';
  const docId = 'doc-abc';
  
  initSessionDocs(sessionId, userId);
  const result = activateDocForSession(sessionId, docId, userId);
  
  expect(result.success).toBeTrue();
  expect(result.activeCount).toBe(1);
  
  const activeDocIds = getActiveDocIds(sessionId);
  expect(activeDocIds).toHaveLength(1);
  expect(activeDocIds[0]).toBe(docId);
  
  // Cleanup
  clearSessionDocs(sessionId);
});

test('activateDocForSession should auto-initialize session if not exists', () => {
  const sessionId = 'test-session-auto-init';
  const userId = 'user-123';
  const docId = 'doc-xyz';
  
  // Don't call initSessionDocs first
  const result = activateDocForSession(sessionId, docId, userId);
  
  expect(result.success).toBeTrue();
  expect(result.activeCount).toBe(1);
  
  // Cleanup
  clearSessionDocs(sessionId);
});

test('activating same document twice should not duplicate', () => {
  const sessionId = 'test-session-no-dup';
  const userId = 'user-123';
  const docId = 'doc-same';
  
  initSessionDocs(sessionId, userId);
  activateDocForSession(sessionId, docId, userId);
  const result = activateDocForSession(sessionId, docId, userId);
  
  expect(result.activeCount).toBe(1); // Still just 1
  
  // Cleanup
  clearSessionDocs(sessionId);
});

// Test Document Deactivation
console.log('\n📝 Testing Document Deactivation:\n');

test('deactivateDocForSession should remove document from active set', () => {
  const sessionId = 'test-session-deactivate-1';
  const userId = 'user-123';
  const docId = 'doc-remove';
  
  initSessionDocs(sessionId, userId);
  activateDocForSession(sessionId, docId, userId);
  
  const result = deactivateDocForSession(sessionId, docId, userId);
  
  expect(result.success).toBeTrue();
  expect(result.activeCount).toBe(0);
  
  const activeDocIds = getActiveDocIds(sessionId);
  expect(activeDocIds).toHaveLength(0);
  
  // Cleanup
  clearSessionDocs(sessionId);
});

test('deactivating non-existent doc should succeed gracefully', () => {
  const sessionId = 'test-session-deactivate-nonexistent';
  const userId = 'user-123';
  
  initSessionDocs(sessionId, userId);
  const result = deactivateDocForSession(sessionId, 'nonexistent-doc', userId);
  
  expect(result.success).toBeTrue();
  expect(result.activeCount).toBe(0);
  
  // Cleanup
  clearSessionDocs(sessionId);
});

test('deactivating from unknown session should fail gracefully', () => {
  const result = deactivateDocForSession('unknown-session', 'doc-123', 'user-123');
  
  expect(result.success).toBeFalse();
  expect(result.reason).toBe('Session not found');
});

// Test Batch Operations
console.log('\n📝 Testing Batch Operations:\n');

test('setActiveDocsForSession should replace all active docs', () => {
  const sessionId = 'test-session-batch';
  const userId = 'user-123';
  
  initSessionDocs(sessionId, userId);
  activateDocForSession(sessionId, 'old-doc', userId);
  
  const newDocs = ['new-doc-1', 'new-doc-2', 'new-doc-3'];
  const result = setActiveDocsForSession(sessionId, newDocs, userId);
  
  expect(result.success).toBeTrue();
  expect(result.activeCount).toBe(3);
  
  const activeDocIds = getActiveDocIds(sessionId);
  expect(activeDocIds).toHaveLength(3);
  expect(isDocActiveForSession(sessionId, 'old-doc')).toBeFalse();
  expect(isDocActiveForSession(sessionId, 'new-doc-1')).toBeTrue();
  
  // Cleanup
  clearSessionDocs(sessionId);
});

test('setActiveDocsForSession with empty array should clear all', () => {
  const sessionId = 'test-session-clear-batch';
  const userId = 'user-123';
  
  initSessionDocs(sessionId, userId);
  activateDocForSession(sessionId, 'doc-1', userId);
  activateDocForSession(sessionId, 'doc-2', userId);
  
  const result = setActiveDocsForSession(sessionId, [], userId);
  
  expect(result.success).toBeTrue();
  expect(result.activeCount).toBe(0);
  
  // Cleanup
  clearSessionDocs(sessionId);
});

// Test isDocActiveForSession
console.log('\n📝 Testing Document Active Check:\n');

test('isDocActiveForSession should return true for active doc', () => {
  const sessionId = 'test-session-check-active';
  const userId = 'user-123';
  const docId = 'active-doc';
  
  initSessionDocs(sessionId, userId);
  activateDocForSession(sessionId, docId, userId);
  
  expect(isDocActiveForSession(sessionId, docId)).toBeTrue();
  
  // Cleanup
  clearSessionDocs(sessionId);
});

test('isDocActiveForSession should return false for inactive doc', () => {
  const sessionId = 'test-session-check-inactive';
  const userId = 'user-123';
  
  initSessionDocs(sessionId, userId);
  
  expect(isDocActiveForSession(sessionId, 'inactive-doc')).toBeFalse();
  
  // Cleanup
  clearSessionDocs(sessionId);
});

test('isDocActiveForSession should return false for unknown session', () => {
  expect(isDocActiveForSession('unknown-session', 'any-doc')).toBeFalse();
});

// Test Session Cleanup
console.log('\n📝 Testing Session Cleanup:\n');

test('clearSessionDocs should remove all session data', () => {
  const sessionId = 'test-session-cleanup';
  const userId = 'user-123';
  
  initSessionDocs(sessionId, userId);
  activateDocForSession(sessionId, 'doc-1', userId);
  activateDocForSession(sessionId, 'doc-2', userId);
  
  clearSessionDocs(sessionId);
  
  const activeDocIds = getActiveDocIds(sessionId);
  expect(activeDocIds).toHaveLength(0);
});

// Retrieval Gating Scenario Tests
console.log('\n📝 Testing RAG Retrieval Gating Scenarios:\n');

test('SCENARIO: 2 docs uploaded, 0 active → retrieval returns 0 docs', () => {
  const sessionId = 'test-rag-scenario-1';
  const userId = 'user-123';
  
  // Initialize session (simulating 2 docs uploaded but none activated)
  initSessionDocs(sessionId, userId);
  
  // Get active docs for retrieval
  const activeDocIds = getActiveDocIds(sessionId);
  
  // Should return 0 docs for RAG retrieval
  expect(activeDocIds).toHaveLength(0);
  
  // Cleanup
  clearSessionDocs(sessionId);
});

test('SCENARIO: 2 docs uploaded, doc1 active → retrieval returns doc1 only', () => {
  const sessionId = 'test-rag-scenario-2';
  const userId = 'user-123';
  
  initSessionDocs(sessionId, userId);
  
  // Activate only doc1 (doc2 is uploaded but not active)
  activateDocForSession(sessionId, 'doc-1', userId);
  
  const activeDocIds = getActiveDocIds(sessionId);
  
  expect(activeDocIds).toHaveLength(1);
  expect(activeDocIds[0]).toBe('doc-1');
  expect(isDocActiveForSession(sessionId, 'doc-2')).toBeFalse();
  
  // Cleanup
  clearSessionDocs(sessionId);
});

test('SCENARIO: Upload during session → doc in uploaded state (not active)', () => {
  const sessionId = 'test-rag-scenario-3';
  const userId = 'user-123';
  
  initSessionDocs(sessionId, userId);
  
  // Simulate: User uploads doc during session but doesn't activate it
  // The doc exists in storage, but not in activeDocIds
  const uploadedDocId = 'new-upload-doc';
  
  // Check it's not automatically active
  expect(isDocActiveForSession(sessionId, uploadedDocId)).toBeFalse();
  
  // Cleanup
  clearSessionDocs(sessionId);
});

test('SCENARIO: Activate during session → affects next retrieval call', () => {
  const sessionId = 'test-rag-scenario-4';
  const userId = 'user-123';
  
  initSessionDocs(sessionId, userId);
  
  // Initially no active docs
  expect(getActiveDocIds(sessionId)).toHaveLength(0);
  
  // User activates a doc mid-session
  activateDocForSession(sessionId, 'mid-session-doc', userId);
  
  // Next retrieval call should include it
  const activeDocIds = getActiveDocIds(sessionId);
  expect(activeDocIds).toHaveLength(1);
  expect(activeDocIds[0]).toBe('mid-session-doc');
  
  // Cleanup
  clearSessionDocs(sessionId);
});

// SUMMARY
console.log('\n' + '=' .repeat(60));
console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 All tests passed!\n');
}
