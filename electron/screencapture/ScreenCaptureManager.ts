import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

interface ScreenCaptureConfig {
  displayId: number;
  width: number;
  height: number;
  scaleFactor?: number;
  frameRate: number;
  recordingId?: number; // Optional recording ID for folder organization
  regionX?: number; // Optional region cropping (defaults to 0)
  regionY?: number; // Optional region cropping (defaults to 0)
  regionWidth?: number; // Optional region cropping (defaults to width)
  regionHeight?: number; // Optional region cropping (defaults to height)
  outputWidth?: number; // Optional output width for scaling (defaults to regionWidth)
  outputHeight?: number; // Optional output height for scaling (defaults to regionHeight)
  bitsPerPixel?: number; // Optional bitrate control for hardware encoder
  outputPath?: string; // Optional output path, will be generated if not provided
}

export class ScreenCaptureKitManager extends EventEmitter {
  private native: any;
  private isCapturing: boolean = false;

  constructor() {
    super();

    try {
      // Try to load the native addon from different possible locations
      const possiblePaths = [
        // Development mode
        path.join(__dirname, '../native/screencapturekit/build/Release/screencapturekit_native.node'),
        // Production mode (after electron-builder packaging)
        path.join(process.resourcesPath, 'native/screencapturekit/screencapturekit_native.node'),
        // Alternative production path
        path.join(app.getAppPath(), 'electron/native/screencapturekit/build/Release/screencapturekit_native.node'),
      ];

      let loaded = false;
      let lastError: Error | null = null;

      for (const addonPath of possiblePaths) {
        try {
          this.native = require(addonPath);
          console.log(`[ScreenCaptureKit] ✅ Native addon loaded from: ${addonPath}`);
          loaded = true;
          break;
        } catch (error) {
          lastError = error as Error;
          continue;
        }
      }

      if (!loaded) {
        console.error('[ScreenCaptureKit] ❌ Failed to load native addon from all possible paths');
        console.error('[ScreenCaptureKit] Last error:', lastError);
        throw new Error('Failed to load ScreenCaptureKit native addon');
      }
    } catch (error) {
      console.error('[ScreenCaptureKit] Fatal: Failed to initialize native addon:', error);
      throw error;
    }
  }

  async startCapture(config: ScreenCaptureConfig): Promise<void> {
    if (this.isCapturing) {
      throw new Error('Capture already in progress');
    }

    // Log config for debugging
    console.log('[ScreenCaptureKit] Starting file-based capture with config:', {
      displayId: config.displayId,
      width: config.width,
      height: config.height,
      scaleFactor: config.scaleFactor,
      frameRate: config.frameRate,
      regionX: config.regionX,
      regionY: config.regionY,
      regionWidth: config.regionWidth,
      regionHeight: config.regionHeight,
      outputWidth: config.outputWidth,
      outputHeight: config.outputHeight,
      bitsPerPixel: config.bitsPerPixel,
      outputPath: config.outputPath
    });

    // Ensure all parameters are numbers
    const displayId = Number(config.displayId);
    const width = Number(config.width);
    const height = Number(config.height);
    const frameRate = Number(config.frameRate);
    const scaleFactor = config.scaleFactor !== undefined ? Number(config.scaleFactor) : 1;
    const regionX = config.regionX !== undefined ? Number(config.regionX) : 0;
    const regionY = config.regionY !== undefined ? Number(config.regionY) : 0;
    const regionWidth = config.regionWidth !== undefined ? Number(config.regionWidth) : width;
    const regionHeight = config.regionHeight !== undefined ? Number(config.regionHeight) : height;
    const outputWidth = config.outputWidth !== undefined ? Number(config.outputWidth) : regionWidth;
    const outputHeight = config.outputHeight !== undefined ? Number(config.outputHeight) : regionHeight;
    const bitsPerPixel = config.bitsPerPixel !== undefined ? Number(config.bitsPerPixel) : 0.15;

    // Validate parameters
    if (!Number.isInteger(displayId) || displayId < 0) {
      throw new Error(`Invalid displayId: ${config.displayId}`);
    }
    if (!Number.isInteger(width) || width <= 0) {
      throw new Error(`Invalid width: ${config.width}`);
    }
    if (!Number.isInteger(height) || height <= 0) {
      throw new Error(`Invalid height: ${config.height}`);
    }
    if (!Number.isInteger(frameRate) || frameRate <= 0) {
      throw new Error(`Invalid frameRate: ${config.frameRate}`);
    }
    if (!Number.isInteger(outputWidth) || outputWidth <= 0) {
      throw new Error(`Invalid outputWidth: ${config.outputWidth}`);
    }
    if (!Number.isInteger(outputHeight) || outputHeight <= 0) {
      throw new Error(`Invalid outputHeight: ${config.outputHeight}`);
    }
    if (!Number.isFinite(bitsPerPixel) || bitsPerPixel <= 0) {
      throw new Error(`Invalid bitsPerPixel: ${config.bitsPerPixel}`);
    }

    // Extract recordingId from config
    const recordingId = config.recordingId;

    // Generate output path if not provided
    const outputPath = config.outputPath || this.generateOutputPath(recordingId);

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Setup callbacks for file-based recording
    const callbacks = {
      onComplete: (filePath: string) => {
        console.log('[ScreenCaptureKit] ✅ Recording completed:', filePath);
        this.emit('complete', filePath);
      },
      onError: (errorMessage: string) => {
        console.error('[ScreenCaptureKit] ❌ Recording error:', errorMessage);
        this.emit('error', new Error(errorMessage));
      }
    };

    try {
      console.log('[ScreenCaptureKit] Calling native.startCapture with file output:', {
        displayId,
        width,
        height,
        scaleFactor,
        frameRate,
        regionX,
        regionY,
        regionWidth,
        regionHeight,
        outputWidth,
        outputHeight,
        bitsPerPixel,
        outputPath
      });

      const success = this.native.startCapture(
        displayId,
        width,
        height,
        frameRate,
        scaleFactor,
        regionX,
        regionY,
        regionWidth,
        regionHeight,
        outputWidth,
        outputHeight,
        bitsPerPixel,
        outputPath,
        callbacks
      );

      if (success) {
        this.isCapturing = true;
        this.emit('started');
        console.log('[ScreenCaptureKit] ✅ File-based capture started with AVAssetWriter');
      }
    } catch (error) {
      console.error('[ScreenCaptureKit] ❌ Failed to start capture:', error);
      this.emit('error', error);
      throw error;
    }
  }

  private generateOutputPath(recordingId?: number): string {
    const userDataPath = app.getPath('userData');
    const timestamp = Date.now();

    if (recordingId !== undefined) {
      // Use recordingId folder structure to match fileStorage pattern
      const recordingsDir = path.join(
        userDataPath,
        'media',
        'screen_recordings',
        String(recordingId)
      );
      return path.join(recordingsDir, `recording_${timestamp}.mov`);
    } else {
      // Fallback: direct to screen_recordings (legacy)
      const recordingsDir = path.join(userDataPath, 'media', 'screen_recordings');
      return path.join(recordingsDir, `recording_${timestamp}.mov`);
    }
  }

  stopCapture(): void {
    if (!this.isCapturing) {
      return;
    }

    this.native.stopCapture();
    this.isCapturing = false;
    this.emit('stopped');
    console.log('[ScreenCaptureKit] ✅ Capture stopped');
  }

  isCurrentlyCapturing(): boolean {
    return this.isCapturing && this.native.isCapturing();
  }
}
