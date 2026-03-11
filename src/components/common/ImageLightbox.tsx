import { useState, useEffect, useRef, useCallback } from 'react';
import type { DurationImageAudio } from '../../types';
import { useAudioRecording } from '../../context/AudioRecordingContext';
import { useImageAudioPlayer } from '../../context/ImageAudioPlayerContext';
import WaveformVisualizer from '../audio/WaveformVisualizer';
import ThemedAudioPlayer from '../audio/ThemedAudioPlayer';
import { formatDuration } from '../../utils/formatters';

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
}

function fmtSecs(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
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
}: ImageLightboxProps) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [showZoomIndicator, setShowZoomIndicator] = useState(false);
  const [pendingDeleteAudio, setPendingDeleteAudio] = useState<{ audioId: number; imageId: number; index: number } | null>(null);

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

  // Image audio player context — for embedded player bar
  const { currentAudio, imageLabel: playerLabel, dismiss: dismissPlayer } = useImageAudioPlayer();

  // Only show embedded bars when lightbox is in "image audio" mode
  const imageAudioMode = onRecordForImage !== undefined;
  const showRecordingBar = imageAudioMode && (isRecording || isSaving) && recTarget?.type === 'duration_image';
  const showPlayerBar = imageAudioMode && currentAudio !== null;

  const image = images[selectedIndex];
  const currentImageAudios = (image?.id && imageAudiosMap) ? (imageAudiosMap[image.id] ?? []) : [];

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
  }, [selectedIndex, images.length, onNavigate, onClose]);

  // Backdrop click: close at 1x, reset zoom at >1x
  const handleBackdropClick = useCallback(() => {
    if (scale > 1) {
      setScale(1);
      setTranslate({ x: 0, y: 0 });
    } else {
      onClose();
    }
  }, [scale, onClose]);

  // Image click: stop propagation only if not dragging
  const handleImageClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasDragged.current) {
      hasDragged.current = false;
    }
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">

      {/* ── Image area (shrinks when bottom bars appear) ── */}
      <div
        ref={containerRef}
        className="flex-1 relative flex items-center justify-center overflow-hidden p-4"
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
        <div className="absolute top-4 left-4 text-white text-lg font-medium z-10">
          {selectedIndex + 1} / {images.length}
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
        />

        {/* Audio buttons + caption — anchored to bottom of image area */}
        <div className="absolute bottom-4 left-0 right-0 flex flex-col items-center gap-2 px-4 pointer-events-none">
          {currentImageAudios.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2 pointer-events-auto">
              {currentImageAudios.map((audio, i) => (
                <div key={audio.id} className="flex items-center gap-1">
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
                      className="text-white/40 hover:text-red-400 text-xs transition-colors pointer-events-auto"
                      title="Delete audio"
                    >
                      ×
                    </button>
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
      </div>

      {/* ── Embedded player bar ── */}
      {showPlayerBar && currentAudio && (
        <div
          className="flex-shrink-0 bg-gray-900 border-t border-blue-700/50"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 px-4 py-2">
            <span className="text-blue-400 text-base flex-shrink-0">🔊</span>
            <span
              className="text-sm text-blue-300 truncate flex-shrink-0 max-w-[180px]"
              title={currentAudio.caption || playerLabel}
            >
              {currentAudio.caption || playerLabel}
            </span>
            <div className="flex-1 min-w-0">
              <ThemedAudioPlayer
                src={window.electronAPI.paths.getFileUrl(currentAudio.file_path)}
                theme="blue"
              />
            </div>
            <button
              onClick={dismissPlayer}
              className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full
                         bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white
                         transition-colors text-xs"
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}

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
