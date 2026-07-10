import { useState, useEffect, useMemo, useCallback } from 'react';
import CaptureInput from '../components/capture/CaptureInput';
import CaptureItem from '../components/capture/CaptureItem';
import TagSearchSection from '../components/capture/TagSearchSection';
import type { QuickCapture } from '../types';

type View = 'board' | 'archived';

export default function CapturePage() {
  const [captures, setCaptures] = useState<QuickCapture[]>([]);
  const [archived, setArchived] = useState<QuickCapture[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [view, setView] = useState<View>('board');
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

  useEffect(() => { loadBoard(); }, [loadBoard]);
  useEffect(() => { if (view === 'archived') loadArchived(); }, [view, loadArchived]);

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
  };

  const handleUndo = async () => {
    if (!undoIds) return;
    await window.electronAPI.quickCaptures.unarchive(undoIds);
    setUndoIds(null);
    await loadBoard();
    if (view === 'archived') await loadArchived();
  };

  const handleRestore = async (id: number) => {
    await window.electronAPI.quickCaptures.unarchive([id]);
    setArchived(prev => prev.filter(c => c.id !== id));
    setUndoIds(prev => prev?.filter(i => i !== id) ?? null);
    await loadBoard();
  };

  const shown = view === 'board' ? captures : archived;

  // All unique tags across the captures currently in view
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const c of shown) c.tags.forEach(t => set.add(t));
    return Array.from(set).sort();
  }, [shown]);

  const filtered = useMemo(() => {
    if (!activeTag) return shown;
    return shown.filter(c => c.tags.includes(activeTag));
  }, [shown, activeTag]);

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
          {shown.length > 0 && (
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
        <button onClick={() => { setView('archived'); setActiveTag(null); }} className={tabClass('archived')}>
          Archived
        </button>
      </div>

      {/* Tag filter */}
      {allTags.length > 0 && (
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
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          <svg className="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          {activeTag ? (
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
