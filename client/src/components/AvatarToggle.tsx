// =============================================================================
// JIE Mastery — Avatar toggle (Tutor View / Focus View)
// -----------------------------------------------------------------------------
// User preference for whether the rendered avatar shows or the orb shows.
// Two presentations:
//   - Compact: small button, used mid-session in the corner of the avatar.
//   - Settings: full label + helper copy, used on the settings page.
//
// Storage: localStorage key `jie:avatar:enabled` (default true). No
// sessionStorage / IndexedDB — see brief Section 5 (Hard constraints).
//
// Labels are deliberately neutral — "Tutor View" / "Focus View", NOT
// "Premium" / "Basic" — per brief.
// =============================================================================

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'jie:avatar:enabled';
const EVENT_NAME = 'jie:avatar:enabled-changed';

function readPref(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === null) return false; // default OFF — Tutor View is opt-in beta
    return v === '1' || v === 'true';
  } catch {
    return false;
  }
}

function writePref(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // localStorage may be disabled in private mode — best effort.
  }
  // Notify same-tab listeners. The native 'storage' event only fires across tabs.
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { enabled } }));
  } catch {
    // best-effort
  }
}

/**
 * Hook for reading + writing the avatar visibility preference. The returned
 * `enabled` value updates live when the preference changes (in this tab or
 * any other tab).
 */
export function useAvatarPreference(): {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
  toggle: () => void;
} {
  const [enabled, setEnabledState] = useState<boolean>(() => readPref());

  useEffect(() => {
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<{ enabled?: boolean }>).detail;
      if (typeof detail?.enabled === 'boolean') setEnabledState(detail.enabled);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setEnabledState(readPref());
    };
    window.addEventListener(EVENT_NAME, onCustom);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVENT_NAME, onCustom);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    writePref(next);
  }, []);
  const toggle = useCallback(() => {
    setEnabled(!enabled);
  }, [enabled, setEnabled]);
  return { enabled, setEnabled, toggle };
}

interface AvatarToggleProps {
  variant?: 'compact' | 'settings';
  className?: string;
}

export function AvatarToggle({ variant = 'compact', className = '' }: AvatarToggleProps) {
  const { enabled, toggle } = useAvatarPreference();

  if (variant === 'settings') {
    return (
      <div className={`flex items-start justify-between gap-4 ${className}`}>
        <div>
          <div className="font-medium text-sm">Tutor view</div>
          <div className="text-xs text-muted-foreground mt-1">
            Show the illustrated tutor face during sessions. Turn off for a
            distraction-free orb.
          </div>
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-pressed={enabled}
          aria-label={enabled ? 'Switch to Focus View' : 'Switch to Tutor View'}
          data-testid="avatar-toggle-settings"
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
            enabled ? 'bg-primary' : 'bg-muted'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
              enabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    );
  }

  // Compact variant — used as the corner toggle on the avatar panel itself.
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      aria-label={enabled ? 'Switch to Focus View' : 'Switch to Tutor View'}
      data-testid="avatar-toggle-compact"
      className={`rounded-full bg-black/50 hover:bg-black/70 text-white text-xs px-2 py-1 backdrop-blur-sm transition ${className}`}
    >
      {enabled ? 'Focus View' : 'Tutor View — Beta'}
    </button>
  );
}
