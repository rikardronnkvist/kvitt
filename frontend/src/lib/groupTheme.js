export const GROUP_THEMES = [
  { id: 'fjord-teal',    name: 'Fjord Teal',    base: '#0F766E' },
  { id: 'slate-blue',    name: 'Slate Blue',    base: '#4F6D8A' },
  { id: 'moss-green',    name: 'Moss Green',    base: '#5F7D4E' },
  { id: 'clay-rust',     name: 'Clay Rust',     base: '#B25D3D' },
  { id: 'dusty-rose',    name: 'Dusty Rose',    base: '#B46A7A' },
  { id: 'aubergine',     name: 'Aubergine',     base: '#6E4E73' },
  { id: 'mustard-gold',  name: 'Mustard Gold',  base: '#B38A2E' },
  { id: 'storm-gray',    name: 'Storm Gray',    base: '#5C6B73' },
  { id: 'petrol-blue',   name: 'Petrol Blue',   base: '#2F6F7E' },
  { id: 'terracotta',    name: 'Terracotta',    base: '#C06A4A' },
];

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
    : '0, 0, 0';
}

export function getGroupTheme(themeIdOrIndex) {
  let theme;
  if (typeof themeIdOrIndex === 'number') {
    theme = GROUP_THEMES[themeIdOrIndex % GROUP_THEMES.length];
  } else {
    theme = GROUP_THEMES.find((t) => t.id === themeIdOrIndex) ?? GROUP_THEMES[0];
  }

  const rgb = hexToRgb(theme.base);
  return {
    ...theme,
    bgSoft: `rgba(${rgb}, 0.09)`,
    borderSoft: `rgba(${rgb}, 0.22)`,
    textStrong: theme.base,
  };
}

/** Returns a theme derived from group.id when no explicit theme is set. */
export function getThemeForGroup(group) {
  if (group?.theme_color) return getGroupTheme(group.theme_color);
  return getGroupTheme((group?.id ?? 0) % GROUP_THEMES.length);
}
