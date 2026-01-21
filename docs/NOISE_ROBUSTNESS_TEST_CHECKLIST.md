# Noise Robustness Test Checklist

## Overview
This checklist validates the noise-robust transcript validation system implemented in the voice pipeline.

## Environment Variables
- `NOISY_ROOM_MODE=1` - Enable stricter thresholds for noisy environments (default: off)

## Test Scenarios

### 1. TV/Background Audio On
| Test | Expected Behavior | Pass? |
|------|-------------------|-------|
| TV audio only, no user speech | No ghost turns triggered, no Claude responses | [ ] |
| TV audio with clear user speech ("What is 2 + 2?") | User speech detected, Claude responds | [ ] |
| TV dialog similar to tutor speech | Echo guard rejects as echo | [ ] |

### 2. Fan/AC/Ambient Noise
| Test | Expected Behavior | Pass? |
|------|-------------------|-------|
| Fan running, user silent | No ghost turns, no barge-in | [ ] |
| Fan + user speaks clearly (5+ words) | Speech processed normally | [ ] |
| Fan + user speaks 1-2 words | May be rejected if low confidence | [ ] |

### 3. User Silent (Microphone Active)
| Test | Expected Behavior | Pass? |
|------|-------------------|-------|
| Mic active, user completely silent | No transcript processing | [ ] |
| Random room noise (coughs, door) | Rejected as too short/low confidence | [ ] |
| Filler only ("um", "uh", "hmm") | Rejected as filler_only | [ ] |

### 4. User Speaks Normally
| Test | Expected Behavior | Pass? |
|------|-------------------|-------|
| Clear 5+ word sentence | Processed, Claude responds | [ ] |
| Short 1-2 word answer ("yes", "no") | Processed if high confidence (>=0.55) | [ ] |
| Low confidence transcript | Rejected if <0.55 AND <6 words | [ ] |

### 5. Barge-In During Tutor Speech
| Test | Expected Behavior | Pass? |
|------|-------------------|-------|
| Tutor speaking, user says 1-2 words | Duck audio, no full interrupt | [ ] |
| Tutor speaking, user says 3+ clear words | Full interrupt if confidence >=0.65 | [ ] |
| Tutor speaking, background noise | No interrupt, audio continues | [ ] |

### 6. NOISY_ROOM_MODE=1 Tests
Set `NOISY_ROOM_MODE=1` in environment and restart server.

| Test | Expected Behavior | Pass? |
|------|-------------------|-------|
| User speaks 3 words | Rejected (needs 4+ in noisy mode) | [ ] |
| User speaks 5+ words with moderate confidence | Processed | [ ] |
| Barge-in with 3 words | Duck only (needs 5+ in noisy mode) | [ ] |
| Barge-in with 5+ words | Interrupt if confidence >=0.75 | [ ] |

## Log Verification
Check server logs for these rejection patterns:

```
[transcript_rejected] {"reason":"filler_only",...}
[transcript_rejected] {"reason":"low_confidence_0.42",...}
[transcript_rejected] {"reason":"too_short_2_words",...}
[GhostTurn] 🚫 Ignored transcript...
[BargeIn] 🔉 DUCK...
[EchoGuard] 🔇 Rejected echo...
```

## Thresholds Reference

### Normal Mode (NOISY_ROOM_MODE off)
| Parameter | Value |
|-----------|-------|
| Min word count | 1 |
| Min confidence | 0.55 |
| Confidence bypass word count | 6 |
| Barge-in min words | 3 |
| Barge-in min confidence | 0.65 |
| Barge-in high confidence threshold | 0.75 |

### Noisy Room Mode (NOISY_ROOM_MODE=1)
| Parameter | Value |
|-----------|-------|
| Min word count | 4 |
| Min confidence | 0.65 |
| Confidence bypass word count | 8 |
| Barge-in min words | 5 |
| Barge-in min confidence | 0.75 |
| Barge-in high confidence threshold | 0.85 |

## Files Modified
- `server/services/noise-floor.ts` - Enhanced validateTranscript(), validateTranscriptForBargeIn()
- `server/routes/custom-voice-ws.ts` - Pass confidence to validation, echo guard integration
