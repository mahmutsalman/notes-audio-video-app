/**
 * FrameFreezeDetector - Detects when video frames freeze during recording
 *
 * Uses pixel hashing to detect when consecutive frames are identical,
 * indicating the video source has become inactive (e.g., macOS Space switch).
 *
 * @example
 * const detector = new FrameFreezeDetector();
 *
 * // In your frame capture loop:
 * if (detector.checkFrame(canvas)) {
 *   console.log('Freeze detected - source may be inactive');
 *   await refreshVideoSource();
 *   detector.reset();
 * }
 */
export class FrameFreezeDetector {
  private lastFrameHash: string | null = null;
  private frozenFrameCount: number = 0;
  private readonly FREEZE_THRESHOLD = 10; // 10 identical frames (~2.5s at 4Hz check rate)
  private sampleRate: number = 1000; // Sample every 1000th pixel for performance

  /**
   * Check if the current frame is frozen (identical to previous frames)
   * @param canvas - The canvas element containing the current frame
   * @returns true if freeze detected (threshold reached), false otherwise
   */
  checkFrame(canvas: HTMLCanvasElement): boolean {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;

    // Sample pixels from the canvas
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hash = this.hashPixelData(imageData.data);

    if (hash === this.lastFrameHash) {
      this.frozenFrameCount++;

      if (this.frozenFrameCount >= this.FREEZE_THRESHOLD) {
        console.warn('[FrameFreezeDetector] 🧊 FREEZE DETECTED after', this.frozenFrameCount, 'identical frames');
        this.frozenFrameCount = 0; // Reset to avoid spam
        return true;
      }
    } else {
      if (this.frozenFrameCount > 0) {
        console.log('[FrameFreezeDetector] ✅ Frames resuming after', this.frozenFrameCount, 'frozen');
      }
      this.frozenFrameCount = 0;
    }

    this.lastFrameHash = hash;
    return false;
  }

  /**
   * Hash pixel data for efficient frame comparison
   * Samples every Nth pixel to balance accuracy with performance
   * @param data - RGBA pixel data from canvas
   * @returns Hash string representing the frame
   */
  private hashPixelData(data: Uint8ClampedArray): string {
    let hash = 0;
    for (let i = 0; i < data.length; i += this.sampleRate) {
      hash = ((hash << 5) - hash) + data[i];
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
  }

  /**
   * Check if frames are potentially frozen (approaching threshold)
   * Used to conditionally disable canvas marker to allow freeze detection
   * @returns true if 3+ consecutive frozen frames detected (~750ms at 4Hz)
   */
  isPotentiallyFrozen(): boolean {
    return this.frozenFrameCount >= 3;
  }

  /**
   * Reset the detector state
   * Call this after successfully recovering from a freeze
   */
  reset(): void {
    this.lastFrameHash = null;
    this.frozenFrameCount = 0;
  }
}
