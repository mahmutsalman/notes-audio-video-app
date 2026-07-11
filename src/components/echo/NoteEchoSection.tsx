import { useState, useEffect, useCallback } from 'react';
import type { ReviewItem, ReviewMask, BrowseReviewItem, ReviewedTodayItem, MediaTagType } from '../../types';
import { REVIEW_CHANGED_EVENT, emitReviewChanged } from '../../utils/events';
import ReviewSession from '../review/ReviewSession';
import MaskEditor from '../review/MaskEditor';
import EchoImageDetailPage from '../../pages/EchoImageDetailPage';
import { ReviewItemGridCard, BrowseCard, ReviewedTodayCard } from './EchoCards';
import EchoTagFilter from './EchoTagFilter';

type FilterTab = 'due' | 'today' | 'all' | 'upcoming' | 'browse';

/**
 * Inline, note-scoped Echo panel. Reuses the global Echo stack (cards, ReviewSession,
 * the /echo/:id detail page) but loads only review_items whose recording_id matches this note.
 */
export default function NoteEchoSection({ recordingId }: { recordingId: number }) {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [browseItems, setBrowseItems] = useState<BrowseReviewItem[]>([]);
  // This note's echoes graded today — loaded eagerly so the count is right without opening the tab.
  const [todayItems, setTodayItems] = useState<ReviewedTodayItem[]>([]);
  const [filter, setFilter] = useState<FilterTab>('due');
  const [expanded, setExpanded] = useState(false);
  const [sessionItems, setSessionItems] = useState<ReviewItem[] | null>(null);
  const [peekItems, setPeekItems] = useState<ReviewItem[] | null>(null);
  const [maskEditorItem, setMaskEditorItem] = useState<ReviewItem | null>(null);
  const [maskEditorMasks, setMaskEditorMasks] = useState<ReviewMask[]>([]);
  // Inline analytics overlay: the open item + the ordered id list it was opened from (for ←/→).
  const [detail, setDetail] = useState<{ id: number; list: number[] } | null>(null);
  // Tag filter (note-scoped) — composes with the due/all/upcoming/browse tabs (ANY/OR match).
  const [activeTags, setActiveTags] = useState<string[]>([]);
  // Enrolled count IGNORING the tag filter, so a filter that matches nothing doesn't make the
  // section look empty (and trap the filter). Captured whenever no filter is active.
  const [totalEnrolled, setTotalEnrolled] = useState(0);

  const loadItems = useCallback(async () => {
    setItems(activeTags.length > 0
      ? await window.electronAPI.review.getByRecordingAndTags(recordingId, activeTags)
      : await window.electronAPI.review.getByRecording(recordingId));
  }, [recordingId, activeTags]);

  const loadBrowse = useCallback(async () => {
    setBrowseItems(activeTags.length > 0
      ? await window.electronAPI.review.getAllEnrolledByRecordingAndTags(recordingId, activeTags)
      : await window.electronAPI.review.getAllEnrolledByRecording(recordingId));
  }, [recordingId, activeTags]);

  const loadToday = useCallback(async () => {
    // null = today, resolved as a local day in SQL so the boundary matches the heatmap's.
    setTodayItems(await window.electronAPI.review.getReviewedOn(null, activeTags, recordingId));
  }, [recordingId, activeTags]);

  useEffect(() => { loadItems(); }, [loadItems]);
  useEffect(() => { loadToday(); }, [loadToday]);

  useEffect(() => {
    if (expanded && filter === 'browse') loadBrowse();
  }, [expanded, filter, loadBrowse]);

  // Refresh when a review is enrolled/rated/removed anywhere (window event — no polling).
  useEffect(() => {
    const onChanged = () => {
      loadItems();
      loadToday();
      if (filter === 'browse') loadBrowse();
    };
    window.addEventListener(REVIEW_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(REVIEW_CHANGED_EVENT, onChanged);
  }, [loadItems, loadBrowse, loadToday, filter]);

  // When no filter is active, `items` is the full enrolled set → remember its size.
  useEffect(() => {
    if (activeTags.length === 0) setTotalEnrolled(items.length);
  }, [activeTags, items]);

  const now = new Date();
  const dueItems = items.filter(i => new Date(i.next_review_at) <= now);
  const upcomingItems = items.filter(i => new Date(i.next_review_at) > now);
  const displayedItems = filter === 'due' ? dueItems : filter === 'upcoming' ? upcomingItems : items;

  // Open the inline analytics overlay, capturing the current grid's order for ←/→ nav.
  const openDetail = (id: number) => {
    const list = (filter === 'browse' ? browseItems : filter === 'today' ? todayItems : displayedItems).map(i => i.id);
    setDetail({ id, list });
  };

  const startSession = () => { if (dueItems.length > 0) setSessionItems(dueItems); };

  // Peek — browse this note's masked questions (whatever tab is active) without saving progress.
  const startPeek = () => {
    const source: ReviewItem[] =
      filter === 'browse' ? browseItems :
      filter === 'today' ? todayItems :
      displayedItems;
    if (source.length > 0) setPeekItems(source);
  };

  const handleSessionEnd = () => {
    setSessionItems(null);
    loadItems();
    loadToday();
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

  // Peek mode writes nothing, so closing just clears the overlay.
  if (peekItems) {
    return <ReviewSession items={peekItems} readOnly onSessionEnd={() => setPeekItems(null)} />;
  }

  // Inline analytics overlay — keeps the note (and this section's expanded/filter state)
  // mounted underneath, so closing returns exactly where you were. ←/→ walk the list.
  if (detail) {
    const idx = detail.list.indexOf(detail.id);
    const prevId = idx > 0 ? detail.list[idx - 1] : null;
    const nextId = idx >= 0 && idx < detail.list.length - 1 ? detail.list[idx + 1] : null;
    return (
      <div className="fixed inset-0 z-50 bg-white dark:bg-dark-bg overflow-auto">
        <EchoImageDetailPage
          reviewItemId={detail.id}
          onBack={() => { setDetail(null); loadItems(); if (filter === 'browse') loadBrowse(); }}
          onPrev={prevId != null ? () => setDetail(d => (d ? { ...d, id: prevId } : d)) : undefined}
          onNext={nextId != null ? () => setDetail(d => (d ? { ...d, id: nextId } : d)) : undefined}
        />
      </div>
    );
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
            {totalEnrolled === 0
              ? 'nothing enrolled'
              : `${totalEnrolled} enrolled · ${dueItems.length} due now · ${todayItems.length} reviewed today`}
          </span>
        </button>

        {items.length > 0 && (
          <button
            onClick={startPeek}
            className="px-3 py-1.5 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-dark-hover text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 flex-shrink-0"
            title="Review the masked questions without saving progress"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Peek
          </button>
        )}

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
          {totalEnrolled === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
              No images from this note enrolled yet. Right-click a mark's image and choose "Add to Echo".
            </p>
          ) : (
            <>
              {/* Tag filter — always shown when there ARE enrolled echoes, so an active
                  filter can always be cleared even when it matches nothing. */}
              <EchoTagFilter
                activeTags={activeTags}
                onChange={setActiveTags}
                recordingId={recordingId}
                containerClassName="mb-3"
              />
              {items.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
                  No enrolled echoes match the selected tag{activeTags.length > 1 ? 's' : ''}.{' '}
                  <button
                    onClick={() => setActiveTags([])}
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Clear filter
                  </button>
                </p>
              ) : (
                <>
              {/* Filter tabs */}
              <div className="flex gap-1 mb-3 flex-wrap">
                {(['due', 'today', 'all', 'upcoming', 'browse'] as FilterTab[]).map(tab => {
                  const count =
                    tab === 'due' ? dueItems.length :
                    tab === 'today' ? todayItems.length :
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
                      {tab === 'due' ? 'Due Now' : tab === 'today' ? '✓ Reviewed Today' : tab === 'upcoming' ? 'Upcoming' : tab === 'browse' ? '▦ Browse' : 'All'}
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
              ) : filter === 'today' ? (
                todayItems.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
                    Nothing from this note graded today yet.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                    {todayItems.map(item => (
                      <ReviewedTodayCard key={item.id} item={item} onOpen={() => openDetail(item.id)} />
                    ))}
                  </div>
                )
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
            mediaTagType={maskEditorItem.media_type as MediaTagType}
            mediaTagId={maskEditorItem.media_id}
            onClose={() => { setMaskEditorItem(null); setMaskEditorMasks([]); }}
          />
        </div>
      )}
    </div>
  );
}
