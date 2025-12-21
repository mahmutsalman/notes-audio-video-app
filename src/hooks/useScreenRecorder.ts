import { useState, useRef, useCallback, useEffect } from 'react';
import { fixWebmMetadata } from '../utils/webmFixer';
import { createCroppedStream, getDisplaySourceId, calculateBitrate } from '../utils/regionCapture';
import { createMicrophoneStream, combineAudioStreams, getBlackHoleDevice } from '../utils/audioCapture';
import { RESOLUTION_PRESETS } from '../context/ScreenRecordingSettingsContext';
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
  selectedCodec: string | null; // Track actual codec being used (h264, vp9, etc.)
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

// Helper function to extract codec name from mimeType
const getCodecName = (mimeType: string): string => {
  if (mimeType.includes('h264') || mimeType.includes('avc1')) {
    return 'H264';
  } else if (mimeType.includes('vp9')) {
    return 'VP9';
  } else if (mimeType.includes('vp8')) {
    return 'VP8';
  }
  return 'WEBM';
};

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
    selectedCodec: null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const accumulatedTimeRef = useRef<number>(0);
  const regionCleanupRef = useRef<(() => void) | null>(null);
  const audioStreamsRef = useRef<MediaStream[]>([]);

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

      // Try H.264 first (better hardware support, wider compatibility)
      // Fall back to VP9 if H.264 not available
      const codecPreference = [
        'video/webm;codecs=h264',
        'video/webm;codecs=avc1',  // Alternative H.264 identifier
        'video/webm;codecs=vp9',   // Fallback to VP9
        'video/webm'
      ];

      const mimeType = codecPreference.find(codec =>
        MediaRecorder.isTypeSupported(codec)
      ) || 'video/webm';

      const selectedCodec = getCodecName(mimeType);
      console.log('[useScreenRecorder] Selected codec:', mimeType, '→', selectedCodec);

      // Calculate bitrate with improved quality (0.18 bpp for CleanShot X quality)
      const videoBitsPerSecond = calculateBitrate(
        resolution.width,
        resolution.height,
        fps,
        0.18  // CleanShot X quality level
      );

      console.log('[useScreenRecorder] Video bitrate:', videoBitsPerSecond);

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond,
      });

      mediaRecorderRef.current = mediaRecorder;

      // Store the selected codec in state
      setState(prev => ({ ...prev, selectedCodec }));

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
      audioStreamsRef.current = [];
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

      // Determine actual recording dimensions based on quality setting (Phase 5)
      const scaleFactor = region.scaleFactor || 1;
      let recordWidth = region.width * scaleFactor;
      let recordHeight = region.height * scaleFactor;

      if (region.quality && region.quality !== 'auto') {
        const qualityPreset = RESOLUTION_PRESETS[region.quality];
        if (qualityPreset) {
          console.log('[useScreenRecorder] Applying quality preset:', region.quality, qualityPreset);

          // Scale to fit quality preset while maintaining aspect ratio
          const aspectRatio = recordWidth / recordHeight;
          if (aspectRatio > qualityPreset.width / qualityPreset.height) {
            // Width is the limiting factor
            recordWidth = qualityPreset.width;
            recordHeight = Math.round(qualityPreset.width / aspectRatio);
          } else {
            // Height is the limiting factor
            recordHeight = qualityPreset.height;
            recordWidth = Math.round(qualityPreset.height * aspectRatio);
          }

          console.log('[useScreenRecorder] Target dimensions:', recordWidth, 'x', recordHeight);
        }
      } else {
        console.log('[useScreenRecorder] Using auto quality (original dimensions):', recordWidth, 'x', recordHeight);
      }

      // Use region.fps if provided, otherwise use fps parameter
      const actualFPS = region.fps || fps;
      console.log('[useScreenRecorder] Recording at', actualFPS, 'FPS');

      // Create cropped video stream using canvas
      console.log('[useScreenRecorder] Creating cropped video stream');
      const { stream: videoStream, cleanup } = await createCroppedStream(
        sourceId,
        region,
        actualFPS,
        { width: recordWidth, height: recordHeight }
      );
      console.log('[useScreenRecorder] Cropped video stream created');
      regionCleanupRef.current = cleanup;

      // Create audio streams if enabled (Phase 3)
      const audioStreams: MediaStream[] = [];

      if (region.audioSettings?.microphoneEnabled) {
        console.log('[useScreenRecorder] Creating microphone stream');
        const micStream = await createMicrophoneStream(
          region.audioSettings.microphoneDeviceId
        );
        if (micStream) {
          audioStreams.push(micStream);
          console.log('[useScreenRecorder] Microphone stream created');
        } else {
          console.warn('[useScreenRecorder] Failed to create microphone stream');
        }
      }

      if (region.audioSettings?.desktopAudioEnabled) {
        console.log('[useScreenRecorder] Creating desktop audio stream');
        const blackHoleDevice = await getBlackHoleDevice();
        if (blackHoleDevice) {
          try {
            const desktopStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                deviceId: { exact: blackHoleDevice.deviceId },
                sampleRate: 48000
              }
            });
            audioStreams.push(desktopStream);
            console.log('[useScreenRecorder] Desktop audio stream created');
          } catch (error) {
            console.error('[useScreenRecorder] Failed to create desktop audio stream:', error);
          }
        } else {
          console.warn('[useScreenRecorder] BlackHole device not found');
        }
      }

      // Combine video and audio streams
      let finalStream: MediaStream;

      if (audioStreams.length > 0) {
        console.log('[useScreenRecorder] Combining', audioStreams.length, 'audio streams with video');

        // Combine multiple audio streams if needed
        const combinedAudioStream = audioStreams.length > 1
          ? combineAudioStreams(audioStreams)
          : audioStreams[0];

        // Create final stream with video + audio tracks
        finalStream = new MediaStream([
          ...videoStream.getVideoTracks(),
          ...combinedAudioStream.getAudioTracks()
        ]);

        // Store audio streams for cleanup
        audioStreamsRef.current = audioStreams;

        console.log('[useScreenRecorder] Final stream created with audio:',
          finalStream.getVideoTracks().length, 'video tracks,',
          finalStream.getAudioTracks().length, 'audio tracks');
      } else {
        console.log('[useScreenRecorder] No audio streams, using video only');
        finalStream = videoStream;
      }

      streamRef.current = finalStream;

      // Try H.264 first (better hardware support, wider compatibility)
      // Fall back to VP9 if H.264 not available
      const codecPreference = [
        'video/webm;codecs=h264',
        'video/webm;codecs=avc1',  // Alternative H.264 identifier
        'video/webm;codecs=vp9',   // Fallback to VP9
        'video/webm'
      ];

      const mimeType = codecPreference.find(codec =>
        MediaRecorder.isTypeSupported(codec)
      ) || 'video/webm';

      const selectedCodec = getCodecName(mimeType);
      console.log('[useScreenRecorder] Selected codec:', mimeType, '→', selectedCodec);

      // Calculate bitrate with improved quality (0.18 bpp for CleanShot X quality)
      const videoBitsPerSecond = calculateBitrate(
        region.width * scaleFactor,
        region.height * scaleFactor,
        actualFPS,
        0.18  // CleanShot X quality level
      );
      console.log('[useScreenRecorder] Video bitrate:', videoBitsPerSecond);

      console.log('[useScreenRecorder] Creating MediaRecorder');
      const mediaRecorder = new MediaRecorder(finalStream, {
        mimeType,
        videoBitsPerSecond,
        // Add audio bitrate if audio is enabled
        audioBitsPerSecond: audioStreams.length > 0 ? 128000 : undefined
      });
      console.log('[useScreenRecorder] MediaRecorder created with audio support:', audioStreams.length > 0);

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
      setState(prev => ({ ...prev, isRecording: true, isPaused: false, selectedCodec }));
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

        // Cleanup audio streams (Phase 3)
        if (audioStreamsRef.current.length > 0) {
          console.log('[ScreenRecording] Cleaning up', audioStreamsRef.current.length, 'audio streams');
          audioStreamsRef.current.forEach(stream => {
            stream.getTracks().forEach(track => track.stop());
          });
          audioStreamsRef.current = [];
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
    // Cleanup audio streams
    if (audioStreamsRef.current.length > 0) {
      audioStreamsRef.current.forEach(stream => {
        stream.getTracks().forEach(track => track.stop());
      });
      audioStreamsRef.current = [];
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
      selectedCodec: null,
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
