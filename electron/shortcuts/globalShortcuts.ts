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

    // Broadcast input field toggle to all windows (both React main window and overlays)
    const allWindows = BrowserWindow.getAllWindows();
    console.log(`[GlobalShortcuts] Broadcasting inputFieldToggle to ${allWindows.length} windows`);

    allWindows.forEach(win => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('recording:inputFieldToggle');
      }
    });
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
