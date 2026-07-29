import { app, BrowserWindow, nativeTheme, protocol } from 'electron';
import path from 'path';
import fs from 'fs';
import { initDatabase, closeDatabase } from './database/database';
import { ensureMediaDirs } from './services/fileStorage';
import { migrateLegacyBackups } from './services/backupService';
import { setupIpcHandlers, setupObsEventBridge } from './ipc/handlers';
import { QuickCaptureOperations, SettingsOperations } from './database/operations';
import { deleteQuickCaptureFiles } from './services/fileStorage';
import { registerGlobalShortcuts, unregisterGlobalShortcuts, registerObsShortcut } from './shortcuts/globalShortcuts';
import { registerScreenCaptureHandlers, unregisterScreenCaptureHandlers } from './screencapture/ipc-handlers';
import { initRecordingAspect } from './windows/recordingAspect';
import { registerMediaProtocol } from './protocols/mediaProtocol';

// Force consistent app name and userData path (ensures dev and prod use same database)
// This is critical: dev mode uses package.json 'name', prod uses 'productName'
// By explicitly setting the path, we ensure both environments use the same folder
const APP_NAME = 'NotesWithAudioAndVideo';           // For file paths (no spaces)
const APP_DISPLAY_NAME = 'Notes With Audio And Video'; // For window title
app.setName(APP_DISPLAY_NAME);

// Set userData path explicitly to ensure dev and prod use the same location
const userDataPath = path.join(app.getPath('appData'), APP_NAME);
app.setPath('userData', userDataPath);

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
// This is only needed for Windows installers
// if (require('electron-squirrel-startup')) {
//   app.quit();
// }

let mainWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

async function createWindow(): Promise<void> {
  // One-time migration of legacy backups from app bundle to userData.
  await migrateLegacyBackups();

  // Initialize database
  initDatabase();

  // Ensure media directories exist
  await ensureMediaDirs();

  // Clear extend logs from previous session
  const { clearExtendLog } = await import('./services/extendLogger');
  await clearExtendLog();

  // Clear per-recording timeline debug logs from previous session
  const { clearAllRecordingDebugLogs } = await import('./services/recordingDebugLogger');
  await clearAllRecordingDebugLogs();

  // Setup IPC handlers
  setupIpcHandlers();

  // Cleanup expired quick captures (older than 7 days)
  try {
    const expired = QuickCaptureOperations.getExpired();
    for (const item of expired) {
      await deleteQuickCaptureFiles(item.imagePaths, item.audioPaths);
    }
    if (expired.length > 0) {
      console.log(`Cleaned up ${expired.length} expired quick capture(s)`);
    }
  } catch (err) {
    console.error('Quick capture cleanup failed:', err);
  }

  // macOS: Ensure app is visible in dock
  if (process.platform === 'darwin' && app.dock) {
    app.dock.show();
  }

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    // Low minWidth so the window can take a tall/narrow portrait shape
    // (e.g. ~9:16 for vertical screen recording of the review session).
    minWidth: 400,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required for better-sqlite3
      // Chromium's built-in PDF viewer is a plugin. Without this a PDF node opened
      // in the in-app viewer renders as a blank frame instead of a paged document.
      plugins: true,
      // The in-app document viewer embeds a <webview>. It needs a guest WebContents of
      // its own so it can be zoomed with setZoomFactor — a plain iframe can only be CSS
      // transformed, which rasterises the page and destroys text quality on zoom.
      webviewTag: true,
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    // The app draws its own title bar (the tab strip is the drag region), so the
    // native window title must stay empty. With a full-size content view the
    // system title is painted over the app's own header, and at narrow window
    // widths it wraps onto several lines instead of truncating.
    title: '',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f0f0f' : '#ffffff',
    show: false, // Don't show until ready
  });

  // Disable default context menu to allow custom context menu handling
  // This is critical for shift+right-click color cycling to work in production
  mainWindow.webContents.on('context-menu', (e) => {
    e.preventDefault();
  });

  // Keep the native window title empty. Without this the renderer's <title> is
  // pushed to the window on load and re-introduces the overlapping title text
  // that the empty `title` option above is there to prevent.
  mainWindow.on('page-title-updated', (e) => {
    e.preventDefault();
  });

  // Application menu + restore the saved recording aspect ratio.
  // Installed before the window is shown so the restored shape is applied in
  // one step rather than visibly snapping after first paint.
  initRecordingAspect(() => mainWindow);

  // Show window when ready to avoid flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Load the app
  if (isDev) {
    // In development, load from Vite dev server
    const devPort = process.env.VITE_DEV_PORT || '5174';
    mainWindow.loadURL(`http://localhost:${devPort}`);
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the built files
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Send theme changes to renderer
  nativeTheme.on('updated', () => {
    mainWindow?.webContents.send('theme:changed', nativeTheme.shouldUseDarkColors);
  });

  // Register ScreenCaptureKit IPC handlers
  registerScreenCaptureHandlers(mainWindow);

  // Wire up OBS push events to renderer
  setupObsEventBridge(mainWindow).catch(err => console.error('[Main] OBS bridge setup failed:', err));

  // Study tracker: emit blur/focus events to renderer for idle detection
  mainWindow.on('blur', () => {
    mainWindow?.webContents.send('study:appBlur');
  });
  mainWindow.on('focus', () => {
    mainWindow?.webContents.send('study:appFocus');
  });

  // Handle window close button - quit app instead of just hiding window
  mainWindow.on('close', (event) => {
    if (process.platform === 'darwin') {
      // On macOS, when user clicks close button, quit the entire app
      console.log('[Main] Window close requested - quitting app');
      app.quit();
    }
  });

  mainWindow.on('closed', () => {
    // Cleanup ScreenCaptureKit handlers
    unregisterScreenCaptureHandlers();
    mainWindow = null;
  });
}

// Register custom protocol for serving local media files
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
  {
    scheme: 'vosk',
    privileges: {
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
    },
  },
]);

// This method will be called when Electron has finished initialization
app.whenReady().then(async () => {
  // Register the vosk:// protocol to serve the offline speech model from userData
  protocol.handle('vosk', async (request) => {
    const filename = decodeURIComponent(request.url.replace('vosk://', ''));
    const filePath = path.join(app.getPath('userData'), 'vosk-models', filename);
    try {
      const data = fs.readFileSync(filePath);
      return new Response(data, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': data.length.toString(),
        },
      });
    } catch {
      return new Response('Vosk model not found', { status: 404 });
    }
  });

  // Register the media:// protocol handler with Range request support for video seeking.
  // Shared with the Echo companion app — see electron/protocols/mediaProtocol.ts
  registerMediaProtocol();

  await createWindow();

  // Register activate handler AFTER first window is created so it doesn't
  // race with whenReady and open a second window on macOS launch
  app.on('activate', () => {
    // Use the tracked mainWindow reference — getAllWindows() also contains the
    // OBS status/overlay windows (no displayId), so a heuristic search could
    // show the hidden OBS status window on every dock-click/Cmd+Tab activation.
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });

  // Register global keyboard shortcuts (Cmd+D for region selection)
  registerGlobalShortcuts();

  // OBS: auto-connect and register F10 if enabled (database is ready now)
  const obsEnabled = SettingsOperations.get('obs_enabled') === 'true';
  if (obsEnabled) {
    registerObsShortcut();
    const { obsService } = await import('./services/obsService');
    const { createObsMarkOverlayWindow } = await import('./windows/obsMarkOverlay');
    createObsMarkOverlayWindow();
    const host = SettingsOperations.get('obs_host') || '127.0.0.1';
    const port = SettingsOperations.get('obs_port') || '4455';
    const pw = SettingsOperations.get('obs_password') || '';
    obsService.connect(`ws://${host}:${port}`, pw).catch(() => {
      console.log('[Main] OBS auto-connect failed — OBS may not be running');
    });
  }
});

// Hide the OBS overlay whenever the user switches to another app.
// will-resign-active fires when a *different application* becomes active, NOT when
// the user clicks on the overlay window itself (same Electron process), so the
// overlay stays fully interactive while the notes app is in use.
// This also prevents macOS Cmd+H restore from bringing the overlay back: we
// hide it before macOS can include it in its "windows to restore" list.
app.on('will-resign-active', async () => {
  const { hideObsMarkOverlay } = await import('./windows/obsMarkOverlay');
  hideObsMarkOverlay();
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Add Cmd+Q (macOS standard quit) handler
app.on('will-quit', (event) => {
  console.log('[App] will-quit event triggered - cleaning up resources');
});

// Clean up before quit
app.on('before-quit', () => {
  unregisterGlobalShortcuts();
  closeDatabase();
});

// Handle certificate errors in development
if (isDev) {
  app.on('certificate-error', (event, _webContents, _url, _error, _certificate, callback) => {
    event.preventDefault();
    callback(true);
  });
}
