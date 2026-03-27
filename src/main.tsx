import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from './context/ThemeContext';
import { ScreenRecordingSettingsProvider } from './context/ScreenRecordingSettingsContext';
import { AudioRecordingProvider } from './context/AudioRecordingContext';
import { ImageAudioPlayerProvider } from './context/ImageAudioPlayerContext';
import { DurationAudioPlayerProvider } from './context/DurationAudioPlayerContext';
import { RecordingAudioPlayerProvider } from './context/RecordingAudioPlayerContext';
import { TabsProvider } from './context/TabsContext';
import TabsShell from './components/tabs/TabsShell';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ScreenRecordingSettingsProvider>
        <AudioRecordingProvider>
          <ImageAudioPlayerProvider>
            <DurationAudioPlayerProvider>
              <RecordingAudioPlayerProvider>
                <TabsProvider>
                  <TabsShell />
                </TabsProvider>
              </RecordingAudioPlayerProvider>
            </DurationAudioPlayerProvider>
          </ImageAudioPlayerProvider>
        </AudioRecordingProvider>
      </ScreenRecordingSettingsProvider>
    </ThemeProvider>
  </React.StrictMode>
);
