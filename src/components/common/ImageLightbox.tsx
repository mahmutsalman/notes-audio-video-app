import { useState, useEffect, useRef, useCallback } from 'react';

interface LightboxImage {
  file_path: string;
  caption: string | null;
}

interface ImageLightboxProps {
  images: LightboxImage[];
  selectedIndex: number;
  onClose: () => void;
  onNavigate: (newIndex: number) => void;
}

export default function ImageLightbox({ images, selectedIndex, onClose, onNavigate }: ImageLightboxProps) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [showZoomIndicator, setShowZoomIndicator] = useState(false);

  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const hasDragged = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const translateAtDragStart = useRef({ x: 0, y: 0 });
  const zoomIndicatorTimeout = useRef<ReturnType<typeof setTimeout>>();
  const scaleRef = useRef(1);

  const image = images[selectedIndex];

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
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      {/* Close button */}
      <button
        className="absolute top-4 right-4 text-white text-2xl hover:text-gray-300 z-10"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      >
        ×
      </button>

      {/* Image counter */}
      <div className="absolute top-4 left-4 text-white text-lg font-medium">
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
                     hover:text-gray-300 transition-colors px-2"
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

      {/* Caption */}
      {image.caption && (
        <p className="absolute bottom-4 left-0 right-0 text-sm text-white/90 dark:text-white/80 text-center italic font-light max-w-2xl mx-auto px-4">
          {image.caption}
        </p>
      )}

      {/* Next button */}
      {selectedIndex < images.length - 1 && (
        <button
          className="absolute right-4 top-1/2 -translate-y-1/2 text-white text-5xl
                     hover:text-gray-300 transition-colors px-2"
          onClick={(e) => { e.stopPropagation(); onNavigate(selectedIndex + 1); }}
        >
          ›
        </button>
      )}
    </div>
  );
}
