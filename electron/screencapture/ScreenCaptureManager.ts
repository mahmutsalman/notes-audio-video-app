import { EventEmitter } from 'events';
import * as path from 'path';
import { app } from 'electron';

interface ScreenCaptureConfig {
  displayId: number;
  width: number;
  height: number;
  frameRate: number;
}

export interface FrameData {
  buffer: Buffer;
  width: number;
  height: number;
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
    console.log('[ScreenCaptureKit] Starting capture with config:', {
      displayId: config.displayId,
      displayIdType: typeof config.displayId,
      width: config.width,
      widthType: typeof config.width,
      height: config.height,
      heightType: typeof config.height,
      frameRate: config.frameRate,
      frameRateType: typeof config.frameRate
    });

    // Ensure all parameters are numbers
    const displayId = Number(config.displayId);
    const width = Number(config.width);
    const height = Number(config.height);
    const frameRate = Number(config.frameRate);

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

    const frameCallback = (buffer: Buffer, width: number, height: number) => {
      this.emit('frame', { buffer, width, height });
    };

    try {
      console.log('[ScreenCaptureKit] Calling native.startCapture with validated parameters:', {
        displayId,
        width,
        height,
        frameRate,
        callbackType: typeof frameCallback
      });

      const success = this.native.startCapture(
        displayId,
        width,
        height,
        frameRate,
        frameCallback
      );

      if (success) {
        this.isCapturing = true;
        this.emit('started');
        console.log('[ScreenCaptureKit] ✅ Capture started successfully');
      }
    } catch (error) {
      console.error('[ScreenCaptureKit] ❌ Failed to start capture:', error);
      this.emit('error', error);
      throw error;
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
