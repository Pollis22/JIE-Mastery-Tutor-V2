# Voice UX Features Documentation

This document describes the voice user experience improvements for the JIE Mastery AI Tutor.

## Executive Summary

The voice turn-taking system was completely redesigned to create a natural, patient, and interruption-friendly conversational experience suitable for children, nervous speakers, ESL users, and adults alike.

### Problem Statement

Initial testing revealed three core issues:
1. The tutor occasionally cut off students mid-thought
2. Users were sometimes unable to interrupt the tutor while it was speaking
3. Occasional trailing responses occurred after a clear goodbye

These issues were amplified for younger learners and slower or quieter speakers.

### Root Causes Identified

The issues were traced to:
- Reliance on **absolute audio thresholds** for barge-in detection
- **Silence-only end-of-turn logic** that ignored semantic context
- **Lack of session-level cancellation** when conversations ended

These approaches work in ideal conditions but fail under real-world variability in speech patterns, volume, accents, and devices.

### Key Fixes Implemented

1. **Adaptive Barge-In Detection**: Rolling microphone noise baseline with relative energy detection; duck-then-confirm phase temporarily lowers tutor audio before stopping playback.

2. **Bounded Patience Logic**: Turn-taking evaluates whether a student's thought is complete, not just whether silence occurred.

3. **Reading Mode Patience**: Additional patience when sessions involve reading aloud, accommodating slow readers and ESL learners.

4. **Adaptive Session-Level Patience**: Dynamic patience adjustments based on hesitation markers and interaction patterns, within strict caps.

5. **Reliable Goodbye Shutdown**: Hard stop cancels audio, transcription, and pending responses when session ends.

### Why This Worked

These changes shifted the system from rigid timing rules to **human-centered conversational signals**. By separating barge-in from silence detection, layering semantic understanding over audio cues, and bounding all adaptations with safe limits, the tutor now behaves consistently across environments and age groups.

### Outcome

Post-implementation testing across K-2, 3-5, 6-8, 9-12, and adult sessions showed:
- Smooth turn-taking
- Reliable interruption capability
- No echo or self-response issues
- Markedly more natural conversational flow

This represents a **production-ready voice interaction model** suitable for JIE Mastery's educational mission.

---

## Feature Flags

All features are behind feature flags for safe rollout:

| Flag | Default | Description |
|------|---------|-------------|
| `BARGE_IN_ADAPTIVE_ENABLED` | `false` | Adaptive barge-in with rolling baseline |
| `READING_MODE_PATIENCE_ENABLED` | `false` | Extra patience during reading activities |
| `ADAPTIVE_PATIENCE_ENABLED` | `false` | Per-session adaptive patience scoring |
| `SESSION_GOODBYE_HARD_STOP_ENABLED` | `true` | Immediate session end on goodbye |
| `TURN_POLICY_K2_ENABLED` | `false` | K-2 very patient turn policy |
| `ECHO_GUARD_ENABLED` | `false` | Echo filtering for tutor self-response |

## A) Adaptive Barge-In

Makes barge-in (interrupting the tutor) reliable for quiet, nervous, slow, and accented speakers.

### How It Works

1. **Rolling Baseline**: Tracks mic noise floor using median of recent RMS samples (1500ms window)
2. **Adaptive Threshold**: `threshold = baseline * adaptiveRatio`
3. **Duck-Then-Confirm Flow**:
   - When suspected barge-in triggers during tutor playback
   - Immediately duck audio to 25% volume (-12dB)
   - Start confirmation timer (320ms)
   - If speech sustains for `minSpeechMs`, confirm barge-in and stop playback
   - Otherwise, restore volume and continue

### Per-Grade-Band Configuration

| Grade Band | Adaptive Ratio | Min Speech (ms) | RMS Threshold | Peak Threshold |
|------------|---------------|-----------------|---------------|----------------|
| K-2 | 2.2 | 140 | 0.08 | 0.15 |
| Grades 3-5 | 2.4 | 160 | 0.08 | 0.15 |
| Grades 6-8 | 2.6 | 170 | 0.08 | 0.15 |
| Grades 9-12 | 2.8 | 180 | 0.08 | 0.15 |
| College/Adult | 3.0 | 190 | 0.08 | 0.15 |

### Structured Logging

```json
{
  "event": "barge_in_eval",
  "sessionId": "abc12345",
  "gradeBand": "K2",
  "tutorPlaying": true,
  "activityMode": "default",
  "rms": "0.0850",
  "peak": "0.1200",
  "baseline": "0.0250",
  "adaptiveRatio": 2.2,
  "adaptiveTriggered": true,
  "absoluteTriggered": true,
  "duckApplied": true,
  "confirmedInterrupt": true,
  "stoppedPlayback": true,
  "reason": "adaptive_and_absolute"
}
```

## B) Reading Mode Patience

Extra patience when the activity mode is set to "reading" (pronunciation practice, reading aloud).

### Configuration

| Parameter | Value | Description |
|-----------|-------|-------------|
| Min Silence Bonus | +250ms | Added to min end-of-turn silence |
| Max Silence Bonus | +800ms | Added to max turn silence |
| Min Silence Cap | 1200ms | Hard cap for min silence |
| Max Silence Cap | 6000ms | Hard cap for max silence |
| Stall Prompt | "Want a moment to finish, or would you like help sounding it out?" | |

### Setting Activity Mode

The activity mode can be set:
1. Via WebSocket `session_config` message from server
2. Via `setActivityMode(state, 'reading')` in turn policy

## C) Adaptive Patience Per Session

Automatically adjusts patience based on learner behavior signals.

### Patience Score (0.0 - 1.0)

Updated on each final transcript using exponential moving average:
```
patienceScore = 0.7 * oldScore + 0.3 * signalScore
```

### Signal Detection

| Signal Type | Patterns | Weight |
|-------------|----------|--------|
| Hesitation Markers | um, uh, wait, let me think, i think, maybe, hmm | +1 |
| Continuation Endings | and, so, because, then, but (at end) | +1 |
| No Terminal Punctuation | (sentence doesn't end with . ! ?) | +0.5 |

### Patience Adjustments

| Parameter | Formula | Cap (Default) | Cap (Reading) |
|-----------|---------|---------------|---------------|
| Min Silence Bonus | `patienceScore * 250ms` | 1000ms | 1200ms |
| Max Silence Bonus | `patienceScore * 900ms` | 5000ms | 6000ms |
| Grace Bonus | `patienceScore * 120ms` | 400ms | 400ms |

### Structured Logging

```json
{
  "event": "adaptive_patience",
  "sessionId": "abc12345",
  "gradeBand": "G3-5",
  "activityMode": "default",
  "patienceScore": "0.450",
  "signalScore": "0.500",
  "hesitationCount": 3,
  "continuationCount": 1,
  "interruptAttempts": 0,
  "appliedMinSilenceMs": 112,
  "appliedMaxSilenceMs": 405,
  "appliedGraceMs": 54
}
```

## D) Goodbye Hard Stop

Cleanly ends sessions when user says goodbye.

### Detected Phrases

```
goodbye, good bye, bye, bye bye, see you, see ya,
talk later, gotta go, i'm done, im done, end session,
that's all, thats all, thanks bye, thank you bye,
adios, au revoir, ciao, hasta luego, sayonara
```

### Hard Stop Behavior (Default: Enabled)

When `SESSION_GOODBYE_HARD_STOP_ENABLED=true`:
1. Immediately sends `interrupt` message with `stopMic: true, stopPlayback: true`
2. Cancels any pending LLM/TTS jobs
3. Sends goodbye transcript (text only, no audio)
4. Ends session after 500ms delay

### Soft Stop Behavior

When `SESSION_GOODBYE_HARD_STOP_ENABLED=false`:
1. Sends goodbye transcript
2. Generates and plays goodbye audio
3. Ends session after 4000ms delay (for audio to play)

## File Locations

| Feature | Server Files | Client Files |
|---------|-------------|--------------|
| Adaptive Barge-In | `server/services/adaptive-barge-in.ts` | `client/src/config/voice-constants.ts`, `client/src/hooks/use-custom-voice.ts` |
| Reading Mode | `server/services/turn-policy.ts` | - |
| Adaptive Patience | `server/services/turn-policy.ts` | - |
| Goodbye Hard Stop | `server/routes/custom-voice-ws.ts` | `client/src/hooks/use-custom-voice.ts` |
| Echo Guard | `server/services/echo-guard.ts` | `client/src/hooks/use-custom-voice.ts` |
| K-2 Turn Policy | `server/services/turn-policy.ts` | - |

## Environment Variables

Add these to enable features:

```bash
# Adaptive barge-in for quiet/nervous speakers
BARGE_IN_ADAPTIVE_ENABLED=true

# Extra patience during reading activities
READING_MODE_PATIENCE_ENABLED=true

# Auto-tune patience based on learner signals
ADAPTIVE_PATIENCE_ENABLED=true

# Immediate session end on goodbye (default: true)
SESSION_GOODBYE_HARD_STOP_ENABLED=true

# K-2 very patient turn policy
TURN_POLICY_K2_ENABLED=true

# Echo filtering for tutor self-response
ECHO_GUARD_ENABLED=true
```

## Testing Scenarios

### Adaptive Barge-In
1. Quiet barge-in during tutor speech → Should duck then stop within ~300ms after confirmation
2. Loud barge-in → Should stop faster
3. No barge-in when silent → No false triggers

### Reading Mode
1. Set `activity_mode=reading` → Slower pacing, fewer cutoffs
2. Stall prompt should appear after extended silence

### Adaptive Patience
1. Hesitant user (many "um", "wait") → `patienceScore` increases
2. Confident user (complete sentences) → `patienceScore` stays low

### Goodbye Hard Stop
1. Say "goodbye" → Session ends quickly with no extra tutor output
