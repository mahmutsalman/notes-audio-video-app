import { ipcMain, dialog, shell, nativeTheme, clipboard } from 'electron';
import {
  TopicsOperations,
  RecordingsOperations,
  ImagesOperations,
  VideosOperations,
  DurationsOperations,
} from '../database/operations';
import {
  saveAudioFile,
  getAudioPath,
  saveImageFile,
  saveImageFromBuffer,
  saveVideoFile,
  saveVideoFromBuffer,
  deleteFile,
  deleteRecordingMedia,
  getMediaDir,
  getFileUrl,
} from '../services/fileStorage';
import type { CreateTopic, UpdateTopic, CreateRecording, UpdateRecording, CreateDuration, UpdateDuration } from '../../src/types';

export function setupIpcHandlers(): void {
  // ============ Topics ============
  ipcMain.handle('topics:getAll', async () => {
    return TopicsOperations.getAll();
  });

  ipcMain.handle('topics:getById', async (_, id: number) => {
    return TopicsOperations.getById(id);
  });

  ipcMain.handle('topics:create', async (_, topic: CreateTopic) => {
    return TopicsOperations.create(topic);
  });

  ipcMain.handle('topics:update', async (_, id: number, updates: UpdateTopic) => {
    return TopicsOperations.update(id, updates);
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
    return RecordingsOperations.create(recording);
  });

  ipcMain.handle('recordings:update', async (_, id: number, updates: UpdateRecording) => {
    return RecordingsOperations.update(id, updates);
  });

  ipcMain.handle('recordings:delete', async (_, id: number) => {
    await deleteRecordingMedia(id);
    RecordingsOperations.delete(id);
  });

  // ============ Audio ============
  ipcMain.handle('audio:save', async (_, recordingId: number, audioBuffer: ArrayBuffer, filename: string) => {
    const filePath = await saveAudioFile(recordingId, audioBuffer, filename);

    // Get audio duration if possible (would need additional library)
    // For now, we'll update the recording with the path
    RecordingsOperations.update(recordingId, { audio_path: filePath });

    return filePath;
  });

  ipcMain.handle('audio:getPath', async (_, recordingId: number) => {
    return getAudioPath(recordingId);
  });

  // ============ Media (Images & Videos) ============
  ipcMain.handle('media:addImage', async (_, recordingId: number, sourcePath: string) => {
    const { filePath, thumbnailPath } = await saveImageFile(recordingId, sourcePath);
    return ImagesOperations.create({
      recording_id: recordingId,
      file_path: filePath,
      thumbnail_path: thumbnailPath,
      sort_order: 0,
    });
  });

  ipcMain.handle('media:addVideo', async (_, recordingId: number, sourcePath: string) => {
    const { filePath, thumbnailPath, duration } = await saveVideoFile(recordingId, sourcePath);
    return VideosOperations.create({
      recording_id: recordingId,
      file_path: filePath,
      thumbnail_path: thumbnailPath,
      duration: duration,
      sort_order: 0,
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
    return ImagesOperations.create({
      recording_id: recordingId,
      file_path: filePath,
      thumbnail_path: thumbnailPath,
      sort_order: 0,
    });
  });

  ipcMain.handle('media:addVideoFromClipboard', async (_, recordingId: number, videoBuffer: ArrayBuffer, extension: string = 'mp4') => {
    const { filePath, thumbnailPath, duration } = await saveVideoFromBuffer(recordingId, videoBuffer, extension);
    return VideosOperations.create({
      recording_id: recordingId,
      file_path: filePath,
      thumbnail_path: thumbnailPath,
      duration: duration,
      sort_order: 0,
    });
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
      const fileUrl = clipboard.read('public.file-url');
      if (fileUrl) {
        // Decode the file URL and remove the file:// prefix
        const filePath = decodeURIComponent(fileUrl.replace('file://', ''));
        return { success: true, filePath };
      }
    }
    // Windows support could be added here with clipboard.read('FileNameW')
    return { success: false };
  });

  // ============ Durations (marked time segments) ============
  ipcMain.handle('durations:getByRecording', async (_, recordingId: number) => {
    return DurationsOperations.getByRecording(recordingId);
  });

  ipcMain.handle('durations:create', async (_, duration: CreateDuration) => {
    return DurationsOperations.create(duration);
  });

  ipcMain.handle('durations:update', async (_, id: number, updates: UpdateDuration) => {
    return DurationsOperations.update(id, updates);
  });

  ipcMain.handle('durations:delete', async (_, id: number) => {
    DurationsOperations.delete(id);
  });

  console.log('IPC handlers registered');
}
