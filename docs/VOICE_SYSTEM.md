# JIE Mastery Voice System Documentation

**Last Updated:** January 27, 2026

This document provides comprehensive technical documentation for the JIE Mastery AI Tutor voice system, covering the session lifecycle, billing model, stability hardening features, and operational guidance.

---

## 1. Voice Session Lifecycle

### Full Lifecycle Flow

```
Session Start → Live STT → LLM Response → TTS Playback → Session Finalize → Cleanup
```

#### Detailed Steps:

1. **Session Start**
   - Client initiates WebSocket connection to `/api/custom-voice-ws`
   - Server validates authentication, subscription status, and minute balance
   - Session ID generated and stored in `realtime_sessions` table
   - STT provider (AssemblyAI Universal-Streaming) connection established
   - Client microphone defaults to ON (voice mode)

2. **Live Speech-to-Text (STT)**
   - Client streams PCM16 audio (16-bit, 16kHz, Mono) via WebSocket
   - AssemblyAI processes audio in real-time
   - Partial and final transcripts sent back to client
   - Stability features (lexical grace, ambient suppression) filter low-quality input

3. **LLM Response Generation**
   - Final transcript sent to Claude Sonnet 4 with tutor context
   - Grade-based max_tokens applied (K-2: 120, 3-5: 150, 6-8: 175, 9-12: 200, College: 300)
   - Response streamed back for low-latency TTS

4. **TTS Playback**
   - ElevenLabs Turbo v2.5 generates audio from LLM response
   - Age-specific voices selected based on tutor band
   - Audio streamed to client for playback

5. **Session Finalization**
   - Triggered by client disconnect, explicit end, or timeout
   - **Critical:** `finalizeSession()` uses separate try/catch blocks for each operation
   - Database session update, minute deduction, and cleanup handled independently
   - **Guarantee:** `session_ended` event is ALWAYS emitted to client, even if billing fails

6. **Cleanup**
   - STT connection closed gracefully
   - WebSocket resources released
   - Session marked as ended in database

### Session Teardown Guarantees

The `finalizeSession()` function is hardened to **never throw** and **always complete**:

- **DB Write Failure:** Logged with reconciliation marker, cleanup continues
- **Minute Deduction Failure:** Logged with `RECONCILIATION NEEDED` marker, cleanup continues
- **Email Failure:** Logged, does not block teardown
- **Return Value:** `{ success: boolean, dbWriteFailed?: boolean, minuteDeductionFailed?: boolean }`

```
[Custom Voice] ⚠️ DB write failed during finalization...
[Custom Voice] 🔄 RECONCILIATION NEEDED: sessionId=..., userId=..., minutes=...
```

---

## 2. Minutes & Billing Model

### Authoritative Field Priority Order

When determining a user's available minutes, the system checks fields in this exact order:

1. **Trial Status** (`is_trial_active` / `trial_active`)
   - If active, user has trial minutes (typically 30 minutes)
   - Trial is account-based with device/IP abuse prevention

2. **Subscription Limit** (`subscription_minutes_limit`)
   - If non-null, this is the authoritative monthly limit
   - Set based on Stripe subscription tier

3. **Monthly Allocation** (`monthly_voice_minutes`)
   - Fallback monthly allocation if no subscription limit set
   - Used for legacy or special accounts

4. **Bonus/Purchased Minutes** (additive pools)
   - One-time purchases stored in `minute_purchases` table
   - Rollover minutes that don't expire monthly
   - Added on top of subscription allocation

### Important Notes

- **No Hard-Coded Defaults:** The system does NOT silently apply a 60-minute default
- **Explicit Fallbacks Only:** If no valid minute source exists, access is denied with clear error
- **Test Accounts:** Internal test accounts may have large limits (e.g., 9999 minutes) for QA
- **Minute Display:** UI shows remaining minutes from the highest-priority active source

### Billing Safety

- Minute deduction failures are logged but do not block session teardown
- Reconciliation markers enable manual correction if billing errors occur
- Failed deductions logged as: `[Custom Voice] 🔄 RECONCILIATION NEEDED: sessionId=..., userId=..., minutes=...`

---

## 3. Voice Stability Hardening Features

These are **global stability features** applied to all users regardless of age band. They improve audio reliability and reduce false triggers.

### Feature Flags (All Default OFF)

| Flag | Description |
|------|-------------|
| `VOICE_BG_NOISE_COACHING` | Background noise coaching prompts |
| `VOICE_AMBIENT_SUPPRESS` | Ambient speech suppression |
| `LEXICAL_GRACE_ENABLED` | 300ms lexical grace period |
| `VITE_MIC_WATCHDOG_ENABLED` | Proactive mic health monitoring |

### Mic Watchdog (Step 5a)

- **Interval:** 5 seconds
- **Checks:** MediaStreamTrack `readyState === 'live'` and `enabled === true`
- **Recovery:** Automatic `attemptMicRecovery()` if track is degraded
- **Logging:** `[MicWatchdog] Track degraded, attempting recovery...`

### Lexical Grace Period (Step 4)

- **Duration:** ~300ms grace window
- **Purpose:** Prevents mid-word turn finalization
- **Trigger:** Applied after STT final transcript received
- **Effect:** Waits for potential continuation before triggering LLM

### Ambient Speech Suppression (Step 3)

- **Word Count:** Rejects utterances with fewer than 2 words
- **Vowel Check:** Rejects vowel-less fragments (likely noise)
- **Logging:** `[Ambient] Suppressed short/fragment utterance: "..."`

### Background Noise Coaching (Step 2)

- **Rolling Window:** 25 seconds
- **Event Threshold:** 6 noise events trigger coaching prompt
- **Cooldown:** 2 minutes between coaching prompts
- **Non-Blocking:** Coaching is a gentle reminder, does not interrupt session

### Ghost/Fragment Utterance Handling

- Short or low-signal turns are filtered before LLM processing
- Prevents AI from responding to accidental sounds
- Configured via ambient suppression thresholds

---

## 4. Tutor Band Behavior

### Grade-Based Response Depth

Response length (max_tokens) varies by tutor band:

| Band | max_tokens | Rationale |
|------|------------|-----------|
| K-2 | 120 | Short, simple responses for young learners |
| Grades 3-5 | 150 | Slightly longer, age-appropriate |
| Grades 6-8 | 175 | More detailed explanations |
| Grades 9-12 | 200 | Complex concepts, deeper exploration |
| College/Adult | 300 | Full academic depth, unchanged |

### Pedagogical vs. Stability Layers

**Stability features** (Section 3) are applied globally and affect audio processing:
- Mic watchdog, lexical grace, ambient suppression
- These do NOT change based on age band

**Pedagogical features** are tutor-band specific:
- Response depth (max_tokens)
- Patience thresholds (K-2 gets higher patience via `TURN_POLICY_K2_ENABLED`)
- Vocabulary complexity and explanation style
- Encouragement frequency and tone

### K-2 Turn Policy

When `TURN_POLICY_K2_ENABLED` is active:
- Extended patience for slower speakers
- More frequent positive reinforcement
- Simpler vocabulary in responses

### College/Adult Band

- Full academic response depth (300 tokens)
- No simplified vocabulary adjustments
- Pacing and response depth intentionally unchanged from standard academic discourse

---

## 5. Known Non-Blocking Errors

The following errors are logged but do NOT impact user experience:

### Billing Reconciliation Issues

- **Cause:** Database write failure during minute deduction
- **Impact:** Minutes not deducted, session continues normally
- **Log:** `[Custom Voice] 🔄 RECONCILIATION NEEDED: sessionId=..., userId=..., minutes=...`
- **Resolution:** Manual reconciliation via admin dashboard

### Email Delivery Failures

- **Cause:** Resend API timeout or error during session summary email
- **Impact:** User doesn't receive email, session unaffected
- **Log:** `[Email] Failed to send session summary: ...`

### STT Reconnection Events

- **Cause:** Temporary network hiccup to AssemblyAI
- **Impact:** Brief gap in transcription, auto-reconnects
- **Log:** `[STT] Reconnecting to AssemblyAI...`

### Session Teardown Guarantees

- Session teardown and UI cleanup are **NEVER blocked** by non-critical errors
- `session_ended` event is always emitted to client
- User sees clean session end regardless of backend issues

---

## 6. Practice-Lessons Feature Status

### Current Status: Active (Feature-Flagged)

The practice-lessons system provides structured learning exercises alongside conversational tutoring.

### Endpoints

| Endpoint | Status | Description |
|----------|--------|-------------|
| `GET /api/practice-lessons` | Active | List available lessons |
| `GET /api/practice-lessons/:id` | Active | Get lesson details |
| `POST /api/practice-lessons/:id/start` | Active | Start a lesson session |
| `POST /api/practice-lessons/:id/complete` | Active | Mark lesson complete |

### Error Handling

- Missing lesson data returns 404 with clear message
- Backend errors do NOT block core tutoring experience
- UI gracefully handles unavailable lessons

### Integration with Voice

- Practice lessons can be referenced during voice sessions
- Document RAG pulls lesson content for context
- Lesson progress tracked separately from voice minutes

---

## 7. Operational Notes

### Troubleshooting / Debugging Guide

#### User Reports "Freezing"

1. **Check Session Finalize Logs**
   - Search for: `[Custom Voice] Session finalized`
   - Verify `session_ended` was emitted

2. **Check Minute Deduction**
   - Search for: `RECONCILIATION NEEDED`
   - If present, billing failed but session should have ended cleanly

3. **Check STT Lifecycle**
   - Search for: `[STT]` prefixed logs
   - Look for reconnection events or errors

4. **Differentiate Freeze Types**
   - **UI Freeze:** Check browser console for JavaScript errors
   - **Audio Freeze:** Check mic watchdog logs for track degradation
   - **Response Freeze:** Check LLM response time, may be rate-limited

#### Relevant Log Prefixes

| Prefix | Component |
|--------|-----------|
| `[Custom Voice]` | WebSocket handler, session lifecycle |
| `[STT]` | Speech-to-text provider (AssemblyAI) |
| `[TTS]` | Text-to-speech (ElevenLabs) |
| `[LLM]` | Claude response generation |
| `[MicWatchdog]` | Client-side mic health monitoring |
| `[Ambient]` | Ambient suppression filter |
| `[Mode]` | Communication mode changes |

#### Transcription Artifacts vs. True Freezes

**Minor Artifacts (Normal):**
- Brief gaps in transcription (1-2 seconds)
- Partial words appearing then correcting
- Short utterances filtered by ambient suppression

**True Freezes (Investigate):**
- Session never receives `session_ended`
- Client shows spinner indefinitely
- No logs after `Session finalized` call

### Health Checks

- **Server Health:** `GET /api/health`
- **Heartbeat Logs:** `[HEARTBEAT]` every 5 seconds confirms server is responsive
- **WebSocket Status:** Check `/api/custom-voice-ws` connection logs

### Database Queries for Debugging

```sql
-- Find sessions with potential billing issues
SELECT * FROM realtime_sessions 
WHERE ended_at IS NOT NULL 
AND minutes_used > 0;

-- Check user minute balance
SELECT id, email, monthly_voice_minutes, subscription_minutes_limit, is_trial_active 
FROM users WHERE id = <user_id>;
```

---

## Summary

The JIE Mastery voice system is production-hardened with:

- **Fail-safe session teardown** that never blocks on errors
- **Clear minute priority** with no silent defaults
- **Global stability features** for reliable audio processing
- **Age-appropriate pedagogy** layered on top of stability
- **Comprehensive logging** for debugging and reconciliation

For questions or issues, check the relevant log prefixes and follow the troubleshooting guide above.
