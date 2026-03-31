import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { MediaTagType, Tag } from '../../types';

interface Props {
  mediaType: MediaTagType;
  mediaId: number;
  className?: string;
  ocrSuggestion?: { text: string; slug: string };
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

// ── OCR prefix picker section ──────────────────────────────────────────────

function extractPrefixes(allTags: Tag[]): string[] {
  const seen = new Set<string>();
  for (const t of allTags) {
    const parts = t.name.split('/');
    for (let i = 1; i < parts.length; i++) {
      seen.add(parts.slice(0, i).join('/') + '/');
    }
  }
  return [...seen].sort();
}

function OcrSection({
  suggestion,
  tags,
  onAddTag,
}: {
  suggestion: { text: string; slug: string };
  tags: string[];
  onAddTag: (tag: string) => void;
}) {
  const [slug, setSlug] = useState(suggestion.slug);
  const [selectedPrefix, setSelectedPrefix] = useState('');
  const [prefixInput, setPrefixInput] = useState('');
  const [allPrefixes, setAllPrefixes] = useState<string[]>([]);
  const [showPrefixPanel, setShowPrefixPanel] = useState(false);
  const [highlightedPrefix, setHighlightedPrefix] = useState(-1);
  const [ocrAdded, setOcrAdded] = useState(false);
  const prefixInputRef = useRef<HTMLInputElement>(null);
  const prefixPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.electronAPI.tags.getAll().then((allTags) => {
      setAllPrefixes(extractPrefixes(allTags));
    });
  }, []);

  // Close prefix panel on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (
        prefixPanelRef.current && !prefixPanelRef.current.contains(t) &&
        prefixInputRef.current && !prefixInputRef.current.contains(t)
      ) {
        setShowPrefixPanel(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const filteredPrefixes = prefixInput
    ? allPrefixes.filter((p) => p.toLowerCase().includes(prefixInput.toLowerCase()))
    : allPrefixes;

  function selectPrefix(p: string) {
    setSelectedPrefix(p);
    setPrefixInput(p);
    setShowPrefixPanel(false);
    setHighlightedPrefix(-1);
    setOcrAdded(false);
  }

  function clearPrefix() {
    setSelectedPrefix('');
    setPrefixInput('');
    setOcrAdded(false);
    prefixInputRef.current?.focus();
  }

  function handlePrefixKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedPrefix((i) => Math.min(i + 1, filteredPrefixes.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedPrefix((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedPrefix >= 0 && filteredPrefixes[highlightedPrefix]) {
        selectPrefix(filteredPrefixes[highlightedPrefix]);
      } else if (prefixInput) {
        // Accept freeform prefix if it ends with /
        const p = prefixInput.endsWith('/') ? prefixInput : prefixInput + '/';
        selectPrefix(p);
      }
    } else if (e.key === 'Escape') {
      setShowPrefixPanel(false);
    } else if (e.key === 'Backspace' && prefixInput === '') {
      clearPrefix();
    }
  }

  const finalTag = selectedPrefix + slug;
  const alreadyAdded = tags.includes(finalTag);

  function handleAdd() {
    if (!finalTag || alreadyAdded) return;
    onAddTag(finalTag);
    setOcrAdded(true);
  }

  return (
    <div className="mb-3 rounded-lg border border-blue-200 dark:border-blue-800/60 bg-blue-50/50 dark:bg-blue-950/30">
      {/* Detected text */}
      <div className="px-3 pt-2.5 pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-400 dark:text-blue-500">
          Detected text
        </span>
        <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400 font-mono bg-white/60 dark:bg-black/20 px-2 py-1 rounded truncate" title={suggestion.text}>
          "{suggestion.text}"
        </p>
      </div>

      {/* Editable slug */}
      <div className="px-3 pt-1 pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-400 dark:text-blue-500">
          Tag slug
        </span>
        <input
          type="text"
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'));
            setOcrAdded(false);
          }}
          className="mt-0.5 w-full bg-white dark:bg-gray-900 text-xs text-gray-800 dark:text-gray-200 px-2 py-1 rounded border border-gray-200 dark:border-gray-700 focus:border-blue-400 outline-none font-mono"
        />
      </div>

      {/* Prefix autocomplete */}
      <div className="px-3 pt-1 pb-1 relative">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-400 dark:text-blue-500">
          Prefix (optional)
        </span>
        <div className="mt-0.5 relative flex items-center">
          <input
            ref={prefixInputRef}
            type="text"
            value={prefixInput}
            placeholder="e.g. unity/ui/"
            onChange={(e) => {
              setPrefixInput(e.target.value);
              setSelectedPrefix('');
              setHighlightedPrefix(-1);
              setShowPrefixPanel(true);
              setOcrAdded(false);
            }}
            onFocus={() => setShowPrefixPanel(true)}
            onKeyDown={handlePrefixKeyDown}
            className={`w-full bg-white dark:bg-gray-900 text-xs px-2 py-1 rounded border outline-none font-mono pr-6 ${
              selectedPrefix
                ? 'border-blue-400 text-blue-600 dark:text-blue-400'
                : 'border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200'
            } focus:border-blue-400`}
          />
          {prefixInput && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); clearPrefix(); }}
              className="absolute right-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm leading-none"
              tabIndex={-1}
            >
              ×
            </button>
          )}
        </div>

        {/* Prefix suggestions dropdown */}
        {showPrefixPanel && filteredPrefixes.length > 0 && (
          <div
            ref={prefixPanelRef}
            className="absolute left-3 right-3 z-50 mt-0.5 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg overflow-hidden"
          >
            <div className="min-h-[84px] max-h-40 overflow-y-auto">
              {filteredPrefixes.map((p, i) => (
                <button
                  key={p}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); selectPrefix(p); }}
                  onMouseEnter={() => setHighlightedPrefix(i)}
                  className={`w-full text-left px-3 py-1.5 text-xs font-mono transition-colors ${
                    highlightedPrefix === i
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Preview + Add button */}
      <div className="px-3 pt-1.5 pb-2.5 flex items-center gap-2">
        {finalTag ? (
          <span className="text-xs font-mono text-blue-600 dark:text-blue-400 flex-1 truncate" title={finalTag}>
            → {finalTag}
          </span>
        ) : (
          <span className="flex-1" />
        )}
        {ocrAdded ? (
          <span className="text-xs text-green-600 dark:text-green-400 font-medium">Added ✓</span>
        ) : (
          <button
            type="button"
            disabled={!finalTag || alreadyAdded}
            onMouseDown={(e) => { e.preventDefault(); handleAdd(); }}
            className="text-xs bg-blue-500 hover:bg-blue-400 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1 rounded transition-colors"
          >
            {alreadyAdded ? 'Already added' : 'Add tag'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function TagAutocomplete({ mediaType, mediaId, className, ocrSuggestion }: Props) {
  const [tags, setTags] = useState<string[]>([]);
  // typedValue = what the user actually typed (preserved across navigation)
  const [typedValue, setTypedValue] = useState('');
  // inputValue = what's shown in the input (may mirror a highlighted suggestion)
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<Tag[]>([]);
  const [lastUsedTags, setLastUsedTags] = useState<Tag[]>([]);
  const [mostUsedTags, setMostUsedTags] = useState<Tag[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [showPanel, setShowPanel] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load existing tags on mount
  useEffect(() => {
    window.electronAPI.tags.getByMedia(mediaType, mediaId).then((result) => {
      setTags(result.map((t) => t.name));
    });
  }, [mediaType, mediaId]);

  const saveTags = useCallback(
    (newTags: string[]) => {
      window.electronAPI.tags.setForMedia(mediaType, mediaId, newTags);
    },
    [mediaType, mediaId]
  );

  // Fetch suggestions / populate sections
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const results = await window.electronAPI.tags.search(typedValue);
      const filtered = results.filter((t) => !tags.includes(t.name));

      if (!typedValue) {
        // Build Last Used: has last_assigned_at, sorted newest first
        const withDate = filtered
          .filter((t) => t.last_assigned_at)
          .sort((a, b) => (b.last_assigned_at ?? '').localeCompare(a.last_assigned_at ?? ''))
          .slice(0, MAX_SECTION);
        // Build Most Used: sorted by usage_count desc
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
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [typedValue, tags]);

  // Flat navigation list
  const isEmpty = !typedValue;
  const mostUsedDeduped = mostUsedTags.filter(
    (t) => !lastUsedTags.some((l) => l.id === t.id)
  );
  const navItems: Tag[] = isEmpty
    ? [...lastUsedTags, ...mostUsedDeduped]
    : suggestions;

  function confirmTag(name: string) {
    const trimmed = name.trim();
    setInputValue('');
    setTypedValue('');
    setHighlightedIndex(-1);
    if (!trimmed || tags.includes(trimmed)) return;
    const next = [...tags, trimmed];
    setTags(next);
    saveTags(next);
    setSuggestions([]);
    // Keep panel open so user can keep adding
    inputRef.current?.focus();
  }

  function removeTag(name: string) {
    const next = tags.filter((t) => t !== name);
    setTags(next);
    saveTags(next);
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
      // Restore typed value and deselect, or close if input is already empty
      setInputValue(typedValue);
      setHighlightedIndex(-1);
      if (!typedValue) setShowPanel(false);
    } else if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    let val = e.target.value;
    // Comma or space → confirm
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

  // Close on outside click
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
    <div className={`relative ${className ?? ''}`}>
      {/* OCR suggestion section — shown at top when coming from Shift+drag */}
      {ocrSuggestion && (
        <OcrSection
          suggestion={ocrSuggestion}
          tags={tags}
          onAddTag={(tag) => {
            if (tags.includes(tag)) return;
            const next = [...tags, tag];
            setTags(next);
            saveTags(next);
          }}
        />
      )}

      {/* Tag pills + input */}
      <div
        className="flex flex-wrap gap-1 items-center min-h-[36px] px-2 py-1.5 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 cursor-text"
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
          className="flex-1 min-w-[100px] outline-none bg-transparent text-xs text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-600"
          placeholder={tags.length === 0 ? 'Add tag (e.g. java/inheritance)…' : ''}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowPanel(true)}
          autoFocus={!ocrSuggestion}
        />
      </div>

      {/* Suggestions panel */}
      {panelVisible && (
        <div
          ref={panelRef}
          className="absolute left-0 right-0 z-50 mt-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg overflow-hidden"
        >
          {isEmpty ? (
            // Empty input → show Last Used + Most Used sections
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
            // Typing → filtered suggestions
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
