import { motion, useAnimation, AnimatePresence } from 'framer-motion';
import { useEffect, useRef } from 'react';

export type OrbState = 'idle' | 'speaking' | 'listening' | 'thinking';

interface AIOrbProps {
  state: OrbState;
  size?: number;
  ageGroup?: '6-8' | '9-12' | 'College';
}

// Color palettes per age group
const PALETTES = {
  '6-8':    { core: '#06b6d4', mid: '#3b82f6', glow: 'rgba(6,182,212,0.6)',  ring: '#22d3ee' },
  '9-12':   { core: '#8b5cf6', mid: '#a855f7', glow: 'rgba(139,92,246,0.6)', ring: '#c084fc' },
  'College':{ core: '#C0003C', mid: '#e11d48', glow: 'rgba(192,0,60,0.55)',  ring: '#fb7185' },
};

export function AIOrb({ state, size = 100, ageGroup = 'College' }: AIOrbProps) {
  const pal = PALETTES[ageGroup] ?? PALETTES['College'];
  const r = size / 2;
  const orbId = `orb-${ageGroup}-${size}`;

  // Ear path (stylised ear shape as SVG path centered at 0,0 within size×size viewBox)
  // Orb path = circle approximation via cubic bezier
  const circleD = `M ${r},0 C ${r*1.55},0 ${size},${r*0.45} ${size},${r} C ${size},${r*1.55} ${r*1.55},${size} ${r},${size} C ${r*0.45},${size} 0,${r*1.55} 0,${r} C 0,${r*0.45} ${r*0.45},0 ${r},0 Z`;

  // Ear shape: outer curve + inner antihelix
  const earD = `
    M ${r*0.55},${r*0.08}
    C ${r*0.2},${r*0.08} ${r*0.05},${r*0.38} ${r*0.05},${r*0.72}
    C ${r*0.05},${r*1.35} ${r*0.38},${r*1.88} ${r*0.85},${r*1.92}
    C ${r*1.22},${r*1.95} ${r*1.55},${r*1.7} ${r*1.6},${r*1.32}
    C ${r*1.65},${r*0.95} ${r*1.42},${r*0.72} ${r*1.28},${r*0.68}
    C ${r*1.18},${r*0.65} ${r*1.08},${r*0.75} ${r*1.05},${r*0.88}
    C ${r*1.0},${r*1.05} ${r*1.08},${r*1.18} ${r*1.05},${r*1.32}
    C ${r*1.0},${r*1.52} ${r*0.82},${r*1.62} ${r*0.68},${r*1.55}
    C ${r*0.5},${r*1.45} ${r*0.4},${r*1.15} ${r*0.42},${r*0.85}
    C ${r*0.45},${r*0.52} ${r*0.62},${r*0.28} ${r*0.9},${r*0.22}
    C ${r*1.25},${r*0.15} ${r*1.55},${r*0.32} ${r*1.6},${r*0.62}
    C ${r*1.65},${r*0.82} ${r*1.55},${r*0.95} ${r*1.45},${r*1.0}
    Z
  `;

  const morphPath = state === 'listening' ? earD : circleD;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>

      {/* Outer ambient glow rings */}
      <AnimatePresence>
        {state === 'speaking' && (
          <>
            {[1.6, 1.9, 2.2].map((scale, i) => (
              <motion.div
                key={`ring-${i}`}
                className="absolute rounded-full"
                style={{
                  width: size,
                  height: size,
                  background: `radial-gradient(circle, ${pal.glow} 0%, transparent 65%)`,
                  borderRadius: '50%',
                }}
                initial={{ scale: 1, opacity: 0 }}
                animate={{ scale, opacity: [0.5, 0] }}
                transition={{
                  duration: 1.8,
                  repeat: Infinity,
                  delay: i * 0.5,
                  ease: 'easeOut',
                }}
              />
            ))}
          </>
        )}
        {state === 'listening' && (
          <>
            {[1, 2].map((i) => (
              <motion.div
                key={`listen-ring-${i}`}
                className="absolute"
                style={{
                  width: size * 0.15,
                  height: size * 0.15,
                  borderRadius: '50%',
                  background: pal.ring,
                  top: '50%',
                  left: '50%',
                  marginLeft: size * 0.38 * i,
                  marginTop: -(size * 0.075),
                  opacity: 0.5,
                }}
                animate={{
                  x: [0, size * 0.12 * i, 0],
                  opacity: [0.6, 0, 0.6],
                  scale: [1, 1.8, 1],
                }}
                transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.3, ease: 'easeInOut' }}
              />
            ))}
          </>
        )}
      </AnimatePresence>

      {/* The orb SVG — morphs between circle and ear */}
      <motion.svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}
        animate={
          state === 'speaking'
            ? { scale: [1, 1.04, 1] }
            : state === 'idle'
            ? { y: [0, -4, 0] }
            : state === 'thinking'
            ? { rotate: [0, 360] }
            : {}
        }
        transition={
          state === 'thinking'
            ? { duration: 3, repeat: Infinity, ease: 'linear' }
            : { duration: state === 'speaking' ? 0.7 : 3.5, repeat: Infinity, ease: 'easeInOut' }
        }
      >
        <defs>
          {/* Plasma gradient */}
          <radialGradient id={`${orbId}-core`} cx="38%" cy="35%" r="65%">
            <stop offset="0%" stopColor="white" stopOpacity="0.95" />
            <stop offset="28%" stopColor={pal.core} stopOpacity="0.9" />
            <stop offset="70%" stopColor={pal.mid} stopOpacity="0.85" />
            <stop offset="100%" stopColor="#1a0010" stopOpacity="0.95" />
          </radialGradient>

          {/* Glass shine */}
          <radialGradient id={`${orbId}-shine`} cx="30%" cy="22%" r="45%">
            <stop offset="0%" stopColor="white" stopOpacity="0.6" />
            <stop offset="60%" stopColor="white" stopOpacity="0.08" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>

          {/* Inner plasma swirl */}
          <radialGradient id={`${orbId}-plasma`} cx="65%" cy="65%" r="55%">
            <stop offset="0%" stopColor={pal.ring} stopOpacity="0.5" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>

          {/* Glow filter */}
          <filter id={`${orbId}-glow`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation={size * 0.08} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Listening glow filter */}
          <filter id={`${orbId}-listen-glow`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation={size * 0.05} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <clipPath id={`${orbId}-clip`}>
            <motion.path
              d={morphPath}
              animate={{ d: morphPath }}
              transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
            />
          </clipPath>
        </defs>

        {/* Drop shadow ellipse */}
        <ellipse
          cx={r}
          cy={size * 0.92}
          rx={r * 0.55}
          ry={r * 0.08}
          fill="black"
          opacity={0.12}
        />

        {/* Main orb shape — morphing */}
        <motion.path
          d={morphPath}
          animate={{ d: morphPath }}
          transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
          fill={`url(#${orbId}-core)`}
          filter={`url(#${orbId}-glow)`}
        />

        {/* Plasma secondary layer */}
        <motion.path
          d={morphPath}
          animate={{ d: morphPath }}
          transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
          fill={`url(#${orbId}-plasma)`}
          opacity={state === 'speaking' ? 0.7 : 0.35}
        />

        {/* Glass shine */}
        <motion.path
          d={morphPath}
          animate={{ d: morphPath }}
          transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
          fill={`url(#${orbId}-shine)`}
        />

        {/* Thinking: spinning arc */}
        {state === 'thinking' && (
          <motion.circle
            cx={r}
            cy={r}
            r={r * 0.75}
            fill="none"
            stroke={pal.ring}
            strokeWidth={size * 0.04}
            strokeDasharray={`${r * 1.2} ${r * 3.5}`}
            opacity={0.7}
          />
        )}

        {/* Speaking: internal ripple rings */}
        {state === 'speaking' && (
          <>
            {[0.3, 0.5].map((scale, i) => (
              <motion.circle
                key={`ripple-${i}`}
                cx={r}
                cy={r}
                r={r * scale}
                fill="none"
                stroke="white"
                strokeWidth={size * 0.015}
                opacity={0}
                animate={{ r: [r * scale, r * 0.85], opacity: [0.4, 0] }}
                transition={{ duration: 1.0, repeat: Infinity, delay: i * 0.4, ease: 'easeOut' }}
              />
            ))}
          </>
        )}

        {/* Listening: sound wave arcs */}
        {state === 'listening' && (
          <>
            {[1.15, 1.35, 1.55].map((scale, i) => (
              <motion.circle
                key={`wave-${i}`}
                cx={r * 1.5}
                cy={r}
                r={r * 0.2 * scale}
                fill="none"
                stroke={pal.ring}
                strokeWidth={size * 0.02}
                animate={{ opacity: [0.7, 0], scale: [1, 1.3] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.25, ease: 'easeOut' }}
              />
            ))}
          </>
        )}
      </motion.svg>

      {/* Sound bars below orb when speaking */}
      <AnimatePresence>
        {state === 'speaking' && (
          <motion.div
            className="absolute flex gap-0.5 items-end"
            style={{ bottom: -size * 0.14 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {[3, 7, 11, 7, 3].map((h, i) => (
              <motion.div
                key={i}
                style={{
                  width: size * 0.04,
                  borderRadius: size * 0.02,
                  background: pal.core,
                }}
                animate={{ height: [h, h * 2.2, h] }}
                transition={{ duration: 0.45, repeat: Infinity, delay: i * 0.09, ease: 'easeInOut' }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Idle: gentle floating particles */}
      {state === 'idle' && (
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(4)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full"
              style={{
                width: size * 0.06,
                height: size * 0.06,
                background: pal.ring,
                left: `${20 + i * 20}%`,
                top: `${30 + (i % 2) * 30}%`,
                opacity: 0.5,
              }}
              animate={{
                y: [0, -size * 0.18, 0],
                opacity: [0.4, 0.8, 0.4],
              }}
              transition={{ duration: 2.5 + i * 0.4, repeat: Infinity, delay: i * 0.6, ease: 'easeInOut' }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
