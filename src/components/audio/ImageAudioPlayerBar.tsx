import { useState, useEffect, useCallback } from 'react';
import type React from 'react';
import { useImageAudioPlayer } from '../../context/ImageAudioPlayerContext';
import ThemedAudioPlayer, { type ThemedAudioPlayerHandle } from './ThemedAudioPlayer';
import type { AudioMarkerType } from '../../types';
import { IMAGE_COLORS, IMAGE_COLOR_KEYS } from '../../utils/imageColors';
import { TagModal } from '../common/TagModal';

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
    mediaType,
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

  // Context menu state
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [audioColors, setAudioColors] = useState<string[]>([]);
  const [tagCount, setTagCount] = useState(0);
  const [showTagModal, setShowTagModal] = useState(false);

  // Fetch colors and tag count when audio changes
  useEffect(() => {
    if (!currentAudio || !mediaType) {
      setAudioColors([]);
      setTagCount(0);
      return;
    }
    window.electronAPI.mediaColors.getBatch(mediaType, [currentAudio.id])
      .then((result: Record<number, string[]>) => setAudioColors(result[currentAudio.id] ?? []));
    window.electronAPI.tags.getByMedia(mediaType, currentAudio.id)
      .then((tags: { name: string }[]) => setTagCount(tags.length));
  }, [currentAudio?.id, mediaType]);

  const refreshTagCount = useCallback(() => {
    if (!currentAudio || !mediaType) return;
    window.electronAPI.tags.getByMedia(mediaType, currentAudio.id)
      .then((tags: { name: string }[]) => setTagCount(tags.length));
  }, [currentAudio?.id, mediaType]);

  if (!currentAudio) return null;

  const src = window.electronAPI.paths.getFileUrl(currentAudio.file_path);
  const label = currentAudio.caption || imageLabel;
  const hasMarkers = markers.length > 0;

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

  const openContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowContextMenu(true);
    setDraftCaption(currentAudio.caption ?? '');
  };

  const closeContextMenu = () => {
    setShowContextMenu(false);
  };

  const handleToggleColor = async (colorKey: string) => {
    if (!mediaType) return;
    const updated = await window.electronAPI.mediaColors.toggle(mediaType, currentAudio.id, colorKey);
    setAudioColors(updated);
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
        <div className="relative flex items-center gap-2 min-w-0 flex-shrink-0">
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
            <>
              {/* Color dots */}
              {audioColors.length > 0 && (
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  {audioColors.slice(0, 3).map(key => (
                    <span
                      key={key}
                      className="w-2 h-2 rounded-full flex-shrink-0 inline-block"
                      style={{ backgroundColor: IMAGE_COLORS[key as keyof typeof IMAGE_COLORS]?.hex ?? '#888' }}
                    />
                  ))}
                </div>
              )}
              <span
                className={`text-sm text-blue-300 cursor-pointer ${expanded ? 'max-w-[280px] whitespace-normal break-words' : 'truncate max-w-[200px]'}`}
                title={expanded ? undefined : label}
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(prev => !prev);
                }}
                onContextMenu={openContextMenu}
              >
                {label}
              </span>
              {tagCount > 0 && (
                <span className="text-[9px] bg-orange-500/80 text-white rounded-full px-1.5 leading-none flex-shrink-0 py-0.5">
                  {tagCount}
                </span>
              )}
            </>
          )}

          {/* Right-click context menu popup */}
          {showContextMenu && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-[69]"
                onClick={closeContextMenu}
                onContextMenu={(e) => { e.preventDefault(); closeContextMenu(); }}
              />
              <div
                className="absolute bottom-full mb-2 left-0 z-[70] bg-gray-900 border border-white/20 rounded-xl shadow-2xl p-3 w-56"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => { if (e.key === 'Escape') closeContextMenu(); }}
              >
                {/* Caption */}
                {canEditCaption && (
                  <>
                    <p className="text-white/40 text-[10px] mb-1.5">Caption</p>
                    <textarea
                      autoFocus
                      value={draftCaption}
                      onChange={(e) => setDraftCaption(e.target.value)}
                      onBlur={async () => {
                        const trimmed = draftCaption.trim() || null;
                        await updateCurrentAudioCaption(trimmed);
                      }}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void updateCurrentAudioCaption(draftCaption.trim() || null).then(closeContextMenu);
                        } else if (e.key === 'Escape') {
                          closeContextMenu();
                        }
                      }}
                      rows={2}
                      className="w-full text-xs bg-black/60 text-white/90 rounded-lg px-2 py-1.5 border border-white/20 focus:outline-none focus:border-white/50 resize-none mb-3"
                      placeholder="Add caption…"
                    />
                  </>
                )}

                {/* Colors */}
                {mediaType && (
                  <>
                    <p className="text-white/40 text-[10px] mb-1.5">Color</p>
                    <div className="grid grid-cols-5 gap-1 mb-3">
                      {IMAGE_COLOR_KEYS.map(key => {
                        const isActive = audioColors.includes(key);
                        return (
                          <button
                            key={key}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              void handleToggleColor(key);
                            }}
                            className="w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-110 relative"
                            style={{ backgroundColor: IMAGE_COLORS[key].hex }}
                            title={IMAGE_COLORS[key].label}
                          >
                            {isActive && (
                              <span className="text-white text-[10px] font-bold drop-shadow">✓</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* Tags */}
                {mediaType && (
                  <div className="border-t border-white/10 pt-2">
                    <button
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setShowTagModal(true);
                        closeContextMenu();
                      }}
                      className="text-white/60 hover:text-white text-[10px] w-full text-left"
                    >
                      🏷️ Tags{tagCount > 0 ? ` (${tagCount})` : ''}
                    </button>
                  </div>
                )}
              </div>
            </>
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

      {/* Tag modal */}
      {showTagModal && mediaType && (
        <TagModal
          mediaType={mediaType}
          mediaId={currentAudio.id}
          title={label}
          onClose={() => {
            setShowTagModal(false);
            refreshTagCount();
          }}
        />
      )}
    </div>
  );
}
