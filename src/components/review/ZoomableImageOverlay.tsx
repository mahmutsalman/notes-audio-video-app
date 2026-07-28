import { useCallback, useEffect, useRef, useState } from 'react';

interface ZoomableImageOverlayProps {
  /** Already a media:// / file URL — callers resolve paths themselves. */
  src: string;
  alt?: string;
  onClose: () => void;
  /**
   * Stacking context, passed as a LITERAL Tailwind class (e.g. "z-[70]") so the JIT compiler
   * sees it at the call site. The history drawer sits at z-[70] (over the drawer, under the
   * question popup at z-[80]); the session's side-image overlay lives at z-[60].
   */
  zClassName: string;
}

/** Fit-size is 1×; beyond ~8× a screenshot is all block artifacts. */
const MIN_SCALE = 1;
const MAX_SCALE = 8;
/** Double-click zoom level — enough to read code in a screenshot without hunting for it. */
const DBLCLICK_SCALE = 2.5;

/**
 * Full-screen dark overlay for one image, with zoom and pan. The shared replacement for the two
 * bare "enlarge" overlays (history drawer + session side images) that could only show fit-size.
 *
 * Gestures:
 *  - wheel / trackpad pinch / Cmd+scroll — zoom, centered on the cursor
 *  - drag — pan while zoomed (a real pan suppresses the click so it can't close the overlay)
 *  - double-click — toggle fit ↔ 2.5× at the cursor; the bottom pill also resets
 *  - backdrop click — reset zoom first, close at fit (ImageLightbox's idiom); ✕ always closes
 *
 * Escape stays with the CALLERS: both current hosts already own a capture-phase Escape handler
 * wired into the review session's stand-down contract (`onOverlayChange` / `enlargedItemImage`),
 * and a second listener here would double-handle the key.
 *
 * The zoom math is deliberately the same as the session's card viewer (see ReviewSession's
 * clampImgTranslate / wheel handler): transform `scale(s) translate(t/s)` on the img, translate
 * clamped so an image edge never crosses its viewport edge. Extracting that logic out of the
 * session was not worth the risk — it is entangled with mask click-suppression — so this is a
 * small self-contained copy of the idiom, not a fork of its behavior.
 */
export default function ZoomableImageOverlay({ src, alt = '', onClose, zClassName }: ZoomableImageOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const translateRef = useRef(translate);
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { translateRef.current = translate; }, [translate]);

  // Fresh image, fresh view — relevant when a host swaps `src` without unmounting.
  useEffect(() => { setScale(1); setTranslate({ x: 0, y: 0 }); }, [src]);

  // Keep the image from panning past the viewport edge. Measured against the img's LAYOUT size
  // (offsetWidth/Height ignore the transform); the img is centered in the container, so its
  // untransformed center is the container center and the clamp is symmetric.
  const clampTranslate = useCallback((t: { x: number; y: number }, s: number) => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img) return t;
    const maxX = Math.max(0, (img.offsetWidth * s - container.clientWidth) / 2);
    const maxY = Math.max(0, (img.offsetHeight * s - container.clientHeight) / 2);
    return { x: Math.max(-maxX, Math.min(maxX, t.x)), y: Math.max(-maxY, Math.min(maxY, t.y)) };
  }, []);

  /** Zoom to `next`, keeping the image point under (clientX, clientY) fixed on screen. */
  const zoomAt = useCallback((next: number, clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const cursorX = clientX - (rect.left + rect.width / 2);
    const cursorY = clientY - (rect.top + rect.height / 2);
    setScale(prev => {
      const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
      if (clamped === 1) {
        setTranslate({ x: 0, y: 0 });
      } else if (clamped !== prev) {
        const ratio = clamped / prev;
        setTranslate(t => clampTranslate({
          x: cursorX - ratio * (cursorX - t.x),
          y: cursorY - ratio * (cursorY - t.y),
        }, clamped));
      }
      return clamped;
    });
  }, [clampTranslate]);

  // Wheel → zoom at the cursor. Pinch (ctrlKey) and Cmd+scroll keep the factor the session's
  // card viewer uses; a plain wheel notch (±100 deltaY) goes through a gentler exponential so a
  // mouse doesn't jump a full 2× per click. Pan is drag-only here — with the whole screen given
  // to one image there is nothing else for the wheel to mean, so it always zooms.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = (e.ctrlKey || e.metaKey)
        ? 1 - e.deltaY * 0.01
        : Math.exp(-e.deltaY * 0.002);
      zoomAt(scaleRef.current * Math.min(2, Math.max(0.5, factor)), e.clientX, e.clientY);
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // Press-and-drag to pan. Window listeners rather than setPointerCapture, and a slop threshold
  // that suppresses the click a drag ends in — otherwise releasing a pan over the backdrop would
  // close the overlay (same lesson as the session's mask click-suppression).
  const [dragging, setDragging] = useState(false);
  const dragOriginRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const suppressClickRef = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (scaleRef.current <= 1 || e.button !== 0) return;
    dragOriginRef.current = {
      x: e.clientX, y: e.clientY,
      tx: translateRef.current.x, ty: translateRef.current.y,
    };
    suppressClickRef.current = false;
    setDragging(true);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const endDrag = () => { dragOriginRef.current = null; setDragging(false); };
    const onMove = (e: PointerEvent) => {
      const origin = dragOriginRef.current;
      if (!origin) return;
      const dx = e.clientX - origin.x;
      const dy = e.clientY - origin.y;
      if (!suppressClickRef.current && Math.hypot(dx, dy) > 4) suppressClickRef.current = true;
      setTranslate(clampTranslate({ x: origin.tx + dx, y: origin.ty + dy }, scaleRef.current));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    // Releasing the button outside the window never fires pointerup here; losing focus is the
    // signal that the gesture is over (keeps the image from gluing itself to the cursor).
    window.addEventListener('blur', endDrag);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
      window.removeEventListener('blur', endDrag);
    };
  }, [dragging, clampTranslate]);

  const reset = useCallback(() => { setScale(1); setTranslate({ x: 0, y: 0 }); }, []);

  const onBackdropClick = useCallback(() => {
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }
    if (scaleRef.current > 1) reset();
    else onClose();
  }, [onClose, reset]);

  const onImageDoubleClick = useCallback((e: React.MouseEvent) => {
    if (scaleRef.current > 1) reset();
    else zoomAt(DBLCLICK_SCALE, e.clientX, e.clientY);
  }, [reset, zoomAt]);

  return (
    <div
      ref={containerRef}
      onClick={onBackdropClick}
      className={`fixed inset-0 ${zClassName} bg-black/90 flex items-center justify-center p-8 overflow-hidden ${
        scale > 1 ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-out'
      }`}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        draggable={false}
        onClick={e => {
          // A click that ends a pan bubbles here first; eat it so it can't reach the backdrop.
          if (suppressClickRef.current) { suppressClickRef.current = false; }
          e.stopPropagation();
        }}
        onDoubleClick={onImageDoubleClick}
        onPointerDown={onPointerDown}
        className="max-w-full max-h-full object-contain select-none"
        style={{
          transform: `scale(${scale}) translate(${translate.x / scale}px, ${translate.y / scale}px)`,
          transformOrigin: 'center center',
          // Smooth the wheel/double-click steps; a live drag must track the cursor exactly.
          transition: dragging ? 'none' : 'transform 0.12s ease-out',
        }}
      />
      <button
        onClick={e => { e.stopPropagation(); onClose(); }}
        className="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl leading-none"
        title="Close (Esc)"
      >
        ✕
      </button>
      {/* Zoom readout doubling as the reset affordance — bottom-center pill, the same chrome
          idiom as PixelatedImage's "click a masked area" hint. */}
      {scale > 1 && (
        <button
          onClick={e => { e.stopPropagation(); reset(); }}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 hover:bg-black/80
                     text-white/70 hover:text-white text-xs px-3 py-1 rounded-full tabular-nums transition-colors"
          title="Reset zoom (or double-click the image)"
        >
          {scale.toFixed(1)}× — reset
        </button>
      )}
      {scale === 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/40 text-white/40 text-[11px] px-3 py-1 rounded-full pointer-events-none">
          Scroll or double-click to zoom
        </div>
      )}
    </div>
  );
}
