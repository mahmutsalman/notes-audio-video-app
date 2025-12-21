import ffmpegStatic from 'ffmpeg-static';
import { spawn } from 'child_process';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';

export interface VideoCompressionOptions {
  crf: number;           // 18-40, lower = better quality (default: 35)
  preset: 'ultrafast' | 'fast' | 'medium' | 'slow' | 'veryslow';
  audioBitrate: '24k' | '32k' | '48k' | '64k' | '128k';
}

export interface VideoCompressionResult {
  success: boolean;
  outputPath?: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  error?: string;
}

export interface CompressionProgress {
  percent: number;
  currentTime: string;
  speed: string;
}

function getFfmpegPath(): string {
  // Get app path - in dev this is project root, in prod it's app.asar
  const appPath = app.getAppPath();
  console.log('[videoCompression] App path:', appPath);

  // Construct paths to try
  const pathsToTry = [
    // 1. Development: project_root/node_modules/ffmpeg-static/ffmpeg
    path.join(appPath, 'node_modules', 'ffmpeg-static', 'ffmpeg'),

    // 2. Production (macOS): app.asar.unpacked
    path.join(path.dirname(appPath), 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', 'ffmpeg'),

    // 3. Try the ffmpeg-static path as-is (might work in some cases)
    ffmpegStatic as string,
  ];

  // Try each path
  for (const tryPath of pathsToTry) {
    console.log('[videoCompression] Trying path:', tryPath);
    if (fs.existsSync(tryPath)) {
      console.log('[videoCompression] ✓ Found ffmpeg at:', tryPath);
      return tryPath;
    }
    console.log('[videoCompression] ✗ Not found');
  }

  // Fallback to ffmpeg-static default (will likely fail, but return it anyway)
  const fallbackPath = ffmpegStatic as string;
  console.log('[videoCompression] ⚠️ Using fallback path:', fallbackPath);
  return fallbackPath;
}

/**
 * Check if ffmpeg is available
 */
export async function checkFFmpegAvailable(): Promise<{ available: boolean; version?: string; error?: string }> {
  try {
    const ffmpegPath = getFfmpegPath();

    if (!fs.existsSync(ffmpegPath)) {
      return {
        available: false,
        error: `ffmpeg binary not found at: ${ffmpegPath}`
      };
    }

    // Try to get version
    return new Promise((resolve) => {
      const process = spawn(ffmpegPath, ['-version']);
      let output = '';

      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          const versionMatch = output.match(/ffmpeg version ([^\s]+)/);
          resolve({
            available: true,
            version: versionMatch ? versionMatch[1] : 'unknown'
          });
        } else {
          resolve({
            available: false,
            error: 'ffmpeg version check failed'
          });
        }
      });

      process.on('error', (err) => {
        resolve({
          available: false,
          error: err.message
        });
      });
    });
  } catch (err) {
    return {
      available: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    };
  }
}

/**
 * Detect frame rate from video file using ffprobe
 */
async function detectFrameRate(
  ffmpegPath: string,
  videoPath: string
): Promise<number> {
  // ffprobe is in the same directory as ffmpeg
  const ffprobePath = ffmpegPath.replace(/ffmpeg$/, 'ffprobe');

  return new Promise((resolve) => {
    const args = [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=r_frame_rate',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      videoPath
    ];

    const process = spawn(ffprobePath, args);
    let output = '';

    process.stdout.on('data', (data) => {
      output += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0 && output.trim()) {
        // Parse "30/1" or "60/1" format
        const [num, den] = output.trim().split('/').map(Number);
        const fps = Math.round(num / den);
        console.log('[videoCompression] Detected FPS:', fps);
        resolve(fps);
      } else {
        console.warn('[videoCompression] Failed to detect FPS, using default 60');
        resolve(60); // Fallback to 60fps
      }
    });

    process.on('error', () => {
      console.warn('[videoCompression] FFprobe error, using default 60');
      resolve(60); // Fallback to 60fps
    });
  });
}

/**
 * Compress and convert WebM video to MP4 using ffmpeg
 * Uses your proven settings: CRF 35, preset slow, audio 32k for 88-90% compression
 */
export async function compressVideo(
  inputPath: string,
  options: VideoCompressionOptions = {
    crf: 35,
    preset: 'slow',
    audioBitrate: '32k'
  },
  onProgress?: (progress: CompressionProgress) => void
): Promise<VideoCompressionResult> {
  try {
    const ffmpegPath = getFfmpegPath();

    // Verify ffmpeg exists
    if (!fs.existsSync(ffmpegPath)) {
      throw new Error(`ffmpeg binary not found at: ${ffmpegPath}`);
    }

    // Verify input file exists
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file not found: ${inputPath}`);
    }

    // Get original file size
    const originalSize = fs.statSync(inputPath).size;

    // Generate output path (same directory, .mp4 extension, _compressed suffix)
    const parsedPath = path.parse(inputPath);
    const outputPath = path.join(
      parsedPath.dir,
      `${parsedPath.name}_compressed.mp4`
    );

    // Detect input frame rate
    const detectedFps = await detectFrameRate(ffmpegPath, inputPath);
    console.log('[videoCompression] Using FPS:', detectedFps);

    // Build ffmpeg command
    // Convert WebM to MP4 with H.264 video and AAC audio
    // Fixed: Added -fflags +genpts, -r (frame rate), and -vsync cfr to fix duration/frame rate issues
    const args = [
      '-fflags', '+genpts',               // Generate presentation timestamps (fixes WebM duration issues)
      '-i', inputPath,                    // Input file
      '-r', detectedFps.toString(),       // Explicit frame rate (preserves original FPS)
      '-c:v', 'libx264',                  // H.264 video codec
      '-crf', options.crf.toString(),     // Quality level (18-40, lower = better)
      '-preset', options.preset,          // Encoding speed preset
      '-vsync', 'cfr',                    // Constant frame rate (prevents slow motion issues)
      '-c:a', 'aac',                      // AAC audio codec
      '-b:a', options.audioBitrate,       // Audio bitrate
      '-movflags', '+faststart',          // Enable fast start for web playback
      '-y',                               // Overwrite output file
      outputPath
    ];

    console.log('[videoCompression] Starting compression:', {
      input: inputPath,
      output: outputPath,
      options,
      originalSize: `${(originalSize / 1024 / 1024).toFixed(2)} MB`
    });

    return new Promise((resolve) => {
      const process = spawn(ffmpegPath, args);
      let duration = 0;
      let lastProgress = 0;

      // Parse ffmpeg stderr for progress
      process.stderr.on('data', (data) => {
        const output = data.toString();

        // Extract duration (only once at the beginning)
        if (duration === 0) {
          const durationMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2})/);
          if (durationMatch) {
            const hours = parseInt(durationMatch[1]);
            const minutes = parseInt(durationMatch[2]);
            const seconds = parseInt(durationMatch[3]);
            duration = hours * 3600 + minutes * 60 + seconds;
            console.log('[videoCompression] Video duration:', duration, 'seconds');
          }
        }

        // Extract progress
        const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2})/);
        const speedMatch = output.match(/speed=\s*(\S+)/);

        if (timeMatch && duration > 0) {
          const hours = parseInt(timeMatch[1]);
          const minutes = parseInt(timeMatch[2]);
          const seconds = parseInt(timeMatch[3]);
          const currentTime = hours * 3600 + minutes * 60 + seconds;
          const percent = Math.min(Math.round((currentTime / duration) * 100), 100);

          // Only emit progress if it changed significantly (avoid spam)
          if (percent > lastProgress) {
            lastProgress = percent;
            if (onProgress) {
              onProgress({
                percent,
                currentTime: `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
                speed: speedMatch ? speedMatch[1] : '0x'
              });
            }
          }
        }
      });

      process.on('close', (code) => {
        if (code === 0) {
          // Success - get compressed file size
          if (fs.existsSync(outputPath)) {
            const compressedSize = fs.statSync(outputPath).size;
            const compressionRatio = ((1 - compressedSize / originalSize) * 100);

            console.log('[videoCompression] Compression complete:', {
              originalSize: `${(originalSize / 1024 / 1024).toFixed(2)} MB`,
              compressedSize: `${(compressedSize / 1024 / 1024).toFixed(2)} MB`,
              compressionRatio: `${compressionRatio.toFixed(1)}%`
            });

            resolve({
              success: true,
              outputPath,
              originalSize,
              compressedSize,
              compressionRatio
            });
          } else {
            resolve({
              success: false,
              originalSize,
              compressedSize: 0,
              compressionRatio: 0,
              error: 'Output file not created'
            });
          }
        } else {
          resolve({
            success: false,
            originalSize,
            compressedSize: 0,
            compressionRatio: 0,
            error: `ffmpeg process exited with code ${code}`
          });
        }
      });

      process.on('error', (err) => {
        resolve({
          success: false,
          originalSize,
          compressedSize: 0,
          compressionRatio: 0,
          error: err.message
        });
      });
    });
  } catch (err) {
    console.error('[videoCompression] Error:', err);
    return {
      success: false,
      originalSize: 0,
      compressedSize: 0,
      compressionRatio: 0,
      error: err instanceof Error ? err.message : 'Unknown error'
    };
  }
}

/**
 * Replace original file with compressed version
 * Creates a backup of the original file before replacing
 * Changes the file extension to .mp4
 */
export async function replaceWithCompressed(
  originalPath: string,
  compressedPath: string
): Promise<{ success: boolean; newPath?: string; error?: string }> {
  try {
    // Verify files exist
    if (!fs.existsSync(originalPath)) {
      return { success: false, error: 'Original file not found' };
    }
    if (!fs.existsSync(compressedPath)) {
      return { success: false, error: 'Compressed file not found' };
    }

    // Generate new MP4 path (replace extension)
    const parsedPath = path.parse(originalPath);
    const newMp4Path = path.join(parsedPath.dir, `${parsedPath.name}.mp4`);

    // Create backup path
    const backupPath = path.join(
      parsedPath.dir,
      `${parsedPath.name}_backup${parsedPath.ext}`
    );

    // Create backup of original
    fs.renameSync(originalPath, backupPath);
    console.log('[videoCompression] Backup created:', backupPath);

    // Rename compressed file to new MP4 path
    fs.renameSync(compressedPath, newMp4Path);
    console.log('[videoCompression] Compressed file renamed to:', newMp4Path);

    // Delete backup
    fs.unlinkSync(backupPath);
    console.log('[videoCompression] Backup deleted');

    return { success: true, newPath: newMp4Path };
  } catch (err) {
    console.error('[videoCompression] Error replacing file:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    };
  }
}
