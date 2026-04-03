import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';
import type { AnyImageAudio, AudioMarker, AudioMarkerType, MediaTagType } from '../types';
import type { ThemedAudioPlayerHandle } from '../components/audio/ThemedAudioPlayer';

interface ImageAudioPlayerContextValue {
  currentAudio: DurationImageAudio | null;
  imageLabel: string;
  mediaType: MediaTagType | null;
  markers: AudioMarker[];
  markerSeekIndex: Record<AudioMarkerType, number>;
  canEditCaption: boolean;
  playerRef: React.MutableRefObject<ThemedAudioPlayerHandle | null>;
  play: (
    audio: DurationImageAudio,
    imageLabel: string,
    markers?: AudioMarker[],
    onUpdateCaption?: (audioId: number, caption: string | null) => Promise<AnyImageAudio | void>,
    mediaType?: MediaTagType
  ) => void;
  syncCurrentAudio: (audio: DurationImageAudio) => void;
  updateCurrentAudioCaption: (caption: string | null) => Promise<void>;
  updateMarkerCaption: (markerId: number, caption: string | null) => Promise<void>;
  seekToNextMarker: (type: AudioMarkerType) => void;
  dismiss: () => void;
}

const ImageAudioPlayerContext = createContext<ImageAudioPlayerContextValue | null>(null);

export function useImageAudioPlayer(): ImageAudioPlayerContextValue {
  const ctx = useContext(ImageAudioPlayerContext);
  if (!ctx) {
    throw new Error('useImageAudioPlayer must be used within ImageAudioPlayerProvider');
  }
  return ctx;
}

export function ImageAudioPlayerProvider({ children }: { children: ReactNode }) {
  const [currentAudio, setCurrentAudio] = useState<DurationImageAudio | null>(null);
  const [imageLabel, setImageLabel] = useState('');
  const [mediaType, setMediaType] = useState<MediaTagType | null>(null);
  const [markers, setMarkers] = useState<AudioMarker[]>([]);
  const [markerSeekIndex, setMarkerSeekIndex] = useState<Record<AudioMarkerType, number>>({
    important: 0,
    question: 0,
    similar_question: 0,
  });
  const [onUpdateCaption, setOnUpdateCaption] = useState<((audioId: number, caption: string | null) => Promise<DurationImageAudio | void>) | null>(null);
  const playerRef = useRef<ThemedAudioPlayerHandle | null>(null);

  const play = useCallback((
    audio: DurationImageAudio,
    label: string,
    audioMarkers?: AudioMarker[],
    updateCaptionHandler?: (audioId: number, caption: string | null) => Promise<AnyImageAudio | void>,
    audioMediaType?: MediaTagType
  ) => {
    setCurrentAudio(audio);
    setImageLabel(label);
    setMediaType(audioMediaType ?? null);
    setMarkers(audioMarkers ?? []);
    setMarkerSeekIndex({ important: 0, question: 0, similar_question: 0 });
    setOnUpdateCaption(() => updateCaptionHandler ?? null);
  }, []);

  const syncCurrentAudio = useCallback((audio: DurationImageAudio) => {
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
    setImageLabel('');
    setMediaType(null);
    setMarkers([]);
    setMarkerSeekIndex({ important: 0, question: 0, similar_question: 0 });
    setOnUpdateCaption(null);
  }, []);

  return (
    <ImageAudioPlayerContext.Provider
      value={{
        currentAudio,
        imageLabel,
        mediaType,
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
    </ImageAudioPlayerContext.Provider>
  );
}
