import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';
import { ScreenRecordingSettingsProvider } from './context/ScreenRecordingSettingsContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <ScreenRecordingSettingsProvider>
          <App />
        </ScreenRecordingSettingsProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
