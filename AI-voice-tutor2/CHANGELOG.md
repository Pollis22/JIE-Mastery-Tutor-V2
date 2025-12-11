# Changelog

## [Unreleased] - 2025-12-08

### API Cleanup and Refactoring
- **Implemented Missing Endpoints**:
  - `PATCH /api/user/profile`: Added endpoint to update first name, last name, and email.
  - `DELETE /api/user/account`: Added endpoint to permanently delete user account and Stripe data.
  - `GET /api/user/export-data`: Added endpoint to export user profile, sessions, and documents.
  - `POST /api/subscription/cancel`: Added endpoint to cancel Stripe subscription at period end.
- **Fixed Legacy Voice Endpoints**:
  - `GET /api/voice/live-token` in `server/routes.ts` to support legacy voice components.
  -  `POST /api/voice/generate-response` in `server/routes.ts` to support legacy voice components.
  - Restored functionality in `use-voice.tsx` to use these endpoints instead of hardcoded mocks.
- **Removed Duplicate Routes**:
  - Removed duplicate `POST /api/voice/narrate` route.
  - Removed duplicate `GET /api/billing/history` route.
  - Removed duplicate `PUT /api/settings` route.

### Notes
- User session management has moved to a more robust implementation in `server/routes/sessions.ts` which supports filtering and pagination.
