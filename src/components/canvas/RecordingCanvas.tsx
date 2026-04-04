import { useEffect, useRef, useState, useCallback } from 'react';
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
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>('');
  // Always holds the latest serialized state — used for reliable unmount save
  const latestJsonRef = useRef<string>('');

  // Load canvas data on mount
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

  // Save on unmount using the latest captured state
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const json = latestJsonRef.current;
      if (json && json !== lastSavedRef.current) {
        window.electronAPI.recordings.saveCanvas(recordingId, json).catch(() => {});
      }
    };
  }, [recordingId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500 text-sm">
        Loading canvas…
      </div>
    );
  }

  return (
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
}
