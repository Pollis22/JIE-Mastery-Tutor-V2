# Step A: Conversational Coherence Gate

**Feature Flag**: `COHERENCE_GATE_ENABLED` (default: false)

## Purpose

The Coherence Gate filters out background speech that is semantically unrelated to the tutoring conversation. This addresses the issue of ambient speech bleed-through (TV, family conversations, radio, etc.) being transcribed as student input.

## How It Works

1. **Trigger**: After STT produces a final transcript (end_of_turn=true), before sending to Claude
2. **Topic Context**: Builds context from:
   - Last 3 student utterances
   - Last 1 tutor utterance
   - Current subject mode (Math, English, etc.)
3. **Similarity Check**: Calculates Jaccard similarity (token overlap) between new transcript and topic context
4. **Household Detection**: Checks for common household chatter indicators (TV, backyard, kitchen, etc.)
5. **Decision**:
   - If similarity < threshold AND has household indicators → REJECT
   - If similarity < threshold/2 AND transcript has >3 tokens → REJECT
   - If transcript contains educational terms → ALLOW (bypass)
   - Otherwise → ALLOW

## When It Rejects

The gate sends a clarification message via TTS:
> "I may have picked up background speech. If a TV, radio, or someone nearby is talking, please lower it. Then repeat your last question."

This is non-accusatory and guides the student to reduce interference.

## Configuration

| Env Variable | Default | Description |
|--------------|---------|-------------|
| `COHERENCE_GATE_ENABLED` | `false` | Enable/disable the gate |
| `COHERENCE_GATE_THRESHOLD` | `0.12` | Similarity threshold (0-1), below this = consider rejecting |
| `COHERENCE_GATE_WINDOW` | `3` | Number of student utterances in context window |

## Telemetry

When the gate rejects a transcript, it logs a structured JSON event:

```json
{
  "event": "coherence_gate_reject",
  "session_id": "abc123",
  "transcript_len": 45,
  "similarity_score": "0.0823",
  "threshold": "0.1200",
  "last_topic_keywords": ["algebra", "equation", "solve", "variable", "math"],
  "rejected_text": "slider that leads out to the backyard area...",
  "rejected_reason": "household_chatter_detected",
  "timestamp": "2026-01-24T12:34:56.789Z"
}
```

## Files Changed

- `server/services/coherence-gate.ts` - New service with all gate logic
- `server/routes/custom-voice-ws.ts` - Integration into transcript processing pipeline

## How to Enable

```bash
# In your environment or .env file
COHERENCE_GATE_ENABLED=true
COHERENCE_GATE_THRESHOLD=0.12  # Optional, adjust if needed
```

## Kill Switch

To disable instantly, set:
```bash
COHERENCE_GATE_ENABLED=false
```

This restores exact previous behavior - transcripts flow directly to Claude without the coherence check.

## What to Look For in Logs

1. **Rejections**: Search for `[CoherenceGate]` or `coherence_gate_reject`
2. **Similarity scores**: The `similarity_score` field shows how related the transcript was to the conversation
3. **Rejected reasons**: `household_chatter_detected` or `off_topic_low_similarity`

## Educational Terms Whitelist

The gate includes a whitelist of educational terms. If the transcript contains any of these, it bypasses the coherence check to avoid false positives on legitimate educational content:

- Math: algebra, geometry, calculus, equation, formula, solve, number, etc.
- English: grammar, vocabulary, sentence, paragraph, essay, etc.
- General: homework, test, quiz, study, learn, explain, help, etc.

## Household Chatter Indicators

The gate detects these common ambient speech patterns:

- Home areas: backyard, kitchen, bathroom, bedroom, garage, etc.
- Media: TV, television, remote, channel, volume, movie, game, etc.
- Food/drinks: dinner, lunch, pizza, coffee, snack, etc.
- Family interactions: mom, dad, honey, sweetie, coming, leaving, etc.
