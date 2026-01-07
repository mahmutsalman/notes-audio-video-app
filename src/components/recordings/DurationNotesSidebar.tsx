import { useEffect } from 'react';
import type { Duration } from '../../types';
import { formatDuration, formatDurationLength } from '../../utils/formatters';
import { DURATION_COLORS } from '../../utils/durationColors';

interface DurationNotesSidebarProps {
  durations: Duration[];
  activeDurationId: number | null;
  onDurationSelect: (durationId: number) => void;
}

export default function DurationNotesSidebar({
  durations,
  activeDurationId,
  onDurationSelect,
}: DurationNotesSidebarProps) {
  // Filter durations that have notes
  const durationsWithNotes = durations.filter(d => d.note && d.note.trim() !== '');

  // Auto-scroll to active note when activeDurationId changes
  useEffect(() => {
    if (activeDurationId !== null) {
      const element = document.getElementById(`sidebar-note-${activeDurationId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [activeDurationId]);

  // Don't render if no notes exist
  if (durationsWithNotes.length === 0) {
    return null;
  }

  return (
    <aside className="fixed left-0 top-14 bottom-0 w-80 bg-white dark:bg-dark-surface border-r border-gray-200 dark:border-dark-border overflow-y-auto hidden lg:block z-10">
      {/* Sticky Header */}
      <div className="sticky top-0 bg-white dark:bg-dark-surface border-b border-gray-200 dark:border-dark-border px-4 py-3 z-20">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <span>📋</span>
          Section Notes ({durationsWithNotes.length})
        </h2>
      </div>

      {/* Notes List */}
      <div className="divide-y divide-gray-100 dark:divide-dark-border">
        {durationsWithNotes.map(duration => {
          const isActive = activeDurationId === duration.id;
          const colorConfig = duration.color ? DURATION_COLORS[duration.color] : null;

          return (
            <div
              key={duration.id}
              id={`sidebar-note-${duration.id}`}
              onClick={() => onDurationSelect(duration.id)}
              className={`
                group relative px-4 py-3 cursor-pointer border-l-4 transition-all duration-150
                ${isActive
                  ? 'bg-amber-50 dark:bg-amber-900/20'
                  : 'border-transparent hover:bg-gray-50 dark:hover:bg-dark-hover'
                }
              `}
              style={isActive && colorConfig ? { borderColor: colorConfig.borderColor } : undefined}
            >
              {/* Time Range */}
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 flex items-center gap-1">
                <span>{formatDuration(Math.floor(duration.start_time))}</span>
                <span className="text-gray-400 dark:text-gray-500">→</span>
                <span>{formatDuration(Math.floor(duration.end_time))}</span>
                <span className="ml-1.5 text-[10px] text-cyan-600 dark:text-cyan-400">
                  ({formatDurationLength(Math.floor(duration.start_time), Math.floor(duration.end_time))})
                </span>
                {colorConfig && (
                  <span
                    className="w-2 h-2 rounded-full ml-1"
                    style={{ backgroundColor: colorConfig.borderColor }}
                  />
                )}
              </div>

              {/* Note Content */}
              <div
                className="text-sm text-gray-700 dark:text-gray-300 notes-content line-clamp-3"
                dangerouslySetInnerHTML={{ __html: duration.note || '' }}
              />
            </div>
          );
        })}
      </div>
    </aside>
  );
}
