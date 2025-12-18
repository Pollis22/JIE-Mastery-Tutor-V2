# AI Tutor - Web Application

## Overview
This project is a production-ready conversational AI tutoring web platform for Math, English, and Spanish, supporting 22 languages and designed for global accessibility. It offers interactive voice conversations, personalized quizzes, and adaptive learning paths. The platform features a multi-agent AI system with five age-specific tutors (K-2, Grades 3-5, 6-8, 9-12, College/Adult) optimized for their target age groups. It utilizes an Adaptive Socratic Method to balance guided discovery with direct instruction, aiming to prevent frustration and maximize learning. The platform supports a hybrid minute tracking policy (subscription and rollover minutes) and prioritizes per-session configuration for flexible family sharing, ensuring high reliability and a streamlined user experience.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Full-Stack Architecture
The application uses a modern full-stack architecture with React 18+ (Next.js 14+ App Router, TypeScript, Vite) for the frontend, Node.js with Express API routes for the backend, PostgreSQL with Drizzle ORM for the database, and Tailwind CSS with Shadcn/ui for styling.

### Authentication & Authorization
Simple username/password authentication using Passport.js with session-based authentication and PostgreSQL session storage. It includes role-based access control with admin privileges, COPPA-compliant email verification, and production-grade WebSocket security featuring session-based authentication, session rotation, explicit session destruction on logout, and IP-based rate limiting.

### Account Security Features
Comprehensive account security with:
- **Password Reset Flow**: Email-based password reset with secure tokens (1-hour expiry)
- **Security Questions**: 3 configurable security questions with hashed answers (case-insensitive) for account recovery
- **Change Password**: In-app password change with current password verification
- **Change Email**: Email change with password verification and security question validation (if set)
- **SecuritySettings Component**: Integrated security management in user settings page

### Access Control & Subscription Enforcement
A three-tier access control system ensures only subscribed users with available minutes can access tutoring, including authentication, active subscription checks, minute balance enforcement, and protected voice endpoints with concurrent session limits and session-based minute deduction.

### Session Priority System
The platform uses a session-first data priority model, where session configuration dictates grade level, subject, and language, with user profiles serving as defaults, enabling flexible family sharing.

### Student Profile Management
Features auto-selection of the last used profile, an integrated profile dropdown for selection and management, and a versatile avatar system supporting default, preset (20 emoji avatars), and custom uploaded images. Each profile tracks `lastSessionAt` and supports unique preferences for family sharing.

### Voice Technology Integration
A custom, production-ready voice stack provides real-time, natural conversations with 1-2 seconds end-to-end latency, supporting 25 languages with auto-detection and a language selection UI. It incorporates age-appropriate Azure Neural TTS voices for each age group, a custom audio processing pipeline with amplification and silence detection, and PCM16, 16kHz mono audio over WebSockets. Features include text chat during voice sessions, user-controlled speech speed, robust microphone error handling, flexible communication modes (Voice, Hybrid, Text-Only), a 5-minute inactivity auto-timeout, production-grade microphone recovery with multi-stage fallback, and user-configurable audio device settings (microphone and speaker selection, virtual audio toggle) that persist preferences.

**Tutor Thinking Indicator**: Real-time visual feedback system that displays "JIE is thinking..." with animated bouncing dots when the AI is processing. Uses WebSocket events (`tutor_thinking`, `tutor_responding`, `tutor_error`) with turnId tracking to ensure accurate state management. The indicator appears in both the status banner and as a temporary transcript entry, with a 10-second safety timeout to prevent stuck states.

**Parent Session Summary Emails**: Automatic email notifications sent to parents after each tutoring session ends. Uses Claude to generate a 2-3 sentence AI summary of what the child learned, includes session statistics (duration, exchanges, subject), and shows the last 6 transcript messages as highlights. Emails are sent only for sessions lasting 30+ seconds with 3+ messages. Uses the Resend email service with beautifully formatted HTML templates.

### AI & Learning Engine
The primary AI model is Claude Sonnet 4 with an enhanced TutorMind system prompt, employing a Modified Adaptive Socratic Method. This 3-phase approach balances guided discovery, direct instruction after 2-3 attempts or frustration detection, and understanding checks. It prioritizes guiding students to think first but provides answers to prevent frustration. The system incorporates frustration prevention by recognizing 8+ signals and switching to direct teaching. Five distinct age-specific tutor personalities maintain unique tones while adhering to the Adaptive Socratic core.

### Content Moderation System
A balanced, context-aware content moderation system for educational environments, utilizing a keyword whitelist and multi-layered AI moderation, acting only on high-confidence violations.

### RAG (Retrieval-Augmented Generation) System
Supports multilingual document uploads (PDF, DOCX, images, etc.) for each tutoring session, with automatic retrieval, chunking, and integration into the AI system prompt. Image OCR uses Tesseract.js with language-specific models for accurate text extraction across 25 supported languages.

### Database Schema & Data Management
Core entities include Users, Learning Sessions, Quiz Attempts, User Documents, and Document Embeddings. It employs lazy database initialization and a production database migration system using `ADD COLUMN IF NOT EXISTS` for safe schema changes.

### Payment & Subscription System
Stripe Integration handles subscriptions and payments, featuring a Hybrid Minute Tracking system where subscription minutes reset monthly, and purchased minutes rollover indefinitely. It includes secure subscription change handling (proration for upgrades, scheduled for downgrades) and promo code support integrated into the checkout and upgrade processes.

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