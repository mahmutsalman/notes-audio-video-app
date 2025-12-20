import type { CaptureArea } from '../types';

export interface CroppedStreamResult {
  stream: MediaStream;
  cleanup: () => void;
}

/**
 * Creates a cropped video stream from a full screen capture
 * Uses canvas to crop frames in real-time
 */
export async function createCroppedStream(
  sourceId: string,
  region: CaptureArea,
  fps: number
): Promise<CroppedStreamResult> {
  // 1. Get full screen stream
  const fullStream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
      } as any,
    } as any,
  });

  // 2. Create canvas for cropping
  // Account for display scale factor (e.g., 2x on Retina displays)
  const scaleFactor = region.scaleFactor || 1;
  console.log('[regionCapture] Scale factor:', scaleFactor);
  console.log('[regionCapture] CSS region:', region.width, 'x', region.height);
  console.log('[regionCapture] Physical canvas:', region.width * scaleFactor, 'x', region.height * scaleFactor);

  const canvas = document.createElement('canvas');
  canvas.width = region.width * scaleFactor;
  canvas.height = region.height * scaleFactor;
  const ctx = canvas.getContext('2d', { alpha: false });

  if (!ctx) {
    fullStream.getTracks().forEach((track) => track.stop());
    throw new Error('Failed to get canvas 2D context');
  }

  // 3. Create video element to display the stream
  const video = document.createElement('video');
  video.srcObject = fullStream;
  video.autoplay = true;
  video.muted = true;

  // Wait for video to be ready
  await new Promise<void>((resolve) => {
    video.onloadedmetadata = () => {
      video.play();
      resolve();
    };
  });

  // 4. Draw cropped frames to canvas continuously
  let animationFrameId: number | null = null;
  let lastFrameTime = 0;
  const frameInterval = 1000 / fps; // milliseconds per frame

  const drawFrame = (timestamp: number) => {
    // Throttle to target FPS
    if (timestamp - lastFrameTime >= frameInterval) {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw cropped region from video
      // Scale coordinates to match physical pixels on HiDPI displays
      ctx.drawImage(
        video,
        region.x * scaleFactor,
        region.y * scaleFactor,
        region.width * scaleFactor,
        region.height * scaleFactor, // Source rectangle (physical pixels)
        0,
        0,
        canvas.width,
        canvas.height // Destination rectangle
      );

      lastFrameTime = timestamp;
    }

    animationFrameId = requestAnimationFrame(drawFrame);
  };

  // Start drawing frames
  animationFrameId = requestAnimationFrame(drawFrame);

  // 5. Capture canvas stream
  const croppedStream = canvas.captureStream(fps);

  // 6. Cleanup function
  const cleanup = () => {
    // Stop animation
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    // Stop full stream
    fullStream.getTracks().forEach((track) => track.stop());

    // Stop cropped stream
    croppedStream.getTracks().forEach((track) => track.stop());

    // Remove video element
    video.srcObject = null;
    video.remove();

    // Remove canvas
    canvas.remove();
  };

  return {
    stream: croppedStream,
    cleanup,
  };
}

/**
 * Gets the display source ID for a specific display
 * Uses desktopCapturer to find the screen source
 */
export async function getDisplaySourceId(displayId: string): Promise<string | null> {
  try {
    const sources = await window.electronAPI.screenRecording.getSources();

    // Try to find a screen source that matches the display
    // Display IDs from Electron's screen module are different from desktopCapturer IDs
    // So we'll use the first screen source as a fallback
    const screenSources = sources.filter((s) => s.name.toLowerCase().includes('screen'));

    if (screenSources.length === 0) {
      return null;
    }

    // For now, return the first screen source
    // In a more sophisticated implementation, we could try to match by display bounds
    return screenSources[0].id;
  } catch (error) {
    console.error('Failed to get display source ID:', error);
    return null;
  }
}

/**
 * Calculate bitrate for video encoding based on region size and FPS
 * Note: width and height should already be scaled for HiDPI displays
 */
export function calculateBitrate(width: number, height: number, fps: number): number {
  const pixelCount = width * height;
  // Base formula: 0.1 bits per pixel, adjusted for FPS
  const baseBitrate = pixelCount * 0.1 * (fps / 30);
  // Add 50% overhead for better quality
  return Math.round(baseBitrate * 1.5);
}
