import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { useAgeTheme } from '@/contexts/ThemeContext';
import type { AvatarStyle } from '@/styles/themes';

export type TutorState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'celebrating' | 'encouraging';

interface TutorAvatarProps {
  state: TutorState;
  amplitude?: number;
  size?: 'small' | 'medium' | 'large';
}

const stateEmojis: Record<TutorState, string> = {
  idle: '😊',
  listening: '👂',
  thinking: '🤔',
  speaking: '😄',
  celebrating: '🎉',
  encouraging: '💪',
};

const stateColors: Record<TutorState, { from: string; to: string }> = {
  idle: { from: '#a78bfa', to: '#c084fc' },
  listening: { from: '#2dd4bf', to: '#22d3ee' },
  thinking: { from: '#fbbf24', to: '#f97316' },
  speaking: { from: '#8b5cf6', to: '#ec4899' },
  celebrating: { from: '#f472b6', to: '#fb923c' },
  encouraging: { from: '#34d399', to: '#22d3ee' },
};

const geometricColors: Record<TutorState, { from: string; to: string }> = {
  idle: { from: '#06b6d4', to: '#3b82f6' },
  listening: { from: '#22d3ee', to: '#38bdf8' },
  thinking: { from: '#f59e0b', to: '#f97316' },
  speaking: { from: '#0ea5e9', to: '#6366f1' },
  celebrating: { from: '#14b8a6', to: '#06b6d4' },
  encouraging: { from: '#10b981', to: '#22d3ee' },
};

const focusColors: Record<TutorState, { from: string; to: string }> = {
  idle: { from: '#7c3aed', to: '#8b5cf6' },
  listening: { from: '#8b5cf6', to: '#a78bfa' },
  thinking: { from: '#a78bfa', to: '#c4b5fd' },
  speaking: { from: '#6d28d9', to: '#7c3aed' },
  celebrating: { from: '#8b5cf6', to: '#c084fc' },
  encouraging: { from: '#7c3aed', to: '#a78bfa' },
};

const professionalColors: Record<TutorState, { from: string; to: string }> = {
  idle: { from: '#4b5563', to: '#6b7280' },
  listening: { from: '#10b981', to: '#34d399' },
  thinking: { from: '#6b7280', to: '#9ca3af' },
  speaking: { from: '#374151', to: '#4b5563' },
  celebrating: { from: '#10b981', to: '#34d399' },
  encouraging: { from: '#10b981', to: '#34d399' },
};

export function TutorAvatar({ state, amplitude = 0, size = 'medium' }: TutorAvatarProps) {
  const { ageGroup, isYoungLearner, theme } = useAgeTheme();
  
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);
  
  const avatarStyle = theme.avatarStyle;
  
  if (avatarStyle === 'geometric') {
    return <GeometricAvatar state={state} amplitude={amplitude} size={size} reducedMotion={prefersReducedMotion} />;
  }
  
  if (avatarStyle === 'waveform') {
    return <WaveformAvatar state={state} amplitude={amplitude} size={size} reducedMotion={prefersReducedMotion} />;
  }
  
  if (avatarStyle === 'minimal') {
    return <MinimalAvatar state={state} amplitude={amplitude} size={size} reducedMotion={prefersReducedMotion} />;
  }
  
  return <EmojiAvatar state={state} amplitude={amplitude} size={size} reducedMotion={prefersReducedMotion} isYoungLearner={isYoungLearner} tutorEmoji={theme.tutorEmoji} />;
}

function EmojiAvatar({ state, amplitude, size, reducedMotion, isYoungLearner, tutorEmoji }: {
  state: TutorState;
  amplitude: number;
  size: 'small' | 'medium' | 'large';
  reducedMotion: boolean;
  isYoungLearner: boolean;
  tutorEmoji: string;
}) {
  const avatarSize = useMemo(() => {
    const sizes = {
      small: isYoungLearner ? 64 : 48,
      medium: isYoungLearner ? 100 : 72,
      large: isYoungLearner ? 140 : 100,
    };
    return sizes[size];
  }, [size, isYoungLearner]);
  
  const emojiSize = useMemo(() => {
    const sizes = {
      small: 'text-2xl',
      medium: isYoungLearner ? 'text-5xl' : 'text-4xl',
      large: isYoungLearner ? 'text-6xl' : 'text-5xl',
    };
    return sizes[size];
  }, [size, isYoungLearner]);
  
  const colors = stateColors[state];
  const emoji = stateEmojis[state];
  const scale = 1 + (amplitude * 0.15);
  
  return (
    <motion.div
      className="relative flex items-center justify-center"
      animate={reducedMotion ? {} : {
        scale: state === 'speaking' ? [1, 1.05, 1] : 1,
        y: state === 'thinking' ? [0, -5, 0] : 0,
      }}
      transition={{ 
        duration: 0.8, 
        repeat: state === 'speaking' || state === 'thinking' ? Infinity : 0,
        ease: 'easeInOut',
      }}
    >
      {state === 'speaking' && !reducedMotion && (
        <motion.div
          className="absolute rounded-full blur-xl"
          style={{
            width: avatarSize * 1.3,
            height: avatarSize * 1.3,
            background: `linear-gradient(135deg, ${colors.from}, ${colors.to})`,
          }}
          animate={{ 
            opacity: [0.3, 0.5, 0.3], 
            scale: [1, 1.15, 1] 
          }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
      
      {state === 'celebrating' && !reducedMotion && (
        <motion.div
          className="absolute rounded-full"
          style={{
            width: avatarSize * 1.5,
            height: avatarSize * 1.5,
            background: 'radial-gradient(circle, rgba(251,191,36,0.4) 0%, transparent 70%)',
          }}
          animate={{ 
            scale: [1, 1.3, 1],
            rotate: [0, 180, 360],
          }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}
      
      <motion.div 
        className="relative rounded-full overflow-hidden border-4 border-white shadow-xl flex items-center justify-center"
        style={{ 
          width: avatarSize, 
          height: avatarSize,
          background: `linear-gradient(135deg, ${colors.from}, ${colors.to})`,
          transform: `scale(${scale})`,
        }}
      >
        <motion.span 
          className={emojiSize}
          animate={!reducedMotion && state === 'speaking' ? { 
            scale: [1, 1.15, 1] 
          } : {}}
          transition={{ duration: 0.4, repeat: Infinity }}
        >
          {emoji}
        </motion.span>
      </motion.div>
      
      {state === 'speaking' && !reducedMotion && (
        <motion.div 
          className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex gap-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 bg-green-400 rounded-full shadow-sm"
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 0.4, repeat: Infinity, delay: i * 0.1 }}
            />
          ))}
        </motion.div>
      )}
      
      {isYoungLearner && state === 'idle' && (
        <motion.div
          className="absolute -top-1 -right-1 text-xl"
          animate={!reducedMotion ? { 
            rotate: [0, 15, -15, 0],
            scale: [1, 1.1, 1],
          } : {}}
          transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
        >
          {tutorEmoji}
        </motion.div>
      )}
    </motion.div>
  );
}

function GeometricAvatar({ state, amplitude, size, reducedMotion }: {
  state: TutorState;
  amplitude: number;
  size: 'small' | 'medium' | 'large';
  reducedMotion: boolean;
}) {
  const avatarSize = useMemo(() => {
    const sizes = { small: 48, medium: 80, large: 96 };
    return sizes[size];
  }, [size]);
  
  const colors = geometricColors[state];
  const isSpeaking = state === 'speaking';
  
  return (
    <motion.div className="relative" style={{ width: avatarSize * 1.4, height: avatarSize * 1.4 }}>
      <motion.div 
        className="absolute inset-0 flex items-center justify-center"
        style={{ width: avatarSize, height: avatarSize, margin: 'auto', top: 0, left: 0, right: 0, bottom: 0 }}
      >
        <motion.div 
          className="rounded-2xl shadow-lg"
          style={{
            width: avatarSize,
            height: avatarSize,
            background: `linear-gradient(135deg, ${colors.from}, ${colors.to})`,
            transform: 'rotate(45deg)',
          }}
          animate={reducedMotion ? {} : (isSpeaking ? { 
            rotate: [45, 50, 45],
            scale: [1, 1.05, 1]
          } : { rotate: 45 })}
          transition={{ duration: 1, repeat: isSpeaking ? Infinity : 0 }}
        >
          <div className="-rotate-45 w-full h-full flex items-center justify-center">
            <motion.div
              className="w-1/3 h-1/3 bg-white/30 rounded-full"
              animate={reducedMotion ? {} : (isSpeaking ? { scale: [1, 1.3, 1] } : {})}
              transition={{ duration: 0.5, repeat: Infinity }}
            />
          </div>
        </motion.div>
        
        {isSpeaking && !reducedMotion && (
          <motion.div
            className="absolute inset-0 rounded-2xl border-2 border-cyan-400"
            style={{ transform: 'rotate(45deg)' }}
            animate={{ scale: [1, 1.3], opacity: [0.8, 0] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
        )}
      </motion.div>
    </motion.div>
  );
}

function WaveformAvatar({ state, amplitude, size, reducedMotion }: {
  state: TutorState;
  amplitude: number;
  size: 'small' | 'medium' | 'large';
  reducedMotion: boolean;
}) {
  const avatarSize = useMemo(() => {
    const sizes = { small: 48, medium: 72, large: 88 };
    return sizes[size];
  }, [size]);
  
  const colors = focusColors[state];
  const isSpeaking = state === 'speaking';
  const barCount = 5;
  
  return (
    <motion.div 
      className="rounded-full flex items-center justify-center shadow-lg"
      style={{
        width: avatarSize,
        height: avatarSize,
        background: `linear-gradient(135deg, ${colors.from}, ${colors.to})`,
      }}
    >
      <div className="flex items-center justify-center gap-[3px]">
        {Array.from({ length: barCount }).map((_, i) => (
          <motion.div
            key={i}
            className="bg-white rounded-full"
            style={{ width: 3 }}
            animate={reducedMotion ? { height: 12 } : (isSpeaking ? {
              height: [12, 20 + Math.random() * 8, 12],
            } : { height: 12 })}
            transition={{
              duration: 0.4,
              repeat: isSpeaking ? Infinity : 0,
              delay: i * 0.08,
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}

function MinimalAvatar({ state, amplitude, size, reducedMotion }: {
  state: TutorState;
  amplitude: number;
  size: 'small' | 'medium' | 'large';
  reducedMotion: boolean;
}) {
  const avatarSize = useMemo(() => {
    const sizes = { small: 40, medium: 56, large: 72 };
    return sizes[size];
  }, [size]);
  
  const colors = professionalColors[state];
  const isSpeaking = state === 'speaking';
  
  return (
    <div className="relative">
      <motion.div 
        className="rounded-full shadow-md flex items-center justify-center"
        style={{
          width: avatarSize,
          height: avatarSize,
          background: `linear-gradient(135deg, ${colors.from}, ${colors.to})`,
        }}
      >
        <motion.div
          className="w-1/4 h-1/4 bg-white rounded-full"
          animate={reducedMotion ? {} : (isSpeaking ? { scale: [1, 1.5, 1] } : {})}
          transition={{ duration: 0.6, repeat: Infinity }}
        />
      </motion.div>
      
      {isSpeaking && !reducedMotion && (
        <motion.div
          className="absolute inset-0 rounded-full border border-emerald-500/50"
          animate={{ scale: [1, 1.4], opacity: [0.5, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
    </div>
  );
}
