import { useState, useEffect, useRef, useCallback } from 'react';
import type { AnyImageAudio, MediaTagType, ImageChild, ImageChildAudio } from '../../types';
import { useAudioRecording, AUDIO_SAVED_EVENT } from '../../context/AudioRecordingContext';
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
  // Disable child images (used by child lightbox to prevent recursion)
  disableChildImages?: boolean;
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
  onUpdateImageAudioCaption,
  onReplaceWithClipboard,
  onEditCaption,
  onDelete,
  mediaType,
  disableChildImages = false,
}: ImageLightboxProps) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [showZoomIndicator, setShowZoomIndicator] = useState(false);
  const [imageContextMenu, setImageContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [pendingDeleteAudio, setPendingDeleteAudio] = useState<{ audioId: number; imageId: number; index: number } | null>(null);
  const [editingAudioCaptionId, setEditingAudioCaptionId] = useState<number | null>(null);
  const [audioCaptionText, setAudioCaptionText] = useState('');
  const [showTagModal, setShowTagModal] = useState(false);

  // Child images state
  const [imageChildren, setImageChildren] = useState<ImageChild[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);
  const [childAudiosMap, setChildAudiosMap] = useState<Record<number, ImageChildAudio[]>>({});
  const [childTagCountMap, setChildTagCountMap] = useState<Record<number, number>>({});
  const [pendingDeleteChild, setPendingDeleteChild] = useState<number | null>(null);
  const [childCaptionEdit, setChildCaptionEdit] = useState<{ childId: number; value: string } | null>(null);

  const imageRef = useRef<HTMLImageElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
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
    startRecording,
    pauseRecording,
    resumeRecording,
    stopAndSave,
    cancelRecording,
  } = useAudioRecording();

  // Only show embedded bars when lightbox is in "image audio" mode
  const imageAudioMode = onRecordForImage !== undefined;
  const showRecordingBar = imageAudioMode && (isRecording || isSaving) &&
    (recTarget?.type === 'duration_image' || recTarget?.type === 'recording_image' || recTarget?.type === 'image_child');

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
  // Keep mirror refs in sync
  useEffect(() => { annotationsRef.current = annotations; }, [annotations]);
  useEffect(() => { drawPreviewRef.current = drawPreview; }, [drawPreview]);
  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
  useEffect(() => { activeColorRef.current = activeColor; }, [activeColor]);
  useEffect(() => { currentImageIdRef.current = image?.id; }, [image?.id]);
  useEffect(() => { currentMediaTypeRef.current = mediaType; }, [mediaType]);

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

  // Reset zoom + annotation state on navigation
  useEffect(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
    setShowTagModal(false);
    setSelectedChildId(null);
  }, [selectedIndex]);

  // Load child images when the current image changes
  useEffect(() => {
    if (disableChildImages || !image?.id || !mediaType) {
      setImageChildren([]);
      return;
    }
    const parentType = mediaType as string;
    window.electronAPI.imageChildren
      .getByParent(parentType, image.id)
      .then(children => setImageChildren(children));
  }, [image?.id, mediaType, disableChildImages]);

  // Fetch tag counts for child images
  useEffect(() => {
    if (imageChildren.length === 0) {
      setChildTagCountMap({});
      return;
    }
    Promise.all(
      imageChildren.map(c =>
        window.electronAPI.tags.getByMedia('image_child', c.id)
          .then((tags: { name: string }[]) => [c.id, tags.length] as const)
      )
    ).then(entries => setChildTagCountMap(Object.fromEntries(entries)));
  }, [imageChildren]);

  // Reload child audios when an image_child audio is saved
  useEffect(() => {
    const handler = (e: Event) => {
      const target = (e as CustomEvent).detail?.target;
      if (target?.type === 'image_child' && target.imageChildId) {
        window.electronAPI.imageChildAudios
          .getByChild(target.imageChildId)
          .then(audios => {
            setChildAudiosMap(prev => ({ ...prev, [target.imageChildId]: audios }));
          });
      }
    };
    window.addEventListener(AUDIO_SAVED_EVENT, handler);
    return () => window.removeEventListener(AUDIO_SAVED_EVENT, handler);
  }, []);

  // Load audios for selected child
  useEffect(() => {
    if (selectedChildId == null) return;
    window.electronAPI.imageChildAudios
      .getByChild(selectedChildId)
      .then(audios => {
        setChildAudiosMap(prev => ({ ...prev, [selectedChildId]: audios }));
      });
  }, [selectedChildId]);

  const handleAddChild = useCallback(async () => {
    if (!image?.id || !mediaType) return;
    const clipboardResult = await window.electronAPI.clipboard.readImage();
    if (!clipboardResult.success || !clipboardResult.buffer) return;
    const child = await window.electronAPI.imageChildren.addFromClipboard(
      mediaType as string,
      image.id,
      clipboardResult.buffer,
      clipboardResult.extension ?? 'png'
    );
    setImageChildren(prev => [...prev, child]);
  }, [image?.id, mediaType]);

  const handleDeleteChild = useCallback(async (childId: number) => {
    await window.electronAPI.imageChildren.delete(childId);
    setImageChildren(prev => prev.filter(c => c.id !== childId));
    if (selectedChildId === childId) setSelectedChildId(null);
    setPendingDeleteChild(null);
  }, [selectedChildId]);

  const handleRecordForChild = useCallback(async (childId: number) => {
    const child = imageChildren.find(c => c.id === childId);
    await startRecording({
      type: 'image_child',
      imageChildId: childId,
      label: child?.caption ?? `Child image`,
    });
  }, [imageChildren, startRecording]);

  const handleDeleteChildAudio = useCallback(async (audioId: number, childId: number) => {
    await window.electronAPI.imageChildAudios.delete(audioId);
    setChildAudiosMap(prev => ({
      ...prev,
      [childId]: (prev[childId] ?? []).filter(a => a.id !== audioId),
    }));
  }, []);

  const handleUpdateChildAudioCaption = useCallback(async (audioId: number, childId: number, caption: string | null) => {
    await window.electronAPI.imageChildAudios.updateCaption(audioId, caption);
    setChildAudiosMap(prev => ({
      ...prev,
      [childId]: (prev[childId] ?? []).map(a =>
        a.id === audioId ? { ...a, caption } : a
      ),
    }));
  }, []);

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

  // OCR region selection: Shift+drag to detect text and tag
  const handleOcrMouseDown = useCallback((e: React.MouseEvent) => {
    if (!e.shiftKey || !mediaType || !image?.file_path) return;
    e.preventDefault();
    e.stopPropagation();
    const pos = { x: e.clientX, y: e.clientY };
    ocrSelectStartRef.current = pos;
    setOcrSelectStart(pos);
    setOcrSelectEnd(pos);

    const onMove = (me: MouseEvent) => {
      setOcrSelectEnd({ x: me.clientX, y: me.clientY });
    };
    const onUp = async (me: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const start = ocrSelectStartRef.current;
      if (!start) { setOcrSelectStart(null); setOcrSelectEnd(null); return; }
      const end = { x: me.clientX, y: me.clientY };
      setOcrSelectStart(null);
      setOcrSelectEnd(null);
      ocrSelectStartRef.current = null;

      const img = imageRef.current;
      if (!img) return;
      const imgRect = img.getBoundingClientRect();
      const rect = {
        x: Math.round((Math.min(start.x, end.x) - imgRect.left) / imgRect.width  * img.naturalWidth),
        y: Math.round((Math.min(start.y, end.y) - imgRect.top)  / imgRect.height * img.naturalHeight),
        width:  Math.round(Math.abs(end.x - start.x) / imgRect.width  * img.naturalWidth),
        height: Math.round(Math.abs(end.y - start.y) / imgRect.height * img.naturalHeight),
      };
      if (rect.width < 5 || rect.height < 5) return;

      setIsOcrLoading(true);
      try {
        const result = await window.electronAPI.ocr.recognizeRegion(image.file_path, rect);
        if (result.text) {
          setOcrSuggestion(result);
          setShowTagModal(true);
        }
      } catch (err) {
        console.error('OCR failed:', err);
      } finally {
        setIsOcrLoading(false);
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [mediaType, image]);

  // Drag to pan (only when not in draw mode)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.shiftKey) return; // let OCR handler take Shift+drag
    if (scale <= 1 || drawMode) return;
    e.preventDefault();
    isDragging.current = true;
    hasDragged.current = false;
    dragStart.current = { x: e.clientX, y: e.clientY };
    translateAtDragStart.current = { ...translate };
    document.body.style.cursor = 'grabbing';
  }, [scale, translate, drawMode]);

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

  // Global mouse move/up for annotation dragging and drawing.
  // Uses refs for frequently-changing state to avoid re-registering handlers on every move.
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDrawingRef.current && drawStartRef.current) {
        const coords = getSvgCoords(e.clientX, e.clientY);
        if (coords) {
          setDrawPreview({
            x1: drawStartRef.current.x,
            y1: drawStartRef.current.y,
            x2: coords.x,
            y2: coords.y,
          });
        }
        return;
      }

      if (!isAnnDragging.current || annDragId.current === null || !annAtStart.current || !annMouseStart.current) return;
      const coords = getSvgCoords(e.clientX, e.clientY);
      if (!coords) return;

      const dx = coords.x - annMouseStart.current.x;
      const dy = coords.y - annMouseStart.current.y;
      const a = annAtStart.current;
      const handle = annDragHandle.current;

      let newCoords: { x1: number; y1: number; x2: number; y2: number };
      if (handle === null) {
        newCoords = { x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy };
      } else if (handle === 'tl') {
        newCoords = { x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2, y2: a.y2 };
      } else if (handle === 'tr') {
        newCoords = { x1: a.x1, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 };
      } else if (handle === 'bl') {
        newCoords = { x1: a.x1 + dx, y1: a.y1, x2: a.x2, y2: a.y2 + dy };
      } else if (handle === 'br') {
        newCoords = { x1: a.x1, y1: a.y1, x2: a.x2 + dx, y2: a.y2 + dy };
      } else if (handle === 'start') {
        newCoords = { x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2, y2: a.y2 };
      } else {
        newCoords = { x1: a.x1, y1: a.y1, x2: a.x2 + dx, y2: a.y2 + dy };
      }

      newCoords = {
        x1: Math.max(0, Math.min(100, newCoords.x1)),
        y1: Math.max(0, Math.min(100, newCoords.y1)),
        x2: Math.max(0, Math.min(100, newCoords.x2)),
        y2: Math.max(0, Math.min(100, newCoords.y2)),
      };

      setAnnotations(prev => prev.map(ann =>
        ann.id === annDragId.current ? { ...ann, ...newCoords } : ann
      ));
    };

    const handleMouseUp = async () => {
      if (isDrawingRef.current) {
        isDrawingRef.current = false;
        const preview = drawPreviewRef.current;
        drawStartRef.current = null;
        setDrawPreview(null);

        if (!preview || !imageRef.current) return;
        const minSize = 0.5;
        if (Math.abs(preview.x2 - preview.x1) < minSize && Math.abs(preview.y2 - preview.y1) < minSize) return;

        // Read image info from the DOM ref to avoid stale closure
        const imgEl = svgRef.current?.closest('.image-lightbox-root') as HTMLElement | null;
        void imgEl; // not needed, we use captured values below
        const currentImageId = currentImageIdRef.current;
        const currentMediaType = currentMediaTypeRef.current;
        if (!currentImageId || !currentMediaType) return;

        const created = await window.electronAPI.imageAnnotations.create({
          image_type: currentMediaType,
          image_id: currentImageId,
          ann_type: activeToolRef.current,
          x1: preview.x1, y1: preview.y1, x2: preview.x2, y2: preview.y2,
          color: activeColorRef.current,
          stroke_width: STROKE_WIDTH,
        });
        setAnnotations(prev => [...prev, created]);
        return;
      }

      if (!isAnnDragging.current || annDragId.current === null) return;
      const id = annDragId.current;
      isAnnDragging.current = false;
      annDragId.current = null;
      annDragHandle.current = null;
      annAtStart.current = null;
      annMouseStart.current = null;

      const ann = annotationsRef.current.find(a => a.id === id);
      if (ann) {
        await window.electronAPI.imageAnnotations.update(id, {
          x1: ann.x1, y1: ann.y1, x2: ann.x2, y2: ann.y2,
        });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [getSvgCoords]); // stable deps only — state accessed via refs

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
      if (e.key === 'ArrowLeft') {
        if (selectedChildId == null && selectedIndex > 0) onNavigate(selectedIndex - 1);
      } else if (e.key === 'ArrowRight') {
        if (selectedChildId == null && selectedIndex < images.length - 1) onNavigate(selectedIndex + 1);
      } else if (e.key === 'Escape') {
        if (selectedChildId != null) {
          setSelectedChildId(null);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, images.length, onNavigate, onClose, imageContextMenu, selectedChildId]);

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
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col titlebar-no-drag">

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

        {/* Image caption — always floats at bottom */}
        {image.caption && (
          <div className="absolute bottom-4 left-0 right-0 flex justify-center px-4 pointer-events-none">
            <p className="text-sm text-white/90 text-center italic font-light max-w-2xl">
              {image.caption}
            </p>
          </div>
        )}

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

      {/* ── Strip: related images (left) + audios (right) — also shown in child lightbox if audios exist ── */}
      {((!disableChildImages && mediaType && image?.id) || (disableChildImages && currentImageAudios.length > 0)) && (
        <div
          className="flex-shrink-0 bg-black/80 border-t border-white/10 px-4 py-2 flex items-center gap-3"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Left: thumbnail row — only in parent lightbox */}
          {!disableChildImages && <div className="flex-1 min-w-0">
            <p className="text-white/40 text-[10px] mb-1">Related images</p>
            <div className="flex gap-2 overflow-x-auto pb-0.5">
              {imageChildren.map(child => (
                <div
                  key={child.id}
                  className="relative flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden cursor-pointer group border border-white/10 hover:border-white/40 transition-colors"
                  onClick={() => setSelectedChildId(child.id)}
                >
                  <img
                    src={window.electronAPI.paths.getFileUrl(child.thumbnail_path ?? child.file_path)}
                    alt={child.caption ?? ''}
                    className="w-full h-full object-cover"
                  />
                  {/* Audio count badge — top-right */}
                  {(childAudiosMap[child.id] ?? []).length > 0 && (
                    <span className="absolute top-0.5 right-0.5 bg-blue-500/80 text-white text-[9px] rounded px-0.5 leading-4 pointer-events-none">
                      {(childAudiosMap[child.id] ?? []).length}
                    </span>
                  )}
                  {/* Tag count badge — stacked below audio if both, otherwise top-right */}
                  {(childTagCountMap[child.id] ?? 0) > 0 && (
                    <span className={`absolute right-0.5 bg-orange-500/90 text-white text-[9px] rounded px-0.5 leading-4 pointer-events-none ${
                      (childAudiosMap[child.id] ?? []).length > 0 ? 'top-4' : 'top-0.5'
                    }`}>
                      {childTagCountMap[child.id]}
                    </span>
                  )}
                  {/* Delete button — top-left corner, small × */}
                  <button
                    className="absolute top-0.5 left-0.5 w-4 h-4 bg-black/70 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity z-10"
                    onClick={(e) => { e.stopPropagation(); setPendingDeleteChild(child.id); }}
                    title="Delete"
                  >
                    <span className="text-red-400 text-[11px] leading-none">×</span>
                  </button>
                </div>
              ))}
              {/* Add placeholder */}
              <button
                className="flex-shrink-0 w-14 h-14 rounded-lg border-2 border-dashed border-white/20 hover:border-white/40 flex items-center justify-center transition-colors"
                onClick={handleAddChild}
                title="Paste image from clipboard (Cmd+V)"
              >
                <span className="text-white/40 text-2xl leading-none">+</span>
              </button>
            </div>
          </div>}

          {/* Right: main image audios — compact horizontal chip row */}
          {currentImageAudios.length > 0 && (
            <>
              {!disableChildImages && <div className="w-px self-stretch bg-white/10 flex-shrink-0" />}
              <div className="flex-shrink-0 min-w-0 max-w-[220px]">
                <p className="text-white/40 text-[10px] mb-1">Audios</p>
                <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
                  {currentImageAudios.map((audio, i) => (
                    <div key={audio.id} className="relative flex-shrink-0 group/chip">
                      <button
                        title={audio.caption ?? `Audio ${i + 1}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onPlayImageAudio?.(audio, image.caption || `Image ${selectedIndex + 1}`);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setEditingAudioCaptionId(audio.id);
                          setAudioCaptionText(audio.caption ?? '');
                        }}
                        className="flex items-center gap-1 bg-white/15 hover:bg-white/25 text-white rounded-full px-2.5 py-1 text-[11px] transition-colors whitespace-nowrap"
                      >
                        ▶ {i + 1}{audio.duration ? ` · ${fmtSecs(audio.duration)}` : ''}
                      </button>
                      {onDeleteImageAudio && image?.id && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingDeleteAudio({ audioId: audio.id, imageId: image.id!, index: i });
                          }}
                          className="absolute -top-1.5 -right-1 w-3.5 h-3.5 bg-black/80 border border-red-500/50 rounded-full text-red-400 text-[9px] leading-none opacity-0 group-hover/chip:opacity-100 transition-opacity flex items-center justify-center"
                          title="Delete audio"
                        >×</button>
                      )}
                      {editingAudioCaptionId === audio.id && onUpdateImageAudioCaption && image?.id && (
                        <div
                          className="absolute bottom-full mb-2 left-0 z-20 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-2.5 w-48"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <p className="text-white/40 text-[10px] mb-1.5">Caption (right-click to edit)</p>
                          <textarea
                            autoFocus
                            value={audioCaptionText}
                            onChange={(e) => setAudioCaptionText(e.target.value)}
                            onBlur={() => saveAudioCaption(audio.id, image.id!)}
                            onKeyDown={(e) => {
                              e.stopPropagation();
                              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveAudioCaption(audio.id, image.id!); }
                              else if (e.key === 'Escape') { setEditingAudioCaptionId(null); setAudioCaptionText(''); }
                            }}
                            rows={2}
                            className="w-full text-xs bg-black/60 text-white/90 rounded-lg px-2 py-1.5 border border-white/20 focus:outline-none focus:border-white/50 resize-none"
                            placeholder="Add caption…"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Child image lightbox ── */}
      {selectedChildId != null && (() => {
        const selectedChildIndex = imageChildren.findIndex(c => c.id === selectedChildId);
        if (selectedChildIndex === -1) return null;
        const child = imageChildren[selectedChildIndex];
        const childAudiosMapForLightbox = Object.fromEntries(
          imageChildren.map(c => [c.id, (childAudiosMap[c.id] ?? []) as AnyImageAudio[]])
        );
        return (
          <ImageLightbox
            images={imageChildren.map(c => ({ id: c.id, file_path: c.file_path, caption: c.caption }))}
            selectedIndex={selectedChildIndex}
            onClose={() => {
              // Refresh tag counts for all children when child lightbox closes
              Promise.all(
                imageChildren.map(c =>
                  window.electronAPI.tags.getByMedia('image_child', c.id)
                    .then((tags: { name: string }[]) => [c.id, tags.length] as const)
                )
              ).then(entries => setChildTagCountMap(Object.fromEntries(entries)));
              setSelectedChildId(null);
            }}
            onNavigate={(newIndex) => setSelectedChildId(imageChildren[newIndex].id)}
            mediaType="image_child"
            disableChildImages={true}
            imageAudiosMap={childAudiosMapForLightbox}
            onRecordForImage={onRecordForImage ? (imageId) => handleRecordForChild(imageId) : undefined}
            onDeleteImageAudio={(audioId, imageId) => handleDeleteChildAudio(audioId, imageId)}
            onPlayImageAudio={onPlayImageAudio}
            onUpdateImageAudioCaption={(audioId, imageId, caption) =>
              handleUpdateChildAudioCaption(audioId, imageId, caption)
            }
            onEditCaption={() => {
              setChildCaptionEdit({ childId: child.id, value: child.caption ?? '' });
            }}
            onDelete={() => setPendingDeleteChild(child.id)}
          />
        );
      })()}

      {/* ── Child caption editor ── */}
      {childCaptionEdit != null && (
        <div
          className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl px-6 py-5 flex flex-col gap-3 max-w-xs w-full mx-4">
            <p className="text-white text-sm">Edit caption</p>
            <textarea
              autoFocus
              value={childCaptionEdit.value}
              onChange={(e) => setChildCaptionEdit(prev => prev ? { ...prev, value: e.target.value } : null)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape') setChildCaptionEdit(null);
              }}
              rows={3}
              className="w-full text-sm bg-gray-800 text-white rounded px-3 py-2 border border-gray-600 focus:outline-none focus:border-white/50 resize-none"
              placeholder="Add caption…"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setChildCaptionEdit(null)}
                className="flex-1 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const { childId, value } = childCaptionEdit;
                  const updated = await window.electronAPI.imageChildren.updateCaption(childId, value.trim() || null);
                  setImageChildren(prev => prev.map(c => c.id === childId ? { ...c, caption: updated.caption } : c));
                  setChildCaptionEdit(null);
                }}
                className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete child confirmation ── */}
      {pendingDeleteChild != null && (
        <div
          className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl px-6 py-5 flex flex-col items-center gap-4 max-w-xs w-full mx-4">
            <p className="text-white text-sm text-center">
              Delete this related image?<br />
              <span className="text-gray-400 text-xs">This cannot be undone.</span>
            </p>
            <div className="flex gap-3 w-full">
              <button
                onClick={() => setPendingDeleteChild(null)}
                className="flex-1 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteChild(pendingDeleteChild)}
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors"
              >
                Delete
              </button>
            </div>
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
