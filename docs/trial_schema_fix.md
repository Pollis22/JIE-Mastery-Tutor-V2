# Trial Schema Standardization Fix

## Summary

Standardized the codebase to use canonical column names that match the production database.

## Canonical Column Names

| Canonical (Use These) | Legacy (Replaced) |
|----------------------|-------------------|
| `is_trial_active` | `trial_active` |
| `trial_minutes_limit` | `trial_minutes_total` |
| `trial_minutes_used` | (same) |
| `trial_started_at` | (same) |
| `trial_ends_at` | (new) |

## What Changed

### 1. Drizzle Schema (`shared/schema.ts`)

```typescript
// 30-Minute Free Trial System (account-based)
trialActive: boolean("is_trial_active").default(false),
trialMinutesLimit: integer("trial_minutes_limit").default(30),
trialMinutesUsed: integer("trial_minutes_used").default(0),
trialStartedAt: timestamp("trial_started_at"),
trialEndsAt: timestamp("trial_ends_at"),
```

### 2. Trial Signup (`server/auth.ts`)

Trial signup now atomically sets:
- `is_trial_active = true`
- `trial_minutes_limit = 30`
- `trial_minutes_used = 0`
- `trial_started_at = NOW()`
- `trial_ends_at = NOW() + 30 minutes`

### 3. Voice Minutes Service (`server/services/voice-minutes.ts`)

All raw SQL queries use `trial_minutes_limit` instead of `trial_minutes_total`.

### 4. Session Route (`server/routes/session.ts`)

- Email verification gate: Trial users must verify email before starting sessions
- Uses `trialMinutesLimit` property (Drizzle camelCase mapping)

### 5. Billing Route (`server/routes/billing.ts`)

Uses `trialMinutesLimit` for entitlement calculations.

### 6. DB Init Health Check (`server/db-init.ts`)

Verifies `trial_minutes_limit` column exists on startup.

## Files Edited

| File | Changes |
|------|---------|
| `shared/schema.ts` | `trial_minutes_total` → `trial_minutes_limit`, added `trial_ends_at` |
| `server/auth.ts` | Trial signup sets `trialActive: true` immediately with all trial fields |
| `server/services/voice-minutes.ts` | All SQL: `trial_minutes_total` → `trial_minutes_limit` |
| `server/routes/session.ts` | All refs: `trialMinutesTotal` → `trialMinutesLimit`, email gate for trials |
| `server/routes/billing.ts` | `trialMinutesTotal` → `trialMinutesLimit` |
| `server/db-init.ts` | Health check verifies `trial_minutes_limit` |

## Trial Signup Flow

1. **POST /api/auth/trial-signup**
   - Validates input (email, password, studentName, gradeLevel)
   - Checks for existing user (returns 409 if duplicate)
   - Checks abuse limits (IP/device tracking)
   - Creates user with:
     - `is_trial_active = true`
     - `trial_minutes_limit = 30`
     - `trial_minutes_used = 0`
     - `trial_started_at = NOW()`
     - `trial_ends_at = NOW() + 30 minutes`
     - `email_verified = false`
   - Sends verification email
   - Returns 201 with `trialActive: true`

2. **POST /api/session/check-availability**
   - If trial user with unverified email: Returns 403 `email_not_verified`
   - If trial expired: Returns `trial_expired`
   - If trial active and verified: Returns `allowed: true`

## Response Codes

| Code | Scenario |
|------|----------|
| 201 | Successful trial signup |
| 400 | Malformed input |
| 409 | Email already registered |
| 429 | Too many trials (rate limited) |

## Testing

```bash
# Create trial user
curl -X POST http://localhost:5000/api/auth/trial-signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPass123","studentName":"Test","gradeLevel":"grades-3-5"}'

# Expected: 201 with trialActive: true

# Test duplicate email
curl -X POST http://localhost:5000/api/auth/trial-signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPass123","studentName":"Test","gradeLevel":"grades-3-5"}'

# Expected: 409 "Email already registered"
```

## Date

Fixed: January 17, 2026
