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
  label: string;
  ariaLabel: string;
}> = {
  idle: {
    baseColor: 'bg-slate-300 dark:bg-slate-600',
    glowColor: 'shadow-slate-300/30 dark:shadow-slate-500/20',
    label: '',
    ariaLabel: 'Voice session ready'
  },
  listening: {
    baseColor: 'bg-emerald-400 dark:bg-emerald-500',
    glowColor: 'shadow-emerald-400/40 dark:shadow-emerald-500/30',
    label: 'Listening...',
    ariaLabel: 'JIE is listening'
  },
  userSpeaking: {
    baseColor: 'bg-blue-400 dark:bg-blue-500',
    glowColor: 'shadow-blue-400/50 dark:shadow-blue-500/40',
    label: 'Hearing you',
    ariaLabel: 'JIE is hearing you'
  },
  tutorSpeaking: {
    baseColor: 'bg-purple-500 dark:bg-purple-400',
    glowColor: 'shadow-purple-500/50 dark:shadow-purple-400/40',
    label: 'JIE is speaking...',
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
        'flex flex-col items-center gap-2',
        className
      )}
    >
      <div className="relative flex items-center justify-center">
        {!prefersReducedMotion && state !== 'idle' && (
          <div 
            className={cn(
              'absolute inset-0 rounded-full blur-md transition-all duration-500',
              config.baseColor,
              state === 'listening' && 'animate-pulse',
              state === 'userSpeaking' && 'animate-pulse'
            )}
            style={{ 
              transform: `scale(${state === 'tutorSpeaking' ? 1.3 + normalizedAmplitude * 0.2 : 1.2})`,
              opacity: state === 'tutorSpeaking' ? 0.3 + normalizedAmplitude * 0.2 : 0.25
            }}
            aria-hidden="true"
          />
        )}

        <div 
          className={cn(
            'absolute rounded-full transition-all duration-200',
            state === 'listening' && !prefersReducedMotion && 'animate-[ping_2s_ease-in-out_infinite]',
            config.baseColor
          )}
          style={{ 
            width: 52, 
            height: 52,
            opacity: state === 'listening' ? 0.3 : 0
          }}
          aria-hidden="true"
        />

        <div
          ref={orbRef}
          className={cn(
            'relative w-12 h-12 rounded-full transition-colors duration-300',
            config.baseColor,
            'shadow-lg',
            config.glowColor
          )}
          style={{
            transform: prefersReducedMotion ? 'scale(1)' : undefined,
            opacity: prefersReducedMotion ? 0.9 : undefined,
            transition: 'transform 0.05s ease-out, opacity 0.1s ease-out'
          }}
        >
          {state === 'userSpeaking' && !prefersReducedMotion && (
            <div 
              className={cn(
                'absolute inset-0 rounded-full border-2 border-blue-400 dark:border-blue-300 animate-[ping_1s_ease-in-out_infinite]'
              )}
              style={{ opacity: 0.4 }}
              aria-hidden="true"
            />
          )}

          <div 
            className="absolute inset-0 rounded-full"
            style={{
              background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.4) 0%, transparent 60%)'
            }}
            aria-hidden="true"
          />
        </div>
      </div>

      {config.label && (
        <span 
          className={cn(
            'text-xs font-medium transition-colors duration-300',
            state === 'tutorSpeaking' && 'text-purple-600 dark:text-purple-400',
            state === 'listening' && 'text-emerald-600 dark:text-emerald-400',
            state === 'userSpeaking' && 'text-blue-600 dark:text-blue-400',
            state === 'idle' && 'text-muted-foreground'
          )}
          data-testid="voice-presence-label"
        >
          {prefersReducedMotion && state === 'tutorSpeaking' ? 'Speaking...' : config.label}
        </span>
      )}
    </div>
  );
}
