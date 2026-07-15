import type { ReviewItem } from '../../types';

/**
 * Client-side sort for the Echo lists — applies to whatever tab is showing, on both the
 * Echo page and the note-scoped section. 'default' keeps the tab's own query order
 * (due date for most tabs, most-reviewed for Browse, last-graded for Reviewed Today).
 */
export type EchoSortKey =
  | 'default'
  | 'created_desc' | 'created_asc'
  | 'edited_desc' | 'edited_asc'
  | 'reviews_desc' | 'reviews_asc';

const OPTIONS: { value: EchoSortKey; label: string }[] = [
  { value: 'default',      label: 'Default order' },
  { value: 'created_desc', label: 'Created · newest first' },
  { value: 'created_asc',  label: 'Created · oldest first' },
  { value: 'edited_desc',  label: 'Edited · newest first' },
  { value: 'edited_asc',   label: 'Edited · oldest first' },
  { value: 'reviews_desc', label: 'Reviews · most first' },
  { value: 'reviews_asc',  label: 'Reviews · fewest first' },
];

export function sortEchoItems<T extends ReviewItem>(items: T[], key: EchoSortKey): T[] {
  if (key === 'default') return items;
  // Rating-carrying count from ECHO_SOURCE_COLUMNS; Browse rows also carry total_reviews
  // (all events) — review_count keeps the sort consistent with the Reviewed-Today rule.
  const reviews = (i: ReviewItem) => i.review_count ?? 0;
  // SQLite datetime strings ('YYYY-MM-DD HH:MM:SS', UTC) sort correctly as plain strings.
  const cmp: Record<Exclude<EchoSortKey, 'default'>, (a: T, b: T) => number> = {
    created_desc: (a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''),
    created_asc:  (a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''),
    edited_desc:  (a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''),
    edited_asc:   (a, b) => (a.updated_at ?? '').localeCompare(b.updated_at ?? ''),
    reviews_desc: (a, b) => reviews(b) - reviews(a),
    reviews_asc:  (a, b) => reviews(a) - reviews(b),
  };
  return [...items].sort(cmp[key]);
}

interface EchoSortSelectProps {
  value: EchoSortKey;
  onChange: (key: EchoSortKey) => void;
  className?: string;
}

export function EchoSortSelect({ value, onChange, className = '' }: EchoSortSelectProps) {
  return (
    <label className={`flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 ${className}`}>
      <span aria-hidden>⇅</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as EchoSortKey)}
        className={`text-xs rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface
                    text-gray-700 dark:text-gray-300 px-2 py-1 focus:outline-none focus:border-blue-400
                    ${value !== 'default' ? 'border-blue-400 dark:border-blue-500 text-blue-700 dark:text-blue-300' : ''}`}
        title="Sort the cards in every tab"
      >
        {OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

/** Sort choice persisted per surface ('page' | 'note') so it survives app restarts. */
export function loadEchoSort(surface: string): EchoSortKey {
  try {
    const v = localStorage.getItem(`echoSort.${surface}`);
    if (v && OPTIONS.some(o => o.value === v)) return v as EchoSortKey;
  } catch { /* ignore */ }
  return 'default';
}

export function saveEchoSort(surface: string, key: EchoSortKey): void {
  try { localStorage.setItem(`echoSort.${surface}`, key); } catch { /* ignore */ }
}
