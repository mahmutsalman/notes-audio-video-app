import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function initDatabase(): Database.Database {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'NotesWithAudioAndVideo.db');

  // Ensure the directory exists
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }

  console.log('Initializing database at:', dbPath);

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run migrations
  runMigrations(db);

  return db;
}

function runMigrations(db: Database.Database): void {
  // Create tables
  db.exec(`
    -- Topics table
    CREATE TABLE IF NOT EXISTS topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      tags TEXT DEFAULT '[]',
      importance_level INTEGER DEFAULT 5 CHECK(importance_level >= 1 AND importance_level <= 10),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Create indexes for topics
    CREATE INDEX IF NOT EXISTS idx_topics_updated_at ON topics(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_topics_importance ON topics(importance_level DESC);

    -- Recordings table
    CREATE TABLE IF NOT EXISTS recordings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id INTEGER NOT NULL,
      audio_path TEXT,
      audio_duration INTEGER,
      audio_size INTEGER,
      notes_content TEXT,
      video_size INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_recordings_topic ON recordings(topic_id);
    CREATE INDEX IF NOT EXISTS idx_recordings_created ON recordings(created_at DESC);

    -- Images table
    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recording_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      thumbnail_path TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_images_recording ON images(recording_id);

    -- Videos table
    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recording_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      thumbnail_path TEXT,
      duration INTEGER,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_videos_recording ON videos(recording_id);

    -- Durations table (marked time segments within recordings)
    CREATE TABLE IF NOT EXISTS durations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recording_id INTEGER NOT NULL,
      start_time REAL NOT NULL,
      end_time REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_durations_recording ON durations(recording_id);

    -- Duration images table (images attached to duration marks)
    CREATE TABLE IF NOT EXISTS duration_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      duration_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      thumbnail_path TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (duration_id) REFERENCES durations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_duration_images_duration ON duration_images(duration_id);

    -- Duration videos table (videos attached to duration marks)
    CREATE TABLE IF NOT EXISTS duration_videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      duration_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      thumbnail_path TEXT,
      caption TEXT,
      duration REAL,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (duration_id) REFERENCES durations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_duration_videos_duration ON duration_videos(duration_id);

    -- Duration audios table (audio clips attached to duration marks)
    CREATE TABLE IF NOT EXISTS duration_audios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      duration_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      caption TEXT,
      duration REAL,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (duration_id) REFERENCES durations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_duration_audios_duration ON duration_audios(duration_id);

    -- Audios table (audio clips attached to recordings)
    CREATE TABLE IF NOT EXISTS audios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recording_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      caption TEXT,
      duration REAL,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_audios_recording ON audios(recording_id);
  `);

  // Migration: Add note column to durations table if it doesn't exist
  const durationsColumns = db.prepare("PRAGMA table_info(durations)").all() as { name: string }[];
  const hasNoteColumn = durationsColumns.some(col => col.name === 'note');
  if (!hasNoteColumn) {
    db.exec(`ALTER TABLE durations ADD COLUMN note TEXT`);
    console.log('Added note column to durations table');
  }

  // Migration: Add importance_color column to recordings table if it doesn't exist
  const recordingsColumns = db.prepare("PRAGMA table_info(recordings)").all() as { name: string }[];
  const hasImportanceColorColumn = recordingsColumns.some(col => col.name === 'importance_color');
  if (!hasImportanceColorColumn) {
    db.exec(`ALTER TABLE recordings ADD COLUMN importance_color TEXT`);
    console.log('Added importance_color column to recordings table');
  }

  // Migration: Add color column to durations table if it doesn't exist
  const hasColorColumn = durationsColumns.some(col => col.name === 'color');
  if (!hasColorColumn) {
    db.exec(`ALTER TABLE durations ADD COLUMN color TEXT`);
    console.log('Added color column to durations table');
  }

  // Migration: Add name column to recordings table if it doesn't exist
  const hasNameColumn = recordingsColumns.some(col => col.name === 'name');
  if (!hasNameColumn) {
    db.exec(`ALTER TABLE recordings ADD COLUMN name TEXT`);
    console.log('Added name column to recordings table');
  }

  // Migration: Add video columns to recordings table for screen recordings
  const hasVideoPathColumn = recordingsColumns.some(col => col.name === 'video_path');
  if (!hasVideoPathColumn) {
    db.exec(`ALTER TABLE recordings ADD COLUMN video_path TEXT`);
    console.log('Added video_path column to recordings table');
  }

  const hasVideoDurationColumn = recordingsColumns.some(col => col.name === 'video_duration');
  if (!hasVideoDurationColumn) {
    db.exec(`ALTER TABLE recordings ADD COLUMN video_duration INTEGER`);
    console.log('Added video_duration column to recordings table');
  }

  const hasVideoResolutionColumn = recordingsColumns.some(col => col.name === 'video_resolution');
  if (!hasVideoResolutionColumn) {
    db.exec(`ALTER TABLE recordings ADD COLUMN video_resolution TEXT`);
    console.log('Added video_resolution column to recordings table');
  }

  const hasVideoFpsColumn = recordingsColumns.some(col => col.name === 'video_fps');
  if (!hasVideoFpsColumn) {
    db.exec(`ALTER TABLE recordings ADD COLUMN video_fps INTEGER`);
    console.log('Added video_fps column to recordings table');
  }

  const hasVideoSizeColumn = recordingsColumns.some(col => col.name === 'video_size');
  if (!hasVideoSizeColumn) {
    db.exec(`ALTER TABLE recordings ADD COLUMN video_size INTEGER`);
    console.log('Added video_size column to recordings table');
  }

  // Migration: Add caption column to images table if it doesn't exist
  const imagesColumns = db.prepare("PRAGMA table_info(images)").all() as { name: string }[];
  const hasImageCaptionColumn = imagesColumns.some(col => col.name === 'caption');
  if (!hasImageCaptionColumn) {
    db.exec(`ALTER TABLE images ADD COLUMN caption TEXT`);
    console.log('Added caption column to images table');
  }

  // Migration: Add caption column to videos table if it doesn't exist
  const videosColumns = db.prepare("PRAGMA table_info(videos)").all() as { name: string }[];
  const hasVideoCaptionColumn = videosColumns.some(col => col.name === 'caption');
  if (!hasVideoCaptionColumn) {
    db.exec(`ALTER TABLE videos ADD COLUMN caption TEXT`);
    console.log('Added caption column to videos table');
  }

  // Migration: Add caption column to duration_images table if it doesn't exist
  const durationImagesColumns = db.prepare("PRAGMA table_info(duration_images)").all() as { name: string }[];
  const hasDurationImageCaptionColumn = durationImagesColumns.some(col => col.name === 'caption');
  if (!hasDurationImageCaptionColumn) {
    db.exec(`ALTER TABLE duration_images ADD COLUMN caption TEXT`);
    console.log('Added caption column to duration_images table');
  }

  // Migration: Add color column to images table if it doesn't exist
  const hasImageColorColumn = imagesColumns.some(col => col.name === 'color');
  if (!hasImageColorColumn) {
    db.exec(`ALTER TABLE images ADD COLUMN color TEXT`);
    console.log('Added color column to images table');
  }

  // Migration: Add color column to videos table if it doesn't exist
  const hasVideoColorColumn = videosColumns.some(col => col.name === 'color');
  if (!hasVideoColorColumn) {
    db.exec(`ALTER TABLE videos ADD COLUMN color TEXT`);
    console.log('Added color column to videos table');
  }

  // Migration: Add color column to duration_images table if it doesn't exist
  const hasDurationImageColorColumn = durationImagesColumns.some(col => col.name === 'color');
  if (!hasDurationImageColorColumn) {
    db.exec(`ALTER TABLE duration_images ADD COLUMN color TEXT`);
    console.log('Added color column to duration_images table');
  }

  // Migration: Add color column to duration_videos table if it doesn't exist
  const durationVideosColumns = db.prepare("PRAGMA table_info(duration_videos)").all() as { name: string }[];
  const hasDurationVideoColorColumn = durationVideosColumns.some(col => col.name === 'color');
  if (!hasDurationVideoColorColumn) {
    db.exec(`ALTER TABLE duration_videos ADD COLUMN color TEXT`);
    console.log('Added color column to duration_videos table');
  }

  // Migration: Create code_snippets table
  const codeSnippetsTableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='code_snippets'"
  ).get();

  if (!codeSnippetsTableExists) {
    db.exec(`
      CREATE TABLE code_snippets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recording_id INTEGER NOT NULL,
        title TEXT,
        language TEXT NOT NULL DEFAULT 'plaintext',
        code TEXT NOT NULL,
        caption TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_code_snippets_recording ON code_snippets(recording_id);
    `);
    console.log('Created code_snippets table');
  }

  // Migration: Create duration_code_snippets table
  const durationCodeSnippetsTableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='duration_code_snippets'"
  ).get();

  if (!durationCodeSnippetsTableExists) {
    db.exec(`
      CREATE TABLE duration_code_snippets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        duration_id INTEGER NOT NULL,
        title TEXT,
        language TEXT NOT NULL DEFAULT 'plaintext',
        code TEXT NOT NULL,
        caption TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (duration_id) REFERENCES durations(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_duration_code_snippets_duration ON duration_code_snippets(duration_id);
    `);
    console.log('Created duration_code_snippets table');
  }


  // Migration: Create app_settings table
  const appSettingsTableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='app_settings'"
  ).get();

  if (!appSettingsTableExists) {
    db.exec(`
      CREATE TABLE app_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL UNIQUE,
        value TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_app_settings_key ON app_settings(key);

      INSERT INTO app_settings (key, value) VALUES
        ('screen_recording_resolution', '1080p'),
        ('screen_recording_fps', '30'),
        ('screen_recording_codec', 'vp9'),
        ('screen_recording_preset_name', 'Standard');
    `);
    console.log('Created app_settings table with default values');
  }

  // Create the stats view (drop and recreate to handle schema changes)
  db.exec(`
    DROP VIEW IF EXISTS topic_stats;

    CREATE VIEW topic_stats AS
    SELECT
      t.id,
      t.name,
      t.tags,
      t.importance_level,
      t.created_at,
      t.updated_at,
      COUNT(DISTINCT r.id) as total_recordings,
      COALESCE((
        SELECT COUNT(*) FROM images i
        INNER JOIN recordings r2 ON i.recording_id = r2.id
        WHERE r2.topic_id = t.id
      ), 0) as total_images,
      COALESCE((
        SELECT COUNT(*) FROM videos v
        INNER JOIN recordings r3 ON v.recording_id = r3.id
        WHERE r3.topic_id = t.id
      ), 0) as total_videos
    FROM topics t
    LEFT JOIN recordings r ON t.id = r.topic_id
    GROUP BY t.id;
  `);

  console.log('Database migrations completed');
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    console.log('Database closed');
  }
}
