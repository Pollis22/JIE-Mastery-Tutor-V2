# Free 30-Minute Trial (Real System) Specification

**Status:** Draft  
**Version:** 1.0  
**Date:** January 17, 2026  
**Author:** Agent 3

---

## 1. Overview

### What It Is
A free 30-minute trial that runs on the **production system** (not a demo UI). Users create a real account, verify their email, and receive 30 minutes of active voice tutoring time to experience the full JIE Mastery platform.

### Why It Exists
- The existing 5-minute demo trial runs in a lightweight "demo mode" that doesn't showcase the full product capabilities
- A 30-minute real-system trial allows users to experience authentic voice tutoring quality
- Creates a clear path from trial → paid conversion with preserved data

### What Problem It Solves
- Demo mode gives an incomplete picture of the product
- Users who would convert after experiencing the real system are lost
- Trial-to-paid conversion requires seamless data preservation

---

## 2. User Flow

### Happy Path: Landing → Signup → Trial → Upgrade

1. **User arrives at landing page**
   - Sees "Start 30-Minute Free Trial" CTA
   - Clicks to begin signup

2. **Account Creation**
   - User enters email + password
   - Real user account is created immediately in the database
   - `subscription_status = 'trial'`
   - `trial_minutes_total = 30`
   - `trial_minutes_used = 0`
   - `trial_expires_at = NULL` (set after verification)

3. **Email Verification**
   - Verification email sent
   - User clicks verification link
   - `email_verified_at` is set
   - `trial_expires_at = NOW() + 7 days`
   - Trial timer is now active

4. **Trial Active**
   - User can start voice tutoring sessions
   - All subjects and grade levels available
   - Document upload disabled (or limited to 1 small file)
   - 1 concurrent session limit
   - Minutes deducted using existing minute-tracking logic

5. **Trial Exhaustion or Expiration**
   - When `trial_minutes_used >= 30` OR `NOW() > trial_expires_at`:
     - New voice sessions blocked
     - Upgrade paywall shown
     - Read-only access to history
     - Login still allowed

6. **Upgrade via Stripe**
   - User completes Stripe checkout
   - `subscription_status = 'active'`
   - `subscription_minutes_used = 0` (fresh allocation)
   - Trial fields preserved for auditing
   - All history, transcripts, and profiles preserved

---

## 3. Trial State Model

### User States

| State | Condition | Access |
|-------|-----------|--------|
| `trial_pending` | Account created, email not verified | No tutoring access |
| `trial_active` | Email verified, minutes remaining, not expired | Full tutoring (1 session limit) |
| `trial_exhausted` | `trial_minutes_used >= 30` | Read-only, upgrade paywall |
| `trial_expired` | `NOW() > trial_expires_at` | Read-only, upgrade paywall |
| `subscribed` | `subscription_status = 'active'` | Full access per plan tier |

### User Fields Used

**Existing fields (no schema changes):**
- `subscription_status`: Add 'trial' as a valid status
- `email_verified_at`: Timestamp when email was verified
- `subscription_minutes_used`: Track trial usage here (or dedicated field below)

**Potentially new fields (only if needed):**
- `trial_minutes_total`: Default 30 (can be NULL for non-trial users)
- `trial_minutes_used`: Tracks trial voice minutes consumed
- `trial_expires_at`: Timestamp (7 days after verification)
- `trial_started_at`: Timestamp when trial began (for analytics)

> **Note:** Check if existing `subscriptionMinutesLimit` and `subscriptionMinutesUsed` can be repurposed for trial, or if dedicated fields are cleaner. Prefer reusing existing fields if they fit.

---

## 4. Entitlement Logic

### Entitlement Check (Pseudo-code)

```
function hasTrialAccess(user):
  // 1. Paid users always have access (bypass trial logic)
  if user.subscription_status == 'active':
    return SUBSCRIPTION_ACCESS
  
  // 2. Admin/test users bypass trial
  if user.is_admin OR user.email LIKE 'test%@jiemastery.ai':
    return ADMIN_ACCESS
  
  // 3. Check trial eligibility
  if user.subscription_status != 'trial':
    return NO_ACCESS
  
  // 4. Must be email verified
  if user.email_verified_at IS NULL:
    return PENDING_VERIFICATION
  
  // 5. Check calendar expiration (7 days from verification)
  if NOW() > user.trial_expires_at:
    return TRIAL_EXPIRED
  
  // 6. Check minute usage
  if user.trial_minutes_used >= user.trial_minutes_total:
    return TRIAL_EXHAUSTED
  
  return TRIAL_ACTIVE
```

### Minute Decrement Logic

- Use the same minute-tracking mechanism as paid subscriptions
- Decrement `trial_minutes_used` during voice sessions
- Track at 1-minute granularity (or existing granularity)
- Session ends when `trial_minutes_used >= 30`

### Concurrency Enforcement

- Trial users: **1 concurrent voice session** maximum
- Check before starting new session:
  ```
  if user is trial AND active_sessions >= 1:
    return "Please end your current session first"
  ```
- Paid users keep their tier-based limits

---

## 5. Upgrade Logic

### What Happens on Stripe Subscription Activation

1. **Stripe webhook fires** (`customer.subscription.created` or `invoice.paid`)

2. **Update user record:**
   ```sql
   UPDATE users SET
     subscription_status = 'active',
     subscription_plan = :plan_from_stripe,
     subscription_minutes_used = 0,  -- Fresh start
     subscription_minutes_limit = :plan_limit,
     stripe_subscription_id = :sub_id,
     stripe_customer_id = :cust_id
   WHERE id = :user_id
   ```

3. **Preserve trial data for auditing:**
   - Do NOT delete `trial_minutes_used`, `trial_expires_at`
   - These remain for analytics/auditing purposes

4. **Data preservation:**
   - Session transcripts: Preserved
   - Learning history: Preserved
   - Student profiles: Preserved
   - User preferences: Preserved

### Priority Rules

When checking access:
1. **First:** Check `subscription_status = 'active'` → use subscription rules
2. **Then:** Check trial eligibility → use trial rules
3. Subscription always takes priority over trial

---

## 6. Safety Guarantees

### Paid Users Unaffected

```
// At the top of every trial check:
if (user.subscription_status === 'active') {
  return; // Skip all trial logic
}
```

- Trial logic is completely bypassed for active subscribers
- No trial fields are checked for paid users
- Stripe remains single source of truth for paid plans

### Stripe Users Protected

- Stripe webhook handlers do not interfere with trial logic
- Upgrade flow sets `subscription_status = 'active'`, which bypasses trial checks
- Trial expiration does NOT affect paid subscriptions

### Admin/Test Users Bypass

```
if (user.isAdmin || user.email.match(/^test.*@jiemastery\.ai$/)) {
  return FULL_ACCESS; // No trial restrictions
}
```

### Rate Limiting (Abuse Prevention)

- Reuse existing `trial_rate_limits` table with UPSERT logic
- Soft-block thresholds:
  - Same IP: Max 3 trial signups per 24 hours → warning + require verification
  - Same device_id: Max 2 trial signups per 30 days → cooldown
- Hard-block only for clearly abusive patterns (10+ attempts)
- Never hard-block legitimate households sharing IP

---

## 7. Non-Goals

This specification explicitly does NOT attempt to:

1. **Replace the existing 5-minute demo** - The demo remains for quick previews; this is a separate conversion path

2. **Add new subscription tiers** - Trial is not a tier; it's a temporary state before subscription

3. **Modify Stripe integration** - Existing Stripe checkout and webhook handlers remain unchanged

4. **Track detailed session analytics** - Basic minute tracking only; advanced analytics is out of scope

5. **Implement referral credits** - No referral bonus minutes for trial users

6. **Support trial extensions** - No mechanism for extending trial beyond 30 minutes

7. **Add trial for existing paid users** - Only new users get trial; existing subscribers cannot "trial" other features

8. **Handle multi-currency** - Trial is free; no payment involved

---

## 8. Implementation Checklist

### Backend Steps

- [ ] **Schema check**: Verify if dedicated trial fields exist or can reuse existing fields
- [ ] **Add trial eligibility check**: `hasTrialAccess(user)` function
- [ ] **Modify account creation**: Set `subscription_status = 'trial'` for new signups
- [ ] **Update verification flow**: Set `trial_expires_at` on email verification
- [ ] **Add concurrency check**: Limit trial users to 1 concurrent session
- [ ] **Update minute decrement**: Track against `trial_minutes_total`
- [ ] **Add trial exhaustion check**: Block new sessions when minutes depleted
- [ ] **Add trial expiration check**: Block new sessions after 7 days
- [ ] **Verify upgrade flow**: Ensure Stripe activation sets `subscription_status = 'active'`
- [ ] **Admin bypass**: Ensure isAdmin and test emails bypass trial logic
- [ ] **Rate limiting**: Verify UPSERT logic for `trial_rate_limits`

### Frontend Steps

- [ ] **New signup flow**: "Start 30-Minute Free Trial" CTA and form
- [ ] **Trial status indicator**: Show remaining minutes in header/dashboard
- [ ] **Trial exhaustion screen**: Upgrade paywall when minutes depleted
- [ ] **Trial expiration screen**: Upgrade paywall when 7 days passed
- [ ] **Document upload disabled**: Hide or disable upload UI for trial users
- [ ] **Concurrency message**: Show error if trial user tries 2nd session

### Analytics (Optional)

- [ ] Track `trial_started` event (on email verification)
- [ ] Track `trial_exhausted` event (when 30 min used)
- [ ] Track `trial_expired` event (when 7 days passed without conversion)
- [ ] Track `trial_converted` event (on Stripe subscription activation)

### Rollback Plan

If issues arise post-deployment:

1. **Feature flag**: Add `TRIAL_30_MIN_ENABLED` env var to disable new trial signups
2. **Existing users**: Trial users can continue using remaining minutes
3. **Database**: No destructive changes; trial fields can be ignored if disabled
4. **Fallback**: Redirect trial signup CTA to existing 5-minute demo

---

## 9. Open Questions / Future Considerations

1. **Promo code integration**: Should trial users be able to apply promo codes during upgrade?
2. **Trial reminder emails**: Send email at 7 minutes remaining? 1 day before expiration?
3. **Partial minute tracking**: Track seconds or round to nearest minute?
4. **Family accounts**: Does one trial cover all student profiles, or per-profile?

---

## 10. Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Product | | | Pending |
| Engineering | | | Pending |
| QA | | | Pending |

---

*This document serves as the canonical reference for the 30-minute real-system trial implementation.*
