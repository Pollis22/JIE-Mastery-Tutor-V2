# JIE Mastery Tutor - Technical Summary

## 📋 Project Overview

**JIE Mastery Tutor** is a production-ready conversational AI tutoring platform that provides personalized learning experiences for students across all age groups. The platform combines voice-based AI conversations, document-based learning (RAG), and adaptive teaching methods to deliver interactive educational experiences in Math, English, Spanish, and other subjects.

**Target Audience:** K-12 students, college students, and adult learners  
**Core Value Proposition:** AI-powered tutoring with voice conversations, personalized learning paths, and document-based context understanding

---

## 🏗️ Technology Stack

### Frontend
- **Framework:** React 18+ with TypeScript
- **Build Tool:** Vite 5.4
- **Routing:** Wouter 3.3 (lightweight React router)
- **State Management:** TanStack Query v5 (React Query)
- **UI Components:** Shadcn/ui with Radix UI primitives
- **Styling:** Tailwind CSS 3.4 with Tailwind Animate
- **Icons:** Lucide React + React Icons
- **Forms:** React Hook Form with Zod validation

### Backend
- **Runtime:** Node.js 20+
- **Framework:** Express 4.21
- **Language:** TypeScript with tsx runtime
- **Database ORM:** Drizzle ORM 0.39
- **Database:** PostgreSQL (Neon-backed on Replit, Railway-compatible)
- **Authentication:** Passport.js with Local Strategy
- **Session Store:** PostgreSQL-based sessions (connect-pg-simple)
- **Password Hashing:** Node.js scrypt (native crypto)

### AI & Voice Services
- **Primary AI:** OpenAI GPT-4o (with GPT-4o-mini fallback)
- **Voice API:** OpenAI Realtime API (WebRTC-based)
- **Legacy Voice:** ElevenLabs ConvAI (5 age-specific agents)
- **TTS Fallback:** Azure Speech Services (Neural TTS)
- **Embeddings:** OpenAI text-embedding-3-small (1536 dimensions)
- **Vector Database:** pgvector extension for PostgreSQL

### Payment & Billing
- **Payment Processor:** Stripe
- **Subscription Management:** Stripe Subscriptions
- **Pricing Tiers:** Starter, Standard, Pro, + One-time minute purchases
- **Minute Tracking:** Hybrid system (subscription + purchased rollover)

### Email & Marketing
- **Email Service:** Resend
- **Email Types:** Transactional (welcome, subscription) + Marketing campaigns
- **Consent Tracking:** User opt-in/opt-out with timestamps

### Document Processing (RAG System)
- **Text Extraction:** pdf-parse (PDFs), mammoth (DOCX), tesseract.js (OCR)
- **Chunking:** Custom segmentation with token counting
- **Vector Storage:** pgvector with HNSW indexing
- **Semantic Search:** Cosine similarity on embeddings

---

## 🎯 Core Features

### 1. Voice-Based AI Tutoring
- **Multi-Age Support:** 5 specialized tutors (K-2, Grades 3-5, 6-8, 9-12, College/Adult)
- **Teaching Method:** Socratic approach with adaptive questioning
- **Languages:** English, Spanish (multi-language support)
- **Voice Options:** Age-appropriate voices with configurable speech speed
- **Real-time Transcripts:** Live display with search and export capabilities

### 2. RAG (Retrieval-Augmented Generation) System
- **Document Upload:** PDF, DOCX, TXT files with drag-and-drop
- **OCR Support:** tesseract.js for image-based text extraction
- **Background Processing:** Async embedding worker with retry logic
- **Context Injection:** Relevant document chunks included in AI prompts
- **Per-Student Storage:** Documents tied to user accounts
- **Session Persistence:** Option to keep documents for future sessions

### 3. Voice Minutes Management
- **Hybrid Tracking System:**
  - Subscription minutes: Reset monthly (30-day cycle)
  - Purchased minutes: Never expire, rollover indefinitely
  - FIFO Consumption: Uses subscription minutes first, then purchased
- **Minute Packages:**
  - Starter: 60 min/month
  - Standard: 240 min/month  
  - Pro: 600 min/month
  - Top-up: 60 minutes one-time purchase
- **Balance Display:** Real-time tracking with detailed breakdown

### 4. Adaptive Learning Engine
- **Progress Tracking:** Lesson completion, quiz scores, session history
- **Personalized Paths:** AI adapts based on student performance
- **Multi-Subject Support:** Math, English, Spanish, Science, etc.
- **Session Analytics:** Duration, transcript storage, subject tracking

### 5. Admin Dashboard
- **User Management:** View, edit, suspend users
- **Subscription Control:** Manual adjustments, minute grants
- **Document Management:** View, delete user documents
- **Analytics Dashboard:** 
  - Total sessions, weekly minutes
  - User growth, subscription metrics
  - Document processing status
- **Audit Logging:** All admin actions tracked with timestamps
- **Marketing Tools:** Contact export with segment filtering

### 6. Security & Authentication
- **Password Security:** scrypt hashing with unique salts
- **Session Management:** PostgreSQL-backed sessions
- **Email Verification:** Token-based with expiry
- **Password Reset:** Secure token system with time limits
- **Role-Based Access:** Admin privileges for platform management

---

## 🗄️ Database Schema

### Core Tables

#### Users Table
```typescript
- id: varchar (UUID primary key)
- email: text (unique)
- username: text (unique)
- password: text (hashed)
- parent_name, student_name, student_age, grade_level
- primary_subject, preferred_language
- subscription_plan, subscription_status
- stripe_customer_id, stripe_subscription_id
- subscription_minutes_used, subscription_minutes_limit
- purchased_minutes_balance
- billing_cycle_start, last_reset_at
- is_admin, email_verified
- marketing_opt_in, marketing_opt_in_date
- voice_style, speech_speed, volume_level
- created_at, updated_at
```

#### Minute Purchases Table (Rollover System)
```typescript
- id: varchar (UUID)
- user_id: varchar (foreign key)
- minutes_purchased: integer
- minutes_remaining: integer (tracks usage via FIFO)
- price_paid: decimal(10,2)
- purchased_at: timestamp
- expires_at: timestamp (null = never expires)
- status: 'active' | 'used' | 'expired'
```

#### Learning Sessions
```typescript
- id: varchar (UUID)
- user_id, lesson_id
- session_type: 'voice' | 'text' | 'quiz'
- context_documents: jsonb (array of doc IDs)
- transcript: text
- voice_minutes_used: integer
- duration: integer
- started_at, ended_at
- is_completed: boolean
```

### RAG System Tables

#### User Documents
```typescript
- id: varchar (UUID)
- user_id: varchar
- original_name, file_name, file_path
- file_type, file_size
- subject, grade, title, description
- keep_for_future_sessions: boolean
- processing_status: 'queued' | 'processing' | 'ready' | 'failed'
- processing_error, retry_count, next_retry_at
- parsed_text_path
- created_at, updated_at
```

#### Document Chunks
```typescript
- id: varchar (UUID)
- document_id: varchar (foreign key, cascade delete)
- chunk_index: integer
- content: text
- token_count: integer
- metadata: jsonb (page numbers, sections)
```

#### Document Embeddings
```typescript
- id: varchar (UUID)
- chunk_id: varchar (unique, cascade delete)
- embedding: vector(1536) (pgvector)
- embedding_model: text (default: text-embedding-3-small)
- created_at
- HNSW index on embedding for fast cosine similarity
```

### Admin & Analytics Tables

#### Admin Logs
```typescript
- id: varchar (UUID)
- admin_id: varchar (foreign key)
- action: text (e.g., 'user_suspended', 'minutes_granted')
- target_type, target_id
- details: jsonb
- timestamp, created_at
```

#### Marketing Campaigns
```typescript
- id: varchar (UUID)
- admin_id: varchar
- campaign_name, segment
- contact_count: integer
- filters: jsonb
- exported_at, created_at
```

---

## 🔌 Key API Endpoints

### Authentication
- `POST /api/register` - User registration
- `POST /api/login` - User login
- `POST /api/logout` - User logout
- `GET /api/user` - Get current user
- `POST /api/forgot-password` - Request password reset
- `POST /api/reset-password` - Reset password with token

### Voice & Sessions
- `GET /api/voice-balance` - Get user's voice minute balance
- `POST /api/sessions` - Create new learning session
- `GET /api/sessions` - List user's sessions
- `PATCH /api/sessions/:id/end` - End session and deduct minutes

### Documents (RAG)
- `POST /api/documents/upload` - Upload document
- `GET /api/documents` - List user documents
- `DELETE /api/documents/:id` - Delete document
- `GET /api/documents/:id/chunks` - Get document chunks for context

### Admin
- `GET /api/admin/users` - List all users (admin only)
- `PATCH /api/admin/users/:id` - Update user (admin only)
- `GET /api/admin/documents` - Manage all documents
- `POST /api/admin/grant-minutes` - Grant minutes to user
- `GET /api/admin/audit-logs` - View audit trail
- `POST /api/admin/export-contacts` - Export marketing contacts

### Dashboard & Analytics
- `GET /api/dashboard/stats` - Get dashboard statistics
- `GET /api/analytics/usage` - User usage analytics

### Stripe Integration
- `POST /api/create-checkout-session` - Create Stripe checkout
- `POST /api/stripe-webhook` - Handle Stripe webhooks
- `POST /api/create-portal-session` - Customer portal access

---

## 🧮 System Architecture

### Session-First Data Model
The platform uses a **session-first priority system** where:
1. Session configuration (grade, subject, language) takes precedence
2. User profile serves as defaults
3. Enables family sharing on single accounts (siblings with different grades)

### Hybrid Minute Tracking
```
Minute Consumption Flow:
1. Check subscription minutes remaining
2. If available, deduct from subscription_minutes_used
3. If exhausted, use purchased minutes (FIFO from minute_purchases table)
4. Update minutes_remaining in purchase records
5. Mark purchases as 'used' when minutes_remaining = 0
```

### RAG Processing Pipeline
```
Document Upload → Queue (status: 'queued')
    ↓
Background Worker picks up document
    ↓
Extract text (PDF/DOCX/OCR)
    ↓
Chunk text (semantic segments)
    ↓
Generate embeddings (OpenAI API)
    ↓
Store in pgvector with HNSW index
    ↓
Status: 'ready' (available for sessions)
```

### Voice Session Flow
```
1. User starts session (selects grade, subject, language)
2. System checks minute balance
3. If RAG enabled: Semantic search retrieves relevant chunks
4. Context + chunks sent to OpenAI Realtime API
5. WebRTC streams audio bidirectionally
6. Transcript captured in real-time
7. Session end: Calculate duration, deduct minutes
8. Store transcript and session data
```

---

## 🚀 Deployment Architecture

### Replit Deployment (Development & Testing)
- **Database:** Replit PostgreSQL (Neon-backed)
- **Storage:** Replit Object Storage (planned)
- **Deployment:** Replit Autoscale (horizontal scaling)
- **Environment:** Managed secrets, automatic HTTPS

### Railway Deployment (Production)
- **Database:** Railway PostgreSQL
- **Auto-Migration:** `scripts/init-railway-db.js` runs on startup
- **Build Process:** Vite build → tsx server start
- **Network:** Internal `.railway.internal` (no SSL)
- **Scaling:** Railway Autoscale deployment

### Database Migration System
```javascript
// Runs automatically on Railway deployment
npm run start
  ├── npm run init-db (migration script)
  └── tsx server/index.ts (start server)

Migration creates/updates:
- All missing user table columns
- minute_purchases table with FIFO tracking
- RAG tables (user_documents, chunks, embeddings)
- Admin tables (audit_logs, marketing_campaigns)
- pgvector extension
```

---

## 🔐 Environment Variables

### Required Secrets
```bash
# Database
DATABASE_URL=postgresql://...

# OpenAI
OPENAI_API_KEY=sk-...

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_STANDARD=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_TOPUP_60=price_...

# Email
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@...

# Azure Speech (Optional)
AZURE_SPEECH_KEY=...
AZURE_SPEECH_REGION=...

# ElevenLabs (Legacy)
ELEVENLABS_API_KEY=...
ELEVENLABS_AGENT_ID=...
ELEVENLABS_AGENT_K2=...
ELEVENLABS_AGENT_35=...
ELEVENLABS_AGENT_68=...
ELEVENLABS_AGENT_912=...
ELEVENLABS_AGENT_COLLEGE=...
```

---

## 🎨 Frontend Architecture

### Component Structure
```
client/src/
├── pages/              # Route pages
│   ├── dashboard.tsx   # Main dashboard
│   ├── voice-tutor.tsx # Voice session interface
│   ├── documents.tsx   # RAG document management
│   └── admin/          # Admin pages
├── components/
│   ├── ui/            # Shadcn components
│   ├── voice/         # Voice session components
│   ├── rag/           # Document components
│   └── layout/        # Navigation, headers
├── lib/
│   ├── queryClient.ts # TanStack Query setup
│   └── utils.ts       # Utilities
└── App.tsx            # Route configuration
```

### State Management
- **TanStack Query:** API state, caching, background updates
- **React Hook Form:** Form state with Zod validation
- **Session Storage:** PostgreSQL-backed auth sessions
- **Local State:** Component-level state with useState

---

## 🔄 Background Services

### Embedding Worker
```typescript
// Runs every 15 seconds
EmbeddingWorker.tick()
  ├── Query for queued documents (batch of 3)
  ├── For each document:
  │   ├── Extract text
  │   ├── Chunk content
  │   ├── Generate embeddings
  │   └── Store in pgvector
  └── Retry failed docs with exponential backoff
```

**Retry Schedule:** 1min → 5min → 15min → 1hr → 6hr (max 5 retries)

---

## 📊 Key Design Decisions

### Why Hybrid Minute Tracking?
- **User Benefit:** Purchased minutes never expire
- **Business Benefit:** Encourages top-up purchases
- **Technical:** FIFO consumption from minute_purchases table

### Why Session-First Configuration?
- **Family Sharing:** Multiple students, different grades, one account
- **Flexibility:** Switch subjects/languages per session
- **Privacy:** No need for multiple accounts

### Why pgvector for RAG?
- **Performance:** HNSW index for fast similarity search
- **Simplicity:** Same database, no separate vector DB
- **Cost:** Included with PostgreSQL

### Why OpenAI Realtime API?
- **Native WebRTC:** Browser-to-OpenAI streaming
- **Low Latency:** <200ms voice response
- **Multi-language:** Built-in language support
- **Quality:** GPT-4o voice capabilities

---

## 📈 Scalability Considerations

### Database Optimization
- **Indexes:** All foreign keys, frequently queried columns
- **Connection Pooling:** max 10 connections, 30s idle timeout
- **Vector Search:** HNSW index for O(log n) similarity search

### Caching Strategy
- **TanStack Query:** 5min cache for user data
- **Session Cache:** PostgreSQL session store
- **Semantic Cache:** 24hr TTL for repeated questions (LRU cache)

### Cost Management
- **Minute Caps:** Subscription limits prevent runaway costs
- **Batch Processing:** Documents processed in batches of 3
- **Model Fallback:** GPT-4o-mini for non-critical tasks

---

## 🧪 Testing & Quality

### Testing Stack
- **E2E Tests:** Playwright
- **Acceptance Tests:** Jest
- **Type Safety:** TypeScript strict mode
- **Schema Validation:** Zod for runtime checks

### Development Workflow
```bash
npm run dev          # Start dev server (Vite + Express)
npm run build        # Production build
npm run check        # TypeScript type checking
npm run db:push      # Sync database schema
npm run test         # Run tests
```

---

## 🔗 External Integrations

### OpenAI Integration
- **Models:** GPT-4o, GPT-4o-mini
- **Embeddings:** text-embedding-3-small (1536d)
- **Realtime API:** WebRTC voice streaming
- **Use Cases:** Tutoring, embeddings, text generation

### Stripe Integration
- **Checkout:** Hosted checkout pages
- **Subscriptions:** Recurring billing with auto-renewal
- **Webhooks:** Event handling for payment updates
- **Customer Portal:** Self-service subscription management

### Resend Integration
- **Transactional Emails:** Welcome, subscription confirmations
- **Marketing Emails:** Campaign exports with user consent
- **Templates:** Dynamic email rendering

### ElevenLabs Integration (Legacy)
- **Agents:** 5 pre-configured age-specific tutors
- **Conversational AI:** Full conversation handling
- **Backup System:** Fallback when OpenAI unavailable

---

## 📝 Project Structure

```
jie-mastery-tutor/
├── client/                 # React frontend
│   ├── src/
│   │   ├── pages/         # Route pages
│   │   ├── components/    # React components
│   │   ├── lib/           # Utilities
│   │   └── App.tsx        # Main app
│   └── index.html
├── server/                 # Express backend
│   ├── routes.ts          # API routes
│   ├── storage.ts         # Database layer
│   ├── db.ts              # Database connection
│   ├── services/          # Business logic
│   │   ├── voice-minutes.ts
│   │   ├── embedding-worker.ts
│   │   └── document-processor.ts
│   ├── scripts/           # Utility scripts
│   └── index.ts           # Server entry
├── shared/                 # Shared types
│   └── schema.ts          # Drizzle schemas
├── scripts/
│   └── init-railway-db.js # Railway migration
├── package.json
├── vite.config.ts
├── drizzle.config.ts
└── tsconfig.json
```

---

## 🎯 Business Model

### Pricing Tiers
- **Starter:** $19.99/mo - 60 minutes
- **Standard:** $59.99/mo - 240 minutes
- **Pro:** $99.99/mo - 600 minutes
- **Top-up:** $19.99 - 60 minutes (never expires)

### Revenue Streams
1. Monthly subscriptions (recurring)
2. One-time minute purchases (rollover)
3. Potential enterprise/school licensing

---

## 🔮 Future Enhancements

### Planned Features
- [ ] Mobile app (React Native)
- [ ] Group tutoring sessions
- [ ] Parent dashboard for progress monitoring
- [ ] Gamification (badges, streaks, leaderboards)
- [ ] AI-generated practice problems
- [ ] Video explanations alongside voice
- [ ] Multi-student accounts (family plans)

### Technical Roadmap
- [ ] Redis caching for performance
- [ ] Replit Object Storage for documents
- [ ] Advanced analytics dashboard
- [ ] A/B testing framework
- [ ] Automated content moderation
- [ ] Multi-region deployment

---

## 📞 Support & Maintenance

### Monitoring
- **Health Check:** `/api/health` endpoint
- **Error Logging:** Console + future integration (Sentry)
- **Performance:** Database query monitoring

### Database Maintenance
- **Backups:** Automatic (Railway/Replit managed)
- **Migrations:** Automatic on deployment
- **Schema Sync:** `npm run db:push --force`

---

## 👥 User Credentials (Testing)

**Development/Production:**
- Email: `pollis@mfhfoods.com`
- Password: `Crenshaw22$$`
- Role: Admin

---

## 📄 License & Attribution

**License:** MIT  
**AI Services:** OpenAI, ElevenLabs  
**UI Components:** Shadcn/ui (MIT)  
**Icons:** Lucide React (ISC)

---

**Last Updated:** October 2025  
**Version:** 1.0.0  
**Status:** Production Ready ✅
