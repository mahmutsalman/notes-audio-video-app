import React from 'react';
import ReactDOM from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AudioRecordingProvider } from './context/AudioRecordingContext';
import AudioRecordingBar from './components/audio/AudioRecordingBar';
import EchoPage from './pages/EchoPage';
import EchoImageDetailPage from './pages/EchoImageDetailPage';
import './index.css';

/**
 * Echo — renderer entry for the review-only companion app.
 *
 * Deliberately NOT App.tsx. That mounts MainLayout, which consumes TabsContext and all four
 * audio-player contexts, which in turn drags in the tab shell and every page — the 12 MB
 * bundle this app exists to avoid. EchoPage draws its own header, filters and cards, so the
 * content area is pixel-identical to the main app's /echo route without any of that.
 *
 * Providers here are exactly what the Echo tree actually consumes, no more:
 *   - ThemeProvider          dark/light, shared with the main app via app_settings
 *   - AudioRecordingProvider MaskEditor.tsx:80 records voice notes onto cards
 *
 * MemoryRouter rather than BrowserRouter: there is no history to persist and no URL bar,
 * and it keeps /echo/:reviewItemId navigation working exactly as it does in the main app.
 */

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AudioRecordingProvider>
        <div className="flex flex-col h-screen">
          {/* The window uses titleBarStyle:'hiddenInset', so nothing is draggable by default
              and the traffic lights would sit on top of the page content. This strip both
              clears them and gives the window a grab handle. */}
          <div
            className="h-[38px] shrink-0 bg-white dark:bg-dark-bg"
            style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
          />
          <div className="flex-1 min-h-0 overflow-auto">
            <MemoryRouter initialEntries={['/echo']}>
              <Routes>
                <Route path="/echo" element={<EchoPage />} />
                <Route path="/echo/:reviewItemId" element={<EchoImageDetailPage />} />
              </Routes>
            </MemoryRouter>
          </div>
        </div>
        {/* Fixed-position recording bar — same component the main app uses, so recording a
            voice note on a card behaves identically here. */}
        <AudioRecordingBar />
      </AudioRecordingProvider>
    </ThemeProvider>
  </React.StrictMode>
);
