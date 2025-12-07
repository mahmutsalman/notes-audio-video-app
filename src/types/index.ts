// Database Models

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
  audio_path: string | null;
  audio_duration: number | null;
  notes_content: string | null;
  created_at: string;
  updated_at: string;
  // Relations (loaded separately)
  images?: Image[];
  videos?: Video[];
}

export interface Image {
  id: number;
  recording_id: number;
  file_path: string;
  thumbnail_path: string | null;
  sort_order: number;
  created_at: string;
}

export interface Video {
  id: number;
  recording_id: number;
  file_path: string;
  thumbnail_path: string | null;
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
  created_at: string;
}

export type UpdateDuration = Partial<Pick<Duration, 'note'>>;

// Create types (omit auto-generated fields)
export type CreateTopic = Omit<Topic, 'id' | 'created_at' | 'updated_at' | 'total_recordings' | 'total_images' | 'total_videos'>;
export type UpdateTopic = Partial<CreateTopic>;

export type CreateRecording = Omit<Recording, 'id' | 'created_at' | 'updated_at' | 'images' | 'videos'>;
export type UpdateRecording = Partial<Omit<CreateRecording, 'topic_id'>>;

export type CreateImage = Omit<Image, 'id' | 'created_at'>;
export type CreateVideo = Omit<Video, 'id' | 'created_at'>;
export type CreateDuration = Omit<Duration, 'id' | 'created_at'> & { note?: string | null };

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
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
