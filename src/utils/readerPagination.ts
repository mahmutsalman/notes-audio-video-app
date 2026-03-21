import { BookPage } from '../types';

export interface PageMapEntry {
  pageNum: number;
  startOffset: number;
  endOffset: number;
}

/** Maps character offsets in fullText back to original PDF page numbers. */
export function buildPageMap(pages: BookPage[]): PageMapEntry[] {
  const map: PageMapEntry[] = [];
  let offset = 0;
  for (const page of pages) {
    const start = offset;
    const end = offset + page.text.length;
    map.push({ pageNum: page.page_num, startOffset: start, endOffset: end });
    offset = end + 2; // +2 for the '\n\n' separator between pages
  }
  return map;
}

/** Concatenates all page texts with '\n\n' separator, mirroring buildPageMap offsets. */
export function buildFullText(pages: BookPage[]): string {
  return pages.map((p) => p.text).join('\n\n');
}

/**
 * Calculates how many characters fit in a view at the given font size and container size.
 * Uses a conservative estimate with 0.85 fill factor to account for word wrapping.
 */
export function measureTextCapacity(
  containerWidth: number,
  containerHeight: number,
  fontSize: number
): number {
  const padding = 40 * 2; // 40px each side
  const availableWidth = containerWidth - padding;
  const availableHeight = containerHeight - padding - 60; // 60px for status bar

  const avgCharWidth = fontSize * 0.48;
  const lineHeightPx = fontSize * 1.8;

  const charsPerLine = Math.floor(availableWidth / avgCharWidth);
  const linesPerPage = Math.floor(availableHeight / lineHeightPx);
  const capacity = Math.floor(charsPerLine * linesPerPage * 0.85);

  return Math.max(capacity, 80); // minimum 80 chars
}

/**
 * Given full text and a start offset, finds the end offset for a view of the given capacity.
 * Breaks at sentence ends ('. ') within the last 50% of capacity, otherwise at word boundaries.
 */
export function findViewEnd(
  fullText: string,
  startOffset: number,
  capacity: number
): number {
  const totalLength = fullText.length;
  const rawEnd = startOffset + capacity;

  if (rawEnd >= totalLength) return totalLength;

  // Look for sentence break in last 50% of capacity
  const sentenceSearchStart = startOffset + Math.floor(capacity * 0.5);
  const sentenceBreak = fullText.lastIndexOf('. ', rawEnd);
  if (sentenceBreak >= sentenceSearchStart) {
    return sentenceBreak + 2; // include the '. '
  }

  // Fall back to word boundary
  const wordBreak = fullText.lastIndexOf(' ', rawEnd);
  if (wordBreak > startOffset) {
    return wordBreak + 1; // include the space
  }

  return rawEnd;
}

/**
 * Given a character offset, finds the corresponding original PDF page number.
 * Returns the first page if offset is before all pages.
 */
export function findOriginalPage(
  characterOffset: number,
  pageMap: PageMapEntry[]
): number {
  if (pageMap.length === 0) return 1;
  // Scan from end: first entry where offset >= entry.startOffset
  for (let i = pageMap.length - 1; i >= 0; i--) {
    if (characterOffset >= pageMap[i].startOffset) {
      return pageMap[i].pageNum;
    }
  }
  return pageMap[0].pageNum;
}

/**
 * Returns the character offset for the start of the given original PDF page number.
 */
export function getOffsetForPage(
  pageNum: number,
  pageMap: PageMapEntry[]
): number {
  const entry = pageMap.find((e) => e.pageNum === pageNum);
  return entry ? entry.startOffset : 0;
}

/**
 * Builds an array of view start offsets by paginating fullText from the beginning.
 * Computed lazily up to maxViews from startOffset.
 */
export function buildViewOffsets(
  fullText: string,
  capacity: number
): number[] {
  const offsets: number[] = [];
  let offset = 0;
  while (offset < fullText.length) {
    offsets.push(offset);
    const nextOffset = findViewEnd(fullText, offset, capacity);
    if (nextOffset <= offset) break; // safety guard
    offset = nextOffset;
  }
  return offsets;
}

/**
 * Finds which view index a character offset belongs to, given viewOffsets.
 */
export function findViewIndex(
  characterOffset: number,
  viewOffsets: number[]
): number {
  if (viewOffsets.length === 0) return 0;
  for (let i = viewOffsets.length - 1; i >= 0; i--) {
    if (characterOffset >= viewOffsets[i]) return i;
  }
  return 0;
}
