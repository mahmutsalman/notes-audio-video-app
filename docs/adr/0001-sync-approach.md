# ADR-0001 — Sync approach: industry-standard pull/push protocol in FastAPI

_Date: 2026-06-29 · Status: Accepted · Branch: `personal`_

## Context
The app needs robust multi-device sync between an Electron + better-sqlite3 desktop (the
**source of truth**), an Expo/React-Native Android client, and a FastAPI VPS that currently
serves a read-only SQLite copy and stages mobile writes as JSON. The existing sync is a manual
bash script doing a full-DB overwrite push + media rsync — fragile and last run 2026-04-01.

Requirements: desktop wins on conflict; conflicts are rare (mostly additive mobile writes — new
audio/media on existing items); same-field conflicts must be **detected and surfaced as an alert**,
never silently lost; ~6 GB of binary media must be handled.

## Decision
Implement a **hand-built but industry-standard pull/push sync protocol in FastAPI** — modeled on
the documented **WatermelonDB sync contract** and **PowerSync's attachments architecture**. Mobile
becomes a thin "change-poster." (Chosen over Option B: adopting the WatermelonDB RN client, which
adds large mobile rework and still needs a custom desktop bridge.)

## Why not an off-the-shelf engine
- PowerSync / ElectricSQL / Zero require Postgres/Mongo as truth → would demote our SQLite. Trap.
- cr-sqlite (CRDT in SQLite) auto-merges silently → cannot satisfy the detect+alert requirement;
  also unmaintained since late 2024, no RN/Android, no blobs.
- libSQL/Turso offline-sync is beta with explicit data-loss warnings, resolution not implemented.
- CouchDB/PouchDB = parallel document DB, abandons our schema, attachments unsuitable at ~6 GB.
- **No engine syncs large media** — a separate file channel is required regardless of choice.

## Shape (to be built incrementally)
- **Schema:** every syncable row gets `updated_at` (or per-row version) + `origin`/device id; a
  `deletions` tombstone table; a `media` table keyed by `content_hash` (sha256) — stop syncing
  absolute paths (device-local; each device resolves hash → its own path).
- **`GET /sync/pull?since=<cursor>`** → changed rows + tombstones + new atomic cursor.
- **`POST /sync/push`** → idempotency-keyed (unique index), transactional, single-writer-serialized;
  WAL with `busy_timeout`.
- **Media channel:** `PUT/GET /media/{content_hash}` behind bearer auth, skip-if-present (dedup +
  integrity). 6 GB never touches the JSON change feed.
- **Conflict rule:** detect when `server_value != base AND mobile_value != base`; resolve by origin
  (desktop wins); log to `sync_conflicts {row_id, field, desktop_value, mobile_value, detected_at,
  winner:'desktop'}`; UI reads it to alert the user. Mobile's losing value preserved in the log.

## Consequences
- We own the correctness of merge/push (idempotency, transactionality, base-version check) — the
  failure mode is silent loss if push isn't transactional/idempotent, so these get tests.
- Desktop must also become a sync *participant* (apply pulled mobile changes + bump versions),
  replacing the current full-overwrite push over time.
- Existing `sync_to_vps.sh` stays usable as a one-time catch-up until the protocol lands.

## References
WatermelonDB sync backend spec; PowerSync attachments; CouchDB `_conflicts` (philosophy);
"Choosing a Sync Engine in 2026". (URLs in research notes.)
