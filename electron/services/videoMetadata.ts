import ffprobeStatic from 'ffprobe-static';
import ffprobe from 'ffprobe';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';

interface RetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelayMs: 200,
  maxDelayMs: 1000,
  backoffMultiplier: 2
};

const parseFpsValue = (value?: string): number | undefined => {
  if (!value) return undefined;
  const [num, den] = value.split('/');
  const numerator = parseFloat(num);
  const denominator = den ? parseFloat(den) : 1;

  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return undefined;
  }

  return numerator / denominator;
};

const normalizeFps = (fps?: number): number | undefined => {
  if (!fps || !Number.isFinite(fps)) return undefined;
  if (fps < 1 || fps > 120) return undefined;
  return Math.round(fps * 1000) / 1000;
};

/**
 * Retry an async operation with exponential backoff.
 */
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | unknown;

  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      const delayMs = Math.min(
        config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt),
        config.maxDelayMs
      );

      if (attempt > 0) {
        console.log(
          `[videoMetadata] Retry attempt ${attempt + 1}/${config.maxRetries} ` +
          `after ${delayMs}ms delay`
        );
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

      return await operation();
    } catch (error) {
      lastError = error;
      console.warn(
        `[videoMetadata] Attempt ${attempt + 1}/${config.maxRetries} failed:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  throw lastError;
}

export interface VideoMetadata {
  duration: number | null;  // Duration in seconds
  width?: number;
  height?: number;
  fps?: number;
  codec?: string;
  audioStreams?: number;
  audioChannels?: number;
  audioSampleRate?: number;
  audioCodec?: string;
  source?: 'ffprobe' | 'fallback';  // Track duration source
  error?: string;  // Error message if extraction failed
}

export interface VideoCodecParams {
  codec: string;           // e.g., 'h264', 'vp9'
  bitrate?: number;        // Average bitrate in bps
  pixelFormat: string;     // e.g., 'yuv420p'
  frameRate?: string;      // e.g., '10'
  profile?: string;        // e.g., 'High', 'Main'
  level?: string;          // e.g., '4.0'
  encoder?: string;        // e.g., 'libx264'
  width?: number;
  height?: number;
}

export interface MediaStreamTimings {
  format?: {
    duration?: number;
    startTime?: number;
  };
  video?: {
    codec?: string;
    startTime?: number;
    duration?: number;
    timeBase?: string;
    frameRate?: string;
    nbFrames?: number;
    width?: number;
    height?: number;
  };
  audio?: {
    codec?: string;
    startTime?: number;
    duration?: number;
    timeBase?: string;
    sampleRate?: number;
    channels?: number;
  };
}

/**
 * Get FFprobe binary path for both development and production.
 * FFprobe has platform-specific subdirectories: bin/{platform}/{arch}/ffprobe
 * Development: node_modules/ffprobe-static/bin/darwin/arm64/ffprobe
 * Production: app.asar.unpacked/node_modules/ffprobe-static/bin/darwin/arm64/ffprobe
 */
function getFfprobePath(): string {
  const isDev = !app.isPackaged;

  // Platform-specific path components
  const platform = process.platform; // 'darwin', 'linux', 'win32'
  const arch = process.arch; // 'arm64', 'x64'
  const binaryName = platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
  const relativePath = path.join('bin', platform, arch, binaryName);

  if (isDev) {
    const devPath = path.join(
      app.getAppPath(),
      'node_modules',
      'ffprobe-static',
      relativePath
    );
    console.log('[videoMetadata] Development mode');
    console.log('[videoMetadata] Platform:', platform, 'Arch:', arch);
    console.log('[videoMetadata] FFprobe path:', devPath);
    return devPath;
  }

  // Production: Use process.resourcesPath
  const prodPath = path.join(
    process.resourcesPath,
    'app.asar.unpacked',
    'node_modules',
    'ffprobe-static',
    relativePath
  );
  console.log('[videoMetadata] Production mode');
  console.log('[videoMetadata] Platform:', platform, 'Arch:', arch);
  console.log('[videoMetadata] process.resourcesPath:', process.resourcesPath);
  console.log('[videoMetadata] FFprobe path:', prodPath);

  // Verify and provide detailed error if missing
  if (!fs.existsSync(prodPath)) {
    const errorMsg = [
      'FFprobe binary not found at expected production path',
      `Expected: ${prodPath}`,
      `Platform: ${platform}, Arch: ${arch}`,
      `process.resourcesPath: ${process.resourcesPath}`,
      'Binary may not have been unpacked during build.',
      'Check package.json asarUnpack configuration.'
    ].join('\n');
    console.error('[videoMetadata]', errorMsg);
    throw new Error(errorMsg);
  }

  return prodPath;
}

/**
 * Get video codec parameters for matching during compression.
 * Extracts codec, bitrate, pixel format, frame rate, profile, and level.
 */
export async function getVideoCodecParams(filePath: string): Promise<VideoCodecParams> {
  const ffprobePath = getFfprobePath();

  console.log('[videoMetadata] Analyzing codec params for:', filePath.split('/').pop());

  try {
    const info = await ffprobe(filePath, { path: ffprobePath });
    const videoStream = info.streams.find((s: any) => s.codec_type === 'video');

    if (!videoStream) {
      throw new Error('No video stream found in file');
    }

    // Extract codec parameters
    const codec = videoStream.codec_name || 'h264';
    const bitrate = videoStream.bit_rate ? parseInt(videoStream.bit_rate) : undefined;
    const pixelFormat = videoStream.pix_fmt || 'yuv420p';
    const avgFps = normalizeFps(parseFpsValue(videoStream.avg_frame_rate));
    const rawFps = normalizeFps(parseFpsValue(videoStream.r_frame_rate));
    const frameRateValue = avgFps ?? rawFps;
    const frameRate = frameRateValue ? `${frameRateValue}` : undefined;
    const profile = videoStream.profile?.toLowerCase();
    const level = videoStream.level ? (videoStream.level / 10).toFixed(1) : undefined;

    // Try to extract encoder from tags
    const encoder = videoStream.tags?.encoder || info.format?.tags?.encoder;
    const width = videoStream.width;
    const height = videoStream.height;

    const bitsPerPixel = (bitrate && width && height && frameRateValue)
      ? bitrate / (width * height * frameRateValue)
      : undefined;
    const keepBitrate = bitrate && bitsPerPixel !== undefined
      ? bitsPerPixel >= 0.07
      : (bitrate && bitrate >= 500000);

    const params: VideoCodecParams = {
      codec,
      bitrate: keepBitrate ? bitrate : undefined,
      pixelFormat,
      frameRate,
      profile,
      level,
      encoder,
      width,
      height
    };

    console.log('[videoMetadata] Codec params extracted:', params);
    return params;

  } catch (error) {
    console.error('[videoMetadata] Failed to extract codec params:', error);

    // Return sensible defaults for H.264
    return {
      codec: 'h264',
      pixelFormat: 'yuv420p',
      profile: 'high',
      level: '4.0'
    };
  }
}

export async function getMediaStreamTimings(filePath: string): Promise<MediaStreamTimings> {
  const ffprobePath = getFfprobePath();

  const info = await retryWithBackoff(
    () => ffprobe(filePath, { path: ffprobePath }),
    { maxRetries: 2, initialDelayMs: 150 }
  );

  const parseNum = (value: any): number | undefined => {
    const n = typeof value === 'string' ? parseFloat(value) : typeof value === 'number' ? value : NaN;
    return Number.isFinite(n) ? n : undefined;
  };

  const videoStream = info.streams.find((s: any) => s.codec_type === 'video');
  const audioStream = info.streams.find((s: any) => s.codec_type === 'audio');

  return {
    format: {
      duration: parseNum(info.format?.duration),
      startTime: parseNum(info.format?.start_time)
    },
    video: videoStream
      ? {
        codec: videoStream.codec_name,
        startTime: parseNum(videoStream.start_time),
        duration: parseNum(videoStream.duration),
        timeBase: videoStream.time_base,
        frameRate: videoStream.avg_frame_rate || videoStream.r_frame_rate,
        nbFrames: videoStream.nb_frames ? parseInt(videoStream.nb_frames, 10) : undefined,
        width: videoStream.width,
        height: videoStream.height
      }
      : undefined,
    audio: audioStream
      ? {
        codec: audioStream.codec_name,
        startTime: parseNum(audioStream.start_time),
        duration: parseNum(audioStream.duration),
        timeBase: audioStream.time_base,
        sampleRate: audioStream.sample_rate ? parseInt(audioStream.sample_rate, 10) : undefined,
        channels: audioStream.channels
      }
      : undefined
  };
}

export async function getVideoMetadata(
  filePath: string,
  fallbackDurationMs?: number
): Promise<VideoMetadata> {
  const ffprobePath = getFfprobePath();

  // Step 1: Verify FFprobe binary exists
  if (!fs.existsSync(ffprobePath)) {
    const error = `FFprobe binary not found at: ${ffprobePath}`;
    console.error('[videoMetadata]', error);

    if (fallbackDurationMs) {
      return {
        duration: Math.floor(fallbackDurationMs / 1000),
        source: 'fallback',
        error
      };
    }

    return { duration: null, error };
  }

  // Step 2: Verify input file exists and is readable
  try {
    const stats = fs.statSync(filePath);
    console.log('[videoMetadata] Input file verified:', {
      path: filePath.split('/').pop(),
      exists: true,
      size: stats.size,
      readable: (stats.mode & fs.constants.R_OK) !== 0
    });

    if (stats.size === 0) {
      throw new Error('Input file is empty (0 bytes)');
    }
  } catch (error) {
    const errorMsg = `Failed to verify input file: ${
      error instanceof Error ? error.message : String(error)
    }`;
    console.error('[videoMetadata]', errorMsg);

    if (fallbackDurationMs) {
      return {
        duration: Math.floor(fallbackDurationMs / 1000),
        source: 'fallback',
        error: errorMsg
      };
    }

    return { duration: null, error: errorMsg };
  }

  // Step 3: Attempt FFprobe extraction with retry logic
  try {
    const result = await retryWithBackoff(async () => {
      console.log('[videoMetadata] Executing FFprobe on:', filePath.split('/').pop());
      console.log('[videoMetadata] Using FFprobe binary:', ffprobePath);

      const info = await ffprobe(filePath, { path: ffprobePath });

      // Try to get duration from streams first, then format
      const duration = info.streams[0]?.duration || info.format?.duration || null;

      // Validate duration was found
      if (duration === null || duration === undefined) {
        throw new Error('FFprobe returned no duration in streams or format metadata');
      }

      // Get video stream metadata
      const videoStream = info.streams.find((s: any) => s.codec_type === 'video');
      const audioStreams = info.streams.filter((s: any) => s.codec_type === 'audio');
      const audioStream = audioStreams[0];

      console.log('[videoMetadata] ✓ FFprobe extraction successful:', {
        file: filePath.split('/').pop(),
        streamDuration: info.streams[0]?.duration,
        formatDuration: info.format?.duration,
        finalDuration: duration,
        codec: videoStream?.codec_name,
        dimensions: `${videoStream?.width}x${videoStream?.height}`,
        fps: videoStream?.r_frame_rate
      });

      return {
        duration: Math.floor(parseFloat(duration.toString())),
        width: videoStream?.width,
        height: videoStream?.height,
        fps: normalizeFps(parseFpsValue(videoStream?.avg_frame_rate)) ??
          normalizeFps(parseFpsValue(videoStream?.r_frame_rate)),
        codec: videoStream?.codec_name,
        audioStreams: audioStreams.length,
        audioChannels: audioStream?.channels,
        audioSampleRate: audioStream?.sample_rate ? parseInt(audioStream.sample_rate, 10) : undefined,
        audioCodec: audioStream?.codec_name,
        source: 'ffprobe' as const
      };
    }, {
      maxRetries: 3,
      initialDelayMs: 200,
      maxDelayMs: 1000,
      backoffMultiplier: 2
    });

    return result;

  } catch (err) {
    // Step 4: FFprobe failed after all retries - use fallback
    const errorMsg = err instanceof Error ? err.message : String(err);

    console.error('[videoMetadata] ===== FFPROBE FAILED AFTER RETRIES =====');
    console.error('[videoMetadata] File:', filePath.split('/').pop());
    console.error('[videoMetadata] Error type:', err instanceof Error ? err.constructor.name : typeof err);
    console.error('[videoMetadata] Error message:', errorMsg);
    console.error('[videoMetadata] Full error:', err);

    // Check file integrity one more time
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      console.error('[videoMetadata] File exists: true');
      console.error('[videoMetadata] File size:', stats.size, 'bytes');
      console.error('[videoMetadata] File permissions:', stats.mode.toString(8));
    } else {
      console.error('[videoMetadata] File exists: false');
    }

    console.error('[videoMetadata] ================================================');

    // Use fallback if available
    if (fallbackDurationMs) {
      const fallbackDuration = Math.floor(fallbackDurationMs / 1000);
      console.warn('[videoMetadata] ⚠️  Using fallback duration:', fallbackDuration, 's');

      return {
        duration: fallbackDuration,
        source: 'fallback',
        error: errorMsg
      };
    }

    // No fallback available - complete failure
    console.error('[videoMetadata] ✗ No fallback duration available');
    return {
      duration: null,
      error: errorMsg
    };
  }
}
