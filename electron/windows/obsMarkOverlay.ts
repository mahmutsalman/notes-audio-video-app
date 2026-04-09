import { BrowserWindow, screen } from 'electron';
import path from 'path';

const isDev = process.env.NODE_ENV === 'development' || !require('electron').app.isPackaged;

let overlayWindow: BrowserWindow | null = null;

const preloadPath = isDev
  ? path.join(__dirname, '../dist-electron/preload.js')
  : path.join(__dirname, 'preload.js');

export function createObsMarkOverlayWindow(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) return;

  overlayWindow = new BrowserWindow({
    width: 420,
    height: 220,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');

  if (process.platform === 'darwin') {
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  if (isDev) {
    overlayWindow.loadURL(`http://localhost:5174/obs-mark-overlay.html`);
  } else {
    overlayWindow.loadFile(path.join(__dirname, '../dist/obs-mark-overlay.html'));
  }

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  overlayWindow.webContents.on('console-message', (_e, _level, message) => {
    console.log('[OBS Overlay]', message);
  });
}

export function showObsMarkOverlay(timecode: number, markCount: number): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createObsMarkOverlayWindow();
  }

  // Position: bottom-right of primary display
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: sw, height: sh } = primaryDisplay.workAreaSize;
  const x = primaryDisplay.bounds.x + sw - 440;
  const y = primaryDisplay.bounds.y + sh - 240;
  overlayWindow!.setPosition(x, y);

  // Send data to overlay
  overlayWindow!.webContents.send('obs:overlayData', { timecode, markCount });
  overlayWindow!.showInactive();
  overlayWindow!.focus();
}

export function toggleObsMarkOverlay(
  timecode: number,
  markCount: number,
  marks: any[],
  currentCaption: string
): void {
  if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
    overlayWindow.hide();
    return;
  }

  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createObsMarkOverlayWindow();
  }

  // Resize based on how many previous marks to show
  const MARK_ROW_H = 46;
  const SECTION_HEADER_H = 30;
  const BASE_H = 220;
  const extraH = marks.length > 0
    ? SECTION_HEADER_H + Math.min(marks.length, 4) * MARK_ROW_H
    : 0;
  const height = BASE_H + extraH;

  overlayWindow!.setSize(420, height);

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: sw, height: sh } = primaryDisplay.workAreaSize;
  const x = primaryDisplay.bounds.x + sw - 440;
  const y = primaryDisplay.bounds.y + sh - height - 20;
  overlayWindow!.setPosition(x, y);

  overlayWindow!.webContents.send('obs:overlayDataWithMarks', {
    timecode,
    markCount,
    marks,
    currentCaption,
  });
  overlayWindow!.showInactive();
  overlayWindow!.focus();
}

export function hideObsMarkOverlay(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide();
  }
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow;
}
