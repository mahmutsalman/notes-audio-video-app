import React from 'react';
import ReactDOM from 'react-dom/client';
import { MemoryRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AudioRecordingProvider } from './context/AudioRecordingContext';
import { ImageAudioPlayerProvider } from './context/ImageAudioPlayerContext';
import { CaptureAudioPlayerProvider } from './context/CaptureAudioPlayerContext';
import { StudyTrackerProvider } from './context/StudyTrackerContext';
import AudioRecordingBar from './components/audio/AudioRecordingBar';
import ImageAudioPlayerBar from './components/audio/ImageAudioPlayerBar';
import CaptureAudioPlayerBar from './components/audio/CaptureAudioPlayerBar';
import EchoPage from './pages/EchoPage';
import EchoImageDetailPage from './pages/EchoImageDetailPage';
import CapturePage from './pages/CapturePage';
import './index.css';

/**
 * Echo — renderer entry for the lightweight companion app.
 *
 * Carries the two flows used most often: /echo (spaced-repetition review) and /capture
 * (Quick Capture scratch pad). Everything else — recording, search, topics, PDF/HTML viewing,
 * the canvas — stays in the main app.
 *
 * Deliberately NOT App.tsx. That mounts MainLayout, which consumes TabsContext and all four
 * audio-player contexts, dragging the tab shell and every page back in — the bundle this app
 * exists to avoid. The pages below draw their own UI, so they look identical to the main app.
 *
 * Providers are exactly what these two trees consume, no more:
 *   ThemeProvider             dark/light, shared with the main app via app_settings
 *   AudioRecordingProvider    MaskEditor.tsx:80 (echo) + CaptureInput (capture)
 *   ImageAudioPlayerProvider  ImageLightbox — audio attached to an image
 *   CaptureAudioPlayerProvider CapturePage — audio attached to a capture
 *   StudyTrackerProvider      ImageLightbox.tsx:215 trackImageOpen()
 *
 * Excalidraw, Monaco, pdf.js, Tesseract and FFmpeg are reachable from NONE of this. Monaco
 * still arrives lazily if the review code pad is opened, exactly as in the main app.
 */

const TABS = [
  { path: '/echo', label: 'Echo' },
  { path: '/capture', label: 'Capture' },
] as const;

/** Segmented switcher living in the window's drag strip. Inside the Router so it can navigate. */
function TitleBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <div
      className="h-[38px] shrink-0 flex items-center justify-center gap-1 bg-white dark:bg-dark-bg border-b border-gray-200 dark:border-gray-800"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Buttons must opt out of the drag region or clicks become window drags. */}
      <div className="flex gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {TABS.map(tab => {
          const active = pathname.startsWith(tab.path);
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={`px-4 py-1 text-sm rounded-md transition-colors ${
                active
                  ? 'bg-violet-600 text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AudioRecordingProvider>
        <ImageAudioPlayerProvider>
          <CaptureAudioPlayerProvider>
            <StudyTrackerProvider>
              <MemoryRouter initialEntries={['/echo']}>
                <div className="flex flex-col h-screen">
                  <TitleBar />
                  <div className="flex-1 min-h-0 overflow-auto">
                    <Routes>
                      <Route path="/echo" element={<EchoPage />} />
                      <Route path="/echo/:reviewItemId" element={<EchoImageDetailPage />} />
                      <Route path="/capture" element={<CapturePage />} />
                    </Routes>
                  </div>
                </div>
              </MemoryRouter>
              {/* Fixed-position bars — same components the main app uses, so recording and
                  playback behave identically here. One instance each, outside the routes. */}
              <ImageAudioPlayerBar />
              <CaptureAudioPlayerBar />
              <AudioRecordingBar />
            </StudyTrackerProvider>
          </CaptureAudioPlayerProvider>
        </ImageAudioPlayerProvider>
      </AudioRecordingProvider>
    </ThemeProvider>
  </React.StrictMode>
);
