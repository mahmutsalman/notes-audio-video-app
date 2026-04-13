import { BrowserWindow, screen } from 'electron';
import path from 'path';
import { SettingsOperations } from '../database/operations';

const isDev = process.env.NODE_ENV === 'development' || !require('electron').app.isPackaged;

let statusWindow: BrowserWindow | null = null;

const preloadPath = isDev
  ? path.join(__dirname, '../dist-electron/preload.js')
  : path.join(__dirname, 'preload.js');

const WINDOW_W = 500;
const WINDOW_H = 500;
const POS_KEY_X = 'obs_status_window_x';
const POS_KEY_Y = 'obs_status_window_y';

function getSavedPosition(): { x: number; y: number } | null {
  const sx = SettingsOperations.get(POS_KEY_X);
  const sy = SettingsOperations.get(POS_KEY_Y);
  if (sx != null && sy != null) {
    const x = parseInt(sx, 10);
    const y = parseInt(sy, 10);
    if (!isNaN(x) && !isNaN(y)) return { x, y };
  }
  return null;
}

function savePosition(x: number, y: number) {
  SettingsOperations.set(POS_KEY_X, String(x));
  SettingsOperations.set(POS_KEY_Y, String(y));
}

function defaultPosition(): { x: number; y: number } {
  // Place in center of primary display
  const primary = screen.getPrimaryDisplay();
  const { x: bx, y: by, width: bw, height: bh } = primary.bounds;
  return {
    x: bx + Math.floor((bw - WINDOW_W) / 2),
    y: by + Math.floor((bh - WINDOW_H) / 2),
  };
}

export function createObsStatusWindow(): void {
  if (statusWindow && !statusWindow.isDestroyed()) return;

  const pos = getSavedPosition() ?? defaultPosition();

  statusWindow = new BrowserWindow({
    width: WINDOW_W,
    height: WINDOW_H,
    x: pos.x,
    y: pos.y,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: false,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  statusWindow.setAlwaysOnTop(true, 'floating');

  if (process.platform === 'darwin') {
    statusWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  if (isDev) {
    statusWindow.loadURL(`http://localhost:5174/obs-status-window.html`);
  } else {
    statusWindow.loadFile(path.join(__dirname, '../dist/obs-status-window.html'));
  }

  // Save position whenever the user drags the window
  statusWindow.on('moved', () => {
    if (statusWindow && !statusWindow.isDestroyed()) {
      const [x, y] = statusWindow.getPosition();
      savePosition(x, y);
    }
  });

  statusWindow.on('closed', () => {
    statusWindow = null;
  });

  statusWindow.webContents.on('console-message', (_e, _level, message) => {
    console.log('[OBS Status Window]', message);
  });
}

export function showObsStatusWindow(): void {
  if (!statusWindow || statusWindow.isDestroyed()) {
    createObsStatusWindow();
  }
  statusWindow!.show();
  statusWindow!.focus();
  statusWindow!.webContents.send('obs:windowVisibility', true);
}

export function hideObsStatusWindow(): void {
  if (statusWindow && !statusWindow.isDestroyed()) {
    statusWindow.webContents.send('obs:windowVisibility', false);
    statusWindow.hide();
  }
}

export function toggleObsStatusWindow(): void {
  if (!statusWindow || statusWindow.isDestroyed()) {
    createObsStatusWindow();
    statusWindow!.show();
    statusWindow!.focus();
    return;
  }
  if (statusWindow.isVisible()) {
    statusWindow.webContents.send('obs:windowVisibility', false);
    statusWindow.hide();
  } else {
    statusWindow.show();
    statusWindow.focus();
    statusWindow.webContents.send('obs:windowVisibility', true);
  }
}

/** Forward any IPC channel+payload to the status window's renderer. */
export function notifyObsStatusWindow(channel: string, data?: any): void {
  if (statusWindow && !statusWindow.isDestroyed() && statusWindow.isVisible()) {
    statusWindow.webContents.send(channel, data);
  }
}

export function getObsStatusWindow(): BrowserWindow | null {
  return statusWindow;
}
