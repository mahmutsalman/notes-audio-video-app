# Status — Notes With Audio And Video

**Last updated**: 2026-07-10 00:40
**Current phase**: Desktop — Echo review notes (Quick Capture data-safety track closed; mobile Phase 6 paused)
**Current slice**: Images on review notes — DONE (built, installed, committed `d3caa6f`).
**Branch**: personal (clean; 6 desktop commits unpushed, see Active Blockers)

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
- UNVERIFIED: pasting an image in the running app (see Next Concrete Action).
- UNVERIFIED: type a note, press ← then →, confirm it survives — the recovery case that motivated
  persist-on-Enter. Also: deleting a note from the Echo detail page.

## Next Concrete Action
1. **Try it** (30 seconds, untested): open a review, log a note with Enter, put an image in the
   clipboard, press the `＋` square under the note. It should appear as a thumbnail; click it for
   the lightbox, hover for delete. Nothing else in this slice is unverified.
2. Then decide about `main` (see Active Blockers). That is a real decision, not a chore.

Optional, in rough priority afterwards:
- Typecheck `electron/` — `tsconfig.json` has `"include": ["src"]`, so the whole main process is
  unchecked (65 errors). This HID A REAL BUG this session: `quickCaptures:deleteImage` called
  callback-style `fs.unlink(p).catch()`, which throws synchronously, so the row was deleted, the
  file orphaned, and `scheduleSearchReindex()` never ran. Fixed in `d3caa6f`; the class of bug is
  still lurking (e.g. `fs.mkdir` at handlers.ts:718).
- Make review-note images tagged / OCR'd / FTS-searchable — additive, see ADR-0006.

## Active Blockers
- **`main` is 132 desktop-only commits behind `personal`.** Cherry-picking today's five commits in
  isolation does NOT work — dry-run in a scratch worktree: only `86bc3d7` applies cleanly; the other
  four conflict because main's `database.ts`, `STATUS.md`, `MaskEditor.tsx` and `ReviewSession.tsx`
  lack the 132 commits preceding them. The options are the full documented bulk cherry-pick
  (CLAUDE.local.md) as a dedicated session, or leaving main behind. `main` also carries 3 commits
  never pushed to origin. Pushing is outward-facing — needs an explicit go-ahead.
- `personal <- main` merge stays blocked (SortableImageGrid divergence) — do not merge.
- ~400 untracked build artifacts (`main-*.js`, `obsService-*.js`, `videoMerger-*.js`, …) pollute the
  repo root and are NOT gitignored. A careless `git add -A` would commit them all.
- `CODESIGN_IDENTITY` in `~/.zshrc` names a deleted cert (`Apple Development … JT52RUPZ2T`), so
  `npm run resign` fails on every build. Only valid identity is
  `Developer ID Application: Mahmut Salman (7ZS727Z3N6)`. `CLAUDE.local.md` still documents the dead one.

## Open Questions
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
