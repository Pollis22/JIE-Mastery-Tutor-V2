// =============================================================================
// JIE Mastery — Avatar Pilot Config (dev-avatar branch only)
// -----------------------------------------------------------------------------
// Static persona → Simli faceId + per-persona enable flag mapping.
// Pollis fills these in via Railway env vars (dev environment) as renders
// are approved one-by-one. Empty/missing faceId = persona renders the
// existing orb (no error, no crash). See acceptance criterion #4.
//
// This file deliberately has NO runtime dependencies on the voice pipeline,
// no DB access, and no network calls. It is a pure config module.
//
// Server side reads `process.env.AVATAR_*` and `process.env.SIMLI_*`.
// Client side reads matching `VITE_AVATAR_*` and `VITE_SIMLI_FACE_ID_*`
// (Vite only exposes vars prefixed with VITE_ to the browser bundle).
// Both sets must be set when an avatar is meant to be live.
// =============================================================================

export type CanonicalPersona = 'k-2' | '3-5' | '6-8' | '9-12' | 'college';

/**
 * Normalize the various age-group strings used in the codebase to the
 * canonical persona keys defined in server/config/tutor-personalities.ts.
 *
 * Client passes 'K-2' | '3-5' | '6-8' | '9-12' | 'College/Adult'.
 * Server personas use lowercase 'k-2' | ... | 'college'.
 */
export function normalizePersona(input: string | undefined | null): CanonicalPersona {
  if (!input) return '3-5'; // safe default — matches RealtimeVoiceHost default
  const s = input.trim().toLowerCase();
  if (s === 'k-2' || s === 'k2') return 'k-2';
  if (s === '3-5') return '3-5';
  if (s === '6-8') return '6-8';
  if (s === '9-12') return '9-12';
  if (s === 'college' || s === 'college/adult' || s === 'adult') return 'college';
  return '3-5';
}

export interface AvatarPersonaConfig {
  persona: CanonicalPersona;
  /** Display name for logs / dev tools */
  characterName: string;
  /** Simli faceId — empty string means "no avatar yet, fall back to orb". */
  faceId: string;
  /** Per-persona enable. Master flag must ALSO be true for avatar to render. */
  enabled: boolean;
}

export type AvatarConfig = {
  /** Master switch. When false the entire avatar layer is dormant. */
  masterEnabled: boolean;
  /** Provider name. Currently only 'simli' is supported in Phase 1. */
  provider: 'simli';
  /** Per-persona configuration. */
  personas: Record<CanonicalPersona, AvatarPersonaConfig>;
};

// -----------------------------------------------------------------------------
// Server-side reader — used if/when we add a /api/avatar/config endpoint.
// Not currently consumed; client reads VITE_* directly. Kept here for parity
// and so the static mapping lives in ONE place.
// -----------------------------------------------------------------------------
export function readAvatarConfigFromServerEnv(): AvatarConfig {
  const env = process.env;
  const truthy = (v: string | undefined) => v === 'true' || v === '1';

  return {
    masterEnabled: truthy(env.AVATAR_ENABLED),
    provider: 'simli',
    personas: {
      'k-2': {
        persona: 'k-2',
        characterName: 'Buddy the Learning Bear',
        faceId: env.SIMLI_FACE_ID_K2 ?? '',
        enabled: truthy(env.AVATAR_ENABLED_K2),
      },
      '3-5': {
        persona: '3-5',
        characterName: 'Max the Knowledge Explorer',
        faceId: env.SIMLI_FACE_ID_35 ?? '',
        enabled: truthy(env.AVATAR_ENABLED_35),
      },
      '6-8': {
        persona: '6-8',
        characterName: 'Doctor Nova',
        faceId: env.SIMLI_FACE_ID_68 ?? '',
        enabled: truthy(env.AVATAR_ENABLED_68),
      },
      '9-12': {
        persona: '9-12',
        characterName: 'Professor Ace',
        faceId: env.SIMLI_FACE_ID_912 ?? '',
        enabled: truthy(env.AVATAR_ENABLED_912),
      },
      college: {
        persona: 'college',
        characterName: 'Doctor Morgan',
        faceId: env.SIMLI_FACE_ID_COLLEGE ?? '',
        enabled: truthy(env.AVATAR_ENABLED_COLLEGE),
      },
    },
  };
}

/**
 * Single-persona resolver — returns whether a given persona should render
 * its avatar right now, plus the faceId. Used by the client gating logic.
 *
 * Honors all four gates from the brief:
 *   1. Master flag on
 *   2. Per-persona flag on
 *   3. Provider faceId configured (non-empty)
 *   4. (caller) Network is fast enough — checked at the call site
 */
export function shouldRenderAvatar(
  cfg: AvatarConfig,
  persona: CanonicalPersona,
): { ok: true; faceId: string; characterName: string } | { ok: false; reason: string } {
  if (!cfg.masterEnabled) return { ok: false, reason: 'master_disabled' };
  const p = cfg.personas[persona];
  if (!p) return { ok: false, reason: 'unknown_persona' };
  if (!p.enabled) return { ok: false, reason: 'persona_disabled' };
  if (!p.faceId) return { ok: false, reason: 'no_face_id' };
  return { ok: true, faceId: p.faceId, characterName: p.characterName };
}
