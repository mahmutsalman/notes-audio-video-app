// Database Models

export type ImportanceColor = 'emerald' | 'amber' | 'rose' | null;
export type DurationColor = 'red' | 'amber' | 'sky' | null;
export type DurationGroupColor = 'lime' | 'cyan' | 'orange' | 'teal' | 'rose' | 'yellow' | 'pink' | 'emerald' | 'blue' | 'fuchsia' | null;
export type RecordingType = 'audio' | 'video' | 'written' | 'book' | 'reader';

export interface Topic {
  id: number;
  name: string;
  color?: string | null;
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
  recording_type: RecordingType;
  audio_path: string | null;
  audio_duration: number | null;
  audio_size: number | null;
  video_path: string | null;
  video_duration: number | null;
  video_resolution: string | null;
  video_fps: number | null;
  video_size: number | null;
  notes_content: string | null;
  main_notes_content: string | null;
  pdf_path: string | null;
  page_offset: number;
  book_data_path: string | null;
  reading_progress: number;
  character_offset: number;
  total_pages: number | null;
  total_words: number | null;
  importance_color: ImportanceColor;
  last_group_color: DurationGroupColor;
  group_toggle_active: boolean;
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
  caption2: string | null;
  color: DurationColor;
  group_color: DurationGroupColor;
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
  group_color: DurationGroupColor;
  duration: number | null;
  sort_order: number;
  created_at: string;
}

export interface Audio {
  id: number;
  recording_id: number;
  file_path: string;
  caption: string | null;
  group_color: DurationGroupColor;
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
  color: DurationColor; // color indicator for categorizing duration marks (priority colors - left/right bars)
  group_color: DurationGroupColor; // group color for visually grouping related marks (top bar)
  page_number: number | null;
  sort_order: number; // order for drag-and-drop reordering
  source_video_id: number | null; // links to videos.id when created via OBS mark assignment
  source_duration_video_id: number | null; // links to duration_videos.id when created via OBS mark assignment
  is_video_mark: number | null; // 1 if created via OBS video mark assignment; survives video deletion
  created_at: string;
  // Media loaded separately
  images?: DurationImage[];
  videos?: DurationVideo[];
  audios?: DurationAudio[];
  codeSnippets?: DurationCodeSnippet[];
}

export interface ObsStagedMark {
  id: number;
  session_id: string;
  start_time: number;
  end_time: number;
  caption: string | null;
  sort_order: number;
  created_at: string;
}

export interface DurationImage {
  id: number;
  duration_id: number;
  file_path: string;
  thumbnail_path: string | null;
  caption: string | null;
  caption2: string | null;
  color: DurationColor;
  group_color: DurationGroupColor;
  sort_order: number;
  created_at: string;
  page_number: number | null;
  rect_x: number | null;
  rect_y: number | null;
  rect_w: number | null;
  rect_h: number | null;
}

export interface DurationVideo {
  id: number;
  duration_id: number;
  file_path: string;
  thumbnail_path: string | null;
  caption: string | null;
  color: DurationColor;
  group_color: DurationGroupColor;
  duration: number | null;
  sort_order: number;
  created_at: string;
}

export interface DurationAudio {
  id: number;
  duration_id: number;
  file_path: string;
  caption: string | null;
  group_color: DurationGroupColor;
  duration: number | null;
  sort_order: number;
  created_at: string;
}

export interface DurationImageAudio {
  id: number;
  duration_image_id: number;
  duration_id: number;
  file_path: string;
  caption: string | null;
  duration: number | null;
  sort_order: number;
  created_at: string;
}

export interface ImageAudio {
  id: number;
  image_id: number;
  file_path: string;
  caption: string | null;
  duration: number | null;
  sort_order: number;
  created_at: string;
}

export interface QuickCaptureImageAudio {
  id: number;
  capture_image_id: number;
  file_path: string;
  caption: string | null;
  duration: number | null;
  sort_order: number;
  created_at: string;
}

export interface ImageChildAudio {
  id: number;
  image_child_id: number;
  file_path: string;
  caption: string | null;
  duration: number | null;
  sort_order: number;
  created_at: string;
}

export interface ImageChild {
  id: number;
  parent_type: 'duration_image' | 'image' | 'quick_capture_image';
  parent_id: number;
  file_path: string;
  thumbnail_path: string | null;
  caption: string | null;
  caption2: string | null;
  sort_order: number;
  created_at: string;
}

export type AnyImageAudio = DurationImageAudio | ImageAudio | QuickCaptureImageAudio | ImageChildAudio;

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

export interface StudyDuration extends Duration {
  recording_name: string | null;
  recording_type: RecordingType;
  topic_name: string;
  topic_id: number;
}

export type UpdateDuration = Partial<Pick<Duration, 'note' | 'color' | 'group_color'>>;
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

// Audio Marker types
export type AudioMarkerType = 'important' | 'question' | 'similar_question';
export interface AudioMarker {
  id: number;
  audio_id: number;
  audio_type: 'duration' | 'duration_image' | 'recording' | 'recording_image' | 'capture_image' | 'quick_capture_audio';
  marker_type: AudioMarkerType;
  start_time: number;
  end_time: number | null;
  caption: string | null;
  created_at: string;
}

// Book Reader types
export interface BookPage {
  page_num: number;
  text: string;
  extraction_method: 'text' | 'ocr';
  confidence: number | null;
}

export interface BookData {
  pages: BookPage[];
  total_pages: number;
  total_words: number;
  extracted_at: string;
}

export interface ExtractionProgress {
  percent: number;
  page: number;
  totalPages: number;
  phase: string;
}

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

export type CreateRecording = Omit<Recording, 'id' | 'created_at' | 'updated_at' | 'images' | 'videos' | 'importance_color' | 'name' | 'last_group_color' | 'group_toggle_active' | 'recording_type' | 'main_notes_content' | 'pdf_path' | 'page_offset' | 'book_data_path' | 'reading_progress' | 'character_offset' | 'total_pages' | 'total_words'> & { importance_color?: ImportanceColor; name?: string | null; recording_type?: RecordingType; main_notes_content?: string | null; pdf_path?: string | null; page_offset?: number; book_data_path?: string | null; reading_progress?: number; character_offset?: number; total_pages?: number | null; total_words?: number | null };
export type UpdateRecording = Partial<Omit<CreateRecording, 'topic_id'>>;

export type CreateImage = Omit<Image, 'id' | 'created_at'>;
export type CreateVideo = Omit<Video, 'id' | 'created_at'>;
export type CreateDuration = Omit<Duration, 'id' | 'created_at' | 'color' | 'group_color' | 'sort_order' | 'page_number' | 'source_video_id' | 'source_duration_video_id' | 'is_video_mark'> & { note?: string | null; color?: DurationColor; group_color?: DurationGroupColor; page_number?: number | null; source_video_id?: number | null; source_duration_video_id?: number | null; is_video_mark?: number | null };

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
  totalSizeBytes?: number;
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
    getGroupColorState: (id: number) => Promise<{
      lastGroupColor: DurationGroupColor;
      toggleActive: boolean;
    }>;
    updateGroupColorState: (
      id: number,
      lastGroupColor: DurationGroupColor,
      toggleActive: boolean
    ) => Promise<Recording>;
    loadCanvas: (recordingId: number) => Promise<string | null>;
    saveCanvas: (recordingId: number, data: string) => Promise<void>;
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
    convertAllWebm: () => Promise<{ converted: number; failed: number; errors: string[] }>;
    convertBuffer: (webmBuffer: ArrayBuffer) => Promise<ArrayBuffer>;
  };
  media: {
    addImage: (recordingId: number, filePath: string) => Promise<Image>;
    addVideo: (recordingId: number, filePath: string) => Promise<Video>;
    addImageFromClipboard: (recordingId: number, imageBuffer: ArrayBuffer, extension?: string) => Promise<Image>;
    replaceImageFromClipboard: (imageId: number, recordingId: number, imageBuffer: ArrayBuffer, extension?: string) => Promise<Image>;
    addVideoFromClipboard: (recordingId: number, videoBuffer: ArrayBuffer, extension?: string) => Promise<Video>;
    getImages: (recordingId: number) => Promise<Image[]>;
    getVideos: (recordingId: number) => Promise<Video[]>;
    deleteImage: (id: number) => Promise<void>;
    deleteVideo: (id: number) => Promise<void>;
    updateImageCaption: (id: number, caption: string | null) => Promise<Image>;
    updateImageColor: (id: number, color: DurationColor) => Promise<Image>;
    updateImageGroupColor: (id: number, groupColor: DurationGroupColor) => Promise<Image>;
    updateVideoCaption: (id: number, caption: string | null) => Promise<Video>;
    updateVideoColor: (id: number, color: DurationColor) => Promise<Video>;
    updateVideoGroupColor: (id: number, groupColor: DurationGroupColor) => Promise<Video>;
    reorderImages: (recordingId: number, orderedIds: number[]) => Promise<Image[]>;
    pickFiles: (type: 'image' | 'video' | 'both') => Promise<string[]>;
  };
  paths: {
    getMediaDir: () => Promise<string>;
    openFile: (path: string) => Promise<void>;
    getFileUrl: (path: string) => string;
  };
  fs: {
    getFileSizes: (filePaths: string[]) => Promise<Record<string, number>>;
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
    getByRecordingAndVideo: (recordingId: number, videoId: number) => Promise<Duration[]>;
    getByRecordingAndDurationVideo: (recordingId: number, durationVideoId: number) => Promise<Duration[]>;
    getWithAudio: (topicIds?: number[]) => Promise<StudyDuration[]>;
    create: (duration: CreateDuration) => Promise<Duration>;
    update: (id: number, updates: UpdateDuration) => Promise<Duration>;
    updateGroupColor: (id: number, groupColor: DurationGroupColor) => Promise<Duration>;
    delete: (id: number) => Promise<void>;
    reorder: (recordingId: number, orderedIds: number[]) => Promise<Duration[]>;
    loadCanvas: (durationId: number) => Promise<string | null>;
    saveCanvas: (durationId: number, data: string) => Promise<void>;
  };
  durationImages: {
    getByDuration: (durationId: number) => Promise<DurationImage[]>;
    addFromClipboard: (durationId: number, imageBuffer: ArrayBuffer, extension?: string) => Promise<DurationImage>;
    replaceFromClipboard: (imageId: number, durationId: number, imageBuffer: ArrayBuffer, extension?: string) => Promise<DurationImage>;
    addScreenshot: (durationId: number, imageBuffer: ArrayBuffer, pageNumber: number, rect: { x: number; y: number; w: number; h: number }) => Promise<DurationImage>;
    delete: (id: number) => Promise<void>;
    updateCaption: (id: number, caption: string | null) => Promise<DurationImage>;
    updateColor: (id: number, color: DurationColor) => Promise<DurationImage>;
    updateGroupColor: (id: number, groupColor: DurationGroupColor) => Promise<DurationImage>;
    reorder: (durationId: number, orderedIds: number[]) => Promise<DurationImage[]>;
  };
  durationVideos: {
    getByDuration: (durationId: number) => Promise<DurationVideo[]>;
    addFromClipboard: (durationId: number, videoBuffer: ArrayBuffer, extension?: string) => Promise<DurationVideo>;
    addFromFile: (durationId: number, filePath: string) => Promise<DurationVideo>;
    delete: (id: number) => Promise<void>;
    updateCaption: (id: number, caption: string | null) => Promise<DurationVideo>;
    updateColor: (id: number, color: DurationColor) => Promise<DurationVideo>;
    updateGroupColor: (id: number, groupColor: DurationGroupColor) => Promise<DurationVideo>;
  };
  durationImageAudios: {
    getByDurationImage: (durationImageId: number) => Promise<DurationImageAudio[]>;
    addFromBuffer: (durationImageId: number, durationId: number, audioBuffer: ArrayBuffer, extension?: string) => Promise<DurationImageAudio>;
    delete: (id: number) => Promise<void>;
    updateCaption: (id: number, caption: string | null) => Promise<DurationImageAudio>;
  };
  imageAudios: {
    getByImage: (imageId: number) => Promise<ImageAudio[]>;
    addFromBuffer: (imageId: number, audioBuffer: ArrayBuffer, extension?: string) => Promise<ImageAudio>;
    delete: (id: number) => Promise<void>;
    updateCaption: (id: number, caption: string | null) => Promise<ImageAudio>;
  };
  captureImageAudios: {
    getByImage: (captureImageId: number) => Promise<QuickCaptureImageAudio[]>;
    addFromBuffer: (captureImageId: number, audioBuffer: ArrayBuffer, extension?: string) => Promise<QuickCaptureImageAudio>;
    delete: (id: number) => Promise<void>;
    updateCaption: (id: number, caption: string | null) => Promise<QuickCaptureImageAudio>;
  };
  durationAudios: {
    getByDuration: (durationId: number) => Promise<DurationAudio[]>;
    addFromBuffer: (durationId: number, audioBuffer: ArrayBuffer, extension?: string) => Promise<DurationAudio>;
    delete: (id: number) => Promise<void>;
    updateCaption: (id: number, caption: string | null) => Promise<DurationAudio>;
    updateGroupColor: (id: number, groupColor: DurationGroupColor) => Promise<DurationAudio>;
  };
  audios: {
    getByRecording: (recordingId: number) => Promise<Audio[]>;
    addFromBuffer: (recordingId: number, audioBuffer: ArrayBuffer, extension?: string) => Promise<Audio>;
    delete: (id: number) => Promise<void>;
    updateCaption: (id: number, caption: string | null) => Promise<Audio>;
    updateGroupColor: (id: number, groupColor: DurationGroupColor) => Promise<Audio>;
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
	        debugLogPath?: string;
		      };
		    }>;
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
    ) => Promise<{
      filePath: string;
      duration: number | null;
		      _debug?: {
		        usedFallback?: boolean;
		        extractionError?: string;
		        durationExtracted?: boolean;
		        debugLogPath?: string;
		      };
		    }>;
	    logDebugEvent: (
	      recordingId: number,
	      event: { type: string; atMs?: number; origin?: string; payload?: any }
	    ) => Promise<{ success: boolean; error?: string }>;
	    getDebugLogPath: (recordingId: number) => Promise<string>;
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
    sendPauseStateUpdate: (isPaused: boolean) => void;
    onPauseStateUpdate: (callback: (isPaused: boolean) => void) => () => void;
    sendPauseSourceUpdate: (source: 'manual' | 'marking' | null) => void;
    onPauseSourceUpdate: (callback: (source: 'manual' | 'marking' | null) => void) => () => void;
    sendMarkInputFocus: () => Promise<void>;
    onMarkInputFocus: (callback: () => void) => () => void;
    sendMarkInputBlur: () => Promise<void>;
    onMarkInputBlur: (callback: () => void) => () => void;
    sendGroupColorToggle: (isActive: boolean, currentColor: DurationGroupColor) => void;
    onGroupColorToggle: (callback: (isActive: boolean, currentColor: DurationGroupColor) => void) => () => void;
    sendGroupColorToggleRequest: () => void;
    onGroupColorToggleRequest: (callback: () => void) => () => void;
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
    remuxToMp4: (
      videoId: number,
      videoType: 'video' | 'durationVideo',
      filePath: string,
      crf?: number
    ) => Promise<{ success: boolean; newPath?: string; error?: string }>;
    mergeExtension: (
      recordingId: number,
      extensionSource: ArrayBuffer | string,
      originalDurationMs: number,
      extensionDurationMs: number,
      compressionOptions?: VideoCompressionOptions,
      audioOffsetMs?: number
    ) => Promise<VideoMergeResult>;
  };
  settings: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
    getAll: () => Promise<Record<string, string>>;
    toggleObs: (enabled: boolean) => Promise<void>;
    saveObsConfig: (config: { host: string; port: string; password: string }) => Promise<void>;
  };
  obs: {
    getStatus: () => Promise<{ isConnected: boolean; isConnecting: boolean; isRecording: boolean; isPaused: boolean; recordTimecode: string; connectionStatus: string }>;
    connect: () => Promise<any>;
    disconnect: () => Promise<void>;
    stopRecording: () => Promise<void>;
    getStagedMarks: () => Promise<ObsStagedMark[]>;
    hasStagedMarks: () => Promise<boolean>;
    getStagedMarksCount: () => Promise<number>;
    clearStagedMarks: () => Promise<void>;
    deleteStagedMark: (id: number) => Promise<void>;
    assignStagedMarks: (videoId: number, recordingId: number) => Promise<{ assigned: number }>;
    assignStagedMarksToDurationVideo: (durationVideoId: number, recordingId: number) => Promise<{ assigned: number }>;
    captionUpdate: (caption: string) => void;
    continueToggle: (isOn: boolean) => void;
    updateStagedMarkCaption: (id: number, caption: string) => void;
    hideOverlay: () => void;
    onPaused: (cb: (data: { timecode: number; timecodeStr: string }) => void) => () => void;
    onResumed: (cb: () => void) => () => void;
    onStarted: (cb: (data: { sessionId: string }) => void) => () => void;
    onStopped: (cb: (data: { sessionId: string | null }) => void) => () => void;
    onStatusChange: (cb: (status: any) => void) => () => void;
    onOverlayData: (cb: (data: { timecode: number; markCount: number }) => void) => () => void;
    onOverlayDataWithMarks: (cb: (data: { timecode: number; markCount: number; marks: any[]; currentCaption: string }) => void) => () => void;
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
      recordingId?: number;
      regionX?: number;
      regionY?: number;
      regionWidth?: number;
      regionHeight?: number;
      scaleFactor?: number;
      outputPath?: string;
    }) => Promise<{ success: boolean; error?: string }>;
    stopCapture: () => Promise<{ success: boolean; error?: string }>;
    pauseCapture: () => Promise<{ success: boolean; error?: string }>;
    resumeCapture: () => Promise<{ success: boolean; error?: string }>;
    isCapturing: () => Promise<{ isCapturing: boolean }>;
    isPaused: () => Promise<{ isPaused: boolean }>;
    onComplete: (callback: (data: { filePath: string }) => void) => void;
    onError: (callback: (data: { error: string }) => void) => void;
    removeAllListeners: () => void;
  };
  app: {
    quit: () => Promise<void>;
    forceQuit: () => Promise<void>;
  };
  pdf: {
    pickFile: () => Promise<string | null>;
    copyToMedia: (recordingId: number, sourcePath: string) => Promise<string>;
    readFile: (filePath: string) => Promise<ArrayBuffer>;
    saveBookData: (recordingId: number, bookData: BookData) => Promise<string>;
    readBookData: (bookDataPath: string) => Promise<BookData>;
  };
  sync: {
    upload: () => Promise<{ success: boolean; output?: string; error?: string; stderr?: string }>;
  };
  audioMarkers: {
    getByAudio: (audioId: number, audioType: 'duration' | 'duration_image' | 'recording' | 'recording_image' | 'capture_image' | 'quick_capture_audio' | 'image_child') => Promise<AudioMarker[]>;
    addBatch: (markers: Omit<AudioMarker, 'id' | 'created_at'>[]) => Promise<AudioMarker[]>;
    updateCaption: (markerId: number, caption: string | null) => Promise<AudioMarker>;
  };
  search: {
    global: (query: string, limit?: number) => Promise<GlobalSearchResult[]>;
    rebuildIndex: () => Promise<void>;
    filtered: (params: FilteredSearchParams) => Promise<GlobalSearchResult[]>;
  };
  tags: {
    getAll: () => Promise<Tag[]>;
    search: (query: string) => Promise<Tag[]>;
    getByMedia: (mediaType: MediaTagType, mediaId: number) => Promise<Tag[]>;
    setForMedia: (mediaType: MediaTagType, mediaId: number, tagNames: string[]) => Promise<void>;
    rename: (oldName: string, newName: string) => Promise<void>;
    delete: (tagId: number) => Promise<void>;
    getMediaByTag: (mediaType: MediaTagType, tagName: string) => Promise<{ media_id: number }[]>;
    getItemsByTag: (tagName: string) => Promise<TaggedItems>;
    recordSearch: (tagId: number) => Promise<void>;
  };
  quickCaptures: {
    create: (note: string, tags: string[]) => Promise<{ id: number }>;
    getOrCreate: (note: string, tags: string[]) => Promise<{ id: number }>;
    getRecent: () => Promise<QuickCapture[]>;
    addImage: (captureId: number, imageBuffer: ArrayBuffer, extension?: string) => Promise<QuickCaptureImage>;
    addAudio: (captureId: number, audioBuffer: ArrayBuffer, extension?: string) => Promise<QuickCaptureAudio>;
    delete: (id: number) => Promise<void>;
    updateTags: (id: number, tags: string[]) => Promise<void>;
    cleanup: () => Promise<void>;
    reorderImages: (captureId: number, imageIds: number[]) => Promise<void>;
    deleteImage: (imageId: number) => Promise<void>;
    updateImageCaption: (imageId: number, caption: string | null) => Promise<QuickCaptureImage>;
    deleteAudio: (audioId: number) => Promise<void>;
    updateAudioCaption: (audioId: number, caption: string | null) => Promise<QuickCaptureAudio>;
    replaceImageFromClipboard: (imageId: number, imageBuffer: ArrayBuffer, extension?: string) => Promise<QuickCaptureImage>;
  };
  imageChildren: {
    getByParent: (parentType: string, parentId: number) => Promise<ImageChild[]>;
    addFromClipboard: (parentType: string, parentId: number, imageBuffer: ArrayBuffer, extension?: string) => Promise<ImageChild>;
    delete: (id: number) => Promise<void>;
    updateCaption: (id: number, caption: string | null) => Promise<ImageChild>;
    reorder: (parentType: string, parentId: number, orderedIds: number[]) => Promise<void>;
    replaceFromClipboard: (id: number, imageBuffer: ArrayBuffer, extension?: string) => Promise<ImageChild>;
  };
  imageChildAudios: {
    getByChild: (imageChildId: number) => Promise<ImageChildAudio[]>;
    addFromBuffer: (imageChildId: number, audioBuffer: ArrayBuffer, extension?: string) => Promise<ImageChildAudio>;
    delete: (id: number) => Promise<void>;
    updateCaption: (id: number, caption: string | null) => Promise<ImageChildAudio>;
  };
  imageAnnotations: {
    getByImage: (imageType: string, imageId: number) => Promise<ImageAnnotation[]>;
    create: (data: {
      image_type: string;
      image_id: number;
      ann_type: 'rect' | 'line';
      x1: number; y1: number; x2: number; y2: number;
      color: string;
      stroke_width: number;
    }) => Promise<ImageAnnotation>;
    update: (id: number, partial: { x1?: number; y1?: number; x2?: number; y2?: number; color?: string }) => Promise<ImageAnnotation>;
    delete: (id: number) => Promise<void>;
  };
  ocr: {
    recognizeRegion: (
      imagePath: string,
      rect: { x: number; y: number; width: number; height: number }
    ) => Promise<{ text: string; slug: string }>;
    extractCaption2: (
      imageType: string,
      imageId: number,
      filePath: string
    ) => Promise<string>;
  };
  mediaColors: {
    toggle: (mediaType: string, mediaId: number, colorKey: string) => Promise<string[]>;
    getByMedia: (mediaType: string, mediaId: number) => Promise<string[]>;
    getBatch: (mediaType: string, mediaIds: number[]) => Promise<Record<number, string[]>>;
  };
  recordingPlans: {
    getByRecording: (recordingId: number) => Promise<RecordingPlan[]>;
    getAll: () => Promise<RecordingPlanWithContext[]>;
    create: (plan: CreateRecordingPlan) => Promise<RecordingPlan>;
    update: (id: number, updates: UpdateRecordingPlan) => Promise<RecordingPlan>;
    delete: (id: number) => Promise<void>;
  };
  durationPlans: {
    getByDuration: (durationId: number) => Promise<DurationPlan[]>;
    getAll: () => Promise<DurationPlanWithContext[]>;
    create: (plan: CreateDurationPlan) => Promise<DurationPlan>;
    update: (id: number, updates: UpdateDurationPlan) => Promise<DurationPlan>;
    delete: (id: number) => Promise<void>;
  };
  calendarTodos: {
    getAll: () => Promise<CalendarTodo[]>;
    create: (todo: { plan_date: string; text: string }) => Promise<CalendarTodo>;
    update: (id: number, updates: { text?: string; completed?: number }) => Promise<CalendarTodo>;
    delete: (id: number) => Promise<void>;
  };
  studyTracker: {
    createSession: (startedAt: string) => Promise<{ id: number; started_at: string }>;
    endSession: (id: number, endedAt: string, totalSeconds: number) => Promise<void>;
    createEvent: (event: CreateStudyEvent) => Promise<number>;
    updateEvent: (id: number, endedAt: string, seconds: number) => Promise<void>;
    logIdle: (log: StudyIdleLog) => Promise<void>;
    getHeatmap: (fromDate: string, toDate: string) => Promise<{ date: string; total_seconds: number }[]>;
    getSessionsForDay: (date: string) => Promise<StudySessionWithEvents[]>;
    getStats: (fromDate: string, toDate: string) => Promise<StudyStats>;
    onAppBlur: (cb: () => void) => () => void;
    onAppFocus: (cb: () => void) => () => void;
  };
}

// Plans
export interface RecordingPlan {
  id: number;
  recording_id: number;
  plan_date: string; // 'YYYY-MM-DD'
  text: string;
  completed: number; // 0 | 1
  sort_order: number;
  created_at: string;
}
export type CreateRecordingPlan = Omit<RecordingPlan, 'id' | 'created_at'>;
export type UpdateRecordingPlan = { text?: string; completed?: number; sort_order?: number };

export interface RecordingPlanWithContext extends RecordingPlan {
  recording_name: string | null;
  topic_id: number;
  topic_name: string;
}

export interface DurationPlan {
  id: number;
  duration_id: number;
  plan_date: string;
  text: string;
  completed: number;
  sort_order: number;
  created_at: string;
}
export type CreateDurationPlan = Omit<DurationPlan, 'id' | 'created_at'>;
export type UpdateDurationPlan = { text?: string; completed?: number; sort_order?: number };

export interface DurationPlanWithContext extends DurationPlan {
  recording_id: number;
  recording_name: string | null;
  topic_id: number;
  topic_name: string;
  duration_caption: string | null;
}

// Calendar Todos
export interface CalendarTodo {
  id: number;
  plan_date: string; // 'YYYY-MM-DD'
  text: string;
  completed: number; // 0 | 1
  sort_order: number;
  created_at: string;
}

// ─── Study Tracking ───────────────────────────────────────────────────────────

export type StudyEventType = 'view_recording' | 'view_mark' | 'view_image' | 'play_audio' | 'play_video';
export type StudySource = 'direct' | 'search' | 'study_mode';

export interface CreateStudyEvent {
  session_id: number;
  event_type: StudyEventType;
  topic_id?: number | null;
  topic_name?: string | null;
  recording_id?: number | null;
  recording_name?: string | null;
  duration_id?: number | null;
  duration_caption?: string | null;
  resource_id?: number | null;
  resource_type?: string | null;
  started_at: string;
  source?: StudySource;
}

export interface StudyEvent extends CreateStudyEvent {
  id: number;
  ended_at: string | null;
  seconds: number;
}

export interface StudyIdleLog {
  session_id: number;
  detected_at: string;
  idle_seconds: number;
  credited_seconds: number;
}

export interface StudySession {
  id: number;
  started_at: string;
  ended_at: string | null;
  total_seconds: number;
}

export interface StudySessionWithEvents extends StudySession {
  events: StudyEvent[];
}

export interface StudyStats {
  byTopic: {
    topic_id: number;
    topic_name: string;
    total_seconds: number;
    session_count: number;
  }[];
  byRecording: {
    recording_id: number;
    recording_name: string;
    topic_name: string;
    total_seconds: number;
    session_count: number;
    open_count: number;
  }[];
  byMark: {
    duration_id: number;
    duration_caption: string;
    recording_name: string;
    topic_name: string;
    total_seconds: number;
    image_opens: number;
  }[];
}

export interface StudyTrackingContext {
  topicId: number | null;
  topicName: string | null;
  recordingId: number | null;
  recordingName: string | null;
  durationId: number | null;
  durationCaption: string | null;
  source: StudySource;
}

export interface GlobalSearchResult {
  content_type: 'topic' | 'recording' | 'duration' | 'image' | 'video' | 'audio'
    | 'duration_image' | 'duration_video' | 'duration_audio'
    | 'code_snippet' | 'duration_code_snippet'
    | 'audio_marker' | 'duration_image_audio' | 'image_audio'
    | 'quick_capture_image'
    | 'image_ocr' | 'duration_image_ocr' | 'quick_capture_image_ocr' | 'image_child_ocr';
  source_id: number;
  parent_id: number;
  snippet: string;
  rank: number;
  topic_id: number | null;
  topic_name: string | null;
  recording_id: number | null;
  recording_name: string | null;
  duration_id: number | null;
  file_path: string | null;
  thumbnail_path: string | null;
  marker_type: string | null;
  language: string | null;
  code: string | null;
}

export interface SearchNavState {
  results: GlobalSearchResult[];
  currentIndex: number;
  query: string;
}

export type MediaTagType = 'image' | 'audio' | 'duration_image' | 'duration_audio' | 'quick_capture_image' | 'quick_capture_audio' | 'image_child' | 'image_audio' | 'duration_image_audio' | 'quick_capture_image_audio' | 'image_child_audio' | 'video' | 'duration_video';

export interface Tag {
  id: number;
  name: string;
  usage_count: number;
  created_at: string;
  last_assigned_at: string | null;
  last_searched_at: string | null;
}

export interface TaggedMediaImage {
  id: number;
  file_path: string;
  thumbnail_path: string | null;
  caption: string | null;
  recording_id: number;
  recording_name: string | null;
  topic_id: number;
  topic_name: string;
}

export interface TaggedMediaDurationImage extends TaggedMediaImage {
  duration_id: number;
}

export interface TaggedMediaAudio {
  id: number;
  file_path: string;
  caption: string | null;
  duration: number | null;
  recording_id: number;
  recording_name: string | null;
  topic_id: number;
  topic_name: string;
}

export interface TaggedMediaDurationAudio extends TaggedMediaAudio {
  duration_id: number;
}

export interface TaggedCaptureImage {
  id: number;
  capture_id: number;
  file_path: string;
  thumbnail_path: string | null;
  caption: string | null;
}

export interface TaggedChildImage {
  id: number;
  file_path: string;
  thumbnail_path: string | null;
  caption: string | null;
  parent_type: 'duration_image' | 'image' | 'quick_capture_image';
  parent_id: number;
  recording_id: number | null;
  recording_name: string | null;
  topic_name: string | null;
}

export interface TaggedItems {
  images: TaggedMediaImage[];
  duration_images: TaggedMediaDurationImage[];
  audios: TaggedMediaAudio[];
  duration_audios: TaggedMediaDurationAudio[];
  capture_images: TaggedCaptureImage[];
  image_children: TaggedChildImage[];
}

// Quick Capture types
export interface QuickCaptureImage {
  id: number;
  capture_id: number;
  file_path: string;
  thumbnail_path: string | null;
  caption: string | null;
  caption2?: string | null;
  sort_order: number;
  created_at: string;
}

export interface QuickCaptureAudio {
  id: number;
  capture_id: number;
  file_path: string;
  duration: number | null;
  caption: string | null;
  sort_order: number;
  created_at: string;
}

export interface QuickCapture {
  id: number;
  note: string | null;
  tags: string[];
  created_at: string;
  images: QuickCaptureImage[];
  audios: QuickCaptureAudio[];
}

export interface ImageAnnotation {
  id: number;
  image_type: 'duration_image' | 'image' | 'quick_capture_image' | 'image_child';
  image_id: number;
  ann_type: 'rect' | 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  stroke_width: number;
  created_at: string;
}

export type SearchConditionType = 'text' | 'tag' | 'color';

export interface SearchCondition {
  id: string;
  type: SearchConditionType;
  value: string;
}

export interface FilteredSearchParams {
  conditions: SearchCondition[];
  op: 'AND' | 'OR';
  limit?: number;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
