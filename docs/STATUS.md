# Status — Notes With Audio And Video

**Last updated**: 2026-07-10 10:15
**Current phase**: Desktop — Echo review notes (Quick Capture data-safety track closed; mobile Phase 6 paused)
**Current slice**: Images on review notes — DONE and VERIFIED LIVE (`d3caa6f`).
**Branch**: personal (clean; `main` is content-current, 5 commits unpushed — see Active Blockers)

---

## Last Completed Task
Images on review notes (`d3caa6f`, ADR-0006). Paste a picture onto any logged note, either prompt,
in the review session or on the Echo detail page; click for the lightbox, hover to delete. New
`review_note_images` table. All three delete paths (note / event / review item) now collect image
file paths BEFORE the rows cascade away, so pictures can't orphan on disk. Also fixed a live
pre-existing bug: `quickCaptures:deleteImage` used callback-style `fs.unlink(p).catch()`, which
throws synchronously — the row was deleted, the file orphaned, and `scheduleSearchReindex()` never
ran. That likely explains the orphaned quick-capture files recovered on 2026-07-06.

Earlier the same evening: `review_notes` + multi-note UI (`2111181`, ADR-0005), and Mahmut's own
zoom/mask work split out and committed unmodified first (`2517d4f`).

## Test Status / Debt
PASS-WITH-GAPS — no automated tests on this surface.
- Verified: renderer `tsc` clean; my main-process code checked against a temporary tsconfig (clean);
  every cascade exercised on a production DB copy with `foreign_keys=ON` — note delete cascades its
  image rows, event delete cascades 2 levels, review-item delete cascades 3 (event → note → image),
  the FK rejects an image on a nonexistent note, and image paths are collected BEFORE the rows
  vanish so the handler can unlink the files (SQLite forgets rows, never bytes).
- Confirmed live last session: two Enter-logged notes adopted by event 73 on a Hard rating.
- VERIFIED LIVE 2026-07-10: pasted an image onto a review note in the running app. Thumbnail rendered;
  `review_note_images` row 1 → note 24 (parent exists, no orphan); file on disk, 29,699 bytes.
- UNVERIFIED: type a note, press ← then →, confirm it survives — the recovery case that motivated
  persist-on-Enter. Also: deleting a note from the Echo detail page.

## Next Concrete Action
Pick the next slice. Both candidates below are unblocked now that `main` is current.

Optional, in rough priority:
- Typecheck `electron/` — `tsconfig.json` has `"include": ["src"]`, so the whole main process is
  unchecked (65 errors). This HID A REAL BUG this session: `quickCaptures:deleteImage` called
  callback-style `fs.unlink(p).catch()`, which throws synchronously, so the row was deleted, the
  file orphaned, and `scheduleSearchReindex()` never ran. Fixed in `d3caa6f`; the class of bug is
  still lurking (e.g. `fs.mkdir` at handlers.ts:718).
- Make review-note images tagged / OCR'd / FTS-searchable — additive, see ADR-0006.

## Active Blockers
- `CODESIGN_IDENTITY` in `~/.zshrc` names a deleted cert (`Apple Development … JT52RUPZ2T`), so
  `npm run resign` fails on every build. Only valid identity is
  `Developer ID Application: Mahmut Salman (7ZS727Z3N6)`. `CLAUDE.local.md` still documents the dead one.
- `main` carries **5 commits never pushed to origin**. Pushing is outward-facing — needs an explicit
  go-ahead.

## Resolved 2026-07-10
- **`main` is no longer behind.** It had drifted 224 commits; `5924553` sets its tree to personal's
  desktop content in one commit (45 files, +4098/−369, zero conflicts) rather than replaying the 135
  desktop-only commits with the documented bulk cherry-pick, which a dry-run showed would conflict on
  most of them. Verified before committing: zero files under `mobile/`, `server/`, `sync/`,
  `localResources/`; desktop tree byte-identical to personal's. Verified after: all six ADRs,
  `review_note_images`, `archived_at`, `AUTO_DELETE_ENABLED = false` all present. `main` was then
  merged into `personal` cleanly and is an ancestor again, so the documented sync block works and
  "desktop commits go on `main`" is followable once more. Granular history is preserved on `personal`;
  `main`'s history was never rewritten. Safety ref: `main-backup-2026-07-10`.
- **`personal <- main` merge is not blocked.** The old SortableImageGrid concern never materialized —
  `main` had no commits `personal` lacked, and the merge was clean.
- **Root build artifacts are gitignored.** 464 stray `.js` files (86.8 MB) — a Jul-7 duplicate of
  `dist-electron/` that `npm run clean` never removed — are now ignored via root-anchored patterns
  (`9ea27ad`), so tracked `postcss.config.js` / `tailwind.config.js` are unaffected.

## Open Questions
- `review_note_images.thumbnail_path` is written equal to `file_path` — no thumbnail is generated, so
  grids load the full-resolution image. Diverges from NFR-02. Fine at 29 KB; revisit before large pastes.
- Review-note images: add a file picker as well as paste? (paste-only today)
- Should the Archived tab (Quick Capture) paginate or group once many cleared packages accumulate?
- Mobile track (paused): 6B-write — keep audio on `/api/uploads/*` or migrate to push? (leaning keep).
- Scaffold `docs/postmortems/` to record the Quick Capture data-loss event properly?

## Recent Decisions (last 3)
- ADR-0006 — Images on review notes are lightweight attachments; all delete paths unlink the files.
- ADR-0005 — Many reflective notes per review, written on Enter; event adopts drafts at rating time.
- ADR-0004 — Quick Capture hides by archiving, never by deleting or expiring.

## Reference
- Handoff: docs/handoff/2026-07-09.md (two sessions) · Decisions: docs/adr/0004, 0005, 0006
- Paused mobile track: Phase 6, 6A + 6B-read done. Full state in docs/handoff/2026-06-30.md.
- DB backups: `pre-archive-migration-backup-20260709-114759.db`, `pre-review-notes-backup-20260709-224*.db`
