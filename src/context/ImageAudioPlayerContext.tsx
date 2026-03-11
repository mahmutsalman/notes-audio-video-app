import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { DurationImageAudio } from '../types';

interface ImageAudioPlayerContextValue {
  currentAudio: DurationImageAudio | null;
  imageLabel: string;
  play: (audio: DurationImageAudio, imageLabel: string) => void;
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

  const play = useCallback((audio: DurationImageAudio, label: string) => {
    setCurrentAudio(audio);
    setImageLabel(label);
  }, []);

  const dismiss = useCallback(() => {
    setCurrentAudio(null);
    setImageLabel('');
  }, []);

  return (
    <ImageAudioPlayerContext.Provider value={{ currentAudio, imageLabel, play, dismiss }}>
      {children}
    </ImageAudioPlayerContext.Provider>
  );
}
