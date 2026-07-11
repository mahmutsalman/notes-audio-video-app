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

/** The retention target the scheduler optimizes for (also the retrievability at the due date). */
export const REQUEST_RETENTION = 0.9;

/**
 * Short-term steps for cards that have not graduated yet (ADR-0008).
 *
 * ts-fsrs ships 1m/10m. Those made Hard on a Learning card land 6 minutes out, so a card rated
 * Hard came straight back in the same sitting and never left Learning — you study, and nothing
 * moves. FSRS does not expose Hard directly: on a learning step it schedules the **midpoint of
 * the current and next step**, so the pair below is what sets all three of Again/Hard/Good.
 *
 *   Again -> 15m   (step 0)
 *   Hard  -> 3.1h  (midpoint of 15m and 6h)
 *   Good  -> 6h    (step 1), then ~9d on the next Good, which graduates the card
 *
 * RELEARNING_STEPS applies after a lapse on an already-graduated card. Only the pre-graduation
 * schedule is touched: a Review-state card's Hard is pure FSRS stability maths and still yields
 * day-scale intervals.
 */
export const LEARNING_STEPS = ['15m', '6h'] as const;
export const RELEARNING_STEPS = ['15m'] as const;
import type { ReviewItem, ReviewRating, ReviewCardFields, ReviewEventInput } from '../types';

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
  request_retention: REQUEST_RETENTION,
  enable_fuzz: true, // small day-level randomization so cards don't bunch on identical due dates
  learning_steps: [...LEARNING_STEPS],
  relearning_steps: [...RELEARNING_STEPS],
});

const scheduler = fsrs(params);

/** Ordered list of the four grades we expose in the UI. */
export const RATING_ORDER: ReviewRating[] = ['again', 'hard', 'good', 'easy'];

/** How a stored numeric rating (1–4) is labelled and coloured everywhere it's shown. */
export const RATING_META: Record<number, { label: string; cls: string }> = {
  1: { label: 'Again', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  2: { label: 'Hard', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  3: { label: 'Good', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  4: { label: 'Easy', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
};

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

/**
 * Predicted probability (0–100%) that you'd recall this card right now, from the FSRS
 * forgetting curve (stability + days since last review). null if the card has never been
 * FSRS-reviewed. Unlike stability/difficulty this is NOT stored — it decays continuously.
 */
export function currentRetrievability(item: ReviewItem, now: Date = new Date()): number | null {
  if (item.stability == null || item.difficulty == null) return null;
  const card = itemToCard(item);
  const r = scheduler.get_retrievability(card, now, false);
  return typeof r === 'number' ? r * 100 : null;
}

const STATE_LABELS: Record<number, string> = {
  [State.New]: 'New',
  [State.Learning]: 'Learning',
  [State.Review]: 'Review',
  [State.Relearning]: 'Relearning',
};

export function stateLabel(state: number | null | undefined): string {
  return state == null ? 'New' : (STATE_LABELS[state] ?? 'New');
}

/**
 * Extras carried onto a review_events row. Reflective notes are NOT here — they live in
 * `review_notes`, written on Enter and linked to the event by id (see ADR-0005).
 */
export interface ReviewNoteExtras {
  durationSeconds: number | null;
}

/** Build the review_events payload for an algorithm-driven rating. */
export function buildRatingEvent(
  item: ReviewItem,
  applied: AppliedReview,
  rating: ReviewRating,
  extras: ReviewNoteExtras,
  now: Date = new Date()
): ReviewEventInput {
  const { before, after, log } = applied;
  return {
    reviewed_at: now.toISOString(),
    rating: RATING_TO_GRADE[rating], // 1..4
    scheduling_mode: 'fsrs',
    stability_before: before.stability,
    stability_after: after.stability,
    difficulty_before: before.difficulty,
    difficulty_after: after.difficulty,
    state_before: before.state,
    state_after: after.state,
    elapsed_days: log.elapsed_days ?? null,
    scheduled_days: after.scheduled_days,
    interval_before: item.interval_days ?? null,
    interval_after: after.scheduled_days,
    next_review_at: new Date(after.due).toISOString(),
    note: null,           // frozen legacy column — notes live in review_notes
    missed_points: null,  // frozen legacy column — notes live in review_notes
    duration_seconds: extras.durationSeconds,
  };
}

/** Build the review_events payload for a manual reschedule (no algorithm run). */
export function buildManualEvent(
  item: ReviewItem,
  fields: ReviewCardFields,
  extras: ReviewNoteExtras,
  now: Date = new Date()
): ReviewEventInput {
  const elapsed = item.last_review_at
    ? Math.round((now.getTime() - new Date(item.last_review_at).getTime()) / 86_400_000)
    : null;
  return {
    reviewed_at: now.toISOString(),
    rating: null,
    scheduling_mode: 'manual',
    stability_before: item.stability,
    stability_after: fields.stability,
    difficulty_before: item.difficulty,
    difficulty_after: fields.difficulty,
    state_before: item.state ?? null,
    state_after: fields.state,
    elapsed_days: elapsed,
    scheduled_days: fields.scheduled_days,
    interval_before: item.interval_days ?? null,
    interval_after: fields.interval_days,
    next_review_at: fields.next_review_at,
    note: null,           // frozen legacy column — notes live in review_notes
    missed_points: null,  // frozen legacy column — notes live in review_notes
    duration_seconds: extras.durationSeconds,
  };
}
