// =============================================================================
// JIE Mastery — Avatar config (client-side reader)
// -----------------------------------------------------------------------------
// Client mirror of server/config/avatar-config.ts. Reads VITE_* env vars at
// build time. Vite only exposes vars prefixed with VITE_ to the browser.
//
// IMPORTANT: This module has zero runtime side-effects on import. It is safe
// to import even when AVATAR_ENABLED is false — none of the avatar code path
// is taken until shouldRenderAvatar() returns ok:true.
//
// Phase 2 note: the SIMLI_*/VITE_SIMLI_* gates have been removed because
// the avatar pipeline no longer talks to Simli — the rendered viseme PNGs
// ship with the bundle and asset presence is checked by the panel itself
// via persona-asset-registry. Master flag, per-persona flag, and network
// gates remain intact.
// =============================================================================

export type CanonicalPersona = 'k-2' | '3-5' | '6-8' | '9-12' | 'college';

export function normalizePersona(input: string | undefined | null): CanonicalPersona {
  if (!input) return '3-5';
  const s = input.trim().toLowerCase();
  if (s === 'k-2' || s === 'k2') return 'k-2';
  if (s === '3-5') return '3-5';
  if (s === '6-8') return '6-8';
  if (s === '9-12') return '9-12';
  if (s === 'college' || s === 'college/adult' || s === 'adult') return 'college';
  return '3-5';
}

export interface ClientAvatarPersonaConfig {
  persona: CanonicalPersona;
  characterName: string;
  enabled: boolean;
}

export interface ClientAvatarConfig {
  masterEnabled: boolean;
  personas: Record<CanonicalPersona, ClientAvatarPersonaConfig>;
}

const truthy = (v: string | undefined) => v === 'true' || v === '1';

export function readClientAvatarConfig(): ClientAvatarConfig {
  const e = import.meta.env as Record<string, string | undefined>;
  return {
    masterEnabled: truthy(e.VITE_AVATAR_ENABLED),
    personas: {
      'k-2': {
        persona: 'k-2',
        characterName: 'Buddy the Learning Bear',
        enabled: truthy(e.VITE_AVATAR_ENABLED_K2),
      },
      '3-5': {
        persona: '3-5',
        characterName: 'Max the Knowledge Explorer',
        enabled: truthy(e.VITE_AVATAR_ENABLED_35),
      },
      '6-8': {
        persona: '6-8',
        characterName: 'Doctor Nova',
        enabled: truthy(e.VITE_AVATAR_ENABLED_68),
      },
      '9-12': {
        persona: '9-12',
        characterName: 'Professor Ace',
        enabled: truthy(e.VITE_AVATAR_ENABLED_912),
      },
      college: {
        persona: 'college',
        characterName: 'Doctor Morgan',
        enabled: truthy(e.VITE_AVATAR_ENABLED_COLLEGE),
      },
    },
  };
}

export type AvatarGateResult =
  | { ok: true; characterName: string }
  | { ok: false; reason: 'master_disabled' | 'persona_disabled' | 'slow_network' };

/**
 * Decide whether the avatar should render for the active persona.
 * Honors the gates that live at the env / network layer:
 *   1. Master flag on
 *   2. Per-persona flag on
 *   3. Network not 2g / 3g / slow-2g (Wi-Fi / 4g+ only)
 *
 * Asset-folder presence and the user's localStorage preference are checked
 * downstream by AvatarPanel — those layers can short-circuit to the orb
 * fallback without going through here.
 */
export function shouldRenderAvatar(
  cfg: ClientAvatarConfig,
  persona: CanonicalPersona,
): AvatarGateResult {
  if (!cfg.masterEnabled) return { ok: false, reason: 'master_disabled' };
  const p = cfg.personas[persona];
  if (!p?.enabled) return { ok: false, reason: 'persona_disabled' };
  if (isSlowNetwork()) return { ok: false, reason: 'slow_network' };
  return { ok: true, characterName: p.characterName };
}

function isSlowNetwork(): boolean {
  if (typeof navigator === 'undefined') return false;
  // Network Information API — not on every browser (Safari etc), treat
  // missing as fast per brief's blocker note.
  const conn = (navigator as unknown as { connection?: { effectiveType?: string } }).connection;
  if (!conn?.effectiveType) return false;
  return conn.effectiveType === '2g' || conn.effectiveType === '3g' || conn.effectiveType === 'slow-2g';
}
