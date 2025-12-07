import type { ImportanceColor } from '../types';
import type { CSSProperties } from 'react';

export const IMPORTANCE_COLORS = {
  emerald: {
    borderColor: '#10b981', // emerald-500
    bg: 'bg-emerald-500',
    label: 'Low',
  },
  amber: {
    borderColor: '#f59e0b', // amber-500
    bg: 'bg-amber-500',
    label: 'Medium',
  },
  rose: {
    borderColor: '#f43f5e', // rose-500
    bg: 'bg-rose-500',
    label: 'High',
  },
} as const;

export const IMPORTANCE_COLOR_ORDER: (keyof typeof IMPORTANCE_COLORS)[] = ['emerald', 'amber', 'rose'];

export function getImportanceBorderStyle(color: ImportanceColor): CSSProperties {
  if (!color) return {};
  return {
    borderLeftWidth: '4px',
    borderLeftColor: IMPORTANCE_COLORS[color].borderColor,
    borderLeftStyle: 'solid',
  };
}
