# ADR-0009: The review scratch code pad is anchored to the card, not to a note

**Status**: Accepted
**Date**: 2026-07-10
**Relates to**: ADR-0005 (many reflective notes per review), ADR-0006/0007 (images on review notes).

## Context

Mahmut wanted a Monaco editor beside the card in the Echo review session, so he can type his attempt
at the problem while reviewing it, persisted to SQLite. He described it as attached to "the current
review note."

## Decision

Anchor the code to the **review item** (the enrolled card), not to a review note.

```
review_items                     the card. always exists.
  ├─ review_masks                blur regions
  ├─ review_code_snippets  ←NEW  exactly one row per card
  └─ review_notes                one row per Enter press, many per card
       └─ review_note_images
```

### Why not `review_note_id`

A `review_note` row is not a container for the card's work. It is a single reflective text entry
created **only when the user presses Enter** (`ReviewNoteOperations.add`: *"Write one note
immediately (the user pressed Enter)"*). Consequences, all fatal for this feature:

- Before Enter, no note row exists — the editor would have nothing to save against, and typing code
  is the *first* thing you'd do on a card, before you know what to write about it.
- There are **many** notes per card, across two kinds (`note` / `missed`). "The current review note"
  is ambiguous; you'd get one editor per logged note.
- Draft notes are event-less until the card is rated, and deleting a note cascades its children — so
  tidying up a typo'd note would silently delete the code you wrote.

The card is the only stable, always-present anchor, and it is where `review_masks` already hangs.

### Shape

- `review_code_snippets(id, review_item_id UNIQUE, language, code, created_at, updated_at)`,
  cascading from `review_items`. **`UNIQUE(review_item_id)` enforces "one pad per card" in the
  schema**, not by convention, so the autosave upsert cannot silently create a second row.
- Two IPC handlers: `reviewCodeSnippets:getByItem` and `reviewCodeSnippets:save`. `save` is an
  `INSERT … ON CONFLICT(review_item_id) DO UPDATE`, therefore idempotent — required, because
  autosave calls it on every debounce tick.
- `language` defaults to `'java'`, switchable via the editor's existing language selector.

### Autosave, not a save button

Writes fire ~600ms after typing stops, and are flushed on card change, on unmount, and on
`beforeunload`. This matches how a reflective note persists the instant Enter is pressed: navigating
away must never destroy work. An explicit save button was rejected for the same reason ADR-0005
rejected deferred note creation — arrow-keying to the next card would silently discard the typing.

**The pending write carries its own `reviewItemId`** rather than reading the current prop. The
debounce can outlive the card: arrow-key to the next card within 600ms of a keystroke, and a naive
implementation writes the previous card's code onto the new one. The pane is also keyed on
`current.id`, so React tears it down (flushing) before mounting the next card's pad.

## Consequences

- The pad is not in FTS. Deliberately deferred: a new searchable `content_type` costs the
  seventeen-site registry checklist catalogued in ADR-0007, and would double this change. The `code`
  column is there when we want it.
- Monaco is `React.lazy`-loaded. Importing `CodeEditor` pulls in all five Monaco workers as a module
  side effect, and `ReviewSession` is otherwise Monaco-free.
- `CodeEditor` gained an opt-in `fill` prop. Its root is `flex flex-col` with no height of its own,
  so the existing `height` prop cannot take `"100%"` — a percentage resolves against an auto-height
  parent and collapses to zero. Existing call sites pass fixed pixel heights and are untouched.
- The pane is hidden by default and toggled from the top bar; the preference persists in
  `localStorage` under `echo.showCodePane`. An existing review flow is unchanged until asked for.
- Peek mode (`readOnly`) renders the pad read-only and never writes, consistent with "Peek writes
  nothing."
- Sizing is a fixed `42%` column. No resizable divider: the repo has no split-pane dependency and
  hand-rolling one is its own slice.

## Verification

Against a `.backup` snapshot of the production DB with `foreign_keys = ON`:

- Three consecutive saves on card 32 leave exactly **one** row, with the last value.
- A second card gets its own row.
- A raw duplicate `INSERT` is rejected: `UNIQUE constraint failed: review_code_snippets.review_item_id`.
- Deleting a `review_item` cascades its pad away, leaving zero orphans.

Renderer `tsc` clean. `electron/` holds exactly its 65 pre-existing errors, none in the new code.

**Not verified:** typing in the pane in the running app, and the autosave flush on card change.
