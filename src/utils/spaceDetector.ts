import { getDisplaySourceId } from './regionCapture';

export interface SpaceSwitchCallback {
  (newSourceId: string, newDisplayId: string): void | Promise<void>;
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
  private pollInterval: NodeJS.Timeout | null = null;
  private isActive: boolean = false;

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
    this.isActive = true;

    console.log('[SpaceDetector] Started with source:', initialSourceId, 'display:', initialDisplayId);

    // Poll for Space switches every 250ms
    // This provides good responsiveness while maintaining low CPU usage (~0.2-0.5%)
    this.pollInterval = setInterval(async () => {
      if (!this.isActive) return;

      try {
        const { sourceId, displayId } = await this.detectActiveDisplay();

        // Check if we've switched to a different source
        if (sourceId !== this.currentSourceId) {
          console.log('[SpaceDetector] 🔄 Space switch detected:', {
            from: this.currentSourceId,
            to: sourceId,
            displayId
          });

          this.currentSourceId = sourceId;
          this.currentDisplayId = displayId;

          // Trigger callback
          await onSwitch(sourceId, displayId);
        }
      } catch (error) {
        console.error('[SpaceDetector] Detection error:', error);
        // Continue polling even if one iteration fails
      }
    }, 250); // 250ms = 4 Hz polling frequency
  }

  /**
   * Detect which display is currently active based on cursor position
   * @returns The source ID and display ID of the active display
   */
  private async detectActiveDisplay(): Promise<{ sourceId: string; displayId: string }> {
    const displays = await window.electronAPI.screen.getAllDisplays();

    // Try to find display containing the cursor
    try {
      const cursorPoint = await window.electronAPI.screen.getCursorScreenPoint();

      // Check each display to see if cursor is within its bounds
      for (const display of displays) {
        if (this.containsPoint(display.bounds, cursorPoint)) {
          const sourceId = await getDisplaySourceId(display.id.toString());
          if (sourceId) {
            return { sourceId, displayId: display.id.toString() };
          }
        }
      }
    } catch (error) {
      console.warn('[SpaceDetector] Cursor detection failed, falling back to primary display:', error);
    }

    // Fallback to primary display (bounds.x === 0 && bounds.y === 0)
    const primary = displays.find(d => d.bounds.x === 0 && d.bounds.y === 0) || displays[0];
    const sourceId = await getDisplaySourceId(primary.id.toString());

    if (!sourceId) {
      throw new Error('No valid display source found');
    }

    return { sourceId, displayId: primary.id.toString() };
  }

  /**
   * Check if a point is contained within display bounds
   * @param bounds - Display bounds (x, y, width, height)
   * @param point - Point to check (x, y)
   * @returns true if point is within bounds
   */
  private containsPoint(
    bounds: { x: number; y: number; width: number; height: number },
    point: { x: number; y: number }
  ): boolean {
    return (
      point.x >= bounds.x &&
      point.x < bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y < bounds.y + bounds.height
    );
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
