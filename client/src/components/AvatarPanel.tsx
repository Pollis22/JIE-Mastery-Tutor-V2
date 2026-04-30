// =============================================================================
// JIE Mastery — AvatarPanel
// -----------------------------------------------------------------------------
// Renders a Simli WebRTC video for the active persona, lip-syncing to the
// existing ElevenLabs PCM stream via the avatar audio bus.
//
// Failure mode is the whole point of this component: ANY error (no API key,
// SDK fails to load, WebRTC drops, network too slow, etc.) → it returns the
// orb fallback automatically. The voice session never breaks.
//
// Layout: head-and-shoulders square video, sized 320–400 px depending on
// container, with the existing speaking/listening/thinking pill below it
// (rendered by the parent so we don't duplicate state).
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import { AIOrb, OrbState } from './AIOrb';
import { TutorState } from './TutorAvatar';
import { CanonicalPersona, AvatarGateResult } from '@/lib/avatar/avatar-config-client';
import {
  SimliClientWrapper,
  SimliStatus,
} from '@/lib/avatar/simli-client';
import {
  subscribeAvatarAudio,
  base64PcmToInt16,
  AvatarAudioEvent,
} from '@/lib/avatar/avatar-audio-bus';

interface AvatarPanelProps {
  persona: CanonicalPersona;
  /** Resolved gate from shouldRenderAvatar — only the ok:true variant is passed in. */
  gate: Extract<AvatarGateResult, { ok: true }>;
  state: TutorState;
  /** Size in px of the square video container. */
  size?: number;
  /** Render the orb fallback when things go wrong. */
  ageGroupForOrb: '6-8' | '9-12' | 'College';
  /** Optional voice-only toggle handler (parent collapses panel back to orb). */
  onVoiceOnlyClick?: () => void;
}

function toOrbState(state: TutorState): OrbState {
  switch (state) {
    case 'speaking': return 'speaking';
    case 'listening': return 'listening';
    case 'thinking': return 'thinking';
    default: return 'idle';
  }
}

export function AvatarPanel({
  persona,
  gate,
  state,
  size = 320,
  ageGroupForOrb,
  onVoiceOnlyClick,
}: AvatarPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const clientRef = useRef<SimliClientWrapper | null>(null);
  const [status, setStatus] = useState<SimliStatus>('idle');
  const [hasFailedTerminally, setHasFailedTerminally] = useState(false);

  // Per-session minute counter for cost telemetry (Section 9 of brief).
  const sessionStartRef = useRef<number | null>(null);

  // ---- 1. Open the Simli WebRTC session on mount ----------------------------
  useEffect(() => {
    let cancelled = false;
    const videoEl = videoRef.current;
    const audioEl = audioRef.current;
    if (!videoEl || !audioEl) {
      // Refs not yet attached — React guarantees this won't happen post-mount,
      // but we guard so a stray remount during teardown can't NPE.
      setHasFailedTerminally(true);
      return;
    }
    const wrapper = new SimliClientWrapper({
      apiKey: gate.apiKey,
      faceID: gate.faceId,
      videoEl,
      audioEl,
      handleSilence: true,
      onStatusChange: (s) => {
        if (cancelled) return;
        setStatus(s);
        if (s === 'ready' && sessionStartRef.current === null) {
          sessionStartRef.current = Date.now();
        }
      },
      onFailed: () => {
        if (cancelled) return;
        setHasFailedTerminally(true);
      },
    });
    clientRef.current = wrapper;

    wrapper.connect().then((ok) => {
      if (!ok && !cancelled) setHasFailedTerminally(true);
    });

    return () => {
      cancelled = true;
      // Cost telemetry log — visible in dev tools console (Section 9 + 11.3).
      if (sessionStartRef.current !== null) {
        const minutes = (Date.now() - sessionStartRef.current) / 60000;
        // eslint-disable-next-line no-console
        console.log(
          `[AvatarPanel] session_minutes=${minutes.toFixed(2)} persona=${persona} character=${gate.characterName}`,
        );
      }
      try {
        wrapper.close();
      } catch {
        // best-effort
      }
      clientRef.current = null;
    };
    // gate.faceId / apiKey / persona changing should rebuild the session.
  }, [gate.apiKey, gate.faceId, gate.characterName, persona]);

  // ---- 2. Forward audio chunks from the voice pipeline ----------------------
  useEffect(() => {
    const unsubscribe = subscribeAvatarAudio((e: AvatarAudioEvent) => {
      const c = clientRef.current;
      if (!c) return;
      if (e.kind === 'chunk') {
        c.sendPcm16(e.pcm16);
      } else if (e.kind === 'cancel') {
        c.clearBuffer();
      }
      // 'speaking_start' / 'speaking_end' are informational; Simli's
      // handleSilence=true keeps the avatar idle-animated between turns.
    });
    return unsubscribe;
  }, []);

  // ---- 3. Render --------------------------------------------------------------
  // Terminal failure → seamless orb fallback (acceptance criterion #5).
  if (hasFailedTerminally) {
    return <AIOrb state={toOrbState(state)} size={Math.min(140, size)} ageGroup={ageGroupForOrb} />;
  }

  const isConnecting = status === 'idle' || status === 'connecting';

  return (
    <div
      className="relative rounded-xl overflow-hidden bg-black/5 shadow-md"
      style={{ width: size, height: size }}
      data-testid="avatar-panel"
      data-persona={persona}
      data-status={status}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={false}
        className="absolute inset-0 w-full h-full object-cover"
      />
      <audio ref={audioRef} autoPlay />

      {/* Connecting shimmer — show orb behind video until first frame arrives. */}
      {isConnecting && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <AIOrb state={toOrbState(state)} size={Math.min(140, size - 40)} ageGroup={ageGroupForOrb} />
        </div>
      )}

      {/* Voice-only collapse toggle — top-right (Section 8). */}
      {onVoiceOnlyClick && (
        <button
          type="button"
          onClick={onVoiceOnlyClick}
          className="absolute top-2 right-2 rounded-full bg-black/50 hover:bg-black/70 text-white text-xs px-2 py-1 backdrop-blur-sm transition"
          aria-label="Switch to voice-only orb"
          data-testid="avatar-voice-only-toggle"
        >
          Voice only
        </button>
      )}
    </div>
  );
}
