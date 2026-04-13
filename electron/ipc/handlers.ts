import { ipcMain, dialog, shell, nativeTheme, clipboard, desktopCapturer } from 'electron';
import {
  TopicsOperations,
  RecordingsOperations,
  ImagesOperations,
  VideosOperations,
  AudiosOperations,
  DurationsOperations,
  DurationImagesOperations,
  DurationVideosOperations,
  DurationAudiosOperations,
  DurationImageAudiosOperations,
  ImageAudiosOperations,
  CaptureImageAudiosOperations,
  ImageChildrenOperations,
  ImageChildAudiosOperations,
  CodeSnippetsOperations,
  DurationCodeSnippetsOperations,
  SettingsOperations,
  AudioMarkersOperations,
  SearchOperations,
  FilteredSearchOperations,
  TagOperations,
  QuickCaptureOperations,
  ImageAnnotationsOperations,
  MediaColorOperations,
  RecordingPlansOperations,
  DurationPlansOperations,
  CalendarTodosOperations,
  StudyTrackingOperations,
  ObsStagedMarksOperations,
  ObsGhostMarksOperations,
  ReviewOperations,
  ReviewMaskOperations,
} from '../database/operations';
import { rebuildSearchIndex, scheduleSearchReindex } from '../database/database';
import {
  saveAudioFile,
  getAudioPath,
  getAudioBuffer,
  saveImageFile,
  saveImageFromBuffer,
  saveVideoFile,
  saveVideoFromBuffer,
  saveDurationImageFromBuffer,
  saveDurationVideoFromBuffer,
  saveDurationVideoFromFile,
  saveDurationAudioFromBuffer,
  saveDurationImageAudioFromBuffer,
  saveImageAudioFromBuffer,
  saveCaptureImageAudioFromBuffer,
  saveImageChildFromBuffer,
  saveImageChildAudioFromBuffer,
  saveAudioAttachmentFromBuffer,
  deleteDurationImages,
  deleteDurationVideos,
  deleteDurationAudios,
  deleteFile,
  deleteRecordingMedia,
  getMediaDir,
  getFileUrl,
  savePdfFile,
  saveQuickCaptureImage,
  saveQuickCaptureAudio,
  deleteQuickCaptureFiles,
} from '../services/fileStorage';
import fs from 'fs';
import { createBackup, getBackupDir } from '../services/backupService';
import { mergeAudioFiles } from '../services/audioMerger';
import { convertWebmToM4a, convertWebmBufferToM4a } from '../services/audioConverter';
import type {
  CreateTopic, UpdateTopic, CreateRecording, UpdateRecording, CreateDuration, UpdateDuration,
  CreateCodeSnippet, UpdateCodeSnippet, CreateDurationCodeSnippet, UpdateDurationCodeSnippet,
  CreateScreenRecording, DurationGroupColor, DurationColor
} from '../../src/types';

// Call this after mainWindow is created to wire up OBS push events
export async function setupObsEventBridge(mainWindow: import('electron').BrowserWindow): Promise<void> {
  const { obsService } = await import('../services/obsService');
  const { showObsMarkOverlay, hideObsMarkOverlay } = await import('../windows/obsMarkOverlay');
  const { ObsStagedMarksOperations, ObsGhostMarksOperations } = await import('../database/operations');
  const { notifyObsStatusWindow } = await import('../windows/obsStatusWindow');

  obsService.on('paused', (data: { timecode: number; timecodeStr: string }) => {
    // Close the currently open ghost mark at the pause timecode
    const sessionId = obsService.currentSessionId;
    if (sessionId) ObsGhostMarksOperations.closeActive(sessionId, data.timecode);
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('obs:paused', data);
    notifyObsStatusWindow('obs:paused', data);
    // Overlay is NOT auto-shown on pause — user presses F9 to open it explicitly
  });

  obsService.on('resumed', (data: { startTime: number }) => {
    // Each resume starts a new ghost mark at the point the user unpaused
    const sessionId = obsService.currentSessionId;
    if (sessionId) ObsGhostMarksOperations.create(sessionId, data.startTime);
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('obs:resumed');
    notifyObsStatusWindow('obs:resumed', data);
    hideObsMarkOverlay();
  });

  obsService.on('stopped', (data: { sessionId: string | null; pendingMark?: any; filePath?: string | null; recordDirectory?: string | null; finalTimecode?: number }) => {
    // Close the active ghost mark (only matters if OBS was stopped while actively recording;
    // if stopped while paused the ghost mark was already closed on the last pause event).
    if (data.sessionId && data.finalTimecode != null && data.finalTimecode > 0) {
      ObsGhostMarksOperations.closeActive(data.sessionId, data.finalTimecode);
    }
    // If stopped while paused, save the last staged mark before clearing state
    if (data.pendingMark) {
      data.pendingMark.sort_order = ObsStagedMarksOperations.count();
      ObsStagedMarksOperations.create(data.pendingMark);
      console.log('[OBS] Saved pending mark on stop:', data.pendingMark);
    }
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('obs:stopped', data);
    notifyObsStatusWindow('obs:stopped', data);
    hideObsMarkOverlay();

    // Once OBS finishes writing the video, notify the renderer.
    // We resolve the path in two steps:
    //   1. Use outputPath from OBS if it exists on disk.
    //   2. Fall back to the most recently modified video file in the same directory
    //      (handles cases where OBS reports a wrong/stale path or omits outputPath).
    {
      const reportedPath: string | null = data.filePath || null;
      const fsSync   = require('fs');
      const pathMod  = require('path');

      const VIDEO_EXTS = ['.mkv', '.mov', '.mp4', '.flv', '.avi', '.ts', '.m2ts'];

      const findNewestInDir = (dir: string): string | null => {
        try {
          const entries = fsSync.readdirSync(dir)
            .map((name: string) => {
              if (!VIDEO_EXTS.some((ext: string) => name.toLowerCase().endsWith(ext))) return null;
              const fp = pathMod.join(dir, name);
              try { return { path: fp, mtime: fsSync.statSync(fp).mtimeMs }; } catch { return null; }
            })
            .filter(Boolean)
            .sort((a: any, b: any) => b.mtime - a.mtime);
          return (entries[0] as any)?.path ?? null;
        } catch { return null; }
      };

      // Use dirname of outputPath, or fall back to the OBS recording directory fetched at start
      const outputDir = reportedPath
        ? pathMod.dirname(reportedPath)
        : (data.recordDirectory || null);
      console.log('[OBS] Recording stopped — reported path:', reportedPath, '| scan dir:', outputDir);

      let attempts = 0;
      const poll = setInterval(() => {
        attempts++;

        // Prefer the reported path if it exists on disk
        const reportedExists = reportedPath && fsSync.existsSync(reportedPath);
        // Also look for the newest video in the output directory
        const newestInDir = outputDir ? findNewestInDir(outputDir) : null;

        // Pick the most recently modified of the two candidates
        const resolvedPath = (() => {
          if (reportedExists && newestInDir && newestInDir !== reportedPath) {
            try {
              const rMtime = fsSync.statSync(reportedPath).mtimeMs;
              const nMtime = fsSync.statSync(newestInDir).mtimeMs;
              return nMtime > rMtime ? newestInDir : reportedPath;
            } catch { return reportedPath; }
          }
          if (reportedExists) return reportedPath;
          return newestInDir; // fallback: newest file in directory
        })();

        if (resolvedPath || attempts >= 20) {
          clearInterval(poll);
          if (resolvedPath && !mainWindow.isDestroyed()) {
            console.log('[OBS] Video file ready:', resolvedPath, '(reported:', reportedPath, ')');
            mainWindow.webContents.send('obs:videoReady', { filePath: resolvedPath });
          }
        }
      }, 500);
    }
  });

  obsService.on('started', (data: { sessionId: string }) => {
    hideObsMarkOverlay(); // dismiss any stale overlay from a previous session
    ObsStagedMarksOperations.deleteAll();
    // Clear any leftover ghost marks from a previous session, then create the first one at t=0
    ObsGhostMarksOperations.deleteAll();
    ObsGhostMarksOperations.create(data.sessionId, 0);
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('obs:started', data);
    notifyObsStatusWindow('obs:started', data);
  });

  obsService.on('statusChange', (status: any) => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('obs:statusChange', status);
    notifyObsStatusWindow('obs:statusChange', status);
    if (!status.isConnected) {
      hideObsMarkOverlay(); // hide stale overlay when OBS drops connection
    }
  });
}

export function setupIpcHandlers(): void {
  // ============ Topics ============
  ipcMain.handle('topics:getAll', async () => {
    return TopicsOperations.getAll();
  });

  ipcMain.handle('topics:getById', async (_, id: number) => {
    return TopicsOperations.getById(id);
  });

  ipcMain.handle('topics:create', async (_, topic: CreateTopic) => {
    const result = TopicsOperations.create(topic);
    scheduleSearchReindex();
    return result;
  });

  ipcMain.handle('topics:update', async (_, id: number, updates: UpdateTopic) => {
    const result = TopicsOperations.update(id, updates);
    scheduleSearchReindex();
    return result;
  });

  ipcMain.handle('topics:delete', async (_, id: number) => {
    // Get all recordings for this topic to delete their media
    const recordings = RecordingsOperations.getByTopic(id);
    for (const recording of recordings) {
      await deleteRecordingMedia(recording.id);
    }
    TopicsOperations.delete(id);
  });

  // ============ Recordings ============
  ipcMain.handle('recordings:getByTopic', async (_, topicId: number) => {
    return RecordingsOperations.getByTopic(topicId);
  });

  ipcMain.handle('recordings:getById', async (_, id: number) => {
    return RecordingsOperations.getById(id);
  });

  ipcMain.handle('recordings:create', async (_, recording: CreateRecording) => {
    const result = RecordingsOperations.create(recording);
    scheduleSearchReindex();
    return result;
  });

  ipcMain.handle('recordings:update', async (_, id: number, updates: UpdateRecording) => {
    const result = RecordingsOperations.update(id, updates);
    scheduleSearchReindex();
    return result;
  });

  ipcMain.handle('recordings:delete', async (_, id: number) => {
    await deleteRecordingMedia(id);
    RecordingsOperations.delete(id);
  });

  // Get recording group color state
  ipcMain.handle('recordings:getGroupColorState', async (_, id: number) => {
    console.log('[IPC] Getting recording group color state:', id);
    return RecordingsOperations.getGroupColorState(id);
  });

  // Update recording group color state
  ipcMain.handle(
    'recordings:updateGroupColorState',
    async (_, id: number, lastGroupColor: DurationGroupColor | null, toggleActive: boolean) => {
      console.log('[IPC] Updating recording group color state:', { id, lastGroupColor, toggleActive });
      return RecordingsOperations.updateGroupColorState(id, lastGroupColor, toggleActive);
    }
  );

  // Canvas load/save
  ipcMain.handle('recordings:loadCanvas', async (_, recordingId: number) => {
    const filePath = RecordingsOperations.getCanvasFilePath(recordingId);
    if (!filePath) return null;
    try {
      const fsModule = await import('fs/promises');
      return await fsModule.readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  });

  ipcMain.handle('recordings:saveCanvas', async (_, { recordingId, data }: { recordingId: number; data: string }) => {
    const pathModule = await import('path');
    const fsModule = await import('fs/promises');
    const canvasDir = pathModule.join(getMediaDir(), 'canvas');
    await fsModule.mkdir(canvasDir, { recursive: true });
    const filePath = pathModule.join(canvasDir, `${recordingId}.json`);
    await fsModule.writeFile(filePath, data, 'utf-8');
    RecordingsOperations.setCanvasFilePath(recordingId, filePath);
  });

  // Duration canvas load/save
  ipcMain.handle('durations:loadCanvas', async (_, durationId: number) => {
    const filePath = DurationsOperations.getCanvasFilePath(durationId);
    if (!filePath) return null;
    try {
      const fsModule = await import('fs/promises');
      return await fsModule.readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  });

  ipcMain.handle('durations:saveCanvas', async (_, { durationId, data }: { durationId: number; data: string }) => {
    const pathModule = await import('path');
    const fsModule = await import('fs/promises');
    const canvasDir = pathModule.join(getMediaDir(), 'canvas');
    await fsModule.mkdir(canvasDir, { recursive: true });
    const filePath = pathModule.join(canvasDir, `duration_${durationId}.json`);
    await fsModule.writeFile(filePath, data, 'utf-8');
    DurationsOperations.setCanvasFilePath(durationId, filePath);
  });

  // ============ Audio ============
  ipcMain.handle('audio:save', async (_, recordingId: number, audioBuffer: ArrayBuffer, filename: string) => {
    const buffer = Buffer.from(audioBuffer);
    const filePath = await saveAudioFile(recordingId, audioBuffer, filename);

    // Update recording with audio path and size
    const fileSizeBytes = buffer.byteLength;
    await RecordingsOperations.update(recordingId, {
      audio_path: filePath,
      audio_size: fileSizeBytes
    });

    return filePath;
  });

  ipcMain.handle('audio:getPath', async (_, recordingId: number) => {
    return getAudioPath(recordingId);
  });

  ipcMain.handle('audio:getBuffer', async (_, recordingId: number) => {
    return getAudioBuffer(recordingId);
  });

  ipcMain.handle('audio:mergeExtension', async (
    _,
    recordingId: number,
    extensionBuffer: ArrayBuffer,
    originalDurationMs: number,
    extensionDurationMs: number
  ) => {
    const audioPath = await getAudioPath(recordingId);
    if (!audioPath) {
      return { success: false, totalDurationMs: 0, error: 'Original audio file not found' };
    }

    const result = await mergeAudioFiles(
      audioPath,
      extensionBuffer,
      originalDurationMs,
      extensionDurationMs
    );

    return result;
  });

  // ============ Audio: Batch .webm → .m4a Conversion ============
  ipcMain.handle('audio:convert-all-webm', async () => {
    const { app } = await import('electron');
    const path = await import('path');
    const fs = await import('fs');
    const Database = (await import('better-sqlite3')).default;

    const userDataPath = app.getPath('userData');
    const localDb = path.join(userDataPath, 'NotesWithAudioAndVideo.db');
    const db = new Database(localDb);

    const results = { converted: 0, failed: 0, errors: [] as string[] };

    // Table configs: [tableName, columnName]
    const tables: [string, string][] = [
      ['recordings', 'audio_path'],
      ['audios', 'file_path'],
      ['duration_audios', 'file_path'],
    ];

    for (const [table, column] of tables) {
      const rows = db.prepare(
        `SELECT id, ${column} AS path FROM ${table} WHERE ${column} LIKE '%.webm'`
      ).all() as { id: number; path: string }[];

      console.log(`[AudioConverter] ${table}: ${rows.length} .webm files`);

      for (const row of rows) {
        try {
          if (!fs.existsSync(row.path)) {
            console.warn(`[AudioConverter] File missing, skipping: ${row.path}`);
            results.failed++;
            results.errors.push(`Missing: ${row.path}`);
            continue;
          }
          const newPath = await convertWebmToM4a(row.path);
          db.prepare(`UPDATE ${table} SET ${column} = ? WHERE id = ?`).run(newPath, row.id);
          results.converted++;
        } catch (err) {
          results.failed++;
          results.errors.push(`${row.path}: ${(err as Error).message}`);
          console.error(`[AudioConverter] Failed ${row.path}:`, (err as Error).message);
        }
      }
    }

    db.close();
    console.log(`[AudioConverter] Done: ${results.converted} converted, ${results.failed} failed`);
    return results;
  });

  // ============ Audio: Single buffer WebM → M4A conversion ============
  ipcMain.handle('audio:convert-buffer', async (_, webmBuffer: ArrayBuffer) => {
    const m4aBuffer = await convertWebmBufferToM4a(webmBuffer);
    return m4aBuffer.buffer.slice(m4aBuffer.byteOffset, m4aBuffer.byteOffset + m4aBuffer.byteLength);
  });

  // ============ Media (Images & Videos) ============
  ipcMain.handle('media:addImage', async (_, recordingId: number, sourcePath: string) => {
    const { filePath, thumbnailPath } = await saveImageFile(recordingId, sourcePath);
    const nextSortOrder = ImagesOperations.getMaxSortOrder(recordingId) + 1;
    return ImagesOperations.create({
      recording_id: recordingId,
      file_path: filePath,
      thumbnail_path: thumbnailPath,
      sort_order: nextSortOrder,
    });
  });

  ipcMain.handle('media:addVideo', async (_, recordingId: number, sourcePath: string) => {
    const { filePath, thumbnailPath, duration } = await saveVideoFile(recordingId, sourcePath);
    const nextSortOrder = VideosOperations.getMaxSortOrder(recordingId) + 1;
    return VideosOperations.create({
      recording_id: recordingId,
      file_path: filePath,
      thumbnail_path: thumbnailPath,
      duration: duration,
      sort_order: nextSortOrder,
    });
  });

  ipcMain.handle('media:getImages', async (_, recordingId: number) => {
    return ImagesOperations.getByRecording(recordingId);
  });

  ipcMain.handle('media:getVideos', async (_, recordingId: number) => {
    return VideosOperations.getByRecording(recordingId);
  });

  ipcMain.handle('media:deleteImage', async (_, id: number) => {
    const image = ImagesOperations.getById(id);
    if (image) {
      await deleteFile(image.file_path);
      if (image.thumbnail_path && image.thumbnail_path !== image.file_path) {
        await deleteFile(image.thumbnail_path);
      }
    }
    ImagesOperations.delete(id);
    scheduleSearchReindex();
  });

  ipcMain.handle('media:deleteVideo', async (_, id: number) => {
    const video = VideosOperations.getById(id);
    if (video) {
      await deleteFile(video.file_path);
      if (video.thumbnail_path) {
        await deleteFile(video.thumbnail_path);
      }
    }
    VideosOperations.delete(id);
  });

  // Clipboard-based media addition
  ipcMain.handle('media:addImageFromClipboard', async (_, recordingId: number, imageBuffer: ArrayBuffer, extension: string = 'png') => {
    const { filePath, thumbnailPath } = await saveImageFromBuffer(recordingId, imageBuffer, extension);
    const nextSortOrder = ImagesOperations.getMaxSortOrder(recordingId) + 1;
    return ImagesOperations.create({
      recording_id: recordingId,
      file_path: filePath,
      thumbnail_path: thumbnailPath,
      sort_order: nextSortOrder,
    });
  });

  ipcMain.handle('media:addVideoFromClipboard', async (_, recordingId: number, videoBuffer: ArrayBuffer, extension: string = 'mp4') => {
    const { filePath, thumbnailPath, duration } = await saveVideoFromBuffer(recordingId, videoBuffer, extension);
    const nextSortOrder = VideosOperations.getMaxSortOrder(recordingId) + 1;
    return VideosOperations.create({
      recording_id: recordingId,
      file_path: filePath,
      thumbnail_path: thumbnailPath,
      duration: duration,
      sort_order: nextSortOrder,
    });
  });

  ipcMain.handle('media:updateImageCaption', async (_, id: number, caption: string | null) => {
    return ImagesOperations.updateCaption(id, caption);
  });

  ipcMain.handle('media:updateImageColor', async (_, id: number, color: DurationColor) => {
    return ImagesOperations.updateColor(id, color);
  });

  ipcMain.handle('media:updateImageGroupColor', async (_, id: number, groupColor: DurationGroupColor | null) => {
    return ImagesOperations.updateGroupColor(id, groupColor);
  });

  ipcMain.handle('media:reorderImages', async (_, recordingId: number, orderedIds: number[]) => {
    return ImagesOperations.reorder(recordingId, orderedIds);
  });

  ipcMain.handle('media:replaceImageFromClipboard', async (_, imageId: number, recordingId: number, imageBuffer: ArrayBuffer, extension: string = 'png') => {
    const old = ImagesOperations.getById(imageId);
    const { filePath, thumbnailPath } = await saveImageFromBuffer(recordingId, imageBuffer, extension);
    if (old) {
      await deleteFile(old.file_path);
      if (old.thumbnail_path && old.thumbnail_path !== old.file_path) {
        await deleteFile(old.thumbnail_path);
      }
    }
    return ImagesOperations.updateFilePaths(imageId, filePath, thumbnailPath);
  });

  ipcMain.handle('media:updateVideoCaption', async (_, id: number, caption: string | null) => {
    return VideosOperations.updateCaption(id, caption);
  });

  ipcMain.handle('media:updateVideoColor', async (_, id: number, color: DurationColor) => {
    return VideosOperations.updateColor(id, color);
  });

  ipcMain.handle('media:updateVideoGroupColor', async (_, id: number, groupColor: DurationGroupColor | null) => {
    return VideosOperations.updateGroupColor(id, groupColor);
  });

  ipcMain.handle('media:pickFiles', async (_, type: 'image' | 'video' | 'both') => {
    const filters = type === 'image'
      ? [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }]
      : type === 'video'
        ? [{ name: 'Videos', extensions: ['mp4', 'webm', 'mov', 'avi', 'mkv'] }]
        : [
          { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
          { name: 'Videos', extensions: ['mp4', 'webm', 'mov', 'avi', 'mkv'] },
        ];

    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters,
    });

    return result.filePaths;
  });

  // ============ Paths ============
  ipcMain.handle('paths:getMediaDir', async () => {
    return getMediaDir();
  });

  ipcMain.handle('paths:openFile', async (_, filePath: string) => {
    await shell.openPath(filePath);
  });

  ipcMain.handle('paths:getFileUrl', (_, filePath: string) => {
    return getFileUrl(filePath);
  });

  // ============ Theme ============
  ipcMain.handle('theme:get', async () => {
    return nativeTheme.themeSource;
  });

  ipcMain.handle('theme:set', async (_, theme: 'light' | 'dark' | 'system') => {
    nativeTheme.themeSource = theme;
  });

  // ============ Clipboard ============
  ipcMain.handle('fs:getFileSizes', async (_, filePaths: string[]) => {
    const sizes: Record<string, number> = {};
    for (const fp of filePaths) {
      try {
        sizes[fp] = fs.statSync(fp).size;
      } catch {
        sizes[fp] = 0;
      }
    }
    return sizes;
  });

  ipcMain.handle('clipboard:readImage', async () => {
    const image = clipboard.readImage();
    if (image.isEmpty()) {
      return { success: false };
    }
    // Convert NativeImage to PNG buffer
    const buffer = image.toPNG();
    return {
      success: true,
      buffer: buffer,
      extension: 'png'
    };
  });

  ipcMain.handle('clipboard:readFileUrl', async () => {
    if (process.platform === 'darwin') {
      // Try text/uri-list first — contains real POSIX file:// URL when Cmd+C in Finder
      const uriList = clipboard.read('text/uri-list');
      if (uriList) {
        const uri = uriList.split('\n').map(l => l.trim()).find(l => l.startsWith('file://') && !l.startsWith('file:///.file/'));
        if (uri) {
          const filePath = decodeURIComponent(uri.replace('file://', ''));
          return { success: true, filePath };
        }
      }

      // Try public.file-url — sometimes has real path, sometimes a file-reference ID
      const fileUrl = clipboard.read('public.file-url');
      if (fileUrl && !fileUrl.includes('/.file/id=')) {
        const filePath = decodeURIComponent(fileUrl.replace('file://', ''));
        return { success: true, filePath };
      }

      // Last resort: resolve macOS file-reference URL via osascript
      if (fileUrl && fileUrl.includes('/.file/id=')) {
        try {
          const { execSync } = await import('child_process');
          const result = execSync(
            `osascript -e 'tell application "Finder" to POSIX path of (the clipboard as alias)'`,
            { encoding: 'utf8', timeout: 3000 }
          ).trim();
          if (result) return { success: true, filePath: result };
        } catch {
          // osascript failed — fall through
        }
      }

      // Fallback: NSFilenamesPboardType plist
      try {
        const plist = clipboard.read('NSFilenamesPboardType');
        if (plist) {
          const match = plist.match(/<string>([^<]+)<\/string>/);
          if (match?.[1]) return { success: true, filePath: match[1] };
        }
      } catch {}
    }
    return { success: false };
  });

  // ============ Video Thumbnail Generation ============
  ipcMain.handle('video:generateThumbnail', async (_, videoPath: string) => {
    try {
      const { generateVideoThumbnail } = await import('../services/videoThumbnail');
      const { randomUUID } = await import('crypto');
      const uuid = randomUUID();
      const thumbDir = path.join(getMediaDir(), 'temp_thumbnails');
      await fs.mkdir(thumbDir, { recursive: true });
      const thumbPath = path.join(thumbDir, `${uuid}_thumb.png`);

      const thumbnailPath = await generateVideoThumbnail(videoPath, thumbPath);
      return { success: true, thumbnailPath };
    } catch (error) {
      console.error('Failed to generate thumbnail:', error);
      return { success: false, thumbnailPath: null };
    }
  });

  // ============ Durations (marked time segments) ============
  ipcMain.handle('durations:getByRecordingAndVideo', async (_, recordingId: number, videoId: number) => {
    return DurationsOperations.getByRecordingAndVideo(recordingId, videoId);
  });

  ipcMain.handle('durations:getByRecording', async (_, recordingId: number) => {
    const durations = DurationsOperations.getByRecording(recordingId);
    const recording = RecordingsOperations.getById(recordingId);
    const maxDuration = recording?.video_duration ?? recording?.audio_duration;

    if (typeof maxDuration !== 'number' || !Number.isFinite(maxDuration) || maxDuration <= 0) {
      return durations;
    }

    const clamp = (value: number) => Math.max(0, Math.min(value, maxDuration));
    return durations
      .map(duration => {
        const start = clamp(duration.start_time);
        const end = clamp(duration.end_time);
        if (!(end > start)) return null;
        if (start === duration.start_time && end === duration.end_time) return duration;
        return { ...duration, start_time: start, end_time: end };
      })
      .filter((duration): duration is (typeof durations)[number] => duration !== null);
  });

  ipcMain.handle('durations:getWithAudio', async () => {
    return DurationsOperations.getWithAudio();
  });

  ipcMain.handle('durations:create', async (_, duration: CreateDuration) => {
    const result = DurationsOperations.create(duration);
    scheduleSearchReindex();
    return result;
  });

  ipcMain.handle('durations:update', async (_, id: number, updates: UpdateDuration) => {
    const result = DurationsOperations.update(id, updates);
    scheduleSearchReindex();
    return result;
  });

  // Update duration group color
  ipcMain.handle('durations:updateGroupColor', async (_, id: number, groupColor: DurationGroupColor | null) => {
    console.log('[IPC] Updating duration group color:', { id, groupColor });
    return DurationsOperations.update(id, { group_color: groupColor });
  });

  ipcMain.handle('durations:delete', async (_, id: number) => {
    // Delete associated images, videos, and audios first
    await deleteDurationImages(id);
    await deleteDurationVideos(id);
    await deleteDurationAudios(id);
    DurationsOperations.delete(id);
    scheduleSearchReindex();
  });

  ipcMain.handle('durations:reorder', async (_, recordingId: number, orderedIds: number[]) => {
    return DurationsOperations.reorder(recordingId, orderedIds);
  });

  // ============ Duration Images ============
  ipcMain.handle('durationImages:getByDuration', async (_, durationId: number) => {
    return DurationImagesOperations.getByDuration(durationId);
  });

  ipcMain.handle('durationImages:addFromClipboard', async (_, durationId: number, imageBuffer: ArrayBuffer, extension: string = 'png') => {
    const { filePath, thumbnailPath } = await saveDurationImageFromBuffer(durationId, imageBuffer, extension);
    const nextSortOrder = DurationImagesOperations.getMaxSortOrder(durationId) + 1;
    return DurationImagesOperations.create({
      duration_id: durationId,
      file_path: filePath,
      thumbnail_path: thumbnailPath,
      sort_order: nextSortOrder,
    });
  });

  ipcMain.handle('durationImages:addScreenshot', async (_, durationId: number, imageBuffer: ArrayBuffer, pageNumber: number, rect: { x: number; y: number; w: number; h: number }) => {
    const { filePath, thumbnailPath } = await saveDurationImageFromBuffer(durationId, imageBuffer, 'png');
    const nextSortOrder = DurationImagesOperations.getMaxSortOrder(durationId) + 1;
    return DurationImagesOperations.create({
      duration_id: durationId,
      file_path: filePath,
      thumbnail_path: thumbnailPath,
      sort_order: nextSortOrder,
      page_number: pageNumber,
      rect_x: rect.x,
      rect_y: rect.y,
      rect_w: rect.w,
      rect_h: rect.h,
    });
  });

  ipcMain.handle('durationImages:replaceFromClipboard', async (_, imageId: number, durationId: number, imageBuffer: ArrayBuffer, extension: string = 'png') => {
    const old = DurationImagesOperations.getById(imageId);
    const { filePath, thumbnailPath } = await saveDurationImageFromBuffer(durationId, imageBuffer, extension);
    if (old) {
      await deleteFile(old.file_path);
      if (old.thumbnail_path && old.thumbnail_path !== old.file_path) {
        await deleteFile(old.thumbnail_path);
      }
    }
    return DurationImagesOperations.updateFilePaths(imageId, filePath, thumbnailPath);
  });

  ipcMain.handle('durationImages:delete', async (_, id: number) => {
    const image = DurationImagesOperations.getById(id);
    if (image) {
      await deleteFile(image.file_path);
      if (image.thumbnail_path && image.thumbnail_path !== image.file_path) {
        await deleteFile(image.thumbnail_path);
      }
    }
    DurationImagesOperations.delete(id);
    scheduleSearchReindex();
  });

  ipcMain.handle('durationImages:updateCaption', async (_, id: number, caption: string | null) => {
    const result = DurationImagesOperations.updateCaption(id, caption);
    scheduleSearchReindex();
    return result;
  });

  ipcMain.handle('durationImages:updateColor', async (_, id: number, color: DurationColor) => {
    return DurationImagesOperations.updateColor(id, color);
  });

  ipcMain.handle('durationImages:updateGroupColor', async (_, id: number, groupColor: DurationGroupColor | null) => {
    return DurationImagesOperations.updateGroupColor(id, groupColor);
  });

  ipcMain.handle('durationImages:reorder', async (_, durationId: number, orderedIds: number[]) => {
    return DurationImagesOperations.reorder(durationId, orderedIds);
  });

  // ============ Duration Videos ============
  ipcMain.handle('durationVideos:getByDuration', async (_, durationId: number) => {
    return DurationVideosOperations.getByDuration(durationId);
  });

  ipcMain.handle('durationVideos:addFromClipboard', async (_, durationId: number, videoBuffer: ArrayBuffer, extension: string = 'mp4') => {
    const { filePath, thumbnailPath, duration } = await saveDurationVideoFromBuffer(durationId, videoBuffer, extension);
    const nextSortOrder = DurationVideosOperations.getMaxSortOrder(durationId) + 1;
    return DurationVideosOperations.create({
      duration_id: durationId,
      file_path: filePath,
      thumbnail_path: thumbnailPath,
      caption: null,
      duration: duration,
      sort_order: nextSortOrder,
    });
  });

  ipcMain.handle('durationVideos:addFromFile', async (_, durationId: number, sourcePath: string) => {
    const { filePath, thumbnailPath, duration } = await saveDurationVideoFromFile(durationId, sourcePath);
    const nextSortOrder = DurationVideosOperations.getMaxSortOrder(durationId) + 1;
    return DurationVideosOperations.create({
      duration_id: durationId,
      file_path: filePath,
      thumbnail_path: thumbnailPath,
      caption: null,
      duration: duration,
      sort_order: nextSortOrder,
    });
  });

  ipcMain.handle('durationVideos:delete', async (_, id: number) => {
    const video = DurationVideosOperations.getById(id);
    if (video) {
      await deleteFile(video.file_path);
      if (video.thumbnail_path) {
        await deleteFile(video.thumbnail_path);
      }
    }
    DurationVideosOperations.delete(id);
    scheduleSearchReindex();
  });

  ipcMain.handle('durationVideos:updateCaption', async (_, id: number, caption: string | null) => {
    const result = DurationVideosOperations.updateCaption(id, caption);
    scheduleSearchReindex();
    return result;
  });

  ipcMain.handle('durationVideos:updateColor', async (_, id: number, color: DurationColor) => {
    return DurationVideosOperations.updateColor(id, color);
  });

  ipcMain.handle('durationVideos:updateGroupColor', async (_, id: number, groupColor: DurationGroupColor | null) => {
    return DurationVideosOperations.updateGroupColor(id, groupColor);
  });

  // ============ Duration Audios ============
  ipcMain.handle('durationAudios:getByDuration', async (_, durationId: number) => {
    return DurationAudiosOperations.getByDuration(durationId);
  });

  ipcMain.handle('durationAudios:addFromBuffer', async (_, durationId: number, audioBuffer: ArrayBuffer, extension: string = 'webm') => {
    const { filePath, duration } = await saveDurationAudioFromBuffer(durationId, audioBuffer, extension);
    const result = DurationAudiosOperations.create({
      duration_id: durationId,
      file_path: filePath,
      caption: null,
      duration: duration,
      sort_order: 0,
    });
    scheduleSearchReindex();
    return result;
  });

  ipcMain.handle('durationAudios:delete', async (_, id: number) => {
    const audio = DurationAudiosOperations.getById(id);
    if (audio) {
      await deleteFile(audio.file_path);
    }
    DurationAudiosOperations.delete(id);
    scheduleSearchReindex();
  });

  ipcMain.handle('durationAudios:updateCaption', async (_, id: number, caption: string | null) => {
    const result = DurationAudiosOperations.updateCaption(id, caption);
    scheduleSearchReindex();
    return result;
  });

  ipcMain.handle('durationAudios:updateGroupColor', async (_, id: number, groupColor: DurationGroupColor | null) => {
    return DurationAudiosOperations.updateGroupColor(id, groupColor);
  });

  // ============ Duration Image Audios ============
  ipcMain.handle('durationImageAudios:getByDurationImage', async (_, durationImageId: number) => {
    return DurationImageAudiosOperations.getByDurationImage(durationImageId);
  });

  ipcMain.handle('durationImageAudios:addFromBuffer', async (_, durationImageId: number, durationId: number, audioBuffer: ArrayBuffer, extension: string = 'webm') => {
    const { filePath, duration } = await saveDurationImageAudioFromBuffer(durationImageId, audioBuffer, extension);
    const result = DurationImageAudiosOperations.create({
      duration_image_id: durationImageId,
      duration_id: durationId,
      file_path: filePath,
      caption: null,
      duration: duration,
      sort_order: DurationImageAudiosOperations.getMaxSortOrder(durationImageId) + 1,
    });
    scheduleSearchReindex();
    return result;
  });

  ipcMain.handle('durationImageAudios:delete', async (_, id: number) => {
    const audio = DurationImageAudiosOperations.getById(id);
    if (audio) {
      await deleteFile(audio.file_path);
    }
    DurationImageAudiosOperations.delete(id);
=======
    scheduleSearchReindex();
  });

  ipcMain.handle('durationImageAudios:updateCaption', async (_, id: number, caption: string | null) => {
    const result = DurationImageAudiosOperations.updateCaption(id, caption);
    scheduleSearchReindex();
    return result;
  });

  // ============ Image Audios (audio clips attached to recording-level images) ============
  ipcMain.handle('imageAudios:getByImage', async (_, imageId: number) => {
    return ImageAudiosOperations.getByImage(imageId);
  });

  ipcMain.handle('imageAudios:addFromBuffer', async (_, imageId: number, audioBuffer: ArrayBuffer, extension: string = 'webm') => {
    const { filePath, duration } = await saveImageAudioFromBuffer(imageId, audioBuffer, extension);
    const result = ImageAudiosOperations.create({
      image_id: imageId,
      file_path: filePath,
      caption: null,
      duration: duration,
      sort_order: ImageAudiosOperations.getMaxSortOrder(imageId) + 1,
    });
    scheduleSearchReindex();
    return result;
  });

  ipcMain.handle('imageAudios:delete', async (_, id: number) => {
    const audio = ImageAudiosOperations.getById(id);
    if (audio) {
      await deleteFile((audio as { file_path: string }).file_path);
    }
    ImageAudiosOperations.delete(id);
    scheduleSearchReindex();
  });

  ipcMain.handle('imageAudios:updateCaption', async (_, id: number, caption: string | null) => {
    const result = ImageAudiosOperations.updateCaption(id, caption);
    scheduleSearchReindex();
    return result;
  });

  // ============ Capture Image Audios (audio clips attached to quick_capture_images) ============
  ipcMain.handle('captureImageAudios:getByImage', async (_, captureImageId: number) => {
    return CaptureImageAudiosOperations.getByImage(captureImageId);
  });

  ipcMain.handle('captureImageAudios:addFromBuffer', async (_, captureImageId: number, audioBuffer: ArrayBuffer, extension: string = 'webm') => {
    const { filePath, duration } = await saveCaptureImageAudioFromBuffer(captureImageId, audioBuffer, extension);
    const result = CaptureImageAudiosOperations.create({
      capture_image_id: captureImageId,
      file_path: filePath,
      caption: null,
      duration: duration,
      sort_order: CaptureImageAudiosOperations.getMaxSortOrder(captureImageId) + 1,
    });
    scheduleSearchReindex();
    return result;
  });

  ipcMain.handle('captureImageAudios:delete', async (_, id: number) => {
    const audio = CaptureImageAudiosOperations.getById(id);
    if (audio) {
      await deleteFile((audio as { file_path: string }).file_path);
    }
    CaptureImageAudiosOperations.delete(id);
    scheduleSearchReindex();
  });

  ipcMain.handle('captureImageAudios:updateCaption', async (_, id: number, caption: string | null) => {
    const result = CaptureImageAudiosOperations.updateCaption(id, caption);
    scheduleSearchReindex();
    return result;
  });

  // ============ Audios (recording-level audio attachments) ============
  ipcMain.handle('audios:getByRecording', async (_, recordingId: number) => {
    return AudiosOperations.getByRecording(recordingId);
  });

  ipcMain.handle('audios:addFromBuffer', async (_, recordingId: number, audioBuffer: ArrayBuffer, extension: string = 'webm') => {
    const { filePath, duration } = await saveAudioAttachmentFromBuffer(recordingId, audioBuffer, extension);
    const result = AudiosOperations.create({
      recording_id: recordingId,
      file_path: filePath,
      caption: null,
      duration: duration,
      sort_order: 0,
    });
    scheduleSearchReindex();
    return result;
  });

  ipcMain.handle('audios:delete', async (_, id: number) => {
    const audio = AudiosOperations.getById(id);
    if (audio) {
      await deleteFile(audio.file_path);
    }
    AudiosOperations.delete(id);
    scheduleSearchReindex();
  });

  ipcMain.handle('audios:updateCaption', async (_, id: number, caption: string | null) => {
    const result = AudiosOperations.updateCaption(id, caption);
    scheduleSearchReindex();
    return result;
  });

  ipcMain.handle('audios:updateGroupColor', async (_, id: number, groupColor: DurationGroupColor | null) => {
    return AudiosOperations.updateGroupColor(id, groupColor);
  });

  // ============ Code Snippets ============
  ipcMain.handle('codeSnippets:getByRecording', async (_, recordingId: number) => {
    return CodeSnippetsOperations.getByRecording(recordingId);
  });

  ipcMain.handle('codeSnippets:create', async (_, snippet: CreateCodeSnippet) => {
    const result = CodeSnippetsOperations.create(snippet);
    scheduleSearchReindex();
    return result;
  });

  ipcMain.handle('codeSnippets:update', async (_, id: number, updates: UpdateCodeSnippet) => {
    const result = CodeSnippetsOperations.update(id, updates);
    scheduleSearchReindex();
    return result;
  });

  ipcMain.handle('codeSnippets:delete', async (_, id: number) => {
    CodeSnippetsOperations.delete(id);
    scheduleSearchReindex();
  });

  // ============ Duration Code Snippets ============
  ipcMain.handle('durationCodeSnippets:getByDuration', async (_, durationId: number) => {
    return DurationCodeSnippetsOperations.getByDuration(durationId);
  });

  ipcMain.handle('durationCodeSnippets:create', async (_, snippet: CreateDurationCodeSnippet) => {
    const result = DurationCodeSnippetsOperations.create(snippet);
    scheduleSearchReindex();
    return result;
  });

  ipcMain.handle('durationCodeSnippets:update', async (_, id: number, updates: UpdateDurationCodeSnippet) => {
    const result = DurationCodeSnippetsOperations.update(id, updates);
    scheduleSearchReindex();
    return result;
  });

  ipcMain.handle('durationCodeSnippets:delete', async (_, id: number) => {
    DurationCodeSnippetsOperations.delete(id);
    scheduleSearchReindex();
  });

  // ============ Backup ============
  ipcMain.handle('backup:create', async () => {
    return createBackup();
  });

  ipcMain.handle('backup:getPath', async () => {
    return getBackupDir();
  });

  ipcMain.handle('backup:openFolder', async () => {
    const backupPath = getBackupDir();
    // Ensure folder exists before opening
    const fs = await import('fs/promises');
    try {
      await fs.mkdir(backupPath, { recursive: true });
    } catch {
      // Ignore if already exists
    }
    const openResult = await shell.openPath(backupPath);
    if (openResult) {
      throw new Error(openResult);
    }
  });

  // ============ Screen Recording ============
  ipcMain.handle('screenRecording:getSources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 300, height: 200 }
    });
    return sources.map(source => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL()
    }));
  });

  // Lightweight version for SpaceDetector polling — no thumbnails, ~10x cheaper
  ipcMain.handle('screenRecording:getSourceIds', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 0, height: 0 }
    });
    return sources.map(source => ({
      id: source.id,
      name: source.name,
    }));
  });

  ipcMain.handle('screenRecording:saveFile', async (
    _,
    recordingId: number,
    videoBuffer: ArrayBuffer,
    resolution: string,
    fps: number,
    fallbackDurationMs?: number
  ) => {
    try {
      const { saveScreenRecording } = await import('../services/fileStorage');
      const result = await saveScreenRecording(
        recordingId,
        videoBuffer,
        resolution,
        fps,
        fallbackDurationMs
      );

      // Enhanced error reporting
      if (result.duration === null && result.extractionError) {
        console.error('[IPC] FFprobe extraction failed:', result.extractionError);
      }

      if (result.usedFallback) {
        console.warn('[IPC] Using fallback duration:', result.duration, 's');
      }

      // Update recording with video path, duration, and size
      // Note: This handler is only used for NEW screen recordings, never for extensions
      await RecordingsOperations.update(recordingId, {
        video_path: result.filePath,
        video_duration: result.duration !== null ? Math.floor(result.duration * 1000) : null,
        video_size: result.fileSize ?? null
      });

      return {
        filePath: result.filePath,
        duration: result.duration,
        _debug: {
          durationExtracted: result.durationSource === 'ffprobe',
          usedFallback: result.durationSource === 'fallback',
          extractionError: result.extractionError,
          fileSize: result.fileSize
        }
      };
    } catch (error) {
      console.error('[IPC] Error saving screen recording:', error);
      throw error;
    }
  });

  ipcMain.handle('screenRecording:finalizeFile', async (
    _,
    recordingId: number,
    sourcePath: string,
    resolution: string,
    fps: number,
    fallbackDurationMs?: number,
    audioBuffer?: ArrayBuffer,
    audioBitrate?: '32k' | '64k' | '128k',
    audioChannels?: 1 | 2,
    audioOffsetMs?: number
  ) => {
    try {
      const { finalizeScreenRecordingFile } = await import('../services/fileStorage');
      const result = await finalizeScreenRecordingFile(
        recordingId,
        sourcePath,
        resolution,
        fps,
        fallbackDurationMs,
        audioBuffer,
        audioBitrate,
        audioChannels,
        audioOffsetMs
      );

      if (result.duration === null && result.extractionError) {
        console.error('[IPC] FFprobe extraction failed:', result.extractionError);
      }

      if (result.usedFallback) {
        console.warn('[IPC] Using fallback duration:', result.duration, 's');
      }

      // NOTE: We don't update the database here because this handler is used in two contexts:
      // 1. New recordings (QuickScreenRecord) - caller will update database after this returns
      // 2. Extensions (ExtendVideoModal) - the extension file is temporary; only merge updates DB
      // Each caller is responsible for database updates based on their specific needs

      return {
        filePath: result.filePath,
        duration: result.duration,
        _debug: {
          durationExtracted: result.durationSource === 'ffprobe',
          usedFallback: result.durationSource === 'fallback',
          extractionError: result.extractionError,
          fileSize: result.fileSize,
          debugLogPath: (await import('../services/recordingDebugLogger')).getRecordingDebugLogPath(recordingId)
        }
      };
    } catch (error) {
      console.error('[IPC] Error finalizing screen recording:', error);
      throw error;
    }
  });

  ipcMain.handle('screenRecording:logDebugEvent', async (
    _,
    recordingId: number,
    event: { type: string; atMs?: number; origin?: string; payload?: any }
  ) => {
    try {
      const { appendRecordingDebugEvent } = await import('../services/recordingDebugLogger');
      await appendRecordingDebugEvent(recordingId, {
        type: event.type,
        atMs: event.atMs ?? Date.now(),
        origin: event.origin,
        payload: event.payload,
        processType: 'renderer'
      });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('[IPC] Failed to log debug event:', errorMessage);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle('screenRecording:getDebugLogPath', async (
    _,
    recordingId: number
  ) => {
    const { getRecordingDebugLogPath } = await import('../services/recordingDebugLogger');
    return getRecordingDebugLogPath(recordingId);
  });

  // ============ Video Compression ============
  ipcMain.handle('video:compress', async (event, filePath, options) => {
    const { compressVideo } = await import('../services/videoCompression');
    return compressVideo(filePath, options, (progress) => {
      // Send progress updates to the renderer process
      event.sender.send('video:compression-progress', progress);
    });
  });

  ipcMain.handle('video:replaceWithCompressed', async (_, originalPath, compressedPath) => {
    const { replaceWithCompressed } = await import('../services/videoCompression');
    return replaceWithCompressed(originalPath, compressedPath);
  });

  ipcMain.handle('video:checkFFmpeg', async () => {
    const { checkFFmpegAvailable } = await import('../services/videoCompression');
    return checkFFmpegAvailable();
  });

  ipcMain.handle('video:remuxToMp4', async (event, videoId: number, videoType: 'video' | 'durationVideo', filePath: string, crf?: number) => {
    try {
      const { remuxToMp4, compressVideo, replaceWithCompressed } = await import('../services/videoCompression');
      const { VideosOperations, DurationVideosOperations } = await import('../database/operations');

      let outputPath: string;

      if (crf != null) {
        // CRF mode: re-encode with compression (smaller file, same quality for screen content)
        const compressResult = await compressVideo(
          filePath,
          { crf, preset: 'medium', audioBitrate: '96k' },
          (progress) => event.sender.send('video:compression-progress', progress)
        );
        if (!compressResult.success || !compressResult.outputPath) {
          return { success: false, error: compressResult.error };
        }
        outputPath = compressResult.outputPath;
      } else {
        // Lossless remux: container swap only, no re-encode (~5 seconds)
        const remuxResult = await remuxToMp4(filePath);
        if (!remuxResult.success || !remuxResult.outputPath) {
          return { success: false, error: remuxResult.error };
        }
        outputPath = remuxResult.outputPath;
      }

      // Swap files on disk: delete original, rename output to final .mp4 path
      const swapResult = await replaceWithCompressed(filePath, outputPath);
      if (!swapResult.success || !swapResult.newPath) {
        return { success: false, error: swapResult.error };
      }

      // Update DB file_path
      if (videoType === 'video') {
        VideosOperations.updateFilePath(videoId, swapResult.newPath);
      } else {
        DurationVideosOperations.updateFilePath(videoId, swapResult.newPath);
      }

      return { success: true, newPath: swapResult.newPath };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  });

  ipcMain.handle('video:mergeExtension', async (
    _,
    recordingId: number,
    extensionSource: ArrayBuffer | string,
    originalDurationMs: number,
    extensionDurationMs: number,
    compressionOptions?: any,
    audioOffsetMs?: number
  ) => {
    const { mergeVideoFiles } = await import('../services/videoMerger');

    // Get video path from recording
    const recording = await RecordingsOperations.getById(recordingId);

    if (!recording || !recording.video_path) {
      throw new Error('Recording not found or has no video');
    }

    const shouldCleanupExtension = typeof extensionSource === 'string';
    const result = await mergeVideoFiles(
      recording.video_path,
      extensionSource as ArrayBuffer | string,
      originalDurationMs,
      extensionDurationMs,
      compressionOptions,
      shouldCleanupExtension,
      audioOffsetMs
    );

    return result;
  });

  // ============ Region Selection ============
  let regionSelectorWindows: any[] = [];
  let regionSelectionContext: 'new-recording' | 'extend-recording' = 'new-recording';

  ipcMain.handle('region:startSelection', async () => {
    console.log('[IPC] region:startSelection called');
    const { createRegionSelectorWindows } = await import('../windows/regionSelector');
    regionSelectorWindows = createRegionSelectorWindows();
    console.log(`[IPC] Created ${regionSelectorWindows.length} overlay window(s)`);
  });

  ipcMain.handle('region:cancel', async () => {
    const { closeAllRegionSelectorWindows } = await import('../windows/regionSelector');
    closeAllRegionSelectorWindows();
    regionSelectorWindows = [];

    // Restore main window focus and visibility after cancellation
    const { BrowserWindow, app } = await import('electron');
    const allWindows = BrowserWindow.getAllWindows();
    const mainWindow = allWindows.find((w: any) => !('displayId' in w));

    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();

      // macOS: Ensure app is visible in dock
      if (process.platform === 'darwin' && app.dock) {
        app.dock.show();
      }
      console.log('[IPC Handler] region:cancel - restored main window focus');
    }
  });

  ipcMain.handle('region:setExtensionMode', async (_, isExtensionMode: boolean) => {
    console.log('[IPC] region:setExtensionMode called:', isExtensionMode);
    regionSelectionContext = isExtensionMode ? 'extend-recording' : 'new-recording';
    console.log('[IPC] Region selection context set to:', regionSelectionContext);
  });

  ipcMain.on('region:sendRegion', async (_event, region: any) => {
    console.log('[IPC Handler] region:sendRegion received:', region);
    console.log('[IPC Handler] Selected from display:', region.selectedFromDisplayId);

    // Close overlays on OTHER displays (not the selected one)
    const { BrowserWindow } = await import('electron');
    const allWindows = BrowserWindow.getAllWindows();
    console.log('[IPC Handler] All windows count:', allWindows.length);

    let closedCount = 0;
    allWindows.forEach((win: any) => {
      if ('displayId' in win && win.displayId !== region.selectedFromDisplayId) {
        console.log(`[IPC Handler] Closing overlay for non-selected display ${win.displayId}`);

        // Exit fullscreen modes before closing
        if (win.isSimpleFullScreen()) win.setSimpleFullScreen(false);
        if (win.isFullScreen()) win.setFullScreen(false);

        // Destroy immediately
        win.destroy();
        closedCount++;
      }
    });

    console.log(`[IPC Handler] Closed ${closedCount} non-selected overlay(s)`);

    // Update regionSelectorWindows to only track selected display's window
    regionSelectorWindows = regionSelectorWindows.filter(
      (win: any) => !win.isDestroyed() && win.displayId === region.selectedFromDisplayId
    );

    console.log('[IPC Handler] Kept overlay for selected display:', region.selectedFromDisplayId);

    // Forward region data to main window based on context
    const mainWindow = allWindows.find((w: any) => !('displayId' in w));
    console.log('[IPC Handler] Main window found:', !!mainWindow);
    console.log('[IPC Handler] Region selection context:', regionSelectionContext);

    if (mainWindow) {
      if (regionSelectionContext === 'extend-recording') {
        // Send to ExtendVideoModal
        mainWindow.webContents.send('region:selected-for-extension', region);
        console.log('[IPC Handler] Sent region:selected-for-extension to main window');
      } else {
        // Send for new recording (normal flow)
        mainWindow.webContents.send('region:selected', region);
        console.log('[IPC Handler] Sent region:selected to main window');
      }

      // Reset context after sending
      regionSelectionContext = 'new-recording';
      console.log('[IPC Handler] Region selection context reset to new-recording');
    } else {
      console.error('[IPC Handler] Main window not found!');
    }
  });

  ipcMain.on('region:stopRecording', async () => {
    console.log('[IPC Handler] region:stopRecording received');

    // Close overlay windows
    const { closeAllRegionSelectorWindows } = await import('../windows/regionSelector');
    closeAllRegionSelectorWindows();
    regionSelectorWindows = [];
    console.log('[IPC Handler] Overlay windows closed');

    // Forward stop recording event to main window
    const { BrowserWindow, app } = await import('electron');
    const allWindows = BrowserWindow.getAllWindows();
    const mainWindow = allWindows.find((w: any) => !('displayId' in w));

    if (mainWindow) {
      // Restore main window focus and visibility
      mainWindow.show();
      mainWindow.focus();

      // macOS: Ensure app is visible in dock
      if (process.platform === 'darwin' && app.dock) {
        app.dock.show();
      }

      mainWindow.webContents.send('recording:stop');
      console.log('[IPC Handler] Sent recording:stop to main window and restored focus');
    } else {
      console.error('[IPC Handler] Main window not found!');
    }
  });

  // Duration update (React → All overlay windows)
  ipcMain.on('region:updateDuration', (_event, duration: number) => {
    const { BrowserWindow } = require('electron');
    const allWindows = BrowserWindow.getAllWindows();

    allWindows.forEach((win: any) => {
      if ('displayId' in win) {
        win.webContents.send('recording:durationUpdate', duration);
      }
    });
  });

  // Pause recording (Overlay → React main window)
  ipcMain.on('region:pauseRecording', () => {
    console.log('[IPC Handler] Received region:pauseRecording from overlay');
    const { BrowserWindow } = require('electron');
    const mainWindow = BrowserWindow.getAllWindows().find((w: any) => !('displayId' in w));
    if (mainWindow) {
      console.log('[IPC Handler] Sending recording:pause to main window');
      mainWindow.webContents.send('recording:pause');
    } else {
      console.error('[IPC Handler] CRITICAL: Main window not found!');
    }
  });

  // Resume recording (Overlay → React main window)
  ipcMain.on('region:resumeRecording', () => {
    console.log('[IPC Handler] Received region:resumeRecording from overlay');
    const { BrowserWindow } = require('electron');
    const mainWindow = BrowserWindow.getAllWindows().find((w: any) => !('displayId' in w));
    if (mainWindow) {
      console.log('[IPC Handler] Sending recording:resume to main window');
      mainWindow.webContents.send('recording:resume');
    } else {
      console.error('[IPC Handler] CRITICAL: Main window not found!');
    }
  });

  // Duration mark synchronization handlers

  // Mark toggle (Overlay → React main window)
  ipcMain.on('region:markToggle', () => {
    const { BrowserWindow } = require('electron');
    const mainWindow = BrowserWindow.getAllWindows().find((w: any) => !('displayId' in w));
    if (mainWindow) {
      mainWindow.webContents.send('recording:markToggle');
    }
  });

  // Mark state update (React main window → All overlay windows)
  ipcMain.on('region:markStateUpdate', (_event, isMarking: boolean, startTime: number) => {
    console.log('[IPC Handler] region:markStateUpdate received:', { isMarking, startTime });

    // Send to all region selector overlay windows
    // Use dynamic window lookup instead of stale array to ensure production reliability
    const { BrowserWindow } = require('electron');
    const allWindows = BrowserWindow.getAllWindows();
    const recordingOverlays = allWindows.filter((w: any) => 'displayId' in w && !w.isDestroyed());

    console.log(`[IPC Handler] Found ${recordingOverlays.length} recording overlay(s) to send marking state`);

    recordingOverlays.forEach((win, idx) => {
      console.log(`[IPC Handler] Sending markStateUpdate to overlay ${idx + 1} (displayId: ${win.displayId})`);
      win.webContents.send('recording:markStateUpdate', isMarking, startTime);
    });

    if (recordingOverlays.length === 0) {
      console.error('[IPC Handler] CRITICAL: No recording overlays found - marking state not sent!');
    }
  });

  // Pause state update (React main window → All overlay windows)
  ipcMain.on('region:pauseStateUpdate', (_event, isPaused: boolean) => {
    console.log('[IPC Handler] region:pauseStateUpdate received:', { isPaused });

    // Send to all region selector overlay windows
    const { BrowserWindow } = require('electron');
    const allWindows = BrowserWindow.getAllWindows();
    const recordingOverlays = allWindows.filter((w: any) => 'displayId' in w && !w.isDestroyed());

    console.log(`[IPC Handler] Found ${recordingOverlays.length} recording overlay(s) to send pause state`);

    recordingOverlays.forEach((win, idx) => {
      console.log(`[IPC Handler] Sending pauseStateUpdate to overlay ${idx + 1} (isPaused: ${isPaused})`);
      win.webContents.send('region:pauseStateUpdate', isPaused);
    });

    if (recordingOverlays.length === 0) {
      console.warn('[IPC Handler] No recording overlays found - pause state not sent!');
    }
  });

  // Pause source update (React main window → All overlay windows)
  ipcMain.on('region:pauseSourceUpdate', (_event, source: 'manual' | 'marking' | null) => {
    console.log('[IPC Handler] region:pauseSourceUpdate received:', { source });

    // Send to all region selector overlay windows
    const { BrowserWindow } = require('electron');
    const allWindows = BrowserWindow.getAllWindows();
    const recordingOverlays = allWindows.filter((w: any) => 'displayId' in w && !w.isDestroyed());

    console.log(`[IPC Handler] Found ${recordingOverlays.length} recording overlay(s) to send pause source`);

    recordingOverlays.forEach((win, idx) => {
      console.log(`[IPC Handler] Sending pauseSourceUpdate to overlay ${idx + 1} (source: ${source})`);
      win.webContents.send('region:pauseSourceUpdate', source);
    });

    if (recordingOverlays.length === 0) {
      console.warn('[IPC Handler] No recording overlays found - pause source not sent!');
    }
  });

  // Mark note update (Bidirectional: React ↔ Overlay)
  ipcMain.on('region:markNote', (_event, note: string) => {
    const { BrowserWindow } = require('electron');
    const sender = _event.sender;

    // Forward to all windows except sender (don't log - too noisy)
    const allWindows = BrowserWindow.getAllWindows();
    allWindows.forEach((win: any) => {
      if (win && !win.isDestroyed() && win.webContents !== sender) {
        win.webContents.send('recording:markNoteUpdate', note);
      }
    });
  });

  // Input field toggle (React main window → All overlay windows, or Overlay → React)
  ipcMain.on('region:inputFieldToggle', () => {
    console.log('[IPC Handler] Received region:inputFieldToggle - broadcasting to all windows');
    const { BrowserWindow } = require('electron');

    const allWindows = BrowserWindow.getAllWindows();
    console.log(`[IPC Handler] Broadcasting to ${allWindows.length} windows`);

    // Send to all windows (both React main window and overlays)
    allWindows.forEach((win: any, idx) => {
      if (win && !win.isDestroyed()) {
        console.log(`[IPC Handler] Sending recording:inputFieldToggle to window ${idx + 1} (id: ${win.id}, hasDisplayId: ${'displayId' in win})`);
        win.webContents.send('recording:inputFieldToggle');
      }
    });
  });

  // Mark input focus (Overlay → React main window)
  ipcMain.on('region:markInputFocus', (event) => {
    console.log('[IPC Handler] Received region:markInputFocus from overlay');
    const { BrowserWindow } = require('electron');
    const mainWindow = BrowserWindow.getAllWindows().find((w: any) => !('displayId' in w));
    if (mainWindow) {
      console.log('[IPC Handler] Sending recording:markInputFocus to main window');
      mainWindow.webContents.send('recording:markInputFocus');
    } else {
      console.error('[IPC Handler] Main window not found for markInputFocus!');
    }
  });

  // Mark input blur (Overlay → React main window)
  ipcMain.on('region:markInputBlur', (event) => {
    console.log('[IPC Handler] Received region:markInputBlur from overlay');
    const { BrowserWindow } = require('electron');
    const mainWindow = BrowserWindow.getAllWindows().find((w: any) => !('displayId' in w));
    if (mainWindow) {
      console.log('[IPC Handler] Sending recording:markInputBlur to main window');
      mainWindow.webContents.send('recording:markInputBlur');
    } else {
      console.error('[IPC Handler] Main window not found for markInputBlur!');
    }
  });

  // Group color toggle broadcast (React → All overlay windows)
  ipcMain.on('region:groupColorToggle', (_event, isActive: boolean, currentColor: DurationGroupColor | null) => {
    console.log('[IPC] Broadcasting group color toggle:', { isActive, currentColor });

    const { BrowserWindow } = require('electron');
    const allWindows = BrowserWindow.getAllWindows();
    const recordingOverlays = allWindows.filter((w: any) => 'displayId' in w && !w.isDestroyed());

    recordingOverlays.forEach((win) => {
      console.log('[IPC] Sending group color toggle to overlay:', win.id);
      win.webContents.send('region:groupColorToggle', isActive, currentColor);
    });
  });

  // Group color toggle request (Overlay → React main window)
  ipcMain.on('region:groupColorToggleRequest', (event) => {
    console.log('[IPC Handler] Received region:groupColorToggleRequest from overlay');
    const { BrowserWindow } = require('electron');
    const mainWindow = BrowserWindow.getAllWindows().find((w: any) => !('displayId' in w));
    if (mainWindow) {
      console.log('[IPC Handler] Sending recording:groupColorToggleRequest to main window');
      mainWindow.webContents.send('recording:groupColorToggleRequest');
    } else {
      console.error('[IPC Handler] Main window not found for groupColorToggleRequest!');
    }
  });

  // Enable/disable click-through for overlay window
  ipcMain.on('region:setClickThrough', (event, enabled: boolean) => {
    // Find the region selector window that sent this event
    const { BrowserWindow } = require('electron');
    const senderWindow = BrowserWindow.fromWebContents(event.sender);

    if (senderWindow && 'displayId' in senderWindow) {
      // Enable click-through with forward option
      // forward: true → mouse events pass through to apps below
      senderWindow.setIgnoreMouseEvents(enabled, { forward: true });
    } else {
      console.error('[IPC Handler] Could not find region selector window');
    }
  });

  // Window level management for keyboard input
  // Note: We use 'modal-panel' instead of 'floating' to stay visible above fullscreen apps
  // while still accepting keyboard input. Fullscreen apps render between 'floating' and
  // 'screen-saver' levels, so 'floating' would make the overlay invisible.
  ipcMain.on('region:setWindowLevel', (event, level: 'floating' | 'screen-saver') => {
    console.log('[IPC Handler] region:setWindowLevel requested:', level);

    const { BrowserWindow } = require('electron');
    const senderWindow = BrowserWindow.fromWebContents(event.sender);

    if (senderWindow && 'displayId' in senderWindow) {
      // Use modal-panel instead of floating to stay above fullscreen apps
      const effectiveLevel = level === 'floating' ? 'modal-panel' : level;
      senderWindow.setAlwaysOnTop(true, effectiveLevel);
      console.log('[IPC Handler] Window level set to:', effectiveLevel, `(requested: ${level})`);

      // When lowering for keyboard input, explicitly focus
      if (level === 'floating') {
        senderWindow.focus();
        console.log('[IPC Handler] Window focused for keyboard input');
      }
    }
  });

  // ============ Audio Markers ============
  ipcMain.handle('audioMarkers:getByAudio', async (_, audioId: number, audioType: 'duration' | 'duration_image' | 'recording' | 'recording_image' | 'quick_capture_audio') => {
    return AudioMarkersOperations.getByAudio(audioId, audioType);
  });

  ipcMain.handle('audioMarkers:addBatch', async (_, markers: { audio_id: number; audio_type: 'duration' | 'duration_image' | 'recording' | 'quick_capture_audio'; marker_type: string; start_time: number; end_time: number | null }[]) => {
    if (!markers || markers.length === 0) return [];
    return AudioMarkersOperations.addBatch(markers as any);
  });

  ipcMain.handle('audioMarkers:updateCaption', async (_, markerId: number, caption: string | null) => {
    const result = AudioMarkersOperations.updateCaption(markerId, caption);
    scheduleSearchReindex();
    return result;
  });

  // ============ Settings ============
  ipcMain.handle('settings:get', async (_, key: string) => {
    return SettingsOperations.get(key);
  });

  ipcMain.handle('settings:set', async (_, key: string, value: string) => {
    SettingsOperations.set(key, value);
  });

  ipcMain.handle('settings:getAll', async () => {
    return SettingsOperations.getAll();
  });

  // ============ Screen (Display Information) ============
  ipcMain.handle('screen:getAllDisplays', async () => {
    const { screen } = await import('electron');
    return screen.getAllDisplays();
  });

  ipcMain.handle('screen:getCursorScreenPoint', async () => {
    const { screen } = await import('electron');
    return screen.getCursorScreenPoint();
  });

  // ============ App Control ============
  ipcMain.handle('app:quit', async () => {
    console.log('[IPC] Quit requested from renderer process');
    const { app } = await import('electron');
    app.quit();
  });

  ipcMain.handle('app:forceQuit', async () => {
    console.log('[IPC] Force quit requested from renderer process');
    const { app } = await import('electron');
    app.exit(0);
  });

  // ============ PDF ============
  ipcMain.handle('pdf:pickFile', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    });
    return result.filePaths[0] ?? null;
  });

  ipcMain.handle('pdf:copyToMedia', async (_, recordingId: number, sourcePath: string) => {
    return savePdfFile(recordingId, sourcePath);
  });

  ipcMain.handle('pdf:readFile', async (_, filePath: string) => {
    const fs = await import('fs/promises');
    const buffer = await fs.readFile(filePath);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  });

  ipcMain.handle('pdf:saveBookData', async (_, recordingId: number, bookData: object) => {
    const { saveBookData } = await import('../services/fileStorage');
    return saveBookData(recordingId, bookData);
  });

  ipcMain.handle('pdf:readBookData', async (_, bookDataPath: string) => {
    const { readBookData } = await import('../services/fileStorage');
    return readBookData(bookDataPath);
  });

  // ============ Cloud Sync ============
  ipcMain.handle('sync:upload', async () => {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const { app } = await import('electron');
    const path = await import('path');
    const fs = await import('fs');
    const execAsync = promisify(exec);

    const userDataPath = app.getPath('userData');
    const localDb = path.join(userDataPath, 'NotesWithAudioAndVideo.db');
    const localMedia = path.join(userDataPath, 'media');

    const vpsUser = 'root'; // your SSH user
    const vpsHost = 'yourvps.com'; // your VPS hostname or IP
    const vpsDataDir = '/var/www/notes/data'; // data directory on your VPS
    const vpsKey = path.join(process.env.HOME || '~', '.ssh', 'your_vps_key'); // path to your SSH private key

    const sshOpts = `-i "${vpsKey}" -o StrictHostKeyChecking=accept-new`;

    console.log('[IPC] Starting cloud sync...');
    console.log('[IPC] DB:', localDb);
    console.log('[IPC] Media:', localMedia);

    const Database = (await import('better-sqlite3')).default;

    try {
      // Ensure remote directories
      await execAsync(
        `ssh ${sshOpts} ${vpsUser}@${vpsHost} "mkdir -p ${vpsDataDir}/media ${vpsUploadsDir}"`,
        { timeout: 30000 }
      );

      // ── Phase 1: Pull Mobile Uploads ──
      console.log('[IPC] Phase 1: Pulling mobile uploads...');

      const { stdout: countOut } = await execAsync(
        `ssh ${sshOpts} ${vpsUser}@${vpsHost} "find ${vpsUploadsDir} -name '*.json' 2>/dev/null | wc -l"`,
        { timeout: 30000 }
      );
      const pendingCount = parseInt(countOut.trim(), 10) || 0;
      console.log(`[IPC] Pending uploads on VPS: ${pendingCount}`);

      if (pendingCount > 0) {
        const localPending = path.join(userDataPath, 'pending_uploads');
        fs.mkdirSync(localPending, { recursive: true });

        // Download staging JSONs
        await execAsync(
          `rsync -avz -e "ssh ${sshOpts}" ${vpsUser}@${vpsHost}:${vpsUploadsDir}/ "${localPending}/"`,
          { timeout: 60000 }
        );

        // Process each staging JSON
        const jsonFiles = fs.readdirSync(localPending).filter((f: string) => f.endsWith('.json'));
        const db = new Database(localDb);

        for (const jsonFile of jsonFiles) {
          try {
            const raw = fs.readFileSync(path.join(localPending, jsonFile), 'utf-8');
            const meta = JSON.parse(raw);
            const { type } = meta;

            if (type === 'image') {
              const { duration_id, file_path: vpsFilePath, caption, sort_order, created_at } = meta;
              const filename = path.basename(vpsFilePath);

              // Check if file still exists on VPS (may have been deleted)
              const { stdout: existsOut } = await execAsync(
                `ssh ${sshOpts} ${vpsUser}@${vpsHost} "test -f '${vpsFilePath}' && echo yes || echo no"`,
                { timeout: 15000 }
              );
              if (existsOut.trim() === 'no') {
                console.log(`[IPC] SKIP: File deleted on VPS, cleaning stale staging JSON: ${filename}`);
                await execAsync(
                  `ssh ${sshOpts} ${vpsUser}@${vpsHost} "rm -f ${vpsUploadsDir}/${jsonFile}"`,
                  { timeout: 15000 }
                );
                continue;
              }

              const localDir = path.join(localMedia, 'duration_images', String(duration_id));
              fs.mkdirSync(localDir, { recursive: true });
              const localFile = path.join(localDir, filename);

              await execAsync(
                `scp ${sshOpts} ${vpsUser}@${vpsHost}:"${vpsFilePath}" "${localFile}"`,
                { timeout: 60000 }
              );

              db.prepare(
                `INSERT INTO duration_images (duration_id, file_path, caption, sort_order, created_at)
                 VALUES (?, ?, ?, ?, ?)`
              ).run(duration_id, localFile, caption || null, sort_order, created_at);

              console.log(`[IPC] Pulled image: ${filename} -> duration ${duration_id}`);

            } else if (type === 'audio') {
              const { duration_id, file_path: vpsFilePath, caption, sort_order, created_at } = meta;
              const filename = path.basename(vpsFilePath);

              // Check if file still exists on VPS (may have been deleted)
              const { stdout: existsOut } = await execAsync(
                `ssh ${sshOpts} ${vpsUser}@${vpsHost} "test -f '${vpsFilePath}' && echo yes || echo no"`,
                { timeout: 15000 }
              );
              if (existsOut.trim() === 'no') {
                console.log(`[IPC] SKIP: File deleted on VPS, cleaning stale staging JSON: ${filename}`);
                await execAsync(
                  `ssh ${sshOpts} ${vpsUser}@${vpsHost} "rm -f ${vpsUploadsDir}/${jsonFile}"`,
                  { timeout: 15000 }
                );
                continue;
              }

              const localDir = path.join(localMedia, 'duration_audios', String(duration_id));
              fs.mkdirSync(localDir, { recursive: true });
              const localFile = path.join(localDir, filename);

              await execAsync(
                `scp ${sshOpts} ${vpsUser}@${vpsHost}:"${vpsFilePath}" "${localFile}"`,
                { timeout: 60000 }
              );

              db.prepare(
                `INSERT INTO duration_audios (duration_id, file_path, caption, duration, sort_order, created_at)
                 VALUES (?, ?, ?, ?, ?, ?)`
              ).run(duration_id, localFile, caption || null, meta.duration || null, sort_order, created_at);

              console.log(`[IPC] Pulled audio: ${filename} -> duration ${duration_id}`);

            } else if (type === 'audio_delete') {
              const { item_id, file_path: vpsFilePath } = meta;
              db.prepare('DELETE FROM duration_audios WHERE id = ?').run(item_id);

              // Delete local media file
              if (vpsFilePath) {
                const filename = path.basename(vpsFilePath);
                const parentDir = path.basename(path.dirname(vpsFilePath));
                const localFile = path.join(localMedia, 'duration_audios', parentDir, filename);
                try {
                  if (fs.existsSync(localFile)) fs.unlinkSync(localFile);
                } catch {
                  // file may not exist locally
                }
              }

              console.log(`[IPC] Deleted audio: id=${item_id}`);

            } else if (type === 'caption_update') {
              const { table, item_id, caption: newCaption } = meta;
              const allowedTables = ['duration_images', 'duration_audios'];
              if (allowedTables.includes(table)) {
                db.prepare(`UPDATE ${table} SET caption = ? WHERE id = ?`).run(newCaption, item_id);
                console.log(`[IPC] Updated caption: ${table} id=${item_id}`);
              } else {
                console.warn(`[IPC] Unknown table '${table}' in caption_update, skipping`);
              }
            }

            // Delete staging JSON on VPS
            await execAsync(
              `ssh ${sshOpts} ${vpsUser}@${vpsHost} "rm -f ${vpsUploadsDir}/${jsonFile}"`,
              { timeout: 15000 }
            );
          } catch (fileErr) {
            console.error(`[IPC] Failed to process upload ${jsonFile}:`, (fileErr as Error).message);
          }
        }

        db.close();

        // Clean up local temp
        fs.rmSync(localPending, { recursive: true, force: true });
        console.log('[IPC] Pull phase complete');
      } else {
        console.log('[IPC] No pending uploads');
      }

      // ── Phase 2: Push to VPS ──
      console.log('[IPC] Phase 2: Pushing to VPS...');

      // Checkpoint WAL to flush all writes into main DB file
      const checkpointDb = new Database(localDb);
      checkpointDb.pragma('wal_checkpoint(TRUNCATE)');
      checkpointDb.close();
      console.log('[IPC] WAL checkpointed');

      // Sync database (full copy)
      await execAsync(
        `scp ${sshOpts} "${localDb}" ${vpsUser}@${vpsHost}:${vpsDataDir}/NotesWithAudioAndVideo.db`,
        { timeout: 60000 }
      );
      console.log('[IPC] Database synced');

      // Sync media (delta)
      const { stdout } = await execAsync(
        `rsync -avz --delete -e "ssh ${sshOpts}" "${localMedia}/" ${vpsUser}@${vpsHost}:${vpsDataDir}/media/`,
        { timeout: 300000 }
      );
      console.log('[IPC] Media synced');

      // Rebuild FTS search index after sync (DB was overwritten)
      try { rebuildSearchIndex(); } catch { /* non-fatal */ }

      return { success: true, output: stdout };
    } catch (error) {
      const err = error as Error & { stdout?: string; stderr?: string };
      console.error('[IPC] Sync failed:', err.message);
      return {
        success: false,
        error: err.message,
        output: err.stdout || '',
        stderr: err.stderr || '',
      };
    }
  });

  // ============ Search ============
  ipcMain.handle('search:global', async (_, query: string, limit?: number) => {
    return SearchOperations.search(query, limit);
  });

  ipcMain.handle('search:rebuildIndex', async () => {
    rebuildSearchIndex();
  });

  ipcMain.handle('search:filtered', (_event, params) => {
    return FilteredSearchOperations.search(params);
  });

  // ============ Tags ============
  ipcMain.handle('tags:getAll', async () => {
    return TagOperations.getAllWithCounts();
  });

  ipcMain.handle('tags:search', async (_, query: string) => {
    return TagOperations.search(query);
  });

  ipcMain.handle('tags:getByMedia', async (_, mediaType: string, mediaId: number) => {
    return TagOperations.getByMedia(mediaType as import('../../src/types').MediaTagType, mediaId);
  });

  ipcMain.handle('tags:setForMedia', async (_, mediaType: string, mediaId: number, tagNames: string[]) => {
    TagOperations.setForMedia(mediaType as import('../../src/types').MediaTagType, mediaId, tagNames);
    scheduleSearchReindex();
  });

  ipcMain.handle('tags:rename', async (_, oldName: string, newName: string) => {
    TagOperations.rename(oldName, newName);
    scheduleSearchReindex();
  });

  ipcMain.handle('tags:delete', async (_, tagId: number) => {
    TagOperations.delete(tagId);
    scheduleSearchReindex();
  });

  ipcMain.handle('tags:getMediaByTag', async (_, mediaType: string, tagName: string) => {
    return TagOperations.getMediaByTag(mediaType as import('../../src/types').MediaTagType, tagName);
  });

  ipcMain.handle('tags:getItemsByTag', async (_, tagName: string) => {
    return TagOperations.getItemsByTag(tagName);
  });

  ipcMain.handle('tags:recordSearch', async (_, tagId: number) => {
    TagOperations.recordSearch(tagId);
  });

  // Quick Captures
  ipcMain.handle('quickCaptures:create', async (_, note: string, tags: string[]) => {
    return QuickCaptureOperations.create(note, tags);
  });

  ipcMain.handle('quickCaptures:getOrCreate', async (_, note: string, tags: string[]) => {
    return QuickCaptureOperations.getOrCreate(note, tags);
  });

  ipcMain.handle('quickCaptures:getRecent', async () => {
    return QuickCaptureOperations.getRecent();
  });

  ipcMain.handle('quickCaptures:addImage', async (_, captureId: number, imageBuffer: ArrayBuffer, extension?: string) => {
    const { filePath, thumbnailPath } = await saveQuickCaptureImage(imageBuffer, extension);
    return QuickCaptureOperations.addImage(captureId, filePath, thumbnailPath);
  });

  ipcMain.handle('quickCaptures:addAudio', async (_, captureId: number, audioBuffer: ArrayBuffer, extension?: string) => {
    const filePath = await saveQuickCaptureAudio(audioBuffer, extension);
    return QuickCaptureOperations.addAudio(captureId, filePath);
  });

  ipcMain.handle('quickCaptures:delete', async (_, id: number) => {
    const { imagePaths, audioPaths } = QuickCaptureOperations.delete(id);
    await deleteQuickCaptureFiles(imagePaths, audioPaths);
  });

  ipcMain.handle('quickCaptures:updateTags', async (_, id: number, tags: string[]) => {
    QuickCaptureOperations.updateTags(id, tags);
  });

  ipcMain.handle('quickCaptures:cleanup', async () => {
    const expired = QuickCaptureOperations.getExpired();
    for (const item of expired) {
      await deleteQuickCaptureFiles(item.imagePaths, item.audioPaths);
    }
  });

  ipcMain.handle('quickCaptures:reorderImages', async (_, captureId: number, imageIds: number[]) => {
    QuickCaptureOperations.reorderImages(captureId, imageIds);
  });

  ipcMain.handle('quickCaptures:deleteImage', async (_, imageId: number) => {
    const { filePath, thumbnailPath } = QuickCaptureOperations.deleteImage(imageId);
    if (filePath) await fs.unlink(filePath).catch(() => {});
    if (thumbnailPath && thumbnailPath !== filePath) await fs.unlink(thumbnailPath).catch(() => {});
    scheduleSearchReindex();
  });

  ipcMain.handle('quickCaptures:updateImageCaption', async (_, imageId: number, caption: string | null) => {
    const result = QuickCaptureOperations.updateImageCaption(imageId, caption);
    scheduleSearchReindex();
    return result;
  });

  ipcMain.handle('quickCaptures:deleteAudio', async (_, audioId: number) => {
    const { filePath } = QuickCaptureOperations.deleteAudio(audioId);
    if (filePath) { const fs = await import('fs/promises'); await fs.unlink(filePath).catch(() => {}); }
  });

  ipcMain.handle('quickCaptures:updateAudioCaption', async (_, audioId: number, caption: string | null) => {
    const result = QuickCaptureOperations.updateAudioCaption(audioId, caption);
    scheduleSearchReindex();
    return result;
  });

  ipcMain.handle('quickCaptures:replaceImageFromClipboard', async (_, imageId: number, imageBuffer: ArrayBuffer, extension: string = 'png') => {
    const old = QuickCaptureOperations.getImageById(imageId);
    const { filePath, thumbnailPath } = await saveQuickCaptureImage(imageBuffer, extension);
    if (old) {
      await deleteFile(old.file_path);
      if (old.thumbnail_path && old.thumbnail_path !== old.file_path) {
        await deleteFile(old.thumbnail_path);
      }
    }
    return QuickCaptureOperations.updateImageFilePaths(imageId, filePath, thumbnailPath);
  });

  // ============ Image Children ============
  ipcMain.handle('imageChildren:getByParent', async (_, parentType: string, parentId: number) => {
    return ImageChildrenOperations.getByParent(parentType, parentId);
  });

  ipcMain.handle('imageChildren:addFromClipboard', async (_, parentType: string, parentId: number, imageBuffer: ArrayBuffer, extension: string = 'png') => {
    const { filePath, thumbnailPath } = await saveImageChildFromBuffer(parentId, imageBuffer, extension);
    const nextSortOrder = ImageChildrenOperations.getMaxSortOrder(parentType, parentId) + 1;
    return ImageChildrenOperations.create({
      parent_type: parentType,
      parent_id: parentId,
      file_path: filePath,
      thumbnail_path: thumbnailPath,
      sort_order: nextSortOrder,
    });
  });

  ipcMain.handle('imageChildren:delete', async (_, id: number) => {
    const child = ImageChildrenOperations.getById(id) as { file_path: string; thumbnail_path: string | null } | null;
    if (child) {
      await deleteFile(child.file_path);
      if (child.thumbnail_path && child.thumbnail_path !== child.file_path) {
        await deleteFile(child.thumbnail_path);
      }
    }
    ImageChildrenOperations.delete(id);
    scheduleSearchReindex();
  });

  ipcMain.handle('imageChildren:updateCaption', async (_, id: number, caption: string | null) => {
    return ImageChildrenOperations.updateCaption(id, caption);
  });

  ipcMain.handle('imageChildren:reorder', async (_, parentType: string, parentId: number, orderedIds: number[]) => {
    ImageChildrenOperations.reorder(parentType, parentId, orderedIds);
  });

  ipcMain.handle('imageChildren:replaceFromClipboard', async (_, childId: number, imageBuffer: ArrayBuffer, extension: string = 'png') => {
    const old = ImageChildrenOperations.getById(childId) as { file_path: string; thumbnail_path: string | null; parent_id: number } | null;
    const { filePath, thumbnailPath } = await saveImageChildFromBuffer(old?.parent_id ?? 0, imageBuffer, extension);
    if (old) {
      await deleteFile(old.file_path);
      if (old.thumbnail_path && old.thumbnail_path !== old.file_path) {
        await deleteFile(old.thumbnail_path);
      }
    }
    return ImageChildrenOperations.updateFilePaths(childId, filePath, thumbnailPath);
  });

  // ============ Image Child Audios ============
  ipcMain.handle('imageChildAudios:getByChild', async (_, imageChildId: number) => {
    return ImageChildAudiosOperations.getByChild(imageChildId);
  });

  ipcMain.handle('imageChildAudios:addFromBuffer', async (_, imageChildId: number, audioBuffer: ArrayBuffer, extension: string = 'webm') => {
    const { filePath, duration } = await saveImageChildAudioFromBuffer(imageChildId, audioBuffer, extension);
    return ImageChildAudiosOperations.create({
      image_child_id: imageChildId,
      file_path: filePath,
      caption: null,
      duration: duration,
      sort_order: ImageChildAudiosOperations.getMaxSortOrder(imageChildId) + 1,
    });
  });

  ipcMain.handle('imageChildAudios:delete', async (_, id: number) => {
    const audio = ImageChildAudiosOperations.getById(id) as { file_path: string } | null;
    if (audio) {
      await deleteFile(audio.file_path);
    }
    ImageChildAudiosOperations.delete(id);
  });

  ipcMain.handle('imageChildAudios:updateCaption', async (_, id: number, caption: string | null) => {
    return ImageChildAudiosOperations.updateCaption(id, caption);
  });

  // ============ Image Annotations ============
  ipcMain.handle('imageAnnotations:getByImage', async (_, imageType: string, imageId: number) => {
    return ImageAnnotationsOperations.getByImage(imageType, imageId);
  });

  ipcMain.handle('imageAnnotations:create', async (_, data: {
    image_type: string; image_id: number; ann_type: 'rect' | 'line';
    x1: number; y1: number; x2: number; y2: number; color: string; stroke_width: number;
  }) => {
    return ImageAnnotationsOperations.create(data);
  });

  ipcMain.handle('imageAnnotations:update', async (_, id: number, partial: { x1?: number; y1?: number; x2?: number; y2?: number; color?: string }) => {
    return ImageAnnotationsOperations.update(id, partial);
  });

  ipcMain.handle('imageAnnotations:delete', async (_, id: number) => {
    ImageAnnotationsOperations.delete(id);
  });

  // ============ OCR ============
  ipcMain.handle('ocr:recognizeRegion', async (_, imagePath: string, rect: { x: number; y: number; width: number; height: number }) => {
    function toSlug(text: string): string {
      return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, '-');
    }

    if (process.platform === 'darwin') {
      // macOS: use Vision framework via compiled Swift binary
      const { execFile } = await import('child_process');
      const path = await import('path');
      const { app } = await import('electron');

      const binaryPath = app.isPackaged
        ? path.join(process.resourcesPath, 'native', 'ocr_helper')
        : path.join(__dirname, '../electron/native/ocr_helper');

      return new Promise<{ text: string; slug: string }>((resolve, reject) => {
        execFile(
          binaryPath,
          [imagePath, String(rect.x), String(rect.y), String(rect.width), String(rect.height)],
          { timeout: 15000 },
          (err, stdout, stderr) => {
            if (err) { console.error('OCR error:', stderr); return reject(err); }
            const text = stdout.trim();
            resolve({ text, slug: toSlug(text) });
          }
        );
      });
    } else {
      // Windows / Linux: use Tesseract.js
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng', 1, { logger: () => {} });
      try {
        const { data: { text } } = await worker.recognize(imagePath, {
          rectangle: { left: rect.x, top: rect.y, width: rect.width, height: rect.height },
        });
        const trimmed = text.trim();
        return { text: trimmed, slug: toSlug(trimmed) };
      } finally {
        await worker.terminate();
      }
    }
  });

  // OCR: extract full-image text and store as caption2
  ipcMain.handle('ocr:extractCaption2', async (
    _,
    imageType: string,
    imageId: number,
    filePath: string
  ): Promise<string> => {
    const { nativeImage } = await import('electron');
    const { width, height } = nativeImage.createFromPath(filePath).getSize();
    if (!width || !height) throw new Error('Could not read image dimensions');

    let ocrText = '';
    if (process.platform === 'darwin') {
      const { execFile } = await import('child_process');
      const path = await import('path');
      const { app } = await import('electron');
      const binaryPath = app.isPackaged
        ? path.join(process.resourcesPath, 'native', 'ocr_helper')
        : path.join(__dirname, '../electron/native/ocr_helper');
      ocrText = await new Promise<string>((resolve, reject) => {
        execFile(
          binaryPath,
          [filePath, '0', '0', String(width), String(height)],
          { timeout: 60000 },
          (err, stdout, stderr) => {
            if (err) { console.error('OCR error:', stderr); return reject(err); }
            resolve(stdout.trim());
          }
        );
      });
    } else {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng', 1, { logger: () => {} });
      try {
        const { data: { text } } = await worker.recognize(filePath, {
          rectangle: { left: 0, top: 0, width, height },
        });
        ocrText = text.trim();
      } finally {
        await worker.terminate();
      }
    }

    switch (imageType) {
      case 'image':               ImagesOperations.updateCaption2(imageId, ocrText || null); break;
      case 'duration_image':      DurationImagesOperations.updateCaption2(imageId, ocrText || null); break;
      case 'quick_capture_image': QuickCaptureOperations.updateImageCaption2(imageId, ocrText || null); break;
      case 'image_child':         ImageChildrenOperations.updateCaption2(imageId, ocrText || null); break;
      default: throw new Error(`Unknown imageType for caption2: ${imageType}`);
    }
    scheduleSearchReindex();
    return ocrText;
  });

  // Media Color Assignments (many-to-many — images, audios, and any future media type)
  ipcMain.handle('mediaColors:toggle', async (_, mediaType: string, mediaId: number, colorKey: string) => {
    return MediaColorOperations.toggle(mediaType, mediaId, colorKey);
  });

  ipcMain.handle('mediaColors:getByMedia', async (_, mediaType: string, mediaId: number) => {
    return MediaColorOperations.getByMedia(mediaType, mediaId);
  });

  ipcMain.handle('mediaColors:getBatch', async (_, mediaType: string, mediaIds: number[]) => {
    return MediaColorOperations.getBatch(mediaType, mediaIds);
  });

  // Recording Plans
  ipcMain.handle('recordingPlans:getByRecording', async (_, recordingId: number) => {
    return RecordingPlansOperations.getByRecording(recordingId);
  });

  ipcMain.handle('recordingPlans:getAll', async () => {
    return RecordingPlansOperations.getAll();
  });

  ipcMain.handle('recordingPlans:create', async (_, plan) => {
    return RecordingPlansOperations.create(plan);
  });

  ipcMain.handle('recordingPlans:update', async (_, id: number, updates) => {
    return RecordingPlansOperations.update(id, updates);
  });

  ipcMain.handle('recordingPlans:delete', async (_, id: number) => {
    RecordingPlansOperations.delete(id);
  });

  // Duration Plans
  ipcMain.handle('durationPlans:getByDuration', async (_, durationId: number) => {
    return DurationPlansOperations.getByDuration(durationId);
  });

  ipcMain.handle('durationPlans:getAll', async () => {
    return DurationPlansOperations.getAll();
  });

  ipcMain.handle('durationPlans:create', async (_, plan) => {
    return DurationPlansOperations.create(plan);
  });

  ipcMain.handle('durationPlans:update', async (_, id: number, updates) => {
    return DurationPlansOperations.update(id, updates);
  });

  ipcMain.handle('durationPlans:delete', async (_, id: number) => {
    DurationPlansOperations.delete(id);
  });

  // Calendar Todos
  ipcMain.handle('calendarTodos:getAll', async () => {
    return CalendarTodosOperations.getAll();
  });

  ipcMain.handle('calendarTodos:create', async (_, todo: { plan_date: string; text: string }) => {
    return CalendarTodosOperations.create(todo);
  });

  ipcMain.handle('calendarTodos:update', async (_, id: number, updates: { text?: string; completed?: number }) => {
    return CalendarTodosOperations.update(id, updates);
  });

  ipcMain.handle('calendarTodos:delete', async (_, id: number) => {
    CalendarTodosOperations.delete(id);
  });

  // Study Tracking
  ipcMain.handle('studyTracker:createSession', async (_, startedAt: string) => {
    return StudyTrackingOperations.createSession(startedAt);
  });

  ipcMain.handle('studyTracker:endSession', async (_, id: number, endedAt: string, totalSeconds: number) => {
    StudyTrackingOperations.endSession(id, endedAt, totalSeconds);
  });

  ipcMain.handle('studyTracker:createEvent', async (_, event) => {
    return StudyTrackingOperations.createEvent(event);
  });

  ipcMain.handle('studyTracker:updateEvent', async (_, id: number, endedAt: string, seconds: number) => {
    StudyTrackingOperations.updateEvent(id, endedAt, seconds);
  });

  ipcMain.handle('studyTracker:logIdle', async (_, log) => {
    StudyTrackingOperations.logIdle(log);
  });

  ipcMain.handle('studyTracker:getHeatmap', async (_, fromDate: string, toDate: string) => {
    return StudyTrackingOperations.getHeatmap(fromDate, toDate);
  });

  ipcMain.handle('studyTracker:getSessionsForDay', async (_, date: string) => {
    return StudyTrackingOperations.getSessionsForDay(date);
  });

  ipcMain.handle('studyTracker:getStats', async (_, fromDate: string, toDate: string) => {
    return StudyTrackingOperations.getStats(fromDate, toDate);
  });

  // ============ OBS Integration ============
  ipcMain.handle('obs:getStatus', async () => {
    const { obsService } = await import('../services/obsService');
    return obsService.getStatus();
  });

  ipcMain.handle('obs:connect', async () => {
    const { obsService } = await import('../services/obsService');
    const host = SettingsOperations.get('obs_host') || '127.0.0.1';
    const port = SettingsOperations.get('obs_port') || '4455';
    const pw = SettingsOperations.get('obs_password') || '';
    await obsService.connect(`ws://${host}:${port}`, pw);
    return obsService.getStatus();
  });

  ipcMain.handle('obs:disconnect', async () => {
    const { obsService } = await import('../services/obsService');
    await obsService.disconnect();
  });

  ipcMain.handle('obs:stopRecording', async () => {
    const { hideObsMarkOverlay } = await import('../windows/obsMarkOverlay');
    hideObsMarkOverlay(); // hide immediately — don't wait for OBS event (OBS may be disconnected)
    const { obsService } = await import('../services/obsService');
    await obsService.stopRecording().catch(() => {}); // best-effort; overlay already hidden
  });

  ipcMain.handle('obs:getStagedMarks', async () => {
    return ObsStagedMarksOperations.getAll();
  });

  ipcMain.handle('obs:hasStagedMarks', async () => {
    return ObsStagedMarksOperations.count() > 0;
  });

  ipcMain.handle('obs:getStagedMarksCount', async () => {
    return ObsStagedMarksOperations.count();
  });

  ipcMain.handle('obs:clearStagedMarks', async () => {
    ObsStagedMarksOperations.deleteAll();
  });

  ipcMain.handle('obs:getLastVideoPath', async () => {
    const { obsService } = await import('../services/obsService');
    const p = obsService.lastVideoPath;
    if (!p) return null;
    const fsSync = require('fs');
    return fsSync.existsSync(p) ? p : null;
  });

  ipcMain.handle('obs:deleteStagedMark', async (_, id: number) => {
    ObsStagedMarksOperations.delete(id);
  });

  ipcMain.handle('obs:assignStagedMarks', async (_, videoId: number, recordingId: number) => {
    const marks = ObsStagedMarksOperations.getAll();
    if (marks.length === 0) throw new Error('No staged marks to assign');

    const video = VideosOperations.getById(videoId);
    if (!video) throw new Error('Video not found');

    const videoDurationSeconds = video.duration != null ? video.duration : null;
    const maxEndTime = Math.max(...marks.map((m: any) => m.end_time));

    if (videoDurationSeconds !== null) {
      const diff = Math.abs(videoDurationSeconds - maxEndTime);
      if (diff > 10) {
        throw new Error(`Duration mismatch: video is ${videoDurationSeconds.toFixed(1)}s, marks cover ${maxEndTime.toFixed(1)}s (${diff.toFixed(1)}s apart)`);
      }
    }

    for (const mark of marks) {
      DurationsOperations.create({
        recording_id: recordingId,
        start_time: (mark as any).start_time,
        end_time: (mark as any).end_time,
        note: (mark as any).caption || null,
        source_video_id: videoId,
        is_video_mark: 1,
      } as any);
    }

    ObsStagedMarksOperations.deleteAll();
    scheduleSearchReindex();
    return { assigned: marks.length };
  });

  ipcMain.handle('obs:assignStagedMarksToDurationVideo', async (_, durationVideoId: number, recordingId: number) => {
    const marks = ObsStagedMarksOperations.getAll();
    if (marks.length === 0) throw new Error('No staged marks to assign');

    const video = DurationVideosOperations.getById(durationVideoId);
    if (!video) throw new Error('Duration video not found');

    const videoDurationSeconds = video.duration != null ? video.duration : null;
    const maxEndTime = Math.max(...marks.map((m: any) => m.end_time));

    if (videoDurationSeconds !== null) {
      const diff = Math.abs(videoDurationSeconds - maxEndTime);
      if (diff > 10) {
        throw new Error(`Duration mismatch: video is ${videoDurationSeconds.toFixed(1)}s, marks cover ${maxEndTime.toFixed(1)}s (${diff.toFixed(1)}s apart)`);
      }
    }

    for (const mark of marks) {
      DurationsOperations.create({
        recording_id: recordingId,
        start_time: (mark as any).start_time,
        end_time: (mark as any).end_time,
        note: (mark as any).caption || null,
        source_duration_video_id: durationVideoId,
        is_video_mark: 1,
      } as any);
    }

    ObsStagedMarksOperations.deleteAll();
    scheduleSearchReindex();
    return { assigned: marks.length };
  });

  ipcMain.handle('durations:getByRecordingAndDurationVideo', (_, recordingId: number, durationVideoId: number) =>
    DurationsOperations.getByRecordingAndDurationVideo(recordingId, durationVideoId)
  );

  // ============ OBS Ghost Marks ============
  ipcMain.handle('obs:getGhostMarks', async () => ObsGhostMarksOperations.getAll());
  ipcMain.handle('obs:hasGhostMarks', async () => ObsGhostMarksOperations.count() > 0);
  ipcMain.handle('obs:getGhostMarksCount', async () => ObsGhostMarksOperations.count());
  ipcMain.handle('obs:clearGhostMarks', async () => ObsGhostMarksOperations.deleteAll());

  ipcMain.handle('obs:assignGhostMarks', async (_, videoId: number, recordingId: number) => {
    const marks = ObsGhostMarksOperations.getAll();
    if (marks.length === 0) throw new Error('No ghost marks to assign');

    const video = VideosOperations.getById(videoId);
    if (!video) throw new Error('Video not found');
    const videoDuration: number | null = video.duration != null ? video.duration : null;

    for (let i = 0; i < marks.length; i++) {
      const mark = marks[i] as any;
      // If end_time is null (last segment stopped mid-record), use next mark's start or video duration
      const endTime: number = mark.end_time ?? (marks[i + 1] as any)?.start_time ?? videoDuration ?? mark.start_time;
      DurationsOperations.create({
        recording_id: recordingId,
        start_time: mark.start_time,
        end_time: endTime,
        note: null,
        source_video_id: videoId,
        is_video_mark: 1,
        is_ghost_mark: 1,
      } as any);
    }

    ObsGhostMarksOperations.deleteAll();
    scheduleSearchReindex();
    return { assigned: marks.length };
  });

  ipcMain.handle('obs:assignGhostMarksToDurationVideo', async (_, durationVideoId: number, recordingId: number) => {
    const marks = ObsGhostMarksOperations.getAll();
    if (marks.length === 0) throw new Error('No ghost marks to assign');

    const video = DurationVideosOperations.getById(durationVideoId);
    if (!video) throw new Error('Duration video not found');
    const videoDuration: number | null = video.duration != null ? video.duration : null;

    for (let i = 0; i < marks.length; i++) {
      const mark = marks[i] as any;
      const endTime: number = mark.end_time ?? (marks[i + 1] as any)?.start_time ?? videoDuration ?? mark.start_time;
      DurationsOperations.create({
        recording_id: recordingId,
        start_time: mark.start_time,
        end_time: endTime,
        note: null,
        source_duration_video_id: durationVideoId,
        is_video_mark: 1,
        is_ghost_mark: 1,
      } as any);
    }

    ObsGhostMarksOperations.deleteAll();
    scheduleSearchReindex();
    return { assigned: marks.length };
  });

  ipcMain.on('obs:captionUpdate', (_, caption: string) => {
    import('../services/obsService').then(({ obsService }) => {
      obsService.currentMarkCaption = caption;
    });
  });

  // Explicitly create a staged mark for the current uncovered span [lastResumeTimecode → pauseTimecode].
  // Called from the F9 overlay "Create Mark" button / Enter key.
  ipcMain.handle('obs:createStagedMark', async (_, caption: string) => {
    const { obsService } = await import('../services/obsService');
    const sessionId = obsService.currentSessionId;
    if (!sessionId) return ObsStagedMarksOperations.getAll();
    if (!obsService.getStatus().isPaused) return ObsStagedMarksOperations.getAll();

    const start = obsService.lastResumeTimecode;
    const end   = obsService.pauseTimecode;
    const trimmed = (caption || '').trim();

    if (end > start || trimmed.length > 0) {
      ObsStagedMarksOperations.create({
        session_id: sessionId,
        start_time: start,
        end_time:   end,
        caption:    trimmed || null,
        sort_order: ObsStagedMarksOperations.count(),
      });
      obsService.lastResumeTimecode = end;
      obsService.currentMarkCaption = '';
      console.log('[OBS] Explicit mark created:', { start, end, caption: trimmed });
    }
    return ObsStagedMarksOperations.getAll();
  });

  ipcMain.on('obs:updateStagedMarkCaption', (_, id: number, caption: string) => {
    ObsStagedMarksOperations.updateCaption(id, caption);
  });

  ipcMain.on('obs:mergeStagedMarks', (_, keepId: number, deleteId: number, caption: string | null) => {
    ObsStagedMarksOperations.merge(keepId, deleteId, caption || null);
  });

  ipcMain.on('obs:hideOverlay', async () => {
    const { hideObsMarkOverlay } = await import('../windows/obsMarkOverlay');
    hideObsMarkOverlay();
  });

  ipcMain.on('obs:hideStatusWindow', async () => {
    const { hideObsStatusWindow } = await import('../windows/obsStatusWindow');
    hideObsStatusWindow();
  });

  // Toggle OBS enable/disable and re-register F10 shortcut accordingly
  ipcMain.handle('settings:toggleObs', async (_, enabled: boolean) => {
    SettingsOperations.set('obs_enabled', enabled ? 'true' : 'false');
    const { registerObsShortcut, unregisterObsShortcut } = await import('../shortcuts/globalShortcuts');
    if (enabled) {
      registerObsShortcut();
      const { obsService } = await import('../services/obsService');
      const host = SettingsOperations.get('obs_host') || '127.0.0.1';
      const port = SettingsOperations.get('obs_port') || '4455';
      const pw = SettingsOperations.get('obs_password') || '';
      obsService.connect(`ws://${host}:${port}`, pw).catch(() => {});
      const { createObsMarkOverlayWindow } = await import('../windows/obsMarkOverlay');
      createObsMarkOverlayWindow();
    } else {
      unregisterObsShortcut();
      const { obsService } = await import('../services/obsService');
      await obsService.disconnect();
    }
  });

  ipcMain.handle('settings:saveObsConfig', async (_, config: { host: string; port: string; password: string }) => {
    SettingsOperations.set('obs_host', config.host);
    SettingsOperations.set('obs_port', config.port);
    SettingsOperations.set('obs_password', config.password);
  });

  // ============ Review (Spaced Repetition) ============
  ipcMain.handle('review:getAll', () => ReviewOperations.getAll());
  ipcMain.handle('review:enroll', (_,
    mediaType: string, mediaId: number,
    filePath: string | null, thumbnailPath: string | null, caption: string | null,
    recordingId: number | null, captureId: number | null
  ) => ReviewOperations.enroll(mediaType, mediaId, filePath, thumbnailPath, caption, recordingId, captureId));
  ipcMain.handle('review:delete', (_, id: number) => ReviewOperations.delete(id));
  ipcMain.handle('review:rate', (_,
    id: number, rating: string, intervalDays: number, easeFactor: number, repetitions: number, nextReviewAt: string
  ) => ReviewOperations.rate(id, rating, intervalDays, easeFactor, repetitions, nextReviewAt));
  ipcMain.handle('review:schedule', (_, id: number, nextReviewAt: string, intervalDays: number) =>
    ReviewOperations.schedule(id, nextReviewAt, intervalDays));

  ipcMain.handle('reviewMasks:getByItem', (_, reviewItemId: number) =>
    ReviewMaskOperations.getByItem(reviewItemId));
  ipcMain.handle('reviewMasks:create', (_,
    reviewItemId: number, x: number, y: number, w: number, h: number,
    pixelationLevel: number, hintText: string | null, sortOrder: number
  ) => ReviewMaskOperations.create(reviewItemId, x, y, w, h, pixelationLevel, hintText, sortOrder));
  ipcMain.handle('reviewMasks:update', (_,
    id: number, x: number, y: number, w: number, h: number,
    pixelationLevel: number, hintText: string | null
  ) => ReviewMaskOperations.update(id, x, y, w, h, pixelationLevel, hintText));
  ipcMain.handle('reviewMasks:delete', (_, id: number) => ReviewMaskOperations.delete(id));

  console.log('IPC handlers registered');
}
