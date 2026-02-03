import confetti from 'canvas-confetti';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useAgeTheme } from '@/contexts/ThemeContext';

type CelebrationIntensity = 'small' | 'medium' | 'big';

const configs: Record<CelebrationIntensity, confetti.Options> = {
  small: { 
    particleCount: 30, 
    spread: 50,
    origin: { y: 0.7 },
  },
  medium: { 
    particleCount: 80, 
    spread: 70, 
    startVelocity: 30,
    origin: { y: 0.7 },
  },
  big: { 
    particleCount: 150, 
    spread: 100, 
    startVelocity: 45,
    origin: { y: 0.6 },
  },
};

const colors = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#6C5CE7', '#00B894', '#FD79A8'];

export function triggerCelebration(intensity: CelebrationIntensity = 'medium') {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;
  
  confetti({
    ...configs[intensity],
    colors,
    disableForReducedMotion: true,
  });
}

export function triggerSideCelebration() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;
  
  const end = Date.now() + 500;
  
  const frame = () => {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
      colors,
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
      colors,
    });
    
    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  };
  
  frame();
}

interface SuccessPopupProps {
  message: string;
  emoji: string;
  onComplete?: () => void;
}

export function SuccessPopup({ message, emoji, onComplete }: SuccessPopupProps) {
  const [visible, setVisible] = useState(true);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onComplete?.();
    }, 2000);
    
    return () => clearTimeout(timer);
  }, [onComplete]);
  
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ scale: 0, y: 50, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0, y: -50, opacity: 0 }}
          className="fixed top-1/3 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
        >
          <div className="bg-gradient-to-r from-green-400 to-blue-500 text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-3">
            <motion.span 
              className="text-4xl"
              animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.2, 1] }}
              transition={{ duration: 0.5 }}
            >
              {emoji}
            </motion.span>
            <span className="text-xl font-bold">{message}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface AchievementPopupProps {
  title: string;
  emoji: string;
  xp?: number;
  onComplete?: () => void;
}

export function AchievementPopup({ title, emoji, xp, onComplete }: AchievementPopupProps) {
  const { showGamification } = useAgeTheme();
  const [visible, setVisible] = useState(true);
  
  useEffect(() => {
    if (!showGamification) {
      onComplete?.();
      return;
    }
    
    triggerCelebration('medium');
    
    const timer = setTimeout(() => {
      setVisible(false);
      onComplete?.();
    }, 3000);
    
    return () => clearTimeout(timer);
  }, [onComplete, showGamification]);
  
  if (!showGamification) return null;
  
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ x: 300, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 300, opacity: 0 }}
          className="fixed top-20 right-4 z-50"
        >
          <div className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white p-4 rounded-xl shadow-2xl">
            <div className="flex items-center gap-3">
              <motion.span 
                className="text-4xl"
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ duration: 0.5, repeat: 2 }}
              >
                {emoji}
              </motion.span>
              <div>
                <div className="font-bold text-lg">{title}</div>
                {xp && <div className="text-sm opacity-90">+{xp} XP</div>}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
