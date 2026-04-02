import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from './context/ThemeContext';
import { ScreenRecordingSettingsProvider } from './context/ScreenRecordingSettingsContext';
import { AudioRecordingProvider } from './context/AudioRecordingContext';
import { ImageAudioPlayerProvider } from './context/ImageAudioPlayerContext';
import { DurationAudioPlayerProvider } from './context/DurationAudioPlayerContext';
import { RecordingAudioPlayerProvider } from './context/RecordingAudioPlayerContext';
import { CaptureAudioPlayerProvider } from './context/CaptureAudioPlayerContext';
import { TabsProvider } from './context/TabsContext';
import TabsShell from './components/tabs/TabsShell';
import AudioRecordingBar from './components/audio/AudioRecordingBar';
import ImageAudioPlayerBar from './components/audio/ImageAudioPlayerBar';
import DurationAudioPlayerBar from './components/audio/DurationAudioPlayerBar';
import RecordingAudioPlayerBar from './components/audio/RecordingAudioPlayerBar';
import CaptureAudioPlayerBar from './components/audio/CaptureAudioPlayerBar';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ScreenRecordingSettingsProvider>
        <AudioRecordingProvider>
          <ImageAudioPlayerProvider>
            <DurationAudioPlayerProvider>
              <RecordingAudioPlayerProvider>
                <CaptureAudioPlayerProvider>
                  <TabsProvider>
                    <TabsShell />
                    {/* Audio/recording bars live here — outside TabsShell so only ONE
                        instance exists regardless of how many tabs are open. Previously
                        each tab's MainLayout rendered its own copy; with 3+ tabs the
                        hidden copies' position:fixed elements leaked through display:none
                        in Electron's Chromium and blocked all click events. */}
                    <ImageAudioPlayerBar />
                    <DurationAudioPlayerBar />
                    <RecordingAudioPlayerBar />
                    <CaptureAudioPlayerBar />
                    <AudioRecordingBar />
                  </TabsProvider>
                </CaptureAudioPlayerProvider>
              </RecordingAudioPlayerProvider>
            </DurationAudioPlayerProvider>
          </ImageAudioPlayerProvider>
        </AudioRecordingProvider>
      </ScreenRecordingSettingsProvider>
    </ThemeProvider>
  </React.StrictMode>
);
