import { motion, AnimatePresence } from 'framer-motion';
import { useAgeTheme } from '@/contexts/ThemeContext';

interface SessionProgressProps {
  questionsAnswered?: number;
  streak?: number;
  xpEarned?: number;
  sessionDuration?: number;
}

export function SessionProgress({ 
  questionsAnswered = 0, 
  streak = 0, 
  xpEarned = 0,
  sessionDuration = 0,
}: SessionProgressProps) {
  const { ageGroup, showGamification, theme } = useAgeTheme();
  
  if (!showGamification) {
    if (questionsAnswered > 0 && (ageGroup === '9-12' || ageGroup === 'College')) {
      return (
        <div className="text-sm text-gray-500 flex items-center gap-2">
          <span>{questionsAnswered} topics covered</span>
          {sessionDuration > 0 && (
            <span className="text-gray-400">
              ({Math.floor(sessionDuration / 60)}min)
            </span>
          )}
        </div>
      );
    }
    return null;
  }
  
  return (
    <motion.div 
      className="flex items-center gap-3 bg-white/80 dark:bg-gray-800/80 backdrop-blur rounded-full px-4 py-2 shadow-lg"
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <AnimatePresence mode="popLayout">
        <motion.div 
          key={`xp-${xpEarned}`}
          className="flex items-center gap-1"
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 400 }}
        >
          <span className="text-xl">⭐</span>
          <motion.span 
            className="font-bold text-purple-600 dark:text-purple-400 min-w-[40px]"
            key={xpEarned}
            animate={{ scale: [1, 1.3, 1] }}
            transition={{ duration: 0.3 }}
          >
            {xpEarned}
          </motion.span>
        </motion.div>
        
        {streak > 0 && (
          <motion.div 
            key={`streak-${streak}`}
            className="flex items-center gap-1"
            initial={{ scale: 0, x: -10 }}
            animate={{ scale: 1, x: 0 }}
            exit={{ scale: 0, x: 10 }}
          >
            <motion.span 
              className="text-xl"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
            >
              🔥
            </motion.span>
            <span className="font-bold text-orange-500">{streak}</span>
          </motion.div>
        )}
        
        {questionsAnswered > 0 && (
          <motion.div 
            key={`questions-${questionsAnswered}`}
            className="flex items-center gap-1"
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
          >
            <span className="text-xl">📚</span>
            <span className="font-bold text-blue-600 dark:text-blue-400">
              {questionsAnswered}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function XPPopup({ amount, reason }: { amount: number; reason?: string }) {
  const { showGamification } = useAgeTheme();
  
  if (!showGamification) return null;
  
  return (
    <motion.div
      initial={{ y: 0, opacity: 1, scale: 1 }}
      animate={{ y: -50, opacity: 0, scale: 1.2 }}
      transition={{ duration: 1, ease: 'easeOut' }}
      className="fixed pointer-events-none z-50"
      style={{ left: '50%', top: '40%', transform: 'translateX(-50%)' }}
    >
      <div className="text-2xl font-bold text-yellow-500 drop-shadow-lg">
        +{amount} XP
        {reason && <span className="text-sm ml-2">{reason}</span>}
      </div>
    </motion.div>
  );
}
