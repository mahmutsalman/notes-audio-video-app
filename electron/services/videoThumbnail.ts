import { BrowserWindow } from 'electron';
import fs from 'fs/promises';

/**
 * Generate a thumbnail from a video file using a hidden BrowserWindow.
 * Uses HTML5 video + canvas to extract a frame - no external dependencies needed.
 */
export async function generateVideoThumbnail(
  videoPath: string,
  outputPath: string,
  seekTime: number = 1
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
        webSecurity: false, // Allow loading file:// URLs from data URL context
      },
    });

    const cleanup = () => {
      if (!win.isDestroyed()) {
        win.close();
      }
    };

    // Timeout fallback - resolve with null after 10 seconds
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.log('Video thumbnail generation timed out for:', videoPath);
        cleanup();
        resolve(null);
      }
    }, 10000);

    // Listen for console messages from the page to get the result
    win.webContents.on('console-message', async (_, level, message) => {
      if (resolved) return;

      if (message.startsWith('data:image/png;base64,')) {
        resolved = true;
        clearTimeout(timeout);
        try {
          const base64 = message.replace('data:image/png;base64,', '');
          await fs.writeFile(outputPath, Buffer.from(base64, 'base64'));
          console.log('Video thumbnail saved to:', outputPath);
          cleanup();
          resolve(outputPath);
        } catch (error) {
          console.error('Failed to save thumbnail:', error);
          cleanup();
          resolve(null);
        }
      } else if (message.startsWith('THUMBNAIL_ERROR')) {
        resolved = true;
        clearTimeout(timeout);
        console.log('Video thumbnail generation failed for:', videoPath, '-', message);
        cleanup();
        resolve(null);
      }
    });

    // Encode the video path for use in URL
    const encodedPath = encodeURI(videoPath.replace(/#/g, '%23'));

    const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body>
        <video id="video" muted playsinline></video>
        <canvas id="canvas"></canvas>
        <script>
          const video = document.getElementById('video');
          const canvas = document.getElementById('canvas');
          const ctx = canvas.getContext('2d');

          video.addEventListener('loadedmetadata', () => {
            // Seek to 1 second or 10% of duration, whichever is smaller
            const seekTo = Math.min(${seekTime}, video.duration * 0.1, video.duration - 0.1);
            video.currentTime = Math.max(0, seekTo);
          });

          video.addEventListener('seeked', () => {
            try {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              ctx.drawImage(video, 0, 0);
              const dataUrl = canvas.toDataURL('image/png');
              console.log(dataUrl);
            } catch (e) {
              console.log('THUMBNAIL_ERROR');
            }
          });

          video.addEventListener('error', () => {
            const err = video.error;
            console.log('THUMBNAIL_ERROR:' + (err ? err.code + ':' + err.message : 'unknown'));
          });

          // Start loading the video
          video.src = 'file://${encodedPath}';
          video.load();
        </script>
      </body>
      </html>
    `;

    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  });
}
