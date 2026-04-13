import type { ReviewRating } from '../types';

export interface SrsResult {
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  nextReviewAt: string;
}

/**
 * Custom SRS algorithm (not SM-2).
 * First repetition uses fixed intervals: again=1d, hard=1d, good=1d, easy=4d.
 * Subsequent repetitions multiply by ease factor with per-rating adjustments.
 */
export function computeNextReview(
  currentIntervalDays: number,
  easeFactor: number,
  repetitions: number,
  rating: ReviewRating
): SrsResult {
  let newInterval = currentIntervalDays;
  let newEase = easeFactor;
  let newReps = repetitions;

  if (repetitions === 0) {
    // First review — fixed bootstrapping intervals
    switch (rating) {
      case 'again': newInterval = 1; newEase = Math.max(1.3, easeFactor - 0.2); newReps = 0; break;
      case 'hard':  newInterval = 1; newEase = Math.max(1.3, easeFactor - 0.1); newReps = 1; break;
      case 'good':  newInterval = 1; newReps = 1; break;
      case 'easy':  newInterval = 4; newEase = Math.min(3.0, easeFactor + 0.15); newReps = 1; break;
    }
  } else {
    switch (rating) {
      case 'again':
        newInterval = Math.max(1, Math.ceil(currentIntervalDays * 0.2));
        newEase = Math.max(1.3, easeFactor - 0.2);
        newReps = 0;
        break;
      case 'hard':
        newInterval = Math.ceil(currentIntervalDays * 1.2);
        newEase = Math.max(1.3, easeFactor - 0.15);
        newReps = repetitions + 1;
        break;
      case 'good':
        newInterval = Math.ceil(currentIntervalDays * easeFactor);
        newReps = repetitions + 1;
        break;
      case 'easy':
        newInterval = Math.ceil(currentIntervalDays * easeFactor * 1.3);
        newEase = Math.min(3.0, easeFactor + 0.15);
        newReps = repetitions + 1;
        break;
    }
  }

  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + newInterval);
  // Set to start of that day
  nextDate.setHours(0, 0, 0, 0);

  return {
    intervalDays: newInterval,
    easeFactor: newEase,
    repetitions: newReps,
    nextReviewAt: nextDate.toISOString(),
  };
}

/** Convert a preset string ('5d','1w','2w','1m','3m') to a nextReviewAt ISO string */
export function presetToNextReview(preset: string): { nextReviewAt: string; intervalDays: number } {
  const presets: Record<string, number> = {
    '1d': 1, '3d': 3, '5d': 5, '1w': 7, '2w': 14, '1m': 30, '3m': 90,
  };
  const days = presets[preset] ?? 7;
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + days);
  nextDate.setHours(0, 0, 0, 0);
  return { nextReviewAt: nextDate.toISOString(), intervalDays: days };
}

/** Format a next_review_at ISO string into a human-readable due label */
export function formatDueLabel(nextReviewAt: string): string {
  const now = new Date();
  const then = new Date(nextReviewAt);
  const diffMs = then.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 'Due now';
  if (diffDays === 1) return 'Due tomorrow';
  if (diffDays < 7) return `Due in ${diffDays}d`;
  if (diffDays < 30) return `Due in ${Math.round(diffDays / 7)}w`;
  if (diffDays < 365) return `Due in ${Math.round(diffDays / 30)}mo`;
  return `Due in ${Math.round(diffDays / 365)}y`;
}
