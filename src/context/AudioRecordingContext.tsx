import { createContext, useContext, useCallback, useState, useEffect, useRef, type ReactNode } from 'react';
import { useSimpleAudioRecorder } from '../hooks/useSimpleAudioRecorder';
import { voiceCommandService } from '../services/voiceCommandService';
import { audioFeedbackService } from '../services/audioFeedbackService';
import { silenceDetectionService } from '../services/silenceDetectionService';
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
  voiceCommandsEnabled: boolean;
  lastVoiceCommand: { type: AudioMarkerType; on: boolean; ts: number } | null;
  autoSilencePauseEnabled: boolean;
  isPausedBySilence: boolean;
  lastSilenceEvent: 'paused' | 'resumed' | null;
  // Actions
  startRecording: (target: RecordingTarget) => Promise<void>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopAndSave: () => Promise<void>;
  cancelRecording: () => void;
  addMarkerToggle: (type: AudioMarkerType) => void;
  clearPendingCaptureAudio: () => void;
  toggleVoiceCommands: () => void;
  toggleAutoSilencePause: () => void;
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
  const [voiceCommandsEnabled, setVoiceCommandsEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem('voiceCommandsEnabled') === 'true'; } catch { return false; }
  });
  const [lastVoiceCommand, setLastVoiceCommand] = useState<{ type: AudioMarkerType; on: boolean; ts: number } | null>(null);
  const [autoSilencePauseEnabled, setAutoSilencePauseEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem('autoSilencePauseEnabled') === 'true'; } catch { return false; }
  });
  const [isPausedBySilence, setIsPausedBySilence] = useState(false);
  const [lastSilenceEvent, setLastSilenceEvent] = useState<'paused' | 'resumed' | null>(null);
  const isPausedBySilenceRef = useRef(false);
  const addMarkerToggleRef = useRef<((type: AudioMarkerType, trimSec?: number) => void) | null>(null);
  const recorderRef = useRef(recorder);
  const stopAndSaveRef = useRef<() => Promise<void>>(() => Promise.resolve());

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

  // Keep recorder ref current so voice callbacks always see latest methods/duration
  useEffect(() => { recorderRef.current = recorder; }, [recorder]);

  // Wire voice command service once recording is active and audio nodes are ready
  useEffect(() => {
    if (!recorder.isRecording || !voiceCommandsEnabled) return;
    const ctx = recorder.audioContext;
    const src = recorder.mediaSourceNode;
    if (!ctx || !src) return;

    // Marker commands: trim ~1.5s from end_time on OFF to exclude the command phrase
    const VOICE_OFF_TRIM_SEC = 1.5;
    voiceCommandService.onCommand((type, on) => {
      addMarkerToggleRef.current?.(type, on ? undefined : VOICE_OFF_TRIM_SEC);
      audioFeedbackService.playFeedback(type, on);
      setLastVoiceCommand({ type, on, ts: Date.now() });
    });

    voiceCommandService.onSystemCommand((command) => {
      if (command === 'pause') {
        recorderRef.current.pauseRecording();
        audioFeedbackService.playPauseFeedback();
      } else if (command === 'resume') {
        recorderRef.current.resumeRecording();
        audioFeedbackService.playResumeFeedback();
      } else if (command === 'stop') {
        audioFeedbackService.playStopFeedback();
        stopAndSaveRef.current();
      }
    });

    voiceCommandService.start(ctx, src).catch(err =>
      console.error('[VoiceCommand] Failed to start:', err)
    );
    return () => { voiceCommandService.stop(); };
  }, [recorder.isRecording, voiceCommandsEnabled, recorder.audioContext, recorder.mediaSourceNode]);

  // Wire silence detection service
  useEffect(() => {
    const ctx = recorder.audioContext;
    const src = recorder.mediaSourceNode;

    if (autoSilencePauseEnabled && recorder.isRecording && ctx && src) {
      silenceDetectionService.onAutoPause = () => {
        if (!recorderRef.current.isPaused) {
          isPausedBySilenceRef.current = true;
          setIsPausedBySilence(true);
          recorderRef.current.pauseRecording();
          setLastSilenceEvent('paused');
        }
      };
      silenceDetectionService.onAutoResume = () => {
        if (isPausedBySilenceRef.current) {
          isPausedBySilenceRef.current = false;
          setIsPausedBySilence(false);
          recorderRef.current.resumeRecording();
          setLastSilenceEvent('resumed');
        }
      };
      silenceDetectionService.start(ctx, src);
      silenceDetectionService.setEnabled(true);
      return () => { silenceDetectionService.stop(); };
    } else {
      silenceDetectionService.stop();
      // If disabled while auto-paused, resume
      if (isPausedBySilenceRef.current && recorderRef.current.isPaused) {
        isPausedBySilenceRef.current = false;
        setIsPausedBySilence(false);
        recorderRef.current.resumeRecording();
      }
    }
  }, [autoSilencePauseEnabled, recorder.isRecording, recorder.audioContext, recorder.mediaSourceNode]);

  const pauseRecording = useCallback(() => {
    // Manual pause clears the auto-pause flag so auto-resume won't fire
    isPausedBySilenceRef.current = false;
    setIsPausedBySilence(false);
    recorder.pauseRecording();
  }, [recorder]);

  const resumeRecording = useCallback(() => {
    recorder.resumeRecording();
  }, [recorder]);

  const addMarkerToggle = useCallback((type: AudioMarkerType, trimSec?: number) => {
    const currentTime = Math.max(0, recorder.duration - (trimSec ?? 0));
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

  useEffect(() => { addMarkerToggleRef.current = addMarkerToggle; }, [addMarkerToggle]);

  const toggleVoiceCommands = useCallback(() => {
    setVoiceCommandsEnabled(prev => {
      const next = !prev;
      try { localStorage.setItem('voiceCommandsEnabled', String(next)); } catch { /* ignore */ }
      if (!next) voiceCommandService.stop();
      return next;
    });
  }, []);

  const toggleAutoSilencePause = useCallback(() => {
    setAutoSilencePauseEnabled(prev => {
      const next = !prev;
      try { localStorage.setItem('autoSilencePauseEnabled', String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

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
      } else if (target.type === 'recording') {
        savedAudio = await window.electronAPI.audios.addFromBuffer(
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
            audio_type: audioType as 'duration' | 'duration_image' | 'recording' | 'recording_image',
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
      isPausedBySilenceRef.current = false;
      setIsPausedBySilence(false);
    }
  }, [target, recorder, pendingMarkers]);
  useEffect(() => { stopAndSaveRef.current = stopAndSave; }, [stopAndSave]);

  const cancelRecording = useCallback(() => {
    recorder.reset();
    setTarget(null);
    setActiveToggles(new Set());
    setPendingMarkers([]);
    isPausedBySilenceRef.current = false;
    setIsPausedBySilence(false);
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
        voiceCommandsEnabled,
        lastVoiceCommand,
        autoSilencePauseEnabled,
        isPausedBySilence,
        lastSilenceEvent,
        clearPendingCaptureAudio,
        startRecording,
        pauseRecording,
        resumeRecording,
        stopAndSave,
        cancelRecording,
        addMarkerToggle,
        toggleVoiceCommands,
        toggleAutoSilencePause,
      }}
    >
      {children}
    </AudioRecordingContext.Provider>
  );
}
