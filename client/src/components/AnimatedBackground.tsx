import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { useAgeTheme } from '@/contexts/ThemeContext';

interface FloatingShape {
  id: number;
  size: number;
  x: number;
  y: number;
  hue: number;
  duration: number;
  delay: number;
}

export function AnimatedBackground() {
  const { ageGroup, theme } = useAgeTheme();
  
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);
  
  const shapes = useMemo((): FloatingShape[] => {
    if (ageGroup !== 'K-2' && ageGroup !== '3-5') return [];
    
    return [...Array(6)].map((_, i) => ({
      id: i,
      size: 50 + (i * 20) % 100,
      x: (i * 17) % 100,
      y: (i * 23) % 100,
      hue: ageGroup === 'K-2' ? 280 + (i * 30) % 80 : 160 + (i * 40) % 100,
      duration: 4 + (i % 3),
      delay: i * 0.5,
    }));
  }, [ageGroup]);
  
  if (shapes.length === 0 || prefersReducedMotion) {
    return (
      <div 
        className="fixed inset-0 z-0 pointer-events-none"
        style={{ background: theme.background }}
        aria-hidden="true"
      />
    );
  }
  
  return (
    <div 
      className="fixed inset-0 overflow-hidden pointer-events-none z-0"
      style={{ background: theme.background }}
      aria-hidden="true"
    >
      {shapes.map((shape) => (
        <motion.div
          key={shape.id}
          className="absolute rounded-full opacity-20 blur-sm"
          style={{
            width: shape.size,
            height: shape.size,
            background: `hsl(${shape.hue}, 70%, 70%)`,
            left: `${shape.x}%`,
            top: `${shape.y}%`,
          }}
          animate={{
            y: [0, -30, 0],
            x: [0, 15, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: shape.duration,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: shape.delay,
          }}
        />
      ))}
    </div>
  );
}
