import { contextBridge, ipcRenderer } from 'electron';
import type {
  Topic, CreateTopic, UpdateTopic,
  Recording, CreateRecording, UpdateRecording,
  Image, Video,
  Duration, CreateDuration, UpdateDuration,
  DurationImage,
  BackupResult
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
    ): Promise<{ success: boolean; totalDurationMs: number; error?: string }> =>
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
  },

  // Backup
  backup: {
    create: (): Promise<BackupResult> => ipcRenderer.invoke('backup:create'),
    getPath: (): Promise<string> => ipcRenderer.invoke('backup:getPath'),
    openFolder: (): Promise<void> => ipcRenderer.invoke('backup:openFolder'),
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

console.log('Preload script loaded');
