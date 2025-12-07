import { app, BrowserWindow, nativeTheme, protocol } from 'electron';
import path from 'path';
import fs from 'fs';
import { initDatabase, closeDatabase } from './database/database';
import { ensureMediaDirs } from './services/fileStorage';
import { setupIpcHandlers } from './ipc/handlers';

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

  // Show window when ready to avoid flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Load the app
  if (isDev) {
    // In development, load from Vite dev server
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the built files
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Send theme changes to renderer
  nativeTheme.on('updated', () => {
    mainWindow?.webContents.send('theme:changed', nativeTheme.shouldUseDarkColors);
  });

  mainWindow.on('closed', () => {
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
  // Register the media:// protocol handler
  protocol.handle('media', async (request) => {
    const url = request.url.replace('media://', '');
    const filePath = decodeURIComponent(url);

    try {
      const data = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();

      const mimeTypes: Record<string, string> = {
        '.webm': 'audio/webm',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
        '.mp4': 'video/mp4',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
      };

      return new Response(data, {
        headers: {
          'Content-Type': mimeTypes[ext] || 'application/octet-stream',
        },
      });
    } catch (error) {
      console.error('Failed to load media file:', filePath, error);
      return new Response('File not found', { status: 404 });
    }
  });

  createWindow();
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
  }
});

// Clean up before quit
app.on('before-quit', () => {
  closeDatabase();
});

// Handle certificate errors in development
if (isDev) {
  app.on('certificate-error', (event, _webContents, _url, _error, _certificate, callback) => {
    event.preventDefault();
    callback(true);
  });
}
