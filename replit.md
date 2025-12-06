# AI Tutor - Web Application

## Overview
This project is a production-ready conversational AI tutoring web platform for Math, English, and Spanish, supporting 22 languages. It offers interactive voice conversations, personalized quizzes, and adaptive learning paths. The platform features a multi-agent AI system with five age-specific tutors (K-2, Grades 3-5, 6-8, 9-12, College/Adult), each optimized for their target age group. It uses the **Adaptive Socratic Method** which balances guided discovery with direct instruction to prevent frustration while maximizing learning. The platform supports a hybrid minute tracking policy (subscription and rollover minutes) and prioritizes per-session configuration for flexible family sharing, designed for high reliability and a streamlined user experience. The business vision is to provide a globally accessible, effective, and frustration-free AI tutoring experience that adapts to individual learning needs.

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
-   **Production-Grade WebSocket Security** (November 2025):
    -   Session-based authentication for WebSocket upgrades (no client-sent userId trusted).
    -   Session rotation on login with 30-minute freshness enforcement.
    -   Explicit session destruction on logout with cookie clearing.
    -   IP-based rate limiting: 20 upgrade requests per minute, 5 concurrent connections per IP.
    -   Standalone session validator (no Express middleware reuse, prevents double-initialization).
    -   Malformed cookie handling with proper error responses.
    -   All security measures tested and architect-approved for production deployment.

### Access Control & Subscription Enforcement
A three-tier access control system ensures only subscribed users with available minutes can access tutoring. This includes authentication, active subscription checks, minute balance enforcement, protected voice endpoints with concurrent session limits, and session-based minute deduction.

### Session Priority System
The platform uses a **session-first** data priority model where session configuration dictates grade level, subject, and language, with user profiles serving as defaults, enabling flexible family sharing.

### Voice Technology Integration
A custom, production-ready voice stack provides real-time, natural conversations with 1-2 seconds end-to-end latency.
-   **22 Languages Supported**: Including English, Spanish, Arabic, Russian, and more, with auto-detection of browser language.
-   **Language Selection UI** (December 2025): Dropdown menu near the "Start Voice Tutoring" button allows students to select their preferred tutoring language. The selected language persists in localStorage across sessions.
    -   Deepgram STT configured per-language for accurate speech recognition
    -   Claude AI system prompt includes language instruction for non-English sessions
    -   **25 Languages supported**: English, Spanish, French, German, Italian, Portuguese, Chinese (Mandarin), Japanese, Korean, Arabic, Hindi, Russian, Dutch, Polish, Turkish, Vietnamese, Thai, Indonesian, Swedish, Danish, Norwegian, Finnish, Swahili, Yoruba, Hausa
    -   **African Languages**: Swahili, Yoruba, and Hausa use multi-language detection for speech recognition while Claude AI responds fully in the target language
-   **Age-Appropriate TTS Voices**: Each language has 5 distinct Azure Neural TTS voices optimized for different age groups (K-2, 3-5, 6-8, 9-12, College/Adult).
-   **Audio Processing Pipeline** (November 2025): Custom ScriptProcessorNode implementation with 100x gain amplification for quiet microphones, silence detection (threshold: 10), MediaStream health checks, and audio context suspension protection.
-   **Format**: PCM16 (16-bit Linear PCM), 16kHz sample rate, mono audio with base64 WebSocket transport.
-   Supports text chat during voice sessions, user-controlled speech speed, and robust microphone error handling.
-   Flexible communication modes: Voice Mode, Hybrid Mode (listen-only, respond via text), and Text-Only Mode.
-   **5-Minute Inactivity Auto-Timeout** (November 2025): Backend tracks user inactivity via speech and text. Issues warning at 4 minutes of silence with audio message. Auto-ends session at 5 minutes with farewell message and proper minute deduction. Activity timer resets on any user interaction (voice or text). Prevents wasted minutes from forgotten sessions. Timer cleanup centralized in finalizeSession for robust lifecycle management.

### AI & Learning Engine
-   **Primary AI Model**: Claude Sonnet 4 with an enhanced TutorMind system prompt.
-   **Teaching Method**: **Modified Adaptive Socratic Method** (Updated November 2025) - A balanced 3-phase approach that prevents both "too easy" and "too hard" learning experiences:
    1.  **Guided Discovery (First Question)**: ALWAYS guide with questions first, NEVER give direct answers immediately. Ask "What do you think?" and suggest problem-solving strategies.
    2.  **Direct Instruction (After 2-3 Tries)**: Give complete answer with clear explanation after 2-3 failed attempts or when frustration detected. Break down WHY each step works.
    3.  **Understanding Check**: Confirm comprehension through explanation or similar practice problems.
-   **Critical Rule**: Tutor must guide students to think first, but will provide answers after 2-3 genuine attempts to prevent frustration and gaming the system.
-   **Frustration Prevention**: AI recognizes 8+ frustration signals ("I don't know", "I give up", etc.) and immediately switches to direct teaching mode.
-   **Tutor Personalities**: Five distinct age-specific personalities share the Adaptive Socratic core while maintaining unique tone and content moderation.
-   **Implementation Architecture**: Standalone `server/llm/adaptiveSocraticCore.ts` module imported by personality prompts, voice prompts, and base system prompt, ensuring a clean DAG structure.

### Content Moderation System
A balanced, context-aware content moderation system for educational environments, utilizing a keyword whitelist and multi-layered AI moderation, acting only on high-confidence violations.

### RAG (Retrieval-Augmented Generation) System
Supports document uploads (PDF, DOCX, images, etc.) for each tutoring session, with automatic retrieval, chunking, and integration into the AI system prompt.
-   **Multilingual Document Processing** (December 2025): Documents can be uploaded in any of the 25 supported languages. Image OCR uses Tesseract.js with language-specific models for accurate text extraction:
    -   Supported OCR languages: English, Spanish, French, German, Italian, Portuguese, Chinese (Simplified), Japanese, Korean, Arabic, Hindi, Russian, Dutch, Polish, Turkish, Vietnamese, Thai, Indonesian, Swedish, Danish, Norwegian, Finnish, Swahili
    -   African languages (Yoruba, Hausa) fall back to English OCR due to limited Tesseract support, but Claude AI can still tutor in these languages
    -   PDF, DOCX, TXT, CSV, XLSX files work with any language (text extraction, not OCR)
    -   Language is stored per-document and used for processing

### Database Schema & Data Management
Core entities include Users, Learning Sessions, Quiz Attempts, User Documents, and Document Embeddings. Employs lazy database initialization and a production database migration system using `ADD COLUMN IF NOT EXISTS` for safe schema changes.

### Payment & Subscription System
Stripe Integration for subscriptions and payments, featuring a **Hybrid Minute Tracking** system where subscription minutes reset monthly, and purchased minutes rollover indefinitely.
-   **Subscription Change Security & Billing** (December 2025 - CRITICAL FIX):
    -   **Upgrades**: Immediate proration billing using `always_invoice` - user pays prorated difference NOW
    -   **Downgrades**: Scheduled for end of billing period - user keeps current plan benefits until renewal (no refunds)
    -   Database subscription updates gated by Stripe payment confirmation (upgrades) or invoice.payment_succeeded (downgrades)
    -   Previous vulnerability allowed free upgrades by clicking plan cards without checkout
    -   Metadata tracks `changeType`, `previousPlan`, and `scheduledAt` for proper handling

### Admin Dashboard System
A comprehensive administrative interface with audit logging for user, subscription, and document management, analytics, and agent monitoring.

### State Management & Caching
Utilizes TanStack Query for API state management, caching, and background updates, including cross-device session tracking with 30-second polling for minute balance consistency.

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