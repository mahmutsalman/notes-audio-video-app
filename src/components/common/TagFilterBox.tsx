import { useState, useEffect, useCallback, useRef } from 'react';

export type TagOption = { name: string; count: number };
type TagSource = 'scoped' | 'all';

interface TagFilterBoxProps {
  activeTags: string[];
  onChange: (tags: string[]) => void;
  /**
   * The tags actually present on the things being filtered — so every option is guaranteed to
   * yield at least one result. This is the ONLY feature-specific part of the widget.
   */
  loadScopedTags: () => Promise<TagOption[]>;
  /** Label for the scoped source in the Show toggle, e.g. "On echoes" / "On captures". */
  scopedLabel: string;
  /** Shown when the scoped source has no tags at all. */
  scopedEmptyText: string;
  /** A window event that should trigger a reload of the scoped tags (e.g. REVIEW_CHANGED_EVENT). */
  refreshEvent?: string;
  containerClassName?: string;
}

/**
 * Type-to-filter tag search. A text input with an autocomplete dropdown of the tags actually
 * present on whatever is being filtered (focus to browse, type to narrow). Selecting a tag adds a
 * removable chip; matching is ANY/OR and is the caller's job. Unlike the full TagBrowser this only
 * filters — it never creates or renames tags.
 *
 * Feature-agnostic: the caller supplies how to load its own scoped tags. "All tags" always means
 * every tag in the app.
 */
export default function TagFilterBox({
  activeTags,
  onChange,
  loadScopedTags,
  scopedLabel,
  scopedEmptyText,
  refreshEvent,
  containerClassName,
}: TagFilterBoxProps) {
  const [options, setOptions] = useState<TagOption[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  // 'scoped' = only tags on the things in scope (every pick yields results); 'all' = every app tag.
  const [source, setSource] = useState<TagSource>('scoped');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (source === 'all') {
      const tags = await window.electronAPI.tags.getAll();
      setOptions(tags.map(t => ({ name: t.name, count: t.usage_count })));
    } else {
      setOptions(await loadScopedTags());
    }
  }, [source, loadScopedTags]);

  useEffect(() => { load(); }, [load]);

  // Retagging or adding/removing items changes which tags are available — refresh.
  useEffect(() => {
    if (!refreshEvent) return;
    const onChanged = () => load();
    window.addEventListener(refreshEvent, onChanged);
    return () => window.removeEventListener(refreshEvent, onChanged);
  }, [refreshEvent, load]);

  // Close the dropdown on an outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const q = query.trim().toLowerCase();
  const suggestions = options
    .filter(o => !activeTags.includes(o.name))
    .filter(o => q === '' || o.name.toLowerCase().includes(q));

  const addTag = (name: string) => {
    if (!activeTags.includes(name)) onChange([...activeTags, name]);
    setQuery('');
    setHighlight(0);
    inputRef.current?.focus(); // keep focus for rapid multi-select
  };
  const removeTag = (name: string) => onChange(activeTags.filter(t => t !== name));

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault(); setOpen(true);
      setHighlight(h => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (suggestions[highlight]) addTag(suggestions[highlight].name);
    } else if (e.key === 'Backspace' && query === '' && activeTags.length > 0) {
      removeTag(activeTags[activeTags.length - 1]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className={containerClassName}>
      <div className="relative" ref={rootRef}>
        {/* Input box + active-tag chips */}
        <div
          className="flex flex-wrap items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover cursor-text"
          onClick={() => { setOpen(true); inputRef.current?.focus(); }}
        >
          <span className="text-xs text-gray-400 dark:text-gray-500">🏷️</span>
          {activeTags.map(t => (
            <span
              key={t}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-600 text-white"
            >
              {t}
              <button
                onClick={(e) => { e.stopPropagation(); removeTag(t); }}
                className="text-blue-200 hover:text-white leading-none"
                title={`Remove #${t} filter`}
              >
                ×
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlight(0); }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={activeTags.length ? 'Add another tag…' : 'Filter by tag…'}
            className="flex-1 min-w-[120px] bg-transparent outline-none text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
          />
          {activeTags.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); onChange([]); }}
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline"
            >
              clear
            </button>
          )}
        </div>

        {/* Autocomplete dropdown */}
        {open && (
          <div className="absolute left-0 right-0 mt-1 z-40 max-h-64 overflow-y-auto rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg shadow-lg">
            {/* Source toggle — in-scope tags vs every tag in the app. */}
            <div className="sticky top-0 flex items-center gap-1 px-2 py-1.5 border-b border-gray-100 dark:border-dark-border bg-white dark:bg-dark-bg">
              <span className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mr-1">Show</span>
              {([['scoped', scopedLabel], ['all', 'All tags']] as [TagSource, string][]).map(([val, label]) => (
                <button
                  key={val}
                  onMouseDown={(e) => { e.preventDefault(); setSource(val); setHighlight(0); }}
                  className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                    source === val
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-dark-hover text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {suggestions.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                {options.length === 0
                  ? (source === 'scoped' ? scopedEmptyText : 'No tags exist yet.')
                  : (activeTags.length > 0 && q === '' ? 'All available tags selected.' : 'No matching tags.')}
              </div>
            ) : (
              suggestions.map((o, i) => (
                <button
                  key={o.name}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => addTag(o.name)}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-left text-sm transition-colors ${
                    highlight === i
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-dark-hover'
                  }`}
                >
                  <span className="truncate">{o.name}</span>
                  <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">{o.count}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
