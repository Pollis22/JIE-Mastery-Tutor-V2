# AI Tutor - Web Application

## Overview
This project is a production-ready conversational AI tutoring web platform designed to help students learn Math, English, and Spanish. It features interactive voice conversations, personalized quizzes, and adaptive learning paths. The platform includes a fully functional multi-agent AI system with five age-specific AI tutors (K-2, Grades 3-5, 6-8, 9-12, College/Adult), each optimized for their target age group's complexity, vocabulary, and teaching approaches. The system is designed for high reliability and a streamlined user experience, focusing on immediate voice tutoring without dynamic agent creation for each session. The platform supports a hybrid minute tracking policy, allowing for both subscription-based and purchased rollover minutes, and prioritizes per-session configuration for flexible family sharing.

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

### Session Priority System
The platform uses a **session-first** data priority model where session configuration is the primary source for grade level, subject, and language, with user profiles serving as defaults. This enables sibling sharing on a single account.

### Voice Technology Integration
-   **OpenAI Realtime API (Primary)**: Utilizes WebRTC for native browser-to-OpenAI audio streaming, supporting multi-language and age-specific voice selections. It includes RAG integration for contextual learning and live transcript UI.
-   **ElevenLabs ConvAI (Legacy/Backup)**: Pre-configured, age-specific AI tutors for reliable production deployment.

### AI & Learning Engine
-   **Primary AI Model**: OpenAI GPT-4o with fallback to GPT-4o-mini, utilizing an enhanced TutorMind system prompt for Socratic teaching.
-   **Teaching Method**: Advanced Socratic approach with adaptive questioning.
-   **Adaptive Learning**: AI adapts based on user progress and learning patterns.
-   **Tutor Personalities**: Five distinct age-specific personalities:
     - **Buddy Bear (K-2)**: Super friendly, playful, uses simple language with lots of encouragement
     - **Max Explorer (3-5)**: Adventurous, curious, creates learning adventures with real-world connections
     - **Dr. Nova (6-8)**: Knowledgeable, cool, balances fun with academic rigor
     - **Professor Ace (9-12)**: Expert, professional, college-prep focused with critical thinking emphasis
     - **Dr. Morgan (College/Adult)**: Collaborative peer, efficient, focuses on practical application

### RAG (Retrieval-Augmented Generation) System
-   **Document Processing**: Supports PDF, DOCX, and TXT files with intelligent text segmentation.
-   **Vector Embeddings**: OpenAI text-embedding-3-small for semantic similarity.
-   **Context Integration**: Limited document content is included in the first user message for agent awareness.
-   **Background Worker**: An EmbeddingWorker asynchronously processes documents.

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
-   **ElevenLabs ConvAI**: Primary voice conversation system for AI tutors.
-   **OpenAI API**: Provides GPT-4o and GPT-4o-mini for tutoring responses and text embeddings.
-   **Azure Speech Services**: Used for Neural Text-to-Speech (fallback option).

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