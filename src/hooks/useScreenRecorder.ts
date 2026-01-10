import { useState, useRef, useCallback, useEffect } from 'react';
import { fixWebmMetadata } from '../utils/webmFixer';
import { createCroppedStream, getDisplaySourceId, calculateBitrate } from '../utils/regionCapture';
import { createMicrophoneStream, combineAudioStreams, getBlackHoleDevice } from '../utils/audioCapture';
import { SpaceDetector } from '../utils/spaceDetector';
import { RESOLUTION_PRESETS, useScreenRecordingSettings } from '../context/ScreenRecordingSettingsContext';
import { memoryMonitor, type MemoryAlert } from '../utils/memoryMonitor'; // Phase 6: Memory Monitoring
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
  pauseSource: 'manual' | 'marking' | null;
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
  stopRecording: () => Promise<{
    blob: Blob | null;
    durationMs: number;
    filePath?: string;
    audioBlob?: Blob | null;
    audioConfig?: { bitrate: '32k' | '64k' | '128k'; channels: 1 | 2 };
    audioOffsetMs?: number;
  } | null>;
  pauseRecording: (source?: 'manual' | 'marking', origin?: string) => void;
  resumeRecording: (origin?: string) => void;
  pauseForMarking: () => void;
  resumeFromMarking: () => void;
  resetRecording: () => void;
  handleMarkToggle: () => void;
  setMarkNote: (note: string) => void;
}

export interface UseScreenRecorderReturn extends ScreenRecorderState, ScreenRecorderControls {
  pendingMarkStart: number | null;
  pendingMarkNote: string;
  completedMarks: DurationMark[];
  isMarking: boolean;
  pauseSource: 'manual' | 'marking' | null;
  memoryAlert: MemoryAlert | null;
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
  const { settings } = useScreenRecordingSettings();

  const [state, setState] = useState<ScreenRecorderState>({
    isRecording: false,
    isPaused: false,
    pauseSource: null,
    duration: 0,
    videoBlob: null,
    videoUrl: null,
    error: null,
    selectedSource: null,
    captureArea: null,
    selectedCodec: null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const accumulatedTimeRef = useRef<number>(0);
  const regionCleanupRef = useRef<(() => void) | null>(null);
  const audioStreamsRef = useRef<MediaStream[]>([]);
  const audioContextCleanupRef = useRef<(() => Promise<void>) | null>(null); // Phase 3: AudioContext cleanup
  const audioEncodingRef = useRef<{ bitrate: '32k' | '64k' | '128k'; channels: 1 | 2; bitsPerSecond: number } | null>(null);
  const audioStartTimeRef = useRef<number | null>(null);
  const spaceDetectorRef = useRef<SpaceDetector | null>(null);
  const updateSourceRef = useRef<((newSourceId: string, force?: boolean) => Promise<void>) | null>(null);

  // Debug timeline logging (per recording)
  const debugSessionIdRef = useRef<string | null>(null);
  const debugWallStartRef = useRef<number>(0);
  const debugPerfStartRef = useRef<number>(0);
  const debugSeqRef = useRef<number>(0);
  const pendingAudioCommandRef = useRef<{
    id: string;
    kind: 'pause' | 'resume';
    requestedAtMs: number;
    requestedAtPerf: number;
  } | null>(null);

  const logTimelineEvent = useCallback(async (
    type: string,
    origin: string,
    payload?: Record<string, any>
  ) => {
    const recordingId = (window as any).__screenRecordingId as number | undefined;
    const logger = window.electronAPI?.screenRecording?.logDebugEvent;
    if (!recordingId || typeof logger !== 'function') return;

    const nowMs = Date.now();
    const nowPerf = typeof performance !== 'undefined' ? performance.now() : 0;
    const sessionId = debugSessionIdRef.current;
    const startedAtMs = debugWallStartRef.current;
    const startedAtPerf = debugPerfStartRef.current;
    const tFromStartMs = startedAtPerf ? Math.round(nowPerf - startedAtPerf) : undefined;

    const seq = ++debugSeqRef.current;
    await logger(recordingId, {
      type,
      atMs: nowMs,
      origin,
      payload: {
        seq,
        sessionId,
        nowMs,
        nowPerf,
        startedAtMs,
        startedAtPerf,
        tFromStartMs,
        ...payload
      }
    });
  }, []);

  // Duration marking state (same pattern as audio)
  const [pendingMarkStart, setPendingMarkStart] = useState<number | null>(null);
  const [pendingMarkNote, setPendingMarkNote] = useState<string>('');
  const [completedMarks, setCompletedMarks] = useState<DurationMark[]>([]);

	  // Pause source tracking (manual vs marking)
	  const [pauseSource, setPauseSource] = useState<'manual' | 'marking' | null>(null);

  // Refs for stable callbacks (avoid recreating callbacks on every state change)
  const pauseSourceRef = useRef<'manual' | 'marking' | null>(null);
  const isPausedRef = useRef(false);
  const isRecordingRef = useRef(false);
  const pauseInFlightRef = useRef(false);
  const resumeInFlightRef = useRef(false);

  // Keep refs in sync with state
  useEffect(() => {
    pauseSourceRef.current = pauseSource;
    isPausedRef.current = state.isPaused;
    isRecordingRef.current = state.isRecording;
  }, [pauseSource, state.isPaused, state.isRecording]);

  const getCurrentElapsedMs = useCallback(() => {
    if (!isRecordingRef.current) return 0;
    if (isPausedRef.current) return accumulatedTimeRef.current;
    return accumulatedTimeRef.current + (Date.now() - startTimeRef.current);
  }, []);

  // Phase 6: Memory monitoring state
  const [memoryAlert, setMemoryAlert] = useState<MemoryAlert | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);

      // Cleanup Space detector
      if (spaceDetectorRef.current) {
        spaceDetectorRef.current.stop();
        spaceDetectorRef.current = null;
      }
    };
  }, [state.videoUrl]);

  const getAudioEncodingConfig = (resolution: string | undefined) => {
    switch (resolution) {
      case '480p':
        return { bitrate: '32k' as const, channels: 1 as const, bitsPerSecond: 32000 };
      case '720p':
        return { bitrate: '64k' as const, channels: 2 as const, bitsPerSecond: 64000 };
      case '1080p':
      default:
        return { bitrate: '128k' as const, channels: 2 as const, bitsPerSecond: 128000 };
    }
  };

  const getAudioMimeType = () => {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg'
    ];
    return candidates.find(codec => MediaRecorder.isTypeSupported(codec));
  };

  const stopAudioRecorder = async (): Promise<Blob | null> => {
    const recorder = audioRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      audioRecorderRef.current = null;
      audioChunksRef.current = [];
      void logTimelineEvent('audio.stop.skip', 'renderer:useScreenRecorder', {
        reason: 'inactive',
        hadRecorder: !!recorder
      });
      return null;
    }

    return new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = audioChunksRef.current.length
          ? new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
          : null;
        void logTimelineEvent('audio.stop.event', 'renderer:audioRecorder', {
          state: recorder.state,
          chunks: audioChunksRef.current.length,
          blobBytes: blob?.size ?? 0,
          mimeType: recorder.mimeType
        });
        audioChunksRef.current = [];
        audioRecorderRef.current = null;
        resolve(blob);
      };
      void logTimelineEvent('audio.stop.invoke', 'renderer:useScreenRecorder', {
        state: recorder.state,
        chunks: audioChunksRef.current.length
      });
      recorder.stop();
    });
  };

  const cleanupAudioResources = async () => {
    if (audioContextCleanupRef.current) {
      await audioContextCleanupRef.current();
      audioContextCleanupRef.current = null;
    }

    if (audioStreamsRef.current.length > 0) {
      audioStreamsRef.current.forEach(stream => {
        stream.getTracks().forEach(track => track.stop());
      });
      audioStreamsRef.current = [];
    }
  };

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

      // Codec selection based on FPS
      // VP9 for low FPS (<24fps) - H.264 has severe frame dropping issues at low FPS in Chromium
      // H.264 for high FPS (>=24fps) - Better hardware support and compatibility
      const codecPreference = fps < 24
        ? [
            'video/webm;codecs=vp9',   // VP9 handles low FPS much better
            'video/webm;codecs=h264',  // Fallback to H.264
            'video/webm;codecs=avc1',
            'video/webm'
          ]
        : [
            'video/webm;codecs=h264',  // H.264 for normal/high FPS
            'video/webm;codecs=avc1',
            'video/webm;codecs=vp9',
            'video/webm'
          ];

      const mimeType = codecPreference.find(codec =>
        MediaRecorder.isTypeSupported(codec)
      ) || 'video/webm';

      const selectedCodec = getCodecName(mimeType);
      console.log('[useScreenRecorder] FPS:', fps, '→ Codec strategy:', fps < 24 ? 'VP9-first (low FPS)' : 'H.264-first (normal FPS)');
      console.log('[useScreenRecorder] Selected codec:', mimeType, '→', selectedCodec);

      // Calculate bitrate using preset quality settings
      const videoBitsPerSecond = calculateBitrate(
        resolution.width,
        resolution.height,
        fps,
        settings.bitsPerPixel || 0.08  // Use preset quality or fallback to CleanShot X level
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
      audioChunksRef.current = [];
      audioRecorderRef.current = null;
      audioEncodingRef.current = null;
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

      // Create cropped video stream (or file-based recording for ScreenCaptureKit)
      console.log('[useScreenRecorder] Creating capture stream/file');
      const captureResult = await createCroppedStream(
        sourceId,
        region,
        actualFPS,
        { width: recordWidth, height: recordHeight },
        settings.bitsPerPixel
      );
      console.log('[useScreenRecorder] Capture created (file-based:', captureResult.isFileBased, ')');
      regionCleanupRef.current = captureResult.cleanup;
      updateSourceRef.current = captureResult.updateSource;

	      // Handle file-based recording (ScreenCaptureKit with AVAssetWriter)
	      if (captureResult.isFileBased && captureResult.filePath) {
	        console.log('[useScreenRecorder] ✅ File-based recording flow activated');
	        console.log('[useScreenRecorder] 📍 Recording start time:', new Date().toISOString());
	        console.log('[useScreenRecorder] 📂 RecordingId:', region.recordingId);

	        // Store recordingId and start time for later use
	        (window as any).__screenRecordingId = region.recordingId;
	        (window as any).__screenRecordingStartTime = Date.now();
	        (window as any).__isFileBased = true; // Flag to prevent legacy flow

	        debugSessionIdRef.current = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
	          ? crypto.randomUUID()
	          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
	        debugWallStartRef.current = Date.now();
	        debugPerfStartRef.current = typeof performance !== 'undefined' ? performance.now() : 0;
	        debugSeqRef.current = 0;
	        await logTimelineEvent('rec.start', 'renderer:useScreenRecorder', {
	          recordingId: region.recordingId,
	          flow: 'file-based',
	          fps,
	          region: {
	            displayId: region.displayId,
	            x: region.x,
	            y: region.y,
	            width: region.width,
	            height: region.height,
	            scaleFactor: region.scaleFactor
	          }
	        });
	        if (typeof region.recordingId === 'number') {
	          try {
	            const debugLogPath = await window.electronAPI.screenRecording.getDebugLogPath(region.recordingId);
	            console.log('[useScreenRecorder] 🧾 Timeline debug log:', debugLogPath);
	            void logTimelineEvent('rec.debugLogPath', 'renderer:useScreenRecorder', { debugLogPath });
	          } catch {
	            // Non-fatal
	          }
	        }

	        // Start timer
	        startTimeRef.current = Date.now();
	        accumulatedTimeRef.current = 0;

        timerRef.current = setInterval(() => {
          const elapsed = accumulatedTimeRef.current + (Date.now() - startTimeRef.current);
          setState(prev => ({ ...prev, duration: Math.floor(elapsed / 1000) }));
        }, 100);

        setState(prev => ({ ...prev, isRecording: true, isPaused: false, selectedCodec: 'H.264 (Hardware)' }));

        // Store the file path promise for later
        // When stop is called, we'll wait for this promise to resolve
        (window as any).__screenRecordingFilePromise = captureResult.filePath;

        // Start audio recording if enabled (file-based path)
        const shouldUseRegionAudio = !!region.audioSettings?.microphoneEnabled || !!region.audioSettings?.desktopAudioEnabled;
        if (shouldUseRegionAudio) {
          const resolvedQuality = region.quality && region.quality !== 'auto'
            ? region.quality
            : settings.resolution;
          const audioConfig = getAudioEncodingConfig(resolvedQuality);
          const audioChannelCount = audioConfig.channels === 1 ? 1 : undefined;
          const channelConfig = audioChannelCount ? { channelCount: audioChannelCount } : {};
          const audioStreams: MediaStream[] = [];

          if (region.audioSettings?.microphoneEnabled) {
            console.log('[useScreenRecorder] Creating microphone stream (file-based)');
            const micStream = await createMicrophoneStream(
              region.audioSettings.microphoneDeviceId,
              audioChannelCount
            );
            if (micStream) {
              audioStreams.push(micStream);
              console.log('[useScreenRecorder] Microphone stream created (file-based)');
            } else {
              console.warn('[useScreenRecorder] Failed to create microphone stream (file-based)');
            }
          }

          if (region.audioSettings?.desktopAudioEnabled) {
            console.log('[useScreenRecorder] Creating desktop audio stream (file-based)');
            const blackHoleDevice = await getBlackHoleDevice();
            if (blackHoleDevice) {
              try {
                const desktopStream = await navigator.mediaDevices.getUserMedia({
                  audio: {
                    deviceId: { exact: blackHoleDevice.deviceId },
                    sampleRate: 48000,
                    ...channelConfig
                  }
                });
                audioStreams.push(desktopStream);
                console.log('[useScreenRecorder] Desktop audio stream created (file-based)');
              } catch (error) {
                console.error('[useScreenRecorder] Failed to create desktop audio stream (file-based):', error);
              }
            } else {
              console.warn('[useScreenRecorder] BlackHole device not found (file-based)');
            }
          }

          // Validate audio streams were created successfully
          if (audioStreams.length === 0) {
            const audioSources = [];
            if (region.audioSettings?.microphoneEnabled) audioSources.push('Microphone');
            if (region.audioSettings?.desktopAudioEnabled) audioSources.push('Desktop Audio');

            console.error('[useScreenRecorder] Audio validation failed: No audio streams created');
            console.error('[useScreenRecorder] Expected sources:', audioSources.join(', '));

            throw new Error(
              `Failed to initialize audio recording. Please check:\n` +
              `• ${region.audioSettings?.microphoneEnabled ? 'Microphone is connected and permissions granted\n' : ''}` +
              `• ${region.audioSettings?.desktopAudioEnabled ? 'BlackHole audio device is installed and running\n' : ''}` +
              `• Audio settings are correctly configured`
            );
          }

          if (audioStreams.length > 0) {
            audioStreamsRef.current = audioStreams;
            let audioStream: MediaStream;

            if (audioStreams.length > 1) {
              const { stream, cleanup } = combineAudioStreams(audioStreams);
              audioStream = stream;
              audioContextCleanupRef.current = cleanup;
            } else {
              audioStream = audioStreams[0];
              audioContextCleanupRef.current = null;
            }

            audioEncodingRef.current = audioConfig;

            const audioMimeType = getAudioMimeType();
            const recorderOptions: MediaRecorderOptions = {
              audioBitsPerSecond: audioConfig.bitsPerSecond
            };
            if (audioMimeType) {
              recorderOptions.mimeType = audioMimeType;
            }

	            try {
	              const audioRecorder = new MediaRecorder(audioStream, recorderOptions);
	              audioRecorderRef.current = audioRecorder;
	              audioChunksRef.current = [];
	              const audioSessionId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
	                ? crypto.randomUUID()
	                : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
	              let audioChunkIndex = 0;

	              audioRecorder.ondataavailable = (event) => {
	                if (event.data.size > 0) {
	                  audioChunksRef.current.push(event.data);
	                  audioChunkIndex += 1;
	                  if (audioChunkIndex <= 5 || audioChunkIndex % 20 === 0) {
	                    void logTimelineEvent('audio.data', 'renderer:audioRecorder', {
	                      audioSessionId,
	                      idx: audioChunkIndex,
	                      size: event.data.size,
	                      state: audioRecorder.state,
	                      mimeType: audioRecorder.mimeType
	                    });
	                  }
	                }
	              };

	              audioRecorder.onerror = (event) => {
	                console.error('[useScreenRecorder] Audio recorder error (file-based):', event);
	                void logTimelineEvent('audio.error', 'renderer:audioRecorder', { audioSessionId });
	              };

	              audioRecorder.onpause = () => {
	                const pending = pendingAudioCommandRef.current;
	                const nowMs = Date.now();
	                const nowPerf = typeof performance !== 'undefined' ? performance.now() : 0;
	                void logTimelineEvent('audio.pause.event', 'renderer:audioRecorder', {
	                  audioSessionId,
	                  state: audioRecorder.state,
	                  pending,
	                  deltaMs: pending?.kind === 'pause' ? (nowMs - pending.requestedAtMs) : undefined,
	                  deltaPerfMs: pending?.kind === 'pause' ? Math.round(nowPerf - pending.requestedAtPerf) : undefined
	                });
	              };

	              audioRecorder.onresume = () => {
	                const pending = pendingAudioCommandRef.current;
	                const nowMs = Date.now();
	                const nowPerf = typeof performance !== 'undefined' ? performance.now() : 0;
	                void logTimelineEvent('audio.resume.event', 'renderer:audioRecorder', {
	                  audioSessionId,
	                  state: audioRecorder.state,
	                  pending,
	                  deltaMs: pending?.kind === 'resume' ? (nowMs - pending.requestedAtMs) : undefined,
	                  deltaPerfMs: pending?.kind === 'resume' ? Math.round(nowPerf - pending.requestedAtPerf) : undefined
	                });
	              };

	              audioRecorder.onstart = () => {
	                void logTimelineEvent('audio.start.event', 'renderer:audioRecorder', {
	                  audioSessionId,
	                  state: audioRecorder.state,
	                  mimeType: audioRecorder.mimeType,
	                  options: recorderOptions
	                });
	              };

	              audioStartTimeRef.current = Date.now();
	              audioRecorder.start(100);
	              console.log('[useScreenRecorder] ✅ Audio recorder started (file-based)');
	              void logTimelineEvent('audio.start.called', 'renderer:useScreenRecorder', {
	                audioSessionId,
	                atMs: audioStartTimeRef.current,
	                mimeType: audioRecorder.mimeType,
	                options: recorderOptions
	              });
	            } catch (error) {
	              console.error('[useScreenRecorder] Failed to start audio recorder (file-based):', error);
	              void logTimelineEvent('audio.start.error', 'renderer:useScreenRecorder', {
	                error: error instanceof Error ? error.message : String(error)
	              });
	            }
	          }
	        }

        console.log('[useScreenRecorder] ✅ File-based recording started - MediaRecorder flow WILL NOT execute');
        console.log('[useScreenRecorder] 🚫 Preventing legacy WebM recording flow');

        // CRITICAL: Return here to prevent MediaRecorder flow
        return;
      }

      // Safety check: Ensure we don't run MediaRecorder flow if file-based recording is active
      if ((window as any).__isFileBased) {
        console.error('[useScreenRecorder] ❌ CRITICAL: MediaRecorder flow attempted while file-based recording is active!');
        console.error('[useScreenRecorder] This should never happen - the return statement should prevent this');
        throw new Error('Dual recording flow detected - file-based recording already active');
      }

      // Legacy stream-based recording (desktopCapturer)
      const videoStream = captureResult.stream!;
      console.log('[useScreenRecorder] 📹 Using legacy stream-based recording with MediaRecorder');
      console.log('[useScreenRecorder] ℹ️ This flow creates .webm files with VP9/H.264 codec');

      // Start Space detector for automatic source switching
      console.log('[useScreenRecorder] Starting Space detector');
      spaceDetectorRef.current = new SpaceDetector();
      await spaceDetectorRef.current.start(
        sourceId,
        region.displayId,
        async (newSourceId, _displayId, force = false) => {
          console.log(`[useScreenRecorder] 🔄 Space switch detected (force: ${force}), updating source`);
          if (updateSourceRef.current) {
            await updateSourceRef.current(newSourceId, force);
          }
        }
      );
      console.log('[useScreenRecorder] Space detector started');

      const resolvedQuality = region.quality && region.quality !== 'auto'
        ? region.quality
        : settings.resolution;
      const audioConfig = getAudioEncodingConfig(resolvedQuality);
      const audioChannelCount = audioConfig.channels === 1 ? 1 : undefined;
      const channelConfig = audioChannelCount ? { channelCount: audioChannelCount } : {};

      // Create audio streams if enabled (Phase 3)
      const audioStreams: MediaStream[] = [];

      if (region.audioSettings?.microphoneEnabled) {
        console.log('[useScreenRecorder] Creating microphone stream');
        const micStream = await createMicrophoneStream(
          region.audioSettings.microphoneDeviceId,
          audioChannelCount
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
                sampleRate: 48000,
                ...channelConfig
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

        // Combine multiple audio streams if needed (Phase 3: Store cleanup function)
        let combinedAudioStream: MediaStream;
        if (audioStreams.length > 1) {
          const { stream, cleanup } = combineAudioStreams(audioStreams);
          combinedAudioStream = stream;
          audioContextCleanupRef.current = cleanup; // Store cleanup for later
        } else {
          combinedAudioStream = audioStreams[0];
          audioContextCleanupRef.current = null; // No AudioContext when using single stream
        }

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

      // Codec selection based on FPS
      // VP9 for low FPS (<24fps) - H.264 has severe frame dropping issues at low FPS in Chromium
      // H.264 for high FPS (>=24fps) - Better hardware support and compatibility
      const codecPreference = actualFPS < 24
        ? [
            'video/webm;codecs=vp9',   // VP9 handles low FPS much better
            'video/webm;codecs=h264',  // Fallback to H.264
            'video/webm;codecs=avc1',
            'video/webm'
          ]
        : [
            'video/webm;codecs=h264',  // H.264 for normal/high FPS
            'video/webm;codecs=avc1',
            'video/webm;codecs=vp9',
            'video/webm'
          ];

      const mimeType = codecPreference.find(codec =>
        MediaRecorder.isTypeSupported(codec)
      ) || 'video/webm';

      const selectedCodec = getCodecName(mimeType);
      console.log('[useScreenRecorder] FPS:', actualFPS, '→ Codec strategy:', actualFPS < 24 ? 'VP9-first (low FPS)' : 'H.264-first (normal FPS)');
      console.log('[useScreenRecorder] Selected codec:', mimeType, '→', selectedCodec);

      // Calculate bitrate using preset quality settings
      const videoBitsPerSecond = calculateBitrate(
        recordWidth,
        recordHeight,
        actualFPS,
        settings.bitsPerPixel || 0.08  // Use preset quality or fallback to CleanShot X level
      );
      console.log('[useScreenRecorder] Video bitrate:', videoBitsPerSecond);

      console.log('[useScreenRecorder] Creating MediaRecorder');
      const mediaRecorder = new MediaRecorder(finalStream, {
        mimeType,
        videoBitsPerSecond,
        // Add audio bitrate if audio is enabled
        audioBitsPerSecond: audioStreams.length > 0 ? audioConfig.bitsPerSecond : undefined
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

      // Phase 6: Start memory monitoring
      memoryMonitor.start({
        interval: 2000,              // Check every 2 seconds
        warningThreshold: 0.7,       // Warn at 70% heap usage
        criticalThreshold: 0.85,     // Critical at 85% heap usage
        onAlert: (alert) => {
          setMemoryAlert(alert);

          // Optional: Auto-stop on critical threshold to prevent crash
          if (alert.level === 'critical') {
            console.error('[ScreenRecorder] 🚨 Critical memory detected - consider stopping recording');
            // Uncomment to enable auto-stop on critical memory:
            // console.error('[ScreenRecorder] Auto-stopping recording to prevent crash');
            // stopRecording();
          }
        }
      });

      console.log('[useScreenRecorder] Recording started successfully');
    } catch (err) {
      console.error('[useScreenRecorder] Failed to start region recording:', err);
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to start region recording',
      }));
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<{
    blob: Blob | null;
    durationMs: number;
    filePath?: string;
    audioBlob?: Blob | null;
    audioConfig?: { bitrate: '32k' | '64k' | '128k'; channels: 1 | 2 };
    audioOffsetMs?: number;
  } | null> => {
    // Handle file-based recording (ScreenCaptureKit with AVAssetWriter)
    if ((window as any).__screenRecordingFilePromise) {
      console.log('[useScreenRecorder] 🛑 Stopping file-based recording');
      console.log('[useScreenRecorder] 📍 Stop time:', new Date().toISOString());

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      const startTime = (window as any).__screenRecordingStartTime || startTimeRef.current;
      const endTime = Date.now();
      const actualDurationMs = endTime - startTime;
      const durationMs = getCurrentElapsedMs();
      const audioOffsetMs = audioStartTimeRef.current ? audioStartTimeRef.current - startTime : 0;

      void logTimelineEvent('rec.stop.begin', 'renderer:useScreenRecorder', {
        startTime,
        endTime,
        actualDurationMs,
        durationMs,
        accumulatedMs: accumulatedTimeRef.current,
        audioOffsetMs,
        isPaused: isPausedRef.current,
        pauseSource: pauseSourceRef.current
      });

      console.log('[useScreenRecorder] ⏱️ Recording duration:', {
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        durationMs: actualDurationMs,
        durationSec: (actualDurationMs / 1000).toFixed(2),
        accumulatedTime: accumulatedTimeRef.current,
        calculatedDuration: durationMs
      });

      // Detect premature stop
      if (actualDurationMs < 1000) {
        console.warn('[useScreenRecorder] ⚠️ PREMATURE STOP DETECTED! Duration:', actualDurationMs, 'ms');
        console.warn('[useScreenRecorder] Recording stopped in less than 1 second - this is likely a bug');
      } else if (actualDurationMs < 5000) {
        console.warn('[useScreenRecorder] ⚠️ Short recording detected:', (actualDurationMs / 1000).toFixed(2), 'seconds');
      }

      // Auto-complete pending mark
      if (pendingMarkStart !== null) {
        const endTime = Math.floor(durationMs / 1000);
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

      try {
        const audioBlobPromise = stopAudioRecorder();

        // FIRST: Stop the native capture (but keep listeners alive)
        console.log('[useScreenRecorder] 📞 Calling native stopCapture');
        void logTimelineEvent('video.stop.invoke', 'renderer:useScreenRecorder');
        await window.electronAPI.screenCaptureKit.stopCapture();
        void logTimelineEvent('video.stop.resolved', 'renderer:useScreenRecorder');
        console.log('[useScreenRecorder] ✅ Native stopCapture completed');

        // SECOND: Wait for the completion event with the file path
        console.log('[useScreenRecorder] ⏳ Waiting for file path from native completion callback...');
        void logTimelineEvent('video.complete.wait', 'renderer:useScreenRecorder');
        const filePath = await (window as any).__screenRecordingFilePromise;
        void logTimelineEvent('video.complete.received', 'renderer:useScreenRecorder', { filePath });
        console.log('[useScreenRecorder] ✅ File path received:', filePath);

        const audioBlob = await audioBlobPromise;
        void logTimelineEvent('audio.stop.resolved', 'renderer:useScreenRecorder', { audioBytes: audioBlob?.size ?? 0 });
        await cleanupAudioResources();

        // Clear all file-based recording state
        console.log('[useScreenRecorder] 🧹 Cleaning up file-based recording state');
        delete (window as any).__screenRecordingFilePromise;
        delete (window as any).__screenRecordingId;
        delete (window as any).__screenRecordingStartTime;
        delete (window as any).__isFileBased;

        // FINALLY: Clean up the listeners now that we have the file
        if (regionCleanupRef.current) {
          console.log('[useScreenRecorder] 🧹 Cleaning up region listeners');
          regionCleanupRef.current();
          regionCleanupRef.current = null;
        }

        console.log('[useScreenRecorder] ✅ File-based recording stopped successfully');
        console.log('[useScreenRecorder] 📁 Final file path:', filePath);
        console.log('[useScreenRecorder] ⏱️ Final duration:', (actualDurationMs / 1000).toFixed(2), 'seconds');

        void logTimelineEvent('rec.stop.done', 'renderer:useScreenRecorder', {
          filePath,
          durationMs,
          actualDurationMs,
          audioOffsetMs,
          audioBytes: audioBlob?.size ?? 0
        });

        // For file-based recording, we don't have a blob
        // The file is already saved, so we set state with the file path
        setState(prev => ({
          ...prev,
          isRecording: false,
          isPaused: false,
          videoBlob: null, // No blob for file-based
          videoUrl: filePath, // Use file path directly
        }));

        // Create a dummy blob to maintain API compatibility
        // The caller should check for file path instead
        const audioConfig = audioEncodingRef.current
          ? { bitrate: audioEncodingRef.current.bitrate, channels: audioEncodingRef.current.channels }
          : undefined;
        audioEncodingRef.current = null;
        audioStartTimeRef.current = null;

        return { blob: null, durationMs, filePath, audioBlob, audioConfig, audioOffsetMs };
      } catch (error) {
        console.error('[useScreenRecorder] ❌ File-based recording failed:', error);
        void logTimelineEvent('rec.stop.error', 'renderer:useScreenRecorder', {
          error: error instanceof Error ? error.message : String(error)
        });

        // Clean up on error
        if (regionCleanupRef.current) {
          regionCleanupRef.current();
          regionCleanupRef.current = null;
        }

        await cleanupAudioResources();
        audioEncodingRef.current = null;
        audioStartTimeRef.current = null;

        setState(prev => ({
          ...prev,
          isRecording: false,
          error: error instanceof Error ? error.message : 'Recording failed'
        }));
        return null;
      }
    }

    // Legacy MediaRecorder-based recording
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

      // Phase 6: Stop memory monitoring
      memoryMonitor.stop();
      setMemoryAlert(null);

      // Stop Space detector
      if (spaceDetectorRef.current) {
        spaceDetectorRef.current.stop();
        spaceDetectorRef.current = null;
      }
      updateSourceRef.current = null;

      // Auto-complete pending mark (same as audio)
      if (pendingMarkStart !== null) {
        const endTime = Math.floor(getCurrentElapsedMs() / 1000);
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
        const durationMs = getCurrentElapsedMs();

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

          // Clean up AudioContext if exists (Phase 3: Memory Leak Fix)
          if (audioContextCleanupRef.current) {
            await audioContextCleanupRef.current();
            audioContextCleanupRef.current = null;
          }

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

        resolve({ blob, durationMs });
      };

      mediaRecorder.stop();
    });
  }, [pendingMarkStart, pendingMarkNote]);

  const pauseRecording = useCallback(async (
    source: 'manual' | 'marking' = 'manual',
    origin: string = 'unknown'
  ) => {
    console.log('[useScreenRecorder] pauseRecording() called with source:', source);

    if (!isRecordingRef.current) {
      void logTimelineEvent('rec.pause.noop', `renderer:${origin}`, {
        source,
        reason: 'not-recording',
      });
      return;
    }

    if (pauseInFlightRef.current || isPausedRef.current) {
      const previousSource = pauseSourceRef.current;
      if (source === 'manual' && previousSource !== 'manual') {
        pauseSourceRef.current = 'manual';
        setPauseSource('manual');
        setState(prev => ({ ...prev, pauseSource: 'manual' }));
        void logTimelineEvent('rec.pause.upgradeSource', `renderer:${origin}`, {
          from: previousSource,
          to: 'manual'
        });
      }
      void logTimelineEvent('rec.pause.noop', `renderer:${origin}`, {
        source,
        reason: pauseInFlightRef.current ? 'pause-in-flight' : 'already-paused',
        pauseSource: pauseSourceRef.current
      });
      return;
    }

    pauseInFlightRef.current = true;
    void logTimelineEvent('rec.pause.begin', `renderer:${origin}`, {
      source,
      isFileBased: !!(window as any).__isFileBased,
      isPaused: isPausedRef.current,
      isRecording: isRecordingRef.current,
      timer: {
        startTimeMs: startTimeRef.current,
        accumulatedMs: accumulatedTimeRef.current
      }
    });

    // Check if we're using file-based recording
    const isFileBased = (window as any).__isFileBased;
    if (isFileBased) {
      console.log('[useScreenRecorder] 🎬 File-based recording - calling native pause');
      try {
        const pauseInvokeAt = Date.now();
        void logTimelineEvent('video.pause.invoke', `renderer:${origin}`, { source, pauseInvokeAt });
        await window.electronAPI.screenCaptureKit.pauseCapture();
        void logTimelineEvent('video.pause.resolved', `renderer:${origin}`, {
          source,
          pauseInvokeAt,
          deltaMs: Date.now() - pauseInvokeAt
        });

        const audioRecorder = audioRecorderRef.current;
        if (audioRecorder && audioRecorder.state === 'recording') {
          try {
            const commandId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
            const requestedAtMs = Date.now();
            const requestedAtPerf = typeof performance !== 'undefined' ? performance.now() : 0;
            pendingAudioCommandRef.current = { id: commandId, kind: 'pause', requestedAtMs, requestedAtPerf };
            void logTimelineEvent('audio.pause.invoke', `renderer:${origin}`, {
              source,
              commandId,
              state: audioRecorder.state
            });
            audioRecorder.pause();
            console.log('[useScreenRecorder] 🔇 Audio recorder paused (file-based)');
            void logTimelineEvent('audio.pause.called', `renderer:${origin}`, {
              source,
              commandId,
              state: audioRecorder.state
            });
          } catch (error) {
            console.warn('[useScreenRecorder] ⚠️ Failed to pause audio recorder (file-based):', error);
            void logTimelineEvent('audio.pause.error', `renderer:${origin}`, {
              source,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }

        // Pause the timer
        const timeBeforePause = Date.now() - startTimeRef.current;
        accumulatedTimeRef.current += timeBeforePause;
        void logTimelineEvent('timer.pause', `renderer:${origin}`, {
          source,
          timeBeforePause,
          accumulatedMs: accumulatedTimeRef.current
        });
        console.log('[useScreenRecorder] ⏸️ PAUSE TIMING:');
        console.log('[useScreenRecorder]   - Time elapsed this session:', Math.floor(timeBeforePause / 1000), 'seconds');
        console.log('[useScreenRecorder]   - Total accumulated time:', Math.floor(accumulatedTimeRef.current / 1000), 'seconds');
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        const effectivePauseSource = pauseSourceRef.current === 'manual' ? 'manual' : source;
        setState(prev => ({ ...prev, isPaused: true, pauseSource: effectivePauseSource }));
        console.log('[useScreenRecorder] ✅ Native recording paused');
        // Set pause source
        setPauseSource(effectivePauseSource);
        pauseSourceRef.current = effectivePauseSource;
        isPausedRef.current = true;
      } catch (error) {
        console.error('[useScreenRecorder] ❌ Failed to pause native recording:', error);
      }
      pauseInFlightRef.current = false;
      return;
    }

    // Legacy MediaRecorder pause
    const mediaRecorder = mediaRecorderRef.current;
    console.log('[useScreenRecorder] MediaRecorder state:', mediaRecorder?.state);

    if (mediaRecorder && mediaRecorder.state === 'recording') {
      console.log('[useScreenRecorder] Calling mediaRecorder.pause()');
      mediaRecorder.pause();
      const timeBeforePause = Date.now() - startTimeRef.current;
      accumulatedTimeRef.current += timeBeforePause;
      console.log('[useScreenRecorder] ⏸️ PAUSE TIMING:');
      console.log('[useScreenRecorder]   - Time elapsed this session:', Math.floor(timeBeforePause / 1000), 'seconds');
      console.log('[useScreenRecorder]   - Total accumulated time:', Math.floor(accumulatedTimeRef.current / 1000), 'seconds');
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      const effectivePauseSource = pauseSourceRef.current === 'manual' ? 'manual' : source;
      setState(prev => ({ ...prev, isPaused: true, pauseSource: effectivePauseSource }));
      console.log('[useScreenRecorder] Recording paused successfully');
      // Set pause source
      setPauseSource(effectivePauseSource);
      pauseSourceRef.current = effectivePauseSource;
      isPausedRef.current = true;
    } else {
      console.warn('[useScreenRecorder] Cannot pause - invalid state:', mediaRecorder?.state);
    }
    pauseInFlightRef.current = false;
  }, []);

  const resumeRecording = useCallback(async (origin: string = 'unknown') => {
    console.log('[useScreenRecorder] resumeRecording() called');

    if (!isRecordingRef.current) {
      void logTimelineEvent('rec.resume.noop', `renderer:${origin}`, {
        reason: 'not-recording'
      });
      return;
    }

    if (resumeInFlightRef.current || !isPausedRef.current) {
      void logTimelineEvent('rec.resume.noop', `renderer:${origin}`, {
        reason: resumeInFlightRef.current ? 'resume-in-flight' : 'not-paused',
        pauseSource: pauseSourceRef.current
      });
      return;
    }

    resumeInFlightRef.current = true;
    void logTimelineEvent('rec.resume.begin', `renderer:${origin}`, {
      isFileBased: !!(window as any).__isFileBased,
      isPaused: isPausedRef.current,
      isRecording: isRecordingRef.current,
      timer: {
        startTimeMs: startTimeRef.current,
        accumulatedMs: accumulatedTimeRef.current
      }
    });

    // Check if we're using file-based recording
    const isFileBased = (window as any).__isFileBased;
    if (isFileBased) {
      console.log('[useScreenRecorder] 🎬 File-based recording - calling native resume');
      try {
        const resumeInvokeAt = Date.now();
        void logTimelineEvent('video.resume.invoke', `renderer:${origin}`, { resumeInvokeAt });
        await window.electronAPI.screenCaptureKit.resumeCapture();
        void logTimelineEvent('video.resume.resolved', `renderer:${origin}`, {
          resumeInvokeAt,
          deltaMs: Date.now() - resumeInvokeAt
        });

        const audioRecorder = audioRecorderRef.current;
        if (audioRecorder && audioRecorder.state === 'paused') {
          try {
            const commandId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
            const requestedAtMs = Date.now();
            const requestedAtPerf = typeof performance !== 'undefined' ? performance.now() : 0;
            pendingAudioCommandRef.current = { id: commandId, kind: 'resume', requestedAtMs, requestedAtPerf };
            void logTimelineEvent('audio.resume.invoke', `renderer:${origin}`, {
              commandId,
              state: audioRecorder.state
            });
            audioRecorder.resume();
            console.log('[useScreenRecorder] 🔊 Audio recorder resumed (file-based)');
            void logTimelineEvent('audio.resume.called', `renderer:${origin}`, {
              commandId,
              state: audioRecorder.state
            });
          } catch (error) {
            console.warn('[useScreenRecorder] ⚠️ Failed to resume audio recorder (file-based):', error);
            void logTimelineEvent('audio.resume.error', `renderer:${origin}`, {
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }

        // Resume the timer
        console.log('[useScreenRecorder] ▶️ RESUME TIMING:');
        console.log('[useScreenRecorder]   - Accumulated time before resume:', Math.floor(accumulatedTimeRef.current / 1000), 'seconds');
        startTimeRef.current = Date.now();
        void logTimelineEvent('timer.resume', `renderer:${origin}`, {
          startTimeMs: startTimeRef.current,
          accumulatedMs: accumulatedTimeRef.current
        });
        console.log('[useScreenRecorder]   - Starting new timer from:', new Date(startTimeRef.current).toISOString());
        timerRef.current = setInterval(() => {
          const elapsed = accumulatedTimeRef.current + (Date.now() - startTimeRef.current);
          setState(prev => ({ ...prev, duration: Math.floor(elapsed / 1000) }));
        }, 100);
        setState(prev => ({ ...prev, isPaused: false, pauseSource: null }));
        console.log('[useScreenRecorder] ✅ Native recording resumed');
        // Clear pause source
        setPauseSource(null);
        pauseSourceRef.current = null;
        isPausedRef.current = false;
      } catch (error) {
        console.error('[useScreenRecorder] ❌ Failed to resume native recording:', error);
      }
      resumeInFlightRef.current = false;
      return;
    }

    // Legacy MediaRecorder resume
    const mediaRecorder = mediaRecorderRef.current;
    console.log('[useScreenRecorder] MediaRecorder state:', mediaRecorder?.state);

    if (mediaRecorder && mediaRecorder.state === 'paused') {
      console.log('[useScreenRecorder] Calling mediaRecorder.resume()');
      mediaRecorder.resume();
      console.log('[useScreenRecorder] ▶️ RESUME TIMING:');
      console.log('[useScreenRecorder]   - Accumulated time before resume:', Math.floor(accumulatedTimeRef.current / 1000), 'seconds');
      startTimeRef.current = Date.now();
      console.log('[useScreenRecorder]   - Starting new timer from:', new Date(startTimeRef.current).toISOString());
      timerRef.current = setInterval(() => {
        const elapsed = accumulatedTimeRef.current + (Date.now() - startTimeRef.current);
        setState(prev => ({ ...prev, duration: Math.floor(elapsed / 1000) }));
      }, 100);
      setState(prev => ({ ...prev, isPaused: false, pauseSource: null }));
      console.log('[useScreenRecorder] Recording resumed successfully');
      // Clear pause source
      setPauseSource(null);
      pauseSourceRef.current = null;
      isPausedRef.current = false;
    } else {
      console.warn('[useScreenRecorder] Cannot resume - invalid state:', mediaRecorder?.state);
    }
    resumeInFlightRef.current = false;
  }, []);

  // Auto-pause for marking input (doesn't override manual pause)
  const pauseForMarking = useCallback(() => {
    console.log('[useScreenRecorder] ===== pauseForMarking() called =====');
    console.log('[useScreenRecorder] Current state:');
    console.log('[useScreenRecorder]   - isPaused:', isPausedRef.current);
    console.log('[useScreenRecorder]   - pauseSource:', pauseSourceRef.current);

    if (!isPausedRef.current && !pauseInFlightRef.current) {
      console.log('[useScreenRecorder] ✅ Not paused - pausing now with source: marking');
      pauseRecording('marking', 'marking:focus');
      console.log('[useScreenRecorder] ✅ Auto-paused for marking input');
    } else {
      console.log('[useScreenRecorder] ⚠️ Already paused, keeping existing pause source:', pauseSourceRef.current);
    }
  }, [pauseRecording]); // Only depends on pauseRecording, which is stable

  // Auto-resume from marking (only if pause was caused by marking)
  const resumeFromMarking = useCallback(() => {
    console.log('[useScreenRecorder] ===== resumeFromMarking() called =====');
    console.log('[useScreenRecorder] Current state:');
    console.log('[useScreenRecorder]   - isPaused:', isPausedRef.current);
    console.log('[useScreenRecorder]   - pauseSource:', pauseSourceRef.current);
    console.log('[useScreenRecorder]   - isRecording:', isRecordingRef.current);

    if (isPausedRef.current && pauseSourceRef.current === 'marking' && !resumeInFlightRef.current) {
      console.log('[useScreenRecorder] ✅ Conditions met - calling resumeRecording()');
      resumeRecording('marking:blur');
      console.log('[useScreenRecorder] ✅ Auto-resumed from marking input');
    } else if (pauseSourceRef.current === 'manual') {
      console.log('[useScreenRecorder] ⚠️ Respecting manual pause, not resuming');
    } else if (!isPausedRef.current) {
      console.log('[useScreenRecorder] ⚠️ Not paused, nothing to resume');
    } else if (!pauseSourceRef.current) {
      console.log('[useScreenRecorder] ⚠️ No pause source set');
    } else {
      console.log('[useScreenRecorder] ⚠️ Unknown condition - isPaused:', isPausedRef.current, 'pauseSource:', pauseSourceRef.current);
    }
  }, [resumeRecording]); // Only depends on resumeRecording, which is stable

  // Helper to get current elapsed time (respects pause state)
  const getCurrentElapsedTime = useCallback(() => {
    return Math.floor(getCurrentElapsedMs() / 1000);
  }, [getCurrentElapsedMs]);

  const resetRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (audioRecorderRef.current && audioRecorderRef.current.state !== 'inactive') {
      audioRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Phase 6: Stop memory monitoring
    memoryMonitor.stop();
    setMemoryAlert(null);
    cleanupAudioResources().catch(err =>
      console.warn('[ScreenRecording] Audio cleanup error:', err)
    );
    audioEncodingRef.current = null;
    audioStartTimeRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    // Cleanup audio streams
    if (audioStreamsRef.current.length > 0) {
      // Clean up AudioContext if exists (Phase 3: Memory Leak Fix)
      if (audioContextCleanupRef.current) {
        audioContextCleanupRef.current().catch(err =>
          console.warn('[ScreenRecording] AudioContext cleanup error:', err)
        );
        audioContextCleanupRef.current = null;
      }

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
      pauseSource: null,
      duration: 0,
      videoBlob: null,
      videoUrl: null,
      error: null,
      selectedSource: null,
      captureArea: null,
      selectedCodec: null,
    });

    videoChunksRef.current = [];
    audioChunksRef.current = [];
    mediaRecorderRef.current = null;
    audioRecorderRef.current = null;
    startTimeRef.current = 0;
    accumulatedTimeRef.current = 0;
    setPendingMarkStart(null);
    setPendingMarkNote('');
    setCompletedMarks([]);
  }, [state.videoUrl]);

  // Duration marking (identical to audio)
  const handleMarkToggle = useCallback(() => {
    if (!state.isRecording) return;

    // Use pause-aware time calculation
    const currentTime = getCurrentElapsedTime();

    if (pendingMarkStart === null) {
      // Start new mark
      void logTimelineEvent('mark.start', 'renderer:useScreenRecorder', {
        atSeconds: currentTime
      });
      setPendingMarkStart(currentTime);
      setPendingMarkNote('');
    } else {
      // Complete current mark
      if (currentTime > pendingMarkStart) {
        void logTimelineEvent('mark.complete', 'renderer:useScreenRecorder', {
          startSeconds: pendingMarkStart,
          endSeconds: currentTime
        });
        setCompletedMarks(prev => [...prev, {
          start: pendingMarkStart,
          end: currentTime,
          note: pendingMarkNote.trim() || undefined,
        }]);
      } else {
        void logTimelineEvent('mark.complete.skip', 'renderer:useScreenRecorder', {
          startSeconds: pendingMarkStart,
          endSeconds: currentTime
        });
      }
      setPendingMarkStart(null);
      setPendingMarkNote('');
    }
  }, [state.isRecording, pendingMarkStart, pendingMarkNote, getCurrentElapsedTime]);

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
    pauseForMarking,
    resumeFromMarking,
    resetRecording,
    handleMarkToggle,
    setMarkNote,
    pendingMarkStart,
    pendingMarkNote,
    completedMarks,
    isMarking: pendingMarkStart !== null,
    pauseSource, // Expose for debugging
    memoryAlert, // Phase 6: Memory monitoring alerts
  };
}
