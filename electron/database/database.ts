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
      notes_content TEXT,
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
