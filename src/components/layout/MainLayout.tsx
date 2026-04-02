import { ReactNode, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Header from './Header';
import { useAudioRecording } from '../../context/AudioRecordingContext';
import { useImageAudioPlayer } from '../../context/ImageAudioPlayerContext';
import { useDurationAudioPlayer } from '../../context/DurationAudioPlayerContext';
import { useRecordingAudioPlayer } from '../../context/RecordingAudioPlayerContext';
import { useCaptureAudioPlayer } from '../../context/CaptureAudioPlayerContext';
import { useTabInstance, useTabs, useIsActiveTab, pathToTitle } from '../../context/TabsContext';

interface MainLayoutProps {
  children: ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { tabId } = useTabInstance();
  const { updateTabPath, updateTabTitle } = useTabs();
  const isActiveTab = useIsActiveTab();
  const { isRecording, isSaving } = useAudioRecording();

  // Keep tab path and default title in sync with navigation
  useEffect(() => {
    updateTabPath(tabId, location.pathname);
    updateTabTitle(tabId, pathToTitle(location.pathname));
  }, [location.pathname, tabId, updateTabPath, updateTabTitle]);

  // Global Cmd+K / Ctrl+K → open search page (only in the active tab)
  useEffect(() => {
    if (!isActiveTab) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        navigate('/search');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, isActiveTab]);
  const { currentAudio: imageAudio } = useImageAudioPlayer();
  const { currentAudio: durationAudio } = useDurationAudioPlayer();
  const { currentAudio: recordingAudio } = useRecordingAudioPlayer();
  const { currentAudio: captureAudio } = useCaptureAudioPlayer();
  const recordingBarVisible = isRecording || isSaving;
  const playerBarVisible = imageAudio !== null || durationAudio !== null || recordingAudio !== null || captureAudio !== null;
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
    </div>
  );
}
