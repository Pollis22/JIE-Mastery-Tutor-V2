# JIE Mastery AI Tutor - Web Application

## Overview
The JIE Mastery AI Tutor is a production-ready conversational AI tutoring web platform designed to provide personalized education across Math, English, and Spanish in 25 languages. It features a multi-agent AI system with five age-specific tutors (K-2, Grades 3-5, 6-8, 9-12, College/Adult), utilizing an Adaptive Socratic Method. The platform offers interactive voice conversations, personalized quizzes, and adaptive learning paths, aiming to make high-quality AI tutoring globally accessible and improve educational outcomes. It supports flexible family sharing through per-session configuration and includes a hybrid minute tracking policy.

## User Preferences
Preferred communication style: Simple, everyday language.
Timezone display: All timestamps display in America/Chicago (Central Time) using `Intl.DateTimeFormat`.

## System Architecture

### Full-Stack Architecture
The platform is built with React 18+ (TypeScript, Vite, Wouter) for the frontend, Node.js 20 (Express.js, TypeScript) for the backend, and PostgreSQL (Neon) with Drizzle ORM for the database. Styling is managed with Tailwind CSS and Shadcn/ui. State management uses TanStack Query v5, and authentication is handled by Passport.js (session-based).

### Request Flow
Client requests (HTTPS/WSS) are processed by an Express.js server. HTTP routes manage data storage and PostgreSQL interactions, while WebSocket connections handle custom voice interactions, integrating with Speech-to-Text (STT), AI response generation, and Text-to-Speech (TTS) services.

### Custom Voice Stack
A custom voice stack delivers real-time, low-latency (1-2 seconds end-to-end) voice conversations using PCM16 audio over WebSockets. It integrates an STT provider, Claude Sonnet 4 for AI responses, and ElevenLabs TTS with age-specific voices. Features include adaptive barge-in detection, bounded patience logic, robust background noise handling, and production-hardening mechanisms like mic health monitoring and an LLM watchdog. Client-side VAD profiles are adjusted per age group (e.g., `OLDER_STUDENTS` profile for Grade 6+ for smoother interactions). TTS text is sanitized for Grade 6+ to improve clarity, including number pronunciation and markdown stripping.

### Content Moderation & Safety
A balanced, context-aware moderation system employs keyword whitelists and multi-layered AI moderation. Critical safety incidents trigger immediate session termination, parent notifications, and internal alerts, with all actions logged and non-fatal to prevent session freezes.

### Session Management & Billing
The `finalizeSession()` function ensures robust completion, even if billing or database operations encounter issues. Minute enforcement prioritizes trial status, subscription limits, monthly allocation, and bonus minutes. A session-first data priority model allows per-session configuration for grade level, subject, and language, facilitating flexible family sharing.

### AI & Learning Engine
The primary AI model is Claude Sonnet 4 (`claude-sonnet-4-20250514`) with a 200k token context window and a temperature of 0.7. It implements a Modified Adaptive Socratic Method with Guided Discovery, Direct Instruction, understanding checks, and frustration detection. Five distinct tutor personalities cater to specific age groups.

### Age-Based Visual Engagement System
The platform features five distinct age themes (K-2, Grades 3-5, 6-8, 9-12, College) that define colors, fonts, emojis, and avatar styles. Age-specific visual components include `TutorAvatar`, `AnimatedBackground`, `SessionProgress`, and `Celebration` effects. All animations respect `prefers-reduced-motion` and are built with Framer Motion. The voice session UI maintains a consistent, clean layout with controls, tutor avatar, progress, mode selector, transcript, and sticky chat input.

### RAG (Retrieval-Augmented Generation) System
The RAG system supports various document formats (PDF, DOCX, Images via OCR, XLSX, TXT, XML). The processing pipeline involves upload, text extraction, chunking, embedding (OpenAI text-embedding-3-small), and storage in `pgvector`. OCR supports 25 languages.

### Continuity Memory System
A per-student memory system provides cross-session context for personalized tutoring. Upon session conclusion, a background job generates a structured summary using Claude, which includes topics covered, concepts mastered/struggled, and student insights. At session start, the last 5 summaries are injected into the Claude prompt. The system uses a DB-based job queue with retry logic and is triggered via `/api/cron/memory-jobs`. All memory operations are non-blocking with safe fallbacks. Returning students receive adaptive continuity greetings, and a "First-Turn-Only Guarantee" prevents duplicate greetings on WebSocket reconnect. Student isolation ensures no cross-topic leakage between siblings.

### Database Schema & Migrations
Core database tables include `users`, `sessions`, `students`, `user_documents`, `content_violations`, `minute_purchases`, `session_summaries`, and `memory_jobs`. Production-safe migration guards ensure idempotent schema updates.

### Trial & Payment System
A 30-minute account-based trial system is implemented with abuse prevention. Stripe is integrated for subscription management, one-time purchases, and a hybrid minute tracking system.

### Admin Dashboard & Background Jobs
A comprehensive admin dashboard offers user, subscription, and session management, content violation review, and marketing tools. Key background jobs include daily digest emails for parents, document cleanup, and an embedding worker. An email digest system allows parents to receive session summaries per-session, daily, or weekly, triggered by external cron services.

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