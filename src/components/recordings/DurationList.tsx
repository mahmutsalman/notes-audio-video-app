import type { Duration } from '../../types';
import { formatDuration } from '../../utils/formatters';

interface DurationListProps {
  durations: Duration[];
  activeDurationId: number | null;
  onDurationClick: (duration: Duration) => void;
  onDeleteDuration: (id: number) => void;
}

export default function DurationList({
  durations,
  activeDurationId,
  onDurationClick,
  onDeleteDuration,
}: DurationListProps) {
  if (durations.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
        <span>🔖</span>
        Marked Sections ({durations.length})
      </h2>
      <div className="flex flex-wrap gap-2">
        {durations.map((duration) => {
          const isActive = activeDurationId === duration.id;
          return (
            <div
              key={duration.id}
              className="group relative"
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDurationClick(duration);
                }}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all
                           flex items-center gap-2
                           ${isActive
                             ? 'bg-primary-600 text-white shadow-md'
                             : 'bg-gray-100 dark:bg-dark-hover text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-border'
                           }`}
              >
                {isActive && <span className="animate-pulse">🔁</span>}
                <span>{formatDuration(Math.floor(duration.start_time))}</span>
                <span className="text-gray-400 dark:text-gray-500">→</span>
                <span>{formatDuration(Math.floor(duration.end_time))}</span>
              </button>
              {/* Delete button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteDuration(duration.id);
                }}
                className={`absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full
                           text-xs flex items-center justify-center
                           opacity-0 group-hover:opacity-100 transition-opacity
                           ${isActive ? 'opacity-100' : ''}`}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        Click to loop play • Press Escape to stop
      </p>
    </div>
  );
}
