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
  DurationImageAudio,
  CodeSnippet, CreateCodeSnippet, UpdateCodeSnippet,
  DurationCodeSnippet, CreateDurationCodeSnippet, UpdateDurationCodeSnippet,
  DurationGroupColor,
  DurationColor,
  AudioMarker,
  Tag,
  MediaTagType,
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
      INSERT INTO topics (name, tags, importance_level, color)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(
      topic.name,
      JSON.stringify(topic.tags || []),
      topic.importance_level ?? 5,
      topic.color ?? null
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
    if (updates.color !== undefined) {
      fields.push('color = ?');
      values.push(updates.color);
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
      INSERT INTO recordings (
        topic_id, name, audio_path, audio_duration, video_path, video_duration,
        video_resolution, video_fps, video_size, notes_content, main_notes_content,
        importance_color, recording_type, pdf_path, page_offset,
        book_data_path, reading_progress, character_offset, total_pages, total_words
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      recording.main_notes_content ?? null,
      recording.importance_color ?? null,
      recording.recording_type ?? 'audio',
      recording.pdf_path ?? null,
      recording.page_offset ?? 0,
      recording.book_data_path ?? null,
      recording.reading_progress ?? 0.0,
      recording.character_offset ?? 0,
      recording.total_pages ?? null,
      recording.total_words ?? null
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
    if (updates.pdf_path !== undefined) {
      fields.push('pdf_path = ?');
      values.push(updates.pdf_path);
    }
    if (updates.page_offset !== undefined) {
      fields.push('page_offset = ?');
      values.push(updates.page_offset);
    }
    if (updates.book_data_path !== undefined) {
      fields.push('book_data_path = ?');
      values.push(updates.book_data_path);
    }
    if (updates.reading_progress !== undefined) {
      fields.push('reading_progress = ?');
      values.push(updates.reading_progress);
    }
    if (updates.character_offset !== undefined) {
      fields.push('character_offset = ?');
      values.push(updates.character_offset);
    }
    if (updates.total_pages !== undefined) {
      fields.push('total_pages = ?');
      values.push(updates.total_pages);
    }
    if (updates.total_words !== undefined) {
      fields.push('total_words = ?');
      values.push(updates.total_words);
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

  getMaxSortOrder(recordingId: number): number {
    const db = getDatabase();
    const result = db.prepare(`
      SELECT COALESCE(MAX(sort_order), -1) as max_order
      FROM images WHERE recording_id = ?
    `).get(recordingId) as { max_order: number };
    return result.max_order;
  },

  create(image: CreateImage): Image {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO images (recording_id, file_path, thumbnail_path, caption, color, group_color, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      image.recording_id,
      image.file_path,
      image.thumbnail_path,
      image.caption ?? null,
      image.color ?? null,
      image.group_color ?? null,
      image.sort_order ?? 0
    );

    return this.getById(result.lastInsertRowid as number)!;
  },

  delete(id: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM images WHERE id = ?').run(id);
  },

  updateFilePaths(id: number, filePath: string, thumbnailPath: string | null): Image {
    const db = getDatabase();
    db.prepare('UPDATE images SET file_path = ?, thumbnail_path = ? WHERE id = ?').run(filePath, thumbnailPath, id);
    return this.getById(id)!;
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

  updateGroupColor(id: number, groupColor: DurationGroupColor): Image {
    const db = getDatabase();
    db.prepare('UPDATE images SET group_color = ? WHERE id = ?').run(groupColor, id);
    return this.getById(id)!;
  },

  reorder(recordingId: number, orderedIds: number[]): Image[] {
    const db = getDatabase();
    const stmt = db.prepare('UPDATE images SET sort_order = ? WHERE id = ? AND recording_id = ?');

    const updateMany = db.transaction((ids: number[]) => {
      ids.forEach((id, index) => {
        stmt.run(index, id, recordingId);
      });
    });

    updateMany(orderedIds);
    return this.getByRecording(recordingId);
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

  getMaxSortOrder(recordingId: number): number {
    const db = getDatabase();
    const result = db.prepare(`
      SELECT COALESCE(MAX(sort_order), -1) as max_order
      FROM videos WHERE recording_id = ?
    `).get(recordingId) as { max_order: number };
    return result.max_order;
  },

  create(video: CreateVideo): Video {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO videos (recording_id, file_path, thumbnail_path, caption, color, group_color, duration, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      video.recording_id,
      video.file_path,
      video.thumbnail_path,
      video.caption ?? null,
      video.color ?? null,
      video.group_color ?? null,
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

  updateGroupColor(id: number, groupColor: DurationGroupColor): Video {
    const db = getDatabase();
    db.prepare('UPDATE videos SET group_color = ? WHERE id = ?').run(groupColor, id);
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
      ORDER BY sort_order, start_time
    `).all(recordingId) as Duration[];
  },

  getWithAudio(): Duration[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT d.*, r.name as recording_name, r.recording_type, t.name as topic_name, t.id as topic_id
      FROM durations d
      INNER JOIN duration_audios da ON da.duration_id = d.id
      INNER JOIN recordings r ON r.id = d.recording_id
      INNER JOIN topics t ON t.id = r.topic_id
      GROUP BY d.id
      ORDER BY d.created_at DESC
    `).all() as Duration[];
  },

  getById(id: number): Duration | null {
    const db = getDatabase();
    return db.prepare('SELECT * FROM durations WHERE id = ?').get(id) as Duration | undefined ?? null;
  },

  create(duration: CreateDuration): Duration {
    const db = getDatabase();

    // Get max sort_order for this recording
    const maxOrder = db.prepare(`
      SELECT COALESCE(MAX(sort_order), -1) as max_order
      FROM durations WHERE recording_id = ?
    `).get(duration.recording_id) as { max_order: number };

    const stmt = db.prepare(`
      INSERT INTO durations (recording_id, start_time, end_time, note, group_color, sort_order, page_number)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      duration.recording_id,
      duration.start_time,
      duration.end_time,
      duration.note ?? null,
      duration.group_color ?? null,
      maxOrder.max_order + 1,
      duration.page_number ?? null
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

  reorder(recordingId: number, orderedIds: number[]): Duration[] {
    const db = getDatabase();
    const stmt = db.prepare('UPDATE durations SET sort_order = ? WHERE id = ? AND recording_id = ?');

    const updateMany = db.transaction((ids: number[]) => {
      ids.forEach((id, index) => {
        stmt.run(index, id, recordingId);
      });
    });

    updateMany(orderedIds);
    return this.getByRecording(recordingId);
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

  getMaxSortOrder(durationId: number): number {
    const db = getDatabase();
    const result = db.prepare(`
      SELECT COALESCE(MAX(sort_order), -1) as max_order
      FROM duration_images WHERE duration_id = ?
    `).get(durationId) as { max_order: number };
    return result.max_order;
  },

  create(image: CreateDurationImage): DurationImage {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO duration_images (
        duration_id, file_path, thumbnail_path, caption, color, group_color,
        sort_order, page_number, rect_x, rect_y, rect_w, rect_h
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      image.duration_id,
      image.file_path,
      image.thumbnail_path ?? null,
      image.caption ?? null,
      image.color ?? null,
      image.group_color ?? null,
      image.sort_order ?? 0,
      image.page_number ?? null,
      image.rect_x ?? null,
      image.rect_y ?? null,
      image.rect_w ?? null,
      image.rect_h ?? null
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

  updateFilePaths(id: number, filePath: string, thumbnailPath: string | null): DurationImage {
    const db = getDatabase();
    db.prepare('UPDATE duration_images SET file_path = ?, thumbnail_path = ? WHERE id = ?').run(filePath, thumbnailPath, id);
    return this.getById(id)!;
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

  updateGroupColor(id: number, groupColor: DurationGroupColor): DurationImage {
    const db = getDatabase();
    db.prepare('UPDATE duration_images SET group_color = ? WHERE id = ?').run(groupColor, id);
    return this.getById(id)!;
  },

  reorder(durationId: number, orderedIds: number[]): DurationImage[] {
    const db = getDatabase();
    const stmt = db.prepare('UPDATE duration_images SET sort_order = ? WHERE id = ? AND duration_id = ?');

    const updateMany = db.transaction((ids: number[]) => {
      ids.forEach((id, index) => {
        stmt.run(index, id, durationId);
      });
    });

    updateMany(orderedIds);
    return this.getByDuration(durationId);
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

  getMaxSortOrder(durationId: number): number {
    const db = getDatabase();
    const result = db.prepare(`
      SELECT COALESCE(MAX(sort_order), -1) as max_order
      FROM duration_videos WHERE duration_id = ?
    `).get(durationId) as { max_order: number };
    return result.max_order;
  },

  create(video: CreateDurationVideo): DurationVideo {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO duration_videos (duration_id, file_path, thumbnail_path, caption, color, group_color, duration, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      video.duration_id,
      video.file_path,
      video.thumbnail_path ?? null,
      video.caption ?? null,
      video.color ?? null,
      video.group_color ?? null,
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

  updateGroupColor(id: number, groupColor: DurationGroupColor): DurationVideo {
    const db = getDatabase();
    db.prepare('UPDATE duration_videos SET group_color = ? WHERE id = ?').run(groupColor, id);
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
      INSERT INTO audios (recording_id, file_path, caption, group_color, duration, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      audio.recording_id,
      audio.file_path,
      audio.caption ?? null,
      audio.group_color ?? null,
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

  updateGroupColor(id: number, groupColor: DurationGroupColor): Audio {
    const db = getDatabase();
    db.prepare('UPDATE audios SET group_color = ? WHERE id = ?').run(groupColor, id);
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
      INSERT INTO duration_audios (duration_id, file_path, caption, group_color, duration, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      audio.duration_id,
      audio.file_path,
      audio.caption ?? null,
      audio.group_color ?? null,
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

  updateGroupColor(id: number, groupColor: DurationGroupColor): DurationAudio {
    const db = getDatabase();
    db.prepare('UPDATE duration_audios SET group_color = ? WHERE id = ?').run(groupColor, id);
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

// Duration Image Audios Operations (audio clips attached to individual duration images)
export const DurationImageAudiosOperations = {
  getByDurationImage(durationImageId: number): DurationImageAudio[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM duration_image_audios
      WHERE duration_image_id = ?
      ORDER BY sort_order, created_at
    `).all(durationImageId) as DurationImageAudio[];
  },

  getByDuration(durationId: number): DurationImageAudio[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM duration_image_audios
      WHERE duration_id = ?
      ORDER BY sort_order, created_at
    `).all(durationId) as DurationImageAudio[];
  },

  getById(id: number): DurationImageAudio | null {
    const db = getDatabase();
    return db.prepare('SELECT * FROM duration_image_audios WHERE id = ?').get(id) as DurationImageAudio | undefined ?? null;
  },

  create(data: { duration_image_id: number; duration_id: number; file_path: string; caption?: string | null; duration?: number | null; sort_order?: number }): DurationImageAudio {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO duration_image_audios (duration_image_id, duration_id, file_path, caption, duration, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      data.duration_image_id,
      data.duration_id,
      data.file_path,
      data.caption ?? null,
      data.duration ?? null,
      data.sort_order ?? 0
    );
    return this.getById(result.lastInsertRowid as number)!;
  },

  delete(id: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM duration_image_audios WHERE id = ?').run(id);
  },

  updateCaption(id: number, caption: string | null): DurationImageAudio {
    const db = getDatabase();
    db.prepare('UPDATE duration_image_audios SET caption = ? WHERE id = ?').run(caption, id);
    return this.getById(id)!;
  },

  getMaxSortOrder(durationImageId: number): number {
    const db = getDatabase();
    const result = db.prepare(`
      SELECT COALESCE(MAX(sort_order), -1) as max_order
      FROM duration_image_audios WHERE duration_image_id = ?
    `).get(durationImageId) as { max_order: number };
    return result.max_order;
  },
};

// Image Audio Operations (audio clips attached to recording-level images)
export const ImageAudiosOperations = {
  getByImage(imageId: number) {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM image_audios
      WHERE image_id = ?
      ORDER BY sort_order, created_at
    `).all(imageId);
  },

  getById(id: number) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM image_audios WHERE id = ?').get(id) ?? null;
  },

  create(data: { image_id: number; file_path: string; caption?: string | null; duration?: number | null; sort_order?: number }) {
    const db = getDatabase();
    const result = db.prepare(`
      INSERT INTO image_audios (image_id, file_path, caption, duration, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      data.image_id,
      data.file_path,
      data.caption ?? null,
      data.duration ?? null,
      data.sort_order ?? 0
    );
    return this.getById(result.lastInsertRowid as number)!;
  },

  delete(id: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM image_audios WHERE id = ?').run(id);
  },

  updateCaption(id: number, caption: string | null) {
    const db = getDatabase();
    db.prepare('UPDATE image_audios SET caption = ? WHERE id = ?').run(caption, id);
    return this.getById(id)!;
  },

  getMaxSortOrder(imageId: number): number {
    const db = getDatabase();
    const result = db.prepare(`
      SELECT COALESCE(MAX(sort_order), -1) as max_order
      FROM image_audios WHERE image_id = ?
    `).get(imageId) as { max_order: number };
    return result.max_order;
  },
};

// Capture Image Audio Operations (audio clips attached to quick_capture_images)
export const CaptureImageAudiosOperations = {
  getByImage(captureImageId: number) {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM quick_capture_image_audios
      WHERE capture_image_id = ?
      ORDER BY sort_order, created_at
    `).all(captureImageId);
  },

  getById(id: number) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM quick_capture_image_audios WHERE id = ?').get(id) ?? null;
  },

  create(data: { capture_image_id: number; file_path: string; caption?: string | null; duration?: number | null; sort_order?: number }) {
    const db = getDatabase();
    const result = db.prepare(`
      INSERT INTO quick_capture_image_audios (capture_image_id, file_path, caption, duration, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      data.capture_image_id,
      data.file_path,
      data.caption ?? null,
      data.duration ?? null,
      data.sort_order ?? 0
    );
    return this.getById(result.lastInsertRowid as number)!;
  },

  delete(id: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM quick_capture_image_audios WHERE id = ?').run(id);
  },

  updateCaption(id: number, caption: string | null) {
    const db = getDatabase();
    db.prepare('UPDATE quick_capture_image_audios SET caption = ? WHERE id = ?').run(caption, id);
    return this.getById(id)!;
  },

  getMaxSortOrder(captureImageId: number): number {
    const db = getDatabase();
    const result = db.prepare(`
      SELECT COALESCE(MAX(sort_order), -1) as max_order
      FROM quick_capture_image_audios WHERE capture_image_id = ?
    `).get(captureImageId) as { max_order: number };
    return result.max_order;
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

// Audio Markers Operations
export const AudioMarkersOperations = {
  getByAudio(audioId: number, audioType: 'duration' | 'duration_image' | 'recording' | 'recording_image' | 'quick_capture_audio'): AudioMarker[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM audio_markers
      WHERE audio_id = ? AND audio_type = ?
      ORDER BY start_time ASC
    `).all(audioId, audioType) as AudioMarker[];
  },

  addBatch(markers: Omit<AudioMarker, 'id' | 'created_at'>[]): AudioMarker[] {
    const db = getDatabase();
    const insert = db.prepare(`
      INSERT INTO audio_markers (audio_id, audio_type, marker_type, start_time, end_time, caption)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const ids: number[] = [];
    const txn = db.transaction(() => {
      for (const m of markers) {
        const result = insert.run(m.audio_id, m.audio_type, m.marker_type, m.start_time, m.end_time ?? null, (m as any).caption ?? null);
        ids.push(result.lastInsertRowid as number);
      }
    });
    txn();
    return ids.map(id => db.prepare('SELECT * FROM audio_markers WHERE id = ?').get(id) as AudioMarker);
  },

  deleteByAudio(audioId: number, audioType: 'duration' | 'duration_image' | 'recording' | 'recording_image' | 'quick_capture_audio'): void {
    const db = getDatabase();
    db.prepare('DELETE FROM audio_markers WHERE audio_id = ? AND audio_type = ?').run(audioId, audioType);
  },

  updateCaption(markerId: number, caption: string | null): AudioMarker {
    const db = getDatabase();
    db.prepare('UPDATE audio_markers SET caption = ? WHERE id = ?').run(caption, markerId);
    return db.prepare('SELECT * FROM audio_markers WHERE id = ?').get(markerId) as AudioMarker;
  },
};

// ============ Search ============

export interface GlobalSearchResult {
  content_type: string;
  source_id: number;
  parent_id: number;
  snippet: string;
  rank: number;
  topic_id: number | null;
  topic_name: string | null;
  recording_id: number | null;
  recording_name: string | null;
  file_path: string | null;
  thumbnail_path: string | null;
  marker_type: string | null;
  language: string | null;
  code: string | null;
}

function sanitizeFtsQuery(raw: string): string {
  const cleaned = raw.replace(/['"()*:^!@#$%&]/g, ' ').trim();
  if (!cleaned) return '';
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  return words.map(w => `"${w}"*`).join(' ');
}

export const SearchOperations = {
  search(query: string, limit = 50): GlobalSearchResult[] {
    const ftsQuery = sanitizeFtsQuery(query);
    if (!ftsQuery) return [];

    const db = getDatabase();

    // Step 1: FTS5 search — get matched items with snippets
    const matches = db.prepare(`
      SELECT content_type,
             CAST(source_id AS INTEGER) as source_id,
             CAST(parent_id AS INTEGER) as parent_id,
             snippet(search_index, 3, '<mark>', '</mark>', '...', 48) as snippet,
             rank
      FROM search_index
      WHERE searchable_text MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(ftsQuery, limit) as Array<{
      content_type: string;
      source_id: number;
      parent_id: number;
      snippet: string;
      rank: number;
    }>;

    if (matches.length === 0) return [];

    // Step 2: Collect unique IDs for batch context fetch
    const recordingIds = new Set<number>();
    const topicSourceIds = new Set<number>();

    for (const m of matches) {
      if (m.content_type === 'topic') {
        topicSourceIds.add(m.source_id);
      } else if (m.parent_id > 0) {
        recordingIds.add(m.parent_id);
      }
    }

    // Step 3: Batch fetch recording + topic context
    const recordingContextMap = new Map<number, { recording_id: number; recording_name: string | null; topic_id: number; topic_name: string }>();
    if (recordingIds.size > 0) {
      const ids = Array.from(recordingIds);
      const ph = ids.map(() => '?').join(',');
      const rows = db.prepare(`
        SELECT r.id as recording_id, r.name as recording_name, t.id as topic_id, t.name as topic_name
        FROM recordings r JOIN topics t ON t.id = r.topic_id
        WHERE r.id IN (${ph})
      `).all(...ids) as any[];
      for (const row of rows) recordingContextMap.set(row.recording_id, row);
    }

    const topicContextMap = new Map<number, { topic_id: number; topic_name: string }>();
    if (topicSourceIds.size > 0) {
      const ids = Array.from(topicSourceIds);
      const ph = ids.map(() => '?').join(',');
      const rows = db.prepare(`SELECT id as topic_id, name as topic_name FROM topics WHERE id IN (${ph})`).all(...ids) as any[];
      for (const row of rows) topicContextMap.set(row.topic_id, row);
    }

    // Step 4: Batch fetch type-specific extra fields (file paths, thumbnails, code, marker_type)
    const extraByType = new Map<string, Map<number, any>>();
    const typeToIds = new Map<string, number[]>();
    const typesNeedingExtra = new Set(['image', 'video', 'audio', 'duration_image', 'duration_video', 'duration_audio', 'code_snippet', 'duration_code_snippet', 'audio_marker', 'duration_image_audio', 'image_audio', 'quick_capture_image']);
    for (const m of matches) {
      if (typesNeedingExtra.has(m.content_type)) {
        if (!typeToIds.has(m.content_type)) typeToIds.set(m.content_type, []);
        typeToIds.get(m.content_type)!.push(m.source_id);
      }
    }

    const extraQueries: Record<string, string> = {
      image: 'SELECT id, file_path, thumbnail_path, NULL as duration_id FROM images WHERE id IN',
      video: 'SELECT id, file_path, thumbnail_path, NULL as duration_id FROM videos WHERE id IN',
      audio: 'SELECT id, file_path, NULL as thumbnail_path, NULL as duration_id FROM audios WHERE id IN',
      duration_image: 'SELECT id, file_path, thumbnail_path, duration_id FROM duration_images WHERE id IN',
      duration_video: 'SELECT id, file_path, thumbnail_path, duration_id FROM duration_videos WHERE id IN',
      duration_audio: 'SELECT id, file_path, NULL as thumbnail_path, duration_id FROM duration_audios WHERE id IN',
      code_snippet: 'SELECT id, language, code, NULL as file_path, NULL as thumbnail_path, NULL as duration_id FROM code_snippets WHERE id IN',
      duration_code_snippet: 'SELECT id, language, code, NULL as file_path, NULL as thumbnail_path, duration_id FROM duration_code_snippets WHERE id IN',
      audio_marker: 'SELECT id, marker_type, NULL as file_path, NULL as thumbnail_path, NULL as duration_id FROM audio_markers WHERE id IN',
      duration_image_audio: 'SELECT dia.id, dia.file_path, NULL as thumbnail_path, di.duration_id FROM duration_image_audios dia JOIN duration_images di ON di.id = dia.duration_image_id WHERE dia.id IN',
      image_audio: 'SELECT id, file_path, NULL as thumbnail_path, NULL as duration_id FROM image_audios WHERE id IN',
      quick_capture_image: 'SELECT id, file_path, thumbnail_path, NULL as duration_id FROM quick_capture_images WHERE id IN',
    };

    for (const [type, ids] of typeToIds) {
      const baseQuery = extraQueries[type];
      if (!baseQuery) continue;
      const ph = ids.map(() => '?').join(',');
      const rows = db.prepare(`${baseQuery} (${ph})`).all(...ids) as any[];
      const map = new Map<number, any>();
      for (const row of rows) map.set(row.id, row);
      extraByType.set(type, map);
    }

    // Step 5: Assemble final results
    return matches.map(m => {
      let topic_id: number | null = null;
      let topic_name: string | null = null;
      let recording_id: number | null = null;
      let recording_name: string | null = null;

      if (m.content_type === 'topic') {
        const ctx = topicContextMap.get(m.source_id);
        topic_id = ctx?.topic_id ?? null;
        topic_name = ctx?.topic_name ?? null;
      } else if (m.parent_id > 0) {
        const ctx = recordingContextMap.get(m.parent_id);
        topic_id = ctx?.topic_id ?? null;
        topic_name = ctx?.topic_name ?? null;
        recording_id = m.parent_id;
        recording_name = ctx?.recording_name ?? null;
      }

      const extra = extraByType.get(m.content_type)?.get(m.source_id);

      return {
        content_type: m.content_type,
        source_id: m.source_id,
        parent_id: m.parent_id,
        snippet: m.snippet,
        rank: m.rank,
        topic_id,
        topic_name,
        recording_id,
        recording_name,
        duration_id: extra?.duration_id ?? null,
        file_path: extra?.file_path ?? null,
        thumbnail_path: extra?.thumbnail_path ?? null,
        marker_type: extra?.marker_type ?? null,
        language: extra?.language ?? null,
        code: extra?.code ?? null,
      } as GlobalSearchResult;
    });
  },
};

// ============ Tags Operations ============

export const TagOperations = {
  getAllWithCounts(): Tag[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT t.id, t.name, t.created_at, t.last_searched_at,
             COUNT(mt.id)       AS usage_count,
             MAX(mt.created_at) AS last_assigned_at
      FROM tags t
      LEFT JOIN media_tags mt ON mt.tag_id = t.id
      GROUP BY t.id
      ORDER BY t.name
    `).all() as Tag[];
  },

  search(query: string): Tag[] {
    const db = getDatabase();
    if (!query) {
      return db.prepare(`
        SELECT t.id, t.name, t.created_at,
               COUNT(mt.id) as usage_count,
               MAX(mt.created_at) AS last_assigned_at
        FROM tags t
        LEFT JOIN media_tags mt ON mt.tag_id = t.id
        GROUP BY t.id
        ORDER BY usage_count DESC, last_assigned_at DESC
        LIMIT 50
      `).all() as Tag[];
    }
    return db.prepare(`
      SELECT t.id, t.name, t.created_at,
             COUNT(mt.id) as usage_count,
             MAX(mt.created_at) AS last_assigned_at
      FROM tags t
      LEFT JOIN media_tags mt ON mt.tag_id = t.id
      WHERE t.name LIKE ?
      GROUP BY t.id
      ORDER BY usage_count DESC, t.name
      LIMIT 15
    `).all(`%${query}%`) as Tag[];
  },

  getByMedia(mediaType: MediaTagType, mediaId: number): Tag[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT t.id, t.name, t.created_at, 0 as usage_count
      FROM tags t
      INNER JOIN media_tags mt ON mt.tag_id = t.id
      WHERE mt.media_type = ? AND mt.media_id = ?
      ORDER BY t.name
    `).all(mediaType, mediaId) as Tag[];
  },

  getMediaByTag(mediaType: MediaTagType, tagName: string): { media_id: number }[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT mt.media_id
      FROM media_tags mt
      INNER JOIN tags t ON t.id = mt.tag_id
      WHERE mt.media_type = ? AND t.name = ?
    `).all(mediaType, tagName) as { media_id: number }[];
  },

  setForMedia(mediaType: MediaTagType, mediaId: number, tagNames: string[]): void {
    const db = getDatabase();
    db.transaction(() => {
      // Delete existing associations for this item
      db.prepare(`DELETE FROM media_tags WHERE media_type = ? AND media_id = ?`)
        .run(mediaType, mediaId);

      for (const name of tagNames) {
        const trimmed = name.trim();
        if (!trimmed) continue;
        // Insert tag if not exists
        db.prepare(`INSERT OR IGNORE INTO tags (name) VALUES (?)`).run(trimmed);
        const tag = db.prepare(`SELECT id FROM tags WHERE name = ?`).get(trimmed) as { id: number };
        // Insert association
        db.prepare(`INSERT OR IGNORE INTO media_tags (tag_id, media_type, media_id) VALUES (?, ?, ?)`)
          .run(tag.id, mediaType, mediaId);
      }
    })();
  },

  rename(oldName: string, newName: string): void {
    const db = getDatabase();
    db.prepare(`UPDATE tags SET name = ? WHERE name = ?`).run(newName.trim(), oldName);
  },

  delete(tagId: number): void {
    const db = getDatabase();
    // media_tags cascade deletes automatically
    db.prepare(`DELETE FROM tags WHERE id = ?`).run(tagId);
  },

  recordSearch(tagId: number): void {
    const db = getDatabase();
    db.prepare(`UPDATE tags SET last_searched_at = CURRENT_TIMESTAMP WHERE id = ?`).run(tagId);
  },

  getItemsByTag(tagName: string): {
    images: { id: number; file_path: string; thumbnail_path: string | null; caption: string | null; recording_id: number; recording_name: string | null; topic_id: number; topic_name: string }[];
    duration_images: { id: number; file_path: string; thumbnail_path: string | null; caption: string | null; duration_id: number; recording_id: number; recording_name: string | null; topic_id: number; topic_name: string }[];
    audios: { id: number; file_path: string; caption: string | null; duration: number | null; recording_id: number; recording_name: string | null; topic_id: number; topic_name: string }[];
    duration_audios: { id: number; file_path: string; caption: string | null; duration: number | null; duration_id: number; recording_id: number; recording_name: string | null; topic_id: number; topic_name: string }[];
  } {
    const db = getDatabase();

    const images = db.prepare(`
      SELECT i.id, i.file_path, i.thumbnail_path, i.caption, i.recording_id,
             r.name as recording_name, r.topic_id,
             t.name as topic_name
      FROM images i
      JOIN media_tags mt ON mt.media_type = 'image' AND mt.media_id = i.id
      JOIN tags tag ON tag.id = mt.tag_id AND tag.name = ?
      JOIN recordings r ON r.id = i.recording_id
      JOIN topics t ON t.id = r.topic_id
      ORDER BY t.name, r.name, i.sort_order
    `).all(tagName) as { id: number; file_path: string; thumbnail_path: string | null; caption: string | null; recording_id: number; recording_name: string | null; topic_id: number; topic_name: string }[];

    const duration_images = db.prepare(`
      SELECT di.id, di.file_path, di.thumbnail_path, di.caption, di.duration_id,
             d.recording_id,
             r.name as recording_name, r.topic_id,
             t.name as topic_name
      FROM duration_images di
      JOIN media_tags mt ON mt.media_type = 'duration_image' AND mt.media_id = di.id
      JOIN tags tag ON tag.id = mt.tag_id AND tag.name = ?
      JOIN durations d ON d.id = di.duration_id
      JOIN recordings r ON r.id = d.recording_id
      JOIN topics t ON t.id = r.topic_id
      ORDER BY t.name, r.name, di.sort_order
    `).all(tagName) as { id: number; file_path: string; thumbnail_path: string | null; caption: string | null; duration_id: number; recording_id: number; recording_name: string | null; topic_id: number; topic_name: string }[];

    const audios = db.prepare(`
      SELECT a.id, a.file_path, a.caption, a.duration, a.recording_id,
             r.name as recording_name, r.topic_id,
             t.name as topic_name
      FROM audios a
      JOIN media_tags mt ON mt.media_type = 'audio' AND mt.media_id = a.id
      JOIN tags tag ON tag.id = mt.tag_id AND tag.name = ?
      JOIN recordings r ON r.id = a.recording_id
      JOIN topics t ON t.id = r.topic_id
      ORDER BY t.name, r.name, a.sort_order
    `).all(tagName) as { id: number; file_path: string; caption: string | null; duration: number | null; recording_id: number; recording_name: string | null; topic_id: number; topic_name: string }[];

    const duration_audios = db.prepare(`
      SELECT da.id, da.file_path, da.caption, da.duration, da.duration_id,
             d.recording_id,
             r.name as recording_name, r.topic_id,
             t.name as topic_name
      FROM duration_audios da
      JOIN media_tags mt ON mt.media_type = 'duration_audio' AND mt.media_id = da.id
      JOIN tags tag ON tag.id = mt.tag_id AND tag.name = ?
      JOIN durations d ON d.id = da.duration_id
      JOIN recordings r ON r.id = d.recording_id
      JOIN topics t ON t.id = r.topic_id
      ORDER BY t.name, r.name, da.sort_order
    `).all(tagName) as { id: number; file_path: string; caption: string | null; duration: number | null; duration_id: number; recording_id: number; recording_name: string | null; topic_id: number; topic_name: string }[];

    const capture_images = db.prepare(`
      SELECT qci.id, qci.capture_id, qci.file_path, qci.thumbnail_path, qci.caption
      FROM quick_capture_images qci
      JOIN media_tags mt ON mt.media_type = 'quick_capture_image' AND mt.media_id = qci.id
      JOIN tags tag ON tag.id = mt.tag_id AND tag.name = ?
      ORDER BY qci.sort_order
    `).all(tagName) as { id: number; capture_id: number; file_path: string; thumbnail_path: string | null; caption: string | null }[];

    return { images, duration_images, audios, duration_audios, capture_images };
  },
};

// Quick Capture Operations
export const QuickCaptureOperations = {
  create(note: string, tags: string[]): { id: number } {
    const db = getDatabase();
    const result = db.prepare(
      `INSERT INTO quick_captures (note, tags) VALUES (?, ?)`
    ).run(note || null, JSON.stringify(tags));
    return { id: result.lastInsertRowid as number };
  },

  /** Reuse the most recent capture (within 7 days) so all saves land in one package. */
  getOrCreate(note: string, tags: string[]): { id: number } {
    const db = getDatabase();
    const existing = db.prepare(
      `SELECT id, note, tags FROM quick_captures WHERE created_at >= datetime('now', '-7 days') ORDER BY created_at DESC LIMIT 1`
    ).get() as { id: number; note: string | null; tags: string } | undefined;

    if (existing) {
      // Append note (newline-separated) if provided
      if (note) {
        const newNote = existing.note ? `${existing.note}\n${note}` : note;
        db.prepare('UPDATE quick_captures SET note = ? WHERE id = ?').run(newNote, existing.id);
      }
      // Merge tags (deduplicated)
      if (tags.length > 0) {
        const existingTags = (() => { try { return JSON.parse(existing.tags) as string[]; } catch { return []; } })();
        const merged = [...new Set([...existingTags, ...tags])];
        db.prepare('UPDATE quick_captures SET tags = ? WHERE id = ?').run(JSON.stringify(merged), existing.id);
      }
      return { id: existing.id };
    }

    const result = db.prepare('INSERT INTO quick_captures (note, tags) VALUES (?, ?)').run(note || null, JSON.stringify(tags));
    return { id: result.lastInsertRowid as number };
  },

  getRecent(): import('../../src/types').QuickCapture[] {
    const db = getDatabase();
    const rows = db.prepare(
      `SELECT * FROM quick_captures WHERE created_at >= datetime('now', '-7 days') ORDER BY created_at DESC`
    ).all() as { id: number; note: string | null; tags: string; created_at: string }[];

    return rows.map(row => {
      const images = db.prepare(
        `SELECT * FROM quick_capture_images WHERE capture_id = ? ORDER BY sort_order ASC`
      ).all(row.id) as import('../../src/types').QuickCaptureImage[];

      const audios = db.prepare(
        `SELECT * FROM quick_capture_audios WHERE capture_id = ? ORDER BY sort_order ASC`
      ).all(row.id) as import('../../src/types').QuickCaptureAudio[];

      return {
        id: row.id,
        note: row.note,
        tags: (() => { try { return JSON.parse(row.tags); } catch { return []; } })(),
        created_at: row.created_at,
        images,
        audios,
      };
    });
  },

  addImage(captureId: number, filePath: string, thumbnailPath: string | null): import('../../src/types').QuickCaptureImage {
    const db = getDatabase();
    const sortOrder = (db.prepare(
      `SELECT COUNT(*) as cnt FROM quick_capture_images WHERE capture_id = ?`
    ).get(captureId) as { cnt: number }).cnt;

    const result = db.prepare(
      `INSERT INTO quick_capture_images (capture_id, file_path, thumbnail_path, sort_order) VALUES (?, ?, ?, ?)`
    ).run(captureId, filePath, thumbnailPath, sortOrder);

    return db.prepare(`SELECT * FROM quick_capture_images WHERE id = ?`).get(result.lastInsertRowid) as import('../../src/types').QuickCaptureImage;
  },

  addAudio(captureId: number, filePath: string): import('../../src/types').QuickCaptureAudio {
    const db = getDatabase();
    const sortOrder = (db.prepare(
      `SELECT COUNT(*) as cnt FROM quick_capture_audios WHERE capture_id = ?`
    ).get(captureId) as { cnt: number }).cnt;

    const result = db.prepare(
      `INSERT INTO quick_capture_audios (capture_id, file_path, sort_order) VALUES (?, ?, ?)`
    ).run(captureId, filePath, sortOrder);

    return db.prepare(`SELECT * FROM quick_capture_audios WHERE id = ?`).get(result.lastInsertRowid) as import('../../src/types').QuickCaptureAudio;
  },

  delete(id: number): { imagePaths: string[]; audioPaths: string[] } {
    const db = getDatabase();
    const images = db.prepare(`SELECT file_path FROM quick_capture_images WHERE capture_id = ?`).all(id) as { file_path: string }[];
    const audios = db.prepare(`SELECT file_path FROM quick_capture_audios WHERE capture_id = ?`).all(id) as { file_path: string }[];
    db.prepare(`DELETE FROM quick_captures WHERE id = ?`).run(id);
    return {
      imagePaths: images.map(r => r.file_path),
      audioPaths: audios.map(r => r.file_path),
    };
  },

  updateTags(id: number, tags: string[]): void {
    const db = getDatabase();
    db.prepare(`UPDATE quick_captures SET tags = ? WHERE id = ?`).run(JSON.stringify(tags), id);
  },

  reorderImages(captureId: number, imageIds: number[]): void {
    const db = getDatabase();
    const update = db.prepare('UPDATE quick_capture_images SET sort_order = ? WHERE id = ? AND capture_id = ?');
    const tx = db.transaction(() => {
      imageIds.forEach((id, idx) => update.run(idx, id, captureId));
    });
    tx();
  },

  deleteImage(imageId: number): { filePath: string; thumbnailPath: string | null } {
    const db = getDatabase();
    const row = db.prepare('SELECT file_path, thumbnail_path FROM quick_capture_images WHERE id = ?').get(imageId) as
      { file_path: string; thumbnail_path: string | null } | undefined;
    if (!row) return { filePath: '', thumbnailPath: null };
    db.prepare('DELETE FROM quick_capture_images WHERE id = ?').run(imageId);
    return { filePath: row.file_path, thumbnailPath: row.thumbnail_path };
  },

  updateImageCaption(imageId: number, caption: string | null): import('../../src/types').QuickCaptureImage {
    const db = getDatabase();
    db.prepare('UPDATE quick_capture_images SET caption = ? WHERE id = ?').run(caption, imageId);
    return db.prepare('SELECT * FROM quick_capture_images WHERE id = ?').get(imageId) as import('../../src/types').QuickCaptureImage;
  },

  deleteAudio(audioId: number): { filePath: string } {
    const db = getDatabase();
    const row = db.prepare('SELECT file_path FROM quick_capture_audios WHERE id = ?').get(audioId) as
      { file_path: string } | undefined;
    if (!row) return { filePath: '' };
    db.prepare('DELETE FROM quick_capture_audios WHERE id = ?').run(audioId);
    return { filePath: row.file_path };
  },

  updateAudioCaption(audioId: number, caption: string | null): import('../../src/types').QuickCaptureAudio {
    const db = getDatabase();
    db.prepare('UPDATE quick_capture_audios SET caption = ? WHERE id = ?').run(caption, audioId);
    return db.prepare('SELECT * FROM quick_capture_audios WHERE id = ?').get(audioId) as import('../../src/types').QuickCaptureAudio;
  },

  getExpired(): { id: number; imagePaths: string[]; audioPaths: string[] }[] {
    const db = getDatabase();
    const rows = db.prepare(`SELECT id FROM quick_captures WHERE created_at < datetime('now', '-7 days')`).all() as { id: number }[];
    return rows.map(row => {
      const images = db.prepare(`SELECT file_path FROM quick_capture_images WHERE capture_id = ?`).all(row.id) as { file_path: string }[];
      const audios = db.prepare(`SELECT file_path FROM quick_capture_audios WHERE capture_id = ?`).all(row.id) as { file_path: string }[];
      db.prepare(`DELETE FROM quick_captures WHERE id = ?`).run(row.id);
      return {
        id: row.id,
        imagePaths: images.map(r => r.file_path),
        audioPaths: audios.map(r => r.file_path),
      };
    });
  },
};
