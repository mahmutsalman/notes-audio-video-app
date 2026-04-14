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
