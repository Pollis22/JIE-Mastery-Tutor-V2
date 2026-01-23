# D-ID Avatar Integration (API-Only Mode)

## Overview
The D-ID avatar uses the official D-ID Realtime Agents Streams API with WebRTC.
This is the only supported integration mode - iframe embed has been permanently removed.

## Environment Variables Required

| Variable | Required | Description |
|----------|----------|-------------|
| `DID_API_KEY` | Yes | D-ID API key (Basic auth format) |
| `DID_AGENT_ID` | No | Agent ID (default: v2_agt_0KyN0XA6) |

## Files

| File | Purpose |
|------|---------|
| `server/lib/didClient.ts` | D-ID API client helper |
| `server/routes/did-api-routes.ts` | WebRTC stream endpoints |
| `client/src/components/DidAgentWebRTC.tsx` | WebRTC React component with video |

## API Endpoints

All endpoints are PUBLIC (registered before auth middleware):

- `GET /api/did-api/status` - Configuration and connectivity diagnostics
- `POST /api/did-api/stream/create` - Create WebRTC stream
- `POST /api/did-api/stream/:streamId/sdp` - Send SDP answer
- `POST /api/did-api/stream/:streamId/ice` - Send ICE candidate
- `POST /api/did-api/stream/:streamId/speak` - Make avatar speak

## WebRTC Flow

1. User clicks "Start Avatar" button (required for autoplay policies)
2. Client calls `POST /api/did-api/stream/create`
3. Server creates stream via D-ID API, returns streamId, sessionId, offerSdp, iceServers
4. Client creates RTCPeerConnection with provided iceServers
5. Client sets remote description with offerSdp
6. Client creates answer, sets local description
7. Client sends answer via `POST /api/did-api/stream/:streamId/sdp`
8. Client sends ICE candidates via `POST /api/did-api/stream/:streamId/ice`
9. When video track arrives, attach to `<video>` element
10. Call `POST /api/did-api/stream/:streamId/speak` to make avatar speak

## Manual Verification Checklist

### API Status Check
```bash
curl http://localhost:5000/api/did-api/status | jq .

# Expected response:
{
  "ok": true,
  "configured": true,
  "didApiKeyPresent": true,
  "agentIdUsed": "v2_agt_0KyN0XA6",
  "integrationMode": "api",
  "canResolveApiDomain": true,
  "outboundHttpOk": true
}
```

### Desktop Test
1. Navigate to `/auth`
2. Click "Start Avatar" button
3. Check console for `[D-ID WebRTC] Video stream attached ✓`
4. Avatar video should display (not blank)
5. Click "Test Speak" button

### Mobile/Safari Test
1. Open site on iPhone Safari
2. Click "Start Avatar" button (required for autoplay policy)
3. Avatar should connect and display video
4. Test speak button should work

## Security Notes

- All D-ID API keys are kept server-side only
- Client never sees secrets
- WebRTC streams use secure ICE servers from D-ID
- No iframe/embed mode - no client keys exposed

## Removed (Not Supported)

The following have been permanently removed:
- Iframe embed mode (agents.d-id.com)
- DID_CLIENT_KEY environment variable dependency
- DID_MODE feature flag
- DidAgentEmbed component
- DidAgentSwitch component
- /api/did/* embed session endpoints
