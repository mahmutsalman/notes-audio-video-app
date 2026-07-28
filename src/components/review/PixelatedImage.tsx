import { useEffect, useRef, useState } from 'react';
import type { ReviewMask } from '../../types';

interface PixelatedImageProps {
  src: string;
  masks: ReviewMask[];
  revealedMaskIds: Set<number>;
  onMaskClick?: (maskId: number) => void;
  /**
   * Left-click that hit no blurred mask. The session uses it to put back whatever right-click last
   * blurred, so the reveal/re-blur loop needs no aiming.
   */
  onEmptyClick?: () => void;
  /**
   * Right-click anywhere on the image, carrying the REVEALED mask under the pointer or null if
   * there was none. Deliberately reports rather than decides: which mask actually gets blurred is
   * the session's policy (pointing wins, else most-recent, unless the scope toggle is on), and
   * this component has no idea about reveal order or that toggle.
   */
  onContextMenuAt?: (maskId: number | null) => void;
  /** Whether a left-click off a mask would restore something — drives the hint pill only. */
  canRestore?: boolean;
  className?: string;
  /**
   * Zoom + pan folded INTO the canvas, not applied as a CSS transform on an ancestor (ADR-0010).
   * A CSS transform magnifies the finished bitmap and blurs; drawing the source image at the
   * zoomed size re-samples from the original, so the revealed image stays sharp. `pan` is in
   * screen (CSS) pixels; the net transform is `screen = center + zoom*(p - center) + pan`.
   */
  zoom?: number;
  pan?: { x: number; y: number };
}

/** Block sizes per pixelation level (1=nearly readable, 5=very hard), in zoom-1 CSS pixels. */
const BLOCK_SIZES = [4, 6, 9, 14, 22] as const;

/** Hint pill metrics at zoom 1, in CSS pixels. Every one of them is multiplied by the zoom
 *  factor below, so the pill keeps its proportions instead of just growing its text. */
const HINT_FONT = 14;
const HINT_PAD_X = 6;
const HINT_PAD_Y = 3;
const HINT_GAP = 6;
const HINT_MIN_WIDTH = 220;
/** The pill scales WITH zoom — at a fixed size it shrank against the magnified mask until it was
 *  unreadable at 5×. Growth saturates here because scaling all the way to 5× would lay a ~70px
 *  pill across the surrounding image, hiding the very screenshot being read. */
const HINT_MAX_SCALE = 3;

/** Subtle frame around each unrevealed mask so its EXTENT is visible even where the pixelation
 *  blends into the surrounding image. Muted red at low alpha = a hint, not a box; stronger on
 *  hover to pair with the pointer cursor. Width/radius are in CSS px and stay constant across
 *  zoom — the outline is UI chrome, not image content, so it must not fatten when magnified. */
const OUTLINE_COLOR = 'rgba(224, 92, 74, 0.55)';
const OUTLINE_COLOR_HOVER = 'rgba(224, 92, 74, 0.9)';
const OUTLINE_WIDTH = 1.5;
const OUTLINE_RADIUS = 3;

export default function PixelatedImage({
  src,
  masks,
  revealedMaskIds,
  onMaskClick,
  onEmptyClick,
  onContextMenuAt,
  canRestore = false,
  className = '',
  zoom = 1,
  pan = { x: 0, y: 0 },
}: PixelatedImageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [displaySize, setDisplaySize] = useState<{ w: number; h: number } | null>(null);
  const [hoveredMaskId, setHoveredMaskId] = useState<number | null>(null);
  /** Separate from hoveredMaskId, which only tracks masks that have hint text to show. */
  const [overClickableMask, setOverClickableMask] = useState(false);
  /** Over an already-revealed mask, which right-click can put back. */
  const [overHideableMask, setOverHideableMask] = useState(false);
  /** ANY unrevealed mask under the pointer (hint text or not) — drives the stronger outline. */
  const [hoveredOutlineMaskId, setHoveredOutlineMaskId] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load image and measure it
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.src = src;
  }, [src]);

  // Observe container size to know the display dimensions (CSS pixels)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDisplaySize({ w: Math.floor(width), h: Math.floor(height) });
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // The zoom-1 contain-fit rectangle of the image within the display box. Every coordinate below
  // is expressed against this rect, then run through the zoom/pan transform.
  const fitRect = (dw: number, dh: number, nat: { w: number; h: number }) => {
    const scale = Math.min(dw / nat.w, dh / nat.h);
    const fitW = nat.w * scale;
    const fitH = nat.h * scale;
    return { offsetX: (dw - fitW) / 2, offsetY: (dh - fitH) / 2, fitW, fitH };
  };

  // Render to canvas whenever anything changes, including zoom/pan — the whole point is that
  // zooming re-runs the draw and re-samples the source, rather than magnifying a stale bitmap.
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !naturalSize || !displaySize) return;

    const { w: dw, h: dh } = displaySize;
    const dpr = window.devicePixelRatio || 1;

    // Backing store at device resolution × nothing-extra: the zoom lives in the draw math, not in
    // the canvas size, so a fixed backing store stays 1:1 with device pixels and never soft-scales.
    canvas.width = Math.round(dw * dpr);
    canvas.height = Math.round(dh * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cxc = dw / 2, cyc = dh / 2;
    // Fit-space point -> device backing-store pixel.
    const sx = (px: number) => (cxc + zoom * (px - cxc) + pan.x) * dpr;
    const sy = (py: number) => (cyc + zoom * (py - cyc) + pan.y) * dpr;

    const { offsetX, offsetY, fitW, fitH } = fitRect(dw, dh, naturalSize);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    // Base image: drawn at the zoomed size straight from the source, so detail is source-limited,
    // not bitmap-limited.
    ctx.drawImage(img, sx(offsetX), sy(offsetY), fitW * zoom * dpr, fitH * zoom * dpr);

    // Pixelate the unrevealed masks. Block sizes are computed against the zoom-1 CSS size so a mask
    // looks identical to before at zoom 1, and its blocks magnify with zoom just as the old CSS
    // transform made them.
    for (const mask of masks) {
      if (revealedMaskIds.has(mask.id)) continue;

      const mx0 = offsetX + mask.x * fitW;
      const my0 = offsetY + mask.y * fitH;
      const mw0 = mask.w * fitW;
      const mh0 = mask.h * fitH;
      if (mw0 < 2 || mh0 < 2) continue;

      const blockSize = BLOCK_SIZES[(mask.pixelation_level - 1) as 0 | 1 | 2 | 3 | 4] ?? 16;
      const cols = Math.max(2, Math.ceil(mw0 / blockSize));
      const rows = Math.max(2, Math.ceil(mh0 / blockSize));

      // Read the mask region from the ORIGINAL image (natural pixel space) — independent of zoom.
      const srcX = mask.x * naturalSize.w;
      const srcY = mask.y * naturalSize.h;
      const srcW = mask.w * naturalSize.w;
      const srcH = mask.h * naturalSize.h;

      const offCanvas = document.createElement('canvas');
      offCanvas.width = cols;
      offCanvas.height = rows;
      const offCtx = offCanvas.getContext('2d');
      if (!offCtx) continue;
      offCtx.imageSmoothingEnabled = true;
      offCtx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, cols, rows);

      // Nearest-neighbour upscale into the zoomed destination rect → hard block edges.
      const dstX = sx(mx0), dstY = sy(my0);
      const dstW = mw0 * zoom * dpr, dstH = mh0 * zoom * dpr;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(offCanvas, 0, 0, cols, rows, dstX, dstY, dstW, dstH);
      ctx.imageSmoothingEnabled = true;

      // Frame the mask so its extent reads clearly against the image. Stroked half a line-width
      // inside the rect so the outline hugs the pixelated area without spilling onto the image.
      const lw = OUTLINE_WIDTH * dpr;
      if (dstW > lw * 2 && dstH > lw * 2) {
        ctx.strokeStyle = mask.id === hoveredOutlineMaskId ? OUTLINE_COLOR_HOVER : OUTLINE_COLOR;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.roundRect(dstX + lw / 2, dstY + lw / 2, dstW - lw, dstH - lw, OUTLINE_RADIUS * dpr);
        ctx.stroke();
      }
    }
  }, [naturalSize, displaySize, masks, revealedMaskIds, src, zoom, pan.x, pan.y, hoveredOutlineMaskId]);

  // Map a client point to fit-space, inverting the zoom/pan transform, so hit-testing stays correct
  // now that the zoom lives in the canvas rather than a CSS transform on an ancestor.
  //
  // `wantRevealed` picks which half of the masks to test: left-click reveals, so it hunts the
  // hidden ones; right-click re-blurs, so it hunts the revealed ones. Same geometry either way —
  // a revealed mask still occupies its rectangle, it just isn't painted over any more.
  const maskAtPoint = (
    clientX: number,
    clientY: number,
    wantRevealed = false,
  ): ReviewMask | null => {
    if (!naturalSize || !displaySize) return null;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const { w: dw, h: dh } = displaySize;
    // client -> canvas CSS space (rect may differ from dw/dh by sub-pixel rounding)
    const csx = (clientX - rect.left) * (rect.width ? dw / rect.width : 1);
    const csy = (clientY - rect.top) * (rect.height ? dh / rect.height : 1);
    // canvas CSS space -> fit space (inverse transform)
    const cxc = dw / 2, cyc = dh / 2;
    const fx = cxc + (csx - cxc - pan.x) / zoom;
    const fy = cyc + (csy - cyc - pan.y) / zoom;

    const { offsetX, offsetY, fitW, fitH } = fitRect(dw, dh, naturalSize);
    for (const mask of masks) {
      if (revealedMaskIds.has(mask.id) !== wantRevealed) continue;
      const mx = offsetX + mask.x * fitW;
      const my = offsetY + mask.y * fitH;
      const mw = mask.w * fitW;
      const mh = mask.h * fitH;
      if (fx >= mx && fx <= mx + mw && fy >= my && fy <= my + mh) return mask;
    }
    return null;
  };

  // Aiming at a blurred mask opens that one; a click that lands anywhere else asks the session to
  // undo the last blur, which is what lets the whole loop run without moving the pointer.
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const mask = onMaskClick ? maskAtPoint(e.clientX, e.clientY) : null;
    if (mask) onMaskClick!(mask.id);
    else onEmptyClick?.();
  };

  // Right-click blurs, anywhere on the image. Always preventDefault, since the gesture is now the
  // image's own everywhere rather than only over a revealed region.
  const handleCanvasContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onContextMenuAt) return;
    e.preventDefault();
    onContextMenuAt(maskAtPoint(e.clientX, e.clientY, true)?.id ?? null);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const mask = maskAtPoint(e.clientX, e.clientY);
    const id = mask && mask.hint_text ? mask.id : null;
    setHoveredMaskId(prev => (prev === id ? prev : id));
    const outlineId = mask ? mask.id : null;
    setHoveredOutlineMaskId(prev => (prev === outlineId ? prev : outlineId));
    // While zoomed, the parent shows a grab cursor for pan — which reads as "this is a drag
    // surface, not a button". Claim the cursor back over a mask so it still looks clickable.
    // Skipped mid-drag (a button is down) so a pan keeps its grabbing cursor throughout.
    const clickable = !!mask && !!onMaskClick && e.buttons === 0;
    setOverClickableMask(prev => (prev === clickable ? prev : clickable));
    // A revealed region looks exactly like the rest of the image, so nothing marks it as still
    // interactive. The context-menu cursor is the one that says "right-click hits THIS one" —
    // worth showing only over a revealed mask, since off one the gesture still works but picks
    // its target from the stack rather than from the pointer.
    const hideable = !!onContextMenuAt && !!maskAtPoint(e.clientX, e.clientY, true) && e.buttons === 0;
    setOverHideableMask(prev => (prev === hideable ? prev : hideable));
  };

  // Hint pill copy. The gestures work anywhere on the image, which is not something a pointer
  // cursor can convey on its own, so the pill says which ones are live right now. "Anywhere" is
  // only claimed once it is true — before anything has been blurred, a left-click really does
  // have to land on a mask.
  const canReveal = !!onMaskClick && masks.some(m => !revealedMaskIds.has(m.id));
  const canHide = !!onContextMenuAt && masks.some(m => revealedMaskIds.has(m.id));
  const hintParts: string[] = [];
  if (canRestore) hintParts.push('Left-click anywhere brings the last one back');
  else if (canReveal) hintParts.push('Click a masked area to reveal');
  if (canHide) hintParts.push(hintParts.length ? 'right-click blurs it again' : 'Right-click anywhere blurs the last one back');

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        // 'inherit' rather than a value of its own, so the parent's grab/grabbing cursor still
        // shows through everywhere except over a revealable mask.
        style={{ cursor: overClickableMask ? 'pointer' : overHideableMask ? 'context-menu' : 'inherit' }}
        onClick={handleCanvasClick}
        onContextMenu={handleCanvasContextMenu}
        onMouseMove={handleCanvasMouseMove}
        onMouseLeave={() => {
          setHoveredMaskId(null);
          setOverClickableMask(false);
          setOverHideableMask(false);
          setHoveredOutlineMaskId(null);
        }}
      />
      {/* Hint text overlays — shown only for the mask currently hovered, positioned through the
          same zoom/pan transform as the canvas so they track the mask, and scaled by the same zoom
          so the pill grows with the region it labels instead of shrinking against it. */}
      {naturalSize && displaySize && masks.map(mask => {
        if (revealedMaskIds.has(mask.id) || !mask.hint_text || hoveredMaskId !== mask.id) return null;
        const { w: dw, h: dh } = displaySize;
        const { offsetX, offsetY, fitW, fitH } = fitRect(dw, dh, naturalSize);
        const cxc = dw / 2, cyc = dh / 2;
        const mx0 = offsetX + mask.x * fitW;
        const my0 = offsetY + mask.y * fitH;
        const left = cxc + zoom * (mx0 - cxc) + pan.x;
        const top = cyc + zoom * (my0 - cyc) + pan.y;

        const s = Math.min(zoom, HINT_MAX_SCALE);
        const fontSize = HINT_FONT * s;
        const padX = HINT_PAD_X * s;
        const padY = HINT_PAD_Y * s;
        const gap = HINT_GAP * s;
        const maskW = mask.w * fitW * zoom;
        const maskH = mask.h * fitH * zoom;

        const hintLeft = Math.max(4, left);
        // The mask width is a FLOOR here, not a ceiling. Clamping the pill to the mask is what cut
        // most hints down to a few characters — a hint is a tooltip, not image content, so it may
        // legitimately be wider than the region it labels. Capped by the room remaining to the
        // container edge so a long hint wraps instead of running out of the view.
        const maxWidth = Math.min(Math.max(maskW, HINT_MIN_WIDTH * s), dw - hintLeft - 4);
        // Estimated rather than measured: this only decides whether the pill fits above the mask,
        // and measuring would cost a layout pass on every hover for a couple of pixels of accuracy.
        const pillH = fontSize * 1.35 + padY * 2;
        const aboveTop = top - gap - pillH;
        // At high zoom the scaled gap can push the pill off the top edge, so it flips under the
        // mask rather than being clipped away.
        const flipBelow = aboveTop < 0;

        return (
          <div
            key={mask.id}
            className="absolute pointer-events-none bg-black/80 text-white break-words line-clamp-3 shadow-lg"
            style={{
              left: hintLeft,
              top: flipBelow ? top + maskH + gap : aboveTop,
              maxWidth,
              fontSize,
              lineHeight: 1.35,
              padding: `${padY}px ${padX}px`,
              borderRadius: 4 * s,
            }}
          >
            {mask.hint_text}
          </div>
        );
      })}
      {/* Hint pill — names whichever gestures are actually available right now, so a fully
          revealed card advertises the way back instead of going silent. */}
      {hintParts.length > 0 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white/70 text-xs px-3 py-1 rounded-full pointer-events-none">
          {hintParts.join(' · ')}
        </div>
      )}
    </div>
  );
}
