# D-ID Avatar Integration

## Overview
The D-ID avatar supports two integration modes:
- **Embed mode** (default): Uses iframe embed from agents.d-id.com
- **API mode**: Uses the official D-ID Realtime Agents Streams API with WebRTC

## Feature Flag
Set `DID_MODE` environment variable to switch modes:
```
DID_MODE=embed   # (default) Uses iframe embed
DID_MODE=api     # Uses WebRTC streaming via D-ID API
```

## How to Revert Instantly
If the API integration causes issues:
```bash
DID_MODE=embed   # Revert to iframe embed mode
```
Then restart the application.

## Environment Variables Required
| Variable | Required | Description |
|----------|----------|-------------|
| `DID_API_KEY` | For API mode | D-ID API key (Basic auth) |
| `DID_CLIENT_KEY` | For embed mode | D-ID client key for iframe embed |
| `DID_AGENT_ID` | Optional | Agent ID (default: v2_agt_0KyN0XA6) |
| `DID_MODE` | Optional | Integration mode: `api` or `embed` (default: embed) |

## Files Added/Modified
| File | Purpose |
|------|---------|
| `server/lib/didClient.ts` | D-ID API client helper |
| `server/routes/did-api-routes.ts` | WebRTC stream endpoints |
| `server/routes/did-routes.ts` | Embed mode session endpoints |
| `client/src/components/DidAgentWebRTC.tsx` | WebRTC React component |
| `client/src/components/DidAgentSwitch.tsx` | Mode switcher component |
| `client/src/components/DidAgentEmbed.tsx` | Iframe embed component |

## API Endpoints

### Embed Mode (agents.d-id.com)
- `GET /api/did/session` - Returns embed URL with client key
- `GET /api/did/health` - DNS/HTTP diagnostics for agents.d-id.com

### API Mode (api.d-id.com)
- `GET /api/did-api/status` - Configuration and connectivity status
- `POST /api/did-api/stream/create` - Create WebRTC stream
- `POST /api/did-api/stream/:streamId/sdp` - Send SDP answer
- `POST /api/did-api/stream/:streamId/ice` - Send ICE candidate
- `POST /api/did-api/stream/:streamId/speak` - Make avatar speak

## Manual Verification Checklist

### Desktop Preview
1. Set `DID_MODE=api` and restart
2. Navigate to `/auth`
3. Open browser DevTools (F12)
4. Check Console for:
   - `[D-ID WebRTC] Starting WebRTC connection...`
   - `[D-ID WebRTC] Stream created: ...`
   - `[D-ID WebRTC] Track received: video`
   - `[D-ID WebRTC] Video stream attached ✓`
5. Confirm NO calls to agents.d-id.com

### iPhone Safari
1. Open site on iPhone Safari
2. Click "Start Avatar" button (required for autoplay policy)
3. Avatar should connect and display video
4. Test "Speak test" button

### API Status Check
```bash
# Check API connectivity
curl http://localhost:5000/api/did-api/status

# Expected response:
{
  "ok": true,
  "configured": true,
  "mode": "api",
  "canResolveApiDomain": true,
  "outboundHttpOk": true
}
```

## WebRTC Flow (API Mode)
1. Client clicks "Start Avatar" button
2. Server calls `POST /agents/{agentId}/streams` to create stream
3. Server returns streamId, sessionId, offerSdp, iceServers
4. Client creates RTCPeerConnection with iceServers
5. Client sets remote description with offerSdp
6. Client creates answer, sets local description
7. Client sends answer via `POST /stream/:streamId/sdp`
8. Client sends ICE candidates via `POST /stream/:streamId/ice`
9. When video track arrives, attach to video element
10. Call `POST /stream/:streamId/speak` to make avatar speak

## Troubleshooting

### API Mode Issues
- Check `DID_API_KEY` is set correctly
- Verify api.d-id.com is reachable: `curl -I https://api.d-id.com`
- Check `/api/did-api/status` for diagnostics

### Embed Mode Issues
- Check `DID_CLIENT_KEY` is set correctly
- The domain agents.d-id.com may be blocked by some networks
- Use API mode as fallback

## Security Notes
- All D-ID API keys are kept server-side
- Client never sees secrets
- WebRTC streams use secure ICE servers
