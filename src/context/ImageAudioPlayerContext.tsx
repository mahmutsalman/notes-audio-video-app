import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { DurationImageAudio } from '../types';

interface ImageAudioPlayerContextValue {
  currentAudio: DurationImageAudio | null;
  imageLabel: string;
  canEditCaption: boolean;
  play: (
    audio: DurationImageAudio,
    imageLabel: string,
    onUpdateCaption?: (audioId: number, caption: string | null) => Promise<DurationImageAudio | void>
  ) => void;
  syncCurrentAudio: (audio: DurationImageAudio) => void;
  updateCurrentAudioCaption: (caption: string | null) => Promise<void>;
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
  const [onUpdateCaption, setOnUpdateCaption] = useState<((audioId: number, caption: string | null) => Promise<DurationImageAudio | void>) | null>(null);

  const play = useCallback((
    audio: DurationImageAudio,
    label: string,
    updateCaptionHandler?: (audioId: number, caption: string | null) => Promise<DurationImageAudio | void>
  ) => {
    setCurrentAudio(audio);
    setImageLabel(label);
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

  const dismiss = useCallback(() => {
    setCurrentAudio(null);
    setImageLabel('');
    setOnUpdateCaption(null);
  }, []);

  return (
    <ImageAudioPlayerContext.Provider
      value={{
        currentAudio,
        imageLabel,
        canEditCaption: onUpdateCaption !== null,
        play,
        syncCurrentAudio,
        updateCurrentAudioCaption,
        dismiss,
      }}
    >
      {children}
    </ImageAudioPlayerContext.Provider>
  );
}
