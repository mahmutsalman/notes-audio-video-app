import { useState, useRef, useCallback, useEffect } from 'react';
import { fixWebmMetadata } from '../utils/webmFixer';

export interface VoiceRecorderState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  audioBlob: Blob | null;
  audioUrl: string | null;
  error: string | null;
}

export interface DurationMarkImage {
  data: ArrayBuffer;
  extension: string;
}

export interface DurationMark {
  start: number;  // seconds
  end: number;    // seconds
  note?: string;  // optional note for this mark
  images?: DurationMarkImage[];  // images attached to this mark
}

export interface VoiceRecorderControls {
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  resetRecording: () => void;
  handleMarkToggle: () => void;
  setMarkNote: (note: string) => void;
  addImageToLastMark: (image: DurationMarkImage) => boolean;  // returns true if image was added
}

export interface UseVoiceRecorderReturn extends VoiceRecorderState, VoiceRecorderControls {
  analyserNode: AnalyserNode | null;
  pendingMarkStart: number | null;
  pendingMarkNote: string;
  completedMarks: DurationMark[];
  isMarking: boolean;
}

export function useVoiceRecorder(): UseVoiceRecorderReturn {
  const [state, setState] = useState<VoiceRecorderState>({
    isRecording: false,
    isPaused: false,
    duration: 0,
    audioBlob: null,
    audioUrl: null,
    error: null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const accumulatedTimeRef = useRef<number>(0);

  // Duration marking state
  const [pendingMarkStart, setPendingMarkStart] = useState<number | null>(null);
  const [pendingMarkNote, setPendingMarkNote] = useState<string>('');
  const [completedMarks, setCompletedMarks] = useState<DurationMark[]>([]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (state.audioUrl) {
        URL.revokeObjectURL(state.audioUrl);
      }
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      // Reset state
      setState(prev => ({
        ...prev,
        isRecording: false,
        isPaused: false,
        duration: 0,
        audioBlob: null,
        audioUrl: prev.audioUrl ? (URL.revokeObjectURL(prev.audioUrl), null) : null,
        error: null,
      }));

      audioChunksRef.current = [];

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      });

      streamRef.current = stream;

      // Setup audio context for visualization
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      // Create media recorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        setState(prev => ({ ...prev, error: 'Recording error occurred' }));
      };

      // Start recording
      mediaRecorder.start(100); // Collect data every 100ms

      // Start duration tracking with timestamps for accuracy
      startTimeRef.current = Date.now();
      accumulatedTimeRef.current = 0;

      // Update display every 100ms for smooth UI
      timerRef.current = setInterval(() => {
        const elapsed = accumulatedTimeRef.current + (Date.now() - startTimeRef.current);
        setState(prev => ({
          ...prev,
          duration: Math.floor(elapsed / 1000),
        }));
      }, 100);

      setState(prev => ({
        ...prev,
        isRecording: true,
        isPaused: false,
        error: null,
      }));
    } catch (err) {
      console.error('Failed to start recording:', err);
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to access microphone',
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

      // Clear timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      mediaRecorder.onstop = async () => {
        // Create blob from chunks
        const rawBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

        // Calculate final duration in milliseconds
        const durationMs = accumulatedTimeRef.current + (Date.now() - startTimeRef.current);

        // Fix WebM metadata for seekability (adds Duration)
        let blob: Blob;
        try {
          blob = await fixWebmMetadata(rawBlob, durationMs);
          console.log('[Recording] WebM metadata fixed for seekability');
        } catch (error) {
          console.warn('[Recording] Failed to fix WebM metadata, using raw blob:', error);
          blob = rawBlob; // Fallback to raw blob if fixing fails
        }

        const url = URL.createObjectURL(blob);

        setState(prev => ({
          ...prev,
          isRecording: false,
          isPaused: false,
          audioBlob: blob,
          audioUrl: url,
        }));

        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }

        // Close audio context
        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
          analyserRef.current = null;
        }

        resolve(blob);
      };

      mediaRecorder.stop();
    });
  }, []);

  const pauseRecording = useCallback(() => {
    const mediaRecorder = mediaRecorderRef.current;

    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.pause();

      // Accumulate elapsed time before pausing
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

      // Reset start time for new segment
      startTimeRef.current = Date.now();

      timerRef.current = setInterval(() => {
        const elapsed = accumulatedTimeRef.current + (Date.now() - startTimeRef.current);
        setState(prev => ({
          ...prev,
          duration: Math.floor(elapsed / 1000),
        }));
      }, 100);

      setState(prev => ({ ...prev, isPaused: false }));
    }
  }, []);

  const resetRecording = useCallback(() => {
    // Stop if recording
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    // Clear timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Stop all tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
      analyserRef.current = null;
    }

    // Revoke URL
    if (state.audioUrl) {
      URL.revokeObjectURL(state.audioUrl);
    }

    setState({
      isRecording: false,
      isPaused: false,
      duration: 0,
      audioBlob: null,
      audioUrl: null,
      error: null,
    });

    audioChunksRef.current = [];
    mediaRecorderRef.current = null;
    startTimeRef.current = 0;
    accumulatedTimeRef.current = 0;

    // Reset marking state
    setPendingMarkStart(null);
    setPendingMarkNote('');
    setCompletedMarks([]);
  }, [state.audioUrl]);

  // Get current elapsed time in seconds
  const getCurrentElapsedTime = useCallback(() => {
    if (!state.isRecording) return 0;
    if (state.isPaused) {
      return Math.floor(accumulatedTimeRef.current / 1000);
    }
    const elapsed = accumulatedTimeRef.current + (Date.now() - startTimeRef.current);
    return Math.floor(elapsed / 1000);
  }, [state.isRecording, state.isPaused]);

  // Toggle duration marking (Enter key handler)
  const handleMarkToggle = useCallback(() => {
    if (!state.isRecording) return;

    const currentTime = getCurrentElapsedTime();

    if (pendingMarkStart === null) {
      // First press: start marking
      setPendingMarkStart(currentTime);
      setPendingMarkNote('');
    } else {
      // Second press: complete marking (only if end > start)
      if (currentTime > pendingMarkStart) {
        setCompletedMarks(prev => [...prev, {
          start: pendingMarkStart,
          end: currentTime,
          note: pendingMarkNote.trim() || undefined
        }]);
      }
      setPendingMarkStart(null);
      setPendingMarkNote('');
    }
  }, [state.isRecording, pendingMarkStart, pendingMarkNote, getCurrentElapsedTime]);

  // Set note for the current pending mark
  const setMarkNote = useCallback((note: string) => {
    setPendingMarkNote(note);
  }, []);

  // Add an image to the last completed mark
  const addImageToLastMark = useCallback((image: DurationMarkImage): boolean => {
    if (completedMarks.length === 0) return false;

    setCompletedMarks(prev => {
      const updated = [...prev];
      const lastIndex = updated.length - 1;
      const lastMark = updated[lastIndex];
      updated[lastIndex] = {
        ...lastMark,
        images: [...(lastMark.images || []), image]
      };
      return updated;
    });
    return true;
  }, [completedMarks.length]);

  return {
    ...state,
    analyserNode: analyserRef.current,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    resetRecording,
    handleMarkToggle,
    setMarkNote,
    addImageToLastMark,
    pendingMarkStart,
    pendingMarkNote,
    completedMarks,
    isMarking: pendingMarkStart !== null,
  };
}
