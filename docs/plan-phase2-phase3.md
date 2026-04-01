# Phase 2 & Phase 3 — Audio Tags + Smart Search

## Project Context

**App**: Electron + React + TypeScript + SQLite (better-sqlite3) desktop app.  
**Stack**: All DB ops in `electron/database/operations.ts`, IPC in `electron/ipc/handlers.ts`,
preload bridge in `electron/preload.ts`, types in `src/types/index.ts`.  
**Current branch**: `personal` (contains `server/`, `mobile/`, `sync/`).

### Completed work (Phases 1A–1C)
- `media_color_assignments` table: polymorphic many-to-many colors for any media type.
- `MediaColorOperations` + IPC `mediaColors:toggle/getByMedia/getBatch` + preload + types.
- Colors wired to all 6 audio types (standalone cards in RecordingPage/CaptureItem, chips
  in ImageLightbox) and all image types.
- VPS returns `colors: []` on `AudioResponse` and `DurationAudioResponse`.

---

## Phase 2 — Tags for Audio Items

### Current state (what already exists)

| Location | Audio type | Tags wired? | Count badge? |
|---|---|---|---|
| RecordingPage context menu | `audio`, `duration_audio` | ✅ Yes (lines ~2895–2903) | ❌ No |
| CaptureItem audio row | `quick_capture_audio` | ✅ Yes | ✅ Yes (`audioTagCountMap`) |
| ImageLightbox audio chips | `image_audio`, `duration_image_audio`, `quick_capture_image_audio`, `image_child_audio` | ❌ No | ❌ No |

**`media_tags` table already supports any `media_type` string — no DB changes needed.**  
The `window.electronAPI.tags.*` IPC methods already work with any media_type.

---

### 2-A: Audio tag count badges in RecordingPage

**File**: `src/pages/RecordingPage.tsx`

**Add state** (near line 120, beside the existing `*ColorsCache` state):
```typescript
const [recordingAudioTagCountMap, setRecordingAudioTagCountMap] = useState<Record<number, number>>({});
const [durationAudioTagCountMap, setDurationAudioTagCountMap] = useState<Record<number, number>>({});
```

**Add useEffects** to fetch tag counts (pattern matches how `durationImageTagsCache` is fetched):
```typescript
// Fetch tag counts for recording-level audios
useEffect(() => {
  if (!recordingAudios.length) { setRecordingAudioTagCountMap({}); return; }
  Promise.all(
    recordingAudios.map(a =>
      window.electronAPI.tags.getByMedia('audio', a.id)
        .then((tags: { name: string }[]) => [a.id, tags.length] as const)
    )
  ).then(entries => setRecordingAudioTagCountMap(Object.fromEntries(entries)));
}, [recordingAudios]);

// Fetch tag counts for duration-level audios
useEffect(() => {
  if (!activeDurationAudios.length) { setDurationAudioTagCountMap({}); return; }
  Promise.all(
    activeDurationAudios.map(a =>
      window.electronAPI.tags.getByMedia('duration_audio', a.id)
        .then((tags: { name: string }[]) => [a.id, tags.length] as const)
    )
  ).then(entries => setDurationAudioTagCountMap(Object.fromEntries(entries)));
}, [activeDurationAudios]);
```

**Also**: after `setTagModal(null)` (when the tag modal closes), re-fetch the relevant tag
count map. Look for the `TagModal` render at the bottom of the page and add a callback similar
to CaptureItem's `onClose={() => { setTagModal(null); fetchTagCounts(); }}`.

**Add tag count badge to audio cards** in the JSX — search for the duration audio card
(`durationAudioColorsCache`) and recording audio card sections. Add an orange badge like:
```tsx
{(durationAudioTagCountMap[audio.id] ?? 0) > 0 && (
  <span className="text-[9px] bg-orange-500 text-white rounded-full px-1.5 py-0.5 leading-none">
    🏷️{durationAudioTagCountMap[audio.id]}
  </span>
)}
```

---

### 2-B: Tags in ImageLightbox audio chips

**File**: `src/components/common/ImageLightbox.tsx`

**Add props** to `ImageLightboxProps` (after the existing `onToggleAudioColor` prop):
```typescript
// Tag counts for image-attached audio chips
audioTagCountMap?: Record<number, number>;
onAudioTagsChanged?: (audioId: number) => void;
```

**Destructure** with defaults `audioTagCountMap = {}` and `onAudioTagsChanged`.

**Add state** for inline tag modal on audio chips:
```typescript
const [audioTagModalId, setAudioTagModalId] = useState<number | null>(null);
const [audioTagMediaType, setAudioTagMediaType] = useState<string | null>(null);
```

**Reset** `audioTagModalId` in the navigation `useEffect` (the one at line ~326 that already
resets `audioColorPickerId`).

**Modify the audio chip right-click popover** — the existing popover (triggered by right-click,
shows caption textarea + color swatches) now also shows a Tags section at the bottom if
`onAudioTagsChanged` is defined:
```tsx
{onAudioTagsChanged && (
  <div className="mt-2 pt-2 border-t border-white/10">
    <button
      onMouseDown={(e) => { e.stopPropagation(); e.preventDefault();
        setAudioTagModalId(audio.id);
        // determine mediaType from the parent image type
        // caller should pass imageType so lightbox knows which audio table
        setAudioTagMediaType(resolveAudioMediaType(imageType));
      }}
      className="text-white/60 hover:text-white text-[10px] w-full text-left"
    >
      🏷️ Tags{(audioTagCountMap[audio.id] ?? 0) > 0 ? ` (${audioTagCountMap[audio.id]})` : ''}
    </button>
  </div>
)}
```

Add a helper `resolveAudioMediaType(imageType)` (inside the component or as a module-level
pure function) that maps image type → audio type:
```typescript
function resolveAudioMediaType(imageType?: string): string {
  switch (imageType) {
    case 'image': return 'image_audio';
    case 'duration_image': return 'duration_image_audio';
    case 'quick_capture_image': return 'quick_capture_image_audio';
    case 'image_child': return 'image_child_audio';
    default: return 'image_audio';
  }
}
```

**Render TagModal** inside the lightbox (near the bottom, alongside the existing image TagModal):
```tsx
{audioTagModalId != null && audioTagMediaType && image?.id && (
  <TagModal
    mediaType={audioTagMediaType as MediaTagType}
    mediaId={audioTagModalId}
    title="Audio Tags"
    onClose={() => {
      setAudioTagModalId(null);
      onAudioTagsChanged?.(audioTagModalId!);
    }}
  />
)}
```

**Add tag count dot** on each chip (alongside the existing color dots):
```tsx
{(audioTagCountMap[audio.id] ?? 0) > 0 && (
  <span className="text-[8px] bg-orange-500/80 text-white rounded-full px-1 leading-none">
    {audioTagCountMap[audio.id]}
  </span>
)}
```

**Pass to child lightbox** (already receives `audioColorsMap`; add):
```tsx
audioTagCountMap={/* fetch or derive from childAudiosMap — see note below */}
onAudioTagsChanged={/* handler that re-fetches child audio tag counts */}
```

> **Note on child audio tag counts**: The parent lightbox should maintain
> `childAudioTagCountMap: Record<number, number>` state, fetch it in a `useEffect` keyed on
> `childAudiosMap` (same pattern as `childAudioColorsMap`), and pass a handler that triggers
> a re-fetch after a tag change.

---

### 2-C: Callers pass audio tag data to ImageLightbox

**RecordingPage.tsx** — add states + effects + pass to both lightbox instances:
```typescript
// States
const [recordingImageAudioTagCountMap, setRecordingImageAudioTagCountMap] = useState<Record<number, number>>({});
const [durationImageAudioTagCountMap, setDurationImageAudioTagCountMap] = useState<Record<number, number>>({});

// useEffect: keyed on recordingImageAudiosCache
// useEffect: keyed on activeDurationId + durationImageAudiosCache
// (pattern matches the audio color cache effects added in Phase 1B)

// Pass to recording image lightbox:
audioTagCountMap={recordingImageAudioTagCountMap}
onAudioTagsChanged={(audioId) => {
  // re-fetch tag count for just that audio OR refetch the whole map
}}

// Pass to duration image lightbox:
audioTagCountMap={durationImageAudioTagCountMap}
onAudioTagsChanged={...}
```

**CaptureItem.tsx** — add `captureImageAudioTagCountMap` state:
```typescript
const [captureImageAudioTagCountMap, setCaptureImageAudioTagCountMap] = useState<Record<number, number>>({});

// useEffect: keyed on captureImageAudiosMap
// Pass to ImageLightbox:
audioTagCountMap={captureImageAudioTagCountMap}
onAudioTagsChanged={(audioId) => { /* refetch */ }}
```

---

### Phase 2 — File Checklist

| File | Change |
|---|---|
| `src/pages/RecordingPage.tsx` | Add `recordingAudioTagCountMap` + `durationAudioTagCountMap` states, fetch useEffects, tag count badges on cards, pass `audioTagCountMap`/`onAudioTagsChanged` to both lightboxes |
| `src/components/common/ImageLightbox.tsx` | Add `audioTagCountMap`/`onAudioTagsChanged` props, `audioTagModalId`/`audioTagMediaType` state, Tags section in chip popover, TagModal render, child audio tag counts |
| `src/components/capture/CaptureItem.tsx` | Add `captureImageAudioTagCountMap` state + fetch, pass to lightbox |

---

---

## Phase 3 — Smart Search (AND/OR Condition Builder)

### Goal

Replace the single text box in `SearchPage` with a condition builder that lets the user:
1. Add multiple conditions of three types: **Text** (FTS), **Tag**, **Color**
2. Connect them with a global **AND / OR** toggle
3. See filtered results using the same grouped result renderer as today

---

### 3-A: Types (`src/types/index.ts`)

Add to the end of the file:
```typescript
export type SearchConditionType = 'text' | 'tag' | 'color';

export interface SearchCondition {
  id: string;            // client-only UUID for React keys
  type: SearchConditionType;
  value: string;         // fts query string | tag name | color key
}

export interface FilteredSearchParams {
  conditions: SearchCondition[];
  op: 'AND' | 'OR';
  limit?: number;
}
```

---

### 3-B: Backend — `FilteredSearchOperations` in `electron/database/operations.ts`

Add a new export **after** `SearchOperations` (around line 1466):

```typescript
export const FilteredSearchOperations = {
  search(params: import('../..').FilteredSearchParams): GlobalSearchResult[] {
    // ... implementation below
  }
};
```

**Algorithm**:

For each condition, compute a `Set<string>` of `"content_type:source_id"` composite keys:

- **text condition**: Run the same FTS query as `SearchOperations.search()`. Collect all
  `content_type:source_id` keys.

- **tag condition**:
  ```sql
  SELECT mt.media_type, mt.media_id
  FROM media_tags mt
  JOIN tags t ON t.id = mt.tag_id
  WHERE t.name = ?
  ```
  Map `media_type` → `content_type` using the same mapping used in `TagResultsView`
  (`media_type` IS already `content_type` for images, videos, audios etc.).

- **color condition**:
  ```sql
  SELECT media_type, media_id
  FROM media_color_assignments
  WHERE color_key = ?
  ```

After computing per-condition key sets:
- **AND**: result = intersection of all sets
- **OR**: result = union of all sets

Then batch-fetch the matched items' context (recording, topic, file_path, thumbnail_path)
using the same logic as `SearchOperations.search()` — extract it into a shared helper
function `buildResults(matches, db)` that both operations call.

Return `GlobalSearchResult[]` so the existing UI renderers work unchanged.

> **Important**: For text conditions, preserve the FTS `snippet` and `rank`. For tag/color
> conditions, set `snippet: ''` and `rank: 0`. Sort final results: text matches first
> (by rank), then others alphabetically by content_type.

---

### 3-C: IPC Handler (`electron/ipc/handlers.ts`)

Add one new handler in the `search:*` namespace block:
```typescript
ipcMain.handle('search:filtered', (_event, params: FilteredSearchParams) => {
  return FilteredSearchOperations.search(params);
});
```

Import `FilteredSearchOperations` at the top alongside `SearchOperations`.
Also import `FilteredSearchParams` from types.

---

### 3-D: Preload Bridge (`electron/preload.ts`)

Add to the `search` namespace object (alongside `global`):
```typescript
filtered: (params: FilteredSearchParams) => ipcRenderer.invoke('search:filtered', params),
```

---

### 3-E: Types — ElectronAPI (`src/types/index.ts`)

Extend the `search` field in `ElectronAPI`:
```typescript
search: {
  global: (query: string, limit?: number) => Promise<GlobalSearchResult[]>;
  filtered: (params: FilteredSearchParams) => Promise<GlobalSearchResult[]>;
};
```

---

### 3-F: New Component — `SearchConditionBuilder.tsx`

**File**: `src/components/search/SearchConditionBuilder.tsx`

This is a self-contained component that manages conditions and emits results upward.

**Props**:
```typescript
interface SearchConditionBuilderProps {
  onChange: (params: FilteredSearchParams | null) => void; // null = clear
}
```

**Internal state**:
```typescript
const [conditions, setConditions] = useState<SearchCondition[]>([]);
const [op, setOp] = useState<'AND' | 'OR'>('AND');
```

**UI layout**:
```
┌──────────────────────────────────────────────────────┐
│  [AND / OR toggle]            [+ Add Condition]      │
│  ┌──────────────────────────────────────────────┐    │
│  │ [Text ▾]  [FTS input…]                    ×  │    │
│  │ [Tag  ▾]  [tag name input or picker…]     ×  │    │
│  │ [Color▾]  [10-swatch row]                 ×  │    │
│  └──────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
```

- The AND/OR toggle: two adjacent buttons `AND` / `OR`, active one highlighted.
- Each condition row: type selector dropdown + value input + × delete button.
  - `Text`: plain `<input>` text field.
  - `Tag`: text input with debounced autocomplete from `window.electronAPI.tags.search(q)`.
  - `Color`: 10 small colored circles (from `IMAGE_COLOR_KEYS`/`IMAGE_COLORS`); clicking one
    selects it (one color per condition row; add another row for a second color).
- `+ Add Condition` button adds a new empty row defaulting to type `text`.
- Whenever conditions or op change, call `onChange(conditions.length > 0 ? { conditions, op } : null)`.

**Color condition UI**:
```tsx
<div className="flex gap-1 flex-wrap">
  {IMAGE_COLOR_KEYS.map(key => (
    <button
      key={key}
      onClick={() => updateConditionValue(condition.id, key)}
      className={`w-5 h-5 rounded-full border-2 ${condition.value === key ? 'border-white' : 'border-transparent'}`}
      style={{ backgroundColor: IMAGE_COLORS[key].hex }}
      title={IMAGE_COLORS[key].label}
    />
  ))}
</div>
```

---

### 3-G: Hook — `useFilteredSearch.ts`

**File**: `src/hooks/useFilteredSearch.ts`

```typescript
import { useState, useEffect } from 'react';
import type { FilteredSearchParams, GlobalSearchResult } from '../types';

export function useFilteredSearch() {
  const [params, setParams] = useState<FilteredSearchParams | null>(null);
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!params || params.conditions.length === 0) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    window.electronAPI.search.filtered(params)
      .then(data => { if (!cancelled) { setResults(data); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [params]);

  return { params, setParams, results, loading };
}
```

---

### 3-H: SearchPage integration (`src/pages/SearchPage.tsx`)

**SearchPage currently**: single text `<input>` → `useGlobalSearch` → grouped results.

**New layout**: Add a toggle between **Simple** (existing) and **Advanced** (new builder) modes.

```
[Simple | Advanced]  ← mode toggle, top-right or below the search bar
```

- **Simple mode**: existing text input + `useGlobalSearch` unchanged. No regression.
- **Advanced mode**: renders `<SearchConditionBuilder onChange={setFilteredParams} />` below the mode toggle. Results come from `useFilteredSearch(filteredParams)` instead of `useGlobalSearch`.

In **Advanced mode**:
- Hide the simple text input.
- Render `SearchConditionBuilder`.
- Pass results from `useFilteredSearch` into the existing `grouped` computation and
  `SECTION_ORDER` renderer — it's already generic over `GlobalSearchResult[]`.

**State to add**:
```typescript
const [searchMode, setSearchMode] = useState<'simple' | 'advanced'>('simple');
const [filteredParams, setFilteredParams] = useState<FilteredSearchParams | null>(null);
const { results: filteredResults, loading: filteredLoading } = useFilteredSearch();
// Note: useFilteredSearch should accept params or expose a setParams;
// pass filteredParams as a dep or integrate with the hook
```

Reconfigure `useFilteredSearch` to accept params directly:
```typescript
const { results: filteredResults, loading: filteredLoading } = useFilteredSearch(filteredParams);
```
(adjust hook signature accordingly)

The active results used by the renderer:
```typescript
const activeResults = searchMode === 'simple' ? results : filteredResults;
const activeLoading = searchMode === 'simple' ? loading : filteredLoading;
```

---

### Phase 3 — File Checklist

| File | Change |
|---|---|
| `src/types/index.ts` | Add `SearchCondition`, `FilteredSearchParams`; extend `ElectronAPI.search` |
| `electron/database/operations.ts` | Add `FilteredSearchOperations.search()`; extract shared `buildResults()` helper used by both operations |
| `electron/ipc/handlers.ts` | Add `search:filtered` handler |
| `electron/preload.ts` | Expose `search.filtered` |
| `src/hooks/useFilteredSearch.ts` | **NEW** hook |
| `src/components/search/SearchConditionBuilder.tsx` | **NEW** component |
| `src/pages/SearchPage.tsx` | Add mode toggle, wire `SearchConditionBuilder` + `useFilteredSearch` in advanced mode |

---

## Implementation Order

### Phase 2 (do first — simpler, self-contained)
1. `RecordingPage.tsx` — audio tag count badges
2. `ImageLightbox.tsx` — audio chip Tags section + TagModal
3. `CaptureItem.tsx` — pass image audio tag counts to lightbox
4. Test: right-click audio chip → Tags → assign → badge appears

### Phase 3 (after Phase 2)
1. Types
2. `FilteredSearchOperations` (backend, unit-testable in isolation)
3. IPC handler + preload + types
4. `useFilteredSearch` hook
5. `SearchConditionBuilder` component
6. `SearchPage` integration
7. Test: Advanced mode → add Text + Tag + Color conditions → AND/OR → results

---

## Key Patterns to Follow

**DB operations** (`operations.ts`): use `db.prepare(...).all(...)` / `.get(...)` (synchronous,
better-sqlite3). Never async. Add new operations as `export const XxxOperations = { ... }`.

**IPC handler**: `ipcMain.handle('namespace:action', (_event, arg1, arg2) => { return SyncOp(); })`.
No `async` needed for better-sqlite3 sync methods.

**Preload**: `namespace: { method: (...args) => ipcRenderer.invoke('namespace:method', ...args) }`.

**ElectronAPI types**: extend the `ElectronAPI` interface in `src/types/index.ts`.

**Tag fetch pattern** (after assignment):
```typescript
window.electronAPI.tags.getByMedia(mediaType, mediaId).then(tags => { /* update local count */ });
```

**Color keys**: imported from `src/utils/imageColors.ts` → `IMAGE_COLOR_KEYS`, `IMAGE_COLORS`.

**`media_type` strings for audio**:

| Table | `media_type` string |
|---|---|
| `audios` | `'audio'` |
| `duration_audios` | `'duration_audio'` |
| `quick_capture_audios` | `'quick_capture_audio'` |
| `image_audios` | `'image_audio'` |
| `duration_image_audios` | `'duration_image_audio'` |
| `quick_capture_image_audios` | `'quick_capture_image_audio'` |
| `image_child_audios` (in `image_children` context) | `'image_child_audio'` |

---

## Testing Checklist

### Phase 2
- [ ] RecordingPage: right-click recording-level audio → Tags → assign → orange badge appears on card
- [ ] RecordingPage: right-click duration-level audio → Tags → assign → badge appears
- [ ] ImageLightbox: open image → right-click audio chip → Tags section visible → assign tag → count dot on chip
- [ ] Child lightbox: same for child image audio
- [ ] CaptureItem: open lightbox → right-click image audio chip → Tags works

### Phase 3
- [ ] SearchPage: mode toggle appears and switches layout
- [ ] Advanced mode: add Text condition → results match FTS
- [ ] Advanced mode: add Tag condition → results match tag
- [ ] Advanced mode: add Color condition → results match color
- [ ] AND: add Text + Color → only items matching BOTH appear
- [ ] OR: add Text + Color → items matching EITHER appear
- [ ] Remove condition → results update
- [ ] Switch back to Simple mode → normal text search works unchanged
