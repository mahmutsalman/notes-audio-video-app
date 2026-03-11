import { useState } from 'react';
import { useImageAudioPlayer } from '../../context/ImageAudioPlayerContext';
import ThemedAudioPlayer from './ThemedAudioPlayer';

export default function ImageAudioPlayerBar() {
  const {
    currentAudio,
    imageLabel,
    canEditCaption,
    updateCurrentAudioCaption,
    dismiss,
  } = useImageAudioPlayer();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftCaption, setDraftCaption] = useState('');

  if (!currentAudio) return null;

  const src = window.electronAPI.paths.getFileUrl(currentAudio.file_path);
  const label = currentAudio.caption || imageLabel;

  const startEditing = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canEditCaption) return;
    setDraftCaption(currentAudio.caption ?? '');
    setEditing(true);
    setExpanded(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setDraftCaption('');
  };

  const saveCaption = async () => {
    await updateCurrentAudioCaption(draftCaption.trim() || null);
    cancelEditing();
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-gray-900 dark:bg-gray-950 border-t border-blue-700/50 shadow-2xl">
      <div className="flex items-center gap-3 px-4 py-2 max-w-screen-2xl mx-auto">
        {/* Icon + label */}
        <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
          <span className="text-blue-400 text-base">🔊</span>
          {editing ? (
            <textarea
              autoFocus
              value={draftCaption}
              onChange={(e) => setDraftCaption(e.target.value)}
              onBlur={() => { void saveCaption(); }}
              onClick={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.preventDefault()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void saveCaption();
                } else if (e.key === 'Escape') {
                  cancelEditing();
                }
              }}
              rows={2}
              className="w-[200px] text-sm bg-blue-950/70 text-blue-100 rounded px-2 py-1 border border-blue-500/60 focus:outline-none focus:border-blue-300 resize-none italic"
              placeholder="Add caption..."
            />
          ) : (
            <span
              className={`text-sm text-blue-300 cursor-pointer ${expanded ? 'max-w-[280px] whitespace-normal break-words' : 'truncate max-w-[200px]'}`}
              title={expanded ? undefined : label}
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(prev => !prev);
              }}
              onContextMenu={startEditing}
            >
              {label}
            </span>
          )}
        </div>

        {/* Player */}
        <div className="flex-1 min-w-0">
          <ThemedAudioPlayer src={src} theme="blue" />
        </div>

        {/* Dismiss */}
        <button
          onClick={dismiss}
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full
                     bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white
                     transition-colors text-xs"
          title="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
