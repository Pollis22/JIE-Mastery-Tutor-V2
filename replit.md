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

**Student Profile Fields**: Users table includes comprehensive student profile data:
-   `parentName`: Parent/guardian name for account management
-   `studentName`: Student's full name
-   `studentAge`: Student's age for age-appropriate content
-   `gradeLevel`: Academic level (K-2, 3-5, 6-8, 9-12, College/Adult)
-   `primarySubject`: Main subject of interest (Math, English, Science, Spanish, General)

**Marketing Preferences**: User consent tracking for email communications:
-   `marketingOptIn`: Boolean flag for marketing consent
-   `marketingOptInDate`: Timestamp when user opted in
-   `marketingOptOutDate`: Timestamp when user opted out

### Payment & Subscription System
-   Stripe Integration handles subscriptions and payments.
-   Offers single and all-subjects pricing tiers.
-   Manages weekly voice minute caps with fallback to text mode.

### Email & Marketing Automation
-   **Resend Integration**: Transactional email service for automated communications
-   **Welcome Emails**: Sent immediately after successful registration
-   **Subscription Confirmations**: Sent after successful subscription purchase or minute top-up
-   **Admin Notifications**: Real-time alerts for new registrations and purchases
-   **Marketing Preferences**: User-controlled opt-in/opt-out system with date tracking
-   **Unsubscribe Flow**: Public endpoint for one-click email preference management
-   **CSV Export**: Admin endpoint to export contact list with student profiles and marketing preferences

### Admin Dashboard System
A comprehensive administrative interface for platform management with complete audit logging:

**Dashboard Features**:
-   **Overview Panel**: Real-time metrics (total users, active subscriptions, documents, sessions)
-   **User Management**: Search, view details, add/remove bonus minutes for users
-   **Subscription Tracking**: Monitor active subscriptions, MRR, and renewal status
-   **Document Management**: View all uploaded documents across users with storage analytics
-   **Platform Analytics**: User distribution, usage statistics, and revenue breakdown
-   **Audit Logs**: Complete activity tracking of all admin actions with timestamps

**Security & Access Control**:
-   Admin-only routes protected by `requireAdmin` middleware
-   Automatic authentication and role verification for all admin endpoints
-   Secure admin audit logging that records only successful actions (2xx responses)

**Audit System**:
-   Tracks actions: user management, data exports, subscription views, document access, analytics views
-   Records admin ID, action type, target, and details for full accountability
-   Query filtering by admin, action type, with pagination support
-   Self-logging: viewing audit logs is itself logged for complete audit trail

**Admin Routes**:
-   `/admin` - Dashboard overview with key metrics
-   `/admin/users` - User management and minute allocation
-   `/admin/subscriptions` - Subscription analytics and monitoring
-   `/admin/documents` - Document storage and management
-   `/admin/analytics` - Platform performance metrics
-   `/admin/contacts` - Marketing contact management and CSV exports
-   `/admin/logs` - Complete audit trail of admin actions

**Contact Management & Marketing Tools**:
-   **Segment-Based Exports**: Export contact lists for targeted campaigns (All Users, Free Users, Cancelled, Inactive 30+, Active Premium)
-   **Campaign Tracking**: Database records of all exports with admin, segment, contact count, and timestamp
-   **CSV Format**: RFC 4180 compliant CSV with comprehensive user data including student profiles, subscription status, and usage metrics
-   **Preview Feature**: View first 10 contacts from any segment before exporting
-   **Export History**: Complete audit trail of all contact exports with campaign names and metrics

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