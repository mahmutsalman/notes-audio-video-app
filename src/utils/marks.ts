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
 * Gets the 1-indexed mark number from a duration used as a mark.
 * @param duration - The duration object representing a mark
 */
export function getMarkNumber(duration: Duration): number {
  return Math.floor(duration.start_time) + 1;
}

/**
 * Formats a mark for display (e.g., "Mark 1", "Mark 2").
 * @param duration - The duration object representing a mark
 */
export function formatMarkLabel(duration: Duration): string {
  return `Mark ${getMarkNumber(duration)}`;
}

/**
 * Checks if a recording is a written note type.
 * @param recording - The recording to check
 */
export function isWrittenNote(recording: Recording | null | undefined): boolean {
  return recording?.recording_type === 'written';
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
