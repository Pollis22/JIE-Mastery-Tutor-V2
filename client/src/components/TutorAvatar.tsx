import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { useAgeTheme } from '@/contexts/ThemeContext';
import { RobotAvatar } from './RobotAvatar';

export type TutorState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'celebrating' | 'encouraging';

interface TutorAvatarProps {
  state: TutorState;
  amplitude?: number;
  size?: 'small' | 'medium' | 'large';
}

export function TutorAvatar({ state, amplitude = 0, size = 'medium' }: TutorAvatarProps) {
  const { ageGroup, isYoungLearner } = useAgeTheme();
  
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // Use RobotAvatar for older bands
  if (!isYoungLearner) {
    return (
      <RobotAvatar
        ageGroup={ageGroup as '6-8' | '9-12' | 'College'}
        isSpeaking={state === 'speaking'}
        isListening={state === 'listening'}
        size={size === 'large' ? 'lg' : size === 'medium' ? 'md' : 'sm'}
      />
    );
  }
  
  // Use EmojiAvatar for young learners
  return <EmojiAvatar state={state} amplitude={amplitude} size={size} reducedMotion={prefersReducedMotion} isYoungLearner={isYoungLearner} />;
}

const stateEmojis: Record<TutorState, string> = {
  idle: '😊',
  listening: '👂',
  thinking: '😊',
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

function EmojiAvatar({ state, amplitude, size, reducedMotion, isYoungLearner }: {
  state: TutorState;
  amplitude: number;
  size: 'small' | 'medium' | 'large';
  reducedMotion: boolean;
  isYoungLearner: boolean;
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
    </motion.div>
  );
}
