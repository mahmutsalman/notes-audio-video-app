import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  // Initialize theme from electron
  useEffect(() => {
    window.electronAPI?.theme.get().then((savedTheme) => {
      setThemeState(savedTheme);
    });

    // Listen for system theme changes
    const unsubscribe = window.electronAPI?.theme.onSystemThemeChange((isDark) => {
      if (theme === 'system') {
        setResolvedTheme(isDark ? 'dark' : 'light');
      }
    });

    return () => unsubscribe?.();
  }, [theme]);

  // Resolve theme and apply to document
  useEffect(() => {
    let resolved: 'light' | 'dark';

    if (theme === 'system') {
      // Use matchMedia to detect system preference
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      resolved = isDark ? 'dark' : 'light';
    } else {
      resolved = theme;
    }

    setResolvedTheme(resolved);

    // Apply theme to document
    if (resolved === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    window.electronAPI?.theme.set(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
