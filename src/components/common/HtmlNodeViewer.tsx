import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Only the fields the viewer actually reads. Deliberately narrower than HtmlNode /
 * DurationHtmlNode so search hits and tag-result rows — which carry the same four fields
 * but not sort_order or created_at — can open the viewer without a second round trip.
 */
export interface ViewerDocument {
  id: number;
  file_path: string;
  title: string | null;
  file_type: 'html' | 'pdf';
}

interface HtmlNodeViewerProps {
  node: ViewerDocument;
  onClose: () => void;
  /** Falls back to the standalone BrowserWindow — the behaviour this viewer replaced as default. */
  onOpenInWindow: () => void;
}

/** Discrete stops rather than a continuous factor, so the +/- buttons land on round,
 *  repeatable values the way a browser's zoom does. */
const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5] as const;

function nearestStepIndex(zoom: number): number {
  let best = 0;
  let bestDistance = Infinity;
  ZOOM_STEPS.forEach((step, i) => {
    const d = Math.abs(step - zoom);
    if (d < bestDistance) { bestDistance = d; best = i; }
  });
  return best;
}

export default function HtmlNodeViewer({ node, onClose, onOpenInWindow }: HtmlNodeViewerProps) {
  const [zoom, setZoom] = useState(1);
  // Bumped by the reload button. Rendered into the URL as ?v=<nonce> because these files are
  // routinely edited on disk (the card's copy-path button exists so an AI can rewrite them),
  // and without a changing URL Chromium serves the previous body from cache.
  const [reloadNonce, setReloadNonce] = useState(0);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const isPdf = node.file_type === 'pdf';
  const fileName = node.file_path.split('/').pop() ?? '';
  const displayTitle = node.title || (isPdf ? 'Untitled PDF' : 'Untitled HTML');

  const src = useMemo(() => {
    const base = window.electronAPI.paths.getFileUrl(node.file_path);
    return reloadNonce === 0 ? base : `${base}?v=${reloadNonce}`;
  }, [node.file_path, reloadNonce]);

  const stepZoom = useCallback((direction: number) => {
    setZoom(z => {
      const next = nearestStepIndex(z) + direction;
      return ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, next))];
    });
  }, []);

  const resetZoom = useCallback(() => setZoom(1), []);

  const reload = useCallback(() => {
    setLoading(true);
    setReloadNonce(n => n + 1);
  }, []);

  // Escape closes; Cmd/Ctrl +/-/0 mirror the toolbar. These only fire while the app document
  // holds focus — once you click into the framed document it owns the keyboard, and the
  // toolbar buttons are then the way to zoom.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (!e.metaKey && !e.ctrlKey) return;
      if (e.key === '=' || e.key === '+') { e.preventDefault(); stepZoom(1); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); stepZoom(-1); }
      else if (e.key === '0') { e.preventDefault(); resetZoom(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, stepZoom, resetZoom]);

  // Pinch / Cmd+scroll over the chrome around the document. Wheel events raised inside the
  // iframe belong to that document and never reach us, so this covers the toolbar and the
  // padding, not the page body.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      stepZoom(e.deltaY < 0 ? 1 : -1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [stepZoom]);

  const atMinZoom = zoom <= ZOOM_STEPS[0];
  const atMaxZoom = zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1];

  const toolbarButton =
    'px-2 py-1 rounded text-sm text-gray-300 hover:text-white hover:bg-white/10 ' +
    'disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-300 transition-colors';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center titlebar-no-drag"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={containerRef}
        className="absolute inset-2 sm:inset-4 flex flex-col bg-gray-900 rounded-lg shadow-2xl overflow-hidden border border-gray-700"
      >
        {/* ── Toolbar ─────────────────────────────────────────────────────── */}
        <div className="shrink-0 flex items-center gap-2 px-3 py-2 bg-gray-800 border-b border-gray-700">
          <span
            className={`shrink-0 text-xs font-bold px-1.5 py-0.5 rounded ${
              isPdf ? 'bg-red-900/50 text-red-300' : 'bg-green-900/50 text-green-300'
            }`}
          >
            {isPdf ? 'PDF' : 'HTML'}
          </span>

          <div className="flex-1 min-w-0 flex items-baseline gap-2">
            <span className="text-sm text-gray-100 truncate">{displayTitle}</span>
            <span className="text-xs text-gray-500 truncate hidden sm:inline">{fileName}</span>
          </div>

          {/* Zoom */}
          <div className="shrink-0 flex items-center gap-0.5 mr-1">
            <button
              className={toolbarButton}
              onClick={() => stepZoom(-1)}
              disabled={atMinZoom}
              title="Zoom out (⌘−)"
            >
              −
            </button>
            <button
              className={`${toolbarButton} tabular-nums min-w-[3.5rem]`}
              onClick={resetZoom}
              title="Reset zoom to 100% (⌘0)"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              className={toolbarButton}
              onClick={() => stepZoom(1)}
              disabled={atMaxZoom}
              title="Zoom in (⌘+)"
            >
              +
            </button>
          </div>

          <button className={toolbarButton} onClick={reload} title="Reload from disk">
            ↻
          </button>
          <button
            className={toolbarButton}
            onClick={() => { onOpenInWindow(); onClose(); }}
            title="Open in a separate window"
          >
            ⧉
          </button>
          <button
            className={`${toolbarButton} text-lg leading-none`}
            onClick={onClose}
            title="Close (Esc)"
          >
            ×
          </button>
        </div>

        {/* ── Document ────────────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 relative bg-white">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400 pointer-events-none">
              Loading…
            </div>
          )}
          {/* The iframe is sized to the INVERSE of the zoom and then scaled back up, so its
              internal viewport shrinks as you zoom in and the document reflows exactly as a
              browser's zoom would. Scrolling therefore happens inside the frame and this
              container never needs its own scrollbars. */}
          <iframe
            key={reloadNonce}
            src={src}
            title={displayTitle}
            onLoad={() => setLoading(false)}
            className="border-0 block"
            style={{
              width: `${100 / zoom}%`,
              height: `${100 / zoom}%`,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
            }}
          />
        </div>
      </div>
    </div>
  );
}
