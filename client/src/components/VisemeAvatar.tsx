// =============================================================================
// JIE Mastery — VisemeAvatar
// -----------------------------------------------------------------------------
// Img-stack renderer. Two layers:
//   1. Base PNG (always loaded, never swapped) — provides eyes, hair, body.
//   2. Active viseme PNG layered on top, swapped via React state when the
//      VisemeController emits a new symbol. mode='replace' means the viseme
//      PNG is a full-face frame; we just toggle which one is on top.
//
// Idle motion is CSS-only per brief constraint:
//   - Eye blink: 4-6s interval (configurable via VITE_AVATAR_BLINK_INTERVAL_MS),
//     ±20% jitter via a per-mount randomized animation-delay.
//   - Idle breathing: ~3s vertical sway, runs forever.
//   No requestAnimationFrame loops — only @keyframes.
// =============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { CanonicalPersona } from '@/lib/avatar/avatar-config-client';
import {
  PersonaAssets,
  getPersonaAssets,
} from '@/lib/avatar/persona-asset-registry';
import { VisemeClient } from '@/lib/avatar/viseme-client';
import { VisemeSymbol } from '@/lib/avatar/viseme-controller';
import { AvatarToggle } from './AvatarToggle';

interface VisemeAvatarProps {
  persona: CanonicalPersona;
  /** Container size in px. Square. */
  size?: number;
  /** Hide idle motion (used for prefers-reduced-motion). */
  reducedMotion?: boolean;
}

const DEFAULT_BLINK_MS = 4500;
const DEFAULT_IDLE_MOTION_ENABLED = true;
const DEFAULT_INTERVAL_MS = 50;
const DEFAULT_REST_HOLD_MS = 120;

function readEnvInt(key: string, fallback: number): number {
  const raw = (import.meta.env as Record<string, string | undefined>)[key];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function readEnvFlag(key: string, fallback: boolean): boolean {
  const raw = (import.meta.env as Record<string, string | undefined>)[key];
  if (raw === undefined) return fallback;
  return raw === '1' || raw === 'true';
}

export function VisemeAvatar({
  persona,
  size = 320,
  reducedMotion = false,
}: VisemeAvatarProps) {
  const [assets, setAssets] = useState<PersonaAssets | null>(() => getPersonaAssets(persona));
  const [viseme, setViseme] = useState<VisemeSymbol>('rest');
  const clientRef = useRef<VisemeClient | null>(null);

  // Refresh assets when persona changes — the registry is cached so this is cheap.
  useEffect(() => {
    setAssets(getPersonaAssets(persona));
  }, [persona]);

  // Boot the viseme client. Failure is non-fatal — just stay on rest viseme.
  useEffect(() => {
    if (!assets) return;
    const client = new VisemeClient({
      intervalMs: readEnvInt('VITE_AVATAR_VISEME_INTERVAL_MS', DEFAULT_INTERVAL_MS),
      restHoldMs: readEnvInt('VITE_AVATAR_REST_HOLD_MS', DEFAULT_REST_HOLD_MS),
    });
    clientRef.current = client;
    const ok = client.connect();
    if (!ok) {
      // Failure path: leave on 'rest'. AvatarPanel won't crash.
      return () => {
        client.close();
        clientRef.current = null;
      };
    }
    const unsub = client.subscribeViseme((s) => setViseme(s));
    return () => {
      try { unsub(); } catch { /* best-effort */ }
      client.close();
      clientRef.current = null;
    };
  }, [assets]);

  // Per-mount jitter so multiple avatar mounts don't blink in lockstep.
  // ±20% per brief.
  const blinkBaseMs = readEnvInt('VITE_AVATAR_BLINK_INTERVAL_MS', DEFAULT_BLINK_MS);
  const idleMotionOn = readEnvFlag('VITE_AVATAR_IDLE_MOTION', DEFAULT_IDLE_MOTION_ENABLED);
  const blinkDurationMs = useMemo(() => {
    const jitter = (Math.random() * 0.4 - 0.2); // -20%..+20%
    return Math.round(blinkBaseMs * (1 + jitter));
  }, [blinkBaseMs]);
  const blinkDelayMs = useMemo(() => Math.round(Math.random() * blinkBaseMs), [blinkBaseMs]);

  if (!assets) {
    // Caller should have screened with hasPersonaAssets() before rendering.
    // If we land here, render nothing — AvatarPanel falls back to the orb.
    return null;
  }

  const visemeUrl = assets.visemes[viseme] ?? assets.base;

  const motionEnabled = idleMotionOn && !reducedMotion;

  return (
    <div
      className="relative rounded-xl overflow-hidden bg-black/5 shadow-md"
      style={{ width: size, height: size }}
      data-testid="viseme-avatar"
      data-persona={persona}
      data-viseme={viseme}
    >
      <style>{`
        @keyframes jieAvatarBreath {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-2px); }
        }
        @keyframes jieAvatarBlink {
          0%, 92%, 100% { opacity: 0; }
          94%, 98%      { opacity: 1; }
        }
        .jie-avatar-stack { width: 100%; height: 100%; position: absolute; inset: 0; }
        .jie-avatar-breathe { animation: jieAvatarBreath 3s ease-in-out infinite; }
        .jie-avatar-blink-overlay {
          position: absolute; inset: 0;
          background: rgba(0,0,0,0.0);
          pointer-events: none;
          opacity: 0;
        }
        .jie-avatar-blink-on {
          animation-name: jieAvatarBlink;
          animation-iteration-count: infinite;
          animation-timing-function: linear;
        }
      `}</style>
      <div className={`jie-avatar-stack ${motionEnabled ? 'jie-avatar-breathe' : ''}`}>
        {/* Layer 1: base — always loaded so the face never disappears. */}
        <img
          src={assets.base}
          alt={assets.characterName}
          className="absolute inset-0 w-full h-full object-cover select-none"
          draggable={false}
          aria-hidden={viseme !== 'rest'}
        />
        {/* Layer 2: active viseme PNG. mode='replace' → full-face overlay. */}
        {viseme !== 'rest' && (
          <img
            src={visemeUrl}
            alt=""
            aria-hidden
            className="absolute inset-0 w-full h-full object-cover select-none"
            draggable={false}
          />
        )}
        {/* Layer 3: blink overlay — CSS-only opacity pulse, simulates closed eyes
            via a thin tinted band. The persona PNGs render eyes baked-in, so
            this is a soft full-face dim during the actual blink frame. Pure
            CSS keyframes, no rAF. */}
        {motionEnabled && (
          <div
            className="jie-avatar-blink-overlay jie-avatar-blink-on"
            style={{
              animationDuration: `${blinkDurationMs}ms`,
              animationDelay: `${blinkDelayMs}ms`,
              background: 'rgba(0,0,0,0.18)',
            }}
          />
        )}
      </div>

      {/* The AvatarToggle handles its own state via useAvatarPreference; in
          this branch (avatar mounted) it renders as "Focus View" and flips
          the user pref to false on click, which causes AvatarPanel to
          re-render the orb-with-toggle path. No parent callback needed. */}
      <AvatarToggle
        variant="compact"
        className="absolute top-2 right-2"
      />
    </div>
  );
}
