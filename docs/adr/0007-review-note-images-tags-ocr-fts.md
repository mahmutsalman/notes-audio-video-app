# ADR-0007: Review note images are a first-class image type (tags, OCR, FTS)

**Status**: Accepted
**Date**: 2026-07-10
**Supersedes**: the "no tags, no OCR, no FTS" clause of ADR-0006 (decision point 4). The rest of
ADR-0006 — the table shape, clipboard attach, and the unlink-before-cascade rule — still stands.

## Context

ADR-0006 shipped `review_note_images` as a lightweight attachment and predicted that adding tags,
OCR and search later would be "purely additive: `media_tags` is polymorphic and needs no migration,
only registry entries and a `content_type`."

That prediction was wrong in three ways, and the ways matter more than the feature.

## Decision

Promote `review_note_image` to a first-class image type, alongside `image`, `duration_image`,
`quick_capture_image` and `image_child`:

1. `caption2 TEXT` on `review_note_images`, holding OCR text (search-only, never displayed).
2. Two new FTS `content_type`s: `review_note_image` (caption + folded tag names) and
   `review_note_image_ocr` (caption2). Both use `parent_id = review_note_id`, mirroring how quick
   captures use `capture_id` — deliberately *not* a recording id, so these results carry no
   recording/topic context and offer no "go to recording" action.
3. `'review_note_image'` joins `MediaTagType`, so `media_tags` binds tags straight to the image.
4. Tag + OCR affordances are unlocked by passing `mediaType` and `imageType` to the shared
   `ImageLightbox` from `ReviewNoteImages`, `TagResultsView` and `SearchPage`.

It gains **no attached audio** and **no child images**. Review-note pictures are leaves.

## Why the "purely additive" prediction was wrong

### 1. A missing registry entry silently *deletes user data*

`runMigrations()` ends with an orphaned-`media_tags` purge. Its `mediaTagTables` map is not just a
lookup — it is the **allow-list** for a second sweep that hard-deletes every `media_tags` row whose
`media_type` is not a known key. Ship the tag UI without the map entry and the first tag a user
writes is erased on the next launch, silently.

Measured on a copy of the production DB: with the old 15-entry map, a `review_note_image` tag does
not survive one startup purge (1 → 0 rows). With the entry added, it survives (1 → 1).

This has a standing consequence: **running an older build after tagging a newer type erases that
type's tags.** Tags are user-authored content, so this falls under NFR-04 and the lesson of ADR-0004
(nothing user-authored disappears on its own). The map now carries a comment saying so.

### 2. Two registries are absent from the `docs/conventions.md` checklist

The checklist names five. Registering the type actually required **seventeen** sites. The two the
checklist never mentions:

- `PARENT_ID_QUERIES` in `operations.ts`, consumed by `FilteredSearchOperations`. Skip it and the
  type is invisible in *tag- and colour-filtered* search while working fine in plain search.
- `filteredGrouped` in `SearchPage.tsx`, a second grouping object parallel to `GroupedSearchResults`.
  The renderer typechecker catches this one; nothing catches the first.

`docs/conventions.md` has been amended.

### 3. The image handlers fail open, not closed

`SearchPage` routes image actions through `switch (baseType(...))` chains. Several end in a bare
`else` that assumes `duration_image`, and others simply fall through with no `default`. So an
unregistered image type does not throw — it quietly does the *wrong* thing:

- `handleRecordForImage` would start a `duration_image` recording with a null `duration_id`.
- `handleReplaceWithClipboard` would replace via `durationImages.replaceFromClipboard`.
- `deleteResult` and `handleSaveCaption` would no-op while the UI marks the item deleted or
  shows the new caption — the user sees a lie.

Rather than add a branch per handler and hope the next type remembers, capability is now explicit:
`IMAGE_AUDIO_TYPES` and `REPLACEABLE_IMAGE_TYPES` in `SearchPage.tsx`. Gate on capability, never on
"is it an image". `review_note_image` is in neither set.

Similarly, `imagePathsForNotes()` now purges `media_tags` in the same function that collects the file
paths, because every caller is about to cascade. Splitting them is how the third delete path forgets.

## Consequences

- Review-note images are searchable by caption, by tag, and by OCR text, and appear in Browse-by-Tag.
- `getItemsByTag` returns them without recording/topic context; `TagResultsView` renders them in
  their own section, like capture images.
- Every `reviewNoteImages:*` write path now calls `scheduleSearchReindex()`. None did before, so
  before this change the FTS index would have gone stale on add and delete anyway.
- The pre-existing return-type annotation on `getItemsByTag` remains out of sync with what it
  returns (it already omitted `capture_images`); `electron/` is untypechecked, so nothing flags it.

## Verification

Against a `.backup` snapshot of the production DB, with `foreign_keys = ON`:

- The `caption2` migration adds the column, and the `PRAGMA table_info` guard makes a second run a
  no-op. It sits *after* the `CREATE TABLE`, not with the other four `caption2` guards — those run
  earlier in `runMigrations()`, before `review_note_images` exists, so an `ALTER` there would hit a
  nonexistent table on a fresh DB.
- Both FTS statements index; `MATCH` finds the row by caption, by tag name, and by OCR text.
- The old purge deletes the tag (1 → 0); the new purge preserves it (1 → 1).
- `getItemsByTag`, `extraQueries` and `PARENT_ID_QUERIES` all return the row.
- The bulk tag purge empties `media_tags` before the note cascade removes the image row, leaving
  zero orphans.

Renderer `tsc` is clean. `electron/` holds the same 65 pre-existing errors as before the change —
measured by stashing the diff, not assumed — with none in the new code.

**Not verified:** tagging and OCR driven through the real UI. Done next, in the running app.
