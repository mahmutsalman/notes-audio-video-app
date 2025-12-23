import type { CaptureArea } from '../types';

export interface CroppedStreamResult {
  stream: MediaStream;
  cleanup: () => void;
  updateSource: (newSourceId: string) => Promise<void>;
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
  let currentSourceId = sourceId;
  let fullStream: MediaStream;
  let video: HTMLVideoElement;
  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  let croppedStream: MediaStream;
  let videoTrack: MediaStreamTrack;
  let animationFrameId: number | null = null;
  let isCleanedUp = false;

  // Account for display scale factor (e.g., 2x on Retina displays)
  const scaleFactor = region.scaleFactor || 1;

  // Determine canvas dimensions (use target dimensions if provided, otherwise use physical pixels)
  const canvasWidth = targetDimensions?.width ?? (region.width * scaleFactor);
  const canvasHeight = targetDimensions?.height ?? (region.height * scaleFactor);

  /**
   * Helper: Initialize or update the MediaStream source
   * This can be called on initial setup or when switching Spaces
   */
  const initializeStream = async (newSourceId: string): Promise<void> => {
    console.log('[RegionCapture] Initializing stream for source:', newSourceId);

    // Stop old stream if exists
    if (fullStream) {
      fullStream.getTracks().forEach((track) => track.stop());
    }

    // Create new stream with new source ID
    fullStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: newSourceId,
        } as any,
      } as any,
    });

    // Update video element source
    video.srcObject = fullStream;

    // Wait for video to be ready with timeout protection
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Video play timeout after 5s'));
      }, 5000);

      video.onloadedmetadata = async () => {
        try {
          await video.play();
          clearTimeout(timeout);

          // CRITICAL: Wait for video to actually have buffered frame data
          // This prevents drawing frozen frames after source switch
          await new Promise<void>(res => {
            const checkReady = () => {
              if (video.readyState >= video.HAVE_CURRENT_DATA) {
                console.log(`[RegionCapture] ✅ Video ready (readyState: ${video.readyState})`);
                res();
              } else {
                setTimeout(checkReady, 50);
              }
            };
            checkReady();
          });

          resolve();
        } catch (error) {
          clearTimeout(timeout);
          console.error('[RegionCapture] Video play failed:', error);
          reject(error);
        }
      };
    });

    // Add event listeners for video state monitoring (helps debug Space switching issues)
    video.addEventListener('canplay', () => {
      console.log('[RegionCapture] ▶️  Video can play - buffered enough data');
    });

    video.addEventListener('waiting', () => {
      console.log('[RegionCapture] ⏸️  Video waiting for data - buffering...');
    });

    video.addEventListener('playing', () => {
      console.log('[RegionCapture] ▶️  Video playing');
    });

    // Draw first frame immediately to avoid blank frame
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

    // Request first frame
    (videoTrack as any).requestFrame();

    console.log('[RegionCapture] ✅ Stream initialized for source:', newSourceId);
  };

  // 1. Create canvas for cropping
  canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  ctx = canvas.getContext('2d', {
    alpha: false,
    // DO NOT use desynchronized: true - causes severe frame dropping
    willReadFrequently: false  // Optimize for infrequent reads
  })!;

  if (!ctx) {
    throw new Error('Failed to get canvas 2D context');
  }

  // 2. Create video element to display the stream
  video = document.createElement('video');
  video.autoplay = true;
  video.muted = true;

  // 3. Capture canvas stream at 0 FPS (manual control)
  // captureStream(fps) is broken in Chromium/Electron - use manual requestFrame() instead
  // IMPORTANT: Must be created BEFORE initializeStream so videoTrack is available
  croppedStream = canvas.captureStream(0); // 0 = manual control

  // Get the video track for manual frame requests
  videoTrack = croppedStream.getVideoTracks()[0];
  if (!videoTrack || !(videoTrack as any).requestFrame) {
    throw new Error('CanvasCaptureMediaStreamTrack.requestFrame() not supported');
  }

  // 4. Initialize first stream (now videoTrack is available)
  await initializeStream(currentSourceId);

  // 5. Setup frame capture variables
  const frameInterval = 1000 / fps; // milliseconds per frame
  let lastFrameTime = 0; // Initialize to 0 - will be set on first frame
  let frameCount = 0;

  // 7. Start requestAnimationFrame loop with MANUAL frame capture
  // We draw to canvas AND explicitly request frame capture each time
  const startTime = performance.now();
  const drawFrameWithCapture = (timestamp: number) => {
    // CRITICAL: Check if cleanup was called - stop immediately if so
    if (isCleanedUp) {
      return;
    }

    // On first frame, initialize lastFrameTime
    if (lastFrameTime === 0) {
      lastFrameTime = timestamp;
    }

    const elapsed = timestamp - lastFrameTime;

    if (elapsed >= frameInterval) {
      lastFrameTime = timestamp;
      frameCount++;

      // CRITICAL: Only draw if video has current frame data available
      // After source switch, video needs time to buffer - drawing from unbuffered video repeats last frame
      if (video.readyState >= video.HAVE_CURRENT_DATA) {
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

        // CRITICAL: Force browser to detect change by drawing a unique marker
        // Without this, Chromium's captureStream change detection fails even with requestFrame()
        // Draw a 1x1 pixel at rotating position (invisible but forces detection)
        const markerX = frameCount % canvas.width;
        const markerY = Math.floor(frameCount / canvas.width) % canvas.height;
        ctx.fillStyle = `rgba(0, 0, 0, 0.003)`; // Nearly transparent
        ctx.fillRect(markerX, markerY, 1, 1);

        // CRITICAL: Manually request frame capture
        // This is the only reliable way to capture frames in Chromium/Electron
        (videoTrack as any).requestFrame();

        // Log every 30 frames to avoid console spam
        if (frameCount % 30 === 0) {
          const elapsedTotal = (timestamp - startTime) / 1000;
          const expectedFrames = Math.floor(elapsedTotal * fps);
          console.log(`[regionCapture] ✅ Frame ${frameCount} captured (expected: ~${expectedFrames}, actual FPS: ${(frameCount / elapsedTotal).toFixed(2)})`);
        }
      } else {
        // Video not ready - skip this frame to avoid drawing frozen frame
        if (frameCount % 10 === 0) {
          console.warn(`[RegionCapture] ⏸️  Video not ready (readyState: ${video.readyState}), skipping frame`);
        }
      }
    }

    animationFrameId = window.requestAnimationFrame(drawFrameWithCapture);
  };

  animationFrameId = window.requestAnimationFrame(drawFrameWithCapture);

  /**
   * Update the capture source (for Space switching)
   * Recreates the MediaStream with a new source ID while keeping the canvas stream active
   */
  const updateSource = async (newSourceId: string): Promise<void> => {
    if (newSourceId === currentSourceId) {
      console.log('[RegionCapture] Source unchanged, skipping update');
      return;
    }

    console.log('[RegionCapture] 🔄 Updating source:', currentSourceId, '→', newSourceId);
    currentSourceId = newSourceId;

    try {
      await initializeStream(newSourceId);
      console.log('[RegionCapture] ✅ Source update complete');
    } catch (error) {
      console.error('[RegionCapture] ❌ Source update failed:', error);
      // Continue with old source rather than crashing the recording
      // The Space detector will retry on next poll
    }
  };

  // Cleanup function
  const cleanup = () => {
    // Set cleanup flag to stop frame loop immediately
    isCleanedUp = true;

    // Stop animation frame loop
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    // Stop all streams
    fullStream?.getTracks().forEach((track) => track.stop());
    croppedStream?.getTracks().forEach((track) => track.stop());

    // Remove elements
    video.srcObject = null;
    video.remove();
    canvas.remove();

    console.log('[RegionCapture] Cleanup complete');
  };

  return {
    stream: croppedStream,
    cleanup,
    updateSource,
  };
}

/**
 * Gets the display source ID for a specific display
 * Uses desktopCapturer to find the screen source
 */
export async function getDisplaySourceId(displayId: string): Promise<string | null> {
  try {
    console.log('[RegionCapture] Getting source for display ID:', displayId);

    // Get all available screen sources from desktopCapturer
    const sources = await window.electronAPI.screenRecording.getSources();
    console.log('[RegionCapture] Available sources:', sources.map(s => ({
      id: s.id,
      name: s.name,
      display_id: (s as any).display_id
    })));

    if (!sources || sources.length === 0) {
      console.error('[RegionCapture] No screen sources available');
      return null;
    }

    // Filter to screen sources only (not windows)
    // Screen sources have IDs like "screen:0:0" or "screen:1:0"
    // Window sources have IDs like "window:12345:0"
    const screenSources = sources.filter((s) => s.id.startsWith('screen:'));
    console.log('[RegionCapture] Screen sources:', screenSources);
    console.log('[RegionCapture] Screen source IDs:', screenSources.map(s => s.id));

    if (screenSources.length === 0) {
      console.error('[RegionCapture] No screen sources found');
      return null;
    }

    // Get all displays from Electron's screen module
    const displays = await window.electronAPI.screen.getAllDisplays();
    console.log('[RegionCapture] All displays:', displays);

    // Find the display object matching our displayId
    const targetDisplay = displays.find((d: any) => d.id.toString() === displayId);

    if (!targetDisplay) {
      console.error('[RegionCapture] Display not found for ID:', displayId);
      return screenSources[0].id; // Fallback to first source
    }

    console.log('[RegionCapture] Target display:', targetDisplay);

    // Strategy 1: Try matching by display_id property if available
    const sourceWithDisplayId = screenSources[0] as any;
    if (sourceWithDisplayId.display_id !== undefined) {
      const matchedSource = screenSources.find((s: any) => s.display_id === displayId);
      if (matchedSource) {
        console.log('[RegionCapture] Matched source by display_id:', matchedSource.id);
        return matchedSource.id;
      }
    }

    // Strategy 2: Match by system enumeration order
    // Both screen.getAllDisplays() and desktopCapturer.getSources() return displays
    // in the SAME system enumeration order (not position order)
    // Do NOT sort - use original order!
    const displayIndex = displays.findIndex((d: any) => d.id.toString() === displayId);

    if (displayIndex !== -1 && displayIndex < screenSources.length) {
      console.log('[RegionCapture] Matched source by system order index:', screenSources[displayIndex].id);
      console.log('[RegionCapture] Display:', displays[displayIndex].bounds);
      console.log('[RegionCapture] Source:', screenSources[displayIndex].name);
      return screenSources[displayIndex].id;
    }

    // Strategy 3: Match by screen name (e.g., "Screen 1", "Screen 2")
    // Extract number from display position
    const displayNumber = displayIndex + 1;
    const namedSource = screenSources.find(s =>
      s.name.includes(`Screen ${displayNumber}`) ||
      s.name.includes(`Display ${displayNumber}`)
    );

    if (namedSource) {
      console.log('[RegionCapture] Matched source by name:', namedSource.id);
      return namedSource.id;
    }

    // Fallback: Return first source and log warning
    console.warn('[RegionCapture] Could not match display, using first source');
    return screenSources[0].id;
  } catch (error) {
    console.error('[RegionCapture] Error getting display source:', error);
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
