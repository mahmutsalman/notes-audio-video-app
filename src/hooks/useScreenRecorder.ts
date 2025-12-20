import { useState, useRef, useCallback, useEffect } from 'react';
import { fixWebmMetadata } from '../utils/webmFixer';
import { createCroppedStream, getDisplaySourceId, calculateBitrate } from '../utils/regionCapture';
import type { CaptureArea } from '../types';

// Reuse DurationMark types from useVoiceRecorder
export interface DurationMark {
  start: number;  // seconds
  end: number;    // seconds
  note?: string;  // optional note for this mark
}

export interface ScreenRecorderState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  videoBlob: Blob | null;
  videoUrl: string | null;
  error: string | null;
  selectedSource: { id: string; name: string } | null;
  captureArea: CaptureArea | null;
}

export interface ScreenRecorderControls {
  startRecording: (
    sourceId: string,
    sourceName: string,
    resolution: { width: number; height: number },
    fps: number,
    area?: CaptureArea
  ) => Promise<void>;
  startRecordingWithRegion: (
    region: CaptureArea,
    fps: number
  ) => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  resetRecording: () => void;
  handleMarkToggle: () => void;
  setMarkNote: (note: string) => void;
}

export interface UseScreenRecorderReturn extends ScreenRecorderState, ScreenRecorderControls {
  pendingMarkStart: number | null;
  pendingMarkNote: string;
  completedMarks: DurationMark[];
  isMarking: boolean;
}

export function useScreenRecorder(): UseScreenRecorderReturn {
  const [state, setState] = useState<ScreenRecorderState>({
    isRecording: false,
    isPaused: false,
    duration: 0,
    videoBlob: null,
    videoUrl: null,
    error: null,
    selectedSource: null,
    captureArea: null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const accumulatedTimeRef = useRef<number>(0);
  const regionCleanupRef = useRef<(() => void) | null>(null);

  // Duration marking state (same pattern as audio)
  const [pendingMarkStart, setPendingMarkStart] = useState<number | null>(null);
  const [pendingMarkNote, setPendingMarkNote] = useState<string>('');
  const [completedMarks, setCompletedMarks] = useState<DurationMark[]>([]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
    };
  }, [state.videoUrl]);

  const startRecording = useCallback(async (
    sourceId: string,
    sourceName: string,
    resolution: { width: number; height: number },
    fps: number,
    area?: CaptureArea
  ) => {
    try {
      setState(prev => ({
        ...prev,
        isRecording: false,
        isPaused: false,
        duration: 0,
        videoBlob: null,
        videoUrl: prev.videoUrl ? (URL.revokeObjectURL(prev.videoUrl), null) : null,
        error: null,
        selectedSource: { id: sourceId, name: sourceName },
        captureArea: area || null,
      }));

      videoChunksRef.current = [];
      setPendingMarkStart(null);
      setPendingMarkNote('');
      setCompletedMarks([]);

      // Get screen stream via desktopCapturer
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          // @ts-expect-error - Electron-specific constraints
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            minWidth: resolution.width,
            maxWidth: resolution.width,
            minHeight: resolution.height,
            maxHeight: resolution.height,
            minFrameRate: fps,
            maxFrameRate: fps,
          }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Create MediaRecorder with VP9 codec
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';

      // Calculate bitrate based on resolution and FPS
      const pixelCount = resolution.width * resolution.height;
      const baseRate = pixelCount * 0.1; // 0.1 bits per pixel
      const fpsMultiplier = fps / 30; // Scale based on 30 FPS baseline
      const videoBitsPerSecond = Math.floor(baseRate * fpsMultiplier);

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond,
      });

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          videoChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        setState(prev => ({ ...prev, error: 'Screen recording error occurred' }));
      };

      mediaRecorder.start(100); // Collect data every 100ms

      // Start timer (same pattern as audio)
      startTimeRef.current = Date.now();
      accumulatedTimeRef.current = 0;

      timerRef.current = setInterval(() => {
        const elapsed = accumulatedTimeRef.current + (Date.now() - startTimeRef.current);
        setState(prev => ({ ...prev, duration: Math.floor(elapsed / 1000) }));
      }, 100);

      setState(prev => ({ ...prev, isRecording: true, isPaused: false }));
    } catch (err) {
      console.error('Failed to start screen recording:', err);
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to start screen recording',
      }));
    }
  }, []);

  const startRecordingWithRegion = useCallback(async (
    region: CaptureArea,
    fps: number
  ) => {
    console.log('[useScreenRecorder] startRecordingWithRegion called');
    console.log('[useScreenRecorder] region:', region);
    console.log('[useScreenRecorder] fps:', fps);

    try {
      console.log('[useScreenRecorder] Setting initial state');
      setState(prev => ({
        ...prev,
        isRecording: false,
        isPaused: false,
        duration: 0,
        videoBlob: null,
        videoUrl: prev.videoUrl ? (URL.revokeObjectURL(prev.videoUrl), null) : null,
        error: null,
        selectedSource: { id: 'region', name: `Region (${region.width}×${region.height})` },
        captureArea: region,
      }));

      videoChunksRef.current = [];
      setPendingMarkStart(null);
      setPendingMarkNote('');
      setCompletedMarks([]);
      console.log('[useScreenRecorder] Initial state set');

      // Get display source ID for the region's display
      console.log('[useScreenRecorder] Getting display source ID for:', region.displayId);
      const sourceId = await getDisplaySourceId(region.displayId);
      console.log('[useScreenRecorder] Display source ID:', sourceId);
      if (!sourceId) {
        throw new Error('Failed to find display source for region');
      }

      // Create cropped stream using canvas
      console.log('[useScreenRecorder] Creating cropped stream');
      const { stream, cleanup } = await createCroppedStream(sourceId, region, fps);
      console.log('[useScreenRecorder] Cropped stream created');
      streamRef.current = stream;
      regionCleanupRef.current = cleanup;

      // Create MediaRecorder with VP9 codec
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      console.log('[useScreenRecorder] Using mimeType:', mimeType);

      // Calculate bitrate based on region size and FPS
      const videoBitsPerSecond = calculateBitrate(region.width, region.height, fps);
      console.log('[useScreenRecorder] Calculated bitrate:', videoBitsPerSecond);

      console.log('[useScreenRecorder] Creating MediaRecorder');
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond,
      });
      console.log('[useScreenRecorder] MediaRecorder created');

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          videoChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        setState(prev => ({ ...prev, error: 'Screen recording error occurred' }));
      };

      console.log('[useScreenRecorder] Starting MediaRecorder');
      mediaRecorder.start(100); // Collect data every 100ms
      console.log('[useScreenRecorder] MediaRecorder started');

      // Start timer
      console.log('[useScreenRecorder] Starting timer');
      startTimeRef.current = Date.now();
      accumulatedTimeRef.current = 0;

      timerRef.current = setInterval(() => {
        const elapsed = accumulatedTimeRef.current + (Date.now() - startTimeRef.current);
        setState(prev => ({ ...prev, duration: Math.floor(elapsed / 1000) }));
      }, 100);

      console.log('[useScreenRecorder] Setting isRecording to true');
      setState(prev => ({ ...prev, isRecording: true, isPaused: false }));
      console.log('[useScreenRecorder] Recording started successfully');
    } catch (err) {
      console.error('[useScreenRecorder] Failed to start region recording:', err);
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to start region recording',
      }));
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current;
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        resolve(null);
        return;
      }

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      // Auto-complete pending mark (same as audio)
      if (pendingMarkStart !== null) {
        const elapsed = accumulatedTimeRef.current + (Date.now() - startTimeRef.current);
        const endTime = Math.floor(elapsed / 1000);
        if (endTime > pendingMarkStart) {
          setCompletedMarks(prev => [...prev, {
            start: pendingMarkStart,
            end: endTime,
            note: pendingMarkNote.trim() || undefined,
          }]);
        }
        setPendingMarkStart(null);
        setPendingMarkNote('');
      }

      mediaRecorder.onstop = async () => {
        const rawBlob = new Blob(videoChunksRef.current, { type: 'video/webm' });
        const durationMs = accumulatedTimeRef.current + (Date.now() - startTimeRef.current);

        // Fix WebM metadata for seekability (same as audio)
        let blob: Blob;
        try {
          blob = await fixWebmMetadata(rawBlob, durationMs);
          console.log('[ScreenRecording] WebM metadata fixed for seekability');
        } catch (error) {
          console.warn('[ScreenRecording] Failed to fix WebM metadata:', error);
          blob = rawBlob;
        }

        const url = URL.createObjectURL(blob);
        setState(prev => ({
          ...prev,
          isRecording: false,
          isPaused: false,
          videoBlob: blob,
          videoUrl: url,
        }));

        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }

        // Call region cleanup if exists
        if (regionCleanupRef.current) {
          regionCleanupRef.current();
          regionCleanupRef.current = null;
        }

        resolve(blob);
      };

      mediaRecorder.stop();
    });
  }, [pendingMarkStart, pendingMarkNote]);

  const pauseRecording = useCallback(() => {
    const mediaRecorder = mediaRecorderRef.current;
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.pause();
      accumulatedTimeRef.current += Date.now() - startTimeRef.current;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setState(prev => ({ ...prev, isPaused: true }));
    }
  }, []);

  const resumeRecording = useCallback(() => {
    const mediaRecorder = mediaRecorderRef.current;
    if (mediaRecorder && mediaRecorder.state === 'paused') {
      mediaRecorder.resume();
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = accumulatedTimeRef.current + (Date.now() - startTimeRef.current);
        setState(prev => ({ ...prev, duration: Math.floor(elapsed / 1000) }));
      }, 100);
      setState(prev => ({ ...prev, isPaused: false }));
    }
  }, []);

  const resetRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (regionCleanupRef.current) {
      regionCleanupRef.current();
      regionCleanupRef.current = null;
    }
    if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);

    setState({
      isRecording: false,
      isPaused: false,
      duration: 0,
      videoBlob: null,
      videoUrl: null,
      error: null,
      selectedSource: null,
      captureArea: null,
    });

    videoChunksRef.current = [];
    mediaRecorderRef.current = null;
    startTimeRef.current = 0;
    accumulatedTimeRef.current = 0;
    setPendingMarkStart(null);
    setPendingMarkNote('');
    setCompletedMarks([]);
  }, [state.videoUrl]);

  // Duration marking (identical to audio)
  const handleMarkToggle = useCallback(() => {
    if (!state.isRecording) return;

    const elapsed = accumulatedTimeRef.current + (Date.now() - startTimeRef.current);
    const currentTime = Math.floor(elapsed / 1000);

    if (pendingMarkStart === null) {
      // Start new mark
      setPendingMarkStart(currentTime);
      setPendingMarkNote('');
    } else {
      // Complete current mark
      if (currentTime > pendingMarkStart) {
        setCompletedMarks(prev => [...prev, {
          start: pendingMarkStart,
          end: currentTime,
          note: pendingMarkNote.trim() || undefined,
        }]);
      }
      setPendingMarkStart(null);
      setPendingMarkNote('');
    }
  }, [state.isRecording, pendingMarkStart, pendingMarkNote]);

  const setMarkNote = useCallback((note: string) => {
    setPendingMarkNote(note);
  }, []);

  return {
    ...state,
    startRecording,
    startRecordingWithRegion,
    stopRecording,
    pauseRecording,
    resumeRecording,
    resetRecording,
    handleMarkToggle,
    setMarkNote,
    pendingMarkStart,
    pendingMarkNote,
    completedMarks,
    isMarking: pendingMarkStart !== null,
  };
}
