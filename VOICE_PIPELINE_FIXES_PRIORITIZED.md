# Voice Pipeline Fixes - Prioritized List

**Date:** December 11, 2025

## Priority Order

### Tier 1: Must Fix (High Impact, High Risk)

1. **[HIGH-1] Deepgram Connection Stale Reference After Reconnection**
   - **Impact:** Memory leak, duplicate keepAlive messages
   - **Effort:** 30 minutes
   - **File:** `server/routes/custom-voice-ws.ts`
   - **Action:** Clear old connection intervals before creating new connection

2. **[HIGH-2] Unbounded Transcript Array Growth**
   - **Impact:** Memory exhaustion for long sessions
   - **Effort:** 1 hour
   - **File:** `server/routes/custom-voice-ws.ts`
   - **Action:** Implement transcript rotation with persistence

3. **[HIGH-3] Audio Data Lost During Reconnection**
   - **Impact:** Lost student speech, poor UX
   - **Effort:** 1.5 hours
   - **File:** `server/routes/custom-voice-ws.ts`
   - **Action:** Buffer audio during reconnection, replay after

---

### Tier 2: Should Fix (Medium Impact)

4. **[MEDIUM-4] Console Logging Volume**
   - **Impact:** Log bloat, minor performance
   - **Effort:** 45 minutes
   - **Files:** Multiple
   - **Action:** Add log level controls, reduce verbosity in production

5. **[MEDIUM-5] Hardcoded Timing Values**
   - **Impact:** Unable to tune without code changes
   - **Effort:** 1 hour
   - **File:** `server/routes/custom-voice-ws.ts`
   - **Action:** Make timing configurable via environment variables

6. **[MEDIUM-6] Missing Cleanup for persistInterval**
   - **Impact:** Minor memory leak
   - **Effort:** 30 minutes
   - **File:** `server/routes/custom-voice-ws.ts`
   - **Action:** Store reference in state, clear in all cleanup paths

7. **[MEDIUM-7] Race Condition in Transcript Timer**
   - **Impact:** Rare lost transcripts
   - **Effort:** 30 minutes
   - **File:** `server/routes/custom-voice-ws.ts`
   - **Action:** Use versioned timer pattern

---

### Tier 3: Nice to Have (Low Impact)

8. **[LOW-8] Inconsistent Error Response Format**
   - **Impact:** Developer experience
   - **Effort:** 1 hour
   - **Action:** Standardize error format

9. **[LOW-9] Magic Numbers in VAD Config**
   - **Impact:** Tunability
   - **Effort:** 30 minutes
   - **Action:** Extract to config

10. **[LOW-10] Duplicate Language Mappings**
    - **Impact:** Maintainability
    - **Effort:** 30 minutes
    - **Action:** Extract to shared constants

---

## Implementation Timeline

### Sprint 1 (Immediate - Before Scale)
- Fix HIGH-1, HIGH-2, HIGH-3
- Estimated: 3 hours

### Sprint 2 (Next Iteration)
- Fix MEDIUM-4, MEDIUM-5, MEDIUM-6, MEDIUM-7
- Estimated: 2.5 hours

### Sprint 3 (Cleanup)
- Fix LOW-8, LOW-9, LOW-10
- Estimated: 2 hours

---

## Quick Reference

| ID | Issue | Severity | Effort | Status |
|----|-------|----------|--------|--------|
| HIGH-1 | Stale Deepgram Reference | High | 30m | TODO |
| HIGH-2 | Unbounded Transcript | High | 1h | TODO |
| HIGH-3 | Audio Lost in Reconnect | High | 1.5h | TODO |
| MED-4 | Logging Volume | Medium | 45m | TODO |
| MED-5 | Hardcoded Timing | Medium | 1h | TODO |
| MED-6 | persistInterval Cleanup | Medium | 30m | TODO |
| MED-7 | Timer Race Condition | Medium | 30m | TODO |
| LOW-8 | Error Format | Low | 1h | TODO |
| LOW-9 | Magic Numbers | Low | 30m | TODO |
| LOW-10 | Duplicate Mappings | Low | 30m | TODO |

---

## Notes

- All critical issues from the original developer's work have been addressed
- The codebase shows good patterns for error handling and session management
- Main focus should be on resource cleanup for production scaling
- Security implementation is solid with proper session validation
