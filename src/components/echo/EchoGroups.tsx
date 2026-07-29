import type { ReviewItem } from '../../types';

/**
 * Client-side grouping for the Echo lists — the counterpart to EchoSort.
 *
 * Cards already carry `recording_name` and `topic_name` (joined by ReviewOperations.getAll),
 * so grouping needs no extra query. Grouping is applied AFTER sorting, and each group keeps
 * the sorted order of its members.
 *
 * The point is not decoration: each group can start a session containing only its own cards,
 * so a single recording ("7 days plan") can be reviewed without touching the other 30-odd
 * cards that happen to be due the same day.
 */

export type EchoGroupKey = 'none' | 'recording';

export interface EchoGroup {
  /** Stable React key. `r:<id>` for a real recording, `none` for the ungrouped bucket. */
  key: string;
  title: string;
  /** Topic name shown under the title; null for the ungrouped bucket. */
  subtitle: string | null;
  items: ReviewItem[];
}

const UNGROUPED_TITLE = 'No recording';

/**
 * Group items by recording, preserving the incoming (already-sorted) order both for the
 * groups themselves and within each group. Cards with no recording_id collect into a single
 * bucket that always sorts last — they are real cards and must stay reachable, never hidden.
 */
export function groupEchoItems(items: ReviewItem[], key: EchoGroupKey): EchoGroup[] {
  if (key === 'none') return [{ key: 'all', title: '', subtitle: null, items }];

  const byKey = new Map<string, EchoGroup>();
  for (const item of items) {
    const id = item.recording_id;
    const groupKey = id == null ? 'none' : `r:${id}`;
    let group = byKey.get(groupKey);
    if (!group) {
      group = {
        key: groupKey,
        title: id == null ? UNGROUPED_TITLE : (item.recording_name || `Recording ${id}`),
        subtitle: id == null ? null : item.topic_name,
        items: [],
      };
      byKey.set(groupKey, group);
    }
    group.items.push(item);
  }

  // Largest first — the recording with the most due cards is usually the one worth opening.
  // The ungrouped bucket is pinned last regardless of size.
  return [...byKey.values()].sort((a, b) => {
    if (a.key === 'none') return 1;
    if (b.key === 'none') return -1;
    return b.items.length - a.items.length;
  });
}

interface EchoGroupSelectProps {
  value: EchoGroupKey;
  onChange: (key: EchoGroupKey) => void;
  className?: string;
}

/** Segmented None/Recording toggle, styled to match EchoSortSelect. */
export function EchoGroupSelect({ value, onChange, className = '' }: EchoGroupSelectProps) {
  const OPTIONS: { value: EchoGroupKey; label: string }[] = [
    { value: 'none', label: 'Flat' },
    { value: 'recording', label: 'By recording' },
  ];
  return (
    <div className={`flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 ${className}`}>
      <span aria-hidden>▤</span>
      <div className="flex gap-0.5 bg-gray-100 dark:bg-dark-surface rounded-lg p-0.5">
        {OPTIONS.map(o => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`px-2 py-1 rounded-md transition-colors ${
              value === o.value
                ? 'bg-white dark:bg-dark-hover text-gray-800 dark:text-gray-100 shadow-sm'
                : 'hover:text-gray-700 dark:hover:text-gray-300'
            }`}
            title="Group the cards by the recording they came from"
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface EchoGroupHeaderProps {
  group: EchoGroup;
  collapsed: boolean;
  onToggle: () => void;
  /** Omitted on tabs where starting a session makes no sense (Upcoming, Reviewed Today). */
  onStart?: (items: ReviewItem[]) => void;
}

export function EchoGroupHeader({ group, collapsed, onToggle, onStart }: EchoGroupHeaderProps) {
  return (
    <div className="flex items-center gap-3 py-2 sticky top-0 z-10 bg-white dark:bg-dark-bg">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 flex-1 min-w-0 text-left group"
        aria-expanded={!collapsed}
      >
        <span
          className={`text-gray-400 dark:text-gray-500 transition-transform ${collapsed ? '' : 'rotate-90'}`}
          aria-hidden
        >
          ▶
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-gray-900 dark:text-gray-100 group-hover:underline">
            {group.title}
          </span>
          {group.subtitle && (
            <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
              {group.subtitle}
            </span>
          )}
        </span>
        <span className="ml-1 shrink-0 px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-dark-surface text-gray-600 dark:text-gray-300">
          {group.items.length}
        </span>
      </button>

      {onStart && (
        <button
          onClick={() => onStart(group.items)}
          className="shrink-0 px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors"
          title={`Review only the ${group.items.length} due card${group.items.length === 1 ? '' : 's'} from this recording`}
        >
          Start {group.items.length}
        </button>
      )}
    </div>
  );
}

/** Group choice persisted per surface ('page' | 'note'), same convention as EchoSort. */
export function loadEchoGroup(surface: string): EchoGroupKey {
  try {
    const v = localStorage.getItem(`echoGroup.${surface}`);
    if (v === 'none' || v === 'recording') return v;
  } catch { /* ignore */ }
  return 'none';
}

export function saveEchoGroup(surface: string, key: EchoGroupKey): void {
  try { localStorage.setItem(`echoGroup.${surface}`, key); } catch { /* ignore */ }
}
