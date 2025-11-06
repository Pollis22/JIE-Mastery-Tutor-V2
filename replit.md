# AI Tutor - Web Application

## Overview
This project is a production-ready conversational AI tutoring web platform for Math, English, and Spanish. It offers interactive voice conversations, personalized quizzes, and adaptive learning paths. The platform features a multi-agent AI system with five age-specific tutors (K-2, Grades 3-5, 6-8, 9-12, College/Adult), each optimized for their target age group. It supports a hybrid minute tracking policy (subscription and rollover minutes) and prioritizes per-session configuration for flexible family sharing, designed for high reliability and a streamlined user experience.

## Recent Changes (November 6, 2025)
-   **CRITICAL FIX: Dashboard Statistics Table Mismatch** - Fixed `/api/dashboard/stats` endpoint querying wrong database table (`learning_sessions` instead of `realtime_sessions`), causing dashboard to show 0 sessions while actual sessions existed. Corrected column names and added comprehensive logging.
-   **Cross-Device Session Tracking** - Implemented 30-second active polling with cache invalidation for consistent minute balance across devices.

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
-   COPPA-compliant email verification system.

### Access Control & Subscription Enforcement
A three-tier access control system ensures only subscribed users with available minutes can access tutoring. This includes:
-   `requireSubscription` middleware for authentication, active subscription, and minute balance.
-   Protected voice endpoints ensuring minute and concurrent session limits.
-   Session-based minute deduction (subscription-first, then purchased FIFO).
-   Concurrent login enforcement.

### Session Priority System
The platform uses a **session-first** data priority model where session configuration dictates grade level, subject, and language, with user profiles serving as defaults, enabling family sharing.

### Voice Technology Integration
A custom, production-ready voice stack provides real-time, natural conversations with 1-2 seconds end-to-end latency. Key features include:
-   Session authentication, transcript queueing, and incremental persistence.
-   Age-appropriate voice selection and enhanced personalized greetings.
-   **Text chat during voice sessions** allowing typed input, content pasting, and file uploads.
-   Voice consistency fixes and optimized voice pacing with robust interruption handling.
-   Comprehensive timing adjustments to prevent student answer cutoffs.
-   User-controlled speech speed via a dashboard slider (0.7-1.2 range).
-   Comprehensive microphone error handling and recovery, emphasizing text chat on microphone failure.
-   Flexible communication modes: Voice Mode, Hybrid Mode (listen-only, respond via text), and Text-Only Mode.

### AI & Learning Engine
-   **Primary AI Model**: Claude Sonnet 4 with an enhanced TutorMind system prompt for Socratic teaching.
-   **Teaching Method**: Advanced Socratic approach with adaptive questioning and emotion-aware responses.
-   **Adaptive Learning**: AI adapts based on user progress.
-   **Tutor Personalities**: Five distinct age-specific personalities: Buddy Bear (K-2), Max Explorer (3-5), Dr. Nova (6-8), Professor Ace (9-12), and Dr. Morgan (College/Adult).

### Content Moderation System
A balanced, context-aware content moderation system for educational environments:
-   Uses an educational keyword whitelist and a multi-layered approach (pattern matching → keyword check → AI moderation).
-   Acts only on high-confidence violations (>0.85) to prevent false positives.
-   Context-aware moderation (session type, subject, grade, document context).
-   Provides supportive redirection messages instead of harsh rejections.

### RAG (Retrieval-Augmented Generation) System
-   **Document Processing**: Supports PDF, DOCX/DOC, PPTX, XLSX/XLS, CSV, images (OCR via Tesseract.js), and TXT files with intelligent text segmentation.
-   Students can upload and select specific documents for each tutoring session.
-   Automatic document retrieval, chunking, and integration into the AI system prompt.
-   AI acknowledges uploaded documents through prompt engineering.

### Database Schema & Data Management
Core entities include Users, Subjects, Lessons, User Progress, Learning Sessions, Quiz Attempts, User Documents, Document Chunks, and Document Embeddings. Lazy database initialization is employed.

### Production Database Migration System
-   Uses `npm run db:push --force` and `server/scripts/migrate-production-schema.ts` for schema synchronization.
-   Includes error detection for missing columns (PostgreSQL error code 42703) and provides migration instructions.
-   All migrations use `ADD COLUMN IF NOT EXISTS` for safe, data-loss-preventing operations.

### Payment & Subscription System
-   Stripe Integration for subscriptions and payments.
-   **Hybrid Minute Tracking**: Subscription minutes reset monthly, purchased minutes rollover indefinitely, managed by `voice-minutes.ts` service.

### Email & Marketing Automation
-   Resend Integration for transactional emails and admin notifications.

### Admin Dashboard System
A comprehensive administrative interface with audit logging for user, subscription, document management, analytics, agent monitoring, contact management, and audit logs.

### Intellectual Property & Copyright Protection
Comprehensive copyright protection is implemented across the platform, including footer components, source code headers, package metadata, and documentation, with a PROPRIETARY license.

### State Management & Caching
-   TanStack Query for API state management, caching, and background updates.
-   **Cross-Device Session Tracking**: Active 30-second polling with `refetchInterval` plus immediate cache invalidation on session end ensures minute balance consistency across all devices within 30 seconds.
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