import type { CaptureArea } from '../types';

export interface CroppedStreamResult {
  stream: MediaStream;
  cleanup: () => void;
}

/**
 * Creates a cropped video stream from a full screen capture
 * Uses canvas to crop frames in real-time
 * @param sourceId - The desktop capturer source ID
 * @param region - The capture area with coordinates and scale factor
 * @param fps - Target frames per second
 * @param targetDimensions - Optional target dimensions for quality scaling (Phase 5)
 */
export async function createCroppedStream(
  sourceId: string,
  region: CaptureArea,
  fps: number,
  targetDimensions?: { width: number; height: number }
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

  // Determine canvas dimensions (use target dimensions if provided, otherwise use physical pixels)
  const canvasWidth = targetDimensions?.width ?? (region.width * scaleFactor);
  const canvasHeight = targetDimensions?.height ?? (region.height * scaleFactor);
  console.log('[regionCapture] Canvas dimensions:', canvasWidth, 'x', canvasHeight);

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d', {
    alpha: false,
    // DO NOT use desynchronized: true - causes severe frame dropping
    willReadFrequently: false  // Optimize for infrequent reads
  });

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
  // Use requestAnimationFrame with forced change detection
  let animationFrameId: number | null = null;
  const frameInterval = 1000 / fps; // milliseconds per frame
  let lastFrameTime = 0; // Initialize to 0 - will be set on first frame
  let frameCount = 0;

  console.log('[regionCapture] Frame interval:', frameInterval, 'ms for', fps, 'FPS');

  const drawFrame = (timestamp: number) => {
    // Calculate if enough time has passed for next frame
    const elapsed = timestamp - lastFrameTime;

    if (elapsed >= frameInterval) {
      lastFrameTime = timestamp;
      frameCount++;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw cropped region from video
      ctx.drawImage(
        video,
        region.x * scaleFactor,
        region.y * scaleFactor,
        region.width * scaleFactor,
        region.height * scaleFactor,
        0,
        0,
        canvas.width,
        canvas.height
      );

      // CRITICAL: Force browser to detect change by drawing a unique marker
      // Without this, Chromium's captureStream change detection fails
      // Draw a 1x1 pixel at rotating position (invisible but forces detection)
      const markerX = frameCount % canvas.width;
      const markerY = Math.floor(frameCount / canvas.width) % canvas.height;
      ctx.fillStyle = `rgba(0, 0, 0, 0.003)`; // Nearly transparent
      ctx.fillRect(markerX, markerY, 1, 1);

      console.log('[regionCapture] Frame', frameCount, 'drawn at', timestamp.toFixed(2), 'ms');
    }

    // Continue animation loop
    animationFrameId = window.requestAnimationFrame(drawFrame);
  };

  // 5. CRITICAL: Draw first frame BEFORE creating stream
  // This ensures canvas has content when captureStream() is called
  console.log('[regionCapture] Drawing initial frame before captureStream');
  ctx.drawImage(
    video,
    region.x * scaleFactor,
    region.y * scaleFactor,
    region.width * scaleFactor,
    region.height * scaleFactor,
    0,
    0,
    canvas.width,
    canvas.height
  );

  // 6. Capture canvas stream at 0 FPS (manual control)
  // captureStream(fps) is broken in Chromium/Electron - use manual requestFrame() instead
  // See: https://github.com/w3c/mediacapture-fromelement/issues/43
  console.log('[regionCapture] Creating canvas stream with manual frame control (0 FPS)');
  const croppedStream = canvas.captureStream(0); // 0 = manual control
  console.log('[regionCapture] Canvas stream created');

  // Get the video track for manual frame requests
  const [videoTrack] = croppedStream.getVideoTracks();
  if (!videoTrack || !(videoTrack as any).requestFrame) {
    throw new Error('CanvasCaptureMediaStreamTrack.requestFrame() not supported');
  }
  console.log('[regionCapture] Video track supports requestFrame:', !!(videoTrack as any).requestFrame);

  // 7. Start requestAnimationFrame loop with MANUAL frame capture
  // We draw to canvas AND explicitly request frame capture each time
  const startTime = performance.now();
  const drawFrameWithCapture = (timestamp: number) => {
    // On first frame, initialize lastFrameTime
    if (lastFrameTime === 0) {
      lastFrameTime = timestamp;
      console.log('[regionCapture] First frame callback at', timestamp.toFixed(2), 'ms');
    }

    const elapsed = timestamp - lastFrameTime;

    // Debug logging for timing issues
    if (frameCount < 5 || frameCount % 10 === 0) {
      console.log(`[regionCapture] rAF callback: timestamp=${timestamp.toFixed(2)}ms, lastFrameTime=${lastFrameTime.toFixed(2)}ms, elapsed=${elapsed.toFixed(2)}ms, target=${frameInterval.toFixed(2)}ms, should_capture=${elapsed >= frameInterval}`);
    }

    if (elapsed >= frameInterval) {
      lastFrameTime = timestamp;
      frameCount++;

      // Draw to canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(
        video,
        region.x * scaleFactor,
        region.y * scaleFactor,
        region.width * scaleFactor,
        region.height * scaleFactor,
        0,
        0,
        canvas.width,
        canvas.height
      );

      // CRITICAL: Manually request frame capture
      // This is the only reliable way to capture frames in Chromium/Electron
      (videoTrack as any).requestFrame();

      const elapsedTotal = (timestamp - startTime) / 1000;
      const expectedFrames = Math.floor(elapsedTotal * fps);
      console.log(`[regionCapture] ✅ Frame ${frameCount} captured (expected: ~${expectedFrames}, actual FPS: ${(frameCount / elapsedTotal).toFixed(2)})`);
    }

    animationFrameId = window.requestAnimationFrame(drawFrameWithCapture);
  };

  console.log('[regionCapture] Starting requestAnimationFrame loop with manual capture for', fps, 'FPS');
  animationFrameId = window.requestAnimationFrame(drawFrameWithCapture);

  // 8. Cleanup function
  const cleanup = () => {
    // Stop animation frame loop
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
 * @param bitsPerPixel - Quality level (0.04=economy, 0.05=standard, 0.08=high/CleanShot X, 0.10=premium)
 */
export function calculateBitrate(
  width: number,
  height: number,
  fps: number,
  bitsPerPixel: number = 0.18  // Default to CleanShot X quality
): number {
  const pixelCount = width * height;

  // Correct formula: bitrate = pixels × frames/sec × bits/pixel
  // This matches OBS and professional recording standards
  // Example: 854×480 @ 10fps with 0.04 bpp = 410 kbps (economy quality)
  const baseBitrate = pixelCount * fps * bitsPerPixel;

  return Math.round(baseBitrate);
}
