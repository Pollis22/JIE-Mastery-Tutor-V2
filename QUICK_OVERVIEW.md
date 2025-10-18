# JIE Mastery Tutor - Quick Overview

## What is JIE Mastery Tutor?

An AI-powered tutoring platform that provides **personalized voice conversations** with students across all subjects and age groups. Think of it as a personal tutor available 24/7 that adapts to each student's learning style and can understand their homework documents.

---

## 🎯 Core Capabilities

### 1. Voice-Based AI Tutoring
- Real-time voice conversations with AI tutors
- 5 age-specific tutors (K-2, Grades 3-5, 6-8, 9-12, College/Adult)
- Socratic teaching method (asks questions, guides thinking)
- Supports English, Spanish, and more languages
- Live transcripts with search and export

### 2. Document Understanding (RAG)
- Upload homework, worksheets, textbooks (PDF, DOCX)
- AI reads and understands the content
- Tutoring based on the actual material
- OCR for scanned documents
- Documents persist across sessions

### 3. Smart Minute Management
- **Subscription Minutes:** Reset monthly (like cell phone minutes)
- **Purchased Minutes:** Never expire, rollover forever
- System uses subscription minutes first, then purchased
- Real-time balance tracking

### 4. Multi-Subject Learning
- Math, English, Spanish, Science
- Lesson tracking and progress monitoring
- Adaptive learning paths based on performance
- Quiz generation and grading

---

## 💻 Tech Stack (Simple Version)

**Frontend:**
- React + TypeScript
- Tailwind CSS for styling
- Real-time voice streaming (WebRTC)

**Backend:**
- Node.js + Express
- PostgreSQL database
- OpenAI GPT-4o for tutoring
- Stripe for payments

**AI Services:**
- OpenAI Realtime API (voice conversations)
- OpenAI Embeddings (document understanding)
- pgvector (semantic search in documents)

---

## 💰 Business Model

### Subscription Plans
- **Starter:** $19.99/month → 60 minutes
- **Standard:** $59.99/month → 240 minutes
- **Pro:** $99.99/month → 600 minutes

### One-Time Purchases
- **Top-up:** $19.99 → 60 minutes (never expires!)

**Key Insight:** Purchased minutes rollover indefinitely, encouraging users to buy extra minutes without fear of losing them.

---

## 🔑 Key Features Explained

### Session-First Design
Instead of creating separate accounts for each child, one family account can:
- Switch between different grade levels per session
- Use different subjects each time
- Support multiple children on the same subscription

### Document-Based Learning (RAG System)
1. Student uploads their homework PDF
2. AI processes and understands the content
3. During voice session, AI references the actual homework
4. Tutoring is personalized to their specific assignment

Example: "I see you're working on quadratic equations from Chapter 5. Let's talk about the first problem on page 47..."

### Hybrid Minute Tracking
```
Scenario: User has Starter plan (60 subscription minutes) + bought 60 top-up minutes

Month 1:
- Uses 80 minutes
- 60 from subscription (exhausted)
- 20 from purchased (40 purchased minutes left)

Month 2:
- Subscription resets to 60
- Still has 40 purchased minutes
- Total available: 100 minutes
```

---

## 🏗️ System Architecture

### How a Voice Session Works
```
1. Student logs in, selects grade/subject
2. Optional: Upload homework document
3. Start voice session
4. System checks minute balance
5. If document uploaded:
   - AI reads relevant sections
   - Uses content in conversation
6. Real-time voice conversation begins
7. Transcript saved live
8. Session ends → minutes deducted
9. Transcript available for review
```

### Document Processing Pipeline
```
Upload PDF → Extract Text → Break into Chunks
    ↓
Generate AI Embeddings → Store in Vector Database
    ↓
When student asks question:
    ↓
Find relevant chunks → Include in AI context → Better answers
```

---

## 📊 Database Overview

### Main Tables
- **Users:** Student profiles, subscriptions, minute balances
- **Minute Purchases:** Track purchased minutes with rollover
- **Learning Sessions:** All tutoring sessions with transcripts
- **User Documents:** Uploaded PDFs/documents
- **Document Embeddings:** AI understanding of documents (vectors)
- **Admin Logs:** Track all admin actions

### Smart Minute Tracking
The system tracks TWO types of minutes:
1. `subscription_minutes_used` (resets monthly)
2. `purchased_minutes_balance` (never resets)

Plus a `minute_purchases` table for FIFO consumption tracking.

---

## 🔌 API Highlights

### User APIs
- `/api/login`, `/api/register` - Authentication
- `/api/voice-balance` - Check minute balance
- `/api/sessions` - Start/end tutoring sessions
- `/api/documents/upload` - Upload homework

### Admin APIs
- `/api/admin/users` - Manage all users
- `/api/admin/grant-minutes` - Give free minutes
- `/api/admin/audit-logs` - View all admin actions
- `/api/admin/export-contacts` - Export for marketing

### Stripe Integration
- `/api/create-checkout-session` - Start subscription
- `/api/stripe-webhook` - Handle payment updates

---

## 🚀 Deployment

### Current Setup
- **Development:** Replit (with Neon PostgreSQL)
- **Production:** Railway (with managed PostgreSQL)
- **Auto-Migration:** Database tables created automatically on deploy
- **Scaling:** Horizontal autoscaling ready

### Environment Requirements
```
DATABASE_URL          # PostgreSQL connection
OPENAI_API_KEY       # For AI tutoring
STRIPE_SECRET_KEY    # For payments
RESEND_API_KEY       # For emails
```

---

## 🎨 User Experience Flow

### For Students
1. **Sign up** → Choose grade level, subjects
2. **Subscribe** → Pick a plan (or start with free trial)
3. **Upload homework** (optional) → AI reads it
4. **Start voice session** → Talk with AI tutor
5. **Learn interactively** → AI guides, doesn't give answers
6. **Review transcript** → See what was discussed
7. **Track progress** → View completed lessons

### For Parents (Admin)
1. **Dashboard** → See all student activity
2. **Usage stats** → Minutes used, sessions completed
3. **Subscription management** → Upgrade/downgrade via Stripe
4. **Document review** → See uploaded homework
5. **Grant minutes** → Give bonus minutes to students

---

## 🔐 Security & Privacy

- **Password Security:** Military-grade hashing (scrypt)
- **Session Management:** Secure PostgreSQL sessions
- **Data Isolation:** Each user sees only their data
- **Admin Audit Logs:** Every admin action tracked
- **Payment Security:** Stripe handles all payment data

---

## 📈 Scalability

### Current Capacity
- **Database:** PostgreSQL with connection pooling
- **Concurrent Users:** Supports thousands simultaneously
- **Document Storage:** Unlimited (pgvector indexing)
- **AI Calls:** Rate-limited per OpenAI guidelines

### Scaling Strategy
- **Horizontal Scaling:** Railway autoscale deployment
- **Database Optimization:** Indexed all foreign keys
- **Vector Search:** HNSW index for fast similarity search
- **Caching:** TanStack Query + semantic cache (24hr TTL)

---

## 💡 Key Innovations

### 1. Hybrid Minute System
First tutoring platform to offer both subscription and rollover minutes in one system.

### 2. Session-First Architecture
Family sharing without complex account management.

### 3. Real-Time Document Understanding
AI reads student's actual homework during conversation.

### 4. Age-Adaptive Tutoring
Voice, vocabulary, and complexity adjust to student's age.

### 5. Socratic Method AI
AI asks questions instead of giving answers (better learning).

---

## 🎯 Target Market

### Primary Users
- **K-12 Students:** Homework help, test prep
- **College Students:** Complex subjects, research help
- **Adult Learners:** Language learning, skill development
- **Homeschool Families:** Full curriculum support

### Use Cases
- Daily homework assistance
- Test preparation (SAT, ACT, AP exams)
- Language learning (Spanish, English ESL)
- Concept clarification
- Study session companion

---

## 📊 Business Metrics

### Key Performance Indicators
- **Monthly Active Users (MAU)**
- **Average Minutes per User**
- **Subscription Retention Rate**
- **Document Upload Rate**
- **Session Completion Rate**

### Revenue Tracking
- Subscription MRR (Monthly Recurring Revenue)
- One-time purchase revenue
- Average revenue per user (ARPU)
- Churn rate

---

## 🔄 Continuous Improvement

### A/B Testing Ready
- Different AI prompts
- Pricing variations
- UI/UX changes
- Feature rollouts

### Analytics Dashboard
- Real-time usage stats
- User engagement metrics
- Financial performance
- System health monitoring

---

## 🚀 What Makes It Production-Ready

✅ **Robust Authentication:** Session-based with password reset  
✅ **Payment Integration:** Full Stripe integration with webhooks  
✅ **Error Handling:** Graceful failures, retry logic  
✅ **Database Migrations:** Automatic on deployment  
✅ **Admin Tools:** Full platform management  
✅ **Audit Logging:** Complete action history  
✅ **Scalable Architecture:** Horizontal scaling ready  
✅ **Type Safety:** Full TypeScript coverage  
✅ **Testing:** E2E and acceptance tests  
✅ **Documentation:** Complete technical docs  

---

## 📞 Quick Start (For Developers)

```bash
# Clone repository
git clone [repo-url]

# Install dependencies
npm install

# Set environment variables
cp .env.example .env
# Add: DATABASE_URL, OPENAI_API_KEY, STRIPE keys

# Push database schema
npm run db:push

# Start development server
npm run dev

# Access at http://localhost:5000
```

---

## 🎓 Educational Impact

### Learning Outcomes
- **Deeper Understanding:** Socratic method promotes critical thinking
- **Personalized Pace:** AI adapts to student's learning speed
- **24/7 Availability:** Help when parents can't assist
- **Document Context:** Learning from actual coursework
- **Progress Tracking:** Visible improvement over time

### Advantages Over Traditional Tutoring
- **Cost:** Starting at $19.99/mo vs $50-100/hr for human tutors
- **Availability:** Anytime vs scheduled appointments
- **Patience:** AI never gets frustrated
- **Subjects:** All subjects vs specialized tutors
- **Consistency:** Same quality every session

---

## 📝 Summary

**JIE Mastery Tutor** is a comprehensive AI tutoring platform that combines:
- Real-time voice conversations
- Document understanding (RAG)
- Smart minute management
- Multi-age support
- Full business infrastructure (payments, admin, analytics)

**Built with:** React, Node.js, PostgreSQL, OpenAI, Stripe  
**Deployed on:** Railway/Replit with autoscaling  
**Status:** Production-ready, scaling to 1M+ users  

**The future of personalized education, available today.** 🚀

---

**Questions? Contact:** [Your contact info]  
**Demo:** [Your demo link]  
**Documentation:** See PROJECT_SUMMARY.md for technical details
