/**
 * ScreenCaptureKit Renderer API
 *
 * Uses Apple's native ScreenCaptureKit framework for screen recording.
 * Solves the frame freeze issue when switching macOS Spaces.
 *
 * Requirements: macOS 12.3+
 */

export interface ScreenCaptureKitRegion {
  displayId: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function createScreenCaptureKitStream(
  region: ScreenCaptureKitRegion,
  fps: number,
  targetWidth: number,
  targetHeight: number,
  displayWidth: number,
  displayHeight: number
): Promise<{
  stream: MediaStream;
  cleanup: () => void;
}> {
  console.log('[ScreenCaptureKit] Creating capture stream', {
    region,
    fps,
    target: { width: targetWidth, height: targetHeight },
    display: { width: displayWidth, height: displayHeight }
  });

  // Verify ScreenCaptureKit API is available
  if (!window.electronAPI?.screenCaptureKit) {
    throw new Error('ScreenCaptureKit API not available. Requires macOS 12.3+');
  }

  // Create canvas to receive frames from main process
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  if (!ctx) {
    throw new Error('Failed to get 2D context from canvas');
  }

  // Create offscreen canvas for frame processing
  const offscreenCanvas = document.createElement('canvas');
  const offscreenCtx = offscreenCanvas.getContext('2d');
  if (!offscreenCtx) {
    throw new Error('Failed to get 2D context from offscreen canvas');
  }

  // Create canvas stream
  const stream = canvas.captureStream(0);
  const videoTrack = stream.getVideoTracks()[0];

  if (!videoTrack) {
    throw new Error('Failed to get video track from canvas stream');
  }

  console.log('[ScreenCaptureKit] Canvas stream created, starting native capture');

  // Start native capture with full display dimensions
  const result = await window.electronAPI.screenCaptureKit.startCapture({
    displayId: region.displayId,
    width: displayWidth,
    height: displayHeight,
    frameRate: fps
  });

  if (!result.success) {
    throw new Error(`Failed to start ScreenCaptureKit: ${result.error || 'Unknown error'}`);
  }

  console.log('[ScreenCaptureKit] ✅ Native capture started successfully');

  // Handle frames from main process
  window.electronAPI.screenCaptureKit.onFrame(({ buffer, width, height }) => {
    try {
      // Create ImageData from buffer
      offscreenCanvas.width = width;
      offscreenCanvas.height = height;

      const imageData = new ImageData(
        new Uint8ClampedArray(buffer),
        width,
        height
      );

      offscreenCtx.putImageData(imageData, 0, 0);

      // Crop and scale to target region
      ctx.clearRect(0, 0, targetWidth, targetHeight);
      ctx.drawImage(
        offscreenCanvas,
        region.x, region.y, region.width, region.height,
        0, 0, targetWidth, targetHeight
      );

      // Request frame capture
      (videoTrack as any).requestFrame();
    } catch (error) {
      console.error('[ScreenCaptureKit] Error processing frame:', error);
    }
  });

  // Handle errors from main process
  window.electronAPI.screenCaptureKit.onError((error) => {
    console.error('[ScreenCaptureKit] ❌ Native capture error:', error);
  });

  const cleanup = () => {
    console.log('[ScreenCaptureKit] Cleaning up capture');
    window.electronAPI.screenCaptureKit.stopCapture();
    window.electronAPI.screenCaptureKit.removeAllListeners();
    canvas.remove();
    offscreenCanvas.remove();
  };

  return { stream, cleanup };
}

/**
 * Check if ScreenCaptureKit is available on this system
 */
export function isScreenCaptureKitAvailable(): boolean {
  return typeof window.electronAPI?.screenCaptureKit !== 'undefined';
}
