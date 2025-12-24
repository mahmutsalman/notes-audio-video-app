/**
 * ScreenCaptureKit Renderer API - File-Based Recording with AVAssetWriter
 *
 * Uses Apple's native ScreenCaptureKit framework with hardware H.264 encoding.
 * Eliminates IPC overhead and memory leaks by recording directly to file.
 *
 * Architecture:
 * - ScreenCaptureKit → AVAssetWriter (Hardware Encoder) → .mov File
 * - Zero CPU copies, all processing stays in GPU
 * - Memory usage: ~600MB for 1 hour (vs 5GB for 20 seconds with old approach)
 *
 * Requirements: macOS 12.3+
 */

export interface ScreenCaptureKitRegion {
  displayId: number;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor?: number;
  recordingId?: number; // Optional recording ID for folder organization
}

export async function createScreenCaptureKitStream(
  region: ScreenCaptureKitRegion,
  fps: number,
  targetWidth: number,
  targetHeight: number,
  displayWidth: number,
  displayHeight: number,
  outputPath?: string
): Promise<{
  filePath: Promise<string>;
  cleanup: () => void;
}> {
  console.log('[ScreenCaptureKit] Starting file-based recording with AVAssetWriter', {
    region,
    fps,
    target: { width: targetWidth, height: targetHeight },
    display: { width: displayWidth, height: displayHeight },
    outputPath
  });

  // Verify ScreenCaptureKit API is available
  if (!window.electronAPI?.screenCaptureKit) {
    throw new Error('ScreenCaptureKit API not available. Requires macOS 12.3+');
  }

  // Start native capture with file output
  const result = await window.electronAPI.screenCaptureKit.startCapture({
    displayId: region.displayId,
    width: displayWidth,
    height: displayHeight,
    frameRate: fps,
    recordingId: region.recordingId, // Pass recordingId for folder organization
    regionX: region.x,
    regionY: region.y,
    regionWidth: region.width,
    regionHeight: region.height,
    scaleFactor: region.scaleFactor,
    outputPath
  });

  if (!result.success) {
    throw new Error(`Failed to start ScreenCaptureKit: ${result.error || 'Unknown error'}`);
  }

  console.log('[ScreenCaptureKit] ✅ File-based capture started with hardware encoding');

  // Return promise that resolves when recording completes
  const filePathPromise = new Promise<string>((resolve, reject) => {
    window.electronAPI.screenCaptureKit.onComplete(({ filePath }: { filePath: string }) => {
      console.log('[ScreenCaptureKit] Recording completed:', filePath);
      resolve(filePath);
    });

    window.electronAPI.screenCaptureKit.onError(({ error }: { error: string }) => {
      console.error('[ScreenCaptureKit] Recording error:', error);
      reject(new Error(error));
    });
  });

  const cleanup = () => {
    console.log('[ScreenCaptureKit] Stopping capture');
    window.electronAPI.screenCaptureKit.stopCapture();
    window.electronAPI.screenCaptureKit.removeAllListeners();
  };

  return { filePath: filePathPromise, cleanup };
}

/**
 * Check if ScreenCaptureKit is available on this system
 */
export function isScreenCaptureKitAvailable(): boolean {
  return typeof window.electronAPI?.screenCaptureKit !== 'undefined';
}
