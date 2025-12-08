import { useState } from 'react';
import type { Duration, DurationColor } from '../../types';
import { formatDuration } from '../../utils/formatters';
import { DURATION_COLORS, getNextDurationColor } from '../../utils/durationColors';

interface DurationListProps {
  durations: Duration[];
  activeDurationId: number | null;
  onDurationClick: (duration: Duration) => void;
  onDeleteDuration: (id: number) => void;
  onUpdateNote: (id: number, note: string | null) => void;
  onColorChange?: (id: number, color: DurationColor) => void;
}

export default function DurationList({
  durations,
  activeDurationId,
  onDurationClick,
  onDeleteDuration,
  onUpdateNote,
  onColorChange,
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveNote();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
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
                onContextMenu={(e) => handleContextMenu(e, duration)}
                className={`relative overflow-hidden px-3 py-2 rounded-lg text-sm font-medium transition-all
                           flex items-center gap-2
                           ${isActive
                             ? 'bg-primary-600 text-white shadow-md'
                             : 'bg-gray-100 dark:bg-dark-hover text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-border'
                           }`}
              >
                {/* Left color indicator */}
                {colorConfig && (
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg"
                    style={{ backgroundColor: colorConfig.borderColor }}
                  />
                )}
                {isActive && <span className="animate-pulse">🔁</span>}
                <span>{formatDuration(Math.floor(duration.start_time))}</span>
                <span className="text-gray-400 dark:text-gray-500">→</span>
                <span>{formatDuration(Math.floor(duration.end_time))}</span>
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
        Click to loop play • Press Escape to stop
      </p>

      {/* Note display for active duration */}
      {activeDuration && (
        <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-lg">
          {editingNoteId === activeDuration.id ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editNoteText}
                onChange={(e) => setEditNoteText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Add a note..."
                autoFocus
                className="flex-1 px-2 py-1 text-sm rounded border border-amber-300 dark:border-amber-700
                           bg-white dark:bg-dark-bg text-gray-900 dark:text-gray-100
                           focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button
                onClick={handleSaveNote}
                className="px-2 py-1 text-sm bg-amber-500 text-white rounded hover:bg-amber-600"
              >
                Save
              </button>
              <button
                onClick={handleCancelEdit}
                className="px-2 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <span className="text-sm text-amber-700 dark:text-amber-300">
                {activeDuration.note ? (
                  <span>{activeDuration.note}</span>
                ) : (
                  <span className="italic text-amber-500 dark:text-amber-400/70">No note</span>
                )}
              </span>
              <button
                onClick={() => handleStartEditNote(activeDuration)}
                className="ml-auto text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300"
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
