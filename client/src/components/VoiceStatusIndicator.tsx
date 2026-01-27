import { useEffect, useState, useRef } from 'react';

export type VoiceStatusType = 
  | 'listening'
  | 'hearing_you'
  | 'thinking'
  | 'speaking'
  | 'listen_only'
  | 'text_only'
  | 'mic_muted'
  | 'disconnected'
  | 'hidden';

interface VoiceStatusIndicatorProps {
  isConnected: boolean;
  communicationMode: 'voice' | 'hybrid' | 'text';
  studentMicEnabled: boolean;
  isTutorThinking: boolean;
  isTutorSpeaking: boolean;
  isHearingStudent: boolean;
}

const STATUS_CONFIG: Record<VoiceStatusType, { emoji: string; text: string; className: string }> = {
  listening: {
    emoji: '🟢',
    text: 'JIE is listening...',
    className: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
  },
  hearing_you: {
    emoji: '🎙️',
    text: 'Hearing you...',
    className: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400'
  },
  thinking: {
    emoji: '🤔',
    text: 'JIE is thinking...',
    className: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
  },
  speaking: {
    emoji: '🔊',
    text: 'JIE is speaking...',
    className: 'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-400'
  },
  listen_only: {
    emoji: '👂',
    text: 'Listen-only mode (mic off)',
    className: 'bg-gray-50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
  },
  text_only: {
    emoji: '💬',
    text: 'Text mode',
    className: 'bg-gray-50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
  },
  mic_muted: {
    emoji: '🔇',
    text: 'Mic muted',
    className: 'bg-gray-50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
  },
  disconnected: {
    emoji: '🔴',
    text: 'Disconnected',
    className: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
  },
  hidden: {
    emoji: '',
    text: '',
    className: ''
  }
};

const DEBOUNCE_MS = {
  ENTER_HEARING: 200,
  EXIT_HEARING: 700,
  TRANSITION: 100
};

export function VoiceStatusIndicator({
  isConnected,
  communicationMode,
  studentMicEnabled,
  isTutorThinking,
  isTutorSpeaking,
  isHearingStudent
}: VoiceStatusIndicatorProps) {
  const [displayedStatus, setDisplayedStatus] = useState<VoiceStatusType>('hidden');
  const lastStatusRef = useRef<VoiceStatusType>('hidden');
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hearingStartRef = useRef<number | null>(null);
  
  useEffect(() => {
    const computeStatus = (): VoiceStatusType => {
      if (!isConnected) {
        return 'disconnected';
      }
      
      if (communicationMode === 'text') {
        return 'text_only';
      }
      
      if (communicationMode === 'hybrid') {
        if (isTutorSpeaking) return 'speaking';
        if (isTutorThinking) return 'thinking';
        return 'listen_only';
      }
      
      if (communicationMode === 'voice' && !studentMicEnabled) {
        if (isTutorSpeaking) return 'speaking';
        if (isTutorThinking) return 'thinking';
        return 'mic_muted';
      }
      
      if (isTutorSpeaking) {
        return 'speaking';
      }
      
      if (isTutorThinking) {
        return 'thinking';
      }
      
      if (isHearingStudent) {
        return 'hearing_you';
      }
      
      return 'listening';
    };
    
    const newStatus = computeStatus();
    
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    
    if (newStatus === 'hearing_you' && lastStatusRef.current !== 'hearing_you') {
      if (!hearingStartRef.current) {
        hearingStartRef.current = Date.now();
      }
      debounceTimerRef.current = setTimeout(() => {
        setDisplayedStatus('hearing_you');
        lastStatusRef.current = 'hearing_you';
      }, DEBOUNCE_MS.ENTER_HEARING);
    } else if (lastStatusRef.current === 'hearing_you' && newStatus === 'listening') {
      debounceTimerRef.current = setTimeout(() => {
        setDisplayedStatus('listening');
        lastStatusRef.current = 'listening';
        hearingStartRef.current = null;
      }, DEBOUNCE_MS.EXIT_HEARING);
    } else if (
      newStatus === 'thinking' || 
      newStatus === 'speaking' || 
      newStatus === 'disconnected' ||
      newStatus === 'text_only' ||
      newStatus === 'listen_only'
    ) {
      setDisplayedStatus(newStatus);
      lastStatusRef.current = newStatus;
      hearingStartRef.current = null;
    } else if (newStatus !== lastStatusRef.current) {
      debounceTimerRef.current = setTimeout(() => {
        setDisplayedStatus(newStatus);
        lastStatusRef.current = newStatus;
      }, DEBOUNCE_MS.TRANSITION);
    }
    
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [isConnected, communicationMode, studentMicEnabled, isTutorThinking, isTutorSpeaking, isHearingStudent]);
  
  if (displayedStatus === 'hidden') {
    return null;
  }
  
  const config = STATUS_CONFIG[displayedStatus];
  
  return (
    <div 
      className={`flex justify-center my-2`}
      data-testid="voice-status-indicator"
    >
      <div 
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${config.className} transition-all duration-200`}
        data-testid={`voice-status-${displayedStatus}`}
      >
        <span>{config.emoji}</span>
        <span className="italic">{config.text}</span>
        {displayedStatus === 'thinking' && (
          <span className="flex gap-0.5 ml-1">
            <span className="inline-block w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="inline-block w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="inline-block w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
        )}
        {displayedStatus === 'hearing_you' && (
          <span className="flex gap-0.5 ml-1">
            <span className="inline-block w-1 h-3 bg-current rounded-full animate-pulse" style={{ animationDuration: '0.4s' }} />
            <span className="inline-block w-1 h-2 bg-current rounded-full animate-pulse" style={{ animationDuration: '0.5s' }} />
            <span className="inline-block w-1 h-3 bg-current rounded-full animate-pulse" style={{ animationDuration: '0.35s' }} />
          </span>
        )}
      </div>
    </div>
  );
}
