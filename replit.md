# JIE Mastery AI Tutor - Web Application

## Overview
The JIE Mastery AI Tutor is a production-ready conversational AI tutoring web platform supporting Math, English, and Spanish across 25 languages. It features a multi-agent AI system with five age-specific tutors (K-2, Grades 3-5, 6-8, 9-12, College/Adult) utilizing an Adaptive Socratic Method. Key capabilities include interactive voice conversations, personalized quizzes, adaptive learning paths, and a hybrid minute tracking policy. The platform prioritizes per-session configuration for flexible family sharing, global accessibility, and a streamlined user experience, aiming to make personalized, adaptive AI tutoring accessible worldwide and improve educational outcomes.

## User Preferences
Preferred communication style: Simple, everyday language.
Timezone display: All timestamps display in America/Chicago (Central Time) using `Intl.DateTimeFormat`.

## System Architecture

### Full-Stack Architecture
The platform uses React 18+ (TypeScript, Vite, Wouter) for the frontend, Node.js 20 (Express.js, TypeScript) for the backend, and PostgreSQL (Neon) with Drizzle ORM for the database. Styling uses Tailwind CSS and Shadcn/ui, state management with TanStack Query v5, and authentication via Passport.js (session-based).

### Request Flow
Client requests (HTTPS/WSS) are processed by an Express.js server. HTTP routes handle storage and PostgreSQL interactions, while WebSocket connections manage custom voice interactions, integrating with STT, AI response generation, and TTS services.

### Custom Voice Stack
A custom voice stack provides real-time, low-latency (1-2 seconds end-to-end) conversations using PCM16 audio over WebSockets. It integrates an STT provider, Claude Sonnet 4 for AI responses, and ElevenLabs TTS with age-specific voices. Features include adaptive barge-in detection, bounded patience logic, and robust background noise handling. Production-hardening includes mic health monitoring, LLM watchdog, and turn fallback timers.

### Content Moderation & Safety
A balanced, context-aware moderation system uses keyword whitelists and multi-layered AI moderation. Critical safety incidents (self-harm, violent threats, harm to others) trigger immediate session termination, parent notifications, and internal JIE Support alerts. All moderation and safety actions are logged and non-fatal to prevent session freezes.

### Session Management & Billing
The `finalizeSession()` function is hardened to ensure completion, even if billing or database operations fail. Minute enforcement follows a priority order: trial status, subscription limits, monthly allocation, and bonus minutes. A session-first data priority model enables per-session configuration for grade level, subject, and language, supporting flexible family sharing.

### AI & Learning Engine
The primary AI model is Claude Sonnet 4 (`claude-sonnet-4-20250514`) with a 200k token context window and a temperature of 0.7. It implements a Modified Adaptive Socratic Method with Guided Discovery, Direct Instruction, and Understanding Check phases, including frustration detection. Five distinct tutor personalities cater to different age groups.

### Age-Based Visual Engagement System
The platform features five distinct age themes (K-2, Grades 3-5, 6-8, 9-12, College) that define colors, fonts, emojis, and avatar styles. Age-specific visual components include `TutorAvatar`, `AnimatedBackground`, `SessionProgress`, and `Celebration` effects. All animations respect `prefers-reduced-motion` and are built with Framer Motion. The voice session UI maintains a consistent, clean layout across all age bands during active sessions, with controls, tutor avatar, progress, mode selector, transcript, and sticky chat input.

### RAG (Retrieval-Augmented Generation) System
The RAG system supports various document formats (PDF, DOCX, Images via OCR, XLSX, TXT, XML). The processing pipeline involves upload, text extraction, chunking, embedding (OpenAI text-embedding-3-small), and storage in `pgvector`. OCR supports 25 languages.

### Continuity Memory System
A per-student memory system provides cross-session context for personalized tutoring. When a voice session ends, a background job generates a structured summary using Claude, storing topics covered, concepts mastered/struggled, and student insights. At session start, the last 5 summaries are injected into the Claude prompt. The system uses a DB-based job queue (`memory_jobs` table) with retry logic, and is triggered via `/api/cron/memory-jobs` (secured by CRON_SECRET). All memory operations are non-blocking with safe fallbacks.

### Database Schema & Migrations
Core database tables include `users`, `sessions`, `students`, `user_documents`, `content_violations`, `minute_purchases`, `session_summaries`, and `memory_jobs`. Production-safe migration guards ensure idempotent schema updates.

### Trial & Payment System
A 30-minute account-based trial system is implemented with abuse prevention. Stripe is integrated for subscription management, one-time purchases, and a hybrid minute tracking system.

### Admin Dashboard & Background Jobs
A comprehensive admin dashboard provides user, subscription, and session management, content violation review, and marketing tools. Key background jobs include daily digest emails for parents, document cleanup, and an embedding worker. An email digest system allows parents to receive session summaries per-session, daily, or weekly, triggered by external cron services.

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