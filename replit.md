# AI Tutor - Web Application

## Overview
This project is a production-ready conversational AI tutoring web platform for Math, English, and Spanish. It offers interactive voice conversations, personalized quizzes, and adaptive learning paths. The platform features a multi-agent AI system with five age-specific tutors (K-2, Grades 3-5, 6-8, 9-12, College/Adult), each optimized for their target age group. It supports a hybrid minute tracking policy (subscription and rollover minutes) and prioritizes per-session configuration for flexible family sharing, designed for high reliability and a streamlined user experience.

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
-   Simple username/password authentication using Passport.js local strategy and session-based authentication with PostgreSQL session storage.
-   Role-based access control with admin privileges.
-   Password hashing using Node.js scrypt.
-   COPPA-compliant email verification system with 24-hour token expiry and account enumeration prevention.

### Access Control & Subscription Enforcement
A three-tier access control system ensures only subscribed users with available minutes can access tutoring.
-   `requireSubscription` middleware enforces authentication, active subscription, and minute balance.
-   Protected voice endpoints (`/api/voice/generate-response`, `/api/streaming/stream-response`, `/api/session/gemini`) ensure minute and concurrent session limits.
-   Session-based minute deduction occurs automatically at session completion, using a subscription-first, then purchased (FIFO) strategy.
-   Minute balance is checked before session initiation to prevent mid-session cutoffs.
-   Document upload is allowed for all authenticated users, but RAG system integration is protected by subscription and minute availability.
-   Concurrent login enforcement limits simultaneous device logins (1 for most tiers, 3 for Elite), terminating the oldest session if limits are exceeded.

### Session Priority System
The platform uses a **session-first** data priority model where session configuration dictates grade level, subject, and language, with user profiles serving as defaults, enabling family sharing.

### Voice Technology Integration
A custom, production-ready voice stack provides real-time, natural conversations:
-   **Architecture**: Deepgram (STT) → Claude Sonnet 4 (AI) → ElevenLabs (TTS).
-   **Endpoint**: `/api/custom-voice-ws` (WebSocket).
-   **Latency**: 1-2 seconds end-to-end.
-   **Features**: Session authentication, transcript queueing, incremental persistence, age-appropriate voice selection, and full document context integration.

### AI & Learning Engine
-   **Primary AI Model**: Claude Sonnet 4 with an enhanced TutorMind system prompt for Socratic teaching.
-   **Teaching Method**: Advanced Socratic approach with adaptive questioning and emotion-aware responses.
-   **Adaptive Learning**: AI adapts based on user progress.
-   **Tutor Personalities**: Five distinct age-specific personalities: Buddy Bear (K-2), Max Explorer (3-5), Dr. Nova (6-8), Professor Ace (9-12), and Dr. Morgan (College/Adult).

### RAG (Retrieval-Augmented Generation) System
-   **Document Processing**: Supports PDF, DOCX/DOC, PPTX, XLSX/XLS, CSV, images (OCR via Tesseract.js), and TXT files with intelligent text segmentation.
-   **Document Upload**: Students can upload documents during live voice sessions for immediate AI analysis.
-   **Automatic Document Retrieval**: AI tutor loads all user's ready documents at session start.
-   **Context Integration**: Documents are processed synchronously, chunked, and passed to the AI in the system prompt.
-   **Critical Fix (Oct 31, 2025)**: Ensured AI acknowledges uploaded documents through a three-layer prompt engineering solution involving XML tagging, explicit acknowledgment instructions, and prominent placement within the system prompt in `server/services/ai-service.ts` and `server/routes/custom-voice-ws.ts`.

### Database Schema & Data Management
Core entities include Users, Subjects, Lessons, User Progress, Learning Sessions, Quiz Attempts, User Documents, Document Chunks, and Document Embeddings. Lazy database initialization is employed.

### Payment & Subscription System
-   Stripe Integration handles subscriptions and payments, supporting single and all-subjects pricing tiers.
-   **Hybrid Minute Tracking**: Subscription minutes reset monthly, purchased minutes rollover indefinitely.
    -   `voice-minutes.ts` service manages `getUserMinuteBalance()`, `deductMinutes()` (subscription first, then purchased FIFO), and `addPurchasedMinutes()`.
    -   `/api/voice-balance` endpoint provides comprehensive minute balance for the UI.

### Email & Marketing Automation
-   Resend Integration for transactional emails and admin notifications, including user consent tracking.

### Admin Dashboard System
A comprehensive administrative interface with audit logging for user, subscription, document management, analytics, agent monitoring, contact management, and audit logs.

### State Management & Caching
-   TanStack Query for API state management, caching, and background updates.
-   PostgreSQL-based session storage for authentication.

### Production Deployment
Configured for Replit Autoscale Deployment, supporting WebSockets, horizontal scaling, and a Replit managed PostgreSQL database.

## External Dependencies

### AI & Voice Services
-   **Deepgram**: Speech-to-text.
-   **Claude (Anthropic)**: AI model for tutoring responses.
-   **ElevenLabs**: Text-to-speech.

### Payment Processing
-   **Stripe**: Subscriptions and payments.

### Email Services
-   **Resend**: Transactional email delivery.

### Database & Infrastructure
-   **PostgreSQL**: Primary database.
-   **Drizzle ORM**: Database interactions.

### Development & Deployment
-   **Vite**: Frontend development server.
-   **Replit**: One-click deployment.

### Frontend Libraries
-   **Radix UI**: Accessible component primitives.
-   **Tailwind CSS**: Styling.
-   **React Hook Form**: Form management with Zod validation.
-   **Lucide React**: Icon library.