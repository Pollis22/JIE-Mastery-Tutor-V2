# iOS Safari Authentication Testing Guide

## Problem
iOS Safari and WebKit-based browsers (iPhone Chrome, in-app browsers) have strict cookie handling that can cause session cookies to not persist properly.

## Key Changes Made
1. **Rolling sessions**: `rolling: true` extends cookie on each request (critical for iOS)
2. **Extended maxAge**: 30 days (up from 7 days) for better persistence
3. **Host-only cookies**: Default to no domain (works for Railway + custom domain)
4. **Canonical redirect**: All users redirected to `www.jiemastery.ai`
5. **Email normalization**: `trim().toLowerCase()` to handle iOS autofill quirks
6. **Optional domain cookie**: Set `SESSION_COOKIE_DOMAIN=.jiemastery.ai` if cross-subdomain needed

## Testing Checklist

### Manual Testing Steps

#### 1. iPhone Safari (Direct)
- [ ] Open Safari on iPhone
- [ ] Navigate to `https://www.jiemastery.ai`
- [ ] Clear site data (Settings > Safari > Clear History)
- [ ] Create new account or log in
- [ ] Verify redirect to dashboard
- [ ] Close browser completely
- [ ] Reopen and navigate to site
- [ ] Verify still logged in (session persists)

#### 2. iPhone Chrome (Direct)
- [ ] Open Chrome on iPhone
- [ ] Navigate to `https://www.jiemastery.ai`
- [ ] Log in with existing account
- [ ] Verify session persists after closing/reopening

#### 3. Facebook In-App Browser (iPhone)
- [ ] Share link in Facebook Messenger
- [ ] Tap link to open in Facebook browser
- [ ] Attempt to log in
- [ ] Note any issues (in-app browsers are most restrictive)

#### 4. Desktop Chrome
- [ ] Navigate to `https://www.jiemastery.ai`
- [ ] Log in normally
- [ ] Verify session persists

### Debug Endpoint

Use `/api/debug/auth` to verify cookie/session state:

```bash
# In development (no auth required)
curl https://localhost:5000/api/debug/auth

# In production (requires ADMIN_DEBUG_TOKEN env var)
curl -H "x-admin-debug-token: YOUR_TOKEN" https://www.jiemastery.ai/api/debug/auth
```

Expected response when logged in:
```json
{
  "hasCookieHeader": true,
  "hasConnectSid": true,
  "isAuthenticated": true,
  "sessionID": "abc123...",
  "isIOS": true/false,
  "isSafari": true/false
}
```

### Server Log Markers

When debugging login issues, look for these log markers in Railway logs:

1. `[LOGIN_ATTEMPT]` - Shows request details (host, proto, hasCookie, isIOS)
2. `[LOGIN_SUCCESS]` - Confirms successful authentication
3. `[LOGIN_FAIL]` - Shows failed login attempt
4. `[SET_COOKIE_SENT]` - Confirms Set-Cookie header was included in response
5. `[DEBUG_AUTH]` - Full diagnostic output when debug endpoint is called

### Common Issues and Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| Cookie not set | `secure: true` but no HTTPS | Verify `x-forwarded-proto: https` |
| Cookie rejected | Wrong domain | Verify using `.jiemastery.ai` domain |
| Session lost on reload | `sameSite: strict` | Use `sameSite: lax` |
| iOS rejects cookie | Third-party context | Ensure same-origin requests |

### Environment Variables for Production

Required for proper cookie behavior:
- `NODE_ENV=production` (enables secure cookies)
- `SESSION_SECRET` (required in production)

Optional debugging:
- `ADMIN_DEBUG_TOKEN` (enables `/api/debug/auth` in production)

## Cookie Configuration Summary

```typescript
{
  httpOnly: true,
  secure: true, // production only
  sameSite: 'lax',
  domain: undefined, // host-only (default), or set SESSION_COOKIE_DOMAIN env var
  path: '/',
  maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
}
```

### Environment Variables for Cookie Control

| Variable | Default | Description |
|----------|---------|-------------|
| `SESSION_COOKIE_DOMAIN` | undefined | Set to `.jiemastery.ai` for cross-subdomain cookies |
| `SESSION_COOKIE_SECURE` | auto (true in prod) | Override secure cookie flag |
| `SESSION_COOKIE_SAMESITE` | `lax` | Cookie SameSite policy |

## Frontend Requirements

All API calls that need authentication must include credentials:
```typescript
fetch('/api/user', { credentials: 'include' })
```

This is already configured in `client/src/lib/queryClient.ts`.
