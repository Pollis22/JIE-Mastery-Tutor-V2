# JIE Mastery AI Tutor - Build Notes & Latest Updates

**Last Updated:** February 12, 2026  
**Platform Status:** Production-Ready  
**Deployment Target:** Replit Autoscale

---

## Table of Contents

1. [Recent Updates & Fixes](#recent-updates--fixes)
2. [Voice Technology Stack](#voice-technology-stack)
3. [Core Features](#core-features)
4. [AI Teaching System](#ai-teaching-system)
5. [Security & Authentication](#security--authentication)
6. [Database & Storage](#database--storage)
7. [Payment & Subscriptions](#payment--subscriptions)
8. [Technical Architecture](#technical-architecture)
9. [Deployment Configuration](#deployment-configuration)

---

## Recent Updates & Fixes

### **February 12, 2026 - Voice Pipeline P0 Hardening**

#### **1. Deferred Commit Anti-Swallow System**
- **Problem:** Complete student sentences were getting trapped in the continuation buffer and never committed to Claude, causing the tutor to "ignore" what the student said
- **Solution:** Implemented `classifyDeferredText()` system with three-way classification:
  - **HEDGE** text ("let's see", "um", etc.) merges safely into continuation buffer
  - **COMPLETE** text (4+ words or sentence punctuation) stores as `pendingCommitText`
  - **UNKNOWN** text treated as COMPLETE for safety
- **Commit guarantees:**
  - "Commit on next EOT" rule: pending text merges with new speech at next endpoint
  - 1200ms forced endpoint timer ensures no text waits indefinitely
  - Hard cap (pendingCommitCount>=2) forces immediate commit to prevent infinite deferral loops
  - Continuation guard absorbs pendingCommitText when its timer fires
- **File:** `server/routes/custom-voice-ws.ts`

#### **2. Dead Voice Session Fix (AssemblyAI)**
- **Problem:** Double URL-encoding of `keyterms_prompt` caused AssemblyAI 3005 connection errors, killing voice sessions
- **Solution:** Removed redundant `encodeURIComponent()` call; added close/error handlers to reconnected WebSocket
- **Impact:** Voice sessions no longer silently die after STT reconnection
- **File:** `server/routes/custom-voice-ws.ts`

#### **3. Formatted Echo Poison Fix**
- **Problem:** AssemblyAI's reformatted transcripts (e.g., "Testing, 1, 2, 3." after "testing one two three") updated `lastSttActivityAt` even for already-committed turns, causing deferred commits to cancel before Claude could respond
- **Solution:** Added `isAlreadyCommitted` check to `onPartialUpdate` handler; excluded formatted echoes from `creditSttActivity`
- **File:** `server/routes/custom-voice-ws.ts`

#### **4. Micro-Utterance Detection**
- **Problem:** Short answers like "yes", "no", "2" were being dropped by VAD thresholds
- **Solution:** Lowered OLDER_STUDENTS_PROFILE `minSpeechMs` from 400ms to 200ms; added Silero VAD model loading fallback
- **Files:** `client/src/config/voice-constants.ts`, `client/src/hooks/use-custom-voice.ts`

#### **5. Patience Crisis Fixes**
- **Problem:** Silence duration overflow from uninitialized timestamps (Date.now()-0 producing 300s+), inconsistent patience settings across older bands
- **Solution:** 300,000ms sanity clamp on silence calculations; unified G6-8/G9-12/ADV continuation settings (continuationGraceMs=600, continuationHedgeGraceMs=1500, bargeInConfirmDurationMs=400)
- **File:** `server/routes/custom-voice-ws.ts`, `server/config/assemblyai-endpointing-profiles.ts`

---

### Previous Major Updates

#### **Continuity Memory System**
- Per-student cross-session memory using Claude-generated structured summaries
- Last 5 session summaries injected into Claude prompt at session start
- DB-based job queue with retry logic triggered via `/api/cron/memory-jobs`
- Adaptive continuity greetings for returning students with first-turn-only guarantee
- Student isolation prevents cross-topic leakage between siblings

#### **Content Moderation & Safety System**
- Balanced, context-aware moderation with keyword whitelists
- Multi-layered AI moderation with educational context awareness
- Critical safety incidents trigger immediate session termination + parent notification + internal alerts
- All actions logged and non-fatal to prevent session freezes

#### **Email Verification & Reminder System**
- 7-day verification token validity
- Daily reminder emails for unverified users until first login
- Per-user per-day idempotency via `verification_reminder_tracking` table
- Re-signup with existing unverified email resends verification (no duplicates)
- 60-second cooldown on resend with frontend countdown timers

#### **Age-Based Visual Engagement System**
- Five distinct age themes (K-2, Grades 3-5, 6-8, 9-12, College) with unique colors, fonts, emojis, and avatar styles
- Components: `TutorAvatar`, `AnimatedBackground`, `SessionProgress`, `Celebration` effects
- All animations respect `prefers-reduced-motion`; built with Framer Motion

#### **RAG Document System**
- Supports PDF, DOCX, Images (OCR), XLSX, TXT, XML
- Pipeline: upload, text extraction, chunking, embedding (OpenAI text-embedding-3-small), pgvector storage
- OCR supports 25 languages
- Background embedding worker with automatic document cleanup (6-month retention)

---

## Voice Technology Stack

### **Custom Real-Time Voice Pipeline**

Production voice stack delivering 1-2 second end-to-end latency for educational conversations:

```
[User Microphone]
    | (Silero VAD neural speech detection)
    v
[AudioWorklet Capture - Float32, 16kHz]
    | (PCM16 conversion + base64 encoding)
    v
[WebSocket Transport]
    | (Session-authenticated, rate-limited)
    v
[Backend Audio Processor]
    | (Continuation Guard + Deferred Commit System)
    v
[AssemblyAI STT] -> Text Transcript
    | (Band-tuned endpointing profiles)
    v
[Claude Sonnet 4] -> AI Response
    | (Adaptive Socratic Method, 200K context)
    v
[ElevenLabs TTS] -> Audio Stream
    | (Age-specific voices, Turbo v2.5)
    v
[Frontend Audio Player] -> Speaker Output
```

### **Audio Specifications**

- **Format:** PCM16 (16-bit Linear PCM)
- **Sample Rate:** 16,000 Hz (mono)
- **Buffer Size:** 4096 samples
- **Encoding:** Base64 over WebSocket
- **VAD:** Silero VAD v5 (neural, client-side) + AudioWorklet for capture/UI

### **Speech-to-Text (STT)**

**Primary Provider:** AssemblyAI Universal-Streaming  
**Configuration:**
- Model: `universal-streaming` (English), `universal-streaming-multilingual` (25+ languages)
- Band-tuned endpointing profiles:
  - K-2: 1200ms threshold / 0.70 confidence / 8000ms max wait
  - Elementary: 1000ms / 0.60 / 6000ms
  - Middle/High/College: 900ms / 0.50 / 5000ms
- Subject-specific `keyterms_prompt` for transcription accuracy (Math, English, Spanish vocabulary)
- STT artifact hardening instructions in Claude system prompt

**Supported Languages:**
```
English, Spanish, French, German, Italian, Portuguese, Dutch, Polish,
Russian, Turkish, Ukrainian, Swedish, Danish, Norwegian, Finnish,
Arabic, Hindi, Japanese, Korean, Chinese (Simplified & Traditional),
Vietnamese, Indonesian, Thai
```

### **Continuation Guard & Turn Management**

**Server-side two-phase commit system for user turns:**
- Grade-band-driven grace timing (continuationGraceMs / continuationHedgeGraceMs per band)
- Quick-answer fast-commit (pure numbers, yes/no)
- Short-declarative hold (+200ms for <8 words)
- Conjunction/preposition ending detection for extended hold
- Thinking-aloud grace extension (+800ms for older bands when wordCount>=5 or length>=20)
- Hedge phrase detection enforces minimum 1500ms grace
- Deferred commit system with `classifyDeferredText()` (HEDGE/COMPLETE/UNKNOWN)
- Anti-swallow: pendingCommitText commits on next EOT, 1200ms forced endpoint, or hard cap

### **Barge-In System**

**Two-stage Silero VAD barge-in:**
- Stage 1 (duck): Immediately reduces tutor audio gain (GainNode fade to -25dB in 20ms) on speech detection
- Stage 2 (confirm): Requires sustained speech beyond grade-band thresholds before hard-stopping tutor
  - K-2: 600ms, G3-5: 500ms, G6-8: 400ms, G9-12/ADV: 350ms
- Elite barge-in with monotonic `playbackGenId`, `AbortController` for LLM+TTS, `hardInterruptTutor()`
- Post-turn-commit immunity windows prevent false barge-ins (K2:700ms, G3-5:600ms, G6-8+:500ms)
- Echo guard raises RMS threshold during tutor playback
- 650ms cooldown prevents barge-in thrashing
- Aborted/partial assistant output never written to conversation history

### **AI Processing**

**Provider:** Anthropic Claude  
**Model:** Claude Sonnet 4 (`claude-sonnet-4-20250514`)  
**Features:**
- 200K token context window, temperature 0.7
- Adaptive Socratic Method system prompt with 5 age-specific personalities
- Real-time streaming responses
- Document RAG integration
- Continuity memory injection (last 5 session summaries)
- STT artifact hardening instructions

### **Text-to-Speech (TTS)**

**Provider:** ElevenLabs (Turbo v2.5)  
**Configuration:**
- 5 distinct voices per language (one for each age group)
- Streaming audio delivery
- TTS text sanitization for Grade 6+ (number pronunciation, markdown stripping)

**Age-Specific Voices:**
- **K-2 (5-7 years):** Cheerful, animated, slightly slower
- **Grades 3-5 (8-10 years):** Friendly, encouraging, moderate pace
- **Grades 6-8 (11-13 years):** Supportive, clear, conversational
- **Grades 9-12 (14-18 years):** Professional, academic, engaging
- **College/Adult (18+ years):** Expert, sophisticated, efficient

---

## Core Features

### **1. Multi-Language Support (25 Languages)**

- Auto-detection from browser language settings
- Seamless language switching per session
- Localized UI and voice responses
- Full support for non-English tutoring
- Multilingual STT model automatically selected for non-English sessions

### **2. Age-Specific Tutor Personalities**

**5 Distinct Tutors:**

| Age Group | Tutor Name | Teaching Style | Voice Tone |
|-----------|------------|----------------|------------|
| K-2 | Buddy the Learning Bear | Playful, repetitive, games | Cheerful, animated |
| Grades 3-5 | Ms. Sunny | Friendly, story-based | Warm, encouraging |
| Grades 6-8 | Coach Alex | Practical, real-world | Supportive, clear |
| Grades 9-12 | Professor Taylor | Academic, analytical | Professional, engaging |
| College/Adult | Dr. Morgan | Expert, efficient | Sophisticated, direct |

**Each tutor has:**
- Custom system prompts optimized for their age group
- Subject-appropriate vocabulary and examples
- Age-matched humor and engagement strategies
- Tailored content moderation rules
- Unique visual theme (colors, fonts, emojis, avatar)

### **3. Flexible Communication Modes**

- **Voice Mode:** Full voice conversation (STT + TTS)
- **Hybrid Mode:** Listen to tutor, respond via text
- **Text-Only Mode:** Pure text chat interface

### **4. Document Upload & RAG**

**Supported Formats:**
- PDF documents
- Microsoft Word (DOCX)
- Images (PNG, JPG) with OCR (25 languages)
- Excel spreadsheets (XLSX)
- Plain text files, XML

**Processing Pipeline:**
1. Document upload and validation
2. Text extraction (PDF parsing, OCR, etc.)
3. Intelligent chunking
4. Embedding generation (OpenAI text-embedding-3-small)
5. pgvector storage for similarity search
6. Integration into tutor context per session

### **5. Session Management & Family Sharing**

- Per-session configuration (grade level, subject, language)
- Session-first data model enables flexible family sharing
- Concurrent session tracking with minute enforcement
- Cross-device session synchronization (30-second polling)
- Trial status, subscription limits, monthly allocation, and bonus minutes priority

### **6. Continuity Memory**

- Per-student cross-session memory for personalized tutoring
- Claude-generated structured summaries (topics, mastered/struggled concepts, student insights)
- Last 5 summaries injected into Claude prompt at session start
- Adaptive continuity greetings for returning students
- Student isolation ensures no cross-topic leakage between siblings

---

## AI Teaching System

### **Adaptive Socratic Method with Guided Discovery**

Core teaching methodology balancing guided discovery with direct instruction to prevent frustration while maximizing learning.

#### **Core Philosophy**

> "Your goal is LEARNING, not endless questioning. A frustrated student learns nothing."

#### **3-Phase Teaching Approach**

**Phase 1: Guided Discovery (First Question)**
- NEVER give direct answers immediately
- Ask "What do you think?"
- Suggest problem-solving strategies
- Encourage reasoning process

**Phase 2: Direct Instruction (After 2-3 Tries)**
- Give complete answer with clear explanation
- Break down WHY each step works
- Use real-world examples
- Connect to known concepts

**Phase 3: Understanding Check**
- Confirm comprehension
- Ask student to explain in their own words
- Practice with similar problem

#### **Frustration Detection**

The AI recognizes 8+ frustration signals:
- "I don't know"
- "I'm confused"
- "Can you just tell me?"
- "This is too hard"
- "I give up"
- Repeating wrong answers
- Long pauses or silence
- Asking "is that right?" repeatedly

**Response:** Immediately pivot to direct teaching mode.

#### **Content Moderation**

**Balanced, Context-Aware System:**
- Age-appropriate content filtering
- Educational context awareness (science/anatomy terms whitelisted)
- Multi-layered AI moderation
- Critical safety: immediate session termination + parent notification + internal alerts
- All moderation actions logged and non-fatal to prevent session freezes

---

## Security & Authentication

### **Production-Grade WebSocket Security**

#### **Session-Based Authentication**
- No client-sent userId trusted
- Server-side session validation on WebSocket upgrade
- Session rotation on login with cookie regeneration
- 30-minute session freshness enforcement
- Explicit session destruction on logout

#### **Rate Limiting**
- **Upgrade Requests:** 20 per minute per IP
- **Concurrent Connections:** 5 per IP maximum
- **DoS Protection:** IP-based throttling

#### **Security Features**
- Standalone session validator (no Express middleware reuse)
- URL-decoded cookie handling
- Malformed cookie rejection with proper error responses
- Session-authenticated WebSocket connections only
- Cookie clearing on logout

### **User Authentication**

**Method:** Passport.js Local Strategy  
**Session Storage:** PostgreSQL (connect-pg-simple)  
**Password Security:** bcrypt hashing  
**COPPA Compliance:** Email verification system (7-day token validity)  
**Role-Based Access:** Admin privileges supported

---

## Database & Storage

### **PostgreSQL Database**

**Provider:** Replit (Neon-backed)  
**ORM:** Drizzle ORM  
**Migration Strategy:** `npm run db:push` (safe schema sync)

### **Core Schema**

**Primary Tables:**
- `users` - User accounts and profiles (includes `first_login_at`, `last_verification_email_sent_at`)
- `sessions` / `realtime_sessions` - Active tutoring sessions with telemetry columns
- `students` - Student profiles for family sharing
- `user_documents` - Uploaded learning materials
- `document_embeddings` - RAG vector storage (pgvector)
- `content_violations` - Moderation records
- `user_suspensions` - Safety enforcement
- `stripe_customers` / `subscriptions` - Payment integration
- `minute_purchases` / `minute_transactions` - Usage tracking
- `session_summaries` - Continuity memory summaries
- `memory_jobs` - Background memory job queue
- `verification_reminder_tracking` - Email reminder idempotency
- `trial_abuse_tracking` - Trial abuse prevention
- `admin_audit_log` - Admin activity logging

### **Key Features**
- Production-safe migration guards (idempotent schema updates)
- `ADD COLUMN IF NOT EXISTS` pattern
- Session-based persistence
- Cross-device state synchronization
- Audit logging for compliance

---

## Payment & Subscriptions

### **Stripe Integration**

**Subscription Tiers:**
- Starter Plan
- Standard Plan
- Pro Plan
- Elite Plan
- One-time minute purchases (Top-ups)

### **Hybrid Minute Tracking**

**Two Minute Types:**

1. **Subscription Minutes**
   - Reset monthly on billing cycle
   - Use-it-or-lose-it policy
   - Credited on subscription renewal

2. **Purchased Minutes (Top-ups)**
   - Never expire
   - Rollover indefinitely
   - Used after subscription minutes

**Deduction Priority:**
1. Trial minutes (if active)
2. Subscription minutes
3. Purchased minutes (top-ups)
4. Block access when balance = 0

### **Trial System**
- 30-minute account-based trial
- Abuse prevention via `trial_abuse_tracking`
- Seamless upgrade path to paid subscriptions

### **WebSocket Minute Enforcement**

- Real-time minute balance checking
- Session-based minute deduction
- Concurrent session limits per subscription tier
- Grace period handling
- Background balance polling (30 seconds)

---

## Technical Architecture

### **Frontend Stack**

- **Framework:** React 18+ with TypeScript, Vite
- **Routing:** Wouter (lightweight SPA routing)
- **State Management:** TanStack Query v5
- **UI Components:** Shadcn/ui + Radix UI
- **Styling:** Tailwind CSS
- **Animations:** Framer Motion (respects prefers-reduced-motion)
- **Forms:** React Hook Form + Zod validation
- **Icons:** Lucide React
- **Voice:** Silero VAD (@ricky0123/vad-web), AudioWorklet

### **Backend Stack**

- **Runtime:** Node.js 20 with Express.js, TypeScript
- **API:** RESTful routes + WebSocket endpoints
- **Authentication:** Passport.js with PostgreSQL sessions
- **Database:** Drizzle ORM + PostgreSQL (Neon)
- **WebSocket:** Native ws library with custom security
- **Background Jobs:** Email digests, document cleanup, embedding worker, memory jobs, trial reminders

### **External Services**

| Service | Purpose | Status |
|---------|---------|--------|
| AssemblyAI | Primary speech-to-text | Active |
| Anthropic Claude | AI tutoring (Sonnet 4) | Active |
| ElevenLabs | Text-to-speech (Turbo v2.5) | Active |
| Stripe | Payments & subscriptions | Active |
| Resend | Email delivery | Active |
| OpenAI | Embeddings (text-embedding-3-small) | Active |

### **File Structure**

```
server/
  routes/
    custom-voice-ws.ts        # Voice WebSocket handler (continuation guard, barge-in, deferred commit)
    routes.ts                  # API endpoints
  services/
    assemblyai-service.ts      # STT integration
    elevenlabs-service.ts      # TTS integration
    ai-service.ts              # Claude integration
  llm/
    adaptiveSocraticCore.ts    # Teaching methodology
  config/
    tutor-personalities.ts     # Age-specific tutors
    assemblyai-endpointing-profiles.ts  # Band-tuned STT profiles
  middleware/
    ws-session-validator.ts    # WebSocket auth
    ws-rate-limiter.ts         # DoS protection
  storage.ts                   # Database layer

client/src/
  pages/                       # Route components
  components/                  # Reusable UI (age themes, tutor avatars, etc.)
  hooks/
    use-custom-voice.ts        # Voice frontend logic (Silero VAD, barge-in, audio playback)
  config/
    voice-constants.ts         # VAD profiles, barge-in thresholds
  lib/
    queryClient.ts             # TanStack Query setup

shared/
  schema.ts                    # Shared TypeScript types & Drizzle schema

public/
  silero_vad_v5.onnx           # Silero VAD model
  silero_vad_legacy.onnx       # Fallback VAD model
  vad.worklet.bundle.min.js    # VAD AudioWorklet
```

---

## Deployment Configuration

### **Replit Autoscale Deployment**

**Build Command:** None (Vite handles bundling)  
**Run Command:** `PORT=5000 npm run dev`  
**Port:** 5000 (frontend + backend on same port)

### **Environment Variables (Required)**

```bash
# AI Services
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Voice Services
ASSEMBLYAI_API_KEY=...
ELEVENLABS_API_KEY=...

# Payment
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_STANDARD=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_ELITE=price_...
STRIPE_PRICE_TOPUP_60=price_...

# Database
DATABASE_URL=postgresql://...

# Email
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@...

# Cron Security
CRON_SECRET=...

# Frontend
VITE_STRIPE_PUBLIC_KEY=pk_live_...
```

### **Background Jobs & Cron Endpoints**

| Endpoint | Schedule | Purpose |
|----------|----------|---------|
| `POST /api/cron/memory-jobs` | On session end | Process continuity memory summaries |
| `POST /api/cron/verification-reminders` | Daily | Send verification reminder emails |
| Internal scheduler | Daily 8 PM ET | Daily digest emails for parents |
| Internal scheduler | Sunday 8 PM ET | Weekly digest emails for parents |
| Internal scheduler | Every 6 hours | Trial reminder emails |
| Internal scheduler | Every 24 hours | Expired document cleanup |

### **Production Features**

- Session-based authentication with PostgreSQL
- WebSocket security with IP-based rate limiting
- Horizontal scaling support (stateless design)
- Database connection pooling
- Error logging and monitoring
- CORS configuration
- Secure cookie handling
- Content Security Policy headers
- Robust voice pipeline with anti-swallow guarantees

---

## Performance Metrics

### **Voice Latency**

- **Target:** 1-2 seconds end-to-end
- **Achieved:** ~1.5 seconds average
- **Breakdown:**
  - STT (AssemblyAI): ~300ms
  - AI Processing (Claude Sonnet 4): ~800ms
  - TTS (ElevenLabs Turbo v2.5): ~400ms

### **Scalability**

- **Architecture:** Stateless, horizontally scalable
- **WebSocket Connections:** 5 concurrent per IP
- **Database:** Connection pooled (Neon)
- **Session Storage:** PostgreSQL-backed

---

## Maintenance & Operations

### **Database Management**

```bash
# Apply schema changes
npm run db:push

# Force schema sync (if warnings)
npm run db:push --force
```

### **Development Commands**

```bash
# Start development server
PORT=5000 npm run dev

# Check TypeScript errors
npx tsc --noEmit
```

### **Monitoring**

- WebSocket connection and phase transition logs
- AssemblyAI STT status and reconnection logs
- Continuation guard commit/defer/cancel logs
- Barge-in stage tracking logs
- Stripe webhook event logging
- Admin audit log tracking
- Heartbeat logging (5-second intervals)

---

**Platform:** JIE Mastery AI Tutor  
**Deployment:** Replit  
**Last Updated:** February 12, 2026  
**Status:** Production-Ready

---

**End of Build Notes**
