export const THEME_STORAGE_KEY = 'theme_preference';
export const THEME_OPTIONS = ['system', 'light', 'dark'];

function isThemeOption(value) {
  return THEME_OPTIONS.includes(value);
}

export function getStoredThemePreference() {
  if (typeof window === 'undefined') {
    return 'system';
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isThemeOption(stored) ? stored : 'system';
}

export function getSystemTheme() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveTheme(preference) {
  return preference === 'system' ? getSystemTheme() : preference;
}

export function applyThemePreference(preference) {
  const normalizedPreference = isThemeOption(preference) ? preference : 'system';
  const resolvedTheme = resolveTheme(normalizedPreference);

  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.dataset.themePreference = normalizedPreference;
  }

  if (typeof window !== 'undefined') {
    if (normalizedPreference === 'system') {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      window.localStorage.setItem(THEME_STORAGE_KEY, normalizedPreference);
    }
  }

  return resolvedTheme;
}

export function initTheme() {
  return applyThemePreference(getStoredThemePreference());
}