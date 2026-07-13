import { useState, useEffect, useMemo, useCallback } from 'react';
import CaptureInput from '../components/capture/CaptureInput';
import CaptureItem from '../components/capture/CaptureItem';
import CaptureFilterBar from '../components/capture/CaptureFilterBar';
import CaptureGallery from '../components/capture/CaptureGallery';
import TagSearchSection from '../components/capture/TagSearchSection';
import type { QuickCapture, CaptureFilters, CaptureImageWithContext } from '../types';

type View = 'board' | 'all' | 'archived';
/**
 * What the All view lists. 'images' is the default and the one that matches intuition: Quick
 * Capture reuses ONE capture row per board session, so a single session can span weeks — grouping
 * sessions by date would file today's paste under the day the session began. 'sessions' shows that
 * underlying grouping for when you want it.
 */
type Grain = 'images' | 'sessions';

/** Local 'YYYY-MM-DD' — the same day-space the backend filters in. */
function localDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const localDayKey = (iso: string): string => localDay(new Date(iso));

/** "Today" / "Yesterday" / "Monday, 7 July 2026" — a date you can scan, not parse. */
function dayHeading(dayKey: string): string {
  if (dayKey === localDay(new Date())) return 'Today';
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (dayKey === localDay(yesterday)) return 'Yesterday';

  // Parse as LOCAL midnight. `new Date('2026-07-07')` parses as UTC and can render as the 6th.
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export default function CapturePage() {
  const [captures, setCaptures] = useState<QuickCapture[]>([]);
  const [archived, setArchived] = useState<QuickCapture[]>([]);
  const [all, setAll] = useState<QuickCapture[]>([]);
  const [allImages, setAllImages] = useState<CaptureImageWithContext[]>([]);
  const [grain, setGrain] = useState<Grain>('images');
  const [loading, setLoading] = useState(true);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [view, setView] = useState<View>('board');
  const [filters, setFilters] = useState<CaptureFilters>({ scope: 'all' });
  // Ids from the most recent "Clear board" — lets the user undo it in one click.
  const [undoIds, setUndoIds] = useState<number[] | null>(null);

  const loadBoard = useCallback(async () => {
    const recent = await window.electronAPI.quickCaptures.getRecent();
    setCaptures(recent);
    setLoading(false);
  }, []);

  const loadArchived = useCallback(async () => {
    setArchived(await window.electronAPI.quickCaptures.getArchived());
  }, []);

  // Filtering happens in SQL, not here: tags and colours live on a capture's IMAGES and AUDIOS,
  // never on the capture row, so matching means rolling up through children — not something the
  // renderer can do from the hydrated list.
  const loadAll = useCallback(async () => {
    if (grain === 'images') {
      setAllImages(await window.electronAPI.quickCaptures.getAllImages(filters));
    } else {
      setAll(await window.electronAPI.quickCaptures.getAll(filters));
    }
  }, [filters, grain]);

  useEffect(() => { loadBoard(); }, [loadBoard]);
  useEffect(() => { if (view === 'archived') loadArchived(); }, [view, loadArchived]);
  useEffect(() => { if (view === 'all') loadAll(); }, [view, loadAll]);

  const handleSaved = (capture: QuickCapture) => {
    setCaptures(prev => {
      const exists = prev.some(c => c.id === capture.id);
      if (exists) return prev.map(c => c.id === capture.id ? capture : c);
      return [capture, ...prev];
    });
    // A fresh capture supersedes the undo affordance from an earlier clear.
    setUndoIds(null);
  };

  const handleDelete = async (id: number) => {
    await window.electronAPI.quickCaptures.delete(id);
    setCaptures(prev => prev.filter(c => c.id !== id));
    setArchived(prev => prev.filter(c => c.id !== id));
    setAll(prev => prev.filter(c => c.id !== id));
    setUndoIds(prev => prev?.filter(i => i !== id) ?? null);
  };

  /** Clear the board. Archives every capture — deletes nothing. */
  const handleClearBoard = async () => {
    const { ids } = await window.electronAPI.quickCaptures.archiveAll();
    if (ids.length === 0) return;
    setCaptures([]);
    setActiveTag(null);
    setUndoIds(ids);
    if (view === 'archived') await loadArchived();
    if (view === 'all') await loadAll();
  };

  const handleUndo = async () => {
    if (!undoIds) return;
    await window.electronAPI.quickCaptures.unarchive(undoIds);
    setUndoIds(null);
    await loadBoard();
    if (view === 'archived') await loadArchived();
    if (view === 'all') await loadAll();
  };

  const handleRestore = async (id: number) => {
    await window.electronAPI.quickCaptures.unarchive([id]);
    setArchived(prev => prev.filter(c => c.id !== id));
    setUndoIds(prev => prev?.filter(i => i !== id) ?? null);
    await loadBoard();
    if (view === 'all') await loadAll();
  };

  const shown = view === 'board' ? captures : view === 'archived' ? archived : all;

  // Legacy capture-level tag pills — board/archived only. The All view has the real filter bar,
  // which matches the tags that actually get used (the ones on a capture's images and audios).
  const allTags = useMemo(() => {
    if (view === 'all') return [];
    const set = new Set<string>();
    for (const c of shown) c.tags.forEach(t => set.add(t));
    return Array.from(set).sort();
  }, [shown, view]);

  const filtered = useMemo(() => {
    if (view === 'all' || !activeTag) return shown;
    return shown.filter(c => c.tags.includes(activeTag));
  }, [shown, activeTag, view]);

  /** The All view groups by the local day a capture was CREATED (not when it was cleared). */
  const grouped = useMemo(() => {
    const byDay = new Map<string, QuickCapture[]>();
    for (const c of filtered) {
      const key = localDayKey(c.created_at);
      const bucket = byDay.get(key);
      if (bucket) bucket.push(c);
      else byDay.set(key, [c]);
    }
    // getAll already returns created_at DESC, so insertion order is newest-day-first.
    return [...byDay.entries()];
  }, [filtered]);

  const totalImages = (list: QuickCapture[]) =>
    list.reduce((sum, c) => sum + c.images.length, 0);

  const tabClass = (v: View) =>
    `px-3 py-1 text-xs rounded-full border transition-colors ${
      view === v
        ? 'bg-primary-600 border-primary-600 text-white'
        : 'border-gray-200 dark:border-dark-border text-gray-600 dark:text-gray-400 hover:border-primary-400'
    }`;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      {/* Page header */}
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Quick Capture</h1>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
            Paste images or record audio instantly. Nothing is ever removed on its own.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* In the image-grain All view the session list isn't even loaded, so count the images. */}
          {view === 'all' && grain === 'images' ? (
            allImages.length > 0 && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {allImages.length} image{allImages.length !== 1 ? 's' : ''}
              </span>
            )
          ) : shown.length > 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {shown.length} item{shown.length !== 1 ? 's' : ''} · {totalImages(shown)} image{totalImages(shown) !== 1 ? 's' : ''}
            </span>
          )}
          {view === 'board' && captures.length > 0 && (
            <button
              onClick={handleClearBoard}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border text-gray-600 dark:text-gray-400 hover:border-primary-400 hover:text-primary-600 transition-colors"
              title="Move everything to Archived. Kept in the database, still tag-searchable."
            >
              Clear board
            </button>
          )}
        </div>
      </div>

      {/* Undo banner after a clear */}
      {undoIds && undoIds.length > 0 && (
        <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-primary-50 dark:bg-dark-surface border border-primary-200 dark:border-dark-border">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Board cleared. {undoIds.length} capture{undoIds.length !== 1 ? 's' : ''} moved to Archived —
            still in your database, still tag-searchable. Nothing was deleted.
          </p>
          <button
            onClick={handleUndo}
            className="text-xs px-2.5 py-1 rounded border border-primary-300 dark:border-dark-border text-primary-700 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-dark-border transition-colors shrink-0"
          >
            Undo
          </button>
        </div>
      )}

      {/* Tag search */}
      <TagSearchSection />

      {/* Capture input — only meaningful on the live board */}
      {view === 'board' && <CaptureInput onSaved={handleSaved} />}

      {/* View switch */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => { setView('board'); setActiveTag(null); }} className={tabClass('board')}>
          Board
        </button>
        <button
          onClick={() => { setView('all'); setActiveTag(null); }}
          className={tabClass('all')}
          title="Every capture you've ever made — on the board and cleared off it — grouped by day"
        >
          All captures
        </button>
        <button onClick={() => { setView('archived'); setActiveTag(null); }} className={tabClass('archived')}>
          Archived
        </button>
      </div>

      {/* Filters — All view only. */}
      {view === 'all' && (
        <>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-400 dark:text-gray-500 mr-1">Group by</span>
            {(['images', 'sessions'] as Grain[]).map(g => (
              <button
                key={g}
                onClick={() => setGrain(g)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  grain === g
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-dark-hover text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
                title={g === 'images'
                  ? 'Every image, on the day you captured it'
                  : 'The capture sessions themselves (one row per board, so a session can span weeks)'}
              >
                {g === 'images' ? 'Image' : 'Capture session'}
              </button>
            ))}
          </div>
          <CaptureFilterBar
            filters={filters}
            onChange={setFilters}
            resultCount={grain === 'images' ? allImages.length : all.length}
            grain={grain}
          />
        </>
      )}

      {/* Legacy capture-level tag pills — board/archived only */}
      {view !== 'all' && allTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTag(null)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              activeTag === null
                ? 'bg-primary-600 border-primary-600 text-white'
                : 'border-gray-200 dark:border-dark-border text-gray-600 dark:text-gray-400 hover:border-primary-400'
            }`}
          >
            All
          </button>
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => setActiveTag(tag === activeTag ? null : tag)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                activeTag === tag
                  ? 'bg-primary-600 border-primary-600 text-white'
                  : 'border-gray-200 dark:border-dark-border text-gray-600 dark:text-gray-400 hover:border-primary-400'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Timeline */}
      {loading ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">Loading…</div>
      ) : view === 'all' && grain === 'images' ? (
        allImages.length === 0 ? (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500">
            <p className="text-sm">No captured images match these filters</p>
            <p className="text-xs mt-1 opacity-60">Try widening the date range, or clearing the tag and colour filters</p>
          </div>
        ) : (
          <CaptureGallery images={allImages} onChanged={loadAll} />
        )
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          <svg className="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          {view === 'all' ? (
            <>
              <p className="text-sm">No captures match these filters</p>
              <p className="text-xs mt-1 opacity-60">Try widening the date range, or clearing the tag and colour filters</p>
            </>
          ) : activeTag ? (
            <p className="text-sm">No captures tagged "{activeTag}"</p>
          ) : view === 'archived' ? (
            <>
              <p className="text-sm">Nothing archived yet</p>
              <p className="text-xs mt-1 opacity-60">Captures you clear off the board land here</p>
            </>
          ) : (
            <>
              <p className="text-sm">Nothing captured yet</p>
              <p className="text-xs mt-1 opacity-60">Paste an image with ⌘V or record a voice note above</p>
            </>
          )}
        </div>
      ) : view === 'all' ? (
        /* Grouped by the day it was captured, newest day first. */
        <div className="space-y-6">
          {grouped.map(([dayKey, dayCaptures]) => (
            <section key={dayKey}>
              <div className="sticky top-0 z-20 -mx-4 px-4 py-1.5 bg-white/90 dark:bg-dark-bg/90 backdrop-blur-sm border-b border-gray-100 dark:border-dark-border mb-3">
                <div className="flex items-baseline gap-2">
                  <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    {dayHeading(dayKey)}
                  </h2>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {dayCaptures.length} capture{dayCaptures.length !== 1 ? 's' : ''}
                    {totalImages(dayCaptures) > 0 && ` · ${totalImages(dayCaptures)} image${totalImages(dayCaptures) !== 1 ? 's' : ''}`}
                  </span>
                </div>
              </div>
              <div className="space-y-3">
                {dayCaptures.map(capture => (
                  <CaptureItem
                    key={capture.id}
                    capture={capture}
                    onDelete={handleDelete}
                    // In the All view a capture may be either state — only offer Restore on
                    // the ones actually cleared off the board.
                    onRestore={capture.archived_at ? handleRestore : undefined}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(capture => (
            <CaptureItem
              key={capture.id}
              capture={capture}
              onDelete={handleDelete}
              onRestore={view === 'archived' ? handleRestore : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
