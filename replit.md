# JIE Mastery AI Tutor - Web Application

## Overview

The JIE Mastery AI Tutor is a production-ready conversational AI tutoring web platform for Math, English, and Spanish. It supports 25 languages and is designed for global accessibility, offering interactive voice conversations, personalized quizzes, and adaptive learning paths. The platform features a multi-agent AI system with five age-specific tutors (K-2, Grades 3-5, 6-8, 9-12, College/Adult) that utilize an Adaptive Socratic Method. It includes a hybrid minute tracking policy (subscription and rollover minutes) and prioritizes per-session configuration for flexible family sharing, ensuring high reliability and a streamlined user experience. The project's ambition is to make personalized, adaptive AI tutoring accessible worldwide, significantly improving educational outcomes across various subjects and age groups.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Full-Stack Architecture

The platform uses a modern full-stack architecture with React 18+ (TypeScript, Vite, Wouter) for the frontend, Node.js 20 (Express.js, TypeScript) for the backend, and PostgreSQL (Neon) with Drizzle ORM for the database. Styling is handled with Tailwind CSS and Shadcn/ui, state management with TanStack Query v5, and authentication via Passport.js (session-based).

### Request Flow

The system processes requests from the client (browser) via HTTPS/WSS to an Express.js server. HTTP routes interact with the storage layer and PostgreSQL, while WebSocket connections for custom voice interactions integrate with Deepgram/AssemblyAI for STT, Claude Sonnet 4 for AI responses, and ElevenLabs for TTS.

### Custom Voice Stack

A custom-built voice stack provides real-time, low-latency (1-2 seconds end-to-end) conversations. It processes PCM16 audio (16-bit Linear PCM, 16kHz, Mono) encoded in Base64 over WebSockets. The architecture involves STT provider (Deepgram Nova-2 or AssemblyAI), Claude Sonnet 4 for AI response generation, and ElevenLabs TTS (Turbo v2.5). Age-specific TTS voices are used for each age group (K-2, 3-5, 6-8, 9-12, College/Adult).

### Authentication & Authorization

Session-based authentication uses Passport.js with PostgreSQL session storage. Account security features include password reset, security questions for recovery, and in-app password/email changes. WebSocket security incorporates session validation, IP-based rate limiting, and HTTP fallback. Access control involves authentication, active subscription verification, and minute balance enforcement.

**iOS Safari Authentication (RESOLVED - January 2026)**: iOS Safari and WebKit-based browsers (iPhone Chrome, in-app browsers) had session cookie persistence issues. Fixed with:
- Rolling sessions (`rolling: true`) - refreshes cookie expiry on each request
- Extended maxAge (30 days) for better long-term persistence
- Host-only cookies by default (compatible with Railway and custom domain)
- Email normalization (trim/lowercase) to handle iOS autofill quirks
- Debug endpoint `/api/debug/auth` for diagnostics (requires ADMIN_DEBUG_TOKEN in production)
- See `docs/iOS_AUTH_TESTING.md` for full testing checklist

### Session Priority System

A session-first data priority model allows per-session configuration for grade level, subject, and language, facilitating flexible family sharing.

### Student Profile Management

Features include auto-selection of the last used profile, integrated profile management with avatar systems (default, preset, custom uploads), and unique preferences per profile (e.g., pace, encouragement, goals).

### AI & Learning Engine

The primary AI model is Claude Sonnet 4 (`claude-sonnet-4-20250514`) with a 200k token context window and a temperature of 0.7. It employs a Modified Adaptive Socratic Method with three phases: Guided Discovery, Direct Instruction (after 2-3 attempts or frustration detection), and Understanding Check. The system includes frustration detection based on specific user phrases. Five distinct tutor personalities are defined for different age groups, each with tailored traits.

### Voice Turn-Taking System (Production-Ready)

A comprehensive voice interaction system that creates natural, patient, and interruption-friendly conversations across all age groups. Key improvements:

**Adaptive Barge-In Detection**: Rolling microphone noise baseline with relative energy detection and duck-then-confirm flow. Per-grade-band configuration (K-2 through Adult) with age-appropriate thresholds.

**Bounded Patience Logic**: Turn-taking evaluates whether a student's thought is complete using hesitation markers (um, wait, let me think) and continuation patterns (and, so, because), not just silence detection.

**Reading Mode Patience**: Extra patience during reading activities with +250ms minimum and +800ms maximum silence bonuses, accommodating slow readers and ESL learners.

**Adaptive Session-Level Patience**: Dynamic patience scoring (0.0-1.0) that adjusts based on learner behavior signals within strict caps to prevent sluggishness.

**Reliable Goodbye Shutdown**: Hard stop immediately cancels audio, transcription, and pending responses when session ends, eliminating trailing tutor messages.

**Background Noise Robustness (January 2026)**: Enhanced pipeline for noisy environments:
- Per-session rolling noise-floor baseline with RMS measurement during non-speech periods
- Speech validation: RMS must exceed noise_floor * 2.0 for >= 300ms to confirm speech
- Hardened barge-in: Duck audio first, then interrupt only with >= 3 lexical words
- Ghost turn prevention: Ignore empty, ultra-short, or non-lexical transcripts
- Conservative AssemblyAI parameters: end_of_turn_confidence=0.72, min_silence=1200ms
- Post-utterance grace window (400ms) for merging late continuations
- Debug instrumentation: `[noise_floor_gated]`, `[barge_in_decision]`, `[ghost_turn_prevented]`
- Feature flag: NOISE_FLOOR_ENABLED (default: true)

See `docs/VOICE_UX_FEATURES.md` for full configuration, metrics, and feature flags.

### K-2 Turn Policy (Very Patient Turn-Taking)

A feature-flagged turn-taking policy (`TURN_POLICY_K2_ENABLED`) for young learners (K-2) that prevents interrupting while students think aloud. Key features:
- Hesitation detection (um, wait, let me think, etc.)
- Continuation detection (and, so, because, etc.)
- Stall escape hatch with gentle prompts after 4.5s silence
- Response constraints: max 1-2 sentences, simple vocabulary, always end with a question
- See `docs/K2_TURN_POLICY.md` for full configuration and metrics.

### Content Moderation System

A balanced, context-aware moderation system uses a keyword whitelist for educational terms and multi-layered AI moderation that acts only on high-confidence violations.

### RAG (Retrieval-Augmented Generation) System

The RAG system supports various document formats (PDF, DOCX, Images via OCR, XLSX, TXT, XML). The processing pipeline involves upload, text extraction, chunking (500 chars, 50 overlap), embedding (OpenAI text-embedding-3-small), and storage in `pgvector`. OCR supports 25 languages.

### Database Schema

The core database tables include `users`, `sessions`, `realtime_sessions`, `students`, `user_documents`, `document_chunks`, `document_embeddings`, `content_violations`, `user_suspensions`, `admin_logs`, and `minute_purchases`. The schema is defined in `shared/schema.ts`.

### Trial System (Dual Trial Architecture)

**30-Minute Real Trial (NEW - Active)**:
Full account-based trial system with 30 minutes of AI tutoring in the real app:

**Trial Flow**: Visit `/start-trial` → Create account (email, password, student info) → Auto-login → Redirect to `/tutor` with 30 minutes

**Database Fields** (on `users` table):
- `trial_active`: Boolean flag for trial status
- `trial_minutes_total`: 30 minutes allocation
- `trial_minutes_used`: Tracking actual usage
- `trial_started_at`: Timestamp for trial start
- `trial_device_hash`, `trial_ip_hash`: For abuse prevention

**Abuse Prevention** (via `trial_abuse_tracking` table):
- Max 2 trials per device (tracked via localStorage device ID, hashed server-side)
- Max 3 trials per IP per week
- Blocked flag enforcement for known abuse patterns

**Session Access**: Trial users bypass subscription check in `/api/session/check-availability`. Returns `isTrial: true` with remaining minutes.

**Trial Expiration**: When `trial_minutes_used >= trial_minutes_total`, returns `reason: 'trial_expired'` with upgrade prompt.

**Technical Implementation**:
- Signup endpoint: `/api/auth/trial-signup`
- Frontend page: `/start-trial` (`client/src/pages/start-trial-page.tsx`)
- StartTrialButton links to `/start-trial`
- Documentation: `docs/free_30_min_trial.md`

**Legacy 5-Minute Demo Trial** (being phased out):
A no-account-required trial system that allows potential users to experience AI tutoring before signing up:

**Trial Flow**: Email entry → Email verification (6-digit code) → 5-minute tutoring session → Trial ended page with signup CTAs

**Single Source of Truth**: Trial entitlement is determined ONLY by:
- `verified_at IS NOT NULL` (email verified)
- `used_seconds < allowance` (base 300s + courtesy 300s if applied)
- `status != 'blocked'`

DO NOT gate access on: `trial_ends_at`, `verification_expiry`, magic links, rate limits, IP/device counters. The `trial_ends_at` field is DERIVED/INFORMATIONAL only.

**Resume Behavior** (`/api/trial/resume`):
- IF verified AND `used_seconds < allowance`: Return `RESUME`, set cookie, NO email
- IF `used_seconds >= allowance`: Apply courtesy extension (once), OR return `ENDED` with `showWelcome50: true`
- IF not verified: Return `VERIFY_REQUIRED`

**Courtesy Extension**:
- Applied once when transitioning ACTIVE → ENDED
- Adds +300 seconds (5 minutes) to allowance
- Tracked via `trial_grace_applied_at` timestamp
- Sends "Trial Extended" email notification

**Idempotent Session Ending**:
- Uses MAX semantics: `max(currentUsed, absoluteUsedSeconds)`
- Frontend tracks `baselineUsedSecondsRef` and sends absolute totals
- Baseline refreshed from `/status` and `/session-token` responses

**Technical Implementation**:
- Database tables: `trial_sessions`, `trial_rate_limits`
- Routes: `/api/trial/start`, `/api/trial/verify`, `/api/trial/status`, `/api/trial/resume`, `/api/trial/session-token`, `/api/trial/end-session`
- Service: `server/services/trial-service.ts` with `calculateTrialEntitlement()` as single source of truth
- Cookie middleware: `cookie-parser` with signed cookies for device identification

**Trial Timer**: Counts only during active tutoring sessions (not wall-clock time). Timer displays mm:ss countdown during session.

**Frontend Pages**: `/trial/verify` (email verification), `/trial/tutor` (trial session), `/trial/ended` (conversion page)

### Payment & Subscription System

Stripe is integrated for subscription management and one-time purchases. A hybrid minute tracking system differentiates between monthly subscription minutes (resets, lost if unused) and purchased rollover minutes (deducted after subscription minutes are exhausted). Promo code support is included.

### Admin Dashboard System

A comprehensive administrative interface provides user management, subscription controls, session analytics, document management, content violation review, marketing campaign management, and audit logging.

### Admin Account Management

Admins can manage user accounts directly from the Admin User Detail page with the following capabilities:

**Cancel Subscription (Admin → Stripe → DB)**:
- Cancel immediately or at billing period end
- Cancels in Stripe first, then updates database
- Works with subscription ID or customer ID lookup
- Creates audit log entry

**Disable Account (Admin → DB only)**:
- Toggle to prevent user login and session starts
- Immediately blocks all access attempts
- Reversible action with audit logging

**Delete Account (Soft Delete) (Admin → Stripe → DB)**:
- Requires typing "DELETE" to confirm (server-enforced)
- Cancels subscription in Stripe first
- Optional: Purge user documents, transcripts, and embeddings
- Optional: Delete Stripe customer (test accounts only)
- Sets soft-delete flags (deletedAt, deletedReason, etc.)
- Creates comprehensive audit log

**Database Fields** (on `users` table):
- `is_disabled`: Boolean for login blocking
- `disabled_at`, `disabled_by_admin_id`: Tracking
- `deleted_at`, `deleted_by_admin_id`, `deleted_reason`: Soft delete
- `canceled_at`, `canceled_by_admin_id`: Subscription cancellation

**Access Blocking**:
- Login: Blocked in Passport.js LocalStrategy
- Session creation: Blocked in /api/session/check-availability and /api/session/create
- Voice sessions: Blocked in WebSocket init handler

### Background Jobs

Key background jobs include daily digest emails for parents (8:00 PM EST), document cleanup (every 24 hours), and a continuous embedding worker.

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