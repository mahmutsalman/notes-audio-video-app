import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ReviewItem, ReviewMask, BrowseReviewItem, ReviewedTodayItem, MediaTagType } from '../types';
import { REVIEW_CHANGED_EVENT, emitReviewChanged } from '../utils/events';
import { formatMarkSource, parseQuestionImages } from '../utils/marks';
import ReviewSession from '../components/review/ReviewSession';
import MaskEditor from '../components/review/MaskEditor';
import { ReviewItemGridCard, ReviewItemListRow, BrowseCard, ReviewedTodayCard } from '../components/echo/EchoCards';
import EchoTagFilter from '../components/echo/EchoTagFilter';
import { EchoSortSelect, sortEchoItems, loadEchoSort, saveEchoSort, type EchoSortKey } from '../components/echo/EchoSort';

type FilterTab = 'due' | 'today' | 'all' | 'upcoming' | 'browse';
type ViewMode = 'grid' | 'list';

export default function EchoPage() {
  const navigate = useNavigate();
  const [allItems, setAllItems] = useState<ReviewItem[]>([]);
  const [browseItems, setBrowseItems] = useState<BrowseReviewItem[]>([]);
  // Graded today (rating-carrying review_events only) — loaded eagerly so the tab count and the
  // header line stay honest without opening the tab.
  const [todayItems, setTodayItems] = useState<ReviewedTodayItem[]>([]);
  const [filter, setFilter] = useState<FilterTab>('due');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sessionItems, setSessionItems] = useState<ReviewItem[] | null>(null);
  const [peekItems, setPeekItems] = useState<ReviewItem[] | null>(null);
  const [maskEditorItem, setMaskEditorItem] = useState<ReviewItem | null>(null);
  const [maskEditorMasks, setMaskEditorMasks] = useState<ReviewMask[]>([]);
  // Tag filter — composes with the due/all/upcoming/browse tabs (ANY/OR match).
  const [activeTags, setActiveTags] = useState<string[]>([]);
  // Enrolled count IGNORING the tag filter — so the header reads right when a filter matches
  // nothing. Captured whenever no filter is active.
  const [totalEnrolled, setTotalEnrolled] = useState(0);
  // Sort applies to every tab; persisted so it survives restarts.
  const [sortKey, setSortKeyState] = useState<EchoSortKey>(() => loadEchoSort('page'));
  const setSortKey = (k: EchoSortKey) => { setSortKeyState(k); saveEchoSort('page', k); };

  const loadItems = useCallback(async () => {
    const items = activeTags.length > 0
      ? await window.electronAPI.review.getByTags(activeTags)
      : await window.electronAPI.review.getAll();
    setAllItems(items);
  }, [activeTags]);

  const loadBrowse = useCallback(async () => {
    const items = activeTags.length > 0
      ? await window.electronAPI.review.getAllEnrolledByTags(activeTags)
      : await window.electronAPI.review.getAllEnrolled();
    setBrowseItems(items);
  }, [activeTags]);

  const loadToday = useCallback(async () => {
    // null = today, resolved as a local day in SQL so the boundary matches the heatmap's.
    setTodayItems(await window.electronAPI.review.getReviewedOn(null, activeTags));
  }, [activeTags]);

  useEffect(() => { loadItems(); }, [loadItems]);
  useEffect(() => { loadToday(); }, [loadToday]);

  // Load the richer Browse aggregates when that tab is opened.
  useEffect(() => {
    if (filter !== 'browse') return;
    loadBrowse();
  }, [filter, loadBrowse]);

  // Refresh live when a review is enrolled/rated/removed from anywhere (any tab in this
  // renderer). Window CustomEvent — no polling; only fires on an actual change.
  useEffect(() => {
    const onChanged = () => {
      loadItems();
      loadToday();
      if (filter === 'browse') loadBrowse();
    };
    window.addEventListener(REVIEW_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(REVIEW_CHANGED_EVENT, onChanged);
  }, [loadItems, loadBrowse, loadToday, filter]);

  // When no filter is active, allItems is the full enrolled set → remember its size.
  useEffect(() => {
    if (activeTags.length === 0) setTotalEnrolled(allItems.length);
  }, [activeTags, allItems]);

  const openDetail = (id: number) => navigate(`/echo/${id}`);

  const filterActive = activeTags.length > 0;
  const now = new Date();

  const dueItems = allItems.filter(item => new Date(item.next_review_at) <= now);
  const upcomingItems = allItems.filter(item => new Date(item.next_review_at) > now);

  const displayedItems: ReviewItem[] = sortEchoItems(
    filter === 'due' ? dueItems :
    filter === 'upcoming' ? upcomingItems :
    allItems, sortKey);
  const sortedBrowseItems = sortEchoItems(browseItems, sortKey);
  const sortedTodayItems = sortEchoItems(todayItems, sortKey);

  const startSession = () => {
    if (dueItems.length === 0) return;
    setSessionItems(dueItems);
  };

  // Peek — browse the masked "front" of the currently-shown set (whatever tab is active),
  // reveal blur, ←/→ navigate, without saving any progress. Browse and Today use their own lists.
  const startPeek = () => {
    const source: ReviewItem[] =
      filter === 'browse' ? sortedBrowseItems :
      filter === 'today' ? sortedTodayItems :
      displayedItems;
    if (source.length === 0) return;
    setPeekItems(source);
  };

  const handleSessionEnd = () => {
    setSessionItems(null);
    loadItems();
    loadToday();
    if (filter === 'browse') loadBrowse();
    emitReviewChanged(); // keep any other open Echo tab in sync
  };

  const handleRemove = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await window.electronAPI.review.delete(id);
    setAllItems(prev => prev.filter(i => i.id !== id));
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

  // Peek mode writes nothing, so closing just clears the overlay — no reload/emit needed.
  if (peekItems) {
    return <ReviewSession items={peekItems} readOnly onSessionEnd={() => setPeekItems(null)} />;
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-dark-bg overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 border-b border-gray-200 dark:border-dark-border flex items-center gap-4 flex-shrink-0">
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Echo</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {totalEnrolled} enrolled · {dueItems.length} due now · {todayItems.length} reviewed today
          </p>
        </div>

        {/* Peek — look at the masked questions without studying/saving. Reflects the active tab. */}
        {allItems.length > 0 && (
          <button
            onClick={startPeek}
            className="px-4 py-2 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-dark-hover text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
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
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Start Session ({dueItems.length})
          </button>
        )}

        {/* View mode toggle */}
        <div className="flex gap-1 bg-gray-100 dark:bg-dark-surface rounded-lg p-1">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-white dark:bg-dark-hover shadow-sm' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
            title="Grid view"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
              <rect x="1" y="1" width="6" height="6" rx="1" /><rect x="9" y="1" width="6" height="6" rx="1" />
              <rect x="1" y="9" width="6" height="6" rx="1" /><rect x="9" y="9" width="6" height="6" rx="1" />
            </svg>
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-white dark:bg-dark-hover shadow-sm' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
            title="List view"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 px-5 py-2 border-b border-gray-200 dark:border-dark-border flex-shrink-0">
        {(['due', 'today', 'all', 'upcoming', 'browse'] as FilterTab[]).map(tab => {
          const count =
            tab === 'due' ? dueItems.length :
            tab === 'today' ? todayItems.length :
            tab === 'upcoming' ? upcomingItems.length :
            tab === 'browse' ? (browseItems.length || allItems.length) :
            allItems.length;
          return (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3 py-1 text-sm rounded-lg transition-colors capitalize ${
                filter === tab
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {tab === 'due' ? 'Due Now' : tab === 'today' ? '✓ Reviewed Today' : tab === 'upcoming' ? 'Upcoming' : tab === 'browse' ? '▦ Browse' : 'All'}
              {' '}
              <span className={`text-xs ${filter === tab ? 'text-blue-500' : 'text-gray-400'}`}>
                {count}
              </span>
            </button>
          );
        })}
        <EchoSortSelect value={sortKey} onChange={setSortKey} className="ml-auto" />
      </div>

      {/* Tag filter — narrows every tab (ANY/OR) to echoes whose image carries a selected tag. */}
      <EchoTagFilter
        activeTags={activeTags}
        onChange={setActiveTags}
        containerClassName="px-5 py-2 border-b border-gray-200 dark:border-dark-border flex-shrink-0"
      />

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        {filter === 'browse' ? (
          browseItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="text-4xl mb-3">{filterActive ? '🏷️' : '🗂️'}</div>
              {filterActive ? (
                <>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">No echoes match the selected tag{activeTags.length > 1 ? 's' : ''}.</p>
                  <button onClick={() => setActiveTags([])} className="text-blue-600 dark:text-blue-400 hover:underline text-xs mt-2">Clear filter</button>
                </>
              ) : (
                <>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">No images enrolled yet.</p>
                  <p className="text-gray-400 dark:text-gray-500 text-xs mt-2">
                    Right-click any image and choose "Add to Echo"
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {sortedBrowseItems.map(item => (
                <BrowseCard key={item.id} item={item} onOpen={() => openDetail(item.id)} />
              ))}
            </div>
          )
        ) : filter === 'today' ? (
          todayItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="text-4xl mb-3">{filterActive ? '🏷️' : '🌙'}</div>
              {filterActive ? (
                <>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">
                    Nothing reviewed today matches the selected tag{activeTags.length > 1 ? 's' : ''}.
                  </p>
                  <button onClick={() => setActiveTags([])} className="text-blue-600 dark:text-blue-400 hover:underline text-xs mt-2">Clear filter</button>
                </>
              ) : (
                <>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">No reviews graded today yet.</p>
                  {dueItems.length > 0 && (
                    <button onClick={startSession} className="text-blue-600 dark:text-blue-400 hover:underline text-xs mt-2">
                      Start a session ({dueItems.length} due)
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {sortedTodayItems.map(item => (
                <ReviewedTodayCard key={item.id} item={item} onOpen={() => openDetail(item.id)} />
              ))}
            </div>
          )
        ) : (
          <>
            {displayedItems.length === 0 && (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                {filterActive ? (
                  <>
                    <div className="text-4xl mb-3">🏷️</div>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">
                      No echoes in this view match the selected tag{activeTags.length > 1 ? 's' : ''}.
                    </p>
                    <button onClick={() => setActiveTags([])} className="text-blue-600 dark:text-blue-400 hover:underline text-xs mt-2">Clear filter</button>
                  </>
                ) : filter === 'due' ? (
                  <>
                    <div className="text-4xl mb-3">✅</div>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">
                      {allItems.length === 0
                        ? 'No images enrolled for review yet.'
                        : 'All caught up! Nothing due right now.'}
                    </p>
                    {allItems.length === 0 && (
                      <p className="text-gray-400 dark:text-gray-500 text-xs mt-2">
                        Right-click any image and choose "Add to Echo"
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 text-sm">No items in this view.</p>
                )}
              </div>
            )}

            {viewMode === 'grid' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {displayedItems.map(item => (
                  <ReviewItemGridCard key={item.id} item={item} onRemove={handleRemove} onEditMasks={handleOpenMaskEditor} onOpen={() => openDetail(item.id)} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {displayedItems.map(item => (
                  <ReviewItemListRow key={item.id} item={item} onRemove={handleRemove} onEditMasks={handleOpenMaskEditor} onOpen={() => openDetail(item.id)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Mask Editor overlay */}
      {maskEditorItem && maskEditorItem.file_path && (
        <div className="fixed inset-0 z-50">
          <MaskEditor
            src={window.electronAPI.paths.getFileUrl(maskEditorItem.file_path)}
            reviewItemId={maskEditorItem.id}
            existingMasks={maskEditorMasks}
            onMasksChanged={setMaskEditorMasks}
            mediaTagType={maskEditorItem.media_type as MediaTagType}
            mediaTagId={maskEditorItem.media_id}
            sourceLabel={formatMarkSource(maskEditorItem.mark_number, maskEditorItem.duration_note)}
            sourceImageSrcs={parseQuestionImages(maskEditorItem.question_images_json)
              .map(q => window.electronAPI.paths.getFileUrl(q.file_path))}
            onClose={() => { setMaskEditorItem(null); setMaskEditorMasks([]); }}
          />
        </div>
      )}
    </div>
  );
}

