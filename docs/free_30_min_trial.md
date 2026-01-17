# 30-Minute Free Trial System

## Overview

The 30-minute free trial system allows users to create an account and experience the full AI tutoring platform without payment. Users must verify their email before starting, then get 30 minutes of real tutoring time with all features enabled.

## User Flow

1. User clicks "Start Free Trial" button on any marketing page
2. User is directed to `/start-trial` page
3. User fills out form: email, password, student name, age (optional), grade level, subject (optional)
4. On submit, account is created with `emailVerified = false`
5. Verification email is sent to user
6. Lead notification email is sent to JIE internal team
7. User sees "Check Your Email" screen with resend button
8. User clicks verification link in email
9. Email is verified, user is logged in automatically
10. User is redirected to `/tutor` to start their trial session
11. When trial expires (30 minutes used), user sees upgrade modal

## API Endpoints

### POST /api/auth/trial-signup

Creates a new trial account and sends verification email.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepass123",
  "studentName": "Alex",
  "studentAge": 10,
  "gradeLevel": "grades-3-5",
  "primarySubject": "math",
  "deviceId": "stable-device-identifier"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "requiresVerification": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "studentName": "Alex",
    "gradeLevel": "grades-3-5",
    "trialActive": true,
    "emailVerified": false
  },
  "message": "Please check your email to verify your account and start your trial.",
  "warning": "This is your last trial from this device/location."
}
```

**Error Responses:**

- 409: Email already registered (use this for frontend to redirect to login)
- 429: Rate limit exceeded (too many trials)
- 500: Server error

### GET /api/auth/verify-email

Verifies email and auto-logs in the user.

**Query Parameters:**
- `token`: The verification token from the email link

**Success:** Redirects to `/tutor?verified=1`

**Error:** Redirects to `/start-trial?error=expired_token` or `/start-trial?error=invalid_token`

### POST /api/auth/resend-verification

Resends verification email with rate limiting.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Verification email sent. Please check your inbox."
}
```

**Error Responses:**
- 400: Email already verified
- 429: Rate limited (wait 2 minutes between resends)

## Gating Rules

### Email Verification Required

Trial users **must** verify their email before starting tutoring sessions.

**Check in `/api/session/check-availability`:**
```typescript
if (user.trialActive && !user.emailVerified) {
  return res.status(403).json({ 
    allowed: false, 
    reason: 'email_not_verified',
    message: 'Please verify your email to start your free trial.',
    requiresVerification: true
  });
}
```

### Frontend Behavior

- Unverified trial users are shown the "Check Your Email" screen
- They cannot access the tutor page until verified
- Resend button has 2-minute cooldown

## Database Schema

### Users Table (trial fields)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `trial_active` | boolean | false | Whether user is on active trial |
| `trial_minutes_total` | integer | 30 | Total trial minutes allocated |
| `trial_minutes_used` | integer | 0 | Minutes consumed in tutoring |
| `trial_started_at` | timestamp | null | When trial was activated |
| `trial_device_hash` | varchar(64) | null | SHA256 hash of device ID |
| `trial_ip_hash` | varchar(64) | null | SHA256 hash of client IP |
| `email_verified` | boolean | false | Whether email is verified |
| `email_verification_token` | text | null | Token for email verification |
| `email_verification_expiry` | timestamp | null | When token expires (24 hours) |

### Trial Abuse Tracking Table

| Field | Type | Description |
|-------|------|-------------|
| `id` | varchar | Primary key (UUID) |
| `device_hash` | varchar(64) | SHA256 hash of device ID |
| `ip_hash` | varchar(64) | SHA256 hash of client IP |
| `user_id` | varchar | Reference to users table |
| `trial_count` | integer | Number of trials from this device/IP |
| `last_trial_at` | timestamp | When last trial was created |
| `week_start` | timestamp | Start of rate limit window |
| `blocked` | boolean | Whether permanently blocked |

## Emails Sent

### 1. Verification Email (to user)

Sent immediately after trial signup.

**Subject:** "Verify Your Email"

**Content:**
- Welcome message
- Verification button/link
- Link expires in 24 hours
- Plain text fallback included

### 2. Lead Notification (to JIE internal)

Sent to `JIE_LEAD_NOTIFY_EMAIL` (or `ADMIN_EMAIL` fallback).

**Subject:** "New Trial Lead"

**Content:**
- User email
- Student name
- Grade level
- Subject interest
- Source route (/start-trial)
- Created timestamp

## Abuse Prevention

### Rate Limits

- **Per Device**: Maximum 2 trials
  - 1st trial: No warning
  - 2nd trial: Warning displayed
  - 3rd attempt: Blocked

- **Per IP (weekly)**: Maximum 3 trials
  - 1st-2nd trial: No warning
  - 3rd trial: Warning displayed
  - 4th attempt: Blocked until next week

### Device ID Generation

Device ID is generated client-side and stored in localStorage:

```javascript
const storageKey = 'jie_device_id';
let deviceId = localStorage.getItem(storageKey);
if (!deviceId) {
  deviceId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  localStorage.setItem(storageKey, deviceId);
}
```

The device ID is hashed server-side using SHA256 before storage.

## Trial Expiration

### Checking Trial Status

The system checks trial status when:
1. User attempts to start a voice session
2. During active tutoring sessions (real-time tracking)

### Expiration Handling

When `trial_minutes_used >= trial_minutes_total`:
1. Voice session is blocked
2. `/api/session/check-availability` returns `reason: 'trial_expired'`
3. Frontend shows upgrade modal with subscription options

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `JIE_LEAD_NOTIFY_EMAIL` | Email for lead notifications | Falls back to `ADMIN_EMAIL` |
| `ADMIN_EMAIL` | Fallback admin email | support@jiemastery.ai |
| `RESEND_API_KEY` | Resend API key for sending emails | Required |

## Error Codes

| Code | Reason | Frontend Action |
|------|--------|-----------------|
| 409 | Email already registered | Show error + link to login |
| 403 | Email not verified | Show verification pending screen |
| 429 | Rate limit exceeded | Show rate limit message |
| 400 | Validation error | Show field-specific error |
