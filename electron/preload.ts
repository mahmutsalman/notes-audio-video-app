import { contextBridge, ipcRenderer } from 'electron';
import type {
  Topic, CreateTopic, UpdateTopic,
  Recording, CreateRecording, UpdateRecording,
  Image, Video, Audio,
  Duration, CreateDuration, UpdateDuration,
  DurationImage,
  DurationVideo,
  DurationAudio,
  CodeSnippet, CreateCodeSnippet, UpdateCodeSnippet,
  DurationCodeSnippet, CreateDurationCodeSnippet, UpdateDurationCodeSnippet,
  BackupResult,
  ScreenRecording,
  ScreenSource,
  VideoCompressionOptions,
  VideoCompressionResult,
  CompressionProgress
} from '../src/types';

// Type-safe API exposed to renderer
const electronAPI = {
  // Topics
  topics: {
    getAll: (): Promise<Topic[]> => ipcRenderer.invoke('topics:getAll'),
    getById: (id: number): Promise<Topic | null> => ipcRenderer.invoke('topics:getById', id),
    create: (topic: CreateTopic): Promise<Topic> => ipcRenderer.invoke('topics:create', topic),
    update: (id: number, updates: UpdateTopic): Promise<Topic> => ipcRenderer.invoke('topics:update', id, updates),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('topics:delete', id),
  },

  // Recordings
  recordings: {
    getByTopic: (topicId: number): Promise<Recording[]> => ipcRenderer.invoke('recordings:getByTopic', topicId),
    getById: (id: number): Promise<Recording | null> => ipcRenderer.invoke('recordings:getById', id),
    create: (recording: CreateRecording): Promise<Recording> => ipcRenderer.invoke('recordings:create', recording),
    update: (id: number, updates: UpdateRecording): Promise<Recording> => ipcRenderer.invoke('recordings:update', id, updates),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('recordings:delete', id),
  },

  // Audio
  audio: {
    save: (recordingId: number, audioBuffer: ArrayBuffer, filename: string): Promise<string> =>
      ipcRenderer.invoke('audio:save', recordingId, audioBuffer, filename),
    getPath: (recordingId: number): Promise<string | null> => ipcRenderer.invoke('audio:getPath', recordingId),
    getBuffer: (recordingId: number): Promise<ArrayBuffer | null> => ipcRenderer.invoke('audio:getBuffer', recordingId),
    mergeExtension: (
      recordingId: number,
      extensionBuffer: ArrayBuffer,
      originalDurationMs: number,
      extensionDurationMs: number
    ): Promise<{ success: boolean; totalDurationMs: number; totalSizeBytes?: number; error?: string }> =>
      ipcRenderer.invoke('audio:mergeExtension', recordingId, extensionBuffer, originalDurationMs, extensionDurationMs),
  },

  // Media (Images & Videos)
  media: {
    addImage: (recordingId: number, filePath: string): Promise<Image> =>
      ipcRenderer.invoke('media:addImage', recordingId, filePath),
    addVideo: (recordingId: number, filePath: string): Promise<Video> =>
      ipcRenderer.invoke('media:addVideo', recordingId, filePath),
    addImageFromClipboard: (recordingId: number, imageBuffer: ArrayBuffer, extension?: string): Promise<Image> =>
      ipcRenderer.invoke('media:addImageFromClipboard', recordingId, imageBuffer, extension),
    addVideoFromClipboard: (recordingId: number, videoBuffer: ArrayBuffer, extension?: string): Promise<Video> =>
      ipcRenderer.invoke('media:addVideoFromClipboard', recordingId, videoBuffer, extension),
    getImages: (recordingId: number): Promise<Image[]> => ipcRenderer.invoke('media:getImages', recordingId),
    getVideos: (recordingId: number): Promise<Video[]> => ipcRenderer.invoke('media:getVideos', recordingId),
    deleteImage: (id: number): Promise<void> => ipcRenderer.invoke('media:deleteImage', id),
    deleteVideo: (id: number): Promise<void> => ipcRenderer.invoke('media:deleteVideo', id),
    updateImageCaption: (id: number, caption: string | null): Promise<Image> =>
      ipcRenderer.invoke('media:updateImageCaption', id, caption),
    updateImageColor: (id: number, color: DurationColor): Promise<Image> =>
      ipcRenderer.invoke('media:updateImageColor', id, color),
    updateVideoCaption: (id: number, caption: string | null): Promise<Video> =>
      ipcRenderer.invoke('media:updateVideoCaption', id, caption),
    updateVideoColor: (id: number, color: DurationColor): Promise<Video> =>
      ipcRenderer.invoke('media:updateVideoColor', id, color),
    pickFiles: (type: 'image' | 'video' | 'both'): Promise<string[]> => ipcRenderer.invoke('media:pickFiles', type),
  },

  // File paths
  paths: {
    getMediaDir: (): Promise<string> => ipcRenderer.invoke('paths:getMediaDir'),
    openFile: (filePath: string): Promise<void> => ipcRenderer.invoke('paths:openFile', filePath),
    getFileUrl: (filePath: string): string => {
      // Use custom media:// protocol for proper file access in Electron
      return `media://${encodeURIComponent(filePath)}`;
    },
  },

  // Theme
  theme: {
    get: (): Promise<'light' | 'dark' | 'system'> => ipcRenderer.invoke('theme:get'),
    set: (theme: 'light' | 'dark' | 'system'): Promise<void> => ipcRenderer.invoke('theme:set', theme),
    onSystemThemeChange: (callback: (isDark: boolean) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, isDark: boolean) => callback(isDark);
      ipcRenderer.on('theme:changed', handler);
      return () => ipcRenderer.removeListener('theme:changed', handler);
    },
  },

  // Clipboard
  clipboard: {
    readImage: (): Promise<{ success: boolean; buffer?: Buffer; extension?: string }> =>
      ipcRenderer.invoke('clipboard:readImage'),
    readFileUrl: (): Promise<{ success: boolean; filePath?: string }> =>
      ipcRenderer.invoke('clipboard:readFileUrl'),
  },

  // Video
  video: {
    generateThumbnail: (videoPath: string): Promise<{ success: boolean; thumbnailPath: string | null }> =>
      ipcRenderer.invoke('video:generateThumbnail', videoPath),
    compress: (
      filePath: string,
      options: VideoCompressionOptions
    ): Promise<VideoCompressionResult> =>
      ipcRenderer.invoke('video:compress', filePath, options),
    onCompressionProgress: (callback: (progress: CompressionProgress) => void) => {
      const listener = (_event: any, progress: CompressionProgress) => callback(progress);
      ipcRenderer.on('video:compression-progress', listener);
      return () => ipcRenderer.removeListener('video:compression-progress', listener);
    },
    replaceWithCompressed: (
      originalPath: string,
      compressedPath: string
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('video:replaceWithCompressed', originalPath, compressedPath),
    checkFFmpeg: (): Promise<{ available: boolean; version?: string; error?: string }> =>
      ipcRenderer.invoke('video:checkFFmpeg'),
    mergeExtension: (
      recordingId: number,
      extensionSource: ArrayBuffer | string,
      originalDurationMs: number,
      extensionDurationMs: number,
      compressionOptions?: VideoCompressionOptions,
      audioOffsetMs?: number
    ): Promise<VideoMergeResult> =>
      ipcRenderer.invoke(
        'video:mergeExtension',
        recordingId,
        extensionSource,
        originalDurationMs,
        extensionDurationMs,
        compressionOptions,
        audioOffsetMs
      ),
  },

  // Durations (marked time segments within recordings)
  durations: {
    getByRecording: (recordingId: number): Promise<Duration[]> =>
      ipcRenderer.invoke('durations:getByRecording', recordingId),
    create: (duration: CreateDuration): Promise<Duration> =>
      ipcRenderer.invoke('durations:create', duration),
    update: (id: number, updates: UpdateDuration): Promise<Duration> =>
      ipcRenderer.invoke('durations:update', id, updates),
    delete: (id: number): Promise<void> =>
      ipcRenderer.invoke('durations:delete', id),
  },

  // Duration Images (images attached to duration marks)
  durationImages: {
    getByDuration: (durationId: number): Promise<DurationImage[]> =>
      ipcRenderer.invoke('durationImages:getByDuration', durationId),
    addFromClipboard: (durationId: number, imageBuffer: ArrayBuffer, extension?: string): Promise<DurationImage> =>
      ipcRenderer.invoke('durationImages:addFromClipboard', durationId, imageBuffer, extension),
    delete: (id: number): Promise<void> =>
      ipcRenderer.invoke('durationImages:delete', id),
    updateCaption: (id: number, caption: string | null): Promise<DurationImage> =>
      ipcRenderer.invoke('durationImages:updateCaption', id, caption),
    updateColor: (id: number, color: DurationColor): Promise<DurationImage> =>
      ipcRenderer.invoke('durationImages:updateColor', id, color),
  },

  // Duration Videos (videos attached to duration marks)
  durationVideos: {
    getByDuration: (durationId: number): Promise<DurationVideo[]> =>
      ipcRenderer.invoke('durationVideos:getByDuration', durationId),
    addFromClipboard: (durationId: number, videoBuffer: ArrayBuffer, extension?: string): Promise<DurationVideo> =>
      ipcRenderer.invoke('durationVideos:addFromClipboard', durationId, videoBuffer, extension),
    addFromFile: (durationId: number, filePath: string): Promise<DurationVideo> =>
      ipcRenderer.invoke('durationVideos:addFromFile', durationId, filePath),
    delete: (id: number): Promise<void> =>
      ipcRenderer.invoke('durationVideos:delete', id),
    updateCaption: (id: number, caption: string | null): Promise<DurationVideo> =>
      ipcRenderer.invoke('durationVideos:updateCaption', id, caption),
    updateColor: (id: number, color: DurationColor): Promise<DurationVideo> =>
      ipcRenderer.invoke('durationVideos:updateColor', id, color),
  },

  // Duration Audios (audio clips attached to duration marks)
  durationAudios: {
    getByDuration: (durationId: number): Promise<DurationAudio[]> =>
      ipcRenderer.invoke('durationAudios:getByDuration', durationId),
    addFromBuffer: (durationId: number, audioBuffer: ArrayBuffer, extension?: string): Promise<DurationAudio> =>
      ipcRenderer.invoke('durationAudios:addFromBuffer', durationId, audioBuffer, extension),
    delete: (id: number): Promise<void> =>
      ipcRenderer.invoke('durationAudios:delete', id),
    updateCaption: (id: number, caption: string | null): Promise<DurationAudio> =>
      ipcRenderer.invoke('durationAudios:updateCaption', id, caption),
  },

  // Audios (audio clips attached to recordings)
  audios: {
    getByRecording: (recordingId: number): Promise<Audio[]> =>
      ipcRenderer.invoke('audios:getByRecording', recordingId),
    addFromBuffer: (recordingId: number, audioBuffer: ArrayBuffer, extension?: string): Promise<Audio> =>
      ipcRenderer.invoke('audios:addFromBuffer', recordingId, audioBuffer, extension),
    delete: (id: number): Promise<void> =>
      ipcRenderer.invoke('audios:delete', id),
    updateCaption: (id: number, caption: string | null): Promise<Audio> =>
      ipcRenderer.invoke('audios:updateCaption', id, caption),
  },

  // Code Snippets (code snippets attached to recordings)
  codeSnippets: {
    getByRecording: (recordingId: number): Promise<CodeSnippet[]> =>
      ipcRenderer.invoke('codeSnippets:getByRecording', recordingId),
    create: (snippet: CreateCodeSnippet): Promise<CodeSnippet> =>
      ipcRenderer.invoke('codeSnippets:create', snippet),
    update: (id: number, updates: UpdateCodeSnippet): Promise<CodeSnippet> =>
      ipcRenderer.invoke('codeSnippets:update', id, updates),
    delete: (id: number): Promise<void> =>
      ipcRenderer.invoke('codeSnippets:delete', id),
  },

  // Duration Code Snippets (code snippets attached to duration marks)
  durationCodeSnippets: {
    getByDuration: (durationId: number): Promise<DurationCodeSnippet[]> =>
      ipcRenderer.invoke('durationCodeSnippets:getByDuration', durationId),
    create: (snippet: CreateDurationCodeSnippet): Promise<DurationCodeSnippet> =>
      ipcRenderer.invoke('durationCodeSnippets:create', snippet),
    update: (id: number, updates: UpdateDurationCodeSnippet): Promise<DurationCodeSnippet> =>
      ipcRenderer.invoke('durationCodeSnippets:update', id, updates),
    delete: (id: number): Promise<void> =>
      ipcRenderer.invoke('durationCodeSnippets:delete', id),
  },

  // Backup
  backup: {
    create: (): Promise<BackupResult> => ipcRenderer.invoke('backup:create'),
    getPath: (): Promise<string> => ipcRenderer.invoke('backup:getPath'),
    openFolder: (): Promise<void> => ipcRenderer.invoke('backup:openFolder'),
  },

  // Screen Recording
  screenRecording: {
    getSources: (): Promise<ScreenSource[]> =>
      ipcRenderer.invoke('screenRecording:getSources'),
    saveFile: (
      recordingId: number,
      videoBuffer: ArrayBuffer,
      resolution: string,
      fps: number,
      fallbackDurationMs?: number
    ): Promise<{ filePath: string; duration: number | null; _debug?: any }> =>
      ipcRenderer.invoke('screenRecording:saveFile', recordingId, videoBuffer, resolution, fps, fallbackDurationMs),
    finalizeFile: (
      recordingId: number,
      sourcePath: string,
      resolution: string,
      fps: number,
      fallbackDurationMs?: number,
      audioBuffer?: ArrayBuffer,
      audioBitrate?: '32k' | '64k' | '128k',
      audioChannels?: 1 | 2,
      audioOffsetMs?: number
    ): Promise<{ filePath: string; duration: number | null; _debug?: any }> =>
      ipcRenderer.invoke(
        'screenRecording:finalizeFile',
        recordingId,
        sourcePath,
        resolution,
        fps,
        fallbackDurationMs,
        audioBuffer,
        audioBitrate,
        audioChannels,
        audioOffsetMs
      ),
    save: (
      recordingId: number,
      videoBuffer: ArrayBuffer,
      resolution: string,
      fps: number
    ): Promise<ScreenRecording> =>
      ipcRenderer.invoke('screenRecording:save', recordingId, videoBuffer, resolution, fps),
    getByRecording: (recordingId: number): Promise<ScreenRecording[]> =>
      ipcRenderer.invoke('screenRecording:getByRecording', recordingId),
    delete: (id: number): Promise<void> =>
      ipcRenderer.invoke('screenRecording:delete', id),
  },

  // Region Selection
  region: {
    startSelection: (): Promise<void> =>
      ipcRenderer.invoke('region:startSelection'),
    onRegionSelected: (callback: (region: any | null) => void) => {
      const listener = (_event: any, region: any) => callback(region);
      ipcRenderer.on('region:selected', listener);
      return () => ipcRenderer.removeListener('region:selected', listener);
    },
    setExtensionMode: (isExtensionMode: boolean): Promise<void> =>
      ipcRenderer.invoke('region:setExtensionMode', isExtensionMode),
    onRegionSelectedForExtension: (callback: (region: any) => void) => {
      const listener = (_event: any, region: any) => callback(region);
      ipcRenderer.on('region:selected-for-extension', listener);
      return () => ipcRenderer.removeListener('region:selected-for-extension', listener);
    },
    sendRegion: (region: any): Promise<void> => {
      ipcRenderer.send('region:sendRegion', region);
      return Promise.resolve();
    },
    stopRecording: (): Promise<void> => {
      return new Promise((resolve) => {
        // Listen for cleanup confirmation
        const listener = () => {
          ipcRenderer.removeListener('recording:stop', listener);
          resolve();
        };
        ipcRenderer.once('recording:stop', listener);
        ipcRenderer.send('region:stopRecording');
      });
    },
    onRecordingStop: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('recording:stop', listener);
      return () => ipcRenderer.removeListener('recording:stop', listener);
    },
    cancel: (): Promise<void> =>
      ipcRenderer.invoke('region:cancel'),
    onDisplayInfo: (callback: (displayInfo: any) => void) => {
      const listener = (_event: any, displayInfo: any) => callback(displayInfo);
      ipcRenderer.on('display-info', listener);
      return () => ipcRenderer.removeListener('display-info', listener);
    },
    onGlobalShortcut: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('global-shortcut:start-region-selection', listener);
      return () => ipcRenderer.removeListener('global-shortcut:start-region-selection', listener);
    },
    setClickThrough: (enabled: boolean): void => {
      ipcRenderer.send('region:setClickThrough', enabled);
    },
    updateDuration: (duration: number): void => {
      ipcRenderer.send('region:updateDuration', duration);
    },
    pauseRecording: (): Promise<void> => {
      console.log('[Preload] Sending region:pauseRecording to IPC');
      ipcRenderer.send('region:pauseRecording');
      return Promise.resolve();
    },
    resumeRecording: (): Promise<void> => {
      console.log('[Preload] Sending region:resumeRecording to IPC');
      ipcRenderer.send('region:resumeRecording');
      return Promise.resolve();
    },
    onDurationUpdate: (callback: (duration: number) => void) => {
      const listener = (_event: any, duration: number) => callback(duration);
      ipcRenderer.on('recording:durationUpdate', listener);
      return () => ipcRenderer.removeListener('recording:durationUpdate', listener);
    },
    onPauseRecording: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('recording:pause', listener);
      return () => ipcRenderer.removeListener('recording:pause', listener);
    },
    onResumeRecording: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('recording:resume', listener);
      return () => ipcRenderer.removeListener('recording:resume', listener);
    },
    // Duration mark synchronization
    sendMarkToggle: (): Promise<void> => {
      ipcRenderer.send('region:markToggle');
      return Promise.resolve();
    },
    onMarkToggle: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('recording:markToggle', listener);
      return () => ipcRenderer.removeListener('recording:markToggle', listener);
    },
    sendMarkStateUpdate: (isMarking: boolean, startTime: number): void => {
      ipcRenderer.send('region:markStateUpdate', isMarking, startTime);
    },
    onMarkStateUpdate: (callback: (isMarking: boolean, startTime: number) => void) => {
      const listener = (_event: any, isMarking: boolean, startTime: number) => callback(isMarking, startTime);
      ipcRenderer.on('recording:markStateUpdate', listener);
      return () => ipcRenderer.removeListener('recording:markStateUpdate', listener);
    },
    sendMarkNote: (note: string): void => {
      ipcRenderer.send('region:markNote', note);
    },
    onMarkNoteUpdate: (callback: (note: string) => void) => {
      const listener = (_event: any, note: string) => callback(note);
      ipcRenderer.on('recording:markNoteUpdate', listener);
      return () => ipcRenderer.removeListener('recording:markNoteUpdate', listener);
    },
    sendInputFieldToggle: (): Promise<void> => {
      ipcRenderer.send('region:inputFieldToggle');
      return Promise.resolve();
    },
    onInputFieldToggle: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('recording:inputFieldToggle', listener);
      return () => ipcRenderer.removeListener('recording:inputFieldToggle', listener);
    },
    // Mark input focus/blur events
    sendMarkInputFocus: (): Promise<void> => {
      ipcRenderer.send('region:markInputFocus');
      return Promise.resolve();
    },
    onMarkInputFocus: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('recording:markInputFocus', listener);
      return () => ipcRenderer.removeListener('recording:markInputFocus', listener);
    },
    sendMarkInputBlur: (): Promise<void> => {
      ipcRenderer.send('region:markInputBlur');
      return Promise.resolve();
    },
    onMarkInputBlur: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('recording:markInputBlur', listener);
      return () => ipcRenderer.removeListener('recording:markInputBlur', listener);
    },
    setWindowLevel: (level: 'floating' | 'screen-saver') => {
      ipcRenderer.send('region:setWindowLevel', level);
    },
    // Pause state synchronization (modal → overlay broadcast)
    sendPauseStateUpdate: (isPaused: boolean): void => {
      console.log('[Preload] Broadcasting pause state to overlays:', isPaused);
      ipcRenderer.send('region:pauseStateUpdate', isPaused);
    },
    onPauseStateUpdate: (callback: (isPaused: boolean) => void) => {
      const listener = (_event: any, isPaused: boolean) => {
        console.log('[Preload] Received pause state update:', isPaused);
        callback(isPaused);
      };
      ipcRenderer.on('region:pauseStateUpdate', listener);
      return () => ipcRenderer.removeListener('region:pauseStateUpdate', listener);
    },
    // Pause source synchronization (modal → overlay broadcast)
    sendPauseSourceUpdate: (source: 'manual' | 'marking' | null): void => {
      console.log('[Preload] Broadcasting pause source:', source);
      ipcRenderer.send('region:pauseSourceUpdate', source);
    },
    onPauseSourceUpdate: (callback: (source: 'manual' | 'marking' | null) => void) => {
      const listener = (_event: any, source: 'manual' | 'marking' | null) => {
        console.log('[Preload] Received pause source update:', source);
        callback(source);
      };
      ipcRenderer.on('region:pauseSourceUpdate', listener);
      return () => ipcRenderer.removeListener('region:pauseSourceUpdate', listener);
    },
  },

  // Settings
  settings: {
    get: (key: string): Promise<string | null> =>
      ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string): Promise<void> =>
      ipcRenderer.invoke('settings:set', key, value),
    getAll: (): Promise<Record<string, string>> =>
      ipcRenderer.invoke('settings:getAll'),
  },

  // Screen (Display information)
  screen: {
    getAllDisplays: (): Promise<any[]> =>
      ipcRenderer.invoke('screen:getAllDisplays'),
    getCursorScreenPoint: (): Promise<{ x: number; y: number }> =>
      ipcRenderer.invoke('screen:getCursorScreenPoint'),
  },

  // ScreenCaptureKit (macOS native screen capture)
  screenCaptureKit: {
    getDisplayDimensions: (displayId: number): Promise<{
      success: boolean;
      width?: number;
      height?: number;
      scaleFactor?: number;
      error?: string;
    }> =>
      ipcRenderer.invoke('screencapturekit:getDisplayDimensions', displayId),

    startCapture: (config: {
      displayId: number;
      width: number;
      height: number;
      frameRate: number;
      outputWidth?: number;
      outputHeight?: number;
      bitsPerPixel?: number;
      regionX?: number;
      regionY?: number;
      regionWidth?: number;
      regionHeight?: number;
      scaleFactor?: number;
      outputPath?: string;
    }): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('screencapturekit:start', config),

    stopCapture: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('screencapturekit:stop'),

    pauseCapture: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('screencapturekit:pause'),

    resumeCapture: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('screencapturekit:resume'),

    isCapturing: (): Promise<{ isCapturing: boolean }> =>
      ipcRenderer.invoke('screencapturekit:isCapturing'),

    isPaused: (): Promise<{ isPaused: boolean }> =>
      ipcRenderer.invoke('screencapturekit:isPaused'),

    onComplete: (callback: (data: { filePath: string }) => void) => {
      ipcRenderer.on('screencapturekit:complete', (_event, data) => callback(data));
    },

    onError: (callback: (data: { error: string }) => void) => {
      ipcRenderer.on('screencapturekit:error', (_event, data) => callback(data));
    },

    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('screencapturekit:complete');
      ipcRenderer.removeAllListeners('screencapturekit:error');
    },
  },

  // App Control
  app: {
    quit: (): Promise<void> => ipcRenderer.invoke('app:quit'),
    forceQuit: (): Promise<void> => ipcRenderer.invoke('app:forceQuit'),
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

console.log('Preload script loaded');
