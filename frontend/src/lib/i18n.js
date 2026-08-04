import svSe from '../i18n/sv-se.json';

const DEFAULT_LANGUAGE = 'sv-se';
const SUPPORTED_LANGUAGES = {
  'sv-se': svSe,
};

const runtimeLanguage = typeof window !== 'undefined' ? window.__kvittConfig?.language : undefined;
const configuredLanguage = String(runtimeLanguage || import.meta.env.VITE_LANGUAGE || DEFAULT_LANGUAGE).trim().toLowerCase();

const activeLanguage = SUPPORTED_LANGUAGES[configuredLanguage]
  ? configuredLanguage
  : DEFAULT_LANGUAGE;

const dictionary = SUPPORTED_LANGUAGES[activeLanguage];

function getValue(path) {
  return path.split('.').reduce((acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined), dictionary);
}

export function getLanguage() {
  return activeLanguage;
}

export function t(key, variables = {}) {
  const template = getValue(key);
  if (typeof template !== 'string') {
    return key;
  }

  return template.replace(/\{(\w+)\}/g, (_, name) => {
    if (variables[name] == null) return `{${name}}`;
    return String(variables[name]);
  });
}
