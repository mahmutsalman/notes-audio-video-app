import { globalShortcut, BrowserWindow } from 'electron';
import { createRegionSelectorWindows, regionSelectorWindows } from '../windows/regionSelector';
import { SettingsOperations } from '../database/operations';

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

// ---- OBS F10 shortcut (registered dynamically when OBS is enabled) ----

async function handleF10(): Promise<void> {
  console.log('[F10] Key pressed');

  const obsEnabled = SettingsOperations.get('obs_enabled') === 'true';
  console.log('[F10] obs_enabled setting:', obsEnabled);
  if (!obsEnabled) {
    console.log('[F10] OBS integration disabled — ignoring');
    return;
  }

  const { obsService } = await import('../services/obsService');
  const status = obsService.getStatus();
  console.log('[F10] OBS status:', JSON.stringify(status));

  if (!status.isConnected) {
    console.log('[F10] OBS not connected — ignoring');
    return;
  }

  if (!status.isRecording) {
    // If the overlay is still visible, OBS stopped/disconnected while paused (e.g. user was away).
    // Dismiss the stale overlay instead of starting a fresh recording.
    const { getOverlayWindow, hideObsMarkOverlay } = await import('../windows/obsMarkOverlay');
    const overlay = getOverlayWindow();
    if (overlay && !overlay.isDestroyed() && overlay.isVisible()) {
      console.log('[F10] Overlay visible but OBS not recording — dismissing stale overlay');
      hideObsMarkOverlay();
      return;
    }
    console.log('[F10] → StartRecord');
    await obsService.startRecording();
  } else if (!status.isPaused) {
    console.log('[F10] → PauseRecord');
    await obsService.pauseRecording();
    // overlay stays hidden — user must press F9 explicitly to open it
  } else {
    // Paused → resume without creating a mark.
    // Marks are created explicitly from the F9 overlay ("Create Mark" button / Enter).
    // lastResumeTimecode is NOT advanced here — only when the user explicitly creates a mark.
    console.log('[F10] → ResumeRecord (no mark created)');
    obsService.currentMarkCaption = '';
    await obsService.resumeRecording();
    // overlay hides via 'resumed' event
  }
}

async function handleF9(): Promise<void> {
  console.log('[F9] Key pressed');

  const obsEnabled = SettingsOperations.get('obs_enabled') === 'true';
  if (!obsEnabled) return;

  const { obsService } = await import('../services/obsService');
  const status = obsService.getStatus();

  if (!status.isConnected || !status.isPaused) {
    console.log('[F9] OBS not paused — ignoring');
    return;
  }

  const { toggleObsMarkOverlay } = await import('../windows/obsMarkOverlay');
  const { ObsStagedMarksOperations } = await import('../database/operations');

  const savedMarks = ObsStagedMarksOperations.getAll();

  // Always include the current pending mark (not yet in DB) so the user can see it in the list
  const pendingMark = {
    id: 0,           // 0 = sentinel for "unsaved"
    start_time: obsService.lastResumeTimecode,
    end_time: obsService.pauseTimecode,
    caption: obsService.currentMarkCaption,
    sort_order: savedMarks.length,
    isPending: true,
  };

  toggleObsMarkOverlay(
    obsService.pauseTimecode,
    savedMarks.length,       // markCount = saved marks only (drives "Mark #N" label)
    [...savedMarks, pendingMark],
    obsService.currentMarkCaption
  );
}

export function registerObsShortcut(): boolean {
  if (globalShortcut.isRegistered('F10')) {
    console.log('[GlobalShortcuts] F10 already registered');
    return true;
  }

  const f10 = globalShortcut.register('F10', () => {
    handleF10().catch(err => console.error('[F10] Error in handler:', err));
  });
  if (f10) {
    console.log('[GlobalShortcuts] ✅ F10 registered');
  } else {
    console.error('[GlobalShortcuts] ❌ Failed to register F10');
  }

  const f9 = globalShortcut.register('F9', () => {
    handleF9().catch(err => console.error('[F9] Error in handler:', err));
  });
  if (f9) {
    console.log('[GlobalShortcuts] ✅ F9 registered — press F9 to toggle caption overlay');
  } else {
    console.error('[GlobalShortcuts] ❌ Failed to register F9');
  }

  return f10;
}

export function unregisterObsShortcut(): void {
  globalShortcut.unregister('F10');
  globalShortcut.unregister('F9');
  console.log('[GlobalShortcuts] F10 + F9 unregistered');
}
