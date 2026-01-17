# Trial Schema Fix Documentation

## Summary

Fixed the schema mismatch between code and production database. The production database uses `is_trial_active` while the code was referencing `trial_active`.

## What Was Wrong

1. **Drizzle schema** (`shared/schema.ts`) mapped `trialActive` to DB column `trial_active`
2. **Raw SQL queries** in `server/services/voice-minutes.ts` selected `trial_active`
3. **Production database** uses column name `is_trial_active`

This caused 500 errors on `/api/auth/trial-signup` with:
```
error: column "is_trial_active" does not exist
hint: Perhaps you meant to reference the column "users.trial_active"
```

## What Changed

### 1. Drizzle Schema (`shared/schema.ts`)

**Before:**
```typescript
trialActive: boolean("trial_active").default(false),
```

**After:**
```typescript
trialActive: boolean("is_trial_active").default(false),
```

### 2. Voice Minutes Service (`server/services/voice-minutes.ts`)

**Before (raw SQL):**
```sql
SELECT trial_active, trial_minutes_total, ...
...
if (userData.trial_active) {
```

**After:**
```sql
SELECT is_trial_active, trial_minutes_total, ...
...
if (userData.is_trial_active) {
```

### 3. Trial Activation Logic

**Before:** User was created with `trialActive: true` immediately

**After:** 
- User created with `trialActive: false` (pending trial)
- `is_trial_active = true` and `trial_started_at = now()` set when first session starts
- New function `activateTrial(userId)` in `voice-minutes.ts`

### 4. Startup Health Check (`server/db-init.ts`)

Added `verifyTrialSchemaColumns()` function that runs on startup:
- Checks if `is_trial_active` column exists (correct)
- Warns if legacy `trial_active` column found
- Verifies all trial columns exist

## Files Edited

| File | Changes |
|------|---------|
| `shared/schema.ts` | Line 134: `trial_active` → `is_trial_active` |
| `server/services/voice-minutes.ts` | Lines 51, 69: `trial_active` → `is_trial_active` |
| `server/services/voice-minutes.ts` | Added `activateTrial()` and `deductTrialMinutes()` functions |
| `server/routes/session.ts` | Added pending trial detection and activation on first session |
| `server/routes/billing.ts` | Simplified trial detection (Drizzle handles mapping) |
| `server/auth.ts` | Lines 724-727: Create with `trialActive: false`, `trialStartedAt: null` |
| `server/db-init.ts` | Added `verifyTrialSchemaColumns()` regression guard |

## How to Verify

### Manual Test

1. Create a trial account:
```bash
curl -X POST http://localhost:5000/api/auth/trial-signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPass123","studentName":"Test","gradeLevel":"grades-3-5"}'
```

Expected response (201):
```json
{
  "success": true,
  "requiresVerification": true,
  "user": {
    "trialActive": false,
    "emailVerified": false
  }
}
```

2. Check database:
```sql
SELECT email, is_trial_active, trial_minutes_total, trial_started_at, email_verified 
FROM users WHERE email = 'test@example.com';
```

Expected:
- `is_trial_active = false`
- `trial_minutes_total = 30`
- `trial_started_at = null`
- `email_verified = false`

3. Test duplicate email (should return 409):
```bash
curl -X POST http://localhost:5000/api/auth/trial-signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPass123","studentName":"Test","gradeLevel":"grades-3-5"}'
```

### Startup Health Check

On server startup, look for:
```
[DB-Init] Verifying trial schema columns...
[DB-Init] ✅ is_trial_active column exists (correct)
[DB-Init] ✅ All trial columns verified
```

If legacy column found:
```
[DB-Init] ⚠️ Found legacy trial_active column. Production uses is_trial_active.
```

## Trial Flow Summary

1. **Signup** (`/api/auth/trial-signup`):
   - Create user with `is_trial_active = false`, `trial_minutes_total = 30`
   - Send verification email
   - `trial_started_at` remains NULL

2. **Email Verification** (`/api/auth/verify-email`):
   - Set `email_verified = true`

3. **First Session Start** (`/api/session/check-availability`):
   - Detect pending trial (subscriptionStatus = 'trialing', is_trial_active = false)
   - Call `activateTrial(userId)` which sets:
     - `is_trial_active = true`
     - `trial_started_at = now()`

4. **During Session**:
   - `deductMinutes()` checks `is_trial_active`
   - If trial user, calls `deductTrialMinutes()` which increments `trial_minutes_used`

## Date

Fixed: January 17, 2026
