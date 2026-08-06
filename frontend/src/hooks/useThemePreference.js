import { useEffect, useState } from 'react';
import { applyThemePreference, getStoredThemePreference } from '../lib/theme.js';

export function useThemePreference() {
  const [themePreference, setThemePreference] = useState(() => getStoredThemePreference());

  useEffect(() => {
    applyThemePreference(themePreference);
  }, [themePreference]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (getStoredThemePreference() === 'system') {
        applyThemePreference('system');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return { themePreference, setThemePreference };
}