# AI Tutor - Web Application

## Overview
This project is a production-ready conversational AI tutoring web platform designed to help students learn Math, English, and Spanish. It features interactive voice conversations, personalized quizzes, and adaptive learning paths. The platform includes a fully functional multi-agent ElevenLabs ConvAI system with five age-specific AI tutors (K-2, Grades 3-5, 6-8, 9-12, College/Adult), each optimized for their target age group's complexity, vocabulary, and teaching approaches. The system is designed for high reliability and a streamlined user experience, focusing on immediate voice tutoring without dynamic agent creation for each session.

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

### Voice Technology Integration
The system integrates a **Multi-Agent ElevenLabs ConvAI System** with five pre-configured, age-specific AI tutors (K-2, Grades 3-5, 6-8, 9-12, College/Adult). These agents provide progressive complexity and age-appropriate greetings. The system focuses on static agents for reliable production deployment, directly connecting to these agents without dynamic, per-session agent creation. Real-time conversation transcripts are displayed, showing connection status, user messages, and agent responses.

### AI & Learning Engine
-   **Primary AI Model**: OpenAI GPT-4o with fallback to GPT-4o-mini, utilizing an enhanced TutorMind system prompt for Socratic teaching.
-   **Conversation Parameters**: Optimized for natural responses with specific temperature, top_p, and presence_penalty settings.
-   **Teaching Method**: Advanced Socratic approach with adaptive questioning.
-   **Content Management**: JSON-based lesson structure.
-   **Adaptive Learning**: AI adapts based on user progress and learning patterns.

### RAG (Retrieval-Augmented Generation) System
-   **Document Processing**: Supports PDF, DOCX, and TXT files, with text extraction using `pdfjs-dist`.
-   **Smart Chunking**: Intelligent text segmentation into 1000-token chunks with 200-token overlap.
-   **Vector Embeddings**: OpenAI text-embedding-3-small for semantic similarity.
-   **Context Integration**: Limited document content is included in the first user message for agent awareness (up to 1500 chars per doc).
-   **Background Worker**: An EmbeddingWorker asynchronously processes documents with exponential backoff retry logic for robustness.

### Database Schema & Data Management
Core entities include Users, Subjects, Lessons, User Progress, Learning Sessions, and Quiz Attempts. The RAG system incorporates User Documents, Document Chunks, and Document Embeddings.

### Payment & Subscription System
-   Stripe Integration handles subscriptions and payments.
-   Offers single and all-subjects pricing tiers.
-   Manages weekly voice minute caps with fallback to text mode.

### State Management & Caching
-   TanStack Query for API state management, caching, and background updates.
-   PostgreSQL-based session storage for authentication.

## External Dependencies

### AI & Voice Services
-   **ElevenLabs ConvAI**: Primary voice conversation system for AI tutors.
-   **OpenAI API**: Provides GPT-4o-mini for tutoring responses and text embeddings.
-   **Azure Speech Services**: Used for Neural Text-to-Speech (fallback option).

### Payment Processing
-   **Stripe**: Used for subscription management, payments, and customer portal.

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