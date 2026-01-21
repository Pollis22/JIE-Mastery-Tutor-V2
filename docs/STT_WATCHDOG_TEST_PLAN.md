# STT Watchdog & Silent-Audio Recovery Test Plan

## Overview
This document outlines the 5-step manual test plan for validating the STT watchdog and silent-audio recovery features implemented in January 2026.

## Feature Summary
- **STT Watchdog**: Detects when user is speaking (sending audio) but no transcript arrives for 6+ seconds
- **Silent-Audio Recovery**: Detects when mic is sending completely silent audio (all zeros)
- **Auto-Reconnect**: Attempts to reconnect AssemblyAI when stall is detected
- **Client UX**: Status banners for reconnecting, failed, and silent input states

## Test Steps

### Step 1: Normal Speech After Tutor Prompt
**Goal**: Verify normal operation when user speaks after tutor prompt

1. Start a voice session
2. Wait for tutor greeting
3. Say a complete sentence (e.g., "What is two plus two?")
4. **Expected**: 
   - Speech detected, transcript appears within 1-2 seconds
   - Claude responds with answer
   - No watchdog triggers

### Step 2: Simulate Silent Input
**Goal**: Verify silent-audio detection and client notification

1. Start a voice session
2. Mute your microphone OR cover it completely
3. Wait for ~1 second of silence
4. **Expected**:
   - Console log: `[STT-Watchdog] 🔇 Silent input detected`
   - Client receives `mic_status: silent_input`
   - Mic status indicator shows "silent" state
5. Unmute microphone and speak normally
6. **Expected**: Mic status returns to "listening" or "hearing_you"

### Step 3: Speak but STT Produces No Transcript (Stall Simulation)
**Goal**: Verify watchdog detects stall and attempts reconnect

**Note**: This is harder to test without intentionally breaking STT. Options:
- Use very soft/unintelligible speech that STT ignores
- Temporarily disconnect network mid-speech
- Speak in an unsupported language that produces no transcript

1. Start a voice session
2. Begin speaking continuously but quietly/unintelligibly
3. Continue for 6+ seconds without getting a transcript
4. **Expected**:
   - Console log: `[STT-Watchdog] ⚠️ Stall detected`
   - Client receives `stt_status: stalled`
   - Client shows "Having trouble hearing you — reconnecting…" banner
   - Watchdog attempts AssemblyAI reconnect
   - Console log: `[STT-Watchdog] 🔄 Attempting AssemblyAI reconnect...`
5. If reconnect succeeds:
   - Console log: `[STT-Watchdog] ✅ Reconnected`
   - Client receives `stt_status: reconnected`
   - Client shows "Reconnected" briefly
6. Speak normally after reconnect
7. **Expected**: Session resumes normally, transcripts work

### Step 4: Force STT Disconnect
**Goal**: Verify session survives STT failure without ending

1. Start a voice session
2. Temporarily disable network or simulate STT failure
3. Wait for watchdog to detect stall and attempt reconnect
4. If reconnect fails:
   - Client receives `stt_status: failed`
   - Client shows "Tap to reconnect" button
5. **Expected**: Session remains open (not finalized)
6. Re-enable network
7. Click reconnect button
8. **Expected**: Session reconnects and resumes

### Step 5: Verify Session Recovery Without Ending
**Goal**: Confirm session persists through all recovery scenarios

1. Complete Steps 3-4 (stall and reconnect scenarios)
2. After each recovery, verify:
   - Session ID remains the same (check console logs)
   - Conversation history preserved
   - Minutes continue to be tracked correctly
3. Say "goodbye" to end session normally
4. **Expected**: Session ends cleanly with proper summary

## Log Verification

### Server Logs to Check
```
[STT-Watchdog] ⚠️ Stall detected {sessionId, timeSinceAudioMs, timeSinceFinalTranscriptMs, silentBufferCount}
[STT-Watchdog] 🔄 Attempting AssemblyAI reconnect...
[STT-Watchdog] ✅ Reconnected: <sessionId>
[STT-Watchdog] ❌ Reconnect failed: <error>
[STT-Watchdog] 🔇 Silent input detected (consecutive silent buffers: 25)
```

### Client Console Logs to Check
```
[Custom Voice] 🔍 STT status: stalled
[Custom Voice] ⚠️ STT stalled - reconnecting...
[Custom Voice] ✅ STT reconnected
[Custom Voice] ❌ STT reconnect failed
[Custom Voice] 🎤 Mic status: silent_input
[Custom Voice] 🔇 Mic is picking up silent audio
```

## Configuration

### Thresholds (Server)
- `STT_WATCHDOG_INTERVAL_MS`: 2000ms (check every 2 seconds)
- `STT_STALL_THRESHOLD_MS`: 6000ms (6 seconds without transcript = stalled)
- `AUDIO_RECENT_THRESHOLD_MS`: 2000ms (audio within 2s = user speaking)
- `WATCHDOG_LOG_INTERVAL_MS`: 5000ms (rate limit logs to once per 5s)
- `SILENT_BUFFER_THRESHOLD`: 25 (consecutive silent buffers before notification)

### Important Guard Conditions
- Watchdog only activates AFTER the first transcript is received
- This prevents false positives when student pauses before their first utterance
- If `lastFinalTranscriptAt === 0`, watchdog skips the stall check entirely

### New MicStatus Values (Client)
- `reconnecting`: STT connection being re-established
- `error`: STT connection failed
- `silent`: Mic is receiving silent/empty audio

## Files Modified
- `server/routes/custom-voice-ws.ts`: SessionState, watchdog timer, silent buffer tracking
- `client/src/hooks/use-custom-voice.ts`: stt_status/mic_status handlers, MicStatus type
