# Trial Schema Fix Documentation

## Summary

Verified that the trial schema is correctly configured. The initial report of a mismatch (`trial_active` vs `is_trial_active`) was investigated and found to be a false alarm - the schema and database columns are properly aligned.

## Database Schema (Verified)

The `users` table has the following trial-related columns:

| Column Name | Type | Default | Description |
|-------------|------|---------|-------------|
| `trial_active` | boolean | false | Whether user is on active trial |
| `trial_minutes_total` | integer | 30 | Total trial minutes allocated |
| `trial_minutes_used` | integer | 0 | Minutes consumed during trial |
| `trial_started_at` | timestamp | null | When trial began |
| `trial_device_hash` | varchar(64) | null | For abuse prevention |
| `trial_ip_hash` | varchar(64) | null | For abuse prevention |

## Drizzle Schema Mapping

Located in `shared/schema.ts`:

```typescript
trialActive: boolean("trial_active").default(false),
trialMinutesTotal: integer("trial_minutes_total").default(30),
trialMinutesUsed: integer("trial_minutes_used").default(0),
trialStartedAt: timestamp("trial_started_at"),
trialDeviceHash: varchar("trial_device_hash", { length: 64 }),
trialIpHash: varchar("trial_ip_hash", { length: 64 }),
```

Drizzle maps camelCase properties (e.g., `trialActive`) to snake_case columns (e.g., `trial_active`).

## Trial Signup Flow

1. **POST /api/auth/trial-signup** creates user with:
   - `trialActive: true`
   - `trialMinutesTotal: 30`
   - `trialMinutesUsed: 0`
   - `trialStartedAt: new Date()`
   - `emailVerified: false`

2. **Email verification required** - Trial users cannot start tutoring sessions until they verify their email.

3. **Session gating** - In `/api/session/check-availability`:
   ```typescript
   if (user.trialActive && !user.emailVerified) {
     return { allowed: false, reason: 'email_not_verified' };
   }
   ```

## Abuse Prevention

The `trial_abuse_tracking` table limits:
- Max 3 trials per IP per week
- Max 2 trials per device (ever)

## How to Verify

1. Create a trial account:
   ```bash
   curl -X POST http://localhost:5000/api/auth/trial-signup \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"TestPass123","studentName":"Test","gradeLevel":"grades-3-5"}'
   ```

2. Check the database:
   ```sql
   SELECT email, trial_active, trial_minutes_total, email_verified 
   FROM users WHERE email = 'test@example.com';
   ```

   Expected: `trial_active=true`, `trial_minutes_total=30`, `email_verified=false`

3. Verify session is blocked until email verified:
   ```bash
   # Login first, then check availability - should return allowed=false, reason=email_not_verified
   ```

## Date

Verified: January 17, 2026
