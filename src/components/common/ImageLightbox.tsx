import { useState, useEffect, useRef, useCallback } from 'react';
import type { AnyImageAudio, MediaTagType } from '../../types';
import { useAudioRecording } from '../../context/AudioRecordingContext';
import WaveformVisualizer from '../audio/WaveformVisualizer';
import { formatDuration } from '../../utils/formatters';
import { TagModal } from './TagModal';

interface LightboxImage {
  file_path: string;
  caption: string | null;
  id?: number;
}

interface ImageLightboxProps {
  images: LightboxImage[];
  selectedIndex: number;
  onClose: () => void;
  onNavigate: (newIndex: number) => void;
  // Optional audio feature props
  imageAudiosMap?: Record<number, DurationImageAudio[]>;
  onRecordForImage?: (imageId: number) => void;
  onDeleteImageAudio?: (audioId: number, imageId: number) => void;
  onPlayImageAudio?: (audio: DurationImageAudio, imageLabel: string) => void;
  onUpdateImageAudioCaption?: (audioId: number, imageId: number, caption: string | null) => Promise<void>;
  // Replace feature
  onReplaceWithClipboard?: () => void;
  // Caption editing
  onEditCaption?: () => void;
  // Delete current image
  onDelete?: () => void;
  // Tag editing
  mediaType?: MediaTagType;
}

function fmtSecs(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function AudioCaptionText({ caption, onEdit }: { caption: string | null; onEdit: () => void }) {
  const [expanded, setExpanded] = useState(false);
  if (!caption) {
    return (
      <span
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onEdit(); }}
        className="text-xs text-white/30 italic cursor-text hover:text-white/50 transition-colors"
      >
        add caption…
      </span>
    );
  }
  return (
    <p
      onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onEdit(); }}
      title="Click to expand · Right-click to edit"
      className={`text-xs text-white/70 italic cursor-pointer text-center max-w-[160px] leading-tight ${expanded ? '' : 'line-clamp-2'}`}
    >
      {caption}
    </p>
  );
}

export default function ImageLightbox({
  images,
  selectedIndex,
  onClose,
  onNavigate,
  imageAudiosMap,
  onRecordForImage,
  onDeleteImageAudio,
  onPlayImageAudio,
  onUpdateImageAudioCaption,
  onReplaceWithClipboard,
  onEditCaption,
  onDelete,
  mediaType,
}: ImageLightboxProps) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [showZoomIndicator, setShowZoomIndicator] = useState(false);
  const [imageContextMenu, setImageContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [pendingDeleteAudio, setPendingDeleteAudio] = useState<{ audioId: number; imageId: number; index: number } | null>(null);
  const [editingAudioCaptionId, setEditingAudioCaptionId] = useState<number | null>(null);
  const [audioCaptionText, setAudioCaptionText] = useState('');
  const [showTagModal, setShowTagModal] = useState(false);

  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const hasDragged = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const translateAtDragStart = useRef({ x: 0, y: 0 });
  const zoomIndicatorTimeout = useRef<ReturnType<typeof setTimeout>>();
  const scaleRef = useRef(1);

  // Audio recording context — for embedded recording bar
  const {
    isRecording,
    isPaused,
    duration: recDuration,
    analyserNode,
    target: recTarget,
    isSaving,
    pauseRecording,
    resumeRecording,
    stopAndSave,
    cancelRecording,
  } = useAudioRecording();

  // Only show embedded bars when lightbox is in "image audio" mode
  const imageAudioMode = onRecordForImage !== undefined;
  const showRecordingBar = imageAudioMode && (isRecording || isSaving) &&
    (recTarget?.type === 'duration_image' || recTarget?.type === 'recording_image');

  const image = images[selectedIndex];
  const currentImageAudios = (image?.id && imageAudiosMap) ? (imageAudiosMap[image.id] ?? []) : [];

  const saveAudioCaption = async (audioId: number, imageId: number) => {
    const trimmed = audioCaptionText.trim() || null;
    await onUpdateImageAudioCaption?.(audioId, imageId, trimmed);
    setEditingAudioCaptionId(null);
    setAudioCaptionText('');
  };

  // Keep scaleRef in sync with scale state
  useEffect(() => { scaleRef.current = scale; }, [scale]);

  // Clamp translate so the image edge can't move past the container edge
  const clampTranslate = useCallback((t: { x: number; y: number }, currentScale: number) => {
    const img = imageRef.current;
    const container = containerRef.current;
    if (!img || !container) return t;

    const baseW = img.offsetWidth;
    const baseH = img.offsetHeight;
    const containerW = container.clientWidth;
    const containerH = container.clientHeight;

    const maxPanX = Math.max(0, (baseW * currentScale - containerW) / 2);
    const maxPanY = Math.max(0, (baseH * currentScale - containerH) / 2);

    return {
      x: Math.max(-maxPanX, Math.min(maxPanX, t.x)),
      y: Math.max(-maxPanY, Math.min(maxPanY, t.y)),
    };
  }, []);

  // Reset zoom on navigation
  useEffect(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
    setShowTagModal(false);
  }, [selectedIndex]);

  // Show zoom indicator briefly
  const flashZoomIndicator = useCallback(() => {
    setShowZoomIndicator(true);
    if (zoomIndicatorTimeout.current) clearTimeout(zoomIndicatorTimeout.current);
    zoomIndicatorTimeout.current = setTimeout(() => setShowZoomIndicator(false), 1500);
  }, []);

  // Cleanup zoom indicator timeout
  useEffect(() => {
    return () => {
      if (zoomIndicatorTimeout.current) clearTimeout(zoomIndicatorTimeout.current);
    };
  }, []);

  // Wheel handler for pinch-to-zoom and Cmd+scroll
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();

      const img = imageRef.current;
      if (!img) return;

      const rect = img.getBoundingClientRect();
      const cursorX = e.clientX - (rect.left + rect.width / 2);
      const cursorY = e.clientY - (rect.top + rect.height / 2);

      const zoomFactor = 1 - e.deltaY * 0.01;

      setScale(prev => {
        const newScale = Math.min(5, Math.max(1, prev * zoomFactor));
        const ratio = newScale / prev;

        if (newScale === 1) {
          setTranslate({ x: 0, y: 0 });
        } else {
          setTranslate(t => {
            const raw = {
              x: cursorX - ratio * (cursorX - t.x),
              y: cursorY - ratio * (cursorY - t.y),
            };
            return clampTranslate(raw, newScale);
          });
        }

        if (newScale !== prev) flashZoomIndicator();
        return newScale;
      });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [flashZoomIndicator, clampTranslate]);

  // Drag to pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (scale <= 1) return;
    e.preventDefault();
    isDragging.current = true;
    hasDragged.current = false;
    dragStart.current = { x: e.clientX, y: e.clientY };
    translateAtDragStart.current = { ...translate };
    document.body.style.cursor = 'grabbing';
  }, [scale, translate]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        hasDragged.current = true;
      }
      const raw = {
        x: translateAtDragStart.current.x + dx,
        y: translateAtDragStart.current.y + dy,
      };
      setTranslate(clampTranslate(raw, scaleRef.current));
    };

    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [clampTranslate]);

  // Double-click to reset zoom
  const handleDoubleClick = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (imageContextMenu) {
        if (e.key === 'Escape') setImageContextMenu(null);
        return;
      }
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft' && selectedIndex > 0) {
        onNavigate(selectedIndex - 1);
      } else if (e.key === 'ArrowRight' && selectedIndex < images.length - 1) {
        onNavigate(selectedIndex + 1);
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, images.length, onNavigate, onClose, imageContextMenu]);

  // Backdrop click: close at 1x, reset zoom at >1x, or dismiss context menu
  const handleBackdropClick = useCallback(() => {
    if (imageContextMenu) {
      setImageContextMenu(null);
      return;
    }
    if (scale > 1) {
      setScale(1);
      setTranslate({ x: 0, y: 0 });
    } else {
      onClose();
    }
  }, [scale, onClose, imageContextMenu]);

  // Image click: stop propagation only if not dragging
  const handleImageClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (imageContextMenu) {
      setImageContextMenu(null);
      return;
    }
    if (hasDragged.current) {
      hasDragged.current = false;
    }
  }, [imageContextMenu]);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">

      {/* ── Image area (shrinks when bottom bars appear) ── */}
      <div
        ref={containerRef}
        className="flex-1 relative flex items-center justify-center overflow-hidden px-16 py-4"
        onClick={handleBackdropClick}
      >
        {/* Close button */}
        <button
          className="absolute top-4 right-4 text-white text-2xl hover:text-gray-300 z-10"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
        >
          ×
        </button>

        {/* Mic button — record audio for this image */}
        {onRecordForImage && image?.id && (
          <button
            className="absolute top-4 right-12 text-white/70 hover:text-red-400 z-10 p-1 transition-colors"
            onClick={(e) => { e.stopPropagation(); onRecordForImage(image.id!); }}
            title="Record audio for this image"
          >
            🎙️
          </button>
        )}

        {/* Image counter */}
        <div className="absolute top-3 left-20 bg-black/50 text-white text-sm font-medium z-10 px-2 py-0.5 rounded tabular-nums">
          {selectedIndex + 1}/{images.length}
        </div>

        {/* Zoom indicator */}
        {showZoomIndicator && scale !== 1 && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-black/70 text-white px-3 py-1 rounded-full text-sm font-medium z-10">
            {Math.round(scale * 100)}%
          </div>
        )}

        {/* Previous button */}
        {selectedIndex > 0 && (
          <button
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white text-5xl
                       hover:text-gray-300 transition-colors px-2 z-10"
            onClick={(e) => { e.stopPropagation(); onNavigate(selectedIndex - 1); }}
          >
            ‹
          </button>
        )}

        {/* Image */}
        <img
          ref={imageRef}
          src={window.electronAPI.paths.getFileUrl(image.file_path)}
          alt=""
          className="max-w-full max-h-full object-contain"
          style={{
            transform: `scale(${scale}) translate(${translate.x / scale}px, ${translate.y / scale}px)`,
            transformOrigin: 'center center',
            cursor: scale > 1 ? (isDragging.current ? 'grabbing' : 'grab') : 'default',
            transition: isDragging.current ? 'none' : 'transform 0.1s ease-out',
            userSelect: 'none',
          }}
          draggable={false}
          onClick={handleImageClick}
          onMouseDown={handleMouseDown}
          onDoubleClick={handleDoubleClick}
          onContextMenu={(onReplaceWithClipboard || onEditCaption || onDelete || mediaType) ? (e) => {
            e.preventDefault();
            e.stopPropagation();
            setImageContextMenu({ x: e.clientX, y: e.clientY });
          } : undefined}
        />

        {/* Audio buttons + caption — anchored to bottom of image area */}
        <div className="absolute bottom-4 left-0 right-0 flex flex-col items-center gap-2 px-4 pointer-events-none">
          {currentImageAudios.length > 0 && (
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 pointer-events-auto">
              {currentImageAudios.map((audio, i) => (
                <div key={audio.id} className="flex flex-col items-center gap-0.5">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const label = image.caption || `Image ${selectedIndex + 1}`;
                        onPlayImageAudio?.(audio, label);
                      }}
                      className="bg-white/20 hover:bg-white/30 text-white rounded-full px-3 py-1 text-xs flex items-center gap-1 transition-colors"
                    >
                      🔊 {i + 1}{audio.duration ? ` (${fmtSecs(audio.duration)})` : ''}
                    </button>
                    {onDeleteImageAudio && image?.id && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPendingDeleteAudio({ audioId: audio.id, imageId: image.id!, index: i });
                        }}
                        className="text-white/40 hover:text-red-400 text-xs transition-colors"
                        title="Delete audio"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  {/* Per-audio caption */}
                  {onUpdateImageAudioCaption && image?.id && (
                    editingAudioCaptionId === audio.id ? (
                      <textarea
                        autoFocus
                        value={audioCaptionText}
                        onChange={(e) => setAudioCaptionText(e.target.value)}
                        onBlur={() => saveAudioCaption(audio.id, image.id!)}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            saveAudioCaption(audio.id, image.id!);
                          } else if (e.key === 'Escape') {
                            setEditingAudioCaptionId(null);
                            setAudioCaptionText('');
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        rows={2}
                        className="w-40 text-xs bg-black/60 text-white/90 rounded px-2 py-1 border border-white/30 focus:outline-none focus:border-white/60 resize-none italic"
                        placeholder="Add caption…"
                      />
                    ) : (
                      <AudioCaptionText
                        caption={audio.caption}
                        onEdit={() => {
                          setEditingAudioCaptionId(audio.id);
                          setAudioCaptionText(audio.caption ?? '');
                        }}
                      />
                    )
                  )}
                </div>
              ))}
            </div>
          )}
          {image.caption && (
            <p className="text-sm text-white/90 text-center italic font-light max-w-2xl pointer-events-none">
              {image.caption}
            </p>
          )}
        </div>

        {/* Next button */}
        {selectedIndex < images.length - 1 && (
          <button
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white text-5xl
                       hover:text-gray-300 transition-colors px-2 z-10"
            onClick={(e) => { e.stopPropagation(); onNavigate(selectedIndex + 1); }}
          >
            ›
          </button>
        )}

        {/* Image context menu */}
        {imageContextMenu && (
          <div
            style={{ position: 'fixed', top: imageContextMenu.y, left: imageContextMenu.x, zIndex: 60 }}
            className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl py-1 min-w-[200px]"
            onClick={(e) => e.stopPropagation()}
          >
            {onEditCaption && (
              <button
                className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
                onClick={() => { onEditCaption(); setImageContextMenu(null); }}
              >
                <span>✏️</span> {image.caption ? 'Edit caption' : 'Add caption'}
              </button>
            )}
            {onReplaceWithClipboard && onEditCaption && (
              <div className="border-t border-gray-700 my-1" />
            )}
            {onReplaceWithClipboard && (
              <button
                className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
                onClick={() => { onReplaceWithClipboard(); setImageContextMenu(null); }}
              >
                <span>📋</span> Replace with clipboard
              </button>
            )}
            {mediaType && image?.id && (onEditCaption || onReplaceWithClipboard) && (
              <div className="border-t border-gray-700 my-1" />
            )}
            {mediaType && image?.id && (
              <button
                className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
                onClick={() => { setShowTagModal(true); setImageContextMenu(null); }}
              >
                <span>🏷️</span> Tags
              </button>
            )}
            {onDelete && (mediaType || onEditCaption || onReplaceWithClipboard) && (
              <div className="border-t border-gray-700 my-1" />
            )}
            {onDelete && (
              <button
                className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-gray-700 flex items-center gap-2"
                onClick={() => { setImageContextMenu(null); onDelete(); }}
              >
                <span>🗑️</span> Delete
              </button>
            )}
          </div>
        )}

        {/* Tag modal */}
        {showTagModal && mediaType && image?.id && (
          <TagModal
            mediaType={mediaType}
            mediaId={image.id}
            title={image.caption ?? undefined}
            onClose={() => setShowTagModal(false)}
          />
        )}
      </div>

      {/* ── Embedded recording bar ── */}
      {showRecordingBar && (
        <div
          className="flex-shrink-0 bg-gray-900 border-t border-gray-700"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 px-4 h-14">
            {/* Status indicator */}
            <div className="flex items-center gap-2 min-w-[110px]">
              {isSaving ? (
                <>
                  <span className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse" />
                  <span className="text-sm font-medium text-blue-400">SAVING...</span>
                </>
              ) : isPaused ? (
                <>
                  <span className="w-2.5 h-2.5 bg-yellow-500 rounded-full" />
                  <span className="text-sm font-medium text-yellow-400">PAUSED</span>
                </>
              ) : (
                <>
                  <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-sm font-medium text-red-400">REC</span>
                </>
              )}
            </div>

            {/* Target label */}
            {recTarget && (
              <div className="text-sm text-gray-300 truncate max-w-[160px]" title={recTarget.label}>
                {recTarget.label}
              </div>
            )}

            {/* Timer */}
            <div className="text-sm font-mono text-gray-100 tabular-nums min-w-[48px]">
              {formatDuration(recDuration)}
            </div>

            {/* Waveform */}
            <div className="flex-1 h-8 min-w-[80px]">
              <WaveformVisualizer
                analyser={analyserNode}
                isRecording={isRecording && !isPaused}
              />
            </div>

            {/* Controls */}
            {!isSaving && (
              <div className="flex items-center gap-2">
                <button
                  onClick={isPaused ? resumeRecording : pauseRecording}
                  className="w-8 h-8 flex items-center justify-center rounded-full
                             bg-gray-700 hover:bg-gray-600 text-white transition-colors text-sm"
                  title={isPaused ? 'Resume' : 'Pause'}
                >
                  {isPaused ? '▶' : '⏸'}
                </button>
                <button
                  onClick={stopAndSave}
                  className="w-8 h-8 flex items-center justify-center rounded-full
                             bg-red-600 hover:bg-red-500 text-white transition-colors text-sm"
                  title="Stop & Save"
                >
                  ⏹
                </button>
                <button
                  onClick={cancelRecording}
                  className="w-8 h-8 flex items-center justify-center rounded-full
                             bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white
                             transition-colors text-xs"
                  title="Cancel"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Delete confirmation overlay ── */}
      {pendingDeleteAudio && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/60"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl px-6 py-5 flex flex-col items-center gap-4 max-w-xs w-full mx-4">
            <p className="text-white text-sm text-center">
              Delete <span className="font-semibold text-red-400">Audio {pendingDeleteAudio.index + 1}</span>?<br />
              <span className="text-gray-400 text-xs">This cannot be undone.</span>
            </p>
            <div className="flex gap-3 w-full">
              <button
                onClick={() => setPendingDeleteAudio(null)}
                className="flex-1 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDeleteImageAudio?.(pendingDeleteAudio.audioId, pendingDeleteAudio.imageId);
                  setPendingDeleteAudio(null);
                }}
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
