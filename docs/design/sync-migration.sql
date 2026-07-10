-- Sync foundation migration (ADR-0001 / sync-protocol-design.md)
-- VALIDATED on a DB copy 2026-06-29: idempotent, triggers capture I/U/D + origin + cascade tombstones.
-- Additive only (new tables + triggers; no ALTER/DROP). NOT yet applied to the live DB.
-- To ship: translate into electron/database/database.ts runMigrations() (idempotent guards).


CREATE TABLE IF NOT EXISTS sync_session (
  id INTEGER PRIMARY KEY CHECK(id=1),
  origin TEXT NOT NULL DEFAULT 'desktop'
);
INSERT OR IGNORE INTO sync_session(id, origin) VALUES (1, 'desktop');

CREATE TABLE IF NOT EXISTS sync_changelog (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  row_id     INTEGER NOT NULL,
  op         TEXT NOT NULL CHECK(op IN ('I','U','D')),
  origin     TEXT NOT NULL DEFAULT 'desktop',
  changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sync_changelog_seq ON sync_changelog(seq);
CREATE INDEX IF NOT EXISTS idx_sync_changelog_tbl_row ON sync_changelog(table_name, row_id);

CREATE TABLE IF NOT EXISTS sync_state (
  peer TEXT PRIMARY KEY,
  last_seq INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sync_media (
  content_hash TEXT PRIMARY KEY,
  size INTEGER NOT NULL,
  mime TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sync_conflicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  row_id INTEGER NOT NULL,
  field TEXT NOT NULL,
  desktop_value TEXT,
  mobile_value TEXT,
  winner TEXT NOT NULL DEFAULT 'desktop',
  detected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged INTEGER NOT NULL DEFAULT 0
);

-- Push bookkeeping (P1.3): idempotency log + the queue the desktop drains.
CREATE TABLE IF NOT EXISTS sync_push_log (
  client_change_id TEXT PRIMARY KEY,
  device_id  TEXT,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  server_row_id INTEGER
);

CREATE TABLE IF NOT EXISTS sync_mobile_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_change_id TEXT NOT NULL,
  device_id  TEXT,
  op         TEXT NOT NULL CHECK(op IN ('insert','update','delete')),
  table_name TEXT NOT NULL,
  row_id     INTEGER,
  fields     TEXT,
  base       TEXT,
  processed  INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS trg_topics_sync_ai AFTER INSERT ON topics BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('topics',NEW.id,'I',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_topics_sync_au AFTER UPDATE ON topics BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('topics',NEW.id,'U',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_topics_sync_ad AFTER DELETE ON topics BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('topics',OLD.id,'D',(SELECT origin FROM sync_session WHERE id=1));
END;

CREATE TRIGGER IF NOT EXISTS trg_recordings_sync_ai AFTER INSERT ON recordings BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('recordings',NEW.id,'I',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_recordings_sync_au AFTER UPDATE ON recordings BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('recordings',NEW.id,'U',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_recordings_sync_ad AFTER DELETE ON recordings BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('recordings',OLD.id,'D',(SELECT origin FROM sync_session WHERE id=1));
END;

CREATE TRIGGER IF NOT EXISTS trg_durations_sync_ai AFTER INSERT ON durations BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('durations',NEW.id,'I',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_durations_sync_au AFTER UPDATE ON durations BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('durations',NEW.id,'U',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_durations_sync_ad AFTER DELETE ON durations BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('durations',OLD.id,'D',(SELECT origin FROM sync_session WHERE id=1));
END;

CREATE TRIGGER IF NOT EXISTS trg_images_sync_ai AFTER INSERT ON images BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('images',NEW.id,'I',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_images_sync_au AFTER UPDATE ON images BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('images',NEW.id,'U',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_images_sync_ad AFTER DELETE ON images BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('images',OLD.id,'D',(SELECT origin FROM sync_session WHERE id=1));
END;

CREATE TRIGGER IF NOT EXISTS trg_videos_sync_ai AFTER INSERT ON videos BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('videos',NEW.id,'I',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_videos_sync_au AFTER UPDATE ON videos BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('videos',NEW.id,'U',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_videos_sync_ad AFTER DELETE ON videos BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('videos',OLD.id,'D',(SELECT origin FROM sync_session WHERE id=1));
END;

CREATE TRIGGER IF NOT EXISTS trg_audios_sync_ai AFTER INSERT ON audios BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('audios',NEW.id,'I',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_audios_sync_au AFTER UPDATE ON audios BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('audios',NEW.id,'U',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_audios_sync_ad AFTER DELETE ON audios BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('audios',OLD.id,'D',(SELECT origin FROM sync_session WHERE id=1));
END;

CREATE TRIGGER IF NOT EXISTS trg_code_snippets_sync_ai AFTER INSERT ON code_snippets BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('code_snippets',NEW.id,'I',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_code_snippets_sync_au AFTER UPDATE ON code_snippets BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('code_snippets',NEW.id,'U',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_code_snippets_sync_ad AFTER DELETE ON code_snippets BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('code_snippets',OLD.id,'D',(SELECT origin FROM sync_session WHERE id=1));
END;

CREATE TRIGGER IF NOT EXISTS trg_duration_images_sync_ai AFTER INSERT ON duration_images BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('duration_images',NEW.id,'I',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_duration_images_sync_au AFTER UPDATE ON duration_images BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('duration_images',NEW.id,'U',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_duration_images_sync_ad AFTER DELETE ON duration_images BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('duration_images',OLD.id,'D',(SELECT origin FROM sync_session WHERE id=1));
END;

CREATE TRIGGER IF NOT EXISTS trg_duration_videos_sync_ai AFTER INSERT ON duration_videos BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('duration_videos',NEW.id,'I',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_duration_videos_sync_au AFTER UPDATE ON duration_videos BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('duration_videos',NEW.id,'U',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_duration_videos_sync_ad AFTER DELETE ON duration_videos BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('duration_videos',OLD.id,'D',(SELECT origin FROM sync_session WHERE id=1));
END;

CREATE TRIGGER IF NOT EXISTS trg_duration_audios_sync_ai AFTER INSERT ON duration_audios BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('duration_audios',NEW.id,'I',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_duration_audios_sync_au AFTER UPDATE ON duration_audios BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('duration_audios',NEW.id,'U',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_duration_audios_sync_ad AFTER DELETE ON duration_audios BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('duration_audios',OLD.id,'D',(SELECT origin FROM sync_session WHERE id=1));
END;

CREATE TRIGGER IF NOT EXISTS trg_duration_code_snippets_sync_ai AFTER INSERT ON duration_code_snippets BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('duration_code_snippets',NEW.id,'I',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_duration_code_snippets_sync_au AFTER UPDATE ON duration_code_snippets BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('duration_code_snippets',NEW.id,'U',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_duration_code_snippets_sync_ad AFTER DELETE ON duration_code_snippets BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('duration_code_snippets',OLD.id,'D',(SELECT origin FROM sync_session WHERE id=1));
END;

CREATE TRIGGER IF NOT EXISTS trg_duration_image_audios_sync_ai AFTER INSERT ON duration_image_audios BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('duration_image_audios',NEW.id,'I',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_duration_image_audios_sync_au AFTER UPDATE ON duration_image_audios BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('duration_image_audios',NEW.id,'U',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_duration_image_audios_sync_ad AFTER DELETE ON duration_image_audios BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('duration_image_audios',OLD.id,'D',(SELECT origin FROM sync_session WHERE id=1));
END;

CREATE TRIGGER IF NOT EXISTS trg_duration_html_nodes_sync_ai AFTER INSERT ON duration_html_nodes BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('duration_html_nodes',NEW.id,'I',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_duration_html_nodes_sync_au AFTER UPDATE ON duration_html_nodes BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('duration_html_nodes',NEW.id,'U',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_duration_html_nodes_sync_ad AFTER DELETE ON duration_html_nodes BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('duration_html_nodes',OLD.id,'D',(SELECT origin FROM sync_session WHERE id=1));
END;

CREATE TRIGGER IF NOT EXISTS trg_image_audios_sync_ai AFTER INSERT ON image_audios BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('image_audios',NEW.id,'I',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_image_audios_sync_au AFTER UPDATE ON image_audios BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('image_audios',NEW.id,'U',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_image_audios_sync_ad AFTER DELETE ON image_audios BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('image_audios',OLD.id,'D',(SELECT origin FROM sync_session WHERE id=1));
END;

CREATE TRIGGER IF NOT EXISTS trg_image_children_sync_ai AFTER INSERT ON image_children BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('image_children',NEW.id,'I',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_image_children_sync_au AFTER UPDATE ON image_children BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('image_children',NEW.id,'U',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_image_children_sync_ad AFTER DELETE ON image_children BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('image_children',OLD.id,'D',(SELECT origin FROM sync_session WHERE id=1));
END;

CREATE TRIGGER IF NOT EXISTS trg_image_child_audios_sync_ai AFTER INSERT ON image_child_audios BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('image_child_audios',NEW.id,'I',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_image_child_audios_sync_au AFTER UPDATE ON image_child_audios BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('image_child_audios',NEW.id,'U',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_image_child_audios_sync_ad AFTER DELETE ON image_child_audios BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('image_child_audios',OLD.id,'D',(SELECT origin FROM sync_session WHERE id=1));
END;

CREATE TRIGGER IF NOT EXISTS trg_quick_captures_sync_ai AFTER INSERT ON quick_captures BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('quick_captures',NEW.id,'I',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_quick_captures_sync_au AFTER UPDATE ON quick_captures BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('quick_captures',NEW.id,'U',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_quick_captures_sync_ad AFTER DELETE ON quick_captures BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('quick_captures',OLD.id,'D',(SELECT origin FROM sync_session WHERE id=1));
END;

CREATE TRIGGER IF NOT EXISTS trg_quick_capture_images_sync_ai AFTER INSERT ON quick_capture_images BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('quick_capture_images',NEW.id,'I',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_quick_capture_images_sync_au AFTER UPDATE ON quick_capture_images BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('quick_capture_images',NEW.id,'U',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_quick_capture_images_sync_ad AFTER DELETE ON quick_capture_images BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('quick_capture_images',OLD.id,'D',(SELECT origin FROM sync_session WHERE id=1));
END;

CREATE TRIGGER IF NOT EXISTS trg_quick_capture_audios_sync_ai AFTER INSERT ON quick_capture_audios BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('quick_capture_audios',NEW.id,'I',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_quick_capture_audios_sync_au AFTER UPDATE ON quick_capture_audios BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('quick_capture_audios',NEW.id,'U',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_quick_capture_audios_sync_ad AFTER DELETE ON quick_capture_audios BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('quick_capture_audios',OLD.id,'D',(SELECT origin FROM sync_session WHERE id=1));
END;

CREATE TRIGGER IF NOT EXISTS trg_quick_capture_image_audios_sync_ai AFTER INSERT ON quick_capture_image_audios BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('quick_capture_image_audios',NEW.id,'I',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_quick_capture_image_audios_sync_au AFTER UPDATE ON quick_capture_image_audios BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('quick_capture_image_audios',NEW.id,'U',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_quick_capture_image_audios_sync_ad AFTER DELETE ON quick_capture_image_audios BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('quick_capture_image_audios',OLD.id,'D',(SELECT origin FROM sync_session WHERE id=1));
END;

CREATE TRIGGER IF NOT EXISTS trg_html_nodes_sync_ai AFTER INSERT ON html_nodes BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('html_nodes',NEW.id,'I',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_html_nodes_sync_au AFTER UPDATE ON html_nodes BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('html_nodes',NEW.id,'U',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_html_nodes_sync_ad AFTER DELETE ON html_nodes BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('html_nodes',OLD.id,'D',(SELECT origin FROM sync_session WHERE id=1));
END;

CREATE TRIGGER IF NOT EXISTS trg_screen_recordings_sync_ai AFTER INSERT ON screen_recordings BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('screen_recordings',NEW.id,'I',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_screen_recordings_sync_au AFTER UPDATE ON screen_recordings BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('screen_recordings',NEW.id,'U',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_screen_recordings_sync_ad AFTER DELETE ON screen_recordings BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('screen_recordings',OLD.id,'D',(SELECT origin FROM sync_session WHERE id=1));
END;

CREATE TRIGGER IF NOT EXISTS trg_audio_markers_sync_ai AFTER INSERT ON audio_markers BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('audio_markers',NEW.id,'I',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_audio_markers_sync_au AFTER UPDATE ON audio_markers BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('audio_markers',NEW.id,'U',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_audio_markers_sync_ad AFTER DELETE ON audio_markers BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('audio_markers',OLD.id,'D',(SELECT origin FROM sync_session WHERE id=1));
END;

CREATE TRIGGER IF NOT EXISTS trg_tags_sync_ai AFTER INSERT ON tags BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('tags',NEW.id,'I',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_tags_sync_au AFTER UPDATE ON tags BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('tags',NEW.id,'U',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_tags_sync_ad AFTER DELETE ON tags BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('tags',OLD.id,'D',(SELECT origin FROM sync_session WHERE id=1));
END;

CREATE TRIGGER IF NOT EXISTS trg_media_tags_sync_ai AFTER INSERT ON media_tags BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('media_tags',NEW.id,'I',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_media_tags_sync_au AFTER UPDATE ON media_tags BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('media_tags',NEW.id,'U',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_media_tags_sync_ad AFTER DELETE ON media_tags BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('media_tags',OLD.id,'D',(SELECT origin FROM sync_session WHERE id=1));
END;

CREATE TRIGGER IF NOT EXISTS trg_image_color_assignments_sync_ai AFTER INSERT ON image_color_assignments BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('image_color_assignments',NEW.id,'I',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_image_color_assignments_sync_au AFTER UPDATE ON image_color_assignments BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('image_color_assignments',NEW.id,'U',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_image_color_assignments_sync_ad AFTER DELETE ON image_color_assignments BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('image_color_assignments',OLD.id,'D',(SELECT origin FROM sync_session WHERE id=1));
END;

CREATE TRIGGER IF NOT EXISTS trg_media_color_assignments_sync_ai AFTER INSERT ON media_color_assignments BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('media_color_assignments',NEW.id,'I',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_media_color_assignments_sync_au AFTER UPDATE ON media_color_assignments BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('media_color_assignments',NEW.id,'U',(SELECT origin FROM sync_session WHERE id=1));
END;
CREATE TRIGGER IF NOT EXISTS trg_media_color_assignments_sync_ad AFTER DELETE ON media_color_assignments BEGIN
  INSERT INTO sync_changelog(table_name,row_id,op,origin) VALUES('media_color_assignments',OLD.id,'D',(SELECT origin FROM sync_session WHERE id=1));
END;
