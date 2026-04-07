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
