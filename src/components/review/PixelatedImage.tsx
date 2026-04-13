import { useEffect, useRef, useState } from 'react';
import type { ReviewMask } from '../../types';

interface PixelatedImageProps {
  src: string;
  masks: ReviewMask[];
  revealedMaskIds: Set<number>;
  onMaskClick?: (maskId: number) => void;
  className?: string;
}

/** Block sizes per pixelation level (1=nearly readable, 5=very hard) */
const BLOCK_SIZES = [4, 6, 9, 14, 22] as const;

export default function PixelatedImage({
  src,
  masks,
  revealedMaskIds,
  onMaskClick,
  className = '',
}: PixelatedImageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [displaySize, setDisplaySize] = useState<{ w: number; h: number } | null>(null);
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

  // Observe container size to know the display dimensions
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

  // Render to canvas whenever anything changes
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !naturalSize || !displaySize) return;

    const { w: dw, h: dh } = displaySize;
    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Compute contain-fit dimensions (same as CSS object-fit: contain)
    const scale = Math.min(dw / naturalSize.w, dh / naturalSize.h);
    const fitW = naturalSize.w * scale;
    const fitH = naturalSize.h * scale;
    const offsetX = (dw - fitW) / 2;
    const offsetY = (dh - fitH) / 2;

    // Draw base image
    ctx.clearRect(0, 0, dw, dh);
    ctx.drawImage(img, offsetX, offsetY, fitW, fitH);

    // Apply pixelation for unrevealed masks
    for (const mask of masks) {
      if (revealedMaskIds.has(mask.id)) continue;

      // Convert normalized coords to canvas pixel coords (round to avoid float issues)
      const mx = Math.round(offsetX + mask.x * fitW);
      const my = Math.round(offsetY + mask.y * fitH);
      const mw = Math.round(mask.w * fitW);
      const mh = Math.round(mask.h * fitH);

      if (mw < 2 || mh < 2) continue;

      const blockSize = BLOCK_SIZES[(mask.pixelation_level - 1) as 0 | 1 | 2 | 3 | 4] ?? 16;

      // Map mask coords back to image natural pixel space
      const imgScaleX = naturalSize.w / fitW;
      const imgScaleY = naturalSize.h / fitH;
      const srcX = (mx - offsetX) * imgScaleX;
      const srcY = (my - offsetY) * imgScaleY;
      const srcW = mw * imgScaleX;
      const srcH = mh * imgScaleY;

      // Pixelate: downscale into cols×rows, then upscale with nearest-neighbor
      const cols = Math.max(2, Math.ceil(mw / blockSize));
      const rows = Math.max(2, Math.ceil(mh / blockSize));

      const offCanvas = document.createElement('canvas');
      offCanvas.width = cols;
      offCanvas.height = rows;
      const offCtx = offCanvas.getContext('2d');
      if (!offCtx) continue;

      // Read directly from original image (not from potentially-mutated canvas)
      offCtx.imageSmoothingEnabled = true;
      offCtx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, cols, rows);

      // Scale back up with nearest-neighbor so block edges are hard
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(offCanvas, 0, 0, cols, rows, mx, my, mw, mh);
      ctx.imageSmoothingEnabled = true;
    }
  }, [naturalSize, displaySize, masks, revealedMaskIds, src]);

  // Handle canvas click — find which mask was clicked
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onMaskClick || !naturalSize || !displaySize) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    const { w: dw, h: dh } = displaySize;
    const scale = Math.min(dw / naturalSize.w, dh / naturalSize.h);
    const fitW = naturalSize.w * scale;
    const fitH = naturalSize.h * scale;
    const offsetX = (dw - fitW) / 2;
    const offsetY = (dh - fitH) / 2;

    for (const mask of masks) {
      if (revealedMaskIds.has(mask.id)) continue;
      const mx = offsetX + mask.x * fitW;
      const my = offsetY + mask.y * fitH;
      const mw = mask.w * fitW;
      const mh = mask.h * fitH;
      if (cx >= mx && cx <= mx + mw && cy >= my && cy <= my + mh) {
        onMaskClick(mask.id);
        return;
      }
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ imageRendering: 'pixelated' }}
        onClick={handleCanvasClick}
      />
      {/* Hint text overlays for unrevealed masks */}
      {naturalSize && displaySize && masks.map(mask => {
        if (revealedMaskIds.has(mask.id) || !mask.hint_text) return null;
        const { w: dw, h: dh } = displaySize;
        const scale = Math.min(dw / naturalSize.w, dh / naturalSize.h);
        const fitW = naturalSize.w * scale;
        const fitH = naturalSize.h * scale;
        const offsetX = (dw - fitW) / 2;
        const offsetY = (dh - fitH) / 2;
        const mx = offsetX + mask.x * fitW;
        const my = offsetY + mask.y * fitH;
        const mw = mask.w * fitW;
        return (
          <div
            key={mask.id}
            className="absolute pointer-events-none px-1.5 py-0.5 rounded bg-black/70 text-white text-[11px] max-w-[200px] truncate"
            style={{ left: mx, top: my - 22, maxWidth: mw }}
          >
            {mask.hint_text}
          </div>
        );
      })}
      {/* Click-to-reveal cursor hint */}
      {masks.some(m => !revealedMaskIds.has(m.id)) && onMaskClick && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white/70 text-xs px-3 py-1 rounded-full pointer-events-none">
          Click a masked area to reveal
        </div>
      )}
    </div>
  );
}
