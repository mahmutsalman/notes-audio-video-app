import { globalShortcut } from 'electron';
import { createRegionSelectorWindows, regionSelectorWindows } from '../windows/regionSelector';

/**
 * Registers global keyboard shortcuts for the application
 * Currently registers Cmd+D (macOS) / Ctrl+D (Windows/Linux) for region selection
 */
export function registerGlobalShortcuts(): void {
  console.log('[GlobalShortcuts] Registering global shortcuts...');

  // Register Cmd+D (macOS) / Ctrl+D (Windows/Linux) for region selection
  const shortcut = 'CommandOrControl+D';
  const registered = globalShortcut.register(shortcut, () => {
    console.log(`[GlobalShortcuts] ${shortcut} pressed`);

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

  if (registered) {
    console.log(`[GlobalShortcuts] Successfully registered ${shortcut}`);
  } else {
    console.error(`[GlobalShortcuts] Failed to register ${shortcut} (may be in use by another app)`);
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
