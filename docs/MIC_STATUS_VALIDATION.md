# MicStatusPill Validation Checklist

## Feature Overview
The MicStatusPill provides persistent visual feedback during voice sessions, showing microphone and voice state. It uses server-authoritative WebSocket events with hysteresis timing to prevent UI flicker.

## States and Expected Behavior

| State | Icon | Color | When Shown |
|-------|------|-------|------------|
| `mic_off` | MicOff | Gray | Session inactive or mic disabled |
| `listening` | Mic | Green | Mic active, waiting for speech |
| `hearing_you` | Volume2 | Blue + animated ring | User speech detected (after 300ms) |
| `ignoring_noise` | AlertCircle | Yellow | Background noise detected (after 800ms) |
| `tutor_speaking` | Volume2 | Purple | TTS playback active |
| `processing` | Loader2 | Orange + spinning | AI processing response |

## Hysteresis Timing

- **ENTER_HEARING_YOU_MS**: 300ms delay before showing "Hearing You" (prevents flicker from transient sounds)
- **EXIT_HEARING_YOU_MS**: 600ms delay before leaving "Hearing You" (prevents flicker during pauses)
- **ENTER_IGNORING_NOISE_MS**: 800ms delay before showing "Filtering Noise" (only for sustained noise)
- **EXIT_IGNORING_NOISE_MS**: 400ms delay before returning to "Listening" from noise state

## Validation Tests

### Basic State Transitions

- [ ] **Session Start**: Pill shows "Listening" after connection establishes and mic is enabled
- [ ] **User Speaks**: After 300ms of continuous speech, pill transitions to "Hearing You"
- [ ] **User Stops Speaking**: After 600ms of silence, pill returns to "Listening"
- [ ] **Tutor Responds**: Pill shows "Processing" during AI thinking, then "JIE Speaking" during TTS
- [ ] **TTS Complete**: Pill returns to "Listening" when tutor finishes speaking
- [ ] **Session End**: Pill shows "Mic Off" after disconnection

### Noise Handling

- [ ] **Background Noise**: Sustained noise (800ms+) shows "Filtering Noise" state
- [ ] **Noise Stops**: After 400ms, returns to "Listening"
- [ ] **Speech Over Noise**: Speech detection overrides noise state

### Mode Switching

- [ ] **Mic Toggle Off**: Turning off mic shows "Mic Off" state
- [ ] **Mic Toggle On**: Re-enabling mic shows "Listening" state
- [ ] **Text Mode**: In text-only mode, pill shows "Mic Off"

### Edge Cases

- [ ] **Rapid Speech Bursts**: Short speech bursts (<300ms) don't cause state change
- [ ] **Interrupted Speech**: Pauses during speaking (<600ms) maintain "Hearing You"
- [ ] **WebSocket Disconnect**: Pill resets to "Mic Off" on connection loss
- [ ] **Reconnection**: Pill restores to "Listening" after successful reconnect

### Accessibility

- [ ] **ARIA Labels**: Each state has descriptive aria-label (e.g., "Microphone is currently listening")
- [ ] **Role**: Component has role="status"
- [ ] **Live Region**: aria-live="polite" for screen reader announcements
- [ ] **High Contrast**: Colors are distinguishable in both light and dark mode
- [ ] **Focus**: Not focusable (informational only)

### Mobile

- [ ] **Responsive Size**: Pill scales appropriately on mobile screens
- [ ] **Touch**: No touch interactions (display only)
- [ ] **Orientation**: Works in portrait and landscape

## WebSocket Events

Server emits these events to drive mic status:

| Event | Payload | Triggers State |
|-------|---------|----------------|
| `speech_detected` | `{ type: 'speech_detected' }` | `hearing_you` (after hysteresis) |
| `speech_ended` | `{ type: 'speech_ended' }` | `listening` (after hysteresis) |
| `noise_ignored` | `{ type: 'noise_ignored' }` | `ignoring_noise` (after hysteresis) |
| `tts_playing` | `{ type: 'tts_playing' }` | `tutor_speaking` |
| `tts_finished` | `{ type: 'tts_finished' }` | `listening` |
| `tutor_thinking` | Via `ready` event | `processing` |
| `duck` | `{ type: 'duck' }` | May affect playback state |

## Test IDs

- `mic-status-pill`: Main container
- Test by state: Check className for `mic-off`, `listening`, etc.

## Files

- **Component**: `client/src/components/MicStatusPill.tsx`
- **Hook Integration**: `client/src/hooks/use-custom-voice.ts`
- **Server Events**: `server/routes/custom-voice-ws.ts`
- **Usage**: `client/src/components/realtime-voice-host.tsx`

---

## Voice Pipeline Hardening Features (Step 5)

### Mic Track Watchdog

**Feature Flag**: `VITE_MIC_WATCHDOG_ENABLED` (default: false)

Proactive microphone track health monitoring that catches degraded tracks before the `onended` event fires.

- **Check Interval**: Every 5 seconds (`VOICE_TIMING.MIC_WATCHDOG_INTERVAL_MS`)
- **Health Checks**: `readyState === 'live'`, `enabled === true`
- **Action**: Triggers `attemptMicRecovery()` if track is degraded
- **Telemetry**: Logs JSON event `mic_watchdog_check` on issues

**Files**:
- `client/src/config/voice-constants.ts` (timing config)
- `client/src/hooks/use-custom-voice.ts` (implementation in `setupAudioTrackListener`)

### College Response-Depth Tweak

Allows longer, more detailed AI responses for adult learners.

**Grade-Based Max Tokens**:
| Grade Level | Max Tokens | Description |
|-------------|------------|-------------|
| K-2 | 120 | Very short for young learners |
| 3-5 | 150 | Standard short |
| 6-8 | 175 | Slightly longer for middle school |
| 9-12 | 200 | More detail for high school |
| College/Adult | 300 | Fuller explanations for adults |

**Usage**: `getMaxTokensForGrade(gradeLevel)` returns appropriate token limit

**Files**:
- `server/llm/systemPrompt.ts` (config and function)
- `server/services/ai-service.ts` (uses grade-based tokens)
- `server/routes/custom-voice-ws.ts` (passes `state.ageGroup` to AI service)
