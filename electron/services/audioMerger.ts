import { execFile } from 'child_process';
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
  // In development, use the binary from node_modules
  // app.isPackaged is false during development
  if (!app.isPackaged) {
    // app.getAppPath() returns the project root in dev mode
    const appPath = app.getAppPath();
    const devPath = path.join(appPath, 'node_modules', 'ffmpeg-static', 'ffmpeg');
    console.log('[AudioMerger] App path:', appPath);
    console.log('[AudioMerger] Dev FFmpeg path:', devPath);
    return devPath;
  }

  // In production, the binary is in app.asar.unpacked/node_modules/ffmpeg-static/
  const prodPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', 'ffmpeg');
  console.log('[AudioMerger] Prod FFmpeg path:', prodPath);
  return prodPath;
}

export interface MergeResult {
  success: boolean;
  totalDurationMs: number;
  error?: string;
}

/**
 * Merge two WebM audio files using native FFmpeg with stream copy (no re-encoding).
 *
 * This is FAST because:
 * 1. Native FFmpeg binary (no WASM overhead)
 * 2. Direct filesystem access (no JS↔WASM copies)
 * 3. Stream copy (-c copy) just concatenates bytes
 *
 * @param originalPath - Path to the original audio file
 * @param extensionBuffer - ArrayBuffer of the extension audio
 * @param originalDurationMs - Duration of original in milliseconds
 * @param extensionDurationMs - Duration of extension in milliseconds
 * @returns Result with success status and total duration
 */
export async function mergeAudioFiles(
  originalPath: string,
  extensionBuffer: ArrayBuffer,
  originalDurationMs: number,
  extensionDurationMs: number
): Promise<MergeResult> {
  const startTime = performance.now();
  const tempDir = path.join(os.tmpdir(), `audio-merge-${uuidv4()}`);

  try {
    // Create temp directory
    await fs.mkdir(tempDir, { recursive: true });
    console.log('[AudioMerger] Temp dir:', tempDir);

    // Step 1: Write extension to temp file
    console.log('[AudioMerger] Step 1: Writing extension to temp file...');
    const extensionPath = path.join(tempDir, 'extension.webm');
    await fs.writeFile(extensionPath, Buffer.from(extensionBuffer));
    console.log(`[AudioMerger] Extension written: ${(extensionBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);

    // Step 2: Create concat list file
    console.log('[AudioMerger] Step 2: Creating concat list...');
    const concatListPath = path.join(tempDir, 'concat.txt');
    // FFmpeg concat demuxer requires specific format with escaped paths
    const concatContent = `file '${originalPath.replace(/'/g, "'\\''")}'
file '${extensionPath.replace(/'/g, "'\\''")}'
`;
    await fs.writeFile(concatListPath, concatContent);

    // Step 3: Run FFmpeg with stream copy
    console.log('[AudioMerger] Step 3: Running FFmpeg concat...');
    const outputPath = path.join(tempDir, 'output.webm');
    const ffmpegStart = performance.now();

    const ffmpegBinary = getFFmpegPath();

    await execFileAsync(ffmpegBinary, [
      '-f', 'concat',           // Use concat demuxer
      '-safe', '0',             // Allow any file paths
      '-i', concatListPath,     // Input concat list
      '-c', 'copy',             // Stream copy - NO re-encoding!
      '-y',                     // Overwrite output
      outputPath                // Output file
    ]);

    console.log(`[AudioMerger] FFmpeg completed in ${((performance.now() - ffmpegStart) / 1000).toFixed(2)}s`);

    // Step 4: Replace original with merged file
    console.log('[AudioMerger] Step 4: Replacing original file...');
    await fs.copyFile(outputPath, originalPath);

    // Step 5: Cleanup temp files
    console.log('[AudioMerger] Step 5: Cleaning up...');
    await fs.rm(tempDir, { recursive: true, force: true });

    const totalDurationMs = originalDurationMs + extensionDurationMs;
    const totalTime = (performance.now() - startTime) / 1000;

    console.log(`[AudioMerger] TOTAL merge time: ${totalTime.toFixed(2)}s`);
    console.log(`[AudioMerger] Speed: ${((totalDurationMs / 1000) / totalTime).toFixed(1)}x realtime`);

    return {
      success: true,
      totalDurationMs,
    };
  } catch (error) {
    console.error('[AudioMerger] Merge failed:', error);

    // Cleanup on error
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    return {
      success: false,
      totalDurationMs: originalDurationMs,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
