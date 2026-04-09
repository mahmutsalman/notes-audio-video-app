import { app, BrowserWindow } from 'electron';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { spawn } from 'child_process';

function getFfmpegPath(): string {
  if (!app.isPackaged) {
    return path.join(app.getAppPath(), 'node_modules', 'ffmpeg-static', 'ffmpeg');
  }
  return path.join(
    process.resourcesPath,
    'app.asar.unpacked',
    'node_modules',
    'ffmpeg-static',
    'ffmpeg'
  );
}

/**
 * Generate a thumbnail using FFmpeg — works with all codecs and pixel formats,
 * including OBS MKV files that lack duration metadata.
 *
 * Tries 1s, then 0.5s, then 0s as seek positions to handle very short clips.
 */
async function generateThumbnailWithFFmpeg(
  videoPath: string,
  outputPath: string
): Promise<string | null> {
  const ffmpegPath = getFfmpegPath();
  if (!fsSync.existsSync(ffmpegPath)) {
    console.log('[videoThumbnail] FFmpeg not found at:', ffmpegPath);
    return null;
  }

  // Try multiple seek positions: 1s, 0.5s, 0s (for very short or duration-less files)
  for (const seekSec of [1, 0.5, 0]) {
    const success = await new Promise<boolean>((resolve) => {
      const args = [
        '-ss', String(seekSec),
        '-i', videoPath,
        '-vframes', '1',
        '-vf', 'scale=320:-2',   // 320px wide, height divisible by 2
        '-f', 'image2',
        '-y',
        outputPath,
      ];

      const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        if (code === 0 && fsSync.existsSync(outputPath)) {
          resolve(true);
        } else {
          // Clean up partial output if any
          try { fsSync.unlinkSync(outputPath); } catch {}
          resolve(false);
        }
      });

      proc.on('error', () => resolve(false));

      // Safety timeout per attempt
      setTimeout(() => { proc.kill(); resolve(false); }, 8000);
    });

    if (success) {
      console.log('Video thumbnail saved to:', outputPath, seekSec > 0 ? `(seek ${seekSec}s)` : '(seek 0s)');
      return outputPath;
    }
  }

  console.log('[videoThumbnail] FFmpeg thumbnail failed for:', videoPath, '— trying BrowserWindow fallback');
  return generateThumbnailWithBrowserWindow(videoPath, outputPath);
}

/**
 * Fallback: extract thumbnail via hidden BrowserWindow + HTML5 video + canvas.
 * Works for formats Chromium can decode; fails on unusual pixel formats.
 */
async function generateThumbnailWithBrowserWindow(
  videoPath: string,
  outputPath: string
): Promise<string | null> {
  return new Promise((resolve) => {
    let resolved = false;

    const win = new BrowserWindow({
      show: false,
      width: 320,
      height: 240,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: false,
      },
    });

    const cleanup = () => {
      if (!win.isDestroyed()) win.close();
    };

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.log('[videoThumbnail] BrowserWindow fallback timed out for:', videoPath);
        cleanup();
        resolve(null);
      }
    }, 10000);

    win.webContents.on('console-message', async (_, _level, message) => {
      if (resolved) return;

      if (message.startsWith('data:image/png;base64,')) {
        resolved = true;
        clearTimeout(timeout);
        try {
          const base64 = message.replace('data:image/png;base64,', '');
          await fs.writeFile(outputPath, Buffer.from(base64, 'base64'));
          console.log('Video thumbnail saved to (BrowserWindow):', outputPath);
          cleanup();
          resolve(outputPath);
        } catch {
          cleanup();
          resolve(null);
        }
      } else if (message.startsWith('THUMBNAIL_ERROR')) {
        resolved = true;
        clearTimeout(timeout);
        console.log('[videoThumbnail] BrowserWindow failed for:', videoPath, '-', message);
        cleanup();
        resolve(null);
      }
    });

    const encodedPath = encodeURI(videoPath.replace(/#/g, '%23'));
    const html = `
      <!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
        <video id="video" muted playsinline></video>
        <canvas id="canvas"></canvas>
        <script>
          const video = document.getElementById('video');
          const canvas = document.getElementById('canvas');
          const ctx = canvas.getContext('2d');

          function captureFrame() {
            try {
              canvas.width = video.videoWidth || 320;
              canvas.height = video.videoHeight || 240;
              ctx.drawImage(video, 0, 0);
              const dataUrl = canvas.toDataURL('image/png');
              console.log(dataUrl);
            } catch (e) {
              console.log('THUMBNAIL_ERROR:draw_failed');
            }
          }

          video.addEventListener('loadedmetadata', () => {
            const dur = isFinite(video.duration) ? video.duration : 0;
            video.currentTime = Math.min(1, dur > 0 ? dur * 0.1 : 0);
          });

          video.addEventListener('seeked', captureFrame);
          video.addEventListener('loadeddata', () => {
            // If duration is unknown, capture the first available frame
            if (!isFinite(video.duration)) captureFrame();
          });
          video.addEventListener('error', () => {
            const err = video.error;
            console.log('THUMBNAIL_ERROR:' + (err ? err.code + ':' + err.message : 'unknown'));
          });

          video.src = 'file://${encodedPath}';
          video.load();
        </script>
      </body></html>
    `;

    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  });
}

/**
 * Public API — unchanged signature so callers don't need to change.
 */
export async function generateVideoThumbnail(
  videoPath: string,
  outputPath: string,
  seekTime: number = 1
): Promise<string | null> {
  return generateThumbnailWithFFmpeg(videoPath, outputPath);
}
