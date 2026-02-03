import { createContext, useContext, ReactNode, useMemo } from 'react';
import { Theme, getTheme, normalizeAgeGroup, AgeGroup } from '@/styles/themes';

interface ThemeContextValue {
  theme: Theme;
  ageGroup: AgeGroup;
  isYoungLearner: boolean;
  showGamification: boolean;
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
      showGamification: normalized === 'K-2' || normalized === '3-5' || normalized === '6-8',
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
    return {
      theme: getTheme('College'),
      ageGroup: 'College',
      isYoungLearner: false,
      showGamification: false,
    };
  }
  return context;
}
