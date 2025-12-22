import { BrowserWindow, screen } from 'electron';
import path from 'path';

const isDev = process.env.NODE_ENV === 'development' || !require('electron').app.isPackaged;

export interface RegionSelectorWindow extends BrowserWindow {
  displayId: string;
}

// Track active region selector windows
export let regionSelectorWindows: RegionSelectorWindow[] = [];

export function createRegionSelectorWindows(): RegionSelectorWindow[] {
  const displays = screen.getAllDisplays();
  const windows: RegionSelectorWindow[] = [];

  console.log(`[RegionSelector] Creating overlay windows for ${displays.length} display(s)`);
  console.log(`[RegionSelector] Displays:`, displays.map(d => ({
    id: d.id,
    bounds: d.bounds,
    primary: d.bounds.x === 0 && d.bounds.y === 0
  })));

  // In dev mode, __dirname is the source directory, so we need dist-electron/preload.js
  // In production, __dirname is dist-electron, so we use ./preload.js
  const preloadPath = isDev
    ? path.join(__dirname, '../dist-electron/preload.js')
    : path.join(__dirname, 'preload.js');
  console.log(`[RegionSelector] Preload path:`, preloadPath);
  console.log(`[RegionSelector] isDev:`, isDev);

  // Loop through ALL displays and create overlay for each
  for (const display of displays) {
    try {
      console.log(`[RegionSelector] Creating overlay for display ${display.id}`);

      // Use THIS display's bounds (not primary)
      const bounds = display.bounds;
      console.log(`[RegionSelector] Window positioning for display ${display.id}:`, {
        bounds: display.bounds,
        workArea: display.workArea,
        windowPosition: { x: bounds.x, y: bounds.y },
        windowSize: { width: bounds.width, height: bounds.height },
        scaleFactor: display.scaleFactor
      });

      const window = new BrowserWindow({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,

        // Window chrome - frameless and transparent
        frame: false,
        transparent: true,

        // macOS fullscreen mode for complete screen coverage
        simpleFullscreen: true,
        fullscreen: true,

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

      console.log(`[RegionSelector] BrowserWindow created for display ${display.id}`);

      // Set window level to appear above menu bar
      window.setAlwaysOnTop(true, 'screen-saver');
      console.log(`[RegionSelector] Window level set to screen-saver for display ${display.id}`);

      // Force simple fullscreen mode on macOS for complete coverage
      window.setSimpleFullScreen(true);
      console.log(`[RegionSelector] Simple fullscreen enabled for display ${display.id}`);

      // macOS: Make window visible on all workspaces/spaces (critical for global shortcut)
      if (process.platform === 'darwin') {
        window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
        console.log(`[RegionSelector] Set visible on all workspaces for display ${display.id} (macOS)`);
      }

      // Bring window to front and focus it
      window.show();
      window.focus();
      console.log(`[RegionSelector] Window shown and focused for display ${display.id}`);

      // Store display ID for THIS window
      window.displayId = display.id.toString();

      // Add error handlers
      window.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error(`[RegionSelector] Failed to load overlay for display ${display.id}:`, errorCode, errorDescription);
      });

      window.on('closed', () => {
        console.log(`[RegionSelector] Overlay window for display ${display.id} closed`);
      });

      window.webContents.on('console-message', (event, level, message, line, sourceId) => {
        console.log(`[RegionSelector Renderer ${display.id}] ${message}`);
      });

      // Load overlay HTML with THIS display's ID in URL

      if (isDev) {
        const devPort = process.env.VITE_DEV_PORT || '5174';
        // Use simple vanilla JS version (no React) to avoid Vite plugin issues
        const url = `http://localhost:${devPort}/region-selector-simple.html?displayId=${display.id}`;
        console.log(`[RegionSelector] Loading URL for display ${display.id}:`, url);
        window.loadURL(url)
          .then(() => console.log(`[RegionSelector] URL loaded successfully for display ${display.id}`))
          .catch(err => console.error(`[RegionSelector] Load URL error for display ${display.id}:`, err));
      } else {
        const filePath = path.join(__dirname, '../dist/region-selector-simple.html');
        console.log(`[RegionSelector] Loading file for display ${display.id}:`, filePath);
        window.loadFile(filePath, {
          query: { displayId: display.id.toString() }
        })
          .then(() => console.log(`[RegionSelector] File loaded successfully for display ${display.id}`))
          .catch(err => console.error(`[RegionSelector] Load file error for display ${display.id}:`, err));
      }

      // Pass display info to renderer when ready
      window.webContents.on('did-finish-load', () => {
        console.log(`[RegionSelector] did-finish-load event fired for display ${display.id}`);
        window.webContents.send('display-info', {
          id: display.id.toString(),
          bounds: display.bounds,
          workArea: display.workArea,
          scaleFactor: display.scaleFactor,
        });
        console.log(`[RegionSelector] Sent display-info to renderer for display ${display.id}`);
      });

      // Prevent default context menu
      window.webContents.on('context-menu', (e) => {
        e.preventDefault();
      });

      windows.push(window);
      console.log(`[RegionSelector] Created overlay window for display ${display.id}`);
    } catch (error) {
      console.error(`[RegionSelector] Failed to create overlay for display ${display.id}:`, error);
      // Continue to next display - don't fail entire operation
    }
  }

  console.log(`[RegionSelector] Created ${windows.length} overlay window(s)`);


  // Store windows in module-level variable for tracking
  regionSelectorWindows = windows;
  console.log(`[RegionSelector] Returning ${windows.length} window(s)`);
  return windows;
}

export function closeAllRegionSelectorWindows(): void {
  const allWindows = BrowserWindow.getAllWindows();
  console.log('[RegionSelector] Closing all region selector windows, total windows:', allWindows.length);

  for (const window of allWindows) {
    // Check if this is a region selector window by checking if it has the displayId property
    if ('displayId' in window) {
      console.log('[RegionSelector] Found region selector window, closing...');

      // Exit fullscreen mode before closing to ensure proper cleanup
      if (window.isSimpleFullScreen()) {
        window.setSimpleFullScreen(false);
      }
      if (window.isFullScreen()) {
        window.setFullScreen(false);
      }

      // Destroy immediately instead of close for faster cleanup
      window.destroy();
      console.log('[RegionSelector] Window destroyed');
    }
  }

  // Clear the tracked windows array
  regionSelectorWindows = [];
  console.log('[RegionSelector] Cleared region selector windows array');
}
