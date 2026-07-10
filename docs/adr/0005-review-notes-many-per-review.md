# ADR-0005: Many reflective notes per review, written on Enter

**Status**: Accepted
**Date**: 2026-07-09
**Related**: ADR-0004 (never delete user-authored content on a timer). Same principle, applied to
review notes: a note the user typed must not be discarded by a UI transition.

## Context

A review card offered two reflective prompts — "What did you think?" and "What did you miss /
keep forgetting?" — each a single textarea, each persisted into one `review_events` column
(`note`, `missed_points`) at the moment the card was rated.

Two problems:

1. **One note per prompt.** The user wanted to log several separate thoughts per review, pressing
   Enter to commit one and begin the next, on both prompts.
2. **Notes were silently destroyed.** Both textareas reset in a `useEffect` keyed on the current
   card id, and nothing was persisted until a rating button was pressed. Typing a note and then
   pressing ← or → to navigate cards wiped it with no warning. Abandoning a card discarded it too.
   Meanwhile the placeholder already read "(Enter to log)" — Enter only replayed a CSS glow and
   suppressed the newline. The UI had been promising persistence it never delivered.

## What We Learned / Constraints

- The `review_events` row does not exist while the user is typing. It is created by the rating.
  So a note written on Enter has no event to belong to yet.
- `getOrCreate`-style reuse is not available here: each rating creates a fresh event. Notes must
  therefore be addressable by *card* first, and adopted by the event afterwards.
- Notes are also added to *past* reviews from the Echo detail page, where the event already exists.
  One write path must serve both.
- 17 existing events carried legacy note text (21 values across the two columns). Discarding them
  was never an option.

## Decision

1. New table `review_notes (id, review_item_id, review_event_id, kind, body, sort_order, created_at)`.
   `kind` is `'note' | 'missed'` under a CHECK constraint, so both prompts share one table.
2. **A note is written the instant Enter is pressed**, with `review_event_id IS NULL` — a draft
   belonging to the card. It survives arrow-key navigation, leaving the session, and never rating.
   The session re-hydrates drafts when the card is revisited.
3. **Rating adopts the drafts.** `rate()` / `schedule()` take the draft ids and, inside the same
   transaction that writes the event, set `review_event_id`. The UPDATE is scoped by
   `review_item_id = ? AND review_event_id IS NULL`, so a stale id from another card cannot be
   re-parented and an already-claimed note cannot be stolen by a later event.
4. **Rating flushes un-Entered text.** Whatever is still sitting in a textarea is committed as a
   final note before the event is written. Pressing "Good" mid-sentence cannot discard it.
5. Adding a note from the detail page passes the existing event id straight to `add()`, so it is
   attached immediately rather than created as a draft.
6. **The legacy `review_events.note` / `.missed_points` columns are backfilled once, then frozen** —
   never read, never written again (the builders write `null`). They are left in place as a recovery
   copy rather than dropped, per ADR-0004. `reviewEvents:updateNote` is deleted outright: the op, the
   IPC handler, and the preload bridge.

## Consequences

- Drafts can outlive a session. A card the user typed on but never rated keeps its notes, and they
  reappear on the next review. This is the intended behavior, not a leak.
- Deleting a review event cascades to its notes; deleting a review item cascades to its drafts.
  Both are explicit user actions, matching the old semantics where the note lived on the event row.
- `ReviewNoteExtras` no longer carries note text — only `durationSeconds`. Event rows record FSRS
  state and timing; prose lives in `review_notes`.
- The legacy columns will drift from the notes table forever. That is accepted: they are a frozen
  snapshot, and no code path reads them. Do not "re-sync" them.
- **This shape is what makes images-on-notes cheap.** An image hangs off a `review_note_id`, so both
  prompts get attachments with no further migration to the notes table.

## Verification

Migration and backfill exercised against a copy of the production database: 21 notes backfilled from
17 events, zero legacy values left unmatched. Lifecycle tested in a single connection with
`foreign_keys = ON`: drafts persist, rating links exactly the right rows, a stale id from another
card is not re-parented, a later event cannot steal claimed notes, the `kind` CHECK rejects bad
values, the FK rejects a nonexistent event, and both cascades fire.

Confirmed end-to-end in the running app on 2026-07-09: two notes logged with Enter on card 31
(`sort_order` 0 and 1, `kind='missed'`), then a Hard rating created event 73 and adopted both.
