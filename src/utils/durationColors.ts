import type { DurationColor } from '../types';

export const DURATION_COLORS = {
  red: {
    borderColor: '#ef4444', // red-500 - High Priority
    label: 'High Priority',
  },
  amber: {
    borderColor: '#f59e0b', // amber-500 - Medium Priority
    label: 'Medium Priority',
  },
  sky: {
    borderColor: '#0ea5e9', // sky-500 - Low Priority (matches primary-500)
    label: 'Low Priority',
  },
} as const;

export const DURATION_COLOR_ORDER: (keyof typeof DURATION_COLORS)[] = ['red', 'amber', 'sky'];

/**
 * Get the next color in the cycle: null → red → amber → sky → null
 */
export function getNextDurationColor(current: DurationColor): DurationColor {
  if (current === null) return 'red';
  const idx = DURATION_COLOR_ORDER.indexOf(current);
  if (idx === -1 || idx === DURATION_COLOR_ORDER.length - 1) return null;
  return DURATION_COLOR_ORDER[idx + 1];
}
