# D-ID Avatar Integration

## Overview
The D-ID avatar embed uses server-side session management via `/api/did/*` endpoints. This keeps the DID_CLIENT_KEY secret on the server and provides proper error handling.

## Feature Flag
Set `DID_INTEGRATION_MODE` environment variable:
- `api` (default): Server-side session management
- `embed`: Legacy client-side URL construction (for quick revert if needed)

## How to Revert Instantly
If the API integration causes issues, set:
```
DID_INTEGRATION_MODE=embed
```
Then restart the application.

## Files Modified
- `server/routes/did-routes.ts` - Session and health endpoints
- `server/routes.ts` - Route registration (before auth middleware)
- `client/src/components/DidAgentEmbed.tsx` - Frontend component
- `client/src/lib/ws-url.ts` - WebSocket URL builder utility

## Verification Checklist

### Desktop Preview
1. Navigate to `/auth` (landing page)
2. Open browser DevTools (F12)
3. Check Console for:
   - `[D-ID] Fetching session from server...` (session request)
   - `[D-ID] Session received: v2_agt_...` (successful response)
   - `[D-ID] Iframe load event fired ✓` (iframe loaded)
   - NO `401 Unauthorized` errors for `/api/did/*` endpoints
   - The `wss://localhost:undefined` errors are from Vite HMR (not our app code)
4. The D-ID avatar embed should appear in the left column

### iPhone Safari
1. Open the site on iPhone Safari
2. Navigate to the landing page
3. The D-ID avatar should load (may take 5-8 seconds on mobile)
4. If timeout occurs, "Retry" and "Open in new tab" buttons appear

### Logged Out State (Public Landing Page)
1. Clear cookies / use incognito mode
2. Navigate to `/auth`
3. The D-ID avatar should load WITHOUT requiring login
4. No 401 errors for D-ID endpoints

### API Endpoint Testing
```bash
# Session endpoint (should return ok:true)
curl http://localhost:5000/api/did/session

# Health endpoint (shows DNS/HTTP/config status)
curl http://localhost:5000/api/did/health

# Debug endpoint (dev only)
curl http://localhost:5000/api/did/debug
```

### Expected Console Output
```
[D-ID] Integration mode: api
[D-ID] Session request received
[D-ID] Session generated for agent: v2_agt_0KyN0XA6
```

### Expected Health Response
```json
{
  "ok": true,
  "dnsOk": true,
  "httpOk": true,
  "configured": true,
  "agentId": "v2_agt_0KyN0XA6",
  "integrationMode": "api",
  "timestamp": "..."
}
```

## Known Issues

### wss://localhost:undefined Error
This error appears in the browser console:
```
SyntaxError: Failed to construct 'WebSocket': The URL 'wss://localhost:undefined/?token=...' is invalid.
```
This is from **Vite HMR client** (`@vite/client:536`), NOT from our application code. It occurs in the Replit proxy environment and does not affect functionality.

### D-ID Service Unreachable
If you see `dnsOk: false` and `httpOk: false` in health checks, this means the D-ID service is unreachable from the server's network. This is an external network issue, not a code problem.

## Security Notes
- DID_CLIENT_KEY is never exposed to the browser
- The `/api/did/session` endpoint is public (no auth required)
- Consider adding rate limiting in production to prevent abuse
- The `/api/did/debug` endpoint is disabled in production
