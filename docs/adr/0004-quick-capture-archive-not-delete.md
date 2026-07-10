# ADR-0004: Quick Capture hides by archiving, never by deleting or expiring

**Status**: Accepted
**Date**: 2026-07-09
**Supersedes**: the 7-day TTL behavior described by the original FR-16 and NFR-04.

## Context

Quick Capture was designed as an ephemeral scratch pad with a 7-day TTL. On every app startup,
`QuickCaptureOperations.getExpired()` returned all captures older than 7 days and the caller
hard-deleted the `quick_captures` rows, the image and audio files on disk, and (via
`ON DELETE CASCADE` + `media_tags`) their tag associations.

The design assumed users would treat the tab as scratch space. In practice it became the primary
capture method. On 2026-07-06 the user discovered months of captures had been silently destroyed —
no warning, no confirmation, no recovery path. A stopgap landed on 2026-07-07 (`AUTO_DELETE_ENABLED
= false`) but was never committed.

Separately, the user streams while capturing and needs to clear old captures off screen before
going live, without losing them. The stated requirement was explicit: keep them in the database,
keep them taggable, keep them findable — just stop showing them.

## What We Learned / Constraints

- `getOrCreate()` funnels every paste inside the window into a **single** capture "package". The
  production database is one `quick_captures` row holding 49 images. Any hide mechanism must be
  applied at the capture level, and must be respected by **both** read paths — filtering only the
  list query would let the next paste reopen the hidden capture and drag all 49 images back.
- `rebuildSearchIndex()` selects straight from `quick_capture_images` with no join to the parent
  capture. So hiding a capture does not remove its images from FTS — "hidden but still findable"
  comes for free, provided we hide the parent rather than delete the children.
- `media_tags` associates tags with `quick_capture_image` ids, independent of the parent capture.
  Tag search therefore survives archiving untouched.
- A silent time-based disappearance is the same anti-pattern that caused the data loss, even when
  it merely hides rather than deletes: the user cannot distinguish "hidden" from "gone".

## Decision

1. Add a nullable `quick_captures.archived_at` column. `NULL` = on the board; a timestamp = archived.
2. **Hiding is always an explicit user action.** A "Clear board" button stamps `archived_at` on
   every un-archived capture. It deletes nothing: no rows, no files, no `media_tags`, no
   `search_index` entries.
3. **Remove the silent 7-day window entirely.** `getRecent()` filters on `archived_at IS NULL` and
   nothing else. Nothing ever leaves the board on its own. The "expires in Nd" badge and the
   "Items expire after 7 days" subtitle are removed because they no longer describe reality.
4. `getOrCreate()` also requires `archived_at IS NULL`, so clearing the board genuinely starts a
   fresh capture package on the next paste.
5. **Hiding is always reversible.** An "Archived" tab lists archived captures with a per-item
   Restore, and an Undo banner appears immediately after a clear.
6. `getExpired()` stays a committed no-op. The destructive path is retained only as dead code behind
   `AUTO_DELETE_ENABLED = false` so the intent is legible; `CapturePage` no longer calls the
   `quickCaptures:cleanup` IPC at all.

## Consequences

- The board grows without bound until the user clears it. Accepted: the user asked for exactly this,
  and unbounded-but-visible is strictly safer than bounded-but-silent.
- FR-16 and NFR-04 are rewritten. NFR-04 now states the general principle: **no user-authored content
  is ever deleted on a timer, and hiding is always reversible.** This governs any future feature that
  proposes a TTL, cache eviction, or "temporary" space for user content.
- Archived captures accumulate in `quick_captures`. If the Archived tab ever grows unwieldy, the fix
  is pagination or grouping — not deletion.
- `archived_at` rides along with the existing whole-database sync to the VPS. No server change needed;
  the FastAPI server does not read `quick_captures`.

## Verification

Lifecycle exercised against a copy of the production database before shipping: clear leaves the board
empty with all 49 images and 47 tag associations intact; the next paste opens a new package instead of
reopening the archived one; restore round-trips losslessly; all 49 images remain visible to the search
indexer while archived.
