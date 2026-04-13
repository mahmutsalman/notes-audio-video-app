import { useState, useRef, useCallback, useEffect } from 'react';
import type { ReviewMask } from '../../types';

interface DrawingRect {
  x: number; y: number; w: number; h: number; // normalized 0–1
}

interface MaskEditorProps {
  /** Absolute path to the image file */
  src: string;
  reviewItemId: number;
  existingMasks: ReviewMask[];
  onMasksChanged: (masks: ReviewMask[]) => void;
  onClose: () => void;
}

const LEVEL_LABELS = ['Level 1 — nearly readable', 'Level 2', 'Level 3 (default)', 'Level 4', 'Level 5 — very hard'];

export default function MaskEditor({ src, reviewItemId, existingMasks, onMasksChanged, onClose }: MaskEditorProps) {
  const [masks, setMasks] = useState<ReviewMask[]>(existingMasks);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ nx: number; ny: number } | null>(null);
  const [drawPreview, setDrawPreview] = useState<DrawingRect | null>(null);
  const [selectedMaskId, setSelectedMaskId] = useState<number | null>(null);
  const [defaultLevel, setDefaultLevel] = useState(3);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Compute the displayed image rect within the container (object-fit: contain)
  const getImageRect = useCallback((): { x: number; y: number; w: number; h: number } | null => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container) return null;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh) return null;
    const scale = Math.min(cw / nw, ch / nh);
    const fw = nw * scale;
    const fh = nh * scale;
    return { x: (cw - fw) / 2, y: (ch - fh) / 2, w: fw, h: fh };
  }, []);

  // Convert client coords to normalized image coords (0–1)
  const toNorm = useCallback((clientX: number, clientY: number): { nx: number; ny: number } | null => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const imgRect = getImageRect();
    if (!imgRect) return null;
    const lx = clientX - rect.left;
    const ly = clientY - rect.top;
    const nx = (lx - imgRect.x) / imgRect.w;
    const ny = (ly - imgRect.y) / imgRect.h;
    return { nx: Math.max(0, Math.min(1, nx)), ny: Math.max(0, Math.min(1, ny)) };
  }, [getImageRect]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const norm = toNorm(e.clientX, e.clientY);
    if (!norm) return;
    setIsDrawing(true);
    setDrawStart(norm);
    setDrawPreview(null);
    setSelectedMaskId(null);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDrawing || !drawStart) return;
    const norm = toNorm(e.clientX, e.clientY);
    if (!norm) return;
    const x = Math.min(drawStart.nx, norm.nx);
    const y = Math.min(drawStart.ny, norm.ny);
    const w = Math.abs(norm.nx - drawStart.nx);
    const h = Math.abs(norm.ny - drawStart.ny);
    setDrawPreview({ x, y, w, h });
  }, [isDrawing, drawStart, toNorm]);

  const handleMouseUp = useCallback(async (e: MouseEvent) => {
    if (!isDrawing || !drawStart) return;
    setIsDrawing(false);
    const norm = toNorm(e.clientX, e.clientY);
    if (!norm) { setDrawPreview(null); setDrawStart(null); return; }

    const x = Math.min(drawStart.nx, norm.nx);
    const y = Math.min(drawStart.ny, norm.ny);
    const w = Math.abs(norm.nx - drawStart.nx);
    const h = Math.abs(norm.ny - drawStart.ny);

    // Ignore tiny accidental clicks
    if (w < 0.01 || h < 0.01) { setDrawPreview(null); setDrawStart(null); return; }

    const newMask = await window.electronAPI.reviewMasks.create(
      reviewItemId, x, y, w, h, defaultLevel, null, masks.length
    );
    const updated = [...masks, newMask];
    setMasks(updated);
    onMasksChanged(updated);
    setSelectedMaskId(newMask.id);
    setDrawPreview(null);
    setDrawStart(null);
  }, [isDrawing, drawStart, toNorm, masks, reviewItemId, defaultLevel, onMasksChanged]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const handleDeleteMask = async (id: number) => {
    await window.electronAPI.reviewMasks.delete(id);
    const updated = masks.filter(m => m.id !== id);
    setMasks(updated);
    onMasksChanged(updated);
    if (selectedMaskId === id) setSelectedMaskId(null);
  };

  const handleUpdateHint = async (mask: ReviewMask, hint: string) => {
    await window.electronAPI.reviewMasks.update(mask.id, mask.x, mask.y, mask.w, mask.h, mask.pixelation_level, hint || null);
    const updated = masks.map(m => m.id === mask.id ? { ...m, hint_text: hint || null } : m);
    setMasks(updated);
    onMasksChanged(updated);
  };

  const handleUpdateLevel = async (mask: ReviewMask, level: number) => {
    await window.electronAPI.reviewMasks.update(mask.id, mask.x, mask.y, mask.w, mask.h, level, mask.hint_text);
    const updated = masks.map(m => m.id === mask.id ? { ...m, pixelation_level: level } : m);
    setMasks(updated);
    onMasksChanged(updated);
  };

  const imgRect = getImageRect();

  return (
    <div
      className="absolute inset-0 z-[70] flex bg-black/95"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Main canvas area */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden cursor-crosshair"
        onMouseDown={handleMouseDown}
      >
        <img
          ref={imgRef}
          src={src}
          alt=""
          draggable={false}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          onLoad={() => { /* trigger re-render */ setDefaultLevel(l => l); }}
        />

        {/* Existing mask overlays */}
        {imgRect && masks.map(mask => {
          const isSelected = mask.id === selectedMaskId;
          return (
            <div
              key={mask.id}
              className={`absolute border-2 cursor-pointer transition-colors ${
                isSelected ? 'border-yellow-400 bg-yellow-400/20' : 'border-blue-400 bg-blue-400/10 hover:bg-blue-400/20'
              }`}
              style={{
                left: imgRect.x + mask.x * imgRect.w,
                top: imgRect.y + mask.y * imgRect.h,
                width: mask.w * imgRect.w,
                height: mask.h * imgRect.h,
              }}
              onClick={(e) => { e.stopPropagation(); setSelectedMaskId(mask.id); }}
            >
              <span className="absolute top-0.5 left-0.5 bg-black/60 text-white text-[10px] px-1 rounded leading-none">
                L{mask.pixelation_level}
              </span>
            </div>
          );
        })}

        {/* Draw preview */}
        {imgRect && drawPreview && (
          <div
            className="absolute border-2 border-dashed border-green-400 bg-green-400/10 pointer-events-none"
            style={{
              left: imgRect.x + drawPreview.x * imgRect.w,
              top: imgRect.y + drawPreview.y * imgRect.h,
              width: drawPreview.w * imgRect.w,
              height: drawPreview.h * imgRect.h,
            }}
          />
        )}

        {/* Instruction hint */}
        {masks.length === 0 && !isDrawing && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-black/70 text-white text-sm px-4 py-2 rounded-lg">
              Drag to draw a mask rectangle
            </div>
          </div>
        )}
      </div>

      {/* Right panel */}
      <div className="w-72 bg-gray-900 border-l border-gray-700 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <span className="text-white text-sm font-medium">Mask Editor</span>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Default level selector */}
        <div className="px-4 py-3 border-b border-gray-700">
          <p className="text-gray-400 text-xs mb-2">New mask pixelation level</p>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(l => (
              <button
                key={l}
                onClick={() => setDefaultLevel(l)}
                className={`flex-1 py-1 text-xs rounded transition-colors ${
                  defaultLevel === l
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Mask list */}
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
          {masks.length === 0 && (
            <p className="text-gray-500 text-xs text-center mt-4">No masks yet. Draw on the image.</p>
          )}
          {masks.map((mask, i) => (
            <div
              key={mask.id}
              className={`rounded-lg border p-3 flex flex-col gap-2 cursor-pointer transition-colors ${
                selectedMaskId === mask.id
                  ? 'border-yellow-500 bg-gray-800'
                  : 'border-gray-700 bg-gray-800/50 hover:border-gray-500'
              }`}
              onClick={() => setSelectedMaskId(mask.id)}
            >
              <div className="flex items-center justify-between">
                <span className="text-gray-200 text-xs font-medium">Mask {i + 1}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteMask(mask.id); }}
                  className="text-red-400 hover:text-red-300 text-xs"
                >
                  Delete
                </button>
              </div>

              {/* Pixelation level */}
              <div>
                <p className="text-gray-500 text-[10px] mb-1">Pixelation level</p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(l => (
                    <button
                      key={l}
                      onClick={(e) => { e.stopPropagation(); handleUpdateLevel(mask, l); }}
                      className={`flex-1 py-0.5 text-[11px] rounded transition-colors ${
                        mask.pixelation_level === l
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                      }`}
                      title={LEVEL_LABELS[l - 1]}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hint text */}
              <div>
                <p className="text-gray-500 text-[10px] mb-1">Hint (optional)</p>
                <input
                  type="text"
                  value={mask.hint_text ?? ''}
                  onChange={(e) => handleUpdateHint(mask, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="e.g. 'Rust for loop syntax'"
                  className="w-full text-xs bg-gray-700 text-white rounded px-2 py-1.5 border border-gray-600 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 py-3 border-t border-gray-700">
          <button
            onClick={onClose}
            className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
