import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';
import type { DurationAudio, AudioMarker, AudioMarkerType } from '../types';
import type { ThemedAudioPlayerHandle } from '../components/audio/ThemedAudioPlayer';

interface DurationAudioPlayerContextValue {
  currentAudio: DurationAudio | null;
  markLabel: string;
  markers: AudioMarker[];
  markerSeekIndex: Record<AudioMarkerType, number>;
  canEditCaption: boolean;
  playerRef: React.MutableRefObject<ThemedAudioPlayerHandle | null>;
  play: (
    audio: DurationAudio,
    markLabel: string,
    markers: AudioMarker[],
    onUpdateCaption?: (audioId: number, caption: string | null) => Promise<DurationAudio | void>
  ) => void;
  syncCurrentAudio: (audio: DurationAudio) => void;
  updateCurrentAudioCaption: (caption: string | null) => Promise<void>;
  updateMarkerCaption: (markerId: number, caption: string | null) => Promise<void>;
  seekToNextMarker: (type: AudioMarkerType) => void;
  dismiss: () => void;
}

const DurationAudioPlayerContext = createContext<DurationAudioPlayerContextValue | null>(null);

export function useDurationAudioPlayer(): DurationAudioPlayerContextValue {
  const ctx = useContext(DurationAudioPlayerContext);
  if (!ctx) {
    throw new Error('useDurationAudioPlayer must be used within DurationAudioPlayerProvider');
  }
  return ctx;
}

export function DurationAudioPlayerProvider({ children }: { children: ReactNode }) {
  const [currentAudio, setCurrentAudio] = useState<DurationAudio | null>(null);
  const [markLabel, setMarkLabel] = useState('');
  const [markers, setMarkers] = useState<AudioMarker[]>([]);
  const [markerSeekIndex, setMarkerSeekIndex] = useState<Record<AudioMarkerType, number>>({
    important: 0,
    question: 0,
    similar_question: 0,
  });
  const [onUpdateCaption, setOnUpdateCaption] = useState<((audioId: number, caption: string | null) => Promise<DurationAudio | void>) | null>(null);
  const playerRef = useRef<ThemedAudioPlayerHandle | null>(null);

  const play = useCallback((
    audio: DurationAudio,
    label: string,
    audioMarkers: AudioMarker[],
    updateCaptionHandler?: (audioId: number, caption: string | null) => Promise<DurationAudio | void>
  ) => {
    setCurrentAudio(audio);
    setMarkLabel(label);
    setMarkers(audioMarkers);
    setMarkerSeekIndex({ important: 0, question: 0, similar_question: 0 });
    setOnUpdateCaption(() => updateCaptionHandler ?? null);
  }, []);

  const syncCurrentAudio = useCallback((audio: DurationAudio) => {
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
    setMarkLabel('');
    setMarkers([]);
    setMarkerSeekIndex({ important: 0, question: 0, similar_question: 0 });
    setOnUpdateCaption(null);
  }, []);

  return (
    <DurationAudioPlayerContext.Provider
      value={{
        currentAudio,
        markLabel,
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
    </DurationAudioPlayerContext.Provider>
  );
}
