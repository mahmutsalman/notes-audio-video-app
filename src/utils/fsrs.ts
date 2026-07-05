import {
  fsrs,
  generatorParameters,
  createEmptyCard,
  Rating,
  State,
  type Card,
  type Grade,
  type RecordLogItem,
  type FSRSParameters,
} from 'ts-fsrs';
import type { ReviewItem, ReviewRating, ReviewCardFields } from '../types';

/**
 * FSRS scheduler wrapper for Echo.
 *
 * Uses the open-source FSRS-6 implementation (ts-fsrs). Each review_item is treated as an
 * FSRS Card; ratings run the algorithm, manual scheduling bypasses it but keeps card state.
 *
 * request_retention 0.9 matches Anki's default target (90% recall). It can be surfaced as a
 * user setting later; the per-user parameter optimizer is a future follow-up fed by review_events.
 */
const params: FSRSParameters = generatorParameters({
  request_retention: 0.9,
  enable_fuzz: true, // small day-level randomization so cards don't bunch on identical due dates
});

const scheduler = fsrs(params);

/** Ordered list of the four grades we expose in the UI. */
export const RATING_ORDER: ReviewRating[] = ['again', 'hard', 'good', 'easy'];

const RATING_TO_GRADE: Record<ReviewRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

/** Reconstruct an FSRS Card from a stored review_item row. */
export function itemToCard(item: ReviewItem): Card {
  // Legacy / never-FSRS-reviewed row → start a fresh card but keep its existing due date so we
  // don't yank the schedule forward. A NULL stability is the sentinel for "predates FSRS".
  if (item.stability == null || item.difficulty == null) {
    const empty = createEmptyCard(new Date());
    if (item.next_review_at) empty.due = new Date(item.next_review_at);
    return empty;
  }
  return {
    due: new Date(item.next_review_at),
    stability: item.stability,
    difficulty: item.difficulty,
    elapsed_days: 0, // deprecated in ts-fsrs; recomputed internally from last_review
    scheduled_days: item.scheduled_days ?? 0,
    learning_steps: item.learning_steps ?? 0,
    reps: item.repetitions ?? 0,
    lapses: item.lapses ?? 0,
    state: (item.state ?? State.New) as State,
    last_review: item.last_review_at ? new Date(item.last_review_at) : undefined,
  };
}

/** Convert an FSRS Card into the flat fields persisted by review:rate / review:schedule. */
export function cardToFields(card: Card): ReviewCardFields {
  return {
    stability: card.stability,
    difficulty: card.difficulty,
    state: card.state,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    repetitions: card.reps,
    lapses: card.lapses,
    last_review_at: card.last_review ? new Date(card.last_review).toISOString() : null,
    next_review_at: new Date(card.due).toISOString(),
    interval_days: card.scheduled_days, // mirror for legacy display columns
  };
}

export interface RatingPreview {
  rating: ReviewRating;
  nextReviewAt: string;
  intervalDays: number;
}

/** Preview the resulting due date/interval for each of the four ratings (for the button labels). */
export function previewRatings(item: ReviewItem, now: Date = new Date()): Record<ReviewRating, RatingPreview> {
  const card = itemToCard(item);
  const record = scheduler.repeat(card, now);
  const out = {} as Record<ReviewRating, RatingPreview>;
  for (const rating of RATING_ORDER) {
    const { card: next } = record[RATING_TO_GRADE[rating]];
    out[rating] = {
      rating,
      nextReviewAt: new Date(next.due).toISOString(),
      intervalDays: next.scheduled_days,
    };
  }
  return out;
}

export interface AppliedReview {
  fields: ReviewCardFields;
  before: Card;
  after: Card;
  log: RecordLogItem['log'];
}

/** Apply an algorithm-driven rating, returning the fields to persist plus before/after snapshots. */
export function applyRating(item: ReviewItem, rating: ReviewRating, now: Date = new Date()): AppliedReview {
  const before = itemToCard(item);
  const result: RecordLogItem = scheduler.next(before, now, RATING_TO_GRADE[rating]);
  return { fields: cardToFields(result.card), before, after: result.card, log: result.log };
}

/**
 * Apply a manual reschedule: pin the next review `days` out (start of that day) and keep the
 * FSRS card state untouched. Returns the fields to persist.
 */
export function applyManual(item: ReviewItem, days: number, now: Date = new Date()): ReviewCardFields {
  const card = itemToCard(item);
  const due = new Date(now);
  due.setDate(due.getDate() + days);
  due.setHours(0, 0, 0, 0);
  return {
    stability: card.stability || null,
    difficulty: card.difficulty || null,
    state: card.state,
    scheduled_days: days,
    learning_steps: card.learning_steps,
    repetitions: card.reps,
    lapses: card.lapses,
    last_review_at: now.toISOString(),
    next_review_at: due.toISOString(),
    interval_days: days,
  };
}

/** Manual reschedule to an explicit calendar date (start of that day, local time). */
export function applyManualDate(item: ReviewItem, date: Date, now: Date = new Date()): ReviewCardFields {
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const days = Math.max(0, Math.round((target.getTime() - startOfDay(now).getTime()) / 86_400_000));
  return applyManual(item, days, now);
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}
