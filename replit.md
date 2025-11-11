# AI Tutor - Web Application

## Overview
This project is a production-ready conversational AI tutoring web platform for Math, English, and Spanish. It offers interactive voice conversations, personalized quizzes, and adaptive learning paths. The platform features a multi-agent AI system with five age-specific tutors (K-2, Grades 3-5, 6-8, 9-12, College/Adult), each optimized for their target age group. It uses the **Adaptive Socratic Method** which balances guided discovery with direct instruction to prevent frustration while maximizing learning. It supports a hybrid minute tracking policy (subscription and rollover minutes) and prioritizes per-session configuration for flexible family sharing, designed for high reliability and a streamlined user experience.

## Recent Changes (November 11, 2025)
-   **CRITICAL FEATURE: Adaptive Socratic Method Implementation** - Implemented 3-phase teaching approach (Guided Discovery → Direct Instruction → Understanding Check) to balance critical thinking development with frustration prevention. Created standalone `server/llm/adaptiveSocraticCore.ts` module to avoid circular dependencies. Updated all 5 tutor personalities (K-2, 3-5, 6-8, 9-12, College) and voice prompt (`tutorMind.ts`) to integrate adaptive method. Key innovation: AI pivots to direct instruction after 3 failed attempts or frustration signals ("I don't know", "I'm confused"), providing step-by-step explanations instead of endless questioning.
-   **Marketing Copy Updates** - Updated Benefits page to highlight Adaptive Socratic Method as key differentiator from traditional AI tutors. Changed messaging from "We Don't Give Answers" to "Smart Teaching That Adapts to Your Child." Added 3-phase visual explanation and comparison showing how we prevent frustration unlike competitors who ask endless questions.
-   **Privacy Policy Page Created** - Added COPPA-compliant privacy policy at `/privacy` with footer link, emphasizing children's protection and parental control.

## Recent Changes (November 8-9, 2025)
-   **CRITICAL FIX: Admin Users Tab Not Loading** - Fixed `admin-page-enhanced.tsx` Users tab query that was calling `/api/admin/users/1/` (404 error) instead of `/api/admin/users`. Root cause: default queryFn in `queryClient.ts` uses `queryKey.join("/")` which incorrectly appended page/search values to URL path. Solution: Added custom queryFn with URLSearchParams to properly format query parameters (`page=1&limit=10&search=`). Users table now loads all 14+ users correctly.
-   **CRITICAL FIX: Elite Plan Not Displaying Correctly** - Fixed `getUserDashboard()` method in `server/storage.ts` to support Elite plan (1800 min/$149.99). Added missing 'elite' case to switch statement and updated to use hybrid minute tracking system (subscriptionMinutesUsed/subscriptionMinutesLimit). Also fixed Settings page (`settings-page.tsx`) to display Elite plan details correctly. Elite users were incorrectly showing as "Starter Plan" with "0 / 60 min".
-   **CRITICAL FIX: Admin Users Dashboard Showing Empty** - Fixed `getAdminUsers()` method in `server/storage.ts` to return all expected user fields (gradeLevel, monthlyVoiceMinutes, monthlyVoiceMinutesUsed, bonusMinutes, isAdmin, voiceMinutesRemaining, subscriptionEndDate). Previous implementation only returned basic fields, causing frontend to show "No users found" despite users existing in database.
-   **Product Simplification: Document-Based Tutoring** - Removed Lessons and Progress features from navigation and routes. Platform now focuses on "upload your materials and get instant AI tutoring" without lesson library or progress tracking. Archived lesson page components for potential future use.

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
-   **Primary AI Model**: Claude Sonnet 4 with an enhanced TutorMind system prompt.
-   **Teaching Method**: **Adaptive Socratic Method** - A 3-phase approach that balances guided discovery with direct instruction:
    1. **Phase 1 (Guided Discovery)**: AI guides students with thoughtful questions and hints to help them discover answers (first 2-3 attempts)
    2. **Phase 2 (Direct Instruction)**: After 3 failed attempts or frustration signals ("I don't know", "I'm confused", same wrong answer twice), AI pivots immediately to clear, step-by-step teaching with complete explanations
    3. **Phase 3 (Understanding Check)**: After explaining, AI confirms comprehension by having students explain back or try similar problems
-   **Frustration Prevention**: AI recognizes 8+ frustration signals (long pauses, "I give up", "this is too hard", etc.) and switches from questioning to teaching mode immediately to prevent discouragement.
-   **Tutor Personalities**: Five distinct age-specific personalities sharing the same Adaptive Socratic core while maintaining unique tone and content moderation: Buddy Bear (K-2), Max Explorer (3-5), Dr. Nova (6-8), Professor Ace (9-12), and Dr. Morgan (College/Adult).
-   **Implementation Architecture**: Standalone `server/llm/adaptiveSocraticCore.ts` module imported by all personality prompts (`server/config/tutor-personalities.ts`), voice prompts (`server/prompts/tutorMind.ts`), and base system prompt (`server/llm/systemPrompt.ts`), forming a clean DAG structure without circular dependencies.

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

## Technical Debt & Future Improvements

### Adaptive Socratic Method - Potential Enhancements
While the current implementation (standalone `adaptiveSocraticCore.ts` module) is production-ready and functional, the following architectural improvements could be considered for future iterations:

1. **Prompt Composer Pattern** (Recommended by Architect, November 2025)
   - Create a structured prompt-builder function with typed inputs for better maintainability
   - Benefits: Easier testing, clearer separation of concerns, type-safe prompt construction
   - Current approach (string concatenation) works but lacks compile-time safety

2. **Attempt & Frustration Tracking in ConversationManager**
   - Implement server-side tracking of failed attempts and frustration signals
   - Benefits: More accurate phase transitions, better analytics, ability to adjust thresholds per student
   - Current approach (AI self-tracks via prompt) is functional but less observable

3. **Feature Flags for Gradual Rollout**
   - Add feature flags to enable/disable Adaptive Socratic Method per user or grade level
   - Benefits: A/B testing, safe rollback, gradual deployment to production
   - Current approach (always-on for all users) is acceptable for MVP launch

4. **Conversation Behavior Tests**
   - Automated tests to verify phase transitions (guided discovery → direct instruction → understanding check)
   - Tests to validate frustration signal detection and appropriate responses
   - Location: `tests/conversation-behavior.spec.ts`, `tests/voice-quality.spec.ts`

**Decision**: Opted for incremental implementation (standalone module + string injection) to ship faster while maintaining clean architecture. More sophisticated patterns can be layered on without breaking changes.