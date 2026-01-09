import { useState } from 'react';
import type { Duration, DurationColor, DurationImage, DurationVideo } from '../../types';
import { formatDuration, formatDurationLength } from '../../utils/formatters';
import { DURATION_COLORS, getNextDurationColor } from '../../utils/durationColors';
import { getGroupColorConfig } from '../../utils/durationGroupColors';
import NotesEditor from '../common/NotesEditor';

interface DurationListProps {
  durations: Duration[];
  activeDurationId: number | null;
  onDurationClick: (duration: Duration) => void;
  onDeleteDuration: (id: number) => void;
  onUpdateNote: (id: number, note: string | null) => void;
  onColorChange?: (id: number, color: DurationColor) => void;
  // Duration images support
  durationImagesCache?: Record<number, DurationImage[]>;
  // Duration videos support
  durationVideosCache?: Record<number, DurationVideo[]>;
  // Disable duration buttons while audio is loading
  disabled?: boolean;
}

export default function DurationList({
  durations,
  activeDurationId,
  onDurationClick,
  onDeleteDuration,
  onUpdateNote,
  onColorChange,
  durationImagesCache,
  durationVideosCache,
  disabled = false,
}: DurationListProps) {
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editNoteText, setEditNoteText] = useState('');

  const handleStartEditNote = (duration: Duration) => {
    setEditingNoteId(duration.id);
    setEditNoteText(duration.note || '');
  };

  const handleSaveNote = async () => {
    if (editingNoteId !== null) {
      await onUpdateNote(editingNoteId, editNoteText.trim() || null);
      setEditingNoteId(null);
      setEditNoteText('');
    }
  };

  const handleCancelEdit = () => {
    setEditingNoteId(null);
    setEditNoteText('');
  };

  const handleContextMenu = (e: React.MouseEvent, duration: Duration) => {
    e.preventDefault();
    if (onColorChange) {
      const nextColor = getNextDurationColor(duration.color);
      onColorChange(duration.id, nextColor);
    }
  };

  if (durations.length === 0) return null;

  const activeDuration = durations.find(d => d.id === activeDurationId);

  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
        <span>🔖</span>
        Marked Sections ({durations.length})
      </h2>
      <div className="flex flex-wrap gap-2">
        {durations.map((duration) => {
          const isActive = activeDurationId === duration.id;
          const colorConfig = duration.color ? DURATION_COLORS[duration.color] : null;
          const groupColorConfig = getGroupColorConfig(duration.group_color);
          if (import.meta.env.DEV && duration.group_color) {
            // eslint-disable-next-line no-console
            console.debug('[DurationList] Duration group color:', {
              id: duration.id,
              group_color: duration.group_color,
              groupColorConfig,
            });
          }
          const imageCount = durationImagesCache?.[duration.id]?.length || 0;
          const videoCount = durationVideosCache?.[duration.id]?.length || 0;
          return (
            <div
              key={duration.id}
              className="group relative"
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!disabled) {
                    onDurationClick(duration);
                  }
                }}
                onContextMenu={(e) => handleContextMenu(e, duration)}
                disabled={disabled}
                className={`relative overflow-hidden px-3 py-2 rounded-lg text-sm font-medium transition-all
                           flex items-center gap-2
                           ${disabled
                             ? 'opacity-50 cursor-wait bg-gray-100 dark:bg-dark-hover text-gray-500 dark:text-gray-500'
                             : isActive
                               ? 'bg-primary-600 text-white shadow-md'
                               : 'bg-gray-100 dark:bg-dark-hover text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-border'
                           }`}
                title={disabled ? 'Loading audio...' : undefined}
              >
                {/* Top group color bar */}
                {groupColorConfig && (
                  <div
                    className="absolute top-0 left-0 right-0 h-px rounded-t-lg"
                    style={{ backgroundColor: groupColorConfig.color }}
                  />
                )}
                {/* Left color indicator */}
                {colorConfig && (
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg"
                    style={{ backgroundColor: colorConfig.borderColor }}
                  />
                )}
                {isActive && <span className="animate-pulse">🔁</span>}
                <span className="text-xs font-medium">
                  {formatDuration(Math.floor(duration.start_time))}
                  <span className={`mx-1 ${isActive ? 'text-white/60' : 'text-gray-400 dark:text-gray-500'}`}>→</span>
                  {formatDuration(Math.floor(duration.end_time))}
                  <span className={`ml-1.5 text-[10px] font-normal ${isActive ? 'text-cyan-100' : 'text-cyan-600 dark:text-cyan-400'}`}>
                    ({formatDurationLength(Math.floor(duration.start_time), Math.floor(duration.end_time))})
                  </span>
                </span>
                {/* Image indicator */}
                {imageCount > 0 && (
                  <span className={`text-xs ${isActive ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'}`}>
                    📷{imageCount > 1 && imageCount}
                  </span>
                )}
                {/* Video indicator */}
                {videoCount > 0 && (
                  <span className={`text-xs ${isActive ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'}`}>
                    🎬{videoCount > 1 && videoCount}
                  </span>
                )}
                {/* Right color indicator */}
                {colorConfig && (
                  <div
                    className="absolute right-0 top-0 bottom-0 w-1 rounded-r-lg"
                    style={{ backgroundColor: colorConfig.borderColor }}
                  />
                )}
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
        {disabled ? (
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            Loading audio...
          </span>
        ) : (
          'Click to loop play • Press Escape to stop'
        )}
      </p>

      {/* Note display for active duration */}
      {activeDuration && (
        <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-lg">
          {editingNoteId === activeDuration.id ? (
            <div className="space-y-3">
              <div className="duration-note-editor">
                <NotesEditor
                  value={editNoteText}
                  onChange={setEditNoteText}
                  placeholder="Add a note..."
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={handleCancelEdit}
                  className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveNote}
                  className="px-3 py-1.5 text-sm bg-amber-500 text-white rounded hover:bg-amber-600"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <div className="flex-1 text-sm text-amber-700 dark:text-amber-300">
                {activeDuration.note ? (
                  <div
                    className="notes-content duration-note-content"
                    dangerouslySetInnerHTML={{ __html: activeDuration.note }}
                  />
                ) : (
                  <span className="italic text-amber-500 dark:text-amber-400/70">No note</span>
                )}
              </div>
              <button
                onClick={() => handleStartEditNote(activeDuration)}
                className="flex-shrink-0 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300"
              >
                ✏️ {activeDuration.note ? 'Edit' : 'Add note'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
