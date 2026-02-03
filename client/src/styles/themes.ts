export type AgeGroup = 'K-2' | '3-5' | '6-8' | '9-12' | 'College';

export interface Theme {
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  cardBg: string;
  textPrimary: string;
  textSecondary: string;
  celebration: string;
  borderRadius: string;
  avatarStyle: 'cartoon' | 'friendly' | 'modern' | 'minimal';
  tutorName: string;
  tutorEmoji: string;
}

export const themes: Record<AgeGroup, Theme> = {
  'K-2': {
    name: 'Playful',
    primary: '#FF6B6B',
    secondary: '#4ECDC4',
    accent: '#FFE66D',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    cardBg: 'rgba(255,255,255,0.95)',
    textPrimary: '#2D3436',
    textSecondary: '#636E72',
    celebration: '🎉🌟⭐🎊',
    borderRadius: '24px',
    avatarStyle: 'cartoon',
    tutorName: 'Sunny',
    tutorEmoji: '🌟',
  },
  '3-5': {
    name: 'Adventure',
    primary: '#6C5CE7',
    secondary: '#00B894',
    accent: '#FDCB6E',
    background: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
    cardBg: 'rgba(255,255,255,0.9)',
    textPrimary: '#2D3436',
    textSecondary: '#636E72',
    celebration: '🚀✨🏆💪',
    borderRadius: '16px',
    avatarStyle: 'friendly',
    tutorName: 'Max',
    tutorEmoji: '🚀',
  },
  '6-8': {
    name: 'Explorer',
    primary: '#0984E3',
    secondary: '#00CEC9',
    accent: '#FD79A8',
    background: 'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
    cardBg: '#FFFFFF',
    textPrimary: '#2D3436',
    textSecondary: '#636E72',
    celebration: '🔥💯🎯👏',
    borderRadius: '12px',
    avatarStyle: 'modern',
    tutorName: 'Alex',
    tutorEmoji: '🎯',
  },
  '9-12': {
    name: 'Focus',
    primary: '#6C5CE7',
    secondary: '#A29BFE',
    accent: '#FD79A8',
    background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)',
    cardBg: 'rgba(255,255,255,0.08)',
    textPrimary: '#FFFFFF',
    textSecondary: '#A0AEC0',
    celebration: '💪🎯✅',
    borderRadius: '8px',
    avatarStyle: 'minimal',
    tutorName: 'Jordan',
    tutorEmoji: '💡',
  },
  'College': {
    name: 'Professional',
    primary: '#5F27CD',
    secondary: '#48DBFB',
    accent: '#FF9F43',
    background: '#F8F9FA',
    cardBg: '#FFFFFF',
    textPrimary: '#212529',
    textSecondary: '#6C757D',
    celebration: '✓',
    borderRadius: '8px',
    avatarStyle: 'minimal',
    tutorName: 'Professor',
    tutorEmoji: '🎓',
  },
};

export function getTheme(ageGroup: string | undefined): Theme {
  const normalized = normalizeAgeGroup(ageGroup);
  return themes[normalized];
}

export function normalizeAgeGroup(ageGroup: string | undefined): AgeGroup {
  if (!ageGroup) return 'College';
  
  const normalized = ageGroup.toLowerCase().replace(/\s+/g, '');
  
  if (normalized.includes('k-2') || normalized.includes('k2') || normalized === 'k-2') return 'K-2';
  if (normalized.includes('3-5') || normalized.includes('35') || normalized === '3-5') return '3-5';
  if (normalized.includes('6-8') || normalized.includes('68') || normalized === '6-8') return '6-8';
  if (normalized.includes('9-12') || normalized.includes('912') || normalized === '9-12') return '9-12';
  if (normalized.includes('college') || normalized.includes('adult')) return 'College';
  
  return 'College';
}

export function isYoungLearner(ageGroup: string | undefined): boolean {
  const normalized = normalizeAgeGroup(ageGroup);
  return normalized === 'K-2' || normalized === '3-5';
}

export function isMiddleSchool(ageGroup: string | undefined): boolean {
  const normalized = normalizeAgeGroup(ageGroup);
  return normalized === '6-8';
}

export function showGamification(ageGroup: string | undefined): boolean {
  const normalized = normalizeAgeGroup(ageGroup);
  return normalized === 'K-2' || normalized === '3-5' || normalized === '6-8';
}
