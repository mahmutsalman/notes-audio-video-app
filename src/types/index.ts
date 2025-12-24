// Database Models

export type ImportanceColor = 'emerald' | 'amber' | 'rose' | null;
export type DurationColor = 'red' | 'amber' | 'sky' | null;

export interface Topic {
  id: number;
  name: string;
  tags: string[];
  importance_level: number;
  created_at: string;
  updated_at: string;
  // Computed from view
  total_recordings?: number;
  total_images?: number;
  total_videos?: number;
}

export interface Recording {
  id: number;
  topic_id: number;
  name: string | null;
  audio_path: string | null;
  audio_duration: number | null;
  video_path: string | null;
  video_duration: number | null;
  video_resolution: string | null;
  video_fps: number | null;
  notes_content: string | null;
  importance_color: ImportanceColor;
  created_at: string;
  updated_at: string;
  // Relations (loaded separately)
  images?: Image[];
  videos?: Video[];
  audios?: Audio[];
  codeSnippets?: CodeSnippet[];
}

export interface Image {
  id: number;
  recording_id: number;
  file_path: string;
  thumbnail_path: string | null;
  caption: string | null;
  color: DurationColor;
  sort_order: number;
  created_at: string;
}

export interface Video {
  id: number;
  recording_id: number;
  file_path: string;
  thumbnail_path: string | null;
  caption: string | null;
  color: DurationColor;
  duration: number | null;
  sort_order: number;
  created_at: string;
}

export interface Audio {
  id: number;
  recording_id: number;
  file_path: string;
  caption: string | null;
  duration: number | null;
  sort_order: number;
  created_at: string;
}

export interface Duration {
  id: number;
  recording_id: number;
  start_time: number;  // seconds
  end_time: number;    // seconds
  note: string | null; // optional note for this duration mark
  color: DurationColor; // color indicator for categorizing duration marks
  created_at: string;
  // Media loaded separately
  images?: DurationImage[];
  videos?: DurationVideo[];
  audios?: DurationAudio[];
  codeSnippets?: DurationCodeSnippet[];
}

export interface DurationImage {
  id: number;
  duration_id: number;
  file_path: string;
  thumbnail_path: string | null;
  caption: string | null;
  color: DurationColor;
  sort_order: number;
  created_at: string;
}

export interface DurationVideo {
  id: number;
  duration_id: number;
  file_path: string;
  thumbnail_path: string | null;
  caption: string | null;
  color: DurationColor;
  duration: number | null;
  sort_order: number;
  created_at: string;
}

export interface DurationAudio {
  id: number;
  duration_id: number;
  file_path: string;
  caption: string | null;
  duration: number | null;
  sort_order: number;
  created_at: string;
}

// Screen Recording types

export type ScreenResolution = '480p' | '720p' | '1080p';
export type ScreenFPS = 10 | 30 | 60;

export interface ScreenSource {
  id: string;
  name: string;
  thumbnail: string;  // base64 data URL
}

export interface DisplayInfo {
  id: string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  scaleFactor: number;
}

export interface AudioSettings {
  microphoneEnabled: boolean;
  microphoneDeviceId?: string;
  desktopAudioEnabled: boolean;
}

export interface CaptureArea {
  x: number;
  y: number;
  width: number;
  height: number;
  displayId: string;
  scaleFactor: number;
  displayBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  // Audio settings
  audioSettings?: AudioSettings;
  // Quality settings
  quality?: 'auto' | '480p' | '720p' | '1080p';
  fps?: number;
  // Recording ID for folder organization
  recordingId?: number;
}

export interface ScreenRecordingSettings {
  resolution: ScreenResolution;
  fps: ScreenFPS;
  codec: 'h264' | 'vp9' | 'vp8';
  presetName: string;
  bitsPerPixel?: number;  // 0.1-0.25, controls video bitrate quality
}

// Component-specific types

export interface VideoWithThumbnail {
  filePath: string;
  thumbnailPath: string | null;
  isGenerating?: boolean;
}

export interface CodeSnippet {
  id: number;
  recording_id: number;
  title: string | null;
  language: string;
  code: string;
  caption: string | null;
  sort_order: number;
  created_at: string;
}

export interface DurationCodeSnippet {
  id: number;
  duration_id: number;
  title: string | null;
  language: string;
  code: string;
  caption: string | null;
  sort_order: number;
  created_at: string;
}

export type UpdateDuration = Partial<Pick<Duration, 'note' | 'color'>>;
export type CreateDurationImage = Omit<DurationImage, 'id' | 'created_at'>;
export type CreateDurationVideo = Omit<DurationVideo, 'id' | 'created_at'>;
export type CreateDurationAudio = Omit<DurationAudio, 'id' | 'created_at'>;
export type CreateAudio = Omit<Audio, 'id' | 'created_at'>;
export type CreateCodeSnippet = Omit<CodeSnippet, 'id' | 'created_at'>;
export type CreateDurationCodeSnippet = Omit<DurationCodeSnippet, 'id' | 'created_at'>;
export type UpdateImage = { caption?: string | null };
export type UpdateVideo = { caption?: string | null };
export type UpdateAudio = { caption?: string | null };
export type UpdateDurationImage = { caption?: string | null };
export type UpdateDurationVideo = { caption?: string | null };
export type UpdateCodeSnippet = { title?: string | null; language?: string; code?: string; caption?: string | null };
export type UpdateDurationCodeSnippet = { title?: string | null; language?: string; code?: string; caption?: string | null };
export type UpdateDurationAudio = { caption?: string | null };

// Backup types
export interface BackupResult {
  success: boolean;
  path?: string;
  timestamp?: string;
  error?: string;
  stats?: {
    dbSize: number;
    mediaFiles: number;
    totalSize: number;
  };
}

// Create types (omit auto-generated fields)
export type CreateTopic = Omit<Topic, 'id' | 'created_at' | 'updated_at' | 'total_recordings' | 'total_images' | 'total_videos'>;
export type UpdateTopic = Partial<CreateTopic>;

export type CreateRecording = Omit<Recording, 'id' | 'created_at' | 'updated_at' | 'images' | 'videos' | 'importance_color' | 'name'> & { importance_color?: ImportanceColor; name?: string | null };
export type UpdateRecording = Partial<Omit<CreateRecording, 'topic_id'>>;

export type CreateImage = Omit<Image, 'id' | 'created_at'>;
export type CreateVideo = Omit<Video, 'id' | 'created_at'>;
export type CreateDuration = Omit<Duration, 'id' | 'created_at' | 'color'> & { note?: string | null; color?: DurationColor };

// Video Compression Types
export interface VideoCompressionOptions {
  crf: number;           // 18-40, lower = better quality
  preset: 'ultrafast' | 'fast' | 'medium' | 'slow' | 'veryslow';
  audioBitrate: '24k' | '32k' | '48k' | '64k' | '128k';
}

export interface VideoCompressionResult {
  success: boolean;
  outputPath?: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  error?: string;
}

export interface VideoMergeResult {
  success: boolean;
  totalDurationMs: number;
  outputFormat: 'webm' | 'mp4';
  outputPath?: string;
  error?: string;
}

export interface CompressionProgress {
  percent: number;
  currentTime: string;
  speed: string;
}

// IPC Types
export interface ElectronAPI {
  topics: {
    getAll: () => Promise<Topic[]>;
    getById: (id: number) => Promise<Topic | null>;
    create: (topic: CreateTopic) => Promise<Topic>;
    update: (id: number, updates: UpdateTopic) => Promise<Topic>;
    delete: (id: number) => Promise<void>;
  };
  recordings: {
    getByTopic: (topicId: number) => Promise<Recording[]>;
    getById: (id: number) => Promise<Recording | null>;
    create: (recording: CreateRecording) => Promise<Recording>;
    update: (id: number, updates: UpdateRecording) => Promise<Recording>;
    delete: (id: number) => Promise<void>;
  };
  audio: {
    save: (recordingId: number, audioBuffer: ArrayBuffer, filename: string) => Promise<string>;
    getPath: (recordingId: number) => Promise<string | null>;
    getBuffer: (recordingId: number) => Promise<ArrayBuffer | null>;
    mergeExtension: (
      recordingId: number,
      extensionBuffer: ArrayBuffer,
      originalDurationMs: number,
      extensionDurationMs: number
    ) => Promise<{ success: boolean; totalDurationMs: number; error?: string }>;
  };
  media: {
    addImage: (recordingId: number, filePath: string) => Promise<Image>;
    addVideo: (recordingId: number, filePath: string) => Promise<Video>;
    addImageFromClipboard: (recordingId: number, imageBuffer: ArrayBuffer, extension?: string) => Promise<Image>;
    addVideoFromClipboard: (recordingId: number, videoBuffer: ArrayBuffer, extension?: string) => Promise<Video>;
    getImages: (recordingId: number) => Promise<Image[]>;
    getVideos: (recordingId: number) => Promise<Video[]>;
    deleteImage: (id: number) => Promise<void>;
    deleteVideo: (id: number) => Promise<void>;
    updateImageCaption: (id: number, caption: string | null) => Promise<Image>;
    updateImageColor: (id: number, color: DurationColor) => Promise<Image>;
    updateVideoCaption: (id: number, caption: string | null) => Promise<Video>;
    updateVideoColor: (id: number, color: DurationColor) => Promise<Video>;
    pickFiles: (type: 'image' | 'video' | 'both') => Promise<string[]>;
  };
  paths: {
    getMediaDir: () => Promise<string>;
    openFile: (path: string) => Promise<void>;
    getFileUrl: (path: string) => string;
  };
  theme: {
    get: () => Promise<'light' | 'dark' | 'system'>;
    set: (theme: 'light' | 'dark' | 'system') => Promise<void>;
    onSystemThemeChange: (callback: (isDark: boolean) => void) => () => void;
  };
  clipboard: {
    readImage: () => Promise<{ success: boolean; buffer?: ArrayBuffer; extension?: string }>;
    readFileUrl: () => Promise<{ success: boolean; filePath?: string }>;
  };
  durations: {
    getByRecording: (recordingId: number) => Promise<Duration[]>;
    create: (duration: CreateDuration) => Promise<Duration>;
    update: (id: number, updates: UpdateDuration) => Promise<Duration>;
    delete: (id: number) => Promise<void>;
  };
  durationImages: {
    getByDuration: (durationId: number) => Promise<DurationImage[]>;
    addFromClipboard: (durationId: number, imageBuffer: ArrayBuffer, extension?: string) => Promise<DurationImage>;
    delete: (id: number) => Promise<void>;
    updateCaption: (id: number, caption: string | null) => Promise<DurationImage>;
    updateColor: (id: number, color: DurationColor) => Promise<DurationImage>;
  };
  durationVideos: {
    getByDuration: (durationId: number) => Promise<DurationVideo[]>;
    addFromClipboard: (durationId: number, videoBuffer: ArrayBuffer, extension?: string) => Promise<DurationVideo>;
    addFromFile: (durationId: number, filePath: string) => Promise<DurationVideo>;
    delete: (id: number) => Promise<void>;
    updateCaption: (id: number, caption: string | null) => Promise<DurationVideo>;
    updateColor: (id: number, color: DurationColor) => Promise<DurationVideo>;
  };
  durationAudios: {
    getByDuration: (durationId: number) => Promise<DurationAudio[]>;
    addFromBuffer: (durationId: number, audioBuffer: ArrayBuffer, extension?: string) => Promise<DurationAudio>;
    delete: (id: number) => Promise<void>;
    updateCaption: (id: number, caption: string | null) => Promise<DurationAudio>;
  };
  audios: {
    getByRecording: (recordingId: number) => Promise<Audio[]>;
    addFromBuffer: (recordingId: number, audioBuffer: ArrayBuffer, extension?: string) => Promise<Audio>;
    delete: (id: number) => Promise<void>;
    updateCaption: (id: number, caption: string | null) => Promise<Audio>;
  };
  codeSnippets: {
    getByRecording: (recordingId: number) => Promise<CodeSnippet[]>;
    create: (snippet: CreateCodeSnippet) => Promise<CodeSnippet>;
    update: (id: number, updates: UpdateCodeSnippet) => Promise<CodeSnippet>;
    delete: (id: number) => Promise<void>;
  };
  durationCodeSnippets: {
    getByDuration: (durationId: number) => Promise<DurationCodeSnippet[]>;
    create: (snippet: CreateDurationCodeSnippet) => Promise<DurationCodeSnippet>;
    update: (id: number, updates: UpdateDurationCodeSnippet) => Promise<DurationCodeSnippet>;
    delete: (id: number) => Promise<void>;
  };
  backup: {
    create: () => Promise<BackupResult>;
    getPath: () => Promise<string>;
    openFolder: () => Promise<void>;
  };
  screenRecording: {
    getSources: () => Promise<ScreenSource[]>;
    saveFile: (
      recordingId: number,
      videoBuffer: ArrayBuffer,
      resolution: string,
      fps: number,
      fallbackDurationMs?: number
    ) => Promise<{
      filePath: string;
      duration: number | null;
      _debug?: {
        usedFallback?: boolean;
        extractionError?: string;
        durationExtracted?: boolean;
      };
    }>;
    finalizeFile: (
      recordingId: number,
      sourcePath: string,
      resolution: string,
      fps: number,
      fallbackDurationMs?: number
    ) => Promise<{
      filePath: string;
      duration: number | null;
      _debug?: {
        usedFallback?: boolean;
        extractionError?: string;
        durationExtracted?: boolean;
      };
    }>;
  };
  region: {
    startSelection: () => Promise<void>;
    onRegionSelected: (callback: (region: CaptureArea | null) => void) => () => void;
    setExtensionMode: (isExtensionMode: boolean) => Promise<void>;
    onRegionSelectedForExtension: (callback: (region: CaptureArea) => void) => () => void;
    sendRegion: (region: CaptureArea) => Promise<void>;
    cancel: () => Promise<void>;
    stopRecording: () => Promise<void>;
    onRecordingStop: (callback: () => void) => () => void;
    onDisplayInfo: (callback: (displayInfo: any) => void) => () => void;
    onGlobalShortcut: (callback: () => void) => () => void;
    setClickThrough: (enabled: boolean) => void;
    updateDuration: (duration: number) => void;
    pauseRecording: () => Promise<void>;
    resumeRecording: () => Promise<void>;
    onDurationUpdate: (callback: (duration: number) => void) => () => void;
    onPauseRecording: (callback: () => void) => () => void;
    onResumeRecording: (callback: () => void) => () => void;
    sendMarkStateUpdate: (isMarking: boolean, startTime: number) => void;
    onMarkToggle: (callback: () => void) => () => void;
    sendMarkNote: (note: string) => void;
    onMarkNoteUpdate: (callback: (note: string) => void) => () => void;
    onInputFieldToggle: (callback: () => void) => () => void;
    sendInputFieldToggle: () => void;
    setWindowLevel: (level: 'floating' | 'screen-saver') => void;
  };
  video: {
    generateThumbnail: (videoPath: string) => Promise<{ success: boolean; thumbnailPath: string | null }>;
    compress: (
      filePath: string,
      options: VideoCompressionOptions
    ) => Promise<VideoCompressionResult>;
    onCompressionProgress: (callback: (progress: CompressionProgress) => void) => () => void;
    replaceWithCompressed: (
      originalPath: string,
      compressedPath: string
    ) => Promise<{ success: boolean; newPath?: string; error?: string }>;
    checkFFmpeg: () => Promise<{ available: boolean; version?: string; error?: string }>;
    mergeExtension: (
      recordingId: number,
      extensionBuffer: ArrayBuffer,
      originalDurationMs: number,
      extensionDurationMs: number,
      compressionOptions?: VideoCompressionOptions
    ) => Promise<VideoMergeResult>;
  };
  settings: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
    getAll: () => Promise<Record<string, string>>;
  };
  screen: {
    getAllDisplays: () => Promise<any[]>;
    getCursorScreenPoint: () => Promise<{ x: number; y: number }>;
  };
  screenCaptureKit: {
    getDisplayDimensions: (displayId: number) => Promise<{
      success: boolean;
      width?: number;
      height?: number;
      scaleFactor?: number;
      error?: string;
    }>;
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
    }) => Promise<{ success: boolean; error?: string }>;
    stopCapture: () => Promise<{ success: boolean; error?: string }>;
    isCapturing: () => Promise<{ isCapturing: boolean }>;
    onComplete: (callback: (data: { filePath: string }) => void) => void;
    onError: (callback: (data: { error: string }) => void) => void;
    removeAllListeners: () => void;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
