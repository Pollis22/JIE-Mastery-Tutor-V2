# Avatar runtime (dev-avatar branch)

This folder holds the viseme-PNG avatar pipeline that replaced the original
Simli WebRTC implementation. The system is intentionally small and offline:
no streaming video, no per-minute network calls, just PNG swapping driven by
local audio-frequency analysis.

## Components

```
                    ┌─────────────────────────────────┐
                    │  use-custom-voice.ts (forbidden)│
                    │   ElevenLabs PCM16 16kHz mono   │
                    └───────────────┬─────────────────┘
                                    │ dispatchAvatarAudio({ kind:'chunk', pcm16 })
                                    ▼
              ┌────────────────────────────────────────────┐
              │ avatar-audio-bus.ts (forbidden)            │
              │  pub/sub, never throws, no-op when no subs │
              └───────────────┬────────────────────────────┘
                              │ AvatarAudioEvent
                              ▼
              ┌────────────────────────────────────────────┐
              │ viseme-client.ts                           │
              │  subscribes to bus, owns lifecycle         │
              └───────────────┬────────────────────────────┘
                              │ pcm chunks + reset/cancel
                              ▼
              ┌────────────────────────────────────────────┐
              │ viseme-controller.ts                       │
              │  wawa-lipsync Lipsync instance             │
              │  AudioBufferSourceNode → analyser (silent) │
              │  setInterval polls processAudio()          │
              │  emits VisemeSymbol ('rest' | 'A'…'I')     │
              └───────────────┬────────────────────────────┘
                              │ symbol updates
                              ▼
              ┌────────────────────────────────────────────┐
              │ VisemeAvatar.tsx                           │
              │  base PNG + overlay PNG, swap on update    │
              │  CSS-only blink + breathing                │
              └────────────────────────────────────────────┘

       (PNG URLs come from persona-asset-registry.ts via import.meta.glob)
```

## Why we don't call `Lipsync.connectAudio()`

`wawa-lipsync` ships with `connectAudio(HTMLMediaElement)` and
`connectMicrophone()`. Both internally do
`analyser.connect(audioContext.destination)` — which would create a second
audible audio path on top of the existing speaker pipeline. The brief
forbids this (DevTools must show exactly one audible audio path).

Instead, `viseme-controller.ts` instantiates `Lipsync`, then reaches in for
the private `audioContext` + `analyser`. PCM chunks are wrapped in
`AudioBuffer`s, played through `AudioBufferSourceNode`s that connect ONLY
to the analyser. The analyser never reaches `destination`, so there is no
duplicate audio.

## Effective avatar visibility

```
master_flag (VITE_AVATAR_ENABLED)
  && per_persona_flag (e.g. VITE_AVATAR_ENABLED_COLLEGE)
  && network_ok (not 2g / 3g / slow-2g)            ← shouldRenderAvatar()
  && asset_folder_present (PNGs in registry)        ← AvatarPanel
  && user_preference (jie:avatar:enabled localStorage, default true)
```

Any failure path renders the orb. No errors, no crashes. `shouldRenderAvatar`
runs in `TutorAvatar.tsx`; `AvatarPanel.tsx` adds the asset + user-pref
gates downstream.

## Idle animation rules

CSS `@keyframes` only — no `requestAnimationFrame` loops. Two layers:

- `.jie-avatar-breathe` — 3 s vertical sway, infinite.
- `.jie-avatar-blink-on` — opacity pulse with per-mount randomized
  `animation-duration` (base ±20%) and `animation-delay` so multiple
  avatars in the DOM never blink in lockstep.

`prefers-reduced-motion` and `VITE_AVATAR_IDLE_MOTION=0` both disable the
animations.

## Storage

Only `localStorage` — key `jie:avatar:enabled`. No `sessionStorage`,
`IndexedDB`, cookies, or server-side persistence. Cross-tab updates use the
native `storage` event; same-tab updates broadcast a custom
`jie:avatar:enabled-changed` event.

## Files

| File | Role |
|------|------|
| `avatar-audio-bus.ts` | Pub/sub bridge from voice pipeline → avatar layer. Never edit. |
| `avatar-config-client.ts` | Reads `VITE_AVATAR_*` env vars, runs the master/persona/network gate. |
| `viseme-client.ts` | Wraps the controller, subscribes to the audio bus, exposes status. |
| `viseme-controller.ts` | Owns the wawa-lipsync instance and the polling timer. |
| `persona-asset-registry.ts` | Maps each persona to its 10 PNG URLs (1 base + 9 visemes). |

## Testing locally

```bash
# .env.local (or .env)
AVATAR_ENABLED=true
VITE_AVATAR_ENABLED=true
AVATAR_ENABLED_COLLEGE=true
VITE_AVATAR_ENABLED_COLLEGE=true
```

Then open the tutor with the College persona — Doctor Morgan's portrait
should render and the mouth should swap as the tutor speaks. Flip the
"Focus View" toggle to fall back to the orb instantly without disturbing
audio. Confirm exactly one audible track in DevTools → Application → Audio.
