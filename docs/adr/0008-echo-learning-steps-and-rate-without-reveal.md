# ADR-0008: Echo learning steps are 15m/6h, and grading no longer requires revealing

**Status**: Accepted
**Date**: 2026-07-10
**Amends**: the FSRS configuration introduced with Echo (`src/utils/fsrs.ts`) and the reveal gate in
`ReviewSession.tsx`.

## Context

Mahmut reported that reviewing produced no sense of progress: *"I study but I don't progress. If I
click Hard, they don't move."*

Measured against his live database: 13 of 36 review items sit in FSRS **Learning** state, and with
ts-fsrs's default `learning_steps` of `['1m','10m']` a Learning card rated **Hard comes back in 6
minutes**. Again returns it in 1 minute. So a card he found hard re-entered the same sitting, over
and over, and never graduated. The feeling was accurate — the card genuinely was not moving.

The long-term maths was never the problem. A graduated **Review**-state card rated Hard already
schedules ~14 days out. Only the pre-graduation steps were pathological.

A second complaint: the rating buttons only appeared once **every** mask on the card was revealed.
Grading therefore forced him to look at the answer first, which defeats recall practice.

## Decision

### 1. Learning steps become `['15m', '6h']`, relearning `['15m']`

FSRS does not expose **Hard** as a configurable interval. On a learning step it schedules the
**midpoint of the current and next step**. So the pair of steps determines all three of Again, Hard
and Good together, and there is exactly one degree of freedom for Hard:

| Card state | Again | Hard | Good | Easy |
|---|---|---|---|---|
| New / Learning step 0 | 15m | **3.1h** | 6h | ~8d |
| Learning step 1 | 15m | 3.1h | ~9d (graduates) | ~12d |
| Review (graduated) | 15m | ~14d | ~15d | ~19d |

Chosen because Mahmut asked for "Again around 10–15 minutes, Hard around three hours." `['15m','6h']`
hits that without inventing a mechanism FSRS doesn't have.

**Review-state Hard is untouched** — it is pure stability maths and already yields day-scale
intervals. This ADR only changes the pre-graduation schedule and the post-lapse relearning step.

### 2. Existing Learning cards are not migrated

A card's `learning_steps` column is an index into the step list. The 13 Learning cards re-slot
naturally: index 0 now means 15m, index 1 now means 6h. Rewriting `state` to force them into Review
was considered and rejected — it would discard where FSRS believes those cards actually are, to buy
a one-time effect that the next Good rating produces anyway.

### 3. "Rate this card" shows the grading controls without revealing

The rating buttons were gated on `allRevealed`. They are now gated on
`canRate = allRevealed || ratingsRequested`, where `ratingsRequested` is set by a new **Rate this
card** button beside **Reveal All**. Revealing everything still implies you may grade. Cards with no
masks are unaffected: they already auto-set `allRevealed`.

The same gate governs the reflective-note panel and the manual-schedule panel, so grading without
revealing still lets you log what you missed.

## Consequences

- Rating **Hard** on an un-graduated card now removes it from the session for ~3 hours instead of
  6 minutes. Sessions get shorter and finish.
- Rating **Good** on a fresh card schedules 6 hours rather than 10 minutes, so a card seen once
  today is typically seen again this evening, then in ~9 days.
- Grading without revealing is now possible, which means it is also possible to grade a card you
  never actually attempted. That is the user's call to make, not the app's.
- These are global constants (`LEARNING_STEPS`, `RELEARNING_STEPS`). Surfacing them as a user setting
  alongside `REQUEST_RETENTION` remains a follow-up, as does the per-user FSRS parameter optimizer
  fed by `review_events`.

## Verification

Intervals probed through the app's own `previewRatings()` — the real `src/utils/fsrs.ts`, bundled
with esbuild, not a reimplementation — using the actual stability/difficulty/state values of review
items 29, 31 and 32 read from the production database:

```
LEARNING step0  id 29   again: 15m   hard: 3.1h   good: 6.0h   easy: 10.0d
LEARNING step1  id 31   again: 15m   hard: 3.1h   good: 9.0d   easy: 12.0d
REVIEW          id 32   again: 15m   hard: 15.0d  good: 16.0d  easy: 20.0d
```

(Day values wobble by ±1 because `enable_fuzz` is on.)

Renderer `tsc` is clean. **Not verified:** the "Rate this card" button in the running app.
