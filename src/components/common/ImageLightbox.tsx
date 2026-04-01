import { useState, useEffect, useRef, useCallback } from 'react';
import type { AnyImageAudio, MediaTagType, ImageChild, ImageChildAudio, ImageAnnotation } from '../../types';
import { useAudioRecording, AUDIO_SAVED_EVENT } from '../../context/AudioRecordingContext';
import { useImageAudioPlayer } from '../../context/ImageAudioPlayerContext';
import WaveformVisualizer from '../audio/WaveformVisualizer';
import { formatDuration } from '../../utils/formatters';
import { TagModal } from './TagModal';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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
  // Extract full-image OCR text into caption2
  onExtractOcr?: () => Promise<void>;
  // Tag editing
  mediaType?: MediaTagType;
  onTagsChanged?: (imageId: number, tagNames: string[]) => void;
  // Disable child images (used by child lightbox to prevent recursion)
  disableChildImages?: boolean;
}

function fmtSecs(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const ANNOTATION_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#3b82f6', // blue
  '#a855f7', // purple
  '#ffffff',  // white
  '#1a1a1a',  // black
];

const STROKE_WIDTH = 0.6; // SVG viewBox units (0 0 100 100)
const HANDLE_SIZE = 1.8;  // handle square/circle radius in viewBox units

/* ── Sortable thumbnail for the related-images strip ─────────────────────── */
function SortableChildThumb({
  child,
  audioCount,
  tagCount,
  onOpen,
  onDelete,
}: {
  child: ImageChild;
  audioCount: number;
  tagCount: number;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: child.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }}
      className="relative flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden cursor-grab active:cursor-grabbing group border border-white/10 hover:border-white/40 transition-colors"
      onClick={onOpen}
      {...attributes}
      {...listeners}
    >
      <img
        src={window.electronAPI.paths.getFileUrl(child.thumbnail_path ?? child.file_path)}
        alt={child.caption ?? ''}
        className="w-full h-full object-cover pointer-events-none"
      />
      {audioCount > 0 && (
        <span className="absolute top-0.5 right-0.5 bg-blue-500/80 text-white text-[9px] rounded px-0.5 leading-4 pointer-events-none">
          {audioCount}
        </span>
      )}
      {tagCount > 0 && (
        <span className={`absolute right-0.5 bg-orange-500/90 text-white text-[9px] rounded px-0.5 leading-4 pointer-events-none ${
          audioCount > 0 ? 'top-4' : 'top-0.5'
        }`}>
          {tagCount}
        </span>
      )}
      <button
        className="absolute top-0.5 left-0.5 w-4 h-4 bg-black/70 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity z-10"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        title="Delete"
      >
        <span className="text-red-400 text-[11px] leading-none">×</span>
      </button>
    </div>
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
  onExtractOcr,
  mediaType,
  onTagsChanged,
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
  const [currentImageTags, setCurrentImageTags] = useState<{ name: string }[]>([]);

  // OCR caption2 extraction status
  const [ocrCaption2Status, setOcrCaption2Status] = useState<'idle' | 'running' | 'done' | 'error'>('idle');

  // OCR region selection state
  const [ocrSelectStart, setOcrSelectStart] = useState<{ x: number; y: number } | null>(null);
  const [ocrSelectEnd, setOcrSelectEnd] = useState<{ x: number; y: number } | null>(null);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [ocrSuggestion, setOcrSuggestion] = useState<{ text: string; slug: string } | null>(null);
  const ocrSelectStartRef = useRef<{ x: number; y: number } | null>(null);
  const [isShiftHeld, setIsShiftHeld] = useState(false);

  // Child images state
  const [imageChildren, setImageChildren] = useState<ImageChild[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);
  const [childAudiosMap, setChildAudiosMap] = useState<Record<number, ImageChildAudio[]>>({});
  const [childTagCountMap, setChildTagCountMap] = useState<Record<number, number>>({});
  const [pendingDeleteChild, setPendingDeleteChild] = useState<number | null>(null);
  const [childCaptionEdit, setChildCaptionEdit] = useState<{ childId: number; value: string } | null>(null);
  const [draggingChildId, setDraggingChildId] = useState<number | null>(null);

  // Drag-and-drop sensors for the related images strip
  const childSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Annotation state
  const [annotations, setAnnotations] = useState<ImageAnnotation[]>([]);
  const [drawMode, setDrawMode] = useState(false);
  const [activeTool, setActiveTool] = useState<'rect' | 'line'>('rect');
  const [activeColor, setActiveColor] = useState(ANNOTATION_COLORS[0]);
  const [selectedAnnId, setSelectedAnnId] = useState<number | null>(null);
  const [drawPreview, setDrawPreview] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  // Size of the actual image content within the <img> element (accounting for object-contain letterboxing)
  const [displayedSize, setDisplayedSize] = useState<{ w: number; h: number } | null>(null);

  // Child images state
  const [imageChildren, setImageChildren] = useState<ImageChild[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);
  const [childAudiosMap, setChildAudiosMap] = useState<Record<number, ImageChildAudio[]>>({});
  const [childTagCountMap, setChildTagCountMap] = useState<Record<number, number>>({});
  const [pendingDeleteChild, setPendingDeleteChild] = useState<number | null>(null);
  const [childCaptionEdit, setChildCaptionEdit] = useState<{ childId: number; value: string } | null>(null);
  const [draggingChildId, setDraggingChildId] = useState<number | null>(null);

  // Drag-and-drop sensors for the related images strip
  const childSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Annotation state
  const [annotations, setAnnotations] = useState<ImageAnnotation[]>([]);
  const [drawMode, setDrawMode] = useState(false);
  const [activeTool, setActiveTool] = useState<'rect' | 'line'>('rect');
  const [activeColor, setActiveColor] = useState(ANNOTATION_COLORS[0]);
  const [selectedAnnId, setSelectedAnnId] = useState<number | null>(null);
  const [drawPreview, setDrawPreview] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  // Size of the actual image content within the <img> element (accounting for object-contain letterboxing)
  const [displayedSize, setDisplayedSize] = useState<{ w: number; h: number } | null>(null);

  const imageRef = useRef<HTMLImageElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const hasDragged = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const translateAtDragStart = useRef({ x: 0, y: 0 });
  const zoomIndicatorTimeout = useRef<ReturnType<typeof setTimeout>>();
  const scaleRef = useRef(1);

  // Annotation drag refs
  const isAnnDragging = useRef(false);
  const annDragId = useRef<number | null>(null);
  const annDragHandle = useRef<string | null>(null); // null=move body, 'tl','tr','bl','br','start','end'
  const annAtStart = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const annMouseStart = useRef<{ x: number; y: number } | null>(null);

  // Draw refs
  const isDrawingRef = useRef(false);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  // Refs that mirror state so global mouse handlers don't need to re-register on every state change
  const annotationsRef = useRef<ImageAnnotation[]>([]);
  const drawPreviewRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const activeToolRef = useRef<'rect' | 'line'>('rect');
  const activeColorRef = useRef(ANNOTATION_COLORS[0]);
  const currentImageIdRef = useRef<number | undefined>(undefined);
  const currentMediaTypeRef = useRef<string | undefined>(undefined);

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

  const { currentAudio: imagePlayerAudio } = useImageAudioPlayer();
  const playerBarVisible = imagePlayerAudio !== null;

  // Only show embedded bars when lightbox is in "image audio" mode
  const imageAudioMode = onRecordForImage !== undefined;
  const showRecordingBar = imageAudioMode && (isRecording || isSaving) &&
    (recTarget?.type === 'duration_image' || recTarget?.type === 'recording_image' || recTarget?.type === 'image_child' || recTarget?.type === 'capture_image');

  const image = images[selectedIndex];
  const currentImageAudios = (image?.id && imageAudiosMap) ? (imageAudiosMap[image.id] ?? []) : [];

  const saveAudioCaption = async (audioId: number, imageId: number) => {
    const trimmed = audioCaptionText.trim() || null;
    await onUpdateImageAudioCaption?.(audioId, imageId, trimmed);
    setEditingAudioCaptionId(null);
    setAudioCaptionText('');
  };

  const handleReplaceChildWithClipboard = useCallback(async () => {
    if (selectedChildId == null) return;
    const result = await window.electronAPI.clipboard.readImage();
    if (!result.success || !result.buffer) {
      alert('No image found in clipboard. Copy an image first.');
      return;
    }
    const updated = await window.electronAPI.imageChildren.replaceFromClipboard(selectedChildId, result.buffer, result.extension || 'png');
    setImageChildren(prev => prev.map(c => c.id === selectedChildId ? { ...c, file_path: updated.file_path, thumbnail_path: updated.thumbnail_path } : c));
  }, [selectedChildId]);

  const handleChildDragEnd = useCallback(async (event: DragEndEvent) => {
    setDraggingChildId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = imageChildren.findIndex(c => c.id === active.id);
    const newIndex = imageChildren.findIndex(c => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(imageChildren, oldIndex, newIndex);
    setImageChildren(reordered);
    if (mediaType && image?.id) {
      await window.electronAPI.imageChildren.reorder(mediaType, image.id, reordered.map(c => c.id));
    }
  }, [imageChildren, mediaType, image?.id]);

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
    setDisplayedSize(null);
    setAnnotations([]);
    setSelectedAnnId(null);
    setDrawPreview(null);
    isDrawingRef.current = false;
    isAnnDragging.current = false;
    setOcrCaption2Status('idle');
  }, [selectedIndex]);

  // Load annotations when image changes
  useEffect(() => {
    if (!mediaType || !image?.id) {
      setAnnotations([]);
      return;
    }
    window.electronAPI.imageAnnotations.getByImage(mediaType, image.id).then(setAnnotations);
  }, [image?.id, mediaType]);

  // Compute actual image content size after load (to position SVG overlay)
  const handleImageLoad = useCallback(() => {
    const img = imageRef.current;
    if (!img || img.offsetWidth === 0 || img.offsetHeight === 0) return;
    const naturalAR = img.naturalWidth / img.naturalHeight;
    const offsetAR = img.offsetWidth / img.offsetHeight;
    let w: number, h: number;
    if (naturalAR > offsetAR) {
      w = img.offsetWidth;
      h = img.offsetWidth / naturalAR;
    } else {
      h = img.offsetHeight;
      w = img.offsetHeight * naturalAR;
    }
    setDisplayedSize({ w, h });
  }, []);

  // Convert screen coords to SVG viewBox percentage coords (0–100)
  const getSvgCoords = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: Math.max(0, Math.min(100, (clientX - rect.left) / rect.width * 100)),
      y: Math.max(0, Math.min(100, (clientY - rect.top) / rect.height * 100)),
    };
  }, []);

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

  // Load tags for the current image
  useEffect(() => {
    if (!mediaType || !image?.id) {
      setCurrentImageTags([]);
      return;
    }
    window.electronAPI.tags.getByMedia(mediaType, image.id).then(setCurrentImageTags);
  }, [image?.id, mediaType]);

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

      if (e.key === 'Escape') {
        if (drawMode) {
          setDrawMode(false);
          setDrawPreview(null);
          isDrawingRef.current = false;
          return;
        }
        if (selectedAnnId !== null) {
          setSelectedAnnId(null);
          return;
        }
        if (selectedChildId != null) {
          setSelectedChildId(null);
        } else {
          onClose();
        }
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedAnnId !== null) {
        const id = selectedAnnId;
        setSelectedAnnId(null);
        setAnnotations(prev => prev.filter(a => a.id !== id));
        window.electronAPI.imageAnnotations.delete(id);
        return;
      }

      if (e.key === 'ArrowLeft') {
        if (selectedChildId == null && selectedIndex > 0) onNavigate(selectedIndex - 1);
      } else if (e.key === 'ArrowRight') {
        if (selectedChildId == null && selectedIndex < images.length - 1) onNavigate(selectedIndex + 1);
      } else if (e.key === 'ArrowDown') {
        // Open first related image when viewing a parent
        if (!disableChildImages && selectedChildId == null && imageChildren.length > 0) {
          e.preventDefault();
          setSelectedChildId(imageChildren[0].id);
        }
      } else if (e.key === 'ArrowUp') {
        // Go back to parent from a child
        if (selectedChildId != null) {
          e.preventDefault();
          setSelectedChildId(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, images.length, onNavigate, onClose, imageContextMenu, selectedChildId, drawMode, selectedAnnId, imageChildren, disableChildImages]);

  // Track Shift key for OCR cursor hint
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => { if (e.key === 'Shift') setIsShiftHeld(true); };
    const onUp   = (e: KeyboardEvent) => { if (e.key === 'Shift') setIsShiftHeld(false); };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); };
  }, []);

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

  // SVG mouse handlers (draw mode)
  const handleSvgMouseDown = useCallback((e: React.MouseEvent<SVGElement>) => {
    if (!drawMode) return;
    e.preventDefault();
    e.stopPropagation();
    const coords = getSvgCoords(e.clientX, e.clientY);
    if (!coords) return;
    isDrawingRef.current = true;
    drawStartRef.current = coords;
    setDrawPreview({ x1: coords.x, y1: coords.y, x2: coords.x, y2: coords.y });
  }, [drawMode, getSvgCoords]);

  // Annotation shape mouse down (view mode — select + start drag)
  const handleAnnMouseDown = useCallback((e: React.MouseEvent<SVGElement>, annId: number, handle: string | null) => {
    if (drawMode) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedAnnId(annId);
    const coords = getSvgCoords(e.clientX, e.clientY);
    if (!coords) return;
    const ann = annotations.find(a => a.id === annId);
    if (!ann) return;
    isAnnDragging.current = true;
    annDragId.current = annId;
    annDragHandle.current = handle;
    annAtStart.current = { x1: ann.x1, y1: ann.y1, x2: ann.x2, y2: ann.y2 };
    annMouseStart.current = coords;
  }, [drawMode, getSvgCoords, annotations]);

  const deleteAnnotation = useCallback(async (id: number) => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
    if (selectedAnnId === id) setSelectedAnnId(null);
    await window.electronAPI.imageAnnotations.delete(id);
  }, [selectedAnnId]);

  const clearAllAnnotations = useCallback(async () => {
    if (!image?.id || !mediaType) return;
    setAnnotations([]);
    setSelectedAnnId(null);
    // Delete each annotation
    await Promise.all(annotations.map(a => window.electronAPI.imageAnnotations.delete(a.id)));
  }, [annotations, image?.id, mediaType]);

  // Render a single annotation in the SVG
  const renderAnnotation = (ann: ImageAnnotation, isPreview = false) => {
    const isSelected = !isPreview && ann.id === selectedAnnId && !drawMode;
    const sw = ann.stroke_width ?? STROKE_WIDTH;
    const hs = HANDLE_SIZE;

    if (ann.ann_type === 'rect') {
      const x = Math.min(ann.x1, ann.x2);
      const y = Math.min(ann.y1, ann.y2);
      const w = Math.abs(ann.x2 - ann.x1);
      const h = Math.abs(ann.y2 - ann.y1);
      return (
        <g key={isPreview ? 'preview' : ann.id}>
          {/* Invisible wider hit area for selection */}
          {!isPreview && (
            <rect
              x={x} y={y} width={w} height={h}
              fill="transparent" stroke="transparent" strokeWidth={sw + 3}
              style={{ cursor: isSelected ? 'move' : 'pointer' }}
              onMouseDown={(e) => handleAnnMouseDown(e, ann.id, null)}
            />
          )}
          <rect
            x={x} y={y} width={w} height={h}
            fill="none"
            stroke={ann.color}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ pointerEvents: 'none' }}
            opacity={isPreview ? 0.6 : 1}
          />
          {isSelected && !isPreview && (
            <>
              {/* Selection dashes */}
              <rect
                x={x} y={y} width={w} height={h}
                fill="none" stroke="white" strokeWidth={sw * 0.5}
                strokeDasharray={`${hs * 1.5} ${hs}`}
                style={{ pointerEvents: 'none' }}
              />
              {/* Corner handles */}
              {([
                ['tl', x, y],
                ['tr', x + w, y],
                ['bl', x, y + h],
                ['br', x + w, y + h],
              ] as [string, number, number][]).map(([id, hx, hy]) => (
                <rect
                  key={id}
                  x={hx - hs / 2} y={hy - hs / 2} width={hs} height={hs}
                  fill="white" stroke={ann.color} strokeWidth={0.3}
                  style={{ cursor: id === 'tl' || id === 'br' ? 'nwse-resize' : 'nesw-resize' }}
                  onMouseDown={(e) => handleAnnMouseDown(e, ann.id, id)}
                />
              ))}
              {/* Delete button */}
              <g
                style={{ cursor: 'pointer' }}
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); deleteAnnotation(ann.id); }}
              >
                <circle cx={x + w} cy={y} r={hs * 0.9} fill="#ef4444" />
                <text x={x + w} y={y} textAnchor="middle" dominantBaseline="central" fontSize={hs * 1.1} fill="white" style={{ pointerEvents: 'none', fontWeight: 'bold' }}>×</text>
              </g>
            </>
          )}
        </g>
      );
    } else {
      // line
      return (
        <g key={isPreview ? 'preview' : ann.id}>
          {!isPreview && (
            <line
              x1={ann.x1} y1={ann.y1} x2={ann.x2} y2={ann.y2}
              stroke="transparent" strokeWidth={sw + 4}
              style={{ cursor: isSelected ? 'move' : 'pointer' }}
              onMouseDown={(e) => handleAnnMouseDown(e, ann.id, null)}
            />
          )}
          <line
            x1={ann.x1} y1={ann.y1} x2={ann.x2} y2={ann.y2}
            stroke={ann.color} strokeWidth={sw} strokeLinecap="round"
            style={{ pointerEvents: 'none' }}
            opacity={isPreview ? 0.6 : 1}
          />
          {isSelected && !isPreview && (
            <>
              {/* Endpoints */}
              {([
                ['start', ann.x1, ann.y1],
                ['end', ann.x2, ann.y2],
              ] as [string, number, number][]).map(([id, hx, hy]) => (
                <circle
                  key={id}
                  cx={hx} cy={hy} r={hs * 0.6}
                  fill="white" stroke={ann.color} strokeWidth={0.3}
                  style={{ cursor: 'crosshair' }}
                  onMouseDown={(e) => handleAnnMouseDown(e, ann.id, id)}
                />
              ))}
              {/* Delete button */}
              <g
                style={{ cursor: 'pointer' }}
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); deleteAnnotation(ann.id); }}
              >
                <circle cx={(ann.x1 + ann.x2) / 2} cy={(ann.y1 + ann.y2) / 2 - hs * 1.2} r={hs * 0.9} fill="#ef4444" />
                <text x={(ann.x1 + ann.x2) / 2} y={(ann.y1 + ann.y2) / 2 - hs * 1.2} textAnchor="middle" dominantBaseline="central" fontSize={hs * 1.1} fill="white" style={{ pointerEvents: 'none', fontWeight: 'bold' }}>×</text>
              </g>
            </>
          )}
        </g>
      );
    }
  };

  const imgTransformStyle = {
    transform: `scale(${scale}) translate(${translate.x / scale}px, ${translate.y / scale}px)`,
    transformOrigin: 'center center',
    cursor: drawMode ? 'crosshair' : (isShiftHeld && mediaType ? 'crosshair' : (scale > 1 ? (isDragging.current ? 'grabbing' : 'grab') : 'default')),
    transition: isDragging.current ? 'none' : 'transform 0.1s ease-out',
    userSelect: 'none' as const,
  };

  return (
    <div className={`fixed inset-0 z-50 bg-black/90 flex flex-col titlebar-no-drag${(playerBarVisible || showRecordingBar) ? ' pb-14' : ''}`}>

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

        {/* OCR caption2 extraction status */}
        {ocrCaption2Status !== 'idle' && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-full text-sm font-medium z-20 flex items-center gap-2">
            {ocrCaption2Status === 'running' && (
              <>
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Extracting OCR text…
              </>
            )}
            {ocrCaption2Status === 'done' && <><span>✓</span> OCR text saved</>}
            {ocrCaption2Status === 'error' && <><span>✗</span> OCR extraction failed</>}
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
          style={imgTransformStyle}
          draggable={false}
          onClick={handleImageClick}
          onMouseDown={drawMode ? undefined : (e) => { handleOcrMouseDown(e); if (!e.shiftKey) handleMouseDown(e); }}
          onDoubleClick={handleDoubleClick}
          onLoad={handleImageLoad}
          onContextMenu={(onReplaceWithClipboard || onEditCaption || onDelete || mediaType || onExtractOcr) ? (e) => {
            e.preventDefault();
            e.stopPropagation();
            setImageContextMenu({ x: e.clientX, y: e.clientY });
          } : undefined}
        />

        {/* SVG annotation overlay — same transform as img, covers image pixels exactly */}
        {displayedSize && (annotations.length > 0 || drawMode || drawPreview !== null) && (
          <svg
            ref={svgRef}
            style={{
              position: 'absolute',
              width: displayedSize.w,
              height: displayedSize.h,
              ...imgTransformStyle,
              cursor: drawMode ? 'crosshair' : 'default',
              pointerEvents: drawMode ? 'all' : (annotations.length > 0 ? 'all' : 'none'),
            }}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            onMouseDown={drawMode ? handleSvgMouseDown : undefined}
            onClick={(e) => {
              e.stopPropagation();
              if (!drawMode) setSelectedAnnId(null);
            }}
            onContextMenu={(onReplaceWithClipboard || onEditCaption || onDelete || mediaType || onExtractOcr) ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              setImageContextMenu({ x: e.clientX, y: e.clientY });
            } : undefined}
          >
            {/* Transparent background to catch clicks for deselect / draw start */}
            <rect x="0" y="0" width="100" height="100" fill="transparent" />

            {annotations.map(ann => renderAnnotation(ann))}

            {drawPreview && (() => {
              const p = drawPreview;
              const fakeAnn: ImageAnnotation = {
                id: -1, image_type: 'image', image_id: 0, ann_type: activeTool,
                x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2,
                color: activeColor, stroke_width: STROKE_WIDTH, created_at: '',
              };
              return renderAnnotation(fakeAnn, true);
            })()}
          </svg>
        )}

        {/* Tag chips — top-left */}
        {currentImageTags.length > 0 && (
          <div className="absolute top-12 left-20 flex flex-wrap gap-1 pointer-events-none">
            {currentImageTags.map(tag => (
              <span
                key={tag.name}
                className="bg-orange-500/80 text-white text-[10px] font-medium px-1.5 py-0.5 rounded-full"
              >
                #{tag.name}
              </span>
            ))}
          </div>
        )}

        {/* OCR selection rectangle overlay */}
        {ocrSelectStart && ocrSelectEnd && (() => {
          const x = Math.min(ocrSelectStart.x, ocrSelectEnd.x);
          const y = Math.min(ocrSelectStart.y, ocrSelectEnd.y);
          const w = Math.abs(ocrSelectEnd.x - ocrSelectStart.x);
          const h = Math.abs(ocrSelectEnd.y - ocrSelectStart.y);
          return (
            <div
              style={{ position: 'fixed', left: x, top: y, width: w, height: h, pointerEvents: 'none', zIndex: 55 }}
              className="border-2 border-dashed border-blue-400 bg-blue-400/15"
            />
          );
        })()}

        {/* OCR loading spinner */}
        {isOcrLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-50">
            <div className="text-white text-sm bg-black/70 px-4 py-2 rounded-lg">
              Detecting text…
            </div>
          </div>
        )}

        {/* Shift+drag hint */}
        {!isOcrLoading && !ocrSelectStart && mediaType && image?.id && (
          <div className="absolute bottom-2 right-2 text-[11px] text-white/25 pointer-events-none select-none">
            Shift + drag to tag from text
          </div>
        )}

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
            {onExtractOcr && (onDelete || mediaType || onEditCaption || onReplaceWithClipboard) && (
              <div className="border-t border-gray-700 my-1" />
            )}
            {onExtractOcr && (
              <button
                className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
                onClick={async () => {
                  setImageContextMenu(null);
                  setOcrCaption2Status('running');
                  try {
                    await onExtractOcr();
                    setOcrCaption2Status('done');
                  } catch {
                    setOcrCaption2Status('error');
                  }
                  setTimeout(() => setOcrCaption2Status('idle'), 3000);
                }}
              >
                <span>🔍</span> Extract OCR text
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
            ocrSuggestion={ocrSuggestion ?? undefined}
            onClose={() => {
              setShowTagModal(false);
              setOcrSuggestion(null);
              window.electronAPI.tags.getByMedia(mediaType, image.id!).then(tags => {
                setCurrentImageTags(tags);
                onTagsChanged?.(image.id!, tags.map((t: { name: string }) => t.name));
              });
            }}
          />
        )}

        {/* Audio tag modal */}
        {audioTagModalId != null && audioTagMediaType && (
          <TagModal
            mediaType={audioTagMediaType as import('../../types').MediaTagType}
            mediaId={audioTagModalId}
            title="Audio Tags"
            onClose={() => {
              const closingId = audioTagModalId;
              setAudioTagModalId(null);
              setAudioTagMediaType(null);
              onAudioTagsChanged?.(closingId);
            }}
          />
        )}
      </div>

      {/* ── Annotation toolbar (only when mediaType present so we can persist) ── */}
      {mediaType && image?.id && (
        <div
          className="flex-shrink-0 bg-black/70 border-t border-white/10 px-4 py-1.5 flex items-center gap-3"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Draw toggle */}
          <button
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              drawMode
                ? 'bg-blue-600 text-white'
                : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
            }`}
            onClick={() => {
              setDrawMode(d => !d);
              setSelectedAnnId(null);
              setDrawPreview(null);
              isDrawingRef.current = false;
            }}
            title="Toggle draw mode (Esc to exit)"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M2 10L8.5 2.5a1.5 1.5 0 012 2L4 12H2V10z"/>
            </svg>
            Draw
          </button>

          {/* Tool selector — only when in draw mode */}
          {drawMode && (
            <>
              <div className="w-px h-4 bg-white/20" />
              <div className="flex gap-1">
                <button
                  className={`flex items-center justify-center w-7 h-7 rounded transition-colors ${
                    activeTool === 'rect'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white'
                  }`}
                  onClick={() => setActiveTool('rect')}
                  title="Rectangle"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="1.5" y="2.5" width="9" height="7" rx="0.5"/>
                  </svg>
                </button>
                <button
                  className={`flex items-center justify-center w-7 h-7 rounded transition-colors ${
                    activeTool === 'line'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white'
                  }`}
                  onClick={() => setActiveTool('line')}
                  title="Line"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <line x1="1.5" y1="10.5" x2="10.5" y2="1.5"/>
                  </svg>
                </button>
              </div>

              {/* Color palette */}
              <div className="w-px h-4 bg-white/20" />
              <div className="flex gap-1">
                {ANNOTATION_COLORS.map(color => (
                  <button
                    key={color}
                    className={`w-5 h-5 rounded-full transition-transform ${
                      activeColor === color ? 'scale-125 ring-2 ring-white ring-offset-1 ring-offset-black' : 'hover:scale-110'
                    }`}
                    style={{ backgroundColor: color, border: color === '#ffffff' ? '1px solid rgba(255,255,255,0.3)' : 'none' }}
                    onClick={() => setActiveColor(color)}
                    title={color}
                  />
                ))}
              </div>
            </>
          )}

          {/* Clear all — only when there are annotations */}
          {annotations.length > 0 && (
            <>
              <div className="w-px h-4 bg-white/20" />
              <button
                className="flex items-center gap-1 px-2 py-1 rounded text-xs text-red-400/80 hover:text-red-400 hover:bg-white/10 transition-colors"
                onClick={clearAllAnnotations}
                title="Clear all annotations"
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M3 10L9 4M9 10L3 4"/>
                </svg>
                Clear all
              </button>
            </>
          )}

          {/* Hint text */}
          {drawMode && (
            <span className="ml-auto text-white/30 text-[10px]">
              Drag to draw · Esc to exit
            </span>
          )}
          {!drawMode && annotations.length > 0 && selectedAnnId === null && (
            <span className="ml-auto text-white/30 text-[10px]">
              Click shape to select · Del to delete
            </span>
          )}
        </div>
      )}

      {/* ── Strip: related images (left) + audios (right) — also shown in child lightbox if audios exist ── */}
      {((!disableChildImages && mediaType && image?.id) || (disableChildImages && currentImageAudios.length > 0)) && (
        <div
          className="flex-shrink-0 bg-black/80 border-t border-white/10 px-4 py-2 flex items-center gap-3"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Left: thumbnail row — only in parent lightbox */}
          {!disableChildImages && <div className="flex-1 min-w-0">
            <p className="text-white/40 text-[10px] mb-1">Related images</p>
            <DndContext
              sensors={childSensors}
              collisionDetection={closestCenter}
              onDragStart={({ active }) => setDraggingChildId(active.id as number)}
              onDragEnd={handleChildDragEnd}
            >
              <SortableContext items={imageChildren.map(c => c.id)} strategy={horizontalListSortingStrategy}>
                <div className="flex gap-2 overflow-x-auto pb-0.5">
                  {imageChildren.map(child => (
                    <SortableChildThumb
                      key={child.id}
                      child={child}
                      audioCount={(childAudiosMap[child.id] ?? []).length}
                      tagCount={childTagCountMap[child.id] ?? 0}
                      onOpen={() => setSelectedChildId(child.id)}
                      onDelete={() => setPendingDeleteChild(child.id)}
                    />
                  ))}
                  {/* Add placeholder — outside SortableContext so it's not draggable */}
                  <button
                    className="flex-shrink-0 w-14 h-14 rounded-lg border-2 border-dashed border-white/20 hover:border-white/40 flex items-center justify-center transition-colors"
                    onClick={handleAddChild}
                    title="Paste image from clipboard (Cmd+V)"
                  >
                    <span className="text-white/40 text-2xl leading-none">+</span>
                  </button>
                </div>
              </SortableContext>
              <DragOverlay>
                {draggingChildId != null && (() => {
                  const child = imageChildren.find(c => c.id === draggingChildId);
                  if (!child) return null;
                  return (
                    <div className="w-14 h-14 rounded-lg overflow-hidden shadow-2xl ring-2 ring-white/50 opacity-90">
                      <img
                        src={window.electronAPI.paths.getFileUrl(child.thumbnail_path ?? child.file_path)}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  );
                })()}
              </DragOverlay>
            </DndContext>
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
            onReplaceWithClipboard={handleReplaceChildWithClipboard}
            onEditCaption={() => {
              setChildCaptionEdit({ childId: child.id, value: child.caption ?? '' });
            }}
            onExtractOcr={async () => {
              await window.electronAPI.ocr.extractCaption2('image_child', child.id, child.file_path);
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
          className="absolute bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-700 z-10"
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
