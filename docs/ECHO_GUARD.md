# Echo Guard - Preventing Tutor Self-Response

## Overview

The Echo Guard system prevents the tutor from "responding to itself" when STT captures tutor audio (speaker-to-mic echo) and misclassifies it as student speech.

## Problem

Without Echo Guard, the following sequence can occur:
1. Tutor speaks: "What is 2 + 2?"
2. STT captures tutor's TTS playback from speakers
3. STT misclassifies it as student speech
4. Tutor "responds" to its own question, creating ghost turns

## Solution

Echo Guard provides three layers of protection:

### 1. WebRTC Audio Constraints

Client-side audio capture uses browser's built-in echo cancellation:
```javascript
{
  echoCancellation: true,   // Essential for speaker-to-mic feedback
  noiseSuppression: true,   // Filters ambient noise and echo artifacts
  autoGainControl: true,    // Prevents mic from boosting echo
}
```

The actual applied settings are logged for debugging.

### 2. Echo Tail Guard

A configurable window after TTS playback ends where VAD-based barge-in is blocked:
- **Default duration**: 700ms (`ECHO_TAIL_GUARD_MS`)
- **Purpose**: Prevents detecting echo tail as speech onset
- **Logging**: `echo_tail_guard_start` and `echo_tail_guard_end` events

### 3. Echo Similarity Filter

Compares incoming transcripts against a rolling buffer of recent tutor utterances:
- **Buffer size**: Last 3 tutor utterances (`maxTutorUtterances`)
- **Similarity threshold**: 0.85 (85% match) (`ECHO_SIMILARITY_THRESHOLD`)
- **Time window**: 2500ms after playback ends (`ECHO_WINDOW_MS`)
- **Algorithm**: Uses the higher of Jaccard similarity or Levenshtein ratio

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ECHO_GUARD_ENABLED` | `false` | Master feature flag |
| `ECHO_TAIL_GUARD_MS` | `700` | Post-playback guard window |
| `ECHO_SIMILARITY_THRESHOLD` | `0.85` | Text similarity threshold |
| `ECHO_WINDOW_MS` | `2500` | Echo detection time window |
| `ECHO_GUARD_DEBUG` | `false` | Enable detailed logging |

### Enabling Echo Guard

Set the environment variable:
```bash
ECHO_GUARD_ENABLED=true
```

For debugging:
```bash
ECHO_GUARD_ENABLED=true
ECHO_GUARD_DEBUG=true
```

## Implementation Details

### Files

- `server/services/echo-guard.ts` - Core echo guard service
- `server/routes/custom-voice-ws.ts` - Integration with voice pipeline
- `client/src/hooks/use-custom-voice.ts` - WebRTC constraints
- `server/services/__tests__/echo-guard.test.ts` - Unit tests

### State Tracking

The echo guard maintains per-session state:
```typescript
interface EchoGuardState {
  lastTutorUtterances: TutorUtterance[];  // Rolling buffer
  tutorPlaybackActive: boolean;            // TTS playing
  lastPlaybackEndMs: number;               // When TTS ended
  echoTailGuardActive: boolean;            // Guard window active
  echoTailGuardEndMs: number;              // When guard expires
}
```

### Similarity Calculation

Text is normalized before comparison:
1. Convert to lowercase
2. Strip punctuation
3. Collapse whitespace
4. Compare using Jaccard (token overlap) and Levenshtein (edit distance)
5. Use the higher score for more lenient matching

## Logging

When `ECHO_GUARD_DEBUG=true`, the following is logged:

```
[EchoGuard] playback_start - tutorPlaybackActive=true
[EchoGuard] Recorded tutor utterance: "What is 2 plus 2..."
[EchoGuard] playback_end - tutorPlaybackActive=false
[EchoGuard] echo_tail_guard_start: 700ms window
[EchoGuard] Comparing transcript vs utterance | similarity=0.923
[EchoGuard] echo_filtered: similarity=0.923, deltaMs=1200
```

## Testing

Run the unit tests:
```bash
npm test -- --testPathPattern=echo-guard
```

### Test Cases

- **Case A**: Identical transcript within 1s → Filtered
- **Case B**: Different transcript within 1s → Passes
- **Case C**: Identical transcript after 5s → Passes (outside window)

## Success Criteria

- No ghost student turns when user is silent
- No tutor self-interruptions triggered by its own TTS
- Real student barge-in still works within ~300ms after echo-tail window

## Rollback

If issues occur, disable by setting:
```bash
ECHO_GUARD_ENABLED=false
```

The system will revert to previous behavior without echo protection.
