import { ipcRenderer, webFrame } from 'electron';

/**
 * Preload for the IN-APP document viewer (HtmlNodeViewer), as opposed to
 * htmlNodeViewerPreload which serves the standalone window.
 *
 * Two jobs, both of which exist because the guest document is a separate frame the
 * embedder cannot reach into:
 *
 * 1. Zoom via webFrame.setZoomFactor. The host cannot CSS-transform the view without
 *    rasterising it — the frame renders once at its layout size and the transform just
 *    stretches that bitmap, so text turns to mush on the way up. setZoomFactor re-lays out
 *    and re-rasterises the document, which is what browser zoom actually is.
 *
 * 2. Forwarding keys and wheel gestures to the host. Once this document has focus it
 *    swallows every event; the modal's own Escape handler never fires and neither does
 *    Cmd+scroll. Both are relayed over sendToHost instead.
 */

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;

let zoom = 1;

function apply(factor: number, notifyHost = true): void {
  zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +factor.toFixed(2)));
  webFrame.setZoomFactor(zoom);
  // Keeps the modal's percentage readout truthful when the change originated in here.
  if (notifyHost) ipcRenderer.sendToHost('zoom', zoom);
}

// Host-initiated zoom (toolbar buttons). No echo back, or the two would ping-pong.
ipcRenderer.on('zoom:set', (_event, factor: number) => apply(factor, false));

window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    ipcRenderer.sendToHost('close');
    return;
  }
  if (!e.metaKey && !e.ctrlKey) return;
  if (e.key === '=' || e.key === '+') { e.preventDefault(); apply(zoom + 0.1); }
  else if (e.key === '-' || e.key === '_') { e.preventDefault(); apply(zoom - 0.1); }
  else if (e.key === '0') { e.preventDefault(); apply(1); }
});

// Trackpad pinch arrives as wheel + ctrlKey; Cmd+scroll as metaKey.
window.addEventListener('wheel', (e: WheelEvent) => {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  apply(zoom * (1 - e.deltaY * 0.005));
}, { passive: false });
