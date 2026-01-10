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
  CodeSnippetsOperations,
  DurationCodeSnippetsOperations,
  SettingsOperations,
} from '../database/operations';
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
  saveAudioAttachmentFromBuffer,
  deleteDurationImages,
  deleteDurationVideos,
  deleteDurationAudios,
  deleteFile,
  deleteRecordingMedia,
  getMediaDir,
  getFileUrl,
} from '../services/fileStorage';
import { createBackup, getBackupDir } from '../services/backupService';
import { mergeAudioFiles } from '../services/audioMerger';
import type {
  CreateTopic, UpdateTopic, CreateRecording, UpdateRecording, CreateDuration, UpdateDuration,
  CreateCodeSnippet, UpdateCodeSnippet, CreateDurationCodeSnippet, UpdateDurationCodeSnippet,
  CreateScreenRecording, DurationGroupColor
} from '../../src/types';

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

  ipcMain.handle('media:updateImageCaption', async (_, id: number, caption: string | null) => {
    return ImagesOperations.updateCaption(id, caption);
  });

  ipcMain.handle('media:updateImageColor', async (_, id: number, color: DurationColor) => {
    return ImagesOperations.updateColor(id, color);
  });

  ipcMain.handle('media:updateVideoCaption', async (_, id: number, caption: string | null) => {
    return VideosOperations.updateCaption(id, caption);
  });

  ipcMain.handle('media:updateVideoColor', async (_, id: number, color: DurationColor) => {
    return VideosOperations.updateColor(id, color);
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

  ipcMain.handle('durations:create', async (_, duration: CreateDuration) => {
    return DurationsOperations.create(duration);
  });

  ipcMain.handle('durations:update', async (_, id: number, updates: UpdateDuration) => {
    return DurationsOperations.update(id, updates);
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
  });

  // ============ Duration Images ============
  ipcMain.handle('durationImages:getByDuration', async (_, durationId: number) => {
    return DurationImagesOperations.getByDuration(durationId);
  });

  ipcMain.handle('durationImages:addFromClipboard', async (_, durationId: number, imageBuffer: ArrayBuffer, extension: string = 'png') => {
    const { filePath, thumbnailPath } = await saveDurationImageFromBuffer(durationId, imageBuffer, extension);
    return DurationImagesOperations.create({
      duration_id: durationId,
      file_path: filePath,
      thumbnail_path: thumbnailPath,
      sort_order: 0,
    });
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
  });

  ipcMain.handle('durationImages:updateCaption', async (_, id: number, caption: string | null) => {
    return DurationImagesOperations.updateCaption(id, caption);
  });

  ipcMain.handle('durationImages:updateColor', async (_, id: number, color: DurationColor) => {
    return DurationImagesOperations.updateColor(id, color);
  });

  // ============ Duration Videos ============
  ipcMain.handle('durationVideos:getByDuration', async (_, durationId: number) => {
    return DurationVideosOperations.getByDuration(durationId);
  });

  ipcMain.handle('durationVideos:addFromClipboard', async (_, durationId: number, videoBuffer: ArrayBuffer, extension: string = 'mp4') => {
    const { filePath, thumbnailPath, duration } = await saveDurationVideoFromBuffer(durationId, videoBuffer, extension);
    return DurationVideosOperations.create({
      duration_id: durationId,
      file_path: filePath,
      thumbnail_path: thumbnailPath,
      caption: null,
      duration: duration,
      sort_order: 0,
    });
  });

  ipcMain.handle('durationVideos:addFromFile', async (_, durationId: number, sourcePath: string) => {
    const { filePath, thumbnailPath, duration } = await saveDurationVideoFromFile(durationId, sourcePath);
    return DurationVideosOperations.create({
      duration_id: durationId,
      file_path: filePath,
      thumbnail_path: thumbnailPath,
      caption: null,
      duration: duration,
      sort_order: 0,
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
  });

  ipcMain.handle('durationVideos:updateCaption', async (_, id: number, caption: string | null) => {
    return DurationVideosOperations.updateCaption(id, caption);
  });

  ipcMain.handle('durationVideos:updateColor', async (_, id: number, color: DurationColor) => {
    return DurationVideosOperations.updateColor(id, color);
  });

  // ============ Duration Audios ============
  ipcMain.handle('durationAudios:getByDuration', async (_, durationId: number) => {
    return DurationAudiosOperations.getByDuration(durationId);
  });

  ipcMain.handle('durationAudios:addFromBuffer', async (_, durationId: number, audioBuffer: ArrayBuffer, extension: string = 'webm') => {
    const { filePath, duration } = await saveDurationAudioFromBuffer(durationId, audioBuffer, extension);
    return DurationAudiosOperations.create({
      duration_id: durationId,
      file_path: filePath,
      caption: null,
      duration: duration,
      sort_order: 0,
    });
  });

  ipcMain.handle('durationAudios:delete', async (_, id: number) => {
    const audio = DurationAudiosOperations.getById(id);
    if (audio) {
      await deleteFile(audio.file_path);
    }
    DurationAudiosOperations.delete(id);
  });

  ipcMain.handle('durationAudios:updateCaption', async (_, id: number, caption: string | null) => {
    return DurationAudiosOperations.updateCaption(id, caption);
  });

  // ============ Audios (recording-level audio attachments) ============
  ipcMain.handle('audios:getByRecording', async (_, recordingId: number) => {
    return AudiosOperations.getByRecording(recordingId);
  });

  ipcMain.handle('audios:addFromBuffer', async (_, recordingId: number, audioBuffer: ArrayBuffer, extension: string = 'webm') => {
    const { filePath, duration } = await saveAudioAttachmentFromBuffer(recordingId, audioBuffer, extension);
    return AudiosOperations.create({
      recording_id: recordingId,
      file_path: filePath,
      caption: null,
      duration: duration,
      sort_order: 0,
    });
  });

  ipcMain.handle('audios:delete', async (_, id: number) => {
    const audio = AudiosOperations.getById(id);
    if (audio) {
      await deleteFile(audio.file_path);
    }
    AudiosOperations.delete(id);
  });

  ipcMain.handle('audios:updateCaption', async (_, id: number, caption: string | null) => {
    return AudiosOperations.updateCaption(id, caption);
  });

  // ============ Code Snippets ============
  ipcMain.handle('codeSnippets:getByRecording', async (_, recordingId: number) => {
    return CodeSnippetsOperations.getByRecording(recordingId);
  });

  ipcMain.handle('codeSnippets:create', async (_, snippet: CreateCodeSnippet) => {
    return CodeSnippetsOperations.create(snippet);
  });

  ipcMain.handle('codeSnippets:update', async (_, id: number, updates: UpdateCodeSnippet) => {
    return CodeSnippetsOperations.update(id, updates);
  });

  ipcMain.handle('codeSnippets:delete', async (_, id: number) => {
    CodeSnippetsOperations.delete(id);
  });

  // ============ Duration Code Snippets ============
  ipcMain.handle('durationCodeSnippets:getByDuration', async (_, durationId: number) => {
    return DurationCodeSnippetsOperations.getByDuration(durationId);
  });

  ipcMain.handle('durationCodeSnippets:create', async (_, snippet: CreateDurationCodeSnippet) => {
    return DurationCodeSnippetsOperations.create(snippet);
  });

  ipcMain.handle('durationCodeSnippets:update', async (_, id: number, updates: UpdateDurationCodeSnippet) => {
    return DurationCodeSnippetsOperations.update(id, updates);
  });

  ipcMain.handle('durationCodeSnippets:delete', async (_, id: number) => {
    DurationCodeSnippetsOperations.delete(id);
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

  console.log('IPC handlers registered');
}
