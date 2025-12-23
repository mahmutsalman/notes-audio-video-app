import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { app } from 'electron';

const execFileAsync = promisify(execFile);

/**
 * Get the FFmpeg binary path.
 * Handles both development (node_modules) and production (bundled) scenarios.
 */
function getFFmpegPath(): string {
  if (!app.isPackaged) {
    const appPath = app.getAppPath();
    const devPath = path.join(appPath, 'node_modules', 'ffmpeg-static', 'ffmpeg');
    console.log('[VideoMerger] App path:', appPath);
    console.log('[VideoMerger] Dev FFmpeg path:', devPath);
    return devPath;
  }

  const prodPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', 'ffmpeg');
  console.log('[VideoMerger] Prod FFmpeg path:', prodPath);
  return prodPath;
}

/**
 * Get the FFprobe binary path (same directory as FFmpeg)
 */
function getFFprobePath(): string {
  const ffmpegPath = getFFmpegPath();
  return ffmpegPath.replace(/ffmpeg$/, 'ffprobe');
}

export interface VideoMergeResult {
  success: boolean;
  totalDurationMs: number;
  outputFormat: 'webm' | 'mp4';
  outputPath?: string;
  error?: string;
}

export interface VideoCompressionOptions {
  crf: number;
  preset: 'ultrafast' | 'fast' | 'medium' | 'slow' | 'veryslow';
  audioBitrate: '24k' | '32k' | '48k' | '64k' | '128k';
}

export interface VideoCodecParams {
  codec: string;           // e.g., 'h264', 'vp9'
  bitrate?: number;        // Average bitrate in bps
  pixelFormat: string;     // e.g., 'yuv420p'
  frameRate: string;       // e.g., '10/1'
  profile?: string;        // e.g., 'High', 'Main'
  level?: string;          // e.g., '4.0'
  encoder?: string;        // e.g., 'libx264'
}

/**
 * Detect video format by analyzing file extension and codec
 */
async function detectFormat(videoPath: string): Promise<'webm' | 'mp4'> {
  console.log('[VideoMerger] Detecting format for:', videoPath);

  // First try by extension
  const ext = path.extname(videoPath).toLowerCase();
  if (ext === '.mp4') {
    console.log('[VideoMerger] Format detected by extension: mp4');
    return 'mp4';
  }
  if (ext === '.webm') {
    console.log('[VideoMerger] Format detected by extension: webm');
    return 'webm';
  }

  // Fallback: use ffprobe to detect codec
  try {
    const ffprobePath = getFFprobePath();
    const { stdout } = await execFileAsync(ffprobePath, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      videoPath
    ]);

    const codec = stdout.trim().toLowerCase();
    console.log('[VideoMerger] Detected codec:', codec);

    if (codec.includes('h264') || codec.includes('avc')) {
      return 'mp4';
    }
    return 'webm';
  } catch (error) {
    console.error('[VideoMerger] Failed to detect format, defaulting to webm:', error);
    return 'webm';
  }
}

/**
 * Concatenate two videos with the same format using stream copy (fast, no re-encoding)
 */
async function concatVideos(
  originalPath: string,
  extensionPath: string,
  outputPath: string
): Promise<void> {
  console.log('[VideoMerger] Starting concat with stream copy...');
  const concatListPath = path.join(path.dirname(outputPath), 'concat.txt');

  // Create concat list file
  const concatContent = `file '${originalPath.replace(/'/g, "'\\''")}'
file '${extensionPath.replace(/'/g, "'\\''")}'
`;
  await fs.writeFile(concatListPath, concatContent);
  console.log('[VideoMerger] Concat list created');

  const ffmpegPath = getFFmpegPath();
  const ffmpegStart = performance.now();

  // Run FFmpeg with stream copy - NO re-encoding for speed
  await execFileAsync(ffmpegPath, [
    '-f', 'concat',           // Use concat demuxer
    '-safe', '0',             // Allow any file paths
    '-i', concatListPath,     // Input concat list
    '-c', 'copy',             // Stream copy - NO re-encoding!
    '-y',                     // Overwrite output
    outputPath                // Output file
  ]);

  console.log(`[VideoMerger] Concat completed in ${((performance.now() - ffmpegStart) / 1000).toFixed(2)}s`);

  // Clean up concat list
  await fs.unlink(concatListPath);
}

/**
 * Compress a video file to match target format
 */
async function compressVideo(
  inputPath: string,
  outputPath: string,
  targetFormat: 'webm' | 'mp4',
  options: VideoCompressionOptions,
  matchParams?: VideoCodecParams
): Promise<void> {
  console.log('[VideoMerger] Compressing video to', targetFormat);
  const ffmpegPath = getFFmpegPath();

  let args: string[];

  if (matchParams) {
    // Match original parameters for stream copy compatibility
    console.log('[VideoMerger] Matching original codec parameters:', matchParams);

    args = [
      '-i', inputPath,
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',  // Ensure even dimensions for H.264
      '-c:v', 'libx264'
    ];

    // Add profile if available
    if (matchParams.profile) {
      args.push('-profile:v', matchParams.profile);
    }

    // Add level if available
    if (matchParams.level) {
      args.push('-level', matchParams.level);
    }

    // Add pixel format
    args.push('-pix_fmt', matchParams.pixelFormat);

    // Add frame rate
    args.push('-r', matchParams.frameRate);

    // Add bitrate if available, otherwise use CRF
    if (matchParams.bitrate) {
      args.push('-b:v', matchParams.bitrate.toString());
    } else {
      args.push('-crf', '23'); // Higher quality when matching
    }

    // Audio settings
    args.push(
      '-c:a', 'aac',
      '-b:a', options.audioBitrate,
      '-movflags', '+faststart',
      '-y',
      outputPath
    );
  } else {
    // Original behavior - use compression options
    args = [
      '-i', inputPath,
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',  // Ensure even dimensions for H.264
      '-c:v', 'libx264',        // H.264 codec for MP4
      '-crf', options.crf.toString(),
      '-preset', options.preset,
      '-pix_fmt', 'yuv420p',    // Compatibility
      '-c:a', 'aac',            // AAC audio for MP4
      '-b:a', options.audioBitrate,
      '-movflags', '+faststart', // Enable streaming
      '-y',                     // Overwrite
      outputPath
    ];
  }

  return new Promise((resolve, reject) => {
    const process = spawn(ffmpegPath, args);
    let errorOutput = '';

    process.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        console.log('[VideoMerger] Compression successful');
        resolve();
      } else {
        console.error('[VideoMerger] Compression failed:', {
          code,
          inputFormat: path.extname(inputPath),
          outputFormat: targetFormat,
          matchingParams: !!matchParams,
          lastError: errorOutput.slice(-1000)
        });
        reject(new Error(`FFmpeg compression failed with code ${code}`));
      }
    });

    process.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Merge two video files with different formats (compress extension first, then concat)
 */
async function compressAndConcat(
  originalPath: string,
  extensionPath: string,
  tempDir: string,
  targetFormat: 'webm' | 'mp4',
  compressionOptions: VideoCompressionOptions
): Promise<string> {
  console.log('[VideoMerger] Different formats detected - analyzing original codec params');

  let matchParams: VideoCodecParams | undefined;

  // Step 1: Analyze original video codec params for MP4
  if (targetFormat === 'mp4') {
    try {
      const { getVideoCodecParams } = await import('./videoMetadata');
      matchParams = await getVideoCodecParams(originalPath);
      console.log('[VideoMerger] Original codec params:', matchParams);
    } catch (error) {
      console.warn('[VideoMerger] Failed to analyze codec params, using defaults:', error);
      // Falls back to compressionOptions
    }
  }

  // Step 2: Compress extension to match original format
  const compressedExtensionPath = path.join(tempDir, `extension_compressed.${targetFormat}`);
  await compressVideo(extensionPath, compressedExtensionPath, targetFormat, compressionOptions, matchParams);

  // Step 3: Concat the compressed videos
  const outputPath = path.join(tempDir, `output.${targetFormat}`);
  await concatVideos(originalPath, compressedExtensionPath, outputPath);

  return outputPath;
}

/**
 * Merge two video files using FFmpeg.
 * Handles different formats by compressing the extension to match the original.
 *
 * @param originalPath - Path to the original video file
 * @param extensionBuffer - ArrayBuffer of the extension video
 * @param originalDurationMs - Duration of original in milliseconds
 * @param extensionDurationMs - Duration of extension in milliseconds
 * @param compressionOptions - Optional compression settings (defaults to CRF 35, slow preset)
 * @returns Result with success status, total duration, and output format
 */
export async function mergeVideoFiles(
  originalPath: string,
  extensionBuffer: ArrayBuffer,
  originalDurationMs: number,
  extensionDurationMs: number,
  compressionOptions: VideoCompressionOptions = {
    crf: 35,
    preset: 'slow',
    audioBitrate: '32k'
  }
): Promise<VideoMergeResult> {
  const startTime = performance.now();
  const tempDir = path.join(os.tmpdir(), `video-merge-${uuidv4()}`);

  try {
    // Create temp directory
    await fs.mkdir(tempDir, { recursive: true });
    console.log('[VideoMerger] Temp dir:', tempDir);

    // Step 1: Write extension to temp file
    console.log('[VideoMerger] Step 1: Writing extension to temp file...');
    const extensionPath = path.join(tempDir, 'extension.webm'); // Extension is always recorded as WebM
    await fs.writeFile(extensionPath, Buffer.from(extensionBuffer));
    console.log(`[VideoMerger] Extension written: ${(extensionBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);

    // Step 2: Detect formats
    console.log('[VideoMerger] Step 2: Detecting formats...');
    const originalFormat = await detectFormat(originalPath);
    const extensionFormat = await detectFormat(extensionPath);
    console.log(`[VideoMerger] Original format: ${originalFormat}, Extension format: ${extensionFormat}`);

    let outputPath: string;
    let outputFormat: 'webm' | 'mp4';

    // Step 3: Merge based on format compatibility
    if (originalFormat === extensionFormat) {
      // Fast path: same format, direct concat with stream copy
      console.log('[VideoMerger] Step 3: Same format - using fast concat...');
      outputFormat = originalFormat;
      outputPath = path.join(tempDir, `output.${outputFormat}`);
      await concatVideos(originalPath, extensionPath, outputPath);
    } else {
      // Slow path: different formats, compress extension first
      console.log('[VideoMerger] Step 3: Different formats - compressing and concatenating...');
      outputFormat = originalFormat; // Keep original format
      outputPath = await compressAndConcat(
        originalPath,
        extensionPath,
        tempDir,
        originalFormat,
        compressionOptions
      );
    }

    // Step 4: Replace original file with merged file
    console.log('[VideoMerger] Step 4: Replacing original file...');
    await fs.copyFile(outputPath, originalPath);

    // Step 5: Extract actual duration from merged file
    console.log('[VideoMerger] Step 5: Extracting actual duration...');
    const { getVideoMetadata } = await import('./videoMetadata');
    const metadata = await getVideoMetadata(originalPath);
    const calculatedDurationMs = originalDurationMs + extensionDurationMs;
    const actualDurationMs = metadata.duration ? metadata.duration * 1000 : calculatedDurationMs;

    console.log('[VideoMerger] ===== DURATION EXTRACTION DEBUG =====');
    console.log('[VideoMerger] FFprobe result:', {
      filePath: originalPath.split('/').pop(),
      rawMetadata: {
        duration: metadata.duration,
        codec: metadata.codec,
        width: metadata.width,
        height: metadata.height
      },
      ffprobeSucceeded: metadata.duration !== null,
      ffprobeValue: metadata.duration,
      calculatedValue: Math.floor(calculatedDurationMs / 1000),
      actualValue: Math.floor(actualDurationMs / 1000),
      usingFFprobe: metadata.duration !== null
    });
    console.log('[VideoMerger] ======================================');

    // Step 6: Cleanup temp files
    console.log('[VideoMerger] Step 6: Cleaning up...');
    await fs.rm(tempDir, { recursive: true, force: true });

    const totalTime = (performance.now() - startTime) / 1000;

    console.log(`[VideoMerger] TOTAL merge time: ${totalTime.toFixed(2)}s`);
    console.log(`[VideoMerger] Speed: ${((actualDurationMs / 1000) / totalTime).toFixed(1)}x realtime`);

    return {
      success: true,
      totalDurationMs: actualDurationMs, // Use actual duration instead of calculated
      outputFormat,
      outputPath: originalPath
    };
  } catch (error) {
    console.error('[VideoMerger] Merge failed:', error);

    // Cleanup on error
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    return {
      success: false,
      totalDurationMs: originalDurationMs,
      outputFormat: 'webm',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
