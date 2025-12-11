# API Endpoint Testing Checklist

## Authentication Endpoints
- [x] POST /api/auth/signup - User registration
- [x] POST /api/auth/login - User login
- [x] POST /api/auth/logout - User logout
- [x] GET /api/user - Get current user

## Session/Transcript Endpoints
- [ ] GET /api/sessions/recent - Get last 10 sessions
- [ ] GET /api/sessions - Get all sessions with filters
- [ ] GET /api/sessions/:id - Get session with full transcript
- [ ] DELETE /api/sessions/:id - Delete session
- [ ] POST /api/sessions/start - Start new session
- [ ] PUT /api/sessions/:sessionId/end - End session

## Voice/Realtime Endpoints
- [ ] WebSocket /api/custom-voice-ws - Custom voice stack
- [ ] WebSocket /api/gemini-ws - Gemini Live API
- [ ] GET /api/voice-balance - Get voice minute balance

## Admin Endpoints
- [ ] GET /api/admin/users - Get all users (admin only)
- [ ] GET /api/admin/stats - Get platform stats
- [ ] GET /api/admin/subscriptions - Get subscription data
- [ ] GET /api/admin/documents - Get all documents
- [ ] GET /api/admin/analytics - Get analytics data
- [ ] GET /api/admin/logs - Get audit logs
- [ ] GET /api/admin/campaigns - Get marketing campaigns
- [ ] GET /api/admin/agents/stats - Get agent statistics
- [ ] POST /api/admin/users/:id/minutes - Add bonus minutes
- [ ] GET /api/admin/contacts/preview/:segment - Preview contacts
- [ ] GET /api/admin/contacts/export/:segment - Export contacts

## Dashboard Endpoints
- [ ] GET /api/dashboard/stats - Get dashboard statistics

## Broken Links to Fix
1. Admin dashboard navigation - Check AdminLayout vs NavigationHeader conflict
2. Session details page - Verify transcript display
3. Voice balance display - Verify API returns correct format
