import { ipcMain, BrowserWindow, screen } from 'electron';
import { ScreenCaptureKitManager } from './ScreenCaptureManager';

let captureManager: ScreenCaptureKitManager | null = null;

export function registerScreenCaptureHandlers(mainWindow: BrowserWindow) {
  console.log('[ScreenCaptureKit] Registering IPC handlers');

  // Start capture
  ipcMain.handle('screencapturekit:start', async (event, config) => {
    console.log('[ScreenCaptureKit] IPC: start capture request', config);

    try {
      if (!captureManager) {
        captureManager = new ScreenCaptureKitManager();

        // Forward completion to renderer with file path
        captureManager.on('complete', (filePath: string) => {
          console.log('[ScreenCaptureKit] IPC: forwarding completion with file path:', filePath);
          mainWindow.webContents.send('screencapturekit:complete', { filePath });

          // Clean up after forwarding the completion event
          if (captureManager) {
            captureManager.removeAllListeners();
            captureManager = null;
            console.log('[ScreenCaptureKit] IPC: captureManager cleaned up after completion');
          }
        });

        // Forward errors to renderer
        captureManager.on('error', (error) => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error('[ScreenCaptureKit] IPC: forwarding error:', errorMessage);
          mainWindow.webContents.send('screencapturekit:error', { error: errorMessage });
        });

        // Log capture events
        captureManager.on('started', () => {
          console.log('[ScreenCaptureKit] IPC: capture started event');
        });

        captureManager.on('stopped', () => {
          console.log('[ScreenCaptureKit] IPC: capture stopped event');
        });

        captureManager.on('paused', () => {
          console.log('[ScreenCaptureKit] IPC: capture paused event');
        });

        captureManager.on('resumed', () => {
          console.log('[ScreenCaptureKit] IPC: capture resumed event');
        });
      }

      await captureManager.startCapture(config);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[ScreenCaptureKit] IPC: start capture failed:', errorMessage);
      return { success: false, error: errorMessage };
    }
  });

  // Stop capture
  ipcMain.handle('screencapturekit:stop', async () => {
    console.log('[ScreenCaptureKit] IPC: ===== STOP CAPTURE REQUEST RECEIVED =====');
    console.log('[ScreenCaptureKit] IPC: captureManager exists:', !!captureManager);

    try {
      if (captureManager) {
        console.log('[ScreenCaptureKit] IPC: Calling captureManager.stopCapture()...');
        captureManager.stopCapture();
        console.log('[ScreenCaptureKit] IPC: captureManager.stopCapture() completed');
        // DO NOT removeAllListeners or set to null here!
        // The completion event needs to be forwarded to renderer
        // Cleanup will happen after completion callback fires
      } else {
        console.warn('[ScreenCaptureKit] IPC: ⚠️ No captureManager - cannot stop (indicator may stay!)');
      }
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[ScreenCaptureKit] IPC: stop capture failed:', errorMessage);
      return { success: false, error: errorMessage };
    }
  });

  // Pause capture
  ipcMain.handle('screencapturekit:pause', async () => {
    console.log('[ScreenCaptureKit] IPC: pause capture request');

    try {
      if (captureManager) {
        captureManager.pauseCapture();
      }
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[ScreenCaptureKit] IPC: pause capture failed:', errorMessage);
      return { success: false, error: errorMessage };
    }
  });

  // Resume capture
  ipcMain.handle('screencapturekit:resume', async () => {
    console.log('[ScreenCaptureKit] IPC: resume capture request');

    try {
      if (captureManager) {
        captureManager.resumeCapture();
      }
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[ScreenCaptureKit] IPC: resume capture failed:', errorMessage);
      return { success: false, error: errorMessage };
    }
  });

  // Check if capturing
  ipcMain.handle('screencapturekit:isCapturing', async () => {
    const isCapturing = captureManager ? captureManager.isCurrentlyCapturing() : false;
    return { isCapturing };
  });

  // Check if paused
  ipcMain.handle('screencapturekit:isPaused', async () => {
    const isPaused = captureManager ? captureManager.isPaused() : false;
    return { isPaused };
  });

  // Get display dimensions for a given display ID
  ipcMain.handle('screencapturekit:getDisplayDimensions', async (event, displayId: number) => {
    console.log('[ScreenCaptureKit] IPC: get display dimensions for displayId:', displayId);

    try {
      const displays = screen.getAllDisplays();

      // Find the display with the matching ID
      const targetDisplay = displays.find(display => display.id === displayId);

      if (!targetDisplay) {
        console.error('[ScreenCaptureKit] Display not found:', displayId);
        return {
          success: false,
          error: `Display ${displayId} not found`
        };
      }

      // Get the display bounds (includes scale factor)
      const { width, height } = targetDisplay.bounds;
      const scaleFactor = targetDisplay.scaleFactor;

      // Return physical pixel dimensions
      const physicalWidth = Math.round(width * scaleFactor);
      const physicalHeight = Math.round(height * scaleFactor);

      console.log('[ScreenCaptureKit] Display dimensions:', {
        displayId,
        width: physicalWidth,
        height: physicalHeight,
        scaleFactor
      });

      return {
        success: true,
        width: physicalWidth,
        height: physicalHeight,
        scaleFactor
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[ScreenCaptureKit] IPC: getDisplayDimensions failed:', errorMessage);
      return { success: false, error: errorMessage };
    }
  });

  console.log('[ScreenCaptureKit] ✅ IPC handlers registered');
}

export function unregisterScreenCaptureHandlers() {
  console.log('[ScreenCaptureKit] Unregistering IPC handlers');

  ipcMain.removeHandler('screencapturekit:start');
  ipcMain.removeHandler('screencapturekit:stop');
  ipcMain.removeHandler('screencapturekit:pause');
  ipcMain.removeHandler('screencapturekit:resume');
  ipcMain.removeHandler('screencapturekit:isCapturing');
  ipcMain.removeHandler('screencapturekit:isPaused');
  ipcMain.removeHandler('screencapturekit:getDisplayDimensions');

  if (captureManager) {
    captureManager.stopCapture();
    captureManager.removeAllListeners();
    captureManager = null;
  }

  console.log('[ScreenCaptureKit] ✅ IPC handlers unregistered');
}
