import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { app } from 'electron';
import { appendExtendLog } from './extendLogger';

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
  totalSizeBytes?: number;
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
  frameRate?: string;      // e.g., '10'
  profile?: string;        // e.g., 'High', 'Main'
  level?: string;          // e.g., '4.0'
  encoder?: string;        // e.g., 'libx264'
  width?: number;
  height?: number;
}

interface AudioMatchOptions {
  includeAudio: boolean;
  forceSilent?: boolean;
  channels?: number;
  sampleRate?: number;
}

type AspectMode = 'letterbox' | 'crop';

function buildAspectFilter(targetWidth: number, targetHeight: number, mode: AspectMode): string {
  if (mode === 'crop') {
    return [
      `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase`,
      `crop=${targetWidth}:${targetHeight}`
    ].join(',');
  }

  return [
    `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease`,
    `pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2`
  ].join(',');
}

async function normalizeMergedOutput(
  inputPath: string,
  outputPath: string,
  outputFormat: 'webm' | 'mp4',
  compressionOptions: VideoCompressionOptions,
  targetFrameRate?: string,
  audioMatch?: AudioMatchOptions
): Promise<void> {
  const ffmpegPath = getFFmpegPath();
  const isWebmTarget = outputFormat === 'webm';
  const videoCodec = isWebmTarget ? 'libvpx-vp9' : 'libx264';
  const audioEnabled = audioMatch?.includeAudio !== false;
  const audioChannels = audioMatch?.channels;
  const audioSampleRate = audioMatch?.sampleRate;
  const videoFilter = targetFrameRate
    ? `fps=${targetFrameRate},setpts=PTS-STARTPTS`
    : 'setpts=PTS-STARTPTS';
  const audioFilter = 'asetpts=PTS-STARTPTS,aresample=async=1:first_pts=0';
  const webmCrf = Math.min(63, Math.max(4, compressionOptions.crf));

  const args: string[] = ['-fflags', '+genpts', '-i', inputPath, '-map', '0:v:0'];

  if (audioEnabled) {
    args.push('-map', '0:a:0?');
  }

  args.push('-vf', videoFilter, '-c:v', videoCodec);

  if (targetFrameRate) {
    args.push('-vsync', 'cfr', '-r', targetFrameRate);
  }

  if (isWebmTarget) {
    args.push('-crf', webmCrf.toString(), '-b:v', '0');
  } else {
    args.push('-crf', compressionOptions.crf.toString(), '-preset', compressionOptions.preset, '-pix_fmt', 'yuv420p');
  }

  if (audioEnabled) {
    args.push('-af', audioFilter);

    if (audioChannels) {
      args.push('-ac', String(audioChannels));
    }
    if (audioSampleRate) {
      args.push('-ar', String(audioSampleRate));
    }

    if (isWebmTarget) {
      args.push('-c:a', 'libopus', '-b:a', compressionOptions.audioBitrate);
    } else {
      args.push('-c:a', 'aac', '-b:a', compressionOptions.audioBitrate);
    }
  } else {
    args.push('-an');
  }

  if (!isWebmTarget) {
    args.push('-movflags', '+faststart');
  }

  args.push('-shortest', '-y', outputPath);
  await execFileAsync(ffmpegPath, args);
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
  matchParams?: VideoCodecParams,
  audioMatch?: AudioMatchOptions
): Promise<void> {
  console.log('[VideoMerger] Compressing video to', targetFormat);
  const ffmpegPath = getFFmpegPath();

  let args: string[];
  const isWebmTarget = targetFormat === 'webm';
  const targetWidth = matchParams?.width ? Math.floor(matchParams.width / 2) * 2 : undefined;
  const targetHeight = matchParams?.height ? Math.floor(matchParams.height / 2) * 2 : undefined;
  const aspectFilter = targetWidth && targetHeight
    ? buildAspectFilter(targetWidth, targetHeight, 'letterbox')
    : 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
  const videoFilter = `${aspectFilter},setpts=PTS-STARTPTS`;
  const webmCrf = Math.min(63, Math.max(4, options.crf));
  const videoCodec = isWebmTarget
    ? (matchParams?.codec === 'vp8' ? 'libvpx' : 'libvpx-vp9')
    : 'libx264';

  const audioEnabled = audioMatch?.includeAudio !== false;
  const audioChannels = audioMatch?.channels;
  const audioSampleRate = audioMatch?.sampleRate;
  const channelLayout = audioChannels === 1 ? 'mono' : 'stereo';

  if (matchParams) {
    // Match original parameters for stream copy compatibility
    console.log('[VideoMerger] Matching original codec parameters:', matchParams);

    args = [
      '-fflags', '+genpts',
      '-i', inputPath,
    ];

    if (audioEnabled && audioMatch?.forceSilent) {
      args.push(
        '-f', 'lavfi',
        '-i', `anullsrc=channel_layout=${channelLayout}:sample_rate=${audioSampleRate || 48000}`
      );
    }

    args.push(
      '-vf', videoFilter,
      '-c:v', videoCodec,
      '-vsync', 'cfr'
    );

    // Add profile if available (H.264 only)
    if (!isWebmTarget && matchParams.profile) {
      args.push('-profile:v', matchParams.profile);
    }

    // Add level if available (H.264 only)
    if (!isWebmTarget && matchParams.level) {
      args.push('-level', matchParams.level);
    }

    // Add pixel format
    if (matchParams.pixelFormat) {
      args.push('-pix_fmt', matchParams.pixelFormat);
    }

    // Add frame rate
    if (matchParams.frameRate) {
      args.push('-r', matchParams.frameRate);
    }

    // Add bitrate if available, otherwise use CRF
    if (matchParams.bitrate) {
      args.push('-b:v', matchParams.bitrate.toString());
    } else {
      if (isWebmTarget) {
        args.push('-crf', webmCrf.toString(), '-b:v', '0');
      } else {
        args.push('-crf', options.crf.toString(), '-preset', options.preset);
      }
    }

    // Audio settings
    if (audioEnabled) {
      if (audioMatch?.forceSilent) {
        args.push('-map', '0:v:0', '-map', '1:a:0', '-shortest');
      }

      if (audioChannels) {
        args.push('-ac', String(audioChannels));
      }
      if (audioSampleRate) {
        args.push('-ar', String(audioSampleRate));
      }

      args.push('-af', 'asetpts=PTS-STARTPTS,aresample=async=1:first_pts=0');

      if (isWebmTarget) {
        args.push('-c:a', 'libopus', '-b:a', options.audioBitrate);
      } else {
        args.push('-c:a', 'aac', '-b:a', options.audioBitrate, '-movflags', '+faststart');
      }
    } else {
      args.push('-an');
    }
    args.push('-y', outputPath);
  } else {
    // Original behavior - use compression options
    args = [
      '-fflags', '+genpts',
      '-i', inputPath,
    ];

    if (audioEnabled && audioMatch?.forceSilent) {
      args.push(
        '-f', 'lavfi',
        '-i', `anullsrc=channel_layout=${channelLayout}:sample_rate=${audioSampleRate || 48000}`
      );
    }

    args.push(
      '-vf', videoFilter,
      '-c:v', videoCodec,
      '-vsync', 'cfr'
    );

    if (isWebmTarget) {
      args.push('-crf', webmCrf.toString(), '-b:v', '0');
    } else {
      args.push('-crf', options.crf.toString(), '-preset', options.preset, '-pix_fmt', 'yuv420p');
    }

    if (audioEnabled) {
      if (audioMatch?.forceSilent) {
        args.push('-map', '0:v:0', '-map', '1:a:0', '-shortest');
      }

      if (audioChannels) {
        args.push('-ac', String(audioChannels));
      }
      if (audioSampleRate) {
        args.push('-ar', String(audioSampleRate));
      }

      args.push('-af', 'asetpts=PTS-STARTPTS,aresample=async=1:first_pts=0');

      if (isWebmTarget) {
        args.push('-c:a', 'libopus', '-b:a', options.audioBitrate);
      } else {
        args.push('-c:a', 'aac', '-b:a', options.audioBitrate, '-movflags', '+faststart');
      }
    } else {
      args.push('-an');
    }

    args.push('-y', outputPath);
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
  compressionOptions: VideoCompressionOptions,
  audioMatch?: AudioMatchOptions
): Promise<string> {
  console.log('[VideoMerger] Preparing to compress extension to match original format');

  let matchParams: VideoCodecParams | undefined;

  // Step 1: Analyze original video codec params
  try {
    const { getVideoCodecParams } = await import('./videoMetadata');
    matchParams = await getVideoCodecParams(originalPath);
    console.log('[VideoMerger] Original codec params:', matchParams);
    await appendExtendLog('merge:codecParams', { matchParams });
  } catch (error) {
    console.warn('[VideoMerger] Failed to analyze codec params, using defaults:', error);
    await appendExtendLog('merge:codecParamsError', {
      error: error instanceof Error ? error.message : String(error)
    });
    // Falls back to compressionOptions
  }

  // Step 2: Compress extension to match original format
  const compressedExtensionPath = path.join(tempDir, `extension_compressed.${targetFormat}`);
  await compressVideo(extensionPath, compressedExtensionPath, targetFormat, compressionOptions, matchParams, audioMatch);

  // Step 3: Concat the compressed videos
  const outputPath = path.join(tempDir, `output.${targetFormat}`);
  await concatVideos(originalPath, compressedExtensionPath, outputPath);

  return outputPath;
}

/**
 * Re-encode video with timestamp reset and optional audio offset.
 * Used to normalize videos before concatenation to ensure perfect timestamp alignment.
 *
 * @param inputPath - Path to input video
 * @param outputPath - Path to output video
 * @param targetFormat - Target format ('webm' or 'mp4')
 * @param options - Compression options (CRF, preset, audio bitrate)
 * @param matchParams - Codec parameters to match from original video
 * @param audioMatch - Audio matching options
 * @param audioOffsetMs - Optional audio delay in milliseconds
 */
async function reencodeWithTimestampReset(
  inputPath: string,
  outputPath: string,
  targetFormat: 'webm' | 'mp4',
  options: VideoCompressionOptions,
  matchParams: VideoCodecParams,
  audioMatch: AudioMatchOptions,
  audioOffsetMs?: number
): Promise<void> {
  const ffmpegPath = getFFmpegPath();
  const isWebmTarget = targetFormat === 'webm';
  const videoCodec = isWebmTarget ? 'libvpx-vp9' : 'libx264';

  // Video filter: letterbox + timestamp reset
  const targetWidth = matchParams?.width ? Math.floor(matchParams.width / 2) * 2 : undefined;
  const targetHeight = matchParams?.height ? Math.floor(matchParams.height / 2) * 2 : undefined;
  const aspectFilter = targetWidth && targetHeight
    ? buildAspectFilter(targetWidth, targetHeight, 'letterbox')
    : 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
  const videoFilter = `${aspectFilter},setpts=PTS-STARTPTS`;

  // Audio filter: optional delay + timestamp reset + async
  const audioEnabled = audioMatch?.includeAudio !== false;
  let audioFilter = 'asetpts=PTS-STARTPTS,aresample=async=1:first_pts=0';
  if (audioEnabled && audioOffsetMs && audioOffsetMs > 0) {
    audioFilter = `adelay=${audioOffsetMs}:all=1,${audioFilter}`;
  }

  const args: string[] = [
    '-fflags', '+genpts+igndts',  // Generate PTS + ignore input timestamps
    '-i', inputPath,
    '-vf', videoFilter,
    '-c:v', videoCodec
  ];

  // Codec parameters
  if (!isWebmTarget) {
    if (matchParams?.profile) args.push('-profile:v', matchParams.profile);
    if (matchParams?.level) args.push('-level', matchParams.level);
    args.push('-pix_fmt', matchParams?.pixelFormat || 'yuv420p');
  }

  // Frame rate
  if (matchParams?.frameRate) {
    args.push('-r', matchParams.frameRate, '-vsync', 'cfr');
  }

  // Quality
  if (isWebmTarget) {
    const webmCrf = Math.min(63, Math.max(4, options.crf));
    args.push('-crf', webmCrf.toString(), '-b:v', '0');
  } else {
    args.push('-crf', options.crf.toString(), '-preset', options.preset);
  }

  // Audio
  if (audioEnabled) {
    args.push('-af', audioFilter);
    if (audioMatch.channels) args.push('-ac', String(audioMatch.channels));
    if (audioMatch.sampleRate) args.push('-ar', String(audioMatch.sampleRate));

    if (isWebmTarget) {
      args.push('-c:a', 'libopus', '-b:a', options.audioBitrate);
    } else {
      args.push('-c:a', 'aac', '-b:a', options.audioBitrate, '-movflags', '+faststart');
    }
  } else {
    args.push('-an');
  }

  args.push('-y', outputPath);

  return new Promise((resolve, reject) => {
    const process = spawn(ffmpegPath, args);
    let errorOutput = '';

    process.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        console.log('[VideoMerger] Re-encode successful:', outputPath);
        resolve();
      } else {
        console.error('[VideoMerger] Re-encode failed:', errorOutput.slice(-1000));
        reject(new Error(`FFmpeg re-encode failed with code ${code}`));
      }
    });

    process.on('error', reject);
  });
}

/**
 * Re-encode both videos and concatenate them.
 * This ensures perfect timestamp alignment and audio sync by normalizing both videos first.
 *
 * @param originalPath - Path to original video
 * @param extensionPath - Path to extension video
 * @param tempDir - Temporary directory for intermediate files
 * @param targetFormat - Target format for output
 * @param compressionOptions - Compression settings
 * @param matchParams - Codec parameters from original video
 * @param audioMatch - Audio matching options
 * @param audioOffsetMs - Optional audio offset to apply to extension
 */
async function reencodeAndConcat(
  originalPath: string,
  extensionPath: string,
  tempDir: string,
  targetFormat: 'webm' | 'mp4',
  compressionOptions: VideoCompressionOptions,
  matchParams: VideoCodecParams,
  audioMatch: AudioMatchOptions,
  audioOffsetMs?: number
): Promise<string> {
  console.log('[VideoMerger] Re-encoding both videos for perfect timestamp alignment...');

  const normalizedOriginal = path.join(tempDir, `original_norm.${targetFormat}`);
  const normalizedExtension = path.join(tempDir, `extension_norm.${targetFormat}`);

  // Re-encode original (timestamp reset only)
  await appendExtendLog('merge:reencodeOriginal', { file: path.basename(originalPath) });
  await reencodeWithTimestampReset(
    originalPath,
    normalizedOriginal,
    targetFormat,
    compressionOptions,
    matchParams,
    audioMatch
    // No audio offset for original
  );

  // Re-encode extension (timestamp reset + audio offset)
  await appendExtendLog('merge:reencodeExtension', {
    file: path.basename(extensionPath),
    audioOffsetMs
  });
  await reencodeWithTimestampReset(
    extensionPath,
    normalizedExtension,
    targetFormat,
    compressionOptions,
    matchParams,
    audioMatch,
    audioOffsetMs  // Apply audio offset here
  );

  // Concat the normalized videos
  const outputPath = path.join(tempDir, `output.${targetFormat}`);
  await appendExtendLog('merge:concat', {
    original: path.basename(normalizedOriginal),
    extension: path.basename(normalizedExtension)
  });
  await concatVideos(normalizedOriginal, normalizedExtension, outputPath);

  return outputPath;
}

/**
 * Merge two video files using FFmpeg.
 * Handles different formats by compressing the extension to match the original.
 *
 * @param originalPath - Path to the original video file
 * @param extensionSource - ArrayBuffer/Buffer or file path for the extension video
 * @param originalDurationMs - Duration of original in milliseconds
 * @param extensionDurationMs - Duration of extension in milliseconds
 * @param compressionOptions - Optional compression settings (defaults to CRF 35, slow preset)
 * @param cleanupExtensionPath - Whether to cleanup extension file after merge
 * @param audioOffsetMs - Optional audio offset in milliseconds to apply to extension
 * @returns Result with success status, total duration, and output format
 */
export async function mergeVideoFiles(
  originalPath: string,
  extensionSource: ArrayBuffer | Buffer | string,
  originalDurationMs: number,
  extensionDurationMs: number,
  compressionOptions: VideoCompressionOptions = {
    crf: 35,
    preset: 'slow',
    audioBitrate: '32k'
  },
  cleanupExtensionPath: boolean = false,
  audioOffsetMs?: number
): Promise<VideoMergeResult> {
  const startTime = performance.now();
  const tempDir = path.join(os.tmpdir(), `video-merge-${uuidv4()}`);
  const isExtensionPath = typeof extensionSource === 'string';
  const extensionPath = isExtensionPath
    ? extensionSource
    : path.join(tempDir, 'extension.webm');
  let mergeSucceeded = false;
  let originalCopyPath: string | null = null;

  try {
    await appendExtendLog('merge:start', {
      originalFile: path.basename(originalPath),
      extensionType: isExtensionPath ? 'path' : 'buffer',
      originalDurationMs,
      extensionDurationMs,
      compressionOptions
    });
    // Create temp directory
    await fs.mkdir(tempDir, { recursive: true });
    console.log('[VideoMerger] Temp dir:', tempDir);
    await appendExtendLog('merge:tempDir', { tempDir });

    // Step 1: Resolve extension input
    if (isExtensionPath) {
      console.log('[VideoMerger] Step 1: Using extension file path...');
      console.log('[VideoMerger] Extension path:', extensionPath);
      await appendExtendLog('merge:extensionPath', {
        extensionFile: path.basename(extensionPath)
      });
    } else {
      console.log('[VideoMerger] Step 1: Writing extension to temp file...');
      const extensionBuffer = Buffer.from(extensionSource);
      await fs.writeFile(extensionPath, extensionBuffer);
      const extensionSizeMb = extensionBuffer.byteLength / 1024 / 1024;
      console.log(`[VideoMerger] Extension written: ${extensionSizeMb.toFixed(2)} MB`);
      await appendExtendLog('merge:extensionBuffer', {
        extensionFile: path.basename(extensionPath),
        sizeBytes: extensionBuffer.byteLength
      });
    }

    // Step 1.5: Create a stable copy of the original for retries
    const originalExt = path.extname(originalPath) || '.mp4';
    originalCopyPath = path.join(tempDir, `original${originalExt}`);
    await fs.copyFile(originalPath, originalCopyPath);
    console.log('[VideoMerger] Original copied for safe merge:', originalCopyPath);
    await appendExtendLog('merge:originalCopy', {
      originalCopy: path.basename(originalCopyPath)
    });

    // Step 2: Detect formats
    console.log('[VideoMerger] Step 2: Detecting formats...');
    const sourceOriginalPath = originalCopyPath ?? originalPath;
    const originalFormat = await detectFormat(sourceOriginalPath);
    const extensionFormat = await detectFormat(extensionPath);
    console.log(`[VideoMerger] Original format: ${originalFormat}, Extension format: ${extensionFormat}`);

    let outputPath: string;
    let outputFormat: 'webm' | 'mp4';

    const { getVideoMetadata } = await import('./videoMetadata');
    const originalMetadata = await getVideoMetadata(sourceOriginalPath);
    const extensionMetadata = await getVideoMetadata(extensionPath);

    const originalHasAudio = (originalMetadata.audioStreams ?? 0) > 0;
    const extensionHasAudio = (extensionMetadata.audioStreams ?? 0) > 0;
    const audioMatch = originalHasAudio === extensionHasAudio;
    const sizeMatch = !!(
      originalMetadata.width &&
      extensionMetadata.width &&
      originalMetadata.height &&
      extensionMetadata.height &&
      originalMetadata.width === extensionMetadata.width &&
      originalMetadata.height === extensionMetadata.height
    );
    const fpsMatch = !originalMetadata.fps || !extensionMetadata.fps ||
      Math.abs(originalMetadata.fps - extensionMetadata.fps) < 0.5;
    const codecMatch = !originalMetadata.codec || !extensionMetadata.codec ||
      originalMetadata.codec === extensionMetadata.codec;

    const audioMatchOptions: AudioMatchOptions = originalHasAudio
      ? {
          includeAudio: true,
          forceSilent: !extensionHasAudio,
          channels: originalMetadata.audioChannels ?? 2,
          sampleRate: originalMetadata.audioSampleRate ?? 48000
        }
      : { includeAudio: false };
    const targetFrameRate = originalMetadata.fps
      ? String(Math.round(originalMetadata.fps))
      : undefined;

    const canFastConcat = originalFormat === extensionFormat && sizeMatch && fpsMatch && codecMatch && audioMatch;
    await appendExtendLog('merge:metadata', {
      original: {
        duration: originalMetadata.duration,
        width: originalMetadata.width,
        height: originalMetadata.height,
        fps: originalMetadata.fps,
        codec: originalMetadata.codec,
        audioStreams: originalMetadata.audioStreams ?? 0,
        audioChannels: originalMetadata.audioChannels ?? null,
        audioSampleRate: originalMetadata.audioSampleRate ?? null
      },
      extension: {
        duration: extensionMetadata.duration,
        width: extensionMetadata.width,
        height: extensionMetadata.height,
        fps: extensionMetadata.fps,
        codec: extensionMetadata.codec,
        audioStreams: extensionMetadata.audioStreams ?? 0,
        audioChannels: extensionMetadata.audioChannels ?? null,
        audioSampleRate: extensionMetadata.audioSampleRate ?? null
      },
      decision: {
        originalFormat,
        extensionFormat,
        sizeMatch,
        fpsMatch,
        codecMatch,
        audioMatch,
        canFastConcat
      }
    });

    // Step 3: Merge using ALWAYS-REENCODE strategy
    const baseOriginalPath = originalCopyPath ?? originalPath;
    console.log('[VideoMerger] Step 3: Re-encoding both videos for timestamp alignment...');
    await appendExtendLog('merge:strategy', {
      approach: 'always-reencode',
      audioOffsetMs,
      reason: 'Ensures perfect timestamp alignment and audio sync'
    });

    let matchParams: VideoCodecParams | undefined;

    // Analyze original video codec params
    try {
      const { getVideoCodecParams } = await import('./videoMetadata');
      matchParams = await getVideoCodecParams(baseOriginalPath);
      console.log('[VideoMerger] Original codec params:', matchParams);
      await appendExtendLog('merge:codecParams', { matchParams });
    } catch (error) {
      console.warn('[VideoMerger] Failed to analyze codec params, using defaults:', error);
      await appendExtendLog('merge:codecParamsError', {
        error: error instanceof Error ? error.message : String(error)
      });
      matchParams = {
        codec: 'h264',
        pixelFormat: 'yuv420p',
        profile: 'high',
        level: '4.0',
        frameRate: targetFrameRate
      };
    }

    // Set frame rate if not already in params
    if (matchParams && !matchParams.frameRate && targetFrameRate) {
      matchParams.frameRate = targetFrameRate;
    }

    // Always re-encode both videos with timestamp reset
    outputFormat = originalFormat;
    outputPath = await reencodeAndConcat(
      baseOriginalPath,
      extensionPath,
      tempDir,
      originalFormat,
      compressionOptions,
      matchParams!,
      audioMatchOptions,
      audioOffsetMs
    );

    // Step 3.5: NO NORMALIZATION NEEDED
    // Skip normalizeMergedOutput() - already normalized during re-encode
    console.log('[VideoMerger] Step 3.5: Skipping normalization (already done)');
    await appendExtendLog('merge:skipNormalization', {
      reason: 'Videos already normalized during re-encode'
    });

    // Step 4: Replace original file with merged file
    console.log('[VideoMerger] Step 4: Replacing original file...');
    await fs.copyFile(outputPath, originalPath);
    await appendExtendLog('merge:replace', { outputFile: path.basename(originalPath) });

    // Step 4.5: Get final file size
    const finalStat = await fs.stat(originalPath);
    const totalSizeBytes = finalStat.size;
    console.log(`[VideoMerger] Final file size: ${(totalSizeBytes / 1024 / 1024).toFixed(2)} MB`);

    // Step 5: Extract actual duration from merged file
    console.log('[VideoMerger] Step 5: Extracting actual duration...');
    const metadata = await getVideoMetadata(originalPath);
    const calculatedDurationMs = originalDurationMs + extensionDurationMs;
    const actualDurationMs = metadata.duration ? metadata.duration * 1000 : calculatedDurationMs;
    const durationShortfallMs = calculatedDurationMs - actualDurationMs;
    await appendExtendLog('merge:duration', {
      calculatedDurationMs,
      actualDurationMs,
      durationShortfallMs,
      durationSource: metadata.duration !== null ? 'ffprobe' : 'fallback'
    });

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

    // Retry with re-encode if duration didn't increase as expected
    if (metadata.duration && durationShortfallMs > 1000) {
      console.warn('[VideoMerger] Duration shortfall detected, retrying with re-encode...', {
        expectedMs: calculatedDurationMs,
        actualMs: actualDurationMs,
        shortfallMs: durationShortfallMs
      });
      await appendExtendLog('merge:durationShortfall', {
        expectedMs: calculatedDurationMs,
        actualMs: actualDurationMs,
        shortfallMs: durationShortfallMs
      });

      const fallbackOutputPath = await compressAndConcat(
        baseOriginalPath,
        extensionPath,
        tempDir,
        originalFormat,
        compressionOptions,
        audioMatchOptions
      );

      await fs.copyFile(fallbackOutputPath, originalPath);

      const fallbackMetadata = await getVideoMetadata(originalPath);
      const fallbackDurationMs = fallbackMetadata.duration
        ? fallbackMetadata.duration * 1000
        : calculatedDurationMs;

      console.log('[VideoMerger] ===== FALLBACK DURATION DEBUG =====');
      console.log('[VideoMerger] FFprobe result:', {
        filePath: originalPath.split('/').pop(),
        rawMetadata: {
          duration: fallbackMetadata.duration,
          codec: fallbackMetadata.codec,
          width: fallbackMetadata.width,
          height: fallbackMetadata.height
        },
        ffprobeSucceeded: fallbackMetadata.duration !== null,
        ffprobeValue: fallbackMetadata.duration,
        calculatedValue: Math.floor(calculatedDurationMs / 1000),
        actualValue: Math.floor(fallbackDurationMs / 1000),
        usingFFprobe: fallbackMetadata.duration !== null
      });
      console.log('[VideoMerger] ======================================');
      await appendExtendLog('merge:fallbackDuration', {
        calculatedDurationMs,
        actualDurationMs: fallbackDurationMs,
        durationSource: fallbackMetadata.duration !== null ? 'ffprobe' : 'fallback'
      });

      mergeSucceeded = true;
      return {
        success: true,
        totalDurationMs: fallbackDurationMs,
        outputFormat,
        totalSizeBytes,
        outputPath: originalPath
      };
    }

    const totalTime = (performance.now() - startTime) / 1000;

    console.log(`[VideoMerger] TOTAL merge time: ${totalTime.toFixed(2)}s`);
    console.log(`[VideoMerger] Speed: ${((actualDurationMs / 1000) / totalTime).toFixed(1)}x realtime`);
    await appendExtendLog('merge:success', {
      totalDurationMs: actualDurationMs,
      outputFormat,
      totalTimeSec: Number(totalTime.toFixed(2))
    });

    mergeSucceeded = true;
    return {
      success: true,
      totalDurationMs: actualDurationMs, // Use actual duration instead of calculated
      outputFormat,
      totalSizeBytes,
      outputPath: originalPath
    };
  } catch (error) {
    console.error('[VideoMerger] Merge failed:', error);
    await appendExtendLog('merge:error', {
      error: error instanceof Error ? error.message : String(error)
    });

    return {
      success: false,
      totalDurationMs: originalDurationMs,
      outputFormat: 'webm',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  } finally {
    // Cleanup temp files
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    if (cleanupExtensionPath && isExtensionPath && mergeSucceeded) {
      try {
        await fs.rm(extensionPath, { force: true });
        console.log('[VideoMerger] Extension file removed:', extensionPath);
      } catch (cleanupError) {
        console.warn('[VideoMerger] Failed to remove extension file:', cleanupError);
      }
    }
  }
}
