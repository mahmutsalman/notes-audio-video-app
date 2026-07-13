import { Duration, Recording } from '../types';

/**
 * Creates start_time and end_time values for a new mark.
 * Marks use the duration table but with sequential indices instead of timestamps.
 * @param markIndex - The 0-based index of the mark (0 for Mark 1, 1 for Mark 2, etc.)
 */
export function createMarkTimes(markIndex: number): { start_time: number; end_time: number } {
  return {
    start_time: markIndex,
    end_time: markIndex + 1,
  };
}

/**
 * A mark has no title column. Its human-readable name is the first non-blank line of its note.
 * Returns null for an untitled mark.
 *
 * ⚠️ The block tags MUST become newlines before the text is extracted. Quill stores a note as
 * `<p>Minimum Window Substring</p><p>Sliding Window · Hard</p><p>Smallest substring of s…</p>`,
 * and `textContent` concatenates straight across those boundaries — it yields
 * "Minimum Window SubstringSliding Window · HardSmallest substring of s…" with no newline to split
 * on, so "the first line" silently becomes the whole note. `<br>` is worse: it is an empty element,
 * so it contributes nothing at all. Both must be rewritten to "\n" first.
 */
export function extractMarkTitle(noteHtml: string | null | undefined): string | null {
  if (!noteHtml) return null;
  const withBreaks = noteHtml
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, '\n');
  // innerHTML+textContent (rather than a tag-stripping regex) so HTML entities decode properly.
  const tmp = document.createElement('div');
  tmp.innerHTML = withBreaks;
  const text = tmp.textContent ?? '';
  const first = text.split('\n').find(l => l.trim()) ?? '';
  return first.trim().slice(0, 100) || null;
}

/**
 * The one-line "which question is this?" label for an echo: `Mark 20 · Minimum Window Substring`.
 *
 * `markNumber` is POSITIONAL — the 1-based rank of the mark within its recording — and must come
 * from the caller (the SQL recomputes it, MarkList uses the array index). It is deliberately not
 * derived from the Duration row: `start_time` only coincides with the displayed number on a
 * never-reordered written note, which is exactly the trap the old helper here fell into.
 *
 * Degrades cleanly: an untitled mark gives "Mark 20", a mark with no number gives just the title,
 * and an echo with neither gives null (render nothing).
 */
export function formatMarkSource(
  markNumber: number | null | undefined,
  noteHtml: string | null | undefined
): string | null {
  const title = extractMarkTitle(noteHtml);
  const number = markNumber != null ? `Mark ${markNumber}` : null;
  if (number && title) return `${number} · ${title}`;
  return number ?? title;
}

/**
 * Checks if a recording is a written note type.
 * @param recording - The recording to check
 */
export function isWrittenNote(recording: Recording | null | undefined): boolean {
  return recording?.recording_type === 'written';
}

export function isBookNote(recording: Recording | null | undefined): boolean {
  return recording?.recording_type === 'book';
}

export function isReaderNote(recording: Recording | null | undefined): boolean {
  return recording?.recording_type === 'reader';
}

export function isMarkBasedNote(recording: Recording | null | undefined): boolean {
  return isWrittenNote(recording) || isBookNote(recording) || isReaderNote(recording);
}

/**
 * Gets the next mark index based on existing marks (durations) for a written note.
 * @param durations - Array of existing durations/marks
 */
export function getNextMarkIndex(durations: Duration[]): number {
  if (durations.length === 0) {
    return 0;
  }
  // Find the maximum start_time and add 1
  const maxIndex = Math.max(...durations.map(d => Math.floor(d.start_time)));
  return maxIndex + 1;
}
