import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { MediaTagType, Tag } from '../../types';

interface Props {
  mediaType: MediaTagType;
  mediaId: number;
  className?: string;
}

export function TagAutocomplete({ mediaType, mediaId, className }: Props) {
  const [tags, setTags] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<Tag[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load existing tags on mount
  useEffect(() => {
    window.electronAPI.tags.getByMedia(mediaType, mediaId).then((result) => {
      setTags(result.map((t) => t.name));
    });
  }, [mediaType, mediaId]);

  // Persist tag changes
  const saveTags = useCallback(
    (newTags: string[]) => {
      window.electronAPI.tags.setForMedia(mediaType, mediaId, newTags);
    },
    [mediaType, mediaId]
  );

  // Fetch suggestions (debounced)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const results = await window.electronAPI.tags.search(inputValue);
      // Filter out already-selected tags
      setSuggestions(results.filter((t) => !tags.includes(t.name)));
      setHighlightedIndex(-1);
    }, 150);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [inputValue, tags]);

  function confirmTag(name: string) {
    const trimmed = name.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    const next = [...tags, trimmed];
    setTags(next);
    saveTags(next);
    setInputValue('');
    setSuggestions([]);
    setShowDropdown(false);
  }

  function removeTag(name: string) {
    const next = tags.filter((t) => t !== name);
    setTags(next);
    saveTags(next);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
        confirmTag(suggestions[highlightedIndex].name);
      } else if (inputValue.trim()) {
        confirmTag(inputValue);
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
      setSuggestions([]);
    } else if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    let val = e.target.value;
    // Comma or space at end → confirm the tag before the separator
    if (val.endsWith(',') || val.endsWith(' ')) {
      const candidate = val.slice(0, -1).trim();
      if (candidate) {
        confirmTag(candidate);
        return;
      }
    }
    setInputValue(val);
    setShowDropdown(true);
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const dropdownVisible = showDropdown && suggestions.length > 0;

  return (
    <div className={`relative ${className ?? ''}`}>
      {/* Tag pills + input row */}
      <div
        className="flex flex-wrap gap-1 items-center min-h-[32px] px-2 py-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 cursor-text"
        onClick={() => inputRef.current?.focus()}
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
          className="flex-1 min-w-[100px] outline-none bg-transparent text-xs text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-600"
          placeholder={tags.length === 0 ? 'Add tag (e.g. java/inheritance)…' : ''}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowDropdown(true)}
        />
      </div>

      {/* Suggestions dropdown */}
      {dropdownVisible && (
        <div
          ref={dropdownRef}
          className="absolute left-0 right-0 z-50 mt-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg max-h-48 overflow-y-auto"
        >
          {suggestions.map((tag, i) => (
            <button
              key={tag.id}
              type="button"
              className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between gap-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 ${
                i === highlightedIndex ? 'bg-blue-50 dark:bg-blue-900/30' : ''
              }`}
              onMouseDown={(e) => { e.preventDefault(); confirmTag(tag.name); }}
              onMouseEnter={() => setHighlightedIndex(i)}
            >
              <span className="text-gray-800 dark:text-gray-200 font-mono">{tag.name}</span>
              {tag.usage_count > 0 && (
                <span className="text-gray-400 dark:text-gray-600 flex-shrink-0">
                  {tag.usage_count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
