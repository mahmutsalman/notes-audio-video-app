import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Tag } from '../../types';
import { TagResultsView } from '../tags/TagResultsView';

export default function TagSearchSection() {
  const navigate = useNavigate();
  const [tags, setTags] = useState<Tag[]>([]);
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.electronAPI.tags.getAll().then(setTags);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredTags = query
    ? tags.filter(t => t.name.toLowerCase().includes(query.toLowerCase()))
    : tags.slice(0, 8);

  const handleSelect = useCallback((tagName: string) => {
    const tag = tags.find(t => t.name === tagName);
    if (tag) window.electronAPI.tags.recordSearch(tag.id).catch(() => {});
    setActiveTag(tagName);
    setQuery('');
    setShowDropdown(false);
  }, [tags]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && filteredTags.length > 0) {
      handleSelect(filteredTags[0].name);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
      inputRef.current?.blur();
    }
  };

  const handleClear = () => {
    setActiveTag(null);
    setQuery('');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface">
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 dark:border-dark-border">
        <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>

        {activeTag ? (
          /* Selected tag chip */
          <div className="flex items-center gap-1.5 flex-1">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700">
              #{activeTag}
            </span>
            <button
              onClick={handleClear}
              className="p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              title="Clear tag"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          /* Tag search input with dropdown */
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)}
              onKeyDown={handleKeyDown}
              placeholder="Search by tag…"
              className="w-full text-sm bg-transparent text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none"
              autoComplete="off"
              spellCheck={false}
            />
            {showDropdown && filteredTags.length > 0 && (
              <div
                ref={dropdownRef}
                className="absolute left-0 top-full mt-1 w-64 max-h-52 overflow-y-auto z-50
                           rounded-lg border border-gray-200 dark:border-dark-border
                           bg-white dark:bg-dark-surface shadow-lg"
              >
                {filteredTags.map(tag => (
                  <button
                    key={tag.id}
                    onMouseDown={e => { e.preventDefault(); handleSelect(tag.name); }}
                    className="w-full flex items-center justify-between px-3 py-2
                               hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors text-left"
                  >
                    <span className="text-sm font-mono text-blue-600 dark:text-blue-400 truncate">
                      #{tag.name}
                    </span>
                    <span className="text-xs text-gray-400 ml-2 flex-shrink-0">
                      {tag.usage_count}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Results */}
      {activeTag && (
        <div className="px-3 py-3">
          <TagResultsView
            tagNames={[activeTag]}
            onNavigate={id => navigate(`/recording/${id}`)}
          />
        </div>
      )}
    </div>
  );
}
