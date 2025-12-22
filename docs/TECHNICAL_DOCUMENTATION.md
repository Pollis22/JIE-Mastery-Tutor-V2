# JIE Mastery AI Tutor - Technical Documentation

**Version:** 2.1  
**Last Updated:** December 22, 2025  
**Status:** Production-Ready  

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [System Architecture](#system-architecture)
3. [Technology Stack](#technology-stack)
4. [Database Schema](#database-schema)
5. [Authentication & Security](#authentication--security)
6. [Voice System](#voice-system)
7. [AI & Learning Engine](#ai--learning-engine)
8. [Payment & Subscription System](#payment--subscription-system)
9. [Key Features](#key-features)
10. [File Structure](#file-structure)
11. [Development Workflow](#development-workflow)
12. [Deployment](#deployment)
13. [Environment Variables](#environment-variables)
14. [Testing](#testing)
15. [Known Issues & Solutions](#known-issues--solutions)

---

## Project Overview

JIE Mastery AI Tutor is a production-ready conversational AI tutoring platform that provides personalized learning experiences for Math, English, and Spanish across 25 languages. The platform features real-time voice conversations powered by a custom voice stack (Deepgram or AssemblyAI STT + Claude Sonnet 4 + ElevenLabs TTS).

### Core Vision
Provide a globally accessible, effective, and frustration-free AI tutoring experience that adapts to individual learning needs through the **Modified Adaptive Socratic Method**.

### Target Users
- K-2 (Ages 5-7)
- Grades 3-5 (Ages 8-10)
- Grades 6-8 (Ages 11-13)
- Grades 9-12 (Ages 14-18)
- College/Adult (Ages 18+)

### Key Differentiators
1. **Age-Specific AI Tutors**: Five distinct tutor personalities optimized for different age groups
2. **25 Language Support**: Automatic browser language detection with native TTS voices
3. **Modified Adaptive Socratic Method**: Balances guided discovery with direct instruction
4. **Custom Voice Stack**: Real-time conversations with 1-2 second end-to-end latency
5. **Document-Based Learning**: RAG system for personalized content
6. **Flexible Communication**: Voice, Hybrid (listen + text), and Text-only modes

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Client (Browser)                       │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐ │
│  │   React    │  │   Vite     │  │  TanStack Query       │ │
│  │ TypeScript │  │   Wouter   │  │  (State Management)   │ │
│  └────────────┘  └────────────┘  └────────────────────────┘ │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTPS/WSS
┌────────────────────────────┴────────────────────────────────┐
│                    Express.js Server                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Routes: /api/auth, /api/sessions, /api/users, etc  │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  WebSocket: /api/custom-voice-ws                     │   │
│  │  - Deepgram/AssemblyAI STT - Claude AI - ElevenLabs │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────┴────────────────────────────────┐
│                PostgreSQL Database (Neon)                    │
│  - Users  - Sessions  - Documents  - Subscriptions          │
│  - Quiz Attempts  - Embeddings  - Admin Logs               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   External Services                          │
│  - Deepgram/AssemblyAI (STT) - Anthropic Claude (AI)       │
│  - ElevenLabs (TTS)  - Stripe (Payments)                    │
│  - Resend (Email)  - Azure Speech (Backup TTS)              │
└─────────────────────────────────────────────────────────────┘
```

### Request Flow

#### Standard HTTP Request
1. Client → Express middleware (session validation)
2. Express → Route handler
3. Route handler → Storage layer (Drizzle ORM)
4. Storage → PostgreSQL
5. Response ← Back through stack

#### WebSocket Voice Session
1. Client → WebSocket upgrade request (session authentication)
2. Server → Validates session + checks rate limits
3. Client sends audio → STT Provider (Deepgram or AssemblyAI) → Text transcript
4. Text → Claude AI → Response text
5. Response text → ElevenLabs TTS → Audio buffer
6. Audio buffer → Client playback

---

## Technology Stack

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Routing**: Wouter (lightweight client-side routing)
- **State Management**: TanStack Query v5 (server state) + React hooks (local state)
- **UI Components**: Shadcn/ui + Radix UI primitives
- **Styling**: Tailwind CSS
- **Forms**: React Hook Form + Zod validation
- **Icons**: Lucide React

### Backend
- **Runtime**: Node.js 20
- **Framework**: Express.js
- **Language**: TypeScript (compiled with tsx)
- **ORM**: Drizzle ORM
- **Database**: PostgreSQL (Neon-managed)
- **Session Store**: PostgreSQL (connect-pg-simple)
- **Authentication**: Passport.js (local strategy)
- **WebSocket**: ws library

### AI & Voice Services
- **STT (Primary)**: Deepgram Nova-2 (real-time streaming, default)
- **STT (Alternative)**: AssemblyAI Universal (selectable via `STT_PROVIDER` env var)
- **LLM**: Anthropic Claude Sonnet 4
- **TTS**: ElevenLabs Turbo v2.5
- **Backup TTS**: Azure Speech Services (25 languages)
- **Embeddings**: OpenAI text-embedding-3-small

### Payment & Email
- **Payments**: Stripe (subscriptions + one-time purchases)
- **Email**: Resend

### Development Tools
- **Package Manager**: npm
- **Database Migrations**: Drizzle Kit (schema push)
- **Code Quality**: TypeScript strict mode
- **Environment**: dotenv

---

## Database Schema

### Core Tables

#### `users`
```typescript
{
  id: serial (primary key),
  username: varchar (unique),
  password: varchar (hashed with bcrypt),
  email: varchar,
  emailVerified: boolean,
  verificationToken: varchar,
  verificationTokenExpiry: timestamp,
  role: varchar (default: 'user', options: 'user'|'admin'),
  studentName: varchar,
  gradeLevel: varchar,
  preferredLanguage: varchar,
  subscriptionStatus: varchar,
  subscriptionMinutes: integer (monthly reset),
  purchasedMinutes: integer (rollover),
  subscriptionTier: varchar,
  stripeCustomerId: varchar,
  stripeSubscriptionId: varchar,
  subscriptionStartDate: timestamp,
  subscriptionEndDate: timestamp,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

#### `realtime_sessions`
```typescript
{
  id: varchar (UUID, primary key),
  userId: integer (foreign key → users),
  studentName: varchar,
  subject: varchar,
  ageGroup: varchar,
  language: varchar,
  status: varchar,
  transcript: jsonb[], // Array of {speaker, text, timestamp}
  totalMessages: integer,
  minutesUsed: integer,
  startedAt: timestamp,
  endedAt: timestamp,
  errorMessage: text
}
```

#### `user_documents`
```typescript
{
  id: serial (primary key),
  userId: integer (foreign key → users),
  sessionId: varchar (foreign key → realtime_sessions),
  fileName: varchar,
  fileType: varchar,
  fileSize: integer,
  filePath: varchar,
  extractedText: text,
  uploadedAt: timestamp,
  expiresAt: timestamp, // Auto-delete after 6 months
  processingStatus: varchar,
  isProcessed: boolean
}
```

#### `document_embeddings`
```typescript
{
  id: serial (primary key),
  documentId: integer (foreign key → user_documents),
  chunkText: text,
  chunkIndex: integer,
  embedding: vector(1536), // OpenAI embeddings
  createdAt: timestamp
}
```

#### `subscriptions`
```typescript
{
  id: serial (primary key),
  userId: integer (foreign key → users),
  stripeSubscriptionId: varchar,
  stripePriceId: varchar,
  status: varchar,
  currentPeriodStart: timestamp,
  currentPeriodEnd: timestamp,
  cancelAtPeriodEnd: boolean,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

#### `quiz_attempts`
```typescript
{
  id: serial (primary key),
  userId: integer (foreign key → users),
  subject: varchar,
  difficulty: varchar,
  score: integer,
  totalQuestions: integer,
  timeSpent: integer,
  answers: jsonb,
  createdAt: timestamp
}
```

#### `admin_logs`
```typescript
{
  id: serial (primary key),
  adminId: integer (foreign key → users),
  action: varchar,
  targetUserId: integer,
  metadata: jsonb,
  createdAt: timestamp
}
```

### Indexes
- `users.username` (unique)
- `users.email` (unique)
- `users.stripeCustomerId` (unique)
- `realtime_sessions.userId`
- `realtime_sessions.startedAt`
- `user_documents.userId`
- `user_documents.sessionId`
- `document_embeddings.documentId`

---

## Authentication & Security

### Session-Based Authentication

**Technology**: Passport.js local strategy + PostgreSQL session store

**Session Configuration**:
```typescript
{
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS only in prod
    httpOnly: true, // Prevents XSS
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  },
  store: PostgreSQL session store (connect-pg-simple)
}
```

### Password Security
- **Hashing**: bcrypt with salt rounds = 10
- **Storage**: Never stored in plain text
- **Validation**: Minimum 6 characters (enforced by Zod schema)

### WebSocket Security (Production-Grade)

**Critical Implementation Details** (November 2025):

1. **Session-Based Authentication**:
   - WebSocket upgrades validate session cookies (no client-sent userId accepted)
   - Standalone session validator (doesn't reuse Express middleware)
   - Malformed cookie handling with proper error responses

2. **Session Management**:
   - ~~Session rotation on login with 30-minute freshness check~~ **REMOVED** (Nov 18, 2025)
   - Explicit session destruction on logout
   - Cookie clearing on authentication failure

3. **Rate Limiting**:
   - IP-based: 20 upgrade requests per minute
   - Concurrent connections: 5 per IP address
   - Connection tracking with automatic cleanup

4. **Railway TLS Proxy Handling**:
   - HTTP fallback for session_ended acknowledgments
   - 3-second timeout before fallback
   - Prevents lost close frames in TLS proxy environment

**Key Files**:
- `server/middleware/ws-session-validator.ts`: Standalone session validation
- `server/routes/custom-voice-ws.ts`: WebSocket handlers
- `server/middleware/ws-rate-limiter.ts`: Rate limiting logic

### COPPA Compliance
- Email verification required for all users
- Verification token expires after 24 hours
- Email verification status tracked in database

### Authorization Levels
1. **Guest**: Cannot access any features
2. **User**: Access based on subscription status + minute balance
3. **Admin**: Full access to admin dashboard + user management

---

## Voice System

### Custom Voice Stack

The platform uses a **custom-built voice stack** instead of pre-built solutions like ElevenLabs Conversational AI. This provides full control over the conversation flow and supports our unique pedagogical approach.

#### STT Provider Selection

The platform supports two STT providers, selectable via the `STT_PROVIDER` environment variable:

| Provider | Value | Description |
|----------|-------|-------------|
| **Deepgram** | `deepgram` (default) | Nova-2 model, excellent accuracy, real-time streaming |
| **AssemblyAI** | `assemblyai` | Universal model, alternative provider |

**Configuration**: Set `STT_PROVIDER=deepgram` or `STT_PROVIDER=assemblyai` in environment variables.

#### Architecture

```
┌─────────────┐
│   Browser   │
│  Microphone │
└──────┬──────┘
       │ PCM16 Audio (base64 over WebSocket)
       ▼
┌────────────────────────┐
│  STT Provider          │
│  (Deepgram Nova-2 or   │
│   AssemblyAI Universal)│
│  - Real-time streaming │
│  - 16kHz sample rate   │
└──────┬─────────────────┘
       │ Text Transcript (is_final=true)
       ▼
┌────────────────────────┐
│  Claude Sonnet 4       │
│  - System prompt       │
│  - Conversation hist   │
│  - RAG context         │
└──────┬─────────────────┘
       │ Response Text
       ▼
┌────────────────────────┐
│  ElevenLabs TTS        │
│  (Turbo v2.5)          │
│  - Age-specific voices │
│  - 22 languages        │
└──────┬─────────────────┘
       │ PCM16 Audio Buffer
       ▼
┌─────────────┐
│   Browser   │
│   Playback  │
└─────────────┘
```

#### Audio Format
- **Encoding**: PCM16 (16-bit Linear PCM)
- **Sample Rate**: 16kHz
- **Channels**: Mono
- **Transport**: Base64-encoded over WebSocket

#### Audio Processing Pipeline (November 2025)

**Client-Side Processing**:
```typescript
// 100x gain amplification for quiet microphones
const GAIN_MULTIPLIER = 100;
const SILENCE_THRESHOLD = 10;

for (let i = 0; i < float32Data.length; i++) {
  const amplified = float32Data[i] * GAIN_MULTIPLIER;
  const clamped = Math.max(-1, Math.min(1, amplified));
  pcm16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
}
```

**Features**:
- Custom ScriptProcessorNode implementation (fallback for older browsers)
- AudioWorklet support (modern browsers)
- MediaStream health checks
- Audio context suspension protection
- Silence detection to prevent empty chunks

### 25 Languages Supported

**With Azure Neural TTS Voices**:
1. English (en-US)
2. Spanish (es-ES)
3. French (fr-FR)
4. German (de-DE)
5. Italian (it-IT)
6. Portuguese (pt-BR)
7. Russian (ru-RU)
8. Chinese Mandarin (zh-CN)
9. Japanese (ja-JP)
10. Korean (ko-KR)
11. Arabic (ar-SA)
12. Hindi (hi-IN)
13. Dutch (nl-NL)
14. Polish (pl-PL)
15. Turkish (tr-TR)
16. Swedish (sv-SE)
17. Vietnamese (vi-VN)
18. Thai (th-TH)
19. Indonesian (id-ID)
20. Greek (el-GR)
21. Hebrew (he-IL)
22. Czech (cs-CZ)
23. Ukrainian (uk-UA)
24. Romanian (ro-RO)
25. Hungarian (hu-HU)

**Auto-Detection**: Browser language detected via `navigator.language`

### Age-Specific TTS Voices

Each language has 5 distinct Azure Neural TTS voices optimized for different age groups:

| Age Group      | Voice Characteristics              |
|----------------|----------------------------------- |
| K-2            | Warm, encouraging, simple language |
| Grades 3-5     | Friendly, clear, patient           |
| Grades 6-8     | Conversational, supportive         |
| Grades 9-12    | Professional, engaging             |
| College/Adult  | Mature, authoritative              |

**Voice Configuration**: `server/services/voice.ts`

### Communication Modes

1. **Voice Mode**: Full bidirectional voice (student speaks + hears tutor)
2. **Hybrid Mode**: Listen-only (student reads transcript + hears tutor, responds via text)
3. **Text-Only Mode**: Pure text chat (no audio)

**Mode Switching**: Real-time via UI controls, synced with backend via WebSocket messages

### 5-Minute Inactivity Auto-Timeout (November 2025)

**Purpose**: Prevents wasted minutes from forgotten sessions

**Implementation**:
- Backend tracks `lastActivityTime` via speech and text
- Check interval: Every 30 seconds
- **4-minute warning**: Audio message if enabled
- **5-minute auto-end**: Farewell message + proper minute deduction
- Activity timer resets on any user interaction

**Key Code**:
```typescript
// Reset on user speech (Deepgram final transcripts)
state.lastActivityTime = Date.now();
state.inactivityWarningSent = false;

// Reset on text messages
state.lastActivityTime = Date.now();
state.inactivityWarningSent = false;
```

**Timer Cleanup**: Centralized in `finalizeSession()` to prevent memory leaks

---

## AI & Learning Engine

### Primary AI Model
**Model**: Anthropic Claude Sonnet 4  
**API**: Anthropic Messages API  
**Context Window**: 200k tokens  
**Temperature**: 0.7 (balanced creativity/consistency)

### Modified Adaptive Socratic Method

**Philosophy**: Balance guided discovery with direct instruction to prevent frustration while maximizing learning.

#### Three-Phase Approach

**Phase 1: Guided Discovery (First Question)**
- ALWAYS guide with questions first
- NEVER give direct answers immediately
- Ask "What do you think?" 
- Suggest problem-solving strategies
- Example: "What operation should we use when combining these numbers?"

**Phase 2: Direct Instruction (After 2-3 Tries)**
- Give complete answer with clear explanation after 2-3 failed attempts
- Break down WHY each step works
- Detect frustration signals
- Example: "Let me show you! When we add 5 + 3, we're combining..."

**Phase 3: Understanding Check**
- Confirm comprehension through explanation
- Offer similar practice problems
- Example: "Can you explain back to me how we solved that?"

**Critical Rule**: Tutor must guide students to think first, but will provide answers after 2-3 genuine attempts to prevent frustration and gaming the system.

### Frustration Detection

**8 Frustration Signals**:
1. "I don't know"
2. "I give up"
3. "This is too hard"
4. "I can't do this"
5. "Help me"
6. "Just tell me"
7. "I'm confused"
8. "I don't understand"

**Response**: Immediately switch to direct teaching mode (Phase 2)

### Tutor Personalities

Five distinct age-specific personalities, all sharing the Adaptive Socratic core:

| Age Group      | Personality Traits                                    |
|----------------|-------------------------------------------------------|
| K-2            | Ultra-patient, playful, simple vocabulary            |
| Grades 3-5     | Encouraging, curious, uses examples                  |
| Grades 6-8     | Supportive, relatable, age-appropriate humor         |
| Grades 9-12    | Respectful, intellectually engaging, challenging     |
| College/Adult  | Professional, concise, academically rigorous         |

**Implementation**: `server/config/tutor-personalities.ts`

### Content Moderation System

**Philosophy**: Balanced, context-aware moderation for educational environments

**Two-Tier System**:
1. **Keyword Whitelist**: Educational terms (anatomy, biology) bypass flagging
2. **Multi-Layered AI Moderation**: Acts only on high-confidence violations

**Moderation Flow**:
```
User Message
    ↓
Keyword Whitelist Check
    ↓ (if not whitelisted)
AI Content Analysis
    ↓
High Confidence Violation? → Terminate Session
Low/Medium Confidence? → Allow + Log
```

**Key Files**:
- `server/services/content-moderation.ts`: Moderation logic
- `server/config/moderation-keywords.ts`: Keyword lists

---

## Payment & Subscription System

### Stripe Integration

**Products**:
1. **Starter**: $9.99/month - 120 minutes
2. **Standard**: $19.99/month - 300 minutes
3. **Pro**: $39.99/month - 720 minutes
4. **Elite**: $79.99/month - 1800 minutes
5. **Top-Up**: $9.99 one-time - 60 rollover minutes

### Hybrid Minute Tracking

**Two Separate Balances**:

1. **Subscription Minutes** (`subscriptionMinutes`)
   - Reset monthly on subscription renewal
   - Lost if not used within billing cycle
   - Tracked in Stripe metadata

2. **Purchased Minutes** (`purchasedMinutes`)
   - Rollover indefinitely
   - Persist across subscription changes
   - Deducted AFTER subscription minutes exhausted

**Deduction Logic**:
```typescript
async function deductMinutes(userId: number, minutes: number) {
  // 1. Try deducting from subscription minutes first
  if (user.subscriptionMinutes >= minutes) {
    user.subscriptionMinutes -= minutes;
    return;
  }
  
  // 2. If insufficient, use subscription + purchased
  const fromSubscription = user.subscriptionMinutes;
  const fromPurchased = minutes - fromSubscription;
  
  user.subscriptionMinutes = 0;
  user.purchasedMinutes -= fromPurchased;
}
```

**Key Files**:
- `server/services/voice-minutes.ts`: Minute management
- `server/routes.ts`: `/api/stripe/webhook` handler

### Stripe Webhook Events

**Handled Events**:
- `customer.subscription.created`: Initialize subscription
- `customer.subscription.updated`: Sync status changes
- `customer.subscription.deleted`: Handle cancellations
- `invoice.payment_succeeded`: Add monthly minutes
- `checkout.session.completed`: Process one-time purchases

**Security**: Webhook signature verification with `STRIPE_WEBHOOK_SECRET`

---

## Key Features

### 1. RAG (Retrieval-Augmented Generation) System

**Purpose**: Personalized learning from uploaded documents

**Supported Formats**:
- PDF (`.pdf`)
- Word (`.docx`)
- Images (`.jpg`, `.png`) via OCR (Tesseract.js)
- Excel (`.xlsx`)
- Text (`.txt`)
- XML (`.xml`)

**Processing Pipeline**:
```
Upload
  ↓
Text Extraction (pdf-parse, mammoth, tesseract.js)
  ↓
Chunking (500-char chunks with 50-char overlap)
  ↓
Embedding Generation (OpenAI text-embedding-3-small)
  ↓
Vector Storage (PostgreSQL + pgvector)
  ↓
Retrieval (cosine similarity search)
  ↓
Injection into System Prompt
```

**Key Files**:
- `server/services/document-processing.ts`: Text extraction
- `server/services/embeddings.ts`: Vector generation + search
- `server/workers/embedding-worker.ts`: Background processing

### 2. Admin Dashboard

**Features**:
- User management (view, edit, delete, impersonate)
- Subscription management
- Document management
- Analytics & reporting
- Audit logging (all admin actions tracked)
- Agent monitoring (ElevenLabs, Claude, Deepgram status)

**Access Control**: Role-based (`role: 'admin'`)

**Key Files**:
- `client/src/pages/admin-dashboard.tsx`: Main dashboard
- `server/services/admin.ts`: Admin logic

### 3. Cross-Device Session Tracking

**Problem**: Multiple devices using same account simultaneously

**Solution**: 30-second polling for minute balance updates

**Implementation**:
```typescript
useQuery({
  queryKey: ['/api/user/minutes'],
  queryFn: async () => {
    const res = await fetch('/api/user/minutes');
    return res.json();
  },
  refetchInterval: 30000 // 30 seconds
});
```

**Result**: Consistent minute balance across all devices

### 4. Document Auto-Cleanup

**Service**: Background service runs every 24 hours

**Logic**:
```typescript
const sixMonthsAgo = new Date();
sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

await db.delete(userDocuments)
  .where(lt(userDocuments.expiresAt, sixMonthsAgo));
```

**Purpose**: GDPR compliance + storage cost reduction

---

## File Structure

```
jie-mastery-ai-tutor/
├── client/                    # Frontend React application
│   ├── src/
│   │   ├── components/        # React components
│   │   │   ├── ui/           # Shadcn/ui primitives
│   │   │   ├── realtime-voice-host.tsx
│   │   │   ├── realtime-voice-transcript.tsx
│   │   │   └── voice-mode-controls.tsx
│   │   ├── hooks/            # Custom React hooks
│   │   │   ├── use-custom-voice.ts
│   │   │   └── use-toast.ts
│   │   ├── lib/              # Utilities
│   │   │   ├── queryClient.ts
│   │   │   └── utils.ts
│   │   ├── pages/            # Page components (Wouter routes)
│   │   │   ├── home.tsx
│   │   │   ├── dashboard.tsx
│   │   │   ├── learn.tsx
│   │   │   ├── admin-dashboard.tsx
│   │   │   └── auth-page.tsx
│   │   ├── App.tsx           # Main app component + routes
│   │   └── main.tsx          # React entry point
│   ├── index.html            # HTML entry point
│   └── public/               # Static assets
│       └── audio-processor.js # AudioWorklet processor
│
├── server/                    # Backend Express application
│   ├── config/               # Configuration files
│   │   ├── tutor-personalities.ts
│   │   └── moderation-keywords.ts
│   ├── llm/                  # LLM-related logic
│   │   └── adaptiveSocraticCore.ts
│   ├── middleware/           # Express middleware
│   │   ├── ws-session-validator.ts
│   │   └── ws-rate-limiter.ts
│   ├── routes/               # API routes
│   │   ├── routes.ts         # Main HTTP routes
│   │   └── custom-voice-ws.ts # WebSocket handler
│   ├── services/             # Business logic
│   │   ├── voice.ts          # TTS service
│   │   ├── deepgram.ts       # STT service
│   │   ├── document-processing.ts
│   │   ├── embeddings.ts
│   │   ├── content-moderation.ts
│   │   ├── voice-minutes.ts
│   │   └── admin.ts
│   ├── workers/              # Background workers
│   │   └── embedding-worker.ts
│   ├── storage.ts            # Database storage layer
│   ├── index.ts              # Server entry point
│   └── vite.ts               # Vite dev server integration
│
├── shared/                    # Shared code (frontend + backend)
│   └── schema.ts             # Drizzle ORM schema + Zod types
│
├── docs/                      # Documentation
│   └── TECHNICAL_DOCUMENTATION.md
│
├── package.json              # Dependencies
├── tsconfig.json             # TypeScript config
├── tailwind.config.ts        # Tailwind config
├── vite.config.ts            # Vite config
├── drizzle.config.ts         # Drizzle config
└── replit.md                 # Project memory/preferences
```

### Key Files Explained

| File | Purpose |
|------|---------|
| `shared/schema.ts` | Single source of truth for database schema + TypeScript types |
| `server/routes/custom-voice-ws.ts` | Core voice session logic (1600+ lines) |
| `server/storage.ts` | Database abstraction layer (Drizzle queries) |
| `client/src/hooks/use-custom-voice.ts` | WebSocket client logic |
| `server/services/voice-minutes.ts` | Minute tracking + deduction |
| `server/middleware/ws-session-validator.ts` | WebSocket authentication |

---

## Development Workflow

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables (see section below)
cp .env.example .env

# 3. Initialize database
npm run db:push

# 4. Start development server
npm run dev
```

### Database Migrations

**CRITICAL: Never manually write SQL migrations**

```bash
# Sync schema changes to database
npm run db:push

# If data-loss warning appears, force push
npm run db:push --force
```

**Rule**: Use `ADD COLUMN IF NOT EXISTS` pattern for safe production migrations

### Running Workflows

The project uses Replit Workflows:

1. **Start application**: `npm run dev` (port 5000)
   - Starts Express server + Vite dev server
   - Hot reload enabled for frontend
   - Backend auto-restarts on TypeScript changes

### Code Style

**TypeScript Strict Mode**: Enabled
- No implicit any
- Strict null checks
- Strict function types

**Naming Conventions**:
- Files: `kebab-case.ts`
- Components: `PascalCase.tsx`
- Hooks: `use-kebab-case.ts`
- Constants: `SCREAMING_SNAKE_CASE`

**Import Aliases**:
```typescript
@/          → client/src/
@shared/    → shared/
@lib/       → client/src/lib/
@components → client/src/components/
@assets     → attached_assets/
```

---

## Deployment

### Platform: Replit Autoscale

**Deployment Type**: Autoscale (serverless, stateless)

**Requirements**:
- WebSocket support ✓
- Horizontal scaling ✓
- PostgreSQL database ✓
- Environment variable management ✓

### Deployment Configuration

**File**: Replit deployment settings

```typescript
{
  deployment_target: "autoscale",
  run: ["node", "--import", "tsx", "server/index.ts"],
  build: ["npm", "run", "build"], // Vite build
  public_dir: null // Not static
}
```

### Railway TLS Proxy Considerations

**Issue**: Railway's TLS proxy can drop WebSocket close frames

**Solution**: HTTP fallback system
```typescript
// Wait 3 seconds for WebSocket close frame
setTimeout(() => {
  if (!sessionEndedAckReceived) {
    // Fallback to HTTP POST
    fetch('/api/sessions/end', { method: 'POST', body: sessionId });
  }
}, 3000);
```

**Key Files**:
- `client/src/hooks/use-custom-voice.ts`: HTTP fallback logic
- `server/routes.ts`: `/api/sessions/end` endpoint

### Environment Variables in Production

**Managed via Replit Secrets**:
- Auto-injected into deployment
- Never committed to git
- Encrypted at rest

### Database in Production

**Provider**: Neon (serverless PostgreSQL)
**Connection**: Via `DATABASE_URL` environment variable
**Pooling**: pg pool with max 10 connections

---

## Environment Variables

### Required Secrets

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# AI Services
ANTHROPIC_API_KEY=sk-ant-api03-...
OPENAI_API_KEY=sk-...
DEEPGRAM_API_KEY=...
ASSEMBLYAI_API_KEY=...          # Alternative STT provider
ELEVENLABS_API_KEY=sk_...

# STT Provider Selection
STT_PROVIDER=deepgram           # Options: deepgram (default), assemblyai

# Azure Speech (Backup TTS)
AZURE_SPEECH_KEY=...
AZURE_SPEECH_REGION=eastus

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_STANDARD=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_ELITE=price_...
STRIPE_PRICE_TOPUP_60=price_...

# Email
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@yourdomain.com

# Session
SESSION_SECRET=random-256-bit-string

# ElevenLabs Agent IDs (age-specific)
ELEVENLABS_AGENT_K2=...
ELEVENLABS_AGENT_35=...
ELEVENLABS_AGENT_68=...
ELEVENLABS_AGENT_912=...
ELEVENLABS_AGENT_COLLEGE=...
```

### Frontend Environment Variables

**Prefix Required**: `VITE_`

```bash
VITE_STRIPE_PUBLIC_KEY=pk_test_...
```

**Access**: `import.meta.env.VITE_STRIPE_PUBLIC_KEY`

---

## Testing

### Manual Testing Checklist

**Authentication**:
- [ ] Register new user
- [ ] Email verification flow
- [ ] Login with correct credentials
- [ ] Login with incorrect credentials
- [ ] Logout

**Voice Sessions**:
- [ ] Start voice session
- [ ] Speak and verify transcript
- [ ] Verify AI response
- [ ] Verify TTS audio playback
- [ ] Switch to hybrid mode
- [ ] Switch to text-only mode
- [ ] Upload document during session
- [ ] End session gracefully
- [ ] Verify minute deduction

**Inactivity Timeout**:
- [ ] Start session and stay silent for 4 minutes
- [ ] Verify warning message + audio
- [ ] Continue silence to 5 minutes
- [ ] Verify session auto-ends with farewell
- [ ] Verify proper minute deduction

**Payments**:
- [ ] Purchase subscription (test mode)
- [ ] Verify minutes added
- [ ] Purchase top-up
- [ ] Verify rollover minutes
- [ ] Cancel subscription
- [ ] Verify webhook handling

**Admin Dashboard**:
- [ ] View user list
- [ ] Edit user details
- [ ] View session history
- [ ] Check analytics

### Load Testing

**WebSocket Rate Limits**:
- 20 upgrade requests per minute per IP
- 5 concurrent connections per IP

**Test Tools**: Artillery, k6

---

## Known Issues & Solutions

### Issue 1: Railway TLS Proxy Drops WebSocket Close Frames

**Symptom**: Session doesn't end cleanly, minutes not deducted

**Solution**: HTTP fallback system (implemented Nov 18, 2025)

**Status**: ✅ RESOLVED

---

### Issue 2: ~~30-Minute Session Rotation Kills Long Sessions~~

**Symptom**: Sessions disconnected after 30 minutes

**Solution**: Removed inappropriate session rotation check

**Status**: ✅ RESOLVED (Nov 18, 2025)

---

### Issue 3: Quiet Microphones Produce No Audio

**Symptom**: Deepgram receives no audio from quiet microphones

**Solution**: 100x gain amplification in audio processing pipeline

**Status**: ✅ RESOLVED (Nov 2025)

---

### Issue 4: Database ID Type Confusion

**Symptom**: Migration errors when changing `serial` ↔ `varchar`

**Solution**: NEVER change primary key ID types. Check existing schema first.

**Rule**:
```typescript
// If already serial, keep serial
id: serial("id").primaryKey()

// If already varchar, keep varchar
id: varchar("id").primaryKey().default(sql`gen_random_uuid()`)
```

**Status**: ⚠️ ONGOING RISK - Follow rule above

---

## Appendix A: Common Commands

```bash
# Development
npm run dev              # Start dev server (port 5000)
npm run build            # Build for production
npm run preview          # Preview production build

# Database
npm run db:push          # Sync schema to database
npm run db:push --force  # Force sync (bypasses warnings)
npm run db:studio        # Open Drizzle Studio GUI

# Package Management
npm install <package>    # Install package (use packager_install_tool in Replit)
npm uninstall <package>  # Uninstall package

# Debugging
npm run dev -- --debug   # Start with debug logging
```

---

## Appendix B: Troubleshooting Guide

### Problem: "Session expired - requires rotation"

**Cause**: Old session rotation logic (REMOVED Nov 18, 2025)

**Solution**: Pull latest code. Issue resolved.

---

### Problem: "No audio from microphone"

**Checklist**:
1. Browser permissions granted?
2. HTTPS connection? (required for getUserMedia)
3. Check browser console for errors
4. Verify gain amplification is active

---

### Problem: "Minutes not deducted after session"

**Checklist**:
1. Session ended properly? (check `realtime_sessions.status`)
2. WebSocket close frame received? (check logs)
3. HTTP fallback triggered? (3-second timeout)
4. Database transaction committed?

---

### Problem: "Stripe webhook failing"

**Checklist**:
1. Webhook secret correct?
2. Signature verification passing?
3. Endpoint publicly accessible?
4. Response within 10 seconds?

---

## Appendix C: Key Metrics

**Performance Targets**:
- Voice latency: <2 seconds end-to-end
- API response time: <100ms (p95)
- WebSocket upgrade: <500ms
- Document processing: <5 seconds per document

**Cost Estimates** (per 1000 users/month):
- Deepgram: ~$50-100
- Claude: ~$200-400
- ElevenLabs: ~$150-300
- Database: ~$20-50
- Total: ~$420-850

---

## Appendix D: Security Checklist

- [x] HTTPS enforced in production
- [x] Session cookies httpOnly + secure
- [x] Password hashing (bcrypt)
- [x] SQL injection protection (Drizzle ORM)
- [x] XSS protection (React escaping)
- [x] CSRF protection (SameSite cookies)
- [x] Rate limiting (WebSocket upgrades)
- [x] Webhook signature verification
- [x] Environment secrets encrypted
- [x] Email verification (COPPA)
- [x] Admin role-based access control

---

## Appendix E: Contact & Support

**Technical Questions**: Review this document + `replit.md`

**Key Resources**:
- Anthropic Docs: https://docs.anthropic.com
- Deepgram Docs: https://developers.deepgram.com
- ElevenLabs Docs: https://docs.elevenlabs.io
- Stripe Docs: https://stripe.com/docs
- Drizzle Docs: https://orm.drizzle.team

---

**Document Version**: 1.0  
**Last Review**: November 19, 2025  
**Next Review**: December 19, 2025
