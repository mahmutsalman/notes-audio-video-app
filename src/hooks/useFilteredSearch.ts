import { useState, useEffect } from 'react';
import type { FilteredSearchParams, GlobalSearchResult } from '../types';

export function useFilteredSearch(params: FilteredSearchParams | null) {
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!params || !params.conditions.length) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    window.electronAPI.search.filtered(params)
      .then(data => { if (!cancelled) { setResults(data); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [params]);

  return { results, loading };
}
