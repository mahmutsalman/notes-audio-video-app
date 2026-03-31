import { useState, useEffect, useMemo } from 'react';
import type { GlobalSearchResult } from '../types';

export type SearchContentType = GlobalSearchResult['content_type'];

export interface GroupedSearchResults {
  duration: GlobalSearchResult[];
  recording: GlobalSearchResult[];
  topic: GlobalSearchResult[];
  image: GlobalSearchResult[];
  video: GlobalSearchResult[];
  audio: GlobalSearchResult[];
  duration_image: GlobalSearchResult[];
  duration_video: GlobalSearchResult[];
  duration_audio: GlobalSearchResult[];
  code_snippet: GlobalSearchResult[];
  duration_code_snippet: GlobalSearchResult[];
  audio_marker: GlobalSearchResult[];
  duration_image_audio: GlobalSearchResult[];
  image_audio: GlobalSearchResult[];
  quick_capture_image: GlobalSearchResult[];
  image_ocr: GlobalSearchResult[];
  duration_image_ocr: GlobalSearchResult[];
  quick_capture_image_ocr: GlobalSearchResult[];
  image_child_ocr: GlobalSearchResult[];
}

export function useGlobalSearch() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  // 300ms debounce
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(id);
  }, [query]);

  // Fetch when debounced query changes
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    window.electronAPI.search.global(debouncedQuery, 100)
      .then(data => {
        if (!cancelled) {
          setResults(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [debouncedQuery]);

  const grouped = useMemo((): GroupedSearchResults => {
    const g: GroupedSearchResults = {
      duration: [], recording: [], topic: [], image: [], video: [], audio: [],
      duration_image: [], duration_video: [], duration_audio: [],
      code_snippet: [], duration_code_snippet: [],
      audio_marker: [], duration_image_audio: [], image_audio: [],
      quick_capture_image: [],
      image_ocr: [], duration_image_ocr: [], quick_capture_image_ocr: [], image_child_ocr: [],
    };
    for (const r of results) {
      const key = r.content_type as keyof GroupedSearchResults;
      if (key in g) g[key].push(r);
    }
    return g;
  }, [results]);

  const totalCount = results.length;

  const categoriesWithResults = useMemo(() => {
    return Object.entries(grouped).filter(([, items]) => items.length > 0).length;
  }, [grouped]);

  return {
    query,
    setQuery,
    results,
    grouped,
    loading,
    isTyping: query !== debouncedQuery,
    hasQuery: debouncedQuery.trim().length > 0,
    activeQuery: debouncedQuery,
    totalCount,
    categoriesWithResults,
  };
}
