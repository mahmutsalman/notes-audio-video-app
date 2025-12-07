import { app } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { generateVideoThumbnail } from './videoThumbnail';

const MEDIA_DIR = path.join(app.getPath('userData'), 'media');

export async function ensureMediaDirs(): Promise<void> {
  const dirs = [
    path.join(MEDIA_DIR, 'audio'),
    path.join(MEDIA_DIR, 'images'),
    path.join(MEDIA_DIR, 'videos'),
  ];

  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
  }

  console.log('Media directories ensured at:', MEDIA_DIR);
}

export function getMediaDir(): string {
  return MEDIA_DIR;
}

export async function saveAudioFile(
  recordingId: number,
  audioBuffer: ArrayBuffer,
  filename: string
): Promise<string> {
  const dir = path.join(MEDIA_DIR, 'audio', String(recordingId));
  await fs.mkdir(dir, { recursive: true });

  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, Buffer.from(audioBuffer));

  console.log('Audio saved to:', filePath);
  return filePath;
}

export async function getAudioPath(recordingId: number): Promise<string | null> {
  const dir = path.join(MEDIA_DIR, 'audio', String(recordingId));

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

export async function saveImageFile(
  recordingId: number,
  sourcePath: string
): Promise<{ filePath: string; thumbnailPath: string | null }> {
  const dir = path.join(MEDIA_DIR, 'images', String(recordingId));
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
  const dir = path.join(MEDIA_DIR, 'images', String(recordingId));
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
  const dir = path.join(MEDIA_DIR, 'videos', String(recordingId));
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

  const duration = null; // TODO: Get duration if needed

  return { filePath, thumbnailPath, duration };
}

export async function saveVideoFromBuffer(
  recordingId: number,
  videoBuffer: ArrayBuffer,
  extension: string = 'mp4'
): Promise<{ filePath: string; thumbnailPath: string | null; duration: number | null }> {
  const dir = path.join(MEDIA_DIR, 'videos', String(recordingId));
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

  const duration = null; // TODO: Get duration if needed

  return { filePath, thumbnailPath, duration };
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
  const audiDir = path.join(MEDIA_DIR, 'audio', String(recordingId));
  const imagesDir = path.join(MEDIA_DIR, 'images', String(recordingId));
  const videosDir = path.join(MEDIA_DIR, 'videos', String(recordingId));

  for (const dir of [audiDir, imagesDir, videosDir]) {
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
