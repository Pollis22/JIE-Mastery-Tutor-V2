# K-2 Turn Policy: Very Patient Turn-Taking

## Overview

The K-2 Turn Policy implements a "Very Patient" turn-taking approach for young learners (grades K-2, ages 5-8) that prevents the AI tutor from interrupting while students think aloud.

## Feature Flag

### Environment Variable
```bash
TURN_POLICY_K2_ENABLED=true  # Enable K2 policy (default: false)
```

### Session Override
The policy can be overridden at session level via `turnPolicyK2Override` in session state.
Session override takes precedence over environment variable.

## Configuration

### K2 Preset Parameters
| Parameter | Value | Description |
|-----------|-------|-------------|
| `end_of_turn_confidence_threshold` | 0.75 | Require 75% confidence before ending turn |
| `min_end_of_turn_silence_when_confident_ms` | 900 | Wait 900ms of silence even when confident |
| `max_turn_silence_ms` | 4500 | Allow up to 4.5s thinking pauses |
| `post_eot_grace_ms` | 350 | 350ms grace period after end-of-turn |

### Default Preset (Non-K2)
| Parameter | Value | Description |
|-----------|-------|-------------|
| `end_of_turn_confidence_threshold` | 0.65 | Require 65% confidence |
| `min_end_of_turn_silence_when_confident_ms` | 1000 | Wait 1s of silence |
| `max_turn_silence_ms` | 5000 | Allow up to 5s thinking pauses |
| `post_eot_grace_ms` | 0 | No grace period |

## Behavior

### Hesitation Detection
The system detects when students are still thinking by analyzing sentence endings:

**Hesitation Patterns** (last word):
- `um`, `umm`, `uh`, `wait`, `hold on`, `let me think`, `i think`, `maybe`, `hmm`

**Continuation Patterns** (last word):
- `and`, `so`, `because`, `then`, `but`

### Turn Flow

1. **Normal Turn**: Student speaks → end_of_turn=true → Fire Claude immediately
2. **Hesitation Detected**: Student speaks with hesitation → Wait for:
   - Another end_of_turn=true, OR
   - `max_turn_silence_ms` elapsed (stall escape)

### Stall Escape Hatch
If `max_turn_silence_ms` elapses with no new audio:
- Claude receives the student's original transcript PLUS a gentle follow-up prompt
- Format: `"{student_transcript} (after pause) Do you want more time to think, or would you like some help?"`
- Preserves student context while prompting for continuation
- Maintains Socratic posture (doesn't dump answers)

### Response Style Constraints (K-2 Only)
When K2 policy is active, responses are constrained to:
- Maximum 1-2 short sentences
- Simple vocabulary appropriate for ages 5-8
- Always end with a question
- No multi-step explanations in one response
- Maintain Socratic method

## Instrumentation

### Structured Logging
Each turn evaluation is logged in consistent format:

```json
{
  "grade_band": "K-2",
  "k2_policy_enabled": true,
  "eot_confidence": 0.85,
  "silence_duration_ms": 1200,
  "hesitation_guard_triggered": false,
  "stall_escape_triggered": false,
  "time_to_first_audio_ms": 450,
  "transcript_preview": "I think the answer is..."
}
```

## Validation Metrics

### Target Metrics (Initial)
- ≥30% reduction in premature interruptions
- <500ms increase in median response time
- <5% stall_escape_triggered rate
- Track session abandonment delta during flagged rollout

### Rollback Criteria (within 48 hours)
If any of these occur, disable by setting `TURN_POLICY_K2_ENABLED=false`:
- >20% increase in session abandonment rate
- >50% increase in median `time_to_first_audio_ms`
- >3 P0 bugs

## Reconnection Handling

When the AssemblyAI WebSocket connection drops and reconnects:
1. **State preservation**: Guard flags, guarded transcript, and timestamps are preserved
2. **Timer cleanup**: Pending stall escape timer is cleared before reconnect
3. **Time-accurate re-arming**: Remaining time is calculated and timer is re-armed
4. **Immediate fire**: If time already expired during disconnect, stall escape fires immediately

### Implementation Details
- `savedLastEotTimestamp`: Preserved for accurate silence measurement
- `savedGuardedTranscript`: Preserved for stall escape message
- `savedStallTimerStartedAt`: Used to calculate remaining time
- `remainingMs = max_turn_silence_ms - (now - savedStallTimerStartedAt)`

### Known Limitations (v1.0)
For the initial feature-flagged rollout, some edge cases may not be perfectly handled:
- **Multi-reconnect with rapid flapping**: Multiple rapid reconnects may extend the stall window slightly
- **Empty transcript hesitation**: If hesitation detected on an empty/whisper transcript, stall timer may not re-arm
- **checkStallEscape state issues**: Fallback prompt fires if checkStallEscape returns null

These limitations are acceptable for initial testing behind the feature flag. They will be addressed based on real-world metrics and usage patterns during the gradual rollout.

## Files

- `server/services/turn-policy.ts` - Core module with policy logic
- `server/routes/custom-voice-ws.ts` - Integration with voice pipeline
- `docs/K2_TURN_POLICY.md` - This documentation

## Testing

To test the K2 policy:
1. Set `TURN_POLICY_K2_ENABLED=true` in environment
2. Start a voice session with a K-2 grade student profile
3. Speak with hesitation patterns (e.g., "I think... um... maybe...")
4. Observe logs for `[TurnPolicy]` entries
5. Verify tutor waits for complete thought before responding

### Expected Behavior
- With flag OFF: Normal behavior (no changes)
- With flag ON and grade K-2: Hesitation detection active
- With flag ON and other grades: Normal behavior (policy only applies to K-2)
