# JIE Mastery AI Tutor - Web Application

## Overview

The JIE Mastery AI Tutor is a production-ready conversational AI tutoring web platform for Math, English, and Spanish. It supports 25 languages and is designed for global accessibility, offering interactive voice conversations, personalized quizzes, and adaptive learning paths. The platform features a multi-agent AI system with five age-specific tutors (K-2, Grades 3-5, 6-8, 9-12, College/Adult) that utilize an Adaptive Socratic Method. It includes a hybrid minute tracking policy (subscription and rollover minutes) and prioritizes per-session configuration for flexible family sharing, ensuring high reliability and a streamlined user experience. The project's ambition is to make personalized, adaptive AI tutoring accessible worldwide, significantly improving educational outcomes across various subjects and age groups.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Full-Stack Architecture

The platform uses a modern full-stack architecture with React 18+ (TypeScript, Vite, Wouter) for the frontend, Node.js 20 (Express.js, TypeScript) for the backend, and PostgreSQL (Neon) with Drizzle ORM for the database. Styling is handled with Tailwind CSS and Shadcn/ui, state management with TanStack Query v5, and authentication via Passport.js (session-based).

### Request Flow

The system processes requests from the client (browser) via HTTPS/WSS to an Express.js server. HTTP routes interact with the storage layer and PostgreSQL, while WebSocket connections for custom voice interactions integrate with Deepgram/AssemblyAI for STT, Claude Sonnet 4 for AI responses, and ElevenLabs for TTS.

### Custom Voice Stack

A custom-built voice stack provides real-time, low-latency (1-2 seconds end-to-end) conversations. It processes PCM16 audio (16-bit Linear PCM, 16kHz, Mono) encoded in Base64 over WebSockets. The architecture involves STT provider (Deepgram Nova-2 or AssemblyAI), Claude Sonnet 4 for AI response generation, and ElevenLabs TTS (Turbo v2.5). Age-specific TTS voices are used for each age group (K-2, 3-5, 6-8, 9-12, College/Adult).

### Authentication & Authorization

Session-based authentication uses Passport.js with PostgreSQL session storage. Account security features include password reset, security questions for recovery, and in-app password/email changes. WebSocket security incorporates session validation, IP-based rate limiting, and HTTP fallback. Access control involves authentication, active subscription verification, and minute balance enforcement.

### Session Priority System

A session-first data priority model allows per-session configuration for grade level, subject, and language, facilitating flexible family sharing.

### Student Profile Management

Features include auto-selection of the last used profile, integrated profile management with avatar systems (default, preset, custom uploads), and unique preferences per profile (e.g., pace, encouragement, goals).

### AI & Learning Engine

The primary AI model is Claude Sonnet 4 (`claude-sonnet-4-20250514`) with a 200k token context window and a temperature of 0.7. It employs a Modified Adaptive Socratic Method with three phases: Guided Discovery, Direct Instruction (after 2-3 attempts or frustration detection), and Understanding Check. The system includes frustration detection based on specific user phrases. Five distinct tutor personalities are defined for different age groups, each with tailored traits.

### Content Moderation System

A balanced, context-aware moderation system uses a keyword whitelist for educational terms and multi-layered AI moderation that acts only on high-confidence violations.

### RAG (Retrieval-Augmented Generation) System

The RAG system supports various document formats (PDF, DOCX, Images via OCR, XLSX, TXT, XML). The processing pipeline involves upload, text extraction, chunking (500 chars, 50 overlap), embedding (OpenAI text-embedding-3-small), and storage in `pgvector`. OCR supports 25 languages.

### Database Schema

The core database tables include `users`, `sessions`, `realtime_sessions`, `students`, `user_documents`, `document_chunks`, `document_embeddings`, `content_violations`, `user_suspensions`, `admin_logs`, and `minute_purchases`. The schema is defined in `shared/schema.ts`.

### Payment & Subscription System

Stripe is integrated for subscription management and one-time purchases. A hybrid minute tracking system differentiates between monthly subscription minutes (resets, lost if unused) and purchased rollover minutes (deducted after subscription minutes are exhausted). Promo code support is included.

### Admin Dashboard System

A comprehensive administrative interface provides user management, subscription controls, session analytics, document management, content violation review, marketing campaign management, and audit logging.

### Background Jobs

Key background jobs include daily digest emails for parents (8:00 PM EST), document cleanup (every 24 hours), and a continuous embedding worker.

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