import { useState, useMemo, useEffect } from 'react';
import { Recording } from '../types';
import { searchRecordings, SearchMatch } from '../utils/searchUtils';

/**
 * Hook for managing recording search state and filtering
 * Features:
 * - 300ms debouncing for smooth typing experience
 * - Memoized search results for performance
 * - Match metadata for highlighting
 * - Searches recording names only
 */
export function useRecordingSearch(recordings: Recording[]) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounce query updates (300ms)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query]);

  // Memoize search results
  const matches = useMemo<SearchMatch[]>(() => {
    if (!debouncedQuery.trim()) {
      return [];
    }

    return searchRecordings(recordings, debouncedQuery);
  }, [recordings, debouncedQuery]);

  // Extract filtered recordings from matches
  const filteredRecordings = useMemo(() => {
    if (!debouncedQuery.trim()) {
      return recordings; // Show all when no query
    }

    return matches.map(match => match.recording);
  }, [matches, debouncedQuery, recordings]);

  // Create a map of recording ID to match metadata for easy lookup
  const matchMetadataMap = useMemo(() => {
    const map = new Map<number, SearchMatch['matchedFields']>();

    for (const match of matches) {
      map.set(match.recording.id, match.matchedFields);
    }

    return map;
  }, [matches]);

  return {
    query,
    setQuery,
    filteredRecordings,
    matches,
    matchMetadataMap,
    isSearching: query !== debouncedQuery, // True while debouncing
    hasQuery: debouncedQuery.trim().length > 0,
  };
}
