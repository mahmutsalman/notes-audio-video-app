import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';

const execFileAsync = promisify(execFile);

function getFFmpegPath(): string {
  if (!app.isPackaged) {
    return path.join(app.getAppPath(), 'node_modules', 'ffmpeg-static', 'ffmpeg');
  }
  return path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', 'ffmpeg');
}

/**
 * Convert a single .webm audio file to .m4a (AAC 128k).
 * Writes the .m4a alongside the original, verifies it, then deletes the .webm.
 * Returns the new .m4a path.
 */
export async function convertWebmToM4a(inputPath: string): Promise<string> {
  const parsed = path.parse(inputPath);
  const outputPath = path.join(parsed.dir, `${parsed.name}.m4a`);

  console.log(`[AudioConverter] Converting: ${inputPath}`);

  await execFileAsync(getFFmpegPath(), [
    '-i', inputPath,
    '-c:a', 'aac',
    '-b:a', '128k',
    '-y',
    outputPath,
  ]);

  // Verify output exists and is non-empty
  const stat = await fs.stat(outputPath);
  if (stat.size === 0) {
    throw new Error(`Conversion produced empty file: ${outputPath}`);
  }

  // Delete original .webm
  await fs.unlink(inputPath);
  console.log(`[AudioConverter] Done: ${outputPath} (${(stat.size / 1024).toFixed(0)} KB)`);

  return outputPath;
}

/**
 * Convert a WebM audio buffer to M4A (AAC 128k) in-memory.
 * Writes a temp .webm, runs ffmpeg, reads the .m4a, cleans up, and returns the buffer.
 */
export async function convertWebmBufferToM4a(webmBuffer: ArrayBuffer): Promise<Buffer> {
  const tmpDir = app.getPath('temp');
  const id = `audio_convert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tmpWebm = path.join(tmpDir, `${id}.webm`);
  const tmpM4a = path.join(tmpDir, `${id}.m4a`);

  try {
    await fs.writeFile(tmpWebm, Buffer.from(webmBuffer));

    await execFileAsync(getFFmpegPath(), [
      '-i', tmpWebm,
      '-c:a', 'aac',
      '-b:a', '128k',
      '-y',
      tmpM4a,
    ]);

    const stat = await fs.stat(tmpM4a);
    if (stat.size === 0) {
      throw new Error('FFmpeg produced an empty m4a file');
    }

    const m4aBuffer = await fs.readFile(tmpM4a);
    return m4aBuffer;
  } finally {
    // Clean up temp files
    await fs.unlink(tmpWebm).catch(() => {});
    await fs.unlink(tmpM4a).catch(() => {});
  }
}
