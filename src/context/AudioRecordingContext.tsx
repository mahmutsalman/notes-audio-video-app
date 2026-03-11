import { createContext, useContext, useCallback, useState, useEffect, type ReactNode } from 'react';
import { useSimpleAudioRecorder } from '../hooks/useSimpleAudioRecorder';

export type RecordingTarget =
  | { type: 'duration'; durationId: number; recordingId: number; label: string }
  | { type: 'recording'; recordingId: number; label: string }
  | { type: 'duration_image'; durationImageId: number; durationId: number; recordingId: number; label: string };

interface AudioRecordingContextValue {
  // State
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  error: string | null;
  analyserNode: AnalyserNode | null;
  target: RecordingTarget | null;
  isSaving: boolean;
  // Actions
  startRecording: (target: RecordingTarget) => Promise<void>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopAndSave: () => Promise<void>;
  cancelRecording: () => void;
}

const AudioRecordingContext = createContext<AudioRecordingContextValue | null>(null);

export function useAudioRecording(): AudioRecordingContextValue {
  const ctx = useContext(AudioRecordingContext);
  if (!ctx) {
    throw new Error('useAudioRecording must be used within AudioRecordingProvider');
  }
  return ctx;
}

// Custom event name for notifying pages that audio was saved
export const AUDIO_SAVED_EVENT = 'recording-audio-saved';

export function AudioRecordingProvider({ children }: { children: ReactNode }) {
  const recorder = useSimpleAudioRecorder();
  const [target, setTarget] = useState<RecordingTarget | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Warn before closing while recording
  useEffect(() => {
    if (!recorder.isRecording) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [recorder.isRecording]);

  const startRecording = useCallback(async (newTarget: RecordingTarget) => {
    if (recorder.isRecording) return;
    setTarget(newTarget);
    await recorder.startRecording();
  }, [recorder]);

  const pauseRecording = useCallback(() => {
    recorder.pauseRecording();
  }, [recorder]);

  const resumeRecording = useCallback(() => {
    recorder.resumeRecording();
  }, [recorder]);

  const stopAndSave = useCallback(async () => {
    if (!target) return;
    setIsSaving(true);
    try {
      const blob = await recorder.stopRecording();
      if (!blob) return;

      const buffer = await blob.arrayBuffer();

      if (target.type === 'duration') {
        await window.electronAPI.durationAudios.addFromBuffer(
          target.durationId,
          buffer,
          'webm'
        );
      } else if (target.type === 'duration_image') {
        await window.electronAPI.durationImageAudios.addFromBuffer(
          target.durationImageId,
          target.durationId,
          buffer,
          'webm'
        );
      } else {
        await window.electronAPI.audios.addFromBuffer(
          target.recordingId,
          buffer,
          'webm'
        );
      }

      // Notify any mounted page to refresh its cache
      window.dispatchEvent(new CustomEvent(AUDIO_SAVED_EVENT, {
        detail: { target },
      }));
    } catch (err) {
      console.error('Failed to save recording:', err);
    } finally {
      setIsSaving(false);
      setTarget(null);
    }
  }, [target, recorder]);

  const cancelRecording = useCallback(() => {
    recorder.reset();
    setTarget(null);
  }, [recorder]);

  return (
    <AudioRecordingContext.Provider
      value={{
        isRecording: recorder.isRecording,
        isPaused: recorder.isPaused,
        duration: recorder.duration,
        error: recorder.error,
        analyserNode: recorder.analyserNode,
        target,
        isSaving,
        startRecording,
        pauseRecording,
        resumeRecording,
        stopAndSave,
        cancelRecording,
      }}
    >
      {children}
    </AudioRecordingContext.Provider>
  );
}
