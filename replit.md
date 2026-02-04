# JIE Mastery AI Tutor - Web Application

## Overview
The JIE Mastery AI Tutor is a production-ready conversational AI tutoring web platform supporting Math, English, and Spanish across 25 languages. It features a multi-agent AI system with five age-specific tutors (K-2, Grades 3-5, 6-8, 9-12, College/Adult) utilizing an Adaptive Socratic Method. Key capabilities include interactive voice conversations, personalized quizzes, adaptive learning paths, and a hybrid minute tracking policy. The platform prioritizes per-session configuration for flexible family sharing, global accessibility, and a streamlined user experience, aiming to make personalized, adaptive AI tutoring accessible worldwide and improve educational outcomes.

## User Preferences
Preferred communication style: Simple, everyday language.
Timezone display: All timestamps display in America/Chicago (Central Time) using `Intl.DateTimeFormat`.

## System Architecture

### Full-Stack Architecture
The platform uses React 18+ (TypeScript, Vite, Wouter) for the frontend, Node.js 20 (Express.js, TypeScript) for the backend, and PostgreSQL (Neon) with Drizzle ORM for the database. Styling uses Tailwind CSS and Shadcn/ui, state management with TanStack Query v5, and authentication via Passport.js (session-based).

### Request Flow
Client requests (HTTPS/WSS) are processed by an Express.js server. HTTP routes handle storage and PostgreSQL interactions, while WebSocket connections manage custom voice interactions, integrating with STT, AI response generation, and TTS services.

### Custom Voice Stack
A custom voice stack provides real-time, low-latency (1-2 seconds end-to-end) conversations using PCM16 audio over WebSockets. It integrates an STT provider, Claude Sonnet 4 for AI responses, and ElevenLabs TTS with age-specific voices. Features include adaptive barge-in detection, bounded patience logic, and robust background noise handling. Production-hardening includes mic health monitoring, LLM watchdog, and turn fallback timers.

### Content Moderation & Safety
A balanced, context-aware moderation system uses keyword whitelists and multi-layered AI moderation. Critical safety incidents (self-harm, violent threats, harm to others) trigger immediate session termination, parent notifications, and internal JIE Support alerts. All moderation and safety actions are logged and non-fatal to prevent session freezes.

### Session Management & Billing
The `finalizeSession()` function is hardened to ensure completion, even if billing or database operations fail. Minute enforcement follows a priority order: trial status, subscription limits, monthly allocation, and bonus minutes. A session-first data priority model enables per-session configuration for grade level, subject, and language, supporting flexible family sharing.

### AI & Learning Engine
The primary AI model is Claude Sonnet 4 (`claude-sonnet-4-20250514`) with a 200k token context window and a temperature of 0.7. It implements a Modified Adaptive Socratic Method with Guided Discovery, Direct Instruction, and Understanding Check phases, including frustration detection. Five distinct tutor personalities cater to different age groups.

### Age-Based Visual Engagement System
The platform features five distinct age themes (K-2, Grades 3-5, 6-8, 9-12, College) that define colors, fonts, emojis, and avatar styles. Age-specific visual components include `TutorAvatar`, `AnimatedBackground`, `SessionProgress`, and `Celebration` effects. All animations respect `prefers-reduced-motion` and are built with Framer Motion. The voice session UI maintains a consistent, clean layout across all age bands during active sessions, with controls, tutor avatar, progress, mode selector, transcript, and sticky chat input.

### RAG (Retrieval-Augmented Generation) System
The RAG system supports various document formats (PDF, DOCX, Images via OCR, XLSX, TXT, XML). The processing pipeline involves upload, text extraction, chunking, embedding (OpenAI text-embedding-3-small), and storage in `pgvector`. OCR supports 25 languages.

### Continuity Memory System
A per-student memory system provides cross-session context for personalized tutoring. When a voice session ends, a background job generates a structured summary using Claude, storing topics covered, concepts mastered/struggled, and student insights. At session start, the last 5 summaries are injected into the Claude prompt. The system uses a DB-based job queue (`memory_jobs` table) with retry logic, and is triggered via `/api/cron/memory-jobs` (secured by CRON_SECRET). All memory operations are non-blocking with safe fallbacks.

**Adaptive Continuity Greetings:** Returning students receive personalized greetings like "Welcome back! Shall we continue our discussion on [topic]?" in their selected language (8 languages supported). The `pickContinuationTopic()` helper safely extracts topics from `subject` or `topicsCovered[0]` only (never `summary_text`) with PII sanitization and max 60 character limits.

**First-Turn-Only Guarantee:** The `hasGreeted` flag in SessionState prevents duplicate greetings on WebSocket reconnect. Logic: `shouldSkipGreeting = state.hasGreeted || tutorAlreadySpoke`. All greeting generation, transcript/history push, and audio sending are wrapped in this check.

**Student Isolation:** Summaries are fetched via `getRecentSessionSummaries(userId, studentId)` ensuring strict per-student isolation - no cross-topic leakage between siblings sharing an account.

### Database Schema & Migrations
Core database tables include `users`, `sessions`, `students`, `user_documents`, `content_violations`, `minute_purchases`, `session_summaries`, and `memory_jobs`. Production-safe migration guards ensure idempotent schema updates.

### Trial & Payment System
A 30-minute account-based trial system is implemented with abuse prevention. Stripe is integrated for subscription management, one-time purchases, and a hybrid minute tracking system.

### Admin Dashboard & Background Jobs
A comprehensive admin dashboard provides user, subscription, and session management, content violation review, and marketing tools. Key background jobs include daily digest emails for parents, document cleanup, and an embedding worker. An email digest system allows parents to receive session summaries per-session, daily, or weekly, triggered by external cron services.

### Production Deployment
The platform is designed for Replit Autoscale Deployment, supporting WebSockets, horizontal scaling, and managed PostgreSQL.

## External Dependencies

### AI & Voice Services
-   **Deepgram**: Speech-to-text (Nova-2)
-   **AssemblyAI**: Speech-to-text (Universal-Streaming, alternative)
-   **Claude (Anthropic)**: AI model for tutoring
-   **ElevenLabs**: Text-to-speech (Turbo v2.5)

### Payment Processing
-   **Stripe**: Subscriptions and payments

### Email Services
-   **Resend**: Transactional email delivery

### Database & Infrastructure
-   **PostgreSQL**: Primary database (Neon-managed)
-   **Drizzle ORM**: Database interactions
-   **pgvector**: Vector similarity search

### Frontend Libraries
-   **Radix UI**: Accessible component primitives
-   **Tailwind CSS**: Styling
-   **React Hook Form**: Form management with Zod validation
-   **Lucide React**: Icon library

## Build Notes

### February 2026 - Greeting Hardening
**Feature:** First-Turn-Only Greeting Guarantee

**Changes Made:**
- Added `hasGreeted: boolean` to SessionState interface in `server/routes/custom-voice-ws.ts`
- Created `pickContinuationTopic()` helper for safe topic extraction (never uses `summary_text`)
- Wrapped all greeting logic in `shouldSkipGreeting` check to prevent duplicates on WebSocket reconnect

**Key Implementation Details:**
- `shouldSkipGreeting = state.hasGreeted || tutorAlreadySpoke` - dual check for robustness
- Topic sanitization: strips newlines, quotes, bracketed content, PII keywords, max 60 chars
- Topic selection priority: `subject` → `topicsCovered[0]` → fallback phrase
- Logging prefix: `[MEMORY_GREETING]` with sessionId, studentId, priorExists, chosenTopic, reason

**Database Requirements:** None - uses existing `session_summaries` table and in-memory state

**Test Cases:**
1. New student first session → default greeting (no "Welcome back")
2. Same student second session → continuity greeting shows once
3. WebSocket reconnect mid-session → NO second greeting
4. Another student under same user → no cross-topic leakage (strict isolation)

### February 2026 - AssemblyAI v3 Phase 1 Upgrade
**Feature:** Low-latency streaming endpoint routing + turn commit optimization

**New Environment Variables:**
| Variable | Values | Default | Description |
|----------|--------|---------|-------------|
| `ASSEMBLYAI_STREAMING_ROUTE` | `edge` \| `us` \| `eu` \| `default` | `edge` | Streaming endpoint routing for lowest latency |
| `ASSEMBLYAI_TURN_COMMIT_MODE` | `first_eot` \| `formatted` | `first_eot` | When to trigger Claude (first EOT = low latency) |
| `ASSEMBLYAI_INACTIVITY_TIMEOUT_SEC` | `5-3600` | unset | Optional inactivity timeout in seconds |

**Changes Made:**
- Added edge endpoint routing (streaming.edge.assemblyai.com) for lowest latency
- Fixed speech model name: `universal-streaming-multi` → `universal-streaming-multilingual`
- Implemented `first_eot` commit mode that triggers Claude on first end_of_turn (skips formatted wait)
- Added `committedTurnOrders` tracking to prevent double Claude triggers
- Added EOT → Claude latency instrumentation logs

**Key Implementation Details:**
- `first_eot` mode: Triggers Claude immediately on first `end_of_turn=true`, ignores subsequent formatted version
- `formatted` mode: Legacy behavior - waits for `turn_is_formatted=true` before triggering Claude
- Double-trigger prevention: Tracks committed `turn_order` values in Set
- Latency logs: `[AssemblyAI] ⏱️ EOT → Claude latency: {X}ms`

**Safety Guarantees:**
- Deepgram path remains intact for rollback (`STT_PROVIDER=deepgram`)
- All new behavior gated by environment variables
- Default behavior (`edge` + `first_eot`) is safe and low-latency
- Partials NEVER trigger Claude (only `end_of_turn=true`)

### February 2026 - Phase 2: Age-Band Endpointing Profiles
**Feature:** Per-tutor-band STT endpointing configuration

**New Environment Variables:**
| Variable | Values | Default | Description |
|----------|--------|---------|-------------|
| `ASSEMBLYAI_PROFILE_MODE` | `profile` \| `global` | `profile` | Profile mode: per-band vs hardcoded |

**Age-Band Profiles (server/config/assemblyai-endpointing-profiles.ts):**
| Band | Confidence Threshold | Min Silence (ms) | Max Turn Silence (ms) |
|------|---------------------|------------------|----------------------|
| K2 | 0.55 | 800 | 6000 |
| ELEMENTARY (3-5) | 0.60 | 600 | 5000 |
| MIDDLE (6-8) | 0.65 | 500 | 4000 |
| HIGH (9-12) | 0.70 | 400 | 3500 |
| COLLEGE | 0.75 | 300 | 3000 |

**Profile Mapping:**
- Buddy the Learning Bear → K2
- Ms. Sunny / Professor Pepper → ELEMENTARY
- Coach Alex / Dr. Nova → MIDDLE
- Professor Taylor / Professor Ace → HIGH
- Dr. Morgan → COLLEGE

**Log Format:**
```
[AssemblyAI v3] EndpointingProfile: band=MIDDLE ageGroup=6-8 params={"end_of_turn_confidence_threshold":"0.65","min_end_of_turn_silence_when_confident":"500","max_turn_silence":"4000"}
```

**Rollback:** Set `ASSEMBLYAI_PROFILE_MODE=global` to use hardcoded values (0.72/1200/5500)

### February 2026 - OLDER_STUDENTS Voice-Turn Profile
**Feature:** Single shared client-side VAD profile for Grade 6-8, Grade 9-12, and College/Adult

**Problem Solved:**
1. Choppy tutor audio from false interruptions (undefined reason stopping playback)
2. Student cut off mid-thought (over-eager end-of-speech detection)

**OLDER_STUDENTS Profile Values (client/src/config/voice-constants.ts):**
| Parameter | Value | Description |
|-----------|-------|-------------|
| minSpeechMs | 400ms | Minimum continuous speech before "end" is valid |
| ignoreSpeechEndUnderMs | 250ms | Ignore speech_end if duration below this |
| ignoreSpeechEndIfDurationZero | true | Hard block duration=0 speech ends |
| coalesceWindowMs | 3200ms | Window to merge rapid speech segments (was 2200ms) |
| continuationGraceMs | 1200ms | Extra wait on continuation phrases |
| maxAdditionalWaitMs | 1500ms | Cap on extra waiting |

**Hardening Applied (client-side only):**
- A) Interruption blocking: Only stop tutor audio if `reason` is in allowlist: `['barge_in', 'user_speech', 'server_turn_detected']`
- B) VAD end-of-speech: Ignore duration=0ms events, require 400ms+ continuous speech
- C) Enhanced coalescing: 3.2s window for thinking pauses
- D) Continuation phrases: "hold on", "wait", "let me think", "um", etc.

**Log Prefix:** `[VOICE_OLDER_STUDENTS]`

**K-2 and Grades 3-5:** Unchanged - use original VAD profile behavior

**Test Cases:**
1. Grade 6+ tutor audio should NOT stop on interruption with undefined reason
2. Grade 6+ student can pause 1-3 seconds mid-thought without being cut off
3. K-2 and 3-5 behavior remains unchanged