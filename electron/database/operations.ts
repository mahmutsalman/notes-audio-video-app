import { getDatabase } from './database';
import type {
  Topic, CreateTopic, UpdateTopic,
  Recording, CreateRecording, UpdateRecording,
  Image, CreateImage,
  Video, CreateVideo,
  Audio, CreateAudio,
  Duration, CreateDuration, UpdateDuration,
  DurationImage, CreateDurationImage,
  DurationVideo, CreateDurationVideo,
  DurationAudio, CreateDurationAudio,
  CodeSnippet, CreateCodeSnippet, UpdateCodeSnippet,
  DurationCodeSnippet, CreateDurationCodeSnippet, UpdateDurationCodeSnippet,
  DurationGroupColor
} from '../../src/types';

// Helper to parse tags from JSON string
function parseTags(tagsJson: string | null): string[] {
  if (!tagsJson) return [];
  try {
    return JSON.parse(tagsJson);
  } catch {
    return [];
  }
}

// Helper to convert row to Topic
function rowToTopic(row: Record<string, unknown>): Topic {
  return {
    ...row,
    tags: parseTags(row.tags as string),
  } as Topic;
}

// Topics Operations
export const TopicsOperations = {
  getAll(): Topic[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM topic_stats
      ORDER BY updated_at DESC
    `).all() as Record<string, unknown>[];

    return rows.map(rowToTopic);
  },

  getById(id: number): Topic | null {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT * FROM topic_stats WHERE id = ?
    `).get(id) as Record<string, unknown> | undefined;

    return row ? rowToTopic(row) : null;
  },

  create(topic: CreateTopic): Topic {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO topics (name, tags, importance_level)
      VALUES (?, ?, ?)
    `);

    const result = stmt.run(
      topic.name,
      JSON.stringify(topic.tags || []),
      topic.importance_level ?? 5
    );

    return this.getById(result.lastInsertRowid as number)!;
  },

  update(id: number, updates: UpdateTopic): Topic {
    const db = getDatabase();
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.tags !== undefined) {
      fields.push('tags = ?');
      values.push(JSON.stringify(updates.tags));
    }
    if (updates.importance_level !== undefined) {
      fields.push('importance_level = ?');
      values.push(updates.importance_level);
    }

    if (fields.length > 0) {
      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);

      db.prepare(`
        UPDATE topics SET ${fields.join(', ')} WHERE id = ?
      `).run(...values);
    }

    return this.getById(id)!;
  },

  delete(id: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM topics WHERE id = ?').run(id);
  },
};

// Recordings Operations
export const RecordingsOperations = {
  getByTopic(topicId: number): Recording[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM recordings
      WHERE topic_id = ?
      ORDER BY created_at DESC
    `).all(topicId) as Recording[];

    // Load images and videos for each recording
    return rows.map(recording => ({
      ...recording,
      images: ImagesOperations.getByRecording(recording.id),
      videos: VideosOperations.getByRecording(recording.id),
    }));
  },

  getById(id: number): Recording | null {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT * FROM recordings WHERE id = ?
    `).get(id) as Recording | undefined;

    if (!row) return null;

    return {
      ...row,
      images: ImagesOperations.getByRecording(id),
      videos: VideosOperations.getByRecording(id),
    };
  },

  create(recording: CreateRecording): Recording {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO recordings (topic_id, name, audio_path, audio_duration, video_path, video_duration, video_resolution, video_fps, video_size, notes_content, recording_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      recording.topic_id,
      recording.name ?? null,
      recording.audio_path,
      recording.audio_duration,
      recording.video_path ?? null,
      recording.video_duration ?? null,
      recording.video_resolution ?? null,
      recording.video_fps ?? null,
      recording.video_size ?? null,
      recording.notes_content,
      recording.recording_type ?? 'audio'
    );

    // Update topic's updated_at
    db.prepare(`
      UPDATE topics SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(recording.topic_id);

    return this.getById(result.lastInsertRowid as number)!;
  },

  update(id: number, updates: UpdateRecording): Recording {
    const db = getDatabase();
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.audio_path !== undefined) {
      fields.push('audio_path = ?');
      values.push(updates.audio_path);
    }
    if (updates.audio_duration !== undefined) {
      fields.push('audio_duration = ?');
      values.push(updates.audio_duration);
    }
    if (updates.audio_size !== undefined) {
      fields.push('audio_size = ?');
      values.push(updates.audio_size);
    }
    if (updates.video_path !== undefined) {
      fields.push('video_path = ?');
      values.push(updates.video_path);
    }
    if (updates.video_duration !== undefined) {
      fields.push('video_duration = ?');
      values.push(updates.video_duration);
    }
    if (updates.video_resolution !== undefined) {
      fields.push('video_resolution = ?');
      values.push(updates.video_resolution);
    }
    if (updates.video_fps !== undefined) {
      fields.push('video_fps = ?');
      values.push(updates.video_fps);
    }
    if (updates.video_size !== undefined) {
      fields.push('video_size = ?');
      values.push(updates.video_size);
    }
    if (updates.notes_content !== undefined) {
      fields.push('notes_content = ?');
      values.push(updates.notes_content);
    }
    if (updates.main_notes_content !== undefined) {
      fields.push('main_notes_content = ?');
      values.push(updates.main_notes_content);
    }
    if (updates.importance_color !== undefined) {
      fields.push('importance_color = ?');
      values.push(updates.importance_color);
    }

    if (fields.length > 0) {
      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);

      db.prepare(`
        UPDATE recordings SET ${fields.join(', ')} WHERE id = ?
      `).run(...values);

      // Update parent topic's updated_at
      const recording = this.getById(id);
      if (recording) {
        db.prepare(`
          UPDATE topics SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(recording.topic_id);
      }
    }

    return this.getById(id)!;
  },

  delete(id: number): void {
    const db = getDatabase();
    const recording = this.getById(id);

    db.prepare('DELETE FROM recordings WHERE id = ?').run(id);

    // Update parent topic's updated_at
    if (recording) {
      db.prepare(`
        UPDATE topics SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(recording.topic_id);
    }
  },

  updateGroupColorState(
    id: number,
    lastGroupColor: DurationGroupColor,
    toggleActive: boolean
  ): Recording {
    const db = getDatabase();
    db.prepare(`
      UPDATE recordings
      SET last_group_color = ?, group_toggle_active = ?
      WHERE id = ?
    `).run(lastGroupColor, toggleActive ? 1 : 0, id);

    return this.getById(id)!;
  },

  getGroupColorState(id: number): {
    lastGroupColor: DurationGroupColor;
    toggleActive: boolean;
  } {
    const recording = this.getById(id);
    if (!recording) {
      throw new Error(`Recording ${id} not found`);
    }
    return {
      lastGroupColor: recording.last_group_color,
      toggleActive: Boolean(recording.group_toggle_active),
    };
  },
};

// Images Operations
export const ImagesOperations = {
  getByRecording(recordingId: number): Image[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM images
      WHERE recording_id = ?
      ORDER BY sort_order, created_at
    `).all(recordingId) as Image[];
  },

  getById(id: number): Image | null {
    const db = getDatabase();
    return db.prepare('SELECT * FROM images WHERE id = ?').get(id) as Image | undefined ?? null;
  },

  create(image: CreateImage): Image {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO images (recording_id, file_path, thumbnail_path, sort_order)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(
      image.recording_id,
      image.file_path,
      image.thumbnail_path,
      image.sort_order ?? 0
    );

    return this.getById(result.lastInsertRowid as number)!;
  },

  delete(id: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM images WHERE id = ?').run(id);
  },

  updateCaption(id: number, caption: string | null): Image {
    const db = getDatabase();
    db.prepare('UPDATE images SET caption = ? WHERE id = ?').run(caption, id);
    return this.getById(id)!;
  },

  updateColor(id: number, color: DurationColor): Image {
    const db = getDatabase();
    db.prepare('UPDATE images SET color = ? WHERE id = ?').run(color, id);
    return this.getById(id)!;
  },
};

// Videos Operations
export const VideosOperations = {
  getByRecording(recordingId: number): Video[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM videos
      WHERE recording_id = ?
      ORDER BY sort_order, created_at
    `).all(recordingId) as Video[];
  },

  getById(id: number): Video | null {
    const db = getDatabase();
    return db.prepare('SELECT * FROM videos WHERE id = ?').get(id) as Video | undefined ?? null;
  },

  create(video: CreateVideo): Video {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO videos (recording_id, file_path, thumbnail_path, duration, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      video.recording_id,
      video.file_path,
      video.thumbnail_path,
      video.duration,
      video.sort_order ?? 0
    );

    return this.getById(result.lastInsertRowid as number)!;
  },

  delete(id: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM videos WHERE id = ?').run(id);
  },

  updateCaption(id: number, caption: string | null): Video {
    const db = getDatabase();
    db.prepare('UPDATE videos SET caption = ? WHERE id = ?').run(caption, id);
    return this.getById(id)!;
  },

  updateColor(id: number, color: DurationColor): Video {
    const db = getDatabase();
    db.prepare('UPDATE videos SET color = ? WHERE id = ?').run(color, id);
    return this.getById(id)!;
  },
};

// Durations Operations (marked time segments within recordings)
export const DurationsOperations = {
  getByRecording(recordingId: number): Duration[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM durations
      WHERE recording_id = ?
      ORDER BY start_time
    `).all(recordingId) as Duration[];
  },

  getById(id: number): Duration | null {
    const db = getDatabase();
    return db.prepare('SELECT * FROM durations WHERE id = ?').get(id) as Duration | undefined ?? null;
  },

  create(duration: CreateDuration): Duration {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO durations (recording_id, start_time, end_time, note, group_color)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      duration.recording_id,
      duration.start_time,
      duration.end_time,
      duration.note ?? null,
      duration.group_color ?? null
    );

    return this.getById(result.lastInsertRowid as number)!;
  },

  update(id: number, updates: UpdateDuration): Duration {
    const db = getDatabase();
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.note !== undefined) {
      fields.push('note = ?');
      values.push(updates.note);
    }
    if (updates.color !== undefined) {
      fields.push('color = ?');
      values.push(updates.color);
    }
    if (updates.group_color !== undefined) {
      fields.push('group_color = ?');
      values.push(updates.group_color);
    }

    if (fields.length > 0) {
      values.push(id);
      db.prepare(`
        UPDATE durations SET ${fields.join(', ')} WHERE id = ?
      `).run(...values);
    }

    return this.getById(id)!;
  },

  delete(id: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM durations WHERE id = ?').run(id);
  },
};

// Duration Images Operations (images attached to duration marks)
export const DurationImagesOperations = {
  getByDuration(durationId: number): DurationImage[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM duration_images
      WHERE duration_id = ?
      ORDER BY sort_order, created_at
    `).all(durationId) as DurationImage[];
  },

  getById(id: number): DurationImage | null {
    const db = getDatabase();
    return db.prepare('SELECT * FROM duration_images WHERE id = ?').get(id) as DurationImage | undefined ?? null;
  },

  create(image: CreateDurationImage): DurationImage {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO duration_images (duration_id, file_path, thumbnail_path, sort_order)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(
      image.duration_id,
      image.file_path,
      image.thumbnail_path ?? null,
      image.sort_order ?? 0
    );

    return this.getById(result.lastInsertRowid as number)!;
  },

  delete(id: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM duration_images WHERE id = ?').run(id);
  },

  deleteByDuration(durationId: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM duration_images WHERE duration_id = ?').run(durationId);
  },

  updateCaption(id: number, caption: string | null): DurationImage {
    const db = getDatabase();
    db.prepare('UPDATE duration_images SET caption = ? WHERE id = ?').run(caption, id);
    return this.getById(id)!;
  },

  updateColor(id: number, color: DurationColor): DurationImage {
    const db = getDatabase();
    db.prepare('UPDATE duration_images SET color = ? WHERE id = ?').run(color, id);
    return this.getById(id)!;
  },
};

// Duration Videos Operations (videos attached to duration marks)
export const DurationVideosOperations = {
  getByDuration(durationId: number): DurationVideo[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM duration_videos
      WHERE duration_id = ?
      ORDER BY sort_order, created_at
    `).all(durationId) as DurationVideo[];
  },

  getById(id: number): DurationVideo | null {
    const db = getDatabase();
    return db.prepare('SELECT * FROM duration_videos WHERE id = ?').get(id) as DurationVideo | undefined ?? null;
  },

  create(video: CreateDurationVideo): DurationVideo {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO duration_videos (duration_id, file_path, thumbnail_path, caption, duration, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      video.duration_id,
      video.file_path,
      video.thumbnail_path ?? null,
      video.caption ?? null,
      video.duration ?? null,
      video.sort_order ?? 0
    );

    return this.getById(result.lastInsertRowid as number)!;
  },

  delete(id: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM duration_videos WHERE id = ?').run(id);
  },

  deleteByDuration(durationId: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM duration_videos WHERE duration_id = ?').run(durationId);
  },

  updateCaption(id: number, caption: string | null): DurationVideo {
    const db = getDatabase();
    db.prepare('UPDATE duration_videos SET caption = ? WHERE id = ?').run(caption, id);
    return this.getById(id)!;
  },

  updateColor(id: number, color: DurationColor): DurationVideo {
    const db = getDatabase();
    db.prepare('UPDATE duration_videos SET color = ? WHERE id = ?').run(color, id);
    return this.getById(id)!;
  },
};

// Audios Operations (audio clips attached to recordings)
export const AudiosOperations = {
  getByRecording(recordingId: number): Audio[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM audios
      WHERE recording_id = ?
      ORDER BY sort_order, created_at
    `).all(recordingId) as Audio[];
  },

  getById(id: number): Audio | null {
    const db = getDatabase();
    return db.prepare('SELECT * FROM audios WHERE id = ?').get(id) as Audio | undefined ?? null;
  },

  create(audio: CreateAudio): Audio {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO audios (recording_id, file_path, caption, duration, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      audio.recording_id,
      audio.file_path,
      audio.caption ?? null,
      audio.duration ?? null,
      audio.sort_order ?? 0
    );

    return this.getById(result.lastInsertRowid as number)!;
  },

  delete(id: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM audios WHERE id = ?').run(id);
  },

  updateCaption(id: number, caption: string | null): Audio {
    const db = getDatabase();
    db.prepare('UPDATE audios SET caption = ? WHERE id = ?').run(caption, id);
    return this.getById(id)!;
  },
};

// Duration Audios Operations (audio clips attached to duration marks)
export const DurationAudiosOperations = {
  getByDuration(durationId: number): DurationAudio[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM duration_audios
      WHERE duration_id = ?
      ORDER BY sort_order, created_at
    `).all(durationId) as DurationAudio[];
  },

  getById(id: number): DurationAudio | null {
    const db = getDatabase();
    return db.prepare('SELECT * FROM duration_audios WHERE id = ?').get(id) as DurationAudio | undefined ?? null;
  },

  create(audio: CreateDurationAudio): DurationAudio {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO duration_audios (duration_id, file_path, caption, duration, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      audio.duration_id,
      audio.file_path,
      audio.caption ?? null,
      audio.duration ?? null,
      audio.sort_order ?? 0
    );

    return this.getById(result.lastInsertRowid as number)!;
  },

  delete(id: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM duration_audios WHERE id = ?').run(id);
  },

  deleteByDuration(durationId: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM duration_audios WHERE duration_id = ?').run(durationId);
  },

  updateCaption(id: number, caption: string | null): DurationAudio {
    const db = getDatabase();
    db.prepare('UPDATE duration_audios SET caption = ? WHERE id = ?').run(caption, id);
    return this.getById(id)!;
  },
};

// Code Snippets Operations (code snippets attached to recordings)
export const CodeSnippetsOperations = {
  getByRecording(recordingId: number): CodeSnippet[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM code_snippets
      WHERE recording_id = ?
      ORDER BY sort_order, created_at
    `).all(recordingId) as CodeSnippet[];
  },

  getById(id: number): CodeSnippet | null {
    const db = getDatabase();
    return db.prepare('SELECT * FROM code_snippets WHERE id = ?').get(id) as CodeSnippet | undefined ?? null;
  },

  create(snippet: CreateCodeSnippet): CodeSnippet {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO code_snippets (recording_id, title, language, code, caption, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      snippet.recording_id,
      snippet.title ?? null,
      snippet.language,
      snippet.code,
      snippet.caption ?? null,
      snippet.sort_order ?? 0
    );

    return this.getById(result.lastInsertRowid as number)!;
  },

  update(id: number, updates: UpdateCodeSnippet): CodeSnippet {
    const db = getDatabase();
    const updateFields: string[] = [];
    const values: any[] = [];

    if (updates.title !== undefined) {
      updateFields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.language !== undefined) {
      updateFields.push('language = ?');
      values.push(updates.language);
    }
    if (updates.code !== undefined) {
      updateFields.push('code = ?');
      values.push(updates.code);
    }
    if (updates.caption !== undefined) {
      updateFields.push('caption = ?');
      values.push(updates.caption);
    }

    if (updateFields.length > 0) {
      values.push(id);
      db.prepare(`UPDATE code_snippets SET ${updateFields.join(', ')} WHERE id = ?`).run(...values);
    }

    return this.getById(id)!;
  },

  delete(id: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM code_snippets WHERE id = ?').run(id);
  },
};

// Duration Code Snippets Operations (code snippets attached to duration marks)
export const DurationCodeSnippetsOperations = {
  getByDuration(durationId: number): DurationCodeSnippet[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM duration_code_snippets
      WHERE duration_id = ?
      ORDER BY sort_order, created_at
    `).all(durationId) as DurationCodeSnippet[];
  },

  getById(id: number): DurationCodeSnippet | null {
    const db = getDatabase();
    return db.prepare('SELECT * FROM duration_code_snippets WHERE id = ?').get(id) as DurationCodeSnippet | undefined ?? null;
  },

  create(snippet: CreateDurationCodeSnippet): DurationCodeSnippet {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO duration_code_snippets (duration_id, title, language, code, caption, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      snippet.duration_id,
      snippet.title ?? null,
      snippet.language,
      snippet.code,
      snippet.caption ?? null,
      snippet.sort_order ?? 0
    );

    return this.getById(result.lastInsertRowid as number)!;
  },

  update(id: number, updates: UpdateDurationCodeSnippet): DurationCodeSnippet {
    const db = getDatabase();
    const updateFields: string[] = [];
    const values: any[] = [];

    if (updates.title !== undefined) {
      updateFields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.language !== undefined) {
      updateFields.push('language = ?');
      values.push(updates.language);
    }
    if (updates.code !== undefined) {
      updateFields.push('code = ?');
      values.push(updates.code);
    }
    if (updates.caption !== undefined) {
      updateFields.push('caption = ?');
      values.push(updates.caption);
    }

    if (updateFields.length > 0) {
      values.push(id);
      db.prepare(`UPDATE duration_code_snippets SET ${updateFields.join(', ')} WHERE id = ?`).run(...values);
    }

    return this.getById(id)!;
  },

  delete(id: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM duration_code_snippets WHERE id = ?').run(id);
  },

  deleteByDuration(durationId: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM duration_code_snippets WHERE duration_id = ?').run(durationId);
  },
};

// Settings Operations
export const SettingsOperations = {
  get(key: string): string | null {
    const db = getDatabase();
    const result = db.prepare('SELECT value FROM app_settings WHERE key = ?')
      .get(key) as { value: string } | undefined;
    return result?.value || null;
  },

  set(key: string, value: string): void {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `).run(key, value);
  },

  getAll(): Record<string, string> {
    const db = getDatabase();
    const rows = db.prepare('SELECT key, value FROM app_settings').all() as
      { key: string; value: string }[];
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  },
};
