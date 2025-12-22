import { globalShortcut, BrowserWindow } from 'electron';
import { createRegionSelectorWindows, regionSelectorWindows } from '../windows/regionSelector';

/**
 * Registers global keyboard shortcuts for the application
 * Currently registers:
 * - Cmd+D (macOS) / Ctrl+D (Windows/Linux) for region selection
 * - Cmd+H (macOS) / Ctrl+H (Windows/Linux) for duration mark input toggle
 */
export function registerGlobalShortcuts(): void {
  console.log('[GlobalShortcuts] Registering global shortcuts...');

  // Register Cmd+D (macOS) / Ctrl+D (Windows/Linux) for region selection
  const regionShortcut = 'CommandOrControl+D';
  const regionRegistered = globalShortcut.register(regionShortcut, () => {
    console.log(`[GlobalShortcuts] ${regionShortcut} pressed`);

    // Check if region selector windows already exist
    if (regionSelectorWindows && regionSelectorWindows.length > 0) {
      console.log('[GlobalShortcuts] Region selector already active, ignoring shortcut');
      return;
    }

    console.log('[GlobalShortcuts] Creating region selector windows...');
    try {
      createRegionSelectorWindows();
      console.log('[GlobalShortcuts] Region selector windows created successfully');
    } catch (error) {
      console.error('[GlobalShortcuts] Failed to create region selector windows:', error);
    }
  });

  if (regionRegistered) {
    console.log(`[GlobalShortcuts] Successfully registered ${regionShortcut}`);
  } else {
    console.error(`[GlobalShortcuts] Failed to register ${regionShortcut} (may be in use by another app)`);
  }

  // Register Cmd+H (macOS) / Ctrl+H (Windows/Linux) for duration mark input toggle
  const markShortcut = 'CommandOrControl+H';
  const markRegistered = globalShortcut.register(markShortcut, () => {
    console.log(`[GlobalShortcuts] ${markShortcut} pressed`);

    // Target recording overlays (those with displayId that remain after selection)
    const allWindows = BrowserWindow.getAllWindows();

    // DIAGNOSTIC: Log all windows with their properties
    console.log(`[GlobalShortcuts] Found ${allWindows.length} total window(s):`);
    allWindows.forEach((w: any, idx) => {
      console.log(`  Window ${idx + 1}:`, {
        id: w.id,
        hasDisplayId: 'displayId' in w,
        displayId: w.displayId || 'N/A',
        isDestroyed: w.isDestroyed(),
        isVisible: w.isVisible(),
        isFocused: w.isFocused(),
        title: w.getTitle()
      });
    });

    const recordingOverlays = allWindows.filter((w: any) => 'displayId' in w && !w.isDestroyed());

    console.log(`[GlobalShortcuts] Broadcasting inputFieldToggle to ${recordingOverlays.length} recording overlay(s)`);

    if (recordingOverlays.length === 0) {
      console.warn('[GlobalShortcuts] No recording overlays found - this may indicate windows are not set up correctly');
    }

    recordingOverlays.forEach((win, idx) => {
      console.log(`[GlobalShortcuts] Sending inputFieldToggle to overlay ${idx + 1} (displayId: ${win.displayId})`);
      win.webContents.send('recording:inputFieldToggle');
      // Don't focus to avoid switching macOS Spaces - overlay is already alwaysOnTop
    });

    // Also send to main window for React modal synchronization
    const mainWindow = allWindows.find((w: any) => !('displayId' in w));

    if (mainWindow) {
      console.log('[GlobalShortcuts] Main window found:', {
        id: mainWindow.id,
        isDestroyed: mainWindow.isDestroyed(),
        isVisible: mainWindow.isVisible(),
        title: mainWindow.getTitle()
      });
      mainWindow.webContents.send('recording:inputFieldToggle');
      console.log('[GlobalShortcuts] Sent inputFieldToggle to main window');
    } else {
      console.error('[GlobalShortcuts] CRITICAL: Main window NOT found! This will prevent React modal synchronization.');
      console.error('[GlobalShortcuts] All windows checked, none matched criteria: !("displayId" in window)');
    }
  });

  if (markRegistered) {
    console.log(`[GlobalShortcuts] Successfully registered ${markShortcut}`);
  } else {
    console.error(`[GlobalShortcuts] Failed to register ${markShortcut} (may be in use by another app)`);
  }
}

/**
 * Unregisters all global keyboard shortcuts
 * Should be called when the app is quitting
 */
export function unregisterGlobalShortcuts(): void {
  console.log('[GlobalShortcuts] Unregistering all global shortcuts...');
  globalShortcut.unregisterAll();
  console.log('[GlobalShortcuts] All global shortcuts unregistered');
}
