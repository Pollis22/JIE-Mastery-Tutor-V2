// =============================================================================
// JIE Mastery — AvatarPanel
// -----------------------------------------------------------------------------
// Renders the active persona avatar. The Simli WebRTC implementation has been
// removed; Commit 4 wires the new viseme PNG renderer (`<VisemeAvatar />`) in
// place of the Simli video element. This intermediate version is orb-only so
// the tree compiles cleanly between commits.
// =============================================================================

import { AIOrb, OrbState } from './AIOrb';
import { TutorState } from './TutorAvatar';
import { CanonicalPersona, AvatarGateResult } from '@/lib/avatar/avatar-config-client';

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
}: AvatarPanelProps) {
  void persona;
  return <AIOrb state={toOrbState(state)} size={Math.min(140, size)} ageGroup={ageGroupForOrb} />;
}
