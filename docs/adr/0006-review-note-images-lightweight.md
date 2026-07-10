# ADR-0006: Images on review notes are lightweight attachments (for now)

**Status**: Accepted
**Date**: 2026-07-10
**Builds on**: ADR-0005 (many reflective notes per review). Images hang off a `review_note_id`,
which is why both prompts get attachments with no further migration to `review_notes`.

## Context

Mahmut wanted to attach pictures to a reflective review note — e.g. a screenshot of the correct
solution next to "I missed the base case".

The app already has four first-class image types (`images`, `duration_images`,
`quick_capture_images`, `image_children`). Each carries tags via the polymorphic `media_tags`,
OCR text in `caption2`, and an FTS entry with its own `content_type`. Per `docs/conventions.md`,
adding a fifth means touching five registries that must all agree — `rebuildSearchIndex()`,
`GlobalSearchResult`, `GroupedSearchResults` + `SECTION_ORDER`, `IMAGE_SECTION_KEYS` /
`CONTEXT_MENU_TYPES`, and `SearchOperations.extraQueries`. Miss one and search silently half-works.

## Decision

Ship images as **lightweight attachments** first.

1. New table `review_note_images (id, review_note_id, file_path, thumbnail_path, caption,
   sort_order, created_at)`, cascading from `review_notes`.
2. Attach by pasting from the clipboard. Files land in `media/review_notes/images/<uuid>.<ext>`,
   using the original as its own thumbnail — the same shape as `saveQuickCaptureImage`, which
   also has no `sharp` thumbnailing.
3. View by clicking, in the existing `ImageLightbox`. It is rendered **without** `mediaType` or
   `imageType`, so its tag / OCR / enroll affordances stay hidden — the component already guards
   every optional handler.
4. **No tags, no OCR, no FTS.** Adding them later is purely additive: `media_tags` is polymorphic
   and needs no migration, only registry entries and a `content_type`.

## Consequences — the one that bites

**Cascade deletes remove the image ROWS but never the FILES.** `review_note_images` cascades from
`review_notes`, which cascades from `review_events` and `review_items`. Left alone, deleting a note,
a review, or a whole review item would silently orphan every attached picture on disk.

So all three delete paths collect `file_path` (and `thumbnail_path`) *before* the rows are removed,
and the IPC handler unlinks them:

- `ReviewNoteOperations.delete` → its own images
- `ReviewEventOperations.delete` → images under all of that event's notes
- `ReviewOperations.delete` (review item) → images under all of the item's notes

This is the same class of defect as the orphaned Quick Capture files (see ADR-0004): SQLite is happy
to forget a row, and the bytes stay behind forever.

## Consequences — a bug found while wiring this up

`quickCaptures:deleteImage` called `fs.unlink(path).catch(...)` on the **callback-style** `fs`, not
`fs/promises`. Node throws `ERR_INVALID_ARG_TYPE` synchronously when the callback is missing, so the
`.catch()` never ran: the handler rejected *after* the DB row was deleted, the file orphaned, and the
`scheduleSearchReindex()` on the next line never fired — leaving a stale FTS entry too. Fixed here by
importing `fsp from 'fs/promises'`. This most likely explains the orphaned quick-capture image files
recovered on 2026-07-06.

Root cause worth recording: **`tsconfig.json` has `"include": ["src"]`, so `electron/` is never
typechecked.** `npm run build` runs `tsc`, but only over the renderer. The main process currently has
65 type errors, including `fs.mkdir(dir, {recursive:true})` used callback-style at `handlers.ts:718`.
A typechecked main process would have caught the `unlink` bug at author time. Not fixed here — it is
its own task — but it means "tsc passed" says nothing about `electron/`.

## Verification

Cascades exercised against a production DB copy with `foreign_keys = ON`: note delete cascades its
image rows; event delete cascades two levels (note + images); review-item delete cascades three
(event → note → image); the FK rejects an image on a nonexistent note; and the path-collection query
returns the files before the rows disappear, which is what the handler unlinks.
