import { BrowserWindow, screen } from 'electron';
import path from 'path';

const isDev = process.env.NODE_ENV === 'development' || !require('electron').app.isPackaged;

export interface RegionSelectorWindow extends BrowserWindow {
  displayId: string;
}

export function createRegionSelectorWindows(): RegionSelectorWindow[] {
  const displays = screen.getAllDisplays();
  const windows: RegionSelectorWindow[] = [];

  console.log(`[RegionSelector] Creating overlay windows for ${displays.length} display(s)`);
  console.log(`[RegionSelector] Displays:`, displays.map(d => ({
    id: d.id,
    bounds: d.bounds,
    primary: d.bounds.x === 0 && d.bounds.y === 0
  })));

  // Only create overlay for primary display for now (simplified debugging)
  const primaryDisplay = screen.getPrimaryDisplay();
  console.log(`[RegionSelector] Primary display:`, primaryDisplay);

  try {
    console.log(`[RegionSelector] Creating BrowserWindow...`);

    // In dev mode, __dirname is the source directory, so we need dist-electron/preload.js
    // In production, __dirname is dist-electron, so we use ./preload.js
    const preloadPath = isDev
      ? path.join(__dirname, '../dist-electron/preload.js')
      : path.join(__dirname, 'preload.js');
    console.log(`[RegionSelector] Preload path:`, preloadPath);
    console.log(`[RegionSelector] isDev:`, isDev);

    const window = new BrowserWindow({
      x: primaryDisplay.bounds.x,
      y: primaryDisplay.bounds.y,
      width: primaryDisplay.bounds.width,
      height: primaryDisplay.bounds.height,

      // Window chrome - frameless and transparent
      frame: false,
      transparent: true,

      // Behavior - always on top and non-interactive with OS
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      closable: true,

      // Modal behavior for proper event capture
      focusable: true,
      hasShadow: false,
      acceptFirstMouse: true,

      // Rendering
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },

      // Show immediately
      show: true,
    }) as RegionSelectorWindow;

    console.log(`[RegionSelector] BrowserWindow created successfully`);

    // Store display ID for reference
    window.displayId = primaryDisplay.id.toString();

    // Add error handlers
    window.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error(`[RegionSelector] Failed to load overlay:`, errorCode, errorDescription);
    });

    window.on('closed', () => {
      console.log(`[RegionSelector] Overlay window closed`);
    });

    window.webContents.on('console-message', (event, level, message, line, sourceId) => {
      console.log(`[RegionSelector Renderer] ${message}`);
    });

    // Load overlay HTML

    if (isDev) {
      const devPort = process.env.VITE_DEV_PORT || '5174';
      // Use simple vanilla JS version (no React) to avoid Vite plugin issues
      const url = `http://localhost:${devPort}/region-selector-simple.html?displayId=${primaryDisplay.id}`;
      console.log(`[RegionSelector] Loading URL:`, url);
      window.loadURL(url)
        .then(() => console.log('[RegionSelector] URL loaded successfully'))
        .catch(err => console.error('[RegionSelector] Load URL error:', err));
    } else {
      const filePath = path.join(__dirname, '../region-selector.html');
      console.log(`[RegionSelector] Loading file:`, filePath);
      window.loadFile(filePath)
        .then(() => console.log('[RegionSelector] File loaded successfully'))
        .catch(err => console.error('[RegionSelector] Load file error:', err));
    }

    // Pass display info to renderer when ready
    window.webContents.on('did-finish-load', () => {
      console.log(`[RegionSelector] did-finish-load event fired`);
      window.webContents.send('display-info', {
        id: primaryDisplay.id.toString(),
        bounds: primaryDisplay.bounds,
        scaleFactor: primaryDisplay.scaleFactor,
      });
      console.log(`[RegionSelector] Sent display-info to renderer`);
    });

    // Prevent default context menu
    window.webContents.on('context-menu', (e) => {
      e.preventDefault();
    });

    windows.push(window);
    console.log(`[RegionSelector] Created overlay window for primary display`);
  } catch (error) {
    console.error(`[RegionSelector] Error creating overlay window:`, error);
  }

  console.log(`[RegionSelector] Returning ${windows.length} window(s)`);
  return windows;
}

export function closeAllRegionSelectorWindows(): void {
  const allWindows = BrowserWindow.getAllWindows();

  for (const window of allWindows) {
    // Check if this is a region selector window by checking if it has the displayId property
    if ('displayId' in window) {
      window.close();
    }
  }
}
