import { useEffect } from 'react';
import type { Duration } from '../../types';
import { formatDuration, formatDurationLength } from '../../utils/formatters';
import { DURATION_COLORS } from '../../utils/durationColors';
import { getGroupColorConfig } from '../../utils/durationGroupColors';
import { useIsActiveTab } from '../../context/TabsContext';

interface DurationNotesSidebarProps {
  durations: Duration[];
  activeDurationId: number | null;
  onDurationSelect: (durationId: number) => void;
  isWrittenNote?: boolean;
  videoMode?: boolean;
  onExitVideoMode?: () => void;
}

export default function DurationNotesSidebar({
  durations,
  activeDurationId,
  onDurationSelect,
  isWrittenNote = false,
  videoMode = false,
  onExitVideoMode,
}: DurationNotesSidebarProps) {
  const isActiveTab = useIsActiveTab();

  // In video mode show all marks; otherwise only those with notes
  const durationsWithNotes = videoMode ? durations : durations.filter(d => d.note && d.note.trim() !== '');

  // Auto-scroll to active note when activeDurationId changes
  useEffect(() => {
    if (activeDurationId !== null) {
      const element = document.getElementById(`sidebar-note-${activeDurationId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [activeDurationId]);

  // Don't render when tab is hidden (prevents position:fixed leak)
  if (!isActiveTab) return null;

  // Don't render if nothing to show
  if (durationsWithNotes.length === 0) {
    if (!videoMode) return null;
    // In video mode with no marks, show an empty state
    return (
      <aside className="fixed left-0 top-20 bottom-0 w-80 bg-white dark:bg-dark-surface border-r border-gray-200 dark:border-dark-border overflow-y-auto hidden lg:block z-10">
        <div className="sticky top-0 bg-white dark:bg-dark-surface border-b border-gray-200 dark:border-dark-border px-4 py-3 z-20">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <button onClick={onExitVideoMode} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mr-1">←</button>
            <span>🎬</span>
            Video Marks (0)
          </h2>
        </div>
        <p className="text-xs text-gray-400 italic p-4">No marks assigned to this video</p>
      </aside>
    );
  }

  return (
    <aside className="fixed left-0 top-20 bottom-0 w-80 bg-white dark:bg-dark-surface border-r border-gray-200 dark:border-dark-border overflow-y-auto hidden lg:block z-10">
      {/* Sticky Header */}
      <div className="sticky top-0 bg-white dark:bg-dark-surface border-b border-gray-200 dark:border-dark-border px-4 py-3 z-20">
        {videoMode ? (
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <button
              onClick={onExitVideoMode}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mr-1"
              title="Back to notes"
            >
              ←
            </button>
            <span>🎬</span>
            Video Marks ({durationsWithNotes.length})
          </h2>
        ) : (
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <span>📋</span>
            Section Notes ({durationsWithNotes.length})
          </h2>
        )}
      </div>

      {/* Notes List */}
      <div className="divide-y divide-gray-100 dark:divide-dark-border">
        {durationsWithNotes.map(duration => {
          const isActive = activeDurationId === duration.id;
          const colorConfig = duration.color ? DURATION_COLORS[duration.color] : null;
          const groupColorConfig = getGroupColorConfig(duration.group_color);

          return (
            <div
              key={duration.id}
              id={`sidebar-note-${duration.id}`}
              onClick={() => onDurationSelect(duration.id)}
              className={`
                group relative px-4 py-3 cursor-pointer border-l-4 border-gray-300 dark:border-gray-600 transition-all duration-150
                ${isActive
                  ? 'bg-gray-100 dark:bg-gray-800/50'
                  : 'hover:bg-gray-50 dark:hover:bg-dark-hover'
                }
              `}
              style={colorConfig ? { borderColor: colorConfig.borderColor } : undefined}
            >
              {/* Time Range / Mark Label with Group Color Left Line */}
              <div
                className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 flex items-center gap-1 w-fit px-2 py-1 rounded-l-md border-l-2 border-gray-400 dark:border-gray-500"
                style={groupColorConfig ? { borderColor: groupColorConfig.color } : undefined}
              >
                {isWrittenNote ? (
                  <span className="text-teal-600 dark:text-teal-400 font-medium">
                    Mark {durations.indexOf(duration) + 1}
                  </span>
                ) : (
                  <>
                    <span>{formatDuration(Math.floor(duration.start_time))}</span>
                    <span className="text-gray-400 dark:text-gray-500">→</span>
                    <span>{formatDuration(Math.floor(duration.end_time))}</span>
                    <span className="ml-1.5 text-[10px] text-cyan-600 dark:text-cyan-400">
                      ({formatDurationLength(Math.floor(duration.start_time), Math.floor(duration.end_time))})
                    </span>
                  </>
                )}
                {colorConfig && (
                  <span
                    className="w-2 h-2 rounded-full ml-1"
                    style={{ backgroundColor: colorConfig.borderColor }}
                  />
                )}
              </div>

              {/* Note Content */}
              {videoMode ? (
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  {duration.note && duration.note.trim()
                    ? <span dangerouslySetInnerHTML={{ __html: duration.note }} className="notes-content line-clamp-2" />
                    : <span className="italic text-gray-400">No caption</span>
                  }
                </div>
              ) : (
                <div
                  className="text-sm text-gray-700 dark:text-gray-300 notes-content line-clamp-3"
                  dangerouslySetInnerHTML={{ __html: duration.note || '' }}
                />
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
