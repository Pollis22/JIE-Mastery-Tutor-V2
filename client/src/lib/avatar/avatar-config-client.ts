// =============================================================================
// JIE Mastery — Avatar config (client-side reader)
// -----------------------------------------------------------------------------
// Client mirror of server/config/avatar-config.ts. Reads VITE_* env vars at
// build time. Vite only exposes vars prefixed with VITE_ to the browser.
//
// IMPORTANT: This module has zero runtime side-effects on import. It is safe
// to import even when AVATAR_ENABLED is false — none of the avatar code path
// is taken until shouldRenderAvatar() returns ok:true.
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
  faceId: string;
  enabled: boolean;
}

export interface ClientAvatarConfig {
  masterEnabled: boolean;
  provider: 'simli';
  personas: Record<CanonicalPersona, ClientAvatarPersonaConfig>;
  apiKey: string;
}

const truthy = (v: string | undefined) => v === 'true' || v === '1';

export function readClientAvatarConfig(): ClientAvatarConfig {
  const e = import.meta.env as Record<string, string | undefined>;
  return {
    masterEnabled: truthy(e.VITE_AVATAR_ENABLED),
    provider: 'simli',
    apiKey: e.VITE_SIMLI_API_KEY ?? '',
    personas: {
      'k-2': {
        persona: 'k-2',
        characterName: 'Buddy the Learning Bear',
        faceId: e.VITE_SIMLI_FACE_ID_K2 ?? '',
        enabled: truthy(e.VITE_AVATAR_ENABLED_K2),
      },
      '3-5': {
        persona: '3-5',
        characterName: 'Max the Knowledge Explorer',
        faceId: e.VITE_SIMLI_FACE_ID_35 ?? '',
        enabled: truthy(e.VITE_AVATAR_ENABLED_35),
      },
      '6-8': {
        persona: '6-8',
        characterName: 'Doctor Nova',
        faceId: e.VITE_SIMLI_FACE_ID_68 ?? '',
        enabled: truthy(e.VITE_AVATAR_ENABLED_68),
      },
      '9-12': {
        persona: '9-12',
        characterName: 'Professor Ace',
        faceId: e.VITE_SIMLI_FACE_ID_912 ?? '',
        enabled: truthy(e.VITE_AVATAR_ENABLED_912),
      },
      college: {
        persona: 'college',
        characterName: 'Doctor Morgan',
        faceId: e.VITE_SIMLI_FACE_ID_COLLEGE ?? '',
        enabled: truthy(e.VITE_AVATAR_ENABLED_COLLEGE),
      },
    },
  };
}

export type AvatarGateResult =
  | { ok: true; faceId: string; characterName: string; apiKey: string }
  | { ok: false; reason: 'master_disabled' | 'persona_disabled' | 'no_face_id' | 'no_api_key' | 'slow_network' };

/**
 * Decide whether the avatar should render for the active persona.
 * Honors all four gates from the brief:
 *   1. Master flag on
 *   2. Per-persona flag on
 *   3. faceId configured (non-empty)
 *   4. Network not 2g / 3g / slow-2g (Wi-Fi / 4g+ only)
 */
export function shouldRenderAvatar(
  cfg: ClientAvatarConfig,
  persona: CanonicalPersona,
): AvatarGateResult {
  if (!cfg.masterEnabled) return { ok: false, reason: 'master_disabled' };
  if (!cfg.apiKey) return { ok: false, reason: 'no_api_key' };
  const p = cfg.personas[persona];
  if (!p?.enabled) return { ok: false, reason: 'persona_disabled' };
  if (!p.faceId) return { ok: false, reason: 'no_face_id' };
  if (isSlowNetwork()) return { ok: false, reason: 'slow_network' };
  return { ok: true, faceId: p.faceId, characterName: p.characterName, apiKey: cfg.apiKey };
}

function isSlowNetwork(): boolean {
  if (typeof navigator === 'undefined') return false;
  // Network Information API — not on every browser, treat missing as fast.
  const conn = (navigator as unknown as { connection?: { effectiveType?: string } }).connection;
  if (!conn?.effectiveType) return false;
  return conn.effectiveType === '2g' || conn.effectiveType === '3g' || conn.effectiveType === 'slow-2g';
}
