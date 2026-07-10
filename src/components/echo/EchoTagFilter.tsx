import { useState, useEffect, useCallback, useRef } from 'react';
import { REVIEW_CHANGED_EVENT } from '../../utils/events';

interface EchoTagFilterProps {
  activeTags: string[];
  onChange: (tags: string[]) => void;
  /** When set, only tags present on THIS recording's echoes are offered (note-scoped). */
  recordingId?: number;
  /** Classes for the outer container. */
  containerClassName?: string;
}

/**
 * Type-to-filter tag search for echoes. A text input with an autocomplete dropdown of the
 * tags actually present on enrolled echoes (focus it to browse all available tags; type to
 * narrow). Selecting a tag adds a removable chip and filters the results (ANY/OR — handled by
 * the backend). Unlike the full TagBrowser this only filters — it never creates/renames tags.
 */
type TagSource = 'enrolled' | 'all';

export default function EchoTagFilter({ activeTags, onChange, recordingId, containerClassName }: EchoTagFilterProps) {
  const [options, setOptions] = useState<{ name: string; count: number }[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  // 'enrolled' = only tags on echoes in scope (every pick yields results); 'all' = every app tag.
  const [source, setSource] = useState<TagSource>('enrolled');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (source === 'all') {
      const tags = await window.electronAPI.tags.getAll();
      setOptions(tags.map(t => ({ name: t.name, count: t.usage_count })));
    } else {
      const tags = recordingId != null
        ? await window.electronAPI.review.getEnrolledTagsByRecording(recordingId)
        : await window.electronAPI.review.getEnrolledTags();
      setOptions(tags);
    }
  }, [recordingId, source]);

  useEffect(() => { load(); }, [load]);

  // Enrolling/removing an echo or retagging its image changes the available tags — refresh.
  useEffect(() => {
    const onChanged = () => load();
    window.addEventListener(REVIEW_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(REVIEW_CHANGED_EVENT, onChanged);
  }, [load]);

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
            {/* Source toggle — enrolled-echo tags vs every tag in the app. */}
            <div className="sticky top-0 flex items-center gap-1 px-2 py-1.5 border-b border-gray-100 dark:border-dark-border bg-white dark:bg-dark-bg">
              <span className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mr-1">Show</span>
              {([['enrolled', 'On echoes'], ['all', 'All tags']] as [TagSource, string][]).map(([val, label]) => (
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
                  ? (source === 'enrolled'
                      ? 'No tags on these echoes yet — add tags from “Add to Echo”, or switch to “All tags”.'
                      : 'No tags exist yet.')
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
