# Branch Strategy

- `main`: desktop-only code, pushed to GitHub (public)
- `personal`: local-only branch with mobile app, FastAPI server, VPS sync pipeline
- **NEVER push `personal` branch to GitHub** — it contains `mobile/`, `server/`, `sync/`
- Build for personal use from `personal` branch

## Rules

| Rule | Detail |
|---|---|
| Never push `personal` | `git push origin personal` is forbidden — it would leak mobile/server code |
| Never merge `personal → main` directly | A full merge pulls in mobile/, server/, sync/ — always cherry-pick instead |
| Desktop commits go on `main` | Commit desktop-only work on `main`, push, then merge into `personal` |
| After every `main` commit | Run the sync block below to keep `personal` up to date |

## After Every Commit on main

```bash
git checkout personal
git merge main
git checkout main
```

If a merge conflict occurs (e.g. `handlers.ts` VPS config differs), keep `personal`'s version for that file:
```bash
git checkout personal -- electron/ipc/handlers.ts
git add electron/ipc/handlers.ts
git merge --continue
```

## Cherry-Pick Strategy (personal → main, bulk)

Use this when backfilling many commits from `personal` onto `main`. The awk filter keeps only desktop-only commits (skips merge commits and anything touching `mobile/`, `server/`, `sync/`, `localResources/`).

```bash
git checkout main

git log --oneline main..personal --name-only --format="%H %s" | awk '
/^[0-9a-f]{40}/ {
    if (hash && !(hm||hs||hsy||hl) && !is_merge) print hash
    hash=$1; msg=substr($0,42); hm=hs=hsy=hl=0
    is_merge=(msg~/^(Merge branch|merge:)/)
}
/^mobile\// {hm=1} /^server\// {hs=1} /^sync\// {hsy=1} /^localResources\// {hl=1}
END { if (hash && !(hm||hs||hsy||hl) && !is_merge) print hash }
' | tail -r | xargs git cherry-pick

git push origin main
git checkout personal
```

**If a conflict occurs during cherry-pick:**
- All conflicts so far follow the pattern "HEAD is empty, incoming adds new code" → take theirs:
  ```bash
  python3 -c "
  import re, sys
  fp = sys.argv[1]
  c = open(fp).read()
  r = re.sub(r'<<<<<<< HEAD\n(.*?)=======\n(.*?)>>>>>>> [^\n]+\n', lambda m: m.group(2), c, flags=re.DOTALL)
  open(fp, 'w').write(r)
  " <conflicted-file>
  git add <conflicted-file>
  git cherry-pick --continue
  ```
- Skip commits that only touch `CLAUDE.local.md` or other gitignored files: `git cherry-pick --skip`
- Skip empty commits (already applied): `git cherry-pick --skip`

## Pre-Commit Hook (blocks mobile/server/sync on main)

The hook lives at `scripts/hooks/pre-commit`. It is already committed to both branches.

**Activate once per machine:**
```bash
git config core.hooksPath scripts/hooks
```

After this, any attempt to commit `mobile/`, `server/`, or `sync/` files while on `main` will be blocked with a clear error. The hook is branch-aware — it only fires on `main`, never on `personal`.

# Architecture — Three Apps, One Database

```
Desktop (Electron)          VPS (FastAPI + Docker)          Mobile (Expo RN)
 source of truth              hub / relay                    reader + uploader
       |                         |                                |
       |--- scp DB + rsync media -->                              |
       |                         |<-- GET /api/* (read) ----------|
       |                         |<-- POST /api/uploads/* --------|
       |<-- pull staging JSONs --|                                |
       |    + copy media files   |                                |
       |--- push full DB + media -->                              |
```

**Desktop** is the source of truth. **VPS** is the hub. **Mobile** reads and uploads.

# Build & Install

```bash
osascript -e 'quit app "Notes With Audio And Video"' 2>/dev/null; sleep 1 && npm run build 2>&1 | tail -8 && cp -R "release/mac-arm64/Notes With Audio And Video.app" /Applications/
```

- **Must quit the app first** — `cp -R` over a running bundle causes a "different Team IDs" DYLD crash
- The `build` script automatically runs `npm run resign` after electron-builder finishes, re-signing with the Apple Development certificate (required on macOS 26+)

**One-time setup** — add to `~/.zshrc` and then `source ~/.zshrc`:
```bash
export CODESIGN_IDENTITY="Apple Development: csmahmutsalman@gmail.com (JT52RUPZ2T)"
```

If `CODESIGN_IDENTITY` is unset, `resign` falls back to ad-hoc signing (`-`) which causes a team ID mismatch crash.

# Desktop App (main branch)

- Electron + React + TypeScript + Vite
- SQLite database (better-sqlite3, WAL mode)
- Media stored in `~/Library/Application Support/NotesWithAudioAndVideo/`
- Screen recording with ScreenCaptureKit (macOS native)
- IPC handlers in `electron/ipc/handlers.ts`
- Sync handler: `sync:upload` (~line 1215) — pulls mobile uploads then pushes DB + media

# VPS Infrastructure

- **Host**: mahmutsalman.cloud
- **SSH**: `ssh -i ~/.ssh/vps1_key root@mahmutsalman.cloud`
- **Nginx**: reverse proxy `/notes/` → `http://127.0.0.1:8042/`
- **Docker**: single container at `/var/www/notes/` (docker-compose.yml)
- **Server code**: `/var/www/notes/app/`
- **Data dir**: `/var/www/notes/data/` (mounted as Docker volume)
- **Database**: `/var/www/notes/data/NotesWithAudioAndVideo.db`
- **Media**: `/var/www/notes/data/media/`
- **Upload staging**: `/var/www/notes/data/uploads/` (JSONs for desktop to pull)
- **.env vars**: AUTH_TOKEN, DB_PATH, MEDIA_PATH, UPLOADS_PATH

## Deploy Server Changes

```bash
rsync -avz -e "ssh -i ~/.ssh/vps1_key" server/app/ root@mahmutsalman.cloud:/var/www/notes/app/
ssh -i ~/.ssh/vps1_key root@mahmutsalman.cloud "cd /var/www/notes && docker compose up --build -d"
```

# Mobile App (personal branch only)

- Expo React Native (SDK 52), dir: `mobile/`
- Reads data via GET API, uploads photos/audio via POST
- Package: `com.mahmutsalman.notesviewer`

## Build & Install

```bash
cd mobile && npm install
npx expo prebuild --platform android --clean   # only if native deps/plugins changed
cd android && ./gradlew assembleRelease
adb install -r mobile/android/app/build/outputs/apk/release/app-release.apk
```

# FastAPI Server (personal branch only)

- Dir: `server/`, Python 3.12, FastAPI + uvicorn
- Read-only DB connection in `database.py` (sqlite3 with `?mode=ro`)
- Upload router uses separate read-write connection (`upload.py`)
- SQLite WAL mode handles concurrent reader + writer safely

## API Endpoints

- `GET /api/topics`, `/api/recordings`, `/api/durations`, `/api/durations/{id}/images|videos|audios|code-snippets`
- `GET /api/media/{path}` — serves media files with range request support
- `POST /api/uploads/duration-image` — multipart (image + duration_id + recording_id + caption?)
- `POST /api/uploads/duration-audio` — multipart (audio + duration_id + recording_id + caption? + duration?)
- `GET /api/uploads/pending` — lists staging JSONs for desktop pull
- Auth: Bearer token in Authorization header

# Sync Pipeline

Dir: `sync/`, script: `sync_to_vps.sh`

**Phase 1 — Pull mobile uploads:**
1. Check for staging JSONs on VPS (`/var/www/notes/data/uploads/*.json`)
2. Download them, parse metadata
3. Copy media files from VPS to local media dir
4. Insert records into local SQLite
5. Delete staging JSONs on VPS

**Phase 2 — Push to VPS (original flow):**
1. WAL checkpoint on local DB
2. scp database to VPS (full overwrite — now includes mobile records)
3. rsync media to VPS (delta sync)

Same logic exists in `electron/ipc/handlers.ts` sync:upload handler.

# Database

- **Engine**: SQLite, WAL mode
- **Tables**: topics, recordings, images, videos, audios, code_snippets, durations, duration_images, duration_videos, duration_audios, duration_code_snippets, screen_recordings, app_settings, topic_stats, quick_capture_items, quick_capture_images, quick_capture_audios, quick_capture_image_audios, image_children, image_child_audios, media_tags, tags
- **file_path column**: stores absolute paths. `media_utils.py:file_path_to_url()` extracts relative path via regex `media/(.+)$` — works with any absolute prefix (desktop or VPS)
- **media_tags CHECK constraint**: was removed in a prior migration — any `MediaTagType` value inserts cleanly
- **image_children**: polymorphic parent (`parent_type` = `'duration_image'|'image'|'quick_capture_image'`, `parent_id`). One level only — children cannot have children.
- **image_child_audios**: FK to `image_children(id) ON DELETE CASCADE`

# Frontend Component Map

## Pages
| File | Route / Purpose |
|------|----------------|
| `src/pages/RecordingPage.tsx` | Single recording view — durations, images, audios, code snippets |
| `src/pages/SearchPage.tsx` | Full-text + tag search across all media |
| `src/pages/TagResultsView.tsx` | Shows all items for a given tag |

## Key Components
| File | Purpose |
|------|---------|
| `src/components/common/ImageLightbox.tsx` | Shared modal for all image types. Handles zoom/pan, audio recording bar, tag modal, caption edit, delete confirm, and the child images strip. Renders a recursive second instance of itself for child images (`disableChildImages=true`). |
| `src/components/common/SortableImageGrid.tsx` | Drag-and-drop image grid used in RecordingPage and CaptureItem. Accepts `audioCountMap` (blue badge), `tagCountMap` (orange badge), `tagNamesMap` (tag overlay at top of cell). |
| `src/components/common/TagModal.tsx` | Tag assignment modal — used everywhere tags can be set. |
| `src/components/capture/CaptureItem.tsx` | Quick Capture item — shows image grid + audio list. Fetches `captureImageAudiosMap` on mount for audio badges. |

## Contexts
| File | Purpose |
|------|---------|
| `src/context/AudioRecordingContext.tsx` | Global audio recorder. `RecordingTarget` discriminated union routes saved audio to the correct IPC handler. Add new audio target types here + a new case in `stopAndSave`. |
| `src/context/TabsContext.tsx` | Tab management for multi-tab navigation |
| `src/context/*AudioPlayerContext.tsx` | Separate player contexts for different audio types (image, duration, recording, capture) |

## Image Types and Their Media
| Image type | DB table | `MediaTagType` | Audio table | IPC namespace |
|-----------|----------|----------------|-------------|---------------|
| Recording image | `images` | `'image'` | `audios` (via imageAudios) | `imageAudios` |
| Duration image | `duration_images` | `'duration_image'` | `duration_image_audios` | `durationImageAudios` |
| Quick Capture image | `quick_capture_images` | `'quick_capture_image'` | `quick_capture_image_audios` | `captureImageAudios` |
| Child image | `image_children` | `'image_child'` | `image_child_audios` | `imageChildren` / `imageChildAudios` |

## IPC Pattern
- Main: `ipcMain.handle('namespace:action', handler)` in `electron/ipc/handlers.ts`
- Preload: exposed under `window.electronAPI.namespace.action` in `electron/preload.ts`
- Types: `ElectronAPI` interface in `src/types/index.ts`

## Image Badge System (SortableImageGrid)
- **Blue badge** (`bg-blue-500`) = audio count — top-right corner
- **Orange badge** (`bg-orange-500`) = tag count — top-right if no audio, stacked at `top-6` if both
- **Tag name overlay** = tag names shown at top of image cell (hidden on hover)
- To show badges: pass `audioCountMap`, `tagCountMap`, `tagNamesMap` to `SortableImageGrid`
- RecordingPage fetches duration image tags in a `useEffect` keyed on `[activeDurationId, durationImagesCache]`
- CaptureItem fetches `captureImageAudiosMap` on mount via a `useEffect` keyed on `[localImages]`

## Child Images Feature (ImageLightbox)
- Strip at bottom of lightbox shows thumbnails of child images for the currently viewed parent
- Thumbnails show audio badge (blue) and tag badge (orange)
- Clicking a thumbnail opens the child in a recursive `ImageLightbox` with `disableChildImages=true`
- Arrow keys navigate between siblings when child lightbox is open; Escape closes child first
- Adding: paste from clipboard via the `+` placeholder
- Child tags fetched in `useEffect` keyed on `[imageChildren]`; refreshed when child lightbox closes

# Key Files

| File | Purpose |
|------|---------|
| `electron/ipc/handlers.ts` | All IPC handlers including sync:upload |
| `electron/database/database.ts` | SQLite setup + all migrations (table-exists guard pattern) |
| `electron/database/operations.ts` | DB operation classes (one per table) |
| `electron/services/fileStorage.ts` | Media file save/delete helpers |
| `electron/preload.ts` | Exposes all IPC channels as `window.electronAPI.*` |
| `src/types/index.ts` | All shared types + `ElectronAPI` interface |
| `server/app/routers/upload.py` | Mobile upload endpoints |
| `server/app/media_utils.py` | file_path_to_url() and url_to_local_path() |
| `server/app/database.py` | Read-only DB connection |
| `mobile/services/api.ts` | All GET API calls |
| `mobile/services/upload.ts` | Upload functions (image + audio) |
| `mobile/services/config.ts` | API_BASE_URL and AUTH_TOKEN |
| `mobile/components/recordings/DurationList.tsx` | Duration marks with photo/audio upload UI |
| `sync/sync_to_vps.sh` | Bash sync script (pull + push) |

# Personal Directories

These exist only on `personal` branch and are gitignored on `main`:

- `mobile/` — Expo React Native app
- `server/` — FastAPI server
- `sync/` — Sync scripts

# CodeTour Extension

[CodeTour](https://marketplace.visualstudio.com/items?itemName=vsls-contrib.codetour) is a VS Code extension that lets you record and play back guided walkthroughs of a codebase.

## .tour File Format

Tours are stored as JSON files in a project's `.tours/` directory:

```jsonc
{
  "title": "My Tour",           // display name; becomes Recording name in the app
  "description": "...",         // optional tour-level description (maps to parentNote)
  "steps": [
    {
      "title": "Step title",    // short label shown in the sidebar
      "description": "...",     // markdown body (plain text fallback)
      "richDescription": {...}, // Quill delta object — richer formatting (optional)
      "file": "src/foo.ts",     // relative path to file (optional for pure note steps)
      "line": 42,               // line number to highlight (optional)
      "selection": {...},       // text range (optional)
      "directory": "src/",      // alternative to file: highlights a folder
      "uri": "...",             // alternative to file: arbitrary URI
      "commands": [...],        // VS Code commands to run when step is entered
      "images": [...],          // array of image objects added via import-tours
      "audios": [...]           // array of audio objects added via import-tours
    }
  ],
  "isPrimary": true,            // whether this tour appears first in the list
  "nextTour": "other-tour",     // optional chained tour
  "parentNote": {               // recording-level note (maps to recording notes_content)
    "description": "...",
    "images": [...],
    "audios": [...]
  }
}
```

## Key Fields

- **`description`** — markdown string. CodeTour renders this when `richDescription` is absent. import-tours writes back to this field during reverse sync.
- **`richDescription`** — Quill delta object for rich formatting. import-tours **removes** this during reverse sync (rather than regenerating it) so CodeTour falls back to `description`. Regenerating a valid delta from HTML is complex and error-prone.
- **`file` + `line`** — anchor the step to a specific location. Steps without these are "pure note" steps. import-tours creates them for desktop-created marks.
- **`images` / `audios`** — arrays of media objects added by import-tours reverse sync. Not a native CodeTour field — import-tours reads and writes these.

## Extension Location

- Extension ID: `vsls-contrib.codetour`
- Tour files: `<project-root>/.tours/*.tour`
- The extension auto-detects the `.tours/` folder at the git root

## How import-tours Maps to NotesWithAudioAndVideo

| CodeTour concept | NotesWithAudioAndVideo concept |
|---|---|
| Tour (`.tour` file) | Recording |
| Tour title | Recording name |
| Tour `description` / `parentNote` | Recording `notes_content` |
| Step | Duration mark |
| Step `title` | Duration `caption` |
| Step `description` body | Duration `note` (body HTML only) |
| Step `file` + `line` + code context | `duration_code_snippets` row |
| Step `images` | `duration_images` rows |
| Step `audios` | `duration_audios` rows |
| Step order in array | Duration `sort_order` |

# import-tours Script

Imports CodeTour `.tour` files from any project into the NotesWithAudioAndVideo app as Recordings under a Topic.

## Files

| File | Purpose |
|------|---------|
| `~/bin/import-tours` | Global shell wrapper — available anywhere in terminal |
| `sync/import_tours.py` | Main Python script |
| `<project>/.tours/tour_imports.json` | Tracking file — maps each `.tour` file + topic name → recording_id and duration_ids. Stored per-project alongside the `.tour` files. On first run after migration, entries are automatically copied from the legacy `sync/tour_imports.json`. |

## Usage

Run from inside any project directory (auto-detects `.tours/` folder):

```bash
import-tours                          # topic = "Code Tours" (default)
import-tours "My Project"             # topic = "My Project" (create if needed)
import-tours "My Project" --dry-run   # preview without writing
import-tours --reformat               # re-generate HTML notes for all tracked tours
import-tours --reformat --force       # overwrite even user-edited notes
import-tours "My Project" --removeorphans           # delete untracked duration marks from DB
import-tours "My Project" --removeorphans --dry-run # preview orphan deletions
```

The shell wrapper (`~/bin/import-tours`) handles the bare topic name: if the first argument is not a flag and not an existing path, it's passed as `--topic-name`.

## How It Works

1. Finds `.tours/*.tour` files from CWD upward to git root
2. For each `.tour` file, looks up `{abs_path}::{topic_name}` in `tour_imports.json`
3. **New tour** → creates a Recording + one Duration mark per step
4. **Existing tour** → diffs steps by content-based ID, updates notes/sort order only if user hasn't edited them in the app (hash check)
5. **Reverse sync** → exports any media added in the app back into the `.tour` file, syncs caption edits, and writes edited note text back to `description` (removes `richDescription` so CodeTour falls back to plain markdown)
5a. **Step reconciliation** (`_reconcile_steps`) — runs as part of every reverse sync. Rebuilds the `.tour` step list from DB `sort_order`: tracked durations keep their step dict, untracked (desktop-created) durations become new title-only steps, stale `.tour` steps with no live DB duration are dropped. This means user reorders in the desktop app are reflected in the `.tour` file automatically.

## Note Format

The `note` field on each duration mark contains **only the description body** from the `.tour` step — no title, no file location, no code block. Title is stored as the duration `caption`; code is stored in `duration_code_snippets`.

After changing this behavior, run `import-tours <topic> --reformat --force` to regenerate existing notes in the DB.

## Bidirectional Media Sync

The command is fully bidirectional for both text and media:

| Direction | What syncs |
|---|---|
| `.tour` → DB (forward) | Step text edits, new steps, images added to `.tour`, audios added to `.tour` |
| DB → `.tour` (reverse) | Images/audios added in the desktop app, caption edits, note text edits, sort order, desktop-created marks |

**Adding images to a `.tour` step from VS Code side:**

Add an entry to the step's `images` array in the `.tour` JSON, put the image file at the referenced path, then run `import-tours`:

```json
{
  "title": "My Step",
  "description": "Some explanation",
  "file": "src/foo.ts",
  "line": 10,
  "images": [
    {
      "id": "my-image-1",
      "path": ".tours/images/some-screenshot.png",
      "caption": "optional caption"
    }
  ]
}
```

- `id` — any unique string; used for deduplication (won't re-import on next run)
- `path` — relative to project root; can point anywhere in the project
- `caption` — optional; written to `duration_images.caption`

The same applies to `audios` arrays (forward sync reads those too).

**3-way conflict rule:** if you edit a step's text in VS Code AND edit the same mark's note in the desktop app before running `import-tours`, the desktop app edit wins (reverse sync takes priority because `db_hash != stored_hash`). Text-only edits on the VS Code side are safe as long as you haven't touched that mark in the app.

## Step Matching Internals

Each step is identified by a content-based key: `make_step_id(step)` → `"{title}|{file}"`.

`match_steps(steps, steps_tracking)` matches current `.tour` steps to tracking entries using three priority levels:
1. **Exact** — `step_id` is in tracking
2. **Title-prefix** — look for any tracking key starting with `"{title}|"` (handles file renames). Only matches if exactly one candidate.
3. **File-suffix** — look for any tracking key ending with `"|{file}"` (handles title renames). Only matches if exactly one candidate.

Unmatched steps get `None` → forward sync creates a new Duration for them.

**3-way hash check** (forward vs reverse sync, mutually exclusive):
- `stored_hash` — hash of the note last written from the `.tour` step
- `db_hash` — hash of the current DB note
- `new_note_hash` — hash of freshly regenerated HTML from the current `.tour` step

Forward sync fires when `db_hash == stored_hash` (no user edit in app → safe to overwrite).
Reverse sync fires when `db_hash != stored_hash` (user edited in app → write back to `.tour`).

## Tracking Key Format

```
{absolute_path_to_.tour_file}::{topic_name}
```

**Critical:** the topic name in the key must exactly match what you pass to the command. If you rename a topic in the desktop app, the tracking keys become stale and the next run will recreate recordings as duplicates instead of updating them.

## Desktop-Created Marks

Marks created in the desktop app (not imported from a `.tour` step) are untracked — they have no entry in `tour_imports.json`. `_reconcile_steps` detects these each run and exports them as new `.tour` steps with a title derived from the note text. Tracking keys use `make_step_id` format (`"title|"`) so the forward sync can find them on the next run without re-creating the duration.

Title collisions (two marks with identical titles) are handled with a `_2`, `_3`, ... suffix appended to the tracking key — the suffix preserves the title prefix so `match_steps` Priority 2 (title-prefix search) still finds them.

If you end up with unwanted orphaned marks (e.g. from testing), run `--removeorphans` to clean them up.

## Known Gotcha — `format_version` Key in tour_imports.json

The top-level `tour_imports.json` has a `"format_version": 3` integer key alongside the `{path}::{topic}` recording keys. Any loop over `tracking.items()` must skip it: `if key == "format_version": continue`. Missing this guard causes an `AttributeError: 'int' object has no attribute 'get'` crash.

## Known Gotcha — Topic Rename Causes Duplicates

If you import under topic `"Foo"` and then rename it to `"Bar"` in the app, running `import-tours "Bar"` will NOT find `::Foo` keys → it recreates everything under `"Bar"`. Fix: manually update the `::Foo` keys to `::Bar` in `sync/tour_imports.json`, or delete the duplicate recordings from the app.
