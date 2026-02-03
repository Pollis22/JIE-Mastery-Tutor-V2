import { createContext, useContext, ReactNode, useMemo } from 'react';
import { Theme, getTheme, normalizeAgeGroup, AgeGroup, isDarkTheme } from '@/styles/themes';

interface ThemeContextValue {
  theme: Theme;
  ageGroup: AgeGroup;
  isYoungLearner: boolean;
  isMiddleSchool: boolean;
  showGamification: boolean;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: ReactNode;
  ageGroup: string | undefined;
}

export function AgeThemeProvider({ children, ageGroup }: ThemeProviderProps) {
  const value = useMemo(() => {
    const normalized = normalizeAgeGroup(ageGroup);
    const theme = getTheme(ageGroup);
    
    return {
      theme,
      ageGroup: normalized,
      isYoungLearner: normalized === 'K-2' || normalized === '3-5',
      isMiddleSchool: normalized === '6-8',
      showGamification: theme.showXP,
      isDark: theme.isDark,
    };
  }, [ageGroup]);
  
  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAgeTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    const theme = getTheme('College');
    return {
      theme,
      ageGroup: 'College',
      isYoungLearner: false,
      isMiddleSchool: false,
      showGamification: false,
      isDark: false,
    };
  }
  return context;
}
