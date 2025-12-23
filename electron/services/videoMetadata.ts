import ffprobeStatic from 'ffprobe-static';
import ffprobe from 'ffprobe';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';

export interface VideoMetadata {
  duration: number | null;  // Duration in seconds
  width?: number;
  height?: number;
  fps?: number;
  codec?: string;
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

export async function getVideoMetadata(filePath: string): Promise<VideoMetadata> {
  try {
    const ffprobePath = getFfprobePath();

    // Verify ffprobe exists before trying to use it
    if (!fs.existsSync(ffprobePath)) {
      console.error('[videoMetadata] ffprobe not found at:', ffprobePath);
      console.error('[videoMetadata] ffprobe-static.path:', ffprobeStatic.path);
      console.error('[videoMetadata] app.getAppPath():', app.getAppPath());
      throw new Error(`ffprobe binary not found at: ${ffprobePath}`);
    }

    const info = await ffprobe(filePath, { path: ffprobePath });

    // Try to get duration from streams first, then format
    const duration = info.streams[0]?.duration || info.format?.duration || null;

    // Get video stream metadata
    const videoStream = info.streams.find((s: any) => s.codec_type === 'video');

    return {
      duration: duration ? Math.floor(parseFloat(duration.toString())) : null,
      width: videoStream?.width,
      height: videoStream?.height,
      fps: videoStream?.r_frame_rate ? parseFloat(videoStream.r_frame_rate.split('/')[0]) / parseFloat(videoStream.r_frame_rate.split('/')[1]) : undefined,
      codec: videoStream?.codec_name,
    };
  } catch (err) {
    console.error('[videoMetadata] Error extracting metadata from:', filePath);
    console.error('[videoMetadata] Error details:', err);
    return { duration: null };
  }
}
