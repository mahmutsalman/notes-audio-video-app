import { ReactNode } from 'react';
import Header from './Header';
import AudioRecordingBar from '../audio/AudioRecordingBar';
import ImageAudioPlayerBar from '../audio/ImageAudioPlayerBar';
import DurationAudioPlayerBar from '../audio/DurationAudioPlayerBar';
import { useAudioRecording } from '../../context/AudioRecordingContext';
import { useImageAudioPlayer } from '../../context/ImageAudioPlayerContext';
import { useDurationAudioPlayer } from '../../context/DurationAudioPlayerContext';

interface MainLayoutProps {
  children: ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const { isRecording, isSaving } = useAudioRecording();
  const { currentAudio: imageAudio } = useImageAudioPlayer();
  const { currentAudio: durationAudio } = useDurationAudioPlayer();
  const recordingBarVisible = isRecording || isSaving;
  const playerBarVisible = imageAudio !== null || durationAudio !== null;
  const bottomPadding = recordingBarVisible && playerBarVisible
    ? 'pb-28'
    : recordingBarVisible || playerBarVisible
    ? 'pb-14'
    : '';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg flex flex-col">
      <Header />
      <main className={`flex-1 overflow-auto ${bottomPadding}`}>
        {children}
      </main>
      <ImageAudioPlayerBar />
      <DurationAudioPlayerBar />
      <AudioRecordingBar />
    </div>
  );
}
