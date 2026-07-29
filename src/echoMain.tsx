import React from 'react';
import ReactDOM from 'react-dom/client';
import { MemoryRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { TabsProvider } from './context/TabsContext';
import { AudioRecordingProvider } from './context/AudioRecordingContext';
import { ImageAudioPlayerProvider } from './context/ImageAudioPlayerContext';
import { CaptureAudioPlayerProvider } from './context/CaptureAudioPlayerContext';
import { DurationAudioPlayerProvider } from './context/DurationAudioPlayerContext';
import { RecordingAudioPlayerProvider } from './context/RecordingAudioPlayerContext';
import { StudyTrackerProvider } from './context/StudyTrackerContext';
import AudioRecordingBar from './components/audio/AudioRecordingBar';
import ImageAudioPlayerBar from './components/audio/ImageAudioPlayerBar';
import CaptureAudioPlayerBar from './components/audio/CaptureAudioPlayerBar';
import DurationAudioPlayerBar from './components/audio/DurationAudioPlayerBar';
import RecordingAudioPlayerBar from './components/audio/RecordingAudioPlayerBar';
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
 *   TabsProvider              NOT for tabs — Echo has none. StudyTrackerContext.tsx:68 calls
 *                             useTabs(), which THROWS outside a provider and blanked the whole
 *                             window. TabsContext is 204 lines of pure React state with no
 *                             imports beyond React, so this costs nothing. Do not "clean it up".
 *   AudioRecordingProvider    MaskEditor.tsx:80 (echo) + CaptureInput (capture)
 *   ImageAudioPlayerProvider  ImageLightbox — audio attached to an image
 *   CaptureAudioPlayerProvider CapturePage — audio attached to a capture
 *   Duration/RecordingAudioPlayerProvider
 *                             TagResultsView, reachable from Capture's tag search
 *   StudyTrackerProvider      ImageLightbox.tsx:215 trackImageOpen()
 *
 * Before adding a page here, walk the WHOLE import graph for context hooks that throw — one
 * level of grep is not enough. `useTabs` came in two hops away via StudyTrackerContext and
 * blanked the window; the two player providers above came in via TagResultsView and would
 * have crashed only once a tag was clicked.
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
      <TabsProvider>
        <AudioRecordingProvider>
          <ImageAudioPlayerProvider>
            <CaptureAudioPlayerProvider>
              <DurationAudioPlayerProvider>
                <RecordingAudioPlayerProvider>
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
                    {/* Fixed-position bars — same components the main app uses, so recording
                        and playback behave identically here. One instance each, outside the
                        routes, exactly as main.tsx does it. */}
                    <ImageAudioPlayerBar />
                    <CaptureAudioPlayerBar />
                    <DurationAudioPlayerBar />
                    <RecordingAudioPlayerBar />
                    <AudioRecordingBar />
                  </StudyTrackerProvider>
                </RecordingAudioPlayerProvider>
              </DurationAudioPlayerProvider>
            </CaptureAudioPlayerProvider>
          </ImageAudioPlayerProvider>
        </AudioRecordingProvider>
      </TabsProvider>
    </ThemeProvider>
  </React.StrictMode>
);
