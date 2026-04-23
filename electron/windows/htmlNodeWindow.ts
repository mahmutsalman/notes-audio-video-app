import { BrowserWindow, ipcMain, app } from 'electron';
import path from 'path';

const openWindows = new Map<number, BrowserWindow>();

// Register zoom handler once
ipcMain.handle('htmlNodeViewer:setZoom', (event, factor: number) => {
  event.sender.setZoomFactor(factor);
});

function getPreloadPath(): string {
  // In dev the preload is compiled to dist-electron/htmlNodeViewerPreload.js
  // In production it's in resources/app.asar/dist-electron/
  return path.join(app.getAppPath(), 'dist-electron', 'htmlNodeViewerPreload.js');
}

export function openHtmlNodeWindow(
  id: number,
  filePath: string,
  title: string,
  fileType: 'html' | 'pdf'
): void {
  const existing = openWindows.get(id);
  if (existing && !existing.isDestroyed()) {
    existing.focus();
    return;
  }

  const win = new BrowserWindow({
    width: 950,
    height: 1100,
    title: title || 'Document',
    resizable: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: getPreloadPath(),
    },
  });

  if (fileType === 'pdf') {
    win.loadURL('file://' + filePath);
  } else {
    win.loadFile(filePath);
  }

  win.on('closed', () => openWindows.delete(id));
  openWindows.set(id, win);
}
