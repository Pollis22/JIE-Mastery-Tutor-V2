# JIE Mastery AI - Complete Technical Specification & Configuration Reference

**Platform Version:** 2.0.0  
**Document Generated:** December 8, 2025  
**Last Updated:** December 8, 2025  
**Production URL:** https://jie-mastery-tutor-v2-production.up.railway.app  
**Environment:** Production (PostgreSQL Backend, Node.js/Express API)

---

## 1. EXECUTIVE SUMMARY

JIE Mastery AI is a production-grade voice-first AI tutoring platform serving K-12 through College/Adult learners across 25 languages. The platform leverages advanced speech recognition, natural language AI, and text-to-speech technologies to deliver real-time, interactive tutoring sessions with sub-2-second end-to-end latency.

### Tech Stack
- **Frontend:** React 18+ with Vite, TypeScript, TailwindCSS
- **Backend:** Node.js with Express.js
- **Database:** PostgreSQL (Neon-backed via Railway)
- **AI Model:** Claude Sonnet 4 (Anthropic)
- **Speech-to-Text:** Deepgram (nova-2)
- **Text-to-Speech:** ElevenLabs (turbo v2.5)
- **Payments:** Stripe (subscription & one-time)
- **Email:** Resend

### Key Features
- Real-time voice conversations with 5-minute inactivity timeout
- 25 languages with multi-agent tutoring system
- Document upload & RAG for personalized tutoring
- Hybrid minute tracking (subscription + rollover purchased minutes)
- Student profiles with custom avatar support
- Admin dashboard with analytics and audit logs

---

## 2. VOICE PIPELINE SPECIFICATIONS

### 2.1 Speech-to-Text (Deepgram)

| Setting | Value | Notes |
|---------|-------|-------|
| Provider | Deepgram nova-2 | Best accuracy for tutoring |
| Encoding | linear16 (PCM) | 16-bit raw audio |
| Sample Rate | 16000 Hz | Telephony quality |
| Channels | 1 (mono) | Single speaker |
| Punctuate | true | Add punctuation |
| Interim Results | true | Real-time feedback |
| Endpointing | 500ms | Silence detection |
| VAD Events | true | Voice activity detection |

### 2.2 Supported Languages & Deepgram Mapping

| User Selection | Deepgram Code | Status |
|----------------|---------------|--------|
| English | en-US | ✓ Supported |
| Spanish | es | ✓ Supported |
| French | fr | ✓ Supported |
| German | de | ✓ Supported |
| Italian | it | ✓ Supported |
| Portuguese | pt-BR | ✓ Supported |
| Chinese (Mandarin) | zh-CN | ✓ Supported |
| Japanese | ja | ✓ Supported |
| Korean | ko | ✓ Supported |
| Russian | ru | ✓ Supported |
| Hindi | hi | ✓ Supported |
| Dutch | nl | ✓ Supported |
| Polish | pl | ✓ Supported |
| Turkish | tr | ✓ Supported |
| Indonesian | id | ✓ Supported |
| Swedish | sv | ✓ Supported |
| Danish | da | ✓ Supported |
| Norwegian | no | ✓ Supported |
| Finnish | fi | ✓ Supported |
| Arabic | en-US (fallback) | ⚠ Falls back to English STT |
| Vietnamese | en-US (fallback) | ⚠ Falls back to English STT |
| Thai | en-US (fallback) | ⚠ Falls back to English STT |
| Swahili | en-US (fallback) | ⚠ Falls back to English STT |
| Yoruba | en-US (fallback) | ⚠ Falls back to English STT |

**⚠ CRITICAL:** Unsupported languages fall back to English STT but Claude responds in the selected language.

### 2.3 Text-to-Speech (ElevenLabs)

| Setting | Value | Notes |
|---------|-------|-------|
| Provider | ElevenLabs | |
| Model | eleven_turbo_v2_5 | Fastest model |
| Voice ID | Dr. Morgan | Premium voice |
| Stability | 0.35 | More expressive |
| Similarity Boost | 0.75 | Voice consistency |
| Speed | 1.0 | Normal speed |
| Output Format | mp3_44100_128 | Standard MP3 |

**Age-Specific Voices:** 5 distinct Azure Neural TTS voices optimized for K-2, 3-5, 6-8, 9-12, and College/Adult.

### 2.4 AI/LLM (Claude API)

| Setting | Value | Notes |
|---------|-------|-------|
| Provider | Anthropic | |
| Model | claude-sonnet-4-20250514 | Latest version |
| Max Tokens | 1024 | Response limit |
| Temperature | default | Controlled randomness |
| System Prompt | ~7728 chars | Adaptive Socratic Method |

### 2.5 Voice Activity Detection (VAD) Settings

⚠ **CRITICAL:** These settings prevent false interruptions. Do NOT modify without extensive testing.

| Parameter | Value | Description |
|-----------|-------|-------------|
| Speech Threshold | 0.015 RMS | Minimum to detect speech |
| Silence Threshold | 0.008 RMS | Below = silence |
| Speech Onset Debounce | 100ms | Confirm before trigger |
| Silence Debounce | 300ms | Wait before end speech |
| VAD Cooldown | 500ms | Ignore after tutor speaks |
| Min Speech Duration | 200ms | Prevent micro-triggers |

**Previous Issues (Fixed Dec 2025):**
- Old thresholds caused false barge-ins every 100-300ms
- Too sensitive = constant interruptions
- Too insensitive = missed speech

### 2.6 Audio Pipeline Settings

| Setting | Value | Notes |
|---------|-------|-------|
| Gain Amplification | 100x | **CRITICAL for quiet mics** |
| Sample Rate | 16000 Hz | |
| Buffer Size | 2048 | ScriptProcessor |
| Channels | 1 (mono) | |
| Audio API | AudioWorklet/fallback | Web Audio API |

⚠ **CRITICAL:** Do NOT reduce gain below 100x - breaks Deepgram transcription for quiet microphones.

---

## 3. DATABASE SCHEMA SPECIFICATIONS

### 3.1 Users Table (Core)

**Schema:** `users` (PostgreSQL) with 60+ columns

**Essential Columns:**
- `id` (UUID) - Primary key
- `username` (text) - Unique, auto-generated from email
- `email` (text) - Unique, required
- `password` (text) - Hashed, required
- `firstName`, `lastName`, `parentName` (text)
- `studentName`, `studentAge`, `gradeLevel`, `primarySubject` (text)
- `marketingOptIn`, `marketingOptInDate`, `marketingOptOutDate` (boolean/timestamp)
- `stripeCustomerId`, `stripeSubscriptionId` (text)
- `subscriptionPlan` (starter|standard|pro|elite|single|all)
- `subscriptionStatus` (active|canceled|paused)
- `subscriptionMinutesUsed`, `subscriptionMinutesLimit` (integer)
- `purchasedMinutesBalance` (integer - never expires until used)
- `billingCycleStart`, `lastResetAt` (timestamp)
- `maxConcurrentSessions`, `maxConcurrentLogins` (1 or 3 for Elite)
- `preferredLanguage`, `voiceLanguage`, `interfaceLanguage` (text)
- `emailVerified` (boolean) - **Required for login**
- `isAdmin` (boolean)
- `emailVerificationToken`, `emailVerificationExpiry` (text/timestamp)
- `resetToken`, `resetTokenExpiry` (text/timestamp)
- `createdAt`, `updatedAt`, `deletedAt` (timestamp)

### 3.2 User Documents Table

**Schema:** `user_documents`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| userId | UUID | FK to users |
| originalName | text | Original filename |
| fileName | text | Stored filename |
| filePath | text | Storage path |
| fileType | text | pdf, docx, txt, csv, xlsx |
| fileSize | integer | Bytes |
| subject | text | Academic subject |
| grade | text | Grade level |
| title | text | Document title |
| description | text | User description |
| language | text | Document language for OCR (25 langs) |
| processingStatus | text | queued\|processing\|ready\|failed |
| processingError | text | Error message if failed |
| retryCount | integer | Number of retries |
| nextRetryAt | timestamp | Next retry time |
| parsedTextPath | text | Path to extracted text |
| expiresAt | timestamp | **CRITICAL - auto-delete after 6 months** |
| createdAt | timestamp | Creation date |
| updatedAt | timestamp | Last update |

**⚠ CRITICAL:** The `expiresAt` column caused 500 errors when missing (Fixed Nov 2025).

### 3.3 Students Table

**Schema:** `students` (multi-student profiles per parent)

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| ownerUserId | UUID | FK to users (parent) |
| name | text | Student name |
| age | integer | Student age |
| gradeBand | text | k-2\|3-5\|6-8\|9-12\|college |
| pace | text | slow\|normal\|fast |
| encouragement | text | low\|medium\|high |
| goals | text[] | Learning goals array |
| avatarUrl | text | Profile picture URL |
| avatarType | text | default\|upload\|preset |
| lastSessionAt | timestamp | Last tutoring session |
| createdAt | timestamp | Creation date |
| updatedAt | timestamp | Last update |

### 3.4 Document Chunks Table (RAG)

**Schema:** `document_chunks`

- `id` (UUID)
- `documentId` (UUID, FK to user_documents)
- `chunkIndex` (integer)
- `content` (text)
- `embedding` (vector)
- `createdAt` (timestamp)

---

## 4. SUBSCRIPTION & BILLING SPECIFICATIONS

### 4.1 Plan Configurations

| Plan | Price | Minutes | Max Sessions | Concurrent Logins |
|------|-------|---------|--------------|-------------------|
| Starter | $19.99/mo | 60 | 1 | 1 |
| Standard | $59.99/mo | 240 | 1 | 1 |
| Pro | $99.99/mo | 600 | 1 | 1 |
| Elite | $199.99/mo | 1800 | 3 | 3 |
| Top-up | $19.99 | 60 block | N/A | N/A |

### 4.2 Minute Consumption Rules

1. Subscription minutes consumed first (reset monthly on billing cycle start)
2. Then purchased top-up minutes (FIFO order, never expire until used)
3. Monthly usage tracked in `subscriptionMinutesUsed`
4. Purchased balance tracked in `purchasedMinutesBalance`
5. Reset occurs automatically on `billingCycleStart` + 1 month

### 4.3 Stripe Integration Settings

| Setting | Value | Notes |
|---------|-------|-------|
| Proration Behavior | always_invoice | **Charge immediately on upgrade** |
| Payment Behavior | error_if_incomplete | Fail if payment fails |
| Webhook Events | customer.subscription.* | |
| Price ID Format | price_*** | Must start with "price_" |

**⚠ CRITICAL:** Always use `proration_behavior: 'always_invoice'` to prevent free upgrades (Fixed Dec 2025).

### 4.4 Active Promo Codes

| Code | Discount | Duration | Notes |
|------|----------|----------|-------|
| WELCOME50 | 50% off | First month | New customers |

---

## 5. ENVIRONMENT VARIABLES & CONFIGURATION

### 5.1 Critical Environment Variables (Production)

| Variable | Service | Required | Notes |
|----------|---------|----------|-------|
| DATABASE_URL | PostgreSQL | Yes | Railway connection string |
| ANTHROPIC_API_KEY | Claude | Yes | For AI responses |
| DEEPGRAM_API_KEY | Deepgram | Yes | For speech-to-text |
| ELEVENLABS_API_KEY | ElevenLabs | Yes | For text-to-speech |
| ELEVENLABS_VOICE_ID | ElevenLabs | Yes | Dr. Morgan voice |
| STRIPE_SECRET_KEY | Stripe | Yes | Live key (production) |
| STRIPE_WEBHOOK_SECRET | Stripe | Yes | Webhook validation |
| STRIPE_PUBLISHABLE_KEY | Stripe | Yes | Frontend |
| SESSION_SECRET | Express | Yes | Session encryption (64+ chars) |
| NODE_ENV | Node.js | Yes | **Must be "production"** |
| STRIPE_PRICE_STARTER | Stripe | Yes | price_*** format |
| STRIPE_PRICE_STANDARD | Stripe | Yes | price_*** format |
| STRIPE_PRICE_PRO | Stripe | Yes | price_*** format |
| STRIPE_PRICE_ELITE | Stripe | Yes | price_*** format |
| STRIPE_PRICE_TOPUP_60 | Stripe | Yes | Top-up Price ID |

### 5.2 Optional Configuration

- `PORT` - Server port (default 5000)
- `CORS_ORIGIN` - Frontend URL for CORS
- `VAD_SILENCE_MS` - VAD silence threshold (default 250ms)
- `VOICE_TEST_MODE` - Test voice without Azure TTS
- `USE_REALTIME` - Enable OpenAI Realtime API (experimental)
- `DEBUG_TUTOR` - Enable debug logging
- `USE_CONVAI` - Use ConvAI system (legacy)

---

## 6. WEBSOCKET SPECIFICATIONS

### 6.1 Connection Settings

| Setting | Value | Notes |
|---------|-------|-------|
| Path | /api/custom-voice-ws | Voice conversation endpoint |
| Protocol | wss:// (secure) | TLS encrypted |
| Authentication | Session-based | Cookie validation on upgrade |
| Heartbeat | 30s | Ping/pong keep-alive |
| Reconnect | Auto with backoff | Exponential backoff strategy |
| Message Format | JSON | UTF-8 encoded |

### 6.2 Message Types

| Type | Direction | Purpose | Format |
|------|-----------|---------|--------|
| audio | Client→Server | User audio chunks | base64 PCM |
| transcript | Server→Client | Deepgram transcription | text |
| tutor_response | Server→Client | Claude text response | text |
| tutor_audio | Server→Client | ElevenLabs TTS audio | base64 mp3 |
| language_change | Client→Server | Change tutoring language | {language: 'en'} |
| mode_change | Client→Server | Voice/Hybrid/Text mode | {mode: 'voice'} |
| error | Server→Client | Error notification | {error: string} |
| session_end | Server→Client | Session termination | {reason: string} |

### 6.3 Authentication & Security Flow

1. Client connects with session cookie
2. Server validates session in upgrade handler
3. No client-sent userId trusted (security measure)
4. Session rotation on login with 30-minute freshness
5. Explicit session destruction on logout
6. IP-based rate limiting: 20 upgrade requests/min, 5 concurrent/IP
7. Malformed cookie handling with proper error responses

---

## 7. PRODUCTION DEPLOYMENT

### 7.1 Deployment Configuration

- **Platform:** Railway.app (Replit Autoscale compatible)
- **Database:** Neon PostgreSQL (managed by Railway)
- **Environment:** production (NODE_ENV=production)
- **URL:** https://jie-mastery-tutor-v2-production.up.railway.app
- **Deployment Type:** Continuous (auto-deploy from main branch)

### 7.2 Startup Validation

Server startup performs comprehensive checks:
- ✓ PostgreSQL connection and schema validation
- ✓ Drizzle ORM initialization
- ✓ Stripe price ID validation (all 5 prices required)
- ✓ Environment variable verification
- ✓ Vite development server setup
- ✓ Document cleanup service initialization
- ✓ Embedding worker startup
- ✓ WebSocket server initialization

### 7.3 Health Check Endpoints

- `GET /api/health` - Overall system status
- `GET /api/health/db` - Database connectivity check

---

## 8. CRITICAL SETTINGS & KNOWN ISSUES

### 8.1 Fixed Issues (Do NOT revert)

**Audio Gain (Dec 2025):** Increased from 3x to 100x to support quiet microphones. Lower values break Deepgram transcription.

**Document Expires At (Nov 2025):** Missing column caused 500 errors. Added `expiresAt` with 6-month auto-delete.

**VAD Thresholds (Dec 2025):** Previous values caused false interruptions every 100-300ms. Current thresholds prevent barge-ins.

**WebSocket Security (Nov 2025):** Session-based auth prevents unauthorized access. No client-sent userId trusted.

**Proration Billing (Dec 2025):** Always use `proration_behavior: 'always_invoice'` for immediate charge on upgrades.

### 8.2 Account Creation Flow

1. User fills registration form with plan selection
2. Registration data is hashed and stored securely
3. Stripe checkout session created (payment-first model)
4. After successful payment, webhook creates user account
5. Auto-verify email for paid users
6. User redirected to login with auto-session
7. **⚠ CRITICAL:** Webhook timing issues trigger retry logic (up to 10 retries)

### 8.3 Student Profiles

- Mandatory for all tutoring sessions
- Support 3 avatar types: default (icon), preset (emoji), custom upload
- Store learning pace and encouragement preferences
- Track `lastSessionAt` for resume functionality
- Each parent can manage multiple student profiles

### 8.4 5-Minute Inactivity Timeout

- Backend tracks user inactivity via speech and text
- Warning issued at 4 minutes of silence with audio message
- Auto-ends session at 5 minutes with farewell message
- Proper minute deduction on timeout
- Timer resets on any user interaction

---

## 9. MONITORING & TROUBLESHOOTING

### 9.1 Common Issues & Solutions

**Issue:** 401 Unauthorized on /api/user  
**→ Solution:** Session cookie missing or expired. Verify SESSION_SECRET and cookie configuration.

**Issue:** WebSocket connection fails  
**→ Solution:** Check wss:// protocol, valid session, IP not rate-limited (20/min).

**Issue:** Audio transcription fails or is blank  
**→ Solution:** Verify Deepgram API key, check microphone levels (gain 100x), verify VAD thresholds.

**Issue:** TTS audio not playing  
**→ Solution:** Verify ElevenLabs API key, check ELEVENLABS_VOICE_ID, verify browser audio permissions.

**Issue:** Stripe webhook not creating accounts  
**→ Solution:** Verify STRIPE_WEBHOOK_SECRET, check webhook delivery logs in Stripe Dashboard, validate registration token store.

**Issue:** Account creation stuck on registration success page  
**→ Solution:** Check webhook processing (10-20s delay normal), verify /api/auth/complete-registration endpoint, check browser console for errors.

### 9.2 Logging Best Practices

- All critical operations logged with [Service] prefix
- WebSocket messages include timestamps and speaker
- Error logs include stack traces and context
- Database operations logged with timing
- Rate limiting violations logged per IP

### 9.3 Performance Monitoring

- End-to-end latency target: <2 seconds (speech → response → audio)
- First sentence latency: <500ms from Claude
- TTS latency: 200-400ms per sentence
- Document processing: background queue with retry logic

---

## 10. DOCUMENT INFORMATION

- **Last Updated:** December 8, 2025
- **Version:** 2.0.0
- **Scope:** Complete technical specification for production deployment
- **Audience:** Engineers, DevOps, Product Managers, Support Team
- **Classification:** Technical Reference (Internal Use)

**Support Contacts:**
- Engineering Issues: Check logs in `/tmp/logs/` or use health check endpoints
- Billing Questions: Contact Stripe support
- AI Tutor Customization: Refer to system prompt in `server/llm/systemPrompt.ts`
- Voice Configuration: Refer to `server/routes/custom-voice-ws.ts`

---

**End of Technical Specification**
