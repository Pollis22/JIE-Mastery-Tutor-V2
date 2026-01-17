# 30-Minute Free Trial System

## Overview

The 30-minute free trial system allows users to create an account and experience the full AI tutoring platform without payment. Users get 30 minutes of real tutoring time with all features enabled.

## User Flow

1. User clicks "Start Free Trial" button on any marketing page
2. User is directed to `/start-trial` page
3. User fills out form: email, password, student name, age (optional), grade level, subject (optional)
4. On submit, account is created and user is logged in immediately
5. User is redirected to `/tutor` to start their trial session
6. When trial expires (30 minutes used), user sees upgrade modal

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

## API Endpoints

### POST /api/auth/trial-signup

Creates a new trial account and logs the user in.

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
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "studentName": "Alex",
    "gradeLevel": "grades-3-5",
    "trialActive": true,
    "trialMinutesTotal": 30,
    "trialMinutesUsed": 0
  },
  "redirect": "/tutor",
  "warning": "This is your last trial from this device/location."
}
```

**Error Responses:**

- 400: Email already registered
- 429: Rate limit exceeded (too many trials)
- 500: Server error

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
2. TrialEndedPaywall modal is displayed
3. User can view subscription plans
4. Trial users can still log in to upgrade

## Frontend Components

### StartTrialButton

Reusable button that links to `/start-trial`:

```tsx
<StartTrialButton 
  variant="primary"  // primary | secondary | outline
  size="lg"          // sm | md | lg
  showSubtext={true} // Shows "30-minute free trial..." text
/>
```

### StartTrialPage (`/start-trial`)

Full-page form for trial account creation with:
- Email and password inputs
- Student name and optional age
- Grade level selector (required)
- Subject interest selector (optional)
- Form validation with error messages
- Rate limit warning display

### TrialEndedPaywall

Modal displayed when trial expires:
- Shows remaining time (0:00)
- Highlights WELCOME50 promo code (50% off)
- Links to pricing page
- Professional upgrade messaging

## Related Files

- `server/auth.ts` - Trial signup endpoint
- `client/src/pages/start-trial-page.tsx` - Trial signup form
- `client/src/components/StartTrialButton.tsx` - CTA button
- `client/src/components/TrialEndedPaywall.tsx` - Expiration modal
- `shared/schema.ts` - Database schema with trial fields

## Migration from 5-Minute Demo Trial

The legacy 5-minute demo trial system (email-only, no account) is being phased out. Key differences:

| Feature | 5-Min Demo | 30-Min Real Trial |
|---------|------------|-------------------|
| Account required | No | Yes |
| Data persisted | No | Yes |
| Full app access | Limited | Full |
| Progress saved | No | Yes |
| Upgrade path | Create account | Just pay |
