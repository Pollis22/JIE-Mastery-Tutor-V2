# API Reference - JIE Mastery AI Tutor

**Version:** 2.0  
**Base URL**: `https://your-domain.repl.co`  
**Last Updated:** November 19, 2025

---

## Table of Contents

1. [Authentication](#authentication)
2. [User Management](#user-management)
3. [Session Management](#session-management)
4. [Document Management](#document-management)
5. [Payment & Subscription](#payment--subscription)
6. [Admin Endpoints](#admin-endpoints)
7. [WebSocket API](#websocket-api)
8. [Error Responses](#error-responses)

---

## Authentication

All authenticated endpoints require a valid session cookie. Unauthenticated requests return `401 Unauthorized`.

### POST `/api/register`

Create a new user account.

**Request Body**:
```json
{
  "username": "john_doe",
  "password": "secure123",
  "email": "john@example.com",
  "studentName": "John",
  "gradeLevel": "grades-6-8"
}
```

**Response** (201):
```json
{
  "message": "Registration successful. Please check your email to verify your account.",
  "userId": 42
}
```

**Validation Rules**:
- `username`: 3-30 chars, alphanumeric + underscore
- `password`: Min 6 chars
- `email`: Valid email format
- `gradeLevel`: One of `k-2`, `grades-3-5`, `grades-6-8`, `grades-9-12`, `college-adult`

---

### POST `/api/login`

Authenticate user and create session.

**Request Body**:
```json
{
  "username": "john_doe",
  "password": "secure123"
}
```

**Response** (200):
```json
{
  "id": 42,
  "username": "john_doe",
  "email": "john@example.com",
  "role": "user",
  "subscriptionStatus": "active",
  "subscriptionMinutes": 120,
  "purchasedMinutes": 60
}
```

**Session Cookie**: Set automatically (httpOnly, secure in production)

---

### POST `/api/logout`

Destroy session and clear cookie.

**Response** (200):
```json
{
  "message": "Logged out successfully"
}
```

---

### GET `/api/verify-email/:token`

Verify user email with token.

**URL Parameters**:
- `token`: Verification token from email

**Response** (200):
```json
{
  "message": "Email verified successfully. You can now log in."
}
```

**Error** (400):
```json
{
  "error": "Invalid or expired verification token"
}
```

---

## User Management

### GET `/api/user`

Get current user profile.

**Auth**: Required

**Response** (200):
```json
{
  "id": 42,
  "username": "john_doe",
  "email": "john@example.com",
  "emailVerified": true,
  "role": "user",
  "studentName": "John",
  "gradeLevel": "grades-6-8",
  "preferredLanguage": "en-US",
  "subscriptionStatus": "active",
  "subscriptionMinutes": 120,
  "purchasedMinutes": 60,
  "subscriptionTier": "standard",
  "subscriptionStartDate": "2025-11-01T00:00:00.000Z",
  "subscriptionEndDate": "2025-12-01T00:00:00.000Z",
  "createdAt": "2025-10-15T12:00:00.000Z"
}
```

---

### PUT `/api/user/profile`

Update user profile.

**Auth**: Required

**Request Body** (all fields optional):
```json
{
  "studentName": "John Jr.",
  "gradeLevel": "grades-9-12",
  "preferredLanguage": "es-ES"
}
```

**Response** (200):
```json
{
  "message": "Profile updated successfully",
  "user": { ... }
}
```

---

### GET `/api/user/minutes`

Get current minute balance (used for cross-device sync).

**Auth**: Required

**Response** (200):
```json
{
  "subscriptionMinutes": 120,
  "purchasedMinutes": 60,
  "totalMinutes": 180
}
```

**Polling**: Frontend polls this endpoint every 30 seconds

---

## Session Management

### POST `/api/sessions/start`

Create a new learning session.

**Auth**: Required

**Request Body**:
```json
{
  "studentName": "John",
  "subject": "math",
  "ageGroup": "grades-6-8",
  "language": "en-US"
}
```

**Response** (200):
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Session started successfully"
}
```

**Note**: Actual session initialization happens via WebSocket

---

### POST `/api/sessions/end`

End a session (HTTP fallback for WebSocket close frame).

**Auth**: Required

**Request Body**:
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response** (200):
```json
{
  "message": "Session ended successfully",
  "minutesUsed": 5,
  "transcriptLength": 24
}
```

**Use Case**: Railway TLS proxy drops WebSocket close frames

---

### GET `/api/sessions`

Get user's session history.

**Auth**: Required

**Query Parameters**:
- `limit`: Max number of results (default: 20)
- `offset`: Pagination offset (default: 0)

**Response** (200):
```json
{
  "sessions": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "studentName": "John",
      "subject": "math",
      "ageGroup": "grades-6-8",
      "language": "en-US",
      "status": "ended",
      "totalMessages": 24,
      "minutesUsed": 5,
      "startedAt": "2025-11-19T10:00:00.000Z",
      "endedAt": "2025-11-19T10:05:00.000Z"
    }
  ],
  "total": 42
}
```

---

### GET `/api/sessions/:id`

Get specific session details (including transcript).

**Auth**: Required

**URL Parameters**:
- `id`: Session ID (UUID)

**Response** (200):
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "studentName": "John",
  "subject": "math",
  "ageGroup": "grades-6-8",
  "status": "ended",
  "transcript": [
    {
      "speaker": "student",
      "text": "What is 5 plus 3?",
      "timestamp": "2025-11-19T10:00:00.000Z"
    },
    {
      "speaker": "tutor",
      "text": "Great question! What do you think the answer might be?",
      "timestamp": "2025-11-19T10:00:02.000Z"
    }
  ],
  "minutesUsed": 5,
  "startedAt": "2025-11-19T10:00:00.000Z",
  "endedAt": "2025-11-19T10:05:00.000Z"
}
```

---

## Document Management

### POST `/api/documents/upload`

Upload a document for RAG-based learning.

**Auth**: Required

**Content-Type**: `multipart/form-data`

**Form Data**:
- `file`: File to upload (PDF, DOCX, image, etc.)
- `studentId`: User ID (number)
- `sessionId`: Session ID (UUID, optional)

**Response** (200):
```json
{
  "id": 123,
  "fileName": "homework.pdf",
  "fileType": "application/pdf",
  "fileSize": 245678,
  "processingStatus": "pending",
  "uploadedAt": "2025-11-19T10:00:00.000Z"
}
```

**Supported Formats**:
- PDF: `.pdf`
- Word: `.docx`
- Images: `.jpg`, `.png` (OCR via Tesseract)
- Excel: `.xlsx`
- Text: `.txt`
- XML: `.xml`

**Max File Size**: 10MB

---

### GET `/api/documents`

Get user's uploaded documents.

**Auth**: Required

**Response** (200):
```json
{
  "documents": [
    {
      "id": 123,
      "fileName": "homework.pdf",
      "fileType": "application/pdf",
      "fileSize": 245678,
      "processingStatus": "completed",
      "isProcessed": true,
      "uploadedAt": "2025-11-19T10:00:00.000Z",
      "expiresAt": "2026-05-19T10:00:00.000Z"
    }
  ]
}
```

---

### DELETE `/api/documents/:id`

Delete a document.

**Auth**: Required

**URL Parameters**:
- `id`: Document ID (number)

**Response** (200):
```json
{
  "message": "Document deleted successfully"
}
```

---

## Payment & Subscription

### POST `/api/stripe/create-checkout-session`

Create Stripe checkout session for subscription or top-up.

**Auth**: Required

**Request Body**:
```json
{
  "priceId": "price_1SGoW9IN6CxqbuMH6duyd7Cs",
  "mode": "subscription"
}
```

**Modes**:
- `subscription`: Monthly subscription
- `payment`: One-time top-up

**Response** (200):
```json
{
  "sessionId": "cs_test_abc123...",
  "url": "https://checkout.stripe.com/c/pay/cs_test_abc123..."
}
```

**Frontend**: Redirect to `url` for checkout

---

### POST `/api/stripe/create-portal-session`

Create Stripe customer portal session (manage subscription).

**Auth**: Required

**Response** (200):
```json
{
  "url": "https://billing.stripe.com/p/session/abc123..."
}
```

---

### POST `/api/stripe/webhook`

Stripe webhook handler (internal use only).

**Auth**: Stripe signature verification

**Events Handled**:
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `checkout.session.completed`

**Security**: Verifies `stripe-signature` header

---

## Admin Endpoints

All admin endpoints require `role: 'admin'`.

### GET `/api/admin/users`

Get all users (paginated).

**Auth**: Admin only

**Query Parameters**:
- `page`: Page number (default: 1)
- `limit`: Results per page (default: 50)
- `search`: Search by username/email

**Response** (200):
```json
{
  "users": [
    {
      "id": 42,
      "username": "john_doe",
      "email": "john@example.com",
      "role": "user",
      "subscriptionStatus": "active",
      "subscriptionMinutes": 120,
      "createdAt": "2025-10-15T12:00:00.000Z"
    }
  ],
  "total": 1234,
  "page": 1,
  "totalPages": 25
}
```

---

### GET `/api/admin/users/:id`

Get user details.

**Auth**: Admin only

**Response** (200):
```json
{
  "user": { ... },
  "sessions": [ ... ],
  "documents": [ ... ]
}
```

---

### PUT `/api/admin/users/:id`

Update user (including minutes).

**Auth**: Admin only

**Request Body**:
```json
{
  "subscriptionMinutes": 200,
  "purchasedMinutes": 100,
  "subscriptionStatus": "active"
}
```

**Response** (200):
```json
{
  "message": "User updated successfully",
  "user": { ... }
}
```

---

### DELETE `/api/admin/users/:id`

Delete user and all associated data.

**Auth**: Admin only

**Response** (200):
```json
{
  "message": "User deleted successfully"
}
```

**Cascade Deletes**:
- Sessions
- Documents
- Embeddings
- Quiz attempts

---

### GET `/api/admin/analytics`

Get platform analytics.

**Auth**: Admin only

**Response** (200):
```json
{
  "totalUsers": 1234,
  "activeSubscriptions": 456,
  "totalSessions": 5678,
  "totalMinutesUsed": 12345,
  "revenue": {
    "monthly": 4567.89,
    "total": 23456.78
  }
}
```

---

### GET `/api/admin/logs`

Get admin action logs.

**Auth**: Admin only

**Query Parameters**:
- `limit`: Max results (default: 100)
- `offset`: Pagination offset

**Response** (200):
```json
{
  "logs": [
    {
      "id": 789,
      "adminId": 1,
      "action": "update_user",
      "targetUserId": 42,
      "metadata": {
        "field": "subscriptionMinutes",
        "oldValue": 100,
        "newValue": 200
      },
      "createdAt": "2025-11-19T10:00:00.000Z"
    }
  ]
}
```

---

## WebSocket API

### Connection: `wss://your-domain.repl.co/api/custom-voice-ws`

**Authentication**: Session cookie required

**Protocol**: Binary frames (base64-encoded audio) + JSON messages

---

### Client → Server Messages

#### `init` - Initialize Session

```json
{
  "type": "init",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": 42,
  "studentName": "John",
  "ageGroup": "grades-6-8",
  "systemInstruction": "Custom instructions...",
  "documents": [123, 456]
}
```

**Response**: `ready` message

---

#### `audio` - Send Audio Data

```json
{
  "type": "audio",
  "data": "base64-encoded-pcm16-audio"
}
```

**Format**: PCM16, 16kHz, mono

---

#### `text_message` - Send Text Message

```json
{
  "type": "text_message",
  "message": "What is 5 + 3?"
}
```

**Use Case**: Hybrid mode (text input during voice session)

---

#### `mode_update` - Change Communication Mode

```json
{
  "type": "mode_update",
  "tutorAudio": true,
  "studentMic": false
}
```

**Modes**:
- `{tutorAudio: true, studentMic: true}`: Voice mode
- `{tutorAudio: true, studentMic: false}`: Hybrid mode
- `{tutorAudio: false, studentMic: false}`: Text-only mode

---

#### `document_uploaded` - Notify New Document

```json
{
  "type": "document_uploaded",
  "documentId": 123,
  "fileName": "homework.pdf"
}
```

**Effect**: Document embeddings added to RAG context

---

#### `end_session` - End Session

```json
{
  "type": "end_session"
}
```

**Response**: `session_ended` message

---

### Server → Client Messages

#### `ready` - Session Ready

```json
{
  "type": "ready"
}
```

**Client Action**: Start microphone if voice mode

---

#### `transcript` - Transcript Entry

```json
{
  "type": "transcript",
  "speaker": "tutor",
  "text": "Great question! What do you think?"
}
```

**Speakers**: `student`, `tutor`

---

#### `audio` - Audio Response

```json
{
  "type": "audio",
  "data": "base64-encoded-pcm16-audio",
  "mimeType": "audio/pcm;rate=16000"
}
```

**Client Action**: Decode base64, play PCM16 audio

---

#### `interrupt` - Stop Tutor Audio

```json
{
  "type": "interrupt"
}
```

**Trigger**: Student started speaking while tutor is talking

---

#### `mode_updated` - Mode Sync Confirmation

```json
{
  "type": "mode_updated",
  "tutorAudio": true,
  "studentMic": false
}
```

---

#### `session_ended` - Session Ended

```json
{
  "type": "session_ended",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "reason": "normal",
  "transcriptLength": 24
}
```

**Reasons**:
- `normal`: User ended session
- `disconnect`: Connection lost
- `error`: Server error
- `violation`: Content moderation violation
- `inactivity_timeout`: 5 minutes of silence

---

#### `error` - Error Message

```json
{
  "type": "error",
  "error": "Error message here"
}
```

---

## Error Responses

### Standard Error Format

```json
{
  "error": "Human-readable error message"
}
```

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (not logged in) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 429 | Too Many Requests (rate limited) |
| 500 | Internal Server Error |

### Common Errors

#### Insufficient Minutes

```json
{
  "error": "Insufficient minutes. Please purchase more minutes or upgrade your subscription."
}
```

**HTTP**: 403

---

#### Session Not Found

```json
{
  "error": "Session not found"
}
```

**HTTP**: 404

---

#### Rate Limit Exceeded

```json
{
  "error": "Too many requests. Please try again later."
}
```

**HTTP**: 429

**WebSocket**: Connection closed with code 1008

---

#### Validation Error

```json
{
  "error": "Validation failed",
  "details": {
    "username": "Username must be at least 3 characters",
    "password": "Password is required"
  }
}
```

**HTTP**: 400

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| WebSocket upgrades | 20 per minute per IP |
| Concurrent WebSocket connections | 5 per IP |
| API requests | No explicit limit (reasonable use) |
| Document uploads | 10MB per file |

---

## Testing with cURL

### Register User

```bash
curl -X POST https://your-domain.repl.co/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test_user",
    "password": "test123",
    "email": "test@example.com",
    "studentName": "Test Student",
    "gradeLevel": "grades-6-8"
  }'
```

---

### Login

```bash
curl -X POST https://your-domain.repl.co/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test_user",
    "password": "test123"
  }' \
  -c cookies.txt
```

---

### Get User Profile

```bash
curl https://your-domain.repl.co/api/user \
  -b cookies.txt
```

---

### Start Session

```bash
curl -X POST https://your-domain.repl.co/api/sessions/start \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "studentName": "Test Student",
    "subject": "math",
    "ageGroup": "grades-6-8",
    "language": "en-US"
  }'
```

---

**Document Version**: 1.0  
**Last Updated**: November 19, 2025
