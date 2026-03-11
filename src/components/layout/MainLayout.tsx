import { ReactNode, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Header from './Header';
import AudioRecordingBar from '../audio/AudioRecordingBar';
import ImageAudioPlayerBar from '../audio/ImageAudioPlayerBar';
import { useAudioRecording } from '../../context/AudioRecordingContext';
import { useImageAudioPlayer } from '../../context/ImageAudioPlayerContext';

interface MainLayoutProps {
  children: ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { tabId } = useTabInstance();
  const { updateTabPath, updateTabTitle } = useTabs();
  const { isRecording, isSaving } = useAudioRecording();
  const { currentAudio } = useImageAudioPlayer();
  const recordingBarVisible = isRecording || isSaving;
  const playerBarVisible = currentAudio !== null;
  const bottomPadding = recordingBarVisible && playerBarVisible
    ? 'pb-28'
    : recordingBarVisible || playerBarVisible
    ? 'pb-14'
    : '';

  return (
    <div className="h-full bg-gray-50 dark:bg-dark-bg flex flex-col">
      <Header />
      <main className={`flex-1 overflow-auto ${bottomPadding}`}>
        {children}
      </main>
      <ImageAudioPlayerBar />
      <AudioRecordingBar />
    </div>
  );
}
