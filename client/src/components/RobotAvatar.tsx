import { motion } from 'framer-motion';
import robotImage from '../assets/images/tutor-robot.png';

interface RobotAvatarProps {
  isSpeaking: boolean;
  isListening: boolean;
  ageGroup: '6-8' | '9-12' | 'College';
  size?: 'sm' | 'md' | 'lg';
}

export function RobotAvatar({ isSpeaking, isListening, ageGroup, size = 'md' }: RobotAvatarProps) {
  
  const glowColors = {
    '6-8': {
      primary: 'rgba(6, 182, 212, 0.6)',
      secondary: 'rgba(59, 130, 246, 0.4)',
      ring: 'border-cyan-400',
      shadow: 'shadow-cyan-500/50',
    },
    '9-12': {
      primary: 'rgba(139, 92, 246, 0.6)',
      secondary: 'rgba(168, 85, 247, 0.4)',
      ring: 'border-violet-400',
      shadow: 'shadow-violet-500/50',
    },
    'College': {
      primary: 'rgba(16, 185, 129, 0.5)',
      secondary: 'rgba(156, 163, 175, 0.3)',
      ring: 'border-emerald-400',
      shadow: 'shadow-emerald-500/40',
    },
  };
  
  const colors = glowColors[ageGroup];
  
  const sizeClasses = {
    sm: { container: 'w-16 h-16', glow: 64 },
    md: { container: 'w-24 h-24', glow: 96 },
    lg: { container: 'w-32 h-32', glow: 128 },
  };
  
  const currentSize = sizeClasses[size];
  
  return (
    <div className="relative flex items-center justify-center">
      
      {isSpeaking && (
        <>
          <motion.div
            className="absolute rounded-full"
            style={{
              width: currentSize.glow,
              height: currentSize.glow,
              background: `radial-gradient(circle, ${colors.primary} 0%, transparent 70%)`,
            }}
            animate={{
              scale: [1, 1.5, 1],
              opacity: [0.8, 0, 0.8],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
          <motion.div
            className="absolute rounded-full"
            style={{
              width: currentSize.glow,
              height: currentSize.glow,
              background: `radial-gradient(circle, ${colors.secondary} 0%, transparent 70%)`,
            }}
            animate={{
              scale: [1, 1.8, 1],
              opacity: [0.6, 0, 0.6],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: 0.3,
            }}
          />
        </>
      )}
      
      {isListening && !isSpeaking && (
        <motion.div
          className={`absolute rounded-full border-2 ${colors.ring} ${currentSize.container}`}
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      )}
      
      <motion.div
        className={`relative ${currentSize.container} rounded-full overflow-hidden border-2 border-white/20 ${isSpeaking ? `shadow-2xl ${colors.shadow}` : 'shadow-lg'}`}
        animate={isSpeaking ? {
          scale: [1, 1.03, 1],
        } : {}}
        transition={{
          duration: 0.6,
          repeat: isSpeaking ? Infinity : 0,
          ease: 'easeInOut',
        }}
      >
        <img
          src={robotImage}
          alt="AI Tutor"
          className="w-full h-full object-cover object-top"
        />
        
        {isSpeaking && (
          <motion.div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(circle at center, ${colors.primary} 0%, transparent 60%)`,
            }}
            animate={{
              opacity: [0.2, 0.4, 0.2],
            }}
            transition={{
              duration: 0.8,
              repeat: Infinity,
            }}
          />
        )}
      </motion.div>
      
      {isSpeaking && (
        <div className="absolute -bottom-4 flex items-end gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.div
              key={i}
              className="w-1 rounded-full"
              style={{
                backgroundColor: colors.primary.replace('0.6', '1').replace('0.5', '1'),
              }}
              animate={{
                height: [4, 16, 4],
              }}
              transition={{
                duration: 0.4,
                repeat: Infinity,
                delay: i * 0.1,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>
      )}
      
    </div>
  );
}
