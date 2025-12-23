import type { CaptureArea } from '../types';
import { FrameFreezeDetector } from './frameFreezeDetector';
import {
  createScreenCaptureKitStream,
  isScreenCaptureKitAvailable,
  type ScreenCaptureKitRegion
} from './screenCaptureKitCapture';

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
  // Check if ScreenCaptureKit is available (macOS 12.3+)
  const useScreenCaptureKit = isScreenCaptureKitAvailable();

  if (useScreenCaptureKit) {
    console.log('[RegionCapture] 🚀 Using ScreenCaptureKit (native macOS API - no Space freeze!)');

    // Account for display scale factor
    const scaleFactor = region.scaleFactor || 1;
    const canvasWidth = targetDimensions?.width ?? (region.width * scaleFactor);
    const canvasHeight = targetDimensions?.height ?? (region.height * scaleFactor);

    // Get display dimensions for full capture
    const displayId = parseInt(region.displayId, 10);
    const displayDimensionsResult = await window.electronAPI.screenCaptureKit.getDisplayDimensions(displayId);

    if (!displayDimensionsResult.success || !displayDimensionsResult.width || !displayDimensionsResult.height) {
      throw new Error(`Failed to get display dimensions: ${displayDimensionsResult.error || 'Unknown error'}`);
    }

    console.log('[RegionCapture] Display dimensions:', {
      displayId,
      width: displayDimensionsResult.width,
      height: displayDimensionsResult.height,
      scaleFactor: displayDimensionsResult.scaleFactor
    });

    // Create ScreenCaptureKit region from CaptureArea
    const screenCaptureKitRegion: ScreenCaptureKitRegion = {
      displayId,
      x: region.x * scaleFactor,
      y: region.y * scaleFactor,
      width: region.width * scaleFactor,
      height: region.height * scaleFactor
    };

    // Use ScreenCaptureKit for capture with full display dimensions
    const { stream, cleanup } = await createScreenCaptureKitStream(
      screenCaptureKitRegion,
      fps,
      canvasWidth,
      canvasHeight,
      displayDimensionsResult.width,
      displayDimensionsResult.height
    );

    // Return with no-op updateSource (ScreenCaptureKit handles Space transitions automatically)
    return {
      stream,
      cleanup,
      updateSource: async () => {
        console.log('[RegionCapture] ScreenCaptureKit handles Space transitions automatically - no manual update needed');
      }
    };
  }

  // Legacy implementation (fallback for older macOS versions)
  console.warn('[RegionCapture] ⚠️  Using legacy desktopCapturer (may freeze on Space switch)');
  console.warn('[RegionCapture] ⚠️  Upgrade to macOS 12.3+ for ScreenCaptureKit support');

  let currentSourceId = sourceId;
  let fullStream: MediaStream;
  let video: HTMLVideoElement;
  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  let croppedStream: MediaStream;
  let videoTrack: MediaStreamTrack;
  let animationFrameId: number | null = null;
  let isCleanedUp = false;

  // Freeze detection for automatic Space switch recovery
  const freezeDetector = new FrameFreezeDetector();
  let lastFreezeCheck = 0;
  let isRecovering = false;

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

    // Stop old stream if exists and remove event listeners
    if (fullStream) {
      // Remove all event listeners to prevent memory leaks
      fullStream.removeEventListener('inactive', () => {});
      fullStream.getTracks().forEach((track) => {
        track.removeEventListener('ended', () => {});
        track.stop();
      });
      console.log('[RegionCapture] Old stream cleaned up');
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

    // CRITICAL: Monitor stream state to detect macOS Space transition invalidation
    // When macOS switches Spaces, it can suspend/invalidate the screen capture stream
    fullStream.addEventListener('inactive', () => {
      console.error('[RegionCapture] 🚨 Stream became INACTIVE - macOS likely suspended it during Space transition!');
      if (!isRecovering) {
        console.log('[RegionCapture] Triggering stream recreation...');
        handleFreeze(); // Force stream recreation
      }
    });

    // Monitor individual tracks for 'ended' events (macOS can kill tracks during Space transitions)
    fullStream.getTracks().forEach(track => {
      track.addEventListener('ended', () => {
        console.error('[RegionCapture] 🚨 Track ENDED - macOS killed the capture track!');
        if (!isRecovering) {
          console.log('[RegionCapture] Triggering stream recreation...');
          handleFreeze(); // Force stream recreation
        }
      });

      console.log(`[RegionCapture] Track state: ${track.readyState}, enabled: ${track.enabled}, muted: ${track.muted}`);
    });

    // Check if stream is actually active after creation
    if (!fullStream.active) {
      console.warn('[RegionCapture] ⚠️  Stream created but NOT ACTIVE! This may cause issues.');
    } else {
      console.log('[RegionCapture] ✅ Stream is ACTIVE');
    }

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

  /**
   * Handle video freeze detection - attempt source refresh
   * Called when freeze detector identifies that frames have stopped changing
   * Force refreshes stream even if source ID unchanged (handles Space switches)
   */
  const handleFreeze = async () => {
    if (isRecovering) return;
    isRecovering = true;

    console.log('[RegionCapture] 🧊 Freeze detected, forcing stream refresh');

    try {
      // Get fresh source ID for the display
      const newSourceId = await getDisplaySourceId(region.displayId);

      if (newSourceId) {
        // Force refresh even if source ID is same (Space switch case)
        await updateSource(newSourceId, true);
        freezeDetector.reset();
        console.log('[RegionCapture] ✅ Stream refreshed successfully');
      } else {
        console.warn('[RegionCapture] ⚠️ No source ID returned');
      }
    } catch (error) {
      console.error('[RegionCapture] ❌ Source refresh failed:', error);
    } finally {
      isRecovering = false;
    }
  };

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
        // IMPORTANT: Skip marker during potential freeze to allow freeze detection to work
        if (!freezeDetector.isPotentiallyFrozen()) {
          const markerX = frameCount % canvas.width;
          const markerY = Math.floor(frameCount / canvas.width) % canvas.height;
          ctx.fillStyle = `rgba(0, 0, 0, 0.003)`; // Nearly transparent
          ctx.fillRect(markerX, markerY, 1, 1);
        }

        // CRITICAL: Manually request frame capture
        // This is the only reliable way to capture frames in Chromium/Electron
        (videoTrack as any).requestFrame();

        // Check for freeze every 100ms (10 Hz) - faster detection
        if (timestamp - lastFreezeCheck > 100) {
          if (freezeDetector.checkFrame(canvas) && !isRecovering) {
            handleFreeze();
          }
          lastFreezeCheck = timestamp;
        }

        // CRITICAL: Periodic stream health check (every 1 second)
        // Detect if macOS has invalidated the stream during Space transitions
        if (frameCount % 10 === 0) { // Every ~1 second at 10 FPS
          if (fullStream && !fullStream.active) {
            console.error('[RegionCapture] 🚨 STREAM HEALTH CHECK FAILED - Stream is INACTIVE!');
            if (!isRecovering) {
              console.log('[RegionCapture] Triggering emergency stream recreation...');
              handleFreeze(); // Force recreation
            }
          }

          // Check track states
          const tracks = fullStream?.getTracks() || [];
          tracks.forEach(track => {
            if (track.readyState === 'ended') {
              console.error('[RegionCapture] 🚨 TRACK HEALTH CHECK FAILED - Track is ENDED!');
              if (!isRecovering) {
                console.log('[RegionCapture] Triggering emergency stream recreation...');
                handleFreeze(); // Force recreation
              }
            }
          });
        }

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
   * @param newSourceId - The new source ID to switch to
   * @param force - If true, refresh stream even if source ID unchanged (for Space switches)
   */
  const updateSource = async (newSourceId: string, force: boolean = false): Promise<void> => {
    // Allow refresh even if source ID unchanged when forced (Space switch case)
    if (newSourceId === currentSourceId && !force) {
      console.log('[RegionCapture] Source unchanged, skipping update');
      return;
    }

    console.log(`[RegionCapture] 🔄 Updating source: ${currentSourceId} → ${newSourceId} (force: ${force})`);
    currentSourceId = newSourceId;

    try {
      await initializeStream(newSourceId);
      freezeDetector.reset(); // Reset detector after successful refresh
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
