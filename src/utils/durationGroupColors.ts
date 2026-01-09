export const DURATION_GROUP_COLORS = {
  purple: { color: '#a855f7', label: 'Purple Group' },
  pink: { color: '#ec4899', label: 'Pink Group' },
  emerald: { color: '#10b981', label: 'Emerald Group' },
  teal: { color: '#14b8a6', label: 'Teal Group' },
  indigo: { color: '#6366f1', label: 'Indigo Group' },
  orange: { color: '#f97316', label: 'Orange Group' },
  lime: { color: '#84cc16', label: 'Lime Group' },
  cyan: { color: '#06b6d4', label: 'Cyan Group' },
  fuchsia: { color: '#d946ef', label: 'Fuchsia Group' },
  rose: { color: '#f43f5e', label: 'Rose Group' },
} as const;

export type DurationGroupColor = keyof typeof DURATION_GROUP_COLORS | null;

export const DURATION_GROUP_COLOR_ORDER: (keyof typeof DURATION_GROUP_COLORS)[] = [
  'purple', 'pink', 'emerald', 'teal', 'indigo',
  'orange', 'lime', 'cyan', 'fuchsia', 'rose'
];

export function getNextGroupColor(current: DurationGroupColor): DurationGroupColor {
  if (current === null) return DURATION_GROUP_COLOR_ORDER[0]; // Start with purple
  const idx = DURATION_GROUP_COLOR_ORDER.indexOf(current);
  if (idx === -1) return DURATION_GROUP_COLOR_ORDER[0];
  // Cycle through colors
  return DURATION_GROUP_COLOR_ORDER[(idx + 1) % DURATION_GROUP_COLOR_ORDER.length];
}

export function getGroupColorConfig(color: DurationGroupColor) {
  return color ? DURATION_GROUP_COLORS[color] : null;
}
