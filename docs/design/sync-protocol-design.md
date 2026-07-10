# Sync Protocol — Detailed Design (P1.1)

_Status: DRAFT design · nothing applied to any DB yet · branch `personal`_
_Implements ADR-0001 (industry-standard pull/push protocol in FastAPI)._

## 1. Schema reality (as of 2026-06-29, from the verified backup)
- 47 tables. Every content table uses `INTEGER PRIMARY KEY AUTOINCREMENT` → **ids are
  per-database**, not global.
- Only `topics`, `recordings` (and a few local tables) have `updated_at`. **Content/media tables
  (`durations`, `duration_images`, `duration_audios`, …) have only `created_at`** → today there is
  no way to ask "what changed since timestamp X". This is the gap the protocol must close.
- FKs are `ON DELETE CASCADE`. Deleting a parent silently removes children — mobile must learn
  about those cascaded deletes, not just the explicit one.
- Desktop schema is created/migrated in `electron/database/database.ts → runMigrations(db)`, using
  idempotent guards (`CREATE TABLE IF NOT EXISTS`, `PRAGMA table_info` before `ALTER TABLE ADD`).
  Our additions MUST follow that exact pattern and live in the same function.

## 2. The ID problem — and why our scope avoids it
True multi-master sync needs globally-unique ids (UUIDs) so a row created on the phone doesn't
collide with a different row that got the same integer id on the desktop. **We deliberately do NOT
need that yet**, because the agreed scope is *additive media + caption edits + deletes on EXISTING
durations/recordings*. Those always reference an **existing desktop id**, and the desktop assigns
the final child id when it applies the change (as the current staging flow already does). So integer
ids are fine for now.
> ⚠️ If scope later grows to "create new topics/recordings/text notes on the phone", revisit this —
> that needs UUID keys or a temp-id→real-id mapping table. Tracked as a future ADR.

## 3. Chosen mechanism — central change-log via triggers (not per-table `updated_at`)
Rather than add `updated_at` + bump-logic to ~25 tables (and touch every desktop write path), use a
single append-only change-log fed by SQLite triggers. This is the WatermelonDB/Replicache pattern.

Benefits: one monotonic cursor; deletes captured automatically (incl. cascades); desktop write code
is untouched (triggers fire regardless of who writes); easy server-side pull query.

### 3.1 New tables
```
sync_changelog            -- append-only; the pull feed
  seq         INTEGER PRIMARY KEY AUTOINCREMENT   -- monotonic cursor
  table_name  TEXT NOT NULL
  row_id      INTEGER NOT NULL
  op          TEXT NOT NULL CHECK(op IN ('I','U','D'))
  origin      TEXT NOT NULL DEFAULT 'desktop'     -- 'desktop' | 'mobile'
  changed_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP

sync_session              -- single row; triggers read .origin to stamp changelog
  id          INTEGER PRIMARY KEY CHECK(id=1)
  origin      TEXT NOT NULL DEFAULT 'desktop'

sync_state                -- per-peer cursor bookkeeping (server/desktop side)
  peer        TEXT PRIMARY KEY        -- e.g. 'vps', 'mobile:<deviceId>'
  last_seq    INTEGER NOT NULL DEFAULT 0
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP

sync_media                -- content-addressed media registry (PowerSync-style)
  content_hash TEXT PRIMARY KEY       -- sha256 of file bytes
  size         INTEGER NOT NULL
  mime         TEXT
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  -- maps a hash to whatever local path each device chooses; path is NOT synced

sync_conflicts            -- detected same-field clashes for the UI alert
  id            INTEGER PRIMARY KEY AUTOINCREMENT
  table_name    TEXT NOT NULL
  row_id        INTEGER NOT NULL
  field         TEXT NOT NULL
  desktop_value TEXT
  mobile_value  TEXT
  winner        TEXT NOT NULL DEFAULT 'desktop'
  detected_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  acknowledged  INTEGER NOT NULL DEFAULT 0
```

### 3.2 Triggers (per syncable table, 3 each — INSERT/UPDATE/DELETE)
`CREATE TRIGGER IF NOT EXISTS` so they're idempotent. Each stamps `origin` from `sync_session`:
```
CREATE TRIGGER IF NOT EXISTS trg_duration_images_ai AFTER INSERT ON duration_images BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin)
  VALUES('duration_images', NEW.id, 'I', (SELECT origin FROM sync_session WHERE id=1));
END;
-- ...AFTER UPDATE → op 'U' (NEW.id) ; AFTER DELETE → op 'D' (OLD.id)
```
Cascade deletes fire the child DELETE triggers when `PRAGMA foreign_keys=ON` → tombstones captured.

### 3.3 Echo-loop avoidance
When the desktop **applies a pulled mobile change**, it first sets `sync_session.origin='mobile'`,
applies, then resets to `'desktop'`. The changelog row is thus tagged `mobile`, so we never push a
mobile-origin change back to the phone as if it were a desktop edit.

## 4. Pull / Push (server side, FastAPI — built in P1.2–P1.5)
- `GET /sync/pull?since=<seq>` → all changelog rows with `seq > since` whose `origin='desktop'`,
  hydrated with current row data (or a tombstone for op='D'); returns new max seq as cursor.
- `POST /sync/push` → batch of mobile changes, idempotency-keyed (unique index), one transaction,
  serialized writer; applies under `origin='mobile'`; runs conflict detection (§5).
- Media: `PUT/GET /media/{content_hash}` behind bearer auth; skip-if-present (dedup + integrity).

## 5. Conflict detection + desktop-wins + alert
Mobile sends, per changed field, the **base value** it last synced. Server flags a real conflict
when `current_value != base AND incoming_value != base` (both moved since common ancestor). Then:
1. Keep desktop value (resolve by **origin**, not wall-clock → no clock-drift bugs).
2. Insert a `sync_conflicts` row (desktop_value, mobile_value, winner='desktop').
3. Mobile/desktop UI reads unacknowledged conflicts → shows "both changed this; desktop kept."
Additive mobile writes (new rows) never hit this path.

## 6. DRAFT migration — NOT YET APPLIED
The concrete `CREATE TABLE/TRIGGER IF NOT EXISTS` block to add to `runMigrations(db)` will live in
`docs/design/sync-migration.draft.sql` and be reviewed before it runs. It is **purely additive**
(new tables + triggers only — no ALTER/DROP on existing tables), so it cannot harm existing data and
is safe to ship in the desktop app ahead of the server work (backward-compatible → **no mobile
rebuild required** to introduce it).

## 7. Resolved (2026-06-29)
1. Phone is **NOT append-only** — it already does caption edits + deletes (`upload.py`:
   update-caption / delete-audio / delete-image). So we build the **full** conflict-detection path.
2. Single hardcoded `deviceId` for the phone for now (multi-device deferred).
3. Change-log + triggers ship in the **desktop app** first (additive, safe), server/mobile follow.
   Migration validated on a DB COPY before ever touching the live source-of-truth DB.
