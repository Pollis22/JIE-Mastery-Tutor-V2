# JIE Mastery AI Tutor - Web Application

**Last Updated:** January 28, 2026

## Overview
The JIE Mastery AI Tutor is a production-ready conversational AI tutoring web platform for Math, English, and Spanish. It supports 25 languages and is designed for global accessibility, offering interactive voice conversations, personalized quizzes, and adaptive learning paths. The platform features a multi-agent AI system with five age-specific tutors (K-2, Grades 3-5, 6-8, 9-12, College/Adult) that utilize an Adaptive Socratic Method. It includes a hybrid minute tracking policy (subscription and rollover minutes) and prioritizes per-session configuration for flexible family sharing, ensuring high reliability and a streamlined user experience. The project's ambition is to make personalized, adaptive AI tutoring accessible worldwide, significantly improving educational outcomes across various subjects and age groups.

## User Preferences
Preferred communication style: Simple, everyday language.
Timezone display: All timestamps display in America/Chicago (Central Time) using `Intl.DateTimeFormat`.

## System Architecture

### Full-Stack Architecture
The platform uses a modern full-stack architecture with React 18+ (TypeScript, Vite, Wouter) for the frontend, Node.js 20 (Express.js, TypeScript) for the backend, and PostgreSQL (Neon) with Drizzle ORM for the database. Styling is handled with Tailwind CSS and Shadcn/ui, state management with TanStack Query v5, and authentication via Passport.js (session-based).

### Request Flow
Requests from the client (browser) are processed via HTTPS/WSS to an Express.js server. HTTP routes interact with the storage layer and PostgreSQL, while WebSocket connections for custom voice interactions integrate with Deepgram/AssemblyAI for STT, Claude Sonnet 4 for AI responses, and ElevenLabs for TTS.

### Custom Voice Stack
A custom-built voice stack provides real-time, low-latency (1-2 seconds end-to-end) conversations using PCM16 audio (16-bit Linear PCM, 16kHz, Mono) encoded in Base64 over WebSockets. It integrates an STT provider (Deepgram Nova-2 or AssemblyAI), Claude Sonnet 4 for AI response generation, and ElevenLabs TTS (Turbo v2.5) with age-specific voices. The system includes adaptive barge-in detection, bounded patience logic, reading mode patience, adaptive session-level patience, and robust handling of background noise.

### Voice Pipeline Hardening (Steps 1-5)
Production-hardening features with feature flags (all default OFF for safety):
- **Step 1**: Fixed misleading ACK/WS-close logging for cleaner diagnostics
- **Step 2** (`VOICE_BG_NOISE_COACHING`): Background-noise coaching with 25s rolling window, 6-event threshold, 2min cooldown
- **Step 3** (`VOICE_AMBIENT_SUPPRESS`): Ambient speech suppression rejecting <2 word utterances and vowel-less fragments
- **Step 4** (`LEXICAL_GRACE_ENABLED`): 300ms lexical grace period preventing mid-word turn finalization
- **Step 5a** (`VITE_MIC_WATCHDOG_ENABLED`): Proactive 5s mic health monitoring with auto-recovery
- **Step 5b**: Grade-based max_tokens (K-2: 120, 3-5: 150, 6-8: 175, 9-12: 200, College: 300)

### Session Teardown Safety
The `finalizeSession()` function is hardened to never throw and always complete:
- Separate try/catch blocks for DB write, minute deduction, and email sending
- `session_ended` event always emitted to client, even if billing fails
- Failed operations logged with `RECONCILIATION NEEDED` markers for manual review
- Returns status object: `{ success, dbWriteFailed?, minuteDeductionFailed? }`

### Minutes & Billing Priority
Minute enforcement follows this authoritative order (no hard-coded defaults):
1. Trial status (`is_trial_active`) - 30-minute trial if active
2. Subscription limit (`subscription_minutes_limit`) - Stripe tier-based
3. Monthly allocation (`monthly_voice_minutes`) - Fallback allocation
4. Bonus/purchased minutes - Additive pools from one-time purchases

For comprehensive voice system documentation, see: **docs/VOICE_SYSTEM.md**

### Authentication & Authorization
Session-based authentication uses Passport.js with PostgreSQL session storage, including features for password reset and account recovery. WebSocket security incorporates session validation and IP-based rate limiting. Access control verifies authentication, active subscription, and minute balance.

### Session Priority System
A session-first data priority model allows per-session configuration for grade level, subject, and language, facilitating flexible family sharing.

### Student Profile Management
Features include auto-selection of the last used profile, integrated profile management with avatar systems, and unique preferences per profile (e.g., pace, encouragement, goals).

### AI & Learning Engine
The primary AI model is Claude Sonnet 4 (`claude-sonnet-4-20250514`) with a 200k token context window and a temperature of 0.7. It employs a Modified Adaptive Socratic Method with three phases: Guided Discovery, Direct Instruction, and Understanding Check, including frustration detection. Five distinct tutor personalities are defined for different age groups. A K-2 specific turn policy (`TURN_POLICY_K2_ENABLED`) offers very patient turn-taking for young learners.

### Content Moderation System
A balanced, context-aware moderation system uses a keyword whitelist for educational terms and multi-layered AI moderation that acts only on high-confidence violations.

### RAG (Retrieval-Augmented Generation) System
The RAG system supports various document formats (PDF, DOCX, Images via OCR, XLSX, TXT, XML). The processing pipeline involves upload, text extraction, chunking, embedding (OpenAI text-embedding-3-small), and storage in `pgvector`. OCR supports 25 languages.

### Database Schema
The core database tables include `users`, `sessions`, `realtime_sessions`, `students`, `user_documents`, `document_chunks`, `document_embeddings`, `content_violations`, `user_suspensions`, `admin_logs`, and `minute_purchases`.

**Production-Safe Migration Guards** (`server/db-init.ts`):
- `ensureRealtimeSessionsColumns()`: Adds telemetry columns (`close_reason`, `close_details`, `reconnect_count`, `last_heartbeat_at`) using `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- `ensureUsersTranscriptEmailColumn()`: Adds `transcript_email` column for separate transcript delivery address
- All guards are idempotent and log which columns are added at startup

### Trial System
The platform features a 30-minute account-based trial system (`/start-trial`) that provides full access to the AI tutor. It includes abuse prevention mechanisms (device/IP hashing). A legacy 5-minute demo trial system, without account requirements, is being phased out.

### Payment & Subscription System
Stripe is integrated for subscription management and one-time purchases. A hybrid minute tracking system distinguishes between monthly subscription minutes and purchased rollover minutes. Promo code support is included.

### Admin Dashboard System
A comprehensive administrative interface provides user management, subscription controls, session analytics, document management, content violation review, marketing campaign management, and audit logging. Admin accounts can manage user accounts with capabilities to cancel subscriptions, disable accounts, and soft-delete accounts, all with detailed audit logging.

### Background Jobs
Key background jobs include daily digest emails for parents, document cleanup, and a continuous embedding worker.

### Email Digest System (Daily/Weekly)

**Overview**: Parents can receive session summary emails via three frequencies: per-session, daily digest (8 PM ET), or weekly digest (Sundays 8 PM ET).

**Production Trigger Mechanism**:
Since autoscale deployments may not be running at scheduled times, use external cron services to trigger digest endpoints:

| Digest Type | Endpoint | Schedule | Timezone |
|-------------|----------|----------|----------|
| Daily | `POST /api/cron/daily-digest` | 8:00 PM daily | America/New_York |
| Weekly | `POST /api/cron/weekly-digest` | 8:00 PM Sundays | America/New_York |

**Required Environment Variables**:
- `CRON_SECRET`: Secret token for authenticating external cron requests. Add as header: `X-Cron-Secret: <value>`

**Endpoint Security**: 
- Returns `401 Unauthorized` if secret is missing/invalid
- Returns `503 Service Unavailable` if `CRON_SECRET` is not configured

**Idempotency**: 
- The `digest_tracking` table prevents double-sends by recording `(user_id, digest_type, digest_date)` for each sent digest
- If triggered twice on the same day, subsequent calls skip already-sent users

**Admin Testing**:
- `POST /api/admin/test-daily-digest` - Trigger digest for all eligible users (admin only)
- `POST /api/admin/test-digest-user` - Test digest for single user with body: `{ userId, digestType, date?, force? }`

**User Preference Field**: `users.email_summary_frequency` values: `'off'`, `'per_session'`, `'daily'`, `'weekly'` (default: `'daily'`)

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