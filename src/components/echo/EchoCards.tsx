import type { ReviewItem, BrowseReviewItem } from '../../types';
import { formatDueLabel } from '../../utils/srsAlgorithm';

// Shared presentational cards for the Echo queue/browse views. Used by both the global
// EchoPage and the note-scoped NoteEchoSection so the two stay visually identical.

export function ReviewItemGridCard({
  item,
  onRemove,
  onEditMasks,
  onOpen,
}: {
  item: ReviewItem;
  onRemove: (id: number, e: React.MouseEvent) => void;
  onEditMasks: (item: ReviewItem, e: React.MouseEvent) => void;
  onOpen: () => void;
}) {
  const isDue = new Date(item.next_review_at) <= new Date();
  const dueLabel = formatDueLabel(item.next_review_at);
  const src = item.thumbnail_path
    ? window.electronAPI.paths.getFileUrl(item.thumbnail_path)
    : item.file_path
      ? window.electronAPI.paths.getFileUrl(item.file_path)
      : null;

  return (
    <div
      onClick={onOpen}
      className="relative rounded-xl overflow-hidden bg-gray-100 dark:bg-dark-surface group border border-gray-200 dark:border-dark-border cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
      title="Open Echo history"
    >
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
          title="Remove from Echo"
        >
          ×
        </button>
        <button
          onClick={(e) => onEditMasks(item, e)}
          className="absolute bottom-1.5 right-1.5 bg-black/60 text-white/70 hover:text-blue-300 text-[10px] px-1.5 py-0.5 rounded hidden group-hover:flex items-center gap-0.5 transition-colors"
          title="Edit masks"
        >
          ▦ Masks
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

export function ReviewItemListRow({
  item,
  onRemove,
  onEditMasks,
  onOpen,
}: {
  item: ReviewItem;
  onRemove: (id: number, e: React.MouseEvent) => void;
  onEditMasks: (item: ReviewItem, e: React.MouseEvent) => void;
  onOpen: () => void;
}) {
  const isDue = new Date(item.next_review_at) <= new Date();
  const dueLabel = formatDueLabel(item.next_review_at);
  const src = item.thumbnail_path
    ? window.electronAPI.paths.getFileUrl(item.thumbnail_path)
    : item.file_path
      ? window.electronAPI.paths.getFileUrl(item.file_path)
      : null;

  return (
    <div
      onClick={onOpen}
      className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50 dark:bg-dark-surface border border-gray-200 dark:border-dark-border hover:border-gray-300 dark:hover:border-dark-hover group transition-colors cursor-pointer"
      title="Open Echo history"
    >
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
          onClick={(e) => onEditMasks(item, e)}
          className="text-gray-400 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all text-xs px-2 py-1 rounded bg-gray-100 dark:bg-dark-hover"
          title="Edit masks"
        >
          ▦
        </button>
        <button
          onClick={(e) => onRemove(item.id, e)}
          className="text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-lg leading-none"
          title="Remove from Echo"
        >
          ×
        </button>
      </div>
    </div>
  );
}

export function BrowseCard({ item, onOpen }: { item: BrowseReviewItem; onOpen: () => void }) {
  const src = item.thumbnail_path
    ? window.electronAPI.paths.getFileUrl(item.thumbnail_path)
    : item.file_path
      ? window.electronAPI.paths.getFileUrl(item.file_path)
      : null;
  const reviews = item.total_reviews ?? 0;
  const againRate = reviews > 0 && item.again_count != null
    ? Math.round((item.again_count / reviews) * 100)
    : null;
  const lastReviewed = item.last_reviewed_at
    ? new Date(item.last_reviewed_at).toLocaleDateString()
    : 'never';

  return (
    <div
      onClick={onOpen}
      className="relative rounded-xl overflow-hidden bg-gray-100 dark:bg-dark-surface group border border-gray-200 dark:border-dark-border cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
      title="Open Echo history"
    >
      <div className="aspect-square relative overflow-hidden">
        {src ? (
          <img src={src} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gray-200 dark:bg-dark-hover flex items-center justify-center">
            <span className="text-gray-400 text-2xl">🖼️</span>
          </div>
        )}
        <div className="absolute top-1.5 left-1.5 bg-black/60 text-white text-[10px] font-medium px-1.5 py-0.5 rounded-full">
          {reviews} review{reviews !== 1 ? 's' : ''}
        </div>
        {againRate != null && (
          <div
            className="absolute top-1.5 right-1.5 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-full"
            title="How often you rated this 'Again'"
          >
            {againRate}% again
          </div>
        )}
      </div>
      <div className="p-2">
        {item.caption && (
          <p className="text-gray-700 dark:text-gray-300 text-xs truncate" title={item.caption}>{item.caption}</p>
        )}
        <p className="text-gray-400 text-[10px] truncate mt-0.5">Last: {lastReviewed}</p>
        <p className="text-[11px] mt-0.5 text-gray-400">{formatDueLabel(item.next_review_at)}</p>
      </div>
    </div>
  );
}
