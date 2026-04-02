# CLAUDE.md — JIE-Mastery-Tutor-V2

## Project Overview
JIE Mastery is a voice-first AI tutoring platform serving K-12 through college/adult learners. Real-time voice pipeline: AssemblyAI STT → Claude LLM → ElevenLabs TTS. Includes a Longitudinal Student Intelligence System (LSIS) for persistent learner profiles.

## Branch & Deployment Rules (CRITICAL)

### Branch Strategy
- **`dev`** = working branch. ALL changes go here first.
- **`main`** = production. Only receives cherry-picked files from dev.
- **ALWAYS start with `git checkout dev`** — never assume the correct branch.
- **NEVER do a full merge** from dev to main. Cherry-pick specific files only:
  ```
  git checkout main && git pull origin main
  git checkout dev -- path/to/file1 path/to/file2
  git add . && git commit -m "Promote: description" && git push origin main
  ```
- Always `git pull` before making changes to avoid conflicts.

### Hosting & Database
- Railway (dev and prod environments)
- **Dev and prod are SEPARATE PostgreSQL databases** — schema/seed changes must be run independently on both via Beekeeper Studio
- `trial_abuse_tracking.ip_hash` must be nullable — `ALTER COLUMN ip_hash DROP NOT NULL` on any new DB

## Tech Stack
- **Frontend**: React 18, TypeScript, TanStack Query, shadcn/ui, Wouter routing, Vite
- **Backend**: Express.js, TypeScript, PostgreSQL via Drizzle ORM
- **Voice**: AssemblyAI STT, Claude LLM, ElevenLabs TTS, Silero VAD (self-hosted WASM in `client/public/onnx/`)
- **Payments**: Stripe (STRIPE_SECRET_KEY)
- **Email**: Resend (RESEND_FROM_EMAIL), admin contact: pollis@jiemastery.ai

## Key File Structure
```
server/routes.ts           — Main route registration (dynamic imports pattern)
server/routes/
  custom-voice-ws.ts       — WebSocket voice pipeline (CAREFUL — do not touch voice settings)
  capital.ts               — Capital CRM (funding pipeline, 30 endpoints)
  prospects.ts             — Sales/Prospects CRM (~30 endpoints)
  family-academic.ts       — Family Study Tracker / SRM
  documents.ts             — User document management
  context.ts               — Tutor context/RAG
  ai-service.ts            — NOT here, it's in server/services/

server/services/
  ai-service.ts            — Claude API integration + retry logic
  voice.ts                 — Voice orchestration
  email-service.ts         — Resend email service

client/src/pages/
  admin-page-enhanced.tsx  — ★ ACTIVE admin dashboard (tabbed, 9+ tabs) — NOT admin-layout.tsx
  auth-page.tsx            — Landing/login page with marketing sections
  dashboard.tsx            — Main student dashboard
  tutor-page.tsx           — Voice tutoring session
  family-dashboard.tsx     — Family Study Tracker parent view
  family-child-dashboard.tsx — Per-child dashboard

client/src/pages/admin/
  admin-capital-crm.tsx    — Capital CRM tab (iframe in admin-page-enhanced)
  admin-prospects-crm.tsx  — Sales CRM tab
  admin-family-tracker.tsx — Family tracker admin tab

shared/schema.ts           — ALL Drizzle ORM table definitions
```

### Route Registration Pattern
```typescript
// In server/routes.ts — dynamic imports:
const { default: routeName } = await import('./routes/filename');
app.use("/api/path", routeName);
// Admin routes:
app.use("/api/admin/path", requireAdmin, routeName);
```

## Critical Rules

### Voice Pipeline — DO NOT TOUCH without explicit instruction
- Files: `custom-voice-ws.ts`, `ai-service.ts`, `use-custom-voice.ts`, `tts-service.ts`, `realtime-voice-host.tsx`
- Any voice stack changes MUST be applied to both JIE and JIE-UW-Tutor repos simultaneously
- AssemblyAI sends raw + formatted transcripts — formatted duplicates must NOT cancel continuation timers
- Only materially new speech (2+ words or significant confidence increase) should cancel deferrals

### Database Best Practices
- Admin endpoints serving 1,000+ students MUST use batch PostgreSQL queries (DISTINCT ON, COUNT(*) FILTER, GROUP BY) — NEVER per-row N+1 queries
- Schema changes require Beekeeper SQL on BOTH dev and prod databases independently

### React Patterns
- Ref sync: use direct render-body assignment (`ref.current = value`), NOT `useEffect` wrappers for values read synchronously in callbacks
- Stale closure: `useEffect` deps with state variables cause re-registration + timer resets; use refs instead

### Visual System
- 97 WebP images deployed. `IMAGE_VISUALS` map in `VisualPanel.tsx`
- Visual tag regex: `[a-z0-9_]+`
- `onComplete` strips VISUAL tags before saving to history

### External Agent Caution
- Codex/external AI agents have caused breaking changes across many files in the past
- Prefer surgical single-file fixes over multi-file refactors

## Active Features
- **Capital CRM**: 6 tables, 141 seeds, 30 endpoints, iframe tab in admin
- **Sales/Prospects CRM**: 5 tables, 44 seeds, ~30 endpoints, 9th admin tab
- **Family Study Tracker**: 10 tables (family_*), parent-primary accounts, multi-child, gamification (XP/streaks/badges), voice personality by grade band
- **Session inactivity logout**: 8hr server maxAge, 30-min idle warning, 2-min countdown, voice excluded
- **Content moderation**: `content_violations` table (ALTER TABLE still needed on prod)

## Test Accounts
- `tester1@jiemastery.ai` / `tester2@jiemastery.ai`
- `family1@jiemastery.ai` / `family2@jiemastery.ai` (password: JIEFamily2026, elite, 99,999 min)

## Pending Items
- ALTER TABLE content_violations on prod DB
- Unverified trial users (subscription_status = 'trialing')
- 67 remaining visual images
- Voice upgrades: Cartesia Sonic TTS, AssemblyAI Universal-3 Pro (dedicated session)
- Render migration at second institutional contract
