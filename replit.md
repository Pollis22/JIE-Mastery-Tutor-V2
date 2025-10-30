# AI Tutor - Web Application

## Overview
This project is a production-ready conversational AI tutoring web platform designed to help students learn Math, English, and Spanish. It features interactive voice conversations, personalized quizzes, and adaptive learning paths. The platform includes a fully functional multi-agent AI system with five age-specific AI tutors (K-2, Grades 3-5, 6-8, 9-12, College/Adult), each optimized for their target age group's complexity, vocabulary, and teaching approaches. The system is designed for high reliability and a streamlined user experience, focusing on immediate voice tutoring without dynamic agent creation for each session. The platform supports a hybrid minute tracking policy, allowing for both subscription-based and purchased rollover minutes, and prioritizes per-session configuration for flexible family sharing.

## User Setup Scripts

Three automated scripts are available for creating production and test users in both Railway (production) and dev environments:

### Available Scripts
-   **`npm run setup-all-users`**: Creates all 12 users (2 production + 10 test) in one command (RECOMMENDED)
-   **`npm run restore-users`**: Creates only the 2 production users (admin + subscriber)
-   **`npm run create-test-users`**: Creates only the 10 test users

### Production Users
-   **Admin**: pollis@mfhfoods.com / Crenshaw22$$ (Elite plan, 1800 min, admin privileges, 3 concurrent sessions/logins)
-   **Subscriber**: pollis@aquavertclean.com / Crenshaw22$$ (Starter plan, 60 min)

### Test Users (Password: TestPass123)
-   **Starter**: Test1-3@example.com (60 min each)
-   **Standard**: Test4-5@example.com (240 min each)
-   **Pro**: Test6-7@example.com (600 min each)
-   **Elite**: Test8-9@example.com (1800 min each, 3 concurrent sessions/logins)
-   **Free**: Test10@example.com (no subscription)

All scripts are idempotent (safe to run multiple times) and update existing users instead of creating duplicates. See `USER_SETUP_GUIDE.md` for complete documentation.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Full-Stack Architecture
The application uses a modern full-stack architecture:
-   **Frontend**: React 18+ with Next.js 14+ App Router, TypeScript, and Vite.
-   **Backend**: Node.js with Express API routes.
-   **Database**: PostgreSQL with Drizzle ORM.
-   **Styling**: Tailwind CSS with Shadcn/ui.

### Authentication & Authorization
-   Simple username/password authentication using Passport.js local strategy.
-   Session-based authentication with PostgreSQL session storage.
-   Role-based access control with admin privileges.
-   Password hashing using Node.js scrypt.
-   **Email Verification System**: Complete COPPA-compliant email verification workflow:
    -   New users receive verification emails upon registration
    -   Accounts created after Oct 13, 2025 must verify email before login
    -   Legacy accounts (pre-Oct 13) automatically verified for backwards compatibility
    -   24-hour token expiry with easy resend functionality
    -   Prevents account enumeration (resend endpoint doesn't reveal if email exists)
    -   Admin and test users automatically verified for seamless development
    -   Welcome email sent upon successful verification
    -   Frontend verification page with loading/success/error/expired states

### Access Control & Subscription Enforcement
The platform implements a three-tier access control system ensuring only subscribed users with available minutes can access tutoring services:

-   **requireSubscription Middleware** (`server/middleware/require-subscription.ts`):
    -   Enforces authentication + active subscription + available minute balance
    -   Automatically blocks access when subscription expires or minutes run out
    -   Returns detailed error messages for unauthorized/expired/no-minutes states
    
-   **Protected Voice Endpoints**:
    -   `/api/voice/generate-response` - Legacy voice endpoint (protected)
    -   `/api/streaming/stream-response` - Streaming voice endpoint (protected)
    -   `/api/session/gemini` - Primary Gemini Live voice endpoint (has built-in protection with concurrent session limits + minute checks)
    
-   **Session-Based Minute Deduction**:
    -   When voice sessions end, `storage.endRealtimeSession()` calls `deductMinutes()`
    -   Minutes deducted using subscription-first, then purchased (FIFO) strategy
    -   Deduction happens automatically at session completion
    -   If insufficient minutes, session is prevented from starting (not mid-session cutoff)

-   **Minute Balance Checking**:
    -   Gemini endpoint checks minute balance BEFORE creating sessions
    -   Returns clear error if user has 0 minutes available
    -   Prevents session start rather than cutting off mid-conversation
    
-   **Document Access Policy**:
    -   Document upload allowed for ALL authenticated users (encourages engagement)
    -   Document USAGE during tutoring sessions is automatically protected via session endpoint guards
    -   RAG system integration only accessible when user has active subscription + minutes

-   **Concurrent Login Enforcement** (`server/middleware/enforce-concurrent-logins.ts`):
    -   Default tiers (Starter, Standard, Pro): 1 concurrent device login at a time
    -   Elite tier: 3 concurrent device logins simultaneously
    -   All tiers: Unlimited student profiles supported
    -   When user reaches login limit, oldest session is automatically terminated before allowing new login
    -   Enforced via `maxConcurrentLogins` user attribute (default 1, Elite gets 3)
    -   Separate from voice tutoring session limits (`maxConcurrentSessions`)

### Session Priority System
The platform uses a **session-first** data priority model where session configuration is the primary source for grade level, subject, and language, with user profiles serving as defaults. This enables sibling sharing on a single account.

### Voice Technology Integration

#### Custom Voice Stack (PRIMARY - Production Ready)
Production-ready modular voice pipeline providing full control and transparency:
-   **Architecture**: Deepgram (STT) → Claude Sonnet 4 (AI) → ElevenLabs (TTS)
-   **Endpoint**: `/api/custom-voice-ws` (WebSocket)
-   **Cost**: ~$1.50-2.50/hour of tutoring
    -   Deepgram STT: $0.0077/min ($0.46/hour) for real-time streaming
    -   Claude Sonnet 4: $3/1M input tokens + $15/1M output tokens (~$0.02/hour for typical tutoring)
    -   ElevenLabs TTS: $0.05-0.10/min ($1-2/hour for AI speech)
-   **Latency**: 1-2 seconds end-to-end (optimal for natural tutoring conversations)
-   **Features**:
    -   Session authentication and ownership validation
    -   Transcript queueing (prevents audio loss during processing)
    -   Incremental persistence (auto-saves every 10 seconds + on disconnect)
    -   Age-appropriate voice selection (K-2, 3-5, 6-8, 9-12, College)
    -   Full document context integration
    -   Natural conversation flow with Socratic teaching method
-   **Security**: WebSocket validates sessionId ownership before accepting traffic

### AI & Learning Engine
-   **Primary AI Model**: Claude Sonnet 4 for voice conversations, utilizing an enhanced TutorMind system prompt for Socratic teaching.
-   **Teaching Method**: Advanced Socratic approach with adaptive questioning and emotion-aware responses.
-   **Adaptive Learning**: AI adapts based on user progress and learning patterns, greeting students warmly by name at session start.
-   **Tutor Personalities**: Five distinct age-specific personalities:
     - **Buddy Bear (K-2)**: Super friendly, playful, uses simple language with lots of encouragement
     - **Max Explorer (3-5)**: Adventurous, curious, creates learning adventures with real-world connections
     - **Dr. Nova (6-8)**: Knowledgeable, cool, balances fun with academic rigor
     - **Professor Ace (9-12)**: Expert, professional, college-prep focused with critical thinking emphasis
     - **Dr. Morgan (College/Adult)**: Collaborative peer, efficient, focuses on practical application

### RAG (Retrieval-Augmented Generation) System
-   **Document Processing**: Comprehensive support for multiple file types with intelligent text segmentation:
    -   **PDF files** - Text extraction using pdf-parse 1.1.1 (stable version)
    -   **Word documents** - DOCX/DOC support using mammoth
    -   **PowerPoint presentations** - PPTX slide extraction using adm-zip + xml2js (PPT legacy format not supported)
    -   **Excel spreadsheets** - XLSX/XLS table data using xlsx library
    -   **CSV files** - Comma-separated data parsing
    -   **Images with OCR** - PNG/JPG/JPEG/GIF/BMP text recognition using Tesseract.js
    -   **Plain text** - TXT file direct reading
-   **Document Upload**: Students can upload documents during live voice sessions for immediate AI analysis.
-   **Automatic Document Retrieval**: AI tutor automatically loads ALL user's ready documents at session start
-   **Context Integration**: Documents are processed synchronously and passed to the AI in the system prompt
-   **Synchronous Processing**: Documents are extracted, chunked, and marked "ready" immediately upon upload (no background queue).

### Database Schema & Data Management
Core entities include Users, Subjects, Lessons, User Progress, Learning Sessions, and Quiz Attempts. The RAG system incorporates User Documents, Document Chunks, and Document Embeddings. The Users table includes comprehensive student profile data and marketing preferences. Lazy database initialization is employed.

### Payment & Subscription System
-   Stripe Integration handles subscriptions and payments, supporting single and all-subjects pricing tiers and managing voice minute caps. 
-   **Hybrid Minute Tracking**: Subscription minutes reset monthly, while purchased minutes rollover indefinitely. The system tracks:
    -   `subscription_minutes_used`: Minutes used from monthly subscription (resets every 30 days)
    -   `purchased_minutes_balance`: Remaining purchased minutes (never expires)
    -   `minute_purchases` table: Individual purchase records with FIFO consumption tracking
-   **Voice Minutes Service** (`server/services/voice-minutes.ts`): Centralized service handling all minute operations:
    -   `getUserMinuteBalance()`: Returns detailed balance including subscriptionUsed, purchasedUsed, and totalAvailable
    -   `deductMinutes()`: Uses subscription first, then purchased (FIFO), updating both users table and minute_purchases table
    -   `addPurchasedMinutes()`: Creates new purchase records for tracking
-   **API Endpoints**:
    -   `/api/voice-balance`: Returns comprehensive minute balance for UI display
    -   Supports both new hybrid format and legacy format for backward compatibility

### Email & Marketing Automation
-   Resend Integration for transactional emails (welcome, subscription confirmations) and admin notifications. Includes user consent tracking for marketing opt-in/opt-out.

### Admin Dashboard System
A comprehensive administrative interface with complete audit logging for platform management. Features include user, subscription, document management, platform analytics, agent monitoring, contact management, and audit logs.

### State Management & Caching
-   TanStack Query for API state management, caching, and background updates.
-   PostgreSQL-based session storage for authentication.

### Production Deployment
The application is configured for Replit Autoscale Deployment, supporting WebSockets, horizontal scaling, and a Replit managed PostgreSQL database.

## External Dependencies

### AI & Voice Services
-   **Deepgram**: Speech-to-text service for real-time voice transcription.
-   **Claude (Anthropic)**: AI model providing intelligent tutoring responses.
-   **ElevenLabs**: Text-to-speech service for natural voice synthesis.

### Payment Processing
-   **Stripe**: Used for subscription management, payments, and customer portal.

### Email Services
-   **Resend**: Transactional email delivery for automated communications and marketing.

### Database & Infrastructure
-   **PostgreSQL**: Primary database.
-   **Drizzle ORM**: For database interactions.

### Development & Deployment
-   **Vite**: Frontend development server.
-   **Replit**: Compatible for one-click deployment.

### Frontend Libraries
-   **Radix UI**: Accessible component primitives.
-   **Tailwind CSS**: Utility-first styling.
-   **React Hook Form**: Form management with Zod validation.
-   **Lucide React**: Icon library.