import { useState } from 'react';
import type { Duration, DurationColor, DurationGroupColor, DurationImage, DurationVideo } from '../../types';
import { DURATION_COLORS, getNextDurationColor } from '../../utils/durationColors';
import { getGroupColorConfig, getNextGroupColorWithNull } from '../../utils/durationGroupColors';
import { formatMarkLabel } from '../../utils/marks';
import NotesEditor from '../common/NotesEditor';

interface MarkListProps {
  durations: Duration[];
  activeDurationId: number | null;
  onMarkClick: (duration: Duration) => void;
  onDeleteMark: (id: number) => void;
  onAddMark: () => void;
  onUpdateNote: (id: number, note: string | null) => void;
  onColorChange?: (id: number, color: DurationColor) => void;
  onGroupColorChange?: (id: number, groupColor: DurationGroupColor) => void;
  // Duration images support
  durationImagesCache?: Record<number, DurationImage[]>;
  // Duration videos support
  durationVideosCache?: Record<number, DurationVideo[]>;
  // Loading state
  isAddingMark?: boolean;
}

export default function MarkList({
  durations,
  activeDurationId,
  onMarkClick,
  onDeleteMark,
  onAddMark,
  onUpdateNote,
  onColorChange,
  onGroupColorChange,
  durationImagesCache,
  durationVideosCache,
  isAddingMark = false,
}: MarkListProps) {
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
    if (e.shiftKey && onGroupColorChange) {
      // Shift+Right-click: cycle group colors (top bar)
      const nextGroupColor = getNextGroupColorWithNull(duration.group_color);
      onGroupColorChange(duration.id, nextGroupColor);
    } else if (onColorChange) {
      // Regular right-click: cycle side colors
      const nextColor = getNextDurationColor(duration.color);
      onColorChange(duration.id, nextColor);
    }
  };

  const activeDuration = durations.find(d => d.id === activeDurationId);

  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
        <span>📝</span>
        Marks ({durations.length})
      </h2>
      <div className="flex flex-wrap gap-2">
        {durations.map((duration) => {
          const isActive = activeDurationId === duration.id;
          const colorConfig = duration.color ? DURATION_COLORS[duration.color] : null;
          const groupColorConfig = getGroupColorConfig(duration.group_color);
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
                  onMarkClick(duration);
                }}
                onContextMenu={(e) => handleContextMenu(e, duration)}
                className={`relative overflow-hidden px-3 py-2 rounded-lg text-sm font-medium transition-colors
                           flex items-center gap-2
                           ${isActive
                             ? 'bg-teal-600 text-white'
                             : 'bg-gray-100 dark:bg-dark-hover text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-border'
                           }`}
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
                <span className="text-xs font-medium">
                  {formatMarkLabel(duration)}
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
                {/* Note indicator */}
                {duration.note && (
                  <span className={`text-xs ${isActive ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'}`}>
                    📄
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
                  onDeleteMark(duration.id);
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

        {/* Add Mark button */}
        <button
          onClick={onAddMark}
          disabled={isAddingMark}
          className="px-3 py-2 rounded-lg text-sm font-medium transition-colors
                     bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300
                     hover:bg-teal-200 dark:hover:bg-teal-900/50
                     disabled:opacity-50 disabled:cursor-not-allowed
                     flex items-center gap-1"
        >
          {isAddingMark ? (
            <span className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <span>+</span>
              <span>Add Mark</span>
            </>
          )}
        </button>
      </div>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        Click to select • Right-click: priority • Shift+Right-click: group
      </p>

      {/* Note display for active mark */}
      {activeDuration && (
        <div className="mt-3 p-3 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800/50 rounded-lg">
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
                  className="px-3 py-1.5 text-sm bg-teal-500 text-white rounded hover:bg-teal-600"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <div className="flex-1 text-sm text-teal-700 dark:text-teal-300">
                {activeDuration.note ? (
                  <div
                    className="notes-content duration-note-content"
                    dangerouslySetInnerHTML={{ __html: activeDuration.note }}
                  />
                ) : (
                  <span className="italic text-teal-500 dark:text-teal-400/70">No note</span>
                )}
              </div>
              <button
                onClick={() => handleStartEditNote(activeDuration)}
                className="flex-shrink-0 text-xs text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300"
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
