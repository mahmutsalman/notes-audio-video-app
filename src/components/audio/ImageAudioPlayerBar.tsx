import { useState } from 'react';
import type React from 'react';
import { useImageAudioPlayer } from '../../context/ImageAudioPlayerContext';
import ThemedAudioPlayer, { type ThemedAudioPlayerHandle } from './ThemedAudioPlayer';
import type { AudioMarkerType } from '../../types';

const MARKER_CONFIGS: { type: AudioMarkerType; icon: string; label: string; color: string; badgeColor: string }[] = [
  { type: 'important', icon: '❗', label: 'Important', color: 'text-red-400 hover:bg-red-900/40', badgeColor: 'text-red-300 bg-red-900/30 border-red-800/40' },
  { type: 'question', icon: '❓', label: 'Question', color: 'text-blue-400 hover:bg-blue-900/40', badgeColor: 'text-blue-300 bg-blue-900/30 border-blue-800/40' },
  { type: 'similar_question', icon: '↔', label: 'Similar Q', color: 'text-purple-400 hover:bg-purple-900/40', badgeColor: 'text-purple-300 bg-purple-900/30 border-purple-800/40' },
];

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function ImageAudioPlayerBar() {
  const {
    currentAudio,
    imageLabel,
    markers,
    canEditCaption,
    playerRef,
    updateCurrentAudioCaption,
    updateMarkerCaption,
    seekToNextMarker,
    dismiss,
  } = useImageAudioPlayer();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftCaption, setDraftCaption] = useState('');
  const [showMarkerPanel, setShowMarkerPanel] = useState(false);
  const [editingMarkerId, setEditingMarkerId] = useState<number | null>(null);
  const [markerCaptionDraft, setMarkerCaptionDraft] = useState('');

  if (!currentAudio) return null;

  const src = window.electronAPI.paths.getFileUrl(currentAudio.file_path);
  const label = currentAudio.caption || imageLabel;
  const hasMarkers = markers.length > 0;

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

  const startEditingMarker = (markerId: number, currentCaption: string | null) => {
    setEditingMarkerId(markerId);
    setMarkerCaptionDraft(currentCaption ?? '');
  };

  const cancelEditingMarker = () => {
    setEditingMarkerId(null);
    setMarkerCaptionDraft('');
  };

  const saveMarkerCaption = async (markerId: number) => {
    await updateMarkerCaption(markerId, markerCaptionDraft.trim() || null);
    cancelEditingMarker();
  };

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
    <div className="fixed bottom-0 left-0 right-0 z-[60] bg-gray-900 dark:bg-gray-950 border-t border-blue-700/50 shadow-2xl">
      {/* Expanded marker panel */}
      {showMarkerPanel && hasMarkers && (
        <div className="border-b border-blue-800/40 max-h-[220px] overflow-y-auto">
          <div className="px-4 py-2 max-w-screen-2xl mx-auto space-y-2">
            {MARKER_CONFIGS.map(({ type, icon, label: typeLabel, badgeColor }) => {
              const ofType = markers.filter(m => m.marker_type === type);
              if (ofType.length === 0) return null;
              return (
                <div key={type}>
                  <div className={`text-[11px] font-semibold mb-1 ${badgeColor.split(' ')[0]}`}>
                    {icon} {typeLabel} ({ofType.length})
                  </div>
                  <div className="space-y-1 pl-2">
                    {ofType.map(marker => (
                      <div key={marker.id} className="flex items-start gap-2">
                        {/* Time range — clickable to seek */}
                        <button
                          onClick={() => playerRef.current?.seekTo(marker.start_time)}
                          className="text-[10px] text-gray-400 hover:text-blue-300 font-mono flex-shrink-0 mt-0.5 transition-colors"
                          title="Seek to this position"
                        >
                          {formatTime(marker.start_time)}{marker.end_time != null ? `–${formatTime(marker.end_time)}` : ''}
                        </button>
                        {/* Caption area */}
                        {editingMarkerId === marker.id ? (
                          <textarea
                            autoFocus
                            value={markerCaptionDraft}
                            onChange={(e) => setMarkerCaptionDraft(e.target.value)}
                            onBlur={() => { void saveMarkerCaption(marker.id); }}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              e.stopPropagation();
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                void saveMarkerCaption(marker.id);
                              } else if (e.key === 'Escape') {
                                cancelEditingMarker();
                              }
                            }}
                            rows={2}
                            className="flex-1 text-xs bg-gray-800 text-gray-100 rounded px-2 py-1 border border-blue-500/60 focus:outline-none focus:border-blue-300 resize-none italic"
                            placeholder="Add caption..."
                          />
                        ) : (
                          <span
                            className="flex-1 text-xs text-gray-300 italic cursor-pointer hover:text-white transition-colors"
                            onClick={() => startEditingMarker(marker.id, marker.caption)}
                            title="Click to add/edit caption"
                          >
                            {marker.caption || <span className="text-gray-600 not-italic">click to add caption...</span>}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Compact bar */}
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

        {/* Marker badge chips + expand toggle */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {MARKER_CONFIGS.map(({ type, icon, label: markerLabel, color }) => {
            const count = markers.filter(m => m.marker_type === type).length;
            if (count === 0) return null;
            return (
              <button
                key={type}
                onClick={() => seekToNextMarker(type)}
                className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium bg-gray-800 ${color} border border-gray-700 transition-colors`}
                title={`Seek to next ${markerLabel} (${count})`}
              >
                <span>{icon}</span>
                <span>{count}</span>
              </button>
            );
          })}
          {hasMarkers && (
            <button
              onClick={() => setShowMarkerPanel(prev => !prev)}
              className={`w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors text-[10px] ${showMarkerPanel ? 'bg-gray-700 text-white' : ''}`}
              title={showMarkerPanel ? 'Hide marker details' : 'Show marker details'}
            >
              {showMarkerPanel ? '▼' : '▲'}
            </button>
          )}
        </div>

        {/* Player */}
        <div className="flex-1 min-w-0">
          <ThemedAudioPlayer ref={playerRef as React.RefObject<ThemedAudioPlayerHandle>} src={src} theme="blue" />
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
