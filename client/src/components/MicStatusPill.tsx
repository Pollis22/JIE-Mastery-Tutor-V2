import { useEffect, useState, useRef, useMemo } from 'react';
import { MicStatus } from '@/hooks/use-custom-voice';
import { cn } from '@/lib/utils';
import { Mic, MicOff, Volume2, Loader2, AudioLines, VolumeX, RefreshCw, AlertCircle, VolumeOff } from 'lucide-react';

interface MicStatusPillProps {
  status: MicStatus;
  className?: string;
}

interface StatusConfig {
  label: string;
  ariaLabel: string;
  icon: typeof Mic;
  bgColor: string;
  textColor: string;
  animate?: boolean;
  pulseColor?: string;
}

const DEFAULT_CONFIG: StatusConfig = {
  label: 'Mic',
  ariaLabel: 'Microphone status',
  icon: Mic,
  bgColor: 'bg-gray-100 dark:bg-gray-800',
  textColor: 'text-gray-500 dark:text-gray-400',
};

const STATUS_CONFIG: Record<string, StatusConfig> = {
  mic_off: {
    label: 'Mic Off',
    ariaLabel: 'Microphone is off',
    icon: MicOff,
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    textColor: 'text-gray-500 dark:text-gray-400',
  },
  listening: {
    label: 'Listening',
    ariaLabel: 'Microphone is listening for your voice',
    icon: Mic,
    bgColor: 'bg-blue-100 dark:bg-blue-900/40',
    textColor: 'text-blue-600 dark:text-blue-400',
    animate: true,
    pulseColor: 'bg-blue-400',
  },
  hearing_you: {
    label: 'Hearing You',
    ariaLabel: 'We can hear you speaking',
    icon: AudioLines,
    bgColor: 'bg-green-100 dark:bg-green-900/40',
    textColor: 'text-green-600 dark:text-green-400',
    animate: true,
    pulseColor: 'bg-green-400',
  },
  ignoring_noise: {
    label: 'Filtering Noise',
    ariaLabel: 'Background noise is being filtered out',
    icon: VolumeX,
    bgColor: 'bg-amber-100 dark:bg-amber-900/40',
    textColor: 'text-amber-600 dark:text-amber-400',
  },
  tutor_speaking: {
    label: 'JIE Speaking',
    ariaLabel: 'JIE is speaking',
    icon: Volume2,
    bgColor: 'bg-purple-100 dark:bg-purple-900/40',
    textColor: 'text-purple-600 dark:text-purple-400',
    animate: true,
    pulseColor: 'bg-purple-400',
  },
  processing: {
    label: 'Processing',
    ariaLabel: 'Processing your message',
    icon: Loader2,
    bgColor: 'bg-orange-100 dark:bg-orange-900/40',
    textColor: 'text-orange-600 dark:text-orange-400',
    animate: true,
  },
  reconnecting: {
    label: 'Reconnecting',
    ariaLabel: 'Reconnecting to voice service',
    icon: RefreshCw,
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/40',
    textColor: 'text-yellow-600 dark:text-yellow-400',
    animate: true,
  },
  error: {
    label: 'Error',
    ariaLabel: 'Voice connection error',
    icon: AlertCircle,
    bgColor: 'bg-red-100 dark:bg-red-900/40',
    textColor: 'text-red-600 dark:text-red-400',
  },
  silent: {
    label: 'No Audio',
    ariaLabel: 'Microphone is receiving silent audio',
    icon: VolumeOff,
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    textColor: 'text-gray-500 dark:text-gray-400',
  },
  silent_input: {
    label: 'No Audio',
    ariaLabel: 'Microphone is receiving silent audio',
    icon: VolumeOff,
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    textColor: 'text-gray-500 dark:text-gray-400',
  },
};

const warnedStatuses = new Set<string>();

function getStatusConfig(status: MicStatus | string | null | undefined): StatusConfig {
  if (!status) {
    return DEFAULT_CONFIG;
  }
  
  const normalizedStatus = String(status).trim().toLowerCase();
  const config = STATUS_CONFIG[normalizedStatus];
  
  if (config) {
    return config;
  }
  
  if (!warnedStatuses.has(normalizedStatus)) {
    warnedStatuses.add(normalizedStatus);
    console.warn(`[MicStatusPill] Unknown mic status: "${status}" - using default config`);
  }
  
  return DEFAULT_CONFIG;
}

if (import.meta.env.DEV) {
  const expectedStatuses: MicStatus[] = [
    'mic_off', 'listening', 'hearing_you', 'ignoring_noise', 
    'tutor_speaking', 'processing', 'reconnecting', 'error', 'silent'
  ];
  
  for (const status of expectedStatuses) {
    const cfg = STATUS_CONFIG[status];
    if (!cfg) {
      console.error(`[MicStatusPill] Missing config for expected status: ${status}`);
    } else if (!cfg.icon) {
      console.error(`[MicStatusPill] Missing icon for status: ${status}`);
    }
  }
}

export function MicStatusPill({ status, className }: MicStatusPillProps) {
  const config = useMemo(() => getStatusConfig(status), [status]);
  const Icon = config.icon || Mic;
  const [showPulse, setShowPulse] = useState(false);
  const lastStatusRef = useRef<MicStatus>(status);
  
  useEffect(() => {
    if (status !== lastStatusRef.current) {
      lastStatusRef.current = status;
      if (config.animate) {
        setShowPulse(true);
        const timer = setTimeout(() => setShowPulse(false), 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [status, config.animate]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={config.ariaLabel}
      data-testid="mic-status-pill"
      data-status={status}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-300',
        'select-none cursor-default',
        'min-w-[90px] justify-center',
        config.bgColor,
        config.textColor,
        'border border-current/10',
        'shadow-sm',
        className
      )}
    >
      <span className="relative flex items-center">
        <Icon
          className={cn(
            'w-3.5 h-3.5',
            status === 'processing' && 'animate-spin',
            status === 'hearing_you' && 'animate-pulse',
            status === 'reconnecting' && 'animate-spin'
          )}
          aria-hidden="true"
        />
        {config.pulseColor && showPulse && (
          <span
            className={cn(
              'absolute -inset-1 rounded-full animate-ping opacity-75',
              config.pulseColor
            )}
            aria-hidden="true"
          />
        )}
      </span>
      <span className="whitespace-nowrap">{config.label}</span>
    </div>
  );
}
