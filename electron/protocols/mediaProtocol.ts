import { protocol } from 'electron';
import path from 'path';
import fs from 'fs';

/**
 * The media:// scheme, shared by the main app and the Echo companion app.
 *
 * Both processes serve the same files out of the same userData media dir, so this lives in
 * one place — an Echo-only copy would drift the moment a new mime type is added for the
 * main app's viewer.
 */

const MIME_TYPES: Record<string, string> = {
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.mov': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.m4v': 'video/mp4',
  '.avi': 'video/x-msvideo',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  // Document types + the sub-resources an imported HTML file may reference.
  // Without a real Content-Type an .html served here is treated as a download
  // rather than rendered, so the in-app viewer's iframe would come up blank.
  // Relative paths inside a framed document resolve against media://, which is
  // why stylesheets, scripts and fonts need entries too.
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.pdf': 'application/pdf',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

/** Register the media:// handler. Call once, after app.whenReady(). */
export function registerMediaProtocol(): void {
  protocol.handle('media', async (request) => {
    const url = request.url.replace('media://', '');
    // Split before decoding: getFileUrl percent-encodes each segment, so a literal '?'
    // in a filename arrives as %3F and is never mistaken for a query separator. This lets
    // the in-app viewer append ?v=<nonce> to force a reload past Chromium's cache after
    // the file has been edited on disk.
    const filePath = decodeURIComponent(url.split('?')[0]);

    try {
      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      // Parse Range header for seeking support
      const rangeHeader = request.headers.get('range');

      if (rangeHeader) {
        // Handle Range request (for video/audio seeking)
        const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
        if (match) {
          const start = match[1] ? parseInt(match[1], 10) : 0;
          const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
          const chunkSize = end - start + 1;

          const stream = fs.createReadStream(filePath, { start, end });
          const chunks: Buffer[] = [];
          for await (const chunk of stream) {
            chunks.push(chunk as Buffer);
          }
          const data = Buffer.concat(chunks);

          return new Response(data, {
            status: 206,
            headers: {
              'Content-Type': contentType,
              'Content-Length': chunkSize.toString(),
              'Content-Range': `bytes ${start}-${end}/${fileSize}`,
              'Accept-Ranges': 'bytes',
            },
          });
        }
      }

      // Full file request (no Range header)
      const data = fs.readFileSync(filePath);
      return new Response(data, {
        headers: {
          'Content-Type': contentType,
          'Content-Length': fileSize.toString(),
          'Accept-Ranges': 'bytes',
        },
      });
    } catch (error) {
      console.error('Failed to load media file:', filePath, error);
      return new Response('File not found', { status: 404 });
    }
  });
}
