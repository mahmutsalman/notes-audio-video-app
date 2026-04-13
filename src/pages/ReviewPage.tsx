import { useState, useEffect, useCallback } from 'react';
import type { ReviewItem } from '../types';
import { formatDueLabel } from '../utils/srsAlgorithm';
import ReviewSession from '../components/review/ReviewSession';

type FilterTab = 'due' | 'all' | 'upcoming';
type ViewMode = 'grid' | 'list';

export default function ReviewPage() {
  const [allItems, setAllItems] = useState<ReviewItem[]>([]);
  const [filter, setFilter] = useState<FilterTab>('due');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sessionItems, setSessionItems] = useState<ReviewItem[] | null>(null);

  const loadItems = useCallback(async () => {
    const items = await window.electronAPI.review.getAll();
    setAllItems(items);
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);

  const now = new Date();

  const dueItems = allItems.filter(item => new Date(item.next_review_at) <= now);
  const upcomingItems = allItems.filter(item => new Date(item.next_review_at) > now);

  const displayedItems: ReviewItem[] =
    filter === 'due' ? dueItems :
    filter === 'upcoming' ? upcomingItems :
    allItems;

  const startSession = () => {
    if (dueItems.length === 0) return;
    setSessionItems(dueItems);
  };

  const handleSessionEnd = () => {
    setSessionItems(null);
    loadItems();
  };

  const handleRemove = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await window.electronAPI.review.delete(id);
    setAllItems(prev => prev.filter(i => i.id !== id));
  };

  if (sessionItems) {
    return <ReviewSession items={sessionItems} onSessionEnd={handleSessionEnd} />;
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-dark-bg overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 border-b border-gray-200 dark:border-dark-border flex items-center gap-4 flex-shrink-0">
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Review Queue</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {allItems.length} enrolled · {dueItems.length} due now
          </p>
        </div>

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
        {(['due', 'all', 'upcoming'] as FilterTab[]).map(tab => {
          const count = tab === 'due' ? dueItems.length : tab === 'upcoming' ? upcomingItems.length : allItems.length;
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
              {tab === 'due' ? 'Due Now' : tab === 'upcoming' ? 'Upcoming' : 'All'}
              {' '}
              <span className={`text-xs ${filter === tab ? 'text-blue-500' : 'text-gray-400'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        {displayedItems.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            {filter === 'due' ? (
              <>
                <div className="text-4xl mb-3">✅</div>
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  {allItems.length === 0
                    ? 'No images enrolled for review yet.'
                    : 'All caught up! Nothing due right now.'}
                </p>
                {allItems.length === 0 && (
                  <p className="text-gray-400 dark:text-gray-500 text-xs mt-2">
                    Right-click any image and choose "Add to Review"
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
              <ReviewItemGridCard key={item.id} item={item} onRemove={handleRemove} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {displayedItems.map(item => (
              <ReviewItemListRow key={item.id} item={item} onRemove={handleRemove} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewItemGridCard({
  item,
  onRemove,
}: {
  item: ReviewItem;
  onRemove: (id: number, e: React.MouseEvent) => void;
}) {
  const isDue = new Date(item.next_review_at) <= new Date();
  const dueLabel = formatDueLabel(item.next_review_at);
  const src = item.thumbnail_path
    ? window.electronAPI.paths.getFileUrl(item.thumbnail_path)
    : item.file_path
      ? window.electronAPI.paths.getFileUrl(item.file_path)
      : null;

  return (
    <div className="relative rounded-xl overflow-hidden bg-gray-100 dark:bg-dark-surface group border border-gray-200 dark:border-dark-border">
      <div className="aspect-square relative overflow-hidden">
        {src ? (
          <img src={src} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gray-200 dark:bg-dark-hover flex items-center justify-center">
            <span className="text-gray-400 text-2xl">🖼️</span>
          </div>
        )}
        {isDue && (
          <div className="absolute top-1.5 left-1.5 bg-blue-600 text-white text-[10px] font-medium px-1.5 py-0.5 rounded-full">
            Due
          </div>
        )}
        <button
          onClick={(e) => onRemove(item.id, e)}
          className="absolute top-1.5 right-1.5 bg-black/60 text-white/70 hover:text-red-400 w-6 h-6 rounded-full text-xs hidden group-hover:flex items-center justify-center transition-colors"
          title="Remove from review"
        >
          ×
        </button>
      </div>
      <div className="p-2">
        {item.caption && (
          <p className="text-gray-700 dark:text-gray-300 text-xs truncate" title={item.caption}>{item.caption}</p>
        )}
        <p className={`text-[11px] mt-0.5 ${isDue ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-400'}`}>
          {dueLabel}
        </p>
        {item.topic_name && (
          <p className="text-gray-400 text-[10px] truncate mt-0.5">{item.topic_name}</p>
        )}
      </div>
    </div>
  );
}

function ReviewItemListRow({
  item,
  onRemove,
}: {
  item: ReviewItem;
  onRemove: (id: number, e: React.MouseEvent) => void;
}) {
  const isDue = new Date(item.next_review_at) <= new Date();
  const dueLabel = formatDueLabel(item.next_review_at);
  const src = item.thumbnail_path
    ? window.electronAPI.paths.getFileUrl(item.thumbnail_path)
    : item.file_path
      ? window.electronAPI.paths.getFileUrl(item.file_path)
      : null;

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50 dark:bg-dark-surface border border-gray-200 dark:border-dark-border hover:border-gray-300 dark:hover:border-dark-hover group transition-colors">
      <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gray-200 dark:bg-dark-hover">
        {src ? (
          <img src={src} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 text-lg">🖼️</div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        {item.caption && (
          <p className="text-gray-800 dark:text-gray-200 text-sm truncate">{item.caption}</p>
        )}
        <div className="flex items-center gap-2 mt-0.5">
          {item.topic_name && (
            <span className="text-gray-400 text-xs truncate max-w-[120px]">{item.topic_name}</span>
          )}
          {item.recording_name && (
            <>
              <span className="text-gray-300 dark:text-gray-600">›</span>
              <span className="text-gray-400 text-xs truncate max-w-[120px]">{item.recording_name}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="text-right">
          <p className={`text-xs font-medium ${isDue ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`}>
            {dueLabel}
          </p>
          <p className="text-[11px] text-gray-400">{item.repetitions} rep{item.repetitions !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={(e) => onRemove(item.id, e)}
          className="text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-lg leading-none"
          title="Remove from review"
        >
          ×
        </button>
      </div>
    </div>
  );
}
