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

function getFfprobePath(): string {
  // First try the default path from ffprobe-static
  let ffprobePath = ffprobeStatic.path;

  // In development, ffprobe-static.path should work correctly
  // In production, we need to resolve it relative to the app
  if (!fs.existsSync(ffprobePath)) {
    // Try to resolve relative to app path
    const appPath = app.getAppPath();
    // Replace node_modules with the actual location in the app bundle
    const relativePath = ffprobePath.split('node_modules')[1];
    if (relativePath) {
      ffprobePath = path.join(appPath, 'node_modules', relativePath);
    }
  }

  console.log('[videoMetadata] Using ffprobe path:', ffprobePath);
  return ffprobePath;
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
