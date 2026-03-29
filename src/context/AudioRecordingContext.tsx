import { createContext, useContext, useCallback, useState, useEffect, type ReactNode } from 'react';
import { useSimpleAudioRecorder } from '../hooks/useSimpleAudioRecorder';
import type { AudioMarkerType } from '../types';

export type RecordingTarget =
  | { type: 'duration'; durationId: number; recordingId: number; label: string }
  | { type: 'recording'; recordingId: number; label: string }
  | { type: 'duration_image'; durationImageId: number; durationId: number; recordingId: number; label: string }
  | { type: 'recording_image'; imageId: number; recordingId: number; label: string }
  | { type: 'capture_image'; captureImageId: number; label: string }
  | { type: 'capture'; label: string }
  | { type: 'image_child'; imageChildId: number; label: string };

export interface PendingMarker {
  marker_type: AudioMarkerType;
  start_time: number;
  end_time: number | null;
}

export interface PendingMarker {
  marker_type: AudioMarkerType;
  start_time: number;
  end_time: number | null;
}

interface AudioRecordingContextValue {
  // State
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  error: string | null;
  analyserNode: AnalyserNode | null;
  target: RecordingTarget | null;
  isSaving: boolean;
  activeToggles: Set<AudioMarkerType>;
  pendingCaptureAudio: { blob: Blob; durationSec: number; markers: PendingMarker[] } | null;
  // Actions
  startRecording: (target: RecordingTarget) => Promise<void>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopAndSave: () => Promise<void>;
  cancelRecording: () => void;
  addMarkerToggle: (type: AudioMarkerType) => void;
  clearPendingCaptureAudio: () => void;
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
  const [activeToggles, setActiveToggles] = useState<Set<AudioMarkerType>>(new Set());
  const [pendingMarkers, setPendingMarkers] = useState<PendingMarker[]>([]);
  const [pendingCaptureAudio, setPendingCaptureAudio] = useState<{ blob: Blob; durationSec: number; markers: PendingMarker[] } | null>(null);

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
    setActiveToggles(new Set());
    setPendingMarkers([]);
    await recorder.startRecording();
  }, [recorder]);

  const pauseRecording = useCallback(() => {
    recorder.pauseRecording();
  }, [recorder]);

  const resumeRecording = useCallback(() => {
    recorder.resumeRecording();
  }, [recorder]);

  const addMarkerToggle = useCallback((type: AudioMarkerType) => {
    const currentTime = recorder.duration;
    setActiveToggles(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        // Toggle OFF: close last open marker of this type
        setPendingMarkers(markers => {
          const updated = [...markers];
          for (let i = updated.length - 1; i >= 0; i--) {
            if (updated[i].marker_type === type && updated[i].end_time === null) {
              updated[i] = { ...updated[i], end_time: currentTime };
              break;
            }
          }
          return updated;
        });
        next.delete(type);
      } else {
        // Toggle ON: push new open marker
        setPendingMarkers(markers => [
          ...markers,
          { marker_type: type, start_time: currentTime, end_time: null },
        ]);
        next.add(type);
      }
      return next;
    });
  }, [recorder.duration]);

  const stopAndSave = useCallback(async () => {
    if (!target) return;
    setIsSaving(true);
    try {
      const blob = await recorder.stopRecording();
      if (!blob) return;

      if (target.type === 'capture') {
        const durationSec = recorder.duration;
        setPendingCaptureAudio({ blob, durationSec, markers: pendingMarkers });
        return;
      }

      const buffer = await blob.arrayBuffer();

      let savedAudio: { id: number } | null = null;

      if (target.type === 'duration') {
        savedAudio = await window.electronAPI.durationAudios.addFromBuffer(
          target.durationId,
          buffer,
          'webm'
        );
      } else if (target.type === 'duration_image') {
        savedAudio = await window.electronAPI.durationImageAudios.addFromBuffer(
          target.durationImageId,
          target.durationId,
          buffer,
          'webm'
        );
      } else if (target.type === 'recording_image') {
        savedAudio = await window.electronAPI.imageAudios.addFromBuffer(
          target.imageId,
          buffer,
          'webm'
        );
      } else if (target.type === 'capture_image') {
        savedAudio = await window.electronAPI.captureImageAudios.addFromBuffer(
          target.captureImageId,
          buffer,
          'webm'
        );
      } else if (target.type === 'image_child') {
        savedAudio = await window.electronAPI.imageChildAudios.addFromBuffer(
          target.imageChildId,
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

      // Save pending markers if we have a saved audio record
      if (savedAudio && pendingMarkers.length > 0) {
        const audioType = target.type === 'duration_image' ? 'duration_image'
          : target.type === 'recording_image' ? 'recording_image'
          : target.type === 'capture_image' ? 'capture_image'
          : target.type === 'recording' ? 'recording'
          : 'duration';
        const markersToSave = pendingMarkers
          .filter(m => m.start_time !== undefined)
          .map(m => ({
            audio_id: savedAudio!.id,
            audio_type: audioType as 'duration' | 'duration_image',
            marker_type: m.marker_type,
            start_time: m.start_time,
            end_time: m.end_time,
            caption: null,
          }));
        if (markersToSave.length > 0) {
          await window.electronAPI.audioMarkers.addBatch(markersToSave);
        }
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
      setActiveToggles(new Set());
      setPendingMarkers([]);
    }
  }, [target, recorder, pendingMarkers]);

  const cancelRecording = useCallback(() => {
    recorder.reset();
    setTarget(null);
    setActiveToggles(new Set());
    setPendingMarkers([]);
  }, [recorder]);

  const clearPendingCaptureAudio = useCallback(() => setPendingCaptureAudio(null), []);

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
        activeToggles,
        pendingCaptureAudio,
        clearPendingCaptureAudio,
        startRecording,
        pauseRecording,
        resumeRecording,
        stopAndSave,
        cancelRecording,
        addMarkerToggle,
      }}
    >
      {children}
    </AudioRecordingContext.Provider>
  );
}
