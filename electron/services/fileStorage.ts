import { app } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { generateVideoThumbnail } from './videoThumbnail';
import { getVideoMetadata } from './videoMetadata';

const execFileAsync = promisify(execFile);

// Lazy getter to ensure app.setPath() has been called before accessing userData
// This is necessary because this module is imported before main.ts sets the path
export function getMediaDir(): string {
  return path.join(app.getPath('userData'), 'media');
}

export async function ensureMediaDirs(): Promise<void> {
  const mediaDir = getMediaDir();
  const dirs = [
    path.join(mediaDir, 'audio'),
    path.join(mediaDir, 'images'),
    path.join(mediaDir, 'videos'),
    path.join(mediaDir, 'audios'),           // recording-level audio attachments
    path.join(mediaDir, 'duration_images'),
    path.join(mediaDir, 'duration_videos'),
    path.join(mediaDir, 'duration_audios'),  // duration-level audio attachments
    path.join(mediaDir, 'screen_recordings'), // screen recordings
  ];

  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
  }

  console.log('Media directories ensured at:', mediaDir);
}

export async function saveAudioFile(
  recordingId: number,
  audioBuffer: ArrayBuffer,
  filename: string
): Promise<string> {
  const dir = path.join(getMediaDir(), 'audio', String(recordingId));
  await fs.mkdir(dir, { recursive: true });

  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, Buffer.from(audioBuffer));

  console.log('Audio saved to:', filePath);
  return filePath;
}

export async function getAudioPath(recordingId: number): Promise<string | null> {
  const dir = path.join(getMediaDir(), 'audio', String(recordingId));

  try {
    const files = await fs.readdir(dir);
    const audioFile = files.find(f =>
      f.endsWith('.webm') || f.endsWith('.mp3') || f.endsWith('.wav') || f.endsWith('.ogg')
    );

    return audioFile ? path.join(dir, audioFile) : null;
  } catch {
    return null;
  }
}

export async function getAudioBuffer(recordingId: number): Promise<ArrayBuffer | null> {
  const audioPath = await getAudioPath(recordingId);
  if (!audioPath) return null;

  try {
    const buffer = await fs.readFile(audioPath);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  } catch (error) {
    console.error('Failed to read audio file:', error);
    return null;
  }
}

export async function saveImageFile(
  recordingId: number,
  sourcePath: string
): Promise<{ filePath: string; thumbnailPath: string | null }> {
  const dir = path.join(getMediaDir(), 'images', String(recordingId));
  const thumbDir = path.join(dir, 'thumbnails');
  await fs.mkdir(thumbDir, { recursive: true });

  const ext = path.extname(sourcePath);
  const uuid = uuidv4();
  const filePath = path.join(dir, `${uuid}${ext}`);

  // Copy file
  await fs.copyFile(sourcePath, filePath);
  console.log('Image saved to:', filePath);

  // For now, we'll use the original as thumbnail
  // TODO: Generate actual thumbnail with sharp library
  const thumbnailPath = filePath;

  return { filePath, thumbnailPath };
}

export async function saveImageFromBuffer(
  recordingId: number,
  imageBuffer: ArrayBuffer,
  extension: string = 'png'
): Promise<{ filePath: string; thumbnailPath: string | null }> {
  const dir = path.join(getMediaDir(), 'images', String(recordingId));
  const thumbDir = path.join(dir, 'thumbnails');
  await fs.mkdir(thumbDir, { recursive: true });

  const uuid = uuidv4();
  const filePath = path.join(dir, `${uuid}.${extension}`);

  // Write buffer directly to file
  await fs.writeFile(filePath, Buffer.from(imageBuffer));
  console.log('Image saved from clipboard to:', filePath);

  // Use original as thumbnail for now
  const thumbnailPath = filePath;

  return { filePath, thumbnailPath };
}

export async function saveVideoFile(
  recordingId: number,
  sourcePath: string
): Promise<{ filePath: string; thumbnailPath: string | null; duration: number | null }> {
  const dir = path.join(getMediaDir(), 'videos', String(recordingId));
  const thumbDir = path.join(dir, 'thumbnails');
  await fs.mkdir(thumbDir, { recursive: true });

  const ext = path.extname(sourcePath);
  const uuid = uuidv4();
  const filePath = path.join(dir, `${uuid}${ext}`);

  // Copy file
  await fs.copyFile(sourcePath, filePath);
  console.log('Video saved to:', filePath);

  // Generate thumbnail using canvas-based approach
  const thumbPath = path.join(thumbDir, `${uuid}_thumb.png`);
  const thumbnailPath = await generateVideoThumbnail(filePath, thumbPath);

  // Extract video duration from metadata
  const metadata = await getVideoMetadata(filePath);
  const duration = metadata.duration;
  console.log(`[FileStorage] Video duration: ${duration}s`);

  return { filePath, thumbnailPath, duration };
}

export async function saveVideoFromBuffer(
  recordingId: number,
  videoBuffer: ArrayBuffer,
  extension: string = 'mp4'
): Promise<{ filePath: string; thumbnailPath: string | null; duration: number | null }> {
  const dir = path.join(getMediaDir(), 'videos', String(recordingId));
  const thumbDir = path.join(dir, 'thumbnails');
  await fs.mkdir(thumbDir, { recursive: true });

  const uuid = uuidv4();
  const filePath = path.join(dir, `${uuid}.${extension}`);

  // Write buffer directly to file
  await fs.writeFile(filePath, Buffer.from(videoBuffer));
  console.log('Video saved from clipboard to:', filePath);

  // Generate thumbnail using canvas-based approach
  const thumbPath = path.join(thumbDir, `${uuid}_thumb.png`);
  const thumbnailPath = await generateVideoThumbnail(filePath, thumbPath);

  // Extract video duration from metadata
  const metadata = await getVideoMetadata(filePath);
  const duration = metadata.duration;
  console.log(`[FileStorage] Video duration: ${duration}s`);

  return { filePath, thumbnailPath, duration };
}

function getFFmpegPath(): string {
  if (!app.isPackaged) {
    const appPath = app.getAppPath();
    return path.join(appPath, 'node_modules', 'ffmpeg-static', 'ffmpeg');
  }

  return path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', 'ffmpeg');
}

/**
 * Verify file is fully written and readable before FFprobe attempts to read it.
 * Uses exponential backoff to handle OS-level file I/O delays.
 */
async function verifyFileReady(
  filePath: string,
  expectedSize: number,
  maxRetries: number = 5
): Promise<boolean> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // 1. Check file exists
      const stats = await fs.stat(filePath);

      // 2. Verify size matches (file write complete)
      if (stats.size !== expectedSize) {
        console.warn(
          `[FileStorage] File size mismatch attempt ${attempt + 1}: ` +
          `expected ${expectedSize}, got ${stats.size}`
        );
        await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
        continue;
      }

      // 3. Verify file is readable (no exclusive locks)
      const fd = await fs.open(filePath, 'r');
      await fd.close();

      console.log(`[FileStorage] ✓ File verified ready on attempt ${attempt + 1}`);
      return true;
    } catch (error) {
      console.warn(
        `[FileStorage] Verification attempt ${attempt + 1} failed:`,
        error instanceof Error ? error.message : error
      );

      // Exponential backoff: 100ms, 200ms, 400ms, 800ms, 1600ms
      await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt)));
    }
  }

  console.error(`[FileStorage] ✗ File verification failed after ${maxRetries} attempts`);
  return false;
}

export async function saveScreenRecording(
  recordingId: number,
  videoBuffer: ArrayBuffer,
  resolution: string,
  fps: number,
  fallbackDurationMs?: number
): Promise<{
  filePath: string;
  thumbnailPath: string | null;
  duration: number | null;
  fileSize: number;
  durationSource: 'ffprobe' | 'fallback' | 'failed';
  extractionError?: string;
  usedFallback: boolean;
}> {
  const dir = path.join(getMediaDir(), 'screen_recordings', String(recordingId));
  const thumbDir = path.join(dir, 'thumbnails');
  await fs.mkdir(thumbDir, { recursive: true });

  const uuid = uuidv4();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `screen_${resolution}_${fps}fps_${timestamp}.webm`;
  const filePath = path.join(dir, filename);

  // Write buffer to file
  const buffer = Buffer.from(videoBuffer);
  await fs.writeFile(filePath, buffer);

  const fileSize = buffer.length;
  console.log('Screen recording saved to:', filePath, `(${fileSize} bytes)`);

  // Verify file is fully written and readable
  const fileReady = await verifyFileReady(filePath, fileSize);

  if (!fileReady) {
    console.error('[FileStorage] ✗ File verification failed - FFprobe will likely fail');
  } else {
    console.log('[FileStorage] ✓ File verified ready for FFprobe');
  }

  // Generate thumbnail using canvas-based approach
  const thumbPath = path.join(thumbDir, `${uuid}_thumb.png`);
  const thumbnailPath = await generateVideoThumbnail(filePath, thumbPath);

  // Extract duration with enhanced error handling
  let duration: number | null = null;
  let durationSource: 'ffprobe' | 'fallback' | 'failed' = 'failed';
  let extractionError: string | undefined;
  let usedFallback = false;

  try {
    const metadata = await getVideoMetadata(filePath, fallbackDurationMs);

    if (metadata.duration !== null) {
      duration = metadata.duration;
      durationSource = metadata.source || 'ffprobe';
      usedFallback = metadata.source === 'fallback';

      if (usedFallback) {
        console.warn('[FileStorage] ⚠️  Using fallback duration:', duration, 's');
        extractionError = metadata.error;
      } else {
        console.log('[FileStorage] ✓ FFprobe extraction successful:', duration, 's');
      }
    } else {
      extractionError = metadata.error || 'Unknown FFprobe error';
      console.error('[FileStorage] ✗ Duration extraction completely failed');
    }
  } catch (err) {
    extractionError = err instanceof Error ? err.message : String(err);
    console.error('[FileStorage] Exception during duration extraction:', extractionError);
  }

  // Final fallback: use client duration if everything failed
  if (duration === null && fallbackDurationMs) {
    duration = Math.floor(fallbackDurationMs / 1000);
    durationSource = 'fallback';
    usedFallback = true;
    console.warn('[FileStorage] ⚠️  Using client-provided fallback:', duration, 's');
  }

  console.log('[FileStorage] ===== DURATION EXTRACTION SUMMARY =====');
  console.log('[FileStorage] File:', filePath.split('/').pop());
  console.log('[FileStorage] Size:', fileSize, 'bytes');
  console.log('[FileStorage] Duration:', duration, 's');
  console.log('[FileStorage] Source:', durationSource);
  console.log('[FileStorage] Used Fallback:', usedFallback);
  console.log('[FileStorage] Error:', extractionError || 'none');
  console.log('[FileStorage] ==========================================');

  return {
    filePath,
    thumbnailPath,
    duration,
    fileSize,
    durationSource,
    extractionError,
    usedFallback
  };
}

export async function finalizeScreenRecordingFile(
  recordingId: number,
  sourcePath: string,
  resolution: string,
  fps: number,
  fallbackDurationMs?: number,
  audioBuffer?: ArrayBuffer,
  audioBitrate?: '32k' | '64k' | '128k',
  audioChannels?: 1 | 2
): Promise<{
  filePath: string;
  thumbnailPath: string | null;
  duration: number | null;
  fileSize: number;
  durationSource: 'ffprobe' | 'fallback' | 'failed';
  extractionError?: string;
  usedFallback: boolean;
}> {
  const dir = path.join(getMediaDir(), 'screen_recordings', String(recordingId));
  const thumbDir = path.join(dir, 'thumbnails');
  await fs.mkdir(thumbDir, { recursive: true });

  const ext = path.extname(sourcePath) || '.mov';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `screen_${resolution}_${fps}fps_${timestamp}${ext}`;
  const filePath = path.join(dir, filename);

  if (sourcePath !== filePath) {
    try {
      await fs.rename(sourcePath, filePath);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'EXDEV') {
        await fs.copyFile(sourcePath, filePath);
        await fs.unlink(sourcePath);
      } else {
        throw error;
      }
    }
  }

  if (audioBuffer && audioBuffer.byteLength > 0) {
    const tempDir = path.join(os.tmpdir(), `screen-recording-audio-${uuidv4()}`);
    try {
      await fs.mkdir(tempDir, { recursive: true });
      const audioPath = path.join(tempDir, 'audio.webm');
      await fs.writeFile(audioPath, Buffer.from(audioBuffer));

      const muxedPath = path.join(tempDir, `muxed${ext}`);
      const ffmpegPath = getFFmpegPath();
      const bitrate = audioBitrate || '128k';
      const channels = audioChannels || 2;

      console.log('[FileStorage] Muxing audio into screen recording:', {
        bitrate,
        channels
      });

      await execFileAsync(ffmpegPath, [
        '-i', filePath,
        '-i', audioPath,
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', bitrate,
        '-ac', String(channels),
        '-movflags', '+faststart',
        '-y',
        muxedPath
      ]);

      await fs.copyFile(muxedPath, filePath);
      console.log('[FileStorage] ✓ Audio mux completed');
    } catch (error) {
      console.error('[FileStorage] Failed to mux audio into screen recording:', error);
    } finally {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  const stats = await fs.stat(filePath);
  const fileSize = stats.size;

  if (fileSize === 0) {
    throw new Error('Captured file is empty');
  }

  const fileReady = await verifyFileReady(filePath, fileSize);
  if (!fileReady) {
    console.error('[FileStorage] ✗ File verification failed - FFprobe may fail');
  } else {
    console.log('[FileStorage] ✓ File verified ready for FFprobe');
  }

  const uuid = uuidv4();
  const thumbPath = path.join(thumbDir, `${uuid}_thumb.png`);
  const thumbnailPath = await generateVideoThumbnail(filePath, thumbPath);

  let duration: number | null = null;
  let durationSource: 'ffprobe' | 'fallback' | 'failed' = 'failed';
  let extractionError: string | undefined;
  let usedFallback = false;

  try {
    const metadata = await getVideoMetadata(filePath, fallbackDurationMs);

    if (metadata.duration !== null) {
      duration = metadata.duration;
      durationSource = metadata.source || 'ffprobe';
      usedFallback = metadata.source === 'fallback';

      if (usedFallback) {
        console.warn('[FileStorage] ⚠️  Using fallback duration:', duration, 's');
        extractionError = metadata.error;
      } else {
        console.log('[FileStorage] ✓ FFprobe extraction successful:', duration, 's');
      }
    } else {
      extractionError = metadata.error || 'Unknown FFprobe error';
      console.error('[FileStorage] ✗ Duration extraction completely failed');
    }
  } catch (err) {
    extractionError = err instanceof Error ? err.message : String(err);
    console.error('[FileStorage] Exception during duration extraction:', extractionError);
  }

  if (duration === null && fallbackDurationMs) {
    duration = Math.floor(fallbackDurationMs / 1000);
    durationSource = 'fallback';
    usedFallback = true;
    console.warn('[FileStorage] ⚠️  Using client-provided fallback:', duration, 's');
  }

  console.log('[FileStorage] ===== DURATION EXTRACTION SUMMARY =====');
  console.log('[FileStorage] File:', filePath.split('/').pop());
  console.log('[FileStorage] Size:', fileSize, 'bytes');
  console.log('[FileStorage] Duration:', duration, 's');
  console.log('[FileStorage] Source:', durationSource);
  console.log('[FileStorage] Used Fallback:', usedFallback);
  console.log('[FileStorage] Error:', extractionError || 'none');
  console.log('[FileStorage] ==========================================');

  return {
    filePath,
    thumbnailPath,
    duration,
    fileSize,
    durationSource,
    extractionError,
    usedFallback
  };
}

export async function saveDurationImageFromBuffer(
  durationId: number,
  imageBuffer: ArrayBuffer,
  extension: string = 'png'
): Promise<{ filePath: string; thumbnailPath: string | null }> {
  const dir = path.join(getMediaDir(), 'duration_images', String(durationId));
  const thumbDir = path.join(dir, 'thumbnails');
  await fs.mkdir(thumbDir, { recursive: true });

  const uuid = uuidv4();
  const filePath = path.join(dir, `${uuid}.${extension}`);

  // Write buffer directly to file
  await fs.writeFile(filePath, Buffer.from(imageBuffer));
  console.log('Duration image saved from clipboard to:', filePath);

  // Use original as thumbnail for now
  const thumbnailPath = filePath;

  return { filePath, thumbnailPath };
}

export async function deleteDurationImages(durationId: number): Promise<void> {
  const dir = path.join(getMediaDir(), 'duration_images', String(durationId));
  try {
    await fs.rm(dir, { recursive: true, force: true });
    console.log('Deleted duration images directory:', dir);
  } catch {
    // Directory may not exist, ignore
  }
}

export async function saveDurationVideoFromBuffer(
  durationId: number,
  videoBuffer: ArrayBuffer,
  extension: string = 'mp4'
): Promise<{ filePath: string; thumbnailPath: string | null; duration: number | null }> {
  const dir = path.join(getMediaDir(), 'duration_videos', String(durationId));
  const thumbDir = path.join(dir, 'thumbnails');
  await fs.mkdir(thumbDir, { recursive: true });

  const uuid = uuidv4();
  const filePath = path.join(dir, `${uuid}.${extension}`);

  // Write buffer directly to file
  await fs.writeFile(filePath, Buffer.from(videoBuffer));
  console.log('Duration video saved from clipboard to:', filePath);

  // Generate thumbnail using canvas-based approach
  const thumbPath = path.join(thumbDir, `${uuid}_thumb.png`);
  const thumbnailPath = await generateVideoThumbnail(filePath, thumbPath);

  // Extract video duration from metadata
  const metadata = await getVideoMetadata(filePath);
  const duration = metadata.duration;
  console.log(`[FileStorage] Video duration: ${duration}s`);

  return { filePath, thumbnailPath, duration };
}

export async function saveDurationVideoFromFile(
  durationId: number,
  sourcePath: string
): Promise<{ filePath: string; thumbnailPath: string | null; duration: number | null }> {
  const dir = path.join(getMediaDir(), 'duration_videos', String(durationId));
  const thumbDir = path.join(dir, 'thumbnails');
  await fs.mkdir(thumbDir, { recursive: true });

  const ext = path.extname(sourcePath);
  const uuid = uuidv4();
  const filePath = path.join(dir, `${uuid}${ext}`);

  // Copy file
  await fs.copyFile(sourcePath, filePath);
  console.log('Duration video saved from file to:', filePath);

  // Generate thumbnail using canvas-based approach
  const thumbPath = path.join(thumbDir, `${uuid}_thumb.png`);
  const thumbnailPath = await generateVideoThumbnail(filePath, thumbPath);

  // Extract video duration from metadata
  const metadata = await getVideoMetadata(filePath);
  const duration = metadata.duration;
  console.log(`[FileStorage] Video duration: ${duration}s`);

  return { filePath, thumbnailPath, duration };
}

export async function deleteDurationVideos(durationId: number): Promise<void> {
  const dir = path.join(getMediaDir(), 'duration_videos', String(durationId));
  try {
    await fs.rm(dir, { recursive: true, force: true });
    console.log('Deleted duration videos directory:', dir);
  } catch {
    // Directory may not exist, ignore
  }
}

// Duration Audio functions
export async function saveDurationAudioFromBuffer(
  durationId: number,
  audioBuffer: ArrayBuffer,
  extension: string = 'webm'
): Promise<{ filePath: string; duration: number | null }> {
  const dir = path.join(getMediaDir(), 'duration_audios', String(durationId));
  await fs.mkdir(dir, { recursive: true });

  const uuid = uuidv4();
  const filePath = path.join(dir, `${uuid}.${extension}`);

  await fs.writeFile(filePath, Buffer.from(audioBuffer));
  console.log('Duration audio saved to:', filePath);

  return { filePath, duration: null };
}

export async function deleteDurationAudios(durationId: number): Promise<void> {
  const dir = path.join(getMediaDir(), 'duration_audios', String(durationId));
  try {
    await fs.rm(dir, { recursive: true, force: true });
    console.log('Deleted duration audios directory:', dir);
  } catch {
    // Directory may not exist, ignore
  }
}

// Recording-level Audio Attachment functions
export async function saveAudioAttachmentFromBuffer(
  recordingId: number,
  audioBuffer: ArrayBuffer,
  extension: string = 'webm'
): Promise<{ filePath: string; duration: number | null }> {
  const dir = path.join(getMediaDir(), 'audios', String(recordingId));
  await fs.mkdir(dir, { recursive: true });

  const uuid = uuidv4();
  const filePath = path.join(dir, `${uuid}.${extension}`);

  await fs.writeFile(filePath, Buffer.from(audioBuffer));
  console.log('Audio attachment saved to:', filePath);

  return { filePath, duration: null };
}

export async function deleteRecordingAudios(recordingId: number): Promise<void> {
  const dir = path.join(getMediaDir(), 'audios', String(recordingId));
  try {
    await fs.rm(dir, { recursive: true, force: true });
    console.log('Deleted recording audios directory:', dir);
  } catch {
    // Directory may not exist, ignore
  }
}

export async function deleteFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
    console.log('Deleted file:', filePath);
  } catch (error) {
    console.error('Failed to delete file:', filePath, error);
  }
}

export async function deleteRecordingMedia(recordingId: number): Promise<void> {
  const mediaDir = getMediaDir();
  const audiDir = path.join(mediaDir, 'audio', String(recordingId));
  const imagesDir = path.join(mediaDir, 'images', String(recordingId));
  const videosDir = path.join(mediaDir, 'videos', String(recordingId));
  const audiosDir = path.join(mediaDir, 'audios', String(recordingId)); // audio attachments
  const screenRecordingsDir = path.join(mediaDir, 'screen_recordings', String(recordingId)); // screen recordings

  for (const dir of [audiDir, imagesDir, videosDir, audiosDir, screenRecordingsDir]) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
      console.log('Deleted directory:', dir);
    } catch {
      // Directory may not exist, ignore
    }
  }
}

export function getFileUrl(filePath: string): string {
  // Convert to file:// URL for use in renderer
  return `file://${filePath}`;
}
