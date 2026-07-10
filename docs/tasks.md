# Tasks — Next 1-3

**Derived from**: plan.md (Phase 6B — offline reading half) + ADR-0003
**Generated**: 2026-06-30

> This file is regenerated on every replan / phase advance. Never hand-edit.
> Source of truth is `plan.md` + `docs/adr/`.

Phase 6A (offline-safe capture) is DONE + verified on-device + committed (a3e88ed). Now 6B, offline
reading first (user's "tomorrow when I open my phone" need): pin a topic -> download its content for
offline reading. Cache images + audio + text + code; SKIP videos (ADR-0003). Then a later slice does
the 6B write surface (create marks / note edits / colors). All code-first; rebuild APK after Task 3.

---

## Task 1 — Read-cache foundation (snapshot store + pin registry)

**Goal**: A device-local cache, separate from the outbox, that can hold a topic's content as JSON
blobs plus downloaded media files, and track which topics are pinned for offline.
**Builds**: `mobile/services/readcache/db.ts` (expo-sqlite `readcache.db`: cache_topics,
cache_recordings, cache_durations, cache_duration_media, cache_media(remote_url PK, local_path,
bytes), pinned_topics), `cacheStore.ts` (put/get JSON per entity, record media, pin/unpin/list,
isPinned), and a local media dir under expo-file-system.
**Verifies via**: dev harness — put a fake topic snapshot + a media row, force-quit, relaunch, read it
back; pin/unpin reflected in pinned_topics.
**Files likely touched**: `mobile/services/readcache/*` (new). New mobile files need `git add -f`.
**Estimated session count**: 1
**Done when**: snapshots + media rows + pin state persist across restart and are queryable.

## Task 2 — Download manager (pin a topic -> fetch all content + media, skip videos)

**Goal**: Pinning a topic walks the EXISTING GET endpoints (api.ts) for that topic — recordings,
durations, duration images/audios/code/markers — persists each response JSON to the cache, and
downloads every referenced image + audio file (NOT video) to the local media dir, with progress and
idempotent resume (skip already-downloaded by url). Refresh re-pulls a pinned topic on reconnect/manual.
**Verifies via**: pin a small real topic while online -> confirm cache_* rows + downloaded files on
device (logcat counts + file count); re-pin = 0 new downloads (idempotent); a topic with a video
caches its images/audio but not the video file.
**Files likely touched**: `mobile/services/readcache/download.ts` (new), reuse `services/api.ts`,
hook into syncManager reconnect.
**Estimated session count**: 1-2
**Done when**: a pinned topic's text+image+audio content is fully present on-device after one download.

## Task 3 — Offline-aware read path + "Download for offline" UI

**Goal**: Reads resolve from cache when offline (or always for pinned, with online refresh): the data
hooks (useTopics/useRecordings/useDurations/loadDurationMedia) consult a resolver that returns cached
JSON + local media URLs when offline & pinned, live data otherwise; un-pinned topics offline show a
clear "not downloaded" state. Add a "Download for offline" toggle on the topic screen with progress +
a pinned/offline badge; videos show an "online only" note when offline.
**Verifies via**: on-device co-test — pin a topic online; enable Airplane mode; open that topic and
confirm recordings/marks/images/audio all render from cache; open an UN-pinned topic offline and
confirm the clear empty state; captures made offline on a pinned topic still queue (6A) and overlay.
**Files likely touched**: `mobile/hooks/useTopics.ts|useRecordings.ts|useDurations.ts`,
`mobile/services/api.ts` (or a thin read resolver), topic screen + TopicCard, media URL helper.
**Estimated session count**: 2
**Done when**: a pinned topic is fully readable with Airplane mode on; un-pinned is clearly gated.

---

_After Task 3: rebuild APK (expo prebuild not needed — no new native modules; just gradlew
assembleRelease) -> install -> co-test offline reading -> /checkpoint + commit -> then replan tasks
for the 6B write surface (create marks / edit notes / audio-on-image / colors)._
