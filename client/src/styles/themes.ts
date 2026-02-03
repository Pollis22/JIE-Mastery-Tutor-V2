export type AgeGroup = 'K-2' | '3-5' | '6-8' | '9-12' | 'College';
export type AvatarStyle = 'emoji' | 'geometric' | 'waveform' | 'minimal';

export interface Theme {
  name: string;
  id: string;
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  backgroundClass: string;
  cardBg: string;
  textPrimary: string;
  textSecondary: string;
  celebration: string;
  borderRadius: string;
  avatarStyle: AvatarStyle;
  tutorName: string;
  tutorEmoji: string;
  floatingShapes: boolean;
  showXP: boolean;
  showStreak: boolean;
  isDark: boolean;
  messageBubbleClass: string;
  userBubbleClass: string;
  inputClass: string;
  accentColor: string;
}

export const themes: Record<AgeGroup, Theme> = {
  'K-2': {
    name: 'Playful',
    id: 'playful',
    primary: '#FF6B6B',
    secondary: '#4ECDC4',
    accent: '#FFE66D',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    backgroundClass: 'bg-gradient-to-br from-cyan-100 via-purple-50 to-pink-100',
    cardBg: 'rgba(255,255,255,0.95)',
    textPrimary: '#2D3436',
    textSecondary: '#636E72',
    celebration: '🎉🌟⭐🎊',
    borderRadius: '24px',
    avatarStyle: 'emoji',
    tutorName: 'Sunny',
    tutorEmoji: '🌟',
    floatingShapes: true,
    showXP: true,
    showStreak: true,
    isDark: false,
    messageBubbleClass: 'bg-gradient-to-br from-purple-500 to-purple-600 text-white',
    userBubbleClass: 'bg-white shadow-md text-gray-800',
    inputClass: 'rounded-full bg-white shadow-lg border-0',
    accentColor: 'purple',
  },
  '3-5': {
    name: 'Adventure',
    id: 'adventure',
    primary: '#6C5CE7',
    secondary: '#00B894',
    accent: '#FDCB6E',
    background: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
    backgroundClass: 'bg-gradient-to-br from-cyan-50 via-purple-50 to-pink-50',
    cardBg: 'rgba(255,255,255,0.9)',
    textPrimary: '#2D3436',
    textSecondary: '#636E72',
    celebration: '🚀✨🏆💪',
    borderRadius: '16px',
    avatarStyle: 'emoji',
    tutorName: 'Max',
    tutorEmoji: '🚀',
    floatingShapes: true,
    showXP: true,
    showStreak: true,
    isDark: false,
    messageBubbleClass: 'bg-gradient-to-br from-purple-500 to-purple-600 text-white',
    userBubbleClass: 'bg-white shadow-md text-gray-800',
    inputClass: 'rounded-full bg-white shadow-lg border-0',
    accentColor: 'purple',
  },
  '6-8': {
    name: 'Explorer',
    id: 'explorer',
    primary: '#0984E3',
    secondary: '#00CEC9',
    accent: '#00D9FF',
    background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #1e1b4b 100%)',
    backgroundClass: 'bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900',
    cardBg: 'rgba(30, 41, 59, 0.9)',
    textPrimary: '#F1F5F9',
    textSecondary: '#94A3B8',
    celebration: '🔥💯🎯👏',
    borderRadius: '12px',
    avatarStyle: 'geometric',
    tutorName: 'Nova',
    tutorEmoji: '🎯',
    floatingShapes: false,
    showXP: true,
    showStreak: true,
    isDark: true,
    messageBubbleClass: 'bg-slate-700/90 border border-slate-600 text-gray-100',
    userBubbleClass: 'bg-indigo-600 text-white',
    inputClass: 'rounded-xl bg-slate-800 border border-slate-600',
    accentColor: 'cyan',
  },
  '9-12': {
    name: 'Focus',
    id: 'focus',
    primary: '#8B5CF6',
    secondary: '#A78BFA',
    accent: '#C4B5FD',
    background: 'linear-gradient(180deg, #0a0a0f 0%, #1a1a2e 100%)',
    backgroundClass: 'bg-[#0a0a0f]',
    cardBg: 'rgba(39, 39, 42, 0.8)',
    textPrimary: '#FAFAFA',
    textSecondary: '#A1A1AA',
    celebration: '💪🎯✅',
    borderRadius: '8px',
    avatarStyle: 'waveform',
    tutorName: 'Sage',
    tutorEmoji: '💡',
    floatingShapes: false,
    showXP: false,
    showStreak: false,
    isDark: true,
    messageBubbleClass: 'bg-zinc-800/80 border border-zinc-700 text-gray-200',
    userBubbleClass: 'bg-violet-600 text-white',
    inputClass: 'rounded-lg bg-zinc-900 border border-zinc-700',
    accentColor: 'violet',
  },
  'College': {
    name: 'Professional',
    id: 'professional',
    primary: '#374151',
    secondary: '#6B7280',
    accent: '#10B981',
    background: '#F9FAFB',
    backgroundClass: 'bg-gray-50',
    cardBg: '#FFFFFF',
    textPrimary: '#111827',
    textSecondary: '#6B7280',
    celebration: '✓',
    borderRadius: '8px',
    avatarStyle: 'minimal',
    tutorName: 'Professor',
    tutorEmoji: '🎓',
    floatingShapes: false,
    showXP: false,
    showStreak: false,
    isDark: false,
    messageBubbleClass: 'bg-white border border-gray-200 shadow-sm text-gray-800',
    userBubbleClass: 'bg-gray-800 text-white',
    inputClass: 'rounded-lg bg-white border border-gray-300',
    accentColor: 'gray',
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

export function isDarkTheme(ageGroup: string | undefined): boolean {
  const normalized = normalizeAgeGroup(ageGroup);
  return normalized === '6-8' || normalized === '9-12';
}
