// =============================================================================
// JIE Mastery — AvatarPanel
// -----------------------------------------------------------------------------
// Renders the rendered viseme avatar for the active persona, lip-syncing to
// the existing ElevenLabs PCM stream via the avatar audio bus + wawa-lipsync.
//
// Failure mode is the whole point of this component: ANY error or missing
// asset → it returns the orb fallback automatically. The voice session never
// breaks.
//
// Effective visibility is gated by:
//   1. shouldRenderAvatar() (master + per-persona + network — caller-side)
//   2. user preference jie:avatar:enabled (localStorage, default true)
//   3. asset folder present for this persona (PNG inventory check)
// =============================================================================

import { AIOrb, OrbState } from './AIOrb';
import { TutorState } from './TutorAvatar';
import { CanonicalPersona, AvatarGateResult } from '@/lib/avatar/avatar-config-client';
import { hasPersonaAssets } from '@/lib/avatar/persona-asset-registry';
import { VisemeAvatar } from './VisemeAvatar';
import { AvatarToggle, useAvatarPreference } from './AvatarToggle';

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
  state,
  size = 320,
  ageGroupForOrb,
  onVoiceOnlyClick,
}: AvatarPanelProps) {
  const { enabled: userPref, setEnabled } = useAvatarPreference();
  const assetsPresent = hasPersonaAssets(persona);

  // Effective visibility (caller has already cleared the master+persona+network
  // gates by passing gate.ok=true). The remaining gates live here.
  const shouldShowAvatar = userPref && assetsPresent;

  if (!shouldShowAvatar) {
    return (
      <div
        className="relative inline-flex items-center justify-center"
        style={{ width: size, height: size }}
        data-testid="avatar-panel-orb"
        data-reason={!assetsPresent ? 'no_assets' : 'user_pref_off'}
      >
        <AIOrb state={toOrbState(state)} size={Math.min(140, size)} ageGroup={ageGroupForOrb} />
        {/* When the user has flipped to Focus View, expose the toggle so they
            can flip back without leaving the session (acceptance criterion #5). */}
        {assetsPresent && (
          <AvatarToggle
            variant="compact"
            className="absolute top-2 right-2"
          />
        )}
      </div>
    );
  }

  return (
    <VisemeAvatar
      persona={persona}
      size={size}
      onVoiceOnlyClick={() => {
        // Two paths: persist preference (so reload keeps it) AND let the
        // parent collapse the panel if it owns its own override state.
        setEnabled(false);
        onVoiceOnlyClick?.();
      }}
    />
  );
}
