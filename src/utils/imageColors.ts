export type ImageColorKey =
  | 'red'
  | 'orange'
  | 'amber'
  | 'lime'
  | 'emerald'
  | 'teal'
  | 'sky'
  | 'violet'
  | 'pink'
  | 'slate';

export interface ImageColorDef {
  hex: string;
  label: string;
}

export const IMAGE_COLOR_KEYS: ImageColorKey[] = [
  'red', 'orange', 'amber', 'lime', 'emerald',
  'teal', 'sky', 'violet', 'pink', 'slate',
];

/** Stacked box-shadow rings for an image's assigned colors (first key = innermost ring) */
export function buildColorRings(colorKeys: string[], ringWidth = 3): string | undefined {
  if (!colorKeys.length) return undefined;
  return colorKeys
    .map((key, i) => {
      const hex = IMAGE_COLORS[key as ImageColorKey]?.hex ?? '#888';
      return `0 0 0 ${(i + 1) * ringWidth}px ${hex}`;
    })
    .join(', ');
}

export const IMAGE_COLORS: Record<ImageColorKey, ImageColorDef> = {
  red:     { hex: '#ef4444', label: 'Red' },
  orange:  { hex: '#f97316', label: 'Orange' },
  amber:   { hex: '#f59e0b', label: 'Amber' },
  lime:    { hex: '#84cc16', label: 'Lime' },
  emerald: { hex: '#10b981', label: 'Emerald' },
  teal:    { hex: '#14b8a6', label: 'Teal' },
  sky:     { hex: '#0ea5e9', label: 'Sky' },
  violet:  { hex: '#8b5cf6', label: 'Violet' },
  pink:    { hex: '#ec4899', label: 'Pink' },
  slate:   { hex: '#64748b', label: 'Slate' },
};
