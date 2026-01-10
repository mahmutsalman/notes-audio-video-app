import { ipcMain, BrowserWindow, screen } from 'electron';
import { ScreenCaptureKitManager } from './ScreenCaptureManager';
import { appendRecordingDebugEvent } from '../services/recordingDebugLogger';

let captureManager: ScreenCaptureKitManager | null = null;
let activeRecordingId: number | null = null;

export function registerScreenCaptureHandlers(mainWindow: BrowserWindow) {
  console.log('[ScreenCaptureKit] Registering IPC handlers');

  const log = async (event: { type: string; origin?: string; payload?: any }) => {
    if (activeRecordingId == null) return;
    await appendRecordingDebugEvent(activeRecordingId, {
      type: event.type,
      origin: event.origin,
      payload: event.payload,
      atMs: Date.now(),
      processType: 'main'
    });
  };

  // Start capture
  ipcMain.handle('screencapturekit:start', async (event, config) => {
    console.log('[ScreenCaptureKit] IPC: start capture request', config);

    try {
      activeRecordingId = typeof config?.recordingId === 'number' ? config.recordingId : null;
      await log({
        type: 'sck.start.request',
        origin: 'ipc:screencapturekit:start',
        payload: {
          hasManager: !!captureManager,
          recordingId: activeRecordingId,
          config: {
            displayId: config?.displayId,
            width: config?.width,
            height: config?.height,
            frameRate: config?.frameRate,
            regionX: config?.regionX,
            regionY: config?.regionY,
            regionWidth: config?.regionWidth,
            regionHeight: config?.regionHeight,
            outputWidth: config?.outputWidth,
            outputHeight: config?.outputHeight,
            bitsPerPixel: config?.bitsPerPixel,
            outputPath: config?.outputPath
          }
        }
      });

      if (!captureManager) {
        captureManager = new ScreenCaptureKitManager();

        // Forward completion to renderer with file path
        captureManager.on('complete', (filePath: string) => {
          console.log('[ScreenCaptureKit] IPC: forwarding completion with file path:', filePath);
          void log({
            type: 'sck.complete',
            origin: 'native:complete',
            payload: { filePath }
          });
          mainWindow.webContents.send('screencapturekit:complete', { filePath });

          // Clean up after forwarding the completion event
          if (captureManager) {
            captureManager.removeAllListeners();
            captureManager = null;
            console.log('[ScreenCaptureKit] IPC: captureManager cleaned up after completion');
          }
          activeRecordingId = null;
        });

        // Forward errors to renderer
        captureManager.on('error', (error) => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error('[ScreenCaptureKit] IPC: forwarding error:', errorMessage);
          void log({
            type: 'sck.error',
            origin: 'native:error',
            payload: { error: errorMessage }
          });
          mainWindow.webContents.send('screencapturekit:error', { error: errorMessage });
        });

        // Log capture events
        captureManager.on('started', () => {
          console.log('[ScreenCaptureKit] IPC: capture started event');
          void log({ type: 'sck.started', origin: 'native:started' });
        });

        captureManager.on('stopped', () => {
          console.log('[ScreenCaptureKit] IPC: capture stopped event');
          void log({ type: 'sck.stopped', origin: 'native:stopped' });
        });

        captureManager.on('paused', () => {
          console.log('[ScreenCaptureKit] IPC: capture paused event');
          void log({ type: 'sck.paused', origin: 'native:paused' });
        });

        captureManager.on('resumed', () => {
          console.log('[ScreenCaptureKit] IPC: capture resumed event');
          void log({ type: 'sck.resumed', origin: 'native:resumed' });
        });
      }

      await captureManager.startCapture(config);
      await log({ type: 'sck.start.success', origin: 'ipc:screencapturekit:start' });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[ScreenCaptureKit] IPC: start capture failed:', errorMessage);
      await log({ type: 'sck.start.error', origin: 'ipc:screencapturekit:start', payload: { error: errorMessage } });
      return { success: false, error: errorMessage };
    }
  });

  // Stop capture
  ipcMain.handle('screencapturekit:stop', async () => {
    console.log('[ScreenCaptureKit] IPC: ===== STOP CAPTURE REQUEST RECEIVED =====');
    console.log('[ScreenCaptureKit] IPC: captureManager exists:', !!captureManager);

    try {
      await log({ type: 'sck.stop.request', origin: 'ipc:screencapturekit:stop', payload: { hasManager: !!captureManager } });
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
      await log({ type: 'sck.stop.return', origin: 'ipc:screencapturekit:stop' });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[ScreenCaptureKit] IPC: stop capture failed:', errorMessage);
      await log({ type: 'sck.stop.error', origin: 'ipc:screencapturekit:stop', payload: { error: errorMessage } });
      return { success: false, error: errorMessage };
    }
  });

  // Pause capture
  ipcMain.handle('screencapturekit:pause', async () => {
    console.log('[ScreenCaptureKit] IPC: pause capture request');

    try {
      await log({ type: 'sck.pause.request', origin: 'ipc:screencapturekit:pause', payload: { hasManager: !!captureManager } });
      if (captureManager) {
        captureManager.pauseCapture();
      }
      await log({ type: 'sck.pause.return', origin: 'ipc:screencapturekit:pause' });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[ScreenCaptureKit] IPC: pause capture failed:', errorMessage);
      await log({ type: 'sck.pause.error', origin: 'ipc:screencapturekit:pause', payload: { error: errorMessage } });
      return { success: false, error: errorMessage };
    }
  });

  // Resume capture
  ipcMain.handle('screencapturekit:resume', async () => {
    console.log('[ScreenCaptureKit] IPC: resume capture request');

    try {
      await log({ type: 'sck.resume.request', origin: 'ipc:screencapturekit:resume', payload: { hasManager: !!captureManager } });
      if (captureManager) {
        captureManager.resumeCapture();
      }
      await log({ type: 'sck.resume.return', origin: 'ipc:screencapturekit:resume' });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[ScreenCaptureKit] IPC: resume capture failed:', errorMessage);
      await log({ type: 'sck.resume.error', origin: 'ipc:screencapturekit:resume', payload: { error: errorMessage } });
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
