import {
  app,
  BrowserWindow,
  Menu,
  screen,
  shell,
  type MenuItemConstructorOptions,
} from 'electron';
import { SettingsOperations } from '../database/operations';

/**
 * Recording Aspect Ratio
 * ----------------------
 * Locks the main window to a fixed aspect ratio so screen recordings of the app
 * (e.g. a vertical clip for a phone-shaped video, or a 16:9 tutorial) come out
 * at the right shape without cropping in the editor afterwards.
 *
 * Selecting a preset does two things:
 *   1. `win.setAspectRatio(r)` — the window keeps that shape while the user
 *      drag-resizes it, so it can never drift off-aspect.
 *   2. A one-shot resize that fits the ratio inside the work area of whichever
 *      display the window currently sits on.
 *
 * Position is deliberately left to the user (drag the window wherever the
 * recording frame should be); the resize only nudges it back on-screen if the
 * new size would have pushed it off the edge.
 *
 * Nothing here assumes a particular monitor, resolution, or recording tool —
 * every number is derived from the current display at runtime.
 */

export type AspectPresetId = 'free' | 'portrait' | 'square' | 'landscape';

interface AspectPreset {
  id: AspectPresetId;
  label: string;
  /** width / height. `null` means "no lock". */
  ratio: number | null;
}

const ASPECT_PRESETS: AspectPreset[] = [
  { id: 'portrait', label: 'Portrait (9:16)', ratio: 9 / 16 },
  { id: 'square', label: 'Square (1:1)', ratio: 1 },
  { id: 'landscape', label: 'Landscape (16:9)', ratio: 16 / 9 },
  { id: 'free', label: 'Free (no lock)', ratio: null },
];

const SETTING_KEY = 'recording_aspect_preset';
const DEFAULT_PRESET: AspectPresetId = 'free';

/** Fraction of the work area left as breathing room around a fitted window. */
const WORK_AREA_MARGIN_RATIO = 0.03;

let currentPreset: AspectPresetId = DEFAULT_PRESET;

function findPreset(id: string | null): AspectPreset {
  return ASPECT_PRESETS.find(p => p.id === id) ?? ASPECT_PRESETS[ASPECT_PRESETS.length - 1];
}

function readSavedPreset(): AspectPresetId {
  try {
    const saved = SettingsOperations.get(SETTING_KEY);
    return findPreset(saved).id;
  } catch (err) {
    console.error('[RecordingAspect] Failed to read saved preset:', err);
    return DEFAULT_PRESET;
  }
}

function savePreset(id: AspectPresetId): void {
  try {
    SettingsOperations.set(SETTING_KEY, id);
  } catch (err) {
    console.error('[RecordingAspect] Failed to persist preset:', err);
  }
}

/**
 * Resize the window so `ratio` fits inside the work area of the display it is
 * currently on. Fits to the limiting dimension, respects the window's minimum
 * size, and keeps the window fully on-screen without recentring it.
 */
function fitWindowToRatio(win: BrowserWindow, ratio: number): void {
  const bounds = win.getBounds();
  const centre = {
    x: Math.round(bounds.x + bounds.width / 2),
    y: Math.round(bounds.y + bounds.height / 2),
  };
  const workArea = screen.getDisplayNearestPoint(centre).workArea;

  const margin = Math.round(Math.min(workArea.width, workArea.height) * WORK_AREA_MARGIN_RATIO);
  const maxWidth = Math.max(1, workArea.width - margin * 2);
  const maxHeight = Math.max(1, workArea.height - margin * 2);

  // Fit to the limiting dimension: start from full height, shrink if too wide.
  let height = maxHeight;
  let width = Math.round(height * ratio);
  if (width > maxWidth) {
    width = maxWidth;
    height = Math.round(width / ratio);
  }

  // Respect the window's own minimums — grow along the ratio if we undershot.
  const [minWidth, minHeight] = win.getMinimumSize();
  if (width < minWidth) {
    width = minWidth;
    height = Math.round(width / ratio);
  }
  if (height < minHeight) {
    height = minHeight;
    width = Math.round(height * ratio);
  }

  // If honouring the minimums overflowed the display, clamp to the work area.
  // The aspect lock still governs every subsequent user resize.
  width = Math.min(width, workArea.width);
  height = Math.min(height, workArea.height);

  // Keep the user's position, but pull the window back on-screen if needed.
  let x = bounds.x;
  let y = bounds.y;
  if (x + width > workArea.x + workArea.width) x = workArea.x + workArea.width - width;
  if (y + height > workArea.y + workArea.height) y = workArea.y + workArea.height - height;
  if (x < workArea.x) x = workArea.x;
  if (y < workArea.y) y = workArea.y;

  win.setBounds({ x: Math.round(x), y: Math.round(y), width, height });
}

/**
 * Apply a preset to the window.
 * @param resize when false, only the aspect lock is (re)applied — used on
 *               startup so a restored preset does not jump the window around.
 */
export function applyAspectPreset(
  win: BrowserWindow | null,
  id: AspectPresetId,
  resize: boolean = true
): void {
  currentPreset = id;
  if (!win || win.isDestroyed()) return;

  const preset = findPreset(id);

  if (preset.ratio === null) {
    win.setAspectRatio(0);
    return;
  }

  // A locked window cannot be resized past the lock, so clear it first.
  win.setAspectRatio(0);
  if (resize) {
    if (win.isFullScreen()) win.setFullScreen(false);
    if (win.isMaximized()) win.unmaximize();
    fitWindowToRatio(win, preset.ratio);
  }
  win.setAspectRatio(preset.ratio);
}

function buildAspectSubmenu(getWindow: () => BrowserWindow | null): MenuItemConstructorOptions[] {
  return ASPECT_PRESETS.map(preset => ({
    label: preset.label,
    type: 'radio' as const,
    checked: currentPreset === preset.id,
    click: () => {
      applyAspectPreset(getWindow(), preset.id, true);
      savePreset(preset.id);
      buildApplicationMenu(getWindow);
    },
  }));
}

/**
 * Build and install the application menu. Called again after a preset change so
 * the radio checkmarks reflect the active choice.
 */
export function buildApplicationMenu(getWindow: () => BrowserWindow | null): void {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [];

  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  template.push({
    label: 'File',
    submenu: isMac ? [{ role: 'close' }] : [{ role: 'quit' }],
  });

  template.push({
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      ...(isMac
        ? ([
            { role: 'pasteAndMatchStyle' },
            { role: 'delete' },
            { role: 'selectAll' },
          ] as MenuItemConstructorOptions[])
        : ([
            { role: 'delete' },
            { type: 'separator' },
            { role: 'selectAll' },
          ] as MenuItemConstructorOptions[])),
    ],
  });

  template.push({
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      {
        label: 'Recording Aspect Ratio',
        submenu: buildAspectSubmenu(getWindow),
      },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  });

  template.push({
    label: 'Window',
    submenu: isMac
      ? [
          { role: 'minimize' },
          { role: 'zoom' },
          { type: 'separator' },
          { role: 'front' },
        ]
      : [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }],
  });

  template.push({
    role: 'help',
    submenu: [
      {
        label: 'Learn More',
        click: async () => {
          await shell.openExternal('https://www.electronjs.org');
        },
      },
    ],
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/**
 * Restore the saved preset and install the menu. Call once, after the main
 * window exists and the database is open.
 *
 * A restored non-free preset also re-fits the window: window bounds are not
 * persisted between launches, so without the fit the app would reopen at its
 * default landscape size while claiming a portrait lock.
 */
export function initRecordingAspect(getWindow: () => BrowserWindow | null): void {
  currentPreset = readSavedPreset();
  applyAspectPreset(getWindow(), currentPreset, currentPreset !== 'free');
  buildApplicationMenu(getWindow);
}
