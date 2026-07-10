# PLAN — Mobile App Robustness

_Branch: `personal` · Methodology: Adaptive Project Execution (active)_

## North star
Mahmut can reliably, from his Android phone: **open every note**, **view all media**, **add notes**,
and have **sync feel seamless** — without the app silently going stale or breaking.

## Guardrails
- Stay on `personal`. **Never** `git merge main` (SortableImageGrid divergence — see project memory).
- Backend DB access stays read-only; all mobile writes go through `/api/uploads/*` staging.
- Mac DB remains the single source of truth; VPS DB is a derived replica.
- Build/install desktop via the memorized build command; build mobile via
  `mobile/localResources/build-install.sh --release`.

## Phases

### Phase 0 — Baseline & instrumentation _(mostly done)_
Confirm backend accepts/returns correctly end-to-end. ✅ Verified healthy. Remaining: capture a
repeatable health-check script so "is the backend ok?" is one command.

### Phase 1 — Fix the staleness root cause (sync robustness)
The #1 reason it "stopped working." Make sync reliable and ideally automatic.
- Run sync now to bring VPS current; verify mobile sees fresh data.
- Harden `sync_to_vps.sh` (error handling, idempotency, logging, lockfile).
- Decide on automation (cron/launchd on Mac, or a desktop-app trigger).

### Phase 2 — Mobile essentials: open & view every note
**Status**: Re-scoped 2026-06-30 under Phase 6 (ADR-0002) — viewing now includes offline reading of
pinned topics (6B). Audit each screen against real data. Ensure every content type (image, video,
audio, code, pdf/book, markers) opens and renders. Fix crashes / blank states / error handling.

### Phase 3 — Mobile essentials: add notes
**Status**: Re-scoped 2026-06-30 under Phase 6 (ADR-0002) — the add path is now offline-first via the
outbox (6A) and the write surface is broadened (6B). Confirm the full add path
(capture → outbox → drain → push → reappear) works for each writable type without loss.

### Phase 4 — Seamless sync UX
**Status**: Re-scoped 2026-06-30 under Phase 6 (ADR-0002) — superseded by the green/yellow/red status
indicator + connectivity-aware drain (6A). Make sync state visible/automatic enough that the user
never manually wonders "is it current?"

### Phase 5 — Hardening
Token/URL out of source into secure storage; backend auto-restart already on; add monitoring so
a future outage is noticed early.

### Phase 6 — Mobile offline-first (added 2026-06-30 — see ADR-0002)
**Status**: Planned. The headline effort now. Mobile must never lose a capture on bad internet, must
let the user create/edit content from the phone, and must support reading chosen topics offline.
Layered ON TOP of the P1 pull/push protocol — not a rewrite. Sequenced safety-first:
- **6A — Offline-safe capture (data-loss fix).** Durable on-device outbox (`expo-sqlite` queue +
  `expo-file-system` media copy), connectivity-aware drain (`@react-native-community/netinfo`) that
  replays through the existing `/api/sync/media` + `/api/sync/push`, optimistic overlay, and the
  green/yellow/red status indicator (smart upload button). Rebuild + install APK first.
- **6B — Pin topics for offline + broadened write surface.** Split into two slices (offline-reading
  first, per user 2026-06-30):
  - **6B-read (ACTIVE, see ADR-0003):** per-topic "Download for offline" — snapshot the topic's
    content (recordings/marks/images/audio/notes/code) into a local JSON cache + download media
    (SKIP videos); offline-aware read path; pinned topics readable offline.
  - **6B-write (next):** create new duration mark, edit a mark's main note, add audio to images,
    change image colors — all as outbox operation types against the push allow-list.
- **6C — Desktop conflict chooser.** Panel in the DESKTOP app over `sync_conflicts`: show desktop vs
  mobile value, user picks the winner, apply. Conflict UI is desktop-only.

## Resolved scope
**Revised 2026-06-30 (ADR-0002):**
1. Mobile write surface EXPANDED: media/captions/deletes on existing items PLUS create new duration
   marks, edit a mark's main note, audio-on-image, and image color changes. (New topic/recording
   creation from the phone is still out of scope.)
2. Capture is **offline-first** — every write persists to a durable on-device outbox before any
   network call and uploads automatically when a stable connection returns. The visible sync state
   (green/yellow/red) replaces the old "manual + last-synced indicator only" stance.
3. Offline reading is **selective** — the user pins specific topics for offline download (hybrid; not
   a full mirror of all topics).
4. Conflict resolution is a **user choice on the desktop** (chooser over `sync_conflicts`), not silent
   desktop-wins. Mobile's losing value is still always preserved.
5. Android-only for now.

_Superseded 2026-06-29 scope (kept for history): mobile writes = media/captions only on existing
items; sync user-triggered/manual; new-mark creation out of scope. Revised by ADR-0002._

## Chosen sync architecture
**Industry-standard pull/push protocol in FastAPI** (WatermelonDB contract + PowerSync attachments).
See `docs/adr/0001-sync-approach.md`. SQLite stays source of truth; desktop wins; conflicts
detected + logged + alerted; media on a content-hash channel.
