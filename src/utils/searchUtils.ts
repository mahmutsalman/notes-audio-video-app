import { Recording } from '../types';

/**
 * Match types with priority scoring for search results
 */
export enum MatchType {
  EXACT_WORD = 100,
  EXACT_PHRASE = 95,
  STARTS_WITH = 80,
  WORD_BOUNDARY = 70,
  CONSECUTIVE = 60,
  FUZZY = 40,
  NO_MATCH = 0,
}

/**
 * Match result with positions for highlighting
 */
export interface MatchResult {
  type: MatchType;
  positions: number[];
}

/**
 * Search match with recording and metadata
 */
export interface SearchMatch {
  recording: Recording;
  score: number;
  matchedFields: {
    name?: MatchResult;
    notes?: MatchResult;
    imageCaptions?: MatchResult[];
    videoCaptions?: MatchResult[];
  };
}

/**
 * Normalize text for searching
 * - Lowercase
 * - Remove diacritics
 * - Keep only alphanumeric and spaces
 * - Normalize whitespace
 */
export function normalizeText(text: string | null | undefined): string {
  if (!text) return '';

  return text
    .toLowerCase()
    .normalize('NFD') // Unicode normalization
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^\w\s]/g, ' ') // Keep only alphanumeric and spaces
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Check if query matches text with fuzzy matching (non-consecutive characters)
 * Returns match result with positions of matched characters
 */
export function fuzzyMatch(text: string, query: string): MatchResult {
  if (!query || !text) {
    return { type: MatchType.NO_MATCH, positions: [] };
  }

  const normalizedText = normalizeText(text);
  const normalizedQuery = normalizeText(query);

  // Exact word match (highest priority)
  const words = normalizedText.split(' ');
  if (words.includes(normalizedQuery)) {
    const startPos = normalizedText.indexOf(normalizedQuery);
    const positions = Array.from(
      { length: normalizedQuery.length },
      (_, i) => startPos + i
    );
    return { type: MatchType.EXACT_WORD, positions };
  }

  // Exact phrase match
  if (normalizedText.includes(normalizedQuery)) {
    const startPos = normalizedText.indexOf(normalizedQuery);
    const positions = Array.from(
      { length: normalizedQuery.length },
      (_, i) => startPos + i
    );
    return { type: MatchType.EXACT_PHRASE, positions };
  }

  // Starts with match
  if (normalizedText.startsWith(normalizedQuery)) {
    const positions = Array.from(
      { length: normalizedQuery.length },
      (_, i) => i
    );
    return { type: MatchType.STARTS_WITH, positions };
  }

  // Word boundary match (query appears at start of any word)
  for (const word of words) {
    if (word.startsWith(normalizedQuery)) {
      const startPos = normalizedText.indexOf(word);
      const positions = Array.from(
        { length: normalizedQuery.length },
        (_, i) => startPos + i
      );
      return { type: MatchType.WORD_BOUNDARY, positions };
    }
  }

  // Fuzzy match - characters can be non-consecutive
  const positions: number[] = [];
  let textIndex = 0;
  let queryIndex = 0;
  let consecutive = true;
  let lastMatchIndex = -1;

  while (textIndex < normalizedText.length && queryIndex < normalizedQuery.length) {
    if (normalizedText[textIndex] === normalizedQuery[queryIndex]) {
      positions.push(textIndex);

      // Check if match is consecutive
      if (lastMatchIndex >= 0 && textIndex !== lastMatchIndex + 1) {
        consecutive = false;
      }

      lastMatchIndex = textIndex;
      queryIndex++;
    }
    textIndex++;
  }

  // All query characters found
  if (queryIndex === normalizedQuery.length) {
    return {
      type: consecutive ? MatchType.CONSECUTIVE : MatchType.FUZZY,
      positions,
    };
  }

  return { type: MatchType.NO_MATCH, positions: [] };
}

/**
 * Calculate score based on name match only
 */
export function calculateScore(nameMatch: MatchResult | undefined): number {
  if (!nameMatch || nameMatch.type === MatchType.NO_MATCH) {
    return 0;
  }
  return nameMatch.type;
}

/**
 * Search recordings by name only with fuzzy matching and ranking
 * Returns sorted array of matches with highest scores first
 */
export function searchRecordings(
  recordings: Recording[],
  query: string
): SearchMatch[] {
  if (!query.trim()) {
    return [];
  }

  const matches: SearchMatch[] = [];

  for (const recording of recordings) {
    // Search in recording name only
    const nameMatch = recording.name
      ? fuzzyMatch(recording.name, query)
      : undefined;

    // Calculate score
    const score = calculateScore(nameMatch);

    // Only include if there's a match
    if (score > 0) {
      matches.push({
        recording,
        score,
        matchedFields: {
          name: nameMatch,
        },
      });
    }
  }

  // Sort by score descending (highest scores first)
  return matches.sort((a, b) => b.score - a.score);
}
