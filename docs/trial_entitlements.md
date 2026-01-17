# Trial Entitlements System

## Overview

The trial entitlements system ensures trial users see accurate information about their 30-minute trial, distinct from paid subscription users or free-tier fallbacks.

## Database Fields (users table)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `trial_active` | boolean | false | Whether user is on an active trial |
| `trial_minutes_total` | integer | 30 | Total trial minutes allocated |
| `trial_minutes_used` | integer | 0 | Minutes consumed in tutoring |
| `trial_started_at` | timestamp | null | When trial was activated |
| `trial_device_hash` | varchar(64) | null | SHA256 hash of device ID |
| `trial_ip_hash` | varchar(64) | null | SHA256 hash of client IP |
| `email_verified` | boolean | false | Whether email is verified |

## API Endpoint

### GET /api/billing/entitlements

Returns computed entitlements for the current user.

**Response:**
```json
{
  "planLabel": "30-Minute Trial",
  "planType": "trial",
  "minutesTotal": 30,
  "minutesUsed": 5,
  "minutesRemaining": 25,
  "purchasedMinutes": 0,
  "resetsAt": "2026-02-17T19:05:00.000Z",
  "canPurchaseTopups": false,
  "canStartSession": true,
  "subscriptionStatus": "trialing",
  "emailVerified": true
}
```

**Plan Types:**
- `trial`: User is on 30-minute trial
- `paid`: User has active subscription (starter, standard, pro, elite)
- `free`: User has no active plan (cannot start sessions)

## Backend Logic

### Voice Minutes Service (`server/services/voice-minutes.ts`)

The `getUserMinuteBalance()` function checks `trial_active` first:

```typescript
if (userData.trial_active) {
  return {
    subscriptionMinutes: trialRemaining,
    subscriptionLimit: trialTotal,  // 30, not 60
    purchasedMinutes: 0,
    totalAvailable: trialRemaining,
    resetDate: trialExpiry,
    subscriptionUsed: trialUsed,
    purchasedUsed: 0
  };
}
```

**Key Rule:** Trial users do NOT fall back to the 60-minute free tier. They use their trial allocation only.

### Entitlements Endpoint (`server/routes/billing.ts`)

Computes `planType` based on:
1. `user.trialActive === true` → `planType: 'trial'`
2. `user.subscriptionPlan && status === 'active'` → `planType: 'paid'`
3. Otherwise → `planType: 'free'`

## UI Rules

### Subscription Page (Dashboard)

**Trial Users (`planType === 'trial'`):**
- Plan name: "30-Minute Trial" (not "Free Plan")
- Badge: "Trial" (blue)
- Subtitle: "Trial in progress" (not "$X/month")
- Minutes display: "Trial Minutes Remaining" with X/30
- Progress bar: Blue color
- Bottom text: "Trial access until [date]"
- Action button: "Upgrade to Full Plan" (scrolls to plans)
- Hidden: "Buy 60 Minutes" button

**Paid Users (`planType === 'paid'`):**
- Plan name: Subscription plan name (e.g., "Pro Family")
- Badge: "Active" (default)
- Minutes display: "Total Available" with standard meter
- Shows rollover balance if any
- Action button: "Buy 60 Minutes ($19.99)"

**Free/Inactive Users (`planType === 'free'`):**
- Plan name: "No Active Plan"
- Badge: "Inactive"
- Action button: "Subscribe" or "Reactivate"

## Abuse Prevention

### Device-Based Limits
- Device ID generated client-side (localStorage)
- Hashed server-side before storage
- Max 2 trials per device

### IP-Based Limits (Soft)
- Max 3 trials per IP per week
- Used as soft protection (avoid blocking schools/homes)

### Tracking Table (`trial_abuse_tracking`)

| Field | Description |
|-------|-------------|
| `device_hash` | SHA256 of device ID |
| `ip_hash` | SHA256 of client IP |
| `user_id` | Reference to users table |
| `trial_count` | Number of trials from this identifier |
| `blocked` | Permanent block flag |

## Error States

| Condition | Behavior |
|-----------|----------|
| Trial expired (30 mins used) | `canStartSession: false`, show upgrade modal |
| Email not verified | `canStartSession: false`, show verification prompt |
| Device limit reached | 409 response, prompt to login |
| IP limit reached | 429 response, soft block |
