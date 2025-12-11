# Voice Pipeline Code Audit Report

**Date:** December 11, 2025
**Auditor:** AI Code Audit
**Scope:** Full voice pipeline review for code quality issues

---

## Executive Summary

The voice pipeline has been significantly improved with robust error handling, session management, and timing configurations. However, several issues remain that need attention. The codebase shows evidence of iterative fixes that have addressed many "happy path" issues, but some edge cases and cleanup concerns persist.

**Overall Assessment:** Medium Risk - The major architectural issues have been addressed, but some resource cleanup and edge case handling needs improvement.

---

## Critical Issues (Must Fix Before Launch)

### None Found

Previous critical issues (stuck isProcessing flag, missing try/finally blocks) have been addressed with safety timeout mechanisms and proper cleanup patterns.

---

## High Priority Issues (Causes Poor User Experience)

### 1. [HIGH] Deepgram Connection Stale Reference After Reconnection

**File:** `server/routes/custom-voice-ws.ts`
**Line(s):** 286, 950-1016

**Current Code:**
```typescript
let reconnectAttempts = 0;
// ... later in reconnection code
const newConnection = await reconnectDeepgram();
state.deepgramConnection = newConnection;
```

**Problem:** When Deepgram reconnection succeeds, the keepAliveInterval reference in DeepgramConnection may become stale. The interval is created inside the original connection but returned as a property. After reconnection, the old interval may still be running if not properly cleared.

**Risk if not fixed:** Memory leak and duplicate keepAlive messages being sent, potentially confusing Deepgram or causing billing issues.

**Recommended Fix:**
Add explicit interval cleanup before creating new connection:
```typescript
// Clear old connection intervals before reconnecting
if (state.deepgramConnection?.keepAliveInterval) {
  clearInterval(state.deepgramConnection.keepAliveInterval);
}
state.deepgramConnection?.close();
```

---

### 2. [HIGH] Unbounded Transcript Array Growth

**File:** `server/routes/custom-voice-ws.ts`
**Line(s):** 54, 488-495

**Current Code:**
```typescript
state.transcript.push(transcriptEntry);
```

**Problem:** The transcript array grows unboundedly during long sessions. For extended tutoring sessions (30+ minutes), this could consume significant memory.

**Risk if not fixed:** Memory exhaustion for long sessions, potential server slowdown.

**Recommended Fix:**
```typescript
const MAX_TRANSCRIPT_ENTRIES = 500;
state.transcript.push(transcriptEntry);
if (state.transcript.length > MAX_TRANSCRIPT_ENTRIES) {
  // Persist older entries before discarding
  await persistTranscript(state.sessionId, state.transcript.slice(0, 100));
  state.transcript = state.transcript.slice(-MAX_TRANSCRIPT_ENTRIES + 100);
}
```

---

### 3. [HIGH] Audio Data Sent During Reconnection May Be Lost

**File:** `server/routes/custom-voice-ws.ts`
**Line(s):** 1790-1810

**Current Code:**
```typescript
case "audio":
  if (state.isReconnecting) {
    console.log("[Custom Voice] ⏸️ Dropping audio during reconnection");
    return;
  }
  if (state.deepgramConnection) {
    const buffer = Buffer.from(message.data, "base64");
    state.deepgramConnection.send(buffer);
  }
```

**Problem:** Audio data received during reconnection is dropped entirely. Students speaking during the 1-2 second reconnection window will have their speech ignored.

**Risk if not fixed:** Lost student speech during network hiccups, causing frustration.

**Recommended Fix:**
Buffer audio during reconnection and send once connected:
```typescript
const reconnectionAudioBuffer: Buffer[] = [];

case "audio":
  if (state.isReconnecting) {
    // Buffer audio during reconnection (limit to 2 seconds of audio)
    const buffer = Buffer.from(message.data, "base64");
    if (reconnectionAudioBuffer.length < 60) { // ~60 chunks ≈ 2 seconds
      reconnectionAudioBuffer.push(buffer);
    }
    return;
  }
  // After reconnection, flush buffer
  if (reconnectionAudioBuffer.length > 0 && state.deepgramConnection) {
    for (const buffered of reconnectionAudioBuffer) {
      state.deepgramConnection.send(buffered);
    }
    reconnectionAudioBuffer.length = 0;
  }
```

---

## Medium Priority Issues (Suboptimal but Functional)

### 4. [MEDIUM] Console Logging Volume in Production

**File:** `server/services/deepgram-service.ts`
**Line(s):** 177-197, 334-336

**Current Code:**
```typescript
console.log('[Deepgram] 📥 RAW TRANSCRIPT EVENT:', JSON.stringify({...}, null, 2));
console.log('[Deepgram] 📝 Parsed transcript data:', {...});
if (audioChunkCount % 100 === 0) {
  console.log(`[Deepgram] 🎤 Audio chunk #${audioChunkCount} sent`);
}
```

**Problem:** Extensive logging in production can impact performance and fill logs. Every transcript event logs full JSON.

**Risk if not fixed:** Log bloat, slight performance impact, harder to find critical errors in logs.

**Recommended Fix:**
```typescript
const isDev = process.env.NODE_ENV === 'development';
if (isDev) {
  console.log('[Deepgram] 📥 RAW TRANSCRIPT EVENT:', JSON.stringify({...}, null, 2));
}
// Always log at summary level in production
console.log(`[Deepgram] Transcript: ${isFinal ? 'FINAL' : 'interim'} (${transcript?.length || 0} chars)`);
```

---

### 5. [MEDIUM] Hardcoded Timing Values

**File:** `server/routes/custom-voice-ws.ts`
**Line(s):** 21-35, 282, 457

**Current Code:**
```typescript
const TIMING_CONFIG = {
  SERVER_DELAY_COMPLETE_THOUGHT: 1200,
  SERVER_DELAY_INCOMPLETE_THOUGHT: 2500,
  POST_INTERRUPT_BUFFER: 2500,
};
const UTTERANCE_COMPLETE_DELAY_MS = 2500;
const MAX_PROCESSING_TIME_MS = 30000;
```

**Problem:** All timing values are hardcoded. Different users, network conditions, and use cases may need different settings.

**Risk if not fixed:** Unable to tune performance without code changes.

**Recommended Fix:**
```typescript
const TIMING_CONFIG = {
  SERVER_DELAY_COMPLETE_THOUGHT: parseInt(process.env.VOICE_DELAY_COMPLETE || '1200'),
  SERVER_DELAY_INCOMPLETE_THOUGHT: parseInt(process.env.VOICE_DELAY_INCOMPLETE || '2500'),
  POST_INTERRUPT_BUFFER: parseInt(process.env.VOICE_INTERRUPT_BUFFER || '2500'),
  MAX_PROCESSING_TIME_MS: parseInt(process.env.VOICE_MAX_PROCESSING || '30000'),
};
```

---

### 6. [MEDIUM] Missing Cleanup for persistInterval on Error

**File:** `server/routes/custom-voice-ws.ts`
**Line(s):** 320-325

**Current Code:**
```typescript
const persistInterval = setInterval(async () => {
  if (state.sessionId && state.transcript.length > 0) {
    await persistTranscript(state.sessionId, state.transcript);
  }
}, 10000);
```

**Problem:** The persistInterval is created but only cleared in the close handler. If an error occurs before close, the interval continues running.

**Risk if not fixed:** Orphaned intervals, minor memory leak.

**Recommended Fix:**
Store reference in state and clear in all cleanup paths:
```typescript
state.persistInterval = persistInterval;

// In all cleanup/error paths:
if (state.persistInterval) {
  clearInterval(state.persistInterval);
  state.persistInterval = null;
}
```

---

### 7. [MEDIUM] Race Condition in Transcript Accumulation Timer

**File:** `server/routes/custom-voice-ws.ts`
**Line(s):** 280-283

**Current Code:**
```typescript
let transcriptAccumulationTimer: NodeJS.Timeout | null = null;

// Later:
if (transcriptAccumulationTimer) {
  clearTimeout(transcriptAccumulationTimer);
}
transcriptAccumulationTimer = setTimeout(() => {...}, UTTERANCE_COMPLETE_DELAY_MS);
```

**Problem:** In rare cases with rapid transcript events, the timer could be cleared after being set but before the callback references the closure variables correctly.

**Risk if not fixed:** Rare edge case where transcript might not be processed.

**Recommended Fix:**
Use atomic flag pattern:
```typescript
let transcriptTimerVersion = 0;

const currentVersion = ++transcriptTimerVersion;
transcriptAccumulationTimer = setTimeout(() => {
  if (currentVersion !== transcriptTimerVersion) return; // Stale timer
  // ... rest of logic
}, UTTERANCE_COMPLETE_DELAY_MS);
```

---

## Low Priority Issues (Code Smell)

### 8. [LOW] Inconsistent Error Response Format

**File:** `server/routes/custom-voice-ws.ts`
**Line(s):** Various

**Problem:** Error responses use different formats:
- `{ type: "error", error: "message" }`
- `{ type: "session_ended", reason: "...", message: "..." }`

**Recommended Fix:** Standardize error response format with error code enum.

---

### 9. [LOW] Magic Numbers in VAD Configuration

**File:** `server/services/deepgram-service.ts`
**Line(s):** 128

**Current Code:**
```typescript
vad_threshold: 0.15,  // VERY LOW threshold for quiet speech detection
```

**Problem:** Magic number with comment explaining it, but no easy way to tune per-user.

**Recommended Fix:** Consider making VAD threshold adaptive or configurable per session.

---

### 10. [LOW] Duplicate Language Name Mapping

**File:** `server/services/ai-service.ts` and `server/routes/custom-voice-ws.ts`

**Problem:** Language name mappings (code to full name) are duplicated across files.

**Recommended Fix:** Extract to shared constant file:
```typescript
// shared/constants/languages.ts
export const LANGUAGE_NAMES: Record<string, string> = {...};
```

---

## Security Observations

### Positive Findings:
1. ✅ Session-based WebSocket authentication properly implemented
2. ✅ Rate limiting with IP-based tracking
3. ✅ Client userId is never trusted (always uses authenticated session)
4. ✅ Session ownership validation before processing
5. ✅ No API keys exposed in client code
6. ✅ Content moderation with violation tracking

### No Critical Security Issues Found

---

## Recommendations (Best Practices)

1. **Add Health Monitoring Endpoint**: Create `/api/voice/health` that reports active WebSocket count, average session duration, and error rates.

2. **Implement Structured Logging**: Replace console.log with a logging library (pino, winston) with log levels and JSON output for production.

3. **Add Metrics Collection**: Track key metrics like:
   - Time to first transcript
   - Average response latency
   - Deepgram reconnection frequency
   - TTS generation time

4. **Create Connection Pool for Heavy Operations**: Consider pooling TTS/AI service connections for high-traffic scenarios.

5. **Add Circuit Breaker Pattern**: If Deepgram/AI service fails repeatedly, fail fast instead of queueing requests.

---

## Summary

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 0 | All previously identified critical issues fixed |
| High | 3 | Needs attention before scaling |
| Medium | 4 | Should be addressed in next iteration |
| Low | 3 | Cleanup for maintainability |

The voice pipeline is in a reasonably good state with proper error handling and session management. The main areas for improvement are resource cleanup for long sessions and edge case handling during reconnection scenarios.
