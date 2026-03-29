import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';
import type { QuickCaptureAudio, AudioMarker, AudioMarkerType } from '../types';
import type { ThemedAudioPlayerHandle } from '../components/audio/ThemedAudioPlayer';

interface CaptureAudioPlayerContextValue {
  currentAudio: QuickCaptureAudio | null;
  label: string;
  markers: AudioMarker[];
  markerSeekIndex: Record<AudioMarkerType, number>;
  canEditCaption: boolean;
  playerRef: React.MutableRefObject<ThemedAudioPlayerHandle | null>;
  play: (
    audio: QuickCaptureAudio,
    label: string,
    markers: AudioMarker[],
    onUpdateCaption?: (audioId: number, caption: string | null) => Promise<QuickCaptureAudio | void>
  ) => void;
  syncCurrentAudio: (audio: QuickCaptureAudio) => void;
  updateCurrentAudioCaption: (caption: string | null) => Promise<void>;
  updateMarkerCaption: (markerId: number, caption: string | null) => Promise<void>;
  seekToNextMarker: (type: AudioMarkerType) => void;
  dismiss: () => void;
}

const CaptureAudioPlayerContext = createContext<CaptureAudioPlayerContextValue | null>(null);

export function useCaptureAudioPlayer(): CaptureAudioPlayerContextValue {
  const ctx = useContext(CaptureAudioPlayerContext);
  if (!ctx) {
    throw new Error('useCaptureAudioPlayer must be used within CaptureAudioPlayerProvider');
  }
  return ctx;
}

export function CaptureAudioPlayerProvider({ children }: { children: ReactNode }) {
  const [currentAudio, setCurrentAudio] = useState<QuickCaptureAudio | null>(null);
  const [label, setLabel] = useState('');
  const [markers, setMarkers] = useState<AudioMarker[]>([]);
  const [markerSeekIndex, setMarkerSeekIndex] = useState<Record<AudioMarkerType, number>>({
    important: 0,
    question: 0,
    similar_question: 0,
  });
  const [onUpdateCaption, setOnUpdateCaption] = useState<((audioId: number, caption: string | null) => Promise<QuickCaptureAudio | void>) | null>(null);
  const playerRef = useRef<ThemedAudioPlayerHandle | null>(null);

  const play = useCallback((
    audio: QuickCaptureAudio,
    audioLabel: string,
    audioMarkers: AudioMarker[],
    updateCaptionHandler?: (audioId: number, caption: string | null) => Promise<QuickCaptureAudio | void>
  ) => {
    setCurrentAudio(audio);
    setLabel(audioLabel);
    setMarkers(audioMarkers);
    setMarkerSeekIndex({ important: 0, question: 0, similar_question: 0 });
    setOnUpdateCaption(() => updateCaptionHandler ?? null);
  }, []);

  const syncCurrentAudio = useCallback((audio: QuickCaptureAudio) => {
    setCurrentAudio(prev => prev?.id === audio.id ? audio : prev);
  }, []);

  const updateCurrentAudioCaption = useCallback(async (caption: string | null) => {
    if (!currentAudio || !onUpdateCaption) return;
    const updated = await onUpdateCaption(currentAudio.id, caption);
    setCurrentAudio(prev => {
      if (!prev || prev.id !== currentAudio.id) return prev;
      return updated ?? { ...prev, caption };
    });
  }, [currentAudio, onUpdateCaption]);

  const updateMarkerCaption = useCallback(async (markerId: number, caption: string | null) => {
    const updated = await window.electronAPI.audioMarkers.updateCaption(markerId, caption);
    setMarkers(prev => prev.map(m => m.id === markerId ? updated : m));
  }, []);

  const seekToNextMarker = useCallback((type: AudioMarkerType) => {
    const ofType = markers.filter(m => m.marker_type === type);
    if (ofType.length === 0) return;
    const currentIdx = markerSeekIndex[type];
    const target = ofType[currentIdx % ofType.length];
    playerRef.current?.seekTo(target.start_time);
    setMarkerSeekIndex(prev => ({ ...prev, [type]: (currentIdx + 1) % ofType.length }));
  }, [markers, markerSeekIndex]);

  const dismiss = useCallback(() => {
    setCurrentAudio(null);
    setLabel('');
    setMarkers([]);
    setMarkerSeekIndex({ important: 0, question: 0, similar_question: 0 });
    setOnUpdateCaption(null);
  }, []);

  return (
    <CaptureAudioPlayerContext.Provider
      value={{
        currentAudio,
        label,
        markers,
        markerSeekIndex,
        canEditCaption: onUpdateCaption !== null,
        playerRef,
        play,
        syncCurrentAudio,
        updateCurrentAudioCaption,
        updateMarkerCaption,
        seekToNextMarker,
        dismiss,
      }}
    >
      {children}
    </CaptureAudioPlayerContext.Provider>
  );
}
