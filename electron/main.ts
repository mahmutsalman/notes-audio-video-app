import { app, BrowserWindow, nativeTheme, protocol } from 'electron';
import path from 'path';
import fs from 'fs';
import { initDatabase, closeDatabase } from './database/database';
import { ensureMediaDirs } from './services/fileStorage';
import { setupIpcHandlers } from './ipc/handlers';
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from './shortcuts/globalShortcuts';
import { registerScreenCaptureHandlers, unregisterScreenCaptureHandlers } from './screencapture/ipc-handlers';

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
  // Initialize database
  initDatabase();

  // Ensure media directories exist
  await ensureMediaDirs();

  // Setup IPC handlers
  setupIpcHandlers();

  // macOS: Ensure app is visible in dock
  if (process.platform === 'darwin' && app.dock) {
    app.dock.show();
  }

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required for better-sqlite3
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f0f0f' : '#ffffff',
    show: false, // Don't show until ready
  });

  // Disable default context menu to allow custom context menu handling
  // This is critical for shift+right-click color cycling to work in production
  mainWindow.webContents.on('context-menu', (e) => {
    e.preventDefault();
  });

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
]);

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  // Register the media:// protocol handler with Range request support for video seeking
  protocol.handle('media', async (request) => {
    const url = request.url.replace('media://', '');
    const filePath = decodeURIComponent(url);

    try {
      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const ext = path.extname(filePath).toLowerCase();

      const mimeTypes: Record<string, string> = {
        '.webm': 'video/webm',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
        '.mp4': 'video/mp4',
        '.mov': 'video/mp4',
        '.mkv': 'video/x-matroska',
        '.m4v': 'video/mp4',
        '.avi': 'video/x-msvideo',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
      };

      const contentType = mimeTypes[ext] || 'application/octet-stream';

      // Parse Range header for seeking support
      const rangeHeader = request.headers.get('range');

      if (rangeHeader) {
        // Handle Range request (for video/audio seeking)
        const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
        if (match) {
          const start = match[1] ? parseInt(match[1], 10) : 0;
          const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
          const chunkSize = end - start + 1;

          const stream = fs.createReadStream(filePath, { start, end });
          const chunks: Buffer[] = [];
          for await (const chunk of stream) {
            chunks.push(chunk as Buffer);
          }
          const data = Buffer.concat(chunks);

          return new Response(data, {
            status: 206,
            headers: {
              'Content-Type': contentType,
              'Content-Length': chunkSize.toString(),
              'Content-Range': `bytes ${start}-${end}/${fileSize}`,
              'Accept-Ranges': 'bytes',
            },
          });
        }
      }

      // Full file request (no Range header)
      const data = fs.readFileSync(filePath);
      return new Response(data, {
        headers: {
          'Content-Type': contentType,
          'Content-Length': fileSize.toString(),
          'Accept-Ranges': 'bytes',
        },
      });
    } catch (error) {
      console.error('Failed to load media file:', filePath, error);
      return new Response('File not found', { status: 404 });
    }
  });

  createWindow();

  // Register global keyboard shortcuts (Cmd+D for region selection)
  registerGlobalShortcuts();
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    // Show and focus the main window if it exists
    const mainWin = BrowserWindow.getAllWindows().find((w: any) => !('displayId' in w));
    if (mainWin) {
      mainWin.show();
      mainWin.focus();
    }
  }
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
