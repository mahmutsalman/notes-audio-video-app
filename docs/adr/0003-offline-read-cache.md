# ADR-0003: Selective offline reading via JSON snapshot cache + local media (pin a topic)

**Status**: Accepted
**Date**: 2026-06-30
**Builds on**: ADR-0002 (offline-first capture / outbox). This adds the READ side of the hybrid
offline scope. Does not change the write/outbox design.

## Context

ADR-0002 made capture offline-safe but reads stay online-only — opening a topic with no signal shows
"needs internet". The user wants to pick specific topics before a trip and read them fully offline
(recordings, duration marks, images, audio, notes, code). Full mirror of all 43 topics + ~6 GB media
was explicitly rejected (ADR-0002) as too big; the chosen shape is SELECTIVE ("pin/download a topic").

## What We Learned / Constraints

- The mobile app already has a complete set of read endpoints (`mobile/services/api.ts`:
  topics/recordings/durations/duration images|audios|code-snippets|markers, media URLs). A pinned
  topic can be captured by walking these existing GET endpoints — no new server endpoints needed.
- Reproducing the ~15 normalized content tables on-device would be heavy and brittle. The API
  response SHAPES are what the UI already consumes.
- Video files are large (screen recordings can be hundreds of MB+). User chose to SKIP videos in the
  offline cache (they remain online-only); cache images + audio + text + code.

## Decision

Implement a **per-topic offline snapshot cache**, separate from the write outbox:

1. **Local cache store** (expo-sqlite, separate DB `readcache.db`): store each fetched API response
   as a JSON blob keyed by entity, not normalized columns —
   `cache_topics(topic_id, json)`, `cache_recordings(topic_id, json)`,
   `cache_durations(recording_id, json)`, `cache_duration_media(duration_id, json)` (images/audios/
   code/markers bundled), plus `cache_media(remote_url PK, local_path, bytes)` and
   `pinned_topics(topic_id, pinned_at, last_refreshed_at, status, bytes_total)`.
2. **Download manager**: on pin, walk the existing GET endpoints for that topic, persist each response
   JSON, and download every referenced image/audio (NOT video) into a local cache dir via
   expo-file-system; record url->local_path in `cache_media`. Report progress; resumable/idempotent
   (skip already-downloaded media by url). Refresh on reconnect + manual.
3. **Offline-aware read path**: a small resolver the data hooks use — if online, fetch live (and
   opportunistically refresh the cache for pinned topics); if offline, read the cached JSON for pinned
   topics and rewrite media URLs to local file paths; un-pinned topics offline show a clear
   "not downloaded" state. expo-image/expo-av render local file:// paths directly.
4. **Coherence with the outbox**: optimistic pending items (ADR-0002) continue to overlay on top of
   cached reads, so edits made offline to a pinned topic show immediately and upload later.

## Why not reuse /api/sync/pull

The pull endpoint is an incremental change-log feed designed for whole-DB replication, not a
per-topic content snapshot. A topic-scoped walk of the existing read endpoints is simpler, needs no
server change, and matches exactly what the UI already renders.

## Consequences

- **Positive**: the user can read chosen topics fully offline; no new server endpoints; reuses
  existing API shapes; videos excluded keeps downloads lean; same expo-sqlite/file-system foundation.
- **Negative**: cached JSON can go stale until the next refresh (acceptable: desktop is source of
  truth, refresh on reconnect). Two local DBs (outbox + readcache) to reason about. Media-URL
  rewriting must be applied consistently in the read path. Videos are not available offline (by choice).
- **Slices affected**: implements plan.md Phase 6B (offline-reading half). 6B write-surface
  (create marks / note edits / colors) is a separate later slice, unchanged by this ADR.

## References
ADR-0002; mobile/services/api.ts (existing read endpoints); selective-download model (Spotify/Maps
offline). expo-image / expo-av local-uri rendering.
