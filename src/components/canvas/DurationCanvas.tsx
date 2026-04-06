import { useEffect, useRef, useState, useCallback } from 'react';
import { Excalidraw, serializeAsJSON } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import type { ExcalidrawImperativeAPI, ExcalidrawInitialDataState, AppState, BinaryFiles } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { useTheme } from '../../context/ThemeContext';

interface DurationCanvasProps {
  durationId: number;
  onImageAttached?: () => void;
}

export default function DurationCanvas({ durationId, onImageAttached }: DurationCanvasProps) {
  const { resolvedTheme } = useTheme();
  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [autoAttach, setAutoAttach] = useState(false);
  const [autoOcr, setAutoOcr] = useState(false);
  const autoAttachRef = useRef(false);
  const autoOcrRef = useRef(false);
  const seenFileIdsRef = useRef<Set<string>>(new Set());
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>('');
  const latestJsonRef = useRef<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const json = await window.electronAPI.durations.loadCanvas(durationId);
        if (cancelled) return;
        if (json) {
          const parsed = JSON.parse(json) as ExcalidrawInitialDataState;
          setInitialData(parsed);
          lastSavedRef.current = json;
          latestJsonRef.current = json;
          // Pre-populate seen file IDs so existing canvas images aren't treated as "new"
          if (parsed.files) {
            Object.keys(parsed.files).forEach(id => seenFileIdsRef.current.add(id));
          }
        } else {
          setInitialData({ elements: [], appState: { viewBackgroundColor: 'transparent' } });
        }
      } catch {
        setInitialData({ elements: [], appState: { viewBackgroundColor: 'transparent' } });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [durationId]);

  const handleChange = useCallback((
    elements: readonly ExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => {
    const json = serializeAsJSON(elements, appState, files, 'local');
    latestJsonRef.current = json;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (json === lastSavedRef.current) return;
      lastSavedRef.current = json;
      try {
        await window.electronAPI.durations.saveCanvas(durationId, json);
      } catch (err) {
        console.error('[DurationCanvas] save failed', err);
      }
    }, 1500);

    // Detect newly pasted image files
    const newIds = Object.keys(files).filter(id => !seenFileIdsRef.current.has(id));
    Object.keys(files).forEach(id => seenFileIdsRef.current.add(id));

    if (autoAttachRef.current && newIds.length > 0) {
      for (const id of newIds) {
        const file = files[id];
        if (!file?.mimeType?.startsWith('image/')) continue;
        // Decode dataURL → ArrayBuffer
        const base64 = file.dataURL.split(',')[1];
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        window.electronAPI.durationImages.addFromClipboard(durationId, bytes.buffer, 'png')
          .then((newImg) => {
            if (autoOcrRef.current && newImg?.id && newImg?.file_path) {
              window.electronAPI.ocr.extractCaption2('duration_image', newImg.id, newImg.file_path)
                .catch(() => {});
            }
            onImageAttached?.();
          })
          .catch(() => {});
      }
    }
  }, [durationId, onImageAttached]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const json = latestJsonRef.current;
      if (json && json !== lastSavedRef.current) {
        window.electronAPI.durations.saveCanvas(durationId, json).catch(() => {});
      }
    };
  }, [durationId]);

  useEffect(() => {
    if (!fullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fullscreen]);

  const toggleAutoAttach = () => setAutoAttach(prev => { autoAttachRef.current = !prev; return !prev; });
  const toggleAutoOcr = () => setAutoOcr(prev => { autoOcrRef.current = !prev; return !prev; });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500 text-sm">
        Loading canvas…
      </div>
    );
  }

  const btnBase = "absolute z-10 p-1.5 rounded-lg shadow transition-colors border";
  const btnInactive = "bg-white/80 dark:bg-gray-800/80 text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 border-gray-200 dark:border-gray-600";
  const btnActive = "bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-800/60 border-blue-300 dark:border-blue-600";

  const toggleBtn = (
    <>
      {/* Auto-attach toggle: saves pasted images to this mark's image section */}
      <button
        onClick={toggleAutoAttach}
        title={autoAttach ? 'Auto-attach ON — pasted images saved to mark (click to disable)' : 'Auto-attach OFF — click to save pasted images to mark'}
        className={`${btnBase} bottom-[112px] right-3 ${autoAttach ? btnActive : btnInactive}`}
      >
        {/* Paperclip icon */}
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
        </svg>
      </button>

      {/* OCR toggle: extract text from auto-attached images */}
      <button
        onClick={autoAttach ? toggleAutoOcr : undefined}
        title={
          !autoAttach
            ? 'Enable auto-attach first to use OCR'
            : autoOcr
            ? 'OCR ON — text extracted from attached images (click to disable)'
            : 'OCR OFF — click to extract text from attached images'
        }
        className={`${btnBase} bottom-[70px] right-3 ${!autoAttach ? 'opacity-40 cursor-not-allowed bg-white/80 dark:bg-gray-800/80 text-gray-400 border-gray-200 dark:border-gray-600' : autoOcr ? btnActive : btnInactive}`}
      >
        {/* Text-scan icon */}
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </button>

      {/* Fullscreen toggle */}
      <button
        onClick={() => setFullscreen(prev => !prev)}
        title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
        className={`${btnBase} bottom-[28px] right-3 ${btnInactive}`}
      >
        {fullscreen ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4M9 9H4M9 9L3 3M15 9h5M15 9V4M15 9l6-6M9 15H4M9 15v5M9 15l-6 6M15 15h5M15 15v5M15 15l6 6" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        )}
      </button>
    </>
  );

  return (
    <div
      className={fullscreen ? '' : 'relative w-full h-full'}
      style={fullscreen ? {
        position: 'fixed', top: 0, left: 0,
        width: '100vw', height: '100vh',
        zIndex: 9999,
        background: resolvedTheme === 'dark' ? '#1e1e2e' : '#ffffff',
      } : undefined}
    >
      <Excalidraw
        excalidrawAPI={(api) => { apiRef.current = api; }}
        initialData={initialData ?? undefined}
        theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
        onChange={handleChange}
        UIOptions={{
          canvasActions: {
            export: false,
            loadScene: false,
            saveAsImage: true,
            saveToActiveFile: false,
          },
        }}
      />
      {toggleBtn}
    </div>
  );
}
