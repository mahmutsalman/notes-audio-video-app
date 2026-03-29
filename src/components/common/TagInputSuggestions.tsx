import React, { useState, useEffect, useRef } from 'react';
import type { Tag } from '../../types';

interface Props {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

const MAX_SECTION = 6;

function SuggestionRow({
  tag,
  highlighted,
  onMouseEnter,
  onMouseDown,
}: {
  tag: Tag;
  highlighted: boolean;
  onMouseEnter: () => void;
  onMouseDown: () => void;
}) {
  return (
    <button
      type="button"
      className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between gap-2 transition-colors ${
        highlighted
          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
          : 'hover:bg-gray-50 dark:hover:bg-gray-800'
      }`}
      onMouseDown={(e) => { e.preventDefault(); onMouseDown(); }}
      onMouseEnter={onMouseEnter}
    >
      <span className={`font-mono truncate ${highlighted ? 'text-blue-700 dark:text-blue-300' : 'text-gray-800 dark:text-gray-200'}`}>
        {tag.name}
      </span>
      {(tag.usage_count ?? 0) > 0 && (
        <span className="text-gray-400 dark:text-gray-600 flex-shrink-0 text-[10px]">
          {tag.usage_count}
        </span>
      )}
    </button>
  );
}

export function TagInputSuggestions({ tags, onChange, placeholder }: Props) {
  const [typedValue, setTypedValue] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<Tag[]>([]);
  const [lastUsedTags, setLastUsedTags] = useState<Tag[]>([]);
  const [mostUsedTags, setMostUsedTags] = useState<Tag[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [showPanel, setShowPanel] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const results = await window.electronAPI.tags.search(typedValue);
      const filtered = results.filter((t) => !tags.includes(t.name));

      if (!typedValue) {
        const withDate = filtered
          .filter((t) => t.last_assigned_at)
          .sort((a, b) => (b.last_assigned_at ?? '').localeCompare(a.last_assigned_at ?? ''))
          .slice(0, MAX_SECTION);
        const byUsage = [...filtered]
          .sort((a, b) => (b.usage_count ?? 0) - (a.usage_count ?? 0))
          .slice(0, MAX_SECTION);
        setLastUsedTags(withDate);
        setMostUsedTags(byUsage);
        setSuggestions([]);
      } else {
        setSuggestions(filtered);
        setLastUsedTags([]);
        setMostUsedTags([]);
      }
      setHighlightedIndex(-1);
    }, 150);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [typedValue, tags]);

  const isEmpty = !typedValue;
  const mostUsedDeduped = mostUsedTags.filter((t) => !lastUsedTags.some((l) => l.id === t.id));
  const navItems: Tag[] = isEmpty ? [...lastUsedTags, ...mostUsedDeduped] : suggestions;

  function confirmTag(name: string) {
    const trimmed = name.trim();
    setInputValue('');
    setTypedValue('');
    setHighlightedIndex(-1);
    if (!trimmed || tags.includes(trimmed)) return;
    onChange([...tags, trimmed]);
    setSuggestions([]);
    inputRef.current?.focus();
  }

  function removeTag(name: string) {
    onChange(tags.filter((t) => t !== name));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.min(highlightedIndex + 1, navItems.length - 1);
      setHighlightedIndex(next);
      if (next >= 0 && navItems[next]) setInputValue(navItems[next].name);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.max(highlightedIndex - 1, -1);
      setHighlightedIndex(next);
      setInputValue(next === -1 ? typedValue : (navItems[next]?.name ?? typedValue));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      confirmTag(inputValue);
    } else if (e.key === 'Escape') {
      setInputValue(typedValue);
      setHighlightedIndex(-1);
      if (!typedValue) setShowPanel(false);
    } else if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    let val = e.target.value;
    if (val.endsWith(',') || val.endsWith(' ')) {
      const candidate = val.slice(0, -1).trim();
      if (candidate) { confirmTag(candidate); return; }
      val = val.slice(0, -1);
    }
    setTypedValue(val);
    setInputValue(val);
    setHighlightedIndex(-1);
    setShowPanel(true);
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        panelRef.current && !panelRef.current.contains(target) &&
        inputRef.current && !inputRef.current.parentElement?.contains(target)
      ) {
        setShowPanel(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const panelVisible =
    showPanel &&
    (isEmpty
      ? lastUsedTags.length > 0 || mostUsedDeduped.length > 0
      : suggestions.length > 0);

  return (
    <div className="relative">
      <div
        className="flex flex-wrap gap-1 items-center min-h-[36px] px-2 py-1.5 rounded-md border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent cursor-text"
        onClick={() => { inputRef.current?.focus(); setShowPanel(true); }}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 max-w-[200px]"
          >
            <span className="truncate" title={tag}>{tag}</span>
            <button
              type="button"
              className="flex-shrink-0 hover:text-blue-900 dark:hover:text-blue-100 leading-none"
              onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
              tabIndex={-1}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          className="flex-1 min-w-[100px] outline-none bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
          placeholder={tags.length === 0 ? (placeholder ?? 'Add tags…') : ''}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowPanel(true)}
        />
      </div>

      {panelVisible && (
        <div
          ref={panelRef}
          className="absolute left-0 right-0 z-50 mt-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg overflow-hidden"
        >
          {isEmpty ? (
            <div className="max-h-64 overflow-y-auto">
              {lastUsedTags.length > 0 && (
                <div>
                  <div className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Last Used
                  </div>
                  {lastUsedTags.map((tag, i) => (
                    <SuggestionRow
                      key={tag.id}
                      tag={tag}
                      highlighted={highlightedIndex === i}
                      onMouseEnter={() => { setHighlightedIndex(i); setInputValue(tag.name); }}
                      onMouseDown={() => confirmTag(tag.name)}
                    />
                  ))}
                </div>
              )}
              {mostUsedDeduped.length > 0 && (
                <div>
                  <div className={`px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 ${lastUsedTags.length > 0 ? 'pt-2 border-t border-gray-100 dark:border-gray-800 mt-1' : 'pt-2.5'}`}>
                    Most Used
                  </div>
                  {mostUsedDeduped.map((tag, i) => {
                    const flatIndex = lastUsedTags.length + i;
                    return (
                      <SuggestionRow
                        key={tag.id}
                        tag={tag}
                        highlighted={highlightedIndex === flatIndex}
                        onMouseEnter={() => { setHighlightedIndex(flatIndex); setInputValue(tag.name); }}
                        onMouseDown={() => confirmTag(tag.name)}
                      />
                    );
                  })}
                </div>
              )}
              <div className="px-3 py-1.5 text-[10px] text-gray-400 dark:text-gray-600 border-t border-gray-100 dark:border-gray-800">
                ↑↓ navigate · Enter to add · type to search
              </div>
            </div>
          ) : (
            <div className="max-h-52 overflow-y-auto">
              {suggestions.map((tag, i) => (
                <SuggestionRow
                  key={tag.id}
                  tag={tag}
                  highlighted={highlightedIndex === i}
                  onMouseEnter={() => { setHighlightedIndex(i); setInputValue(tag.name); }}
                  onMouseDown={() => confirmTag(tag.name)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
