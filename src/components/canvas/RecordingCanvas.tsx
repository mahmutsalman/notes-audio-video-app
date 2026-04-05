import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Excalidraw, serializeAsJSON } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import type { ExcalidrawImperativeAPI, ExcalidrawInitialDataState, AppState, BinaryFiles } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { useTheme } from '../../context/ThemeContext';

interface RecordingCanvasProps {
  recordingId: number;
}

export default function RecordingCanvas({ recordingId }: RecordingCanvasProps) {
  const { resolvedTheme } = useTheme();
  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>('');
  const latestJsonRef = useRef<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const json = await window.electronAPI.recordings.loadCanvas(recordingId);
        if (cancelled) return;
        if (json) {
          const parsed = JSON.parse(json) as ExcalidrawInitialDataState;
          setInitialData(parsed);
          lastSavedRef.current = json;
          latestJsonRef.current = json;
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
  }, [recordingId]);

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
        await window.electronAPI.recordings.saveCanvas(recordingId, json);
      } catch (err) {
        console.error('[RecordingCanvas] save failed', err);
      }
    }, 1500);
  }, [recordingId]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const json = latestJsonRef.current;
      if (json && json !== lastSavedRef.current) {
        window.electronAPI.recordings.saveCanvas(recordingId, json).catch(() => {});
      }
    };
  }, [recordingId]);

  useEffect(() => {
    if (!fullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fullscreen]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500 text-sm">
        Loading canvas…
      </div>
    );
  }

  const toggleBtn = (
    <button
      onClick={() => setFullscreen(prev => !prev)}
      title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
      className="absolute bottom-14 right-3 z-10 p-1.5 rounded-lg bg-white/80 dark:bg-gray-800/80 text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 shadow transition-colors border border-gray-200 dark:border-gray-600"
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
  );

  const excalidraw = (
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
  );

  if (fullscreen) {
    return createPortal(
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 9999, background: resolvedTheme === 'dark' ? '#1e1e2e' : '#ffffff' }}>
        {excalidraw}
        {toggleBtn}
      </div>,
      document.body
    );
  }

  return (
    <div className="relative w-full h-full">
      {excalidraw}
      {toggleBtn}
    </div>
  );
}
