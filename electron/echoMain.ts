import { app, BrowserWindow, nativeTheme, protocol } from 'electron';
import path from 'path';
import { initDatabase, closeDatabase } from './database/database';
import { ensureMediaDirs } from './services/fileStorage';
import { setupIpcHandlers } from './ipc/handlers';
import { registerMediaProtocol } from './protocols/mediaProtocol';

/**
 * Echo — the review-only companion app.
 *
 * Same database, same components, same features as the main app's /echo route. What it does
 * NOT do is boot the machinery that makes the main app heavy:
 *
 *   - no ScreenCaptureKit handlers      - no global shortcuts (would fight the main app's Cmd+D)
 *   - no OBS bridge / auto-connect      - no vosk:// protocol (no voice commands here)
 *   - no recording aspect menu          - no quick-capture cleanup pass
 *   - no tab shell (one window, one job)
 *
 * The renderer entry (src/echoMain.tsx) mounts only the Echo tree, so the 12 MB main bundle —
 * Excalidraw, pdf.js, mermaid, Tesseract, every page — is never parsed. Monaco still arrives
 * lazily if the code pad is opened, exactly as it does in the main app.
 *
 * userData is pinned to the same directory as the main app so both read one database. See the
 * busy_timeout pragma in database/database.ts for why concurrent writes are safe.
 */

const APP_NAME = 'NotesWithAudioAndVideo';   // shared file path — MUST match main.ts
const APP_DISPLAY_NAME = 'Echo';             // window/menu title only

app.setName(APP_DISPLAY_NAME);
app.setPath('userData', path.join(app.getPath('appData'), APP_NAME));

let echoWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

async function createEchoWindow(): Promise<void> {
  initDatabase();
  await ensureMediaDirs();

  // Registers every namespace, review:* included. Handler registration is just a Map insert —
  // the cost the main app pays is in the renderer bundle and the services it boots, not here.
  setupIpcHandlers();

  if (process.platform === 'darwin' && app.dock) {
    app.dock.show();
  }

  echoWindow = new BrowserWindow({
    width: 1100,
    height: 820,
    // Matches the main window: low minimum so Echo can take a tall/narrow portrait shape
    // for vertical screen recording of a review session.
    minWidth: 400,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required for better-sqlite3
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    title: '',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f0f0f' : '#ffffff',
    show: false,
  });

  // Custom context menu handling, same as the main window.
  echoWindow.webContents.on('context-menu', (e) => {
    e.preventDefault();
  });

  // Keep the native title empty — the renderer draws its own header.
  echoWindow.on('page-title-updated', (e) => {
    e.preventDefault();
  });

  echoWindow.once('ready-to-show', () => {
    echoWindow?.show();
  });

  if (isDev) {
    const devPort = process.env.VITE_DEV_PORT || '5174';
    echoWindow.loadURL(`http://localhost:${devPort}/echo.html`);
    echoWindow.webContents.openDevTools();
  } else {
    echoWindow.loadFile(path.join(__dirname, '../dist/echo.html'));
  }

  nativeTheme.on('updated', () => {
    echoWindow?.webContents.send('theme:changed', nativeTheme.shouldUseDarkColors);
  });

  echoWindow.on('close', () => {
    if (process.platform === 'darwin') {
      app.quit();
    }
  });

  echoWindow.on('closed', () => {
    echoWindow = null;
  });
}

// media:// only. The main app also privileges vosk:// for the offline speech model; Echo has
// no voice commands, so registering it would just be dead surface.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
    },
  },
]);

app.whenReady().then(async () => {
  registerMediaProtocol();

  await createEchoWindow();

  app.on('activate', () => {
    if (echoWindow && !echoWindow.isDestroyed()) {
      echoWindow.show();
      echoWindow.focus();
    } else {
      createEchoWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  closeDatabase();
});
