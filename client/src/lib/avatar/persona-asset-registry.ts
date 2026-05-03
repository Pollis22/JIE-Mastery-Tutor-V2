// =============================================================================
// JIE Mastery — Persona asset registry
// -----------------------------------------------------------------------------
// Maps each persona key to its rendered PNG asset URLs (one base + nine
// viseme frames). Uses Vite's `import.meta.glob('...', { eager: true })` so
// the URLs are produced at build time and the bundle hashes the assets.
//
// All five personas are mode='replace' — the rendered PNGs are full-face
// frames, not transparent overlays.
//
// Lookup contract:
//   - getPersonaAssets(persona) returns null if any required PNG is missing
//     for that persona. The avatar gate uses this null to fall back to the
//     orb (acceptance criterion #4).
// =============================================================================

import type { CanonicalPersona } from './avatar-config-client';
import type { VisemeSymbol } from './viseme-controller';

// Eagerly import every PNG under client/src/assets/avatars/. Vite returns
// modules whose `default` export is the resolved URL (string).
const ASSET_MODULES = import.meta.glob('@/assets/avatars/**/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

interface PersonaAssetFolder {
  /** Display name for telemetry / debugging. */
  characterName: string;
  /** Filesystem-style path used to resolve the PNGs. */
  ageFolder: string;
  /** Sub-folder name and the prefix used for each PNG file. */
  characterFolder: string;
  /** Always 'replace' for the current renders — full-face frames. */
  mode: 'replace';
}

const PERSONA_FOLDERS: Record<CanonicalPersona, PersonaAssetFolder> = {
  'k-2':     { characterName: 'Buddy the Learning Bear',   ageFolder: 'k-2',     characterFolder: 'buddy',  mode: 'replace' },
  '3-5':     { characterName: 'Max the Knowledge Explorer', ageFolder: '3-5',     characterFolder: 'max',    mode: 'replace' },
  '6-8':     { characterName: 'Doctor Nova',                ageFolder: '6-8',     characterFolder: 'nova',   mode: 'replace' },
  '9-12':    { characterName: 'Professor Ace',              ageFolder: '9-12',    characterFolder: 'ace',    mode: 'replace' },
  college:   { characterName: 'Doctor Morgan',              ageFolder: 'college', characterFolder: 'morgan', mode: 'replace' },
};

const VISEME_LETTERS: Exclude<VisemeSymbol, 'rest'>[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];

export interface PersonaAssets {
  characterName: string;
  mode: 'replace';
  base: string;
  /** Map of viseme symbol → PNG URL. 'rest' resolves to base. */
  visemes: Record<VisemeSymbol, string>;
}

const cache = new Map<CanonicalPersona, PersonaAssets | null>();

function resolve(matchSuffix: string): string | null {
  // ASSET_MODULES keys look like '/client/src/assets/avatars/college/morgan/morgan-base.png'
  for (const key of Object.keys(ASSET_MODULES)) {
    if (key.endsWith(matchSuffix)) return ASSET_MODULES[key];
  }
  return null;
}

export function getPersonaAssets(persona: CanonicalPersona): PersonaAssets | null {
  if (cache.has(persona)) return cache.get(persona) ?? null;
  const folder = PERSONA_FOLDERS[persona];
  if (!folder) {
    cache.set(persona, null);
    return null;
  }
  const prefix = `/${folder.ageFolder}/${folder.characterFolder}/${folder.characterFolder}`;
  const base = resolve(`${prefix}-base.png`);
  if (!base) {
    cache.set(persona, null);
    return null;
  }
  const visemes: Record<VisemeSymbol, string> = {
    rest: base,
    A: '', B: '', C: '', D: '', E: '', F: '', G: '', H: '', I: '',
  };
  for (const letter of VISEME_LETTERS) {
    const url = resolve(`${prefix}-viseme-${letter}.png`);
    if (!url) {
      cache.set(persona, null);
      return null;
    }
    visemes[letter] = url;
  }
  const assets: PersonaAssets = {
    characterName: folder.characterName,
    mode: 'replace',
    base,
    visemes,
  };
  cache.set(persona, assets);
  return assets;
}

/** True if every required PNG resolves for the given persona. */
export function hasPersonaAssets(persona: CanonicalPersona): boolean {
  return getPersonaAssets(persona) !== null;
}
