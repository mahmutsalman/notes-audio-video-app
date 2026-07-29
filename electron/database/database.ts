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
  // More than one process opens this file: the main app, the Echo companion app, and the
  // VPS sync connection. WAL allows concurrent readers with a single writer, but a writer
  // that arrives mid-transaction gets SQLITE_BUSY — and better-sqlite3 is synchronous, so
  // it throws immediately rather than waiting. rebuildSearchIndex() drops and rebuilds the
  // whole FTS table, which is long enough to collide with an Echo rating or a code-pad
  // autosave. Wait for the lock instead of losing the write.
  db.pragma('busy_timeout = 5000');

  // Register custom function for HTML tag stripping (used by FTS rebuild)
  db.function('strip_html', (text: string | null) => {
    if (!text) return '';
    return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  });

  // Run migrations
  runMigrations(db);

  // Build full-text search index
  rebuildSearchIndex();

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

  // Migration: Create duration_image_audios table
  const durationImageAudiosTableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='duration_image_audios'"
  ).get();

  if (!durationImageAudiosTableExists) {
    db.exec(`
      CREATE TABLE duration_image_audios (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        duration_image_id INTEGER NOT NULL REFERENCES duration_images(id) ON DELETE CASCADE,
        duration_id       INTEGER NOT NULL REFERENCES durations(id) ON DELETE CASCADE,
        file_path         TEXT NOT NULL,
        caption           TEXT,
        duration          REAL,
        sort_order        INTEGER NOT NULL DEFAULT 0,
        created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_duration_image_audios_image ON duration_image_audios(duration_image_id);
      CREATE INDEX idx_duration_image_audios_duration ON duration_image_audios(duration_id);
    `);
    console.log('Created duration_image_audios table');
  }

  // Migration: Add color column to topics table if it doesn't exist
  const topicsColumns = db.prepare("PRAGMA table_info(topics)").all() as { name: string }[];
  const hasTopicColorColumn = topicsColumns.some(col => col.name === 'color');
  if (!hasTopicColorColumn) {
    db.exec(`ALTER TABLE topics ADD COLUMN color TEXT`);
    console.log('Added color column to topics table');
  }

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

  // Migration: Add group_color column to durations table if it doesn't exist
  const hasGroupColorColumn = durationsColumns.some(col => col.name === 'group_color');
  if (!hasGroupColorColumn) {
    db.exec(`ALTER TABLE durations ADD COLUMN group_color TEXT`);
    console.log('Added group_color column to durations table');
  }

  // Migration: Add last_group_color and group_toggle_active columns to recordings table if they don't exist
  const hasLastGroupColorColumn = recordingsColumns.some(col => col.name === 'last_group_color');
  if (!hasLastGroupColorColumn) {
    db.exec(`ALTER TABLE recordings ADD COLUMN last_group_color TEXT`);
    console.log('Added last_group_color column to recordings table');
  }

  const hasGroupToggleActiveColumn = recordingsColumns.some(col => col.name === 'group_toggle_active');
  if (!hasGroupToggleActiveColumn) {
    db.exec(`ALTER TABLE recordings ADD COLUMN group_toggle_active INTEGER DEFAULT 0`);
    console.log('Added group_toggle_active column to recordings table');
  }

  // Migration: Add recording_type column to recordings table if it doesn't exist
  // Values: 'audio' (default), 'video', 'written'
  const hasRecordingTypeColumn = recordingsColumns.some(col => col.name === 'recording_type');
  if (!hasRecordingTypeColumn) {
    db.exec(`ALTER TABLE recordings ADD COLUMN recording_type TEXT DEFAULT 'audio'`);
    console.log('Added recording_type column to recordings table');
  }

  // Migration: Add main_notes_content column to recordings table if it doesn't exist
  // This is separate from notes_content to allow independent "Main Notes" and "Notes" sections
  const hasMainNotesContentColumn = recordingsColumns.some(col => col.name === 'main_notes_content');
  if (!hasMainNotesContentColumn) {
    db.exec(`ALTER TABLE recordings ADD COLUMN main_notes_content TEXT`);
    console.log('Added main_notes_content column to recordings table');
  }

  // Migration: Add sort_order column to durations table for drag-and-drop reordering
  // Re-fetch columns since we might have added columns earlier
  const durationsColumnsUpdated = db.prepare("PRAGMA table_info(durations)").all() as { name: string }[];
  const hasSortOrderColumn = durationsColumnsUpdated.some(col => col.name === 'sort_order');
  if (!hasSortOrderColumn) {
    db.exec(`ALTER TABLE durations ADD COLUMN sort_order INTEGER DEFAULT 0`);
    // Backfill existing records: set sort_order based on current start_time ordering
    db.exec(`
      UPDATE durations
      SET sort_order = (
        SELECT COUNT(*)
        FROM durations d2
        WHERE d2.recording_id = durations.recording_id
        AND d2.id < durations.id
      )
    `);
    console.log('Added sort_order column to durations table');
  }

  // Create index for sort_order performance
  db.exec(`CREATE INDEX IF NOT EXISTS idx_durations_sort ON durations(recording_id, sort_order)`)

  // Migration: Add group_color column to images table if it doesn't exist
  const imagesColumnsUpdated = db.prepare("PRAGMA table_info(images)").all() as { name: string }[];
  const hasImageGroupColorColumn = imagesColumnsUpdated.some(col => col.name === 'group_color');
  if (!hasImageGroupColorColumn) {
    db.exec(`ALTER TABLE images ADD COLUMN group_color TEXT`);
    console.log('Added group_color column to images table');
  }

  // Migration: Add group_color column to duration_images table if it doesn't exist
  const durationImagesColumnsUpdated = db.prepare("PRAGMA table_info(duration_images)").all() as { name: string }[];
  const hasDurationImageGroupColorColumn = durationImagesColumnsUpdated.some(col => col.name === 'group_color');
  if (!hasDurationImageGroupColorColumn) {
    db.exec(`ALTER TABLE duration_images ADD COLUMN group_color TEXT`);
    console.log('Added group_color column to duration_images table');
  }

  // Migration: Add group_color column to videos table if it doesn't exist
  const videosColumnsUpdated = db.prepare("PRAGMA table_info(videos)").all() as { name: string }[];
  const hasVideoGroupColorColumn = videosColumnsUpdated.some(col => col.name === 'group_color');
  if (!hasVideoGroupColorColumn) {
    db.exec(`ALTER TABLE videos ADD COLUMN group_color TEXT`);
    console.log('Added group_color column to videos table');
  }

  // Migration: Add group_color column to duration_videos table if it doesn't exist
  const durationVideosColumnsUpdated = db.prepare("PRAGMA table_info(duration_videos)").all() as { name: string }[];
  const hasDurationVideoGroupColorColumn = durationVideosColumnsUpdated.some(col => col.name === 'group_color');
  if (!hasDurationVideoGroupColorColumn) {
    db.exec(`ALTER TABLE duration_videos ADD COLUMN group_color TEXT`);
    console.log('Added group_color column to duration_videos table');
  }

  // Migration: Add group_color column to audios table if it doesn't exist
  const audiosColumnsUpdated = db.prepare("PRAGMA table_info(audios)").all() as { name: string }[];
  const hasAudioGroupColorColumn = audiosColumnsUpdated.some(col => col.name === 'group_color');
  if (!hasAudioGroupColorColumn) {
    db.exec(`ALTER TABLE audios ADD COLUMN group_color TEXT`);
    console.log('Added group_color column to audios table');
  }

  // Migration: Add group_color column to duration_audios table if it doesn't exist
  const durationAudiosColumnsUpdated = db.prepare("PRAGMA table_info(duration_audios)").all() as { name: string }[];
  const hasDurationAudioGroupColorColumn = durationAudiosColumnsUpdated.some(col => col.name === 'group_color');
  if (!hasDurationAudioGroupColorColumn) {
    db.exec(`ALTER TABLE duration_audios ADD COLUMN group_color TEXT`);
    console.log('Added group_color column to duration_audios table');
  }

  // Create the stats view (drop and recreate to handle schema changes)
  db.exec(`
    DROP VIEW IF EXISTS topic_stats;

    CREATE VIEW topic_stats AS
    SELECT
      t.id,
      t.name,
      t.color,
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

  // Migration: Add pdf_path column to recordings table if it doesn't exist
  const recordingsColumnsForPdf = db.prepare("PRAGMA table_info(recordings)").all() as { name: string }[];
  const hasPdfPathColumn = recordingsColumnsForPdf.some(col => col.name === 'pdf_path');
  if (!hasPdfPathColumn) {
    db.exec(`ALTER TABLE recordings ADD COLUMN pdf_path TEXT`);
    console.log('Added pdf_path column to recordings table');
  }

  // Migration: Add page_offset column to recordings table if it doesn't exist
  const recordingsColumnsForOffset = db.prepare("PRAGMA table_info(recordings)").all() as { name: string }[];
  const hasPageOffsetColumn = recordingsColumnsForOffset.some(col => col.name === 'page_offset');
  if (!hasPageOffsetColumn) {
    db.exec(`ALTER TABLE recordings ADD COLUMN page_offset INTEGER DEFAULT 0`);
    console.log('Added page_offset column to recordings table');
  }

  // Migration: Add page_number column to durations table if it doesn't exist
  const durationsColumnsForPage = db.prepare("PRAGMA table_info(durations)").all() as { name: string }[];
  const hasPageNumberColumn = durationsColumnsForPage.some(col => col.name === 'page_number');
  if (!hasPageNumberColumn) {
    db.exec(`ALTER TABLE durations ADD COLUMN page_number INTEGER`);
    console.log('Added page_number column to durations table');
  }

  // Migration: Add screenshot metadata columns to duration_images table
  const diColumns = db.prepare("PRAGMA table_info(duration_images)").all() as { name: string }[];
  const diColumnNames = new Set(diColumns.map(c => c.name));
  if (!diColumnNames.has('page_number')) {
    db.exec(`ALTER TABLE duration_images ADD COLUMN page_number INTEGER`);
    console.log('Added page_number column to duration_images table');
  }
  if (!diColumnNames.has('rect_x')) {
    db.exec(`ALTER TABLE duration_images ADD COLUMN rect_x REAL`);
    db.exec(`ALTER TABLE duration_images ADD COLUMN rect_y REAL`);
    db.exec(`ALTER TABLE duration_images ADD COLUMN rect_w REAL`);
    db.exec(`ALTER TABLE duration_images ADD COLUMN rect_h REAL`);
    console.log('Added rect_x/y/w/h columns to duration_images table');
  }

  // Migration: Add audio_markers table if it doesn't exist
  const hasAudioMarkersTable = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='audio_markers'").get() as { name: string } | undefined) !== undefined;
  if (!hasAudioMarkersTable) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS audio_markers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        audio_id INTEGER NOT NULL,
        audio_type TEXT NOT NULL,
        marker_type TEXT NOT NULL,
        start_time REAL NOT NULL,
        end_time REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_audio_markers_audio ON audio_markers(audio_id, audio_type);
    `);
    console.log('Created audio_markers table');
  }

  // Migration: Add caption column to audio_markers table if it doesn't exist
  const audioMarkersColumns = db.prepare("PRAGMA table_info(audio_markers)").all() as { name: string }[];
  if (!audioMarkersColumns.some(col => col.name === 'caption')) {
    db.exec(`ALTER TABLE audio_markers ADD COLUMN caption TEXT`);
    console.log('Added caption column to audio_markers table');
  }

  // Migration: Add reader mode columns to recordings table
  const recordingsColumnsForReader = db.prepare("PRAGMA table_info(recordings)").all() as { name: string }[];
  const readerColumnNames = new Set(recordingsColumnsForReader.map(c => c.name));
  if (!readerColumnNames.has('book_data_path')) {
    db.exec(`ALTER TABLE recordings ADD COLUMN book_data_path TEXT`);
    console.log('Added book_data_path column to recordings table');
  }
  if (!readerColumnNames.has('reading_progress')) {
    db.exec(`ALTER TABLE recordings ADD COLUMN reading_progress REAL DEFAULT 0.0`);
    console.log('Added reading_progress column to recordings table');
  }
  if (!readerColumnNames.has('character_offset')) {
    db.exec(`ALTER TABLE recordings ADD COLUMN character_offset INTEGER DEFAULT 0`);
    console.log('Added character_offset column to recordings table');
  }
  if (!readerColumnNames.has('total_pages')) {
    db.exec(`ALTER TABLE recordings ADD COLUMN total_pages INTEGER`);
    console.log('Added total_pages column to recordings table');
  }
  if (!readerColumnNames.has('total_words')) {
    db.exec(`ALTER TABLE recordings ADD COLUMN total_words INTEGER`);
    console.log('Added total_words column to recordings table');
  }

  // Migration: Create image_audios table (audio clips attached to recording-level images)
  const imageAudiosTableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='image_audios'"
  ).get();

  if (!imageAudiosTableExists) {
    db.exec(`
      CREATE TABLE image_audios (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        image_id  INTEGER NOT NULL REFERENCES images(id) ON DELETE CASCADE,
        file_path TEXT NOT NULL,
        caption   TEXT,
        duration  REAL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_image_audios_image ON image_audios(image_id);
    `);
    console.log('Created image_audios table');
  }

  // Migration: Create tags and media_tags tables
  const tagsTableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='tags'"
  ).get();

  if (!tagsTableExists) {
    db.exec(`
      CREATE TABLE tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE media_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        media_type TEXT NOT NULL CHECK(media_type IN ('image','audio','duration_image','duration_audio')),
        media_id INTEGER NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tag_id, media_type, media_id)
      );

      CREATE INDEX idx_media_tags_tag ON media_tags(tag_id);
      CREATE INDEX idx_media_tags_media ON media_tags(media_type, media_id);
    `);
    console.log('Created tags and media_tags tables');
  }

  // Migration: Add last_searched_at column to tags table
  const tagsColumnsForSearch = db.prepare("PRAGMA table_info(tags)").all() as { name: string }[];
  if (!tagsColumnsForSearch.some(col => col.name === 'last_searched_at')) {
    db.exec(`ALTER TABLE tags ADD COLUMN last_searched_at DATETIME`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tags_last_searched ON tags(last_searched_at DESC)`);
    console.log('Added last_searched_at column to tags table');
  }

  // Migration: Remove restrictive CHECK constraint from media_tags so quick_capture types are allowed
  const mediaTagsSchema = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='media_tags'"
  ).get() as { sql: string } | undefined;
  if (mediaTagsSchema?.sql?.includes("CHECK(media_type IN")) {
    db.exec(`
      CREATE TABLE media_tags_new (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        tag_id     INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        media_type TEXT NOT NULL,
        media_id   INTEGER NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tag_id, media_type, media_id)
      );
      INSERT INTO media_tags_new SELECT * FROM media_tags;
      DROP TABLE media_tags;
      ALTER TABLE media_tags_new RENAME TO media_tags;
      CREATE INDEX idx_media_tags_tag   ON media_tags(tag_id);
      CREATE INDEX idx_media_tags_media ON media_tags(media_type, media_id);
    `);
    console.log('Migrated media_tags: removed CHECK constraint on media_type');
  }

  // Migration: Create quick_captures tables
  const quickCapturesTableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='quick_captures'"
  ).get();

  if (!quickCapturesTableExists) {
    db.exec(`
      CREATE TABLE quick_captures (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        note       TEXT,
        tags       TEXT NOT NULL DEFAULT '[]',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE quick_capture_images (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        capture_id     INTEGER NOT NULL REFERENCES quick_captures(id) ON DELETE CASCADE,
        file_path      TEXT NOT NULL,
        thumbnail_path TEXT,
        caption        TEXT,
        sort_order     INTEGER NOT NULL DEFAULT 0,
        created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_qc_images_capture ON quick_capture_images(capture_id);

      CREATE TABLE quick_capture_audios (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        capture_id INTEGER NOT NULL REFERENCES quick_captures(id) ON DELETE CASCADE,
        file_path  TEXT NOT NULL,
        duration   REAL,
        caption    TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_qc_audios_capture ON quick_capture_audios(capture_id);
    `);
    console.log('Created quick_captures tables');
  }

  // Migration: Create quick_capture_image_audios table
  const qcImageAudiosTableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='quick_capture_image_audios'"
  ).get();
  if (!qcImageAudiosTableExists) {
    db.exec(`
      CREATE TABLE quick_capture_image_audios (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        capture_image_id INTEGER NOT NULL REFERENCES quick_capture_images(id) ON DELETE CASCADE,
        file_path        TEXT NOT NULL,
        caption          TEXT,
        duration         REAL,
        sort_order       INTEGER NOT NULL DEFAULT 0,
        created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_qci_audios_image ON quick_capture_image_audios(capture_image_id);
    `);
    console.log('Created quick_capture_image_audios table');
  }

  // Migration: Create image_children table
  const imageChildrenTableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='image_children'"
  ).get();
  if (!imageChildrenTableExists) {
    db.exec(`
      CREATE TABLE image_children (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_type    TEXT NOT NULL,
        parent_id      INTEGER NOT NULL,
        file_path      TEXT NOT NULL,
        thumbnail_path TEXT,
        caption        TEXT,
        sort_order     INTEGER NOT NULL DEFAULT 0,
        created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_image_children_parent ON image_children(parent_type, parent_id);
    `);
    console.log('Created image_children table');
  }

  // Migration: Create image_child_audios table
  const imageChildAudiosTableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='image_child_audios'"
  ).get();
  if (!imageChildAudiosTableExists) {
    db.exec(`
      CREATE TABLE image_child_audios (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        image_child_id INTEGER NOT NULL REFERENCES image_children(id) ON DELETE CASCADE,
        file_path      TEXT NOT NULL,
        caption        TEXT,
        duration       REAL,
        sort_order     INTEGER NOT NULL DEFAULT 0,
        created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_image_child_audios_child ON image_child_audios(image_child_id);
    `);
    console.log('Created image_child_audios table');
  }

  // Migration: Create image_annotations table
  const imageAnnotationsTableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='image_annotations'"
  ).get();
  if (!imageAnnotationsTableExists) {
    db.exec(`
      CREATE TABLE image_annotations (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        image_type   TEXT    NOT NULL,
        image_id     INTEGER NOT NULL,
        ann_type     TEXT    NOT NULL,
        x1           REAL    NOT NULL,
        y1           REAL    NOT NULL,
        x2           REAL    NOT NULL,
        y2           REAL    NOT NULL,
        color        TEXT    NOT NULL DEFAULT '#ef4444',
        stroke_width REAL    NOT NULL DEFAULT 0.5,
        created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_image_annotations_image ON image_annotations(image_type, image_id);
    `);
    console.log('Created image_annotations table');
  }

  // Migration: Add caption2 column (OCR text, search-only) to all image tables
  const imagesCols2 = db.prepare("PRAGMA table_info(images)").all() as { name: string }[];
  if (!imagesCols2.some(c => c.name === 'caption2')) {
    db.exec('ALTER TABLE images ADD COLUMN caption2 TEXT');
    console.log('Added caption2 column to images table');
  }

  const diCols2 = db.prepare("PRAGMA table_info(duration_images)").all() as { name: string }[];
  if (!diCols2.some(c => c.name === 'caption2')) {
    db.exec('ALTER TABLE duration_images ADD COLUMN caption2 TEXT');
    console.log('Added caption2 column to duration_images table');
  }

  const qciCols2 = db.prepare("PRAGMA table_info(quick_capture_images)").all() as { name: string }[];
  if (!qciCols2.some(c => c.name === 'caption2')) {
    db.exec('ALTER TABLE quick_capture_images ADD COLUMN caption2 TEXT');
    console.log('Added caption2 column to quick_capture_images table');
  }

  const icCols2 = db.prepare("PRAGMA table_info(image_children)").all() as { name: string }[];
  if (!icCols2.some(c => c.name === 'caption2')) {
    db.exec('ALTER TABLE image_children ADD COLUMN caption2 TEXT');
    console.log('Added caption2 column to image_children table');
  }

  // Migration: Create image_color_assignments table (many-to-many: image ↔ color label)
  // NOTE: superseded by media_color_assignments below — kept so the guard runs on fresh DBs too
  const imageColorAssignmentsTableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='image_color_assignments'"
  ).get();
  if (!imageColorAssignmentsTableExists) {
    db.exec(`
      CREATE TABLE image_color_assignments (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        image_type TEXT NOT NULL CHECK(image_type IN ('image','duration_image','quick_capture_image','image_child')),
        image_id   INTEGER NOT NULL,
        color_key  TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(image_type, image_id, color_key)
      );
      CREATE INDEX idx_image_color_type_id ON image_color_assignments(image_type, image_id);
    `);
    console.log('Created image_color_assignments table');
  }

  // Migration: Rename image_color_assignments → media_color_assignments (generalised for all media types)
  const mediaColorAssignmentsTableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='media_color_assignments'"
  ).get();
  if (!mediaColorAssignmentsTableExists) {
    db.exec(`
      CREATE TABLE media_color_assignments (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        media_type TEXT NOT NULL,
        media_id   INTEGER NOT NULL,
        color_key  TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(media_type, media_id, color_key)
      );
      CREATE INDEX idx_media_color_type_id ON media_color_assignments(media_type, media_id);
    `);
    // Copy any existing data from the old table
    const oldExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='image_color_assignments'"
    ).get();
    if (oldExists) {
      db.exec(`
        INSERT INTO media_color_assignments (id, media_type, media_id, color_key, created_at)
          SELECT id, image_type, image_id, color_key, created_at FROM image_color_assignments;
        DROP TABLE image_color_assignments;
      `);
    }
    console.log('Created media_color_assignments table (generalised from image_color_assignments)');
  }

  // Migration: Add canvas_file_path to recordings
  const recCols = db.prepare("PRAGMA table_info(recordings)").all() as { name: string }[];
  if (!recCols.some(c => c.name === 'canvas_file_path')) {
    db.exec("ALTER TABLE recordings ADD COLUMN canvas_file_path TEXT");
    console.log('Added canvas_file_path to recordings');
  }

  // Migration: Add canvas_file_path to durations
  const durCols = db.prepare("PRAGMA table_info(durations)").all() as { name: string }[];
  if (!durCols.some(c => c.name === 'canvas_file_path')) {
    db.exec("ALTER TABLE durations ADD COLUMN canvas_file_path TEXT");
    console.log('Added canvas_file_path to durations');
  }

  // Migration: Create recording_plans table
  const recordingPlansExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='recording_plans'"
  ).get();
  if (!recordingPlansExists) {
    db.exec(`
      CREATE TABLE recording_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recording_id INTEGER NOT NULL,
        plan_date TEXT NOT NULL,
        text TEXT NOT NULL,
        completed INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_recording_plans_recording ON recording_plans(recording_id);
    `);
    console.log('Created recording_plans table');
  }

  // Migration: Create duration_plans table
  const durationPlansExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='duration_plans'"
  ).get();
  if (!durationPlansExists) {
    db.exec(`
      CREATE TABLE duration_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        duration_id INTEGER NOT NULL,
        plan_date TEXT NOT NULL,
        text TEXT NOT NULL,
        completed INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (duration_id) REFERENCES durations(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_duration_plans_duration ON duration_plans(duration_id);
    `);
    console.log('Created duration_plans table');
  }

  // Migration: Create study_sessions table
  const studySessionsExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='study_sessions'"
  ).get();
  if (!studySessionsExists) {
    db.exec(`
      CREATE TABLE study_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        total_seconds INTEGER DEFAULT 0
      );
    `);
    console.log('Created study_sessions table');
  }

  // Migration: Create study_events table
  const studyEventsExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='study_events'"
  ).get();
  if (!studyEventsExists) {
    db.exec(`
      CREATE TABLE study_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        topic_id INTEGER,
        topic_name TEXT,
        recording_id INTEGER,
        recording_name TEXT,
        duration_id INTEGER,
        duration_caption TEXT,
        resource_id INTEGER,
        resource_type TEXT,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        seconds INTEGER DEFAULT 0,
        source TEXT DEFAULT 'direct'
      );
      CREATE INDEX idx_study_events_session ON study_events(session_id);
      CREATE INDEX idx_study_events_recording ON study_events(recording_id);
      CREATE INDEX idx_study_events_topic ON study_events(topic_id);
    `);
    console.log('Created study_events table');
  }

  // Migration: Create study_idle_logs table
  const studyIdleLogsExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='study_idle_logs'"
  ).get();
  if (!studyIdleLogsExists) {
    db.exec(`
      CREATE TABLE study_idle_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
        detected_at TEXT NOT NULL,
        idle_seconds INTEGER NOT NULL,
        credited_seconds INTEGER NOT NULL
      );
    `);
    console.log('Created study_idle_logs table');
  }

  // Migration: Create calendar_todos table
  const calendarTodosExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='calendar_todos'"
  ).get();
  if (!calendarTodosExists) {
    db.exec(`
      CREATE TABLE calendar_todos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_date TEXT NOT NULL,
        text TEXT NOT NULL,
        completed INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_calendar_todos_date ON calendar_todos(plan_date);
    `);
    console.log('Created calendar_todos table');
  }

  // Migration: Create obs_staged_marks table
  const obsStagedMarksExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='obs_staged_marks'"
  ).get();
  if (!obsStagedMarksExists) {
    db.exec(`
      CREATE TABLE obs_staged_marks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        start_time REAL NOT NULL,
        end_time REAL NOT NULL,
        caption TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Created obs_staged_marks table');
  }

  // Migration: Create obs_ghost_marks table
  const obsGhostMarksExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='obs_ghost_marks'"
  ).get();
  if (!obsGhostMarksExists) {
    db.exec(`
      CREATE TABLE obs_ghost_marks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        start_time REAL NOT NULL,
        end_time REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Created obs_ghost_marks table');
  }

  // Migration: Add source_video_id to durations
  const durColsForVideo = db.prepare("PRAGMA table_info(durations)").all() as { name: string }[];
  if (!durColsForVideo.some(c => c.name === 'source_video_id')) {
    db.exec("ALTER TABLE durations ADD COLUMN source_video_id INTEGER REFERENCES videos(id) ON DELETE SET NULL");
    console.log('Added source_video_id to durations');
  }
  if (!durColsForVideo.some(c => c.name === 'source_duration_video_id')) {
    db.exec("ALTER TABLE durations ADD COLUMN source_duration_video_id INTEGER REFERENCES duration_videos(id) ON DELETE SET NULL");
    console.log('Added source_duration_video_id to durations');
  }
  if (!durColsForVideo.some(c => c.name === 'is_video_mark')) {
    db.exec("ALTER TABLE durations ADD COLUMN is_video_mark INTEGER DEFAULT 0");
    console.log('Added is_video_mark to durations');
  }
  if (!durColsForVideo.some(c => c.name === 'is_ghost_mark')) {
    db.exec("ALTER TABLE durations ADD COLUMN is_ghost_mark INTEGER DEFAULT 0");
    console.log('Added is_ghost_mark to durations');
  }
  // Backfill: any mark created via OBS video assignment before is_ghost_mark existed gets the flag
  db.exec("UPDATE durations SET is_ghost_mark = 1 WHERE is_video_mark = 1 AND is_ghost_mark = 0");


  // Migration: Change source_video_id / source_duration_video_id FKs from SET NULL → CASCADE
  // SQLite requires a full table rebuild to change FK constraints.
  const durFkList = db.prepare("PRAGMA foreign_key_list(durations)").all() as { from: string; on_delete: string }[];
  const srcVideoFk = durFkList.find(fk => fk.from === 'source_video_id');
  if (!srcVideoFk || srcVideoFk.on_delete !== 'CASCADE') {
    db.pragma('foreign_keys = OFF');
    db.transaction(() => {
      db.exec(`
        CREATE TABLE durations_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          recording_id INTEGER NOT NULL,
          start_time REAL NOT NULL,
          end_time REAL NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          note TEXT,
          color TEXT,
          group_color TEXT,
          sort_order INTEGER DEFAULT 0,
          page_number INTEGER,
          canvas_file_path TEXT,
          source_video_id INTEGER REFERENCES videos(id) ON DELETE CASCADE,
          source_duration_video_id INTEGER REFERENCES duration_videos(id) ON DELETE CASCADE,
          is_video_mark INTEGER DEFAULT 0,
          FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE
        );
        INSERT INTO durations_new SELECT * FROM durations;
        DROP TABLE durations;
        ALTER TABLE durations_new RENAME TO durations;
        CREATE INDEX IF NOT EXISTS idx_durations_recording ON durations(recording_id);
      `);
    })();
    db.pragma('foreign_keys = ON');
    console.log('Rebuilt durations table: source_video_id/source_duration_video_id now ON DELETE CASCADE');
  }

  // Migration: review_items and review_masks (spaced repetition)
  const reviewItemsExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='review_items'"
  ).get();
  if (!reviewItemsExists) {
    db.exec(`
      CREATE TABLE review_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        media_type TEXT NOT NULL,
        media_id INTEGER NOT NULL,
        file_path TEXT,
        thumbnail_path TEXT,
        caption TEXT,
        recording_id INTEGER,
        capture_id INTEGER,
        interval_days REAL NOT NULL DEFAULT 1,
        ease_factor REAL NOT NULL DEFAULT 2.5,
        repetitions INTEGER NOT NULL DEFAULT 0,
        next_review_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_review_items_next_review ON review_items(next_review_at);
    `);
    console.log('Created review_items table');
  } else {
    const riCols = (db.prepare("PRAGMA table_info(review_items)").all() as { name: string }[]).map(c => c.name);

    // Fix: if a previous migration renamed review_items → review_items_old, SQLite may have
    // auto-updated review_masks's FK to point at review_items_old (now dropped).
    // Detect this and rebuild review_masks with the correct FK.
    const masksDdl = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='review_masks'"
    ).get() as { sql: string } | undefined;
    if (masksDdl?.sql?.includes('review_items_old')) {
      db.pragma('foreign_keys = OFF');
      db.pragma('legacy_alter_table = ON');
      db.exec('ALTER TABLE review_masks RENAME TO review_masks_broken');
      db.pragma('legacy_alter_table = OFF');
      db.exec(`
        CREATE TABLE review_masks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          review_item_id INTEGER NOT NULL REFERENCES review_items(id) ON DELETE CASCADE,
          x REAL NOT NULL,
          y REAL NOT NULL,
          w REAL NOT NULL,
          h REAL NOT NULL,
          pixelation_level INTEGER NOT NULL DEFAULT 3,
          hint_text TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      db.exec('INSERT INTO review_masks SELECT * FROM review_masks_broken');
      db.exec('DROP TABLE review_masks_broken');
      db.exec('CREATE INDEX IF NOT EXISTS idx_review_masks_item ON review_masks(review_item_id)');
      db.pragma('foreign_keys = ON');
      console.log('Rebuilt review_masks with corrected FK reference');
    }

    if (riCols.includes('image_type')) {
      // Old schema — rebuild using legacy_alter_table so SQLite does NOT auto-update
      // FK references in child tables (review_masks) during the rename.
      const mediaTypeExpr = riCols.includes('media_type') ? 'media_type' : (riCols.includes('image_type') ? 'image_type' : "'image'");
      const mediaIdExpr   = riCols.includes('media_id')   ? 'media_id'   : (riCols.includes('image_id')   ? 'image_id'   : '0');
      const filePathExpr  = riCols.includes('file_path')  ? 'file_path'  : 'NULL';
      const thumbExpr     = riCols.includes('thumbnail_path') ? 'thumbnail_path' : 'NULL';
      const captionExpr   = riCols.includes('caption')    ? 'caption'    : 'NULL';
      const recIdExpr     = riCols.includes('recording_id') ? 'recording_id' : 'NULL';
      const capIdExpr     = riCols.includes('capture_id') ? 'capture_id' : 'NULL';
      const createdExpr   = riCols.includes('created_at') ? "COALESCE(created_at, datetime('now'))" : "datetime('now')";
      const updatedExpr   = riCols.includes('updated_at') ? "COALESCE(updated_at, datetime('now'))" : "datetime('now')";

      db.pragma('foreign_keys = OFF');
      db.pragma('legacy_alter_table = ON');
      db.exec('ALTER TABLE review_items RENAME TO review_items_old');
      db.pragma('legacy_alter_table = OFF');
      db.exec(`
        CREATE TABLE review_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          media_type TEXT NOT NULL,
          media_id INTEGER NOT NULL,
          file_path TEXT,
          thumbnail_path TEXT,
          caption TEXT,
          recording_id INTEGER,
          capture_id INTEGER,
          interval_days REAL NOT NULL DEFAULT 1,
          ease_factor REAL NOT NULL DEFAULT 2.5,
          repetitions INTEGER NOT NULL DEFAULT 0,
          next_review_at TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      db.exec(`
        INSERT INTO review_items
          (id, media_type, media_id, file_path, thumbnail_path, caption,
           recording_id, capture_id, interval_days, ease_factor, repetitions,
           next_review_at, created_at, updated_at)
        SELECT id, ${mediaTypeExpr}, ${mediaIdExpr}, ${filePathExpr}, ${thumbExpr}, ${captionExpr},
               ${recIdExpr}, ${capIdExpr}, interval_days, ease_factor, repetitions,
               next_review_at, ${createdExpr}, ${updatedExpr}
        FROM review_items_old
      `);
      db.exec('DROP TABLE review_items_old');
      db.exec('CREATE INDEX IF NOT EXISTS idx_review_items_next_review ON review_items(next_review_at)');
      db.pragma('foreign_keys = ON');
      console.log('Rebuilt review_items table with new schema');
    } else {
      // Already new schema — add any columns still missing
      if (!riCols.includes('file_path'))      db.exec("ALTER TABLE review_items ADD COLUMN file_path TEXT");
      if (!riCols.includes('thumbnail_path')) db.exec("ALTER TABLE review_items ADD COLUMN thumbnail_path TEXT");
      if (!riCols.includes('caption'))        db.exec("ALTER TABLE review_items ADD COLUMN caption TEXT");
      if (!riCols.includes('recording_id'))   db.exec("ALTER TABLE review_items ADD COLUMN recording_id INTEGER");
      if (!riCols.includes('capture_id'))     db.exec("ALTER TABLE review_items ADD COLUMN capture_id INTEGER");
      if (!riCols.includes('created_at'))     db.exec("ALTER TABLE review_items ADD COLUMN created_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z'");
      if (!riCols.includes('updated_at'))     db.exec("ALTER TABLE review_items ADD COLUMN updated_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z'");
    }
  }

  const reviewMasksExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='review_masks'"
  ).get();
  if (!reviewMasksExists) {
    db.exec(`
      CREATE TABLE review_masks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        review_item_id INTEGER NOT NULL REFERENCES review_items(id) ON DELETE CASCADE,
        x REAL NOT NULL,
        y REAL NOT NULL,
        w REAL NOT NULL,
        h REAL NOT NULL,
        pixelation_level INTEGER NOT NULL DEFAULT 3,
        hint_text TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_review_masks_item ON review_masks(review_item_id);
    `);
    console.log('Created review_masks table');
  }

  // Migration: FSRS scheduler fields on review_items (Echo).
  // NULL stability/difficulty/last_review_at ⇒ item predates FSRS: it is treated as a
  // fresh createEmptyCard() on its next review while its existing next_review_at is kept.
  {
    const riCols = (db.prepare("PRAGMA table_info(review_items)").all() as { name: string }[]).map(c => c.name);
    if (!riCols.includes('stability'))       db.exec("ALTER TABLE review_items ADD COLUMN stability REAL");
    if (!riCols.includes('difficulty'))      db.exec("ALTER TABLE review_items ADD COLUMN difficulty REAL");
    if (!riCols.includes('state'))           db.exec("ALTER TABLE review_items ADD COLUMN state INTEGER NOT NULL DEFAULT 0");
    if (!riCols.includes('scheduled_days'))  db.exec("ALTER TABLE review_items ADD COLUMN scheduled_days INTEGER NOT NULL DEFAULT 0");
    if (!riCols.includes('learning_steps'))  db.exec("ALTER TABLE review_items ADD COLUMN learning_steps INTEGER NOT NULL DEFAULT 0");
    if (!riCols.includes('lapses'))          db.exec("ALTER TABLE review_items ADD COLUMN lapses INTEGER NOT NULL DEFAULT 0");
    if (!riCols.includes('last_review_at'))  db.exec("ALTER TABLE review_items ADD COLUMN last_review_at TEXT");
    console.log('Ensured FSRS columns on review_items');
  }

  // Migration: review_events (Echo) — one row per actual review.
  // Backbone of the history/backlog, the calendar heatmap (GROUP BY date(reviewed_at,'localtime')),
  // the per-review reflective note, and future FSRS parameter optimization.
  const reviewEventsExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='review_events'"
  ).get();
  if (!reviewEventsExists) {
    db.exec(`
      CREATE TABLE review_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        review_item_id INTEGER NOT NULL REFERENCES review_items(id) ON DELETE CASCADE,
        reviewed_at TEXT NOT NULL,
        rating INTEGER,
        scheduling_mode TEXT,
        stability_before REAL,
        stability_after REAL,
        difficulty_before REAL,
        difficulty_after REAL,
        state_before INTEGER,
        state_after INTEGER,
        elapsed_days INTEGER,
        scheduled_days INTEGER,
        interval_before REAL,
        interval_after REAL,
        next_review_at TEXT,
        note TEXT,
        missed_points TEXT,
        duration_seconds INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_review_events_item ON review_events(review_item_id);
      CREATE INDEX idx_review_events_reviewed_at ON review_events(reviewed_at);
    `);
    console.log('Created review_events table');
  }

  // Migration: review_presets (Echo) — user-editable manual reschedule presets.
  const reviewPresetsExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='review_presets'"
  ).get();
  if (!reviewPresetsExists) {
    db.exec(`
      CREATE TABLE review_presets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL,
        days INTEGER NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
    `);
    const seed = db.prepare('INSERT INTO review_presets (label, days, sort_order) VALUES (?, ?, ?)');
    [['1 day', 1], ['3 days', 3], ['5 days', 5], ['1 week', 7], ['2 weeks', 14], ['1 month', 30], ['3 months', 90]]
      .forEach(([label, days], i) => seed.run(label, days, i));
    console.log('Created review_presets table (seeded defaults)');
  }

  // Migration: Add color + caption columns to obs_ghost_marks
  const ghostMarkCols = db.prepare("PRAGMA table_info(obs_ghost_marks)").all() as { name: string }[];
  if (!ghostMarkCols.some(c => c.name === 'color')) {
    db.exec("ALTER TABLE obs_ghost_marks ADD COLUMN color TEXT");
    console.log('Added color to obs_ghost_marks');
  }
  if (!ghostMarkCols.some(c => c.name === 'caption')) {
    db.exec("ALTER TABLE obs_ghost_marks ADD COLUMN caption TEXT");
    console.log('Added caption to obs_ghost_marks');
  }

  // Migration: Create html_nodes table (recording-level HTML/PDF attachments)
  const htmlNodesExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='html_nodes'"
  ).get();
  if (!htmlNodesExists) {
    db.exec(`
      CREATE TABLE html_nodes (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        recording_id INTEGER NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
        file_path    TEXT NOT NULL,
        title        TEXT,
        file_type    TEXT NOT NULL DEFAULT 'html',
        sort_order   INTEGER DEFAULT 0,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_html_nodes_recording ON html_nodes(recording_id);
    `);
    console.log('Created html_nodes table');
  }

  // Migration: Create duration_html_nodes table (duration-level HTML/PDF attachments)
  const durationHtmlNodesExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='duration_html_nodes'"
  ).get();
  if (!durationHtmlNodesExists) {
    db.exec(`
      CREATE TABLE duration_html_nodes (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        duration_id INTEGER NOT NULL REFERENCES durations(id) ON DELETE CASCADE,
        file_path   TEXT NOT NULL,
        title       TEXT,
        file_type   TEXT NOT NULL DEFAULT 'html',
        sort_order  INTEGER DEFAULT 0,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_duration_html_nodes_duration ON duration_html_nodes(duration_id);
    `);
    console.log('Created duration_html_nodes table');
  }

  // Migration: Create image_view_state table (persists zoom + pan per image)
  const ivs = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='image_view_state'"
  ).get();
  if (!ivs) {
    db.exec(`
      CREATE TABLE image_view_state (
        image_type  TEXT    NOT NULL,
        image_id    INTEGER NOT NULL,
        scale       REAL    NOT NULL DEFAULT 1,
        translate_x REAL    NOT NULL DEFAULT 0,
        translate_y REAL    NOT NULL DEFAULT 0,
        updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        PRIMARY KEY (image_type, image_id)
      );
    `);
    console.log('Created image_view_state table');
  }

  // Orphaned media_tags purge (self-healing, runs every startup).
  // media_tags is polymorphic (media_type, media_id) with a FK only on tag_id — nothing
  // cascades from media_id, so deleting/expiring a tagged media row (most visibly the 7-day
  // quick-capture TTL sweep) leaves its tag associations behind. Those orphans inflate the
  // "Count" column (COUNT over media_tags) above the items actually shown (getItemsByTag
  // inner-joins the real media table and drops them) — the anı 12-vs-2 bug. Delete-time
  // cleanup (deleteMediaTags in operations.ts) prevents new orphans; this block heals any
  // that already exist or slip through a missed delete path. Idempotent: a no-op once clean.
  {
    // media_type -> owning table. Keep in sync with MediaTagType in src/types/index.ts.
    // ⚠️ This map is also the allow-list for the "unknown media_type" purge below, which HARD
    // DELETES any media_tags row whose type is absent here. Two consequences: (1) a new tagged
    // media type must be added here in the SAME build that starts writing its tags, or the next
    // startup silently erases them; (2) running an OLDER build after tagging a NEWER type erases
    // that type's tags on launch. Tags are user-authored — see NFR-04 and ADR-0004.
    const mediaTagTables: Record<string, string> = {
      image: 'images',
      duration_image: 'duration_images',
      audio: 'audios',
      duration_audio: 'duration_audios',
      quick_capture_image: 'quick_capture_images',
      quick_capture_audio: 'quick_capture_audios',
      image_child: 'image_children',
      image_audio: 'image_audios',
      duration_image_audio: 'duration_image_audios',
      quick_capture_image_audio: 'quick_capture_image_audios',
      image_child_audio: 'image_child_audios',
      video: 'videos',
      duration_video: 'duration_videos',
      html_node: 'html_nodes',
      duration_html_node: 'duration_html_nodes',
      review_note_image: 'review_note_images',
    };
    let purged = 0;
    for (const [mediaType, table] of Object.entries(mediaTagTables)) {
      // Skip types whose owning table doesn't exist in this DB (defensive).
      const tableExists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
      ).get(table);
      if (!tableExists) continue;
      const res = db.prepare(
        `DELETE FROM media_tags
          WHERE media_type = ?
            AND media_id NOT IN (SELECT id FROM ${table})`
      ).run(mediaType);
      purged += res.changes;
    }
    // Also purge associations whose media_type isn't a known type at all (data drift).
    const knownTypes = Object.keys(mediaTagTables);
    const placeholders = knownTypes.map(() => '?').join(', ');
    const resUnknown = db.prepare(
      `DELETE FROM media_tags WHERE media_type NOT IN (${placeholders})`
    ).run(...knownTypes);
    purged += resUnknown.changes;
    if (purged > 0) console.log(`Purged ${purged} orphaned media_tags rows`);
  }

  // Migration: review_notes — many reflective notes per review, instead of the single
  // `review_events.note` / `.missed_points` columns.
  //
  // A note is written the moment the user presses Enter, before any rating exists, so
  // `review_event_id` is NULL until the card is rated (then the session links them).
  // That is what lets notes survive arrow-key navigation and abandoned cards.
  //
  // The legacy `review_events.note` / `.missed_points` columns are backfilled into this
  // table once, then frozen: never read, never written again. They are left in place as a
  // recovery copy rather than dropped (see ADR-0004 — we do not destroy user-authored content).
  const reviewNotesExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='review_notes'"
  ).get();
  if (!reviewNotesExists) {
    db.exec(`
      CREATE TABLE review_notes (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        review_item_id  INTEGER NOT NULL REFERENCES review_items(id) ON DELETE CASCADE,
        review_event_id INTEGER REFERENCES review_events(id) ON DELETE CASCADE,
        kind            TEXT NOT NULL CHECK(kind IN ('note','missed')),
        body            TEXT NOT NULL,
        sort_order      INTEGER NOT NULL DEFAULT 0,
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_review_notes_item  ON review_notes(review_item_id);
      CREATE INDEX idx_review_notes_event ON review_notes(review_event_id);
    `);

    // Backfill: one row per non-empty legacy note / missed_points value.
    const legacy = db.prepare(`
      SELECT id, review_item_id, note, missed_points
      FROM review_events
      WHERE (note IS NOT NULL AND trim(note) <> '')
         OR (missed_points IS NOT NULL AND trim(missed_points) <> '')
    `).all() as { id: number; review_item_id: number; note: string | null; missed_points: string | null }[];

    const insertNote = db.prepare(`
      INSERT INTO review_notes (review_item_id, review_event_id, kind, body, sort_order)
      VALUES (?, ?, ?, ?, 0)
    `);
    let backfilled = 0;
    db.transaction(() => {
      for (const row of legacy) {
        if (row.note && row.note.trim()) {
          insertNote.run(row.review_item_id, row.id, 'note', row.note.trim());
          backfilled++;
        }
        if (row.missed_points && row.missed_points.trim()) {
          insertNote.run(row.review_item_id, row.id, 'missed', row.missed_points.trim());
          backfilled++;
        }
      }
    })();
    console.log(`Created review_notes table (backfilled ${backfilled} notes from ${legacy.length} events)`);
  }

  // Migration: review_note_images — pictures attached to a reflective review note.
  // Tags, OCR and FTS are wired up (ADR-0007, superseding ADR-0006's "lightweight" scope).
  // NOTE: rows cascade with the note, but the FILES on disk do not. Every delete path
  // (note / event / review item) must collect file_path first and unlink — see handlers.ts.
  const reviewNoteImagesExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='review_note_images'"
  ).get();
  if (!reviewNoteImagesExists) {
    db.exec(`
      CREATE TABLE review_note_images (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        review_note_id INTEGER NOT NULL REFERENCES review_notes(id) ON DELETE CASCADE,
        file_path      TEXT NOT NULL,
        thumbnail_path TEXT,
        caption        TEXT,
        caption2       TEXT,
        sort_order     INTEGER NOT NULL DEFAULT 0,
        created_at     TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_review_note_images_note ON review_note_images(review_note_id);
    `);
    console.log('Created review_note_images table');
  }

  // Migration: caption2 (OCR text, search-only) on review_note_images.
  // Deliberately NOT grouped with the other four caption2 guards above — those run before
  // review_note_images is created, so a PRAGMA there returns no columns on a fresh DB and the
  // ALTER would hit a nonexistent table. Must stay after the CREATE above.
  const rniCols2 = db.prepare("PRAGMA table_info(review_note_images)").all() as { name: string }[];
  if (!rniCols2.some(c => c.name === 'caption2')) {
    db.exec('ALTER TABLE review_note_images ADD COLUMN caption2 TEXT');
    console.log('Added caption2 column to review_note_images table');
  }

  // Migration: review_note_audios — voice notes attached to a reflective review note.
  // Same shape and same contract as review_note_images: rows cascade with the note, the FILES on
  // disk do NOT, so every delete path (note / event / review item) must collect file_path first
  // and unlink — see audioPathsForNotes in operations.ts and unlinkAll in handlers.ts.
  // No media_tags / OCR / FTS: audio carries no text to index (contrast review_note_images).
  const reviewNoteAudiosExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='review_note_audios'"
  ).get();
  if (!reviewNoteAudiosExists) {
    db.exec(`
      CREATE TABLE review_note_audios (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        review_note_id INTEGER NOT NULL REFERENCES review_notes(id) ON DELETE CASCADE,
        file_path      TEXT NOT NULL,
        duration       REAL,
        sort_order     INTEGER NOT NULL DEFAULT 0,
        created_at     TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_review_note_audios_note ON review_note_audios(review_note_id);
    `);
    console.log('Created review_note_audios table');
  }

  // Migration: review_code_snippets — one scratch code pad per enrolled card (ADR-0009).
  // Anchored to review_item_id, not review_note_id: a review_note row only exists once the user
  // presses Enter, and there are many per card, so there is no single note to hang code off.
  // UNIQUE(review_item_id) enforces "one pad per card" in the schema rather than by convention,
  // so the upsert below cannot silently create a second row.
  const reviewCodeSnippetsExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='review_code_snippets'"
  ).get();
  if (!reviewCodeSnippetsExists) {
    db.exec(`
      CREATE TABLE review_code_snippets (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        review_item_id INTEGER NOT NULL UNIQUE REFERENCES review_items(id) ON DELETE CASCADE,
        language       TEXT NOT NULL DEFAULT 'java',
        code           TEXT NOT NULL DEFAULT '',
        created_at     TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_review_code_snippets_item ON review_code_snippets(review_item_id);
    `);
    console.log('Created review_code_snippets table');
  }

  // Migration: archive support for quick captures.
  // Archiving hides a capture from the Capture board WITHOUT deleting anything —
  // rows, files, tags and FTS entries all stay. NULL = on the board, timestamp = archived.
  const qcCols = db.prepare("PRAGMA table_info(quick_captures)").all() as { name: string }[];
  if (!qcCols.some(c => c.name === 'archived_at')) {
    db.exec('ALTER TABLE quick_captures ADD COLUMN archived_at DATETIME');
    console.log('Added archived_at column to quick_captures table');
  }

  // Migration: Echo source context — which QUESTION an echo card came from (ADR-0010).
  //
  // An echo is a masked screenshot of one insight. Stripped of its origin it is unreviewable:
  // "growing the window only ever helps" means nothing if you can't remember it was about
  // Minimum Window Substring. review_items already carried a coarse recording_id, but the MARK
  // (a `durations` row — the unit that actually holds one question) was never stored, even though
  // the enroll call site had it in scope and dropped it.
  //
  //   review_items.duration_id     — the mark this echo came from.
  //   durations.question_image_id  — ONE image on a mark designated as its question/prompt, so
  //                                  every echo from that mark inherits the context for free.
  //
  // question_image_id is a plain INTEGER, deliberately NOT a declared FK: every reader LEFT JOINs
  // duration_images, so an image deleted out from under it degrades to "no question image" rather
  // than depending on the foreign_keys pragma being on to avoid a dangling reference.
  {
    const riCols = (db.prepare("PRAGMA table_info(review_items)").all() as { name: string }[]).map(c => c.name);
    if (!riCols.includes('duration_id')) {
      db.exec('ALTER TABLE review_items ADD COLUMN duration_id INTEGER');
      db.exec('CREATE INDEX IF NOT EXISTS idx_review_items_duration ON review_items(duration_id)');

      // Backfill 1 — a duration_image echo IS an image on a mark. The link was always derivable
      // through duration_images.duration_id; Echo simply never made the join. This recovers the
      // mark for every echo enrolled before this migration, so nothing needs re-enrolling.
      db.exec(`
        UPDATE review_items
        SET    duration_id = (
                 SELECT di.duration_id FROM duration_images di WHERE di.id = review_items.media_id
               )
        WHERE  media_type = 'duration_image'
      `);

      // Backfill 2 — an image_child echo whose PARENT is a mark image ("Related images" in the
      // lightbox). These were the worst case: enrolled with recording_id AND capture_id both NULL,
      // so they showed no breadcrumb and no "Go to original" button at all.
      db.exec(`
        UPDATE review_items
        SET    duration_id = (
                 SELECT di.duration_id
                 FROM   image_children ic
                 JOIN   duration_images di ON di.id = ic.parent_id
                 WHERE  ic.id = review_items.media_id AND ic.parent_type = 'duration_image'
               )
        WHERE  media_type = 'image_child'
      `);

      // Backfill 3 — repair the recording_id those orphans never got, now that the mark is known.
      db.exec(`
        UPDATE review_items
        SET    recording_id = (SELECT d.recording_id FROM durations d WHERE d.id = review_items.duration_id)
        WHERE  recording_id IS NULL AND duration_id IS NOT NULL
      `);

      // Backfill 4 — child echoes hanging off a RECORDING-level image have no mark, but they do
      // have a recording. Partial origin beats none.
      db.exec(`
        UPDATE review_items
        SET    recording_id = (
                 SELECT i.recording_id
                 FROM   image_children ic
                 JOIN   images i ON i.id = ic.parent_id
                 WHERE  ic.id = review_items.media_id AND ic.parent_type = 'image'
               )
        WHERE  recording_id IS NULL AND media_type = 'image_child'
      `);

      // Backfill 5 — a recording-level image echo enrolled without its recording_id. No mark to
      // find (these images don't live on one), but the recording is recoverable from the image.
      db.exec(`
        UPDATE review_items
        SET    recording_id = (SELECT i.recording_id FROM images i WHERE i.id = review_items.media_id)
        WHERE  recording_id IS NULL AND media_type = 'image'
      `);

      const linked = db.prepare(
        'SELECT COUNT(*) AS n FROM review_items WHERE duration_id IS NOT NULL'
      ).get() as { n: number };
      const total = db.prepare('SELECT COUNT(*) AS n FROM review_items').get() as { n: number };
      console.log(`Added duration_id to review_items — backfilled ${linked.n}/${total.n} echo(es) to their mark`);
    }

    const durCols = (db.prepare("PRAGMA table_info(durations)").all() as { name: string }[]).map(c => c.name);
    if (!durCols.includes('question_image_id')) {
      db.exec('ALTER TABLE durations ADD COLUMN question_image_id INTEGER');
      console.log('Added question_image_id column to durations table');
    }

    // A mark can have MORE THAN ONE question image — a problem statement plus its constraints, or
    // two screenshots of one long prompt. So the designation moved from a single pointer on the
    // mark (`durations.question_image_id`) to a flag on each image. That column is now LEGACY: it
    // is backfilled from below and no longer read anywhere. Left in place rather than dropped so a
    // downgrade to an older build still finds its question image.
    const diCols = (db.prepare("PRAGMA table_info(duration_images)").all() as { name: string }[]).map(c => c.name);
    if (!diCols.includes('is_question')) {
      db.exec('ALTER TABLE duration_images ADD COLUMN is_question INTEGER DEFAULT 0');
      db.exec(`
        UPDATE duration_images
        SET    is_question = 1
        WHERE  id IN (SELECT question_image_id FROM durations WHERE question_image_id IS NOT NULL)
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_duration_images_question ON duration_images(duration_id, is_question)');
      const n = db.prepare('SELECT COUNT(*) AS n FROM duration_images WHERE is_question = 1').get() as { n: number };
      console.log(`Added is_question to duration_images — carried over ${n.n} question image(s)`);
    }
  }

  // Migration: item-level Echo side content — texts + voice recordings on the CARD itself,
  // authored in "Add to Echo" and shown on the review card front. Distinct from review_notes
  // (per-REVIEW reflections written while grading): these belong to the echo, not to a review.
  const reviewItemNotesExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='review_item_notes'"
  ).get();
  if (!reviewItemNotesExists) {
    db.exec(`
      CREATE TABLE review_item_notes (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        review_item_id INTEGER NOT NULL REFERENCES review_items(id) ON DELETE CASCADE,
        body           TEXT NOT NULL,
        sort_order     INTEGER NOT NULL DEFAULT 0,
        created_at     TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_review_item_notes_item ON review_item_notes(review_item_id);
    `);
    console.log('Created review_item_notes table');
  }

  // Voice recordings on the echo itself. Recorded through the global AudioRecordingBar, so they
  // carry audio_markers (audio_type='review_item') like every other recording in the app.
  // audio_markers has no FK — every delete path must purge markers itself.
  const reviewItemAudiosExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='review_item_audios'"
  ).get();
  if (!reviewItemAudiosExists) {
    db.exec(`
      CREATE TABLE review_item_audios (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        review_item_id INTEGER NOT NULL REFERENCES review_items(id) ON DELETE CASCADE,
        file_path      TEXT NOT NULL,
        duration       REAL,
        sort_order     INTEGER NOT NULL DEFAULT 0,
        created_at     TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_review_item_audios_item ON review_item_audios(review_item_id);
    `);
    console.log('Created review_item_audios table');
  }

  // Images pasted onto the echo itself (Add-to-Echo side panel), alongside its notes and voice.
  // Same contract as review_item_audios: rows cascade with the item, the FILES do not — every
  // delete path must unlink them. Not in FTS / media_tags (item-level side content stance, ADR-0009).
  const reviewItemImagesExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='review_item_images'"
  ).get();
  if (!reviewItemImagesExists) {
    db.exec(`
      CREATE TABLE review_item_images (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        review_item_id INTEGER NOT NULL REFERENCES review_items(id) ON DELETE CASCADE,
        file_path      TEXT NOT NULL,
        thumbnail_path TEXT,
        caption        TEXT,
        sort_order     INTEGER NOT NULL DEFAULT 0,
        created_at     TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_review_item_images_item ON review_item_images(review_item_id);
    `);
    console.log('Created review_item_images table');
  }

  // The "All captures" archive view scans every capture and filters by local day, tag and colour.
  // created_at had no index at all (the board view never needed one — it read the whole table), and
  // media_color_assignments was only indexed on (media_type, media_id), which is the wrong
  // direction for "which media carry colour X".
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_quick_captures_created  ON quick_captures(created_at);
    CREATE INDEX IF NOT EXISTS idx_quick_captures_archived ON quick_captures(archived_at);
    CREATE INDEX IF NOT EXISTS idx_media_color_key         ON media_color_assignments(color_key);
  `);

  // When a note (recording) was last OPENED for viewing — distinct from updated_at (last edited).
  // Powers the "Recently opened" sort toggle on the topic page. Nullable: an existing recording
  // that has never been opened since this shipped sorts last under that toggle.
  const recOpenedCols = db.prepare("PRAGMA table_info(recordings)").all() as { name: string }[];
  if (!recOpenedCols.some(c => c.name === 'last_opened_at')) {
    db.exec('ALTER TABLE recordings ADD COLUMN last_opened_at DATETIME');
    console.log('Added last_opened_at column to recordings table');
  }

  // Migration: Add caption + last_opened_at to html_nodes and duration_html_nodes.
  // caption is a user-visible note shown under the node title (same meaning as the images'
  // caption column — title stays the rename target). last_opened_at mirrors the recordings
  // column above: stamped whenever the document is viewed, shown as "last read …" on the card.
  // Nullable: an existing node that has never been opened since this shipped shows no date.
  const htmlNodeCols = db.prepare("PRAGMA table_info(html_nodes)").all() as { name: string }[];
  if (!htmlNodeCols.some(c => c.name === 'caption')) {
    db.exec('ALTER TABLE html_nodes ADD COLUMN caption TEXT');
    console.log('Added caption column to html_nodes table');
  }
  if (!htmlNodeCols.some(c => c.name === 'last_opened_at')) {
    db.exec('ALTER TABLE html_nodes ADD COLUMN last_opened_at DATETIME');
    console.log('Added last_opened_at column to html_nodes table');
  }
  const durationHtmlNodeCols = db.prepare("PRAGMA table_info(duration_html_nodes)").all() as { name: string }[];
  if (!durationHtmlNodeCols.some(c => c.name === 'caption')) {
    db.exec('ALTER TABLE duration_html_nodes ADD COLUMN caption TEXT');
    console.log('Added caption column to duration_html_nodes table');
  }
  if (!durationHtmlNodeCols.some(c => c.name === 'last_opened_at')) {
    db.exec('ALTER TABLE duration_html_nodes ADD COLUMN last_opened_at DATETIME');
    console.log('Added last_opened_at column to duration_html_nodes table');
  }

  console.log('Database migrations completed');

  // Migration: Create FTS5 full-text search index
  const ftsTableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='search_index'"
  ).get();
  if (!ftsTableExists) {
    db.exec(`
      CREATE VIRTUAL TABLE search_index USING fts5(
        content_type UNINDEXED,
        source_id UNINDEXED,
        parent_id UNINDEXED,
        searchable_text,
        tokenize='unicode61 remove_diacritics 2'
      );
    `);
    console.log('Created search_index FTS5 table');
  }
}

export function rebuildSearchIndex(): void {
  const database = getDatabase();
  const rebuild = database.transaction(() => {
    database.exec('DELETE FROM search_index');

    // Topics: name + tags
    database.exec(`
      INSERT INTO search_index(content_type, source_id, parent_id, searchable_text)
      SELECT 'topic', id, 0,
        COALESCE(name, '') || ' ' || COALESCE(tags, '')
      FROM topics
    `);

    // Recordings: name + notes (HTML stripped) — parent_id = self (recording_id)
    database.exec(`
      INSERT INTO search_index(content_type, source_id, parent_id, searchable_text)
      SELECT 'recording', id, id,
        COALESCE(name, '') || ' ' || strip_html(notes_content) || ' ' || strip_html(main_notes_content)
      FROM recordings
    `);

    // Durations: note (HTML stripped) — parent_id = recording_id
    database.exec(`
      INSERT INTO search_index(content_type, source_id, parent_id, searchable_text)
      SELECT 'duration', id, recording_id,
        strip_html(note)
      FROM durations
      WHERE note IS NOT NULL AND note != ''
        AND source_video_id IS NULL AND source_duration_video_id IS NULL
    `);

    // Images (recording-level): caption
    database.exec(`
      INSERT INTO search_index(content_type, source_id, parent_id, searchable_text)
      SELECT 'image', id, recording_id, COALESCE(caption, '')
      FROM images
      WHERE caption IS NOT NULL AND caption != ''
    `);

    // Videos (recording-level): caption
    database.exec(`
      INSERT INTO search_index(content_type, source_id, parent_id, searchable_text)
      SELECT 'video', id, recording_id, COALESCE(caption, '')
      FROM videos
      WHERE caption IS NOT NULL AND caption != ''
    `);

    // Audios (recording-level): caption
    database.exec(`
      INSERT INTO search_index(content_type, source_id, parent_id, searchable_text)
      SELECT 'audio', id, recording_id, COALESCE(caption, '')
      FROM audios
      WHERE caption IS NOT NULL AND caption != ''
    `);

    // Duration images: caption — parent_id = recording_id (via durations)
    database.exec(`
      INSERT INTO search_index(content_type, source_id, parent_id, searchable_text)
      SELECT 'duration_image', di.id, d.recording_id, COALESCE(di.caption, '')
      FROM duration_images di JOIN durations d ON d.id = di.duration_id
      WHERE di.caption IS NOT NULL AND di.caption != ''
    `);

    // Duration videos: caption
    database.exec(`
      INSERT INTO search_index(content_type, source_id, parent_id, searchable_text)
      SELECT 'duration_video', dv.id, d.recording_id, COALESCE(dv.caption, '')
      FROM duration_videos dv JOIN durations d ON d.id = dv.duration_id
      WHERE dv.caption IS NOT NULL AND dv.caption != ''
    `);

    // Duration audios: caption
    database.exec(`
      INSERT INTO search_index(content_type, source_id, parent_id, searchable_text)
      SELECT 'duration_audio', da.id, d.recording_id, COALESCE(da.caption, '')
      FROM duration_audios da JOIN durations d ON d.id = da.duration_id
      WHERE da.caption IS NOT NULL AND da.caption != ''
    `);

    // Code snippets (recording-level): title + code + caption
    database.exec(`
      INSERT INTO search_index(content_type, source_id, parent_id, searchable_text)
      SELECT 'code_snippet', id, recording_id,
        COALESCE(title, '') || ' ' || COALESCE(code, '') || ' ' || COALESCE(caption, '')
      FROM code_snippets
    `);

    // Duration code snippets: title + code + caption
    database.exec(`
      INSERT INTO search_index(content_type, source_id, parent_id, searchable_text)
      SELECT 'duration_code_snippet', dcs.id, d.recording_id,
        COALESCE(dcs.title, '') || ' ' || COALESCE(dcs.code, '') || ' ' || COALESCE(dcs.caption, '')
      FROM duration_code_snippets dcs JOIN durations d ON d.id = dcs.duration_id
    `);

    // Image audios (audio on recording images): caption
    database.exec(`
      INSERT INTO search_index(content_type, source_id, parent_id, searchable_text)
      SELECT 'image_audio', ia.id, i.recording_id, COALESCE(ia.caption, '')
      FROM image_audios ia JOIN images i ON i.id = ia.image_id
      WHERE ia.caption IS NOT NULL AND ia.caption != ''
    `);

    // Duration image audios: caption
    database.exec(`
      INSERT INTO search_index(content_type, source_id, parent_id, searchable_text)
      SELECT 'duration_image_audio', dia.id, d.recording_id, COALESCE(dia.caption, '')
      FROM duration_image_audios dia
        JOIN duration_images di ON di.id = dia.duration_image_id
        JOIN durations d ON d.id = di.duration_id
      WHERE dia.caption IS NOT NULL AND dia.caption != ''
    `);

    // Quick capture images: caption + per-image tags from media_tags
    const qciRows = database.prepare(`
      SELECT qci.id, qci.capture_id, COALESCE(qci.caption, '') as caption
      FROM quick_capture_images qci
    `).all() as Array<{ id: number; capture_id: number; caption: string }>;
    const qciTagsStmt = database.prepare(`
      SELECT t.name FROM tags t
      JOIN media_tags mt ON mt.tag_id = t.id
      WHERE mt.media_type = 'quick_capture_image' AND mt.media_id = ?
    `);
    const qciInsert = database.prepare(`
      INSERT INTO search_index(content_type, source_id, parent_id, searchable_text)
      VALUES ('quick_capture_image', ?, ?, ?)
    `);
    for (const row of qciRows) {
      const tagNames = (qciTagsStmt.all(row.id) as Array<{ name: string }>).map(t => t.name).join(' ');
      qciInsert.run(row.id, row.capture_id, `${row.caption} ${tagNames}`.trim());
    }

    // Review note images: caption + per-image tags from media_tags.
    // parent_id = review_note_id (a note, not a recording) — same shape as quick capture's
    // capture_id, so it deliberately does not resolve through recordingContextMap.
    const rniRows = database.prepare(`
      SELECT rni.id, rni.review_note_id, COALESCE(rni.caption, '') as caption
      FROM review_note_images rni
    `).all() as Array<{ id: number; review_note_id: number; caption: string }>;
    const rniTagsStmt = database.prepare(`
      SELECT t.name FROM tags t
      JOIN media_tags mt ON mt.tag_id = t.id
      WHERE mt.media_type = 'review_note_image' AND mt.media_id = ?
    `);
    const rniInsert = database.prepare(`
      INSERT INTO search_index(content_type, source_id, parent_id, searchable_text)
      VALUES ('review_note_image', ?, ?, ?)
    `);
    for (const row of rniRows) {
      const tagNames = (rniTagsStmt.all(row.id) as Array<{ name: string }>).map(t => t.name).join(' ');
      rniInsert.run(row.id, row.review_note_id, `${row.caption} ${tagNames}`.trim());
    }

    // Audio markers: caption + marker_type — parent_id computed per audio_type
    const audioMarkers = database.prepare('SELECT id, audio_id, audio_type, marker_type, caption FROM audio_markers WHERE caption IS NOT NULL AND caption != \'\'').all() as Array<{id: number, audio_id: number, audio_type: string, marker_type: string, caption: string}>;
    const markerInsert = database.prepare(`
      INSERT INTO search_index(content_type, source_id, parent_id, searchable_text)
      VALUES ('audio_marker', ?, ?, ?)
    `);
    for (const am of audioMarkers) {
      let recordingId = 0;
      try {
        if (am.audio_type === 'recording') {
          const row = database.prepare('SELECT recording_id FROM audios WHERE id = ?').get(am.audio_id) as any;
          recordingId = row?.recording_id ?? 0;
        } else if (am.audio_type === 'duration') {
          const row = database.prepare('SELECT d.recording_id FROM duration_audios da JOIN durations d ON d.id = da.duration_id WHERE da.id = ?').get(am.audio_id) as any;
          recordingId = row?.recording_id ?? 0;
        } else if (am.audio_type === 'duration_image') {
          const row = database.prepare('SELECT d.recording_id FROM duration_image_audios dia JOIN duration_images di ON di.id = dia.duration_image_id JOIN durations d ON d.id = di.duration_id WHERE dia.id = ?').get(am.audio_id) as any;
          recordingId = row?.recording_id ?? 0;
        } else if (am.audio_type === 'recording_image') {
          const row = database.prepare('SELECT i.recording_id FROM image_audios ia JOIN images i ON i.id = ia.image_id WHERE ia.id = ?').get(am.audio_id) as any;
          recordingId = row?.recording_id ?? 0;
        }
      } catch { /* skip on error */ }
      markerInsert.run(am.id, recordingId, am.caption + ' ' + am.marker_type);
    }

    // HTML nodes — recording-level (parent_id = recording_id). Caption is folded into the
    // same entry as the title so captions are searchable without a new content_type.
    database.exec(`
      INSERT INTO search_index(content_type, source_id, parent_id, searchable_text)
      SELECT 'html_node', id, recording_id, TRIM(COALESCE(title, '') || ' ' || COALESCE(caption, ''))
      FROM html_nodes
      WHERE (title IS NOT NULL AND title != '') OR (caption IS NOT NULL AND caption != '')
    `);

    // HTML nodes — duration-level (parent_id = recording_id via durations join)
    database.exec(`
      INSERT INTO search_index(content_type, source_id, parent_id, searchable_text)
      SELECT 'duration_html_node', hn.id, d.recording_id, TRIM(COALESCE(hn.title, '') || ' ' || COALESCE(hn.caption, ''))
      FROM duration_html_nodes hn JOIN durations d ON d.id = hn.duration_id
      WHERE (hn.title IS NOT NULL AND hn.title != '') OR (hn.caption IS NOT NULL AND hn.caption != '')
    `);

    // OCR text — recording-level images (parent_id = recording_id)
    database.exec(`
      INSERT INTO search_index(content_type, source_id, parent_id, searchable_text)
      SELECT 'image_ocr', id, recording_id, caption2
      FROM images WHERE caption2 IS NOT NULL AND caption2 != ''
    `);

    // OCR text — duration images (parent_id = recording_id via durations join)
    database.exec(`
      INSERT INTO search_index(content_type, source_id, parent_id, searchable_text)
      SELECT 'duration_image_ocr', di.id, d.recording_id, di.caption2
      FROM duration_images di JOIN durations d ON d.id = di.duration_id
      WHERE di.caption2 IS NOT NULL AND di.caption2 != ''
    `);

    // OCR text — quick capture images (parent_id = capture_id, same as quick_capture_image)
    database.exec(`
      INSERT INTO search_index(content_type, source_id, parent_id, searchable_text)
      SELECT 'quick_capture_image_ocr', id, capture_id, caption2
      FROM quick_capture_images WHERE caption2 IS NOT NULL AND caption2 != ''
    `);

    // OCR text — review note images (parent_id = review_note_id, same as review_note_image)
    database.exec(`
      INSERT INTO search_index(content_type, source_id, parent_id, searchable_text)
      SELECT 'review_note_image_ocr', id, review_note_id, caption2
      FROM review_note_images WHERE caption2 IS NOT NULL AND caption2 != ''
    `);

    // OCR text — child images (parent_id resolved to recording_id where possible)
    database.exec(`
      INSERT INTO search_index(content_type, source_id, parent_id, searchable_text)
      SELECT 'image_child_ocr', ic.id,
        COALESCE(
          (SELECT i.recording_id FROM images i WHERE ic.parent_type = 'image' AND i.id = ic.parent_id),
          (SELECT d.recording_id FROM duration_images di JOIN durations d ON d.id = di.duration_id
           WHERE ic.parent_type = 'duration_image' AND di.id = ic.parent_id),
          0
        ),
        ic.caption2
      FROM image_children ic WHERE ic.caption2 IS NOT NULL AND ic.caption2 != ''
    `);
  });

  rebuild();
  console.log('Search index rebuilt');
}

let reindexTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleSearchReindex(): void {
  if (reindexTimer) clearTimeout(reindexTimer);
  reindexTimer = setTimeout(() => {
    try { rebuildSearchIndex(); } catch (e) { console.error('Search reindex failed:', e); }
    reindexTimer = null;
  }, 1000);
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    console.log('Database closed');
  }
}
