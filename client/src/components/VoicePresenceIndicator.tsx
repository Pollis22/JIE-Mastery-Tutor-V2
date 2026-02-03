import { useRef, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';

export type VoicePresenceState = 'idle' | 'listening' | 'userSpeaking' | 'tutorSpeaking';

interface VoicePresenceIndicatorProps {
  state: VoicePresenceState;
  amplitude?: number;
  className?: string;
}

const STATE_CONFIG: Record<VoicePresenceState, {
  baseColor: string;
  glowColor: string;
  ariaLabel: string;
}> = {
  idle: {
    baseColor: 'bg-slate-200 dark:bg-slate-700',
    glowColor: 'shadow-slate-200/20 dark:shadow-slate-600/15',
    ariaLabel: 'Voice session ready'
  },
  listening: {
    baseColor: 'bg-teal-300 dark:bg-teal-500',
    glowColor: 'shadow-teal-300/30 dark:shadow-teal-500/25',
    ariaLabel: 'JIE is listening'
  },
  userSpeaking: {
    baseColor: 'bg-sky-300 dark:bg-sky-500',
    glowColor: 'shadow-sky-300/35 dark:shadow-sky-500/30',
    ariaLabel: 'JIE is hearing you'
  },
  tutorSpeaking: {
    baseColor: 'bg-violet-400 dark:bg-violet-500',
    glowColor: 'shadow-violet-400/40 dark:shadow-violet-500/35',
    ariaLabel: 'JIE is speaking'
  }
};

export function VoicePresenceIndicator({ 
  state, 
  amplitude = 0, 
  className 
}: VoicePresenceIndicatorProps) {
  const orbRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>(0);
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const config = STATE_CONFIG[state];
  const normalizedAmplitude = Math.min(Math.max(amplitude, 0), 1);
  const orbScale = state === 'tutorSpeaking' 
    ? 1 + (normalizedAmplitude * 0.12)
    : 1;

  useEffect(() => {
    if (prefersReducedMotion || !orbRef.current) return;

    const orb = orbRef.current;
    
    if (state === 'idle') {
      orb.style.transform = 'scale(1)';
      orb.style.opacity = '0.7';
      return;
    }
    
    const animate = () => {
      if (state === 'tutorSpeaking') {
        orb.style.transform = `scale(${orbScale})`;
        orb.style.opacity = String(0.85 + normalizedAmplitude * 0.15);
      } else if (state === 'listening') {
        orb.style.transform = 'scale(1)';
        orb.style.opacity = '0.9';
      } else if (state === 'userSpeaking') {
        orb.style.transform = 'scale(1.02)';
        orb.style.opacity = '0.95';
      }
      
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [state, orbScale, normalizedAmplitude, prefersReducedMotion]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={config.ariaLabel}
      data-testid="voice-presence-indicator"
      data-state={state}
      className={cn(
        'flex items-center justify-center',
        className
      )}
    >
      <div className="relative flex items-center justify-center">
        {!prefersReducedMotion && state !== 'idle' && (
          <div 
            className={cn(
              'absolute rounded-full blur-xl transition-all duration-700 ease-out',
              config.baseColor
            )}
            style={{ 
              width: 80,
              height: 80,
              transform: `scale(${state === 'tutorSpeaking' ? 1.1 + normalizedAmplitude * 0.15 : 1})`,
              opacity: state === 'tutorSpeaking' ? 0.25 + normalizedAmplitude * 0.15 : 0.2
            }}
            aria-hidden="true"
          />
        )}

        {!prefersReducedMotion && state === 'listening' && (
          <div 
            className={cn(
              'absolute rounded-full',
              config.baseColor
            )}
            style={{ 
              width: 56, 
              height: 56,
              opacity: 0.15,
              animation: 'pulse 3s ease-in-out infinite'
            }}
            aria-hidden="true"
          />
        )}

        <div
          ref={orbRef}
          className={cn(
            'relative w-14 h-14 rounded-full transition-colors duration-500 ease-out',
            config.baseColor,
            'shadow-xl',
            config.glowColor
          )}
          style={{
            transform: prefersReducedMotion ? 'scale(1)' : undefined,
            opacity: prefersReducedMotion ? 0.85 : undefined,
            transition: 'transform 0.08s ease-out, opacity 0.15s ease-out, background-color 0.5s ease-out'
          }}
        >
          {state === 'userSpeaking' && !prefersReducedMotion && (
            <div 
              className={cn(
                'absolute -inset-1 rounded-full border border-sky-300 dark:border-sky-400'
              )}
              style={{ 
                opacity: 0.4,
                animation: 'ping 1.5s ease-in-out infinite'
              }}
              aria-hidden="true"
            />
          )}

          <div 
            className="absolute inset-0 rounded-full"
            style={{
              background: 'radial-gradient(circle at 35% 35%, rgba(255,255,255,0.35) 0%, transparent 55%)'
            }}
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  );
}
