# JIE Mastery AI Tutor — Build Document

## Table of Contents

1. [Platform Overview](#platform-overview)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Frontend Architecture](#frontend-architecture)
5. [Backend Architecture](#backend-architecture)
6. [Database Layer](#database-layer)
7. [Custom Voice Pipeline](#custom-voice-pipeline)
8. [AI & Learning Engine](#ai--learning-engine)
9. [Authentication & Security](#authentication--security)
10. [Payment & Billing System](#payment--billing-system)
11. [Email & Notifications](#email--notifications)
12. [Background Jobs](#background-jobs)
13. [RAG (Document Intelligence)](#rag-document-intelligence)
14. [Continuity Memory System](#continuity-memory-system)
15. [Content Moderation & Safety](#content-moderation--safety)
16. [Build, Dev & Deploy](#build-dev--deploy)
17. [Environment Variables & Secrets](#environment-variables--secrets)
18. [External Service Dependencies](#external-service-dependencies)

---

## Platform Overview

JIE Mastery AI Tutor is a production-grade conversational AI tutoring platform that delivers personalized education across **Math, English, and Spanish** in **25 languages**. It features five age-specific AI tutors (K-2, Grades 3-5, 6-8, 9-12, College/Adult), real-time voice conversations, adaptive quizzes, document-based learning, and a cross-session memory system. The platform supports flexible family sharing through per-session student configuration.

---

## Technology Stack

| Layer | Technology | Version |
|---|---|---|
| **Runtime** | Node.js | 20+ |
| **Language** | TypeScript | 5.6.3 |
| **Frontend Framework** | React | 18.3+ |
| **Build Tool** | Vite | 5.4 |
| **Frontend Routing** | Wouter | 3.3 |
| **State Management** | TanStack Query | v5 |
| **Styling** | Tailwind CSS + Shadcn/ui | 3.4 / Radix-based |
| **Animation** | Framer Motion | 11.18 |
| **Backend Framework** | Express.js | 4.21 |
| **Database** | PostgreSQL (Neon-managed) | — |
| **ORM** | Drizzle ORM | 0.39 |
| **Schema Validation** | Zod + drizzle-zod | 3.24 / 0.7 |
| **Authentication** | Passport.js (session-based) | 0.7 |
| **WebSockets** | ws | 8.18 |
| **AI Model** | Claude Sonnet 4 (Anthropic SDK) | 0.37 |
| **Speech-to-Text** | AssemblyAI (primary), Deepgram (secondary) | — |
| **Text-to-Speech** | ElevenLabs (Turbo v2.5) | 1.59 |
| **Payments** | Stripe | 18.5 |
| **Email** | Resend | 6.1 |
| **Vector Search** | pgvector (OpenAI embeddings) | — |
| **OCR** | Tesseract.js | 6.0 |
| **Voice Activity Detection** | Silero VAD (@ricky0123/vad-web) | 0.0.30 |

---

## Project Structure

```
/
├── client/                    # Frontend (React + Vite)
│   └── src/
│       ├── App.tsx            # Route definitions (Wouter)
│       ├── main.tsx           # React entry point
│       ├── index.css          # Global styles, Tailwind config, theming
│       ├── agents.ts          # AI agent type definitions
│       ├── components/        # Reusable UI components
│       │   ├── ui/            # Shadcn/ui primitives (40+ components)
│       │   ├── dashboard/     # Dashboard-specific components
│       │   ├── TutorAvatar.tsx
│       │   ├── AnimatedBackground.tsx
│       │   ├── Celebration.tsx
│       │   ├── SessionProgress.tsx
│       │   ├── voice-controls.tsx
│       │   └── ...            # 40+ feature components
│       ├── pages/             # Route pages (50+ pages)
│       │   ├── home-page.tsx
│       │   ├── tutor-page.tsx
│       │   ├── dashboard.tsx
│       │   ├── admin/         # Admin sub-pages
│       │   └── ...
│       ├── hooks/             # Custom React hooks (10 hooks)
│       │   ├── use-custom-voice.ts  # Voice session management
│       │   ├── use-auth.tsx         # Authentication state
│       │   └── ...
│       ├── lib/               # Utilities (query client, helpers)
│       ├── config/            # Frontend configuration
│       ├── contexts/          # React context providers
│       ├── styles/            # Additional style files
│       ├── types/             # TypeScript type definitions
│       └── utils/             # Frontend utility functions
│
├── server/                    # Backend (Express + TypeScript)
│   ├── index.ts               # Server entry point, boot sequence
│   ├── routes.ts              # Primary HTTP API routes (3,800 lines)
│   ├── storage.ts             # Database storage interface (2,200 lines)
│   ├── auth.ts                # Authentication logic (1,800 lines)
│   ├── db.ts                  # Database connection (Drizzle + pg)
│   ├── db-init.ts             # Schema migrations & table setup
│   ├── vite.ts                # Vite dev server integration
│   ├── routes/                # Modular API route handlers
│   │   ├── custom-voice-ws.ts # Voice WebSocket handler (6,500 lines)
│   │   ├── billing.ts
│   │   ├── checkout.ts
│   │   ├── stripe-webhooks.ts
│   │   ├── students.ts
│   │   ├── sessions.ts
│   │   ├── documents.ts
│   │   ├── security.ts
│   │   └── ...                # 20 route modules
│   ├── services/              # Business logic services
│   │   ├── ai-service.ts          # Claude integration
│   │   ├── tts-service.ts         # ElevenLabs TTS
│   │   ├── deepgram-service.ts    # Deepgram STT
│   │   ├── stripe-service.ts      # Payment processing
│   │   ├── email-service.ts       # Resend email delivery
│   │   ├── content-moderation.ts  # Safety system
│   │   ├── memory-service.ts      # Cross-session memory
│   │   ├── document-processor.ts  # RAG pipeline
│   │   ├── embedding-worker.ts    # Vector embedding jobs
│   │   ├── noise-floor.ts         # Audio noise floor tracking
│   │   ├── echo-guard.ts          # Mic bleed prevention
│   │   ├── adaptive-barge-in.ts   # Barge-in state machine
│   │   ├── voice-minutes.ts       # Minute billing
│   │   └── ...                    # 35+ service modules
│   ├── config/                # Server configuration
│   │   ├── assemblyai-endpointing-profiles.ts
│   │   ├── elevenLabsConfig.ts
│   │   ├── tutor-personalities.ts
│   │   └── multiLanguageVoices.ts
│   ├── llm/                   # LLM prompt engineering
│   │   ├── systemPrompt.ts
│   │   ├── adaptiveSocraticCore.ts
│   │   └── voiceConfig.ts
│   ├── middleware/             # Express middleware
│   │   ├── security.ts
│   │   ├── admin-auth.ts
│   │   ├── ws-rate-limiter.ts
│   │   └── ...                # 8 middleware modules
│   ├── jobs/                  # Scheduled background jobs
│   │   ├── daily-digest.ts
│   │   ├── trial-reminders.ts
│   │   └── verification-reminders.ts
│   ├── scripts/               # Maintenance & setup scripts
│   └── types/                 # Server-specific types
│
├── shared/                    # Shared code (frontend + backend)
│   ├── schema.ts              # Drizzle ORM schema (1,000+ lines, 36 tables)
│   ├── languages.ts           # 25 supported languages
│   ├── plan-config.ts         # Subscription plan configuration
│   └── stripe-plans.ts        # Stripe price ID mapping
│
├── public/                    # Static assets (VAD models, ONNX runtime)
├── attached_assets/           # User-uploaded assets
├── package.json               # Dependencies & scripts
├── tsconfig.json              # TypeScript configuration
├── vite.config.ts             # Vite build configuration
├── drizzle.config.ts          # Drizzle Kit configuration
└── tailwind.config.ts         # Tailwind CSS configuration
```

---

## Frontend Architecture

### Routing (Wouter)

All routes are defined in `client/src/App.tsx`. The app serves 50+ pages including public pages (home, pricing, FAQ, demo), authenticated pages (dashboard, tutor, profile, settings), and admin pages.

### State Management (TanStack Query v5)

- All server data is fetched and cached via `useQuery` / `useMutation`
- A default query function handles `GET` requests with proper error handling
- Mutations use `apiRequest` from `@/lib/queryClient` for `POST/PATCH/DELETE`
- Cache invalidation by `queryKey` after every mutation

### Component Library (Shadcn/ui)

40+ accessible UI primitives from Radix UI, styled with Tailwind CSS:
- Dialog, Dropdown, Tabs, Tooltip, Select, Form, Toast, Card, Table, etc.
- All components importable via `@/components/ui/*`

### Age-Based Visual Theming

Five distinct visual themes drive the UI based on the student's grade band:
- **K-2**: Bright colors, large fonts, playful emojis, cartoon avatars
- **Grades 3-5**: Friendly colors, medium fonts, adventure themes
- **Grades 6-8**: Cool tones, standard fonts, minimal emojis
- **Grades 9-12**: Muted palette, clean typography, professional feel
- **College/Adult**: Neutral palette, sophisticated layout

Theme-aware components: `TutorAvatar`, `AnimatedBackground`, `SessionProgress`, `Celebration`. All animations built with Framer Motion and respect `prefers-reduced-motion`.

### Forms (React Hook Form + Zod)

- All forms use `useForm` with `zodResolver`
- Validation schemas derived from Drizzle insert schemas via `drizzle-zod`
- Controlled components with default values

### Path Aliases

| Alias | Maps To |
|---|---|
| `@/*` | `client/src/*` |
| `@shared/*` | `shared/*` |
| `@assets/*` | `attached_assets/*` |

---

## Backend Architecture

### Server Entry (`server/index.ts`)

The Express server boots in this sequence:
1. Database initialization and migration checks
2. Stripe configuration validation
3. Route registration (HTTP + WebSocket)
4. Background job startup (digest emails, cleanup, embedding worker, trial reminders)
5. Vite dev server attachment (development mode)
6. Listen on port 5000

### API Routes (`server/routes.ts` + `server/routes/*`)

- **Primary routes file**: 3,800 lines covering user management, sessions, analytics, admin
- **Modular route files**: 20 separate modules for billing, checkout, Stripe webhooks, students, documents, security, etc.
- All routes validate request bodies with Zod schemas
- CRUD operations go through the storage interface (`server/storage.ts`)

### Storage Interface (`server/storage.ts`)

A 2,200-line data access layer that wraps all Drizzle ORM queries. Every database operation flows through this interface, keeping route handlers thin. Methods cover users, students, sessions, documents, subscriptions, violations, and more.

### WebSocket Server

The custom voice WebSocket (`server/routes/custom-voice-ws.ts`, 6,500 lines) handles:
- Real-time audio streaming (PCM16 over WebSocket)
- Speech-to-text integration (AssemblyAI / Deepgram)
- AI response generation (Claude)
- Text-to-speech delivery (ElevenLabs)
- Session state management, phase transitions, barge-in handling

Mounted at `/api/custom-voice-ws` using the `ws` library in noServer mode with Express upgrade handling.

---

## Database Layer

### Connection

PostgreSQL via the `pg` driver, managed through Drizzle ORM. Connection pooling is handled by the standard `pg.Pool`. The database is Neon-managed PostgreSQL with pgvector extension for vector similarity search.

### Schema (`shared/schema.ts`)

36 tables defined with Drizzle's `pgTable`, including:

| Table | Purpose |
|---|---|
| `users` | User accounts, auth, subscription status |
| `students` | Student profiles (per-user, multiple per family) |
| `sessions` | Express session storage |
| `learning_sessions` | Tutoring session records |
| `tutor_sessions` | Voice tutoring session metadata |
| `realtime_sessions` | Real-time voice session telemetry |
| `trial_sessions` | Trial usage tracking |
| `session_summaries` | AI-generated session summaries |
| `memory_jobs` | Background memory processing queue |
| `content_violations` | Safety incident records |
| `user_suspensions` | User suspension tracking |
| `user_documents` | Uploaded document metadata |
| `document_chunks` | Chunked document text |
| `document_embeddings` | Vector embeddings (pgvector) |
| `minute_purchases` | Bonus minute top-up records |
| `registration_tokens` | Payment-first registration tokens |
| `subjects` | Subject definitions |
| `lessons` | Lesson content |
| `practice_lessons` | Practice lesson definitions |
| `student_lesson_progress` | Per-student lesson tracking |
| `quiz_attempts` | Quiz answer records |
| `usage_logs` | API usage logging |
| `admin_logs` | Admin action audit trail |
| `marketing_campaigns` | Campaign tracking |
| `trial_rate_limits` | Trial abuse rate limiting |
| `trial_abuse_tracking` | Trial abuse fingerprinting |
| `trial_login_tokens` | Trial authentication tokens |
| `verification_reminder_tracking` | Email verification reminder tracking |
| `student_doc_pins` | Document-to-student associations |
| `agent_sessions` | Agent-based session records |

Each table includes insert schemas (`createInsertSchema`), insert types (`z.infer`), and select types (`$inferSelect`).

### Migrations

Production-safe migration guards in `server/db-init.ts` ensure idempotent schema updates. Migrations check for table/column existence before creating them. Schema sync via `drizzle-kit push`.

---

## Custom Voice Pipeline

### Architecture

```
Client (Browser)
  ├── Silero VAD (speech detection)
  ├── AudioWorklet (PCM16 capture)
  └── WebSocket connection
        ↕
Server (custom-voice-ws.ts)
  ├── STT: AssemblyAI Universal-Streaming
  ├── Transcript Validation: shouldDropTranscript()
  ├── Continuation Guard (turn boundary detection)
  ├── AI: Claude Sonnet 4
  └── TTS: ElevenLabs Turbo v2.5
        ↓
Client receives audio chunks + genId filtering
```

### Phase State Machine

Voice sessions operate through a strict phase state machine:

```
LISTENING → TURN_COMMITTED → PROCESSING → TUTOR_SPEAKING → AWAITING_RESPONSE → LISTENING
```

Phase discipline enforces hard guards:
- `setPhase()` blocks `TURN_COMMITTED` during `TUTOR_SPEAKING` or `AWAITING_RESPONSE`
- `commitUserTurn()` queues speech instead of committing during tutor output

### Transcript Validation

The centralized `shouldDropTranscript()` helper replaces all raw character-length gates. It drops ONLY:
- Empty or whitespace-only text
- Session-ended transcripts
- Non-lexical patterns (um, uh, [noise])

Legitimate short answers pass through: "no", "ok", "I", "2", "5".

### Continuation Guard

Server-side two-phase commit for user turns with grade-band-driven timing:

| Grade Band | Grace (ms) | Hedge Grace (ms) | Endpointing (ms) |
|---|---|---|---|
| K-2 | 1500 | 3000 | 1200 |
| Grades 3-5 | 1200 | 2500 | 1000 |
| Grades 6-8 | 1000 | 2000 | 900 |
| Grades 9-12 | 800 | 1800 | 800 |
| College/Adult | 700 | 1500 | 800 |

Features:
- Quick-answer fast-commit (pure numbers, yes/no)
- Short-declarative hold (+200ms for < 8 words)
- Conjunction/preposition ending detection for extended hold
- Thinking-aloud grace (+800ms for older bands when wordCount >= 5 or length >= 20)

### Barge-In System

Two-stage barge-in prevents accidental tutor interruption:
- **Stage 1 (Duck)**: Reduces tutor audio gain (-25dB) on speech detection
- **Stage 2 (Confirm)**: Requires sustained speech beyond grade-band thresholds before hard-stopping tutor

Confirm thresholds: K2=600ms, G3-5=500ms, G6-8=400ms, G9-12/ADV=350ms

Pre-roll barge-in allows interruption when `phase=TUTOR_SPEAKING` even before the first audio chunk arrives.

### Audio Processing

- **Noise-floor gating**: Hysteresis (open at 2.0x, close at 1.5x) + 300ms onset latch
- **Echo guard**: Raises RMS threshold to `max(0.05, noiseFloor*5)` during tutor playback
- **Post-turn-commit immunity**: K2=700ms, G3-5=600ms, G6-8+=500ms
- **STT deadman timer**: Suppressed during tutor speech and 5s after barge-in events

### GenId Stale-Audio Filtering

Each tutor response gets a monotonic `playbackGenId`. All streaming audio includes `genId` so clients can filter stale audio from prior responses.

---

## AI & Learning Engine

### Model Configuration

- **Model**: Claude Sonnet 4 (`claude-sonnet-4-20250514`)
- **Context Window**: 200k tokens
- **Temperature**: 0.7
- **Method**: Modified Adaptive Socratic Method

### Teaching Approach

Four core strategies, selected adaptively:
1. **Guided Discovery**: Leading questions toward understanding
2. **Direct Instruction**: Clear explanations when needed
3. **Understanding Checks**: Verification of comprehension
4. **Frustration Detection**: Adjusting approach when student struggles

### Five Tutor Personalities

| Band | Persona | Style |
|---|---|---|
| K-2 | Playful, encouraging | Simple words, lots of praise, emojis |
| Grades 3-5 | Friendly guide | Adventure metaphors, gentle challenges |
| Grades 6-8 | Cool mentor | Relatable language, respect for independence |
| Grades 9-12 | Collaborative peer | Intellectual engagement, real-world connections |
| College/Adult | Professional tutor | Academic rigor, efficient explanations |

### Prompt Engineering

- System prompts in `server/llm/systemPrompt.ts` and `server/llm/adaptiveSocraticCore.ts`
- STT artifact hardening instructions handle mis-transcriptions charitably
- AssemblyAI keyterms_prompt provides subject-specific vocabulary (Math, English, Spanish)
- Cross-session memory summaries injected at session start

---

## Authentication & Security

### Authentication (Passport.js)

- Session-based auth using `express-session` with `connect-pg-simple` (production) or `memorystore` (development)
- Local strategy (email + bcrypt password hashing)
- Session cookies: 30-day max age, rolling, secure in production
- Email verification required (7-day token validity)
- Re-signup with existing unverified email resends verification

### Security Middleware

| Middleware | Purpose |
|---|---|
| `security.ts` | CORS, helmet, rate limiting |
| `admin-auth.ts` | Admin role verification |
| `enforce-concurrent-logins.ts` | Single-session enforcement |
| `require-subscription.ts` | Paywall gate |
| `require-verified-email.ts` | Email verification gate |
| `ws-rate-limiter.ts` | WebSocket connection rate limiting |
| `ws-session-validator.ts` | WebSocket session validation |

---

## Payment & Billing System

### Stripe Integration

- **Subscriptions**: 4 tiers (Starter, Standard, Pro, Elite) with monthly minute allocations
- **One-time purchases**: 60-minute top-up packs
- **Webhook handling**: `server/routes/stripe-webhooks.ts` processes subscription events
- **Hybrid minute tracking**: Combines subscription allocation + bonus purchased minutes

### Trial System

- 30-minute account-based trial with abuse prevention
- Trial rate limiting and fingerprint tracking
- Trial session records in dedicated tables

### Minute Enforcement Priority

1. Trial status check
2. Subscription limit check
3. Monthly allocation balance
4. Bonus minute balance

---

## Email & Notifications

### Email Service (Resend)

Transactional emails handled by `server/services/email-service.ts`:
- Email verification (with 60-second cooldown)
- Password reset
- Session summary digests (per-session, daily, weekly)
- Trial reminders
- Safety incident parent notifications

### Digest System

Parents can receive session summaries on three schedules:
- **Per-session**: Immediately after each session
- **Daily**: 8:00 PM ET daily
- **Weekly**: 8:00 PM ET on Sundays

---

## Background Jobs

| Job | Schedule | Description |
|---|---|---|
| Daily digest | 8:00 PM ET daily | Parent session summary emails |
| Weekly digest | 8:00 PM ET Sundays | Weekly parent email summaries |
| Trial reminders | Every 6 hours | Remind trial users to subscribe |
| Verification reminders | External cron | Daily emails to unverified users |
| Memory jobs | External cron | Generate session summaries for memory system |
| Embedding worker | Continuous | Process document embeddings in background |
| Document cleanup | Every 24 hours | Remove expired documents (> 6 months) |

---

## RAG (Document Intelligence)

### Supported Formats

PDF, DOCX, Images (via Tesseract OCR in 25 languages), XLSX, TXT, XML

### Processing Pipeline

```
Upload → Text Extraction → Chunking → Embedding → Storage
                                        ↓
                                OpenAI text-embedding-3-small
                                        ↓
                                pgvector (vector(1536))
```

### Usage in Sessions

Uploaded documents are chunked, embedded, and stored. During tutoring sessions, relevant chunks are retrieved via vector similarity search and injected into the Claude prompt as context.

---

## Continuity Memory System

### How It Works

1. **Session ends** → Background job queued in `memory_jobs` table
2. **Cron trigger** (`/api/cron/memory-jobs`) → Claude generates structured summary
3. **Summary stored** in `session_summaries` table with:
   - Topics covered
   - Concepts mastered vs. struggled
   - Student insights and learning patterns
4. **Next session** → Last 5 summaries injected into Claude prompt

### Safeguards

- All memory operations are non-blocking with safe fallbacks
- Student isolation prevents cross-topic leakage between siblings
- First-Turn-Only Guarantee prevents duplicate greetings on WebSocket reconnect
- DB-based job queue with retry logic

---

## Content Moderation & Safety

### Multi-Layer System

1. **Keyword whitelists** for academic content that might trigger false positives
2. **AI-powered moderation** for nuanced content analysis
3. **Safety detection service** for critical incidents

### Incident Response

- Critical safety incidents trigger immediate session termination
- Parent notifications via email
- Internal alerts for admin review
- All actions logged in `content_violations` table
- Non-fatal design prevents session freezes from moderation errors

---

## Build, Dev & Deploy

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start development server (Express + Vite HMR) |
| `npm run build` | Production Vite build → `dist/public/` |
| `npm run start` | Production server (init-db + tsx) |
| `npm run check` | TypeScript type checking |
| `npm run db:push` | Sync Drizzle schema to database |
| `npm run test:e2e` | Run Playwright end-to-end tests |
| `npm run test:acceptance` | Run Jest acceptance tests |

### Development Workflow

The `Start application` workflow runs `PORT=5000 npm run dev`, which:
1. Starts Express on port 5000
2. Attaches Vite dev server for frontend HMR
3. Both frontend and backend served on the same port

### Production Build

```
vite build → dist/public/  (static frontend assets)
tsx server/index.ts         (Node.js server serves static + API)
```

Chunk splitting:
- `vendor-react`: React + ReactDOM
- `vendor-ui`: Radix UI components
- `vendor-stripe`: Stripe.js

### Deployment

Designed for Replit Autoscale Deployment:
- WebSocket support
- Horizontal scaling
- Managed PostgreSQL (Neon)
- Port 5000 exposed

---

## Environment Variables & Secrets

### Required Secrets

| Secret | Service |
|---|---|
| `ANTHROPIC_API_KEY` | Claude AI |
| `DEEPGRAM_API_KEY` | Speech-to-text |
| `ASSEMBLYAI_API_KEY` | Speech-to-text (primary) |
| `ELEVENLABS_API_KEY` | Text-to-speech |
| `OPENAI_API_KEY` | Document embeddings |
| `STRIPE_SECRET_KEY` | Payment processing |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook verification |
| `RESEND_API_KEY` | Email delivery |
| `CRON_SECRET` | Cron endpoint authentication |
| `SESSION_SECRET` | Express session encryption |

### Stripe Price IDs

| Plan | Environment Variable |
|---|---|
| Starter | `STRIPE_PRICE_STARTER` |
| Standard | `STRIPE_PRICE_STANDARD` |
| Pro | `STRIPE_PRICE_PRO` |
| Elite | `STRIPE_PRICE_ELITE` |
| 60-min Top-up | `STRIPE_PRICE_TOPUP_60` |

### Runtime Environment

| Variable | Value |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (auto-set by Replit) |
| `NODE_ENV` | `development` or `production` |
| `PORT` | `5000` |

---

## External Service Dependencies

| Service | Purpose | Integration Point |
|---|---|---|
| **Anthropic (Claude)** | AI tutoring responses | `@anthropic-ai/sdk` |
| **AssemblyAI** | Primary speech-to-text | WebSocket streaming API |
| **Deepgram** | Secondary speech-to-text | `@deepgram/sdk` |
| **ElevenLabs** | Text-to-speech with age-specific voices | `elevenlabs` SDK |
| **OpenAI** | Document embeddings (text-embedding-3-small) | `openai` SDK |
| **Stripe** | Subscriptions, payments, webhooks | `stripe` SDK |
| **Resend** | Transactional email delivery | `resend` SDK |
| **Neon** | Managed PostgreSQL hosting | `pg` driver |
| **Silero VAD** | Client-side voice activity detection | `@ricky0123/vad-web` |
| **Tesseract.js** | OCR for document processing | `tesseract.js` |
