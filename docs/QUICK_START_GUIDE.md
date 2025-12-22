# Quick Start Guide - JIE Mastery AI Tutor

**For New Engineers** | Last Updated: December 22, 2025

---

## Day 1: Getting Started

### 1. Read This First
1. **Main Documentation**: `docs/TECHNICAL_DOCUMENTATION.md` (comprehensive)
2. **Project Memory**: `replit.md` (architecture overview)
3. This guide (quick reference)

### 2. Environment Setup

```bash
# All environment variables are already configured in Replit Secrets
# You don't need to set anything up - they're automatically injected
```

**Critical Secrets** (already configured):
- `DATABASE_URL` - PostgreSQL database
- `ANTHROPIC_API_KEY` - Claude AI
- `DEEPGRAM_API_KEY` - Speech-to-text (default provider)
- `ASSEMBLYAI_API_KEY` - Speech-to-text (alternative provider)
- `ELEVENLABS_API_KEY` - Text-to-speech
- `STRIPE_SECRET_KEY` - Payment processing
- `STT_PROVIDER` - STT provider selection (`deepgram` or `assemblyai`)

### 3. Start Development Server

```bash
npm run dev
```

**What happens**:
- Express server starts on port 5000
- Vite dev server starts (integrated)
- WebSocket server ready at `/api/custom-voice-ws`
- Database connection established
- Hot reload enabled

**Access**: Click the webview in Replit (port 5000)

---

## Day 2-3: Understanding the System

### Core Concepts

#### 1. Session-First Architecture
```
User Profile (defaults) → Session Config (overrides) → Active Session
```
- **Grade level**: Can differ per session (family sharing)
- **Subject**: Math, English, or Spanish
- **Language**: 25 languages supported

#### 2. Minute Tracking
```
Subscription Minutes (monthly reset) → Purchased Minutes (rollover)
```
- Deduction order: subscription first, then purchased
- Tracked in `users` table: `subscriptionMinutes` + `purchasedMinutes`

#### 3. Voice Session Lifecycle
```
Start → Init → Ready → [Speech ↔ AI ↔ TTS] → End → Finalize
```
- WebSocket connection: `/api/custom-voice-ws`
- Audio format: PCM16, 16kHz, mono
- Latency target: <2 seconds end-to-end

---

## Common Tasks

### Task 1: Add a New API Endpoint

**File**: `server/routes.ts`

```typescript
// 1. Add route handler
app.get("/api/your-endpoint", async (req, res) => {
  try {
    // Your logic here
    const data = await storage.yourMethod();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Error message" });
  }
});

// 2. Add storage method (if needed)
// File: server/storage.ts
async yourMethod() {
  return await db.select().from(yourTable);
}
```

---

### Task 2: Modify Database Schema

**File**: `shared/schema.ts`

```typescript
// 1. Update schema
export const yourTable = pgTable("your_table", {
  id: serial("id").primaryKey(),
  newColumn: varchar("new_column"),
  // ... existing columns
});

// 2. Update insert schema (Zod)
export const insertYourTableSchema = createInsertSchema(yourTable)
  .omit({ id: true });

// 3. Update types
export type YourTable = typeof yourTable.$inferSelect;
export type InsertYourTable = z.infer<typeof insertYourTableSchema>;
```

**Apply changes**:
```bash
npm run db:push
```

**If data-loss warning**:
```bash
npm run db:push --force
```

---

### Task 3: Add a New Frontend Page

**Step 1**: Create page component
```typescript
// File: client/src/pages/your-page.tsx
export default function YourPage() {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold">Your Page</h1>
    </div>
  );
}
```

**Step 2**: Register route
```typescript
// File: client/src/App.tsx
import YourPage from "./pages/your-page";

function App() {
  return (
    <Route path="/your-page" component={YourPage} />
  );
}
```

---

### Task 4: Modify AI Tutor Behavior

**File**: `server/config/tutor-personalities.ts`

```typescript
export const tutorPersonalities = {
  "k-2": {
    systemPrompt: "Your updated prompt here...",
    temperature: 0.7,
    maxTokens: 500,
  },
  // ... other age groups
};
```

**Core teaching logic**: `server/llm/adaptiveSocraticCore.ts`

---

### Task 5: Debug WebSocket Issues

**Check backend logs**:
```bash
# Look for these patterns:
[WebSocket] ✅ Connection tracked
[Custom Voice] 🔌 New authenticated connection
[Deepgram] Transcript received
[Custom Voice] 🔊 Received audio
```

**Check frontend console**:
```javascript
// Look for:
[Custom Voice] ✅ Connected
[Custom Voice] 📝 transcript
[Custom Voice] 🔊 Playing audio
```

**Common issues**:
1. Session not authenticated → Check cookies
2. Audio not received → Check microphone permissions
3. Deepgram errors → Check API key
4. TTS errors → Check ElevenLabs API key

---

### Task 6: Test Minute Deduction

```typescript
// 1. Start session (note start time)
// 2. End session (note end time)
// 3. Check database:

SELECT 
  id,
  "minutesUsed",
  "startedAt",
  "endedAt",
  status
FROM realtime_sessions
ORDER BY "startedAt" DESC
LIMIT 1;

// 4. Check user balance:
SELECT 
  username,
  "subscriptionMinutes",
  "purchasedMinutes"
FROM users
WHERE id = <your-user-id>;
```

---

## Code Navigation

### Where to Find Things

| What | Where |
|------|-------|
| Database schema | `shared/schema.ts` |
| API routes | `server/routes.ts` |
| WebSocket logic | `server/routes/custom-voice-ws.ts` |
| Storage layer | `server/storage.ts` |
| AI prompts | `server/config/tutor-personalities.ts` |
| Frontend pages | `client/src/pages/*.tsx` |
| React hooks | `client/src/hooks/*.ts` |
| UI components | `client/src/components/*.tsx` |
| Tailwind config | `tailwind.config.ts` |

### Important Constants

```typescript
// Voice settings
SAMPLE_RATE = 16000 (Hz)
AUDIO_FORMAT = PCM16
GAIN_MULTIPLIER = 100 (for quiet mics)

// Timeouts
INACTIVITY_WARNING = 4 minutes
INACTIVITY_AUTO_END = 5 minutes
SESSION_MAX_AGE = 24 hours

// Rate limits
WS_UPGRADES_PER_MINUTE = 20
WS_CONCURRENT_CONNECTIONS = 5
```

---

## Debugging Checklist

### Voice Session Not Starting

- [ ] User authenticated? (check `/api/user` returns 200)
- [ ] Subscription active? (check `subscriptionStatus`)
- [ ] Minutes available? (check `subscriptionMinutes + purchasedMinutes > 0`)
- [ ] WebSocket upgrade successful? (check logs for "Connection tracked")
- [ ] Deepgram connection established? (check logs for "Deepgram connected")

### Audio Not Playing

- [ ] Browser permissions granted?
- [ ] HTTPS connection? (required for audio)
- [ ] Audio enabled in UI? (check speaker icon)
- [ ] TTS service responding? (check logs for "ElevenLabs response")
- [ ] Audio context resumed? (check browser console)

### Transcript Not Appearing

- [ ] Microphone working? (check browser permissions)
- [ ] Audio data being sent? (check network tab for WebSocket frames)
- [ ] Deepgram receiving audio? (check logs for "Deepgram transcript")
- [ ] Gain amplification active? (check audio processor logs)

---

## Architecture Patterns

### 1. Frontend Data Fetching

**Always use TanStack Query**:
```typescript
const { data, isLoading, error } = useQuery({
  queryKey: ['/api/endpoint'],
  // queryFn is pre-configured, don't override
});
```

### 2. Backend Storage Access

**Always use storage layer**:
```typescript
// ✅ CORRECT
const user = await storage.getUser(userId);

// ❌ WRONG - Don't query directly
const user = await db.select().from(users).where(eq(users.id, userId));
```

### 3. Form Handling

**Always use React Hook Form + Zod**:
```typescript
const form = useForm({
  resolver: zodResolver(insertUserSchema),
  defaultValues: { ... }
});

<Form {...form}>
  <FormField name="username" />
</Form>
```

---

## Production Deployment

### Pre-Deployment Checklist

- [ ] All tests passing
- [ ] No TypeScript errors (`npm run build`)
- [ ] Environment variables configured in Replit
- [ ] Database migrations applied (`npm run db:push`)
- [ ] Stripe webhook endpoint configured
- [ ] Email sender verified (Resend)

### Deployment Process

**Platform**: Replit Autoscale (serverless)

**Steps**:
1. Click "Deploy" in Replit
2. Configure deployment (already set to autoscale)
3. Verify environment variables copied
4. Deploy
5. Test WebSocket connection
6. Monitor logs for errors

### Post-Deployment Verification

```bash
# Health check
curl https://your-domain.repl.co/api/health

# WebSocket test (browser console)
const ws = new WebSocket('wss://your-domain.repl.co/api/custom-voice-ws');
ws.onopen = () => console.log('Connected!');
```

---

## Getting Help

### Resources

1. **Main Documentation**: `docs/TECHNICAL_DOCUMENTATION.md`
2. **Project Memory**: `replit.md`
3. **Code Comments**: Inline documentation in key files
4. **External Docs**:
   - Anthropic: https://docs.anthropic.com
   - Deepgram: https://developers.deepgram.com
   - ElevenLabs: https://docs.elevenlabs.io
   - Stripe: https://stripe.com/docs

### Common Questions

**Q: Why are sessions ending after 30 minutes?**  
A: This was a bug (FIXED Nov 18, 2025). Pull latest code.

**Q: How do I test payments without real money?**  
A: Use Stripe test mode. Card: `4242 4242 4242 4242`, any future date, any CVC.

**Q: Can I use a different AI model?**  
A: Yes, but you'll need to modify `server/routes/custom-voice-ws.ts` and adjust the prompt format.

**Q: How do I add a new language?**  
A: Add Azure TTS voice mapping in `server/services/voice.ts`

---

## Next Steps

### Week 1 Goals
- [ ] Read full technical documentation
- [ ] Set up local development environment
- [ ] Run the application successfully
- [ ] Make a small code change (e.g., update a button label)
- [ ] Test voice session end-to-end

### Week 2 Goals
- [ ] Understand database schema
- [ ] Understand voice session lifecycle
- [ ] Modify AI tutor prompt
- [ ] Add a new API endpoint
- [ ] Fix a bug or implement a small feature

### Week 3 Goals
- [ ] Deep dive into WebSocket implementation
- [ ] Understand minute tracking system
- [ ] Work on a larger feature
- [ ] Review production deployment process

---

**Welcome to the team! 🚀**

For questions, refer to `docs/TECHNICAL_DOCUMENTATION.md` or review the codebase with this guide as your roadmap.
