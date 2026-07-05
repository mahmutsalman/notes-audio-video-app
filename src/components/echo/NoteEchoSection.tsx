import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ReviewItem, ReviewMask, BrowseReviewItem } from '../../types';
import { REVIEW_CHANGED_EVENT, emitReviewChanged } from '../../utils/events';
import ReviewSession from '../review/ReviewSession';
import MaskEditor from '../review/MaskEditor';
import { ReviewItemGridCard, BrowseCard } from './EchoCards';

type FilterTab = 'due' | 'all' | 'upcoming' | 'browse';

/**
 * Inline, note-scoped Echo panel. Reuses the global Echo stack (cards, ReviewSession,
 * the /echo/:id detail page) but loads only review_items whose recording_id matches this note.
 */
export default function NoteEchoSection({ recordingId }: { recordingId: number }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [browseItems, setBrowseItems] = useState<BrowseReviewItem[]>([]);
  const [filter, setFilter] = useState<FilterTab>('due');
  const [expanded, setExpanded] = useState(false);
  const [sessionItems, setSessionItems] = useState<ReviewItem[] | null>(null);
  const [maskEditorItem, setMaskEditorItem] = useState<ReviewItem | null>(null);
  const [maskEditorMasks, setMaskEditorMasks] = useState<ReviewMask[]>([]);

  const loadItems = useCallback(async () => {
    setItems(await window.electronAPI.review.getByRecording(recordingId));
  }, [recordingId]);

  const loadBrowse = useCallback(async () => {
    setBrowseItems(await window.electronAPI.review.getAllEnrolledByRecording(recordingId));
  }, [recordingId]);

  useEffect(() => { loadItems(); }, [loadItems]);

  useEffect(() => {
    if (expanded && filter === 'browse') loadBrowse();
  }, [expanded, filter, loadBrowse]);

  // Refresh when a review is enrolled/rated/removed anywhere (window event — no polling).
  useEffect(() => {
    const onChanged = () => {
      loadItems();
      if (filter === 'browse') loadBrowse();
    };
    window.addEventListener(REVIEW_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(REVIEW_CHANGED_EVENT, onChanged);
  }, [loadItems, loadBrowse, filter]);

  const now = new Date();
  const dueItems = items.filter(i => new Date(i.next_review_at) <= now);
  const upcomingItems = items.filter(i => new Date(i.next_review_at) > now);
  const displayedItems = filter === 'due' ? dueItems : filter === 'upcoming' ? upcomingItems : items;

  const openDetail = (id: number) => navigate(`/echo/${id}`);

  const startSession = () => { if (dueItems.length > 0) setSessionItems(dueItems); };

  const handleSessionEnd = () => {
    setSessionItems(null);
    loadItems();
    if (filter === 'browse') loadBrowse();
    emitReviewChanged();
  };

  const handleRemove = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await window.electronAPI.review.delete(id);
    setItems(prev => prev.filter(i => i.id !== id));
    emitReviewChanged();
  };

  const handleOpenMaskEditor = async (item: ReviewItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const masks = await window.electronAPI.reviewMasks.getByItem(item.id);
    setMaskEditorItem(item);
    setMaskEditorMasks(masks);
  };

  if (sessionItems) {
    return <ReviewSession items={sessionItems} onSessionEnd={handleSessionEnd} />;
  }

  return (
    <div className="mb-6 p-4 rounded-xl bg-blue-50/60 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/40">
      {/* Header — always visible */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-2 text-left flex-1 min-w-0"
          title={expanded ? 'Collapse' : 'Expand'}
        >
          <svg
            className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-base font-semibold text-gray-900 dark:text-gray-100">🔁 Echo</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {items.length === 0
              ? 'nothing enrolled'
              : `${items.length} enrolled · ${dueItems.length} due now`}
          </span>
        </button>

        {dueItems.length > 0 && (
          <button
            onClick={startSession}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Start Session ({dueItems.length})
          </button>
        )}
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="mt-3">
          {items.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
              No images from this note enrolled yet. Right-click a mark's image and choose "Add to Echo".
            </p>
          ) : (
            <>
              {/* Filter tabs */}
              <div className="flex gap-1 mb-3 flex-wrap">
                {(['due', 'all', 'upcoming', 'browse'] as FilterTab[]).map(tab => {
                  const count =
                    tab === 'due' ? dueItems.length :
                    tab === 'upcoming' ? upcomingItems.length :
                    tab === 'browse' ? (browseItems.length || items.length) :
                    items.length;
                  return (
                    <button
                      key={tab}
                      onClick={() => setFilter(tab)}
                      className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                        filter === tab
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium'
                          : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                    >
                      {tab === 'due' ? 'Due Now' : tab === 'upcoming' ? 'Upcoming' : tab === 'browse' ? '▦ Browse' : 'All'}
                      {' '}
                      <span className={`text-xs ${filter === tab ? 'text-blue-500' : 'text-gray-400'}`}>{count}</span>
                    </button>
                  );
                })}
              </div>

              {/* Grid */}
              {filter === 'browse' ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                  {browseItems.map(item => (
                    <BrowseCard key={item.id} item={item} onOpen={() => openDetail(item.id)} />
                  ))}
                </div>
              ) : displayedItems.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
                  {filter === 'due' ? 'Nothing due right now. 🎉' : 'No items in this view.'}
                </p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                  {displayedItems.map(item => (
                    <ReviewItemGridCard
                      key={item.id}
                      item={item}
                      onRemove={handleRemove}
                      onEditMasks={handleOpenMaskEditor}
                      onOpen={() => openDetail(item.id)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Mask editor overlay */}
      {maskEditorItem && maskEditorItem.file_path && (
        <div className="fixed inset-0 z-50">
          <MaskEditor
            src={window.electronAPI.paths.getFileUrl(maskEditorItem.file_path)}
            reviewItemId={maskEditorItem.id}
            existingMasks={maskEditorMasks}
            onMasksChanged={setMaskEditorMasks}
            onClose={() => { setMaskEditorItem(null); setMaskEditorMasks([]); }}
          />
        </div>
      )}
    </div>
  );
}
