export const DURATION_GROUP_COLORS = {
  lime: { color: '#84cc16', label: 'Lime Group' },
  cyan: { color: '#06b6d4', label: 'Cyan Group' },
  orange: { color: '#f97316', label: 'Orange Group' },
  teal: { color: '#14b8a6', label: 'Teal Group' },
  rose: { color: '#f43f5e', label: 'Rose Group' },
  yellow: { color: '#eab308', label: 'Yellow Group' },
  pink: { color: '#ec4899', label: 'Pink Group' },
  emerald: { color: '#10b981', label: 'Emerald Group' },
  blue: { color: '#3b82f6', label: 'Blue Group' },
  fuchsia: { color: '#d946ef', label: 'Fuchsia Group' },
} as const;

export type DurationGroupColor = keyof typeof DURATION_GROUP_COLORS | null;

export const DURATION_GROUP_COLOR_ORDER: (keyof typeof DURATION_GROUP_COLORS)[] = [
  'lime', 'yellow', 'orange', 'rose', 'pink',
  'fuchsia', 'blue', 'cyan', 'teal', 'emerald'
];

export function getNextGroupColor(current: DurationGroupColor): DurationGroupColor {
  if (current === null) return DURATION_GROUP_COLOR_ORDER[0]; // Start with lime
  const idx = DURATION_GROUP_COLOR_ORDER.indexOf(current);
  if (idx === -1) return DURATION_GROUP_COLOR_ORDER[0]; // Unknown/legacy color → start fresh
  // Cycle through colors
  return DURATION_GROUP_COLOR_ORDER[(idx + 1) % DURATION_GROUP_COLOR_ORDER.length];
}

// Cycles through group colors INCLUDING null: null → lime → ... → fuchsia → null
export function getNextGroupColorWithNull(current: DurationGroupColor): DurationGroupColor {
  if (current === null) return DURATION_GROUP_COLOR_ORDER[0];
  const idx = DURATION_GROUP_COLOR_ORDER.indexOf(current);
  if (idx === -1) return null; // Unknown/legacy color → reset to null
  if (idx === DURATION_GROUP_COLOR_ORDER.length - 1) return null;
  return DURATION_GROUP_COLOR_ORDER[idx + 1];
}

export function getGroupColorConfig(color: DurationGroupColor) {
  return color ? DURATION_GROUP_COLORS[color] : null;
}
