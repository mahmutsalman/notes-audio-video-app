import type { DurationColor } from '../types';

export const DURATION_COLORS = {
  emerald: {
    borderColor: '#10b981', // emerald-500
    label: 'Green',
  },
  violet: {
    borderColor: '#8b5cf6', // violet-500
    label: 'Purple',
  },
  cyan: {
    borderColor: '#06b6d4', // cyan-500
    label: 'Cyan',
  },
} as const;

export const DURATION_COLOR_ORDER: (keyof typeof DURATION_COLORS)[] = ['emerald', 'violet', 'cyan'];

/**
 * Get the next color in the cycle: null → emerald → violet → cyan → null
 */
export function getNextDurationColor(current: DurationColor): DurationColor {
  if (current === null) return 'emerald';
  const idx = DURATION_COLOR_ORDER.indexOf(current);
  if (idx === -1 || idx === DURATION_COLOR_ORDER.length - 1) return null;
  return DURATION_COLOR_ORDER[idx + 1];
}
