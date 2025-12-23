export interface SpaceSwitchCallback {
  (newSourceId: string, newDisplayId: string, force?: boolean): void | Promise<void>;
}

/**
 * SpaceDetector - Detects when user switches between macOS Spaces/Desktops
 *
 * Uses cursor position polling to detect which display/Space is currently active.
 * When a switch is detected, it triggers a callback with the new source ID.
 *
 * @example
 * const detector = new SpaceDetector();
 * await detector.start(initialSourceId, initialDisplayId, async (newSourceId) => {
 *   console.log('Switched to:', newSourceId);
 *   await updateVideoSource(newSourceId);
 * });
 *
 * // Later...
 * detector.stop();
 */
export class SpaceDetector {
  private currentSourceId: string | null = null;
  private currentDisplayId: string | null = null;
  private recordedDisplayId: string | null = null; // Track which display we're recording
  private pollInterval: NodeJS.Timeout | null = null;
  private isActive: boolean = false;
  private lastWindowCount: number = 0; // Track window count for Space transition detection
  private consecutiveSameSourceCount: number = 0; // Track consecutive same-source detections
  private onSwitch: SpaceSwitchCallback = () => {}; // Store callback for use in methods

  /**
   * Start detecting Space switches
   * @param initialSourceId - The initial desktopCapturer source ID (e.g., "screen:0:0")
   * @param initialDisplayId - The initial display ID from Electron's screen module
   * @param onSwitch - Callback triggered when Space switch detected
   */
  async start(
    initialSourceId: string,
    initialDisplayId: string,
    onSwitch: SpaceSwitchCallback
  ): Promise<void> {
    if (this.isActive) {
      console.warn('[SpaceDetector] Already active, stopping previous instance');
      this.stop();
    }

    this.currentSourceId = initialSourceId;
    this.currentDisplayId = initialDisplayId;
    this.recordedDisplayId = initialDisplayId; // Store which display we're monitoring
    this.onSwitch = onSwitch; // Store callback for use in polling loop
    this.isActive = true;

    console.log('[SpaceDetector] ===== STARTING SPACE DETECTOR =====');
    console.log('[SpaceDetector] Initial source:', initialSourceId);
    console.log('[SpaceDetector] Initial display:', initialDisplayId);
    console.log('[SpaceDetector] Recorded display:', this.recordedDisplayId);

    // DIAGNOSTIC: Test getSources() immediately to verify it works
    try {
      const testSources = await window.electronAPI.screenRecording.getSources();
      console.log('[SpaceDetector] ✅ getSources() test SUCCESSFUL, found', testSources.length, 'sources');
      console.log('[SpaceDetector] Test sources:', testSources.map((s: any) => s.id));
    } catch (error) {
      console.error('[SpaceDetector] ❌ getSources() test FAILED:', error);
      console.error('[SpaceDetector] Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
    }

    console.log('[SpaceDetector] Starting poll interval...');

    // Poll for Space switches every 250ms
    // This provides good responsiveness while maintaining low CPU usage (~0.2-0.5%)
    this.pollInterval = setInterval(async () => {
      if (!this.isActive) return;

      try {
        const { sourceId, displayId } = await this.detectActiveDisplay();

        // Check for Space transition even if source ID unchanged
        const spaceTransition = await this.detectSpaceTransition();

        // Check if we've switched to a different source
        if (sourceId !== this.currentSourceId) {
          // Normal source change detected
          console.log('[SpaceDetector] 🔄 Source changed:', this.currentSourceId, '→', sourceId);
          this.currentSourceId = sourceId;
          this.currentDisplayId = displayId;
          this.consecutiveSameSourceCount = 0;

          // Trigger callback
          await this.onSwitch(sourceId, displayId);
        } else if (spaceTransition) {
          // Space transition detected via window list change (same source ID)
          console.log('[SpaceDetector] 🔄 Space transition detected (same source, window count changed)');
          this.consecutiveSameSourceCount++;

          // Force refresh after detecting Space transition
          if (this.consecutiveSameSourceCount >= 1) {
            await this.onSwitch(sourceId, displayId, true); // Pass force flag
          }
        } else {
          // No change detected
          this.consecutiveSameSourceCount = 0;
        }
      } catch (error) {
        // CRITICAL: Log errors with full details instead of swallowing them
        console.error('[SpaceDetector] ❌ Poll error:', error);
        console.error('[SpaceDetector] Error details:', {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          currentSourceId: this.currentSourceId,
          recordedDisplayId: this.recordedDisplayId
        });
        // Continue polling even if one iteration fails
      }
    }, 100); // 100ms = 10 Hz polling frequency (faster detection)
  }

  /**
   * Detect Space transition by monitoring window list changes
   * When user switches to a different Space, the available windows change significantly
   * @returns true if a Space transition is detected (window count changed by >3)
   */
  private async detectSpaceTransition(): Promise<boolean> {
    try {
      // Get all sources including windows
      const allSources = await window.electronAPI.screenRecording.getSources();
      const windowCount = allSources.filter((s: any) => s.id.startsWith('window:')).length;

      // Detect significant window list change (indicates Space switch)
      const windowCountChanged = Math.abs(windowCount - this.lastWindowCount) > 3;
      this.lastWindowCount = windowCount;

      if (windowCountChanged) {
        console.log('[SpaceDetector] 🔄 Space transition detected via window count change');
      }

      return windowCountChanged;
    } catch (error) {
      console.error('[SpaceDetector] Error detecting Space transition:', error);
      return false;
    }
  }

  /**
   * Get sources matching the recorded display
   * Uses system enumeration order to match display ID to source
   * @param displayId - The display ID to find sources for
   * @param allScreenSources - All available screen sources from desktopCapturer
   * @returns Array of sources for this display (usually 1 element)
   */
  private async getSourcesForDisplay(
    displayId: string,
    allScreenSources: any[]
  ): Promise<any[]> {
    const displays = await window.electronAPI.screen.getAllDisplays();
    const displayIndex = displays.findIndex((d: any) => d.id.toString() === displayId);

    if (displayIndex === -1) {
      console.warn('[SpaceDetector] Display not found:', displayId);
      return [];
    }

    // Strategy: Match by enumeration order (most reliable)
    // Both screen.getAllDisplays() and desktopCapturer.getSources() return displays
    // in the SAME system enumeration order (NOT position order)
    if (displayIndex < allScreenSources.length) {
      const source = allScreenSources[displayIndex];
      console.log('[SpaceDetector] Matched display', displayId, 'to source', source.id, 'via index', displayIndex);
      return [source];
    }

    console.warn('[SpaceDetector] No source found at index', displayIndex, 'for display', displayId);
    return [];
  }

  /**
   * Detect which source is currently active for the recorded display
   * Uses source polling instead of cursor position to detect Space switches
   * @returns The source ID and display ID of the active source
   */
  private async detectActiveDisplay(): Promise<{ sourceId: string; displayId: string }> {
    // Get current screen sources from desktopCapturer
    // This is the KEY change: polling sources instead of cursor position
    // macOS returns different sources for different Spaces on the SAME display
    const allSources = await window.electronAPI.screenRecording.getSources();
    const screenSources = allSources.filter((s: any) => s.id.startsWith('screen:'));

    console.log('[SpaceDetector] Polled sources:', screenSources.map((s: any) => s.id));

    if (!this.recordedDisplayId) {
      throw new Error('[SpaceDetector] recordedDisplayId not set - call start() first');
    }

    // Find sources matching our recorded display using enumeration order
    const displaySources = await this.getSourcesForDisplay(this.recordedDisplayId, screenSources);

    if (displaySources.length === 0) {
      // This shouldn't happen in normal operation
      console.error('[SpaceDetector] No sources found for display:', this.recordedDisplayId);

      // Fallback: return last known source to avoid crash
      if (this.currentSourceId) {
        console.warn('[SpaceDetector] Using last known source:', this.currentSourceId);
        return {
          sourceId: this.currentSourceId,
          displayId: this.recordedDisplayId
        };
      }

      // Last resort: use first available source
      if (screenSources.length > 0) {
        console.warn('[SpaceDetector] Using first available source:', screenSources[0].id);
        return {
          sourceId: screenSources[0].id,
          displayId: this.recordedDisplayId
        };
      }

      throw new Error('No valid display source found');
    }

    // Return the first (and usually only) source for this display
    const currentSource = displaySources[0];

    // Log source change detection
    if (currentSource.id !== this.currentSourceId) {
      console.log('[SpaceDetector] 🎯 Source changed on display', this.recordedDisplayId);
      console.log('[SpaceDetector]   From:', this.currentSourceId, '→ To:', currentSource.id);
    }

    return {
      sourceId: currentSource.id,
      displayId: this.recordedDisplayId
    };
  }

  /**
   * Stop detecting Space switches and cleanup
   */
  stop(): void {
    this.isActive = false;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    console.log('[SpaceDetector] Stopped');
  }

  /**
   * Get the currently active source ID
   * @returns Current source ID or null if not started
   */
  getCurrentSourceId(): string | null {
    return this.currentSourceId;
  }

  /**
   * Get the currently active display ID
   * @returns Current display ID or null if not started
   */
  getCurrentDisplayId(): string | null {
    return this.currentDisplayId;
  }

  /**
   * Check if detector is currently active
   * @returns true if detector is running
   */
  isRunning(): boolean {
    return this.isActive;
  }
}
