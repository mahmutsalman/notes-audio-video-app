import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FC, Ref } from 'react';

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

/** Minimal surface of Electron's <webview> that this component drives. */
interface WebviewElement extends HTMLElement {
  src: string;
  setZoomFactor(factor: number): void;
  reloadIgnoringCache(): void;
  send(channel: string, ...args: unknown[]): void;
}

/**
 * React already ships a <webview> declaration, but it is modelled on the old Chrome
 * <webview> tag and its attribute types do not match Electron's (plugins as boolean rather
 * than the string the tag actually wants). Aliasing the tag to a component keeps this file's
 * attribute set honest without redeclaring — and colliding with — the global JSX types.
 */
const WebView = 'webview' as unknown as FC<{
  ref?: Ref<HTMLElement>;
  src?: string;
  preload?: string;
  plugins?: string;
  className?: string;
  style?: CSSProperties;
}>;

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
  const [loading, setLoading] = useState(true);
  // The <webview> cannot be rendered until its preload URL is known, and that URL differs
  // between dev and a packaged asar so it has to come from main.
  const [preloadUrl, setPreloadUrl] = useState<string | null>(null);
  const viewRef = useRef<WebviewElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Read inside the dom-ready handler, which would otherwise close over the initial zoom.
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  const isPdf = node.file_type === 'pdf';
  const fileName = node.file_path.split('/').pop() ?? '';
  const displayTitle = node.title || (isPdf ? 'Untitled PDF' : 'Untitled HTML');

  const src = useMemo(
    () => window.electronAPI.paths.getFileUrl(node.file_path),
    [node.file_path],
  );

  useEffect(() => {
    let cancelled = false;
    window.electronAPI.htmlNodes.embedPreloadUrl()
      .then(url => { if (!cancelled) setPreloadUrl(url); })
      .catch(() => { if (!cancelled) setPreloadUrl(''); });
    return () => { cancelled = true; };
  }, []);

  const stepZoom = useCallback((direction: number) => {
    setZoom(z => {
      const next = nearestStepIndex(z) + direction;
      return ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, next))];
    });
  }, []);

  const resetZoom = useCallback(() => setZoom(1), []);

  const reload = useCallback(() => {
    setLoading(true);
    // Ignoring cache matters because these files are routinely rewritten on disk by an AI
    // handed the path from the card's copy-path button.
    viewRef.current?.reloadIgnoringCache();
  }, []);

  // Bridge to the guest: it reports Escape and its own zoom gestures back over sendToHost,
  // because a focused guest document swallows every key and wheel event before the app sees it.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || preloadUrl === null) return;

    const onIpc = (e: Event) => {
      const { channel, args } = e as Event & { channel: string; args: unknown[] };
      if (channel === 'close') onClose();
      else if (channel === 'zoom') setZoom(args[0] as number);
    };
    const onDomReady = () => {
      setLoading(false);
      view.setZoomFactor(zoomRef.current);
    };
    const onStartLoading = () => setLoading(true);

    view.addEventListener('ipc-message', onIpc);
    view.addEventListener('dom-ready', onDomReady);
    view.addEventListener('did-start-loading', onStartLoading);
    return () => {
      view.removeEventListener('ipc-message', onIpc);
      view.removeEventListener('dom-ready', onDomReady);
      view.removeEventListener('did-start-loading', onStartLoading);
    };
  }, [onClose, preloadUrl]);

  // Push toolbar-initiated zoom into the guest. setZoomFactor is a real browser zoom — the
  // document re-lays out and re-rasterises, so text stays sharp. A CSS transform would only
  // stretch the frame's existing bitmap.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    try { view.setZoomFactor(zoom); } catch { /* not attached yet; dom-ready will apply it */ }
  }, [zoom]);

  // Same shortcuts as the guest preload, for while focus is still on the app chrome.
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

          <div className="shrink-0 flex items-center gap-0.5 mr-1">
            <button className={toolbarButton} onClick={() => stepZoom(-1)} disabled={atMinZoom} title="Zoom out (⌘−)">
              −
            </button>
            <button
              className={`${toolbarButton} tabular-nums min-w-[3.5rem]`}
              onClick={resetZoom}
              title="Reset zoom to 100% (⌘0)"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button className={toolbarButton} onClick={() => stepZoom(1)} disabled={atMaxZoom} title="Zoom in (⌘+)">
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
          <button className={`${toolbarButton} text-lg leading-none`} onClick={onClose} title="Close (Esc)">
            ×
          </button>
        </div>

        {/* ── Document ────────────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 relative bg-white">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400 pointer-events-none z-10 bg-white">
              Loading…
            </div>
          )}
          {preloadUrl !== null && (
            <WebView
              ref={viewRef as Ref<HTMLElement>}
              src={src}
              preload={preloadUrl || undefined}
              // Chromium's PDF viewer is a plugin; without this a PDF node is a blank guest.
              plugins="true"
              className="w-full h-full"
              style={{ display: 'flex' }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
