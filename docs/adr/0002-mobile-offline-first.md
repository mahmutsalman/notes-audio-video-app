# ADR-0002: Mobile offline-first capture (durable outbox) + selective offline reading + desktop conflict chooser

**Status**: Accepted
**Date**: 2026-06-30
**Supersedes**: partially revises the "Resolved scope (2026-06-29)" section of plan.md and ADR-0001's
"mobile = thin change-poster (online)" assumption (extends, does not replace, the pull/push protocol).

## Context

ADR-0001 + the P1.1-P1.7 cutover made mobile a thin change-poster: every write
(`mobile/services/upload.ts`) fires an immediate `fetch()` to `/api/sync/media` + `/api/sync/push`
(or `/api/uploads/*` for audio). Reads are online-only — there is no local DB. The implicit
assumption was that the phone has connectivity at capture time and that mobile's write surface is
limited to media/captions/deletes on EXISTING durations/recordings (plan.md "Resolved scope" 1-3).

## What We Learned

On 2026-06-30 the user lost a real audio recording + image while capturing out of town on unstable
internet: the upload `fetch` threw, the UI showed `Alert("Upload failed")`, and because the captured
bytes live only in the OS picker/recorder temp cache (never copied to durable app storage) and the
operation was never queued, the data was unrecoverable. Confirmed in code: `upload.ts` has no
persistence and `package.json` has no NetInfo / SQLite / FileSystem deps. The user also stated three
needs beyond current scope: (a) create new duration marks + edit a mark's main note from the phone;
(b) add audio to images and change image colors from the phone; (c) read selected topics offline
(download chosen topics before a trip); and (d) be asked which version wins when phone and desktop
edited the same field, rather than silent desktop-wins.

## Decision

Make mobile **offline-first for capture and edits**, with **selective offline reading**, layered on
top of the existing pull/push protocol (not a rewrite of it):

1. **Durable on-device outbox.** Every write first (a) copies its media bytes into a permanent
   app-owned directory via `expo-file-system`, then (b) inserts an operation row into a local
   `expo-sqlite` outbox, then (c) renders optimistically. Capture NEVER awaits the network. Chosen
   `expo-sqlite` over AsyncStorage for ordered, queryable, FK-capable operations with media refs.
2. **Connectivity-aware drain worker.** `@react-native-community/netinfo` + app-foreground triggers a
   background drain that replays queued ops through the EXISTING `/api/sync/media` + `/api/sync/push`
   (+ `/api/uploads/*` for audio), with idempotency (reuse `client_change_id`), retry, and backoff.
3. **Status indicator (smart upload).** Global chip + per-item badge: green = synced & online,
   yellow = saved locally / pending (offline or not-yet-drained, with pending count), red = upload
   error or conflict needing attention.
4. **Locally-created entities** get temporary client IDs (`local:<uuid>`); on successful push the
   server row_id is mapped back. The optimistic overlay merges outbox items with online-fetched
   lists so new/edited items are visible immediately and offline.
5. **Selective offline reading ("pin topic for offline").** A per-topic toggle downloads that topic's
   recordings/durations/media into the local SQLite + media dir. Offline: pinned topics are readable
   AND editable; un-pinned topics show "needs internet". This is a bounded subset of a full mirror.
6. **Broadened write surface.** New duration mark, edit mark note, audio-on-image, image color change
   all become outbox operation types against the `/api/sync/push` allow-list (server allow-list +
   `createDuration` move from `/api/uploads/duration` onto the push protocol).
7. **Desktop-only conflict chooser.** When a push is flagged conflicting (`current!=base AND
   new!=base`), the loser is preserved in `sync_conflicts` (as today). A new panel in the DESKTOP app
   reads `sync_conflicts`, shows desktop-value vs mobile-value side by side, and applies the user's
   pick. No mobile conflict UI for now.

Sequencing is safety-first: **Phase A** (outbox + status indicator) ships + rebuilds the APK first to
stop data loss; **Phase B** adds pin-for-offline reading + the broadened write surface; **Phase C**
adds the desktop conflict chooser.

## Consequences

- **Positive**: capture is loss-proof on bad/no internet; phone gains create/edit + offline reading
  of chosen topics; conflicts become a user choice; reuses the P1 protocol + server endpoints intact.
- **Negative**: adds 3 native modules → forces `expo prebuild` + Gradle rebuild (Android SDK must be
  restored from the Toshiba drive). Introduces client-side merge/ID-mapping complexity (temp IDs,
  optimistic overlay, drain ordering) whose failure mode is duplicate or stuck queue items — needs
  tests. A local SQLite read cache must be kept coherent with server refreshes for pinned topics.
- **Slices affected**: plan.md Phase 2 (view), Phase 3 (add notes), Phase 4 (seamless sync UX) are
  re-scoped under offline-first; new Phase 6 (offline-first mobile) added. "Resolved scope" items 1-3
  revised (new marks + note edits + offline reading now IN scope).
- **Completed work preserved**: ALL of P1.1-P1.7 (migration, `/api/sync/*` endpoints,
  `server/app/sync_core.py`, `sync/desktop_sync.py`, `sync_to_vps.sh` Phase 1.5, the live change-log
  triggers, the conflict detection + `sync_conflicts` table). The drain reuses these unchanged.
- **Completed work to revert / refactor**: none reverted. `mobile/services/upload.ts` is wrapped by
  the outbox (its functions become the drain's transport layer, not direct UI calls) rather than
  deleted. `createDuration` migrates off `/api/uploads/duration` onto `/api/sync/push`.

## References
ADR-0001 (sync protocol); `reference_sync_system` memory; WatermelonDB sync contract; PowerSync
attachments; offline-first outbox pattern. Selective-download model analogous to Spotify/Maps offline.
